/**
 * Bộ máy xử lý bài thi: trộn câu hỏi/đáp án (Fisher-Yates),
 * quản lý đồng hồ đếm ngược an toàn và chấm điểm chi tiết theo chuyên đề.
 */
(function (global) {
  "use strict";

  const OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  let activeTimerId = null;

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  // @FIXED: Bảo toàn nghĩa các đáp án tổng hợp ("Tất cả đều đúng/sai") và ánh xạ lại chữ cái tham chiếu ("Phương án A và C đúng") khi đảo đáp án - Không được xóa logic này
  const AGGREGATE_OPT_RE =
    /^(tất cả(\s+các\s+(phương án|câu|ý))?\s*(đều)?\s*(đúng|sai)|tất cả các cấp|cả\s+\d+\s+(phương án|câu|ý)|các\s+(phương án|câu|ý)\s+trên|cả\s+(hai|ba|bốn)\s+(phương án|câu|ý)|không có phương án nào)/i;
  const RELATIVE_POS_RE = /\b(phương án|câu|ý)\s+(trên|dưới)\b/i;
  // Dùng 1 regex duy nhất để ánh xạ trong 1 lượt, tránh lỗi ánh xạ 2 lần (ví dụ "Phương án A và B" -> "B và D" -> "D và D")
  const COMBINED_REF_RE =
    /\b(?:(phương án|đáp án)\s+([A-F](?:\s*(?:,|và|&|\/|\+)\s*[A-F])*)|(câu|ý|cả)\s+([A-F](?:\s*(?:,|và|&|\/|\+)\s*[A-F])+))(?![A-Za-zÀ-ỹ0-9])/gi;

  function isAggregateOption(text) {
    return AGGREGATE_OPT_RE.test(String(text || "").trim());
  }

  function remapOptionReferences(text, labelMap) {
    return String(text || "").replace(COMBINED_REF_RE, (full, p1, g1, p2, g2) => {
      const prefix = p1 || p2;
      const group = g1 || g2;
      const letters = group.match(/[A-F]/gi);
      if (!letters || letters.length === 0) return full;

      const mapped = letters
        .map((ch) => labelMap[ch.toUpperCase()] || ch.toUpperCase())
        .sort((a, b) => OPTION_LABELS.indexOf(a) - OPTION_LABELS.indexOf(b));

      if (mapped.length === 1) {
        return `${prefix} ${mapped[0]}`;
      }
      if (mapped.length === 2) {
        return `${prefix} ${mapped[0]} và ${mapped[1]}`;
      }
      const last = mapped.pop();
      return `${prefix} ${mapped.join(", ")} và ${last}`;
    });
  }

  function prepareQuestion(rawQ, shuffleOptions) {
    const rawCorrectSet = new Set(
      Array.isArray(rawQ.correctIndices) && rawQ.correctIndices.length > 0
        ? rawQ.correctIndices
        : [rawQ.correctIndex]
    );
    const indexedOpts = rawQ.options.map((opt, idx) => ({
      origLabel: opt.label || OPTION_LABELS[idx] || String(idx + 1),
      text: opt.text,
      isCorrect: rawCorrectSet.has(idx),
      isAggregate: isAggregateOption(opt.text),
    }));

    // Nếu có phương án tham chiếu vị trí tương đối ("phương án trên/dưới"), giữ nguyên thứ tự gốc
    const hasPosRef = indexedOpts.some((o) => RELATIVE_POS_RE.test(o.text));
    let finalOpts;

    if (!shuffleOptions || hasPosRef) {
      finalOpts = indexedOpts;
    } else {
      const normalOpts = indexedOpts.filter((o) => !o.isAggregate);
      const aggregateOpts = indexedOpts.filter((o) => o.isAggregate);
      finalOpts = shuffleArray(normalOpts).concat(aggregateOpts);
    }

    const labelMap = {};
    finalOpts.forEach((opt, idx) => {
      labelMap[opt.origLabel] = OPTION_LABELS[idx] || String(idx + 1);
    });

    const newCorrectIndices = [];
    const options = finalOpts.map((opt, idx) => {
      if (opt.isCorrect) newCorrectIndices.push(idx);
      const newLabel = OPTION_LABELS[idx] || String(idx + 1);
      const finalText =
        shuffleOptions && !hasPosRef ? remapOptionReferences(opt.text, labelMap) : opt.text;
      return {
        label: newLabel,
        text: finalText,
      };
    });

    return {
      id: rawQ.id,
      number: rawQ.number,
      sectionId: rawQ.sectionId,
      sectionTitle: rawQ.sectionTitle,
      text: rawQ.text,
      options,
      correctIndex: newCorrectIndices[0] ?? 0,
      correctIndices: newCorrectIndices,
      isMulti: newCorrectIndices.length > 1,
    };
  }

  /**
   * Phân bổ số câu hỏi theo tỷ lệ % từng chương (phương pháp Hamilton / Largest Remainder),
   * đảm bảo không vượt quá số câu thực có của mỗi chương.
   */
  function computeRatioCounts(sectionPoolsMap, selectedSectionIds, totalTarget, sectionRatios) {
    const items = selectedSectionIds.map((secId) => {
      const available = (sectionPoolsMap.get(secId) || []).length;
      const rawWeight = Math.max(0, Number(sectionRatios?.[secId]) || 0);
      return { secId, available, weight: rawWeight, count: 0, remainder: 0 };
    });

    const totalAvailable = items.reduce((sum, it) => sum + it.available, 0);
    const target = totalTarget > 0 ? Math.min(totalTarget, totalAvailable) : totalAvailable;
    const totalWeight = items.reduce((sum, it) => sum + it.weight, 0);

    if (target <= 0 || totalAvailable <= 0) {
      return new Map(items.map((it) => [it.secId, 0]));
    }

    // Nếu tổng tỷ lệ = 0, chia đều theo số câu thực có
    const effectiveTotalWeight = totalWeight > 0 ? totalWeight : totalAvailable;

    let allocated = 0;
    items.forEach((it) => {
      const w = totalWeight > 0 ? it.weight : it.available;
      const exact = (target * w) / effectiveTotalWeight;
      const floored = Math.min(it.available, Math.floor(exact));
      it.count = floored;
      it.remainder = it.count < it.available ? exact - floored : -1;
      allocated += floored;
    });

    // Phân bổ phần dư theo số thập phân lớn nhất
    let remaining = target - allocated;
    while (remaining > 0) {
      const candidates = items
        .filter((it) => it.count < it.available && (totalWeight === 0 || it.weight > 0))
        .sort((a, b) => b.remainder - a.remainder);

      if (candidates.length === 0) break;
      for (const c of candidates) {
        if (remaining <= 0) break;
        c.count += 1;
        c.remainder = 0;
        remaining -= 1;
      }
    }

    // Nếu vẫn còn thiếu (do các chương được chọn tỷ lệ > 0 đã hết câu), bù từ chương còn câu
    if (remaining > 0) {
      for (const it of items) {
        while (remaining > 0 && it.count < it.available) {
          it.count += 1;
          remaining -= 1;
        }
      }
    }

    return new Map(items.map((it) => [it.secId, it.count]));
  }

  function createSession({
    allQuestions,
    mode = "exam",
    title = "Bài thi thử",
    selectedSectionIds = [],
    questionLimit = 0,
    shuffleQuestions = true,
    shuffleOptions = true,
    durationMinutes = 0,
    filterIds = null,
    allocationMode = "random",
    sectionRatios = null,
  }) {
    let pool = Array.isArray(allQuestions) ? allQuestions.slice() : [];

    if (filterIds instanceof Set) {
      pool = pool.filter((q) => filterIds.has(q.id));
    } else if (Array.isArray(selectedSectionIds) && selectedSectionIds.length > 0) {
      const secSet = new Set(selectedSectionIds);
      pool = pool.filter((q) => secSet.has(q.sectionId));
    }

    if (pool.length === 0) {
      throw new Error("Không có câu hỏi nào phù hợp với bộ lọc đã chọn.");
    }

    // @FIXED: Giữ đúng thứ tự chuyên đề (I -> II -> ...) khi tạo đề thi, chỉ xáo trộn câu hỏi bên trong từng chuyên đề - Không được xóa logic này
    const sectionOrderMap = new Map();
    if (Array.isArray(allQuestions)) {
      allQuestions.forEach((q) => {
        if (!sectionOrderMap.has(q.sectionId)) {
          sectionOrderMap.set(q.sectionId, sectionOrderMap.size);
        }
      });
    }

    if (
      !(filterIds instanceof Set) &&
      allocationMode === "ratio" &&
      sectionRatios &&
      Array.isArray(selectedSectionIds) &&
      selectedSectionIds.length > 0
    ) {
      const orderedSectionIds = selectedSectionIds
        .slice()
        .sort((a, b) => (sectionOrderMap.get(a) ?? 9999) - (sectionOrderMap.get(b) ?? 9999));

      const secPools = new Map();
      orderedSectionIds.forEach((id) => secPools.set(id, []));
      pool.forEach((q) => {
        if (secPools.has(q.sectionId)) secPools.get(q.sectionId).push(q);
      });

      const countsMap = computeRatioCounts(secPools, orderedSectionIds, questionLimit, sectionRatios);
      let sampled = [];
      for (const secId of orderedSectionIds) {
        const secQuestions = secPools.get(secId) || [];
        const take = countsMap.get(secId) || 0;
        if (take <= 0) continue;
        const picked = (shuffleQuestions ? shuffleArray(secQuestions) : secQuestions).slice(0, take);
        sampled = sampled.concat(picked);
      }
      pool = sampled;
    } else {
      if (shuffleQuestions) {
        pool = shuffleArray(pool);
      }

      if (questionLimit > 0 && questionLimit < pool.length) {
        pool = pool.slice(0, questionLimit);
      }

      // Sắp xếp lại các câu đã chọn theo đúng thứ tự chuyên đề I -> II -> ...
      pool.sort(
        (a, b) => (sectionOrderMap.get(a.sectionId) ?? 9999) - (sectionOrderMap.get(b.sectionId) ?? 9999)
      );
    }

    const preparedQuestions = pool.map((q) => prepareQuestion(q, shuffleOptions));
    const durationSec = durationMinutes > 0 ? Math.round(durationMinutes * 60) : 0;

    return {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      mode,
      title,
      questions: preparedQuestions,
      answers: new Array(preparedQuestions.length).fill(null),
      checked: new Array(preparedQuestions.length).fill(false),
      flagged: new Array(preparedQuestions.length).fill(false),
      currentIndex: 0,
      durationSec,
      remainingSec: durationSec,
      accumulatedSec: 0,
      startedAt: Date.now(),
      submitted: false,
    };
  }

  function stopTimer() {
    if (activeTimerId !== null) {
      clearInterval(activeTimerId);
      activeTimerId = null;
    }
  }

  function startTimer(session, onTick, onExpire) {
    stopTimer();
    if (!session || session.durationSec <= 0 || session.submitted) return;

    activeTimerId = setInterval(() => {
      if (session.submitted) {
        stopTimer();
        return;
      }
      session.remainingSec = Math.max(0, session.remainingSec - 1);
      if (typeof onTick === "function") {
        onTick(session.remainingSec);
      }
      if (session.remainingSec <= 0) {
        stopTimer();
        if (typeof onExpire === "function") {
          onExpire();
        }
      }
    }, 1000);
  }

  function gradeSession(session) {
    stopTimer();
    session.submitted = true;

    const totalQuestions = session.questions.length;
    let correctCount = 0;
    let answeredCount = 0;
    const sectionMap = new Map();
    const wrongQuestionIds = [];
    const details = [];

    session.questions.forEach((q, idx) => {
      const userAnswer = session.answers[idx];
      let isAnswered = false;
      let isCorrect = false;
      if (q.isMulti) {
        const arr = Array.isArray(userAnswer) ? userAnswer : [];
        isAnswered = arr.length > 0;
        const userSet = new Set(arr);
        isCorrect =
          isAnswered &&
          userSet.size === q.correctIndices.length &&
          q.correctIndices.every((ci) => userSet.has(ci));
      } else {
        isAnswered = userAnswer !== null && userAnswer !== undefined;
        isCorrect = isAnswered && userAnswer === q.correctIndex;
      }

      if (isAnswered) answeredCount += 1;
      if (isCorrect) {
        correctCount += 1;
      } else {
        wrongQuestionIds.push(q.id);
      }

      if (!sectionMap.has(q.sectionId)) {
        sectionMap.set(q.sectionId, {
          sectionId: q.sectionId,
          sectionTitle: q.sectionTitle,
          total: 0,
          correct: 0,
        });
      }
      const secStat = sectionMap.get(q.sectionId);
      secStat.total += 1;
      if (isCorrect) secStat.correct += 1;

      details.push({
        index: idx,
        question: q,
        userAnswer,
        isAnswered,
        isCorrect,
      });
    });

    const spentSec =
      session.durationSec > 0
        ? Math.max(0, session.durationSec - session.remainingSec)
        : Math.max(
            1,
            Math.round((session.accumulatedSec || 0) + (Date.now() - session.startedAt) / 1000)
          );

    const scorePercent =
      totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 1000) / 10 : 0;

    return {
      id: session.id,
      mode: session.mode,
      title: session.title,
      totalQuestions,
      answeredCount,
      correctCount,
      wrongCount: totalQuestions - correctCount,
      skippedCount: totalQuestions - answeredCount,
      scorePercent,
      durationSec: session.durationSec,
      spentSec,
      createdAt: new Date().toISOString(),
      sectionBreakdown: Array.from(sectionMap.values()),
      wrongQuestionIds,
      details,
    };
  }

  function formatDuration(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  global.QuizEngine = {
    computeRatioCounts,
    createSession,
    startTimer,
    stopTimer,
    gradeSession,
    formatDuration,
  };
})(window);
