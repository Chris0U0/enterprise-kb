"""
混合检索引擎 — Dense + Sparse 并行检索 → RRF 融合 → BGE-Reranker 精排
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

from qdrant_client import models

from app.core.config import get_settings
from app.core.qdrant_client import get_qdrant
from app.services.retrieval.embedder import get_embedder
from app.services.retrieval.search_options import resolve_search_options

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
    4. BGE-Reranker-v2-m3c 精排：候选 → Top-K
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
        *,
        deep: bool = False,
        candidate_count: int | None = None,
        refine_query: bool | None = None,
        use_hyde: bool | None = None,
    ) -> list[RetrievalResult]:
        """
        执行混合检索 + RRF + Reranker 完整管道

        Args:
            query: 用户查询
            project_id: 项目 ID（强制过滤隔离）
            top_k: 最终返回数量
            deep: True 时走完整管道（改写 + HyDE + 大候选集）
            candidate_count: 覆盖 RRF 候选数量
            refine_query / use_hyde: 显式覆盖（默认由 resolve_search_options 决定）
        """
        t0 = time.perf_counter()
        opts = resolve_search_options(deep=deep)
        top_k = top_k or settings.RERANKER_TOP_K
        count = candidate_count if candidate_count is not None else opts.candidate_count
        do_refine = opts.refine_query if refine_query is None else refine_query
        do_hyde = opts.use_hyde if use_hyde is None else use_hyde
        augment_model = opts.augment_model

        original_query = query
        search_queries = [query]

        if do_refine or do_hyde:
            from app.services.llm import complete_chat

            async def _refine(q: str) -> str | None:
                prompt = (
                    "请将以下用户问题改写为更适合在知识库中进行语义检索的关键词短语。"
                    "不要回答问题，只输出改写后的结果。\n问题：" + q
                )
                refined = await complete_chat(
                    prompt, max_tokens=100, model=augment_model
                )
                if refined and len(refined) > 2:
                    logger.info("Query Refined: '%s' -> '%s'", q, refined)
                    return refined
                return None

            async def _hyde(q: str) -> str | None:
                prompt = (
                    "针对以下问题，请生成一个简短的、假设性的回答（50-100字）。"
                    "该回答将用于向量检索，请尽可能使用可能出现在原始文档中的专业术语和表达方式。\n"
                    f"问题：{q}"
                )
                hypothetical = await complete_chat(
                    prompt, max_tokens=200, model=augment_model
                )
                if hypothetical:
                    logger.info("HyDE Generated for: %s", q)
                    return hypothetical
                return None

            tasks: list[tuple[str, asyncio.Task]] = []
            if do_refine:
                tasks.append(("refine", asyncio.create_task(_refine(query))))
            if do_hyde:
                tasks.append(("hyde", asyncio.create_task(_hyde(query))))

            if tasks:
                t_aug = time.perf_counter()
                results = await asyncio.gather(
                    *(item[1] for item in tasks), return_exceptions=True
                )
                for (name, _), res in zip(tasks, results):
                    if isinstance(res, Exception):
                        logger.warning("Query augmentation %s failed: %s", name, res)
                    elif res:
                        search_queries.append(res)
                logger.info(
                    "Query augmentation %.0fms (refine=%s hyde=%s)",
                    (time.perf_counter() - t_aug) * 1000,
                    do_refine,
                    do_hyde,
                )

        project_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="project_id",
                    match=models.MatchValue(value=project_id),
                )
            ]
        )

        t_ret = time.perf_counter()
        all_dense_results = []
        all_sparse_results = []

        for q in search_queries:
            query_emb = self.embedder.encode_query(q)

            dense = self.client.query_points(
                collection_name=self.collection,
                query=query_emb.dense.tolist(),
                using="dense",
                limit=count,
                query_filter=project_filter,
                with_payload=True,
            ).points
            all_dense_results.extend(dense)

            sparse_indices = list(query_emb.sparse.keys())
            sparse_values = list(query_emb.sparse.values())
            if sparse_indices:
                sparse = self.client.query_points(
                    collection_name=self.collection,
                    query=models.SparseVector(indices=sparse_indices, values=sparse_values),
                    using="sparse",
                    limit=count,
                    query_filter=project_filter,
                    with_payload=True,
                ).points
                all_sparse_results.extend(sparse)

        fused = self._rrf_fusion_multi(
            dense_results=all_dense_results,
            sparse_results=all_sparse_results,
            dense_weight=settings.DENSE_WEIGHT,
            sparse_weight=settings.SPARSE_WEIGHT,
            k=opts.rrf_k,
        )

        candidates = fused[:count]
        logger.info(
            "Vector retrieval %.0fms queries=%d candidates=%d",
            (time.perf_counter() - t_ret) * 1000,
            len(search_queries),
            len(candidates),
        )

        if not candidates:
            return []

        if opts.skip_reranker:
            logger.info(
                "RAG search %.0fms deep=%s skip_reranker=true top_k=%d",
                (time.perf_counter() - t0) * 1000,
                deep,
                top_k,
            )
            return candidates[:top_k]

        t_rr = time.perf_counter()
        reranked = self._rerank(original_query, candidates, top_k)
        logger.info(
            "RAG search %.0fms deep=%s rerank %.0fms top_k=%d",
            (time.perf_counter() - t0) * 1000,
            deep,
            (time.perf_counter() - t_rr) * 1000,
            top_k,
        )
        return reranked

    def _rrf_fusion_multi(
        self,
        dense_results: list,
        sparse_results: list,
        dense_weight: float = 0.4,
        sparse_weight: float = 0.4,
        k: int = 60,
    ) -> list[RetrievalResult]:
        """
        支持多轮查询结果合并的 RRF 融合
        """
        scores: dict[str, float] = {}
        payloads: dict[str, dict] = {}
        snippets: dict[str, str] = {}

        def process_batch(results, weight):
            seen_in_batch = set()
            rank = 0
            for point in results:
                pid = str(point.id)
                if pid in seen_in_batch:
                    continue
                seen_in_batch.add(pid)

                scores[pid] = scores.get(pid, 0) + weight / (k + rank + 1)
                if pid not in payloads:
                    payloads[pid] = point.payload or {}
                    snippets[pid] = (point.payload or {}).get("content_snippet", "")
                rank += 1

        process_batch(dense_results, dense_weight)
        process_batch(sparse_results, sparse_weight)

        sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)

        results = []
        for pid in sorted_ids:
            results.append(RetrievalResult(
                point_id=pid,
                score=scores[pid],
                content_snippet=snippets.get(pid, ""),
                payload=payloads.get(pid, {}),
                retrieval_method="hybrid_rrf_multi",
            ))

        return results

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

        for rank, point in enumerate(dense_results):
            pid = str(point.id)
            scores[pid] = scores.get(pid, 0) + dense_weight / (k + rank + 1)
            payloads[pid] = point.payload or {}
            snippets[pid] = (point.payload or {}).get("content_snippet", "")

        for rank, point in enumerate(sparse_results):
            pid = str(point.id)
            scores[pid] = scores.get(pid, 0) + sparse_weight / (k + rank + 1)
            if pid not in payloads:
                payloads[pid] = point.payload or {}
                snippets[pid] = (point.payload or {}).get("content_snippet", "")

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
            return candidates[:top_k]

        pairs = []
        for c in candidates:
            doc_name = c.payload.get("doc_name", "未知文档")
            section_title = c.payload.get("section_title", "")
            enhanced_content = f"文档：{doc_name}\n"
            if section_title:
                enhanced_content += f"章节：{section_title}\n"
            enhanced_content += c.content_snippet
            pairs.append((query, enhanced_content))

        rerank_scores = self._reranker.compute_score(pairs, normalize=True)

        if isinstance(rerank_scores, (float, int)):
            rerank_scores = [rerank_scores]

        for i, score in enumerate(rerank_scores):
            candidates[i].score = float(score)

        candidates.sort(key=lambda x: x.score, reverse=True)

        logger.info(
            f"Reranker: {len(candidates)} 候选 → Top-{top_k}, "
            f"最高分: {candidates[0].score:.4f}"
        )

        return candidates[:top_k]


_searcher: HybridSearcher | None = None


def get_searcher() -> HybridSearcher:
    global _searcher
    if _searcher is None:
        _searcher = HybridSearcher()
    return _searcher
