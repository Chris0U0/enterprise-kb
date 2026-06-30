"""公开只读分享（无需登录）"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.chat.export_share import get_valid_share_by_token

router = APIRouter(prefix="/share", tags=["Share"])


class ShareCitationSchema(BaseModel):
    doc_name: str | None = None
    section_title: str | None = None
    section_path: str | None = None
    page_num: int | None = None


class ShareMessageSchema(BaseModel):
    role: str
    content: str
    citations: list[ShareCitationSchema] = []
    created_at: str | None = None


class PublicShareResponse(BaseModel):
    title: str
    project_name: str | None = None
    shared_at: datetime
    expires_at: datetime | None = None
    view_count: int
    messages: list[ShareMessageSchema]


@router.get("/{token}", response_model=PublicShareResponse)
async def get_public_share(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """通过分享 token 只读查看会话快照（无需登录）"""
    try:
        share = await get_valid_share_by_token(token, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    messages = []
    for m in share.snapshot or []:
        if not isinstance(m, dict):
            continue
        cites = []
        for c in m.get("citations") or []:
            if isinstance(c, dict):
                cites.append(
                    ShareCitationSchema(
                        doc_name=c.get("doc_name"),
                        section_title=c.get("section_title"),
                        section_path=c.get("section_path"),
                        page_num=c.get("page_num"),
                    )
                )
        messages.append(
            ShareMessageSchema(
                role=str(m.get("role", "")),
                content=str(m.get("content", "")),
                citations=cites,
                created_at=m.get("created_at"),
            )
        )

    return PublicShareResponse(
        title=share.title,
        project_name=share.project_name,
        shared_at=share.created_at,
        expires_at=share.expires_at,
        view_count=share.view_count or 0,
        messages=messages,
    )
