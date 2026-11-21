/**
 * Bộ phân tích file Excel nhiều sheet (BHPP 2026) phía trình duyệt dùng SheetJS.
 * Mỗi sheet tương ứng 1 bộ đề thi trong danh sách.
 */
(function (global) {
  "use strict";

  const GROUP_RULES = [
    ["TC", "Trưởng Ca"],
    ["DHV", "Điều Hành Viên"],
    ["SC CO", "Sửa Chữa Cơ"],
    ["SC DIEN", "Sửa Chữa Điện"],
  ];

  function cleanText(val) {
    if (val === null || val === undefined) return "";
    return String(val)
      .replace(/\r?\n+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function normalizeDaMarker(val) {
    const cleaned = cleanText(val)
      .toUpperCase()
      .replace(/[^A-ZĐ]/g, "");
    return cleaned === "ĐA" || cleaned === "DA" || cleaned === "X";
  }

  function detectGroup(sheetName) {
    const upper = sheetName.trim().toUpperCase();
    for (const [prefix, label] of GROUP_RULES) {
      if (upper.startsWith(prefix)) return label;
    }
    return "Khác";
  }

  function findNextNonEmptyCol1(rows, startIdx) {
    for (let i = startIdx; i < Math.min(startIdx + 4, rows.length); i++) {
      const r = rows[i] || [];
      const c1 = cleanText(r[0]);
      const c2 = cleanText(r[1]);
      if (c1 || c2) return c1.toUpperCase();
    }
    return "";
  }

  function parseSheetRows(rows, sheetName) {
    let startIdx = 4;
    const titleLines = [];
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const c1 = cleanText(rows[i] && rows[i][0]).toUpperCase();
      const c2 = cleanText(rows[i] && rows[i][1]);
      if (c1 === "CÂU HỎI" || c1 === "CAU HOI") {
        startIdx = i + 1;
        break;
      }
      if (c2) titleLines.push(c2);
    }

    const orgTitle = titleLines[0] || "NHÀ MÁY THỦY ĐIỆN BẮC BÌNH";
    const roleTitle = titleLines.length >= 2 ? titleLines.slice(1).join(" - ") : sheetName;

    const sections = [];
    const questions = [];
    const warnings = [];
    let currentSection = null;
    let currentQuestion = null;
    let autoQNum = 0;

    function finalizeQuestion(q) {
      if (!q) return;
      const correctIndices = [];
      q.options.forEach((opt, idx) => {
        if (opt.isCorrect) correctIndices.push(idx);
      });
      if (q.options.length < 2) {
        warnings.push(`[${sheetName}] Dòng ${q.sourceRow} (Câu ${q.number}): ít hơn 2 đáp án.`);
      }
      if (correctIndices.length !== 1) {
        warnings.push(`[${sheetName}] Dòng ${q.sourceRow} (Câu ${q.number}): có ${correctIndices.length} đáp án ĐA.`);
      }
      q.correctIndex = correctIndices.length > 0 ? correctIndices[0] : 0;
      q.options = q.options.map((o) => ({ label: o.label, text: o.text }));
      questions.push(q);
    }

    for (let r = startIdx; r < rows.length; r++) {
      const row = rows[r] || [];
      const col1 = cleanText(row[0]);
      const col2 = cleanText(row[1]);
      const isDa = normalizeDaMarker(row[2]);

      if (!col1 && !col2) continue;

      if (/^[A-F]$/i.test(col1) && currentQuestion !== null) {
        currentQuestion.options.push({
          label: col1.toUpperCase(),
          text: col2,
          isCorrect: isDa,
        });
        continue;
      }

      const isBlankQuestion =
        !col1 && Boolean(col2) && findNextNonEmptyCol1(rows, r + 1) === "A";

      if (/^\d+$/.test(col1) || isBlankQuestion) {
        finalizeQuestion(currentQuestion);
        if (!currentSection) {
          currentSection = { id: "I", title: "Phần chung", questionCount: 0 };
          sections.push(currentSection);
        }
        autoQNum = /^\d+$/.test(col1) ? parseInt(col1, 10) : autoQNum + 1;
        currentSection.questionCount += 1;
        currentQuestion = {
          id: `${sheetName}__${currentSection.id}-${autoQNum}-${questions.length + 1}`,
          number: autoQNum,
          sectionId: currentSection.id,
          sectionTitle: currentSection.title,
          text: col2,
          options: [],
          correctIndex: 0,
          sourceRow: r + 1,
        };
        continue;
      }

      if (col1) {
        finalizeQuestion(currentQuestion);
        currentQuestion = null;
        autoQNum = 0;
        currentSection = {
          id: col1,
          title: col2 || `Chuyên đề ${col1}`,
          questionCount: 0,
        };
        sections.push(currentSection);
      }
    }

    finalizeQuestion(currentQuestion);

    return {
      id: sheetName,
      name: sheetName,
      group: detectGroup(sheetName),
      title: roleTitle,
      organization: orgTitle,
      totalSections: sections.length,
      totalQuestions: questions.length,
      sections,
      questions,
      warnings,
    };
  }

  async function parseMultiSheetExcel(file) {
    if (!file) throw new Error("Chưa chọn file nào.");
    if (typeof global.XLSX === "undefined") {
      throw new Error("Thư viện SheetJS chưa sẵn sàng. Vui lòng kiểm tra kết nối mạng.");
    }

    const buffer = await file.arrayBuffer();
    const workbook = global.XLSX.read(buffer, { type: "array" });
    const decks = [];
    let totalQuestions = 0;
    const allWarnings = [];

    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      const rows = global.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const deck = parseSheetRows(rows, sheetName);
      if (deck.totalQuestions > 0) {
        decks.push(deck);
        totalQuestions += deck.totalQuestions;
        allWarnings.push(...deck.warnings);
      }
    }

    if (decks.length === 0) {
      throw new Error("Không tìm thấy bộ đề hợp lệ nào trong file Excel.");
    }

    return {
      meta: {
        title: "NGÂN HÀNG ĐỀ THI TRẮC NGHIỆM BHPP 2026",
        sourceFile: file.name,
        totalDecks: decks.length,
        totalQuestions,
        generatedAt: new Date().toISOString(),
      },
      decks,
      warnings: allWarnings,
    };
  }

  global.BhppExcelParser = {
    parseMultiSheetExcel,
  };
})(window);
