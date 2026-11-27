/**
 * Lớp quản lý lưu trữ IndexedDB riêng cho ứng dụng BHPP 2026 (19 bộ đề).
 */
(function (global) {
  "use strict";

  const DB_NAME = "bhpp_2026_quiz_db";
  const DB_VERSION = 2;
  const SETTINGS_KEY = "bhpp_2026_settings_v1";
  const IO_TIMEOUT_MS = 10000;

  const STORES = {
    DECKS: "custom_decks",
    HISTORY: "exam_history",
    BOOKMARKS: "bookmarks",
    WRONG_STATS: "wrong_stats",
    PRACTICE_SESSIONS: "practice_sessions",
  };

  let dbInstance = null;

  function withTimeout(promise, ms = IO_TIMEOUT_MS, label = "Thao tác lưu trữ") {
    let timerId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error(`${label} quá thời gian (${ms}ms).`));
      }, ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timerId !== null) clearTimeout(timerId);
    });
  }

  function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);
    if (!global.indexedDB) {
      return Promise.reject(new Error("Trình duyệt không hỗ trợ IndexedDB."));
    }

    const promise = new Promise((resolve, reject) => {
      try {
        const request = global.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORES.DECKS)) {
            db.createObjectStore(STORES.DECKS, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(STORES.HISTORY)) {
            const histStore = db.createObjectStore(STORES.HISTORY, { keyPath: "id" });
            histStore.createIndex("createdAt", "createdAt", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.BOOKMARKS)) {
            db.createObjectStore(STORES.BOOKMARKS, { keyPath: "questionId" });
          }
          if (!db.objectStoreNames.contains(STORES.WRONG_STATS)) {
            db.createObjectStore(STORES.WRONG_STATS, { keyPath: "questionId" });
          }
          if (!db.objectStoreNames.contains(STORES.PRACTICE_SESSIONS)) {
            const psStore = db.createObjectStore(STORES.PRACTICE_SESSIONS, { keyPath: "key" });
            psStore.createIndex("updatedAt", "updatedAt", { unique: false });
          }
        };

        request.onsuccess = (event) => {
          dbInstance = event.target.result;
          dbInstance.onclose = () => {
            dbInstance = null;
          };
          resolve(dbInstance);
        };

        request.onerror = () => reject(request.error || new Error("Không thể mở IndexedDB."));
      } catch (err) {
        reject(err);
      }
    });

    return withTimeout(promise, IO_TIMEOUT_MS, "Mở IndexedDB");
  }

  async function runTx(storeName, mode, operation) {
    const db = await openDB();
    const promise = new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = operation(store);

        if (req && typeof req === "object" && "onsuccess" in req) {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new Error(`Lỗi IndexedDB trên ${storeName}`));
        } else {
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error || new Error(`Lỗi transaction trên ${storeName}`));
        }
      } catch (err) {
        reject(err);
      }
    });
    return withTimeout(promise, IO_TIMEOUT_MS, `IndexedDB ${storeName}`);
  }

  const DEFAULT_SETTINGS = {
    darkMode: false,
    fontSize: "normal",
    shuffleQuestions: true,
    shuffleOptions: true,
    allocationMode: "ratio",
    totalQuestions: 40,
    selectedDeckId: "TC B1",
    selectedGroup: "ALL",
    deckRatios: {}, // { [deckId]: { [secId]: pct } }
  };

  function getSettings() {
    try {
      const raw = global.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (_) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(partial) {
    try {
      const next = { ...getSettings(), ...partial };
      global.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    } catch (_) {
      return { ...DEFAULT_SETTINGS, ...partial };
    }
  }

  async function getCustomDecks() {
    try {
      const record = await runTx(STORES.DECKS, "readonly", (store) => store.get("custom_bhpp"));
      return record || null;
    } catch (_) {
      return null;
    }
  }

  async function saveCustomDecks(bhppData) {
    const record = {
      id: "custom_bhpp",
      data: bhppData,
      updatedAt: new Date().toISOString(),
    };
    await runTx(STORES.DECKS, "readwrite", (store) => store.put(record));
    return record;
  }

  async function clearCustomDecks() {
    await runTx(STORES.DECKS, "readwrite", (store) => store.delete("custom_bhpp"));
  }

  async function saveExamHistory(entry) {
    await runTx(STORES.HISTORY, "readwrite", (store) => store.put(entry));
    return entry;
  }

  async function getExamHistory() {
    try {
      const list = await runTx(STORES.HISTORY, "readonly", (store) => store.getAll());
      return (list || []).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    } catch (_) {
      return [];
    }
  }

  async function clearExamHistory() {
    await runTx(STORES.HISTORY, "readwrite", (store) => store.clear());
  }

  async function getBookmarks() {
    try {
      const rows = await runTx(STORES.BOOKMARKS, "readonly", (store) => store.getAll());
      return new Set((rows || []).map((r) => r.questionId));
    } catch (_) {
      return new Set();
    }
  }

  async function toggleBookmark(questionId, shouldAdd) {
    if (shouldAdd) {
      await runTx(STORES.BOOKMARKS, "readwrite", (store) =>
        store.put({ questionId, createdAt: new Date().toISOString() })
      );
    } else {
      await runTx(STORES.BOOKMARKS, "readwrite", (store) => store.delete(questionId));
    }
  }

  async function getWrongStats() {
    try {
      const rows = await runTx(STORES.WRONG_STATS, "readonly", (store) => store.getAll());
      const map = new Map();
      for (const r of rows || []) map.set(r.questionId, r);
      return map;
    } catch (_) {
      return new Map();
    }
  }

  async function recordWrongQuestions(questionIds) {
    if (!questionIds || questionIds.length === 0) return;
    const currentMap = await getWrongStats();
    const db = await openDB();
    const now = new Date().toISOString();

    await withTimeout(
      new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORES.WRONG_STATS, "readwrite");
          const store = tx.objectStore(STORES.WRONG_STATS);
          for (const qId of questionIds) {
            const existing = currentMap.get(qId);
            store.put({
              questionId: qId,
              wrongCount: existing ? existing.wrongCount + 1 : 1,
              lastWrongAt: now,
            });
          }
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        } catch (err) {
          reject(err);
        }
      }),
      IO_TIMEOUT_MS,
      "Cập nhật thống kê câu sai"
    );
  }

  // --- Phiên ôn tập đang dang dở (Auto-save & Resume) ---
  async function getPracticeSessions() {
    try {
      const list = await runTx(STORES.PRACTICE_SESSIONS, "readonly", (store) => store.getAll());
      return (list || []).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    } catch (err) {
      console.warn("Không đọc được phiên ôn tập dở dang:", err);
      return [];
    }
  }

  async function savePracticeSession(record) {
    if (!record || !record.key) return null;
    const payload = {
      ...record,
      updatedAt: record.updatedAt || new Date().toISOString(),
    };
    await runTx(STORES.PRACTICE_SESSIONS, "readwrite", (store) => store.put(payload));
    return payload;
  }

  async function deletePracticeSession(key) {
    if (!key) return;
    await runTx(STORES.PRACTICE_SESSIONS, "readwrite", (store) => store.delete(key));
  }

  async function clearPracticeSessions() {
    await runTx(STORES.PRACTICE_SESSIONS, "readwrite", (store) => store.clear());
  }

  async function exportAllData() {
    const [customDecks, history, bookmarksSet, wrongMap, practiceSessions] = await Promise.all([
      getCustomDecks(),
      getExamHistory(),
      getBookmarks(),
      getWrongStats(),
      getPracticeSessions(),
    ]);

    return {
      app: "bhpp-2026-trac-nghiem",
      version: 2,
      exportedAt: new Date().toISOString(),
      settings: getSettings(),
      customDecks: customDecks ? customDecks.data : null,
      history,
      bookmarks: Array.from(bookmarksSet),
      wrongStats: Array.from(wrongMap.values()),
      practiceSessions,
    };
  }

  async function importBackupData(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("File sao lưu JSON không hợp lệ.");
    }
    if (Array.isArray(payload.decks)) {
      await saveCustomDecks(payload);
      return { type: "decks" };
    }
    if (payload.settings) saveSettings(payload.settings);
    if (payload.customDecks && Array.isArray(payload.customDecks.decks)) {
      await saveCustomDecks(payload.customDecks);
    }
    if (Array.isArray(payload.history)) {
      for (const h of payload.history) {
        if (h && h.id) await saveExamHistory(h);
      }
    }
    if (Array.isArray(payload.bookmarks)) {
      for (const qId of payload.bookmarks) {
        if (qId) await toggleBookmark(qId, true);
      }
    }
    if (Array.isArray(payload.wrongStats)) {
      const db = await openDB();
      await withTimeout(
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORES.WRONG_STATS, "readwrite");
          const store = tx.objectStore(STORES.WRONG_STATS);
          for (const item of payload.wrongStats) {
            if (item && item.questionId) store.put(item);
          }
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        }),
        IO_TIMEOUT_MS,
        "Khôi phục thống kê câu sai"
      );
    }
    if (Array.isArray(payload.practiceSessions)) {
      const db = await openDB();
      await withTimeout(
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORES.PRACTICE_SESSIONS, "readwrite");
          const store = tx.objectStore(STORES.PRACTICE_SESSIONS);
          for (const item of payload.practiceSessions) {
            if (item && item.key) store.put(item);
          }
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        }),
        IO_TIMEOUT_MS,
        "Khôi phục phiên ôn tập dở dang"
      );
    }
    return { type: "full_backup" };
  }

  global.BhppDB = {
    getSettings,
    saveSettings,
    getCustomDecks,
    saveCustomDecks,
    clearCustomDecks,
    saveExamHistory,
    getExamHistory,
    clearExamHistory,
    getBookmarks,
    toggleBookmark,
    getWrongStats,
    recordWrongQuestions,
    getPracticeSessions,
    savePracticeSession,
    deletePracticeSession,
    clearPracticeSessions,
    exportAllData,
    importBackupData,
  };
})(window);
