(() => {
  "use strict";

  // ------------------------------------------------------------------
  // التخزين
  // ------------------------------------------------------------------
  const STORE_KEY = "quran-quest-v1";
  const DAILY_GOAL = 30;
  const MAX_HEARTS = 5;

  const defaultState = () => ({
    xp: 0,
    streak: 0,
    lastDay: null,
    daily: { day: null, xp: 0 },
    progress: {},          // { [juz]: { stars, best } }
    stats: {},             // { [cat]: { c, t } }
    mistakes: [],          // ["juz:index", ...]
    sound: true,
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (_) { /* التخزين غير متاح */ }
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  // ------------------------------------------------------------------
  // أدوات
  // ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const toAr = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };

  const stageByJuz = (j) => STAGES.find((s) => s.juz === j);
  const qById = (id) => {
    const [j, i] = id.split(":").map(Number);
    const s = stageByJuz(j);
    return s && s.questions[i] ? { id, juz: j, q: s.questions[i] } : null;
  };

  function isUnlocked(juz) {
    if (juz === 30) return true;
    return !!state.progress[juz + 1];
  }
  function currentJuz() {
    for (let j = 30; j >= 1; j--) if (!state.progress[j]) return j;
    return null;
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ------------------------------------------------------------------
  // الأصوات (WebAudio بدون ملفات)
  // ------------------------------------------------------------------
  let audioCtx = null;
  function beep(notes) {
    if (!state.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      let t = audioCtx.currentTime;
      notes.forEach(([freq, dur]) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(audioCtx.destination);
        o.start(t); o.stop(t + dur + 0.02);
        t += dur * 0.8;
      });
    } catch (_) {}
  }
  const sfx = {
    ok: () => beep([[660, 0.12], [880, 0.18]]),
    bad: () => beep([[300, 0.16], [220, 0.25]]),
    win: () => beep([[523, 0.14], [659, 0.14], [784, 0.14], [1046, 0.3]]),
    tap: () => beep([[520, 0.05]]),
  };

  // ------------------------------------------------------------------
  // الشاشة الرئيسية
  // ------------------------------------------------------------------
  const UNITS = [
    { from: 30, to: 26, name: "الوحدة الأولى", color: "#58cc02" },
    { from: 25, to: 21, name: "الوحدة الثانية", color: "#1cb0f6" },
    { from: 20, to: 16, name: "الوحدة الثالثة", color: "#ce82ff" },
    { from: 15, to: 11, name: "الوحدة الرابعة", color: "#ff9600" },
    { from: 10, to: 6,  name: "الوحدة الخامسة", color: "#ff4b4b" },
    { from: 5,  to: 1,  name: "الوحدة السادسة", color: "#2b70c9" },
  ];
  const OFFSETS = [0, 52, 84, 52, 0, -52, -84, -52];

  function effectiveStreak() {
    if (state.lastDay === dayKey() || state.lastDay === yesterdayKey()) return state.streak;
    return 0;
  }
  function todayXP() {
    return state.daily.day === dayKey() ? state.daily.xp : 0;
  }
  function totalStars() {
    return Object.values(state.progress).reduce((a, p) => a + (p.stars || 0), 0);
  }

  function renderHome() {
    const done = Object.keys(state.progress).length;
    $("stat-streak").textContent = toAr(effectiveStreak());
    $("stat-xp").textContent = toAr(state.xp);
    $("stat-done").textContent = toAr(done);

    const dx = todayXP();
    $("daily-label").textContent = `${toAr(Math.min(dx, DAILY_GOAL))} / ${toAr(DAILY_GOAL)} نقطة`;
    $("daily-fill").style.width = `${Math.min(100, (dx / DAILY_GOAL) * 100)}%`;

    const path = $("path");
    path.innerHTML = "";
    const cur = currentJuz();
    let k = 0;
    UNITS.forEach((u) => {
      const b = el("div", "unit-banner");
      b.style.background = u.color;
      b.innerHTML = `<div><b>${u.name}</b><small>الأجزاء ${toAr(u.from)} – ${toAr(u.to)}</small></div><span class="unit-num">📜</span>`;
      path.appendChild(b);
      for (let j = u.from; j >= u.to; j--) {
        const s = stageByJuz(j);
        const p = state.progress[j];
        const unlocked = isUnlocked(j);
        const wrap = el("div", "node-wrap");
        wrap.style.transform = `translateX(${OFFSETS[k % OFFSETS.length]}px)`;
        k++;
        const btn = el("button", "node");
        btn.setAttribute("aria-label", `الجزء ${j}`);
        if (!unlocked) { btn.classList.add("locked"); btn.textContent = "🔒"; }
        else if (p) { btn.classList.add("done"); btn.textContent = toAr(j); }
        else { btn.textContent = toAr(j); }
        if (j === cur) {
          btn.classList.add("current");
          wrap.appendChild(el("div", "start-bubble", "ابدأ"));
        }
        btn.addEventListener("click", () => openStage(j));
        wrap.appendChild(btn);
        const stars = p ? "⭐".repeat(p.stars) : "";
        wrap.appendChild(el("div", "node-label", `<div class="node-stars">${stars}</div>الجزء ${toAr(j)}<br>${esc(s.surahs)}`));
        path.appendChild(wrap);
      }
    });

    if (cur) {
      requestAnimationFrame(() => {
        const n = path.querySelector(".node.current");
        if (n && !renderHome._scrolled) {
          n.scrollIntoView({ block: "center" });
          renderHome._scrolled = true;
        }
      });
    }
    renderReview();
    renderStats();
  }

  function renderReview() {
    state.mistakes = state.mistakes.filter((id) => qById(id));
    $("mistakes-count").textContent = toAr(state.mistakes.length);
    $("btn-review").disabled = state.mistakes.length === 0;
    const grid = $("skill-buttons");
    grid.innerHTML = "";
    Object.entries(CATEGORIES).forEach(([key, c]) => {
      const b = el("button", "skill-btn", `<span>${c.icon}</span>${c.name}`);
      b.style.borderBottomColor = c.color;
      b.addEventListener("click", () => startSkill(key));
      grid.appendChild(b);
    });
  }

  function renderStats() {
    $("k-streak").textContent = toAr(effectiveStreak());
    $("k-xp").textContent = toAr(state.xp);
    $("k-stars").textContent = toAr(totalStars());
    let c = 0, t = 0;
    Object.values(state.stats).forEach((s) => { c += s.c; t += s.t; });
    $("k-acc").textContent = t ? `${toAr(Math.round((c / t) * 100))}٪` : "—";
    const bars = $("skill-bars");
    bars.innerHTML = "";
    Object.entries(CATEGORIES).forEach(([key, cat]) => {
      const s = state.stats[key] || { c: 0, t: 0 };
      const pct = s.t ? Math.round((s.c / s.t) * 100) : 0;
      const row = el("div", "skill-row");
      row.innerHTML = `<div class="skill-row-head"><span>${cat.icon} ${cat.name}</span><span class="muted">${s.t ? toAr(pct) + "٪ · " + toAr(s.c) + "/" + toAr(s.t) : "لم تبدأ بعد"}</span></div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%;background:${cat.color}"></div></div>`;
      bars.appendChild(row);
    });
  }

  // ------------------------------------------------------------------
  // نافذة المرحلة
  // ------------------------------------------------------------------
  let modalJuz = null;
  function openStage(j) {
    if (!isUnlocked(j)) {
      sfx.bad();
      toast(`أكمل الجزء ${toAr(j + 1)} أولًا لفتح هذه المرحلة 🔒`);
      return;
    }
    sfx.tap();
    modalJuz = j;
    const s = stageByJuz(j);
    const p = state.progress[j];
    $("m-badge").textContent = toAr(j);
    $("m-title").textContent = `${s.title}`;
    $("m-surahs").textContent = `${s.surahs} · ${toAr(s.questions.length)} أسئلة`;
    const cats = [...new Set(s.questions.map((q) => q.c))];
    $("m-cats").innerHTML = cats.map((c) => `<span style="border-color:${CATEGORIES[c].color}">${CATEGORIES[c].icon} ${CATEGORIES[c].name}</span>`).join("");
    $("m-stars").innerHTML = p ? [1, 2, 3].map((i) => (i <= p.stars ? "⭐" : "<span style='opacity:.25'>⭐</span>")).join("") : "";
    $("m-start").textContent = p ? "أعِد المرحلة" : "ابدأ المرحلة";
    $("modal-stage").classList.add("open");
  }
  function closeModal() { $("modal-stage").classList.remove("open"); }

  // نافذة تأكيد داخل الصفحة (بديل confirm)
  function ask(text, sub, okLabel) {
    return new Promise((res) => {
      $("c-text").textContent = text;
      $("c-sub").textContent = sub || "";
      $("c-ok").textContent = okLabel || "نعم";
      const m = $("modal-confirm");
      m.classList.add("open");
      const done = (v) => { m.classList.remove("open"); $("c-ok").onclick = $("c-cancel").onclick = m.onclick = null; res(v); };
      $("c-ok").onclick = () => done(true);
      $("c-cancel").onclick = () => done(false);
      m.onclick = (e) => { if (e.target === m) done(false); };
    });
  }

  // ------------------------------------------------------------------
  // محرّك الدرس
  // ------------------------------------------------------------------
  let L = null; // حالة الدرس الحالي

  function startLesson(mode, items, meta = {}) {
    if (!items.length) { toast("لا توجد أسئلة متاحة بعد"); return; }
    L = {
      mode, meta,
      queue: shuffle(items),
      total: items.length,
      done: 0,
      hearts: MAX_HEARTS,
      mistakes: 0,
      attempts: 0,
      seen: new Set(),
      cur: null,
      answered: false,
      lastCorrect: false,
      selection: null,
      matchFailed: false,
    };
    show("screen-lesson");
    nextQuestion();
  }

  function startStage(j) {
    const s = stageByJuz(j);
    startLesson("stage", s.questions.map((q, i) => ({ id: `${j}:${i}`, juz: j, q })), { juz: j });
  }
  function startReview() {
    const items = state.mistakes.map(qById).filter(Boolean);
    startLesson("review", shuffle(items).slice(0, 10));
  }
  function startSkill(cat) {
    const items = [];
    STAGES.forEach((s) => {
      if (!isUnlocked(s.juz)) return;
      s.questions.forEach((q, i) => { if (q.c === cat) items.push({ id: `${s.juz}:${i}`, juz: s.juz, q }); });
    });
    if (!items.length) { toast("افتح مراحل أكثر لتتدرّب على هذه المهارة"); return; }
    startLesson("skill", shuffle(items).slice(0, 8), { cat });
  }

  function updateLessonTop() {
    $("lesson-fill").style.width = `${(L.done / L.total) * 100}%`;
    $("hearts").textContent = toAr(L.hearts);
  }

  function nextQuestion() {
    if (L.hearts <= 0) return finishLesson(false);
    if (!L.queue.length) return finishLesson(true);
    L.cur = L.queue.shift();
    L.answered = false;
    L.selection = null;
    L.matchFailed = false;
    updateLessonTop();

    const { q, juz } = L.cur;
    const cat = CATEGORIES[q.c];
    const chip = $("q-chip");
    chip.style.background = cat.color;
    chip.textContent = `${cat.icon} ${cat.name}${L.mode !== "stage" ? " · الجزء " + toAr(juz) : ""}`;
    $("q-text").textContent = q.q;
    $("q-ayah").innerHTML = q.a ? `<div class="ayah-text">﴿${esc(q.a)}﴾</div>${q.r ? `<div class="ayah-ref">[${esc(q.r)}]</div>` : ""}` : "";

    const footer = $("lesson-footer");
    footer.classList.remove("ok", "bad");
    const btn = $("btn-check");
    btn.textContent = "تحقّق";
    btn.disabled = true;
    btn.style.display = "";

    const body = $("q-body");
    body.innerHTML = "";
    if (q.t === "match") renderMatch(q, body);
    else renderMCQ(q, body);
    $("screen-lesson").querySelector(".lesson-main").scrollTop = 0;
  }

  // ---------- اختيار من متعدد ----------
  const KEYS = ["أ", "ب", "ج", "د", "هـ"];
  function renderMCQ(q, body) {
    const opts = q.o.length === 2 ? q.o.map((text, i) => ({ text, correct: i === 0 }))
                                  : shuffle(q.o.map((text, i) => ({ text, correct: i === 0 })));
    L.opts = opts;
    const wrap = el("div", "options" + (opts.length === 2 ? " two" : ""));
    opts.forEach((o, i) => {
      const b = el("button", "opt", `<span class="key">${KEYS[i]}</span><span>${esc(o.text)}</span>`);
      b.addEventListener("click", () => selectOpt(i));
      wrap.appendChild(b);
    });
    body.appendChild(wrap);
  }
  function selectOpt(i) {
    if (L.answered) return;
    sfx.tap();
    L.selection = i;
    document.querySelectorAll(".opt").forEach((b, k) => b.classList.toggle("selected", k === i));
    $("btn-check").disabled = false;
  }
  function checkMCQ() {
    const correctIdx = L.opts.findIndex((o) => o.correct);
    const ok = L.selection === correctIdx;
    const btns = document.querySelectorAll(".opt");
    btns.forEach((b, k) => {
      b.disabled = true;
      b.classList.remove("selected");
      if (k === correctIdx) b.classList.add("correct");
      else if (k === L.selection) b.classList.add("wrong");
    });
    resolve(ok, L.opts[correctIdx].text);
  }

  // ---------- المطابقة ----------
  function renderMatch(q, body) {
    $("btn-check").style.display = "none";
    const words = shuffle(q.p.map((p, i) => ({ text: p[0], i })));
    const means = shuffle(q.p.map((p, i) => ({ text: p[1], i })));
    const grid = el("div", "match");
    const colW = el("div", "match-col");
    const colM = el("div", "match-col");
    let selW = null, selM = null, matched = 0;

    const tryPair = () => {
      if (!selW || !selM) return;
      const a = selW, b = selM;
      selW = selM = null;
      if (a.dataset.i === b.dataset.i) {
        sfx.ok();
        [a, b].forEach((n) => { n.classList.remove("sel"); n.classList.add("ok"); n.disabled = true; });
        matched++;
        if (matched === q.p.length) setTimeout(() => resolve(!L.matchFailed, null), 250);
      } else {
        sfx.bad();
        L.matchFailed = true;
        [a, b].forEach((n) => { n.classList.remove("sel"); n.classList.add("bad"); });
        setTimeout(() => [a, b].forEach((n) => n.classList.remove("bad")), 450);
      }
    };
    const mk = (item, cls, col, side) => {
      const t = el("button", "tile " + cls);
      t.textContent = item.text;
      t.dataset.i = item.i;
      t.addEventListener("click", () => {
        if (t.disabled || L.answered) return;
        sfx.tap();
        col.querySelectorAll(".tile.sel").forEach((n) => n.classList.remove("sel"));
        t.classList.add("sel");
        if (side === "w") selW = t; else selM = t;
        tryPair();
      });
      col.appendChild(t);
    };
    words.forEach((w) => mk(w, "word", colW, "w"));
    means.forEach((m) => mk(m, "mean", colM, "m"));
    grid.appendChild(colW);
    grid.appendChild(colM);
    body.appendChild(grid);
  }

  // ---------- تقييم الإجابة ----------
  function resolve(ok, correctText) {
    L.answered = true;
    L.lastCorrect = ok;
    L.attempts++;
    const { q, id } = L.cur;
    const st = state.stats[q.c] || (state.stats[q.c] = { c: 0, t: 0 });
    st.t++;
    const firstTime = !L.seen.has(id);
    L.seen.add(id);

    if (ok) {
      st.c++;
      L.done++;
      if (firstTime) state.mistakes = state.mistakes.filter((m) => m !== id);
      sfx.ok();
    } else {
      L.mistakes++;
      L.hearts--;
      L.queue.push(L.cur);
      if (!state.mistakes.includes(id)) state.mistakes.push(id);
      sfx.bad();
      const h = $("screen-lesson").querySelector(".hearts");
      h.classList.remove("shake"); void h.offsetWidth; h.classList.add("shake");
    }
    save();
    updateLessonTop();

    const footer = $("lesson-footer");
    footer.classList.add(ok ? "ok" : "bad");
    $("fb-icon").textContent = ok ? "✅" : "❌";
    $("fb-title").textContent = ok ? pick(["أحسنت!", "ممتاز!", "بارك الله فيك!", "إجابة صحيحة!"]) : "الإجابة الصحيحة:";
    $("fb-answer").textContent = !ok && correctText ? correctText : "";
    $("fb-explain").textContent = q.e || "";
    const btn = $("btn-check");
    btn.style.display = "";
    btn.disabled = false;
    btn.textContent = ok ? "متابعة" : (L.hearts > 0 ? "فهمت، متابعة" : "متابعة");
    btn.focus({ preventScroll: true });
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function onCheck() {
    if (!L) return;
    if (L.answered) return nextQuestion();
    if (L.cur.q.t === "mcq" && L.selection != null) checkMCQ();
  }

  // ---------- إنهاء الدرس ----------
  function finishLesson(passed) {
    const acc = L.attempts ? Math.round(((L.attempts - L.mistakes) / L.attempts) * 100) : 0;
    let xp = 0, stars = 0;
    if (passed) {
      stars = L.mistakes === 0 ? 3 : L.mistakes <= 2 ? 2 : 1;
      xp = L.mode === "stage" ? L.total * 2 + stars * 5 : L.total * 2;
      if (L.mode === "stage") {
        const j = L.meta.juz;
        const prev = state.progress[j];
        const wasNew = !prev;
        state.progress[j] = { stars: Math.max(stars, prev ? prev.stars : 0), best: Math.max(acc, prev ? prev.best : 0) };
        L.meta.unlockedNext = wasNew && j > 1;
      }
    } else {
      xp = L.done; // نقاط بسيطة على المحاولة
    }
    state.xp += xp;
    if (state.daily.day !== dayKey()) state.daily = { day: dayKey(), xp: 0 };
    state.daily.xp += xp;
    if (passed) {
      const today = dayKey();
      if (state.lastDay !== today) {
        state.streak = state.lastDay === yesterdayKey() ? state.streak + 1 : 1;
        state.lastDay = today;
      }
    }
    save();

    $("r-emoji").textContent = passed ? (stars === 3 ? "🏆" : "🎉") : "💔";
    $("r-title").textContent = passed ? (stars === 3 ? "إتقان تام!" : "أحسنت!") : "نفدت القلوب";
    let sub = "";
    if (!passed) sub = "لا بأس، المراجعة طريق الإتقان. حاول مرة أخرى!";
    else if (L.mode === "stage") {
      const j = L.meta.juz;
      sub = j === 1 && L.meta.unlockedNext !== undefined
        ? "أتممت المراحل كلها — ختمتَ رحلة الثلاثين جزءًا! 🌙"
        : L.meta.unlockedNext ? `أتممت الجزء ${toAr(j)} وفُتح لك الجزء ${toAr(j - 1)}` : `أتممت الجزء ${toAr(j)}`;
    } else sub = L.mode === "review" ? "أتممت جلسة المراجعة" : "أتممت جلسة التدريب";
    $("r-sub").textContent = sub;
    $("r-stars").innerHTML = passed && L.mode === "stage" ? [1, 2, 3].map((i) => (i <= stars ? "⭐" : "<span class='off'>⭐</span>")).join("") : "";
    $("r-xp").textContent = `+${toAr(xp)}`;
    $("r-acc").textContent = `${toAr(acc)}٪`;
    $("btn-retry").style.display = passed && L.mode !== "stage" ? "none" : "";
    $("btn-retry").textContent = passed ? "أعِد المرحلة لتحسين النجوم" : "إعادة المحاولة";
    show("screen-result");
    if (passed) sfx.win(); else sfx.bad();
  }

  // ------------------------------------------------------------------
  // التنقل
  // ------------------------------------------------------------------
  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
    window.scrollTo(0, 0);
    if (id === "screen-home") { renderHome._scrolled = false; renderHome(); }
  }

  function bind() {
    document.querySelectorAll(".nav-btn").forEach((b) =>
      b.addEventListener("click", () => {
        document.querySelectorAll(".nav-btn").forEach((n) => n.classList.toggle("active", n === b));
        document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === b.dataset.tab));
        window.scrollTo(0, 0);
        if (b.dataset.tab === "tab-path") { renderHome._scrolled = false; renderHome(); }
      })
    );
    $("m-start").addEventListener("click", () => { closeModal(); startStage(modalJuz); });
    $("m-close").addEventListener("click", closeModal);
    $("modal-stage").addEventListener("click", (e) => { if (e.target.id === "modal-stage") closeModal(); });
    $("btn-check").addEventListener("click", onCheck);
    $("btn-quit").addEventListener("click", async () => {
      if (L && L.done > 0 && !(await ask("هل تريد الخروج؟", "سيضيع تقدّمك في هذه المرحلة.", "خروج"))) return;
      L = null;
      show("screen-home");
    });
    $("btn-continue").addEventListener("click", () => { L = null; show("screen-home"); });
    $("btn-retry").addEventListener("click", () => {
      const { mode, meta } = L;
      if (mode === "stage") startStage(meta.juz);
      else if (mode === "skill") startSkill(meta.cat);
      else startReview();
    });
    $("btn-review").addEventListener("click", startReview);
    $("btn-reset").addEventListener("click", async () => {
      if (!(await ask("إعادة ضبط التقدّم؟", "سيُحذف كل تقدّمك ونقاطك ونجومك.", "احذف التقدّم"))) return;
      state = defaultState();
      save();
      renderHome();
      toast("تمت إعادة الضبط");
    });

    document.addEventListener("keydown", (e) => {
      if (!$("screen-lesson").classList.contains("active") || !L) return;
      if (e.key === "Enter") { e.preventDefault(); if (!$("btn-check").disabled) onCheck(); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4 && L.cur && L.cur.q.t === "mcq" && L.opts && n <= L.opts.length) selectOpt(n - 1);
    });
  }

  // ------------------------------------------------------------------
  // تشغيل
  // ------------------------------------------------------------------
  bind();
  renderHome();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
