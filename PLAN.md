# KẾ HOẠCH TỔNG THỂ DỰ ÁN: QUIZ TEST 2026 (TRẠNG THÁI HIỆN TẠI)

## 1. Mục tiêu & Phạm vi (Scope)
- **Mục đích:** Xây dựng hệ thống ôn tập và thi trắc nghiệm trực tuyến/offline cho nhân sự **Nhà máy Thủy điện Bắc Bình (BHPP)**, vận hành song song trên **Máy tính (Windows/Mac)**, **Smartphone Android (`.apk`)** và **iOS (Safari PWA)**.
- **Nguyên tắc kiến trúc bắt buộc (theo `GEMINI.md`):**
  - Luôn duy trì **2 ứng dụng độc lập hoàn toàn** (`TC B4/` và `bhpp-2026/`), không gộp chung vào một trang cổng hay một file `.apk` chung.
  - Mỗi ứng dụng có link Web/iOS riêng, `manifest.json` riêng, `sw.js` riêng, IndexedDB riêng và file `.apk` riêng:
    1. **App 1 (`TC B4/` — `QUIZ TEST 2026 (TC B4)`):** Gồm 3 bộ đề (*Trưởng Ca Bậc 4* — **427 câu**/12 chuyên đề; *Bộ đề An toàn* — **457 câu**/2 phần từ `ATĐ_2026.xlsx`; *Văn hóa Doanh nghiệp* — 28 câu).
    2. **App 2 (`bhpp-2026/` — `QUIZ TEST 2026`):** Gồm **21 bộ đề / 5.673 câu hỏi** (19 bộ đề theo chức danh & bậc `TC B1–B5`, `DHV B1–B5`, `SC CO B4–B7`, `SC DIEN B3–B7` — 5.188 câu + 2 bộ đề *An toàn* 457 câu và *Văn hóa Doanh nghiệp* 28 câu).
- **Luồng hoạt động cốt lõi:**
  1. Chọn bộ đề từ danh sách thả xuống (`#deck-select`).
  2. Chọn chế độ **Thi thử** (đếm ngược thời gian, nộp bài mới chấm) hoặc **Ôn tập** (xem đáp án đúng/sai ngay), hỗ trợ cả câu hỏi **1 đáp án** và **nhiều đáp án (`A–L`)**.
  3. Cấu hình tổng số câu trong 1 đề và phân bổ theo **tỷ lệ (%) từng chương** (*Tỷ lệ thực tế* hoặc *Chia đều*), giữ nguyên thứ tự chuyên đề `I → II → III...`.
  4. Tự động ánh xạ lại chữ cái tham chiếu chéo (`Phương án A và C đúng`) và giữ phương án tổng hợp (`Tất cả đều đúng/sai`) ở cuối khi đảo đáp án.
  5. Import cập nhật đề trực tiếp từ file `.xlsx`/`.json` trên trình duyệt, xem lại câu sai/đánh dấu, và Export/Import JSON sao lưu.

---

## 2. Ràng buộc kỹ thuật (Technical Constraints — Trường hợp B: Website / Web App & Mobile Wrapper)
- **Stack công nghệ:**
  - **Frontend:** HTML5 + Tailwind CSS + Vanilla JavaScript (ES6+), thiết kế **Mobile-First Responsive** (thanh điều hướng cố định đáy màn hình & Drawer bảng câu hỏi trên smartphone, phím tắt `A-D`/`1-4`/`←/→` trên PC).
  - **Đọc Excel phía trình duyệt:** SheetJS (`xlsx`) hỗ trợ import 1 sheet (App 1) hoặc nhiều sheet (App 2).
  - **PWA Offline (Web & iOS):** `manifest.json`, icon PNG (`180x180`, `192x192`, `512x512`) và Service Worker `sw.js` (`v9`).
  - **Đóng gói Android:** Capacitor 6 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`) build tự động qua GitHub Actions (`ubuntu-latest`, Node 20, Java 17).
  - **Data Pipeline:** Python 3 (`openpyxl`, `Pillow`) trích xuất dữ liệu & sinh icon.
- **Lưu trữ dữ liệu:**
  - **IndexedDB** riêng cho từng app (`trac_nghiem_bac4_db` và `bhpp_2026_quiz_db`) lưu bộ đề tùy chỉnh, lịch sử thi, câu đánh dấu, thống kê câu sai.
  - **localStorage** lưu cấu hình nhẹ (Dark Mode, cỡ chữ `Aa`, số câu, tỷ lệ `%` từng chương, bộ đề đang chọn).
- **Bảo mật & Độ ổn định:**
  - Không hardcode API Key; mọi thao tác I/O bọc `try-catch-finally` kèm timeout; dọn dẹp `setInterval` khi thoát bài thi; khóa logic quan trọng bằng `@FIXED` trong code và `GEMINI.md`.

---

## 3. Cấu trúc thư mục & File hiện tại
```text
e:\app trac nghiem\
├── .github/workflows/
│   └── build-apk.yml           # Tự động build 2 file .apk độc lập trên GitHub Actions
├── .gitignore                  # Bỏ qua node_modules/, */www/, */android/, app android/, *.apk, *.zip
├── GEMINI.md                   # Quy tắc kiến trúc độc lập 2 app & Danh sách lỗi đã khóa (@FIXED)
├── PLAN.md                     # Tài liệu kế hoạch tổng thể dự án đến hiện tại
├── README.md                   # Tài liệu giới thiệu & hướng dẫn sử dụng
├── ATĐ_2026.xlsx               # File nguồn Bộ đề An toàn mới (457 câu, sheet 'ATĐ')
├── TC B4/                      # Ứng dụng 1 (Độc lập)
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js                   # Service Worker (quiz-tc-b4-v9)
│   ├── truong ca bac 4.xlsx    # File nguồn cập nhật (427 câu, sheet 'TC B4')
│   ├── package.json & capacitor.config.json (com.bhpp.quiztest2026.tcb4)
│   ├── icons/                  # apple-touch-icon.png, icon-192.png, icon-512.png
│   ├── data/                   # questions.json, questions.js (427 câu), extra-decks.js
│   ├── scripts/build_data.py
│   └── src/                    # app.js, db.js, excel-parser.js, quiz-engine.js, styles.css
├── bhpp-2026/                  # Ứng dụng 2 (Độc lập)
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js                   # Service Worker (quiz-bhpp-2026-v9)
│   ├── tai lieu thi trac nghiem BHPP 2026.xlsx  # File nguồn cập nhật (19 sheet / 5.188 câu)
│   ├── package.json & capacitor.config.json (com.bhpp.quiztest2026.bhpp)
│   ├── icons/                  # apple-touch-icon.png, icon-192.png, icon-512.png
│   ├── data/                   # bhpp-2026.json, bhpp-2026.js (21 bộ đề / 5.673 câu)
│   ├── scripts/build_bhpp_data.py
│   └── src/                    # app.js, db.js, excel-parser.js, quiz-engine.js, styles.css
└── downloads/                  # Thành phẩm cài đặt cho người dùng cuối
    ├── android/
    │   ├── TC B4.apk
    │   └── bhpp-2026.apk
    └── iOS/
        ├── TC B4.url
        ├── bhpp-2026.url
        └── HUONG-DAN-CAI-TREN-IPHONE.txt
```

---

## 4. Kế hoạch triển khai & Trạng thái hoàn thành (Checklist)
- [x] **Task 1: Xây dựng bộ trích xuất dữ liệu & ứng dụng App 1 (`TC B4`)**
  - *Đầu vào:* Sheet `"trac nghiem"` (403 câu / 12 chuyên đề).
  - *Tiêu chí hoàn thành:* Đã xuất `questions.json`/`.js`, hoàn thiện giao diện PC & Smartphone, IndexedDB, Import Excel/JSON.
- [x] **Task 2: Cấu hình tổng số câu & phân bổ theo tỷ lệ (%) từng chương**
  - *Đầu vào:* Ngân hàng câu hỏi & cài đặt người dùng.
  - *Tiêu chí hoàn thành:* Hỗ trợ nhập số câu tùy ý, chế độ `Ngẫu nhiên đều` / `Theo tỷ lệ (%)` (thuật toán Hamilton `computeRatioCounts`, nút `Tỷ lệ thực tế` & `Chia đều`).
- [x] **Task 3: Xây dựng ứng dụng song song App 2 (`bhpp-2026`) từ 19 sheet Excel**
  - *Đầu vào:* `tai lieu thi trac nghiem BHPP 2026.xlsx` (19 bộ đề, 4.791 câu).
  - *Tiêu chí hoàn thành:* Tách thành 2 thư mục độc lập `TC B4/` và `bhpp-2026/`, chọn bộ đề qua `#deck-select`.
- [x] **Task 4: Đóng gói Android `.apk` (Capacitor + GitHub Actions) & PWA Offline cho iOS/Web**
  - *Đầu vào:* Mã nguồn 2 ứng dụng.
  - *Tiêu chí hoàn thành:* Build thành công 2 file `.apk` độc lập trên GitHub Actions, triển khai 2 link GitHub Pages riêng biệt (`TC%20B4/` và `bhpp-2026/`) kèm icon & `sw.js`.
- [x] **Task 5: Sửa lỗi thứ tự chuyên đề (`I → II → ...`) & bảo toàn đáp án tham chiếu chéo (`@FIXED`)**
  - *Đầu vào:* Phản hồi thực tế khi thi thử trên Android.
  - *Tiêu chí hoàn thành:* Giữ đúng thứ tự chuyên đề khi tạo đề; dùng 1-pass regex `COMBINED_REF_RE` ánh xạ chữ cái tham chiếu (sửa triệt để lỗi `Phương án D và D`) và giữ phương án tổng hợp ở cuối.
- [x] **Task 6: Tích hợp thêm 2 bộ đề (An toàn 472 câu & Văn hóa Doanh nghiệp 28 câu) + Hỗ trợ nhiều đáp án**
  - *Đầu vào:* Dữ liệu bộ đề An toàn & Văn hóa Doanh nghiệp.
  - *Tiêu chí hoàn thành:* Nâng cấp `quiz-engine.js` và UI cho câu hỏi nhiều đáp án (`A–L`), cập nhật vào cả App 1 (3 bộ đề) và App 2 (21 bộ đề), tách riêng hoàn toàn 2 link Web/iOS (`TC%20B4/` và `bhpp-2026/`).
- [x] **Task 7: Căn giữa nút "Nộp bài" trên giao diện làm bài Desktop**
  - *Đầu vào:* `TC B4/index.html` và `bhpp-2026/index.html`.
  - *Tiêu chí hoàn thành:* Đặt nút `Nộp bài` vào chính giữa giữa `← Câu trước` và `Câu tiếp →`.
- [x] **Task 8: Cập nhật lại nội dung 2 file Excel mới (`truong ca bac 4.xlsx` & `tai lieu thi trac nghiem BHPP 2026.xlsx`)**
  - *Đầu vào:* 2 file Excel cập nhật (giữ nguyên Bộ đề An toàn & Văn hóa Doanh nghiệp).
  - *Tiêu chí hoàn thành:* `TC B4` cập nhật lên 427 câu/12 chuyên đề; `BHPP 2026` cập nhật 19 bộ đề lên 5.188 câu (0 cảnh báo); đẩy GitHub (`30aeba1`), build thành công (`45552772005`).
- [x] **Task 9: Cập nhật riêng Bộ đề An toàn từ `ATĐ_2026.xlsx`**
  - *Đầu vào:* `ATĐ_2026.xlsx` (sheet `ATĐ`, 457 câu: Phần I 398 câu + Phần II 59 câu, 0 cảnh báo).
  - *Tiêu chí hoàn thành:* Chỉ cập nhật `AN TOAN` trong `TC B4/data/extra-decks.js` và `bhpp-2026/data/bhpp-2026.json`/`.js` (tổng 21 bộ đề / 5.673 câu), nâng `sw.js` lên `v8`, đẩy GitHub (`83e9c0c`), build thành công (`45928050993`) và tải 2 file `.apk` mới về `downloads/android/`.
- [x] **Task 10: Lưu và tiếp tục phiên Ôn tập dở dang (Auto-save & Resume) trên cả 2 ứng dụng**
  - *Đầu vào:* `TC B4/` và `bhpp-2026/` (`index.html`, `src/db.js`, `src/quiz-engine.js`, `src/app.js`, `sw.js`).
  - *Hành động:* Nâng IndexedDB lên `v2` thêm store `practice_sessions` (lưu riêng theo từng Bộ đề + Chuyên đề & hỗ trợ cả 3 chế độ ôn tập: `practice`, `wrong_review`, `bookmark_review`); tự động lưu sau mỗi thao tác và khi bấm `← Thoát` (về thẳng Trang chủ không cần hộp thoại xác nhận); hiển thị khung **"Đang ôn tập dở"** trên Trang chủ, nhãn tiến độ trên từng chuyên đề và hộp thoại chọn **Tiếp tục các câu còn lại** / **Ôn lại từ đầu** (giữ nguyên toàn bộ câu trong phiên và nhảy thẳng tới câu chưa làm đầu tiên); tích hợp vào Export/Import JSON và nâng `sw.js` lên `v9`.
  - *Tiêu chí hoàn thành:* Thoát hoặc tải lại ứng dụng giữa chừng ở cả 3 chế độ ôn tập đều giữ nguyên tiến độ, khôi phục đúng thứ tự câu hỏi/đáp án và nhảy tới câu chưa làm đầu tiên; không ảnh hưởng chế độ Thi thử và không chạm vào logic đã khóa `@FIXED`.

---

## 5. Rủi ro & Cách phòng tránh
1. **Gộp nhầm 2 ứng dụng thành 1 link hoặc 1 app chung:**
   - *Phòng tránh:* Đã khóa quy tắc kiến trúc trong `GEMINI.md`, xóa `index.html` cổng chung ở thư mục gốc, giữ 2 thư mục và 2 `appId` tách biệt.
2. **Mất nghĩa khi đảo đáp án tham chiếu chéo hoặc thay đổi thứ tự chuyên đề:**
   - *Phòng tránh:* Đã khóa logic `sectionOrderMap`, `isAggregateOption`, và 1-pass `COMBINED_REF_RE` bằng `@FIXED` trong cả 2 file `quiz-engine.js` và ghi vào `GEMINI.md`.
3. **Thiết bị iOS/Android giữ cache cũ sau khi cập nhật đề hoặc sửa lỗi:**
   - *Phòng tránh:* Tăng phiên bản `CACHE_NAME` trong `sw.js` (hiện tại `v9`) mỗi lần phát hành bản mới, và tải lại 2 file `.apk` mới nhất từ GitHub Actions vào `downloads/android/`.
4. **Mất dữ liệu ôn tập khi đổi thiết bị hoặc xóa trình duyệt:**
   - *Phòng tránh:* Lưu trữ chính trong IndexedDB kết hợp tính năng **Xuất/Nhập sao lưu JSON** ngay trong màn hình *Lịch sử*.
