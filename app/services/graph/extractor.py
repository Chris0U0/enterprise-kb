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

INFER_SCHEMA_PROMPT = """你是一个知识图谱专家。请阅读以下文档片段，并为该文档所属的领域总结出一套最适合的实体类型和关系类型。

实体类型建议：5-8个（如：技术栈、组织架构、业务流程、风险项等）
关系类型建议：5-8个（如：依赖于、包含、负责、导致等）

返回 JSON 格式：
{{"entities": ["类型1", "类型2", ...], "relations": ["关系1", "关系2", ...]}}

只返回 JSON，不要其他文字。

文档片段：
{content}"""

EXTRACT_PROMPT = """请从以下文档片段中提取实体和关系。

你需要严格遵守以下本体定义：
实体类型: {entity_types}
关系类型: {relation_types}

要求：
1. 提取所有关键实体及其属性。
2. 提取这些实体之间的明确关系。
3. 返回 JSON 对象，包含 entities 和 relations 列表：
   {{"entities": [{{"name": "...", "type": "...", "properties": {{}}}}],
     "relations": [{{"source": "...", "target": "...", "type": "...", "properties": {{}}}}]}}
4. 只返回 JSON，不要其他文字。

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


async def infer_schema(content: str) -> dict:
    """基于内容推理本体 Schema"""
    try:
        # 截取中间或开头的一部分内容进行推理
        prompt = INFER_SCHEMA_PROMPT.format(content=content[:4000])
        raw = (await complete_chat(prompt, max_tokens=500)).strip()
        
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
            
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"本体推理失败，使用默认值: {e}")
        return {
            "entities": ["person", "module", "milestone", "budget", "risk", "org"],
            "relations": ["responsible_for", "depends_on", "affects", "part_of", "follows", "allocated_to"]
        }


async def extract_entities_relations(
    content: str,
    doc_id: str,
    section_path: str = "",
    schema: dict | None = None,
) -> tuple[list[Entity], list[Relation]]:
    """
    从文本中抽取实体和关系。

    Args:
        content: Markdown 文本内容
        doc_id: 文档 ID
        section_path: 章节路径
        schema: 可选的本体定义 {"entities": [], "relations": []}
    """
    if len(content.strip()) < 50:
        return [], []

    if not schema:
        # 回退到原来的硬编码类型，保证兼容性
        schema = {
            "entities": ["person", "module", "milestone", "budget", "risk", "org"],
            "relations": ["responsible_for", "depends_on", "affects", "part_of", "follows", "allocated_to"]
        }

    try:
        entity_types = ", ".join(schema.get("entities", []))
        relation_types = ", ".join(schema.get("relations", []))
        
        prompt = EXTRACT_PROMPT.format(
            content=content[:3000],
            entity_types=entity_types,
            relation_types=relation_types
        )
        
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
    schema: dict | None = None,
) -> tuple[list[Entity], list[Relation]]:
    """批量抽取多个 sections 的实体关系"""
    import asyncio

    semaphore = asyncio.Semaphore(max_concurrent)
    all_entities = []
    all_relations = []

    # 如果没有传 schema，尝试根据第一个较长的 section 推理一个
    if not schema and sections:
        longest_sec = max(sections, key=lambda s: len(s.get("content", "")))
        if len(longest_sec.get("content", "")) > 100:
            schema = await infer_schema(longest_sec["content"])

    async def _extract_one(sec):
        async with semaphore:
            content = sec.get("content", "")
            path = sec.get("section_path", "")
            ents, rels = await extract_entities_relations(content, doc_id, path, schema=schema)
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
