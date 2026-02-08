/* app.js - Logbook Pro (v2) */

(() => {
  let state = Store.load();

  // DOM helpers
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // Views & nav
  const views = {
    session: $("#view-session"),
    library: $("#view-library"),
    history: $("#view-history"),
    settings: $("#view-settings"),
  };
  const brandSub = $("#brandSub");

  $$(".tab").forEach(t => t.addEventListener("click", () => go(t.dataset.nav)));

  const go = (name) => {
    Object.keys(views).forEach(k => views[k].classList.toggle("hidden", k !== name));
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.nav === name));
    const map = { session:"Oggi", library:"Libreria", history:"Storico", settings:"Impostazioni" };
    brandSub.textContent = map[name] || "Oggi";
    location.hash = "#" + name;
  };

  const bootRoute = () => {
    const h = (location.hash || "#session").replace("#","");
    if (views[h]) go(h); else go("session");
  };
  window.addEventListener("hashchange", bootRoute);

  // Session header / timers
  const sessState = $("#sessState");
  const sessMeta = $("#sessMeta");
  const elapsedEl = $("#elapsed");
  const timeSpan = $("#timeSpan");
  const btnStart = $("#btnStart");
  const btnSave = $("#btnSave");
  const btnAdd = $("#btnAdd");
  const fabAdd = $("#fabAdd");
  const btnSummary = $("#btnSummary");

  // Rest UI
  const ring = $("#ring");
  const restLeft = $("#restLeft");
  const restLabel = $("#restLabel");
  const btnStopRest = $("#btnStopRest");

  // Audio banner
  const audioBanner = $("#audioBanner");
  const btnEnableAlerts = $("#btnEnableAlerts");
  const btnMenu = $("#btnMenu");

  // Lists
  const sessionList = $("#sessionList");
  const libSearch = $("#libSearch");
  const libType = $("#libType");
  const libList = $("#libList");
  const btnNewLib = $("#btnNewLib");

  const histList = $("#histList");
  const btnExport = $("#btnExport");
  const fileImport = $("#fileImport");

  // Settings
  const soundPreset = $("#soundPreset");
  const soundVol = $("#soundVol");
  const soundRepeat = $("#soundRepeat");
  const toggleVibrate = $("#toggleVibrate");
  const toggleFlash = $("#toggleFlash");
  const btnTestAlert = $("#btnTestAlert");
  const btnWipe = $("#btnWipe");

  // Modal
  const modal = $("#modal");
  const mTitle = $("#mTitle");
  const mSub = $("#mSub");
  const mBody = $("#mBody");
  const mActions = $("#mActions");
  const mClose = $("#mClose");

  // Toast
  const toast = $("#toast");

  // Utils
  const escapeHTML = (s) => String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

  const clampInt = (v, min, max, fallback) => {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };

  const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  const fmtDate = (iso) => new Date(iso).toLocaleDateString([], {weekday:"short", day:"2-digit", month:"short"});
  const mmss = (sec) => {
    const m = String(Math.floor(sec/60)).padStart(2,"0");
    const s = String(sec%60).padStart(2,"0");
    return `${m}:${s}`;
  };

  const toastMsg = (msg, ms=1700) => {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), ms);
  };

  const saveState = () => Store.save(state);

  // Modal
  const openModal = ({title, sub="", bodyHTML="", actions=[]}) => {
    mTitle.textContent = title;
    mSub.textContent = sub;
    mBody.innerHTML = bodyHTML;
    mActions.innerHTML = "";
    actions.forEach(a => mActions.appendChild(a));
    modal.classList.remove("hidden");
  };
  const closeModal = () => modal.classList.add("hidden");
  mClose.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  const mkBtn = (text, cls, onClick) => {
    const b = document.createElement("button");
    b.className = `btn ${cls||""}`.trim();
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  };

  // Session model
  const newDraft = () => ({
    id: Store.uid(),
    startAt: null,
    endAt: null,
    note: "",
    bodyweight: null,
    exercises: [] // { id, libId, name, type, restSec, sets:[{id, weight, reps, rir, rpe, ts}], notes }
  });

  const ensureDraft = () => { if (!state.sessionDraft) state.sessionDraft = newDraft(); };
  const isRunning = () => state.sessionDraft?.startAt && !state.sessionDraft?.endAt;

  // Weekly count
  const weeklyCount = () => {
    const now = Date.now();
    const weekMs = 7*24*60*60*1000;
    return (state.history||[]).filter(s => s?.endAt && (now - new Date(s.endAt).getTime() <= weekMs)).length;
  };

  const weekKpi = $("#weekKpi");
  const weekHint = $("#weekHint");
  const updateWeek = () => {
    const n = weeklyCount();
    weekKpi.textContent = `${n} / 4`;
    weekHint.textContent = n >= 4
      ? "Hai già 4 allenamenti negli ultimi 7 giorni (ok comunque)."
      : "Consiglio: max 4 allenamenti ogni 7 giorni.";
  };

  // --------- AUDIO ENGINE (multi suonerie, loud, repeat) ----------
  let audioCtx = null;

  const ensureAudio = async () => {
    if (audioCtx) return true;
    try{
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // unlock iOS
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      g.gain.value = 0.00001;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.03);
      return true;
    }catch(e){
      console.warn("Audio init fail:", e);
      return false;
    }
  };

  const playTone = (patternName) => {
    if (!audioCtx) return;
    const vol = (state.settings.soundVol ?? 80) / 100; // 0.1..1
    const repeat = clampInt(state.settings.soundRepeat, 1, 5, 2);

    const patterns = {
      bell:   [{f:1046, d:0.10},{f:1568,d:0.10},{f:2093,d:0.14}],
      chime:  [{f:880,  d:0.12},{f:1320,d:0.12},{f:1760,d:0.18}],
      pulse:  [{f:740,  d:0.08},{f:740, d:0.08},{f:740, d:0.08}],
      alarm:  [{f:880,  d:0.16},{f:660, d:0.16},{f:880, d:0.16},{f:660,d:0.16}],
      siren:  [{f:500,  d:0.12},{f:1200,d:0.12},{f:500,d:0.12},{f:1200,d:0.12}],
      double: [{f:988,  d:0.14},{f:988,d:0.14}],
    };

    const seq = patterns[patternName] || patterns.alarm;

    let t = audioCtx.currentTime + 0.02;
    const baseGap = 0.04;

    for (let r=0; r<repeat; r++){
      seq.forEach(step => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "square"; // più “presente”
        o.frequency.setValueAtTime(step.f, t);

        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.08, 0.38*vol), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + step.d);

        o.connect(g); g.connect(audioCtx.destination);
        o.start(t);
        o.stop(t + step.d + 0.02);
        t += step.d + baseGap;
      });
      t += 0.12; // pausa tra ripetizioni
    }
  };

  const vibrate = (pattern=[120,60,120]) => {
    if (!state.settings.vibrate) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
  };

  const flash = () => {
    if (!state.settings.flash) return;
    document.body.classList.add("flash");
    setTimeout(() => document.body.classList.remove("flash"), 600);
  };

  // --------- REST TIMER (ring) ----------
  let rest = { active:false, endMs:0, dur:0, label:"", t:null };

  const stopRest = (silent=false) => {
    rest.active = false;
    if (rest.t) clearInterval(rest.t);
    rest.t = null;
    ring.style.setProperty("--p", 0);
    restLeft.textContent = "—";
    restLabel.textContent = "Nessun timer";
    btnStopRest.disabled = true;
    if (!silent) toastMsg("Timer fermato");
  };

  const startRest = (sec, label) => {
    sec = clampInt(sec, 5, 1800, 90);
    rest.active = true;
    rest.dur = sec;
    rest.endMs = Date.now() + sec*1000;
    rest.label = label || "Recupero";
    btnStopRest.disabled = false;

    const tick = () => {
      const leftMs = rest.endMs - Date.now();
      if (leftMs <= 0){
        ring.style.setProperty("--p", 1);
        restLeft.textContent = "00:00";
        restLabel.textContent = "Fine";
        stopRest(true);

        // Alert
        playTone(state.settings.soundPreset);
        vibrate();
        flash();
        toastMsg("Recupero finito ✅", 2400);
        return;
      }
      const left = Math.ceil(leftMs/1000);
      restLeft.textContent = mmss(left);
      restLabel.textContent = rest.label;
      const p = Math.max(0, Math.min(1, (rest.dur - left) / rest.dur));
      ring.style.setProperty("--p", p);
    };

    tick();
    if (rest.t) clearInterval(rest.t);
    rest.t = setInterval(tick, 250);
  };

  btnStopRest.addEventListener("click", () => stopRest(false));

  // --------- ELAPSED TIMER ----------
  let elapsedT = null;
  const updateElapsed = () => {
    ensureDraft();
    if (!state.sessionDraft.startAt){
      elapsedEl.textContent = "00:00";
      timeSpan.textContent = "—";
      return;
    }
    const start = new Date(state.sessionDraft.startAt).getTime();
    const end = state.sessionDraft.endAt ? new Date(state.sessionDraft.endAt).getTime() : Date.now();
    const sec = Math.max(0, Math.floor((end-start)/1000));
    elapsedEl.textContent = mmss(sec);
    timeSpan.textContent = `${fmtTime(state.sessionDraft.startAt)} → ${state.sessionDraft.endAt ? fmtTime(state.sessionDraft.endAt) : "…"}`
  };

  const startElapsedTicker = () => {
    if (elapsedT) clearInterval(elapsedT);
    elapsedT = setInterval(updateElapsed, 500);
  };

  // --------- PR / STATS ----------
  const sessionTotals = (sess) => {
    const exs = sess.exercises || [];
    let sets = 0, volume = 0;
    exs.forEach(ex => {
      (ex.sets||[]).forEach(s => {
        sets += 1;
        volume += (Number(s.weight)||0) * (Number(s.reps)||0);
      });
    });
    return { exCount: exs.length, sets, volume };
  };

  const prForExercise = (name) => {
    // max weight across history for this exercise name
    let best = 0;
    (state.history||[]).forEach(sess => {
      (sess.exercises||[]).forEach(ex => {
        if ((ex.name||"").toLowerCase() !== (name||"").toLowerCase()) return;
        (ex.sets||[]).forEach(s => best = Math.max(best, Number(s.weight)||0));
      });
    });
    return best;
  };

  // --------- RENDER SESSION LIST ----------
  const renderSession = () => {
    ensureDraft();
    const d = state.sessionDraft;

    // Banner
    audioBanner.classList.toggle("hidden", !!state.settings.alertsEnabled);

    if (!d.startAt){
      sessState.textContent = "Pronto";
      sessMeta.textContent = "Premi Inizia e aggiungi esercizi.";
      btnStart.textContent = "Inizia";
      btnSave.disabled = true;
    } else if (isRunning()){
      sessState.textContent = "In corso";
      sessMeta.textContent = `Oggi • ${fmtDate(new Date().toISOString())}`;
      btnStart.textContent = "Pausa";
      btnSave.disabled = false;
    } else {
      sessState.textContent = "In pausa";
      sessMeta.textContent = `Inizio: ${fmtTime(d.startAt)} • Pausa: ${fmtTime(d.endAt)}`;
      btnStart.textContent = "Riprendi";
      btnSave.disabled = false;
    }

    // list
    sessionList.innerHTML = "";
    const exs = d.exercises || [];
    if (exs.length === 0){
      sessionList.innerHTML = `
        <section class="card subtle">
          <div class="k">Nessun esercizio</div>
          <div class="s">Tocca “+ Aggiungi” (o il tasto verde) e scegli dalla libreria.</div>
        </section>
      `;
      return;
    }

    exs.forEach((ex, idx) => {
      const sets = ex.sets || [];
      const last = sets.length ? sets[sets.length-1] : null;

      const totals = {
        sets: sets.length,
        volume: sets.reduce((a,s)=>a+(Number(s.weight)||0)*(Number(s.reps)||0),0),
        maxW: sets.reduce((a,s)=>Math.max(a, Number(s.weight)||0),0)
      };

      const prPrev = prForExercise(ex.name);
      const isPR = totals.maxW > prPrev && totals.maxW > 0;

      const sub = `${escapeHTML(ex.type||"Altro")} • recupero ${ex.restSec||90}s` +
        (last ? ` • ultimo ${last.weight||0}kg×${last.reps||0}` : "");

      const card = document.createElement("section");
      card.className = "exercise";
      card.innerHTML = `
        <div class="ex-head">
          <div style="min-width:0">
            <div class="ex-title">${escapeHTML(ex.name)}</div>
            <div class="ex-sub">${sub}</div>
            <div class="row gap" style="margin-top:8px; flex-wrap:wrap">
              <span class="pill">${totals.sets} set</span>
              <span class="pill">vol ${Math.round(totals.volume)}</span>
              ${isPR ? `<span class="pill pr">PR ${totals.maxW}kg</span>` : ``}
            </div>
          </div>
          <div class="ex-actions">
            <button class="icon-btn" data-act="rest" title="Recupero"><span class="ic">⏱</span></button>
            <button class="icon-btn" data-act="edit" title="Modifica"><span class="ic">✎</span></button>
            <button class="icon-btn" data-act="del" title="Rimuovi"><span class="ic">🗑</span></button>
          </div>
        </div>

        <div class="ex-body">
          <div class="grid-set small">
            <div>Kg</div><div>Reps</div><div>RIR</div><div></div>
          </div>
          <div class="grid-set">
            <input class="input mono" inputmode="decimal" placeholder="0" data-f="w" value="${last?.weight ?? ""}" />
            <input class="input mono" inputmode="numeric" placeholder="0" data-f="r" value="${last?.reps ?? ""}" />
            <input class="input mono" inputmode="numeric" placeholder="—" data-f="rir" value="${last?.rir ?? ""}" />
            <button class="btn primary" data-act="addset">+ Set</button>
          </div>

          <div class="row between">
            <div class="row gap">
              <button class="btn ghost" data-act="sets">Serie</button>
              <button class="btn ghost" data-act="note">Note</button>
            </div>
            <button class="btn" data-act="last">Ultima volta</button>
          </div>
        </div>
      `;

      card.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset?.act;
        if (!act) return;

        if (act === "del"){
          state.sessionDraft.exercises.splice(idx,1);
          saveState(); renderAll();
          toastMsg("Rimosso");
        }

        if (act === "edit"){
          openEditExercise(ex, () => { saveState(); renderAll(); });
        }

        if (act === "rest"){
          startRest(ex.restSec || 90, ex.name);
        }

        if (act === "sets"){
          openSets(ex);
        }

        if (act === "note"){
          openExerciseNote(ex);
        }

        if (act === "last"){
          openLastTime(ex.name);
        }

        if (act === "addset"){
          if (!state.sessionDraft.startAt) return toastMsg("Premi Inizia prima");
          if (!isRunning()){
            // se era in pausa, riprendi automaticamente
            state.sessionDraft.endAt = null;
            saveState();
          }

          const w = parseFloat(String(card.querySelector('[data-f="w"]').value).replace(",", "."));
          const r = clampInt(card.querySelector('[data-f="r"]').value, 0, 200, 0);
          const rir = (String(card.querySelector('[data-f="rir"]').value).trim()==="") ? null : clampInt(card.querySelector('[data-f="rir"]').value, 0, 10, null);

          const set = {
            id: Store.uid(),
            weight: Number.isFinite(w) ? w : 0,
            reps: r,
            rir: rir,
            ts: Store.nowISO()
          };
          ex.sets = ex.sets || [];
          ex.sets.push(set);
          saveState();
          renderAll();

          startRest(ex.restSec || 90, `${ex.name}`);
          toastMsg("Set salvato ✅");
        }
      });

      sessionList.appendChild(card);
    });
  };

  // --------- LIBRARY ----------
  const renderLibType = () => {
    const types = state.library.types || [];
    libType.innerHTML = `<option value="">Tutti i tipi</option>` +
      types.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");
  };

  const renderLibrary = () => {
    renderLibType();
    const q = (libSearch.value || "").toLowerCase().trim();
    const tf = libType.value || "";

    const items = (state.library.exercises || []).filter(x => {
      const okQ = !q || (x.name||"").toLowerCase().includes(q) || (x.type||"").toLowerCase().includes(q);
      const okT = !tf || x.type === tf;
      return okQ && okT;
    });

    libList.innerHTML = "";
    if (!items.length){
      libList.innerHTML = `<section class="card subtle"><div class="s">Nessun esercizio. Crea “+ Nuovo”.</div></section>`;
      return;
    }

    items.forEach(item => {
      const last = lastForExercise(item.name);
      const sub = `${escapeHTML(item.type||"Altro")} • recupero ${item.defaultRestSec||90}s` +
        (last ? ` • ultima: ${last.weight}kg×${last.reps} (${fmtDate(last.ts)})` : "");

      const el = document.createElement("section");
      el.className = "card";
      el.innerHTML = `
        <div class="row between">
          <div style="min-width:0">
            <div class="v" style="font-size:16px">${escapeHTML(item.name)}</div>
            <div class="s">${sub}</div>
          </div>
          <div class="row gap" style="flex-wrap:wrap; justify-content:flex-end">
            <button class="btn primary" data-act="add">Aggiungi</button>
            <button class="btn" data-act="edit">Modifica</button>
            <button class="btn danger" data-act="del">Elimina</button>
          </div>
        </div>
      `;

      el.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset?.act;
        if (!act) return;

        if (act==="add"){
          ensureDraft();
          state.sessionDraft.exercises.push({
            id: Store.uid(),
            libId: item.id,
            name: item.name,
            type: item.type || "Altro",
            restSec: item.defaultRestSec || 90,
            sets: [],
            notes: ""
          });
          saveState();
          toastMsg("Aggiunto a Oggi");
          go("session");
          renderAll();
        }

        if (act==="edit"){
          openEditLib(item);
        }

        if (act==="del"){
          openModal({
            title: "Eliminare esercizio?",
            sub: "Rimuove dalla libreria (lo storico resta).",
            bodyHTML: `<div class="s">${escapeHTML(item.name)}</div>`,
            actions: [
              mkBtn("Annulla","ghost", closeModal),
              mkBtn("Elimina","danger", () => {
                state.library.exercises = (state.library.exercises||[]).filter(x => x.id !== item.id);
                saveState(); closeModal(); renderAll();
                toastMsg("Eliminato");
              })
            ]
          });
        }
      });

      libList.appendChild(el);
    });
  };

  libSearch.addEventListener("input", renderLibrary);
  libType.addEventListener("change", renderLibrary);

  const openNewLib = () => {
    const types = state.library.types || [];
    const options = types.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");

    openModal({
      title:"Nuovo esercizio",
      sub:"Crea un esercizio (con recupero default).",
      bodyHTML: `
        <input class="input" id="nlName" placeholder="Nome (es. Chest Fly ai cavi)" />
        <select class="select" id="nlType">${options}</select>
        <input class="input" id="nlRest" inputmode="numeric" placeholder="Recupero default (sec) es. 90" />
        <div class="card subtle">
          <div class="k">Aggiungi tipo</div>
          <div class="s">Se ti serve una categoria nuova.</div>
          <div class="divider"></div>
          <div class="row gap">
            <input class="input" id="nlNewType" placeholder="Nuovo tipo (opzionale)" />
            <button class="btn" id="nlAddType">Aggiungi</button>
          </div>
        </div>
      `,
      actions:[
        mkBtn("Annulla","ghost", closeModal),
        mkBtn("Salva","primary", () => {
          const name = ($("#nlName").value||"").trim();
          const type = ($("#nlType").value||"Altro").trim();
          const rest = clampInt($("#nlRest").value||"90", 5, 1800, 90);
          if (!name) return toastMsg("Inserisci un nome");
          state.library.exercises.push({ id: Store.uid(), name, type, defaultRestSec: rest });
          saveState(); closeModal(); renderAll();
          toastMsg("Creato");
        })
      ]
    });

    $("#nlAddType").addEventListener("click", () => {
      const t = ($("#nlNewType").value||"").trim();
      if (!t) return;
      if (!(state.library.types||[]).includes(t)) state.library.types.push(t);
      saveState(); closeModal(); renderAll();
      toastMsg("Tipo aggiunto");
    });
  };

  const openEditLib = (item) => {
    const types = state.library.types || [];
    const options = types.map(t => `<option value="${escapeHTML(t)}" ${item.type===t?"selected":""}>${escapeHTML(t)}</option>`).join("");

    openModal({
      title:"Modifica esercizio",
      sub:"Aggiorna nome, tipo e recupero default.",
      bodyHTML: `
        <input class="input" id="elName" value="${escapeHTML(item.name)}" />
        <select class="select" id="elType">${options}</select>
        <input class="input" id="elRest" inputmode="numeric" value="${escapeHTML(item.defaultRestSec ?? 90)}" />
      `,
      actions:[
        mkBtn("Annulla","ghost", closeModal),
        mkBtn("Salva","primary", () => {
          const name = ($("#elName").value||"").trim();
          if (!name) return toastMsg("Nome non valido");
          item.name = name;
          item.type = $("#elType").value || "Altro";
          item.defaultRestSec = clampInt($("#elRest").value, 5, 1800, 90);
          saveState(); closeModal(); renderAll();
          toastMsg("Salvato");
        })
      ]
    });
  };

  btnNewLib.addEventListener("click", openNewLib);

  // --------- PICK EXERCISE (Bottom sheet) ----------
  const openPicker = () => {
    ensureDraft();
    const types = state.library.types || [];
    const options = types.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");

    openModal({
      title:"Aggiungi esercizio",
      sub:"Scegli dalla libreria (oppure crea al volo).",
      bodyHTML: `
        <section class="card subtle">
          <div class="row gap">
            <input class="input" id="pkQ" placeholder="Cerca…" />
            <select class="select" id="pkT">
              <option value="">Tutti</option>
              ${options}
            </select>
          </div>
        </section>
        <section id="pkList" class="stack"></section>

        <section class="card subtle">
          <div class="k">Crea al volo</div>
          <div class="s">Aggiunge alla sessione (non salva in libreria).</div>
          <div class="divider"></div>
          <input class="input" id="tmpName" placeholder="Nome esercizio" />
          <select class="select" id="tmpType">${options}</select>
          <input class="input" id="tmpRest" inputmode="numeric" placeholder="Recupero (sec) es. 90" />
          <button class="btn primary" id="tmpAdd">Aggiungi ora</button>
        </section>
      `,
      actions:[ mkBtn("Chiudi","ghost", closeModal) ]
    });

    const pkQ = $("#pkQ");
    const pkT = $("#pkT");
    const pkList = $("#pkList");

    const renderPk = () => {
      const q = (pkQ.value||"").toLowerCase().trim();
      const tf = pkT.value||"";
      const items = (state.library.exercises||[]).filter(x => {
        const okQ = !q || (x.name||"").toLowerCase().includes(q) || (x.type||"").toLowerCase().includes(q);
        const okT = !tf || x.type === tf;
        return okQ && okT;
      });

      pkList.innerHTML = "";
      if (!items.length){
        pkList.innerHTML = `<section class="card subtle"><div class="s">Nessun risultato.</div></section>`;
        return;
      }

      items.forEach(item => {
        const last = lastForExercise(item.name);
        const sub = `${escapeHTML(item.type||"Altro")} • rec ${item.defaultRestSec||90}s` +
          (last ? ` • ultima: ${last.weight}kg×${last.reps} (${fmtDate(last.ts)})` : "");

        const el = document.createElement("section");
        el.className = "card";
        el.innerHTML = `
          <div class="row between">
            <div style="min-width:0">
              <div class="v" style="font-size:16px">${escapeHTML(item.name)}</div>
              <div class="s">${sub}</div>
            </div>
            <button class="btn primary">Aggiungi</button>
          </div>
        `;
        el.querySelector("button").addEventListener("click", () => {
          state.sessionDraft.exercises.push({
            id: Store.uid(),
            libId: item.id,
            name: item.name,
            type: item.type || "Altro",
            restSec: item.defaultRestSec || 90,
            sets: [],
            notes: ""
          });
          saveState(); closeModal(); renderAll();
          toastMsg("Aggiunto");
        });
        pkList.appendChild(el);
      });
    };

    pkQ.addEventListener("input", renderPk);
    pkT.addEventListener("change", renderPk);
    renderPk();

    $("#tmpAdd").addEventListener("click", () => {
      const name = ($("#tmpName").value||"").trim();
      const type = ($("#tmpType").value||"Altro").trim();
      const restSec = clampInt($("#tmpRest").value||"90", 5, 1800, 90);
      if (!name) return toastMsg("Inserisci un nome");
      state.sessionDraft.exercises.push({
        id: Store.uid(),
        libId: null,
        name, type, restSec,
        sets: [],
        notes: ""
      });
      saveState(); closeModal(); renderAll();
      toastMsg("Aggiunto");
    });
  };

  btnAdd.addEventListener("click", openPicker);
  fabAdd.addEventListener("click", openPicker);

  // --------- Exercise editing / notes / sets ----------
  const openEditExercise = (ex, onDone) => {
    const types = state.library.types || [];
    const options = types.map(t => `<option value="${escapeHTML(t)}" ${ex.type===t?"selected":""}>${escapeHTML(t)}</option>`).join("");

    openModal({
      title:"Modifica esercizio",
      sub:"Nome, tipo e recupero.",
      bodyHTML: `
        <input class="input" id="eeName" value="${escapeHTML(ex.name)}" />
        <select class="select" id="eeType">${options}</select>
        <input class="input" id="eeRest" inputmode="numeric" value="${escapeHTML(ex.restSec ?? 90)}" />
      `,
      actions:[
        mkBtn("Annulla","ghost", closeModal),
        mkBtn("Salva","primary", () => {
          const name = ($("#eeName").value||"").trim();
          if (!name) return toastMsg("Nome non valido");
          ex.name = name;
          ex.type = $("#eeType").value || "Altro";
          ex.restSec = clampInt($("#eeRest").value, 5, 1800, 90);
          closeModal();
          onDone?.();
          toastMsg("Salvato");
        })
      ]
    });
  };

  const openExerciseNote = (ex) => {
    openModal({
      title:"Note esercizio",
      sub: ex.name,
      bodyHTML: `
        <textarea class="input" id="exNote" rows="5" placeholder="Note (setup, tecnica, cues…)">${escapeHTML(ex.notes||"")}</textarea>
      `,
      actions:[
        mkBtn("Chiudi","ghost", closeModal),
        mkBtn("Salva","primary", () => {
          ex.notes = ($("#exNote").value||"");
          saveState(); closeModal(); renderAll();
          toastMsg("Note salvate");
        })
      ]
    });
  };

  const openSets = (ex) => {
    const sets = ex.sets || [];
    const rows = sets.length ? sets.map((s,i) => `
      <section class="card subtle">
        <div class="row between">
          <div>
            <div class="v" style="font-size:16px">Set ${i+1}: ${s.weight||0}kg × ${s.reps||0}</div>
            <div class="s">RIR: ${(s.rir===null||s.rir===undefined) ? "—" : s.rir} • ${fmtTime(s.ts)}</div>
          </div>
          <button class="btn danger" data-del="${s.id}">Elimina</button>
        </div>
      </section>
    `).join("") : `<section class="card subtle"><div class="s">Nessuna serie registrata.</div></section>`;

    openModal({
      title:"Serie",
      sub: ex.name,
      bodyHTML: `<div class="stack" id="setsWrap">${rows}</div>`,
      actions:[ mkBtn("Chiudi","ghost", closeModal) ]
    });

    $$("#setsWrap [data-del]").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.dataset.del;
        ex.sets = (ex.sets||[]).filter(x => x.id !== id);
        saveState(); closeModal(); renderAll();
        toastMsg("Eliminata");
      });
    });
  };

  const lastForExercise = (name) => {
    // find most recent set for this exercise in history
    const items = [];
    (state.history||[]).forEach(sess => {
      (sess.exercises||[]).forEach(ex => {
        if ((ex.name||"").toLowerCase() !== (name||"").toLowerCase()) return;
        (ex.sets||[]).forEach(s => items.push({ ts:s.ts, weight:s.weight||0, reps:s.reps||0, rir:s.rir }));
      });
    });
    items.sort((a,b)=>new Date(b.ts)-new Date(a.ts));
    return items[0] || null;
  };

  const openLastTime = (name) => {
    // show last session details for this exercise
    let bestSess = null;
    (state.history||[]).forEach(sess => {
      const found = (sess.exercises||[]).find(ex => (ex.name||"").toLowerCase() === (name||"").toLowerCase());
      if (!found) return;
      if (!bestSess || new Date(sess.endAt||sess.startAt) > new Date(bestSess.endAt||bestSess.startAt)){
        bestSess = sess;
      }
    });
    if (!bestSess){
      toastMsg("Nessuno storico per questo esercizio");
      return;
    }
    const ex = (bestSess.exercises||[]).find(ex => (ex.name||"").toLowerCase() === (name||"").toLowerCase());
    const sets = (ex.sets||[]).map((s,i)=>`Set ${i+1}: ${s.weight||0}kg×${s.reps||0} (RIR ${(s.rir==null)?"—":s.rir})`).join("<br>");
    openModal({
      title:"Ultima volta",
      sub:`${fmtDate(bestSess.endAt||bestSess.startAt)} • ${fmtTime(bestSess.startAt)} → ${fmtTime(bestSess.endAt)}`,
      bodyHTML: `
        <section class="card subtle">
          <div class="v" style="font-size:16px">${escapeHTML(ex.name)}</div>
          <div class="s">${escapeHTML(ex.type||"Altro")} • rec ${ex.restSec||90}s</div>
          <div class="divider"></div>
          <div class="s">${sets || "—"}</div>
        </section>
      `,
      actions:[ mkBtn("Chiudi","ghost", closeModal) ]
    });
  };

  // --------- HISTORY ----------
  const renderHistory = () => {
    histList.innerHTML = "";
    const items = [...(state.history||[])].sort((a,b)=>new Date(b.endAt||b.startAt)-new Date(a.endAt||a.startAt));

    if (!items.length){
      histList.innerHTML = `<section class="card subtle"><div class="s">Ancora nessuna sessione salvata.</div></section>`;
      return;
    }

    items.forEach(sess => {
      const totals = sessionTotals(sess);
      const durSec = Math.max(0, Math.floor((new Date(sess.endAt).getTime()-new Date(sess.startAt).getTime())/1000));
      const el = document.createElement("section");
      el.className = "card";
      el.innerHTML = `
        <div class="row between">
          <div>
            <div class="v" style="font-size:16px">${fmtDate(sess.endAt||sess.startAt)} • ${fmtTime(sess.startAt)} → ${fmtTime(sess.endAt)}</div>
            <div class="s">${totals.exCount} esercizi • ${totals.sets} set • vol ${Math.round(totals.volume)} • ${mmss(durSec)}</div>
          </div>
          <div class="row gap" style="flex-wrap:wrap; justify-content:flex-end">
            <button class="btn" data-act="open">Dettagli</button>
            <button class="btn danger" data-act="del">Elimina</button>
          </div>
        </div>
      `;

      el.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset?.act;
        if (!act) return;

        if (act==="open"){
          openHistoryDetail(sess);
        }
        if (act==="del"){
          openModal({
            title:"Eliminare sessione?",
            sub:"Operazione irreversibile (dati locali).",
            bodyHTML:`<div class="s">${fmtDate(sess.endAt||sess.startAt)} • ${fmtTime(sess.startAt)} → ${fmtTime(sess.endAt)}</div>`,
            actions:[
              mkBtn("Annulla","ghost", closeModal),
              mkBtn("Elimina","danger", () => {
                state.history = (state.history||[]).filter(x => x.id !== sess.id);
                saveState(); closeModal(); renderAll();
                toastMsg("Eliminata");
              })
            ]
          });
        }
      });

      histList.appendChild(el);
    });
  };

  const openHistoryDetail = (sess) => {
    const blocks = (sess.exercises||[]).map(ex => {
      const sets = (ex.sets||[]).map((s,i)=>`Set ${i+1}: ${s.weight||0}kg×${s.reps||0} (RIR ${(s.rir==null)?"—":s.rir})`).join("<br>");
      return `
        <section class="card subtle">
          <div class="v" style="font-size:16px">${escapeHTML(ex.name)}</div>
          <div class="s">${escapeHTML(ex.type||"Altro")} • rec ${ex.restSec||90}s</div>
          <div class="divider"></div>
          <div class="s">${sets || "—"}</div>
        </section>
      `;
    }).join("");

    const totals = sessionTotals(sess);
    const durSec = Math.max(0, Math.floor((new Date(sess.endAt).getTime()-new Date(sess.startAt).getTime())/1000));

    openModal({
      title:"Dettagli sessione",
      sub:`${fmtDate(sess.endAt||sess.startAt)} • ${fmtTime(sess.startAt)} → ${fmtTime(sess.endAt)} • ${mmss(durSec)}`,
      bodyHTML: `
        <section class="card subtle">
          <div class="row gap" style="flex-wrap:wrap">
            <span class="pill">${totals.exCount} esercizi</span>
            <span class="pill">${totals.sets} set</span>
            <span class="pill">vol ${Math.round(totals.volume)}</span>
          </div>
        </section>
        <div class="stack">${blocks || `<section class="card subtle"><div class="s">Nessun dato.</div></section>`}</div>
      `,
      actions:[ mkBtn("Chiudi","ghost", closeModal) ]
    });
  };

  // Export / Import
  btnExport.addEventListener("click", () => {
    const json = Store.exportJSON(state);
    const blob = new Blob([json], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logbook-pro-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toastMsg("Export creato");
  });

  fileImport.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try{
      const text = await f.text();
      const imported = Store.importJSON(text);
      state = imported;
      saveState();
      toastMsg("Import completato ✅", 2200);
      renderAll();
    }catch(err){
      console.warn(err);
      toastMsg("Import fallito");
    }finally{
      fileImport.value = "";
    }
  });

  // --------- SETTINGS ----------
  const soundPresets = [
    ["alarm","Alarm (forte)"],
    ["siren","Siren"],
    ["bell","Bell"],
    ["chime","Chime"],
    ["double","Double"],
    ["pulse","Pulse"]
  ];

  const renderSettings = () => {
    soundPreset.innerHTML = soundPresets.map(([k,lab]) => `<option value="${k}" ${state.settings.soundPreset===k?"selected":""}>${lab}</option>`).join("");
    soundVol.value = clampInt(state.settings.soundVol, 10, 100, 85);
    soundRepeat.value = clampInt(state.settings.soundRepeat, 1, 5, 2);
    toggleVibrate.checked = !!state.settings.vibrate;
    toggleFlash.checked = !!state.settings.flash;
  };

  soundPreset.addEventListener("change", () => {
    state.settings.soundPreset = soundPreset.value;
    saveState();
    toastMsg("Salvato");
  });
  soundVol.addEventListener("input", () => {
    state.settings.soundVol = clampInt(soundVol.value, 10, 100, 85);
    saveState();
  });
  soundRepeat.addEventListener("input", () => {
    state.settings.soundRepeat = clampInt(soundRepeat.value, 1, 5, 2);
    saveState();
  });
  toggleVibrate.addEventListener("change", () => {
    state.settings.vibrate = toggleVibrate.checked;
    saveState();
    toastMsg("Salvato");
  });
  toggleFlash.addEventListener("change", () => {
    state.settings.flash = toggleFlash.checked;
    saveState();
    toastMsg("Salvato");
  });

  btnTestAlert.addEventListener("click", async () => {
    const ok = await ensureAudio();
    if (!ok) return toastMsg("Audio non disponibile");
    state.settings.alertsEnabled = true;
    saveState();
    playTone(state.settings.soundPreset);
    vibrate();
    flash();
    toastMsg("Test avviso ✅", 2200);
    renderAll();
  });

  btnWipe.addEventListener("click", () => {
    openModal({
      title:"Reset dati",
      sub:"Cancella tutto (libreria, sessioni, impostazioni).",
      bodyHTML:`<span class="pill">Irreversibile</span>`,
      actions:[
        mkBtn("Annulla","ghost", closeModal),
        mkBtn("Reset","danger", () => {
          Store.wipe();
          state = Store.load();
          stopRest(true);
          closeModal();
          renderAll();
          toastMsg("Resettato");
        })
      ]
    });
  });

  // --------- START / PAUSE / RESUME ----------
  btnStart.addEventListener("click", async () => {
    ensureDraft();

    // Abilita audio se possibile (iOS vuole gesto)
    if (!state.settings.alertsEnabled) {
      const ok = await ensureAudio();
      if (ok) {
        state.settings.alertsEnabled = true;
        saveState();
      }
    }

    if (!state.sessionDraft.startAt){
      state.sessionDraft.startAt = Store.nowISO();
      state.sessionDraft.endAt = null;
      saveState();
      toastMsg("Sessione iniziata");
      renderAll();
      return;
    }

    if (isRunning()){
      state.sessionDraft.endAt = Store.nowISO();
      saveState();
      toastMsg("In pausa");
      renderAll();
      return;
    }

    // Resume
    state.sessionDraft.endAt = null;
    saveState();
    toastMsg("Ripresa");
    renderAll();
  });

  btnSave.addEventListener("click", () => {
    ensureDraft();
    const d = state.sessionDraft;
    if (!d.startAt) return toastMsg("Premi Inizia prima");

    if (isRunning()) d.endAt = Store.nowISO();

    const totals = sessionTotals(d);
    if (totals.sets === 0){
      openModal({
        title:"Salvare comunque?",
        sub:"Non hai registrato set. Vuoi salvare la sessione vuota?",
        bodyHTML:`<div class="s">Può servire come “presenza” o cardio.</div>`,
        actions:[
          mkBtn("Annulla","ghost", closeModal),
          mkBtn("Salva","primary", () => { commitDraft(); closeModal(); })
        ]
      });
      return;
    }
    commitDraft();
  });

  const commitDraft = () => {
    const d = state.sessionDraft;
    const sess = {
      ...d,
      id: d.id || Store.uid(),
      endAt: d.endAt || Store.nowISO()
    };

    state.history = state.history || [];
    state.history.push(sess);

    state.sessionDraft = newDraft();
    saveState();
    stopRest(true);
    toastMsg("Sessione salvata ✅", 2200);
    renderAll();
  };

  // Summary
  btnSummary.addEventListener("click", () => {
    ensureDraft();
    const d = state.sessionDraft;
    if (!d.startAt){
      toastMsg("Inizia una sessione per vedere il riepilogo");
      return;
    }
    const totals = sessionTotals(d);
    const start = new Date(d.startAt).getTime();
    const end = d.endAt ? new Date(d.endAt).getTime() : Date.now();
    const dur = Math.max(0, Math.floor((end-start)/1000));

    openModal({
      title:"Riepilogo",
      sub:"Dati della sessione corrente",
      bodyHTML: `
        <section class="card subtle">
          <div class="row gap" style="flex-wrap:wrap">
            <span class="pill">${totals.exCount} esercizi</span>
            <span class="pill">${totals.sets} set</span>
            <span class="pill">vol ${Math.round(totals.volume)}</span>
            <span class="pill">${mmss(dur)}</span>
          </div>
          <div class="divider"></div>
          <div class="s">Inizio: ${fmtTime(d.startAt)} • Fine: ${d.endAt ? fmtTime(d.endAt) : "—"}</div>
        </section>
      `,
      actions:[ mkBtn("Chiudi","ghost", closeModal) ]
    });
  });

  // Audio banner enable
  btnEnableAlerts.addEventListener("click", async () => {
    const ok = await ensureAudio();
    if (!ok) return toastMsg("Audio non disponibile");
    state.settings.alertsEnabled = true;
    saveState();
    playTone(state.settings.soundPreset);
    toastMsg("Avvisi abilitati ✅", 2200);
    renderAll();
  });

  // Menu (quick nav)
  btnMenu.addEventListener("click", () => {
    openModal({
      title:"Menu",
      sub:"Spostati velocemente.",
      bodyHTML: `
        <div class="stack">
          <button class="btn" id="mnSess">Oggi</button>
          <button class="btn" id="mnLib">Libreria</button>
          <button class="btn" id="mnHist">Storico</button>
          <button class="btn" id="mnSet">Impostazioni</button>
          <div class="divider"></div>
          <button class="btn ghost" id="mnRest90">Recupero 90s</button>
          <button class="btn ghost" id="mnRest120">Recupero 120s</button>
          <button class="btn danger" id="mnStopRest">Stop recupero</button>
        </div>
      `,
      actions:[ mkBtn("Chiudi","ghost", closeModal) ]
    });
    $("#mnSess").addEventListener("click", () => { closeModal(); go("session"); });
    $("#mnLib").addEventListener("click", () => { closeModal(); go("library"); });
    $("#mnHist").addEventListener("click", () => { closeModal(); go("history"); });
    $("#mnSet").addEventListener("click", () => { closeModal(); go("settings"); });
    $("#mnRest90").addEventListener("click", () => { startRest(90,"Recupero"); closeModal(); });
    $("#mnRest120").addEventListener("click", () => { startRest(120,"Recupero"); closeModal(); });
    $("#mnStopRest").addEventListener("click", () => { stopRest(false); closeModal(); });
  });

  // --------- RENDER ALL ----------
  const renderAll = () => {
    renderSettings();
    renderLibrary();
    renderHistory();
    renderSession();
    updateWeek();
    updateElapsed();
  };

  // Service worker
  const registerSW = async () => {
    if (!("serviceWorker" in navigator)) return;
    try{
      await navigator.serviceWorker.register("./sw.js", { scope:"./" });
    }catch(e){ console.warn(e); }
  };

  // Init
  const init = () => {
    ensureDraft();
    bootRoute();
    renderAll();
    registerSW();
    startElapsedTicker();
  };

  init();
})();
