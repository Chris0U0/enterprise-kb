"""
Synthesizer 节点 — 汇总所有步骤结果，生成带引用的最终答案
"""
from __future__ import annotations

import logging
import time

import anthropic

from app.core.config import get_settings
from app.services.agentic.state import AgenticState, MIN_CONFIDENCE
from app.services.retrieval.citation import build_citation

logger = logging.getLogger(__name__)
settings = get_settings()

SYNTH_SYSTEM_PROMPT = """你是一个专业的知识库问答助手。请根据多步检索和分析的结果，生成完整、准确的答案。

要求：
1. 综合所有步骤的分析结果
2. 每个事实性陈述必须标注来源引用 [ref:N]
3. 如果某些方面信息不足，明确说明
4. 使用结构化格式组织答案
5. 使用中文回答"""


async def synthesizer_node(state: AgenticState) -> dict:
    """
    Synthesizer 节点：汇总分析 → 生成最终答案 + 引用

    如果整体置信度低于阈值，返回"信息不足"
    """
    start = time.time()

    plan = state.get("plan", [])
    contexts = state.get("retrieved_contexts", [])
    analysis_results = state.get("analysis_results", [])
    traces = state.get("traces", [])

    # 计算整体置信度
    step_confidences = [s.get("confidence", 0) for s in plan if s.get("status") == "completed"]
    overall_confidence = sum(step_confidences) / max(len(step_confidences), 1)

    # 置信度过低 → 返回信息不足
    if overall_confidence < MIN_CONFIDENCE and not analysis_results:
        return {
            "final_answer": (
                "根据多步检索和分析，现有文档中未能找到充分的信息来回答您的问题。\n\n"
                "**已检索到的线索：**\n"
                + "\n".join(f"- {t.get('found', '')[:100]}" for t in traces if t.get("found"))
                + "\n\n建议：尝试调整问题角度，或确认相关文档已上传到知识库。"
            ),
            "citations": [],
            "overall_confidence": overall_confidence,
        }

    try:
        # 构建综合 prompt
        steps_summary = ""
        for i, step in enumerate(plan):
            if step.get("status") == "completed" and step.get("result"):
                steps_summary += (
                    f"\n--- 步骤 {step['step_id']} ({step['action']}) ---\n"
                    f"思路: {step['thought']}\n"
                    f"结果: {step['result']}\n"
                )

        source_list = ""
        unique_sources = {}
        for ctx in contexts:
            doc_name = ctx.get("doc_name", "未知")
            section = ctx.get("section_path", "")
            key = f"{doc_name}/{section}"
            if key not in unique_sources:
                idx = len(unique_sources) + 1
                unique_sources[key] = idx
                snippet = ctx.get("content_snippet", "")
                source_list += f"\n[来源 {idx}] {doc_name} / {section}\n{snippet}\n"

        prompt = (
            f"用户原始问题：{state['original_query']}\n\n"
            f"多步检索分析结果：{steps_summary}\n\n"
            f"检索来源：{source_list}\n\n"
            f"请综合以上所有信息，生成完整答案。使用 [ref:N] 标注引用来源。"
        )

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        message = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=2048,
            system=SYNTH_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        final_answer = message.content[0].text

        # 构建引用列表
        citations = []
        for ctx in contexts:
            citation = build_citation(ctx, score=overall_confidence, method="agentic_rag")
            citations.append(citation.model_dump())

        # 去重
        seen = set()
        unique_citations = []
        for c in citations:
            key = f"{c.get('doc_id')}_{c.get('section_path')}"
            if key not in seen:
                seen.add(key)
                unique_citations.append(c)

        duration_ms = (time.time() - start) * 1000
        logger.info(
            f"Synthesizer 完成: confidence={overall_confidence:.2f}, "
            f"citations={len(unique_citations)}, {duration_ms:.0f}ms"
        )

        return {
            "final_answer": final_answer,
            "citations": unique_citations,
            "overall_confidence": overall_confidence,
            "llm_call_count": state.get("llm_call_count", 0) + 1,
        }

    except Exception as e:
        logger.error(f"Synthesizer 失败: {e}")
        # 回退：直接拼接步骤结果
        fallback = "\n\n".join(
            f"**{s.get('thought', '')}**: {s.get('result', '')}"
            for s in plan if s.get("result")
        )
        return {
            "final_answer": fallback or f"答案生成失败: {str(e)}",
            "citations": [],
            "overall_confidence": overall_confidence,
        }
