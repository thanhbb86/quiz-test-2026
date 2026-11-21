# KẾ HOẠCH TRIỂN KHAI: ỨNG DỤNG THI TRẮC NGHIỆM TRƯỞNG CA BẬC 4

## 1. Mục tiêu & Phạm vi (Scope)
- **Mục đích:** Xây dựng ứng dụng thi và ôn tập trắc nghiệm trực quan, hoạt động mượt mà trên **cả máy tính (PC/Laptop) và điện thoại (Smartphone iOS/Android)** dựa trên bộ **403 câu hỏi thuộc 12 chuyên đề (I – XII)** tại sheet `"trac nghiem"` trong file `truong ca bac 4.xlsx` (Nhà máy Thủy điện Bắc Bình - Đối tượng thi: Trưởng ca bậc 4).
- **Môi trường vận hành:** Web App tĩnh chuẩn Responsive & PWA (Progressive Web App), có thể mở trực tiếp trên trình duyệt hoặc thêm ra màn hình chính điện thoại để sử dụng như app độc lập (hỗ trợ chạy offline).
- **Luồng hoạt động cốt lõi:**
  1. **Bộ đề mặc định:** Script Python (`scripts/build_data.py`) trích xuất dữ liệu từ `truong ca bac 4.xlsx` (sheet `"trac nghiem"`) thành `data/questions.json` và `data/questions.js` làm bộ đề khởi tạo sẵn.
  2. **Import & Cập nhật toàn bộ đề trực tiếp trên App:** Người dùng có thể tải lên file `.xlsx` (hoặc `.json`) bất kỳ lúc nào ngay trên máy tính hoặc smartphone. Ứng dụng tự động phân tích sheet `"trac nghiem"`, kiểm tra tính hợp lệ, hiển thị bản xem trước (số chuyên đề, số câu hỏi, cảnh báo nếu có câu thiếu đáp án) và cập nhật lại toàn bộ ngân hàng đề lưu trong trình duyệt (kèm tùy chọn khôi phục về bộ đề gốc).
  3. **Màn hình Trang chủ / Cấu hình bài thi:** Chọn chế độ **Ôn tập theo chuyên đề** (chọn 1 hoặc nhiều chuyên đề từ I–XII, xem ngay đáp án đúng/sai) hoặc **Thi thử ngẫu nhiên** (chọn số lượng câu, thời gian làm bài đếm ngược, xáo trộn câu hỏi & đáp án A/B/C/D).
  4. **Màn hình Làm bài thi:** Tối ưu cho cả chuột/phím tắt trên PC (`1-4` / `A-D`, mũi tên) và thao tác chạm trên Smartphone (nút đáp án lớn dễ bấm, thanh điều hướng cố định phía dưới, bảng câu hỏi dạng Drawer trượt gọn gàng).
  5. **Màn hình Kết quả & Ôn lại câu sai:** Chấm điểm tự động, thống kê tỷ lệ đúng theo từng chuyên đề, lọc nhanh các câu trả lời sai để ôn tập lại ngay.
  6. **Lịch sử & Sao lưu:** Lưu lịch sử các lần thi, câu đánh dấu (bookmark) và bộ đề đã import vào IndexedDB, hỗ trợ Export/Import JSON.

---

## 2. Ràng buộc kỹ thuật (Technical Constraints — Trường hợp B: Website / Web App)
- **Stack công nghệ:**
  - **Frontend:** HTML5 + Tailwind CSS + Vanilla JavaScript (ES6+), thiết kế **Mobile-First Responsive**.
  - **Đọc file Excel trên trình duyệt:** Tích hợp thư viện **SheetJS (`xlsx`)** chạy hoàn toàn phía client (không cần server backend), hỗ trợ import file `.xlsx` trên cả máy tính và điện thoại.
  - **PWA cơ bản:** `manifest.json` + meta tags hỗ trợ cài đặt ra màn hình chính (Add to Home Screen) trên Android/iOS.
  - **Data Pipeline (tạo bộ đề gốc):** Python 3 (`openpyxl`) trích xuất từ `truong ca bac 4.xlsx` với `encoding="utf-8-sig"`.
- **Lưu trữ dữ liệu trình duyệt:**
  - Sử dụng **IndexedDB** (`src/db.js`) để lưu:
    - Ngân hàng câu hỏi hiện hành (`question_bank`) sau khi người dùng Import cập nhật đề.
    - Lịch sử bài thi (`exam_history`), danh sách câu đánh dấu (`bookmarks`), thống kê câu hay sai (`wrong_stats`).
  - Chỉ sử dụng `localStorage` cho các cấu hình nhẹ (giao diện Sáng/Tối, cỡ chữ, tùy chọn xáo trộn).
  - Tích hợp tính năng **Export / Import JSON** để sao lưu và đồng bộ tiến độ/bộ đề giữa máy tính và điện thoại.
- **Giao diện & Trải nghiệm (UI/UX):**
  - Thiết kế tối giản, tương phản cao (hỗ trợ Dark Mode), tối ưu hiển thị trên mọi kích thước màn hình (`>= 360px` cho smartphone đến màn hình rộng Desktop).
  - Vùng chạm trên smartphone đạt chuẩn tối thiểu `48x48px`, tránh cuộn ngang, hỗ trợ điều chỉnh cỡ chữ.
  - Hiển thị rõ trạng thái Loading và thông báo Toast khi parse file Excel, lưu IndexedDB hoặc Export/Import JSON.
- **Bảo mật & Độ ổn định:**
  - Không hardcode bất kỳ API Key hay thông tin nhạy cảm nào trong mã nguồn Frontend.
  - Toàn bộ thao tác I/O (đọc file `.xlsx`, thao tác IndexedDB, Export/Import JSON) bọc trong `try-catch-finally`, có kiểm tra định dạng file và fallback về bộ đề mặc định nếu dữ liệu lỗi.
  - Quản lý bộ nhớ chặt chẽ: hủy `setInterval` (đồng hồ đếm ngược) và dọn dẹp `EventListener` khi thoát bài thi để tránh rò rỉ bộ nhớ trên thiết bị di động.

---

## 3. Cấu trúc thư mục & File tác động
```text
e:\app trac nghiem\
├── truong ca bac 4.xlsx        # [Hiện có] File nguồn dữ liệu gốc (chỉ đọc)
├── PLAN.md                     # [Mới] Tài liệu kế hoạch triển khai
├── index.html                  # [Mới] Giao diện chính (Responsive PC & Smartphone)
├── manifest.json               # [Mới] Cấu hình PWA (cài đặt lên màn hình chính)
├── scripts/
│   └── build_data.py           # [Mới] Script Python parse sheet "trac nghiem" -> JSON/JS gốc
├── data/
│   ├── questions.json          # [Mới] Dữ liệu 403 câu hỏi chuẩn hóa (từ build_data.py)
│   └── questions.js            # [Mới] Bản đóng gói biến JS để mở trực tiếp file:// không bị CORS
└── src/
    ├── styles.css              # [Mới] CSS tùy chỉnh (Mobile touch, drawer, dark mode)
    ├── db.js                   # [Mới] Lớp quản lý IndexedDB (lưu bộ đề, lịch sử, sao lưu JSON)
    ├── excel-parser.js         # [Mới] Bộ phân tích file .xlsx phía trình duyệt (SheetJS)
    ├── quiz-engine.js          # [Mới] Logic trộn câu hỏi/đáp án, chấm điểm, quản lý timer
    └── app.js                  # [Mới] Điều phối UI, sự kiện PC/Mobile, Import đề & Toast
```

---

## 4. Kế hoạch triển khai từng bước (Checklist)
- [x] **Task 1: Xây dựng bộ trích xuất & chuẩn hóa dữ liệu gốc (`scripts/build_data.py`)**
  - *Đầu vào:* File `truong ca bac 4.xlsx` (sheet `"trac nghiem"`).
  - *Hành động:* Đọc toàn bộ 12 chuyên đề (`I` – `XII`) và 403 câu hỏi, làm sạch khoảng trắng thừa, ánh xạ đáp án đúng dựa trên cột `ĐÁP ÁN` (`ĐA`), kiểm tra tính toàn vẹn. Xuất `data/questions.json` và `data/questions.js`.
  - *Tiêu chí hoàn thành:* Chạy script thành công không lỗi, sinh đủ 403 câu hỏi thuộc 12 chuyên đề với UTF-8 chuẩn tiếng Việt.

- [x] **Task 2: Xây dựng lớp lưu trữ IndexedDB & Sao lưu (`src/db.js`)**
  - *Đầu vào:* Schema lưu trữ `question_bank` (bộ đề tùy chỉnh), `exam_history`, `bookmarks`, `wrong_stats`.
  - *Hành động:* Viết module thao tác IndexedDB bất đồng bộ bọc `try-catch-finally`, hỗ trợ lưu/đọc/xóa bộ đề đã import, khôi phục bộ đề gốc, và Export/Import toàn bộ dữ liệu ra file `.json`.
  - *Tiêu chí hoàn thành:* Lưu và tải lại bộ đề mới từ IndexedDB ổn định; Export/Import JSON hoạt động tốt trên cả PC và trình duyệt di động.

- [x] **Task 3: Xây dựng bộ phân tích Import Excel trên trình duyệt (`src/excel-parser.js`)**
  - *Đầu vào:* File `.xlsx` do người dùng chọn từ máy tính hoặc điện thoại.
  - *Hành động:* Dùng SheetJS đọc sheet `"trac nghiem"` (hoặc tự động tìm sheet phù hợp nếu có), áp dụng đúng quy tắc nhận diện Chuyên đề (`I, II...`), Câu hỏi (`1, 2...`), Phương án (`A, B, C, D`) và Đáp án (`ĐA`). Trả về kết quả chuẩn hóa kèm báo cáo kiểm định (số chuyên đề, số câu hỏi, danh sách câu lỗi nếu có).
  - *Tiêu chí hoàn thành:* Import chính xác file `truong ca bac 4.xlsx` và các file `.xlsx` đã chỉnh sửa nội dung câu hỏi/đáp án; báo lỗi rõ ràng nếu file sai cấu trúc.

- [x] **Task 4: Xây dựng bộ máy xử lý bài thi (`src/quiz-engine.js`)**
  - *Đầu vào:* Ngân hàng câu hỏi hiện hành (từ IndexedDB nếu đã import, hoặc từ `window.QUIZ_DATA` mặc định) và cấu hình bài thi.
  - *Hành động:* Cài đặt thuật toán Fisher-Yates xáo trộn câu hỏi và phương án A/B/C/D, quản lý `Timer` (có cleanup khi thoát), chấm điểm và thống kê kết quả theo từng chuyên đề.
  - *Tiêu chí hoàn thành:* Chấm điểm chính xác 100% cả khi bật/tắt chế độ trộn; không rò rỉ timer khi thi lại nhiều lần.

- [x] **Task 5: Xây dựng giao diện Responsive PC & Smartphone + PWA (`index.html`, `manifest.json`, `src/styles.css`, `src/app.js`)**
  - *Đầu vào:* Các module `db.js`, `excel-parser.js`, `quiz-engine.js`.
  - *Hành động:* Thiết kế giao diện Mobile-First thích ứng tốt trên cả PC và Smartphone (nút bấm lớn, sticky bar điều hướng dưới cùng trên mobile, Drawer danh sách câu hỏi, màn hình **Quản lý & Import Đề** trực quan cho phép chọn file `.xlsx` hoặc `.json` để cập nhật toàn bộ đề, nút tăng/giảm cỡ chữ, Dark Mode, Toast thông báo).
  - *Tiêu chí hoàn thành:* Hiển thị đẹp, không vỡ layout trên màn hình điện thoại (360px+) và desktop; thao tác import đề, làm bài, xem kết quả mượt mà.

- [x] **Task 6: Kiểm thử toàn diện trên Desktop & Mobile Viewport**
  - *Đầu vào:* Toàn bộ ứng dụng đã hoàn thiện.
  - *Hành động:* Kiểm tra luồng Import đề từ `truong ca bac 4.xlsx`, luồng sửa câu hỏi và import lại để xác nhận cập nhật toàn bộ đề, luồng Thi thử/Ôn tập, kiểm tra giao diện trên kích thước màn hình Smartphone và Desktop, kiểm tra Console không có lỗi JS.
  - *Tiêu chí hoàn thành:* Tất cả luồng chính chạy thông suốt, không lỗi runtime, không memory leak.

- [x] **Task 7: Cấu hình tổng số câu hỏi & phân bổ theo tỷ lệ (%) từng chương**
  - *Đầu vào:* Ngân hàng câu hỏi và màn hình cấu hình Trang chủ.
  - *Hành động:* Cho phép nhập tùy ý tổng số câu trong 1 đề (kèm nút chọn nhanh `20/40/60/100/Tất cả`), bổ sung chế độ phân bổ **Theo tỷ lệ (%) từng chương** dùng thuật toán Largest Remainder (`computeRatioCounts`), hỗ trợ nút chia **Tỷ lệ thực tế** và **Chia đều**.
  - *Tiêu chí hoàn thành:* Tính đúng số câu từng chương theo tỷ lệ cấu hình, lưu cấu hình vào `localStorage`, và tạo đề thi đúng số lượng câu đã đặt.

---

## 5. Rủi ro & Cách phòng tránh
1. **Thay đổi cấu trúc file Excel khi người dùng tự sửa đề (thêm dòng trống, đổi tên sheet, thiếu chữ `ĐA`):**
   - *Phòng tránh:* Bộ `excel-parser.js` kiểm tra chặt chẽ từng câu hỏi khi parse, hiển thị bảng **Xem trước & Cảnh báo** trước khi lưu đè bộ đề cũ; nếu file lỗi hoàn toàn thì giữ nguyên bộ đề hiện tại, không làm mất dữ liệu đang dùng.
2. **Mất mạng hoặc mở trực tiếp `index.html` trên điện thoại/máy tính (`file://`) bị lỗi CORS hoặc thiếu thư viện CDN:**
   - *Phòng tránh:* Đóng gói bộ đề gốc vào `data/questions.js` (`window.QUIZ_DATA`) để chạy không cần server; thông báo rõ nếu thiếu mạng khi tải thư viện ngoài (hoặc tải sẵn file JS cần thiết vào thư mục dự án nếu cần chạy 100% offline).
3. **Trải nghiệm chật chội trên màn hình Smartphone nhỏ:**
   - *Phòng tránh:* Áp dụng thiết kế Mobile-First, ẩn bảng số câu hỏi vào Drawer trượt trên màn hình nhỏ, đặt nút Trước/Sau/Nộp bài ở thanh cố định dưới màn hình và nút đáp án full-width dễ chạm.
4. **Rò rỉ bộ nhớ do Timer hoặc EventListener tích tụ sau nhiều lượt thi:**
   - *Phòng tránh:* Tập trung quản lý `timerId` trong `QuizEngine`, luôn gọi `clearInterval` khi nộp bài hoặc thoát màn hình thi.
