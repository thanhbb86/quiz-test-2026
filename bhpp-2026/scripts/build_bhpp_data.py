"""Trích xuất toàn bộ 19 sheet từ 'tai lieu thi trac nghiem BHPP 2026.xlsx' thành bộ đề song song."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import openpyxl

BHPP_DIR = Path(__file__).resolve().parent.parent
EXCEL_PATH = BHPP_DIR / "tai lieu thi trac nghiem BHPP 2026.xlsx"
DATA_DIR = BHPP_DIR / "data"
JSON_OUT = DATA_DIR / "bhpp-2026.json"
JS_OUT = DATA_DIR / "bhpp-2026.js"

GROUP_RULES = [
    ("TC", "Trưởng Ca"),
    ("DHV", "Điều Hành Viên"),
    ("SC CO", "Sửa Chữa Cơ"),
    ("SC DIEN", "Sửa Chữa Điện"),
]


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return re.sub(r"[ \t]+", " ", re.sub(r"\r?\n+", "\n", text)).strip()


def normalize_da_marker(value: Any) -> bool:
    """Nhận diện dấu đáp án đúng ('ĐA', 'ĐA·', 'DA', 'X')."""
    raw = clean_text(value).upper()
    cleaned = re.sub(r"[^A-ZĐ]", "", raw)
    return cleaned in ("ĐA", "DA", "X")


def detect_group(sheet_name: str) -> str:
    upper = sheet_name.strip().upper()
    for prefix, label in GROUP_RULES:
        if upper.startswith(prefix):
            return label
    return "Khác"


def atomic_write_text(target_path: Path, content: str, encoding: str = "utf-8") -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target_path.with_suffix(target_path.suffix + ".tmp")
    try:
        tmp_path.write_text(content, encoding=encoding)
        tmp_path.replace(target_path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


def find_next_nonempty_col1(ws: Any, start_row: int, max_row: int) -> str:
    for r in range(start_row, min(start_row + 4, max_row + 1)):
        c1 = clean_text(ws.cell(r, 1).value)
        c2 = clean_text(ws.cell(r, 2).value)
        if c1 or c2:
            return c1.upper()
    return ""


def parse_sheet(ws: Any, sheet_name: str) -> dict[str, Any]:
    # Tìm dòng tiêu đề ("CÂU HỎI")
    start_row = 5
    title_lines: list[str] = []
    for r in range(1, min(10, ws.max_row + 1)):
        c1 = clean_text(ws.cell(r, 1).value).upper()
        c2 = clean_text(ws.cell(r, 2).value)
        if c1 in ("CÂU HỎI", "CAU HOI"):
            start_row = r + 1
            break
        if c2:
            title_lines.append(c2)

    org_title = title_lines[0] if len(title_lines) >= 1 else "NHÀ MÁY THỦY ĐIỆN BẮC BÌNH"
    role_title = " - ".join(title_lines[1:]) if len(title_lines) >= 2 else sheet_name

    sections: list[dict[str, Any]] = []
    questions: list[dict[str, Any]] = []
    warnings: list[str] = []

    current_section: dict[str, Any] | None = None
    current_question: dict[str, Any] | None = None
    auto_q_num = 0

    def finalize_question(q: dict[str, Any] | None) -> None:
        if q is None:
            return
        correct_indices = [i for i, opt in enumerate(q["options"]) if opt["isCorrect"]]
        if len(q["options"]) < 2:
            warnings.append(f"[{sheet_name}] Dòng {q['sourceRow']} (Câu {q['number']}): chỉ có {len(q['options'])} đáp án.")
        if len(correct_indices) != 1:
            warnings.append(
                f"[{sheet_name}] Dòng {q['sourceRow']} (Câu {q['number']}): có {len(correct_indices)} đáp án đúng."
            )
        q["correctIndex"] = correct_indices[0] if correct_indices else 0
        q["options"] = [{"label": opt["label"], "text": opt["text"]} for opt in q["options"]]
        questions.append(q)

    for r in range(start_row, ws.max_row + 1):
        col1 = clean_text(ws.cell(r, 1).value)
        col2 = clean_text(ws.cell(r, 2).value)
        is_da = normalize_da_marker(ws.cell(r, 3).value)

        if not col1 and not col2:
            continue

        # Phương án A, B, C, D...
        if re.match(r"^[A-F]$", col1.upper()) and current_question is not None:
            current_question["options"].append(
                {
                    "label": col1.upper(),
                    "text": col2,
                    "isCorrect": is_da,
                }
            )
            continue

        # Câu hỏi mới (có số thứ tự, hoặc ô số bị bỏ trống nhưng dòng kế tiếp là phương án A)
        is_blank_question = (
            not col1
            and bool(col2)
            and find_next_nonempty_col1(ws, r + 1, ws.max_row) == "A"
        )
        if re.match(r"^\d+$", col1) or is_blank_question:
            finalize_question(current_question)
            if current_section is None:
                current_section = {"id": "I", "title": "Phần chung", "questionCount": 0}
                sections.append(current_section)

            auto_q_num = int(col1) if re.match(r"^\d+$", col1) else (auto_q_num + 1)
            current_section["questionCount"] += 1
            current_question = {
                "id": f"{sheet_name}__{current_section['id']}-{auto_q_num}-{len(questions) + 1}",
                "number": auto_q_num,
                "sectionId": current_section["id"],
                "sectionTitle": current_section["title"],
                "text": col2,
                "options": [],
                "correctIndex": 0,
                "sourceRow": r,
            }
            continue

        # Tiêu đề chuyên đề mới
        if col1:
            finalize_question(current_question)
            current_question = None
            auto_q_num = 0
            current_section = {
                "id": col1,
                "title": col2 or f"Chuyên đề {col1}",
                "questionCount": 0,
            }
            sections.append(current_section)

    finalize_question(current_question)

    return {
        "id": sheet_name,
        "name": sheet_name,
        "group": detect_group(sheet_name),
        "title": role_title,
        "organization": org_title,
        "totalSections": len(sections),
        "totalQuestions": len(questions),
        "sections": sections,
        "questions": questions,
        "warnings": warnings,
    }


def main() -> int:
    try:
        if not EXCEL_PATH.exists():
            raise FileNotFoundError(f"Không tìm thấy file Excel: {EXCEL_PATH}")

        wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
        try:
            decks = []
            total_questions = 0
            all_warnings = []

            for sheet_name in wb.sheetnames:
                deck = parse_sheet(wb[sheet_name], sheet_name)
                decks.append(deck)
                total_questions += deck["totalQuestions"]
                all_warnings.extend(deck["warnings"])

            payload = {
                "meta": {
                    "title": "NGÂN HÀNG ĐỀ THI TRẮC NGHIỆM BHPP 2026",
                    "sourceFile": EXCEL_PATH.name,
                    "totalDecks": len(decks),
                    "totalQuestions": total_questions,
                    "generatedAt": datetime.now(timezone.utc).isoformat(),
                },
                "decks": decks,
            }
        finally:
            wb.close()

        json_text = json.dumps(payload, ensure_ascii=False, indent=2)
        js_text = "// Tự động sinh bởi bhpp-2026/scripts/build_bhpp_data.py\nwindow.BHPP_DATA = " + json_text + ";\n"

        atomic_write_text(JSON_OUT, json_text, encoding="utf-8")
        atomic_write_text(JS_OUT, js_text, encoding="utf-8")

        print(f"Đã xuất {len(decks)} bộ đề với tổng {total_questions} câu hỏi:")
        for d in decks:
            print(f" - {d['id']:12s} | {d['group']:15s} | {d['totalSections']:2d} chuyên đề | {d['totalQuestions']:3d} câu | cảnh báo: {len(d['warnings'])}")
        return 0
    except Exception as exc:
        print(f"Lỗi: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
