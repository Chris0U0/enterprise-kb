"""
Generation Agent — 写作专家

职责边界：
  - 将分析结果组织为专业文档
  - 强制添加引用 [ref:N]
  - 支持导出为结构化格式
  - 不做检索或分析，只做文档生成
"""
from __future__ import annotations

import logging

from app.services.agents.base import BaseAgent
from app.services.agents.message import AgentMessage, AgentRole, TaskStatus

logger = logging.getLogger(__name__)

GENERATION_SYSTEM = """你是一个专业的文档写作专家。你的职责是将检索和分析的结果组织为高质量的答案或报告。

规则：
1. 每个事实性陈述必须标注引用 [ref:N]，N 是来源编号
2. 使用清晰的结构组织内容
3. 如果信息不足，明确说明而非编造
4. 使用中文回答
5. 语言准确、专业、简洁"""


class GenerationAgent(BaseAgent):
    role = AgentRole.GENERATION
    name = "generation_agent"

    async def execute(self, msg: AgentMessage) -> AgentMessage:
        """
        生成最终答案：
        - 综合所有检索和分析结果
        - 强制引用标注
        - 结构化输出
        """
        query = msg.query
        contexts = msg.context if isinstance(msg.context, list) else []

        # 构建来源列表
        source_list = ""
        unique_sources = {}
        for ctx in contexts:
            if isinstance(ctx, dict):
                doc_name = ctx.get("doc_name", "未知")
                section = ctx.get("section_path", "")
                key = f"{doc_name}/{section}"
                if key not in unique_sources:
                    idx = len(unique_sources) + 1
                    unique_sources[key] = idx
                    snippet = ctx.get("content_snippet", "")
                    source_list += f"\n[来源 {idx}] {doc_name} / {section}\n{snippet}\n"

        # 构建分析结果
        analysis_text = ""
        for ctx in contexts:
            if isinstance(ctx, str):
                analysis_text += ctx + "\n"

        prompt = (
            f"用户问题：{query}\n\n"
            f"检索来源：{source_list}\n\n"
            f"分析结果：{analysis_text}\n\n"
            f"请综合以上信息生成完整答案，使用 [ref:N] 标注引用。"
        )

        text, tokens = await self.call_llm(prompt, system=GENERATION_SYSTEM, max_tokens=2048)

        msg.result = text
        msg.sources = list(unique_sources.keys()) if unique_sources else []
        msg.token_usage = tokens
        msg.confidence = 0.9 if unique_sources else 0.5
        msg.status = TaskStatus.COMPLETED
        return msg
