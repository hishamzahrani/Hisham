(() => {
  "use strict";
  const KEY = "dad-app-v1";
  const $view = document.getElementById("view");
  const AR = n => Number(n).toLocaleString("ar-EG");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const today = () => new Date().toISOString().slice(0, 10);
  const bySci = id => SCIENCES.find(s => s.id === id);
  const qById = id => { const [s, l, q] = id.split("."); return bySci(s).lessons[+l].qs[+q]; };

  /* ---------- الحالة ---------- */
  let S = { xp: 0, streak: 0, lastDay: "", done: {}, tests: {}, mistakes: [], stats: {}, theme: "" };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const applyTheme = () => { if (S.theme) document.documentElement.dataset.theme = S.theme; else delete document.documentElement.dataset.theme; };
  applyTheme();

  function streakNow() {
    if (!S.lastDay) return 0;
    const d = (new Date(today()) - new Date(S.lastDay)) / 864e5;
    return d <= 1 ? S.streak : 0;
  }
  function touchDay() {
    const t = today();
    if (S.lastDay === t) return;
    const d = S.lastDay ? (new Date(t) - new Date(S.lastDay)) / 864e5 : 99;
    S.streak = d === 1 ? S.streak + 1 : 1;
    S.lastDay = t;
  }
  function header() {
    document.getElementById("s-streak").textContent = AR(streakNow());
    document.getElementById("s-xp").textContent = AR(S.xp);
  }
  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
  }
  const lessonsDone = sci => sci.lessons.filter((_, i) => S.done[sci.id + "." + i]).length;
  const totalLessons = () => SCIENCES.reduce((a, s) => a + s.lessons.length, 0);
  const allDone = () => SCIENCES.reduce((a, s) => a + lessonsDone(s), 0);
  const starStr = n => "★".repeat(n) + "☆".repeat(3 - n);

  function setTab(t) {
    document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
    document.body.classList.remove("in-lesson");
    window.scrollTo(0, 0);
    header();
  }

  /* ---------- الشاشات ---------- */
  function home() {
    setTab("home");
    const pct = Math.round(100 * allDone() / totalLessons());
    $view.innerHTML = `
      <div class="hero">
        <h1>علوم العربية</h1>
        <p>سبعة علوم في دروس قصيرة: اقرأ الشرح ثم تدرّب. أنجزت ${AR(allDone())} من ${AR(totalLessons())} درسًا.</p>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>
      <div class="grid">
        ${SCIENCES.map(s => {
          const d = lessonsDone(s), n = s.lessons.length;
          return `<button class="card sci" style="--c:${s.color}" data-act="sci" data-id="${s.id}">
            <div class="sci-icon">${s.icon}</div>
            <h3>${s.name}</h3>
            <p>${s.desc}</p>
            <div class="bar" style="margin-top:auto"><i style="width:${100 * d / n}%"></i></div>
            <span class="small muted">${AR(d)} من ${AR(n)} دروس${S.tests[s.id] ? " · 🏅" : ""}</span>
          </button>`;
        }).join("")}
      </div>`;
  }

  function science(id) {
    setTab("home");
    const s = bySci(id);
    const done = lessonsDone(s), all = done === s.lessons.length;
    $view.innerHTML = `
      <button class="back" data-act="home">→ العلوم</button>
      <div class="hero" style="background:${s.color}">
        <h1>${s.name}</h1><p>${s.desc}</p>
      </div>
      ${s.lessons.map((l, i) => {
        const k = s.id + "." + i, st = S.done[k] || 0;
        const locked = i > 0 && !S.done[s.id + "." + (i - 1)];
        return `<div class="card lesson-row ${st ? "done" : ""} ${locked ? "locked" : ""}" style="--c:${s.color}">
          <div class="num">${st ? "✓" : AR(i + 1)}</div>
          <div class="info"><b>${l.title}</b>
            <span class="small muted">${AR(l.qs.length)} تمارين</span>
            ${st ? `<div class="stars">${starStr(st)}</div>` : ""}</div>
          ${locked ? `<span title="يُفتح بعد إنهاء الدرس السابق">🔒</span>`
            : `<button class="btn ${st ? "btn-ghost" : ""}" data-act="notes" data-id="${k}">${st ? "إعادة" : "ابدأ"}</button>`}
        </div>`;
      }).join("")}
      <div class="card lesson-row ${all ? "" : "locked"}" style="--c:${s.color};margin-top:16px">
        <div class="num">🏅</div>
        <div class="info"><b>الاختبار الشامل</b>
          <span class="small muted">${all ? (S.tests[s.id] ? `أفضل نتيجة: ${AR(S.tests[s.id])}٪` : "١٠ أسئلة من كل الدروس، والنجاح ٧٠٪") : "يُفتح بعد إنهاء الدروس كلها"}</span></div>
        ${all ? `<button class="btn" data-act="test" data-id="${s.id}">اختبر</button>` : "🔒"}
      </div>`;
  }

  function notes(key) {
    const [sid, li] = key.split("."); const s = bySci(sid), l = s.lessons[+li];
    setTab("home"); document.body.classList.add("in-lesson");
    $view.innerHTML = `
      <button class="back" data-act="sci" data-id="${sid}">→ ${s.name}</button>
      <h1>${l.title}</h1>
      <p class="muted small">اقرأ الشرح جيدًا، ثم انتقل إلى التمارين.</p>
      ${l.notes.map(n => `<div class="note" style="--c:${s.color}">${n}</div>`).join("")}
      <button class="btn btn-block" style="margin-top:8px" data-act="start" data-id="${key}">ابدأ التمارين ←</button>`;
  }

  /* ---------- محرك التمارين ---------- */
  let Q = null; // { mode, key, sid, items:[{id,q}], i, wrong:Set, repeated:Set, correct, total, color }

  function startSession(mode, ids, extra = {}) {
    document.body.classList.add("in-lesson");
    Q = { mode, items: ids.map(id => ({ id, q: qById(id) })), i: 0, wrong: new Set(), repeated: new Set(), total: ids.length, ...extra };
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
  function startReview() {
    if (!S.mistakes.length) return;
    startSession("review", shuffle(S.mistakes).slice(0, 12), { color: "var(--primary)" });
  }

  const KIND = { m: "اختر الإجابة الصحيحة", t: "صواب أم خطأ؟", p: "طابق بين العمودين" };

  function renderQ() {
    const it = Q.items[Q.i], q = it.q;
    const prog = 100 * Q.i / Q.items.length;
    let body = "";
    if (q.t === "m") {
      const opts = shuffle(q.o.map((t, i) => ({ t, ok: i === 0 })));
      Q.cur = opts;
      body = `<div class="opts" id="opts">${opts.map((o, i) => `<button class="opt" data-act="pick" data-i="${i}">${esc(o.t)}</button>`).join("")}</div>`;
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
    const title = Q.mode === "test" ? "الاختبار الشامل" : Q.mode === "review" ? "مراجعة الأخطاء" : "";
    $view.innerHTML = `
      <div class="quiz-top">
        <button class="x-btn" data-act="quit" aria-label="خروج">✕</button>
        <div class="bar" style="--c:${Q.color}"><i style="width:${prog}%"></i></div>
        <span class="small muted">${AR(Q.i + 1)} من ${AR(Q.items.length)}</span>
      </div>
      ${title ? `<div class="q-kind">${title}</div>` : ""}
      <div class="q-kind">${KIND[q.t]}</div>
      <div class="q-text">${esc(q.q)}</div>
      ${q.ex ? `<div class="q-ex">${esc(q.ex)}</div>` : ""}
      ${body}`;
  }

  function answer(ok, correctText) {
    const it = Q.items[Q.i], q = it.q;
    const sid = it.id.split(".")[0];
    S.stats[sid] = S.stats[sid] || { c: 0, w: 0 };
    S.stats[sid][ok ? "c" : "w"]++;
    if (ok) {
      if (Q.mode === "review") S.mistakes = S.mistakes.filter(x => x !== it.id);
    } else {
      Q.wrong.add(it.id);
      if (!S.mistakes.includes(it.id)) S.mistakes.push(it.id);
      // في الدروس والمراجعة يعود السؤال الخاطئ في آخر الجولة مرة واحدة
      if (Q.mode !== "test" && !Q.repeated.has(it.id)) { Q.repeated.add(it.id); Q.items.push(it); }
    }
    save();
    document.getElementById("opts").classList.add("locked");
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
    const o = Q.cur[i];
    const all = document.querySelectorAll("#opts .opt");
    all.forEach((b, j) => { if (Q.cur[j].ok) b.classList.add("correct"); });
    if (!o.ok) el.classList.add("wrong");
    answer(o.ok, Q.items[Q.i].q.o[0]);
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
    if (!Q.sel) { toast("اختر من العمود الأيمن أولًا"); return; }
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
    Q.i++;
    if (Q.i < Q.items.length) return renderQ();
    finish();
  }

  function finish() {
    touchDay();
    const firstTry = Q.total - Q.wrong.size;
    const pct = Math.round(100 * firstTry / Q.total);
    let gained = 0, head = "", sub = "", stars = 0, btns = "";
    if (Q.mode === "lesson") {
      stars = Q.wrong.size === 0 ? 3 : Q.wrong.size <= 2 ? 2 : 1;
      gained = 10 + stars * 5;
      S.done[Q.key] = Math.max(S.done[Q.key] || 0, stars);
      head = "أتممت الدرس!"; sub = `${AR(firstTry)} من ${AR(Q.total)} صحيحة من أول محاولة`;
      const [sid, li] = Q.key.split("."), s = bySci(sid), nx = +li + 1;
      btns = nx < s.lessons.length
        ? `<button class="btn btn-block" data-act="notes" data-id="${sid}.${nx}">الدرس التالي ←</button>`
        : `<button class="btn btn-block" data-act="test" data-id="${sid}">الاختبار الشامل 🏅</button>`;
      btns += `<button class="btn btn-ghost btn-block" data-act="sci" data-id="${sid}">العودة إلى ${s.name}</button>`;
    } else if (Q.mode === "test") {
      const pass = pct >= 70;
      gained = pass ? 40 : 10;
      if (pass) S.tests[Q.sid] = Math.max(S.tests[Q.sid] || 0, pct);
      head = pass ? "نجحت في الاختبار 🏅" : "لم تبلغ درجة النجاح";
      sub = `نتيجتك ${AR(pct)}٪ — ${pass ? "أحسنت!" : "راجع الدروس ثم أعد المحاولة."}`;
      btns = `<button class="btn btn-block" data-act="test" data-id="${Q.sid}">إعادة الاختبار</button>
        <button class="btn btn-ghost btn-block" data-act="sci" data-id="${Q.sid}">العودة</button>`;
    } else {
      gained = 5 + firstTry * 2;
      head = "انتهت المراجعة"; sub = `بقي ${AR(S.mistakes.length)} سؤالًا في قائمة المراجعة`;
      btns = `<button class="btn btn-block" data-act="review">العودة إلى المراجعة</button>`;
    }
    S.xp += gained; save(); header();
    document.body.classList.add("in-lesson");
    $view.innerHTML = `<div class="result">
      <div class="big">${Q.mode === "test" && pct < 70 ? "📘" : "🎉"}</div>
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
    setTab("review");
    const n = S.mistakes.length;
    const per = SCIENCES.map(s => ({ s, n: S.mistakes.filter(id => id.startsWith(s.id + ".")).length })).filter(x => x.n);
    $view.innerHTML = n ? `
      <div class="panel" style="text-align:center">
        <h2>مراجعة الأخطاء</h2>
        <p class="muted">كل سؤال أخطأت فيه يُحفظ هنا، ويخرج من القائمة حين تجيبه صحيحًا.</p>
        <div style="font-size:48px;font-weight:800">${AR(n)}</div>
        <p class="muted small">سؤالًا بانتظار المراجعة</p>
        <button class="btn btn-block" data-act="startReview">ابدأ المراجعة</button>
      </div>
      <div class="panel">${per.map(x => `<div class="skill"><div class="lbl"><span>${x.s.name}</span><b>${AR(x.n)}</b></div></div>`).join("")}</div>`
      : `<div class="empty"><div class="big">✨</div><h2>لا أخطاء للمراجعة</h2><p class="muted">الأسئلة التي تخطئ فيها في الدروس ستظهر هنا.</p></div>`;
  }

  function stats() {
    setTab("stats");
    const c = Object.values(S.stats).reduce((a, x) => a + x.c, 0), w = Object.values(S.stats).reduce((a, x) => a + x.w, 0);
    const acc = c + w ? Math.round(100 * c / (c + w)) : 0;
    $view.innerHTML = `
      <div class="kpis">
        <div class="kpi"><b>${AR(streakNow())}</b><small>🔥 أيام</small></div>
        <div class="kpi"><b>${AR(S.xp)}</b><small>⭐ نقطة</small></div>
        <div class="kpi"><b>${AR(acc)}٪</b><small>🎯 الدقة</small></div>
      </div>
      <div class="panel"><h2>التقدّم في العلوم</h2>
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
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act, id = b.dataset.id;
    if (Q && ["home", "review", "stats", "sci"].includes(a) && b.closest(".topbar,.tabs")) {
      if (!confirm("هل تريد الخروج؟ لن يُحفظ تقدّم هذه الجولة.")) return;
      Q = null;
    }
    switch (a) {
      case "home": return home();
      case "review": return review();
      case "stats": return stats();
      case "sci": return science(id);
      case "notes": return notes(id);
      case "start": return startLesson(id);
      case "test": return startTest(id);
      case "startReview": return startReview();
      case "pick": return pick(+b.dataset.i, b);
      case "tf": return tf(b.dataset.v, b);
      case "mr": case "ml": return matchTap(a, b.dataset.i, b);
      case "next": return next();
      case "quit": {
        if (!confirm("هل تريد الخروج؟ لن يُحفظ تقدّم هذه الجولة.")) return;
        const sid = Q.sid; Q = null; return sid ? science(sid) : review();
      }
      case "theme": {
        const dark = matchMedia("(prefers-color-scheme: dark)").matches;
        const cur = S.theme || (dark ? "dark" : "light");
        S.theme = cur === "dark" ? "light" : "dark"; applyTheme(); save(); return;
      }
      case "reset":
        if (!confirm("سيُمسح كل تقدّمك. هل أنت متأكد؟")) return;
        S = { xp: 0, streak: 0, lastDay: "", done: {}, tests: {}, mistakes: [], stats: {}, theme: S.theme };
        save(); toast("تم مسح التقدّم"); return stats();
    }
  });

  home();
})();
