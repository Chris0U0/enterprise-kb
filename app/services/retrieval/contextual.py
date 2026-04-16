"""
Contextual Retrieval（修正版）

Fix #1: 使用 AsyncAnthropic 异步客户端，不阻塞 Event Loop
Fix #4: 引入 Batching 机制 — 将多个 chunks 合并为单次 LLM 调用
        1000 chunks → ~50 次调用（batch_size=20），而非 1000 次

优化策略:
  1. 文档摘要: 1 次 LLM 调用（不变）
  2. Chunk 前缀: 按 batch_size 批量打包，每批 1 次 LLM 调用
     - 一次调用中包含多个 chunk，要求 LLM 以 JSON 数组返回
  3. LRU 缓存: 对相似 section_title 的前缀进行缓存复用
  4. 回退策略: LLM 调用失败时使用基于规则的前缀（零成本）
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections import OrderedDict
from typing import Any

import anthropic

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

DOC_SUMMARY_PROMPT = """请用100字以内概括这份文档的核心内容和结构。
只输出概括文字，不要其他说明。

文档内容：
{doc_content}"""

BATCH_CONTEXT_PROMPT = """<document>
{doc_summary}
</document>

以下是文档中的多个片段。请为每个片段生成一句简短的上下文描述（50字以内），
说明这个片段在文档中的位置和讨论的内容。

{chunks_block}

请以 JSON 数组格式返回，每个元素是一个字符串（对应每个片段的上下文描述）。
只返回 JSON 数组，不要 Markdown 代码块或其他文字。
示例: ["[此段来自第一章，讨论项目背景]", "[此段来自第二章，讨论预算分配]"]"""


class PrefixCache:
    """LRU 缓存 — 对相同 section_title 的前缀进行复用"""

    def __init__(self, max_size: int = 500):
        self._cache: OrderedDict[str, str] = OrderedDict()
        self._max_size = max_size

    def _key(self, doc_name: str, title: str) -> str:
        raw = f"{doc_name}::{title}"
        return hashlib.md5(raw.encode()).hexdigest()

    def get(self, doc_name: str, title: str) -> str | None:
        key = self._key(doc_name, title)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        return None

    def put(self, doc_name: str, title: str, prefix: str):
        key = self._key(doc_name, title)
        self._cache[key] = prefix
        self._cache.move_to_end(key)
        if len(self._cache) > self._max_size:
            self._cache.popitem(last=False)


class ContextualRetrieval:
    """
    Contextual Retrieval 服务（优化版）

    核心改进：
    - AsyncAnthropic 异步客户端
    - Batch 批量处理: N chunks → ceil(N/batch_size) 次 LLM 调用
    - LRU 前缀缓存: 相同标题的 chunk 不重复调用 LLM
    """

    def __init__(self, batch_size: int = 20, max_concurrent: int = 3):
        self.batch_size = batch_size
        self.max_concurrent = max_concurrent
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._cache = PrefixCache(max_size=500)

    async def enrich_sections(
        self,
        sections: list[dict],
        full_doc_content: str,
        doc_name: str = "",
    ) -> list[dict]:
        """为所有 sections 添加上下文前缀（批量化）"""
        if not sections:
            return sections

        # Step 1: 生成文档摘要（1 次 LLM 调用）
        doc_summary = await self._generate_doc_summary(full_doc_content, doc_name)

        # Step 2: 分离缓存命中 vs 需要 LLM 生成的 sections
        uncached_indices: list[int] = []
        prefixes: list[str | None] = [None] * len(sections)

        for i, sec in enumerate(sections):
            title = sec.get("section_title") or sec.get("title", "")
            cached = self._cache.get(doc_name, title)
            if cached:
                prefixes[i] = cached
            else:
                uncached_indices.append(i)

        cache_hits = len(sections) - len(uncached_indices)
        if cache_hits > 0:
            logger.info(f"Contextual prefix cache: {cache_hits} hits, {len(uncached_indices)} misses")

        # Step 3: 对未缓存的 chunks 进行批量 LLM 调用
        if uncached_indices:
            batch_tasks = []
            for batch_start in range(0, len(uncached_indices), self.batch_size):
                batch_idx = uncached_indices[batch_start : batch_start + self.batch_size]
                batch_sections = [sections[i] for i in batch_idx]
                batch_tasks.append(
                    self._generate_batch_prefixes(doc_summary, batch_sections, batch_idx)
                )

            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)

            for result in batch_results:
                if isinstance(result, dict):
                    for idx, prefix in result.items():
                        prefixes[idx] = prefix
                        title = sections[idx].get("section_title") or sections[idx].get("title", "")
                        self._cache.put(doc_name, title, prefix)
                elif isinstance(result, Exception):
                    logger.warning(f"Batch prefix generation failed: {result}")

        # Step 4: 拼接前缀
        enriched = []
        for i, sec in enumerate(sections):
            enriched_sec = sec.copy()
            prefix = prefixes[i]
            if not prefix:
                title = sec.get("section_title") or sec.get("title", "")
                prefix = self._fallback_prefix(doc_summary, title)

            if prefix:
                original_content = enriched_sec.get("content", "")
                enriched_sec["content"] = f"{prefix}\n\n{original_content}"
                enriched_sec["context_prefix"] = prefix

            enriched.append(enriched_sec)

        total = len(sections)
        batches_used = len(uncached_indices) // self.batch_size + (1 if len(uncached_indices) % self.batch_size else 0)
        logger.info(
            f"Contextual Retrieval: {total} sections, "
            f"{cache_hits} cached, {batches_used} LLM batch calls "
            f"(vs {len(uncached_indices)} naive calls)"
        )
        return enriched

    async def _generate_doc_summary(self, doc_content: str, doc_name: str) -> str:
        """生成文档级摘要 — 异步"""
        try:
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            truncated = doc_content[:6000]
            prompt = DOC_SUMMARY_PROMPT.format(doc_content=truncated)

            message = await client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            summary = message.content[0].text.strip()
            return f"文档「{doc_name}」：{summary}"
        except Exception as e:
            logger.warning(f"文档摘要生成失败: {e}")
            return f"文档「{doc_name}」"

    async def _generate_batch_prefixes(
        self,
        doc_summary: str,
        batch_sections: list[dict],
        original_indices: list[int],
    ) -> dict[int, str]:
        """
        批量生成前缀 — 一次 LLM 调用处理多个 chunks

        Returns: {original_index: prefix_string}
        """
        async with self._semaphore:
            try:
                # 构建 chunks 块
                chunks_parts = []
                for i, sec in enumerate(batch_sections):
                    title = sec.get("section_title") or sec.get("title", "")
                    content = sec.get("content", "")[:300]
                    chunks_parts.append(f"片段 {i + 1} (标题: {title}):\n{content}")

                chunks_block = "\n\n---\n\n".join(chunks_parts)
                prompt = BATCH_CONTEXT_PROMPT.format(
                    doc_summary=doc_summary,
                    chunks_block=chunks_block,
                )

                client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
                message = await client.messages.create(
                    model=settings.ANTHROPIC_MODEL,
                    max_tokens=100 * len(batch_sections),
                    messages=[{"role": "user", "content": prompt}],
                )

                raw = message.content[0].text.strip()
                # 容错 JSON 解析
                if raw.startswith("```"):
                    raw = raw.split("```")[1]
                    if raw.startswith("json"):
                        raw = raw[4:]
                    raw = raw.strip()

                prefix_list = json.loads(raw)

                result = {}
                for i, orig_idx in enumerate(original_indices):
                    if i < len(prefix_list):
                        result[orig_idx] = str(prefix_list[i])
                return result

            except json.JSONDecodeError as e:
                logger.warning(f"Batch prefix JSON 解析失败: {e}")
                # 回退到规则前缀
                result = {}
                for i, orig_idx in enumerate(original_indices):
                    title = batch_sections[i].get("section_title") or batch_sections[i].get("title", "")
                    result[orig_idx] = self._fallback_prefix(doc_summary, title)
                return result

            except Exception as e:
                logger.warning(f"Batch prefix LLM 调用失败: {e}")
                result = {}
                for i, orig_idx in enumerate(original_indices):
                    title = batch_sections[i].get("section_title") or batch_sections[i].get("title", "")
                    result[orig_idx] = self._fallback_prefix(doc_summary, title)
                return result

    @staticmethod
    def _fallback_prefix(doc_summary: str, section_title: str) -> str:
        """回退方案：基于规则生成上下文前缀（零成本）"""
        if section_title:
            return f"[此段来自「{section_title}」章节]"
        return ""


_contextual_retrieval: ContextualRetrieval | None = None


def get_contextual_retrieval() -> ContextualRetrieval:
    global _contextual_retrieval
    if _contextual_retrieval is None:
        _contextual_retrieval = ContextualRetrieval(
            batch_size=settings.CONTEXTUAL_BATCH_SIZE,
            max_concurrent=settings.CONTEXTUAL_MAX_CONCURRENT,
        )
    return _contextual_retrieval
