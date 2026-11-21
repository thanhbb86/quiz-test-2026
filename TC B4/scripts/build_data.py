"""Trích xuất và chuẩn hóa dữ liệu trắc nghiệm từ file Excel sang JSON và JS."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import openpyxl

ROOT_DIR = Path(__file__).resolve().parent.parent
EXCEL_PATH = ROOT_DIR / "truong ca bac 4.xlsx"
SHEET_NAME = "trac nghiem"
DATA_DIR = ROOT_DIR / "data"
JSON_OUT = DATA_DIR / "questions.json"
JS_OUT = DATA_DIR / "questions.js"


def clean_text(value: Any) -> str:
    """Chuẩn hóa chuỗi văn bản từ ô Excel, giữ nội dung rõ ràng."""
    if value is None:
        return ""
    text = str(value).strip()
    return re.sub(r"[ \t]+", " ", re.sub(r"\r?\n+", "\n", text)).strip()


def atomic_write_text(target_path: Path, content: str, encoding: str = "utf-8") -> None:
    """Ghi file nguyên tử qua file tạm .tmp để tránh hỏng dữ liệu khi gián đoạn."""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target_path.with_suffix(target_path.suffix + ".tmp")
    try:
        tmp_path.write_text(content, encoding=encoding)
        tmp_path.replace(target_path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


def parse_excel(excel_path: Path, sheet_name: str = SHEET_NAME) -> dict[str, Any]:
    """Đọc sheet trắc nghiệm và trả về cấu trúc dữ liệu chuẩn hóa."""
    if not excel_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file Excel: {excel_path}")

    workbook = openpyxl.load_workbook(excel_path, data_only=True)
    try:
        if sheet_name not in workbook.sheetnames:
            raise ValueError(f"Không tìm thấy sheet '{sheet_name}' trong {excel_path.name}")
        ws = workbook[sheet_name]

        org_title = clean_text(ws.cell(1, 2).value) or "NHÀ MÁY THỦY ĐIỆN BẮC BÌNH"
        exam_title = clean_text(ws.cell(2, 2).value) or "ĐỐI TƯỢNG THI: TRƯỞNG CA BẬC 4"

        sections: list[dict[str, Any]] = []
        questions: list[dict[str, Any]] = []
        warnings: list[str] = []

        current_section: dict[str, Any] | None = None
        current_question: dict[str, Any] | None = None

        def finalize_question(q: dict[str, Any] | None) -> None:
            if q is None:
                return
            correct_indices = [i for i, opt in enumerate(q["options"]) if opt["isCorrect"]]
            if len(q["options"]) < 2:
                warnings.append(f"Dòng {q['sourceRow']} (Câu {q['number']}): có ít hơn 2 đáp án.")
            if len(correct_indices) != 1:
                warnings.append(
                    f"Dòng {q['sourceRow']} (Câu {q['number']}): có {len(correct_indices)} đáp án đúng (ĐA)."
                )
            q["correctIndex"] = correct_indices[0] if correct_indices else 0
            # Loại bỏ cờ nội bộ isCorrect khỏi options để gọn dữ liệu
            q["options"] = [{"label": opt["label"], "text": opt["text"]} for opt in q["options"]]
            questions.append(q)

        for r in range(4, ws.max_row + 1):
            col1 = clean_text(ws.cell(r, 1).value)
            col2 = clean_text(ws.cell(r, 2).value)
            col3 = clean_text(ws.cell(r, 3).value).upper()

            if not col1 and not col2:
                continue

            # Phương án trả lời (A, B, C, D, E...)
            if re.match(r"^[A-F]$", col1.upper()) and current_question is not None:
                is_correct = col3 in ("ĐA", "DA", "X")
                current_question["options"].append(
                    {
                        "label": col1.upper(),
                        "text": col2,
                        "isCorrect": is_correct,
                    }
                )
                continue

            # Câu hỏi mới (cột 1 là số thứ tự)
            if re.match(r"^\d+$", col1):
                finalize_question(current_question)
                if current_section is None:
                    current_section = {"id": "I", "title": "Phần chung", "questionCount": 0}
                    sections.append(current_section)

                q_num = int(col1)
                current_section["questionCount"] += 1
                current_question = {
                    "id": f"{current_section['id']}-{q_num}-{len(questions) + 1}",
                    "number": q_num,
                    "sectionId": current_section["id"],
                    "sectionTitle": current_section["title"],
                    "text": col2,
                    "options": [],
                    "correctIndex": 0,
                    "sourceRow": r,
                }
                continue

            # Tiêu đề chuyên đề mới (số La Mã hoặc chữ)
            if col1:
                finalize_question(current_question)
                current_question = None
                current_section = {
                    "id": col1,
                    "title": col2 or f"Chuyên đề {col1}",
                    "questionCount": 0,
                }
                sections.append(current_section)

        finalize_question(current_question)

        return {
            "meta": {
                "organization": org_title,
                "title": exam_title,
                "sourceFile": excel_path.name,
                "sheetName": sheet_name,
                "totalSections": len(sections),
                "totalQuestions": len(questions),
                "generatedAt": datetime.now(timezone.utc).isoformat(),
            },
            "sections": sections,
            "questions": questions,
            "warnings": warnings,
        }
    finally:
        workbook.close()


def main() -> int:
    try:
        data = parse_excel(EXCEL_PATH, SHEET_NAME)
        json_text = json.dumps(data, ensure_ascii=False, indent=2)
        js_text = "// Tự động sinh bởi scripts/build_data.py - Không sửa tay\nwindow.QUIZ_DATA = " + json_text + ";\n"

        atomic_write_text(JSON_OUT, json_text, encoding="utf-8")
        atomic_write_text(JS_OUT, js_text, encoding="utf-8")

        meta = data["meta"]
        print(f"Đã xuất thành công {meta['totalQuestions']} câu hỏi thuộc {meta['totalSections']} chuyên đề.")
        print(f" - JSON: {JSON_OUT}")
        print(f" - JS:   {JS_OUT}")
        if data["warnings"]:
            print(f"Cảnh báo ({len(data['warnings'])}):")
            for w in data["warnings"]:
                print(f"  * {w}")
        return 0
    except Exception as exc:
        print(f"Lỗi khi xử lý dữ liệu: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
