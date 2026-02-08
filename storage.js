/* storage.js - Logbook Pro (localStorage) */
const Store = (() => {
  const KEY = "logbook.pro.v2";

  const nowISO = () => new Date().toISOString();
  const uid = () => Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);

  const defaultTypes = [
    "Petto","Schiena","Spalle","Gambe","Bicipiti","Tricipiti","Core","Cardio","Full Body","Altro"
  ];

  const defaults = () => ({
    meta: { version: 2, createdAt: nowISO() },
    settings: {
      alertsEnabled: false,
      soundPreset: "alarm",
      soundVol: 85,           // 10..100
      soundRepeat: 2,         // 1..5
      vibrate: true,
      flash: true
    },
    library: {
      types: defaultTypes,
      exercises: [
        { id: uid(), name: "Panca piana bilanciere", type: "Petto", defaultRestSec: 120 },
        { id: uid(), name: "Lat Machine", type: "Schiena", defaultRestSec: 120 },
        { id: uid(), name: "Pressa 45°", type: "Gambe", defaultRestSec: 120 },
      ]
    },
    sessionDraft: null,
    history: []
  });

  const load = () => {
    try{
      const raw = localStorage.getItem(KEY);
      if(!raw) return defaults();
      const parsed = JSON.parse(raw);
      const base = defaults();
      return {
        ...base,
        ...parsed,
        meta: { ...base.meta, ...(parsed.meta||{}) },
        settings: { ...base.settings, ...(parsed.settings||{}) },
        library: {
          types: (parsed.library && parsed.library.types) ? parsed.library.types : base.library.types,
          exercises: (parsed.library && parsed.library.exercises) ? parsed.library.exercises : base.library.exercises
        },
        history: Array.isArray(parsed.history) ? parsed.history : [],
        sessionDraft: parsed.sessionDraft || null
      };
    }catch(e){
      console.warn("Load error:", e);
      return defaults();
    }
  };

  const save = (state) => localStorage.setItem(KEY, JSON.stringify(state));
  const wipe = () => localStorage.removeItem(KEY);

  const exportJSON = (state) => JSON.stringify({ exportedAt: nowISO(), data: state }, null, 2);
  const importJSON = (text) => {
    const parsed = JSON.parse(text);
    if(!parsed || !parsed.data) throw new Error("File non valido");
    return parsed.data;
  };

  return { load, save, wipe, exportJSON, importJSON, uid, nowISO };
})();
