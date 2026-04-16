"""
PDF → Markdown 转换器
- 原生 PDF: pymupdf4llm（保留标题层级 + 表格 + 页码标记）
- 扫描件 PDF: marker 库（比 Tesseract 准确率高 40%）
"""
from __future__ import annotations

import io
import logging
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


async def convert_pdf(file_data: bytes, filename: str) -> tuple[str, int | None]:
    """
    将 PDF 转换为 Markdown。
    自动判断是原生 PDF 还是扫描件。

    Returns:
        (markdown_text, page_count)
    """
    import fitz  # pymupdf

    doc = fitz.open(stream=file_data, filetype="pdf")
    page_count = len(doc)

    # 判断是否为扫描件：检查前5页文字量
    text_chars = 0
    check_pages = min(5, page_count)
    for i in range(check_pages):
        text_chars += len(doc[i].get_text())
    doc.close()

    avg_chars_per_page = text_chars / max(check_pages, 1)

    if avg_chars_per_page < 50:
        # 扫描件 → marker 库
        logger.info(f"检测到扫描件 PDF (avg {avg_chars_per_page:.0f} chars/page), 使用 marker 转换")
        md_text = await _convert_scanned_pdf(file_data)
    else:
        # 原生 PDF → pymupdf4llm
        logger.info(f"原生 PDF (avg {avg_chars_per_page:.0f} chars/page), 使用 pymupdf4llm")
        md_text = _convert_native_pdf(file_data, page_count)

    return md_text, page_count


def _convert_native_pdf(file_data: bytes, page_count: int) -> str:
    """原生 PDF 使用 pymupdf4llm 转换"""
    try:
        import pymupdf4llm

        # pymupdf4llm 需要文件路径，写入临时文件
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(file_data)
            tmp_path = tmp.name

        md_text = pymupdf4llm.to_markdown(
            tmp_path,
            page_chunks=False,
        )

        # 在每页开头插入页码标记
        # pymupdf4llm 会生成 page break 标记，我们替换为自定义格式
        lines = md_text.split("\n")
        result_lines = []
        current_page = 1

        # 在开头添加第一页标记
        result_lines.append(f"<!-- page:{current_page} -->")

        for line in lines:
            # pymupdf4llm 的分页标记通常是 "-----" 或类似
            if line.strip() == "-----" or line.strip().startswith("---") and len(line.strip()) > 3:
                current_page += 1
                result_lines.append(f"\n<!-- page:{current_page} -->")
            else:
                result_lines.append(line)

        return "\n".join(result_lines)

    except ImportError:
        logger.warning("pymupdf4llm 未安装，回退到基础 pymupdf 提取")
        return _convert_pdf_fallback(file_data, page_count)
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except Exception:
            pass


def _convert_pdf_fallback(file_data: bytes, page_count: int) -> str:
    """回退方案：基础 pymupdf 文本提取"""
    import fitz

    doc = fitz.open(stream=file_data, filetype="pdf")
    parts = []

    for i, page in enumerate(doc):
        parts.append(f"<!-- page:{i + 1} -->")
        text = page.get_text("text")
        if text.strip():
            parts.append(text.strip())
        parts.append("")

    doc.close()
    return "\n".join(parts)


async def _convert_scanned_pdf(file_data: bytes) -> str:
    """扫描件 PDF 使用 marker 库进行 OCR 转换"""
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(file_data)
            tmp_path = tmp.name

        # marker 库异步转换
        from marker.converters.pdf import PdfConverter
        from marker.models import create_model_dict

        converter = PdfConverter(artifact_dict=create_model_dict())
        rendered = converter(tmp_path)
        return rendered.markdown

    except ImportError:
        logger.warning("marker 库未安装，回退到 pymupdf 基础提取")
        import fitz
        doc = fitz.open(stream=file_data, filetype="pdf")
        return _convert_pdf_fallback(file_data, len(doc))
    except Exception as e:
        logger.error(f"marker OCR 转换失败: {e}")
        return _convert_pdf_fallback(file_data, 0)
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except Exception:
            pass
