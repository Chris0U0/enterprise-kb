"""
Pydantic 模型 — API 请求/响应 Schema
"""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────

class ConversionStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class MemberRole(str, Enum):
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


class RetrievalMethod(str, Enum):
    VECTOR = "vector"
    FULLTEXT = "fulltext"
    MCP_TOOL = "mcp_tool"


# ── Document Schemas ─────────────────────────────────────

class DocumentUploadResponse(BaseModel):
    doc_id: uuid.UUID
    project_id: uuid.UUID
    filename: str
    source_format: str
    checksum: str
    status: ConversionStatus
    message: str


class DocumentInfo(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    original_filename: str
    source_format: str
    conversion_status: ConversionStatus
    conversion_error: str | None = None   # 失败原因（前端展示）
    page_count: int | None = None
    file_size_bytes: int | None = None
    checksum: str | None = None
    upload_by: uuid.UUID
    upload_at: datetime
    converted_at: datetime | None = None

    class Config:
        from_attributes = True


class SectionInfo(BaseModel):
    id: uuid.UUID
    doc_id: uuid.UUID
    section_path: str
    section_title: str | None = None
    level: int
    content: str
    page_num: int | None = None
    sheet_name: str | None = None
    timestamp_sec: float | None = None
    char_count: int | None = None

    class Config:
        from_attributes = True


# ── Search / Retrieval Schemas ───────────────────────────

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    project_id: uuid.UUID
    top_k: int = Field(default=5, ge=1, le=20)


class CitationSource(BaseModel):
    """引用溯源元数据"""
    doc_id: uuid.UUID
    doc_name: str
    doc_type: str | None = None

    # Markdown 定位
    md_path: str
    section_path: str
    section_title: str | None = None

    # 源文件定位
    source_path: str
    source_format: str
    page_num: int | None = None
    sheet_name: str | None = None
    timestamp_sec: float | None = None

    # 内容片段
    content_snippet: str
    highlight_text: str | None = None

    # 可信度
    checksum: str | None = None
    upload_by: uuid.UUID | None = None
    upload_at: datetime | None = None

    # 检索元信息
    relevance_score: float
    retrieval_method: RetrievalMethod


class SearchResult(BaseModel):
    """单条检索结果"""
    content: str
    citation: CitationSource
    score: float


class SearchResponse(BaseModel):
    """检索响应"""
    query: str
    answer: str
    citations: list[CitationSource]
    results: list[SearchResult]
    retrieval_method: str
    latency_ms: float


# ── MCP Tool Schemas ─────────────────────────────────────

class DocumentOutlineNode(BaseModel):
    """文档目录树节点"""
    section_path: str
    title: str | None
    level: int
    page_num: int | None = None
    has_children: bool = False
    children: list[DocumentOutlineNode] = []


class MCPListResponse(BaseModel):
    """list_documents 响应"""
    project_id: uuid.UUID
    total_count: int
    documents: list[DocumentInfo]


class MCPOutlineResponse(BaseModel):
    """get_document_outline 响应"""
    doc_id: uuid.UUID
    doc_name: str
    outline: list[DocumentOutlineNode]


class MCPSearchResponse(BaseModel):
    """search_sections 响应"""
    query: str
    project_id: uuid.UUID
    total_hits: int
    sections: list[SectionInfo]


class MCPReadResponse(BaseModel):
    """read_section 响应"""
    doc_id: uuid.UUID
    section_path: str
    section_title: str | None
    content: str
    page_num: int | None = None
    citation: CitationSource


# ── Audit Schemas ────────────────────────────────────────

class AuditEvent(BaseModel):
    event_type: str
    user_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    doc_id: uuid.UUID | None = None
    payload: dict | None = None
    ip_address: str | None = None


# ══════════════════════════════════════════════════════════
# Phase 2 Schemas
# ══════════════════════════════════════════════════════════

class AgenticTraceStep(BaseModel):
    """Agentic RAG 推理轨迹 — 单步"""
    step_id: int
    thought: str
    query: str
    found: str
    sources_count: int
    confidence: float
    duration_ms: float


class AgenticSearchResponse(BaseModel):
    """Agentic RAG 完整响应"""
    query: str
    answer: str
    citations: list[CitationSource]
    traces: list[AgenticTraceStep]   # 推理链路透明化
    confidence: float
    steps_executed: int
    llm_calls: int
    total_duration_ms: float


class SkillInvokeRequest(BaseModel):
    """Skill 调用请求"""
    query: str = Field(..., min_length=1, max_length=2000)
    project_id: uuid.UUID
    doc_ids: list[uuid.UUID] = []
    params: dict = {}


class SkillInvokeResponse(BaseModel):
    """Skill 调用响应"""
    skill: str
    content: str
    data: dict = {}
    confidence: float
    duration_ms: float
    citations: list[dict] = []


class SSEEvent(BaseModel):
    """SSE 事件定义 (用于文档说明)"""
    event: str = Field(..., description="事件类型: step|thinking|chunk|citation|done|error")
    data: dict = Field(..., description="事件数据 JSON")


# ── Auth & Projects（前端对接扩展）────────────────────────

class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10)


class UserPublic(BaseModel):
    """与前端 auth-context 对齐的 User"""

    id: str
    email: str
    name: str
    role: str  # Admin | Editor | Viewer

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int  # 秒
    refresh_token: str | None = None
    refresh_expires_in: int | None = None
    user: UserPublic


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    stage: str | None = Field(default=None, max_length=50)


class ProjectListItem(BaseModel):
    id: str
    name: str
    description: str | None
    phase: str
    member_count: int
    document_count: int
    health: str  # good | warning | critical
    last_update_at: datetime | None
    pending_summary: str


class ProjectOnboarding(BaseModel):
    has_uploaded_doc: bool
    has_indexed_knowledge: bool
    has_tried_qa: bool
    has_viewed_risk_or_report: bool


class ProjectHealthMetrics(BaseModel):
    progress: int = 0
    risk: int = 0
    quality: int = 0


class ProjectDetail(BaseModel):
    id: str
    name: str
    description: str | None
    phase: str
    health: ProjectHealthMetrics
    timeline: list[dict] = []
    last_report_excerpt: str | None = None
    onboarding: ProjectOnboarding


class ProjectMemberItem(BaseModel):
    user_id: str
    email: str
    name: str
    role: str  # Admin | Editor | Viewer
    joined_at: datetime


class ProjectMemberAdd(BaseModel):
    user_id: uuid.UUID
    role: str = "viewer"


class ProjectMemberRoleUpdate(BaseModel):
    role: str
