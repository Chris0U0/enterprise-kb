"""
网页 URL → Markdown 转换器
使用 Jina AI Reader API 过滤导航栏/广告等噪声，输出高质量正文
"""
from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

JINA_READER_PREFIX = "https://r.jina.ai/"


async def convert_web(file_data: bytes, filename: str) -> tuple[str, int | None]:
    """
    网页 URL → Markdown
    file_data 在这里存放的是 URL 字符串的 bytes

    Returns: (markdown_text, None)
    """
    url = file_data.decode("utf-8").strip()

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        md_text = await _fetch_with_jina(url)
        return md_text, None
    except Exception as e:
        logger.warning(f"Jina Reader 失败: {e}, 尝试直接抓取")
        try:
            md_text = await _fetch_direct(url)
            return md_text, None
        except Exception as e2:
            logger.error(f"网页抓取失败: {e2}")
            return f"# 网页内容\n\n来源: {url}\n\n*（无法获取网页内容: {e2}）*", None


async def _fetch_with_jina(url: str) -> str:
    """通过 Jina AI Reader 获取网页 Markdown"""
    jina_url = f"{JINA_READER_PREFIX}{url}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            jina_url,
            headers={
                "Accept": "text/markdown",
                "X-Return-Format": "markdown",
            },
        )
        response.raise_for_status()

    md_text = response.text

    # 添加来源信息
    header = f"# 网页内容\n\n> 来源: [{url}]({url})\n\n"
    return header + md_text


async def _fetch_direct(url: str) -> str:
    """直接抓取网页并做基础清理"""
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()

    html = response.text

    # 基础 HTML → 文本（不依赖 BeautifulSoup）
    import re

    # 移除 script 和 style
    html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)
    # 移除 HTML 标签
    text = re.sub(r"<[^>]+>", "\n", html)
    # 清理多余空白
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()

    header = f"# 网页内容\n\n> 来源: [{url}]({url})\n\n"
    return header + text
