"""
统一 LLM 调用层。

- openai_compat：阿里云 DashScope OpenAI 兼容接口（默认），使用 AsyncOpenAI + chat.completions
- anthropic：保留 Claude / AsyncAnthropic 路径，便于对照与回退

环境变量见 app.core.config：LLM_PROVIDER、OPENAI_*、ANTHROPIC_*。
"""
from __future__ import annotations

import logging
from typing import AsyncGenerator

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

try:
    import anthropic
except ImportError:
    anthropic = None  # type: ignore[assignment]

try:
    from openai import AsyncOpenAI
except ImportError:
    AsyncOpenAI = None  # type: ignore[misc, assignment]


def is_openai_compat_provider() -> bool:
    return (settings.LLM_PROVIDER or "").lower().strip() == "openai_compat"


def llm_configured_for_vision() -> bool:
    """是否具备多模态 LLM 凭证（用于图片→Markdown 等）。"""
    if is_openai_compat_provider():
        return bool((settings.OPENAI_API_KEY or "").strip())
    return bool((settings.ANTHROPIC_API_KEY or "").strip())


def _anthropic_client():
    if anthropic is None:
        raise RuntimeError("未安装 anthropic，请: pip install anthropic")
    if not (settings.ANTHROPIC_API_KEY or "").strip():
        raise RuntimeError("未配置 ANTHROPIC_API_KEY")
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


def _openai_client() -> "AsyncOpenAI":
    if AsyncOpenAI is None:
        raise RuntimeError("未安装 openai，请: pip install openai")
    if not (settings.OPENAI_API_KEY or "").strip():
        raise RuntimeError("未配置 OPENAI_API_KEY（阿里云 DashScope API Key）")
    base = (settings.OPENAI_BASE_URL or "").strip() or "https://dashscope.aliyuncs.com/compatible-mode/v1"
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY, base_url=base)


async def complete_chat(
    prompt: str,
    *,
    system: str | None = None,
    max_tokens: int = 2048,
) -> str:
    text, _ = await complete_chat_with_usage(prompt, system=system, max_tokens=max_tokens)
    return text


async def complete_chat_with_usage(
    prompt: str,
    *,
    system: str | None = None,
    history: list[dict[str, str]] | None = None,
    max_tokens: int = 2048,
) -> tuple[str, int]:
    """
    非流式补全，返回 (文本, token 用量合计)。
    """
    if is_openai_compat_provider():
        client = _openai_client()
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": prompt})
        resp = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            max_tokens=max_tokens,
        )
        text = (resp.choices[0].message.content or "").strip()
        usage = getattr(resp, "usage", None)
        total = int(getattr(usage, "total_tokens", None) or 0) if usage else 0
        return text, total

    client = _anthropic_client()
    messages_anthropic = []
    if history:
        messages_anthropic.extend(history)
    messages_anthropic.append({"role": "user", "content": prompt})
    
    kwargs: dict = {
        "model": settings.ANTHROPIC_MODEL,
        "max_tokens": max_tokens,
        "messages": messages_anthropic,
    }
    if system:
        kwargs["system"] = system
    message = await client.messages.create(**kwargs)
    text = message.content[0].text
    u = message.usage
    total = (u.input_tokens + u.output_tokens) if u else 0
    return text, total


async def stream_chat_chunks(
    prompt: str,
    *,
    system: str | None = None,
    history: list[dict[str, str]] | None = None,
    max_tokens: int = 2048,
) -> AsyncGenerator[str, None]:
    """流式输出文本增量（纯文本 token）。"""
    if is_openai_compat_provider():
        client = _openai_client()
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": prompt})
        stream = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
        return

    client = _anthropic_client()
    messages_anthropic = []
    if history:
        messages_anthropic.extend(history)
    messages_anthropic.append({"role": "user", "content": prompt})
    
    kwargs: dict = {
        "model": settings.ANTHROPIC_MODEL,
        "max_tokens": max_tokens,
        "messages": messages_anthropic,
    }
    if system:
        kwargs["system"] = system
    async with client.messages.stream(**kwargs) as stream:
        async for text in stream.text_stream:
            yield text


async def vision_image_to_text(
    *,
    b64_image: str,
    media_type: str,
    user_text: str,
    max_tokens: int = 4096,
) -> str:
    """
    单图 + 文本指令（OpenAI 多模态格式 / Claude vision）。
    DashScope 兼容模式下请使用视觉模型名（如 qwen-vl-plus）。
    """
    if is_openai_compat_provider():
        client = _openai_client()
        model = (settings.OPENAI_VISION_MODEL or "").strip() or settings.OPENAI_MODEL
        url = f"data:{media_type};base64,{b64_image}"
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": url}},
                        {"type": "text", "text": user_text},
                    ],
                }
            ],
            max_tokens=max_tokens,
        )
        return (resp.choices[0].message.content or "").strip()

    client = _anthropic_client()
    message = await client.messages.create(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": b64_image,
                        },
                    },
                    {"type": "text", "text": user_text},
                ],
            }
        ],
    )
    return message.content[0].text
