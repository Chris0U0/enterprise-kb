"""
GraphRAG 查询层 — 自然语言 → Cypher 转换 + 模板查询
"""
from __future__ import annotations

import json
import logging

import anthropic

from app.core.config import get_settings
from app.services.graph.store import get_graph_store

logger = logging.getLogger(__name__)
settings = get_settings()

TEXT2CYPHER_PROMPT = """你是一个 Cypher 查询专家。将用户的自然语言问题转为 Kuzu Cypher 查询。

图 Schema:
  节点: Entity(name STRING, type STRING, project_id STRING, doc_id STRING)
  边: RELATES_TO(relation_type STRING, project_id STRING)

entity.type 可能的值: person, module, milestone, budget, risk, org
relation_type 可能的值: responsible_for, depends_on, affects, part_of, follows, allocated_to

规则：
1. 必须包含 WHERE ... project_id = '{project_id}' 过滤
2. LIMIT 最多 20 条
3. 只返回 Cypher 查询语句，不要其他文字

用户问题：{query}
项目ID：{project_id}"""


async def query_graph(query: str, project_id: str) -> str:
    """
    自然语言图查询 → Cypher → 执行 → 格式化结果

    Returns:
        格式化的文本结果，空字符串表示无结果
    """
    store = get_graph_store()

    # 先尝试模板查询（快速路径，不需要 LLM）
    template_result = _try_template_query(query, project_id, store)
    if template_result:
        return template_result

    # LLM 生成 Cypher
    try:
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        prompt = TEXT2CYPHER_PROMPT.format(query=query, project_id=project_id)
        message = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )

        cypher = message.content[0].text.strip()
        # 去掉 Markdown 代码块
        if cypher.startswith("```"):
            cypher = cypher.split("```")[1].strip()
            if cypher.startswith("cypher"):
                cypher = cypher[6:].strip()

        logger.info(f"GraphRAG Cypher: {cypher}")

        # 执行查询
        results = store.query_cypher(cypher)
        if not results:
            return ""

        # 格式化
        lines = []
        for row in results[:10]:
            lines.append(" → ".join(str(v) for v in row if v))
        return "\n".join(lines)

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
