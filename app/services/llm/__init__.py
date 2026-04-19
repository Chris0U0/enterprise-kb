"""统一 LLM 接入（DashScope OpenAI 兼容 / Anthropic）。"""
from app.services.llm.chat import (
    complete_chat,
    complete_chat_with_usage,
    is_openai_compat_provider,
    llm_configured_for_vision,
    stream_chat_chunks,
    vision_image_to_text,
)

__all__ = [
    "complete_chat",
    "complete_chat_with_usage",
    "stream_chat_chunks",
    "vision_image_to_text",
    "is_openai_compat_provider",
    "llm_configured_for_vision",
]
