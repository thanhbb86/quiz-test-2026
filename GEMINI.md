# WORKSPACE RULES — QUIZ TEST 2026

## DANH SÁCH LỖI ĐÃ KHÓA
- **[2026-11-22] Lỗi mất nghĩa đáp án tham chiếu chéo ("Phương án A và C đúng", "Tất cả đều đúng") khi đảo đáp án (`TC B4/src/quiz-engine.js`, `bhpp-2026/src/quiz-engine.js`):**
  - *Nguyên nhân:* `prepareQuestion` xáo trộn toàn bộ mảng `options` nhưng giữ nguyên chữ cái tham chiếu trong văn bản đáp án (`Phương án A và C đúng`), hoặc đưa `"Tất cả đều đúng"` lên đầu.
  - *Cách khắc phục:* Ánh xạ lại chữ cái tham chiếu theo `labelMap` (`origLabel -> newLabel`) qua `remapOptionReferences`, giữ cố định phương án tổng hợp (`isAggregateOption`) ở cuối, và giữ nguyên thứ tự gốc nếu gặp tham chiếu vị trí tương đối (`phương án trên/dưới`). Đã khóa logic bằng `@FIXED`.
- **[2026-11-21] Lỗi xáo trộn lộn xộn các chuyên đề trong đề thi (`TC B4/src/quiz-engine.js`, `bhpp-2026/src/quiz-engine.js`):**
  - *Nguyên nhân:* Hàm `createSession` đã gọi `shuffleArray(sampled)` trên toàn bộ đề sau khi lấy câu hỏi từ các chuyên đề, làm thứ tự chuyên đề bị đảo lộn (`XII`, `I`, `IX`...).
  - *Cách khắc phục:* Giữ nguyên thứ tự chuyên đề (`I` → `II` → `III`...) bằng `sectionOrderMap` ở cả chế độ `ratio` và `random`, chỉ xáo trộn câu hỏi bên trong từng chuyên đề. Đã khóa logic bằng `@FIXED`.
