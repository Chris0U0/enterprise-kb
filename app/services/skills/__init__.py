# 导入所有 Skill 以触发 @register_skill 装饰器注册
from app.services.skills.document_analysis import DocumentAnalysisSkill
from app.services.skills.cross_document_compare import CrossDocumentCompareSkill
from app.services.skills.project_health import ProjectHealthSkill
from app.services.skills.report_generation import ReportGenerationSkill

__all__ = [
    "DocumentAnalysisSkill",
    "CrossDocumentCompareSkill",
    "ProjectHealthSkill",
    "ReportGenerationSkill",
]
