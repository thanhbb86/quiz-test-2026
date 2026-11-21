/**
 * Điều phối ứng dụng Ngân hàng đề thi BHPP 2026 (19 bộ đề theo chức danh & bậc).
 */
(function (global) {
  "use strict";

  const state = {
    catalog: null, // { meta, decks }
    activeDeck: null,
    isCustomBank: false,
    bankUpdatedAt: null,
    settings: null,
    selectedGroup: "ALL",
    selectedMode: "exam",
    allocationMode: "ratio",
    sectionRatios: {},
    selectedSections: new Set(),
    bookmarks: new Set(),
    wrongStats: new Map(),
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

  function applySettings() {
    const { darkMode, fontSize, shuffleQuestions, shuffleOptions } = state.settings;
    document.documentElement.classList.toggle("dark", Boolean(darkMode));
    $("btn-theme-toggle").textContent = darkMode ? "☀️" : "🌙";

    document.body.classList.remove("font-small", "font-normal", "font-large");
    document.body.classList.add(`font-${fontSize || "normal"}`);

    $("cfg-shuffle-q").checked = Boolean(shuffleQuestions);
    $("cfg-shuffle-opt").checked = Boolean(shuffleOptions);
  }

  function switchView(viewName) {
    ["home", "quiz", "result", "import", "history"].forEach((v) => {
      const el = $(`view-${v}`);
      if (el) el.classList.toggle("hidden", v !== viewName);
    });
    if (viewName !== "quiz") {
      global.QuizEngine.stopTimer();
      closeMobileDrawer();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // --- Quản lý chọn bộ đề ---
  function selectDeck(deckId, save = true) {
    const decks = state.catalog?.decks || [];
    const found = decks.find((d) => d.id === deckId) || decks[0];
    if (!found) return;

    state.activeDeck = found;
    state.selectedSections = new Set(found.sections.map((s) => s.id));
    const savedDeckRatios = (state.settings.deckRatios && state.settings.deckRatios[found.id]) || {};
    state.sectionRatios = { ...savedDeckRatios };

    if (save) {
      state.settings = global.BhppDB.saveSettings({ selectedDeckId: found.id });
    }
    syncSectionRatiosIfEmpty();
    renderHome();
  }

  function saveCurrentDeckRatios() {
    if (!state.activeDeck) return;
    const allDeckRatios = { ...(state.settings.deckRatios || {}) };
    allDeckRatios[state.activeDeck.id] = { ...state.sectionRatios };
    state.settings = global.BhppDB.saveSettings({ deckRatios: allDeckRatios });
  }

  function syncSectionRatiosIfEmpty() {
    if (!state.activeDeck) return;
    const hasAny = state.activeDeck.sections.some((s) => Number(state.sectionRatios[s.id]) > 0);
    if (!hasAny) applyProportionalRatios(false);
  }

  function applyProportionalRatios(save = true) {
    const selected = state.activeDeck.sections.filter((s) => state.selectedSections.has(s.id));
    const totalQ = selected.reduce((sum, s) => sum + s.questionCount, 0);
    const nextRatios = {};
    state.activeDeck.sections.forEach((s) => {
      nextRatios[s.id] =
        !state.selectedSections.has(s.id) || totalQ === 0
          ? 0
          : Math.round((s.questionCount / totalQ) * 1000) / 10;
    });
    state.sectionRatios = nextRatios;
    if (save) saveCurrentDeckRatios();
  }

  function applyEqualRatios(save = true) {
    const selected = state.activeDeck.sections.filter((s) => state.selectedSections.has(s.id));
    const each = selected.length > 0 ? Math.round((100 / selected.length) * 10) / 10 : 0;
    const nextRatios = {};
    state.activeDeck.sections.forEach((s) => {
      nextRatios[s.id] = state.selectedSections.has(s.id) ? each : 0;
    });
    state.sectionRatios = nextRatios;
    if (save) saveCurrentDeckRatios();
  }

  function getPreviewAllocation() {
    const secPools = new Map();
    state.activeDeck.sections.forEach((s) => secPools.set(s.id, new Array(s.questionCount)));
    const selectedIds = Array.from(state.selectedSections);
    const limit = parseInt($("cfg-limit").value, 10) || 0;
    return global.QuizEngine.computeRatioCounts(secPools, selectedIds, limit, state.sectionRatios);
  }

  // --- Tải dữ liệu ban đầu ---
  async function loadAppData() {
    showLoading("Đang tải 19 bộ đề BHPP 2026...");
    try {
      state.settings = global.BhppDB.getSettings();
      applySettings();

      const [customRecord, bookmarks, wrongStats] = await Promise.all([
        global.BhppDB.getCustomDecks(),
        global.BhppDB.getBookmarks(),
        global.BhppDB.getWrongStats(),
      ]);

      state.bookmarks = bookmarks;
      state.wrongStats = wrongStats;

      if (customRecord && customRecord.data && Array.isArray(customRecord.data.decks)) {
        state.catalog = customRecord.data;
        state.isCustomBank = true;
        state.bankUpdatedAt = customRecord.updatedAt;
      } else if (global.BHPP_DATA && Array.isArray(global.BHPP_DATA.decks)) {
        state.catalog = global.BHPP_DATA;
        state.isCustomBank = false;
        state.bankUpdatedAt = global.BHPP_DATA.meta?.generatedAt || null;
      } else {
        throw new Error("Không tìm thấy dữ liệu BHPP 2026.");
      }

      state.allocationMode = state.settings.allocationMode || "ratio";
      state.selectedGroup = state.settings.selectedGroup || "ALL";
      $("cfg-limit").value =
        state.settings.totalQuestions !== undefined ? String(state.settings.totalQuestions) : "40";

      selectDeck(state.settings.selectedDeckId || state.catalog.decks[0]?.id, false);
    } catch (err) {
      console.error(err);
      showToast(err.message || "Lỗi tải dữ liệu.", "error");
    } finally {
      hideLoading();
    }
  }

  // --- Render Bộ chọn đề & Trang chủ ---
  function renderDeckSelector() {
    const decks = state.catalog.decks;
    const selectEl = $("deck-select");
    selectEl.innerHTML = decks
      .map(
        (d) =>
          `<option value="${escapeHtml(d.id)}" ${d.id === state.activeDeck.id ? "selected" : ""}>${escapeHtml(
            d.name
          )} — ${escapeHtml(d.group)} (${d.totalQuestions} câu)</option>`
      )
      .join("");
  }

  function getActiveDeckQuestionIds() {
    return new Set(state.activeDeck.questions.map((q) => q.id));
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
        : "limit-preset-btn px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800";
    });

    if (isRatio) {
      let totalPct = 0;
      state.activeDeck.sections.forEach((s) => {
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

  function renderHome() {
    if (!state.activeDeck) return;
    const deck = state.activeDeck;
    const deckQIds = getActiveDeckQuestionIds();

    let wrongInDeck = 0;
    state.wrongStats.forEach((_, qId) => {
      if (deckQIds.has(qId)) wrongInDeck += 1;
    });
    let bmInDeck = 0;
    state.bookmarks.forEach((qId) => {
      if (deckQIds.has(qId)) bmInDeck += 1;
    });

    $("header-bank-badge").textContent = `${deck.name} • ${deck.totalQuestions} câu • ${deck.totalSections} chuyên đề`;
    $("stat-deck-name").textContent = `Bộ đề: ${deck.name}`;
    $("stat-total-questions").textContent = deck.totalQuestions;
    $("stat-total-sections").textContent = `${deck.totalSections} chuyên đề (${deck.group})`;
    $("stat-wrong-count").textContent = wrongInDeck;
    $("stat-bookmark-count").textContent = bmInDeck;

    renderDeckSelector();
    updateAllocationUI();
    renderSectionList();
    updateSelectedSectionSummary();
  }

  function renderSectionList() {
    const container = $("section-list");
    container.innerHTML = "";
    const isRatio = state.allocationMode === "ratio";
    const countsMap = isRatio ? getPreviewAllocation() : null;

    state.activeDeck.sections.forEach((sec) => {
      const checked = state.selectedSections.has(sec.id);
      const ratioVal = state.sectionRatios[sec.id] ?? 0;
      const picked = countsMap ? countsMap.get(sec.id) || 0 : 0;

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
            <div class="text-[11px] text-slate-400">Ngân hàng: ${sec.questionCount} câu</div>
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
            : `<span class="px-2 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">${sec.questionCount} câu</span>`
        }
      `;
      container.appendChild(row);
    });
  }

  function updateSelectedSectionSummary() {
    const total = state.activeDeck.sections.length;
    const count = state.selectedSections.size;
    $("selected-section-summary").textContent =
      count === total ? `Tất cả (${total})` : `${count}/${total} chuyên đề`;
  }

  // --- Bắt đầu làm bài ---
  function startQuizWithConfig(config) {
    try {
      state.lastConfig = config;
      state.session = global.QuizEngine.createSession({
        allQuestions: state.activeDeck.questions,
        ...config,
      });

      switchView("quiz");
      renderQuizQuestion();
      renderNavigatorGrids();

      if (state.session.durationSec > 0) {
        $("quiz-timer-box").classList.remove("hidden");
        $("quiz-timer-value").textContent = global.QuizEngine.formatDuration(state.session.remainingSec);
        global.QuizEngine.startTimer(
          state.session,
          (rem) => {
            $("quiz-timer-value").textContent = global.QuizEngine.formatDuration(rem);
            if (rem <= 60) $("quiz-timer-box").classList.add("animate-pulse");
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

  function renderQuizQuestion() {
    const session = state.session;
    if (!session) return;

    const idx = session.currentIndex;
    const q = session.questions[idx];
    const total = session.questions.length;
    const userAnswer = session.answers[idx];
    const isPractice =
      session.mode === "practice" || session.mode === "wrong_review" || session.mode === "bookmark_review";

    $("quiz-progress-text").textContent = `[${state.activeDeck.name}] Câu ${idx + 1} / ${total}`;
    $("quiz-progress-bar").style.width = `${Math.round(((idx + 1) / total) * 100)}%`;
    $("quiz-section-badge").textContent = `${q.sectionId}. ${q.sectionTitle}`;
    $("quiz-question-text").textContent = `Câu ${q.number}: ${q.text}`;

    const isFlagged = session.flagged[idx];
    $("btn-flag-question").className = isFlagged
      ? "px-2.5 py-1 rounded-lg text-xs font-semibold border border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-700"
      : "px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700";
    $("btn-flag-question").textContent = isFlagged ? "🚩 Đã đánh dấu" : "🚩 Xem lại";

    const isBookmarked = state.bookmarks.has(q.id);
    $("btn-bookmark-question").className = isBookmarked
      ? "px-2.5 py-1 rounded-lg text-xs font-semibold border border-brand-400 bg-brand-50 dark:bg-brand-950/40 text-brand-700"
      : "px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700";
    $("btn-bookmark-question").textContent = isBookmarked ? "★ Đã lưu" : "☆ Lưu";

    const container = $("quiz-options-container");
    container.innerHTML = "";
    const feedbackEl = $("quiz-practice-feedback");
    feedbackEl.classList.add("hidden");

    q.options.forEach((opt, optIdx) => {
      const isSelected = userAnswer === optIdx;
      const showImmediate = isPractice && userAnswer !== null;
      const isCorrectOpt = optIdx === q.correctIndex;

      let btnStyle = "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-400";
      let badgeStyle = "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200";

      if (showImmediate) {
        if (isCorrectOpt) {
          btnStyle = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100";
          badgeStyle = "bg-emerald-600 text-white";
        } else if (isSelected && !isCorrectOpt) {
          btnStyle = "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100";
          badgeStyle = "bg-rose-600 text-white";
        }
      } else if (isSelected) {
        btnStyle = "border-brand-600 bg-brand-50/70 dark:bg-brand-950/40 ring-1 ring-brand-600";
        badgeStyle = "bg-brand-600 text-white";
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.optIdx = String(optIdx);
      btn.className = `option-btn w-full p-3.5 rounded-xl border-2 text-left flex items-start gap-3 ${btnStyle}`;
      btn.innerHTML = `
        <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${badgeStyle}">${escapeHtml(opt.label)}</span>
        <span class="quiz-text flex-1">${escapeHtml(opt.text)}</span>
      `;
      container.appendChild(btn);
    });

    if (isPractice && userAnswer !== null) {
      const correctOpt = q.options[q.correctIndex];
      const isRight = userAnswer === q.correctIndex;
      feedbackEl.classList.remove("hidden");
      feedbackEl.className = isRight
        ? "p-3.5 rounded-xl text-sm font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200"
        : "p-3.5 rounded-xl text-sm font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200";
      feedbackEl.textContent = isRight
        ? "✓ Chính xác!"
        : `✗ Chưa đúng. Đáp án đúng là ${correctOpt ? correctOpt.label : ""}: ${correctOpt ? correctOpt.text : ""}`;
    }

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

  function renderNavigatorGrids() {
    const session = state.session;
    if (!session) return;
    const answered = session.answers.filter((a) => a !== null).length;
    $("nav-answered-count").textContent = `${answered}/${session.questions.length} đã làm`;

    const html = session.questions
      .map((_, idx) => {
        const isCurrent = idx === session.currentIndex;
        const isAnswered = session.answers[idx] !== null;
        const isFlagged = session.flagged[idx];
        let cls = "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200";
        if (isFlagged) cls = "bg-amber-400 text-slate-900 font-bold border-amber-500";
        else if (isAnswered) cls = "bg-brand-600 text-white font-semibold border-brand-600";
        if (isCurrent) cls += " ring-2 ring-offset-1 ring-slate-900 dark:ring-white";
        return `<button type="button" data-nav-idx="${idx}" class="nav-q-btn h-9 rounded-lg text-xs font-medium ${cls}">${idx + 1}</button>`;
      })
      .join("");

    $("navigator-grid-desktop").innerHTML = html;
    $("navigator-grid-mobile").innerHTML = html;
  }

  function selectOption(optIdx) {
    if (!state.session || state.session.submitted) return;
    state.session.answers[state.session.currentIndex] = optIdx;
    renderQuizQuestion();
    renderNavigatorGrids();
  }

  function goToQuestion(idx) {
    if (!state.session) return;
    const max = state.session.questions.length - 1;
    state.session.currentIndex = Math.max(0, Math.min(max, idx));
    renderQuizQuestion();
    renderNavigatorGrids();
  }

  async function submitCurrentQuiz() {
    if (!state.session || state.session.submitted) return;
    const result = global.QuizEngine.gradeSession(state.session);
    state.lastResult = result;
    state.resultFilter = "all";

    try {
      await Promise.all([
        global.BhppDB.saveExamHistory({
          id: result.id,
          deckId: state.activeDeck.id,
          mode: result.mode,
          title: `[${state.activeDeck.name}] ${result.title}`,
          totalQuestions: result.totalQuestions,
          correctCount: result.correctCount,
          scorePercent: result.scorePercent,
          spentSec: result.spentSec,
          createdAt: result.createdAt,
        }),
        global.BhppDB.recordWrongQuestions(result.wrongQuestionIds),
      ]);
      state.wrongStats = await global.BhppDB.getWrongStats();
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
    $("result-summary-text").textContent = `Bộ đề ${state.activeDeck.name} • Đúng ${res.correctCount} / ${res.totalQuestions} câu • Thời gian: ${global.QuizEngine.formatDuration(res.spentSec)}`;
    $("btn-retry-wrong").classList.toggle("hidden", res.wrongQuestionIds.length === 0);

    $("result-section-breakdown").innerHTML = res.sectionBreakdown
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

        const optsHtml = q.options
          .map((opt, idx) => {
            const isCorrect = idx === q.correctIndex;
            const isUser = idx === d.userAnswer;
            let tag = "";
            let rowCls = "text-slate-600 dark:text-slate-300";
            if (isCorrect) {
              rowCls = "text-emerald-700 dark:text-emerald-300 font-semibold";
              tag = " ✓ (Đáp án đúng)";
            } else if (isUser) {
              rowCls = "text-rose-600 dark:text-rose-400 line-through";
              tag = " ✗ (Bạn chọn)";
            }
            return `<div class="text-xs sm:text-sm ${rowCls}">${escapeHtml(opt.label)}. ${escapeHtml(opt.text)}${tag}</div>`;
          })
          .join("");

        return `
          <div class="p-3.5 rounded-xl border ${statusCls} space-y-2">
            <div class="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>Câu ${d.index + 1} (Gốc: ${escapeHtml(q.sectionId)}-${q.number})</span>
              <span class="font-bold ${d.isCorrect ? "text-emerald-600" : "text-rose-600"}">${d.isCorrect ? "Đúng" : d.isAnswered ? "Sai" : "Bỏ qua"}</span>
            </div>
            <div class="text-sm font-semibold">${escapeHtml(q.text)}</div>
            <div class="space-y-1 pl-2 border-l-2 border-slate-200 dark:border-slate-700">${optsHtml}</div>
          </div>
        `;
      })
      .join("");
  }

  // --- Import View ---
  function renderImportView() {
    const meta = state.catalog.meta || {};
    $("import-current-status").textContent = state.isCustomBank ? "Đã cập nhật" : "Mặc định";
    $("import-current-info").innerHTML = `
      <div>• Nguồn: <strong>${escapeHtml(meta.sourceFile || "tai lieu thi trac nghiem BHPP 2026.xlsx")}</strong></div>
      <div>• Quy mô: <strong>${state.catalog.decks.length}</strong> bộ đề / tổng <strong>${meta.totalQuestions || 0}</strong> câu hỏi</div>
      <div>• Cập nhật lúc: ${state.bankUpdatedAt ? new Date(state.bankUpdatedAt).toLocaleString("vi-VN") : "Mặc định"}</div>
    `;
    $("btn-restore-default-bank").classList.toggle("hidden", !state.isCustomBank);
    $("import-preview-box").classList.add("hidden");
    state.pendingImportData = null;
  }

  async function handleImportFileSelected(file) {
    if (!file) return;
    showLoading("Đang phân tích file Excel nhiều sheet...");
    try {
      let parsed;
      if (file.name.toLowerCase().endsWith(".json")) {
        const json = JSON.parse(await file.text());
        if (!Array.isArray(json.decks)) throw new Error("File JSON không đúng định dạng BHPP 2026.");
        parsed = json;
      } else {
        parsed = await global.BhppExcelParser.parseMultiSheetExcel(file);
      }

      state.pendingImportData = parsed;
      $("import-preview-stats").innerHTML = `
        <div>• File: <strong>${escapeHtml(file.name)}</strong></div>
        <div>• Số bộ đề (sheet): <strong>${parsed.decks.length}</strong> bộ đề</div>
        <div>• Tổng câu hỏi: <strong>${parsed.meta.totalQuestions}</strong> câu</div>
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
      showToast("Đã phân tích xong file. Bấm Xác nhận để cập nhật.", "success");
    } catch (err) {
      showToast(err.message || "Không thể đọc file.", "error");
    } finally {
      hideLoading();
      $("input-import-excel").value = "";
    }
  }

  async function renderHistoryView() {
    const list = await global.BhppDB.getExamHistory();
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
          <div class="text-xs text-slate-500 mt-0.5">${new Date(h.createdAt).toLocaleString("vi-VN")} • ${h.correctCount}/${h.totalQuestions} câu • ${global.QuizEngine.formatDuration(h.spentSec)}</div>
        </div>
        <div class="text-base font-extrabold ${h.scorePercent >= 80 ? "text-emerald-600" : "text-brand-600"} shrink-0">${h.scorePercent}%</div>
      </div>
    `
      )
      .join("");
  }

  function openMobileDrawer() {
    $("mobile-drawer-backdrop").classList.remove("hidden");
  }
  function closeMobileDrawer() {
    $("mobile-drawer-backdrop").classList.add("hidden");
  }

  function bindEvents() {
    $("btn-logo-home").addEventListener("click", () => {
      renderHome();
      switchView("home");
    });
    $("btn-nav-import").addEventListener("click", () => {
      renderImportView();
      switchView("import");
    });
    $("btn-nav-history").addEventListener("click", async () => {
      await renderHistoryView();
      switchView("history");
    });
    $("btn-theme-toggle").addEventListener("click", () => {
      state.settings = global.BhppDB.saveSettings({ darkMode: !state.settings.darkMode });
      applySettings();
    });
    $("btn-font-cycle").addEventListener("click", () => {
      const order = ["small", "normal", "large"];
      const next = order[(order.indexOf(state.settings.fontSize) + 1) % order.length];
      state.settings = global.BhppDB.saveSettings({ fontSize: next });
      applySettings();
      showToast(`Cỡ chữ: ${next === "small" ? "Nhỏ" : next === "large" ? "Lớn" : "Vừa"}`);
    });

    // Deck selector events
    $("deck-select").addEventListener("change", (e) => {
      selectDeck(e.target.value, true);
    });

    // Mode selection
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

    // Total questions & presets
    $("cfg-limit").addEventListener("input", () => {
      const val = Math.max(0, parseInt($("cfg-limit").value, 10) || 0);
      state.settings = global.BhppDB.saveSettings({ totalQuestions: val });
      updateAllocationUI();
      renderSectionList();
    });
    document.querySelectorAll(".limit-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = parseInt(btn.dataset.presetLimit, 10) || 0;
        $("cfg-limit").value = String(val);
        state.settings = global.BhppDB.saveSettings({ totalQuestions: val });
        updateAllocationUI();
        renderSectionList();
      });
    });

    // Allocation mode
    document.querySelectorAll(".alloc-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.allocationMode = btn.dataset.alloc;
        state.settings = global.BhppDB.saveSettings({ allocationMode: state.allocationMode });
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

    $("section-list").addEventListener("change", (e) => {
      const cb = e.target.closest(".sec-checkbox");
      if (!cb) return;
      const secId = cb.dataset.secId;
      if (cb.checked) state.selectedSections.add(secId);
      else state.selectedSections.delete(secId);
      updateSelectedSectionSummary();
      updateAllocationUI();
      renderSectionList();
    });

    $("section-list").addEventListener("input", (e) => {
      const inp = e.target.closest(".sec-ratio-input");
      if (!inp) return;
      const secId = inp.dataset.ratioSec;
      state.sectionRatios[secId] = Math.max(0, Math.min(100, parseFloat(inp.value) || 0));
      saveCurrentDeckRatios();
      updateAllocationUI();

      const countsMap = getPreviewAllocation();
      state.activeDeck.sections.forEach((s) => {
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
      state.selectedSections = new Set(state.activeDeck.sections.map((s) => s.id));
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

    $("btn-start-quiz").addEventListener("click", () => {
      if (state.selectedSections.size === 0) {
        showToast("Vui lòng chọn ít nhất 1 chuyên đề.", "warning");
        return;
      }
      const shuffleQuestions = $("cfg-shuffle-q").checked;
      const shuffleOptions = $("cfg-shuffle-opt").checked;
      const limit = Math.max(0, parseInt($("cfg-limit").value, 10) || 0);
      state.settings = global.BhppDB.saveSettings({
        shuffleQuestions,
        shuffleOptions,
        totalQuestions: limit,
        allocationMode: state.allocationMode,
      });
      saveCurrentDeckRatios();

      const duration = parseInt($("cfg-duration").value, 10) || 0;
      startQuizWithConfig({
        mode: state.selectedMode,
        title: state.selectedMode === "practice" ? "Ôn tập" : "Thi thử",
        selectedSectionIds: Array.from(state.selectedSections),
        questionLimit: limit,
        shuffleQuestions,
        shuffleOptions,
        durationMinutes: state.selectedMode === "practice" ? 0 : duration,
        allocationMode: state.allocationMode,
        sectionRatios: { ...state.sectionRatios },
      });
    });

    $("btn-quick-wrong").addEventListener("click", () => {
      const deckQIds = getActiveDeckQuestionIds();
      const wrongInDeck = new Set();
      state.wrongStats.forEach((_, qId) => {
        if (deckQIds.has(qId)) wrongInDeck.add(qId);
      });
      if (wrongInDeck.size === 0) {
        showToast(`Bộ đề ${state.activeDeck.name} chưa có câu sai nào.`);
        return;
      }
      startQuizWithConfig({
        mode: "wrong_review",
        title: "Ôn câu hay sai",
        filterIds: wrongInDeck,
        shuffleQuestions: true,
        shuffleOptions: state.settings.shuffleOptions,
        durationMinutes: 0,
      });
    });

    $("btn-quick-bookmarks").addEventListener("click", () => {
      const deckQIds = getActiveDeckQuestionIds();
      const bmInDeck = new Set();
      state.bookmarks.forEach((qId) => {
        if (deckQIds.has(qId)) bmInDeck.add(qId);
      });
      if (bmInDeck.size === 0) {
        showToast(`Bộ đề ${state.activeDeck.name} chưa có câu đánh dấu nào.`);
        return;
      }
      startQuizWithConfig({
        mode: "bookmark_review",
        title: "Ôn câu đã đánh dấu",
        filterIds: bmInDeck,
        shuffleQuestions: false,
        shuffleOptions: false,
        durationMinutes: 0,
      });
    });

    // Quiz events
    $("quiz-options-container").addEventListener("click", (e) => {
      const btn = e.target.closest(".option-btn");
      if (btn) selectOption(parseInt(btn.dataset.optIdx, 10));
    });
    ["navigator-grid-desktop", "navigator-grid-mobile"].forEach((id) => {
      $(id).addEventListener("click", (e) => {
        const btn = e.target.closest(".nav-q-btn");
        if (!btn) return;
        goToQuestion(parseInt(btn.dataset.navIdx, 10));
        closeMobileDrawer();
      });
    });

    $("btn-prev-desktop").addEventListener("click", () => goToQuestion(state.session.currentIndex - 1));
    $("btn-prev-mobile").addEventListener("click", () => goToQuestion(state.session.currentIndex - 1));
    $("btn-next-desktop").addEventListener("click", () => goToQuestion(state.session.currentIndex + 1));
    $("btn-next-mobile").addEventListener("click", () => goToQuestion(state.session.currentIndex + 1));

    const handleSubmit = () => {
      if (!state.session) return;
      const unanswered = state.session.answers.filter((a) => a === null).length;
      if (unanswered > 0 && !confirm(`Bạn còn ${unanswered} câu chưa trả lời. Xác nhận nộp bài?`)) return;
      submitCurrentQuiz();
    };
    $("btn-submit-desktop").addEventListener("click", handleSubmit);
    $("btn-submit-mobile").addEventListener("click", handleSubmit);

    $("btn-quiz-exit").addEventListener("click", () => {
      if (confirm("Thoát bài làm hiện tại?")) {
        global.QuizEngine.stopTimer();
        state.session = null;
        renderHome();
        switchView("home");
      }
    });

    $("btn-flag-question").addEventListener("click", () => {
      if (!state.session) return;
      const i = state.session.currentIndex;
      state.session.flagged[i] = !state.session.flagged[i];
      renderQuizQuestion();
      renderNavigatorGrids();
    });

    $("btn-bookmark-question").addEventListener("click", async () => {
      if (!state.session) return;
      const q = state.session.questions[state.session.currentIndex];
      const willAdd = !state.bookmarks.has(q.id);
      await global.BhppDB.toggleBookmark(q.id, willAdd);
      if (willAdd) state.bookmarks.add(q.id);
      else state.bookmarks.delete(q.id);
      renderQuizQuestion();
      showToast(willAdd ? "Đã lưu câu hỏi." : "Đã bỏ lưu câu hỏi.");
    });

    $("btn-open-drawer").addEventListener("click", openMobileDrawer);
    $("btn-close-drawer").addEventListener("click", closeMobileDrawer);
    $("mobile-drawer-backdrop").addEventListener("click", (e) => {
      if (e.target === $("mobile-drawer-backdrop")) closeMobileDrawer();
    });

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

    // Result
    document.querySelectorAll(".res-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.resultFilter = btn.dataset.filter;
        renderResultDetails();
      });
    });
    $("btn-retry-wrong").addEventListener("click", () => {
      if (!state.lastResult || state.lastResult.wrongQuestionIds.length === 0) return;
      startQuizWithConfig({
        mode: "wrong_review",
        title: "Ôn lại câu sai",
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

    // Import
    $("btn-import-back").addEventListener("click", () => {
      renderHome();
      switchView("home");
    });
    $("input-import-excel").addEventListener("change", (e) => {
      handleImportFileSelected(e.target.files && e.target.files[0]);
    });
    $("btn-confirm-import").addEventListener("click", async () => {
      if (!state.pendingImportData) return;
      showLoading("Đang cập nhật toàn bộ đề...");
      try {
        const record = await global.BhppDB.saveCustomDecks(state.pendingImportData);
        state.catalog = record.data;
        state.isCustomBank = true;
        state.bankUpdatedAt = record.updatedAt;
        state.pendingImportData = null;
        selectDeck(state.catalog.decks[0]?.id, true);
        renderImportView();
        showToast(`Đã cập nhật ${state.catalog.decks.length} bộ đề!`, "success");
      } catch (err) {
        showToast(err.message || "Lỗi lưu dữ liệu.", "error");
      } finally {
        hideLoading();
      }
    });
    $("btn-cancel-import").addEventListener("click", () => {
      state.pendingImportData = null;
      $("import-preview-box").classList.add("hidden");
    });
    $("btn-restore-default-bank").addEventListener("click", async () => {
      if (!confirm("Khôi phục bộ đề mặc định BHPP 2026 (19 bộ đề)?")) return;
      await global.BhppDB.clearCustomDecks();
      state.catalog = global.BHPP_DATA;
      state.isCustomBank = false;
      state.bankUpdatedAt = global.BHPP_DATA.meta?.generatedAt || null;
      selectDeck(state.catalog.decks[0]?.id, true);
      renderImportView();
      showToast("Đã khôi phục bộ đề mặc định.", "success");
    });

    // History & Backup
    $("btn-history-back").addEventListener("click", () => {
      renderHome();
      switchView("home");
    });
    $("btn-clear-history").addEventListener("click", async () => {
      if (!confirm("Xóa toàn bộ lịch sử làm bài?")) return;
      await global.BhppDB.clearExamHistory();
      await renderHistoryView();
      showToast("Đã xóa lịch sử.");
    });
    $("btn-export-json").addEventListener("click", async () => {
      const payload = await global.BhppDB.exportAllData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bhpp-2026-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Đã xuất file sao lưu JSON.", "success");
    });
    $("input-import-backup").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      showLoading("Đang khôi phục dữ liệu...");
      try {
        const parsed = JSON.parse(await file.text());
        await global.BhppDB.importBackupData(parsed);
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

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    loadAppData();
  });
})(window);
