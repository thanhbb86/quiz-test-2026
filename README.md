# QUIZ TEST 2026 — Ứng Dụng Thi Trắc Nghiệm Nhà Máy Thủy Điện Bắc Bình

Hệ thống gồm **2 ứng dụng thi & ôn tập trắc nghiệm độc lập**, hoạt động trên cả **Máy tính (PC)**, **Smartphone** và hỗ trợ đóng gói **Android `.apk`** tự động qua GitHub Actions.

## 1. Cấu trúc thư mục
```text
e:\app trac nghiem\
├── TC B4/                      # Ứng dụng 1: Trắc nghiệm Trưởng Ca Bậc 4 (403 câu / 12 chuyên đề)
│   ├── index.html
│   ├── truong ca bac 4.xlsx
│   ├── data/                   # questions.json & questions.js
│   ├── scripts/build_data.py
│   ├── src/                    # app.js, db.js, excel-parser.js, quiz-engine.js, styles.css
│   ├── package.json
│   └── capacitor.config.json
├── bhpp-2026/                  # Ứng dụng 2: Ngân hàng đề thi BHPP 2026 (19 bộ đề / 4.791 câu)
│   ├── index.html
│   ├── tai lieu thi trac nghiem BHPP 2026.xlsx
│   ├── data/                   # bhpp-2026.json & bhpp-2026.js
│   ├── scripts/build_bhpp_data.py
│   ├── src/                    # app.js, db.js, excel-parser.js, quiz-engine.js, styles.css
│   ├── package.json
│   └── capacitor.config.json
└── .github/workflows/
    └── build-apk.yml           # Tự động build 2 file .apk (QUIZ TEST 2026)
```

## 2. Chức năng chính
- **Thi thử & Ôn tập:** Chế độ đếm ngược thời gian (nộp bài mới chấm) và chế độ Ôn tập (xem đáp án đúng/sai ngay lập tức).
- **Cấu hình đề thi linh hoạt:** Tùy chỉnh tổng số câu trong 1 đề và phân bổ câu hỏi theo **tỷ lệ (%) từng chương** (*Tỷ lệ thực tế* hoặc *Chia đều*).
- **19 bộ đề theo chức danh & bậc (App 2):** Chọn nhanh bộ đề tương ứng từng sheet (`TC B1–B5`, `DHV B1–B5`, `SC CO B4–B7`, `SC DIEN B3–B7`).
- **Import cập nhật đề từ Excel:** Đọc trực tiếp file `.xlsx` ngay trên trình duyệt (dùng SheetJS) để cập nhật lại toàn bộ ngân hàng đề.
- **Lưu trữ & Sao lưu:** Lưu lịch sử thi, câu đánh dấu, thống kê câu hay sai bằng **IndexedDB** và hỗ trợ **Export/Import JSON**.

## 3. Công nghệ sử dụng
- **Frontend:** HTML5, Tailwind CSS, Vanilla JavaScript (Mobile-First Responsive + PWA).
- **Đọc Excel trên trình duyệt:** SheetJS (`xlsx`).
- **Trích xuất dữ liệu gốc:** Python 3 + `openpyxl`.
- **Đóng gói Android:** Capacitor 6 + GitHub Actions.

## 4. Hướng dẫn chạy & build APK
- **Chạy trên trình duyệt:** Mở trực tiếp `TC B4/index.html` hoặc `bhpp-2026/index.html`.
- **Tải file `.apk` cho Android:** Truy cập tab **Actions** trên GitHub → chọn workflow **Build Android APK (QUIZ TEST 2026)** → tải 2 artifact `QUIZ-TEST-2026-TC-B4` và `QUIZ-TEST-2026-BHPP`.
