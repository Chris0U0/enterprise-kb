"""
混合检索引擎 — Dense + Sparse 并行检索 → RRF 融合 → BGE-Reranker 精排
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from qdrant_client import models

from app.core.config import get_settings
from app.core.qdrant_client import get_qdrant
from app.services.retrieval.embedder import get_embedder

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class RetrievalResult:
    """单条检索结果"""
    point_id: str
    score: float                    # 最终得分 (Reranker 后)
    content_snippet: str
    payload: dict = field(default_factory=dict)
    retrieval_method: str = "vector"


class HybridSearcher:
    """
    混合检索器，实现完整的检索管道：

    1. 查询编码 → BGE-M3 dense + sparse 向量
    2. Dense 检索 (语义相似) + Sparse 检索 (关键词匹配) 并行
    3. RRF (Reciprocal Rank Fusion) 融合排序
    4. BGE-Reranker-v2-m3c 精排：40 候选 → Top-K
    5. 返回带完整 payload 的检索结果（用于引用溯源）
    """

    def __init__(self):
        self.client = get_qdrant()
        self.collection = settings.QDRANT_COLLECTION
        self.embedder = get_embedder()
        self._reranker = None

    def _load_reranker(self):
        if self._reranker is not None:
            return
        try:
            from FlagEmbedding import FlagReranker
            logger.info(f"加载 Reranker: {settings.BGE_RERANKER_MODEL_PATH}")
            self._reranker = FlagReranker(
                settings.BGE_RERANKER_MODEL_PATH,
                use_fp16=True,
            )
            logger.info("Reranker 加载完成")
        except ImportError:
            logger.warning("FlagEmbedding 未安装，Reranker 不可用，将跳过精排")

    async def search(
        self,
        query: str,
        project_id: str,
        top_k: int | None = None,
        candidate_count: int | None = None,
    ) -> list[RetrievalResult]:
        """
        执行混合检索 + RRF + Reranker 完整管道

        Args:
            query: 用户查询
            project_id: 项目 ID（强制过滤隔离）
            top_k: 最终返回数量
            candidate_count: RRF 候选数量

        Returns:
            排序后的检索结果列表
        """
        top_k = top_k or settings.RERANKER_TOP_K
        candidate_count = candidate_count or settings.RETRIEVAL_CANDIDATE_COUNT

        # project_id 过滤条件
        project_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="project_id",
                    match=models.MatchValue(value=project_id),
                )
            ]
        )

        # Step 1: 编码查询
        query_emb = self.embedder.encode_query(query)

        # Step 2: Dense 检索
        dense_results = self.client.query_points(
            collection_name=self.collection,
            query=query_emb.dense.tolist(),
            using="dense",
            limit=candidate_count,
            query_filter=project_filter,
            with_payload=True,
        ).points

        # Step 3: Sparse 检索
        sparse_indices = list(query_emb.sparse.keys())
        sparse_values = list(query_emb.sparse.values())

        sparse_results = []
        if sparse_indices:
            sparse_results = self.client.query_points(
                collection_name=self.collection,
                query=models.SparseVector(
                    indices=sparse_indices,
                    values=sparse_values,
                ),
                using="sparse",
                limit=candidate_count,
                query_filter=project_filter,
                with_payload=True,
            ).points

        # Step 4: RRF 融合
        fused = self._rrf_fusion(
            dense_results=dense_results,
            sparse_results=sparse_results,
            dense_weight=settings.DENSE_WEIGHT,
            sparse_weight=settings.SPARSE_WEIGHT,
            k=60,  # RRF 参数
        )

        # 取前 candidate_count 个候选
        candidates = fused[:candidate_count]

        if not candidates:
            return []

        # Step 5: Reranker 精排
        reranked = self._rerank(query, candidates, top_k)

        return reranked

    def _rrf_fusion(
        self,
        dense_results: list,
        sparse_results: list,
        dense_weight: float = 0.4,
        sparse_weight: float = 0.4,
        k: int = 60,
    ) -> list[RetrievalResult]:
        """
        Reciprocal Rank Fusion (RRF)
        score = Σ (weight / (k + rank))
        """
        scores: dict[str, float] = {}
        payloads: dict[str, dict] = {}
        snippets: dict[str, str] = {}

        # Dense 排名分数
        for rank, point in enumerate(dense_results):
            pid = str(point.id)
            scores[pid] = scores.get(pid, 0) + dense_weight / (k + rank + 1)
            payloads[pid] = point.payload or {}
            snippets[pid] = (point.payload or {}).get("content_snippet", "")

        # Sparse 排名分数
        for rank, point in enumerate(sparse_results):
            pid = str(point.id)
            scores[pid] = scores.get(pid, 0) + sparse_weight / (k + rank + 1)
            if pid not in payloads:
                payloads[pid] = point.payload or {}
                snippets[pid] = (point.payload or {}).get("content_snippet", "")

        # 按融合分数排序
        sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)

        results = []
        for pid in sorted_ids:
            results.append(RetrievalResult(
                point_id=pid,
                score=scores[pid],
                content_snippet=snippets.get(pid, ""),
                payload=payloads.get(pid, {}),
                retrieval_method="hybrid_rrf",
            ))

        return results

    def _rerank(
        self,
        query: str,
        candidates: list[RetrievalResult],
        top_k: int,
    ) -> list[RetrievalResult]:
        """
        BGE-Reranker 精排
        将 candidate_count 个候选精排到 top_k
        """
        self._load_reranker()

        if self._reranker is None or not candidates:
            # 没有 Reranker，直接返回前 top_k
            return candidates[:top_k]

        # 构建 query-passage pairs
        pairs = [(query, c.content_snippet) for c in candidates]

        # 计算 Reranker 分数
        rerank_scores = self._reranker.compute_score(pairs, normalize=True)

        # 如果只有一个候选，compute_score 返回 float 而非 list
        if isinstance(rerank_scores, (float, int)):
            rerank_scores = [rerank_scores]

        # 更新分数并排序
        for i, score in enumerate(rerank_scores):
            candidates[i].score = float(score)

        candidates.sort(key=lambda x: x.score, reverse=True)

        logger.info(
            f"Reranker: {len(candidates)} 候选 → Top-{top_k}, "
            f"最高分: {candidates[0].score:.4f}"
        )

        return candidates[:top_k]


# 单例
_searcher: HybridSearcher | None = None


def get_searcher() -> HybridSearcher:
    global _searcher
    if _searcher is None:
        _searcher = HybridSearcher()
    return _searcher
