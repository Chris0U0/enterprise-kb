"""
引用溯源服务 — 生成内联引用标记 + 构建完整引用链路
每条答案精确标注: [文档名 · 章节路径 · 页码] → Markdown → 源文件
"""
from __future__ import annotations

import logging
import re
import uuid

from app.core.config import get_settings
from app.models.schemas import CitationSource, RetrievalMethod

logger = logging.getLogger(__name__)
settings = get_settings()


def build_citation(payload: dict, score: float, method: str = "vector") -> CitationSource:
    """
    从 Qdrant payload 构建完整的 CitationSource 引用元数据

    payload 包含索引时写入的所有元数据字段
    """
    retrieval_method_map = {
        "vector": RetrievalMethod.VECTOR,
        "hybrid_rrf": RetrievalMethod.VECTOR,
        "fulltext": RetrievalMethod.FULLTEXT,
        "mcp_tool": RetrievalMethod.MCP_TOOL,
    }

    return CitationSource(
        doc_id=uuid.UUID(payload.get("doc_id", str(uuid.uuid4()))),
        doc_name=payload.get("doc_name", "未知文档"),
        doc_type=_infer_doc_type(payload.get("doc_name", "")),
        md_path=payload.get("md_path", ""),
        section_path=payload.get("section_path", ""),
        section_title=payload.get("section_title"),
        source_path=payload.get("source_path", ""),
        source_format=payload.get("source_format", ""),
        page_num=payload.get("page_num"),
        sheet_name=payload.get("sheet_name"),
        timestamp_sec=payload.get("timestamp_sec"),
        content_snippet=payload.get("content_snippet", "")[:300],
        checksum=payload.get("checksum"),
        upload_by=uuid.UUID(payload["upload_by"]) if payload.get("upload_by") else None,
        upload_at=None,
        relevance_score=score,
        retrieval_method=retrieval_method_map.get(method, RetrievalMethod.VECTOR),
    )


def format_inline_citation(citation: CitationSource, index: int) -> str:
    """
    生成内联引用标记，格式:
    [文档名 · 章节路径 · 页码] [index]

    示例:
    [XX项目计划书 · 第四章/4.3节 · 第12页] [1]
    """
    parts = [citation.doc_name]

    if citation.section_path:
        parts.append(citation.section_path)

    if citation.page_num is not None:
        parts.append(f"第{citation.page_num}页")
    elif citation.sheet_name:
        parts.append(f"Sheet:{citation.sheet_name}")
    elif citation.timestamp_sec is not None:
        ts = citation.timestamp_sec
        minutes = int(ts // 60)
        seconds = int(ts % 60)
        parts.append(f"{minutes:02d}:{seconds:02d}")

    citation_text = " · ".join(parts)
    return f"[{citation_text}] [{index}]"


def generate_cited_answer(
    query: str,
    answer_text: str,
    citations: list[CitationSource],
) -> str:
    """
    为 LLM 生成的答案添加引用标注。

    LLM 在生成答案时被要求用 [ref:N] 标注引用来源，
    此函数将 [ref:N] 替换为完整的内联引用标记。
    """
    for i, citation in enumerate(citations):
        ref_tag = f"[ref:{i + 1}]"
        inline_cite = format_inline_citation(citation, i + 1)
        answer_text = answer_text.replace(ref_tag, inline_cite)

    return answer_text


def build_llm_context(
    query: str,
    results: list[dict],
) -> str:
    """
    构建发送给 LLM 的检索上下文。
    每条检索结果标注编号，要求 LLM 使用 [ref:N] 格式引用。

    Args:
        query: 用户查询
        results: [{content_snippet, payload, score}]

    Returns:
        构建好的 LLM prompt context
    """
    context_parts = []

    for i, result in enumerate(results, 1):
        payload = result.get("payload", {})
        doc_name = payload.get("doc_name", "未知文档")
        section = payload.get("section_path", "")
        page = payload.get("page_num", "")
        content = result.get("content_snippet", "")

        source_info = f"[来源 {i}] {doc_name}"
        if section:
            source_info += f" / {section}"
        if page:
            source_info += f" / 第{page}页"

        context_parts.append(f"{source_info}\n{content}")

    context = "\n\n---\n\n".join(context_parts)

    prompt = (
        f"根据以下检索到的文档内容回答用户问题。\n\n"
        f"要求：\n"
        f"1. 每个事实性陈述都必须标注引用来源，格式为 [ref:N]，N 是来源编号\n"
        f"2. 如果信息来自多个来源，标注所有相关来源\n"
        f"3. 如果检索内容无法回答问题，明确说明「根据现有文档未找到相关信息」\n"
        f"4. 不要编造未在检索内容中出现的信息\n"
        f"5. 使用中文回答\n\n"
        f"检索内容：\n\n{context}\n\n"
        f"用户问题：{query}\n\n"
        f"请回答："
    )

    return prompt


def _infer_doc_type(filename: str) -> str | None:
    """从文件名推断文档类型"""
    filename_lower = filename.lower()
    type_keywords = {
        "计划书": "计划书",
        "周报": "周报",
        "月报": "月报",
        "会议纪要": "会议纪要",
        "会议记录": "会议纪要",
        "需求": "需求文档",
        "设计": "设计文档",
        "测试": "测试文档",
        "报告": "报告",
        "合同": "合同",
        "规范": "规范文档",
    }
    for keyword, doc_type in type_keywords.items():
        if keyword in filename_lower:
            return doc_type
    return None
