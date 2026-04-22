import os
import shutil
import tempfile
from pathlib import Path
from dataclasses import dataclass
import pythoncom
import win32com.client
import logging

logger = logging.getLogger(__name__)

@dataclass
class PreviewResult:
    preview_path: str | None
    source_path: str
    mode: str
    reason: str | None = None
    content_type: str | None = None

def ensure_preview_win32(
    *,
    minio,
    project_id: str,
    doc_id: str,
    filename: str,
    source_path: str,
) -> PreviewResult:
    """Windows 平台专用的 Office 转 PDF 方案 (需安装 Microsoft Office)"""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    
    # 无需转换的格式
    if ext in {"pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "txt", "md", "csv", "json"}:
        return PreviewResult(preview_path=source_path, source_path=source_path, mode="inline")

    # Office 格式处理
    if ext in {"docx", "doc", "xlsx", "xls", "pptx", "ppt"}:
        return _convert_via_com(minio, project_id, doc_id, filename, source_path, ext)

    return PreviewResult(preview_path=None, source_path=source_path, mode="download", reason="该格式暂不支持预览")

def _convert_via_com(minio, project_id, doc_id, filename, source_path, ext):
    preview_path = minio.preview_path(project_id, doc_id, "pdf")
    
    # 检查缓存
    try:
        minio.client.stat_object(minio.bucket, preview_path)
        return PreviewResult(preview_path=preview_path, source_path=source_path, mode="inline", content_type="application/pdf")
    except:
        pass

    # 开始转换
    source_bytes = minio.download(source_path)
    with tempfile.TemporaryDirectory(prefix="kb_win_") as tmpdir:
        tmp_src = Path(tmpdir) / f"source.{ext}"
        tmp_pdf = Path(tmpdir) / "output.pdf"
        tmp_src.write_bytes(source_bytes)

        # 初始化 COM
        pythoncom.CoInitialize()
        try:
            if ext in ["docx", "doc"]:
                _word_to_pdf(str(tmp_src), str(tmp_pdf))
            elif ext in ["xlsx", "xls"]:
                _excel_to_pdf(str(tmp_src), str(tmp_pdf))
            elif ext in ["pptx", "ppt"]:
                _ppt_to_pdf(str(tmp_src), str(tmp_pdf))
            
            if tmp_pdf.exists():
                minio.upload_bytes(preview_path, tmp_pdf.read_bytes(), "application/pdf")
                return PreviewResult(preview_path=preview_path, source_path=source_path, mode="inline", content_type="application/pdf")
        except Exception as e:
            logger.error(f"COM 转换失败: {e}")
            return PreviewResult(preview_path=None, source_path=source_path, mode="download", reason=f"Office 转换失败: {str(e)}")
        finally:
            pythoncom.CoUninitialize()
            
    return PreviewResult(preview_path=None, source_path=source_path, mode="download", reason="转换失败")

def _word_to_pdf(src, dst):
    word = win32com.client.DispatchEx("Word.Application")
    word.Visible = False
    doc = None
    try:
        doc = word.Documents.Open(src, ReadOnly=True)
        doc.SaveAs(dst, FileFormat=17) # 17 = wdFormatPDF
    finally:
        if doc: doc.Close()
        word.Quit()

def _excel_to_pdf(src, dst):
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    wb = None
    try:
        wb = excel.Workbooks.Open(src, ReadOnly=True)
        wb.ExportAsFixedFormat(0, dst) # 0 = xlTypePDF
    finally:
        if wb: wb.Close()
        excel.Quit()

def _ppt_to_pdf(src, dst):
    ppt = win32com.client.DispatchEx("PowerPoint.Application")
    pres = None
    try:
        pres = ppt.Presentations.Open(src, ReadOnly=True, WithWindow=False)
        pres.SaveAs(dst, 32) # 32 = ppSaveAsPDF
    finally:
        if pres: pres.Close()
        ppt.Quit()
