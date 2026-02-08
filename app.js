/* app.js - Logbook Pro (v3): Schede + logging rapido (kg/reps), timer recupero */

(() => {
  let state = Store.load();

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // Views
  const views = {
    session: $("#view-session"),
    library: $("#view-library"),   // in v3: Schede
    history: $("#view-history"),
    settings: $("#view-settings"),
  };
  const brandSub = $("#brandSub");

  const go = (name) => {
    Object.keys(views).forEach(k => views[k].classList.toggle("hidden", k !== name));
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.nav === name));
    const map = { session:"Oggi", library:"Schede", history:"Storico", settings:"Impostazioni" };
    brandSub.textContent = map[name] || "Oggi";
    location.hash = "#" + name;
  };

  $$(".tab").forEach(t => t.addEventListener("click", () => go(t.dataset.nav)));
  const bootRoute = () => {
    const h = (location.hash || "#session").replace("#","");
    if (views[h]) go(h); else go("session");
  };
  window.addEventListener("hashchange", bootRoute);

  // Session header
  const sessState = $("#sessState");
  const sessMeta = $("#sessMeta");
  const elapsedEl = $("#elapsed");
  const timeSpan = $("#timeSpan");
  const btnStart = $("#btnStart");
  const btnSave = $("#btnSave");
  const btnAdd = $("#btnAdd");         // + Esercizio (manual)
  const fabAdd = $("#fabAdd");
  const btnSummary = $("#btnSummary");
  const btnPickProgram = $("#btnPickProgram");

  // Rest
  const ring = $("#ring");
  const restLeft = $("#restLeft");
  const restLabel = $("#restLabel");
  const btnStopRest = $("#btnStopRest");

  // Audio banner
  const audioBanner = $("#audioBanner");
  const btnEnableAlerts = $("#btnEnableAlerts");
  const btnMenu = $("#btnMenu");

  // Schede view (library view repurposed)
  const libSearch = $("#libSearch"); // we will repurpose as search programs maybe
  const libType = $("#libType");     // repurpose as filter
  const libList = $("#libList");
  const btnNewLib = $("#btnNewLib");

  // History
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

  // Session list container
  const sessionList = $("#sessionList");

  // Week
  const weekKpi = $("#weekKpi");
  const weekHint = $("#weekHint");

  // Helpers
  const escapeHTML = (s) => String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");

  const clampInt = (v, min, max, fallback) => {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };

  const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  const fmtDate = (iso) => new Date(iso).toLocaleDateString([], {weekday:"short", day:"2-digit", month:"short"});
  const mmss = (sec) => `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;

  const toastMsg = (msg, ms=1600) => {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), ms);
  };

  const saveState = () => Store.save(state);

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

  // Session model:
  // selectedProgramId: which template was started
  // exercises: list derived from program items, each with targetSets, repsHint, restSec
  const newDraft = () => ({
    id: Store.uid(),
    startAt: null,
    endAt: null,
    programId: null,
    programName: null,
    exercises: [] // { id, name, type, targetSets, repsHint, restSec, sets:[{id, weight, reps, ts}] }
  });

  const ensureDraft = () => { if (!state.sessionDraft) state.sessionDraft = newDraft(); };
  const isRunning = () => state.sessionDraft?.startAt && !state.sessionDraft?.endAt;

  // Weekly
  const weeklyCount = () => {
    const now = Date.now();
    const weekMs = 7*24*60*60*1000;
    return (state.history||[]).filter(s => s?.endAt && (now - new Date(s.endAt).getTime() <= weekMs)).length;
  };
  const updateWeek = () => {
    const n = weeklyCount();
    weekKpi.textContent = `${n} / 4`;
    weekHint.textContent = n >= 4
      ? "Hai già 4 allenamenti negli ultimi 7 giorni (ok comunque)."
      : "Consiglio: max 4 allenamenti ogni 7 giorni.";
  };

  // -------- AUDIO ENGINE ----------
  let audioCtx = null;

  const ensureAudio = async () => {
    if (audioCtx) return true;
    try{
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
    const vol = (state.settings.soundVol ?? 90) / 100;
    const repeat = clampInt(state.settings.soundRepeat, 1, 5, 2);

    const patterns = {
      bell:   [{f:1046, d:0.10},{f:1568,d:0.10},{f:2093,d:0.14}],
      chime:  [{f:880,  d:0.12},{f:1320,d:0.12},{f:1760,d:0.18}],
      pulse:  [{f:740,  d:0.08},{f:740, d:0.08},{f:740, d:0.08},{f:740,d:0.08}],
      alarm:  [{f:880,  d:0.16},{f:660, d:0.16},{f:880, d:0.16},{f:660,d:0.16}],
      siren:  [{f:520,  d:0.12},{f:1220,d:0.12},{f:520,d:0.12},{f:1220,d:0.12}],
      double: [{f:988,  d:0.14},{f:988,d:0.14}],
    };
    const seq = patterns[patternName] || patterns.alarm;

    let t = audioCtx.currentTime + 0.02;
    const baseGap = 0.04;

    for (let r=0; r<repeat; r++){
      seq.forEach(step => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "square";
        o.frequency.setValueAtTime(step.f, t);

        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.12, 0.55*vol), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + step.d);

        o.connect(g); g.connect(audioCtx.destination);
        o.start(t);
        o.stop(t + step.d + 0.02);
        t += step.d + baseGap;
      });
      t += 0.12;
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

  // -------- REST TIMER ----------
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

  // -------- ELAPSED ----------
  let elapsedT = null;
  const updateElapsed = () => {
    ensureDraft();
    const d = state.sessionDraft;
    if (!d.startAt){
      elapsedEl.textContent = "00:00";
      timeSpan.textContent = "—";
      return;
    }
    const start = new Date(d.startAt).getTime();
    const end = d.endAt ? new Date(d.endAt).getTime() : Date.now();
    const sec = Math.max(0, Math.floor((end-start)/1000));
    elapsedEl.textContent = mmss(sec);
    timeSpan.textContent = `${fmtTime(d.startAt)} → ${d.endAt ? fmtTime(d.endAt) : "…"}`
  };
  const startElapsedTicker = () => {
    if (elapsedT) clearInterval(elapsedT);
    elapsedT = setInterval(updateElapsed, 500);
  };

  // -------- STATS ----------
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

  const lastSetForExercise = (name) => {
    const items = [];
    (state.history||[]).forEach(sess => {
      (sess.exercises||[]).forEach(ex => {
        if ((ex.name||"").toLowerCase() !== (name||"").toLowerCase()) return;
        (ex.sets||[]).forEach(s => items.push({ ts:s.ts, weight:s.weight||0, reps:s.reps||0 }));
      });
    });
    items.sort((a,b)=>new Date(b.ts)-new Date(a.ts));
    return items[0] || null;
  };

  // --------- SESSION RENDER ----------
  const renderSessionHeader = () => {
    ensureDraft();
    const d = state.sessionDraft;

    audioBanner.classList.toggle("hidden", !!state.settings.alertsEnabled);

    const labelProg = d.programName ? ` • Scheda: ${d.programName}` : "";

    if (!d.startAt){
      sessState.textContent = d.programName ? `Pronto${labelProg}` : "Pronto";
      sessMeta.textContent = d.programName
        ? "Premi Inizia: la scheda è già pronta. In palestra inserisci solo kg e reps."
        : "Seleziona una scheda (Push/Pull/Legs/4) e poi premi Inizia.";
      btnStart.textContent = "Inizia";
      btnSave.disabled = true;
    } else if (isRunning()){
      sessState.textContent = `In corso${labelProg}`;
      sessMeta.textContent = `Oggi • ${fmtDate(new Date().toISOString())}`;
      btnStart.textContent = "Pausa";
      btnSave.disabled = false;
    } else {
      sessState.textContent = `In pausa${labelProg}`;
      sessMeta.textContent = `Inizio: ${fmtTime(d.startAt)} • Pausa: ${fmtTime(d.endAt)}`;
      btnStart.textContent = "Riprendi";
      btnSave.disabled = false;
    }
  };

  const renderSessionList = () => {
    ensureDraft();
    const d = state.sessionDraft;
    const exs = d.exercises || [];
    sessionList.innerHTML = "";

    if (exs.length === 0){
      sessionList.innerHTML = `
        <section class="card subtle">
          <div class="k">Nessun esercizio</div>
          <div class="s">Tocca “Scheda” e scegli Push/Pull/Legs/4. In palestra inserisci solo kg e reps.</div>
        </section>
      `;
      return;
    }

    exs.forEach((ex, idx) => {
      const sets = ex.sets || [];
      const last = sets.length ? sets[sets.length-1] : null;
      const prev = lastSetForExercise(ex.name);
      const progress = `${sets.length}/${ex.targetSets || 0} set`;

      const sub = `${escapeHTML(ex.type||"Altro")} • ${progress} • rec ${ex.restSec||90}s • target ${escapeHTML(ex.repsHint||"")}` +
        (prev ? ` • ultima: ${prev.weight}kg×${prev.reps}` : "");

      const card = document.createElement("section");
      card.className = "exercise";
      card.innerHTML = `
        <div class="ex-head">
          <div style="min-width:0">
            <div class="ex-title">${escapeHTML(ex.name)}</div>
            <div class="ex-sub">${sub}</div>
          </div>
          <div class="ex-actions">
            <button class="icon-btn" data-act="rest" title="Recupero"><span class="ic">⏱</span></button>
            <button class="icon-btn" data-act="sets" title="Serie"><span class="ic">≡</span></button>
            <button class="icon-btn" data-act="del" title="Rimuovi"><span class="ic">🗑</span></button>
          </div>
        </div>

        <div class="ex-body">
          <div class="grid-set small">
            <div>Kg</div><div>Reps</div><div></div><div></div>
          </div>
          <div class="grid-set">
            <input class="input mono" inputmode="decimal" placeholder="0" data-f="w" value="${last?.weight ?? ""}" />
            <input class="input mono" inputmode="numeric" placeholder="0" data-f="r" value="${last?.reps ?? ""}" />
            <button class="btn ghost" data-act="quickrest">${ex.restSec||90}s</button>
            <button class="btn primary" data-act="addset">+ Set</button>
          </div>

          <div class="row between">
            <span class="pill">${progress}</span>
            <button class="btn ghost" data-act="note">Note</button>
          </div>
        </div>
      `;

      card.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset?.act;
        if (!act) return;

        if (act === "del"){
          d.exercises.splice(idx,1);
          saveState(); renderAll();
          toastMsg("Rimosso");
        }

        if (act === "rest" || act === "quickrest"){
          startRest(ex.restSec || 90, ex.name);
        }

        if (act === "sets"){
          openSets(ex);
        }

        if (act === "note"){
          openExerciseNote(ex);
        }

        if (act === "addset"){
          if (!d.startAt) return toastMsg("Premi Inizia prima");

          if (!isRunning()){
            d.endAt = null; // resume auto
          }

          const w = parseFloat(String(card.querySelector('[data-f="w"]').value).replace(",", "."));
          const r = clampInt(card.querySelector('[data-f="r"]').value, 0, 300, 0);

          const set = {
            id: Store.uid(),
            weight: Number.isFinite(w) ? w : 0,
            reps: r,
            ts: Store.nowISO()
          };
          ex.sets = ex.sets || [];
          ex.sets.push(set);

          saveState();
          renderAll();

          // auto recupero dopo set
          startRest(ex.restSec || 90, ex.name);
          toastMsg("Set salvato ✅");
        }
      });

      sessionList.appendChild(card);
    });
  };

  // --------- NOTES / SETS ----------
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
            <div class="s">${fmtTime(s.ts)}</div>
          </div>
          <button class="btn danger" data-del="${s.id}">Elimina</button>
        </div>
      </section>
    `).join("") : `<section class="card subtle"><div class="s">Nessun set registrato.</div></section>`;

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

  // --------- PROGRAMS (Schede) ----------
  // We'll render list of programs; allow edit, duplicate, new; inside edit: manage exercises.

  const renderPrograms = () => {
    // repurpose filters as simple search for program name
    libType.innerHTML = `<option value="">Tutte</option>`;
    libType.style.display = "none";   // no need
    libSearch.placeholder = "Cerca scheda…";

    const q = (libSearch.value || "").toLowerCase().trim();
    const progs = (state.programs || []).filter(p => !q || (p.name||"").toLowerCase().includes(q));

    libList.innerHTML = "";
    if (!progs.length){
      libList.innerHTML = `<section class="card subtle"><div class="s">Nessuna scheda. Crea “+ Nuovo”.</div></section>`;
      return;
    }

    progs.forEach(p => {
      const count = (p.items||[]).length;
      const el = document.createElement("section");
      el.className = "card";
      el.innerHTML = `
        <div class="row between">
          <div style="min-width:0">
            <div class="v" style="font-size:16px">${escapeHTML(p.name)}</div>
            <div class="s">${count} esercizi</div>
          </div>
          <div class="row gap" style="flex-wrap:wrap; justify-content:flex-end">
            <button class="btn primary" data-act="start">Start</button>
            <button class="btn" data-act="edit">Modifica</button>
            <button class="btn" data-act="dup">Duplica</button>
            <button class="btn danger" data-act="del">Elimina</button>
          </div>
        </div>
      `;

      el.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset?.act;
        if (!act) return;

        if (act === "start"){
          startProgram(p.id);
          toastMsg("Scheda caricata su Oggi");
          go("session");
          renderAll();
        }

        if (act === "edit"){
          openEditProgram(p);
        }

        if (act === "dup"){
          const copy = JSON.parse(JSON.stringify(p));
          copy.id = Store.uid();
          copy.name = p.name + " (copia)";
          // regenerate item ids
          copy.items = (copy.items||[]).map(it => ({...it, id: Store.uid()}));
          state.programs.push(copy);
          saveState(); renderAll();
          toastMsg("Duplicata");
        }

        if (act === "del"){
          openModal({
            title:"Eliminare scheda?",
            sub:"Operazione irreversibile (dati locali).",
            bodyHTML:`<div class="s">${escapeHTML(p.name)}</div>`,
            actions:[
              mkBtn("Annulla","ghost", closeModal),
              mkBtn("Elimina","danger", () => {
                state.programs = (state.programs||[]).filter(x => x.id !== p.id);
                saveState(); closeModal(); renderAll();
                toastMsg("Eliminata");
              })
            ]
          });
        }
      });

      libList.appendChild(el);
    });
  };

  libSearch.addEventListener("input", renderPrograms);

  const newProgram = () => ({
    id: Store.uid(),
    name: "Nuova scheda",
    color: "p1",
    items: []
  });

  btnNewLib.textContent = "+ Nuova";
  btnNewLib.addEventListener("click", () => {
    const p = newProgram();
    state.programs.push(p);
    saveState();
    openEditProgram(p);
  });

  const openEditProgram = (p) => {
    const items = p.items || [];
    const rows = items.map((it, i) => `
      <section class="card subtle">
        <div class="row between" style="gap:12px; align-items:flex-start">
          <div style="min-width:0">
            <div class="v" style="font-size:15px">${escapeHTML(it.name)}</div>
            <div class="s">${escapeHTML(it.type||"Altro")} • ${it.sets||0} set • target ${escapeHTML(it.repsHint||"")} • rec ${it.restSec||90}s</div>
          </div>
          <div class="row gap" style="flex-wrap:wrap; justify-content:flex-end">
            <button class="btn" data-act="edit" data-i="${i}">Modifica</button>
            <button class="btn danger" data-act="del" data-i="${i}">Elimina</button>
          </div>
        </div>
      </section>
    `).join("");

    openModal({
      title:"Modifica scheda",
      sub:"Imposta esercizi, serie, target reps e recuperi PRIMA della palestra.",
      bodyHTML: `
        <input class="input" id="pName" value="${escapeHTML(p.name)}" />
        <div class="divider"></div>
        <div class="row gap">
          <button class="btn primary" id="pAdd">+ Esercizio</button>
          <button class="btn" id="pReorder">Riordina</button>
        </div>
        <div class="divider"></div>
        <div class="stack" id="pItems">${rows || `<section class="card subtle"><div class="s">Nessun esercizio. Premi “+ Esercizio”.</div></section>`}</div>
      `,
      actions:[
        mkBtn("Chiudi","ghost", () => { closeModal(); renderAll(); }),
        mkBtn("Salva","primary", () => {
          p.name = ($("#pName").value || "").trim() || p.name;
          saveState();
          closeModal();
          renderAll();
          toastMsg("Scheda salvata");
        })
      ]
    });

    $("#pAdd").addEventListener("click", () => openEditProgramItem(p, null));
    $("#pReorder").addEventListener("click", () => openReorderProgram(p));

    $$("#pItems [data-act]").forEach(btn => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        const i = parseInt(btn.dataset.i, 10);
        if (Number.isNaN(i)) return;

        if (act === "del"){
          p.items.splice(i,1);
          saveState();
          closeModal();
          openEditProgram(p);
          toastMsg("Rimosso");
        }
        if (act === "edit"){
          openEditProgramItem(p, i);
        }
      });
    });
  };

  const openEditProgramItem = (p, idx) => {
    const isNew = (idx === null || idx === undefined);
    const it = isNew ? { id: Store.uid(), name:"", type:"Altro", sets:3, repsHint:"8–10", restSec:90, notes:"" } : p.items[idx];

    // type dropdown from state.types
    const opts = (state.types||[]).map(t => `<option value="${escapeHTML(t)}" ${it.type===t?"selected":""}>${escapeHTML(t)}</option>`).join("");

    openModal({
      title: isNew ? "Nuovo esercizio" : "Modifica esercizio",
      sub: "Imposta serie, target reps e recupero. In palestra inserisci solo kg e reps.",
      bodyHTML: `
        <input class="input" id="itName" placeholder="Nome esercizio" value="${escapeHTML(it.name)}" />
        <select class="select" id="itType">${opts}</select>
        <input class="input" id="itSets" inputmode="numeric" placeholder="Serie (es. 3)" value="${escapeHTML(it.sets ?? 3)}" />
        <input class="input" id="itReps" placeholder="Target reps (es. 8–10)" value="${escapeHTML(it.repsHint ?? "")}" />
        <input class="input" id="itRest" inputmode="numeric" placeholder="Recupero (sec) es. 90" value="${escapeHTML(it.restSec ?? 90)}" />
        <textarea class="input" id="itNotes" rows="3" placeholder="Note (opzionale)">${escapeHTML(it.notes||"")}</textarea>
      `,
      actions:[
        mkBtn("Annulla","ghost", () => { closeModal(); openEditProgram(p); }),
        mkBtn("Salva","primary", () => {
          const name = ($("#itName").value||"").trim();
          if (!name) return toastMsg("Inserisci un nome");
          it.name = name;
          it.type = $("#itType").value || "Altro";
          it.sets = clampInt($("#itSets").value, 1, 20, 3);
          it.repsHint = ($("#itReps").value||"").trim();
          it.restSec = clampInt($("#itRest").value, 5, 1800, 90);
          it.notes = $("#itNotes").value || "";

          if (isNew) p.items.push(it);
          else p.items[idx] = it;

          saveState();
          closeModal();
          openEditProgram(p);
          toastMsg("Salvato");
        })
      ]
    });
  };

  const openReorderProgram = (p) => {
    const items = p.items || [];
    const rows = items.map((it,i)=>`
      <section class="card subtle">
        <div class="row between">
          <div class="s">${i+1}. ${escapeHTML(it.name)}</div>
          <div class="row gap">
            <button class="btn" data-act="up" data-i="${i}">↑</button>
            <button class="btn" data-act="dn" data-i="${i}">↓</button>
          </div>
        </div>
      </section>
    `).join("");

    openModal({
      title:"Riordina",
      sub:"Sposta gli esercizi in alto o in basso.",
      bodyHTML:`<div class="stack" id="rWrap">${rows || `<section class="card subtle"><div class="s">Nessun esercizio.</div></section>`}</div>`,
      actions:[
        mkBtn("Chiudi","ghost", () => { closeModal(); openEditProgram(p); })
      ]
    });

    $$("#rWrap [data-act]").forEach(b=>{
      b.addEventListener("click", () => {
        const i = parseInt(b.dataset.i, 10);
        const act = b.dataset.act;
        if (Number.isNaN(i)) return;
        if (act==="up" && i>0){
          [p.items[i-1], p.items[i]] = [p.items[i], p.items[i-1]];
        }
        if (act==="dn" && i < p.items.length-1){
          [p.items[i+1], p.items[i]] = [p.items[i], p.items[i+1]];
        }
        saveState();
        closeModal();
        openReorderProgram(p);
      });
    });
  };

  const startProgram = (programId) => {
    ensureDraft();
    const p = (state.programs||[]).find(x => x.id === programId);
    if (!p) return;

    // reset draft exercises from program (keep session times if already started? Better: if started, confirm)
    const apply = () => {
      const d = state.sessionDraft;
      d.programId = p.id;
      d.programName = p.name;
      d.exercises = (p.items||[]).map(it => ({
        id: Store.uid(),
        name: it.name,
        type: it.type || "Altro",
        targetSets: it.sets || 0,
        repsHint: it.repsHint || "",
        restSec: it.restSec || 90,
        notes: it.notes || "",
        sets: []
      }));
      saveState();
    };

    const d = state.sessionDraft;
    const hasData = (d.exercises||[]).some(ex => (ex.sets||[]).length > 0) || d.startAt;

    if (hasData){
      openModal({
        title:"Caricare la scheda?",
        sub:"Sostituisce l’allenamento corrente (non ancora salvato).",
        bodyHTML:`<div class="s">Scheda: <b>${escapeHTML(p.name)}</b></div>`,
        actions:[
          mkBtn("Annulla","ghost", closeModal),
          mkBtn("Carica","primary", () => {
            state.sessionDraft = newDraft();
            apply();
            closeModal();
            renderAll();
            toastMsg("Scheda caricata");
          })
        ]
      });
      return;
    }

    apply();
  };

  // Picker program from session
  const openProgramPicker = () => {
    const progs = state.programs || [];
    const cards = progs.map(p => `
      <section class="card">
        <div class="row between">
          <div>
            <div class="v" style="font-size:16px">${escapeHTML(p.name)}</div>
            <div class="s">${(p.items||[]).length} esercizi</div>
          </div>
          <button class="btn primary" data-id="${escapeHTML(p.id)}">Carica</button>
        </div>
      </section>
    `).join("");

    openModal({
      title:"Scegli scheda",
      sub:"Carica Push / Pull / Legs / Scheda 4 e poi in palestra inserisci solo kg e reps.",
      bodyHTML:`<div class="stack" id="ppWrap">${cards || `<section class="card subtle"><div class="s">Nessuna scheda.</div></section>`}</div>`,
      actions:[
        mkBtn("Gestisci schede","ghost", () => { closeModal(); go("library"); }),
        mkBtn("Chiudi","ghost", closeModal)
      ]
    });

    $$("#ppWrap button[data-id]").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.dataset.id;
        startProgram(id);
        closeModal();
        renderAll();
        toastMsg("Scheda caricata");
      });
    });
  };

  btnPickProgram.addEventListener("click", openProgramPicker);

  // Manual add exercise in session (rare)
  const openAddManualExercise = () => {
    openModal({
      title:"Aggiungi esercizio",
      sub:"Aggiunta manuale (se proprio ti serve).",
      bodyHTML: `
        <input class="input" id="mxName" placeholder="Nome esercizio" />
        <select class="select" id="mxType">
          ${(state.types||[]).map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("")}
        </select>
        <input class="input" id="mxSets" inputmode="numeric" placeholder="Serie target (es. 3)" value="3" />
        <input class="input" id="mxReps" placeholder="Target reps (es. 8–10)" value="8–10" />
        <input class="input" id="mxRest" inputmode="numeric" placeholder="Recupero (sec) es. 90" value="90" />
      `,
      actions:[
        mkBtn("Annulla","ghost", closeModal),
        mkBtn("Aggiungi","primary", () => {
          const name = ($("#mxName").value||"").trim();
          if (!name) return toastMsg("Inserisci un nome");
          ensureDraft();
          state.sessionDraft.exercises.push({
            id: Store.uid(),
            name,
            type: $("#mxType").value || "Altro",
            targetSets: clampInt($("#mxSets").value, 1, 20, 3),
            repsHint: ($("#mxReps").value||"").trim(),
            restSec: clampInt($("#mxRest").value, 5, 1800, 90),
            notes: "",
            sets: []
          });
          saveState();
          closeModal();
          renderAll();
          toastMsg("Aggiunto");
        })
      ]
    });
  };

  btnAdd.addEventListener("click", openAddManualExercise);
  fabAdd.addEventListener("click", openAddManualExercise);

  // Start / Pause / Resume
  btnStart.addEventListener("click", async () => {
    ensureDraft();

    if (!state.settings.alertsEnabled) {
      const ok = await ensureAudio();
      if (ok) {
        state.settings.alertsEnabled = true;
        saveState();
      }
    }

    const d = state.sessionDraft;

    if (!d.programId && (d.exercises||[]).length === 0){
      // force choose program first
      openProgramPicker();
      return;
    }

    if (!d.startAt){
      d.startAt = Store.nowISO();
      d.endAt = null;
      saveState();
      toastMsg("Sessione iniziata");
      renderAll();
      return;
    }

    if (isRunning()){
      d.endAt = Store.nowISO();
      saveState();
      toastMsg("In pausa");
      renderAll();
      return;
    }

    d.endAt = null;
    saveState();
    toastMsg("Ripresa");
    renderAll();
  });

  // Save session
  btnSave.addEventListener("click", () => {
    ensureDraft();
    const d = state.sessionDraft;
    if (!d.startAt) return toastMsg("Premi Inizia prima");

    if (isRunning()) d.endAt = Store.nowISO();

    const totals = sessionTotals(d);
    if (totals.sets === 0){
      openModal({
        title:"Salvare comunque?",
        sub:"Non hai registrato set.",
        bodyHTML:`<div class="s">Vuoi salvare la sessione vuota?</div>`,
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
    const sess = { ...d, id: d.id || Store.uid(), endAt: d.endAt || Store.nowISO() };
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
      toastMsg("Premi Inizia per il riepilogo");
      return;
    }
    const totals = sessionTotals(d);
    const start = new Date(d.startAt).getTime();
    const end = d.endAt ? new Date(d.endAt).getTime() : Date.now();
    const dur = Math.max(0, Math.floor((end-start)/1000));

    openModal({
      title:"Riepilogo",
      sub: d.programName ? `Scheda: ${d.programName}` : "Sessione corrente",
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
    renderSessionHeader();
  });

  // Menu
  btnMenu.addEventListener("click", () => {
    openModal({
      title:"Menu",
      sub:"Scorciatoie utili in palestra.",
      bodyHTML: `
        <div class="stack">
          <button class="btn" id="mnPick">Scegli scheda</button>
          <button class="btn" id="mnSchede">Gestisci schede</button>
          <div class="divider"></div>
          <button class="btn ghost" id="mnRest90">Recupero 90s</button>
          <button class="btn ghost" id="mnRest120">Recupero 120s</button>
          <button class="btn danger" id="mnStopRest">Stop recupero</button>
        </div>
      `,
      actions:[ mkBtn("Chiudi","ghost", closeModal) ]
    });
    $("#mnPick").addEventListener("click", () => { closeModal(); openProgramPicker(); });
    $("#mnSchede").addEventListener("click", () => { closeModal(); go("library"); });
    $("#mnRest90").addEventListener("click", () => { startRest(90,"Recupero"); closeModal(); });
    $("#mnRest120").addEventListener("click", () => { startRest(120,"Recupero"); closeModal(); });
    $("#mnStopRest").addEventListener("click", () => { stopRest(false); closeModal(); });
  });

  // -------- HISTORY ----------
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
      const title = sess.programName ? `${sess.programName} • ${fmtDate(sess.endAt||sess.startAt)}` : `${fmtDate(sess.endAt||sess.startAt)}`;
      const el = document.createElement("section");
      el.className = "card";
      el.innerHTML = `
        <div class="row between">
          <div>
            <div class="v" style="font-size:16px">${escapeHTML(title)} • ${fmtTime(sess.startAt)} → ${fmtTime(sess.endAt)}</div>
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
            bodyHTML:`<div class="s">${escapeHTML(title)}</div>`,
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
      const sets = (ex.sets||[]).map((s,i)=>`Set ${i+1}: ${s.weight||0}kg×${s.reps||0}`).join("<br>");
      return `
        <section class="card subtle">
          <div class="v" style="font-size:16px">${escapeHTML(ex.name)}</div>
          <div class="s">${escapeHTML(ex.type||"Altro")} • rec ${ex.restSec||90}s • target ${escapeHTML(ex.repsHint||"")}</div>
          <div class="divider"></div>
          <div class="s">${sets || "—"}</div>
        </section>
      `;
    }).join("");

    const totals = sessionTotals(sess);
    const durSec = Math.max(0, Math.floor((new Date(sess.endAt).getTime()-new Date(sess.startAt).getTime())/1000));
    const title = sess.programName ? `${sess.programName}` : "Sessione";

    openModal({
      title:`Dettagli • ${title}`,
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

  // -------- SETTINGS ----------
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
    soundVol.value = clampInt(state.settings.soundVol, 10, 100, 90);
    soundRepeat.value = clampInt(state.settings.soundRepeat, 1, 5, 2);
    toggleVibrate.checked = !!state.settings.vibrate;
    toggleFlash.checked = !!state.settings.flash;
  };

  soundPreset.addEventListener("change", () => { state.settings.soundPreset = soundPreset.value; saveState(); toastMsg("Salvato"); });
  soundVol.addEventListener("input", () => { state.settings.soundVol = clampInt(soundVol.value, 10, 100, 90); saveState(); });
  soundRepeat.addEventListener("input", () => { state.settings.soundRepeat = clampInt(soundRepeat.value, 1, 5, 2); saveState(); });
  toggleVibrate.addEventListener("change", () => { state.settings.vibrate = toggleVibrate.checked; saveState(); toastMsg("Salvato"); });
  toggleFlash.addEventListener("change", () => { state.settings.flash = toggleFlash.checked; saveState(); toastMsg("Salvato"); });

  btnTestAlert.addEventListener("click", async () => {
    const ok = await ensureAudio();
    if (!ok) return toastMsg("Audio non disponibile");
    state.settings.alertsEnabled = true;
    saveState();
    playTone(state.settings.soundPreset);
    vibrate();
    flash();
    toastMsg("Test avviso ✅", 2200);
    renderSessionHeader();
  });

  btnWipe.addEventListener("click", () => {
    openModal({
      title:"Reset dati",
      sub:"Cancella tutto (schede, sessioni, impostazioni).",
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

  // Audio banner
  btnEnableAlerts.addEventListener("click", async () => {
    const ok = await ensureAudio();
    if (!ok) return toastMsg("Audio non disponibile");
    state.settings.alertsEnabled = true;
    saveState();
    playTone(state.settings.soundPreset);
    toastMsg("Avvisi abilitati ✅", 2200);
    renderSessionHeader();
  });

  // --------- SERVICE WORKER ----------
  const registerSW = async () => {
    if (!("serviceWorker" in navigator)) return;
    try{
      await navigator.serviceWorker.register("./sw.js", { scope:"./" });
    }catch(e){ console.warn(e); }
  };

  // --------- RENDER ALL ----------
  const renderAll = () => {
    renderSettings();
    renderPrograms();
    renderHistory();
    renderSessionHeader();
    renderSessionList();
    updateWeek();
    updateElapsed();
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
