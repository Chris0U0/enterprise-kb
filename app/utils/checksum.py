"""
文件完整性校验 — MD5 checksum
"""
from __future__ import annotations

import hashlib


def compute_md5(data: bytes) -> str:
    """计算文件 MD5 哈希值"""
    return hashlib.md5(data).hexdigest()


def verify_checksum(data: bytes, expected_md5: str) -> bool:
    """验证文件 MD5 是否匹配"""
    return compute_md5(data) == expected_md5
