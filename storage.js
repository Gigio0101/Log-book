/* storage.js - persistenza locale (localStorage) */

const Store = (() => {
  const KEY = "logbook.v1";

  const nowISO = () => new Date().toISOString();
  const uid = () => Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);

  const defaultTypes = [
    "Petto", "Schiena", "Spalle", "Gambe", "Bicipiti", "Tricipiti",
    "Core", "Cardio", "Full Body", "Altro"
  ];

  const defaults = () => ({
    meta: { version: 1, createdAt: nowISO() },
    settings: {
      beep: true,
      vibrate: false
    },
    library: {
      types: defaultTypes,
      exercises: [
        // Esempi (puoi cancellarli)
        { id: uid(), name: "Panca piana bilanciere", type: "Petto", defaultRestSec: 120 },
        { id: uid(), name: "Lat Machine", type: "Schiena", defaultRestSec: 120 },
        { id: uid(), name: "Pressa 45°", type: "Gambe", defaultRestSec: 120 }
      ]
    },
    sessionDraft: null, // sessione in corso (non ancora salvata)
    history: [] // sessioni salvate
  });

  const load = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);

      // Migrazione minimale / robustezza
      const base = defaults();
      return {
        ...base,
        ...parsed,
        meta: { ...base.meta, ...(parsed.meta || {}) },
        settings: { ...base.settings, ...(parsed.settings || {}) },
        library: {
          types: (parsed.library && parsed.library.types) ? parsed.library.types : base.library.types,
          exercises: (parsed.library && parsed.library.exercises) ? parsed.library.exercises : base.library.exercises
        },
        history: Array.isArray(parsed.history) ? parsed.history : [],
        sessionDraft: parsed.sessionDraft || null
      };
    } catch (e) {
      console.warn("Load error, reset:", e);
      return defaults();
    }
  };

  const save = (state) => {
    localStorage.setItem(KEY, JSON.stringify(state));
  };

  const wipe = () => localStorage.removeItem(KEY);

  const exportJSON = (state) => {
    const payload = {
      exportedAt: nowISO(),
      data: state
    };
    return JSON.stringify(payload, null, 2);
  };

  const importJSON = (jsonText) => {
    const parsed = JSON.parse(jsonText);
    if (!parsed || !parsed.data) throw new Error("File non valido.");
    return parsed.data;
  };

  return { load, save, wipe, exportJSON, importJSON, uid, nowISO };
})();
