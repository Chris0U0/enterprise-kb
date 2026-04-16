"""
Analysis Agent — 分析专家

职责边界：
  - 对已有信息做推理：数值计算、对比分析、时间线推理
  - 可调用 Skills 获取专业能力
  - 不直接检索，只分析 Retrieval Agent 提供的内容
"""
from __future__ import annotations

import logging

from app.services.agents.base import BaseAgent
from app.services.agents.message import AgentMessage, AgentRole, TaskStatus

logger = logging.getLogger(__name__)

ANALYSIS_SYSTEM = """你是一个专业分析专家。你的职责是对已检索到的文档内容进行深度分析。
规则：
1. 只基于提供的上下文内容进行分析，不编造信息
2. 使用 [ref:N] 标注引用来源
3. 给出具体的数据和结论
4. 使用中文回答"""


class AnalysisAgent(BaseAgent):
    role = AgentRole.ANALYSIS
    name = "analysis_agent"

    async def execute(self, msg: AgentMessage) -> AgentMessage:
        """
        执行分析：
        - analyze: 深度分析
        - compare: 对比分析
        - 可调用已注册的 Skills
        """
        action = msg.action
        query = msg.query
        contexts = msg.context if isinstance(msg.context, list) else []

        # 尝试匹配 Skill
        skill_result = await self._try_skill(query, msg.project_id, contexts)
        if skill_result:
            msg.result = skill_result
            msg.confidence = 0.85
            msg.status = TaskStatus.COMPLETED
            return msg

        # 构建上下文
        context_text = ""
        if contexts:
            snippets = []
            for ctx in contexts[-10:]:
                name = ctx.get("doc_name", "")
                snippet = ctx.get("content_snippet", "")
                snippets.append(f"- [{name}] {snippet}")
            context_text = "已检索到的文档内容：\n" + "\n".join(snippets)

        action_prompts = {
            "analyze": "请深度分析以下信息，给出具体结论。",
            "compare": "请比较以下信息中的不同数据点或观点，列出异同。",
        }

        prompt = (
            f"{action_prompts.get(action, '请分析以下信息：')}\n\n"
            f"{context_text}\n\n"
            f"问题: {query}\n\n请直接给出分析结论："
        )

        text, tokens = await self.call_llm(prompt, system=ANALYSIS_SYSTEM)

        msg.result = text
        msg.token_usage = tokens
        msg.confidence = min(0.5 + len(contexts) * 0.05, 1.0)
        msg.status = TaskStatus.COMPLETED
        return msg

    async def _try_skill(self, query: str, project_id: str, contexts: list) -> str | None:
        """尝试匹配并调用 Skill"""
        try:
            from app.services.skills.base import find_best_skill, SkillInput
            skill = find_best_skill(query)
            if skill is None:
                return None

            logger.info(f"[AnalysisAgent] 匹配到 Skill: {skill.name}")
            output = await skill.execute(SkillInput(
                query=query,
                project_id=project_id,
            ))
            if output.confidence > 0.5:
                return output.content
            return None
        except Exception as e:
            logger.warning(f"Skill 调用失败: {e}")
            return None
