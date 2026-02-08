/* storage.js - Logbook Pro (v3) - localStorage */
const Store = (() => {
  const KEY = "logbook.pro.v3";

  const nowISO = () => new Date().toISOString();
  const uid = () => Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);

  const defaultTypes = [
    "Petto","Schiena","Spalle","Gambe","Bicipiti","Tricipiti","Core","Cardio","Full Body","Altro"
  ];

  const defaultPrograms = () => ([
    {
      id: "push",
      name: "Push",
      color: "p1",
      items: [
        { id: uid(), name: "Chest Fly", type: "Petto", sets: 1, repsHint: "15", restSec: 75, notes: "No cedimento" },
        { id: uid(), name: "Panca piana bilanciere", type: "Petto", sets: 4, repsHint: "6–8", restSec: 120, notes: "" },
        { id: uid(), name: "Inclinata manubri", type: "Petto", sets: 3, repsHint: "8–10", restSec: 90, notes: "" },
        { id: uid(), name: "Shoulder Press", type: "Spalle", sets: 3, repsHint: "6–10", restSec: 120, notes: "" },
        { id: uid(), name: "Alzate laterali a tre vie", type: "Spalle", sets: 3, repsHint: "max", restSec: 70, notes: "" },
        { id: uid(), name: "Pushdown cavi", type: "Tricipiti", sets: 3, repsHint: "10–15", restSec: 70, notes: "Superset con estensioni" },
        { id: uid(), name: "Estensioni sopra testa", type: "Tricipiti", sets: 3, repsHint: "10–12", restSec: 70, notes: "Superset con pushdown" }
      ]
    },
    {
      id: "pull",
      name: "Pull",
      color: "p2",
      items: [
        { id: uid(), name: "Lat Machine", type: "Schiena", sets: 4, repsHint: "8–10", restSec: 120, notes: "" },
        { id: uid(), name: "Pulley", type: "Schiena", sets: 3, repsHint: "8–10", restSec: 90, notes: "" },
        { id: uid(), name: "Low Row", type: "Schiena", sets: 3, repsHint: "8–10", restSec: 120, notes: "" },
        { id: uid(), name: "Tirate al mento con corda", type: "Spalle", sets: 3, repsHint: "12–15", restSec: 70, notes: "" },
        { id: uid(), name: "Curl manubri alternato", type: "Bicipiti", sets: 3, repsHint: "8–10", restSec: 75, notes: "" },
        { id: uid(), name: "Hammer Curl", type: "Bicipiti", sets: 2, repsHint: "8+8", restSec: 75, notes: "" },
        { id: uid(), name: "Curl ai cavi con corda (rest-pause)", type: "Bicipiti", sets: 3, repsHint: "8–10 + RP", restSec: 75, notes: "Rest 10" poi quasi cedimento" },
        { id: uid(), name: "Plank", type: "Core", sets: 3, repsHint: "90s", restSec: 60, notes: "" }
      ]
    },
    {
      id: "legs",
      name: "Legs",
      color: "p1",
      items: [
        { id: uid(), name: "Pressa 45°", type: "Gambe", sets: 4, repsHint: "6–10", restSec: 120, notes: "" },
        { id: uid(), name: "Stacco rumeno (RDL) multipower", type: "Gambe", sets: 3, repsHint: "6–10", restSec: 120, notes: "" },
        { id: uid(), name: "Bulgarian Split Squat multipower", type: "Gambe", sets: 3, repsHint: "8–12/gamba", restSec: 90, notes: "" },
        { id: uid(), name: "Leg Curl", type: "Gambe", sets: 3, repsHint: "10–15", restSec: 75, notes: "" },
        { id: uid(), name: "Leg Extension", type: "Gambe", sets: 2, repsHint: "12–15", restSec: 75, notes: "" },
        { id: uid(), name: "Calf Raises", type: "Gambe", sets: 3, repsHint: "max", restSec: 60, notes: "" }
      ]
    },
    {
      id: "scheda4",
      name: "Scheda 4",
      color: "p2",
      items: [
        { id: uid(), name: "Leg Extension", type: "Gambe", sets: 2, repsHint: "12–15", restSec: 70, notes: "" },
        { id: uid(), name: "Leg Curl", type: "Gambe", sets: 3, repsHint: "12–15", restSec: 70, notes: "" },
        { id: uid(), name: "Chest Fly ai cavi", type: "Petto", sets: 3, repsHint: "10–15", restSec: 70, notes: "" },
        { id: uid(), name: "Distensioni manubri panca inclinata", type: "Petto", sets: 3, repsHint: "6–10", restSec: 90, notes: "" },
        { id: uid(), name: "Pullover manubrio singolo", type: "Schiena", sets: 3, repsHint: "15", restSec: 70, notes: "" },
        { id: uid(), name: "Pulley", type: "Schiena", sets: 3, repsHint: "8–10", restSec: 90, notes: "" },
        { id: uid(), name: "Lat Machine", type: "Schiena", sets: 3, repsHint: "8–10", restSec: 120, notes: "" },
        { id: uid(), name: "Curl ai cavi con corda", type: "Bicipiti", sets: 4, repsHint: "8–12", restSec: 70, notes: "Superset con pushdown" },
        { id: uid(), name: "Pushdown ai cavi con corda", type: "Tricipiti", sets: 4, repsHint: "10–15", restSec: 70, notes: "Superset con curl" },
        { id: uid(), name: "Crunch al cavo", type: "Core", sets: 4, repsHint: "10–15", restSec: 55, notes: "" }
      ]
    }
  ]);

  const defaults = () => ({
    meta: { version: 3, createdAt: nowISO() },
    settings: {
      alertsEnabled: false,
      soundPreset: "alarm",
      soundVol: 90,
      soundRepeat: 2,
      vibrate: true,
      flash: true
    },
    types: defaultTypes,
    programs: defaultPrograms(),          // le tue schede
    sessionDraft: null,                   // sessione in corso
    history: []                           // sessioni salvate
  });

  const load = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);
      const base = defaults();
      return {
        ...base,
        ...parsed,
        meta: { ...base.meta, ...(parsed.meta||{}) },
        settings: { ...base.settings, ...(parsed.settings||{}) },
        types: (parsed.types && Array.isArray(parsed.types)) ? parsed.types : base.types,
        programs: (parsed.programs && Array.isArray(parsed.programs)) ? parsed.programs : base.programs,
        history: Array.isArray(parsed.history) ? parsed.history : [],
        sessionDraft: parsed.sessionDraft || null
      };
    } catch (e) {
      console.warn("Load error:", e);
      return defaults();
    }
  };

  const save = (state) => localStorage.setItem(KEY, JSON.stringify(state));
  const wipe = () => localStorage.removeItem(KEY);

  const exportJSON = (state) => JSON.stringify({ exportedAt: nowISO(), data: state }, null, 2);
  const importJSON = (text) => {
    const parsed = JSON.parse(text);
    if (!parsed || !parsed.data) throw new Error("File non valido");
    return parsed.data;
  };

  return { load, save, wipe, exportJSON, importJSON, uid, nowISO };
})();
