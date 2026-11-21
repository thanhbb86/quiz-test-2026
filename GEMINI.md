# WORKSPACE RULES — QUIZ TEST 2026

## DANH SÁCH LỖI ĐÃ KHÓA
- **[2026-11-21] Lỗi xáo trộn lộn xộn các chuyên đề trong đề thi (`TC B4/src/quiz-engine.js`, `bhpp-2026/src/quiz-engine.js`):**
  - *Nguyên nhân:* Hàm `createSession` đã gọi `shuffleArray(sampled)` trên toàn bộ đề sau khi lấy câu hỏi từ các chuyên đề, làm thứ tự chuyên đề bị đảo lộn (`XII`, `I`, `IX`...).
  - *Cách khắc phục:* Giữ nguyên thứ tự chuyên đề (`I` → `II` → `III`...) bằng `sectionOrderMap` ở cả chế độ `ratio` và `random`, chỉ xáo trộn câu hỏi bên trong từng chuyên đề. Đã khóa logic bằng `@FIXED`.
