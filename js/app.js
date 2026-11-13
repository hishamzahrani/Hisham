(() => {
  "use strict";

  // ------------------------------------------------------------------
  // الإعدادات
  // ------------------------------------------------------------------
  const STORE_KEY = "quran-quest-v1";
  const DAILY_GOAL = 30;
  const MAX_HEARTS = 5;
  const LESSONS = 6;        // دروس متنوعة في كل جزء
  const TEST_SIZE = 8;      // أسئلة اختبار الجزء
  const UNIT_SIZE = 15;     // أسئلة الجولة الختامية للوحدة
  const CAT_ORDER = Object.keys(CATEGORIES);

  // المراحل الفرعية السبع لكل جزء: ستة دروس متنوعة + اختبار الجزء
  const SUBS = ["١", "٢", "٣", "٤", "٥", "٦"].map((n, i) => ({ k: i + 1, short: `الدرس ${n}` }))
    .concat([{ k: 7, short: "اختبار الجزء", test: true }]);
  const SUB_COUNT = SUBS.length;

  // الوحدات: كل وحدة خمسة أجزاء، تُختم بجولة ختامية
  const UNIT_NAMES = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة"];
  const UNIT_COLORS = ["#58cc02", "#1cb0f6", "#ce82ff", "#ff9600", "#ff4b4b", "#2b70c9"];
  const UNITS = UNIT_NAMES.map((name, u) => ({ u, name: `الوحدة ${name}`, from: 30 - u * 5, to: 26 - u * 5, color: UNIT_COLORS[u] }));
  const unitOf = (j) => Math.floor((30 - j) / 5);
  const isUnitEnd = (j) => (j - 1) % 5 === 0;

  // ------------------------------------------------------------------
  // التخزين
  // ------------------------------------------------------------------
  const defaultState = () => ({
    xp: 0,
    streak: 0,
    lastDay: null,
    daily: { day: null, xp: 0 },
    progress: {},          // { [juz]: { subs: { [k]: stars } } }
    units: {},             // { [u]: stars }
    stats: {},             // { [cat]: { c, t } }
    mistakes: [],          // ["juz:index", ...]
    sound: true,
  });

  let state = load();

  function load() {
    let s = defaultState();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) s = Object.assign(defaultState(), JSON.parse(raw));
    } catch (_) { /* التخزين غير متاح */ }
    Object.keys(s.progress).forEach((j) => {
      const p = s.progress[j];
      if (p && !p.subs) {
        const subs = {};
        for (let k = 1; k <= SUB_COUNT; k++) subs[k] = p.stars || 1;
        s.progress[j] = { subs };
      }
    });
    if (!s.units) s.units = {};
    return s;
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
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  const stageByJuz = (j) => STAGES.find((s) => s.juz === j);
  const qById = (id) => {
    const [j, i] = id.split(":").map(Number);
    const s = stageByJuz(j);
    return s && s.questions[i] ? { id, juz: j, q: s.questions[i] } : null;
  };
  const juzItems = (j) => stageByJuz(j).questions.map((q, i) => ({ id: `${j}:${i}`, juz: j, q }));

  /** توزيع أسئلة الجزء على الدروس الستة توزيعًا ثابتًا متنوّع المحاور */
  const lessonCache = {};
  function lessonBuckets(j) {
    if (lessonCache[j]) return lessonCache[j];
    const all = juzItems(j);
    const ordered = CAT_ORDER.flatMap((c) => all.filter((it) => it.q.c === c));
    const buckets = Array.from({ length: LESSONS }, () => []);
    ordered.forEach((it, i) => buckets[i % LESSONS].push(it));
    return (lessonCache[j] = buckets);
  }

  /** اختيار عيّنة متنوعة المحاور من مجموعة أسئلة */
  function diverseSample(items, n) {
    const byCat = {};
    shuffle(items).forEach((it) => (byCat[it.q.c] = byCat[it.q.c] || []).push(it));
    const out = [];
    const cats = shuffle(Object.keys(byCat));
    while (out.length < n && cats.some((c) => byCat[c].length)) {
      for (const c of cats) {
        if (out.length >= n) break;
        if (byCat[c].length) out.push(byCat[c].pop());
      }
    }
    return out;
  }

  // ---------- التقدّم ----------
  const subStars = (j, k) => (state.progress[j] && state.progress[j].subs[k]) || 0;
  const subDone = (j, k) => subStars(j, k) > 0;
  const juzDone = (j) => subDone(j, SUB_COUNT);
  const juzSubsDone = (j) => SUBS.filter((s) => subDone(j, s.k)).length;
  const unitStars = (u) => state.units[u] || 0;
  const unitDone = (u) => unitStars(u) > 0;
  const isUnitUnlocked = (u) => juzDone(UNITS[u].to);

  function isSubUnlocked(j, k) {
    if (k === 1) {
      if (j === 30) return true;
      return juzDone(j + 1) && (!isUnitEnd(j + 1) || unitDone(unitOf(j + 1)));
    }
    return subDone(j, k - 1);
  }
  function currentSub() {
    for (const U of UNITS) {
      for (let j = U.from; j >= U.to; j--) {
        for (let k = 1; k <= SUB_COUNT; k++) {
          if (!subDone(j, k)) return isSubUnlocked(j, k) ? { j, k } : null;
        }
      }
      if (!unitDone(U.u)) return isUnitUnlocked(U.u) ? { u: U.u } : null;
    }
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
  const OFFSETS = [0, 44, 72, 44, 0, -44, -72, -44];

  function effectiveStreak() {
    if (state.lastDay === dayKey() || state.lastDay === yesterdayKey()) return state.streak;
    return 0;
  }
  const todayXP = () => (state.daily.day === dayKey() ? state.daily.xp : 0);
  const totalStars = () =>
    Object.values(state.progress).reduce((a, p) => a + Object.values(p.subs || {}).reduce((x, y) => x + y, 0), 0) +
    Object.values(state.units).reduce((a, b) => a + b, 0);
  const doneJuzCount = () => STAGES.filter((s) => juzDone(s.juz)).length;
  const MAX_STARS = (30 * SUB_COUNT + UNITS.length) * 3;

  function renderHome() {
    $("stat-streak").textContent = toAr(effectiveStreak());
    $("stat-xp").textContent = toAr(state.xp);
    $("stat-done").textContent = toAr(doneJuzCount());

    const dx = todayXP();
    $("daily-label").textContent = `${toAr(Math.min(dx, DAILY_GOAL))} / ${toAr(DAILY_GOAL)} نقطة`;
    $("daily-fill").style.width = `${Math.min(100, (dx / DAILY_GOAL) * 100)}%`;

    const path = $("path");
    path.innerHTML = "";
    const cur = currentSub();
    let n = 0;

    const addNode = ({ cls, content, label, stars, isCur, bubble, onClick, aria }) => {
      const wrap = el("div", "node-wrap");
      wrap.style.transform = `translateX(${OFFSETS[n % OFFSETS.length]}px)`;
      n++;
      const btn = el("button", "node " + cls);
      btn.setAttribute("aria-label", aria);
      btn.textContent = content;
      if (isCur) { btn.classList.add("current"); wrap.appendChild(el("div", "start-bubble", bubble)); }
      btn.addEventListener("click", onClick);
      wrap.appendChild(btn);
      wrap.appendChild(el("div", "node-label", `<div class="node-stars">${stars ? "⭐".repeat(stars) : ""}</div>${label}`));
      path.appendChild(wrap);
    };

    UNITS.forEach((U) => {
      path.appendChild(el("div", "unit-title", `<span>${U.name}</span><small>الأجزاء ${toAr(U.from)} – ${toAr(U.to)}</small>`));

      for (let j = U.from; j >= U.to; j--) {
        const s = stageByJuz(j);
        const locked = !isSubUnlocked(j, 1);
        const b = el("div", "unit-banner" + (locked ? " locked" : ""));
        if (!locked) b.style.background = U.color;
        b.innerHTML = `<div class="ub-text"><small>الجزء ${toAr(j)}</small><b>${esc(s.title)}</b><small>${esc(s.surahs)}</small></div>
          <div class="ub-progress">${juzDone(j) ? "🏆" : locked ? "🔒" : `${toAr(juzSubsDone(j))}/${toAr(SUB_COUNT)}`}</div>`;
        path.appendChild(b);

        SUBS.forEach((sub) => {
          const k = sub.k;
          const unlocked = isSubUnlocked(j, k);
          const stars = subStars(j, k);
          addNode({
            cls: (sub.test ? "test" : "") + (!unlocked ? " locked" : stars ? " done" : ""),
            content: sub.test ? "🏆" : !unlocked ? "🔒" : toAr(k),
            label: sub.short,
            stars,
            isCur: cur && cur.j === j && cur.k === k,
            bubble: k === 1 ? `ابدأ الجزء ${toAr(j)}` : "ابدأ",
            onClick: () => openStage(j, k),
            aria: `الجزء ${j}، ${sub.short}`,
          });
        });
      }

      // الجولة الختامية للوحدة
      const uUnlocked = isUnitUnlocked(U.u);
      const uStars = unitStars(U.u);
      addNode({
        cls: "unit-final" + (!uUnlocked ? " locked" : uStars ? " done" : ""),
        content: uUnlocked ? "👑" : "🔒",
        label: `الجولة الختامية<br>${U.name}`,
        stars: uStars,
        isCur: cur && cur.u === U.u,
        bubble: "الجولة الختامية",
        onClick: () => openUnit(U.u),
        aria: `الجولة الختامية ${U.name}`,
      });
    });

    if (!renderHome._scrolled) {
      requestAnimationFrame(() => {
        const node = path.querySelector(".node.current");
        if (node) node.scrollIntoView({ block: "center" });
        renderHome._scrolled = true;
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
    $("k-stars-max").textContent = `نجمة من ${toAr(MAX_STARS)}`;
    let c = 0, t = 0;
    Object.values(state.stats).forEach((s) => { c += s.c; t += s.t; });
    $("k-acc").textContent = t ? `${toAr(Math.round((c / t) * 100))}٪` : "—";
    const bars = $("skill-bars");
    bars.innerHTML = "";
    Object.entries(CATEGORIES).forEach(([key, cat]) => {
      const s = state.stats[key] || { c: 0, t: 0 };
      const pct = s.t ? Math.round((s.c / s.t) * 100) : 0;
      const row = el("div", "skill-row");
      row.innerHTML = `<div class="skill-row-head"><span>${cat.icon} ${cat.name}</span><span class="muted">${s.t ? toAr(pct) + "٪ — " + toAr(s.c) + "/" + toAr(s.t) : "لم تبدأ بعد"}</span></div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%;background:${cat.color}"></div></div>`;
      bars.appendChild(row);
    });
  }

  // ------------------------------------------------------------------
  // نافذة المرحلة
  // ------------------------------------------------------------------
  let modalSel = null;

  function itemsForSub(j, k) {
    if (k <= LESSONS) return lessonBuckets(j)[k - 1];
    return diverseSample(juzItems(j), TEST_SIZE);
  }
  function itemsForUnit(u) {
    const U = UNITS[u];
    const per = Math.ceil(UNIT_SIZE / 5);
    let items = [];
    for (let j = U.from; j >= U.to; j--) items = items.concat(diverseSample(juzItems(j), per));
    return shuffle(items).slice(0, UNIT_SIZE);
  }
  const catChips = (items) => {
    const cats = CAT_ORDER.filter((c) => items.some((it) => it.q.c === c));
    return cats.map((c) => `<span style="border-color:${CATEGORIES[c].color}">${CATEGORIES[c].icon} ${CATEGORIES[c].name}</span>`).join("");
  };

  function showModal({ badge, badgeBg, title, sub, chips, stars, startLabel }) {
    const b = $("m-badge");
    b.textContent = badge;
    b.style.background = badgeBg;
    $("m-title").textContent = title;
    $("m-surahs").textContent = sub;
    $("m-cats").innerHTML = chips;
    $("m-stars").innerHTML = stars ? [1, 2, 3].map((i) => (i <= stars ? "⭐" : "<span style='opacity:.25'>⭐</span>")).join("") : "";
    $("m-start").textContent = startLabel;
    $("modal-stage").classList.add("open");
  }

  function openStage(j, k) {
    if (!isSubUnlocked(j, k)) {
      sfx.bad();
      const prevUnit = k === 1 && isUnitEnd(j + 1) && juzDone(j + 1);
      toast(k > 1 ? `أكمل ${SUBS[k - 2].short} أولًا 🔒`
        : prevUnit ? "اجتز الجولة الختامية للوحدة السابقة أولًا 🔒"
        : `أكمل اختبار الجزء ${toAr(j + 1)} أولًا 🔒`);
      return;
    }
    sfx.tap();
    modalSel = { j, k };
    const s = stageByJuz(j);
    const sub = SUBS[k - 1];
    const items = k <= LESSONS ? lessonBuckets(j)[k - 1] : juzItems(j);
    const count = sub.test ? Math.min(TEST_SIZE, items.length) : items.length;
    const stars = subStars(j, k);
    showModal({
      badge: sub.test ? "🏆" : toAr(k),
      badgeBg: sub.test ? "#ce82ff" : "var(--green)",
      title: `${sub.short} — ${s.title}`,
      sub: `الجزء ${toAr(j)} — المرحلة ${toAr(k)} من ${toAr(SUB_COUNT)} — ${toAr(count)} أسئلة`,
      chips: sub.test ? `<span style="border-color:#ce82ff">أسئلة منوّعة من محاور الجزء كلها</span>` : catChips(items),
      stars,
      startLabel: stars ? "أعِد المرحلة" : sub.test ? "ابدأ الاختبار" : "ابدأ الدرس",
    });
  }

  function openUnit(u) {
    if (!isUnitUnlocked(u)) {
      sfx.bad();
      toast(`أكمل اختبار الجزء ${toAr(UNITS[u].to)} أولًا 🔒`);
      return;
    }
    sfx.tap();
    modalSel = { u };
    const U = UNITS[u];
    const stars = unitStars(u);
    showModal({
      badge: "👑",
      badgeBg: "var(--gold)",
      title: `الجولة الختامية — ${U.name}`,
      sub: `أسئلة منوّعة من الأجزاء ${toAr(U.from)} – ${toAr(U.to)} — ${toAr(UNIT_SIZE)} سؤالًا`,
      chips: `<span style="border-color:var(--gold)">تُفتح الوحدة التالية بعد اجتيازها</span>`,
      stars,
      startLabel: stars ? "أعِد الجولة" : "ابدأ الجولة الختامية",
    });
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
      selection: null,
      matchFailed: false,
    };
    show("screen-lesson");
    nextQuestion();
  }

  const startStage = (j, k) => startLesson("stage", itemsForSub(j, k), { juz: j, k });
  const startUnit = (u) => startLesson("unit", itemsForUnit(u), { u });
  function startReview() {
    const items = state.mistakes.map(qById).filter(Boolean);
    startLesson("review", shuffle(items).slice(0, 10));
  }
  function startSkill(cat) {
    const items = [];
    STAGES.forEach((s) => {
      if (!isSubUnlocked(s.juz, 1)) return;
      s.questions.forEach((q, i) => { if (q.c === cat) items.push({ id: `${s.juz}:${i}`, juz: s.juz, q }); });
    });
    if (!items.length) { toast("افتح مراحل أكثر لتتدرّب على هذا المحور"); return; }
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
    chip.textContent = `${cat.icon} ${cat.name}${L.mode !== "stage" ? " — الجزء " + toAr(juz) : ""}`;
    $("q-text").textContent = q.t === "tf" ? `صح أم خطأ؟ ${q.q}` : q.q;
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

  // ---------- اختيار من متعدد / صح وخطأ ----------
  const KEYS = ["أ", "ب", "ج", "د", "هـ"];
  const FIXED_PAIRS = [["مكية", "مدنية"], ["صحيح", "خطأ"]];

  function buildOptions(q) {
    if (q.t === "tf") return [{ text: "صحيح", correct: q.v === true }, { text: "خطأ", correct: q.v === false }];
    const opts = q.o.map((text, i) => ({ text, correct: i === 0 }));
    if (opts.length === 2) {
      const pair = FIXED_PAIRS.find((p) => p.includes(opts[0].text) && p.includes(opts[1].text));
      if (pair) return pair.map((t) => opts.find((o) => o.text === t));
    }
    return shuffle(opts);
  }

  function renderMCQ(q, body) {
    const opts = buildOptions(q);
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
    document.querySelectorAll(".opt").forEach((b, k) => {
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
    const src = sourceOf(q);
    $("fb-source").innerHTML = `📚 <b>${esc(src.label)}:</b> ${esc(src.text)}`;
    const btn = $("btn-check");
    btn.style.display = "";
    btn.disabled = false;
    btn.textContent = ok ? "متابعة" : (L.hearts > 0 ? "فهمت، متابعة" : "متابعة");
    btn.focus({ preventScroll: true });
  }

  function onCheck() {
    if (!L) return;
    if (L.answered) return nextQuestion();
    if (L.cur.q.t !== "match" && L.selection != null) checkMCQ();
  }

  // ---------- إنهاء الدرس ----------
  function finishLesson(passed) {
    const acc = L.attempts ? Math.round(((L.attempts - L.mistakes) / L.attempts) * 100) : 0;
    let xp = 0, stars = 0, firstClear = false;
    const { juz: j, k, u } = L.meta;
    if (passed) {
      stars = L.mistakes === 0 ? 3 : L.mistakes <= 2 ? 2 : 1;
      xp = L.total * 2 + (L.mode === "stage" ? stars * 2 + (k === SUB_COUNT ? 10 : 0) : 0) + (L.mode === "unit" ? 30 : 0);
      if (L.mode === "stage") {
        const p = state.progress[j] || (state.progress[j] = { subs: {} });
        firstClear = !p.subs[k];
        p.subs[k] = Math.max(stars, p.subs[k] || 0);
      } else if (L.mode === "unit") {
        firstClear = !state.units[u];
        state.units[u] = Math.max(stars, state.units[u] || 0);
      }
    } else {
      xp = L.done;
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

    const isTest = L.mode === "stage" && k === SUB_COUNT;
    const isUnit = L.mode === "unit";
    $("r-emoji").textContent = !passed ? "💔" : isUnit ? "👑" : isTest ? "🏆" : stars === 3 ? "🌟" : "🎉";
    $("r-title").textContent = !passed ? "نفدت القلوب" : isUnit ? "أتممت الوحدة!" : isTest ? "أتممت الجزء!" : stars === 3 ? "إتقان تام!" : "أحسنت!";
    let sub = "";
    if (!passed) sub = "لا بأس، المراجعة طريق الإتقان. حاول مرة أخرى!";
    else if (isUnit) {
      const U = UNITS[u];
      sub = u === UNITS.length - 1 ? "ختمتَ رحلة الثلاثين جزءًا كاملة! 🌙"
        : `اجتزت الجولة الختامية لـ${U.name}` + (firstClear ? ` وفُتح لك الجزء ${toAr(U.to - 1)}` : "");
    } else if (L.mode === "stage") {
      if (isTest) {
        sub = isUnitEnd(j) ? `أتممت الجزء ${toAr(j)}، وبقيت الجولة الختامية للوحدة 👑`
          : firstClear ? `أتممت الجزء ${toAr(j)} بمراحله السبع، وفُتح لك الجزء ${toAr(j - 1)}` : `أتممت اختبار الجزء ${toAr(j)}`;
      } else {
        sub = `أتممت ${SUBS[k - 1].short} من الجزء ${toAr(j)}` + (firstClear ? ` — فُتحت المرحلة ${toAr(k + 1)}` : "");
      }
    } else sub = L.mode === "review" ? "أتممت جلسة المراجعة" : "أتممت جلسة التدريب";
    $("r-sub").textContent = sub;
    $("r-stars").innerHTML = passed && (L.mode === "stage" || isUnit) ? [1, 2, 3].map((i) => (i <= stars ? "⭐" : "<span class='off'>⭐</span>")).join("") : "";
    $("r-xp").textContent = `+${toAr(xp)}`;
    $("r-acc").textContent = `${toAr(acc)}٪`;
    const canRetry = !passed || L.mode === "stage" || isUnit;
    $("btn-retry").style.display = canRetry ? "" : "none";
    $("btn-retry").textContent = passed ? "أعِد لتحسين النجوم" : "إعادة المحاولة";
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
    $("m-start").addEventListener("click", () => {
      closeModal();
      if (modalSel.u != null) startUnit(modalSel.u); else startStage(modalSel.j, modalSel.k);
    });
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
      if (mode === "stage") startStage(meta.juz, meta.k);
      else if (mode === "unit") startUnit(meta.u);
      else if (mode === "skill") startSkill(meta.cat);
      else startReview();
    });
    $("btn-review").addEventListener("click", startReview);
    $("btn-reset").addEventListener("click", async () => {
      if (!(await ask("إعادة ضبط التقدّم؟", "سيُحذف كل تقدّمك ونقاطك ونجومك.", "احذف التقدّم"))) return;
      state = defaultState();
      save();
      renderHome._scrolled = false;
      renderHome();
      toast("تمت إعادة الضبط");
    });

    document.addEventListener("keydown", (e) => {
      if (!$("screen-lesson").classList.contains("active") || !L) return;
      if (e.key === "Enter") { e.preventDefault(); if (!$("btn-check").disabled) onCheck(); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4 && L.cur && L.cur.q.t !== "match" && L.opts && n <= L.opts.length) selectOpt(n - 1);
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
