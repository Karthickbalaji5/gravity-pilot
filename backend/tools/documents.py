"""
documents.py — Deterministic document creation tools.
Handles Word (.docx), Excel (.xlsx), PowerPoint (.pptx), and code/script file generation.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from config import get_output_dir

logger = logging.getLogger(__name__)


def _resolve_output_file(output_filename: str, default_ext: str, output_dir: Path | str | None = None) -> Path:
    """Safely resolve target output path and ensure parent directories exist."""
    out_name = output_filename.strip().strip("'\"")
    if not out_name.lower().endswith(default_ext.lower()):
        out_name += default_ext
    p = Path(out_name)
    if p.is_absolute():
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    base_dir = Path(output_dir) if output_dir else get_output_dir()
    target = (base_dir / p).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def generate_word_doc(output_filename: str, content: dict[str, Any], output_dir: Path | str | None = None) -> str:
    """Generate a formatted Microsoft Word document (.docx)."""
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()
    out_path = _resolve_output_file(output_filename, ".docx", output_dir=output_dir)

    title = content.get("title", "Document")
    heading = doc.add_heading(title, level=0)
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER

    sections = content.get("sections", [])
    if not sections and "paragraphs" in content:
        for p in content["paragraphs"]:
            doc.add_paragraph(p)
    else:
        for section in sections:
            if section.get("heading"):
                doc.add_heading(section["heading"], level=1)
            for para in section.get("paragraphs", []):
                doc.add_paragraph(para)

    doc.save(str(out_path))
    logger.info("Saved Word document: %s", out_path)
    return str(out_path)


def generate_attendance_sheet(
    output_filename: str = "Attendance.xlsx",
    student_count: int = 10,
    students: list[str] | None = None,
    output_dir: Path | str | None = None,
) -> str:
    """Generate a formatted attendance sheet (reused from Agentic AI Fleet)."""
    headers = ["Roll No", "Student Name", "Status", "Date"]
    default_names = [
        "Aarav Sharma", "Aditi Rao", "Bhavya Patel", "Chetan Kumar", "Divya Nair",
        "Eshaan Reddy", "Farhan Ali", "Gauri Joshi", "Harsh Vardhan", "Ishita Sen"
    ]
    names = students or default_names[:student_count] if student_count else default_names
    from datetime import date
    today = date.today().strftime("%Y-%m-%d")
    rows = [[f"R{101 + i}", name, "Present", today] for i, name in enumerate(names)]
    return generate_excel_sheet(
        output_filename,
        {"sheet_name": "Attendance", "headers": headers, "rows": rows},
        output_dir=output_dir,
    )


def generate_excel_sheet(output_filename: str, content: dict[str, Any], output_dir: Path | str | None = None) -> str:
    """Generate a styled Microsoft Excel workbook (.xlsx)."""
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    sheet_title = content.get("sheet_name", "Sheet1")
    ws.title = sheet_title

    headers = content.get("headers", [])
    rows = content.get("rows", [])

    # If it's an attendance sheet request with missing headers or rows, provide intelligent defaults
    is_attendance = "attendance" in output_filename.lower() or "attendance" in sheet_title.lower()
    if is_attendance:
        if not headers:
            headers = ["Roll No", "Student Name", "Status", "Date"]
        if not rows:
            from datetime import date
            today = date.today().strftime("%Y-%m-%d")
            default_students = [
                "Aarav Sharma", "Aditi Rao", "Bhavya Patel", "Chetan Kumar", "Divya Nair",
                "Eshaan Reddy", "Farhan Ali", "Gauri Joshi", "Harsh Vardhan", "Ishita Sen"
            ]
            rows = [[f"R{101 + i}", name, "Present", today] for i, name in enumerate(default_students)]

    # Write headers
    if headers:
        ws.append(headers)
        header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

    # Write data rows
    for row in rows:
        ws.append(row)

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val_str = str(cell.value or "")
            if len(val_str) > max_len:
                max_len = len(val_str)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 10)

    out_path = _resolve_output_file(output_filename, ".xlsx", output_dir=output_dir)
    wb.save(str(out_path))
    logger.info("Saved Excel spreadsheet: %s", out_path)
    return str(out_path)



def generate_powerpoint(output_filename: str, content: dict[str, Any], output_dir: Path | str | None = None) -> str:
    """Generate a structured Microsoft PowerPoint presentation (.pptx)."""
    from pptx import Presentation
    from pptx.util import Inches, Pt

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    title_slide_layout = prs.slide_layouts[0]
    content_slide_layout = prs.slide_layouts[1]

    # Title slide
    title_slide = prs.slides.add_slide(title_slide_layout)
    title_box = title_slide.shapes.title
    subtitle_box = title_slide.placeholders[1]

    title_box.text = content.get("title", "Presentation")
    subtitle_box.text = content.get("subtitle", "Generated by DesktopPilot AI")

    # Content slides
    slides_data = content.get("slides", [])
    for slide_data in slides_data:
        slide = prs.slides.add_slide(content_slide_layout)
        slide.shapes.title.text = slide_data.get("title", "Slide")

        body_shape = slide.placeholders[1]
        tf = body_shape.text_frame
        bullets = slide_data.get("bullets", [])
        if bullets:
            tf.text = bullets[0]
            for bullet in bullets[1:]:
                p = tf.add_paragraph()
                p.text = bullet
                p.level = 0

    out_path = _resolve_output_file(output_filename, ".pptx", output_dir=output_dir)
    prs.save(str(out_path))
    logger.info("Saved PowerPoint presentation: %s", out_path)
    return str(out_path)


def generate_code_file(output_filename: str, content: dict[str, Any], output_dir: Path | str | None = None) -> str:
    """Generate a clean source code or script file."""
    code = content.get("code") or content.get("text") or content.get("content") or ""
    out_path = _resolve_output_file(output_filename, ".py" if not Path(output_filename).suffix else "", output_dir=output_dir)
    out_path.write_text(code, encoding="utf-8")
    logger.info("Saved code file: %s", out_path)
    return str(out_path)


GENERATORS = {
    "word": generate_word_doc,
    "excel": generate_excel_sheet,
    "powerpoint": generate_powerpoint,
    "code": generate_code_file,
    "text": generate_code_file,
}
