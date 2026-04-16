"""
ReportGenerationSkill — 基于知识库内容生成标准化报告
支持阶段总结 / 风险分析 / 项目复盘三种模板
"""
from __future__ import annotations

import logging
import time
from enum import Enum

import anthropic

from app.core.config import get_settings
from app.services.skills.base import (
    BaseSkill, SkillInput, SkillOutput, register_skill,
)

logger = logging.getLogger(__name__)
settings = get_settings()


class ReportTemplate(str, Enum):
    STAGE_SUMMARY = "stage_summary"       # 阶段总结
    RISK_ANALYSIS = "risk_analysis"       # 风险分析
    PROJECT_REVIEW = "project_review"     # 项目复盘


TEMPLATE_PROMPTS = {
    ReportTemplate.STAGE_SUMMARY: """请基于项目文档生成【阶段总结报告】，包含：

# 项目阶段总结报告

## 一、阶段概述
- 时间范围、阶段目标

## 二、主要成果
- 已完成的里程碑
- 关键交付物

## 三、进度与预算
- 计划进度 vs 实际进度
- 预算执行情况

## 四、问题与风险
- 本阶段遇到的主要问题
- 当前风险状态

## 五、下一阶段计划
- 下阶段目标
- 关键任务

每条事实标注引用 [ref:N]。""",

    ReportTemplate.RISK_ANALYSIS: """请基于项目文档生成【风险分析报告】，包含：

# 项目风险分析报告

## 一、风险全景
- 已识别风险总数
- 按等级分布（高/中/低）

## 二、高风险项详述
- 逐条描述：风险描述、影响范围、发生概率、应对措施

## 三、风险趋势
- 与上期对比的变化

## 四、建议措施
- 优先级排序的风险应对建议

每条事实标注引用 [ref:N]。""",

    ReportTemplate.PROJECT_REVIEW: """请基于项目文档生成【项目复盘报告】，包含：

# 项目复盘报告

## 一、项目背景
- 项目目标、范围

## 二、执行过程回顾
- 关键时间线
- 重要决策点

## 三、成果评估
- 目标达成度
- 质量评价

## 四、经验教训
- 做得好的（继续保持）
- 做得不好的（需要改进）
- 未预料到的（新发现）

## 五、改进建议
- 可复用的最佳实践
- 针对性改进方案

每条事实标注引用 [ref:N]。""",
}


@register_skill
class ReportGenerationSkill(BaseSkill):
    name = "report_generation"
    description = "基于知识库内容生成标准化报告；支持阶段总结/风险分析/项目复盘三种模板"
    match_keywords = [
        "生成报告", "报告", "总结报告", "阶段总结",
        "风险报告", "复盘", "报告模板",
        "generate report", "report", "review",
        "输出", "导出", "整理",
    ]

    async def execute(self, input: SkillInput) -> SkillOutput:
        start = time.time()

        # 确定报告模板
        template = self._detect_template(input.query, input.params)

        # 获取项目文档
        content = await self._fetch_all_content(input)
        if not content:
            return SkillOutput(
                content="项目知识库为空，无法生成报告。请先上传项目文档。",
                skill_name=self.name,
                confidence=0.0,
            )

        try:
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

            template_prompt = TEMPLATE_PROMPTS.get(
                template, TEMPLATE_PROMPTS[ReportTemplate.STAGE_SUMMARY]
            )

            prompt = (
                f"{template_prompt}\n\n"
                f"用户需求：{input.query}\n\n"
                f"项目文档内容：\n{content[:12000]}"
            )

            message = await client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )

            result = message.content[0].text
            duration_ms = (time.time() - start) * 1000

            return SkillOutput(
                content=result,
                data={
                    "template": template.value,
                    "template_name": {
                        ReportTemplate.STAGE_SUMMARY: "阶段总结",
                        ReportTemplate.RISK_ANALYSIS: "风险分析",
                        ReportTemplate.PROJECT_REVIEW: "项目复盘",
                    }.get(template, "阶段总结"),
                },
                confidence=0.9,
                skill_name=self.name,
                duration_ms=round(duration_ms, 2),
            )

        except Exception as e:
            logger.error(f"ReportGenerationSkill 失败: {e}")
            return SkillOutput(
                content=f"报告生成失败: {str(e)}",
                skill_name=self.name,
                confidence=0.0,
                duration_ms=(time.time() - start) * 1000,
            )

    def _detect_template(self, query: str, params: dict) -> ReportTemplate:
        """从查询和参数中检测报告模板类型"""
        # 优先用显式参数
        explicit = params.get("template")
        if explicit:
            try:
                return ReportTemplate(explicit)
            except ValueError:
                pass

        query_lower = query.lower()
        if any(kw in query_lower for kw in ["风险", "risk"]):
            return ReportTemplate.RISK_ANALYSIS
        if any(kw in query_lower for kw in ["复盘", "review", "回顾"]):
            return ReportTemplate.PROJECT_REVIEW
        return ReportTemplate.STAGE_SUMMARY

    async def _fetch_all_content(self, input: SkillInput) -> str:
        """获取项目全部文档内容"""
        from app.core.database import AsyncSessionLocal
        from app.models.database import Document, DocSection
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            docs = (await db.execute(
                select(Document).where(
                    Document.project_id == input.project_id,
                    Document.conversion_status == "completed",
                ).order_by(Document.upload_at)
            )).scalars().all()

            parts = []
            for doc in docs:
                sections = (await db.execute(
                    select(DocSection)
                    .where(DocSection.doc_id == doc.id)
                    .order_by(DocSection.order_idx)
                    .limit(20)
                )).scalars().all()

                doc_text = f"\n## 文档: {doc.original_filename}\n"
                for s in sections:
                    doc_text += f"\n### {s.section_title or ''}\n{s.content}\n"
                parts.append(doc_text)

            return "\n".join(parts)
