"""
Kuzu 图数据库封装 — 嵌入式图数据库（类似 SQLite，零运维）

提供：
  - Schema 初始化（Entity / Relation 节点表和边表）
  - CRUD 操作
  - Cypher 查询接口
  - 按 project_id 隔离
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from app.core.config import get_settings
from app.services.graph.extractor import Entity, Relation

logger = logging.getLogger(__name__)
settings = get_settings()


class GraphStore:
    """Kuzu 图数据库封装"""

    def __init__(self, db_path: str | None = None):
        self._db = None
        self._conn = None
        self._db_path = db_path or getattr(settings, "KUZU_DB_PATH", "/tmp/kuzu_db")

    def _ensure_db(self):
        if self._db is not None:
            return

        try:
            import kuzu

            Path(self._db_path).mkdir(parents=True, exist_ok=True)
            self._db = kuzu.Database(self._db_path)
            self._conn = kuzu.Connection(self._db)
            self._init_schema()
            logger.info(f"Kuzu 图数据库就绪: {self._db_path}")

        except ImportError:
            logger.warning("kuzu 未安装 (pip install kuzu)")
            raise

    def _init_schema(self):
        """初始化图 schema"""
        conn = self._conn

        # 节点表
        try:
            conn.execute("""
                CREATE NODE TABLE IF NOT EXISTS Entity(
                    name STRING,
                    type STRING,
                    project_id STRING,
                    doc_id STRING,
                    section_path STRING,
                    properties STRING,
                    PRIMARY KEY(name)
                )
            """)
        except Exception:
            pass  # 表已存在

        # 边表
        try:
            conn.execute("""
                CREATE REL TABLE IF NOT EXISTS RELATES_TO(
                    FROM Entity TO Entity,
                    relation_type STRING,
                    project_id STRING,
                    properties STRING
                )
            """)
        except Exception:
            pass

    def add_entities(self, entities: list[Entity], project_id: str):
        """批量添加实体"""
        self._ensure_db()
        for e in entities:
            try:
                import json
                self._conn.execute(
                    "MERGE (n:Entity {name: $name}) "
                    "SET n.type = $type, n.project_id = $pid, "
                    "n.doc_id = $did, n.section_path = $sp, n.properties = $props",
                    {
                        "name": e.name,
                        "type": e.type,
                        "pid": project_id,
                        "did": e.properties.get("doc_id", ""),
                        "sp": e.properties.get("section_path", ""),
                        "props": json.dumps(e.properties, ensure_ascii=False),
                    },
                )
            except Exception as ex:
                logger.debug(f"添加实体失败 {e.name}: {ex}")

    def add_relations(self, relations: list[Relation], project_id: str):
        """批量添加关系"""
        self._ensure_db()
        for r in relations:
            try:
                import json
                self._conn.execute(
                    "MATCH (a:Entity {name: $src}), (b:Entity {name: $tgt}) "
                    "CREATE (a)-[:RELATES_TO {relation_type: $rtype, project_id: $pid, "
                    "properties: $props}]->(b)",
                    {
                        "src": r.source,
                        "tgt": r.target,
                        "rtype": r.type,
                        "pid": project_id,
                        "props": json.dumps(r.properties, ensure_ascii=False),
                    },
                )
            except Exception as ex:
                logger.debug(f"添加关系失败 {r.source}->{r.target}: {ex}")

    def query_cypher(self, cypher: str, params: dict | None = None) -> list[dict]:
        """执行 Cypher 查询，返回结果列表"""
        self._ensure_db()
        try:
            result = self._conn.execute(cypher, params or {})
            rows = []
            while result.has_next():
                row = result.get_next()
                rows.append(row)
            return rows
        except Exception as e:
            logger.error(f"Cypher 查询失败: {e}")
            return []

    def find_neighbors(self, entity_name: str, project_id: str, depth: int = 1) -> list[dict]:
        """查找实体的邻居"""
        cypher = (
            f"MATCH (a:Entity {{name: $name}})-[r:RELATES_TO*1..{depth}]-(b:Entity) "
            f"WHERE a.project_id = $pid OR b.project_id = $pid "
            f"RETURN a.name, r, b.name, b.type LIMIT 20"
        )
        return self.query_cypher(cypher, {"name": entity_name, "pid": project_id})

    def get_entity_types(self, project_id: str) -> list[dict]:
        """获取项目中所有实体类型及数量"""
        cypher = (
            "MATCH (n:Entity) WHERE n.project_id = $pid "
            "RETURN n.type AS type, COUNT(*) AS count ORDER BY count DESC"
        )
        results = self.query_cypher(cypher, {"pid": project_id})
        return [{"type": r[0], "count": r[1]} for r in results]

    def get_relation_types(self, project_id: str) -> list[dict]:
        """获取项目中所有关系类型及数量"""
        # 注意：Kuzu 的 REL TABLE 查询语法可能略有不同，这里使用通配关系
        cypher = (
            "MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity) WHERE r.project_id = $pid "
            "RETURN r.relation_type AS type, COUNT(*) AS count ORDER BY count DESC"
        )
        results = self.query_cypher(cypher, {"pid": project_id})
        return [{"type": r[0], "count": r[1]} for r in results]

    def get_project_schema(self, project_id: str) -> dict:
        """获取项目的完整本体 Schema"""
        ent_types = self.get_entity_types(project_id)
        rel_types = self.get_relation_types(project_id)
        return {
            "entities": [t["type"] for t in ent_types],
            "relations": [t["type"] for t in rel_types],
        }

    def delete_by_project(self, project_id: str):
        """删除项目的全部图数据"""
        self._ensure_db()
        try:
            self._conn.execute(
                "MATCH (n:Entity) WHERE n.project_id = $pid DETACH DELETE n",
                {"pid": project_id},
            )
        except Exception as e:
            logger.warning(f"删除项目图数据失败: {e}")


_store: GraphStore | None = None


def get_graph_store() -> GraphStore:
    global _store
    if _store is None:
        _store = GraphStore()
    return _store
