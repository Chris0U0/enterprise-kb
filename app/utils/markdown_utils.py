"""
Markdown Frontmatter 工具 — 生成和解析统一的 YAML 元数据块
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime

import yaml


def generate_frontmatter(
    doc_id: str | uuid.UUID,
    project_id: str | uuid.UUID,
    stage: str,
    original_filename: str,
    original_format: str,
    upload_by: str | uuid.UUID,
    upload_at: datetime | None = None,
    checksum: str = "",
    conversion_version: str = "1.0",
) -> str:
    """生成标准 Frontmatter YAML 块"""
    meta = {
        "doc_id": str(doc_id),
        "project_id": str(project_id),
        "stage": stage,
        "original_filename": original_filename,
        "original_format": original_format,
        "upload_by": str(upload_by),
        "upload_at": (upload_at or datetime.utcnow()).isoformat(),
        "checksum": checksum,
        "conversion_version": conversion_version,
    }
    yaml_str = yaml.dump(meta, default_flow_style=False, allow_unicode=True, sort_keys=False)
    return f"---\n{yaml_str}---\n\n"


def parse_frontmatter(md_text: str) -> tuple[dict, str]:
    """
    解析 Markdown 中的 Frontmatter，返回 (元数据字典, 正文内容)
    """
    pattern = r"^---\s*\n(.*?)\n---\s*\n"
    match = re.match(pattern, md_text, re.DOTALL)
    if not match:
        return {}, md_text

    yaml_content = match.group(1)
    body = md_text[match.end():]
    try:
        metadata = yaml.safe_load(yaml_content) or {}
    except yaml.YAMLError:
        metadata = {}

    return metadata, body


def extract_sections(md_text: str) -> list[dict]:
    """
    从 Markdown 正文中提取章节结构。
    返回: [{level, title, section_path, content, page_num, order_idx}]
    """
    _, body = parse_frontmatter(md_text)
    lines = body.split("\n")

    sections: list[dict] = []
    current_section: dict | None = None
    content_lines: list[str] = []
    path_stack: list[str] = []  # 层级路径栈
    order_counters: dict[int, int] = {}  # 每层级的序号计数
    current_page: int | None = None

    def flush_section():
        nonlocal current_section, content_lines
        if current_section is not None:
            current_section["content"] = "\n".join(content_lines).strip()
            current_section["char_count"] = len(current_section["content"])
            sections.append(current_section)
            content_lines = []

    for line in lines:
        # 检测页码标记 <!-- page:N -->
        page_match = re.search(r"<!--\s*page:(\d+)\s*-->", line)
        if page_match:
            current_page = int(page_match.group(1))

        # 检测标题行
        heading_match = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading_match:
            flush_section()

            level = len(heading_match.group(1))
            title = heading_match.group(2).strip()

            # 更新路径栈
            while len(path_stack) >= level:
                path_stack.pop()
            path_stack.append(title)

            # 更新排序计数
            order_counters[level] = order_counters.get(level, 0) + 1
            # 重置下级计数
            for lv in list(order_counters.keys()):
                if lv > level:
                    del order_counters[lv]

            section_path = "/".join(path_stack)

            current_section = {
                "level": level,
                "title": title,
                "section_path": section_path,
                "page_num": current_page,
                "order_idx": order_counters[level],
                "content": "",
                "char_count": 0,
            }
        else:
            content_lines.append(line)

    flush_section()

    # ──────── 新增：长章节二次切分逻辑 ────────
    MAX_CHUNK_SIZE = 800  # 单个片段最大字符数
    CHUNK_OVERLAP = 150   # 重叠字符数
    
    split_sections = []
    for sec in sections:
        content = sec["content"]
        if len(content) <= MAX_CHUNK_SIZE:
            split_sections.append(sec)
            continue
        
        # 按段落或长度切分
        import textwrap
        chunks = []
        start = 0
        while start < len(content):
            end = start + MAX_CHUNK_SIZE
            chunk = content[start:end]
            chunks.append(chunk)
            start += (MAX_CHUNK_SIZE - CHUNK_OVERLAP)
            
        for i, chunk in enumerate(chunks):
            new_sec = sec.copy()
            new_sec["content"] = chunk
            new_sec["section_path"] = f"{sec['section_path']} (Part {i+1})"
            new_sec["order_idx"] = sec["order_idx"] * 100 + i # 保证排序
            new_sec["char_count"] = len(chunk)
            split_sections.append(new_sec)
    
    sections = split_sections
    # ────────────────────────────────────────

    # 如果没有任何标题，整个文档作为一个 section
    if not sections and body.strip():
        sections.append({
            "level": 1,
            "title": "全文",
            "section_path": "全文",
            "page_num": 1,
            "order_idx": 1,
            "content": body.strip(),
            "char_count": len(body.strip()),
        })

    return sections


def build_outline(sections: list[dict]) -> list[dict]:
    """
    从 sections 列表构建目录树结构。
    返回嵌套的 [{title, level, section_path, page_num, children: [...]}]
    """
    root: list[dict] = []
    stack: list[dict] = []  # (node, level)

    for sec in sections:
        node = {
            "title": sec["title"],
            "level": sec["level"],
            "section_path": sec["section_path"],
            "page_num": sec.get("page_num"),
            "has_children": False,
            "children": [],
        }

        # 回溯到合适的父级
        while stack and stack[-1]["level"] >= sec["level"]:
            stack.pop()

        if stack:
            stack[-1]["children"].append(node)
            stack[-1]["has_children"] = True
        else:
            root.append(node)

        stack.append(node)

    return root
