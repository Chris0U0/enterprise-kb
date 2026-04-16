"""
DocumentAnalysisSkill — 分析单个文档结构和核心内容
按任务类型提取预算数据 / 风险项 / 里程碑
"""
from __future__ import annotations

import logging
import time

import anthropic

from app.core.config import get_settings
from app.services.skills.base import (
    BaseSkill, SkillInput, SkillOutput, register_skill,
)

logger = logging.getLogger(__name__)
settings = get_settings()

ANALYSIS_PROMPT = """你是一个专业的文档分析专家。请分析以下文档内容，提取关键信息。

分析维度：
1. 文档概要：核心主题、目的、范围
2. 关键数据点：预算数字、时间节点、里程碑、KPI 指标
3. 风险项：明确提到的风险和问题
4. 决策要点：需要决策或关注的事项
5. 行动项：待办事项、下一步计划

输出要求：
- 每条信息标注引用来源 [ref:N]
- 用结构化格式组织
- 使用中文回答"""


@register_skill
class DocumentAnalysisSkill(BaseSkill):
    name = "document_analysis"
    description = "分析单个文档结构和核心内容；按任务类型提取预算数据/风险项/里程碑"
    match_keywords = [
        "分析", "文档分析", "解读", "提取",
        "预算", "风险", "里程碑", "关键信息",
        "摘要", "总结", "核心内容", "要点",
        "analyze", "extract", "summary",
    ]

    async def execute(self, input: SkillInput) -> SkillOutput:
        start = time.time()

        # 获取文档内容
        doc_content = await self._fetch_document_content(input)
        if not doc_content:
            return SkillOutput(
                content="未找到指定文档的内容",
                skill_name=self.name,
                confidence=0.0,
            )

        # 调用 LLM 分析
        try:
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

            analysis_type = input.params.get("analysis_type", "comprehensive")
            type_hint = {
                "budget": "请重点提取预算和财务相关数据",
                "risk": "请重点提取风险项和问题",
                "milestone": "请重点提取里程碑和时间节点",
                "comprehensive": "请进行全面分析",
            }.get(analysis_type, "请进行全面分析")

            prompt = (
                f"{ANALYSIS_PROMPT}\n\n"
                f"分析重点：{type_hint}\n\n"
                f"用户问题：{input.query}\n\n"
                f"文档内容：\n{doc_content[:8000]}"
            )

            message = await client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )

            result = message.content[0].text
            duration_ms = (time.time() - start) * 1000

            return SkillOutput(
                content=result,
                data={"analysis_type": analysis_type, "doc_count": len(input.doc_ids)},
                confidence=0.85,
                skill_name=self.name,
                duration_ms=round(duration_ms, 2),
            )

        except Exception as e:
            logger.error(f"DocumentAnalysisSkill 执行失败: {e}")
            return SkillOutput(
                content=f"文档分析失败: {str(e)}",
                skill_name=self.name,
                confidence=0.0,
                duration_ms=(time.time() - start) * 1000,
            )

    async def _fetch_document_content(self, input: SkillInput) -> str:
        """获取文档章节内容"""
        from app.core.database import AsyncSessionLocal
        from app.models.database import DocSection
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            query = select(DocSection).where(
                DocSection.project_id == input.project_id
            ).order_by(DocSection.order_idx)

            if input.doc_ids:
                query = query.where(DocSection.doc_id.in_(input.doc_ids))

            query = query.limit(30)  # 限制 sections 数量
            result = await db.execute(query)
            sections = result.scalars().all()

            parts = []
            for sec in sections:
                title = sec.section_title or ""
                parts.append(f"### {title}\n{sec.content}")

            return "\n\n".join(parts)
