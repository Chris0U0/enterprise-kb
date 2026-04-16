"""
CrossDocumentCompareSkill — 比较同一项目不同时期文档差异
支持进度偏差、版本对比、历史趋势
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

COMPARE_PROMPT = """你是一个专业的文档对比分析专家。请对比以下多个文档的内容差异。

对比维度：
1. 数据变化：数值指标的增减变化（预算、进度百分比、人员数等）
2. 新增内容：后期文档中出现但早期没有的内容
3. 删除/遗漏：早期提到但后期不再出现的内容
4. 措辞变化：同一事项描述口径的变化（可能暗示风险）
5. 偏差分析：计划 vs 实际的偏差

输出要求：
- 使用表格对比关键差异
- 标注引用来源 [ref:N]
- 给出变化趋势判断
- 使用中文回答"""


@register_skill
class CrossDocumentCompareSkill(BaseSkill):
    name = "cross_document_compare"
    description = "比较同一项目不同时期文档差异；支持进度偏差、版本对比、历史趋势"
    match_keywords = [
        "比较", "对比", "差异", "变化", "偏差",
        "不同", "区别", "版本", "历史",
        "进度", "计划vs实际", "趋势",
        "compare", "diff", "change", "versus",
    ]

    async def execute(self, input: SkillInput) -> SkillOutput:
        start = time.time()

        # 获取多个文档内容
        docs_content = await self._fetch_multiple_docs(input)
        if len(docs_content) < 2:
            return SkillOutput(
                content="需要至少两份文档才能进行对比分析。请指定要对比的文档。",
                skill_name=self.name,
                confidence=0.0,
            )

        try:
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

            docs_text = ""
            for i, (doc_name, content) in enumerate(docs_content, 1):
                docs_text += f"\n{'='*40}\n文档 {i}: {doc_name}\n{'='*40}\n{content[:4000]}\n"

            prompt = (
                f"{COMPARE_PROMPT}\n\n"
                f"用户问题：{input.query}\n\n"
                f"待对比文档：\n{docs_text}"
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
                    "compared_docs": [name for name, _ in docs_content],
                    "doc_count": len(docs_content),
                },
                confidence=0.8,
                skill_name=self.name,
                duration_ms=round(duration_ms, 2),
            )

        except Exception as e:
            logger.error(f"CrossDocumentCompareSkill 失败: {e}")
            return SkillOutput(
                content=f"对比分析失败: {str(e)}",
                skill_name=self.name,
                confidence=0.0,
                duration_ms=(time.time() - start) * 1000,
            )

    async def _fetch_multiple_docs(self, input: SkillInput) -> list[tuple[str, str]]:
        """获取多个文档的内容"""
        from app.core.database import AsyncSessionLocal
        from app.models.database import Document, DocSection
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            # 获取项目文档
            doc_query = select(Document).where(
                Document.project_id == input.project_id,
                Document.conversion_status == "completed",
            ).order_by(Document.upload_at)

            if input.doc_ids:
                doc_query = doc_query.where(Document.id.in_(input.doc_ids))
            else:
                doc_query = doc_query.limit(5)  # 默认最多5个文档

            docs = (await db.execute(doc_query)).scalars().all()

            results = []
            for doc in docs:
                sections = (await db.execute(
                    select(DocSection)
                    .where(DocSection.doc_id == doc.id)
                    .order_by(DocSection.order_idx)
                    .limit(20)
                )).scalars().all()

                content = "\n\n".join(
                    f"### {s.section_title or ''}\n{s.content}"
                    for s in sections
                )
                results.append((doc.original_filename, content))

            return results
