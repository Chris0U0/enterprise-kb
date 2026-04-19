"""
项目与成员 API（需 Bearer 鉴权）
"""
from __future__ import annotations

import uuid

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_project_admin, require_project_editor, require_project_member
from app.core.config import get_settings
from app.core.database import get_db
from app.models.database import AuditLog, Document, Project, ProjectMember, User
from app.models.schemas import (
    ProjectCreate,
    ProjectDetail,
    ProjectHealthMetrics,
    ProjectListItem,
    ProjectListResponse,
    ProjectMemberAdd,
    ProjectMemberItem,
    ProjectMemberRoleUpdate,
    ProjectOnboarding,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["Projects"])
settings = get_settings()


def _display_role(r: str) -> str:
    return {"admin": "Admin", "editor": "Editor", "viewer": "Viewer"}.get(
        r.lower().strip(),
        "Viewer",
    )


def _normalize_role(r: str) -> str:
    s = r.lower().strip()
    if s not in ("admin", "editor", "viewer"):
        raise HTTPException(status_code=400, detail="role 须为 admin / editor / viewer")
    return s


async def _member_counts(db: AsyncSession, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not project_ids:
        return {}
    rows = (
        await db.execute(
            select(ProjectMember.project_id, func.count())
            .where(ProjectMember.project_id.in_(project_ids))
            .group_by(ProjectMember.project_id)
        )
    ).all()
    return {pid: int(c) for pid, c in rows}


async def _doc_total_counts(db: AsyncSession, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not project_ids:
        return {}
    rows = (
        await db.execute(
            select(Document.project_id, func.count())
            .where(Document.project_id.in_(project_ids))
            .group_by(Document.project_id)
        )
    ).all()
    return {pid: int(c) for pid, c in rows}


async def _doc_failed_counts(db: AsyncSession, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not project_ids:
        return {}
    rows = (
        await db.execute(
            select(Document.project_id, func.count())
            .where(
                Document.project_id.in_(project_ids),
                Document.conversion_status == "failed",
            )
            .group_by(Document.project_id)
        )
    ).all()
    return {pid: int(c) for pid, c in rows}


async def _doc_completed_counts(db: AsyncSession, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not project_ids:
        return {}
    rows = (
        await db.execute(
            select(Document.project_id, func.count())
            .where(
                Document.project_id.in_(project_ids),
                Document.conversion_status == "completed",
            )
            .group_by(Document.project_id)
        )
    ).all()
    return {pid: int(c) for pid, c in rows}


async def _doc_last_upload(db: AsyncSession, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, datetime | None]:
    if not project_ids:
        return {}
    rows = (
        await db.execute(
            select(Document.project_id, func.max(Document.upload_at))
            .where(Document.project_id.in_(project_ids))
            .group_by(Document.project_id)
        )
    ).all()
    return {pid: mx for pid, mx in rows}


def _health_from_counts(total: int, failed: int, completed: int) -> str:
    if total <= 0:
        return "good"
    if failed > 0 and completed == 0:
        return "critical"
    if failed > 0:
        return "warning"
    return "good"


def _pending_summary_placeholder() -> str:
    return "—"


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    q: str | None = Query(default=None, description="名称/描述模糊搜索"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count_stmt = (
        select(func.count())
        .select_from(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user.id)
    )
    stmt = (
        select(Project, ProjectMember.role)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user.id)
    )
    if q and q.strip():
        kw = f"%{q.strip()}%"
        count_stmt = count_stmt.where(
            or_(Project.name.ilike(kw), Project.description.ilike(kw)),
        )
        stmt = stmt.where(
            or_(Project.name.ilike(kw), Project.description.ilike(kw)),
        )
    total = int((await db.execute(count_stmt)).scalar_one())
    stmt = stmt.order_by(Project.updated_at.desc())

    # 分页：先取 id 再组装（数据量可控）
    offset = (page - 1) * page_size
    result = await db.execute(stmt.offset(offset).limit(page_size))
    rows = result.all()
    ids = [p.id for p, _ in rows]

    mc = await _member_counts(db, ids)
    tc = await _doc_total_counts(db, ids)
    fc = await _doc_failed_counts(db, ids)
    cc = await _doc_completed_counts(db, ids)
    lu = await _doc_last_upload(db, ids)

    items: list[ProjectListItem] = []
    for p, member_role in rows:
        total = tc.get(p.id, 0)
        failed = fc.get(p.id, 0)
        completed = cc.get(p.id, 0)
        last = lu.get(p.id)
        last_update = p.updated_at or last
        items.append(
            ProjectListItem(
                id=str(p.id),
                name=p.name,
                description=p.description,
                phase=p.stage or "准备阶段",
                member_count=mc.get(p.id, 0),
                document_count=total,
                health=_health_from_counts(total, failed, completed),
                last_update_at=last_update,
                pending_summary=_pending_summary_placeholder(),
                my_role=_display_role(member_role),
            )
        )
    return ProjectListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = uuid.UUID(settings.DEFAULT_ORG_ID)
    proj = Project(
        org_id=org,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        stage="准备阶段",
        created_by=user.id,
    )
    db.add(proj)
    await db.flush()
    member = ProjectMember(
        project_id=proj.id,
        user_id=user.id,
        role="admin",
    )
    db.add(member)
    await db.flush()
    return await _project_to_detail(db, proj, "Admin")


async def _project_to_detail(db: AsyncSession, p: Project, my_role: str) -> ProjectDetail:
    pid = p.id
    mc = await _member_counts(db, [pid])
    tc = await _doc_total_counts(db, [pid])
    fc = await _doc_failed_counts(db, [pid])
    cc = await _doc_completed_counts(db, [pid])
    total = tc.get(pid, 0)
    failed = fc.get(pid, 0)
    completed = cc.get(pid, 0)
    onboarding = await _compute_onboarding(db, pid, total, completed)
    # 简易健康度分数（演示用）
    quality = min(100, completed * 10 + 20) if total else 0
    risk = min(100, failed * 15)
    progress = min(100, int(completed / total * 100)) if total else 0
    return ProjectDetail(
        id=str(p.id),
        name=p.name,
        description=p.description,
        phase=p.stage or "准备阶段",
        health=ProjectHealthMetrics(progress=progress, risk=risk, quality=quality),
        timeline=[],
        last_report_excerpt=None,
        onboarding=onboarding,
        my_role=my_role,
    )


async def _compute_onboarding(
    db: AsyncSession,
    project_id: uuid.UUID,
    doc_total: int,
    completed: int,
) -> ProjectOnboarding:
    has_uploaded = doc_total > 0
    has_indexed = completed > 0
    qa = (
        await db.execute(
            select(func.count())
            .select_from(AuditLog)
            .where(
                AuditLog.project_id == project_id,
                AuditLog.event_type == "qa_query",
            ),
        )
    ).scalar_one()
    has_tried_qa = int(qa or 0) > 0
    return ProjectOnboarding(
        has_uploaded_doc=has_uploaded,
        has_indexed_knowledge=has_indexed,
        has_tried_qa=has_tried_qa,
        has_viewed_risk_or_report=False,
    )


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(
    project_id: uuid.UUID,
    ctx: tuple[User, str] = Depends(require_project_member),
    db: AsyncSession = Depends(get_db),
):
    _, role = ctx
    result = await db.execute(select(Project).where(Project.id == project_id))
    p = result.scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return await _project_to_detail(db, p, _display_role(role))


@router.patch("/{project_id}", response_model=ProjectDetail)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    ctx: tuple[User, str] = Depends(require_project_editor),
    db: AsyncSession = Depends(get_db),
):
    _, role = ctx
    result = await db.execute(select(Project).where(Project.id == project_id))
    p = result.scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    if body.name is not None:
        p.name = body.name.strip()
    if body.description is not None:
        p.description = body.description.strip() or None
    if body.stage is not None:
        p.stage = body.stage.strip()
    await db.flush()
    return await _project_to_detail(db, p, _display_role(role))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    _: User = Depends(require_project_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    p = result.scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    await db.delete(p)
    return None


@router.get("/{project_id}/members", response_model=list[ProjectMemberItem])
async def list_members(
    project_id: uuid.UUID,
    _: tuple = Depends(require_project_member),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(ProjectMember, User)
            .join(User, User.id == ProjectMember.user_id)
            .where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.joined_at)
        )
    ).all()
    out: list[ProjectMemberItem] = []
    for pm, u in rows:
        out.append(
            ProjectMemberItem(
                user_id=str(u.id),
                email=u.email,
                name=u.name,
                role=_display_role(pm.role),
                joined_at=pm.joined_at,
            )
        )
    return out


@router.post("/{project_id}/members", response_model=ProjectMemberItem, status_code=status.HTTP_201_CREATED)
async def add_member(
    project_id: uuid.UUID,
    body: ProjectMemberAdd,
    _: User = Depends(require_project_admin),
    db: AsyncSession = Depends(get_db),
):
    role = _normalize_role(body.role)
    u = (await db.execute(select(User).where(User.id == body.user_id))).scalar_one_or_none()
    if u is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    existing = (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == body.user_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="该用户已在项目中")
    pm = ProjectMember(project_id=project_id, user_id=body.user_id, role=role)
    db.add(pm)
    await db.flush()
    return ProjectMemberItem(
        user_id=str(u.id),
        email=u.email,
        name=u.name,
        role=_display_role(role),
        joined_at=pm.joined_at,
    )


@router.patch("/{project_id}/members/{user_id}", response_model=ProjectMemberItem)
async def update_member_role(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    body: ProjectMemberRoleUpdate,
    _: User = Depends(require_project_admin),
    db: AsyncSession = Depends(get_db),
):
    role = _normalize_role(body.role)
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    pm = result.scalar_one_or_none()
    if pm is None:
        raise HTTPException(status_code=404, detail="成员不存在")
    pm.role = role
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if u is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    await db.flush()
    return ProjectMemberItem(
        user_id=str(u.id),
        email=u.email,
        name=u.name,
        role=_display_role(role),
        joined_at=pm.joined_at,
    )


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    admin: User = Depends(require_project_admin),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="不能移除自己")
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    pm = result.scalar_one_or_none()
    if pm is None:
        raise HTTPException(status_code=404, detail="成员不存在")
    await db.delete(pm)
    return None
