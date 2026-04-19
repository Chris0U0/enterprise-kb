"""
GraphRAG 实体关系抽取器
从 Markdown sections 中提取 (entity, relation, entity) 三元组
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from app.core.config import get_settings
from app.services.llm import complete_chat

logger = logging.getLogger(__name__)
settings = get_settings()

EXTRACT_PROMPT = """请从以下文档片段中提取实体和关系。

实体类型: person(人名), module(模块/系统), milestone(里程碑), budget(预算项), risk(风险项), org(组织)
关系类型: responsible_for(负责), depends_on(依赖), affects(影响), part_of(属于), follows(先后), allocated_to(分配给)

返回 JSON 对象，包含 entities 和 relations：
{{"entities": [{{"name": "...", "type": "...", "properties": {{}}}}],
  "relations": [{{"source": "...", "target": "...", "type": "...", "properties": {{}}}}]}}

只返回 JSON，不要其他文字。

文档片段：
{content}"""


@dataclass
class Entity:
    name: str
    type: str
    properties: dict


@dataclass
class Relation:
    source: str
    target: str
    type: str
    properties: dict


async def extract_entities_relations(
    content: str,
    doc_id: str,
    section_path: str = "",
) -> tuple[list[Entity], list[Relation]]:
    """
    从文本中抽取实体和关系。

    Args:
        content: Markdown 文本内容
        doc_id: 文档 ID（附加到实体属性中）
        section_path: 章节路径

    Returns:
        (entities, relations)
    """
    if len(content.strip()) < 50:
        return [], []

    try:
        prompt = EXTRACT_PROMPT.format(content=content[:3000])
        raw = (await complete_chat(prompt, max_tokens=1024)).strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        data = json.loads(raw)

        entities = []
        for e in data.get("entities", []):
            props = e.get("properties", {})
            props["doc_id"] = doc_id
            props["section_path"] = section_path
            entities.append(Entity(
                name=e.get("name", ""),
                type=e.get("type", "unknown"),
                properties=props,
            ))

        relations = []
        for r in data.get("relations", []):
            relations.append(Relation(
                source=r.get("source", ""),
                target=r.get("target", ""),
                type=r.get("type", "related_to"),
                properties=r.get("properties", {}),
            ))

        return entities, relations

    except Exception as e:
        logger.warning(f"实体抽取失败: {e}")
        return [], []


async def batch_extract(
    sections: list[dict],
    doc_id: str,
    max_concurrent: int = 3,
) -> tuple[list[Entity], list[Relation]]:
    """批量抽取多个 sections 的实体关系"""
    import asyncio

    semaphore = asyncio.Semaphore(max_concurrent)
    all_entities = []
    all_relations = []

    async def _extract_one(sec):
        async with semaphore:
            content = sec.get("content", "")
            path = sec.get("section_path", "")
            ents, rels = await extract_entities_relations(content, doc_id, path)
            return ents, rels

    tasks = [_extract_one(sec) for sec in sections]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, tuple):
            all_entities.extend(result[0])
            all_relations.extend(result[1])

    # 去重实体（按 name+type）
    seen = set()
    unique_entities = []
    for e in all_entities:
        key = f"{e.name}::{e.type}"
        if key not in seen:
            seen.add(key)
            unique_entities.append(e)

    logger.info(f"GraphRAG 抽取完成: {len(unique_entities)} 实体, {len(all_relations)} 关系")
    return unique_entities, all_relations
