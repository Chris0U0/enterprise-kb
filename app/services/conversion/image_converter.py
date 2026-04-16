"""
图片 → Markdown 转换器
- 图表/流程图: Claude Vision API（提取数据点/识别结构）
- 纯文字 OCR: PaddleOCR（中文效果最佳）
"""
from __future__ import annotations

import base64
import io
import logging
from pathlib import PurePosixPath

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def convert_image(file_data: bytes, filename: str) -> tuple[str, int | None]:
    """
    图片 → Markdown
    优先使用 Claude Vision API 理解图片内容，
    如果 API 不可用则回退到 PaddleOCR

    Returns: (markdown_text, page_count=1)
    """
    ext = PurePosixPath(filename).suffix.lower().lstrip(".")
    media_type = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
    }.get(ext, "image/png")

    # 优先尝试 Claude Vision
    if settings.ANTHROPIC_API_KEY:
        try:
            md_text = await _convert_with_claude_vision(file_data, media_type, filename)
            return md_text, 1
        except Exception as e:
            logger.warning(f"Claude Vision 转换失败，回退到 OCR: {e}")

    # 回退到 PaddleOCR
    try:
        md_text = _convert_with_ocr(file_data, filename)
        return md_text, 1
    except Exception as e:
        logger.error(f"OCR 转换也失败: {e}")
        return f"# {filename}\n\n*（图片内容无法自动提取，请人工标注）*", 1


async def _convert_with_claude_vision(file_data: bytes, media_type: str, filename: str) -> str:
    """使用 Claude Vision API 分析图片内容"""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    b64_image = base64.b64encode(file_data).decode("utf-8")

    message = await client.messages.create(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=4096,
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
                    {
                        "type": "text",
                        "text": (
                            "请将这张图片的内容转换为结构化的 Markdown 格式。具体要求：\n"
                            "1. 如果是图表（柱状图/折线图/饼图等），提取所有数据点，生成 Markdown 数据表格，并描述趋势\n"
                            "2. 如果是流程图/架构图，识别所有节点和连接关系，用层级列表描述结构\n"
                            "3. 如果是截图/文档图片，提取所有可见文字，保留原始格式\n"
                            "4. 如果是照片/实物图，详细描述图片内容\n"
                            "5. 使用中文输出，保留专业术语的英文原文\n"
                            "直接输出 Markdown 内容，不要添加额外说明。"
                        ),
                    },
                ],
            }
        ],
    )

    md_text = message.content[0].text
    return f"# {filename}\n\n{md_text}"


def _convert_with_ocr(file_data: bytes, filename: str) -> str:
    """使用 PaddleOCR 进行文字识别"""
    try:
        from paddleocr import PaddleOCR

        ocr = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)

        import tempfile
        from pathlib import Path

        with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix, delete=False) as tmp:
            tmp.write(file_data)
            tmp_path = tmp.name

        result = ocr.ocr(tmp_path, cls=True)
        Path(tmp_path).unlink(missing_ok=True)

        if not result or not result[0]:
            return f"# {filename}\n\n*（未检测到文字内容）*"

        lines = []
        for line_info in result[0]:
            text = line_info[1][0]  # 识别的文字
            confidence = line_info[1][1]  # 置信度
            if confidence > 0.5:
                lines.append(text)

        return f"# {filename}\n\n" + "\n".join(lines)

    except ImportError:
        logger.warning("PaddleOCR 未安装，无法进行 OCR")
        return f"# {filename}\n\n*（PaddleOCR 未安装，请安装: pip install paddlepaddle paddleocr）*"
