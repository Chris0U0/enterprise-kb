"""
AgentMessage — Agent 间标准化通信协议

所有 Agent 之间的消息使用统一格式传递，包含：
  发送方 / 接收方 / 任务ID / 任务内容 / 约束条件 / 结果 / 置信度 / token 用量

标准化通信协议是 Multi-Agent 系统可维护性的核心。
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class AgentRole(str, Enum):
    ORCHESTRATOR = "orchestrator"
    RETRIEVAL = "retrieval"
    ANALYSIS = "analysis"
    GENERATION = "generation"


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"


@dataclass
class AgentMessage:
    """Agent 间标准消息格式"""
    # 路由
    sender: AgentRole
    receiver: AgentRole
    task_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])

    # 任务内容
    action: str = ""                          # retrieve / analyze / compare / generate
    query: str = ""                           # 子查询或指令
    context: list[dict] = field(default_factory=list)   # 上下文信息

    # 约束条件
    project_id: str = ""
    permissions: dict = field(default_factory=dict)
    token_budget: int = 4000                  # 此次任务的 token 预算
    timeout_seconds: int = 15

    # 结果
    status: TaskStatus = TaskStatus.PENDING
    result: str = ""
    sources: list[dict] = field(default_factory=list)
    confidence: float = 0.0

    # 计量
    token_usage: int = 0
    duration_ms: float = 0.0
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> dict:
        return {
            "sender": self.sender.value,
            "receiver": self.receiver.value,
            "task_id": self.task_id,
            "action": self.action,
            "query": self.query,
            "project_id": self.project_id,
            "status": self.status.value,
            "result": self.result[:500],
            "confidence": self.confidence,
            "token_usage": self.token_usage,
            "duration_ms": self.duration_ms,
            "sources_count": len(self.sources),
        }
