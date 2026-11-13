(() => {
  "use strict";

  // ------------------------------------------------------------------
  // الإعدادات
  // ------------------------------------------------------------------
  const STORE_KEY = "quran-quest-v1";
  const DAILY_GOAL = 30;
  const MIN_LESSONS = 6;    // أقل عدد من الدروس في الجزء
  const LESSON_SIZE = 10;   // الحدّ الأعلى لأسئلة الدرس الواحد تقريبًا
  const TEST_SIZE = 8;      // أسئلة اختبار الجزء
  const UNIT_SIZE = 15;     // أسئلة الجولة الختامية للوحدة
  const CAT_ORDER = Object.keys(CATEGORIES);

  // المراحل الفرعية لكل جزء: دروس متنوعة (عددها بحسب أسئلة الجزء، ٦ على الأقل) + اختبار الجزء
  const AR_DIG = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
  const lessonsOf = (j) => {
    const st = STAGES.find((x) => x.juz === +j);
    return Math.max(MIN_LESSONS, Math.ceil((st ? st.questions.length : 0) / LESSON_SIZE));
  };
  const subCount = (j) => lessonsOf(j) + 1;
  const subsCache = {};
  const subsOf = (j) => subsCache[j] || (subsCache[j] = Array.from({ length: lessonsOf(j) }, (_, i) => ({ k: i + 1, short: `الدرس ${AR_DIG(i + 1)}` }))
    .concat([{ k: lessonsOf(j) + 1, short: "اختبار الجزء", test: true }]));

  // الوحدات: كل وحدة خمسة أجزاء، تُختم بجولة ختامية
  const UNIT_NAMES = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة"];
  const UNIT_COLORS = ["#1f7a5c", "#1e3a5f", "#23757a", "#7d5a2c", "#5b4a8a", "#2b5f93"];   // زمردي، كحلي، فيروزي، برونزي، بنفسجي داكن، أزرق
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
    lastPos: {},           // موضع الجواب الصحيح في آخر عرض لكل سؤال
    sound: true,
    premium: null,         // { plan, token, until } — يُعتمد عليه فقط بعد تحقق الخادم
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
        for (let k = 1; k <= subCount(j); k++) subs[k] = p.stars || 1;
        s.progress[j] = { subs };
      }
    });
    // ترحيل: كان لكل جزء ستة دروس والاختبار في المرحلة ٧؛ صار عدد الدروس متغيرًا
    if (!s.subsV) {
      Object.keys(s.progress).forEach((j) => {
        const subs = s.progress[j] && s.progress[j].subs;
        const L = lessonsOf(j);
        if (subs && L > MIN_LESSONS && subs[7]) {
          const t = subs[7];
          for (let k = 7; k <= L + 1; k++) subs[k] = Math.max(subs[k] || 0, t);
        }
      });
      s.subsV = 2;
    }
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
  // نص الآية بين القوسين المزخرفين: كل قوس ملتصق بالكلمة المجاورة داخل عزلٍ يمين-يسار
  // حتى لا ينفصل عنها عند التفاف السطر ولا يُعاد ترتيبه في محرّك Safari
  function ayahHtml(a) {
    const w = String(a).trim().replace(/\s+(\u06DD)/g, "\u00A0$1").split(/[ \t\n]+/);
    const O = '<span class="orn">\u200F\uFD3E\u200F</span>', C = '<span class="orn">\u200F\uFD3F\u200F</span>';
    const glue = (h) => `<span class="ayah-edge" dir="rtl">${h}</span>`;
    if (w.length === 1) return glue(O + esc(w[0]) + C);
    const first = w.shift(), last = w.pop();
    return [glue(O + esc(first)), ...w.map(esc), glue(esc(last) + C)].join(" ");
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
    .replace(/[\uFD3E\uFD3F]/g, '<span class="orn">$&</span>'); // أقواس الآيات بخط المصحف
  const toAr = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  /** نجوم التقييم (نجمة ثمانية)؛ total لعرض الفارغة أيضًا */
  const starsHtml = (n, total = n) =>
    Array.from({ length: total }, (_, i) => `<span class="${i < n ? "on" : "off"}">${ic("star", "", true)}</span>`).join("");

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
    const n = lessonsOf(j);
    const buckets = Array.from({ length: n }, () => []);
    ordered.forEach((it, i) => buckets[i % n].push(it));
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
  const juzDone = (j) => subDone(j, subCount(j));
  const juzSubsDone = (j) => subsOf(j).filter((s) => subDone(j, s.k)).length;
  const unitStars = (u) => state.units[u] || 0;
  const unitDone = (u) => unitStars(u) > 0;
  const isUnitUnlocked = (u) => juzDone(UNITS[u].to);

  // ---------- الاشتراك ----------
  const M = typeof MONETIZATION !== "undefined" ? MONETIZATION : { enabled: false };
  const isPremium = () => !!(M.enabled && state.premium && state.premium.until > Date.now());
  const NP = window.NativePurchases && window.NativePurchases.isNative ? window.NativePurchases : null;
  let storePackages = {};   // planId -> RevenueCat package (في التطبيق فقط)

  /** تحويل حالة RevenueCat إلى اشتراك محلي */
  function applyCustomerInfo(ci) {
    const ent = ci && ci.entitlements && ci.entitlements.active && ci.entitlements.active[M.store.entitlement];
    if (ent) {
      state.premium = { plan: ent.productIdentifier, until: ent.expirationDateMillis || Date.now() + 3650 * 864e5, source: "store" };
    } else if (state.premium && state.premium.source === "store") {
      state.premium = null;
    }
    save();
  }
  async function initStore() {
    if (!NP || !M.enabled) return;
    const key = M.store.revenuecatApiKeys[NP.platform];
    if (!key) return;
    try {
      await NP.configure(key);
      applyCustomerInfo(await NP.customerInfo());
      NP.onChange((ci) => { applyCustomerInfo(ci); renderHome(); if ($("screen-plus").classList.contains("active")) renderPlus(); });
      const pkgs = await NP.packages();
      const ids = M.store.products;
      Object.keys(ids).forEach((plan) => {
        const pk = pkgs.find((x) => x.product && x.product.identifier && x.product.identifier.startsWith(ids[plan]));
        if (pk) storePackages[plan] = pk;
      });
      renderHome();
    } catch (_) { /* المتجر غير متاح الآن؛ يبقى التطبيق يعمل بالوحدة المجانية */ }
  }
  // ---------- القلوب: مشتركة بين الدروس، وتمتلئ بعد مدة الانتظار ----------
  const HEARTS_MAX = (M.hearts && M.hearts.max) || 5;
  const REFILL_MS = ((M.hearts && M.hearts.refillHours) || 16) * 3600e3;
  function syncHearts() {
    const h = state.hearts || (state.hearts = { count: HEARTS_MAX, refillAt: null });
    if (h.refillAt && Date.now() >= h.refillAt) { h.count = HEARTS_MAX; h.refillAt = null; save(); }
    return h;
  }
  const heartsLeft = () => (isPremium() ? Infinity : syncHearts().count);
  function loseHeart() {
    if (isPremium()) return;
    const h = syncHearts();
    h.count = Math.max(0, h.count - 1);
    if (!h.refillAt) h.refillAt = Date.now() + REFILL_MS;   // يبدأ العدّ من أول قلب يُفقد
    save();
  }
  function fmtLeft(ms) {
    const t = Math.max(0, Math.ceil(ms / 1000));
    const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
    return toAr(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`);
  }

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
        for (let k = 1; k <= subCount(j); k++) {
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
  const MAX_STARS = (STAGES.reduce((a, st) => a + subCount(st.juz), 0) + UNITS.length) * 3;

  function renderHome() {
    $("stat-streak").textContent = toAr(effectiveStreak());
    $("stat-xp").textContent = toAr(state.xp);
    renderHeartsBadge();
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
      btn.innerHTML = content;
      if (isCur) { btn.classList.add("current"); wrap.appendChild(el("div", "start-bubble", bubble)); }
      btn.addEventListener("click", onClick);
      wrap.appendChild(btn);
      wrap.appendChild(el("div", "node-label", `<div class="node-stars">${starsHtml(stars)}</div>${label}`));
      path.appendChild(wrap);
    };

    UNITS.forEach((U) => {
      path.appendChild(el("div", "unit-title", `<span>${U.name}</span><small>الأجزاء ${toAr(U.from)} – ${toAr(U.to)}</small>`));

      for (let j = U.from; j >= U.to; j--) {
        const s = stageByJuz(j);
        const locked = !isSubUnlocked(j, 1);
        const b = el("div", "unit-banner" + (locked ? " locked" : ""));
        if (!locked) b.style.backgroundColor = U.color;
        b.innerHTML = `<div class="ub-text"><small>الجزء ${toAr(j)}</small><b>${esc(s.title)}</b><small>${esc(s.surahs)}</small></div>
          <div class="ub-progress">${juzDone(j) ? ic("trophy") : locked ? ic("lock") : `${toAr(juzSubsDone(j))}/${toAr(subCount(j))}`}</div>`;
        path.appendChild(b);

        subsOf(j).forEach((sub) => {
          const k = sub.k;
          const unlocked = isSubUnlocked(j, k);
          const stars = subStars(j, k);
          addNode({
            cls: (sub.test ? "test" : "") + (!unlocked ? " locked" : stars ? " done" : ""),
            content: sub.test ? ic("trophy") : !unlocked ? ic("lock") : toAr(k),
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
        content: uUnlocked ? ic("rub") : ic("lock"),
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
      const b = el("button", "skill-btn", `<span style="color:${c.color}">${ic(c.icon)}</span>${c.name}`);
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
    $("plan-status").textContent = !M.enabled ? "" : isPremium() && state.premium ? "مشترك في «بلس» — قلوب غير محدودة" : "التطبيق مجاني بالكامل، والاشتراك اختياري لمن يرغب";
    $("k-acc").textContent = t ? `${toAr(Math.round((c / t) * 100))}٪` : "—";
    const bars = $("skill-bars");
    bars.innerHTML = "";
    Object.entries(CATEGORIES).forEach(([key, cat]) => {
      const s = state.stats[key] || { c: 0, t: 0 };
      const pct = s.t ? Math.round((s.c / s.t) * 100) : 0;
      const row = el("div", "skill-row");
      row.innerHTML = `<div class="skill-row-head"><span class="row-name"><i style="color:${cat.color}">${ic(cat.icon)}</i>${cat.name}</span><span class="muted">${s.t ? toAr(pct) + "٪ — " + toAr(s.c) + "/" + toAr(s.t) : "لم تبدأ بعد"}</span></div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%;background:${cat.color}"></div></div>`;
      bars.appendChild(row);
    });
  }

  // ------------------------------------------------------------------
  // نافذة المرحلة
  // ------------------------------------------------------------------
  let modalSel = null;

  function itemsForSub(j, k) {
    if (k <= lessonsOf(j)) return lessonBuckets(j)[k - 1];
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
    return cats.map((c) => `<span style="border-color:${CATEGORIES[c].color}"><i style="color:${CATEGORIES[c].color}">${ic(CATEGORIES[c].icon)}</i>${CATEGORIES[c].name}</span>`).join("");
  };

  function showModal({ badge, badgeBg, title, sub, chips, stars, startLabel }) {
    const b = $("m-badge");
    b.innerHTML = badge;
    b.style.background = badgeBg;
    $("m-title").textContent = title;
    $("m-surahs").textContent = sub;
    $("m-cats").innerHTML = chips;
    $("m-stars").innerHTML = stars ? starsHtml(stars, 3) : "";
    $("m-start").textContent = startLabel;
    $("modal-stage").classList.add("open");
  }

  function openStage(j, k) {
    if (!isSubUnlocked(j, k)) {
      sfx.bad();
      const prevUnit = k === 1 && isUnitEnd(j + 1) && juzDone(j + 1);
      toast(k > 1 ? `أكمل ${subsOf(j)[k - 2].short} أولًا`
        : prevUnit ? "اجتز الجولة الختامية للوحدة السابقة أولًا"
        : `أكمل اختبار الجزء ${toAr(j + 1)} أولًا`);
      return;
    }
    sfx.tap();
    modalSel = { j, k };
    const s = stageByJuz(j);
    const sub = subsOf(j)[k - 1];
    const items = k <= lessonsOf(j) ? lessonBuckets(j)[k - 1] : juzItems(j);
    const count = sub.test ? Math.min(TEST_SIZE, items.length) : items.length;
    const stars = subStars(j, k);
    showModal({
      badge: sub.test ? ic("trophy") : toAr(k),
      badgeBg: sub.test ? "var(--navy)" : "var(--primary)",
      title: `${sub.short} — ${s.title}`,
      sub: `الجزء ${toAr(j)} — المرحلة ${toAr(k)} من ${toAr(subCount(j))} — ${toAr(count)} أسئلة`,
      chips: sub.test ? `<span style="border-color:var(--navy)">أسئلة منوّعة من محاور الجزء كلها</span>` : catChips(items),
      stars,
      startLabel: stars ? "أعِد المرحلة" : sub.test ? "ابدأ الاختبار" : "ابدأ الدرس",
    });
  }

  function openUnit(u) {
    if (!isUnitUnlocked(u)) {
      sfx.bad();
      toast(`أكمل اختبار الجزء ${toAr(UNITS[u].to)} أولًا`);
      return;
    }
    sfx.tap();
    modalSel = { u };
    const U = UNITS[u];
    const stars = unitStars(u);
    showModal({
      badge: ic("rub"),
      badgeBg: "var(--gold)",
      title: `الجولة الختامية — ${U.name}`,
      sub: `أسئلة منوّعة من الأجزاء ${toAr(U.from)} – ${toAr(U.to)} — ${toAr(UNIT_SIZE)} سؤالًا`,
      chips: `<span style="border-color:var(--gold)">تُفتح الوحدة التالية بعد اجتيازها</span>`,
      stars,
      startLabel: stars ? "أعِد الجولة" : "ابدأ الجولة الختامية",
    });
  }
  function closeModal() { $("modal-stage").classList.remove("open"); }

  // ---------- نافذة القلوب ----------
  let heartsTimer = null;
  function renderHeartsBadge() {
    const n = heartsLeft();
    $("stat-hearts").textContent = n === Infinity ? "∞" : toAr(n);
  }
  function openHearts() {
    const tick = () => {
      const h = syncHearts();
      const prem = isPremium();
      $("h-count").textContent = prem ? "∞" : toAr(h.count);
      $("h-icons").innerHTML = Array.from({ length: HEARTS_MAX }, (_, i) =>
        `<span class="${prem || i < h.count ? "on" : "off"}">${ic("heart", "", true)}</span>`).join("");
      $("h-title").textContent = prem ? "قلوب غير محدودة" : h.count === 0 ? "نفدت قلوبك" : h.count < HEARTS_MAX ? "قلوبك" : "قلوبك ممتلئة";
      $("h-timer").textContent = !prem && h.refillAt ? `تمتلئ كلها بعد ${fmtLeft(h.refillAt - Date.now())}` : "";
      $("h-sub").textContent = prem ? "شكرًا لاشتراكك في «بلس»" :
        h.count === 0 ? "انتظر حتى تمتلئ قلوبك، وتستطيع خلال ذلك مراجعة أخطائك والتدرّب على المحاور دون أن تخسر قلوبًا." :
        `كل خطأ في الدروس يُنقص قلبًا، وتمتلئ القلوب بعد ${toAr(REFILL_MS / 3600e3)} ساعة من أول قلب تخسره.`;
      $("h-plus").hidden = prem || !M.enabled;
      renderHeartsBadge();
    };
    tick();
    clearInterval(heartsTimer);
    heartsTimer = setInterval(tick, 1000);
    $("modal-hearts").classList.add("open");
  }
  function closeHearts() { clearInterval(heartsTimer); $("modal-hearts").classList.remove("open"); renderHome(); }

  // ---------- شاشة الاشتراك ----------
  let selectedPlan = null;
  const money = (n) => toAr(n.toFixed(2)).replace(".", "٫");
  function renderPlus() {
    if (!M.enabled) return;
    const box = $("plus-plans");
    box.innerHTML = "";
    if (!selectedPlan) selectedPlan = (M.plans.find((p) => p.best) || M.plans[0]).id;
    const plans = M.plans.filter((p) => !(NP && p.webOnly));
    box.classList.toggle("two", plans.length === 2);
    plans.forEach((p) => {
      const pk = storePackages[p.id];
      const priceHtml = pk ? esc(pk.product.priceString) : `${money(p.price)} <small>${esc(M.currency)}</small>`;
      const b = el("button", "plan" + (p.id === selectedPlan ? " sel" : "") + (p.best ? " best" : ""),
        `${p.best ? '<span class="plan-flag">الأوفر</span>' : ""}<b>${esc(p.name)}</b>
         <span class="plan-price">${priceHtml}</span>
         <small class="muted">${esc(p.period)}</small><small class="plan-note">${esc(p.note || "")}</small>`);
      b.addEventListener("click", () => { selectedPlan = p.id; sfx.tap(); renderPlus(); });
      box.appendChild(b);
    });
    const active = isPremium() && state.premium;
    $("plus-status").textContent = active
      ? `اشتراكك فعّال حتى ${new Date(state.premium.until).toLocaleDateString("ar")}`
      : "";
    $("plus-cta").textContent = active ? "اشتراكك فعّال" : "اشترك الآن";
    $("plus-cta").disabled = !!active;
    $("plus-code-box").hidden = !!NP;
    $("plus-restore").hidden = !NP;
    $("plus-legal").innerHTML = (NP
      ? "يتجدد الاشتراك تلقائيًا ويُخصم من حسابك في المتجر ما لم تُلغِه قبل ٢٤ ساعة على الأقل من نهاية الفترة، ويمكنك إدارته أو إلغاؤه من إعدادات حسابك في المتجر. "
      : "يمكنك إلغاء الاشتراك في أي وقت. ") +
      `<a href="${esc(M.privacyUrl)}" target="_blank" rel="noopener">سياسة الخصوصية</a> · <a href="${esc(M.termsUrl)}" target="_blank" rel="noopener">شروط الاستخدام</a>`;
    const sc = $("plus-scholar");
    sc.hidden = !M.scholarshipContact;
    if (M.scholarshipContact) sc.querySelector("b").textContent = M.scholarshipContact;
  }
  function openPlus() {
    sfx.tap();
    renderPlus();
    show("screen-plus");
  }
  async function subscribe() {
    if (NP) {
      const pk = storePackages[selectedPlan];
      if (!pk) { toast("الاشتراك غير متاح حاليًا، حاول لاحقًا"); return; }
      const btn = $("plus-cta"); btn.disabled = true;
      const r = await NP.purchase(pk);
      btn.disabled = false;
      if (r.customerInfo) {
        applyCustomerInfo(r.customerInfo);
        if (isPremium()) { sfx.win(); toast("تم الاشتراك، بارك الله لك"); }
      } else if (!r.cancelled) toast("تعذّر إتمام الشراء: " + r.error);
      renderPlus();
      return;
    }
    const url = M.checkoutLinks && M.checkoutLinks[selectedPlan];
    if (!url) { toast("الدفع الإلكتروني يُفعَّل قريبًا إن شاء الله"); return; }
    window.open(url, "_blank", "noopener");
  }
  async function restore() {
    if (!NP) return;
    try {
      applyCustomerInfo(await NP.restore());
      toast(isPremium() ? "تمت استعادة اشتراكك" : "لم نجد اشتراكًا سابقًا لهذا الحساب");
      renderPlus(); renderHome();
    } catch (_) { toast("تعذّرت الاستعادة، حاول لاحقًا"); }
  }
  async function activate() {
    const code = $("plus-code").value.trim();
    if (!code) { toast("أدخل رمز التفعيل الذي وصلك بعد الدفع"); return; }
    if (!M.licenseApi) { toast("التفعيل غير متاح بعد؛ سيُفعَّل مع بوابة الدفع"); return; }
    try {
      const r = await fetch(M.licenseApi, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: code }) });
      const d = await r.json();
      if (!d.valid) { toast("الرمز غير صحيح أو منتهي الصلاحية"); return; }
      state.premium = { plan: d.plan, token: code, until: d.until };
      save();
      sfx.win();
      toast("تم تفعيل الاشتراك، بارك الله لك");
      renderPlus();
    } catch (_) { toast("تعذّر الاتصال بالخادم، حاول لاحقًا"); }
  }

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

  // الدروس والاختبارات والجولات الختامية تستهلك القلوب؛ أما المراجعة والتدريب فمجانيان دائمًا
  const usesHearts = (mode) => mode === "stage" || mode === "unit";

  function startLesson(mode, items, meta = {}) {
    if (!items.length) { toast("لا توجد أسئلة متاحة بعد"); return; }
    if (usesHearts(mode) && heartsLeft() <= 0) { openHearts(); return; }
    L = {
      mode, meta,
      queue: shuffle(items),
      total: items.length,
      done: 0,
      hearts: usesHearts(mode) ? heartsLeft() : Infinity,
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
    $("hearts").textContent = L.hearts === Infinity ? "∞" : toAr(L.hearts);
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
    chip.innerHTML = `${ic(cat.icon)}<span>${cat.name}${L.mode !== "stage" ? " — الجزء " + toAr(juz) : ""}</span>`;
    $("q-text").innerHTML = esc(q.t === "tf" ? `صح أم خطأ؟ ${q.q}` : q.q);
    $("q-ayah").innerHTML = q.a ? `<div class="ayah-text" dir="rtl">${ayahHtml(q.a)}</div>${q.r ? `<div class="ayah-ref">[${esc(q.r)}]</div>` : ""}` : "";

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
  // آخر ترتيب عُرض به كل سؤال، حتى يتغيّر موضع الخيارات عند تكراره
  const lastLayout = {};

  /** خلط يضمن أن يختلف الترتيب عن المرة السابقة، وأن ينتقل الجواب الصحيح إلى موضع آخر */
  function arrangeDifferent(key, items, isCorrect) {
    const prev = lastLayout[key] || (state.lastPos && state.lastPos[key] != null ? { pos: state.lastPos[key] } : null);
    let out = shuffle(items);
    if (prev && items.length > 1) {
      for (let t = 0; t < 30; t++) {
        const pos = isCorrect ? out.findIndex(isCorrect) : -1;
        const sameOrder = prev.order && out.every((o, i) => o.text === prev.order[i]);
        const samePos = isCorrect && pos === prev.pos;
        if (!sameOrder && !samePos) break;
        out = shuffle(items);
      }
    }
    const pos = isCorrect ? out.findIndex(isCorrect) : -1;
    lastLayout[key] = { order: out.map((o) => o.text), pos };
    if (isCorrect) { state.lastPos = state.lastPos || {}; state.lastPos[key] = pos; }
    return out;
  }

  function buildOptions(q, id) {
    const opts = q.t === "tf"
      ? [{ text: "صحيح", correct: q.v === true }, { text: "خطأ", correct: q.v === false }]
      : q.o.map((text, i) => ({ text, correct: i === 0 }));
    return arrangeDifferent(id, opts, (o) => o.correct);
  }

  function renderMCQ(q, body) {
    const opts = buildOptions(q, L.cur.id);
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
    const words = arrangeDifferent(L.cur.id + ":w", q.p.map((p, i) => ({ text: p[0], i })));
    const means = arrangeDifferent(L.cur.id + ":m", q.p.map((p, i) => ({ text: p[1], i })));
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
      if (usesHearts(L.mode)) { loseHeart(); L.hearts = heartsLeft(); }
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
    $("fb-icon").innerHTML = ic(ok ? "check" : "close");
    $("fb-title").textContent = ok ? pick(["أحسنت!", "ممتاز!", "بارك الله فيك!", "إجابة صحيحة!"]) : "الإجابة الصحيحة:";
    $("fb-answer").textContent = !ok && correctText ? correctText : "";
    $("fb-explain").innerHTML = esc(q.e || "");
    const src = sourceOf(q);
    $("fb-source").innerHTML = `${ic("sources")} <b>${esc(src.label)}:</b> ${esc(src.text)}` +
      (q.verified ? ` <span class="verified">${ic("seal")}موثّق من المكتبة الشاملة</span>` : "");
    const btn = $("btn-check");
    btn.style.display = "";
    btn.disabled = false;
    btn.textContent = ok ? "متابعة" : "فهمت، متابعة";
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
      xp = L.total * 2 + (L.mode === "stage" ? stars * 2 + (k === subCount(j) ? 10 : 0) : 0) + (L.mode === "unit" ? 30 : 0);
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

    const isTest = L.mode === "stage" && k === subCount(j);
    const isUnit = L.mode === "unit";
    $("r-emoji").className = "result-emoji " + (!passed ? "fail" : isUnit ? "unit" : "win");
    $("r-emoji").innerHTML = ic(!passed ? "heartBroken" : isUnit ? "rub" : isTest ? "trophy" : "star", "", passed && !isUnit && !isTest);
    $("r-title").textContent = !passed ? "نفدت القلوب" : isUnit ? "أتممت الوحدة!" : isTest ? "أتممت الجزء!" : stars === 3 ? "إتقان تام!" : "أحسنت!";
    let sub = "";
    if (!passed) {
      const h = syncHearts();
      sub = h.refillAt ? `لا بأس، المراجعة طريق الإتقان. تمتلئ قلوبك بعد ${fmtLeft(h.refillAt - Date.now())}، وتستطيع حتى ذلك الحين مراجعة أخطائك دون قلوب.` : "لا بأس، المراجعة طريق الإتقان. حاول مرة أخرى!";
    }
    else if (isUnit) {
      const U = UNITS[u];
      sub = u === UNITS.length - 1 ? "ختمتَ رحلة الثلاثين جزءًا كاملة"
        : `اجتزت الجولة الختامية لـ${U.name}` + (firstClear ? ` وفُتح لك الجزء ${toAr(U.to - 1)}` : "");
    } else if (L.mode === "stage") {
      if (isTest) {
        sub = isUnitEnd(j) ? `أتممت الجزء ${toAr(j)}، وبقيت الجولة الختامية للوحدة`
          : firstClear ? `أتممت الجزء ${toAr(j)} بمراحله كلها، وفُتح لك الجزء ${toAr(j - 1)}` : `أتممت اختبار الجزء ${toAr(j)}`;
      } else {
        sub = `أتممت ${subsOf(j)[k - 1].short} من الجزء ${toAr(j)}` + (firstClear ? ` — فُتحت المرحلة ${toAr(k + 1)}` : "");
      }
    } else sub = L.mode === "review" ? "أتممت جلسة المراجعة" : "أتممت جلسة التدريب";
    $("r-sub").textContent = sub;
    $("r-stars").innerHTML = passed && (L.mode === "stage" || isUnit) ? starsHtml(stars, 3) : "";
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
    $("btn-plus").addEventListener("click", openPlus);
    $("plus-close").addEventListener("click", () => show("screen-home"));
    $("plus-cta").addEventListener("click", subscribe);
    $("plus-activate").addEventListener("click", activate);
    $("plus-restore").addEventListener("click", restore);
    $("stat-hearts-btn").addEventListener("click", openHearts);
    $("h-close").addEventListener("click", closeHearts);
    $("h-practice").addEventListener("click", () => { closeHearts(); state.mistakes.length ? startReview() : (document.querySelector('[data-tab="tab-review"]').click()); });
    $("h-plus").addEventListener("click", () => { closeHearts(); openPlus(); });
    $("modal-hearts").addEventListener("click", (e) => { if (e.target.id === "modal-hearts") closeHearts(); });
    // تحديث عداد القلوب في الشريط العلوي إذا امتلأت أثناء فتح التطبيق
    setInterval(() => { if ($("screen-home").classList.contains("active")) renderHeartsBadge(); }, 30000);
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
  initStore();

  if (!NP && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
