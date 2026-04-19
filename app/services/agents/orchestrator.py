"""
Orchestrator Agent — 任务分发中心

职责边界：
  - 理解用户意图，分解为子任务
  - 根据子任务类型调度对应的子 Agent
  - 管理全局 token 预算
  - 聚合子 Agent 结果
  - 不直接检索或分析，只做编排
"""
from __future__ import annotations

import json
import logging

from app.core.config import get_settings
from app.services.agents.base import BaseAgent
from app.services.agents.message import AgentMessage, AgentRole, TaskStatus

logger = logging.getLogger(__name__)
settings = get_settings()

PLAN_SYSTEM = """你是一个任务编排专家。将用户问题分解为子任务序列。

每个子任务必须指定 agent 和 action：
  - agent: "retrieval" | "analysis" | "generation"
  - action: "retrieve" | "analyze" | "compare" | "generate"
  - query: 具体的子查询

规则：
1. 最多 4 个子任务
2. 先检索后分析，最后生成
3. 无依赖的检索任务可标记 parallel: true
4. 简单问题可以只有 1-2 步

返回 JSON 数组，每个元素：
{"agent": "retrieval", "action": "retrieve", "query": "...", "parallel": false}
只返回 JSON 数组。"""


class OrchestratorAgent(BaseAgent):
    role = AgentRole.ORCHESTRATOR
    name = "orchestrator_agent"

    async def execute(self, msg: AgentMessage) -> AgentMessage:
        """
        编排流程：
        1. 分解任务为子任务列表
        2. 返回 plan（由 graph 负责实际分发）
        """
        query = msg.query
        project_id = msg.project_id

        try:
            text, tokens = await self.call_llm(
                f"请为以下问题制定执行计划：\n\n{query}",
                system=PLAN_SYSTEM,
            )
            msg.token_usage = tokens

            # 解析 JSON
            raw = text.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            plan = json.loads(raw)[:4]  # 最多4步

            # 构建子任务消息列表
            sub_tasks = []
            for i, step in enumerate(plan):
                agent = step.get("agent", "retrieval")
                receiver = {
                    "retrieval": AgentRole.RETRIEVAL,
                    "analysis": AgentRole.ANALYSIS,
                    "generation": AgentRole.GENERATION,
                }.get(agent, AgentRole.RETRIEVAL)

                sub_msg = AgentMessage(
                    sender=AgentRole.ORCHESTRATOR,
                    receiver=receiver,
                    action=step.get("action", "retrieve"),
                    query=step.get("query", query),
                    project_id=project_id,
                    token_budget=msg.token_budget // max(len(plan), 1),
                    timeout_seconds=msg.timeout_seconds,
                )
                sub_tasks.append({
                    "step": i + 1,
                    "agent": agent,
                    "action": step.get("action", "retrieve"),
                    "query": step.get("query", query),
                    "parallel": step.get("parallel", False),
                    "message": sub_msg.to_dict(),
                })

            msg.result = json.dumps(sub_tasks, ensure_ascii=False)
            msg.confidence = 0.9
            msg.status = TaskStatus.COMPLETED

        except json.JSONDecodeError:
            # 回退：单步检索
            fallback = [{
                "step": 1, "agent": "retrieval", "action": "retrieve",
                "query": query, "parallel": False,
                "message": AgentMessage(
                    sender=AgentRole.ORCHESTRATOR,
                    receiver=AgentRole.RETRIEVAL,
                    action="retrieve", query=query, project_id=project_id,
                ).to_dict(),
            }]
            msg.result = json.dumps(fallback, ensure_ascii=False)
            msg.confidence = 0.7
            msg.status = TaskStatus.COMPLETED

        except Exception as e:
            msg.status = TaskStatus.FAILED
            msg.result = f"编排失败: {str(e)}"

        return msg
