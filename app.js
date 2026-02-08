/* app.js - Logbook PWA (vanilla) */

(() => {
  let state = Store.load();

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const subTitle = $("#subTitle");
  const btnQuick = $("#btnQuick");

  // Session
  const sessionStatus = $("#sessionStatus");
  const sessionMeta = $("#sessionMeta");
  const btnStartStop = $("#btnStartStop");
  const btnFinish = $("#btnFinish");
  const btnAddExercise = $("#btnAddExercise");
  const todayExercises = $("#todayExercises");

  // Rest timer
  const restTimerEl = $("#restTimer");
  const restHint = $("#restHint");
  const btnResetRest = $("#btnResetRest");
  const btnSound = $("#btnSound");

  // Week
  const weeklyCount = $("#weeklyCount");
  const weeklyHint = $("#weeklyHint");

  // Library
  const btnNewLibraryExercise = $("#btnNewLibraryExercise");
  const libSearch = $("#libSearch");
  const libTypeFilter = $("#libTypeFilter");
  const libraryList = $("#libraryList");

  // History
  const historyList = $("#historyList");
  const btnExport = $("#btnExport");
  const fileImport = $("#fileImport");

  // Settings
  const toggleVibrate = $("#toggleVibrate");
  const toggleBeep = $("#toggleBeep");
  const btnWipe = $("#btnWipe");

  // Modal
  const modal = $("#modal");
  const modalTitle = $("#modalTitle");
  const modalSub = $("#modalSub");
  const modalBody = $("#modalBody");
  const modalActions = $("#modalActions");
  const modalClose = $("#modalClose");

  // Toast
  const toast = $("#toast");

  // ---------- ROUTER ----------
  const showView = (name) => {
    $$(".view").forEach(v => v.classList.add("hidden"));
    $(`#view-${name}`).classList.remove("hidden");
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.nav === name));

    const titles = {
      session: "Allenamento",
      exercises: "Libreria",
      history: "Storico",
      settings: "Impostazioni"
    };
    subTitle.textContent = titles[name] || "Logbook";
    location.hash = `#${name}`;
  };

  const bootRoute = () => {
    const hash = (location.hash || "#session").replace("#", "");
    if (["session","exercises","history","settings"].includes(hash)) showView(hash);
    else showView("session");
  };

  $$(".tab").forEach(t => t.addEventListener("click", () => showView(t.dataset.nav)));
  window.addEventListener("hashchange", bootRoute);

  // ---------- AUDIO (beep) ----------
  let audioCtx = null;
  const ensureAudio = async () => {
    if (audioCtx) return true;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // “unlock” iOS: piccolo beep silenzioso
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      g.gain.value = 0.00001;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.03);
      return true;
    } catch (e) {
      console.warn("Audio init failed:", e);
      return false;
    }
  };

  const beep = () => {
    if (!state.settings.beep) return;
    if (!audioCtx) return;

    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    o.type = "sine";
    o.frequency.setValueAtTime(880, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    o.connect(g);
    g.connect(audioCtx.destination);

    o.start(t);
    o.stop(t + 0.24);
  };

  const vibrate = (pattern = [80, 40, 80]) => {
    if (!state.settings.vibrate) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
  };

  // ---------- UTIL ----------
  const fmtTime = (d) => {
    const x = (d instanceof Date) ? d : new Date(d);
    return x.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const fmtDate = (d) => {
    const x = (d instanceof Date) ? d : new Date(d);
    return x.toLocaleDateString([], { weekday:"short", day:"2-digit", month:"short" });
  };

  const clampInt = (v, min, max, fallback) => {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };

  const toastMsg = (msg, ms = 1800) => {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), ms);
  };

  const saveState = () => Store.save(state);

  const getWeeklyCount = () => {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const recent = state.history.filter(s => s && s.endAt && (now - new Date(s.endAt).getTime() <= weekMs));
    return recent.length;
  };

  const updateWeeklyUI = () => {
    const n = getWeeklyCount();
    weeklyCount.textContent = `${n} / 4`;
    if (n >= 4) {
      weeklyHint.textContent = "Hai raggiunto 4 allenamenti negli ultimi 7 giorni (puoi comunque continuare).";
      weeklyHint.style.color = "rgba(255,231,190,.92)";
    } else {
      weeklyHint.textContent = "Avviso se superi 4 allenamenti negli ultimi 7 giorni.";
      weeklyHint.style.color = "";
    }
  };

  // ---------- SESSION DRAFT ----------
  const newDraft = () => ({
    id: Store.uid(),
    startAt: null,
    endAt: null,
    note: "",
    exercises: [] // { id, libId|null, name, type, restSec, sets:[{reps, weight, rir, doneAt}] }
  });

  const ensureDraft = () => {
    if (!state.sessionDraft) state.sessionDraft = newDraft();
  };

  const isRunning = () => state.sessionDraft && state.sessionDraft.startAt && !state.sessionDraft.endAt;

  // ---------- REST TIMER ----------
  let rest = {
    active: false,
    endsAt: null,
    interval: null,
    label: ""
  };

  const stopRest = (silent=false) => {
    rest.active = false;
    rest.endsAt = null;
    rest.label = "";
    if (rest.interval) clearInterval(rest.interval);
    rest.interval = null;
    restTimerEl.textContent = "—";
    restHint.textContent = "Avvia un recupero da una serie.";
    btnResetRest.disabled = true;
    if (!silent) toastMsg("Timer fermato");
  };

  const startRest = (sec, label="Recupero") => {
    sec = clampInt(sec, 5, 1800, 90);
    rest.active = true;
    rest.endsAt = Date.now() + sec*1000;
    rest.label = label;
    btnResetRest.disabled = false;

    const tick = () => {
      const leftMs = rest.endsAt - Date.now();
      if (leftMs <= 0) {
        restTimerEl.textContent = "00:00";
        restHint.textContent = `${rest.label}: finito`;
        stopRest(true);
        beep();
        vibrate();
        toastMsg("Recupero finito ✅", 2400);
        return;
      }
      const left = Math.ceil(leftMs / 1000);
      const mm = String(Math.floor(left/60)).padStart(2,"0");
      const ss = String(left%60).padStart(2,"0");
      restTimerEl.textContent = `${mm}:${ss}`;
      restHint.textContent = `${rest.label} in corso`;
    };

    tick();
    if (rest.interval) clearInterval(rest.interval);
    rest.interval = setInterval(tick, 250);
  };

  btnResetRest.addEventListener("click", () => stopRest(false));

  btnSound.addEventListener("click", async () => {
    const ok = await ensureAudio();
    if (ok) toastMsg("Suono pronto ✅");
    else toastMsg("Non riesco ad abilitare il suono");
  });

  // ---------- MODAL ----------
  const openModal = ({ title, sub="", bodyHTML="", actions=[] }) => {
    modalTitle.textContent = title;
    modalSub.textContent = sub;
    modalBody.innerHTML = bodyHTML;
    modalActions.innerHTML = "";
    actions.forEach(a => modalActions.appendChild(a));
    modal.classList.remove("hidden");
  };

  const closeModal = () => modal.classList.add("hidden");
  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  const mkBtn = (text, cls, onClick) => {
    const b = document.createElement("button");
    b.className = `btn ${cls||""}`.trim();
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  };

  // ---------- RENDER SESSION ----------
  const renderSessionHeader = () => {
    ensureDraft();

    if (!state.sessionDraft.startAt) {
      sessionStatus.textContent = "Non iniziata";
      sessionMeta.textContent = "Premi “Inizia” per registrare l’orario.";
      btnStartStop.textContent = "Inizia";
      btnFinish.disabled = true;
    } else if (isRunning()) {
      sessionStatus.textContent = "In corso";
      sessionMeta.textContent = `Inizio: ${fmtTime(state.sessionDraft.startAt)} • Oggi: ${fmtDate(new Date())}`;
      btnStartStop.textContent = "Pausa";
      btnFinish.disabled = false;
    } else {
      sessionStatus.textContent = "Conclusa (non salvata)";
      sessionMeta.textContent = `Inizio: ${fmtTime(state.sessionDraft.startAt)} • Fine: ${fmtTime(state.sessionDraft.endAt)}`;
      btnStartStop.textContent = "Nuova";
      btnFinish.disabled = false;
    }
  };

  const renderTodayExercises = () => {
    ensureDraft();
    const exs = state.sessionDraft.exercises || [];
    todayExercises.innerHTML = "";

    if (exs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card subtle";
      empty.innerHTML = `
        <div class="label">Nessun esercizio</div>
        <div class="meta">Aggiungi un esercizio dalla libreria o creane uno al volo.</div>
      `;
      todayExercises.appendChild(empty);
      return;
    }

    exs.forEach((ex, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "exercise";

      const lastSet = (ex.sets && ex.sets.length) ? ex.sets[ex.sets.length-1] : null;
      const subtitle = `${ex.type || "Altro"} • Recupero: ${ex.restSec || 90}s` + (lastSet ? ` • Ultimo: ${lastSet.weight||0}kg x ${lastSet.reps||0}` : "");

      wrap.innerHTML = `
        <div class="exercise-head">
          <div style="min-width:0">
            <div class="exercise-title">${escapeHTML(ex.name)}</div>
            <div class="exercise-sub">${escapeHTML(subtitle)}</div>
          </div>
          <div class="exercise-actions">
            <button class="icon-btn" data-act="rest" title="Avvia recupero" aria-label="Avvia recupero"><span class="icon">⏱</span></button>
            <button class="icon-btn" data-act="edit" title="Modifica" aria-label="Modifica"><span class="icon">✎</span></button>
            <button class="icon-btn" data-act="del" title="Rimuovi" aria-label="Rimuovi"><span class="icon">🗑</span></button>
          </div>
        </div>
        <div class="exercise-body">
          <div class="set-row small">
            <div>Kg</div><div>Reps</div><div>RIR</div><div></div>
          </div>
          <div class="set-row">
            <input class="input kpi" inputmode="decimal" placeholder="0" data-field="weight" />
            <input class="input kpi" inputmode="numeric" placeholder="0" data-field="reps" />
            <input class="input kpi" inputmode="numeric" placeholder="—" data-field="rir" />
            <button class="btn primary" data-act="addset">+ Set</button>
          </div>

          <div class="row between">
            <div class="badge ${isRunning() ? "good" : "warn"}">
              ${isRunning() ? "In sessione" : "Sessione non attiva"}
            </div>
            <div class="row gap">
              <button class="btn" data-act="copylast">Usa ultimo</button>
              <button class="btn" data-act="history">Serie</button>
            </div>
          </div>
        </div>
      `;

      // Prefill con ultimo set
      const weightIn = wrap.querySelector('input[data-field="weight"]');
      const repsIn = wrap.querySelector('input[data-field="reps"]');
      const rirIn = wrap.querySelector('input[data-field="rir"]');
      if (lastSet) {
        weightIn.value = lastSet.weight ?? "";
        repsIn.value = lastSet.reps ?? "";
        rirIn.value = lastSet.rir ?? "";
      }

      wrap.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset?.act;
        if (!act) return;

        if (act === "rest") {
          startRest(ex.restSec || 90, `${ex.name}`);
        }

        if (act === "del") {
          state.sessionDraft.exercises.splice(idx, 1);
          saveState();
          renderAll();
          toastMsg("Esercizio rimosso");
        }

        if (act === "edit") {
          openEditExerciseModal(ex, () => {
            saveState();
            renderAll();
          });
        }

        if (act === "copylast") {
          const last = (ex.sets && ex.sets.length) ? ex.sets[ex.sets.length-1] : null;
          if (!last) return toastMsg("Nessuna serie precedente");
          weightIn.value = last.weight ?? "";
          repsIn.value = last.reps ?? "";
          rirIn.value = last.rir ?? "";
          toastMsg("Valori copiati");
        }

        if (act === "history") {
          openSetsModal(ex);
        }

        if (act === "addset") {
          if (!isRunning()) return toastMsg("Avvia la sessione prima di registrare serie");
          const weight = parseFloat(String(weightIn.value).replace(",", "."));
          const reps = clampInt(repsIn.value, 0, 200, 0);
          const rir = (String(rirIn.value).trim() === "") ? null : clampInt(rirIn.value, 0, 10, null);

          const s = {
            id: Store.uid(),
            weight: Number.isFinite(weight) ? weight : 0,
            reps: reps,
            rir: rir,
            doneAt: Store.nowISO()
          };
          ex.sets = ex.sets || [];
          ex.sets.push(s);

          saveState();
          renderAll();

          // auto avvia recupero
          startRest(ex.restSec || 90, `${ex.name} • recupero`);
          toastMsg("Serie salvata ✅");
        }
      });

      todayExercises.appendChild(wrap);
    });
  };

  const escapeHTML = (s) => String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

  // ---------- MODALS: ESERCIZI ----------
  const openPickExerciseModal = () => {
    ensureDraft();

    const types = state.library.types || [];
    const options = types.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");

    const bodyHTML = `
      <div class="card subtle">
        <div class="label">Aggiungi da libreria</div>
        <div class="row gap" style="margin-top:10px">
          <input class="input" id="pickSearch" placeholder="Cerca esercizio…" />
          <select class="select" id="pickType">
            <option value="">Tutti</option>
            ${options}
          </select>
        </div>
      </div>
      <div id="pickList" class="stack"></div>
      <div class="card subtle">
        <div class="label">Oppure crea al volo</div>
        <div class="meta">Non viene salvato in libreria (a meno che tu lo voglia dopo).</div>
        <div class="divider"></div>
        <div class="stack">
          <input class="input" id="newName" placeholder="Nome esercizio (es. Chest Fly)" />
          <select class="select" id="newType">${options}</select>
          <input class="input" id="newRest" inputmode="numeric" placeholder="Recupero (sec) es. 90" />
          <button class="btn" id="btnAddTemp">Aggiungi alla sessione</button>
        </div>
      </div>
    `;

    const actions = [
      mkBtn("Chiudi", "ghost", closeModal)
    ];

    openModal({ title: "Aggiungi esercizio", sub: "Seleziona dalla libreria oppure crea al volo.", bodyHTML, actions });

    const pickSearch = $("#pickSearch");
    const pickType = $("#pickType");
    const pickList = $("#pickList");

    const renderPickList = () => {
      const q = (pickSearch.value || "").toLowerCase().trim();
      const tf = pickType.value || "";

      const items = (state.library.exercises || []).filter(x => {
        const okQ = !q || (x.name.toLowerCase().includes(q) || (x.type||"").toLowerCase().includes(q));
        const okT = !tf || x.type === tf;
        return okQ && okT;
      });

      pickList.innerHTML = "";
      if (items.length === 0) {
        pickList.innerHTML = `<div class="card subtle"><div class="meta">Nessun risultato.</div></div>`;
        return;
      }

      items.forEach(item => {
        const el = document.createElement("div");
        el.className = "card";
        el.innerHTML = `
          <div class="row between">
            <div>
              <div class="value" style="font-size:16px">${escapeHTML(item.name)}</div>
              <div class="meta">${escapeHTML(item.type || "Altro")} • Recupero default: ${item.defaultRestSec || 90}s</div>
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
            sets: []
          });
          saveState();
          closeModal();
          renderAll();
          toastMsg("Esercizio aggiunto");
        });
        pickList.appendChild(el);
      });
    };

    pickSearch.addEventListener("input", renderPickList);
    pickType.addEventListener("change", renderPickList);
    renderPickList();

    $("#btnAddTemp").addEventListener("click", () => {
      const name = ($("#newName").value || "").trim();
      const type = $("#newType").value || "Altro";
      const restSec = clampInt($("#newRest").value || "90", 5, 1800, 90);
      if (!name) return toastMsg("Inserisci un nome");

      state.sessionDraft.exercises.push({
        id: Store.uid(),
        libId: null,
        name,
        type,
        restSec,
        sets: []
      });

      saveState();
      closeModal();
      renderAll();
      toastMsg("Esercizio aggiunto");
    });
  };

  const openEditExerciseModal = (ex, onDone) => {
    const types = state.library.types || [];
    const options = types.map(t =>
      `<option value="${escapeHTML(t)}" ${ex.type===t ? "selected":""}>${escapeHTML(t)}</option>`
    ).join("");

    const bodyHTML = `
      <input class="input" id="edName" value="${escapeHTML(ex.name)}" />
      <select class="select" id="edType">${options}</select>
      <input class="input" id="edRest" inputmode="numeric" value="${escapeHTML(ex.restSec ?? 90)}" />
      <div class="meta">Suggerimento: lascia 90–120s per multiarticolari, 60–90s per complementari.</div>
    `;

    const actions = [
      mkBtn("Annulla", "ghost", closeModal),
      mkBtn("Salva", "primary", () => {
        const name = ($("#edName").value || "").trim();
        if (!name) return toastMsg("Nome non valido");
        ex.name = name;
        ex.type = $("#edType").value || "Altro";
        ex.restSec = clampInt($("#edRest").value, 5, 1800, 90);
        closeModal();
        onDone?.();
        toastMsg("Modifiche salvate");
      })
    ];

    openModal({ title:"Modifica esercizio", sub:"Aggiorna nome, tipo e recupero.", bodyHTML, actions });
  };

  const openSetsModal = (ex) => {
    const sets = ex.sets || [];
    const rows = sets.length
      ? sets.map((s,i) => `
          <div class="card subtle">
            <div class="row between">
              <div>
                <div class="value" style="font-size:16px">Set ${i+1}: ${s.weight ?? 0}kg × ${s.reps ?? 0}</div>
                <div class="meta">${s.rir === null || s.rir === undefined ? "RIR: —" : `RIR: ${s.rir}`} • ${fmtTime(s.doneAt)}</div>
              </div>
              <button class="btn danger" data-del="${s.id}">Elimina</button>
            </div>
          </div>
        `).join("")
      : `<div class="card subtle"><div class="meta">Nessuna serie registrata.</div></div>`;

    const bodyHTML = `
      <div class="label">${escapeHTML(ex.name)}</div>
      <div class="meta">${escapeHTML(ex.type || "Altro")} • Recupero: ${ex.restSec || 90}s</div>
      <div class="divider"></div>
      <div class="stack" id="setsWrap">${rows}</div>
    `;

    const actions = [ mkBtn("Chiudi", "ghost", closeModal) ];
    openModal({ title:"Serie", sub:"Controlla o elimina serie registrate.", bodyHTML, actions });

    $$("#setsWrap [data-del]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.del;
        ex.sets = (ex.sets || []).filter(x => x.id !== id);
        saveState();
        closeModal();
        renderAll();
        toastMsg("Serie eliminata");
      });
    });
  };

  // ---------- LIBRARY ----------
  const renderTypeFilter = () => {
    const types = state.library.types || [];
    libTypeFilter.innerHTML = `<option value="">Tutti i tipi</option>` +
      types.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");
  };

  const renderLibrary = () => {
    renderTypeFilter();

    const q = (libSearch.value || "").toLowerCase().trim();
    const tf = libTypeFilter.value || "";

    const items = (state.library.exercises || []).filter(x => {
      const okQ = !q || x.name.toLowerCase().includes(q) || (x.type||"").toLowerCase().includes(q);
      const okT = !tf || x.type === tf;
      return okQ && okT;
    });

    libraryList.innerHTML = "";
    if (items.length === 0) {
      libraryList.innerHTML = `<div class="card subtle"><div class="meta">Nessun esercizio in libreria (creane uno).</div></div>`;
      return;
    }

    items.forEach(item => {
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <div class="row between">
          <div>
            <div class="value" style="font-size:16px">${escapeHTML(item.name)}</div>
            <div class="meta">${escapeHTML(item.type || "Altro")} • Recupero default: ${item.defaultRestSec || 90}s</div>
          </div>
          <div class="row gap">
            <button class="btn" data-act="add">Aggiungi oggi</button>
            <button class="btn" data-act="edit">Modifica</button>
            <button class="btn danger" data-act="del">Elimina</button>
          </div>
        </div>
      `;

      el.querySelector('[data-act="add"]').addEventListener("click", () => {
        ensureDraft();
        state.sessionDraft.exercises.push({
          id: Store.uid(),
          libId: item.id,
          name: item.name,
          type: item.type || "Altro",
          restSec: item.defaultRestSec || 90,
          sets: []
        });
        saveState();
        toastMsg("Aggiunto alla sessione");
        showView("session");
        renderAll();
      });

      el.querySelector('[data-act="edit"]').addEventListener("click", () => openEditLibraryExercise(item));
      el.querySelector('[data-act="del"]').addEventListener("click", () => {
        openModal({
          title: "Eliminare esercizio?",
          sub: "Verrà rimosso dalla libreria (le sessioni storiche restano).",
          bodyHTML: `<div class="meta">${escapeHTML(item.name)}</div>`,
          actions: [
            mkBtn("Annulla", "ghost", closeModal),
            mkBtn("Elimina", "danger", () => {
              state.library.exercises = (state.library.exercises || []).filter(x => x.id !== item.id);
              saveState();
              closeModal();
              renderAll();
              toastMsg("Eliminato");
            })
          ]
        });
      });

      libraryList.appendChild(el);
    });
  };

  const openNewLibraryExercise = () => {
    const types = state.library.types || [];
    const options = types.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");

    const bodyHTML = `
      <input class="input" id="lxName" placeholder="Nome (es. Shoulder Press)" />
      <select class="select" id="lxType">${options}</select>
      <input class="input" id="lxRest" inputmode="numeric" placeholder="Recupero default (sec) es. 90" />
      <div class="card subtle">
        <div class="label">Tipi</div>
        <div class="meta">Vuoi un tipo nuovo? Scrivilo qui sotto.</div>
        <div class="divider"></div>
        <div class="row gap">
          <input class="input" id="lxNewType" placeholder="Nuovo tipo (opzionale)" />
          <button class="btn" id="btnAddType">Aggiungi</button>
        </div>
      </div>
    `;

    openModal({
      title:"Nuovo esercizio",
      sub:"Crea un esercizio in libreria.",
      bodyHTML,
      actions:[
        mkBtn("Annulla","ghost", closeModal),
        mkBtn("Salva","primary", () => {
          const name = ($("#lxName").value || "").trim();
          const type = ($("#lxType").value || "Altro").trim();
          const rest = clampInt($("#lxRest").value || "90", 5, 1800, 90);
          if (!name) return toastMsg("Inserisci un nome");

          state.library.exercises.push({
            id: Store.uid(),
            name, type,
            defaultRestSec: rest
          });
          saveState();
          closeModal();
          renderAll();
          toastMsg("Creato");
        })
      ]
    });

    $("#btnAddType").addEventListener("click", () => {
      const t = ($("#lxNewType").value || "").trim();
      if (!t) return;
      if (!(state.library.types || []).includes(t)) state.library.types.push(t);
      saveState();
      closeModal();
      renderAll();
      toastMsg("Tipo aggiunto");
    });
  };

  const openEditLibraryExercise = (item) => {
    const types = state.library.types || [];
    const options = types.map(t =>
      `<option value="${escapeHTML(t)}" ${item.type===t ? "selected":""}>${escapeHTML(t)}</option>`
    ).join("");

    const bodyHTML = `
      <input class="input" id="elName" value="${escapeHTML(item.name)}" />
      <select class="select" id="elType">${options}</select>
      <input class="input" id="elRest" inputmode="numeric" value="${escapeHTML(item.defaultRestSec ?? 90)}" />
    `;

    openModal({
      title:"Modifica libreria",
      sub:"Aggiorna esercizio e recupero default.",
      bodyHTML,
      actions:[
        mkBtn("Annulla","ghost", closeModal),
        mkBtn("Salva","primary", () => {
          const name = ($("#elName").value || "").trim();
          if (!name) return toastMsg("Nome non valido");
          item.name = name;
          item.type = $("#elType").value || "Altro";
          item.defaultRestSec = clampInt($("#elRest").value, 5, 1800, 90);
          saveState();
          closeModal();
          renderAll();
          toastMsg("Salvato");
        })
      ]
    });
  };

  libSearch.addEventListener("input", renderLibrary);
  libTypeFilter.addEventListener("change", renderLibrary);
  btnNewLibraryExercise.addEventListener("click", openNewLibraryExercise);

  // ---------- HISTORY ----------
  const renderHistory = () => {
    historyList.innerHTML = "";

    const items = [...(state.history || [])].sort((a,b) => new Date(b.endAt || b.startAt).getTime() - new Date(a.endAt || a.startAt).getTime());

    if (items.length === 0) {
      historyList.innerHTML = `<div class="card subtle"><div class="meta">Ancora nessuna sessione salvata.</div></div>`;
      return;
    }

    items.forEach(sess => {
      const exCount = (sess.exercises || []).length;
      const setCount = (sess.exercises || []).reduce((acc,e) => acc + ((e.sets||[]).length), 0);

      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <div class="row between">
          <div>
            <div class="value" style="font-size:16px">${fmtDate(sess.endAt || sess.startAt)} • ${fmtTime(sess.startAt)} → ${fmtTime(sess.endAt)}</div>
            <div class="meta">${exCount} esercizi • ${setCount} serie</div>
          </div>
          <div class="row gap">
            <button class="btn" data-act="open">Dettagli</button>
            <button class="btn danger" data-act="del">Elimina</button>
          </div>
        </div>
      `;

      el.querySelector('[data-act="open"]').addEventListener("click", () => openHistoryDetail(sess));
      el.querySelector('[data-act="del"]').addEventListener("click", () => {
        openModal({
          title: "Eliminare sessione?",
          sub: "Operazione irreversibile (dati locali).",
          bodyHTML: `<div class="meta">${fmtDate(sess.endAt || sess.startAt)} • ${fmtTime(sess.startAt)} → ${fmtTime(sess.endAt)}</div>`,
          actions: [
            mkBtn("Annulla","ghost", closeModal),
            mkBtn("Elimina","danger", () => {
              state.history = (state.history || []).filter(x => x.id !== sess.id);
              saveState();
              closeModal();
              renderAll();
              toastMsg("Sessione eliminata");
            })
          ]
        });
      });

      historyList.appendChild(el);
    });
  };

  const openHistoryDetail = (sess) => {
    const blocks = (sess.exercises || []).map(ex => {
      const sets = (ex.sets || []).map((s,i) => `Set ${i+1}: ${s.weight ?? 0}kg×${s.reps ?? 0}${(s.rir===null||s.rir===undefined) ? "" : ` (RIR ${s.rir})`}`).join("<br>");
      return `
        <div class="card subtle">
          <div class="value" style="font-size:15px">${escapeHTML(ex.name)}</div>
          <div class="meta">${escapeHTML(ex.type || "Altro")} • Recupero: ${ex.restSec || 90}s</div>
          <div class="divider"></div>
          <div class="meta">${sets || "—"}</div>
        </div>
      `;
    }).join("");

    openModal({
      title: "Dettagli sessione",
      sub: `${fmtDate(sess.endAt || sess.startAt)} • ${fmtTime(sess.startAt)} → ${fmtTime(sess.endAt)}`,
      bodyHTML: `<div class="stack">${blocks || `<div class="card subtle"><div class="meta">Nessun dato.</div></div>`}</div>`,
      actions: [ mkBtn("Chiudi","ghost", closeModal) ]
    });
  };

  // Export / Import
  btnExport.addEventListener("click", () => {
    const json = Store.exportJSON(state);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logbook-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toastMsg("Export creato");
  });

  fileImport.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const imported = Store.importJSON(text);
      state = imported;
      saveState();
      toastMsg("Import completato ✅");
      renderAll();
    } catch (err) {
      console.warn(err);
      toastMsg("Import fallito (file non valido)");
    } finally {
      fileImport.value = "";
    }
  });

  // ---------- SETTINGS ----------
  const renderSettings = () => {
    toggleBeep.checked = !!state.settings.beep;
    toggleVibrate.checked = !!state.settings.vibrate;
  };

  toggleBeep.addEventListener("change", () => {
    state.settings.beep = toggleBeep.checked;
    saveState();
    toastMsg("Impostazione salvata");
  });

  toggleVibrate.addEventListener("change", () => {
    state.settings.vibrate = toggleVibrate.checked;
    saveState();
    toastMsg("Impostazione salvata");
  });

  btnWipe.addEventListener("click", () => {
    openModal({
      title: "Reset dati",
      sub: "Cancella tutto (libreria, storico, sessione).",
      bodyHTML: `<div class="badge danger">Operazione irreversibile</div>`,
      actions: [
        mkBtn("Annulla","ghost", closeModal),
        mkBtn("Reset","danger", () => {
          Store.wipe();
          state = Store.load();
          stopRest(true);
          closeModal();
          renderAll();
          toastMsg("Dati resettati");
        })
      ]
    });
  });

  // ---------- SESSION START/STOP/SAVE ----------
  btnStartStop.addEventListener("click", async () => {
    ensureDraft();

    if (state.settings.beep) await ensureAudio();

    if (!state.sessionDraft.startAt) {
      state.sessionDraft.startAt = Store.nowISO();
      state.sessionDraft.endAt = null;
      saveState();
      renderAll();
      toastMsg("Sessione iniziata");
      return;
    }

    if (isRunning()) {
      state.sessionDraft.endAt = Store.nowISO();
      saveState();
      renderAll();
      toastMsg("Sessione in pausa (non salvata)");
      return;
    }

    state.sessionDraft = newDraft();
    saveState();
    renderAll();
    toastMsg("Nuova sessione pronta");
  });

  btnFinish.addEventListener("click", () => {
    ensureDraft();
    if (!state.sessionDraft.startAt) return toastMsg("Avvia la sessione prima di salvare");

    if (isRunning()) state.sessionDraft.endAt = Store.nowISO();

    const draft = state.sessionDraft;

    const setCount = (draft.exercises || []).reduce((acc,e)=>acc+((e.sets||[]).length),0);
    if (setCount === 0) {
      return openModal({
        title: "Salvare comunque?",
        sub: "Non hai registrato serie. Vuoi salvare la sessione vuota?",
        bodyHTML: `<div class="meta">Puoi usarlo come “presenza” in palestra.</div>`,
        actions: [
          mkBtn("Annulla","ghost", closeModal),
          mkBtn("Salva","primary", () => {
            commitDraft(draft);
            closeModal();
          })
        ]
      });
    }

    commitDraft(draft);
  });

  const commitDraft = (draft) => {
    const sess = {
      ...draft,
      id: draft.id || Store.uid(),
      startAt: draft.startAt,
      endAt: draft.endAt || Store.nowISO()
    };
    state.history = state.history || [];
    state.history.push(sess);
    state.sessionDraft = newDraft();
    saveState();
    stopRest(true);
    renderAll();
    toastMsg("Sessione salvata ✅");
  };

  btnAddExercise.addEventListener("click", openPickExerciseModal);

  // ---------- QUICK MENU ----------
  btnQuick.addEventListener("click", () => {
    const bodyHTML = `
      <div class="stack">
        <button class="btn" id="qaRest90">Recupero 90s</button>
        <button class="btn" id="qaRest120">Recupero 120s</button>
        <button class="btn" id="qaStopRest">Stop recupero</button>
        <div class="divider"></div>
        <button class="btn" id="qaGoLib">Vai a Libreria</button>
        <button class="btn" id="qaGoHist">Vai a Storico</button>
      </div>
    `;
    openModal({
      title:"Azioni rapide",
      sub:"Scorciatoie utili durante l’allenamento.",
      bodyHTML,
      actions:[ mkBtn("Chiudi","ghost", closeModal) ]
    });

    $("#qaRest90").addEventListener("click", () => { startRest(90, "Recupero"); closeModal(); });
    $("#qaRest120").addEventListener("click", () => { startRest(120, "Recupero"); closeModal(); });
    $("#qaStopRest").addEventListener("click", () => { stopRest(false); closeModal(); });
    $("#qaGoLib").addEventListener("click", () => { closeModal(); showView("exercises"); });
    $("#qaGoHist").addEventListener("click", () => { closeModal(); showView("history"); });
  });

  // ---------- RENDER ALL ----------
  const renderAll = () => {
    renderSessionHeader();
    renderTodayExercises();
    renderLibrary();
    renderHistory();
    renderSettings();
    updateWeeklyUI();
  };

  // ---------- SERVICE WORKER ----------
  const registerSW = async () => {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    } catch (e) {
      console.warn("SW register failed:", e);
    }
  };

  // ---------- INIT ----------
  const init = () => {
    ensureDraft();
    bootRoute();
    renderAll();
    registerSW();
  };

  init();
})();
