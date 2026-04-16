"""
Planner 节点 — 将复杂查询分解为最多 MAX_STEPS 个子任务
使用 Claude 进行意图分析和任务分解
"""
from __future__ import annotations

import json
import logging
import time

import anthropic

from app.core.config import get_settings
from app.services.agentic.state import AgenticState, MAX_STEPS, PlanStep, StepStatus

logger = logging.getLogger(__name__)
settings = get_settings()

PLAN_SYSTEM_PROMPT = """你是一个查询规划专家。你的任务是将用户的复杂问题分解为有序的检索和分析步骤。

规则：
1. 最多分解为 {max_steps} 个步骤
2. 每个步骤必须是以下类型之一：
   - retrieve: 从知识库检索特定信息
   - analyze: 对已检索的信息进行分析或计算
   - compare: 比较多个文档或数据点
   - summarize: 汇总前面步骤的结果
3. 步骤之间可以有依赖关系，后面步骤可以引用前面步骤的结果
4. 如果问题简单，可以只有 1-2 个步骤
5. 每个步骤都要有清晰的思考过程(thought)和具体的查询(query)

请以 JSON 数组格式返回，每个元素包含：
{{"step_id": 1, "thought": "思考过程", "action": "动作类型", "query": "具体查询"}}

只返回 JSON 数组，不要其他文字。""".format(max_steps=MAX_STEPS)


async def plan_node(state: AgenticState) -> dict:
    """
    Planner 节点：分析用户查询 → 输出执行计划

    输入: original_query
    输出: plan (PlanStep 列表)
    """
    start = time.time()
    query = state["original_query"]

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        message = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=1024,
            system=PLAN_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"请为以下问题制定检索计划：\n\n{query}"}],
        )

        raw_text = message.content[0].text.strip()

        # 解析 JSON（容错处理）
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
        raw_text = raw_text.strip()

        steps_data = json.loads(raw_text)

        # 限制步骤数
        steps_data = steps_data[:MAX_STEPS]

        plan = []
        for s in steps_data:
            plan.append({
                "step_id": s.get("step_id", len(plan) + 1),
                "thought": s.get("thought", ""),
                "action": s.get("action", "retrieve"),
                "query": s.get("query", ""),
                "status": StepStatus.PENDING.value,
                "result": "",
                "sources": [],
                "confidence": 0.0,
            })

        duration_ms = (time.time() - start) * 1000
        logger.info(f"Plan 生成完成: {len(plan)} 步, 耗时 {duration_ms:.0f}ms")

        return {
            "plan": plan,
            "current_step": 0,
            "llm_call_count": state.get("llm_call_count", 0) + 1,
            "should_continue": len(plan) > 0,
        }

    except json.JSONDecodeError as e:
        logger.error(f"Plan JSON 解析失败: {e}")
        # 回退：生成单步检索计划
        fallback_plan = [{
            "step_id": 1,
            "thought": "直接检索回答",
            "action": "retrieve",
            "query": query,
            "status": StepStatus.PENDING.value,
            "result": "",
            "sources": [],
            "confidence": 0.0,
        }]
        return {
            "plan": fallback_plan,
            "current_step": 0,
            "llm_call_count": state.get("llm_call_count", 0) + 1,
            "should_continue": True,
        }

    except Exception as e:
        logger.error(f"Planner 异常: {e}")
        return {
            "plan": [],
            "should_continue": False,
            "error": f"规划失败: {str(e)}",
        }
