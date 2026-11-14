// رجال الحديث — كل نص يُعرض هنا منقول من كتابه بحروفه؛ التطبيق يرتّب ويربط فقط.
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const view = $("#view");
  const ORD = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة",
    "العاشرة", "الحادية عشرة", "الثانية عشرة"];
  const RANKS = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة"];
  // ألفاظ للتصفية: مطابقة حرفية للفظ في سطر «التقريب»، لا حكمٌ مستنتج
  const LAFZ = ["صحابي", "ثقة", "ثبت", "حافظ", "صدوق", "لا بأس به", "مقبول", "مستور", "مجهول", "ضعيف", "متروك", "كذاب"];
  const RUMUZ = ["ع", "خ", "م", "د", "ت", "س", "ق", "٤", "بخ", "خت", "مد", "تم", "سي", "فق", "تمييز"];
  const PAGE = 100;

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = (s) => String(s || "").replace(/[ؐ-ًؚ-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/(^|\s)ابن(?=\s)/g, "$1بن");
  const arNum = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);

  // ------------------------------------------------------------ البيانات
  const cache = {};
  const load = (p) => (cache[p] ||= fetch("data/" + p).then((r) => {
    if (!r.ok) throw new Error(p);
    return r.json();
  }));
  let T = null, BYN = null, BOOKS = null, BOOKMAP = null;
  async function init() {
    [T, BOOKS] = await Promise.all([load("taqrib.json"), load("books.json")]);
    BYN = new Map(T.rows.map((r) => [r.n, r]));
    BOOKMAP = Object.fromEntries(BOOKS.map((b) => [b.key, b]));
    T.rows.forEach((r) => (r._n = norm(r.t)));
  }
  async function entry(key, i) {
    const b = BOOKMAP[key];
    const rows = await load(`books/${key}/${Math.floor(i / b.chunk)}.json`);
    return rows[i % b.chunk];
  }

  // ------------------------------------------------------------ أدوات العرض
  const quote = (text, src) => `<div class="q">${esc(text)}</div>${src ? `<span class="src">${esc(arNum(src))}</span>` : ""}`;
  const taqRow = (r, hl) => `<li><a class="row" href="#/r/${r.n}">${hl ? highlight(r.t, hl) : esc(r.t)}</a>
    ${r.mud ? `<span class="tag warn">مدلِّس — المرتبة ${RANKS[r.mud - 1]}</span>` : ""}</li>`;
  function highlight(text, q) {
    const nq = norm(q).trim();
    if (!nq) return esc(text);
    // نطابق على النص المطبَّع ونُبرز المقابل في الأصل
    const map = [];
    let n = "";
    for (let i = 0; i < text.length; i++) {
      const c = norm(text[i]);
      for (const ch of c) { n += ch; map.push(i); }
    }
    const at = n.indexOf(nq);
    if (at < 0) return esc(text);
    const s = map[at], e = (map[at + nq.length - 1] ?? text.length - 1) + 1;
    return esc(text.slice(0, s)) + "<mark>" + esc(text.slice(s, e)) + "</mark>" + esc(text.slice(e));
  }
  function paged(items, render, el) {
    let shown = 0;
    const ul = document.createElement("ul");
    ul.className = "list";
    const btn = document.createElement("button");
    btn.className = "more";
    const more = () => {
      ul.insertAdjacentHTML("beforeend", items.slice(shown, shown + PAGE).map(render).join(""));
      shown += PAGE;
      btn.hidden = shown >= items.length;
      btn.textContent = `عرض المزيد (${arNum(items.length - shown)})`;
    };
    btn.onclick = more;
    el.append(ul, btn);
    more();
    if (!items.length) el.innerHTML = `<p class="empty">لا نتائج.</p>`;
  }
  const setTab = (t) => document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("on", a.dataset.t === t));

  // ------------------------------------------------------------ الشاشات
  function home() {
    setTab("");
    const counts = Array(13).fill(0);
    T.rows.forEach((r) => counts[r.tab || 0]++);
    const mud = T.rows.filter((r) => r.mud).length;
    view.innerHTML = `
      <h1>رجال الحديث</h1>
      <p class="muted">تراجم رواة الكتب الستة من «${esc(T.name)}» لابن حجر، مع تراجمهم في كتب الرجال الأخرى،
      والمدلسين بمراتبهم. كل نص منقول من كتابه بحروفه مع موضعه.</p>
      <div class="grid">
        <a class="tile" href="#/tabaqat"><b>الطبقات</b><span class="muted">${arNum(T.rows.length)} راويًا في اثنتي عشرة طبقة</span></a>
        <a class="tile" href="#/mudallisin"><b>المدلسون ومراتبهم</b><span class="muted">تعريف أهل التقديس — ${arNum(mud)} راويًا مربوطًا بالتقريب</span></a>
        <a class="tile" href="#/books"><b>الكتب</b><span class="muted">${arNum(BOOKS.length + 1)} كتابًا</span></a>
        <a class="tile" href="#/about"><b>المنهج</b><span class="muted">ما المنقول وما الآلي</span></a>
      </div>`;
  }

  function tabaqat() {
    setTab("tabaqat");
    const counts = Array(13).fill(0);
    T.rows.forEach((r) => counts[r.tab || 0]++);
    const defs = T.intro?.tabaqat || [];
    view.innerHTML = `<h1>الطبقات</h1>
      ${T.intro ? `<p class="muted">تعريف كل طبقة بعبارة ابن حجر في مقدمة «التقريب».</p>` : ""}
      <div class="grid">${ORD.map((o, i) => `
        <a class="tile" href="#/tabaqa/${i + 1}"><span class="count">${arNum(counts[i + 1])}</span><b>الطبقة ${o}</b>
        ${defs[i] ? `<div class="q">${esc(defs[i])}</div>` : ""}</a>`).join("")}
        ${counts[0] ? `<a class="tile" href="#/tabaqa/0"><span class="count">${arNum(counts[0])}</span><b>لم تُذكر طبقته</b>
        <span class="muted">سطر التقريب لا يتضمن لفظ الطبقة</span></a>` : ""}
      </div>
      ${T.intro?.wafat ? `<h2>الوفيات</h2>${quote(T.intro.wafat, T.intro.src.name)}` : ""}`;
  }

  function tabaqa(n, params) {
    setTab("tabaqat");
    const state = { lafz: params.get("l") || "", rz: params.get("rz") || "", sort: params.get("s") || "n" };
    const all = T.rows.filter((r) => (r.tab || 0) === n);
    const def = T.intro?.tabaqat?.[n - 1];
    view.innerHTML = `<h1>${n ? "الطبقة " + ORD[n - 1] : "من لم تُذكر طبقته"}</h1>
      ${def ? quote(def, T.intro.src.name) : ""}
      <h2>تصفية</h2>
      <div class="chips" id="lafz">${LAFZ.map((l) => `<button class="chip${state.lafz === l ? " on" : ""}" data-v="${l}">${l}</button>`).join("")}</div>
      <div class="chips" id="rz">${RUMUZ.map((l) => `<button class="chip${state.rz === l ? " on" : ""}" data-v="${l}">${l}</button>`).join("")}</div>
      <div class="chips" id="sort">
        <button class="chip${state.sort === "n" ? " on" : ""}" data-v="n">بترتيب الكتاب</button>
        <button class="chip${state.sort === "d" ? " on" : ""}" data-v="d">بسنة الوفاة</button></div>
      <p class="muted" id="cnt"></p><div id="res"></div>`;
    const go = () => {
      const q = new URLSearchParams();
      if (state.lafz) q.set("l", state.lafz);
      if (state.rz) q.set("rz", state.rz);
      if (state.sort !== "n") q.set("s", state.sort);
      history.replaceState(null, "", `#/tabaqa/${n}${q.toString() ? "?" + q : ""}`);
      const nl = norm(state.lafz);
      let rows = all.filter((r) => (!nl || r._n.includes(nl)) && (!state.rz || r.rz.split(" ").includes(state.rz)));
      if (state.sort === "d") rows = rows.slice().sort((a, b) => (a.dy ?? 9999) - (b.dy ?? 9999));
      $("#cnt").textContent = `${arNum(rows.length)} راويًا` + (state.lafz ? ` يرد في سطره لفظ «${state.lafz}»` : "");
      const res = $("#res");
      res.innerHTML = "";
      paged(rows, (r) => taqRow(r, state.lafz), res);
    };
    for (const [id, k] of [["lafz", "lafz"], ["rz", "rz"], ["sort", "sort"]]) {
      $("#" + id).onclick = (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        state[k] = k === "sort" ? b.dataset.v : state[k] === b.dataset.v ? "" : b.dataset.v;
        $("#" + id).querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.v === state[k]));
        go();
      };
    }
    go();
  }

  async function narrator(n) {
    setTab("");
    const r = BYN.get(n);
    if (!r) return (view.innerHTML = `<p class="empty">لا يوجد راوٍ بهذا الرقم.</p>`);
    view.innerHTML = `
      <p class="muted"><a href="#/tabaqa/${r.tab || 0}">${r.tab ? "الطبقة " + ORD[r.tab - 1] : "بلا طبقة"}</a> · تقريب التهذيب رقم ${arNum(r.n)}</p>
      ${quote(r.t, `${T.name}، ص ${r.ref}`)}
      <dl class="facts">
        ${r.tabT ? `<dt>الطبقة</dt><dd>${esc(r.tabT)}</dd>` : ""}
        ${r.death ? `<dt>الوفاة</dt><dd>${esc(r.death)}</dd>` : ""}
        ${r.rz ? `<dt>الرموز</dt><dd>${esc(r.rz)}</dd>` : ""}
      </dl>
      <div id="mud"></div><div id="st"></div><div id="others"><p class="muted">جارٍ التحميل…</p></div>`;
    if (r.mud) {
      const M = await load("mudallisin.json");
      const rk = M.ranks.find((x) => x.rank === r.mud);
      const e = rk?.entries.find((x) => x.taq.includes(n));
      if (e) $("#mud").innerHTML = `<h2>في «${esc(M.name.split("=").pop().trim())}» — <a href="#/mudallisin/${rk.rank}">${esc(rk.title)}</a></h2>
        ${quote(e.t, `${M.name}، ص ${e.ref}`)}`;
    }
    const keys = BOOKS.map((b) => b.key).filter((k) => r.L[k]);
    let html = "";
    let stDone = false;
    for (const k of keys) {
      const b = BOOKMAP[k];
      const ents = await Promise.all(r.L[k].map((i) => entry(k, i)));
      if (k === "tahdhib_kamal" && !stDone) {
        const e = ents.find((x) => x.from || x.to);
        if (e) { $("#st").innerHTML = shuyukh(e, ents.length > 1); stDone = true; }
      }
      html += `<details class="book"${keys.length <= 2 ? " open" : ""}><summary>${esc(b.name)} <span class="muted">— ${esc(b.author)}</span></summary>
        <div class="inner">${ents.length > 1 ? `<p class="note">${arNum(ents.length)} تراجم توافق الاسم والأب والجد؛ تحقّق أيها المقصود.</p>` : ""}
        ${ents.map((e) => quote(e.t, `${b.name}، ${/\//.test(e.ref) ? "ج/ص " : "ص "}${e.ref}`)).join("")}</div></details>`;
    }
    $("#others").innerHTML = keys.length ? `<h2>في كتب الرجال</h2>${html}`
      : `<p class="muted">لم تُوجد ترجمة بالاسم نفسه (الاسم والأب والجد) في الكتب الأخرى.</p>`;
  }

  function shuyukh(e, ambiguous) {
    const li = ([name, n]) => `<li>${n ? `<a href="#/r/${n}">${esc(name)}</a>` : esc(name)}</li>`;
    return `<h2>الشيوخ والتلاميذ — من «تهذيب الكمال»</h2>
      ${ambiguous ? `<p class="note">في «تهذيب الكمال» أكثر من ترجمة بهذا الاسم؛ القائمتان من أولاها.</p>` : ""}
      <details class="book" open><summary>روى عن (${arNum((e.from || []).length)})</summary><div class="inner"><ul class="names">${(e.from || []).map(li).join("")}</ul></div></details>
      <details class="book"><summary>روى عنه (${arNum((e.to || []).length)})</summary><div class="inner"><ul class="names">${(e.to || []).map(li).join("")}</ul></div></details>
      <p class="muted">الأسماء المرتبطة بروابط طابقت راويًا واحدًا في «التقريب» بالاسم والأب والجد.</p>`;
  }

  async function mudallisin(rank) {
    setTab("mudallisin");
    const M = await load("mudallisin.json");
    if (!rank) {
      view.innerHTML = `<h1>المدلسون ومراتبهم</h1><p class="muted">${esc(M.name)} — ${esc(M.author)}</p>
        <div class="grid">${M.ranks.map((rk) => `<a class="tile" href="#/mudallisin/${rk.rank}"><span class="count">${arNum(rk.entries.length)}</span>
          <b>${esc(rk.title)}</b>${rk.count_line ? `<span class="muted">${esc(rk.count_line)}</span>` : ""}</a>`).join("")}</div>
        ${M.intro.length ? `<h2>مقدمة ابن حجر وتعريف المراتب</h2>${M.intro.map((p) => quote(p.text, `ص ${p.ref}`)).join("")}` : ""}`;
      return;
    }
    const rk = M.ranks.find((x) => x.rank === rank);
    if (!rk) return (view.innerHTML = `<p class="empty">لا توجد هذه المرتبة.</p>`);
    view.innerHTML = `<p class="muted"><a href="#/mudallisin">المدلسون</a></p><h1>${esc(rk.title)}</h1>
      ${rk.count_line ? `<p class="muted">${esc(rk.count_line)}</p>` : ""}<div id="res"></div>`;
    paged(rk.entries, (e) => `<li>${quote(e.t, `ص ${e.ref}`)}
      ${e.taq.length === 1 ? `<a href="#/r/${e.taq[0]}">ترجمته في التقريب ←</a>`
        : e.taq.length > 1 ? `<span class="muted">يوافق اسمه في التقريب: ${e.taq.map((n) => `<a href="#/r/${n}">${arNum(n)}</a>`).join("، ")}</span>` : ""}</li>`, $("#res"));
  }

  function books() {
    setTab("books");
    view.innerHTML = `<h1>الكتب</h1>
      <ul class="list">
        <li><b>${esc(T.name)}</b> <span class="muted">— ${esc(T.author)} · ${arNum(T.rows.length)} ترجمة · أصل الترتيب والطبقات</span></li>
        ${BOOKS.map((b) => `<li><a href="#/book/${b.key}/0"><b>${esc(b.name)}</b></a> <span class="muted">— ${esc(b.author)} · ${arNum(b.entries)} ترجمة</span></li>`).join("")}
      </ul>`;
  }

  async function book(key, i) {
    setTab("books");
    const b = BOOKMAP[key];
    if (!b) return (view.innerHTML = `<p class="empty">الكتاب غير موجود.</p>`);
    const e = await entry(key, i);
    view.innerHTML = `<p class="muted"><a href="#/books">الكتب</a> · ${esc(b.name)} — ترجمة ${arNum(i + 1)} من ${arNum(b.entries)}</p>
      ${quote(e.t, `${b.name}، ${e.ref}`)}
      <div class="chips">${i > 0 ? `<a class="chip" href="#/book/${key}/${i - 1}">→ السابقة</a>` : ""}
      ${i + 1 < b.entries ? `<a class="chip" href="#/book/${key}/${i + 1}">التالية ←</a>` : ""}</div>`;
  }

  function search(q) {
    setTab("");
    $("#q").value = q;
    const nq = norm(q).trim();
    const words = nq.split(/\s+/).filter(Boolean);
    const rows = words.length ? T.rows.filter((r) => words.every((w) => r._n.includes(w))) : [];
    view.innerHTML = `<h1>نتائج «${esc(q)}»</h1><p class="muted">${arNum(rows.length)} راويًا في «التقريب»</p><div id="res"></div>`;
    paged(rows, (r) => taqRow(r, words[0]), $("#res"));
  }

  function about() {
    setTab("about");
    view.innerHTML = `<h1>المنهج</h1>
      <div class="card"><b>المنقول بحروفه</b><p>كل نص في إطار مظلَّل منقولٌ من «المكتبة الشاملة» كما هو: متن الكتاب دون حواشي المحققين،
      ومعه اسم الكتاب والجزء والصفحة. لم يُضف إليه شرح ولا حكم ولا تلخيص.</p>
      <p>المحذوف الوحيد: إحالات الحواشي مثل (١)، لأن الحواشي نفسها كلام المحقق وليست منقولة.</p></div>
      <div class="card"><b>ما يصنعه التطبيق آليًّا (ترتيب لا كلام)</b>
      <ul>
        <li>الطبقة: من لفظ «من العاشرة» ونحوه في سطر «التقريب»، ويُعرض اللفظ نفسه.</li>
        <li>الوفاة: العبارة كما في «التقريب» («مات سنة…»). الفرز بالسنة يتبع قاعدة ابن حجر في مقدمته للقرن، والرقم لا يُعرض.</li>
        <li>التصفية بالألفاظ (ثقة، صدوق…): بحث حرفي عن اللفظ في السطر، وليست تصنيفًا لمرتبة الراوي.</li>
        <li>الربط بين الكتب: بمطابقة الاسم واسم الأب والجد. إذا وافق الاسم أكثر من ترجمة عُرضت كلها مع التنبيه.</li>
        <li>الشيوخ والتلاميذ: قائمتا «روى عن» و«روى عنه» من «تهذيب الكمال» مقطوعتين عند الفواصل.</li>
      </ul></div>
      ${T.intro ? `<h2>مراتب الجرح والتعديل عند ابن حجر</h2>${T.intro.maratib.map((m) => `<div class="q">${esc(m)}</div>`).join("")}
      <span class="src">${esc(T.intro.src.name)}، ص ${esc(T.intro.src.pages.join("، "))}</span>` : ""}`;
  }

  // ------------------------------------------------------------ التوجيه
  async function route() {
    const [path, qs] = (location.hash.slice(1) || "/").split("?");
    const params = new URLSearchParams(qs || "");
    const p = path.split("/").filter(Boolean);
    window.scrollTo(0, 0);
    try {
      if (!p.length) return home();
      switch (p[0]) {
        case "tabaqat": return tabaqat();
        case "tabaqa": return tabaqa(+p[1] || 0, params);
        case "r": return await narrator(+p[1]);
        case "mudallisin": return await mudallisin(p[1] ? +p[1] : 0);
        case "books": return books();
        case "book": return await book(p[1], +p[2] || 0);
        case "search": return search(params.get("q") || "");
        case "about": return about();
        default: return home();
      }
    } catch (err) {
      view.innerHTML = `<p class="empty">تعذّر تحميل البيانات (${esc(err.message)}).</p>`;
    }
  }
  $("#searchForm").onsubmit = (e) => {
    e.preventDefault();
    location.hash = "#/search?q=" + encodeURIComponent($("#q").value.trim());
  };
  window.addEventListener("hashchange", route);
  init().then(route).catch((e) => (view.innerHTML = `<p class="empty">تعذّر تحميل البيانات: ${esc(e.message)}</p>`));
})();
