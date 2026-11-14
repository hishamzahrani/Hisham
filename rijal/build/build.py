#!/usr/bin/env python3
"""يبني بيانات التطبيق من النصوص المستخرجة (raw/*.json) دون إضافة أي كلام.

كل نص يظهر في التطبيق مقطوع من الكتاب بحروفه. الذي يصنعه هذا السكربت هو التقطيع
والترتيب والربط فقط:
  • تقطيع كل كتاب إلى تراجم عند أرقامها.
  • استخراج الطبقة وعبارة الوفاة والرموز من سطر «التقريب» (العبارة نفسها، لا تفسيرها).
  • ربط الراوي بتراجمه في الكتب الأخرى بمطابقة الاسم (الاسم + الأب + الجد).
  • فصل قائمتي «روى عن» و«روى عنه» من «تهذيب الكمال».
التعديل الوحيد على النص: حذف إحالات الحواشي مثل (١) و(٠) لأن الحواشي نفسها
(كلام المحقق) غير منقولة.

الاستعمال:  python3 build.py --raw ../raw --out ../app/data
"""
import argparse, json, re, sys
from collections import defaultdict
from pathlib import Path

AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
DIAC = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
NORM_MAP = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي"})


def norm(s: str) -> str:
    return DIAC.sub("", s).translate(NORM_MAP).translate(AR_DIGITS)


def norm_map(s: str):
    """نص مطبَّع مع خريطة من كل حرف فيه إلى موضعه في الأصل."""
    out, idx = [], []
    for i, ch in enumerate(s):
        if DIAC.match(ch):
            continue
        out.append(ch.translate(NORM_MAP).translate(AR_DIGITS))
        idx.append(i)
    idx.append(len(s))
    return "".join(out), idx


FN_REF = re.compile(r"\s?\((?:[٠-٩0-9]+)\)\s?(?=[ .،\n]|$)")


def strip_fn_refs(text: str) -> str:
    """يحذف إحالات الحواشي داخل السطر ويُبقي رقم الترجمة في أول السطر مثل «(١) أحمد…»."""
    lines = []
    for line in text.split("\n"):
        m = re.match(r"^\s*\([٠-٩0-9]+\)\s*", line)
        head, rest = (line[: m.end()], line[m.end():]) if m and not line.strip().startswith("(٠)") else ("", line)
        rest = rest.replace("(٠)", "")
        rest = FN_REF.sub(lambda mm: " " if mm.group(0).startswith(" ") and mm.group(0).endswith(" ") else "", rest)
        lines.append((head + rest).rstrip())
    return re.sub(r"[ \t]{2,}", " ", "\n".join(lines)).strip()


def ref(p):
    part, page = p.get("part"), p.get("page")
    return f"{part}/ {page}" if part not in (None, "", "0") else str(page)


# ---------------------------------------------------------------- الأسماء
RUMUZ = set("خ خت بخ عخ ر ي م مق د مد صد خد قد ف ل كد ت تم س عس كن سي ص ق فق ع ٤ تمييز".split())
KUNYA = {"ابو", "ابي", "ابا", "ام"}


def name_chain(s: str):
    """سلسلة الاسم: فلان [بن فلان [بن فلان]] من أول النص بعد حذف الرقم والرموز."""
    s = norm(s)
    s = re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", s)
    toks = re.findall(r"[ء-ي]+|\d+", s)
    while toks and (toks[0] in RUMUZ or toks[0].isdigit() or toks[0] == "و"):
        toks.pop(0)
    toks = ["بن" if t == "ابن" else t for t in toks]
    if not toks:
        return []
    # «أبي أسامة حماد بن أسامة»: الكنية قبل الاسم تُتجاوز إن جاء بعدها اسم منسوب
    if toks[0] in KUNYA and len(toks) > 3 and "بن" in toks[2:4]:
        toks = toks[2:]
    chain, i = [], 0
    if toks[0] in KUNYA and len(toks) > 1:
        chain.append(toks[0] + " " + toks[1]); i = 2
    else:
        chain.append(toks[0]); i = 1
    while i + 1 < len(toks) and toks[i] == "بن" and len(chain) < 3:
        nxt = toks[i + 1]
        if nxt in KUNYA and i + 2 < len(toks):
            chain.append(nxt + " " + toks[i + 2]); i += 3
        elif nxt == "عبد" and i + 2 < len(toks):
            chain.append("عبد " + toks[i + 2]); i += 3
        else:
            chain.append(nxt); i += 2
    if chain[0] == "عبد" and len(toks) > 1:
        chain[0] = "عبد " + toks[1]
    return chain


def name_key(s: str):
    c = name_chain(s)
    return " ".join(c[:3]) if len(c) >= 2 else None


# ---------------------------------------------------------------- تقطيع الكتب
START_PATTERNS = {
    "line_num_dash": r"(?m)^\s*([٠-٩0-9]+)\s*[-ـ]\s*",
    "num_dash_bracket": r"(?:(?<=\s)|^)([٠-٩0-9]+)\s*-\s*(?=\[)",
    "bracket_num": r"\[([٠-٩0-9]+)\]\s*",
    "line_paren_num": r"(?m)^\s*\(([٠-٩0-9]+)\)\s*",
    "bullet": r"•\s*",
}
BOOK_PATTERN = {  # ما ثبت من شكل الكتاب؛ وما سواه يُختار آليًّا بأكثر الأنماط تطابقًا
    "taqrib": "line_num_dash", "tahdhib_kamal": "line_num_dash", "tadhhib": "num_dash_bracket",
    "kamal": "bracket_num", "thiqat": "bullet", "mudallisin": "line_paren_num",
}


def segment(book, pattern_name=None, pages=None):
    pages = pages if pages is not None else book["pages"]
    if not pattern_name:
        best = max(START_PATTERNS, key=lambda k: sum(len(re.findall(START_PATTERNS[k], p["body"])) for p in pages))
        pattern_name = best
    rx = re.compile(START_PATTERNS[pattern_name])
    entries, cur = [], None
    for p in pages:
        body, pos = p["body"], 0
        for m in rx.finditer(body):
            if cur is not None:
                cur["text"] += body[pos:m.start()]
            elif m.start() > 0:
                pass  # نص قبل أول ترجمة (مقدمة/عنوان) لا يُعدّ ترجمة
            cur = {"num": m.group(1).translate(AR_DIGITS) if m.groups() else None,
                   "text": body[m.start():m.end()], "pid": p["id"], "ref": ref(p), "ref_end": ref(p)}
            entries.append(cur)
            pos = m.end()
        if cur is not None:
            cur["text"] += ("" if pos == 0 and cur["text"] and cur["text"].endswith("\n") else ("\n" if pos == 0 else "")) + body[pos:]
            cur["ref_end"] = ref(p)
    for e in entries:
        e["text"] = strip_fn_refs(e["text"])
    return entries, pattern_name


# ---------------------------------------------------------------- التقريب
ORD = ["الاولي", "الثانيه", "الثالثه", "الرابعه", "الخامسه", "السادسه", "السابعه", "الثامنه", "التاسعه",
       "العاشره", "الحاديه عشره", "الثانيه عشره"]
TAB_RX = re.compile(r"من (?:(كبار|صغار|اوساط) )?(" + "|".join(sorted(ORD, key=len, reverse=True)) + r")")
DEATH_RX = re.compile(r"(?:مات|قتل|توفي|استشهد|استشهد|هلك)\b")
NUMW = {"احدي": 1, "احد": 1, "واحد": 1, "اثنتين": 2, "اثنين": 2, "ثنتين": 2, "ثلاث": 3, "اربع": 4, "خمس": 5,
        "ست": 6, "سبع": 7, "ثمان": 8, "ثماني": 8, "تسع": 9, "عشر": 10, "عشره": 10, "عشرين": 20, "ثلاثين": 30,
        "اربعين": 40, "خمسين": 50, "ستين": 60, "سبعين": 70, "ثمانين": 80, "تسعين": 90, "مايه": 100, "ميه": 100,
        "مايتين": 200, "ميتين": 200, "ثلاثمايه": 300, "ثلاث مايه": 300}


def death_year_for_sorting(phrase_n: str, tab):
    """رقم تقريبي للفرز فقط — لا يُعرض. يتبع قاعدة ابن حجر في مقدمته للقرن."""
    m = re.search(r"سنه (.+)", phrase_n)
    if not m:
        return None
    total, explicit_h = 0, False
    for w in m.group(1).split():
        w = w[1:] if w.startswith("و") and w[1:] in NUMW else w
        if w in NUMW:
            total += NUMW[w]
            explicit_h |= NUMW[w] >= 100
        elif total:
            break
    if not total:
        return None
    if not explicit_h and tab:
        total += 0 if tab <= 2 else (100 if tab <= 8 else 200)
    return total


def parse_taqrib(book):
    entries, _ = segment(book, "line_num_dash")
    out = []
    for e in entries:
        line = e["text"].split("\n")[0].strip()
        body = re.sub(r"^\s*[٠-٩0-9]+\s*[-ـ]\s*", "", line)
        n_txt, idx = norm_map(body)
        tab, tab_txt, death = None, None, None
        mt = TAB_RX.search(n_txt)
        if mt:
            tab = ORD.index(mt.group(2)) + 1
            tab_txt = body[idx[mt.start()]: idx[mt.end()]]
        elif re.search(r"صحابي|له صحبه|له رويه", n_txt):
            tab = 1
        toks = body.split()
        rz = []
        while toks and norm(toks[-1]) in RUMUZ:
            rz.insert(0, toks.pop())
        rest_start = idx[mt.end()] if mt else 0
        tail = " ".join(toks)[rest_start:] if mt else ""
        md = DEATH_RX.search(norm(tail)) if tail else None
        if md:
            death = tail[md.start():].strip()
        else:
            md2 = re.search(r"(?:مات|قتل|توفي)[^.]*?سنه [^\s]+(?: [^\s]+){0,4}", n_txt)
            if md2:
                death = body[idx[md2.start()]: idx[md2.end()]].strip()
        out.append({
            "n": int(e["num"]), "t": line, "tab": tab, "tabT": tab_txt, "death": death,
            "dy": death_year_for_sorting(norm(death), tab) if death else None,
            "rz": " ".join(rz), "ref": e["ref"], "k": name_key(body),
        })
    return out


def parse_intro(book):
    """مقدمة ابن حجر: المراتب الاثنتا عشرة والطبقات الاثنتا عشرة — سطورًا كما هي."""
    lines = [l.strip() for p in book["pages"] for l in p["body"].split("\n") if l.strip()]
    lines = [strip_fn_refs(l) for l in lines]
    maratib, tabaqat, wafat, mode = [], [], None, None
    for l in lines:
        nl = norm(l)
        if "فاما المراتب" in nl:
            mode = "m"; continue
        if nl.startswith("واما الطبقات"):
            mode = "t"; continue
        if nl.startswith("وذكرت وفاه"):
            wafat = l; mode = None; continue
        if mode == "m" and len(maratib) < 12:
            maratib.append(l)
        elif mode == "t" and len(tabaqat) < 12:
            tabaqat.append(l)
    return {"maratib": maratib, "tabaqat": tabaqat, "wafat": wafat,
            "src": {"name": book["name"], "pages": [ref(p) for p in book["pages"]]}}


# ---------------------------------------------------------------- المدلسون
RANK_ORD = {"الاولي": 1, "الثانيه": 2, "الثالثه": 3, "الرابعه": 4, "الخامسه": 5}


def parse_mudallisin(book):
    titles = sorted([t for t in book["titles"] if t.get("page")], key=lambda t: t["page"])
    pages = book["pages"]
    rank_titles = [t for t in titles if norm(t["text"] or "").startswith("المرتبه")]
    intro_t = next((t for t in titles if "مقدمه ابن حجر" in norm(t["text"] or "")), None)
    first_rank_page = rank_titles[0]["page"] if rank_titles else None
    intro = []
    if intro_t and first_rank_page:
        intro = [{"ref": ref(p), "text": strip_fn_refs(p["body"])} for p in pages
                 if intro_t["page"] <= p["id"] < first_rank_page]
    ranks = []
    for i, t in enumerate(rank_titles):
        nxt = next((x["page"] for x in titles if x["page"] > t["page"]), 10 ** 9)
        rp = [p for p in pages if t["page"] <= p["id"] < nxt]
        ents, _ = segment(book, "line_paren_num", rp)
        rank = next((v for k, v in RANK_ORD.items() if k in norm(t["text"])), i + 1)
        head = rp[0]["body"].split("(١)")[0] if rp else ""
        ranks.append({"rank": rank, "title": t["text"], "count_line": strip_fn_refs(head.split("\n", 1)[1]) if "\n" in head else "",
                      "entries": [{"n": int(e["num"]), "t": e["text"], "ref": e["ref"], "k": name_key(e["text"])} for e in ents]})
    return {"name": book["name"], "author": book["author"], "intro": intro, "ranks": ranks}


# ---------------------------------------------------------------- تهذيب الكمال: الشيوخ والتلاميذ
def split_names(seg: str):
    items = [x.strip() for x in re.split(r"\s*،\s*", seg) if x.strip()]
    out = []
    for i, it in enumerate(items):
        # وصفٌ للاسم السابق لا اسمٌ مستقل: «بكير بن محمد بن أسماء، ابن أخي جويرية»
        if out and re.match(r"(ابن اخ|ابن عم|ابن ابن|ابن بنت|مولي|نزيل|واسمه|يعني|وهو|صاحب)", norm(it)):
            out[-1] += "، " + it.strip(" .:")
            continue
        if i > 0 and it.startswith("و") and len(it) > 2:
            it = it[1:]
        out.append(it.strip(" .:"))
    return [x for x in out if x]


def shuyukh_talamidh(text: str):
    n, idx = norm_map(text)
    a = re.search(r"روي عن\s*:", n)
    b = re.search(r"روي عنه\s*:", n)
    res = {}
    if a:
        end = b.start() if b and b.start() > a.end() else (re.search(r"\.(\s|$)", n[a.end():]) or None)
        end_i = end if isinstance(end, int) else (a.end() + end.start() if end else len(n))
        res["from"] = split_names(text[idx[a.end()]: idx[end_i]])
    if b:
        e = re.search(r"\.(\s|$)", n[b.end():])
        end_i = b.end() + e.start() if e else len(n)
        res["to"] = split_names(text[idx[b.end()]: idx[end_i]])
    return res


# ---------------------------------------------------------------- البناء
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=str(Path(__file__).resolve().parent.parent / "raw"))
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "app" / "data"))
    ap.add_argument("--chunk", type=int, default=150)
    a = ap.parse_args()
    raw, out = Path(a.raw), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    order = json.loads((Path(__file__).resolve().parent.parent / "extractor" / "books.json").read_text(encoding="utf-8"))
    books = {}
    for b in order:
        f = raw / f"{b['id']}.json"
        if f.exists():
            books[b["key"]] = json.loads(f.read_text(encoding="utf-8"))
    if "taqrib" not in books:
        sys.exit("لا بد من تقريب التهذيب (8609) في raw/")

    def dump(name, obj):
        p = out / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    taq = parse_taqrib(books["taqrib"])
    by_key = defaultdict(list)
    for r in taq:
        if r["k"]:
            by_key[r["k"]].append(r["n"])

    mud = parse_mudallisin(books["mudallisin"]) if "mudallisin" in books else None
    if mud:
        for rk in mud["ranks"]:
            for e in rk["entries"]:
                e["taq"] = by_key.get(e["k"], [])
                for n in e["taq"]:
                    r = next(x for x in taq if x["n"] == n)
                    r["mud"] = rk["rank"]
                del e["k"]
        dump("mudallisin.json", mud)

    intro = parse_intro(books["taqrib_intro"]) if "taqrib_intro" in books else None
    links = defaultdict(dict)  # رقم التقريب -> {كتاب: [أرقام التراجم]}
    meta = []
    for b in order:
        key = b["key"]
        if key in ("taqrib", "taqrib_intro", "mudallisin") or key not in books:
            continue
        bk = books[key]
        ents, pat = segment(bk, BOOK_PATTERN.get(key))
        rows = []
        for i, e in enumerate(ents):
            row = {"i": i, "t": e["text"], "ref": e["ref"] if e["ref"] == e["ref_end"] else f"{e['ref']} – {e['ref_end']}"}
            if key == "tahdhib_kamal":
                st = shuyukh_talamidh(e["text"])
                for side in ("from", "to"):
                    if side in st:
                        row[side] = [[nm, (by_key.get(name_key(nm)) or [None])[0] if len(by_key.get(name_key(nm), [])) == 1 else None]
                                     for nm in st[side]]
            rows.append(row)
            k = name_key(re.sub(r"^\s*(?:\[?[٠-٩0-9]+\]?\s*[-ـ]?\s*)", "", e["text"]))
            for n in by_key.get(k, []):
                links[n].setdefault(key, []).append(i)
        for c in range(0, len(rows), a.chunk):
            dump(f"books/{key}/{c // a.chunk}.json", rows[c:c + a.chunk])
        meta.append({"key": key, "id": b["id"], "name": bk["name"], "author": b["author"],
                     "entries": len(rows), "chunk": a.chunk, "pattern": pat})
        print(f"✓ {bk['name']}: {len(rows)} ترجمة (نمط {pat})", file=sys.stderr)

    for r in taq:
        r["L"] = links.get(r["n"], {})
        del r["k"]
    dump("taqrib.json", {"name": books["taqrib"]["name"], "author": "ابن حجر العسقلاني", "intro": intro, "rows": taq})
    dump("books.json", meta)
    print(f"✓ تقريب التهذيب: {len(taq)} راويًا؛ مدلسون: "
          f"{sum(len(r['entries']) for r in mud['ranks']) if mud else 0}", file=sys.stderr)


if __name__ == "__main__":
    main()
