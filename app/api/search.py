"""
RAG 检索 API — Phase 2 完整版
新增: Agentic RAG / Skills 调用 / SSE 流式输出
"""
from __future__ import annotations

import time
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_project_member, get_current_user
from app.core.database import get_db
from app.core.config import get_settings
from app.models.database import User
from app.models.schemas import SearchRequest, SearchResponse, SearchResult, SkillInvokeRequest
from app.services.retrieval.router import route_query, RetrievalStrategy
from app.services.retrieval.searcher import get_searcher
from app.services.llm import complete_chat
from app.services.retrieval.citation import build_citation, build_llm_context, generate_cited_answer
from app.models.database import AuditLog

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/search", tags=["Search"])


# ══════════════════════════════════════════════════════════
# 标准 RAG 检索（非流式）
# ══════════════════════════════════════════════════════════

@router.post("/", response_model=SearchResponse)
async def search(
    request: SearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    RAG 检索主入口（非流式）

    完整 11 步管道:
    1. 查询输入  2. 术语识别  3. 查询路由
    4-7. 混合检索 + RRF + Reranker
    8. Agentic 路径判断  9. 术语注入
    10. 答案生成 + 引用  11. 审计日志
    """
    await ensure_project_member(request.project_id, user, db)
    start_time = time.time()
    project_id_str = str(request.project_id)

    # Step 3: 查询路由
    strategy = await route_query(request.query, project_id_str, db)

    # 根据策略执行
    if strategy == RetrievalStrategy.MULTI_AGENT:
        return await _multi_agent_search(request, db, start_time)
    elif strategy == RetrievalStrategy.AGENTIC_RAG:
        return await _agentic_search(request, db, start_time)
    elif strategy == RetrievalStrategy.GRAPH_ENHANCED:
        results, citations = await _graph_enhanced_search(request, db)
    elif strategy == RetrievalStrategy.MCP_TOOL:
        results, citations = await _mcp_search(request, db)
    else:
        results, citations = await _vector_search(request)

    if not results:
        latency_ms = (time.time() - start_time) * 1000
        return SearchResponse(
            query=request.query,
            answer="根据现有文档未找到与您问题相关的信息。请尝试调整查询关键词，或确认相关文档已上传。",
            citations=[], results=[],
            retrieval_method=strategy.value,
            latency_ms=latency_ms,
        )

    # Step 10: LLM 生成答案
    context_results = [
        {"content_snippet": r.content, "payload": r.citation.model_dump(), "score": r.score}
        for r in results
    ]
    prompt = build_llm_context(request.query, context_results)
    answer = await _generate_answer(prompt)
    answer = generate_cited_answer(request.query, answer, citations)

    latency_ms = (time.time() - start_time) * 1000

    # Step 11: 审计日志（记录 answer+contexts 供 RAGAS 评估使用）
    context_snippets = [r.content[:300] for r in results]
    db.add(AuditLog(
        event_type="qa_query",
        project_id=request.project_id,
        payload={
            "query": request.query,
            "answer": answer[:2000],
            "contexts": context_snippets,
            "strategy": strategy.value,
            "result_count": len(results),
            "latency_ms": round(latency_ms, 2),
            "cited_docs": [str(c.doc_id) for c in citations],
        },
    ))

    # Phase 3: RAGAS 在线抽样评估（异步，不阻塞响应）
    if getattr(settings, "RAGAS_ENABLED", False):
        import asyncio
        from app.services.evaluation.scheduler import evaluate_single_query
        asyncio.create_task(evaluate_single_query(
            query=request.query, answer=answer, contexts=context_snippets,
            project_id=str(request.project_id),
        ))

    return SearchResponse(
        query=request.query,
        answer=answer,
        citations=citations,
        results=results,
        retrieval_method=strategy.value,
        latency_ms=round(latency_ms, 2),
    )


# ══════════════════════════════════════════════════════════
# SSE 流式检索 — 感知延迟降低 80%
# ══════════════════════════════════════════════════════════

@router.get("/stream")
async def search_stream(
    query: str = Query(..., min_length=1, max_length=2000),
    project_id: uuid.UUID = Query(...),
    top_k: int = Query(default=5, ge=1, le=20),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    SSE 流式检索 — 实时推送检索过程和答案

    事件类型:
      - step:     进度状态更新
      - thinking: Agentic RAG 推理思考过程
      - chunk:    LLM 生成的文本增量
      - citation: 引用来源信息
      - done:     完成信号 + 统计信息
      - error:    错误信息
    """
    await ensure_project_member(project_id, user, db)
    project_id_str = str(project_id)

    # 路由决策
    strategy = await route_query(query, project_id_str, db)

    from app.services.streaming.sse import stream_agentic_rag, stream_search_response

    if strategy == RetrievalStrategy.AGENTIC_RAG:
        generator = stream_agentic_rag(query, project_id_str, top_k)
    else:
        generator = stream_search_response(query, project_id_str, top_k)

    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 禁止 nginx 缓冲
        },
    )


# ══════════════════════════════════════════════════════════
# Skills 调用端点
# ══════════════════════════════════════════════════════════

@router.post("/skill/{skill_name}")
async def invoke_skill(
    skill_name: str,
    request: SkillInvokeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    直接调用指定 Skill

    可用 Skills:
    - document_analysis: 单文档分析
    - cross_document_compare: 跨文档对比
    - project_health: 项目健康评估
    - report_generation: 报告生成
    """
    await ensure_project_member(request.project_id, user, db)
    from app.services.skills.base import get_skill, get_all_skills, SkillInput

    skill = get_skill(skill_name)
    if skill is None:
        available = list(get_all_skills().keys())
        raise HTTPException(
            status_code=404,
            detail=f"Skill '{skill_name}' 不存在。可用: {available}",
        )

    skill_input = SkillInput(
        query=request.query,
        project_id=str(request.project_id),
        doc_ids=[str(d) for d in request.doc_ids],
        params=request.params or {},
    )

    output = await skill.execute(skill_input)

    return {
        "skill": skill_name,
        "content": output.content,
        "data": output.data,
        "confidence": output.confidence,
        "duration_ms": output.duration_ms,
        "citations": output.citations,
    }


@router.get("/skills")
async def list_skills(_user: User = Depends(get_current_user)):
    """列出所有已注册的 Skills"""
    from app.services.skills.base import get_all_skills

    skills = get_all_skills()
    return {
        "total": len(skills),
        "skills": [
            {
                "name": s.name,
                "description": s.description,
                "keywords": s.match_keywords[:5],
            }
            for s in skills.values()
        ],
    }


# ══════════════════════════════════════════════════════════
# 内部方法
# ══════════════════════════════════════════════════════════

async def _agentic_search(request: SearchRequest, db: AsyncSession, start_time: float) -> SearchResponse:
    """Agentic RAG 路径"""
    from app.services.agentic.graph import run_agentic_rag
    from app.models.schemas import CitationSource

    result = await run_agentic_rag(
        query=request.query,
        project_id=str(request.project_id),
        top_k=request.top_k,
    )

    # 转换引用格式
    citations = []
    for c in result.get("citations", []):
        try:
            citations.append(CitationSource(**c))
        except Exception:
            pass

    latency_ms = (time.time() - start_time) * 1000

    # 审计
    db.add(AuditLog(
        event_type="qa_query",
        project_id=request.project_id,
        payload={
            "query": request.query,
            "strategy": "agentic_rag",
            "steps_executed": result.get("steps_executed", 0),
            "llm_calls": result.get("llm_calls", 0),
            "confidence": result.get("confidence", 0),
            "latency_ms": round(latency_ms, 2),
            "traces": result.get("traces", []),
        },
    ))

    return SearchResponse(
        query=request.query,
        answer=result.get("answer", ""),
        citations=citations,
        results=[],
        retrieval_method="agentic_rag",
        latency_ms=round(latency_ms, 2),
    )


async def _multi_agent_search(request: SearchRequest, db: AsyncSession, start_time: float) -> SearchResponse:
    """Phase 3: Multi-Agent 四 Agent 协作路径"""
    from app.services.agents.graph import run_multi_agent
    from app.models.schemas import CitationSource

    result = await run_multi_agent(
        query=request.query,
        project_id=str(request.project_id),
        top_k=request.top_k,
    )

    citations = []
    for c in result.get("citations", []):
        try:
            citations.append(CitationSource(**c))
        except Exception:
            pass

    latency_ms = (time.time() - start_time) * 1000
    answer = result.get("answer", "")

    db.add(AuditLog(
        event_type="qa_query",
        project_id=request.project_id,
        payload={
            "query": request.query,
            "answer": answer[:2000],
            "contexts": [str(c.content_snippet)[:300] for c in citations],
            "strategy": "multi_agent",
            "total_tokens": result.get("total_tokens", 0),
            "latency_ms": round(latency_ms, 2),
            "traces": result.get("traces", []),
        },
    ))

    # RAGAS 在线抽样
    if getattr(settings, "RAGAS_ENABLED", False):
        import asyncio
        from app.services.evaluation.scheduler import evaluate_single_query
        asyncio.create_task(evaluate_single_query(
            query=request.query, answer=answer,
            contexts=[str(c.content_snippet)[:300] for c in citations],
            project_id=str(request.project_id),
        ))

    return SearchResponse(
        query=request.query,
        answer=answer,
        citations=citations,
        results=[],
        retrieval_method="multi_agent",
        latency_ms=round(latency_ms, 2),
    )


async def _graph_enhanced_search(request: SearchRequest, db: AsyncSession) -> tuple[list[SearchResult], list]:
    """Phase 3: 图增强检索 — 先图查询定位实体 → 再向量检索扩展上下文"""
    from app.services.graph.query import query_graph

    # 图查询获取相关实体/关系
    graph_context = await query_graph(request.query, str(request.project_id))

    # 向量检索
    searcher = get_searcher()
    retrieval_results = await searcher.search(
        query=request.query,
        project_id=str(request.project_id),
        top_k=request.top_k,
    )

    results = []
    citations = []
    for rr in retrieval_results:
        # 如果有图上下文，追加到 content_snippet
        enriched_content = rr.content_snippet
        if graph_context:
            enriched_content += f"\n\n[图谱关系]\n{graph_context}"

        citation = build_citation(rr.payload, rr.score, "graph_enhanced")
        citations.append(citation)
        results.append(SearchResult(content=enriched_content, citation=citation, score=rr.score))

    return results, citations


async def _vector_search(request: SearchRequest) -> tuple[list[SearchResult], list]:
    """向量化 RAG 检索路径"""
    searcher = get_searcher()
    retrieval_results = await searcher.search(
        query=request.query,
        project_id=str(request.project_id),
        top_k=request.top_k,
    )

    results = []
    citations = []
    for rr in retrieval_results:
        citation = build_citation(rr.payload, rr.score, rr.retrieval_method)
        citations.append(citation)
        results.append(SearchResult(content=rr.content_snippet, citation=citation, score=rr.score))

    return results, citations


async def _mcp_search(request: SearchRequest, db: AsyncSession) -> tuple[list[SearchResult], list]:
    """MCP 工具化检索路径"""
    from app.services.mcp_tools.search_sections import search_sections
    from app.models.schemas import CitationSource, RetrievalMethod
    from sqlalchemy import select
    from app.models.database import Document

    mcp_result = await search_sections(
        query=request.query,
        project_id=request.project_id,
        db=db,
        limit=request.top_k,
    )

    results = []
    citations = []
    for sec in mcp_result.sections:
        doc_result = await db.execute(select(Document).where(Document.id == sec.doc_id))
        doc = doc_result.scalar_one_or_none()

        citation = CitationSource(
            doc_id=sec.doc_id,
            doc_name=doc.original_filename if doc else "未知文档",
            doc_type=None,
            md_path=doc.md_path or "" if doc else "",
            section_path=sec.section_path,
            section_title=sec.section_title,
            source_path=doc.source_path or "" if doc else "",
            source_format=doc.source_format if doc else "",
            page_num=sec.page_num,
            sheet_name=sec.sheet_name,
            timestamp_sec=sec.timestamp_sec,
            content_snippet=sec.content[:300],
            checksum=doc.checksum if doc else None,
            upload_by=doc.upload_by if doc else None,
            upload_at=doc.upload_at if doc else None,
            relevance_score=1.0,
            retrieval_method=RetrievalMethod.MCP_TOOL,
        )
        citations.append(citation)
        results.append(SearchResult(content=sec.content, citation=citation, score=1.0))

    return results, citations


async def _generate_answer(prompt: str) -> str:
    """调用配置的 LLM（DashScope / Claude）生成答案"""
    try:
        return await complete_chat(prompt, max_tokens=2048)
    except Exception as e:
        logger.error(f"LLM 生成失败: {e}")
        return f"（答案生成失败: {e}）"
