/**
 * Bộ máy xử lý bài thi: trộn câu hỏi/đáp án (Fisher-Yates),
 * quản lý đồng hồ đếm ngược an toàn và chấm điểm chi tiết theo chuyên đề.
 */
(function (global) {
  "use strict";

  const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];
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

  function prepareQuestion(rawQ, shuffleOptions) {
    const indexedOpts = rawQ.options.map((opt, idx) => ({
      text: opt.text,
      isCorrect: idx === rawQ.correctIndex,
    }));

    const finalOpts = shuffleOptions ? shuffleArray(indexedOpts) : indexedOpts;
    let newCorrectIndex = 0;

    const options = finalOpts.map((opt, idx) => {
      if (opt.isCorrect) newCorrectIndex = idx;
      return {
        label: OPTION_LABELS[idx] || String(idx + 1),
        text: opt.text,
      };
    });

    return {
      id: rawQ.id,
      number: rawQ.number,
      sectionId: rawQ.sectionId,
      sectionTitle: rawQ.sectionTitle,
      text: rawQ.text,
      options,
      correctIndex: newCorrectIndex,
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

    if (
      !(filterIds instanceof Set) &&
      allocationMode === "ratio" &&
      sectionRatios &&
      Array.isArray(selectedSectionIds) &&
      selectedSectionIds.length > 0
    ) {
      const secPools = new Map();
      selectedSectionIds.forEach((id) => secPools.set(id, []));
      pool.forEach((q) => {
        if (secPools.has(q.sectionId)) secPools.get(q.sectionId).push(q);
      });

      const countsMap = computeRatioCounts(secPools, selectedSectionIds, questionLimit, sectionRatios);
      let sampled = [];
      for (const secId of selectedSectionIds) {
        const secQuestions = secPools.get(secId) || [];
        const take = countsMap.get(secId) || 0;
        if (take <= 0) continue;
        const picked = (shuffleQuestions ? shuffleArray(secQuestions) : secQuestions).slice(0, take);
        sampled = sampled.concat(picked);
      }
      pool = shuffleQuestions ? shuffleArray(sampled) : sampled;
    } else {
      if (shuffleQuestions) {
        pool = shuffleArray(pool);
      }

      if (questionLimit > 0 && questionLimit < pool.length) {
        pool = pool.slice(0, questionLimit);
      }
    }

    const preparedQuestions = pool.map((q) => prepareQuestion(q, shuffleOptions));
    const durationSec = durationMinutes > 0 ? Math.round(durationMinutes * 60) : 0;

    return {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      mode,
      title,
      questions: preparedQuestions,
      answers: new Array(preparedQuestions.length).fill(null),
      flagged: new Array(preparedQuestions.length).fill(false),
      currentIndex: 0,
      durationSec,
      remainingSec: durationSec,
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
      const isAnswered = userAnswer !== null && userAnswer !== undefined;
      const isCorrect = isAnswered && userAnswer === q.correctIndex;

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
        : Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));

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
