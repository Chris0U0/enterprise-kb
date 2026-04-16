-- ================================================================
-- 企业项目知识库平台 — PostgreSQL 初始化脚本
-- ================================================================

-- 启用扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── 项目表 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          UUID NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    stage           VARCHAR(50) DEFAULT '准备阶段',
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_org ON projects(org_id);

-- ── 项目成员表 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

CREATE INDEX idx_pm_project ON project_members(project_id);
CREATE INDEX idx_pm_user    ON project_members(user_id);

-- ── 文档表 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    original_filename   VARCHAR(500) NOT NULL,
    source_format       VARCHAR(20) NOT NULL,
    source_path         VARCHAR(1000),          -- MinIO 源文件路径
    md_path             VARCHAR(1000),          -- MinIO Markdown 路径
    checksum            VARCHAR(64),            -- MD5
    file_size_bytes     BIGINT,
    page_count          INT,
    conversion_status   VARCHAR(20) DEFAULT 'pending'
                        CHECK (conversion_status IN ('pending','processing','completed','failed')),
    conversion_error    TEXT,
    upload_by           UUID NOT NULL,
    upload_at           TIMESTAMPTZ DEFAULT NOW(),
    converted_at        TIMESTAMPTZ,
    conversion_version  VARCHAR(10) DEFAULT '1.0'
);

CREATE INDEX idx_docs_project   ON documents(project_id);
CREATE INDEX idx_docs_status    ON documents(conversion_status);
CREATE INDEX idx_docs_format    ON documents(source_format);

-- ── 文档章节表 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_sections (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_id          UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    section_path    VARCHAR(500) NOT NULL,       -- e.g. "第一章/1.1节/1.1.2"
    section_title   VARCHAR(500),
    level           INT NOT NULL DEFAULT 1,      -- 标题层级 1-6
    order_idx       INT NOT NULL DEFAULT 0,      -- 同级排序
    content         TEXT NOT NULL,
    page_num        INT,                         -- PDF 页码
    sheet_name      VARCHAR(200),                -- Excel Sheet 名
    timestamp_sec   FLOAT,                       -- 音视频时间戳(秒)
    char_count      INT,
    ts_vector       TSVECTOR,                    -- 全文检索向量
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sections_doc       ON doc_sections(doc_id);
CREATE INDEX idx_sections_project   ON doc_sections(project_id);
CREATE INDEX idx_sections_path      ON doc_sections(section_path);
CREATE INDEX idx_sections_fts       ON doc_sections USING GIN(ts_vector);

-- 自动更新 ts_vector 的触发器
CREATE OR REPLACE FUNCTION update_ts_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.ts_vector := to_tsvector('simple', COALESCE(NEW.section_title, '') || ' ' || COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sections_tsvector
    BEFORE INSERT OR UPDATE ON doc_sections
    FOR EACH ROW EXECUTE FUNCTION update_ts_vector();

-- ── 文档目录树 (MCP get_document_outline 数据源) ────────
CREATE TABLE IF NOT EXISTS doc_structure (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_id          UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES doc_structure(id),
    section_path    VARCHAR(500) NOT NULL,
    title           VARCHAR(500),
    level           INT NOT NULL,
    order_idx       INT NOT NULL DEFAULT 0,
    has_children    BOOLEAN DEFAULT FALSE,
    page_num        INT,
    section_id      UUID REFERENCES doc_sections(id)
);

CREATE INDEX idx_structure_doc      ON doc_structure(doc_id);
CREATE INDEX idx_structure_parent   ON doc_structure(parent_id);

-- ── 审计日志表 (不可变) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type      VARCHAR(50) NOT NULL,
    user_id         UUID,
    project_id      UUID,
    doc_id          UUID,
    payload         JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 防止审计日志被修改或删除
CREATE INDEX idx_audit_event    ON audit_logs(event_type);
CREATE INDEX idx_audit_user     ON audit_logs(user_id);
CREATE INDEX idx_audit_project  ON audit_logs(project_id);
CREATE INDEX idx_audit_time     ON audit_logs(created_at);

-- 创建规则禁止 UPDATE 和 DELETE
CREATE RULE audit_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- ── 企业术语表 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS term_glossary (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          UUID NOT NULL,
    term            VARCHAR(200) NOT NULL,
    definition      TEXT,
    synonyms        TEXT[] DEFAULT '{}',
    aliases         TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_terms_org  ON term_glossary(org_id);
CREATE INDEX idx_terms_term ON term_glossary USING GIN(term gin_trgm_ops);

-- ════════════════════════════════════════════════════════
-- Phase 3 新增表
-- ════════════════════════════════════════════════════════

-- ── GraphRAG 实体表 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS entities (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      UUID NOT NULL,
    doc_id          UUID REFERENCES documents(id) ON DELETE CASCADE,
    name            VARCHAR(300) NOT NULL,
    type            VARCHAR(50) NOT NULL DEFAULT 'unknown',
    properties      JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_project ON entities(project_id);
CREATE INDEX idx_entities_type    ON entities(type);
CREATE INDEX idx_entities_name    ON entities USING GIN(name gin_trgm_ops);

-- ── GraphRAG 关系表 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS relations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL,
    source_entity_id    UUID REFERENCES entities(id) ON DELETE CASCADE,
    target_entity_id    UUID REFERENCES entities(id) ON DELETE CASCADE,
    relation_type       VARCHAR(100) NOT NULL,
    properties          JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_relations_project ON relations(project_id);
CREATE INDEX idx_relations_type    ON relations(relation_type);
CREATE INDEX idx_relations_source  ON relations(source_entity_id);
CREATE INDEX idx_relations_target  ON relations(target_entity_id);

-- ── RAGAS 评估运行表 ────────────────────────────────────
CREATE TABLE IF NOT EXISTS evaluation_runs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID,
    run_type            VARCHAR(20) NOT NULL,          -- daily / online / ci
    dataset_size        INT,
    faithfulness_avg    FLOAT,
    relevancy_avg       FLOAT,
    recall_avg          FLOAT,
    model_version       VARCHAR(50),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eval_runs_project ON evaluation_runs(project_id);
CREATE INDEX idx_eval_runs_type    ON evaluation_runs(run_type);
CREATE INDEX idx_eval_runs_time    ON evaluation_runs(created_at);

-- ── RAGAS 评估样本表 ────────────────────────────────────
CREATE TABLE IF NOT EXISTS evaluation_samples (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id          UUID REFERENCES evaluation_runs(id) ON DELETE CASCADE,
    query           TEXT,
    answer          TEXT,
    contexts        JSONB,
    ground_truth    TEXT,
    faithfulness    FLOAT,
    relevancy       FLOAT,
    recall          FLOAT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eval_samples_run ON evaluation_samples(run_id);
