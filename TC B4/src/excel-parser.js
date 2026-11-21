/**
 * Bộ phân tích file Excel (.xlsx/.xls) phía trình duyệt dùng SheetJS (XLSX).
 * Hỗ trợ cập nhật toàn bộ ngân hàng đề trực tiếp trên cả PC và Smartphone.
 */
(function (global) {
  "use strict";

  const TARGET_SHEET = "trac nghiem";

  function cleanText(val) {
    if (val === null || val === undefined) return "";
    return String(val)
      .replace(/\r?\n+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function findTargetSheetName(sheetNames) {
    if (!Array.isArray(sheetNames) || sheetNames.length === 0) {
      throw new Error("File Excel không có sheet nào.");
    }
    const exact = sheetNames.find((n) => n.trim().toLowerCase() === TARGET_SHEET);
    if (exact) return { sheetName: exact, matchedExact: true };
    return { sheetName: sheetNames[0], matchedExact: false };
  }

  function parseRows(rows, metaInfo) {
    const sections = [];
    const questions = [];
    const warnings = [];

    // Tìm dòng tiêu đề cột ("CÂU HỎI") nếu có, mặc định bắt đầu từ dòng 4 (index 3)
    let startIdx = 3;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const c1 = cleanText(rows[i] && rows[i][0]).toUpperCase();
      if (c1 === "CÂU HỎI" || c1 === "CAU HOI") {
        startIdx = i + 1;
        break;
      }
    }

    const orgTitle =
      cleanText(rows[0] && rows[0][1]) || "NHÀ MÁY THỦY ĐIỆN BẮC BÌNH";
    const examTitle =
      cleanText(rows[1] && rows[1][1]) || "ĐỐI TƯỢNG THI: TRƯỞNG CA BẬC 4";

    let currentSection = null;
    let currentQuestion = null;

    function finalizeQuestion(q) {
      if (!q) return;
      const correctIndices = [];
      q.options.forEach((opt, idx) => {
        if (opt.isCorrect) correctIndices.push(idx);
      });

      if (q.options.length < 2) {
        warnings.push(
          `Dòng ${q.sourceRow} (Câu ${q.number}): chỉ có ${q.options.length} phương án.`
        );
      }
      if (correctIndices.length !== 1) {
        warnings.push(
          `Dòng ${q.sourceRow} (Câu ${q.number}): có ${correctIndices.length} đáp án được đánh dấu ĐA.`
        );
      }

      q.correctIndex = correctIndices.length > 0 ? correctIndices[0] : 0;
      q.options = q.options.map((opt) => ({
        label: opt.label,
        text: opt.text,
      }));
      questions.push(q);
    }

    for (let r = startIdx; r < rows.length; r++) {
      const row = rows[r] || [];
      const col1 = cleanText(row[0]);
      const col2 = cleanText(row[1]);
      const col3 = cleanText(row[2]).toUpperCase();

      if (!col1 && !col2) continue;

      // Phương án A, B, C, D...
      if (/^[A-F]$/i.test(col1) && currentQuestion !== null) {
        const isCorrect = col3 === "ĐA" || col3 === "DA" || col3 === "X";
        currentQuestion.options.push({
          label: col1.toUpperCase(),
          text: col2,
          isCorrect,
        });
        continue;
      }

      // Số thứ tự câu hỏi
      if (/^\d+$/.test(col1)) {
        finalizeQuestion(currentQuestion);
        if (!currentSection) {
          currentSection = { id: "I", title: "Phần chung", questionCount: 0 };
          sections.push(currentSection);
        }
        const qNum = parseInt(col1, 10);
        currentSection.questionCount += 1;
        currentQuestion = {
          id: `${currentSection.id}-${qNum}-${questions.length + 1}`,
          number: qNum,
          sectionId: currentSection.id,
          sectionTitle: currentSection.title,
          text: col2,
          options: [],
          correctIndex: 0,
          sourceRow: r + 1,
        };
        continue;
      }

      // Tiêu đề chuyên đề mới
      if (col1) {
        finalizeQuestion(currentQuestion);
        currentQuestion = null;
        currentSection = {
          id: col1,
          title: col2 || `Chuyên đề ${col1}`,
          questionCount: 0,
        };
        sections.push(currentSection);
      }
    }

    finalizeQuestion(currentQuestion);

    if (questions.length === 0) {
      throw new Error(
        "Không tìm thấy câu hỏi hợp lệ nào. Hãy kiểm tra đúng cấu trúc cột: [CÂU HỎI | NỘI DUNG | ĐÁP ÁN]."
      );
    }

    return {
      meta: {
        organization: orgTitle,
        title: examTitle,
        sourceFile: metaInfo.fileName || "imported.xlsx",
        sheetName: metaInfo.sheetName,
        totalSections: sections.length,
        totalQuestions: questions.length,
        generatedAt: new Date().toISOString(),
      },
      sections,
      questions,
      warnings,
    };
  }

  async function parseExcelFile(file) {
    if (!file) throw new Error("Chưa chọn file nào.");
    if (typeof global.XLSX === "undefined") {
      throw new Error(
        "Thư viện đọc Excel (SheetJS) chưa sẵn sàng. Vui lòng kiểm tra kết nối mạng hoặc tải lại trang."
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = global.XLSX.read(buffer, { type: "array" });
    const { sheetName, matchedExact } = findTargetSheetName(workbook.SheetNames);
    const worksheet = workbook.Sheets[sheetName];
    const rows = global.XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
    });

    const parsed = parseRows(rows, {
      fileName: file.name,
      sheetName,
    });

    if (!matchedExact) {
      parsed.warnings.unshift(
        `Không thấy sheet "${TARGET_SHEET}", hệ thống đã tự động đọc sheet "${sheetName}".`
      );
    }

    return parsed;
  }

  global.ExcelQuizParser = {
    parseExcelFile,
  };
})(window);
