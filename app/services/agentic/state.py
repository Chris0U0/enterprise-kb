"""
Agentic RAG 状态定义 — LangGraph Plan-and-Execute 的核心状态图

状态流转:
  用户查询 → Planner(分解子任务) → [Executor(逐步检索+分析)]×N → Synthesizer(合成答案)

安全限制:
  - 最大步骤数: 4步（超出则强制生成当前最优答案）
  - 最大 LLM 调用: 8次
  - 超时限制: 30秒
  - 最低置信度: 0.6（低于则返回"信息不足"）
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, TypedDict

# ── 安全限制常量 ──────────────────────────────────────────
MAX_STEPS = 4
MAX_LLM_CALLS = 8
TIMEOUT_SECONDS = 30
MIN_CONFIDENCE = 0.6


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class PlanStep:
    """单个计划步骤"""
    step_id: int
    thought: str           # 思考过程（展示给用户建立信任）
    action: str            # 要执行的动作: "retrieve" | "analyze" | "compare" | "summarize"
    query: str             # 子查询或指令
    status: StepStatus = StepStatus.PENDING
    result: str = ""       # 执行结果
    sources: list[dict] = field(default_factory=list)  # 检索到的来源
    confidence: float = 0.0


@dataclass
class AgenticTrace:
    """推理轨迹 — 用于前端展示推理链路透明化"""
    step_id: int
    thought: str
    query: str
    found: str             # 找到了什么
    sources_count: int
    confidence: float
    duration_ms: float


class AgenticState(TypedDict):
    """LangGraph 状态定义精品版"""
    # 输入
    original_query: str
    project_id: str
    top_k: int
    chat_history: list[dict] | None  # 新增：多轮对话历史

    # 计划
    plan: list[dict]             # PlanStep 序列化列表
    current_step: int

    # 累积结果
    retrieved_contexts: list[dict]  # 所有检索到的上下文
    analysis_results: list[str]     # 分析中间结果

    # 推理轨迹（前端透明化展示）
    traces: list[dict]              # AgenticTrace 序列化列表

    # 输出
    final_answer: str
    citations: list[dict]
    overall_confidence: float

    # 计量
    llm_call_count: int
    total_duration_ms: float

    # 控制
    should_continue: bool
    error: str
