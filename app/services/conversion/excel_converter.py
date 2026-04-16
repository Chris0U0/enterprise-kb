"""
Excel / CSV → Markdown 转换器
数据表转 Markdown 表格，每个 Sheet 独立章节
"""
from __future__ import annotations

import io
import logging
from pathlib import PurePosixPath

import pandas as pd

logger = logging.getLogger(__name__)

# 超过此行数的 Sheet 截断并提示
MAX_ROWS_PER_SHEET = 500


async def convert_excel(file_data: bytes, filename: str) -> tuple[str, int | None]:
    """
    Excel (.xlsx/.xls) 或 CSV → Markdown
    每个 Sheet 转为一个章节，表格数据转 Markdown 表格

    Returns: (markdown_text, sheet_count)
    """
    ext = PurePosixPath(filename).suffix.lower()

    if ext == ".csv":
        return _convert_csv(file_data, filename)

    return _convert_excel_file(file_data, filename)


def _convert_excel_file(file_data: bytes, filename: str) -> tuple[str, int | None]:
    """Excel 文件转换"""
    try:
        xlsx = pd.ExcelFile(io.BytesIO(file_data))
    except Exception as e:
        logger.error(f"无法打开 Excel 文件: {e}")
        raise ValueError(f"Excel 文件解析失败: {e}")

    sheet_names = xlsx.sheet_names
    parts = []

    for sheet_idx, sheet_name in enumerate(sheet_names):
        df = pd.read_excel(xlsx, sheet_name=sheet_name)

        parts.append(f"## {sheet_name}")
        parts.append("")

        if df.empty:
            parts.append("*（空表）*")
            parts.append("")
            continue

        # 智能判断：数据表 vs 报告格式
        if _is_data_table(df):
            parts.append(_dataframe_to_markdown_table(df, sheet_name))
        else:
            parts.append(_dataframe_to_key_value(df, sheet_name))

        parts.append("")

        # 基础统计摘要
        numeric_cols = df.select_dtypes(include="number").columns.tolist()
        if numeric_cols:
            parts.append(f"> **数据摘要**: {len(df)} 行 × {len(df.columns)} 列")
            for col in numeric_cols[:5]:  # 最多5列统计
                parts.append(f"> - {col}: 均值={df[col].mean():.2f}, 最大={df[col].max()}, 最小={df[col].min()}")
            parts.append("")

    return "\n".join(parts), len(sheet_names)


def _convert_csv(file_data: bytes, filename: str) -> tuple[str, int | None]:
    """CSV 文件转换"""
    # 尝试多种编码
    for encoding in ["utf-8", "gbk", "gb2312", "latin-1"]:
        try:
            df = pd.read_csv(io.BytesIO(file_data), encoding=encoding)
            break
        except (UnicodeDecodeError, pd.errors.ParserError):
            continue
    else:
        raise ValueError("CSV 文件编码无法识别")

    parts = [f"## {PurePosixPath(filename).stem}", ""]

    if df.empty:
        parts.append("*（空表）*")
    else:
        parts.append(_dataframe_to_markdown_table(df, "data"))

    return "\n".join(parts), 1


def _is_data_table(df: pd.DataFrame) -> bool:
    """
    判断 DataFrame 是否为结构化数据表（vs 报告格式）
    数据表特征：列名有意义、多行数据、数值列较多
    """
    if len(df) < 3:
        return False

    # 如果列名都是默认的 0, 1, 2...，可能不是数据表
    named_cols = sum(1 for c in df.columns if not str(c).isdigit())
    return named_cols / max(len(df.columns), 1) > 0.5


def _dataframe_to_markdown_table(df: pd.DataFrame, sheet_name: str) -> str:
    """将 DataFrame 转为 Markdown 表格"""
    if len(df) > MAX_ROWS_PER_SHEET:
        df = df.head(MAX_ROWS_PER_SHEET)
        truncated = True
    else:
        truncated = False

    # 表头
    headers = [str(c).replace("|", "\\|") for c in df.columns]
    lines = ["| " + " | ".join(headers) + " |"]
    lines.append("| " + " | ".join(["---"] * len(headers)) + " |")

    # 数据行
    for _, row in df.iterrows():
        cells = [str(v).replace("|", "\\|").replace("\n", " ")[:200] for v in row]
        lines.append("| " + " | ".join(cells) + " |")

    if truncated:
        lines.append(f"\n> *（Sheet「{sheet_name}」数据量较大，仅展示前 {MAX_ROWS_PER_SHEET} 行）*")

    return "\n".join(lines)


def _dataframe_to_key_value(df: pd.DataFrame, sheet_name: str) -> str:
    """将非结构化 DataFrame 转为键值对描述"""
    lines = []
    for idx, row in df.iterrows():
        non_null = [(str(col), str(val)) for col, val in row.items() if pd.notna(val) and str(val).strip()]
        if non_null:
            for col, val in non_null:
                lines.append(f"- **{col}**: {val}")
            lines.append("")
    return "\n".join(lines)
