"""
GraphRAG 查询层 — 自然语言 → Cypher 转换 + 模板查询
"""
from __future__ import annotations

import json
import logging

from app.core.config import get_settings
from app.services.llm import complete_chat
from app.services.graph.store import get_graph_store

logger = logging.getLogger(__name__)
settings = get_settings()

TEXT2CYPHER_PROMPT = """你是一个 Cypher 查询专家。将用户的自然语言问题转为 Kuzu Cypher 查询。

图 Schema:
  节点: Entity(name STRING, type STRING, project_id STRING, doc_id STRING)
  边: RELATES_TO(relation_type STRING, project_id STRING)

当前项目的实体类型: {entity_types}
当前项目的关系类型: {relation_types}

规则：
1. 必须包含 WHERE ... project_id = '{project_id}' 过滤
2. LIMIT 最多 20 条
3. 只返回 Cypher 查询语句，不要其他文字
4. 如果找不到相关实体，返回一个能返回空结果的合法 Cypher

用户问题：{query}
项目ID：{project_id}"""


async def query_graph(query: str, project_id: str) -> str:
    """
    自然语言图查询 → Cypher → 执行 → 格式化结果
    """
    store = get_graph_store()

    # 1. 动态获取当前项目的 Schema
    try:
        ent_types = store.get_entity_types(project_id)
        rel_types = store.get_relation_types(project_id)
        
        ent_str = ", ".join([f"{t['type']}({t['count']})" for t in ent_types]) or "未知"
        rel_str = ", ".join([f"{t['type']}({t['count']})" for t in rel_types]) or "未知"
    except Exception:
        ent_str = "person, module, milestone, org"
        rel_str = "responsible_for, depends_on, affects"

    # 2. 先尝试模板查询（快速路径）
    template_result = _try_template_query(query, project_id, store)
    if template_result:
        return template_result

    # 3. 实体中心化搜索（通过关键词匹配已有实体，增加召回率）
    entity_context = await _entity_centric_search(query, project_id, store)

    # 4. LLM 生成 Cypher
    try:
        prompt = TEXT2CYPHER_PROMPT.format(
            query=query, 
            project_id=project_id,
            entity_types=ent_str,
            relation_types=rel_str
        )
        cypher = (await complete_chat(prompt, max_tokens=300)).strip()
        # 去掉 Markdown 代码块
        if cypher.startswith("```"):
            cypher = cypher.split("```")[1].strip()
            if cypher.startswith("cypher"):
                cypher = cypher[6:].strip()

        logger.info(f"GraphRAG Cypher: {cypher}")

        # 执行查询
        results = store.query_cypher(cypher)
        
        # 格式化
        lines = []
        if entity_context:
            lines.append(f"[直接关联实体]\n{entity_context}")
            
        if results:
            lines.append("[图谱查询结果]")
            for row in results[:10]:
                lines.append(" → ".join(str(v) for v in row if v))
        
        return "\n".join(lines) if lines else ""

    except Exception as e:
        logger.warning(f"GraphRAG 查询失败: {e}")
        return entity_context or ""


async def _entity_centric_search(query: str, project_id: str, store) -> str:
    """提取查询中的实体并查找其邻居"""
    try:
        # 获取该项目所有实体名
        cypher = f"MATCH (n:Entity) WHERE n.project_id = $pid RETURN n.name"
        rows = store.query_cypher(cypher, {"pid": project_id})
        all_entity_names = [r[0] for r in rows]
        
        found_entities = []
        query_lower = query.lower()
        for name in all_entity_names:
            if name.lower() in query_lower and len(name) > 1:
                found_entities.append(name)
                
        if not found_entities:
            return ""
            
        context_lines = []
        for ent in found_entities[:3]: # 最多取3个匹配实体
            neighbors = store.find_neighbors(ent, project_id, depth=1)
            for row in neighbors:
                # Kuzu 返回的 row: [a.name, r, b.name, b.type]
                # r 是一个 list (由于是变长路径 [r:RELATES_TO*1..1]) 或者单个 dict
                rel_data = row[1]
                if isinstance(rel_data, list) and len(rel_data) > 0:
                    rel_type = rel_data[0].get("relation_type", "related_to")
                elif isinstance(rel_data, dict):
                    rel_type = rel_data.get("relation_type", "related_to")
                else:
                    rel_type = "related_to"
                    
                context_lines.append(f"{row[0]} --({rel_type})--> {row[2]} ({row[3]})")
                
        return "\n".join(list(set(context_lines))[:15])
    except Exception as e:
        logger.warning(f"实体中心化搜索失败: {e}")
        return ""

    except Exception as e:
        logger.warning(f"GraphRAG 查询失败: {e}")
        return ""


def _try_template_query(query: str, project_id: str, store) -> str:
    """基于关键词的模板查询（不需要 LLM）"""
    query_lower = query.lower()

    # "X 负责什么" / "谁负责 X"
    if "负责" in query_lower:
        results = store.query_cypher(
            "MATCH (a:Entity)-[r:RELATES_TO {relation_type: 'responsible_for'}]->(b:Entity) "
            "WHERE a.project_id = $pid RETURN a.name, r.relation_type, b.name LIMIT 10",
            {"pid": project_id},
        )
        if results:
            return "\n".join(f"{r[0]} 负责 {r[2]}" for r in results)

    # "X 依赖什么" / "什么依赖 X"
    if "依赖" in query_lower:
        results = store.query_cypher(
            "MATCH (a:Entity)-[r:RELATES_TO {relation_type: 'depends_on'}]->(b:Entity) "
            "WHERE a.project_id = $pid RETURN a.name, r.relation_type, b.name LIMIT 10",
            {"pid": project_id},
        )
        if results:
            return "\n".join(f"{r[0]} 依赖 {r[2]}" for r in results)

    # "X 和 Y 的关系"
    if "关系" in query_lower or "关联" in query_lower:
        results = store.query_cypher(
            "MATCH (a:Entity)-[r:RELATES_TO]-(b:Entity) "
            "WHERE a.project_id = $pid RETURN a.name, r.relation_type, b.name LIMIT 15",
            {"pid": project_id},
        )
        if results:
            return "\n".join(f"{r[0]} --[{r[1]}]--> {r[2]}" for r in results)

    return ""
