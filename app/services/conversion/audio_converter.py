"""
音视频 → Markdown 转换器
使用 Whisper large-v3 进行带时间戳的转录
"""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path, PurePosixPath

logger = logging.getLogger(__name__)


async def convert_audio(file_data: bytes, filename: str) -> tuple[str, int | None]:
    """
    音视频 → Markdown（带时间戳转录）

    Returns: (markdown_text, None)
    """
    ext = PurePosixPath(filename).suffix.lower()

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(file_data)
        tmp_path = tmp.name

    try:
        md_text = _transcribe_with_whisper(tmp_path, filename)
        return md_text, None
    except ImportError:
        logger.warning("whisper 未安装")
        return f"# {filename}\n\n*（Whisper 未安装，请安装: pip install openai-whisper）*", None
    except Exception as e:
        logger.error(f"音视频转录失败: {e}")
        return f"# {filename}\n\n*（转录失败: {e}）*", None
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _transcribe_with_whisper(file_path: str, filename: str) -> str:
    """使用 Whisper 转录音视频"""
    import whisper

    model = whisper.load_model("large-v3")
    result = model.transcribe(
        file_path,
        language=None,  # 自动检测语言
        verbose=False,
        word_timestamps=False,
    )

    segments = result.get("segments", [])
    detected_lang = result.get("language", "unknown")

    lines = [
        f"# {filename}",
        "",
        f"> 语言: {detected_lang} | 时长: {_format_duration(segments[-1]['end'] if segments else 0)}",
        "",
    ]

    # 按段落输出，带时间戳标记
    for seg in segments:
        start = seg["start"]
        end = seg["end"]
        text = seg["text"].strip()

        # 生成时间戳标记（用于引用跳转）
        timestamp_tag = f"<!-- timestamp:{start:.2f} -->"
        time_label = f"[{_format_timestamp(start)} → {_format_timestamp(end)}]"

        lines.append(timestamp_tag)
        lines.append(f"**{time_label}** {text}")
        lines.append("")

    return "\n".join(lines)


def _format_timestamp(seconds: float) -> str:
    """格式化时间戳 → HH:MM:SS 或 MM:SS"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _format_duration(seconds: float) -> str:
    """格式化总时长"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h}小时{m}分{s}秒"
    if m > 0:
        return f"{m}分{s}秒"
    return f"{s}秒"
