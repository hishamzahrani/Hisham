(() => {
  "use strict";
  const KEY = "dad-app-v1";
  const HEARTS_MAX = 5, REFILL_MS = 16 * 3600e3, DAILY_GOAL = 30;
  const $ = id => document.getElementById(id);
  const $view = $("view");
  const AR = n => Number(n).toLocaleString("ar-EG");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const today = () => new Date().toISOString().slice(0, 10);
  const bySci = id => SCIENCES.find(s => s.id === id);
  const qById = id => { const [s, l, q] = id.split("."); return bySci(s).lessons[+l].qs[+q]; };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- وسائل النقل بين المحطات ---------- */
  const VEH = ["ship", "bus", "train"];
  const RIDE = {
    ship:  { icon: "🚢", stop: "⚓", label: "بالسفينة إلى", deco: ["🐬", "🏝️"] },
    bus:   { icon: "🚌", stop: "🚏", label: "بالحافلة إلى", deco: ["🌳", "🏡"] },
    train: { icon: "🚆", stop: "🚉", label: "بالقطار إلى",  deco: ["⛰️", "🌾"] },
  };
  const WALKER = "🚶";

  /* ---------- الحالة ---------- */
  const fresh = () => ({ xp: 0, streak: 0, lastDay: "", done: {}, tests: {}, mistakes: [], stats: {}, theme: "",
    hearts: HEARTS_MAX, refillAt: 0, daily: { day: "", xp: 0 }, pos: -1 });
  let S = fresh();
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const applyTheme = () => { if (S.theme) document.documentElement.dataset.theme = S.theme; else delete document.documentElement.dataset.theme; };
  applyTheme();

  function syncHearts() {
    if (S.refillAt && Date.now() >= S.refillAt) { S.hearts = HEARTS_MAX; S.refillAt = 0; save(); }
    return S.hearts;
  }
  function loseHeart() {
    syncHearts();
    S.hearts = Math.max(0, S.hearts - 1);
    if (!S.refillAt) S.refillAt = Date.now() + REFILL_MS; // يبدأ العدّ من أول قلب يُفقد
    save();
  }
  function fmtLeft(ms) {
    const t = Math.max(0, Math.ceil(ms / 1000)), p = n => String(n).padStart(2, "0");
    return `${p(Math.floor(t / 3600))}:${p(Math.floor(t % 3600 / 60))}:${p(t % 60)}`.replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
  }
  function streakNow() {
    if (!S.lastDay) return 0;
    return (new Date(today()) - new Date(S.lastDay)) / 864e5 <= 1 ? S.streak : 0;
  }
  function touchDay() {
    const t = today();
    if (S.lastDay === t) return;
    const d = S.lastDay ? (new Date(t) - new Date(S.lastDay)) / 864e5 : 99;
    S.streak = d === 1 ? S.streak + 1 : 1;
    S.lastDay = t;
  }
  const todayXP = () => (S.daily.day === today() ? S.daily.xp : 0);
  function addXP(n) {
    S.xp += n;
    if (S.daily.day !== today()) S.daily = { day: today(), xp: 0 };
    S.daily.xp += n;
  }
  function header() {
    $("s-streak").textContent = AR(streakNow());
    $("s-xp").textContent = AR(S.xp);
    $("s-hearts").textContent = AR(syncHearts());
  }
  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
  }
  const lessonsDone = sci => sci.lessons.filter((_, i) => S.done[sci.id + "." + i]).length;
  const starStr = n => "★".repeat(n) + "☆".repeat(3 - n);

  /* ---------- المحطات والمسار ---------- */
  // قائمة خطية بكل نقاط الرحلة: محطة ← دروس (مشيًا) ← اختبار المحطة ← وسيلة نقل ← المحطة التالية … ← خط الوصول
  function buildStops() {
    const st = [];
    SCIENCES.forEach((s, si) => {
      st.push({ type: "station", si });
      s.lessons.forEach((l, li) => st.push({ type: "lesson", si, li, key: s.id + "." + li }));
      st.push({ type: "test", si });
    });
    st.push({ type: "end", si: SCIENCES.length - 1 });
    return st;
  }
  const STOPS = buildStops();
  const lastSci = SCIENCES[SCIENCES.length - 1];
  function unlocked(p) {
    if (p.type === "lesson") return p.li === 0 ? (p.si === 0 || !!S.tests[SCIENCES[p.si - 1].id]) : !!S.done[SCIENCES[p.si].id + "." + (p.li - 1)];
    if (p.type === "test") return lessonsDone(SCIENCES[p.si]) === SCIENCES[p.si].lessons.length;
    if (p.type === "station") return p.si === 0 || !!S.tests[SCIENCES[p.si - 1].id];
    return !!S.tests[lastSci.id];
  }
  const isDone = p => p.type === "lesson" ? !!S.done[p.key] : p.type === "test" ? !!S.tests[SCIENCES[p.si].id] : unlocked(p);
  function currentIndex() {
    for (let i = 0; i < STOPS.length; i++) {
      const p = STOPS[i];
      if ((p.type === "lesson" || p.type === "test") && !isDone(p)) return i;
    }
    return STOPS.length - 1;
  }
  const vehicleAfter = i => STOPS[i].type === "test" ? VEH[STOPS[i].si % VEH.length] : "walk";
  const destName = i => STOPS[i].type === "end" ? "خط الوصول" : SCIENCES[STOPS[i].si].name;

  // إحداثيات الخريطة (وحدات افتراضية تُكبَّر بحسب عرض الشاشة)
  const W = 340, CX = 170, ZZ = [0, 74, 0, -74];
  function layout() {
    let y = 50;
    STOPS.forEach(p => {
      if (p.type === "station" || p.type === "end") { p.x = CX; p.y = y; y += 108; }
      else if (p.type === "lesson") { p.x = CX + ZZ[(p.li + 1) % 4]; p.y = y; y += 98; }
      else { p.x = CX; p.y = y; y += 280; }
    });
    return y - 40;
  }
  const MAP_H = layout();
  function segPath(i) {
    const a = STOPS[i], b = STOPS[i + 1], dy = b.y - a.y;
    if (vehicleAfter(i) === "walk") return `M${a.x},${a.y} C${a.x},${a.y + dy / 2} ${b.x},${b.y - dy / 2} ${b.x},${b.y}`;
    const side = a.si % 2 ? -1 : 1;
    return `M${a.x},${a.y} C${a.x + side * 150},${a.y + dy * 0.3} ${b.x - side * 150},${b.y - dy * 0.3} ${b.x},${b.y}`;
  }

  function setTab(t) {
    document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
    document.body.classList.remove("in-lesson");
    header();
  }

  /* ---------- الخريطة ---------- */
  let animating = false;
  function home(opts = {}) {
    setTab("home");
    const cur = currentIndex();
    const done = Object.keys(S.done).length, total = SCIENCES.reduce((a, s) => a + s.lessons.length, 0);
    const dx = todayXP();

    let segs = "";
    for (let i = 0; i < STOPS.length - 1; i++) {
      const d = segPath(i), v = vehicleAfter(i), reached = i + 1 <= cur;
      if (v === "walk") {
        segs += `<path id="seg-${i}" data-type="walk" d="${d}" class="walk" style="stroke:${reached ? SCIENCES[STOPS[i].si].color : "var(--path)"}"/>`;
      } else if (v === "ship") {
        segs += `<path d="${d}" class="sea"/><path d="${d}" class="sea-wave"/><path id="seg-${i}" data-type="ship" d="${d}" class="guide"/>`;
      } else if (v === "bus") {
        segs += `<path d="${d}" class="road"/><path id="seg-${i}" data-type="bus" d="${d}" class="road-line"/>`;
      } else {
        segs += `<path d="${d}" class="ties"/><path d="${d}" class="rail"/><path id="seg-${i}" data-type="train" d="${d}" class="rail-gap"/>`;
      }
    }

    let nodes = "";
    STOPS.forEach((p, i) => {
      const pos = `left:${100 * p.x / W}%;top:calc(${p.y}px * var(--k))`;
      if (p.type === "station") {
        const s = SCIENCES[p.si];
        const stop = p.si === 0 ? "🚩" : RIDE[VEH[(p.si - 1) % VEH.length]].stop;
        nodes += `<div class="station ${unlocked(p) ? "" : "locked"}" style="${pos};--c:${s.color}">
          <span class="st-ico">${stop}</span><span class="st-name"><small>المحطة ${AR(p.si + 1)}</small><b>${s.name}</b></span>
          <span class="st-prog">${S.tests[s.id] ? "🏅" : `${AR(lessonsDone(s))} من ${AR(s.lessons.length)}`}</span></div>`;
      } else if (p.type === "end") {
        nodes += `<div class="station end ${unlocked(p) ? "" : "locked"}" style="${pos}"><span class="st-ico">🏁</span><span class="st-name"><small>نهاية الرحلة</small><b>خط الوصول</b></span></div>`;
      } else {
        const s = SCIENCES[p.si], ok = unlocked(p), dn = isDone(p), isCur = i === cur;
        const stars = p.type === "lesson" ? S.done[p.key] || 0 : 0;
        const label = p.type === "lesson" ? s.lessons[p.li].title : `اختبار محطة ${s.name}`;
        const content = !ok ? "🔒" : p.type === "test" ? "🏅" : dn ? "✓" : AR(p.li + 1);
        nodes += `<button class="node ${p.type} ${dn ? "done" : ""} ${ok ? "" : "locked"} ${isCur ? "current" : ""}"
            style="${pos};--c:${s.color}" data-act="stop" data-i="${i}" aria-label="${esc(label)}">${content}</button>
          <div class="node-label" style="left:${100 * p.x / W}%;top:calc(${p.y}px * var(--k) + 34px)">${stars ? `<span class="stars">${starStr(stars)}</span>` : ""}${esc(label)}</div>`;
      }
    });

    $view.innerHTML = `
      <div class="hero">
        <h1>رحلة الضاد</h1>
        <p>سبع محطات لعلوم العربية: تمشي بين دروس كل محطة، فإذا اجتزت اختبارها ركبت السفينة أو الحافلة أو القطار إلى المحطة التالية. أنجزت ${AR(done)} من ${AR(total)} درسًا.</p>
        <div class="daily"><span>🎯 هدف اليوم</span><span>${AR(Math.min(dx, DAILY_GOAL))} / ${AR(DAILY_GOAL)} نقطة</span></div>
        <div class="bar"><i style="width:${Math.min(100, 100 * dx / DAILY_GOAL)}%"></i></div>
      </div>
      <div class="map" id="map">
        <svg viewBox="0 0 ${W} ${MAP_H}" aria-hidden="true">${segs}</svg>
        <div id="decos"></div>
        ${nodes}
        <div class="avatar" id="avatar"><span>${WALKER}</span></div>
      </div>`;

    const map = $("map");
    const fit = () => { const k = map.clientWidth / W; map.style.setProperty("--k", k); map.style.height = MAP_H * k + "px"; };
    fit();
    window.onresize = () => { if ($("map")) { fit(); if (!animating) placeAt(STOPS[currentIndex()]); } };

    // لافتات وزخارف على مقاطع وسائل النقل
    let dec = "";
    for (let i = 0; i < STOPS.length - 1; i++) {
      const v = vehicleAfter(i); if (v === "walk") continue;
      const path = $("seg-" + i), m = path.getPointAtLength(path.getTotalLength() / 2), side = STOPS[i].si % 2 ? -1 : 1;
      const tagX = Math.min(W - 75, Math.max(75, m.x - side * 100));
      dec += `<div class="seg-tag" style="left:${100 * tagX / W}%;top:calc(${m.y}px * var(--k))">${RIDE[v].icon} ${RIDE[v].label} ${destName(i + 1)}</div>`;
      const d1 = Math.min(W - 22, Math.max(22, m.x - side * 70)), d2 = Math.min(W - 22, Math.max(22, m.x + side * 110));
      dec += `<div class="deco" style="left:${100 * d1 / W}%;top:calc(${m.y - 75}px * var(--k))">${RIDE[v].deco[0]}</div>`;
      dec += `<div class="deco" style="left:${100 * d2 / W}%;top:calc(${m.y + 70}px * var(--k))">${RIDE[v].deco[1]}</div>`;
    }
    $("decos").innerHTML = dec;

    const from = S.pos;
    if (from >= 0 && from < cur && !reduceMotion && !opts.noAnim) {
      placeAt(STOPS[from]); scrollToY(STOPS[from].y);
      setTimeout(() => travel(from, cur), 400);
    } else {
      S.pos = cur; save();
      placeAt(STOPS[cur]); scrollToY(STOPS[cur].y);
    }
  }

  function placeAt(p, rideType, dx) {
    const a = $("avatar"); if (!a) return;
    const riding = !!rideType && rideType !== "walk";
    a.style.left = 100 * p.x / W + "%";
    a.style.top = `calc(${p.y}px * var(--k) - ${riding ? 2 : 30}px)`;
    a.classList.toggle("riding", riding);
    // الرموز التعبيرية تتجه يسارًا؛ نقلبها حين تتحرك يمينًا
    if (dx !== undefined && Math.abs(dx) > 0.15) a.firstElementChild.style.transform = dx > 0 ? "scaleX(-1)" : "none";
  }
  function scrollToY(y) {
    const map = $("map"); if (!map) return;
    const k = map.clientWidth / W, top = map.getBoundingClientRect().top + window.scrollY + y * k - innerHeight / 2;
    window.scrollTo(0, Math.max(0, top));
  }
  // تحريك المسافر عبر المقاطع: مشيًا بين الدروس، وبالسفينة أو الحافلة أو القطار بين المحطات
  function travel(from, to) {
    animating = true;
    const a = $("avatar");
    let i = from;
    const end = () => {
      animating = false; S.pos = to; save();
      if (!document.body.contains(a)) return;
      a.firstElementChild.textContent = WALKER; placeAt(STOPS[to]);
    };
    const step = () => {
      if (i >= to || !document.body.contains(a)) return end();
      const path = $("seg-" + i), type = path.dataset.type, L = path.getTotalLength();
      const dur = type === "walk" ? 700 : 2800;
      a.firstElementChild.textContent = type === "walk" ? WALKER : RIDE[type].icon;
      if (type !== "walk") toast(`${RIDE[type].icon} ${RIDE[type].label} ${destName(i + 1)}`);
      const t0 = performance.now();
      const frame = now => {
        if (!document.body.contains(a)) return end();
        const t = Math.min(1, (now - t0) / dur), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const pt = path.getPointAtLength(e * L), pt2 = path.getPointAtLength(Math.min(L, e * L + 2));
        placeAt(pt, type, pt2.x - pt.x);
        scrollToY(pt.y);
        if (t < 1) requestAnimationFrame(frame); else { i++; step(); }
      };
      requestAnimationFrame(frame);
    };
    step();
  }

  function openStop(i) {
    const p = STOPS[i];
    if (!unlocked(p)) return toast(p.type === "test" ? "أنهِ دروس المحطة أولًا" : p.li === 0 ? "اجتز اختبار المحطة السابقة لتصل إلى هنا" : "أنهِ الدرس السابق أولًا");
    if (p.type === "lesson") return notes(p.key);
    const s = SCIENCES[p.si], v = RIDE[VEH[p.si % VEH.length]], nextName = destName(i + 1);
    modal(`<div class="m-ico">🏅</div><h2>اختبار محطة ${s.name}</h2>
      <p class="muted">١٠ أسئلة من دروس المحطة كلها، ودرجة النجاح ٧٠٪. إذا نجحت ركبت ${v.icon} ${v.label.replace("ب", "").replace(" إلى", "")} إلى ${nextName}.</p>
      ${S.tests[s.id] ? `<p>أفضل نتيجة: <b>${AR(S.tests[s.id])}٪</b></p>` : ""}
      <button class="btn btn-block" data-act="test" data-id="${s.id}">ابدأ الاختبار</button>
      <button class="btn btn-ghost btn-block" data-act="close">ليس الآن</button>`);
  }

  function notes(key) {
    const [sid, li] = key.split("."); const s = bySci(sid), l = s.lessons[+li];
    setTab("home"); document.body.classList.add("in-lesson"); window.scrollTo(0, 0);
    $view.innerHTML = `
      <button class="back" data-act="home">→ الخريطة</button>
      <div class="q-kind">محطة ${s.name} · الدرس ${AR(+li + 1)} من ${AR(s.lessons.length)}</div>
      <h1>${l.title}</h1>
      <p class="muted small">اقرأ الشرح جيدًا، ثم انتقل إلى التمارين.</p>
      ${l.notes.map(n => `<div class="note" style="--c:${s.color}">${n}</div>`).join("")}
      <button class="btn btn-block" style="margin-top:8px" data-act="start" data-id="${key}">ابدأ التمارين ←</button>`;
  }

  /* ---------- النوافذ ---------- */
  let heartsTimer = null;
  function modal(html) {
    closeModal();
    const m = document.createElement("div");
    m.className = "modal"; m.id = "modal";
    m.innerHTML = `<div class="sheet">${html}</div>`;
    m.addEventListener("click", e => { if (e.target === m) closeModal(); });
    document.body.appendChild(m);
  }
  function closeModal() { clearInterval(heartsTimer); const m = $("modal"); if (m) m.remove(); }
  function heartsModal(title) {
    const h = syncHearts();
    modal(`<div class="m-ico">${h ? "❤️" : "💔"}</div><h2>${title || (h ? `لديك ${AR(h)} من ${AR(HEARTS_MAX)} قلوب` : "نفدت القلوب")}</h2>
      <p class="muted">كل إجابة خاطئة في الدروس واختبارات المحطات تُنقص قلبًا، وتمتلئ القلوب كلها بعد ١٦ ساعة من أول قلب يُفقد.</p>
      ${S.refillAt ? `<p>تمتلئ بعد: <b class="timer" id="h-left">${fmtLeft(S.refillAt - Date.now())}</b></p>` : ""}
      <p class="muted small">المراجعة والتدريب الحر متاحان دائمًا بلا قلوب.</p>
      <button class="btn btn-block" data-act="review">اذهب إلى المراجعة</button>
      <button class="btn btn-ghost btn-block" data-act="close">حسنًا</button>`);
    if (S.refillAt) heartsTimer = setInterval(() => {
      const el = $("h-left"); if (!el) return clearInterval(heartsTimer);
      if (Date.now() >= S.refillAt) { syncHearts(); header(); closeModal(); toast("امتلأت القلوب ❤️"); return; }
      el.textContent = fmtLeft(S.refillAt - Date.now());
    }, 1000);
  }

  /* ---------- محرك التمارين ---------- */
  let Q = null;
  function startSession(mode, ids, extra = {}) {
    closeModal();
    const useHearts = mode === "lesson" || mode === "test";
    if (useHearts && syncHearts() <= 0) return heartsModal();
    document.body.classList.add("in-lesson"); window.scrollTo(0, 0);
    Q = { mode, useHearts, items: ids.map(id => ({ id, q: qById(id) })), i: 0, wrong: new Set(), repeated: new Set(), total: ids.length, ...extra };
    renderQ();
  }
  function startLesson(key) {
    const [sid, li] = key.split(".");
    const ids = shuffle(bySci(sid).lessons[+li].qs.map((_, i) => `${key}.${i}`));
    startSession("lesson", ids, { key, sid, color: bySci(sid).color });
  }
  function startTest(sid) {
    const s = bySci(sid), ids = [];
    s.lessons.forEach((l, li) => l.qs.forEach((_, qi) => ids.push(`${sid}.${li}.${qi}`)));
    startSession("test", shuffle(ids).slice(0, 10), { sid, color: s.color });
  }
  function startPractice(sid) {
    const s = bySci(sid), ids = [];
    s.lessons.forEach((l, li) => { if (S.done[sid + "." + li]) l.qs.forEach((_, qi) => ids.push(`${sid}.${li}.${qi}`)); });
    if (!ids.length) return toast("أنهِ درسًا واحدًا على الأقل في هذه المحطة");
    startSession("practice", shuffle(ids).slice(0, 10), { sid, color: s.color });
  }
  function startReview() {
    if (!S.mistakes.length) return;
    startSession("review", shuffle(S.mistakes).slice(0, 12), { color: "var(--primary)" });
  }

  const KIND = { m: "اختر الإجابة الصحيحة", t: "صواب أم خطأ؟", p: "طابق بين العمودين" };
  const MODE_TITLE = { test: "اختبار المحطة", review: "مراجعة الأخطاء", practice: "تدريب حر" };

  function renderQ() {
    const q = Q.items[Q.i].q;
    let body = "";
    if (q.t === "m") {
      Q.cur = shuffle(q.o.map((t, i) => ({ t, ok: i === 0 })));
      body = `<div class="opts" id="opts">${Q.cur.map((o, i) => `<button class="opt" data-act="pick" data-i="${i}">${esc(o.t)}</button>`).join("")}</div>`;
    } else if (q.t === "t") {
      body = `<div class="opts tf" id="opts">
        <button class="opt" data-act="tf" data-v="1">✓ صواب</button>
        <button class="opt" data-act="tf" data-v="0">✗ خطأ</button></div>`;
    } else {
      const R = shuffle(q.pairs.map((p, i) => ({ t: p[0], i }))), L = shuffle(q.pairs.map((p, i) => ({ t: p[1], i })));
      Q.sel = null; Q.left = q.pairs.length; Q.matchErr = false;
      body = `<div class="match" id="opts">
        <div class="col">${R.map(x => `<button class="opt" data-act="mr" data-i="${x.i}">${esc(x.t)}</button>`).join("")}</div>
        <div class="col">${L.map(x => `<button class="opt" data-act="ml" data-i="${x.i}">${esc(x.t)}</button>`).join("")}</div></div>`;
    }
    $view.innerHTML = `
      <div class="quiz-top">
        <button class="x-btn" data-act="quit" aria-label="خروج">✕</button>
        <div class="bar" style="--c:${Q.color}"><i style="width:${100 * Q.i / Q.items.length}%"></i></div>
        ${Q.useHearts ? `<span class="q-hearts">❤️ ${AR(S.hearts)}</span>` : `<span class="small muted">${AR(Q.i + 1)} من ${AR(Q.items.length)}</span>`}
      </div>
      ${MODE_TITLE[Q.mode] ? `<div class="q-kind">${MODE_TITLE[Q.mode]}</div>` : ""}
      <div class="q-kind">${KIND[q.t]}</div>
      <div class="q-text">${esc(q.q)}</div>
      ${q.ex ? `<div class="q-ex">${esc(q.ex)}</div>` : ""}
      ${body}`;
  }

  function answer(ok, correctText) {
    const it = Q.items[Q.i], q = it.q, sid = it.id.split(".")[0];
    S.stats[sid] = S.stats[sid] || { c: 0, w: 0 };
    S.stats[sid][ok ? "c" : "w"]++;
    if (ok) {
      if (Q.mode === "review") S.mistakes = S.mistakes.filter(x => x !== it.id);
    } else {
      Q.wrong.add(it.id);
      if (!S.mistakes.includes(it.id)) S.mistakes.push(it.id);
      if (Q.useHearts) loseHeart();
      // في الدروس والمراجعة يعود السؤال الخاطئ في آخر الجولة مرة واحدة
      if (Q.mode !== "test" && !Q.repeated.has(it.id)) { Q.repeated.add(it.id); Q.items.push(it); }
    }
    save(); header();
    const qh = document.querySelector(".q-hearts"); if (qh) qh.textContent = "❤️ " + AR(S.hearts);
    $("opts").classList.add("locked");
    const fb = document.createElement("div");
    fb.className = "feedback " + (ok ? "ok" : "bad");
    fb.innerHTML = `<div class="inner">
      <h3>${ok ? "أحسنت! ✓" : "ليست الإجابة الصحيحة"}</h3>
      ${!ok && correctText ? `<p><b>الصواب:</b> ${esc(correctText)}</p>` : ""}
      <p>${esc(q.e || "")}</p>
      <button class="btn btn-block ${ok ? "btn-ok" : "btn-bad"}" data-act="next">متابعة</button></div>`;
    $view.appendChild(fb);
  }
  function pick(i, el) {
    document.querySelectorAll("#opts .opt").forEach((b, j) => { if (Q.cur[j].ok) b.classList.add("correct"); });
    if (!Q.cur[i].ok) el.classList.add("wrong");
    answer(Q.cur[i].ok, Q.items[Q.i].q.o[0]);
  }
  function tf(v, el) {
    const q = Q.items[Q.i].q, ok = (v === "1") === q.a;
    el.classList.add(ok ? "correct" : "wrong");
    answer(ok, q.a ? "العبارة صحيحة" : "العبارة خاطئة");
  }
  function matchTap(side, i, el) {
    if (side === "mr") {
      document.querySelectorAll('[data-act="mr"]').forEach(b => b.classList.remove("picked"));
      el.classList.add("picked"); Q.sel = { i, el }; return;
    }
    if (!Q.sel) return toast("اختر من العمود الأيمن أولًا");
    if (+Q.sel.i === +i) {
      Q.sel.el.classList.remove("picked"); Q.sel.el.classList.add("matched"); el.classList.add("matched");
      Q.sel = null; Q.left--;
      if (!Q.left) answer(!Q.matchErr, null);
    } else {
      Q.matchErr = true;
      el.classList.add("wrong", "shake");
      setTimeout(() => el.classList.remove("wrong", "shake"), 400);
    }
  }
  function next() {
    if (Q.useHearts && S.hearts <= 0) { Q = null; home({ noAnim: true }); return heartsModal("نفدت القلوب 💔"); }
    Q.i++;
    if (Q.i < Q.items.length) return renderQ();
    finish();
  }

  function finish() {
    touchDay();
    const firstTry = Q.total - Q.wrong.size, pct = Math.round(100 * firstTry / Q.total);
    let gained, head, sub, stars = 0, btns, emoji = "🎉";
    if (Q.mode === "lesson") {
      stars = Q.wrong.size === 0 ? 3 : Q.wrong.size <= 2 ? 2 : 1;
      gained = 10 + stars * 5;
      S.done[Q.key] = Math.max(S.done[Q.key] || 0, stars);
      const s = bySci(Q.sid), last = lessonsDone(s) === s.lessons.length;
      head = "أتممت الدرس!";
      sub = `${AR(firstTry)} من ${AR(Q.total)} صحيحة من أول محاولة. ${last ? "أنهيت دروس المحطة، وبقي اختبارها." : "امشِ إلى الدرس التالي."}`;
      btns = `<button class="btn btn-block" data-act="home">${WALKER} متابعة الرحلة</button>`;
    } else if (Q.mode === "test") {
      const pass = pct >= 70, s = bySci(Q.sid), si = SCIENCES.indexOf(s);
      gained = pass ? 40 : 10;
      if (pass) S.tests[Q.sid] = Math.max(S.tests[Q.sid] || 0, pct);
      const v = RIDE[VEH[si % VEH.length]], nextName = SCIENCES[si + 1] ? SCIENCES[si + 1].name : "خط الوصول";
      emoji = pass ? v.icon : "📘";
      head = pass ? `اجتزت اختبار محطة ${s.name}!` : "لم تبلغ درجة النجاح";
      sub = pass ? `نتيجتك ${AR(pct)}٪. انطلق ${v.label} ${nextName}!` : `نتيجتك ${AR(pct)}٪، والنجاح ٧٠٪. راجع الدروس ثم أعد المحاولة.`;
      btns = pass ? `<button class="btn btn-block" data-act="home">${v.icon} انطلق إلى ${nextName}</button>`
        : `<button class="btn btn-block" data-act="test" data-id="${Q.sid}">إعادة الاختبار</button>
           <button class="btn btn-ghost btn-block" data-act="home">العودة إلى الخريطة</button>`;
    } else {
      gained = 5 + firstTry * 2;
      head = Q.mode === "review" ? "انتهت المراجعة" : "انتهى التدريب";
      sub = Q.mode === "review" ? `بقي ${AR(S.mistakes.length)} سؤالًا في قائمة المراجعة` : `${AR(firstTry)} من ${AR(Q.total)} صحيحة`;
      btns = `<button class="btn btn-block" data-act="review">العودة</button>`;
    }
    addXP(gained); save(); header();
    document.body.classList.add("in-lesson"); window.scrollTo(0, 0);
    $view.innerHTML = `<div class="result">
      <div class="big">${emoji}</div>
      <h1>${head}</h1>
      ${stars ? `<div class="stars">${starStr(stars)}</div>` : ""}
      <p class="muted">${sub}</p>
      <div class="kpis">
        <div class="kpi"><b>+${AR(gained)}</b><small>نقطة</small></div>
        <div class="kpi"><b>${AR(pct)}٪</b><small>الدقة</small></div>
        <div class="kpi"><b>${AR(streakNow())}</b><small>أيام متتالية</small></div>
      </div>
      <div style="display:grid;gap:10px">${btns}</div></div>`;
    Q = null;
  }

  /* ---------- المراجعة والإحصاءات ---------- */
  function review() {
    setTab("review"); window.scrollTo(0, 0);
    const n = S.mistakes.length;
    $view.innerHTML = `
      <div class="panel" style="text-align:center">
        <h2>مراجعة الأخطاء</h2>
        <p class="muted">كل سؤال أخطأت فيه يُحفظ هنا، ويخرج من القائمة حين تجيبه صحيحًا. المراجعة بلا قلوب.</p>
        <div style="font-size:48px;font-weight:800">${AR(n)}</div>
        <p class="muted small">سؤالًا بانتظار المراجعة</p>
        <button class="btn btn-block" data-act="startReview" ${n ? "" : "disabled"}>ابدأ المراجعة</button>
      </div>
      <div class="panel"><h2>تدريب حر حسب العلم</h2>
        <p class="muted small">١٠ أسئلة من الدروس التي أنهيتها في المحطة، بلا قلوب.</p>
        <div class="skill-grid">${SCIENCES.map(s => {
          const on = lessonsDone(s) > 0;
          return `<button class="btn ${on ? "" : "btn-ghost"}" style="${on ? `background:${s.color};color:#fff` : ""}" data-act="practice" data-id="${s.id}" ${on ? "" : "disabled"}>${s.name}</button>`;
        }).join("")}</div>
      </div>`;
  }

  function stats() {
    setTab("stats"); window.scrollTo(0, 0);
    const c = Object.values(S.stats).reduce((a, x) => a + x.c, 0), w = Object.values(S.stats).reduce((a, x) => a + x.w, 0);
    const acc = c + w ? Math.round(100 * c / (c + w)) : 0;
    const passed = SCIENCES.filter(s => S.tests[s.id]).length;
    $view.innerHTML = `
      <div class="kpis">
        <div class="kpi"><b>${AR(streakNow())}</b><small>🔥 أيام</small></div>
        <div class="kpi"><b>${AR(S.xp)}</b><small>⭐ نقطة</small></div>
        <div class="kpi"><b>${AR(acc)}٪</b><small>🎯 الدقة</small></div>
        <div class="kpi"><b>${AR(passed)} من ${AR(SCIENCES.length)}</b><small>🏅 محطات</small></div>
        <div class="kpi"><b>${AR(syncHearts())}</b><small>❤️ قلوب</small></div>
        <div class="kpi"><b>${AR(Object.keys(S.done).length)}</b><small>📘 دروس</small></div>
      </div>
      <div class="panel"><h2>التقدّم في المحطات</h2>
        ${SCIENCES.map(s => {
          const d = lessonsDone(s), n = s.lessons.length, st = S.stats[s.id];
          const a = st && st.c + st.w ? Math.round(100 * st.c / (st.c + st.w)) + "٪ دقة" : "لم تبدأ";
          return `<div class="skill" style="--c:${s.color}"><div class="lbl"><span>${s.name} ${S.tests[s.id] ? "🏅" : ""}</span><span class="muted small">${AR(d)} من ${AR(n)} · ${a}</span></div>
            <div class="bar"><i style="width:${100 * d / n}%"></i></div></div>`;
        }).join("")}
      </div>
      <button class="btn btn-ghost btn-block" data-act="reset">مسح التقدّم والبدء من جديد</button>`;
  }

  /* ---------- الأحداث ---------- */
  const confirmQuit = () => !Q || confirm("هل تريد الخروج؟ لن يُحفظ تقدّم هذه الجولة.");
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act, id = b.dataset.id;
    if (Q && ["home", "review", "stats"].includes(a) && b.closest(".topbar,.tabs")) { if (!confirmQuit()) return; Q = null; }
    switch (a) {
      case "home": closeModal(); return home();
      case "review": closeModal(); return review();
      case "stats": return stats();
      case "stop": if (!animating) openStop(+b.dataset.i); return;
      case "start": return startLesson(id);
      case "test": return startTest(id);
      case "practice": return startPractice(id);
      case "startReview": return startReview();
      case "pick": return pick(+b.dataset.i, b);
      case "tf": return tf(b.dataset.v, b);
      case "mr": case "ml": return matchTap(a, b.dataset.i, b);
      case "next": return next();
      case "close": return closeModal();
      case "hearts": return heartsModal();
      case "quit": if (!confirmQuit()) return; Q = null; return home({ noAnim: true });
      case "theme": {
        const cur = S.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
        S.theme = cur === "dark" ? "light" : "dark"; applyTheme(); save(); return;
      }
      case "reset":
        if (!confirm("سيُمسح كل تقدّمك. هل أنت متأكد؟")) return;
        S = { ...fresh(), theme: S.theme };
        save(); toast("تم مسح التقدّم"); return stats();
    }
  });

  home();
})();
