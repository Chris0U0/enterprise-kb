"""
BaseAgent — Agent 抽象基类

每个 Agent 职责边界明确：
  - 只接收 Orchestrator 发来的 AgentMessage
  - 只返回 AgentMessage（带结果）
  - 内置 token 计量和超时控制
  - 不能直接访问其他 Agent 的内部状态
"""
from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod

import anthropic

from app.core.config import get_settings
from app.services.agents.message import AgentMessage, AgentRole, TaskStatus

logger = logging.getLogger(__name__)
settings = get_settings()


class BaseAgent(ABC):
    """Agent 基类"""

    role: AgentRole = AgentRole.ORCHESTRATOR
    name: str = "base_agent"

    def __init__(self):
        self._llm_client = None

    @property
    def llm(self) -> anthropic.AsyncAnthropic:
        if self._llm_client is None:
            self._llm_client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        return self._llm_client

    async def handle(self, msg: AgentMessage) -> AgentMessage:
        """
        处理收到的消息，带超时和异常保护。
        子类应实现 execute() 而非覆盖 handle()。
        """
        msg.status = TaskStatus.RUNNING
        start = time.time()

        try:
            result_msg = await asyncio.wait_for(
                self.execute(msg),
                timeout=msg.timeout_seconds,
            )
            result_msg.duration_ms = (time.time() - start) * 1000
            if result_msg.status == TaskStatus.RUNNING:
                result_msg.status = TaskStatus.COMPLETED
            return result_msg

        except asyncio.TimeoutError:
            msg.status = TaskStatus.TIMEOUT
            msg.result = f"{self.name} 执行超时 ({msg.timeout_seconds}s)"
            msg.duration_ms = (time.time() - start) * 1000
            logger.warning(f"[{self.name}] 超时: task_id={msg.task_id}")
            return msg

        except Exception as e:
            msg.status = TaskStatus.FAILED
            msg.result = f"{self.name} 执行失败: {str(e)}"
            msg.duration_ms = (time.time() - start) * 1000
            logger.error(f"[{self.name}] 异常: {e}")
            return msg

    @abstractmethod
    async def execute(self, msg: AgentMessage) -> AgentMessage:
        """子类实现具体逻辑"""
        raise NotImplementedError

    async def call_llm(self, prompt: str, system: str | None = None, max_tokens: int = 1024) -> tuple[str, int]:
        """
        封装 LLM 调用，返回 (text, token_usage)。
        统一计量 token 消耗。
        """
        kwargs = {
            "model": settings.ANTHROPIC_MODEL,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system

        message = await self.llm.messages.create(**kwargs)
        text = message.content[0].text
        usage = message.usage.input_tokens + message.usage.output_tokens
        return text, usage
