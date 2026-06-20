"""
检索管道参数 — 快速模式 / 深度模式（Copilot deep 查询参数）
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core.config import get_settings


@dataclass(frozen=True)
class SearchOptions:
    refine_query: bool
    use_hyde: bool
    candidate_count: int
    skip_reranker: bool
    rrf_k: int
    augment_model: str | None  # 查询改写/HyDE 用小模型；None 表示用主模型


def resolve_search_options(*, deep: bool = False) -> SearchOptions:
    """
    deep=False：默认走 RAG_FAST_MODE（关改写/HyDE、小候选、可跳过 Reranker）
    deep=True：完整管道（RAG_QUERY_REFINE / RAG_USE_HYDE / RETRIEVAL_CANDIDATE_COUNT）
    """
    s = get_settings()
    augment = s.retrieval_llm_model()

    if deep:
        count = max(10, s.RETRIEVAL_CANDIDATE_COUNT)
        return SearchOptions(
            refine_query=s.RAG_QUERY_REFINE,
            use_hyde=s.RAG_USE_HYDE,
            candidate_count=count,
            skip_reranker=s.RAG_SKIP_RERANKER,
            rrf_k=count,
            augment_model=augment,
        )

    if s.RAG_FAST_MODE:
        fast_count = max(10, s.RAG_FAST_CANDIDATE_COUNT)
        return SearchOptions(
            refine_query=False,
            use_hyde=False,
            candidate_count=fast_count,
            skip_reranker=s.RAG_FAST_SKIP_RERANKER,
            rrf_k=fast_count,
            augment_model=None,
        )

    count = max(10, s.RETRIEVAL_CANDIDATE_COUNT)
    return SearchOptions(
        refine_query=s.RAG_QUERY_REFINE,
        use_hyde=s.RAG_USE_HYDE,
        candidate_count=count,
        skip_reranker=s.RAG_SKIP_RERANKER,
        rrf_k=count,
        augment_model=augment,
    )
