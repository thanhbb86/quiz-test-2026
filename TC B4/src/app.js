/**
 * Điều phối giao diện, sự kiện người dùng (PC & Smartphone),
 * Import đề, Lịch sử & Sao lưu dữ liệu.
 */
(function (global) {
  "use strict";

  const state = {
    decks: [],
    activeDeckId: "TC B4",
    bank: null,
    isCustomBank: false,
    bankUpdatedAt: null,
    settings: null,
    selectedMode: "exam",
    allocationMode: "ratio",
    sectionRatios: {},
    selectedSections: new Set(),
    bookmarks: new Set(),
    wrongStats: new Map(),
    practiceSessions: new Map(),
    activePracticeKey: null,
    activePracticeLabel: "",
    activePracticeSectionIds: [],
    pendingResumePrompt: null,
    session: null,
    lastResult: null,
    lastConfig: null,
    pendingImportData: null,
    resultFilter: "all",
  };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showLoading(text = "Đang xử lý...") {
    $("loading-text").textContent = text;
    $("loading-overlay").classList.remove("hidden");
  }

  function hideLoading() {
    $("loading-overlay").classList.add("hidden");
  }

  function showToast(message, type = "info") {
    const container = $("toast-container");
    const toast = document.createElement("div");
    const colors = {
      info: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
      success: "bg-emerald-600 text-white",
      warning: "bg-amber-500 text-white",
      error: "bg-rose-600 text-white",
    };
    toast.className = `toast-enter pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${colors[type] || colors.info}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.2s ease";
      setTimeout(() => toast.remove(), 220);
    }, 3200);
  }

  // --- Áp dụng cài đặt giao diện ---
  function applySettings() {
    const { darkMode, fontSize, shuffleQuestions, shuffleOptions } = state.settings;
    document.documentElement.classList.toggle("dark", Boolean(darkMode));
    $("btn-theme-toggle").textContent = darkMode ? "☀️" : "🌙";

    document.body.classList.remove("font-small", "font-normal", "font-large");
    document.body.classList.add(`font-${fontSize || "normal"}`);

    $("cfg-shuffle-q").checked = Boolean(shuffleQuestions);
    $("cfg-shuffle-opt").checked = Boolean(shuffleOptions);
  }

  // --- Hỗ trợ lưu & tiếp tục phiên Ôn tập ---
  function isPracticeMode(mode) {
    return mode === "practice" || mode === "wrong_review" || mode === "bookmark_review";
  }

  function buildPracticeKey(deckId, mode, selectedSectionIds) {
    if (mode === "practice") {
      const sorted = Array.from(new Set(selectedSectionIds || [])).sort().join(",");
      return `${deckId}::practice::${sorted}`;
    }
    return `${deckId}::${mode}`;
  }

  function buildPracticeLabel(mode, selectedSectionIds, sections) {
    if (mode === "wrong_review") return "Ôn tập câu hay sai";
    if (mode === "bookmark_review") return "Ôn tập câu đã đánh dấu";
    const secSet = new Set(selectedSectionIds || []);
    const matched = (sections || []).filter((s) => secSet.has(s.id));
    if (matched.length === 1) return `${matched[0].id}. ${matched[0].title}`;
    if (matched.length > 0 && matched.length === (sections || []).length) {
      return `Tất cả chuyên đề (${matched.length})`;
    }
    if (matched.length <= 3) {
      return `Chuyên đề ${matched.map((s) => s.id).join(", ")}`;
    }
    return `Chuyên đề ${matched.slice(0, 2).map((s) => s.id).join(", ")}... (${matched.length} chuyên đề)`;
  }

  function serializeConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return null;
    const copy = { ...cfg };
    if (copy.filterIds instanceof Set) {
      copy.filterIds = Array.from(copy.filterIds);
      copy._filterIdsWasSet = true;
    }
    return copy;
  }

  function deserializeConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return null;
    const copy = { ...cfg };
    if (copy._filterIdsWasSet && Array.isArray(copy.filterIds)) {
      copy.filterIds = new Set(copy.filterIds);
      delete copy._filterIdsWasSet;
    }
    return copy;
  }

  function isPracticeQuestionDone(q, ans, isChecked) {
    if (q && q.isMulti) return Boolean(isChecked);
    return ans !== null && ans !== undefined;
  }

  function findFirstRemainingIndex(session) {
    if (!session || !Array.isArray(session.questions) || session.questions.length === 0) return 0;
    for (let i = 0; i < session.questions.length; i++) {
      if (!isPracticeQuestionDone(session.questions[i], session.answers[i], session.checked && session.checked[i])) {
        return i;
      }
    }
    return Math.max(0, Math.min(session.questions.length - 1, session.currentIndex || 0));
  }

  function buildPracticeRecordFromCurrentSession() {
    const session = state.session;
    if (!session || session.submitted || !isPracticeMode(session.mode) || !state.activePracticeKey) {
      return null;
    }
    const answeredCount = session.answers.filter(isQuestionAnswered).length;
    const hasFlagged = Array.isArray(session.flagged) && session.flagged.some(Boolean);
    if (answeredCount === 0 && session.currentIndex === 0 && !hasFlagged) {
      return null;
    }
    const snapshotAccumulatedSec =
      (session.accumulatedSec || 0) + Math.max(0, Math.round((Date.now() - session.startedAt) / 1000));
    return {
      key: state.activePracticeKey,
      deckId: state.activeDeckId,
      deckName: state.bank?.name || state.activeDeckId,
      mode: session.mode,
      title: session.title,
      label: state.activePracticeLabel || session.title,
      selectedSectionIds: state.activePracticeSectionIds.slice(),
      answeredCount,
      totalQuestions: session.questions.length,
      currentIndex: session.currentIndex,
      accumulatedSec: snapshotAccumulatedSec,
      updatedAt: new Date().toISOString(),
      lastConfig: serializeConfig(state.lastConfig),
      session: {
        id: session.id,
        mode: session.mode,
        title: session.title,
        questions: session.questions,
        answers: session.answers,
        checked: session.checked,
        flagged: session.flagged,
        currentIndex: session.currentIndex,
        durationSec: 0,
        remainingSec: 0,
        submitted: false,
      },
    };
  }

  function saveActivePracticeSession() {
    const record = buildPracticeRecordFromCurrentSession();
    if (!record) return null;
    state.practiceSessions.set(record.key, record);
    global.QuizDB.savePracticeSession(record).catch((err) => {
      console.warn("Không thể lưu tiến độ ôn tập:", err);
    });
    return record;
  }

  async function removePracticeSession(key) {
    if (!key) return;
    state.practiceSessions.delete(key);
    try {
      await global.QuizDB.deletePracticeSession(key);
    } catch (err) {
      console.warn("Không thể xóa phiên ôn tập:", err);
    }
  }

  function openResumePrompt(saved, onRestart) {
    const remaining = Math.max(0, (saved.totalQuestions || 0) - (saved.answeredCount || 0));
    $("resume-modal-desc").textContent =
      remaining > 0
        ? `Bạn đang ôn dở "${saved.label}" (đã làm ${saved.answeredCount}/${saved.totalQuestions} câu, còn ${remaining} câu). Bạn muốn tiếp tục hay bắt đầu ôn lại từ đầu?`
        : `Bạn đã làm đủ ${saved.answeredCount}/${saved.totalQuestions} câu trong "${saved.label}" nhưng chưa nộp bài. Bạn muốn mở lại để xem/nộp bài hay ôn lại từ đầu?`;
    state.pendingResumePrompt = { key: saved.key, onRestart };
    $("resume-modal-backdrop").classList.remove("hidden");
  }

  function closeResumePrompt() {
    state.pendingResumePrompt = null;
    $("resume-modal-backdrop").classList.add("hidden");
  }

  function resumePracticeSession(key) {
    const saved = state.practiceSessions.get(key);
    if (!saved || !saved.session || !Array.isArray(saved.session.questions) || saved.session.questions.length === 0) {
      showToast("Không tìm thấy dữ liệu phiên ôn tập.", "warning");
      return;
    }

    if (saved.deckId && saved.deckId !== state.activeDeckId) {
      selectDeck(saved.deckId, true);
    }

    const src = saved.session;
    const len = src.questions.length;
    const resumedSession = {
      id: src.id || `session_${Date.now()}`,
      mode: src.mode || saved.mode || "practice",
      title: src.title || saved.title || "Ôn tập",
      questions: src.questions,
      answers: Array.isArray(src.answers) ? src.answers.slice() : new Array(len).fill(null),
      checked: Array.isArray(src.checked) ? src.checked.slice() : new Array(len).fill(false),
      flagged: Array.isArray(src.flagged) ? src.flagged.slice() : new Array(len).fill(false),
      currentIndex: 0,
      durationSec: 0,
      remainingSec: 0,
      accumulatedSec: saved.accumulatedSec || 0,
      startedAt: Date.now(),
      submitted: false,
    };
    resumedSession.currentIndex = findFirstRemainingIndex(resumedSession);

    state.session = resumedSession;
    state.lastConfig = deserializeConfig(saved.lastConfig);
    state.activePracticeKey = saved.key;
    state.activePracticeLabel = saved.label || resumedSession.title;
    state.activePracticeSectionIds = Array.isArray(saved.selectedSectionIds) ? saved.selectedSectionIds.slice() : [];

    switchView("quiz");
    $("quiz-timer-box").classList.add("hidden");
    renderQuizQuestion();
    renderNavigatorGrids();

    const remaining = Math.max(0, len - (saved.answeredCount || 0));
    showToast(
      remaining > 0
        ? `Tiếp tục ôn tập: còn ${remaining}/${len} câu chưa làm.`
        : `Đã làm đủ ${len}/${len} câu — bạn có thể xem lại hoặc Nộp bài.`
    );
  }

  function renderResumePracticeBanner() {
    const card = $("resume-practice-card");
    const listEl = $("resume-practice-list");
    const countEl = $("resume-practice-count");
    if (!card || !listEl) return;

    const list = Array.from(state.practiceSessions.values())
      .filter((item) => item && item.deckId === state.activeDeckId && item.totalQuestions > 0)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    if (list.length === 0) {
      card.classList.add("hidden");
      listEl.innerHTML = "";
      return;
    }

    card.classList.remove("hidden");
    if (countEl) countEl.textContent = `${list.length} phiên chưa hoàn tất`;

    listEl.innerHTML = list
      .map((item) => {
        const answered = item.answeredCount || 0;
        const total = item.totalQuestions || 0;
        const remaining = Math.max(0, total - answered);
        const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
        const timeStr = item.updatedAt
          ? new Date(item.updatedAt).toLocaleString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
              day: "2-digit",
              month: "2-digit",
            })
          : "";
        return `
          <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200/90 dark:border-amber-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div class="min-w-0 flex-1 space-y-1">
              <div class="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">${escapeHtml(item.label || item.title)}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">
                Đã làm <strong class="text-amber-700 dark:text-amber-300">${answered}/${total}</strong> câu
                ${remaining > 0 ? `(còn ${remaining} câu)` : "(chờ nộp bài)"}
                ${timeStr ? ` • ${escapeHtml(timeStr)}` : ""}
              </div>
              <div class="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full bg-amber-500 transition-all" style="width: ${pct}%"></div>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button type="button" data-resume-key="${escapeHtml(item.key)}"
                class="btn-resume-session px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs transition">
                ▶ Tiếp tục
              </button>
              <button type="button" data-delete-key="${escapeHtml(item.key)}" title="Xóa tiến độ này"
                class="btn-delete-session px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/60 text-slate-600 hover:text-rose-600 dark:text-slate-300 font-semibold text-xs transition">
                ✕ Xóa
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // --- Chuyển màn hình ---
  function switchView(viewName) {
    if (viewName !== "quiz") {
      if (state.session && !state.session.submitted && isPracticeMode(state.session.mode)) {
        saveActivePracticeSession();
      }
      global.QuizEngine.stopTimer();
      closeMobileDrawer();
    }
    const views = ["home", "quiz", "result", "import", "history"];
    views.forEach((v) => {
      const el = $(`view-${v}`);
      if (el) el.classList.toggle("hidden", v !== viewName);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // --- Tải dữ liệu ngân hàng đề & trạng thái ---
  async function loadAppData() {
    showLoading("Đang tải ngân hàng đề...");
    try {
      state.settings = global.QuizDB.getSettings();
      applySettings();

      const [customRecord, bookmarks, wrongStats, practiceSessions] = await Promise.all([
        global.QuizDB.getCustomQuestionBank(),
        global.QuizDB.getBookmarks(),
        global.QuizDB.getWrongStats(),
        global.QuizDB.getPracticeSessions(),
      ]);

      state.bookmarks = bookmarks;
      state.wrongStats = wrongStats;
      state.practiceSessions = new Map((practiceSessions || []).map((s) => [s.key, s]));

      let mainBank;
      if (customRecord && customRecord.data && Array.isArray(customRecord.data.questions)) {
        mainBank = customRecord.data;
        state.isCustomBank = true;
        state.bankUpdatedAt = customRecord.updatedAt;
      } else if (global.QUIZ_DATA && Array.isArray(global.QUIZ_DATA.questions)) {
        mainBank = global.QUIZ_DATA;
        state.isCustomBank = false;
        state.bankUpdatedAt = global.QUIZ_DATA.meta?.generatedAt || null;
      } else {
        throw new Error("Không tìm thấy dữ liệu câu hỏi.");
      }

      const extraDecks = Array.isArray(global.EXTRA_DECKS) ? global.EXTRA_DECKS : [];
      state.decks = [
        {
          id: "TC B4",
          name: "Trưởng Ca Bậc 4",
          meta: mainBank.meta,
          sections: mainBank.sections,
          questions: mainBank.questions,
        },
        ...extraDecks.map((d) => ({
          id: d.id,
          name: d.name,
          meta: { sourceFile: d.title, sheetName: d.name },
          sections: d.sections,
          questions: d.questions,
        })),
      ];

      state.allocationMode = state.settings.allocationMode || "ratio";
      $("cfg-limit").value =
        state.settings.totalQuestions !== undefined ? String(state.settings.totalQuestions) : "40";
      selectDeck(state.settings.activeDeckId || "TC B4", false);
    } catch (err) {
      console.error(err);
      showToast(err.message || "Lỗi tải dữ liệu.", "error");
    } finally {
      hideLoading();
    }
  }

  function selectDeck(deckId, save = true) {
    const found = state.decks.find((d) => d.id === deckId) || state.decks[0];
    if (!found) return;
    state.activeDeckId = found.id;
    state.bank = found;
    state.selectedSections = new Set(found.sections.map((s) => s.id));
    state.sectionRatios = {};
    if (save) {
      state.settings = global.QuizDB.saveSettings({ activeDeckId: found.id });
    }
    syncSectionRatiosIfEmpty();
    renderDeckSelector();
    renderHome();
  }

  function renderDeckSelector() {
    const sel = $("deck-select");
    if (!sel) return;
    sel.innerHTML = state.decks
      .map(
        (d) =>
          `<option value="${escapeHtml(d.id)}" ${d.id === state.activeDeckId ? "selected" : ""}>${escapeHtml(
            d.name
          )} (${d.questions.length} câu)</option>`
      )
      .join("");
  }

  function syncSectionRatiosIfEmpty() {
    if (!state.bank) return;
    const hasAny = state.bank.sections.some((s) => Number(state.sectionRatios[s.id]) > 0);
    if (!hasAny) {
      applyProportionalRatios(false);
    }
  }

  function applyProportionalRatios(save = true) {
    const selected = state.bank.sections.filter((s) => state.selectedSections.has(s.id));
    const totalQ = selected.reduce((sum, s) => sum + s.questionCount, 0);
    const nextRatios = {};
    state.bank.sections.forEach((s) => {
      if (!state.selectedSections.has(s.id) || totalQ === 0) {
        nextRatios[s.id] = 0;
      } else {
        nextRatios[s.id] = Math.round((s.questionCount / totalQ) * 1000) / 10;
      }
    });
    state.sectionRatios = nextRatios;
    if (save) state.settings = global.QuizDB.saveSettings({ sectionRatios: nextRatios });
  }

  function applyEqualRatios(save = true) {
    const selected = state.bank.sections.filter((s) => state.selectedSections.has(s.id));
    const count = selected.length;
    const nextRatios = {};
    const each = count > 0 ? Math.round((100 / count) * 10) / 10 : 0;
    state.bank.sections.forEach((s) => {
      nextRatios[s.id] = state.selectedSections.has(s.id) ? each : 0;
    });
    state.sectionRatios = nextRatios;
    if (save) state.settings = global.QuizDB.saveSettings({ sectionRatios: nextRatios });
  }

  function getPreviewAllocation() {
    const secPools = new Map();
    state.bank.sections.forEach((s) => {
      secPools.set(s.id, new Array(s.questionCount));
    });
    const selectedIds = Array.from(state.selectedSections);
    const limit = parseInt($("cfg-limit").value, 10) || 0;
    return global.QuizEngine.computeRatioCounts(secPools, selectedIds, limit, state.sectionRatios);
  }

  function updateAllocationUI() {
    const isRatio = state.allocationMode === "ratio";
    document.querySelectorAll(".alloc-btn").forEach((btn) => {
      const active = btn.dataset.alloc === state.allocationMode;
      btn.className = active
        ? "alloc-btn px-3 py-2 rounded-xl border text-xs font-semibold text-left transition border-brand-600 bg-brand-50/70 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300"
        : "alloc-btn px-3 py-2 rounded-xl border text-xs font-semibold text-left transition border-slate-200 dark:border-slate-700";
    });
    $("ratio-toolbar").classList.toggle("hidden", !isRatio);

    const currentLimit = String(parseInt($("cfg-limit").value, 10) || 0);
    document.querySelectorAll(".limit-preset-btn").forEach((btn) => {
      const active = btn.dataset.presetLimit === currentLimit;
      btn.className = active
        ? "limit-preset-btn px-2 py-0.5 rounded-md text-[11px] font-semibold bg-brand-100 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300"
        : "limit-preset-btn px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700";
    });

    if (isRatio) {
      let totalPct = 0;
      state.bank.sections.forEach((s) => {
        if (state.selectedSections.has(s.id)) {
          totalPct += Math.max(0, Number(state.sectionRatios[s.id]) || 0);
        }
      });
      totalPct = Math.round(totalPct * 10) / 10;
      const countsMap = getPreviewAllocation();
      let totalPicked = 0;
      countsMap.forEach((v) => {
        totalPicked += v;
      });
      $("ratio-total-pct").textContent = `${totalPct}%`;
      $("ratio-total-pct").className =
        Math.abs(totalPct - 100) < 0.5 ? "text-emerald-600" : "text-amber-600";
      $("ratio-total-picked").textContent = totalPicked;
    }
  }

  // --- Render Trang chủ ---
  function renderHome() {
    const totalQ = state.bank.questions.length;
    const totalSec = state.bank.sections.length;

    $("header-bank-badge").textContent = `${totalQ} câu • ${totalSec} chuyên đề ${
      state.isCustomBank ? "(Đã cập nhật)" : "(Mặc định)"
    }`;
    $("stat-total-questions").textContent = totalQ;
    $("stat-total-sections").textContent = `${totalSec} chuyên đề`;
    $("stat-wrong-count").textContent = state.wrongStats.size;
    $("stat-bookmark-count").textContent = state.bookmarks.size;

    renderResumePracticeBanner();
    updateAllocationUI();
    renderSectionList();
    updateSelectedSectionSummary();
  }

  function renderSectionList() {
    const container = $("section-list");
    container.innerHTML = "";
    const isRatio = state.allocationMode === "ratio";
    const countsMap = isRatio ? getPreviewAllocation() : null;

    state.bank.sections.forEach((sec) => {
      const checked = state.selectedSections.has(sec.id);
      const ratioVal = state.sectionRatios[sec.id] ?? 0;
      const picked = countsMap ? countsMap.get(sec.id) || 0 : 0;
      const singleSaved = state.practiceSessions.get(buildPracticeKey(state.activeDeckId, "practice", [sec.id]));
      const savedBadgeHtml = singleSaved
        ? `<span class="inline-block ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-semibold">Đang ôn ${singleSaved.answeredCount}/${singleSaved.totalQuestions}</span>`
        : "";

      const row = document.createElement("div");
      row.className =
        "flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition";
      row.innerHTML = `
        <label class="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
          <input type="checkbox" data-sec-id="${escapeHtml(sec.id)}" class="sec-checkbox w-5 h-5 accent-brand-600 rounded shrink-0" ${
            checked ? "checked" : ""
          } />
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold truncate">${escapeHtml(sec.id)}. ${escapeHtml(sec.title)}</div>
            <div class="text-[11px] text-slate-400">Ngân hàng: ${sec.questionCount} câu${savedBadgeHtml}</div>
          </div>
        </label>
        ${
          isRatio
            ? `<div class="flex items-center gap-1.5 shrink-0">
                <div class="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 px-1.5 py-1">
                  <input type="number" min="0" max="100" step="0.5" data-ratio-sec="${escapeHtml(sec.id)}"
                    value="${checked ? ratioVal : 0}" ${checked ? "" : "disabled"}
                    class="sec-ratio-input w-12 text-right text-xs font-bold bg-transparent focus:outline-none ${
                      checked ? "" : "opacity-40"
                    }" />
                  <span class="text-[11px] text-slate-400 ml-0.5">%</span>
                </div>
                <span class="sec-picked-badge px-2 py-1 rounded-lg text-xs font-bold ${
                  checked && picked > 0
                    ? "bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                } min-w-[56px] text-center">
                  ${checked ? `${picked} câu` : "0 câu"}
                </span>
              </div>`
            : `<span class="px-2 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                ${sec.questionCount} câu
              </span>`
        }
      `;
      container.appendChild(row);
    });
  }

  function updateSelectedSectionSummary() {
    const total = state.bank.sections.length;
    const count = state.selectedSections.size;
    $("selected-section-summary").textContent =
      count === total ? `Tất cả (${total})` : `${count}/${total} chuyên đề`;
  }

  // --- Bắt đầu làm bài ---
  function startQuizWithConfig(config) {
    try {
      state.lastConfig = config;
      state.session = global.QuizEngine.createSession({
        allQuestions: state.bank.questions,
        ...config,
      });

      if (isPracticeMode(state.session.mode)) {
        const secIds = Array.isArray(config.selectedSectionIds) ? config.selectedSectionIds : [];
        state.activePracticeKey = buildPracticeKey(state.activeDeckId, state.session.mode, secIds);
        state.activePracticeLabel = buildPracticeLabel(state.session.mode, secIds, state.bank.sections);
        state.activePracticeSectionIds = secIds.slice();
      } else {
        state.activePracticeKey = null;
        state.activePracticeLabel = "";
        state.activePracticeSectionIds = [];
      }

      switchView("quiz");
      renderQuizQuestion();
      renderNavigatorGrids();

      if (state.session.durationSec > 0) {
        $("quiz-timer-box").classList.remove("hidden");
        $("quiz-timer-value").textContent = global.QuizEngine.formatDuration(
          state.session.remainingSec
        );
        global.QuizEngine.startTimer(
          state.session,
          (rem) => {
            $("quiz-timer-value").textContent = global.QuizEngine.formatDuration(rem);
            if (rem <= 60) {
              $("quiz-timer-box").classList.add("animate-pulse");
            }
          },
          () => {
            showToast("Hết giờ! Hệ thống đang tự động nộp bài.", "warning");
            submitCurrentQuiz();
          }
        );
      } else {
        $("quiz-timer-box").classList.add("hidden");
      }
    } catch (err) {
      showToast(err.message || "Không thể bắt đầu bài thi.", "error");
    }
  }

  // --- Render câu hỏi hiện tại ---
  function renderQuizQuestion() {
    const session = state.session;
    if (!session) return;

    const idx = session.currentIndex;
    const q = session.questions[idx];
    const total = session.questions.length;
    const userAnswer = session.answers[idx];
    const isPractice = session.mode === "practice" || session.mode === "wrong_review" || session.mode === "bookmark_review";
    const isMulti = Boolean(q.isMulti);
    const correctSet = new Set(
      Array.isArray(q.correctIndices) && q.correctIndices.length > 0 ? q.correctIndices : [q.correctIndex]
    );
    const selectedSet = new Set(
      isMulti ? (Array.isArray(userAnswer) ? userAnswer : []) : userAnswer !== null && userAnswer !== undefined ? [userAnswer] : []
    );
    const hasAnswered = selectedSet.size > 0;
    const isChecked = isMulti ? Boolean(session.checked && session.checked[idx]) : hasAnswered;
    const showImmediate = isPractice && isChecked;

    $("quiz-progress-text").textContent = `Câu ${idx + 1} / ${total}`;
    $("quiz-progress-bar").style.width = `${Math.round(((idx + 1) / total) * 100)}%`;
    $("quiz-section-badge").textContent = `${q.sectionId}. ${q.sectionTitle}`;
    $("quiz-question-text").textContent = `Câu ${q.number}: ${q.text}`;

    // Trạng thái Flag & Bookmark
    const isFlagged = session.flagged[idx];
    $("btn-flag-question").className = isFlagged
      ? "px-2.5 py-1 rounded-lg text-xs font-semibold border border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
      : "px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800";
    $("btn-flag-question").textContent = isFlagged ? "🚩 Đã đánh dấu" : "🚩 Xem lại";

    const isBookmarked = state.bookmarks.has(q.id);
    $("btn-bookmark-question").className = isBookmarked
      ? "px-2.5 py-1 rounded-lg text-xs font-semibold border border-brand-400 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300"
      : "px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800";
    $("btn-bookmark-question").textContent = isBookmarked ? "★ Đã lưu" : "☆ Lưu";

    // Render các phương án
    const container = $("quiz-options-container");
    container.innerHTML = "";

    const feedbackEl = $("quiz-practice-feedback");
    feedbackEl.classList.add("hidden");

    if (isMulti) {
      const hint = document.createElement("div");
      hint.className = "text-xs font-semibold text-brand-600 dark:text-brand-400";
      hint.textContent = `ⓘ Câu hỏi nhiều đáp án — chọn tất cả ${correctSet.size} phương án đúng`;
      container.appendChild(hint);
    }

    q.options.forEach((opt, optIdx) => {
      const isSelected = selectedSet.has(optIdx);
      const isCorrectOpt = correctSet.has(optIdx);

      let btnStyle =
        "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-400";
      let badgeStyle =
        "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200";

      if (showImmediate) {
        if (isCorrectOpt) {
          btnStyle =
            "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100";
          badgeStyle = "bg-emerald-600 text-white";
        } else if (isSelected && !isCorrectOpt) {
          btnStyle =
            "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100";
          badgeStyle = "bg-rose-600 text-white";
        }
      } else if (isSelected) {
        btnStyle =
          "border-brand-600 bg-brand-50/70 dark:bg-brand-950/40 ring-1 ring-brand-600";
        badgeStyle = "bg-brand-600 text-white";
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.optIdx = String(optIdx);
      btn.className = `option-btn w-full p-3.5 rounded-xl border-2 text-left flex items-start gap-3 ${btnStyle}`;
      btn.innerHTML = `
        <span class="w-7 h-7 ${isMulti ? "rounded-lg" : "rounded-full"} flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${badgeStyle}">
          ${escapeHtml(opt.label)}
        </span>
        <span class="quiz-text flex-1">${escapeHtml(opt.text)}</span>
      `;
      container.appendChild(btn);
    });

    if (isPractice && isMulti && !isChecked) {
      const checkBtn = document.createElement("button");
      checkBtn.type = "button";
      checkBtn.id = "btn-check-multi";
      checkBtn.className = "mt-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm";
      checkBtn.textContent = "✓ Kiểm tra đáp án";
      checkBtn.addEventListener("click", () => {
        if (!selectedSet.size) {
          showToast("Hãy chọn ít nhất 1 phương án trước khi kiểm tra.", "warning");
          return;
        }
        session.checked[idx] = true;
        saveActivePracticeSession();
        renderQuizQuestion();
      });
      container.appendChild(checkBtn);
    }

    if (showImmediate) {
      const isRight =
        selectedSet.size === correctSet.size && Array.from(correctSet).every((ci) => selectedSet.has(ci));
      const correctLabels = Array.from(correctSet)
        .sort((a, b) => a - b)
        .map((ci) => q.options[ci]?.label)
        .filter(Boolean)
        .join(", ");
      feedbackEl.classList.remove("hidden");
      feedbackEl.className = isRight
        ? "p-3.5 rounded-xl text-sm font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
        : "p-3.5 rounded-xl text-sm font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800";
      feedbackEl.textContent = isRight
        ? "✓ Chính xác!"
        : `✗ Chưa đúng. Đáp án đúng là: ${correctLabels}`;
    }

    // Cập nhật nút Trước / Tiếp
    const isFirst = idx === 0;
    const isLast = idx === total - 1;
    $("btn-prev-desktop").disabled = isFirst;
    $("btn-prev-mobile").disabled = isFirst;
    $("btn-prev-desktop").classList.toggle("opacity-40", isFirst);
    $("btn-prev-mobile").classList.toggle("opacity-40", isFirst);

    $("btn-next-desktop").disabled = isLast;
    $("btn-next-mobile").disabled = isLast;
    $("btn-next-desktop").classList.toggle("opacity-40", isLast);
    $("btn-next-mobile").classList.toggle("opacity-40", isLast);
  }

  function isQuestionAnswered(ans) {
    return Array.isArray(ans) ? ans.length > 0 : ans !== null && ans !== undefined;
  }

  function renderNavigatorGrids() {
    const session = state.session;
    if (!session) return;

    const answered = session.answers.filter(isQuestionAnswered).length;
    $("nav-answered-count").textContent = `${answered}/${session.questions.length} đã làm`;

    const buildHtml = () =>
      session.questions
        .map((_, idx) => {
          const isCurrent = idx === session.currentIndex;
          const isAnswered = isQuestionAnswered(session.answers[idx]);
          const isFlagged = session.flagged[idx];

          let cls =
            "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200";
          if (isFlagged) {
            cls = "bg-amber-400 text-slate-900 font-bold border-amber-500";
          } else if (isAnswered) {
            cls = "bg-brand-600 text-white font-semibold border-brand-600";
          }
          if (isCurrent) {
            cls += " ring-2 ring-offset-1 ring-slate-900 dark:ring-white";
          }

          return `<button type="button" data-nav-idx="${idx}" class="nav-q-btn h-9 rounded-lg text-xs font-medium ${cls}">${
            idx + 1
          }</button>`;
        })
        .join("");

    const html = buildHtml();
    $("navigator-grid-desktop").innerHTML = html;
    $("navigator-grid-mobile").innerHTML = html;
  }

  function selectOption(optIdx) {
    if (!state.session || state.session.submitted) return;
    const idx = state.session.currentIndex;
    const q = state.session.questions[idx];
    if (q.isMulti) {
      const cur = Array.isArray(state.session.answers[idx]) ? state.session.answers[idx].slice() : [];
      const pos = cur.indexOf(optIdx);
      if (pos >= 0) cur.splice(pos, 1);
      else cur.push(optIdx);
      state.session.answers[idx] = cur;
      if (state.session.checked) state.session.checked[idx] = false;
    } else {
      state.session.answers[idx] = optIdx;
    }
    saveActivePracticeSession();
    renderQuizQuestion();
    renderNavigatorGrids();
  }

  function goToQuestion(idx) {
    if (!state.session) return;
    const max = state.session.questions.length - 1;
    state.session.currentIndex = Math.max(0, Math.min(max, idx));
    saveActivePracticeSession();
    renderQuizQuestion();
    renderNavigatorGrids();
  }

  // --- Nộp bài & Lưu kết quả ---
  async function submitCurrentQuiz() {
    if (!state.session || state.session.submitted) return;

    const practiceKeyToDelete = state.activePracticeKey;
    state.activePracticeKey = null;
    const result = global.QuizEngine.gradeSession(state.session);
    state.lastResult = result;
    state.resultFilter = "all";

    try {
      await Promise.all([
        global.QuizDB.saveExamHistory({
          id: result.id,
          mode: result.mode,
          title: result.title,
          totalQuestions: result.totalQuestions,
          correctCount: result.correctCount,
          scorePercent: result.scorePercent,
          spentSec: result.spentSec,
          createdAt: result.createdAt,
        }),
        global.QuizDB.recordWrongQuestions(result.wrongQuestionIds),
        removePracticeSession(practiceKeyToDelete),
      ]);
      state.wrongStats = await global.QuizDB.getWrongStats();
    } catch (err) {
      console.warn("Lỗi lưu lịch sử:", err);
    }

    renderResultView();
    switchView("result");
  }

  function renderResultView() {
    const res = state.lastResult;
    if (!res) return;

    const passed = res.scorePercent >= 80;
    $("result-badge").textContent = passed ? "🎉 ĐẠT YÊU CẦU (>= 80%)" : "📚 CẦN ÔN TẬP THÊM";
    $("result-badge").className = passed
      ? "inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700"
      : "inline-block px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800";

    $("result-score-big").textContent = `${res.scorePercent}%`;
    $("result-summary-text").textContent = `Đúng ${res.correctCount} / ${res.totalQuestions} câu • Thời gian: ${global.QuizEngine.formatDuration(
      res.spentSec
    )}`;

    $("btn-retry-wrong").classList.toggle("hidden", res.wrongQuestionIds.length === 0);

    // Breakdown theo chuyên đề
    const bdEl = $("result-section-breakdown");
    bdEl.innerHTML = res.sectionBreakdown
      .map((s) => {
        const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
        return `
          <div class="space-y-1">
            <div class="flex justify-between text-xs sm:text-sm font-medium">
              <span class="truncate pr-2">${escapeHtml(s.sectionId)}. ${escapeHtml(s.sectionTitle)}</span>
              <span class="shrink-0 font-bold">${s.correct}/${s.total} (${pct}%)</span>
            </div>
            <div class="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div class="h-full ${pct >= 80 ? "bg-emerald-500" : "bg-brand-600"}" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      })
      .join("");

    renderResultDetails();
  }

  function renderResultDetails() {
    const res = state.lastResult;
    if (!res) return;

    document.querySelectorAll(".res-filter-btn").forEach((btn) => {
      const active = btn.dataset.filter === state.resultFilter;
      btn.className = active
        ? "res-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white"
        : "res-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800";
    });

    const filtered = res.details.filter((d) => {
      if (state.resultFilter === "wrong") return !d.isCorrect;
      if (state.resultFilter === "correct") return d.isCorrect;
      return true;
    });

    const listEl = $("result-details-list");
    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="text-sm text-slate-400 text-center py-6">Không có câu hỏi nào trong mục này.</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((d) => {
        const q = d.question;
        const statusCls = d.isCorrect
          ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20"
          : "border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20";

        const correctSet = new Set(
          Array.isArray(q.correctIndices) && q.correctIndices.length > 0 ? q.correctIndices : [q.correctIndex]
        );
        const userSet = new Set(
          Array.isArray(d.userAnswer) ? d.userAnswer : d.userAnswer !== null && d.userAnswer !== undefined ? [d.userAnswer] : []
        );

        const optsHtml = q.options
          .map((opt, idx) => {
            const isCorrect = correctSet.has(idx);
            const isUser = userSet.has(idx);
            let tag = "";
            let rowCls = "text-slate-600 dark:text-slate-300";
            if (isCorrect && isUser) {
              rowCls = "text-emerald-700 dark:text-emerald-300 font-semibold";
              tag = " ✓ (Đúng - Bạn chọn)";
            } else if (isCorrect) {
              rowCls = "text-emerald-700 dark:text-emerald-300 font-semibold";
              tag = " ✓ (Đáp án đúng)";
            } else if (isUser) {
              rowCls = "text-rose-600 dark:text-rose-400 line-through";
              tag = " ✗ (Bạn chọn)";
            }
            return `<div class="text-xs sm:text-sm ${rowCls}">${escapeHtml(opt.label)}. ${escapeHtml(
              opt.text
            )}${tag}</div>`;
          })
          .join("");

        return `
          <div class="p-3.5 rounded-xl border ${statusCls} space-y-2">
            <div class="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>Câu ${d.index + 1} (Gốc: ${q.sectionId}-${q.number})</span>
              <span class="font-bold ${d.isCorrect ? "text-emerald-600" : "text-rose-600"}">
                ${d.isCorrect ? "Đúng" : d.isAnswered ? "Sai" : "Bỏ qua"}
              </span>
            </div>
            <div class="text-sm font-semibold">${escapeHtml(q.text)}</div>
            <div class="space-y-1 pl-2 border-l-2 border-slate-200 dark:border-slate-700">${optsHtml}</div>
          </div>
        `;
      })
      .join("");
  }

  // --- Quản lý & Import đề ---
  function renderImportView() {
    const meta = state.bank.meta || {};
    $("import-current-status").textContent = state.isCustomBank ? "Bộ đề đã cập nhật" : "Bộ đề mặc định";
    $("import-current-status").className = state.isCustomBank
      ? "px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"
      : "px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-100 text-brand-700";

    $("import-current-info").innerHTML = `
      <div>• Nguồn: <strong>${escapeHtml(meta.sourceFile || "truong ca bac 4.xlsx")}</strong> (Sheet: <code>${escapeHtml(
      meta.sheetName || "trac nghiem"
    )}</code>)</div>
      <div>• Quy mô: <strong>${state.bank.questions.length}</strong> câu hỏi thuộc <strong>${
      state.bank.sections.length
    }</strong> chuyên đề</div>
      <div>• Cập nhật lúc: ${
        state.bankUpdatedAt ? new Date(state.bankUpdatedAt).toLocaleString("vi-VN") : "Mặc định"
      }</div>
    `;

    $("btn-restore-default-bank").classList.toggle("hidden", !state.isCustomBank);
    $("import-preview-box").classList.add("hidden");
    state.pendingImportData = null;
  }

  async function handleImportFileSelected(file) {
    if (!file) return;
    showLoading("Đang phân tích file đề...");
    try {
      let parsed;
      if (file.name.toLowerCase().endsWith(".json")) {
        const text = await file.text();
        const json = JSON.parse(text);
        if (!Array.isArray(json.questions) || !Array.isArray(json.sections)) {
          throw new Error("File JSON không đúng định dạng bộ đề.");
        }
        parsed = json;
      } else {
        parsed = await global.ExcelQuizParser.parseExcelFile(file);
      }

      state.pendingImportData = parsed;
      $("import-preview-stats").innerHTML = `
        <div>• File: <strong>${escapeHtml(file.name)}</strong></div>
        <div>• Sheet: <code>${escapeHtml(parsed.meta?.sheetName || "-")}</code></div>
        <div>• Tổng cộng: <strong>${parsed.questions.length}</strong> câu hỏi / <strong>${
        parsed.sections.length
      }</strong> chuyên đề</div>
      `;

      const warnBox = $("import-preview-warnings");
      if (parsed.warnings && parsed.warnings.length > 0) {
        warnBox.classList.remove("hidden");
        warnBox.innerHTML =
          `<div class="font-bold">Cảnh báo (${parsed.warnings.length}):</div>` +
          parsed.warnings.slice(0, 20).map((w) => `<div>• ${escapeHtml(w)}</div>`).join("");
      } else {
        warnBox.classList.add("hidden");
      }

      $("import-preview-box").classList.remove("hidden");
      showToast("Đã đọc xong file. Bấm Xác nhận để cập nhật đề.", "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Không thể đọc file đề.", "error");
    } finally {
      hideLoading();
      $("input-import-excel").value = "";
    }
  }

  // --- Lịch sử & Sao lưu ---
  async function renderHistoryView() {
    const list = await global.QuizDB.getExamHistory();
    const container = $("history-list");
    if (!list || list.length === 0) {
      container.innerHTML = `<div class="text-sm text-slate-400 text-center py-6">Chưa có lịch sử làm bài nào.</div>`;
      return;
    }

    container.innerHTML = list
      .map(
        (h) => `
      <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="font-semibold text-sm truncate">${escapeHtml(h.title || "Bài thi")}</div>
          <div class="text-xs text-slate-500 mt-0.5">
            ${new Date(h.createdAt).toLocaleString("vi-VN")} • ${h.correctCount}/${h.totalQuestions} câu • ${global.QuizEngine.formatDuration(
          h.spentSec
        )}
          </div>
        </div>
        <div class="text-base font-extrabold ${
          h.scorePercent >= 80 ? "text-emerald-600" : "text-brand-600"
        } shrink-0">
          ${h.scorePercent}%
        </div>
      </div>
    `
      )
      .join("");
  }

  // --- Mobile Drawer ---
  function openMobileDrawer() {
    $("mobile-drawer-backdrop").classList.remove("hidden");
  }
  function closeMobileDrawer() {
    $("mobile-drawer-backdrop").classList.add("hidden");
  }

  // --- Gắn sự kiện ---
  function bindEvents() {
    // Header
    $("btn-logo-home").addEventListener("click", () => {
      if (state.session && !state.session.submitted && isPracticeMode(state.session.mode)) {
        saveActivePracticeSession();
        state.session = null;
        state.activePracticeKey = null;
      }
      renderHome();
      switchView("home");
    });
    $("btn-nav-import").addEventListener("click", () => {
      if (state.session && !state.session.submitted && isPracticeMode(state.session.mode)) {
        saveActivePracticeSession();
        state.session = null;
        state.activePracticeKey = null;
      }
      renderImportView();
      switchView("import");
    });
    $("btn-nav-history").addEventListener("click", async () => {
      if (state.session && !state.session.submitted && isPracticeMode(state.session.mode)) {
        saveActivePracticeSession();
        state.session = null;
        state.activePracticeKey = null;
      }
      await renderHistoryView();
      switchView("history");
    });
    $("btn-theme-toggle").addEventListener("click", () => {
      state.settings = global.QuizDB.saveSettings({ darkMode: !state.settings.darkMode });
      applySettings();
    });
    $("btn-font-cycle").addEventListener("click", () => {
      const order = ["small", "normal", "large"];
      const next = order[(order.indexOf(state.settings.fontSize) + 1) % order.length];
      state.settings = global.QuizDB.saveSettings({ fontSize: next });
      applySettings();
      showToast(`Cỡ chữ: ${next === "small" ? "Nhỏ" : next === "large" ? "Lớn" : "Vừa"}`);
    });

    // Home: Mode selection
    document.querySelectorAll(".mode-card").forEach((card) => {
      card.addEventListener("click", () => {
        state.selectedMode = card.dataset.mode;
        document.querySelectorAll(".mode-card").forEach((c) => {
          const active = c.dataset.mode === state.selectedMode;
          c.className = active
            ? "mode-card p-3 rounded-xl border-2 text-left transition border-brand-600 bg-brand-50/70 dark:bg-brand-950/30"
            : "mode-card p-3 rounded-xl border-2 text-left transition border-slate-200 dark:border-slate-700";
        });
      });
    });

    // Home: Deck selector
    if ($("deck-select")) {
      $("deck-select").addEventListener("change", (e) => {
        selectDeck(e.target.value, true);
      });
    }

    // Home: Total questions input & presets
    $("cfg-limit").addEventListener("input", () => {
      const val = Math.max(0, parseInt($("cfg-limit").value, 10) || 0);
      state.settings = global.QuizDB.saveSettings({ totalQuestions: val });
      updateAllocationUI();
      renderSectionList();
    });

    document.querySelectorAll(".limit-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = parseInt(btn.dataset.presetLimit, 10) || 0;
        $("cfg-limit").value = String(val);
        state.settings = global.QuizDB.saveSettings({ totalQuestions: val });
        updateAllocationUI();
        renderSectionList();
      });
    });

    // Home: Allocation mode
    document.querySelectorAll(".alloc-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.allocationMode = btn.dataset.alloc;
        state.settings = global.QuizDB.saveSettings({ allocationMode: state.allocationMode });
        if (state.allocationMode === "ratio") syncSectionRatiosIfEmpty();
        updateAllocationUI();
        renderSectionList();
      });
    });

    $("btn-ratio-proportional").addEventListener("click", () => {
      applyProportionalRatios(true);
      updateAllocationUI();
      renderSectionList();
      showToast("Đã chia tỷ lệ theo số câu thực tế của từng chương.");
    });

    $("btn-ratio-equal").addEventListener("click", () => {
      applyEqualRatios(true);
      updateAllocationUI();
      renderSectionList();
      showToast("Đã chia đều tỷ lệ cho các chương đang chọn.");
    });

    // Home: Section checkboxes & ratio inputs (event delegation)
    $("section-list").addEventListener("change", (e) => {
      const cb = e.target.closest(".sec-checkbox");
      if (cb) {
        const secId = cb.dataset.secId;
        if (cb.checked) state.selectedSections.add(secId);
        else state.selectedSections.delete(secId);
        updateSelectedSectionSummary();
        updateAllocationUI();
        renderSectionList();
        return;
      }
    });

    $("section-list").addEventListener("input", (e) => {
      const inp = e.target.closest(".sec-ratio-input");
      if (!inp) return;
      const secId = inp.dataset.ratioSec;
      const val = Math.max(0, Math.min(100, parseFloat(inp.value) || 0));
      state.sectionRatios[secId] = val;
      state.settings = global.QuizDB.saveSettings({ sectionRatios: state.sectionRatios });
      updateAllocationUI();

      // Cập nhật badge số câu ngay trên dòng hiện tại mà không làm mất focus input
      const countsMap = getPreviewAllocation();
      state.bank.sections.forEach((s) => {
        const rowInput = $("section-list").querySelector(`.sec-ratio-input[data-ratio-sec="${CSS.escape(s.id)}"]`);
        if (rowInput) {
          const badge = rowInput.closest(".flex.items-center.gap-1\\.5")?.querySelector(".sec-picked-badge");
          if (badge) {
            const picked = countsMap.get(s.id) || 0;
            badge.textContent = state.selectedSections.has(s.id) ? `${picked} câu` : "0 câu";
          }
        }
      });
    });

    $("btn-sec-all").addEventListener("click", () => {
      state.selectedSections = new Set(state.bank.sections.map((s) => s.id));
      updateAllocationUI();
      renderSectionList();
      updateSelectedSectionSummary();
    });
    $("btn-sec-none").addEventListener("click", () => {
      state.selectedSections.clear();
      updateAllocationUI();
      renderSectionList();
      updateSelectedSectionSummary();
    });

    // Home: Start quiz
    $("btn-start-quiz").addEventListener("click", () => {
      if (state.selectedSections.size === 0) {
        showToast("Vui lòng chọn ít nhất 1 chuyên đề.", "warning");
        return;
      }
      const shuffleQuestions = $("cfg-shuffle-q").checked;
      const shuffleOptions = $("cfg-shuffle-opt").checked;
      const limit = Math.max(0, parseInt($("cfg-limit").value, 10) || 0);
      state.settings = global.QuizDB.saveSettings({
        shuffleQuestions,
        shuffleOptions,
        totalQuestions: limit,
        allocationMode: state.allocationMode,
        sectionRatios: state.sectionRatios,
      });

      const duration = parseInt($("cfg-duration").value, 10) || 0;
      const selectedSectionIds = Array.from(state.selectedSections);
      const quizConfig = {
        mode: state.selectedMode,
        title: state.selectedMode === "practice" ? "Ôn tập theo chuyên đề" : "Thi thử Trưởng Ca Bậc 4",
        selectedSectionIds,
        questionLimit: limit,
        shuffleQuestions,
        shuffleOptions,
        durationMinutes: state.selectedMode === "practice" ? 0 : duration,
        allocationMode: state.allocationMode,
        sectionRatios: { ...state.sectionRatios },
      };

      if (state.selectedMode === "practice") {
        const key = buildPracticeKey(state.activeDeckId, "practice", selectedSectionIds);
        const saved = state.practiceSessions.get(key);
        if (saved) {
          openResumePrompt(saved, async () => {
            await removePracticeSession(key);
            startQuizWithConfig(quizConfig);
          });
          return;
        }
      }

      startQuizWithConfig(quizConfig);
    });

    // Home: Quick review wrong & bookmarks
    $("btn-quick-wrong").addEventListener("click", () => {
      const key = buildPracticeKey(state.activeDeckId, "wrong_review");
      const saved = state.practiceSessions.get(key);
      const startFresh = async () => {
        if (state.wrongStats.size === 0) {
          showToast("Bạn chưa có câu làm sai nào cần ôn lại.");
          return;
        }
        await removePracticeSession(key);
        startQuizWithConfig({
          mode: "wrong_review",
          title: "Ôn tập câu hay sai",
          filterIds: new Set(state.wrongStats.keys()),
          shuffleQuestions: true,
          shuffleOptions: state.settings.shuffleOptions,
          durationMinutes: 0,
        });
      };
      if (saved) {
        openResumePrompt(saved, startFresh);
        return;
      }
      startFresh();
    });

    $("btn-quick-bookmarks").addEventListener("click", () => {
      const key = buildPracticeKey(state.activeDeckId, "bookmark_review");
      const saved = state.practiceSessions.get(key);
      const startFresh = async () => {
        if (state.bookmarks.size === 0) {
          showToast("Bạn chưa đánh dấu câu hỏi nào.");
          return;
        }
        await removePracticeSession(key);
        startQuizWithConfig({
          mode: "bookmark_review",
          title: "Ôn tập câu đã đánh dấu",
          filterIds: new Set(state.bookmarks),
          shuffleQuestions: false,
          shuffleOptions: false,
          durationMinutes: 0,
        });
      };
      if (saved) {
        openResumePrompt(saved, startFresh);
        return;
      }
      startFresh();
    });

    // Home: Resume practice banner (event delegation)
    $("resume-practice-list").addEventListener("click", async (e) => {
      const resumeBtn = e.target.closest(".btn-resume-session");
      if (resumeBtn) {
        resumePracticeSession(resumeBtn.dataset.resumeKey);
        return;
      }
      const delBtn = e.target.closest(".btn-delete-session");
      if (delBtn) {
        const key = delBtn.dataset.deleteKey;
        if (!confirm("Xóa tiến độ phiên ôn tập dở này?")) return;
        await removePracticeSession(key);
        renderHome();
        showToast("Đã xóa tiến độ phiên ôn tập.");
      }
    });

    // Modal: Resume / Restart practice
    $("btn-modal-resume").addEventListener("click", () => {
      const prompt = state.pendingResumePrompt;
      closeResumePrompt();
      if (prompt && prompt.key) resumePracticeSession(prompt.key);
    });
    $("btn-modal-restart").addEventListener("click", () => {
      const prompt = state.pendingResumePrompt;
      closeResumePrompt();
      if (prompt && typeof prompt.onRestart === "function") prompt.onRestart();
    });
    $("btn-modal-cancel").addEventListener("click", closeResumePrompt);
    $("resume-modal-backdrop").addEventListener("click", (e) => {
      if (e.target === $("resume-modal-backdrop")) closeResumePrompt();
    });

    // Quiz: Options (event delegation)
    $("quiz-options-container").addEventListener("click", (e) => {
      const btn = e.target.closest(".option-btn");
      if (!btn) return;
      selectOption(parseInt(btn.dataset.optIdx, 10));
    });

    // Quiz: Navigator grids (event delegation)
    ["navigator-grid-desktop", "navigator-grid-mobile"].forEach((gridId) => {
      $(gridId).addEventListener("click", (e) => {
        const btn = e.target.closest(".nav-q-btn");
        if (!btn) return;
        goToQuestion(parseInt(btn.dataset.navIdx, 10));
        closeMobileDrawer();
      });
    });

    // Quiz: Prev / Next / Submit / Exit / Flag / Bookmark
    $("btn-prev-desktop").addEventListener("click", () => goToQuestion(state.session.currentIndex - 1));
    $("btn-prev-mobile").addEventListener("click", () => goToQuestion(state.session.currentIndex - 1));
    $("btn-next-desktop").addEventListener("click", () => goToQuestion(state.session.currentIndex + 1));
    $("btn-next-mobile").addEventListener("click", () => goToQuestion(state.session.currentIndex + 1));

    const handleSubmitClick = () => {
      if (!state.session) return;
      const unanswered = state.session.answers.filter((a) => !isQuestionAnswered(a)).length;
      if (unanswered > 0 && !confirm(`Bạn còn ${unanswered} câu chưa trả lời. Xác nhận nộp bài?`)) {
        return;
      }
      submitCurrentQuiz();
    };
    $("btn-submit-desktop").addEventListener("click", handleSubmitClick);
    $("btn-submit-mobile").addEventListener("click", handleSubmitClick);

    $("btn-quiz-exit").addEventListener("click", () => {
      if (state.session && isPracticeMode(state.session.mode)) {
        const saved = saveActivePracticeSession();
        global.QuizEngine.stopTimer();
        state.session = null;
        state.activePracticeKey = null;
        renderHome();
        switchView("home");
        if (saved) {
          showToast(
            `Đã lưu tiến độ ôn tập (${saved.answeredCount}/${saved.totalQuestions} câu).`,
            "success"
          );
        }
        return;
      }
      if (confirm("Thoát bài làm hiện tại? Tiến độ bài này sẽ không được lưu.")) {
        global.QuizEngine.stopTimer();
        state.session = null;
        state.activePracticeKey = null;
        renderHome();
        switchView("home");
      }
    });

    $("btn-flag-question").addEventListener("click", () => {
      if (!state.session) return;
      const i = state.session.currentIndex;
      state.session.flagged[i] = !state.session.flagged[i];
      saveActivePracticeSession();
      renderQuizQuestion();
      renderNavigatorGrids();
    });

    $("btn-bookmark-question").addEventListener("click", async () => {
      if (!state.session) return;
      const q = state.session.questions[state.session.currentIndex];
      const willAdd = !state.bookmarks.has(q.id);
      try {
        await global.QuizDB.toggleBookmark(q.id, willAdd);
        if (willAdd) state.bookmarks.add(q.id);
        else state.bookmarks.delete(q.id);
        renderQuizQuestion();
        showToast(willAdd ? "Đã lưu câu hỏi." : "Đã bỏ lưu câu hỏi.");
      } catch (err) {
        showToast("Không thể cập nhật đánh dấu.", "error");
      }
    });

    // Mobile drawer
    $("btn-open-drawer").addEventListener("click", openMobileDrawer);
    $("btn-close-drawer").addEventListener("click", closeMobileDrawer);
    $("mobile-drawer-backdrop").addEventListener("click", (e) => {
      if (e.target === $("mobile-drawer-backdrop")) closeMobileDrawer();
    });

    // Keyboard shortcuts on Desktop
    document.addEventListener("keydown", (e) => {
      if ($("view-quiz").classList.contains("hidden") || !state.session) return;
      const key = e.key.toLowerCase();
      if (key === "arrowleft") goToQuestion(state.session.currentIndex - 1);
      else if (key === "arrowright") goToQuestion(state.session.currentIndex + 1);
      else if (["1", "2", "3", "4", "a", "b", "c", "d"].includes(key)) {
        const map = { 1: 0, a: 0, 2: 1, b: 1, 3: 2, c: 2, 4: 3, d: 3 };
        const idx = map[key];
        const q = state.session.questions[state.session.currentIndex];
        if (idx < q.options.length) selectOption(idx);
      }
    });

    // Tự động lưu khi ẩn tab hoặc chuyển app trên điện thoại
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        saveActivePracticeSession();
      }
    });

    // Result view
    document.querySelectorAll(".res-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.resultFilter = btn.dataset.filter;
        renderResultDetails();
      });
    });

    $("btn-retry-wrong").addEventListener("click", async () => {
      if (!state.lastResult || state.lastResult.wrongQuestionIds.length === 0) return;
      await removePracticeSession(buildPracticeKey(state.activeDeckId, "wrong_review"));
      startQuizWithConfig({
        mode: "wrong_review",
        title: "Ôn lại các câu sai",
        filterIds: new Set(state.lastResult.wrongQuestionIds),
        shuffleQuestions: true,
        shuffleOptions: state.settings.shuffleOptions,
        durationMinutes: 0,
      });
    });

    $("btn-retry-same").addEventListener("click", () => {
      if (state.lastConfig) startQuizWithConfig(state.lastConfig);
    });

    $("btn-result-home").addEventListener("click", () => {
      renderHome();
      switchView("home");
    });

    // Import view
    $("btn-import-back").addEventListener("click", () => {
      renderHome();
      switchView("home");
    });

    $("input-import-excel").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      handleImportFileSelected(file);
    });

    $("btn-confirm-import").addEventListener("click", async () => {
      if (!state.pendingImportData) return;
      showLoading("Đang cập nhật toàn bộ đề...");
      try {
        const record = await global.QuizDB.saveCustomQuestionBank(state.pendingImportData);
        await global.QuizDB.clearPracticeSessionsByDeck("TC B4");
        Array.from(state.practiceSessions.keys()).forEach((k) => {
          if (state.practiceSessions.get(k)?.deckId === "TC B4") state.practiceSessions.delete(k);
        });
        state.bank = record.data;
        state.isCustomBank = true;
        state.bankUpdatedAt = record.updatedAt;
        state.selectedSections = new Set(state.bank.sections.map((s) => s.id));
        state.pendingImportData = null;
        renderImportView();
        renderHome();
        showToast(`Đã cập nhật thành công ${state.bank.questions.length} câu hỏi!`, "success");
      } catch (err) {
        showToast(err.message || "Lỗi khi lưu bộ đề.", "error");
      } finally {
        hideLoading();
      }
    });

    $("btn-cancel-import").addEventListener("click", () => {
      state.pendingImportData = null;
      $("import-preview-box").classList.add("hidden");
    });

    $("btn-restore-default-bank").addEventListener("click", async () => {
      if (!confirm("Khôi phục lại bộ đề mặc định ban đầu?")) return;
      showLoading("Đang khôi phục...");
      try {
        await global.QuizDB.clearCustomQuestionBank();
        await global.QuizDB.clearPracticeSessionsByDeck("TC B4");
        Array.from(state.practiceSessions.keys()).forEach((k) => {
          if (state.practiceSessions.get(k)?.deckId === "TC B4") state.practiceSessions.delete(k);
        });
        state.bank = global.QUIZ_DATA;
        state.isCustomBank = false;
        state.bankUpdatedAt = global.QUIZ_DATA.meta?.generatedAt || null;
        state.selectedSections = new Set(state.bank.sections.map((s) => s.id));
        renderImportView();
        renderHome();
        showToast("Đã khôi phục bộ đề mặc định.", "success");
      } catch (err) {
        showToast("Lỗi khi khôi phục bộ đề.", "error");
      } finally {
        hideLoading();
      }
    });

    // History & Backup view
    $("btn-history-back").addEventListener("click", () => {
      renderHome();
      switchView("home");
    });

    $("btn-clear-history").addEventListener("click", async () => {
      if (!confirm("Xóa toàn bộ lịch sử làm bài?")) return;
      await global.QuizDB.clearExamHistory();
      await renderHistoryView();
      showToast("Đã xóa lịch sử.");
    });

    $("btn-export-json").addEventListener("click", async () => {
      try {
        const payload = await global.QuizDB.exportAllData();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `trac-nghiem-tc4-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast("Đã xuất file sao lưu JSON.", "success");
      } catch (err) {
        showToast("Lỗi khi xuất sao lưu.", "error");
      }
    });

    $("input-import-backup").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      showLoading("Đang khôi phục dữ liệu...");
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        await global.QuizDB.importBackupData(parsed);
        await loadAppData();
        await renderHistoryView();
        showToast("Khôi phục dữ liệu thành công!", "success");
      } catch (err) {
        showToast(err.message || "File sao lưu không hợp lệ.", "error");
      } finally {
        hideLoading();
        e.target.value = "";
      }
    });
  }

  // Khởi động ứng dụng
  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    loadAppData();
  });
})(window);
