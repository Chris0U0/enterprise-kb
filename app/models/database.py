"""
SQLAlchemy ORM 模型 — 映射 PostgreSQL 表结构
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    UUID, Boolean, Column, DateTime, Float, ForeignKey, Index, Integer,
    String, Text, text, BigInteger,
)
from sqlalchemy.dialects.postgresql import ARRAY, INET, JSONB, TSVECTOR
from sqlalchemy.orm import relationship

from app.core.database import Base


def new_uuid():
    return uuid.uuid4()


class User(Base):
    """平台用户（登录与全局角色）；项目内角色见 ProjectMember.role。"""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    # 全局角色：admin / editor / viewer（序列化给前端时映射为 Admin / Editor / Viewer）
    role = Column(String(20), nullable=False, default="viewer")
    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    stage = Column(String(50), default="准备阶段")
    created_by = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")


class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    role = Column(String(20), nullable=False)  # admin / editor / viewer
    joined_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    project = relationship("Project", back_populates="members")


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    original_filename = Column(String(500), nullable=False)
    source_format = Column(String(20), nullable=False)
    source_path = Column(String(1000))
    md_path = Column(String(1000))
    checksum = Column(String(64))
    file_size_bytes = Column(BigInteger)
    page_count = Column(Integer)
    conversion_status = Column(String(20), default="pending")
    conversion_error = Column(Text)
    upload_by = Column(UUID(as_uuid=True), nullable=False)
    upload_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    converted_at = Column(DateTime(timezone=True))
    conversion_version = Column(String(10), default="1.0")

    project = relationship("Project", back_populates="documents")
    sections = relationship("DocSection", back_populates="document", cascade="all, delete-orphan")
    structures = relationship("DocStructure", back_populates="document", cascade="all, delete-orphan")


class DocSection(Base):
    __tablename__ = "doc_sections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    doc_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    section_path = Column(String(500), nullable=False)
    section_title = Column(String(500))
    level = Column(Integer, nullable=False, default=1)
    order_idx = Column(Integer, nullable=False, default=0)
    content = Column(Text, nullable=False)
    page_num = Column(Integer)
    sheet_name = Column(String(200))
    timestamp_sec = Column(Float)
    char_count = Column(Integer)
    ts_vector = Column(TSVECTOR)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    document = relationship("Document", back_populates="sections")


class DocStructure(Base):
    __tablename__ = "doc_structure"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    doc_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("doc_structure.id"))
    section_path = Column(String(500), nullable=False)
    title = Column(String(500))
    level = Column(Integer, nullable=False)
    order_idx = Column(Integer, nullable=False, default=0)
    has_children = Column(Boolean, default=False)
    page_num = Column(Integer)
    section_id = Column(UUID(as_uuid=True), ForeignKey("doc_sections.id"))

    document = relationship("Document", back_populates="structures")
    children = relationship("DocStructure", back_populates="parent", foreign_keys=[parent_id])
    parent = relationship("DocStructure", back_populates="children", remote_side=[id], foreign_keys=[parent_id])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    event_type = Column(String(50), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True))
    project_id = Column(UUID(as_uuid=True))
    doc_id = Column(UUID(as_uuid=True))
    payload = Column(JSONB)
    ip_address = Column(INET)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class TermGlossary(Base):
    __tablename__ = "term_glossary"

    id = Column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    term = Column(String(200), nullable=False)
    definition = Column(Text)
    synonyms = Column(ARRAY(Text), default=[])
    aliases = Column(ARRAY(Text), default=[])
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
