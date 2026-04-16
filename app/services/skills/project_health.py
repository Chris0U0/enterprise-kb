"""
ProjectHealthSkill — 综合评估项目健康状态
并行拉取计划书+最新周报+风险登记册，输出红绿灯状态
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

HEALTH_PROMPT = """你是一个专业的项目管理顾问。请根据项目文档综合评估项目健康状态。

评估框架：
1. 进度维度 🟢🟡🔴
   - 里程碑达成情况
   - 计划进度 vs 实际进度偏差

2. 预算维度 🟢🟡🔴
   - 预算执行率
   - 成本偏差

3. 风险维度 🟢🟡🔴
   - 已识别风险数量和等级
   - 未关闭的高风险项

4. 质量维度 🟢🟡🔴
   - 质量指标达标情况
   - 问题修复率

评分标准：
- 🟢 绿灯: 正常，无需干预
- 🟡 黄灯: 注意，需要关注
- 🔴 红灯: 预警，需要立即行动

输出要求：
- 给出各维度的红绿灯状态和理由
- 给出整体项目健康评分 (0-100)
- 列出 Top 3 需要关注的事项
- 标注引用来源 [ref:N]
- 使用中文回答"""


@register_skill
class ProjectHealthSkill(BaseSkill):
    name = "project_health"
    description = "综合评估项目健康状态；并行拉取计划书+最新周报+风险登记册，输出红绿灯状态"
    match_keywords = [
        "项目状态", "健康度", "项目评估", "红绿灯",
        "进度", "预算执行", "风险评估", "质量",
        "项目概况", "项目仪表盘", "dashboard",
        "health", "status", "overview",
    ]

    async def execute(self, input: SkillInput) -> SkillOutput:
        start = time.time()

        # 并行拉取不同类型文档
        plan_docs, report_docs, risk_docs = await self._fetch_project_docs(input)

        all_content = ""
        if plan_docs:
            all_content += f"\n{'='*30} 项目计划书 {'='*30}\n{plan_docs}\n"
        if report_docs:
            all_content += f"\n{'='*30} 最新周报/月报 {'='*30}\n{report_docs}\n"
        if risk_docs:
            all_content += f"\n{'='*30} 风险相关文档 {'='*30}\n{risk_docs}\n"

        if not all_content.strip():
            return SkillOutput(
                content="未找到项目文档，无法进行健康评估。请先上传项目计划书、周报等文档。",
                skill_name=self.name,
                confidence=0.0,
            )

        try:
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

            prompt = (
                f"{HEALTH_PROMPT}\n\n"
                f"用户问题：{input.query}\n\n"
                f"项目文档内容：\n{all_content[:10000]}"
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
                data={
                    "has_plan": bool(plan_docs),
                    "has_reports": bool(report_docs),
                    "has_risk_docs": bool(risk_docs),
                },
                confidence=0.85,
                skill_name=self.name,
                duration_ms=round(duration_ms, 2),
            )

        except Exception as e:
            logger.error(f"ProjectHealthSkill 失败: {e}")
            return SkillOutput(
                content=f"项目健康评估失败: {str(e)}",
                skill_name=self.name,
                confidence=0.0,
                duration_ms=(time.time() - start) * 1000,
            )

    async def _fetch_project_docs(self, input: SkillInput) -> tuple[str, str, str]:
        """按文档类型分别获取内容"""
        from app.core.database import AsyncSessionLocal
        from app.models.database import Document, DocSection
        from sqlalchemy import select, or_

        async with AsyncSessionLocal() as db:
            docs = (await db.execute(
                select(Document).where(
                    Document.project_id == input.project_id,
                    Document.conversion_status == "completed",
                ).order_by(Document.upload_at.desc())
            )).scalars().all()

            plan_docs = ""
            report_docs = ""
            risk_docs = ""

            for doc in docs:
                fname = doc.original_filename.lower()
                sections = (await db.execute(
                    select(DocSection)
                    .where(DocSection.doc_id == doc.id)
                    .order_by(DocSection.order_idx)
                    .limit(15)
                )).scalars().all()

                content = "\n".join(
                    f"[{doc.original_filename}/{s.section_title}] {s.content[:500]}"
                    for s in sections
                )

                if any(kw in fname for kw in ["计划", "方案", "规划", "plan"]):
                    plan_docs += content + "\n"
                elif any(kw in fname for kw in ["周报", "月报", "报告", "report", "进度"]):
                    report_docs += content + "\n"
                elif any(kw in fname for kw in ["风险", "问题", "risk", "issue"]):
                    risk_docs += content + "\n"
                else:
                    # 未分类文档加到报告区
                    report_docs += content + "\n"

            return plan_docs[:4000], report_docs[:4000], risk_docs[:3000]
