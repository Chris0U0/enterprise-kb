"""
Skills 基类 — 定义 Skill 接口、注册表和 Orchestrator 调度

设计理念：
  将专门能力封装为可复用的 Skill 模块
  Orchestrator Agent 按需组合调用（类比：全科医生 vs 专科医生会诊）

Skill 生命周期：
  1. 继承 BaseSkill
  2. 实现 execute() 方法
  3. 通过 @register_skill 装饰器注册
  4. Orchestrator 根据 match_keywords 自动路由
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class SkillInput:
    """Skill 统一输入"""
    query: str
    project_id: str
    doc_ids: list[str] = field(default_factory=list)  # 可选：指定文档范围
    params: dict[str, Any] = field(default_factory=dict)  # 额外参数


@dataclass
class SkillOutput:
    """Skill 统一输出"""
    content: str                   # 主输出文本
    data: dict[str, Any] = field(default_factory=dict)  # 结构化数据
    citations: list[dict] = field(default_factory=list)  # 引用来源
    confidence: float = 0.0
    skill_name: str = ""
    duration_ms: float = 0.0


class BaseSkill(ABC):
    """Skill 基类"""

    name: str = "base_skill"
    description: str = ""
    match_keywords: list[str] = []  # 用于路由匹配的关键词

    @abstractmethod
    async def execute(self, input: SkillInput) -> SkillOutput:
        """执行 Skill 逻辑"""
        raise NotImplementedError

    def matches(self, query: str) -> float:
        """
        计算查询与此 Skill 的匹配度 (0-1)
        用于 Orchestrator 路由决策
        """
        query_lower = query.lower()
        matched = sum(1 for kw in self.match_keywords if kw in query_lower)
        return min(matched / max(len(self.match_keywords), 1), 1.0)


# ── Skill 注册表 ─────────────────────────────────────────

_skill_registry: dict[str, BaseSkill] = {}


def register_skill(skill_class: type[BaseSkill]) -> type[BaseSkill]:
    """装饰器：注册 Skill 到全局注册表"""
    instance = skill_class()
    _skill_registry[instance.name] = instance
    logger.info(f"Skill 已注册: {instance.name} — {instance.description}")
    return skill_class


def get_skill(name: str) -> BaseSkill | None:
    return _skill_registry.get(name)


def get_all_skills() -> dict[str, BaseSkill]:
    return _skill_registry.copy()


def find_best_skill(query: str) -> BaseSkill | None:
    """根据查询自动匹配最佳 Skill"""
    best_skill = None
    best_score = 0.0

    for skill in _skill_registry.values():
        score = skill.matches(query)
        if score > best_score:
            best_score = score
            best_skill = skill

    if best_score > 0.2:  # 最低匹配阈值
        return best_skill
    return None
