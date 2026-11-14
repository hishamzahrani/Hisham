#!/usr/bin/env python3
"""يولّد أسئلة «مسابقات رجال الحديث» (quiz/js/data.js) من بيانات التطبيق (app/data).

القاعدة: كل جواب صحيح وكل شرح منقول من الكتاب بحروفه، ومعه موضعه.
صيغة السؤال وحدها من التطبيق (مثل «ما قول ابن حجر في فلان؟»).
والخيارات الخاطئة مأخوذة أيضًا من نصوص الكتاب نفسه، لكن عن رواة آخرين.

المراحل = طبقات ابن حجر الاثنتا عشرة، وكل ثلاث طبقات وحدة تُختم بجولة.
الأسئلة لكل طبقة تُختار من أشهر رواتها: أكثرهم ورودًا في كتب الرجال وأوسعهم شيوخًا وتلاميذ.

الاستعمال:  python3 quiz.py --data ../app/data --out ../quiz/js/data.js [--per-stage 60]
"""
import argparse, json, random, re, sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import norm, name_key  # noqa: E402

ORD = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة",
       "العاشرة", "الحادية عشرة", "الثانية عشرة"]
RANKS = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة"]
AR = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")

CATEGORIES = {
    "hukm": {"name": "الجرح والتعديل", "icon": "scales", "color": "#1f5c4e"},
    "wafat": {"name": "الوفيات", "icon": "lantern", "color": "#7d5a2c"},
    "shuyukh": {"name": "الشيوخ", "icon": "roots", "color": "#2b5f93"},
    "talamidh": {"name": "التلاميذ", "icon": "sprout", "color": "#3f8a3a"},
    "tadlis": {"name": "التدليس ومراتبه", "icon": "mirror", "color": "#a0522d"},
    "rumuz": {"name": "من أخرج له", "icon": "book", "color": "#5b4a8a"},
}

# أول ألفاظ الحكم في سطر «التقريب» (مطبَّعة). يبدأ الحكم عند أول واحد منها وينتهي قبل لفظ الطبقة.
START1 = {"صحابي", "ثقه", "ثبت", "صدوق", "مقبول", "مستور", "مجهول", "ضعيف", "متروك", "كذاب", "متهم", "لين", "امام", "حافظ", "فقيه"}
START2 = {("له", "صحبه"), ("له", "رويه"), ("لا", "باس"), ("ليس", "به"), ("منكر", "الحديث"), ("اتهم", "بالكذب")}
TAB_START = re.compile(r"^من$")


def split_line(r):
    """(الاسم، الحكم) مقطوعين من سطر التقريب بحروفه، أو None."""
    toks = r["t"].split()
    if not toks:
        return None
    if re.match(r"^[٠-٩0-9]+[-ـ]?$", toks[0]):
        toks = toks[1:]
        if toks and toks[0] in ("-", "ـ"):
            toks = toks[1:]
    nt = [norm(t) for t in toks]
    nt = [t[1:] if t.startswith("و") and t[1:] in START1 else t for t in nt]
    s = None
    for i in range(2, len(nt)):  # الاسم كلمتان على الأقل
        if nt[i] in START1 and not toks[i].startswith("ال") or (i + 1 < len(nt) and (nt[i], nt[i + 1]) in START2):
            s = i
            break
    if s is None:
        return None
    e = None
    if r.get("tabT"):
        tt = r["tabT"].split()
        for i in range(s + 1, len(toks) - len(tt) + 1):
            if toks[i:i + len(tt)] == tt:
                e = i
                break
    if e is None:
        return None
    return " ".join(toks[:s]), " ".join(toks[s:e])


DABT = {"بضم", "بفتح", "بكسر", "بسكون", "بالتحتانيه", "بالمهمله", "بالمعجمه", "بالموحده", "بالنون", "يكني", "واسم", "وقيل", "ويقال", "مصغر", "مصغرا"}


def display_name(name, n=8):
    """الاسم كما في السطر حتى أول ضبطٍ بالحروف أو تعريفٍ زائد، وبحدّ أقصى n كلمات."""
    out = []
    for w in name.split():
        if norm(w) in DABT or (out and len(out) >= 2 and norm(w) in START1):
            break
        out.append(w)
    return short(" ".join(out) or name, n)


def short(name, n=5):
    w = name.split()
    return " ".join(w[:n]) + (" …" if len(w) > n else "")


def pick_distractors(correct, pool, rng, k=3, key=lambda x: x, near=None):
    """ثلاثة خيارات من نصوص رواة آخرين: مختلفة عن الجواب، ومتقاربة الطول (أو القيمة)."""
    cn = norm(key(correct))
    seen, cands = {cn}, []
    for x in pool:
        xn = norm(key(x))
        if xn in seen:
            continue
        seen.add(xn)
        cands.append(x)
    if len(cands) < k:
        return None
    if near:
        cands.sort(key=near)
        cands = cands[: max(k * 3, 8)]
    else:
        L = len(key(correct))
        cands.sort(key=lambda x: abs(len(key(x)) - L))
        cands = cands[: max(k * 4, 10)]
    return rng.sample(cands, k)


def load_tk(data: Path):
    meta = {b["key"]: b for b in json.loads((data / "books.json").read_text(encoding="utf-8"))}
    if "tahdhib_kamal" not in meta:
        return None, {}
    b = meta["tahdhib_kamal"]
    rows = []
    for c in range((b["entries"] + b["chunk"] - 1) // b["chunk"]):
        rows += json.loads((data / "books" / "tahdhib_kamal" / f"{c}.json").read_text(encoding="utf-8"))
    return b, rows


def main():
    ap = argparse.ArgumentParser()
    here = Path(__file__).resolve().parent.parent
    ap.add_argument("--data", default=str(here / "app" / "data"))
    ap.add_argument("--out", default=str(here / "quiz" / "js" / "data.js"))
    ap.add_argument("--per-stage", type=int, default=80)
    a = ap.parse_args()
    data = Path(a.data)
    T = json.loads((data / "taqrib.json").read_text(encoding="utf-8"))
    M = json.loads((data / "mudallisin.json").read_text(encoding="utf-8")) if (data / "mudallisin.json").exists() else None
    tkm, tk = load_tk(data)
    tname = T["name"]
    defs = (T.get("intro") or {}).get("tabaqat") or []

    mud_entry = {}
    if M:
        for rk in M["ranks"]:
            for e in rk["entries"]:
                if len(e["taq"]) == 1:
                    mud_entry[e["taq"][0]] = (rk, e)

    # تجهيز الرواة
    people = []
    for r in T["rows"]:
        sp = split_line(r)
        p = {"r": r, "name": sp[0] if sp else None, "hukm": sp[1] if sp else None, "tk": None}
        links = r.get("L", {})
        if tk and len(links.get("tahdhib_kamal", [])) == 1:
            p["tk"] = tk[links["tahdhib_kamal"][0]]
        p["fame"] = 3 * len(links) + (len((p["tk"] or {}).get("from", [])) + len((p["tk"] or {}).get("to", []))) / 15 \
            + (2 if "ع" in r["rz"].split() else 0) + (3 if r["n"] in mud_entry else 0)
        people.append(p)

    by_tab = defaultdict(list)
    for p in people:
        if p["r"]["tab"]:
            by_tab[p["r"]["tab"]].append(p)

    def src_taq(r):
        return f"{tname}، ص {str(r['ref']).translate(AR)}، رقم {str(r['n']).translate(AR)}"

    stages_out = []
    for tab in sorted(by_tab):
        rng = random.Random(1000 + tab)
        ps = sorted(by_tab[tab], key=lambda p: (-p["fame"], p["r"]["n"]))
        hukm_pool = [p["hukm"] for p in ps if p["hukm"]]
        death_pool = [p for p in ps if p["r"]["death"]]
        rz_pool = [p["r"]["rz"] for p in ps if p["r"]["rz"]]
        list_pool = {side: [(nm, p["r"]["n"], norm(nm), name_key(nm)) for p in ps if p["tk"] for nm, _ in p["tk"].get(side, [])
                            if not norm(nm).startswith("النبي")]
                     for side in ("from", "to")}
        death_dy = {}
        for x in death_pool:
            death_dy.setdefault(x["r"]["death"], x["r"].get("dy") or 0)
        death_list = list(death_dy)
        queues = defaultdict(list)

        for p in ps[: a.per_stage]:  # أشهر الرواة يكفون لملء المرحلة؛ والخيارات من الطبقة كلها
            r = p["r"]
            nm = display_name(p["name"]) if p["name"] else display_name(re.sub(r"^\S+\s*", "", r["t"]), 6)
            line = r["t"]
            if p["hukm"]:
                d = pick_distractors(p["hukm"], hukm_pool, rng)
                if d:
                    queues["hukm"].append({"t": "mcq", "c": "hukm",
                                           "q": f"ما قول ابن حجر في «{nm}» في «{tname}»؟",
                                           "o": [p["hukm"], *d], "e": line, "s": src_taq(r)})
                    wrong = d[0]
                    truth = rng.random() < 0.5
                    queues["hukm"].append({"t": "tf", "c": "hukm",
                                           "q": f"قال ابن حجر في «{nm}»: «{p['hukm'] if truth else wrong}».",
                                           "v": truth, "e": line, "s": src_taq(r)})
            if r["death"]:
                dy = r.get("dy") or 0
                d = pick_distractors(r["death"], death_list, rng, near=lambda x, dy=dy: abs(death_dy[x] - dy))
                if d:
                    queues["wafat"].append({"t": "mcq", "c": "wafat",
                                            "q": f"ما قال ابن حجر في وفاة «{nm}»؟",
                                            "o": [r["death"], *d], "e": line, "s": src_taq(r)})
            if r["rz"] and len(r["rz"]) > 0:
                d = pick_distractors(r["rz"], rz_pool, rng)
                if d:
                    queues["rumuz"].append({"t": "mcq", "c": "rumuz",
                                            "q": f"ما الرموز التي وضعها ابن حجر على «{nm}» إشارةً إلى من أخرج حديثه؟",
                                            "o": [r["rz"], *d], "e": line, "s": src_taq(r)})
            if r["n"] in mud_entry:
                rk, e = mud_entry[r["n"]]
                titles = {x["rank"]: x["title"] for x in M["ranks"]}
                opts = [titles[rk["rank"]]] + [titles[k] for k in sorted(titles) if k != rk["rank"]][:3]
                if len(opts) == 4:
                    queues["tadlis"].append({"t": "mcq", "c": "tadlis",
                                             "q": f"في أي مرتبة ذكر ابن حجر «{nm}» في «تعريف أهل التقديس»؟",
                                             "o": opts, "e": e["t"],
                                             "s": f"{M['name']}، ص {str(e['ref']).translate(AR)}"})
            if p["tk"]:
                own_keys = {name_key(x) for side in ("from", "to") for x, _ in p["tk"].get(side, [])} - {None}
                own_norm = {norm(x) for side in ("from", "to") for x, _ in p["tk"].get(side, [])}
                for side, cat, label in (("from", "shuyukh", "روى عن"), ("to", "talamidh", "روى عنه")):
                    lst = p["tk"].get(side, [])
                    if not lst:
                        continue
                    lst = [x for x in lst if not norm(x[0]).startswith("النبي")]  # النبي ﷺ يتكرر برموز مختلفة
                    if not lst:
                        continue
                    correct = rng.choice(lst)[0]
                    cand = list_pool[side]
                    cand = rng.sample(cand, min(len(cand), 400))
                    pool = [x for x, n, xn, xk in cand if n != r["n"] and xn not in own_norm and xk not in own_keys]
                    d = pick_distractors(correct, pool, rng)
                    if d:
                        q = (f"مَن مِن هؤلاء ذكره المزي فيمن روى عنهم «{nm}»؟" if side == "from"
                             else f"مَن مِن هؤلاء ذكره المزي فيمن رووا عن «{nm}»؟")
                        queues[cat].append({"t": "mcq", "c": cat, "a": line, "r": src_taq(r), "q": q,
                                            "o": [correct, *d], "e": f"{label}: … {correct} …",
                                            "s": f"{tkm['name']}، {str(p['tk']['ref']).translate(AR)}"})

        # المطابقة: أربعة رواة بعبارات وفياتهم
        matches = []
        dp = [p for p in ps if p["r"]["death"] and p["name"]]
        for i in range(0, min(len(dp), 16) - 3, 4):
            grp = dp[i:i + 4]
            if len({norm(x["r"]["death"]) for x in grp}) == 4 and len({short(x["name"], 4) for x in grp}) == 4:
                matches.append({"t": "match", "c": "wafat", "q": "صِل كل راوٍ بعبارة وفاته في «التقريب»",
                                "p": [[short(x["name"], 4), x["r"]["death"]] for x in grp],
                                "e": "\n".join(x["r"]["t"] for x in grp),
                                "s": f"{tname}، ص " + "، ".join(sorted({str(x['r']['ref']).translate(AR) for x in grp}))})
        queues["wafat"][1:1] = matches[:2]

        # الاختيار: بالتناوب بين المحاور حتى الحد، مع ترتيب الشهرة داخل كل محور
        qs, cats = [], [c for c in CATEGORIES if queues[c]]
        while len(qs) < a.per_stage and any(queues[c] for c in cats):
            for c in cats:
                if queues[c] and len(qs) < a.per_stage:
                    qs.append(queues[c].pop(0))
        if not qs:
            continue
        stages_out.append({"tab": tab, "title": f"الطبقة {ORD[tab - 1]}",
                           "surahs": defs[tab - 1] if len(defs) >= tab else "", "questions": qs})
        print(f"✓ الطبقة {ORD[tab - 1]}: {len(qs)} سؤالًا من {len(ps)} راويًا", file=sys.stderr)

    top = len(stages_out)
    for i, s in enumerate(stages_out):
        s["juz"] = top - i
        del s["tab"]

    js = [
        "// مولَّد آليًّا بـ build/quiz.py — لا تعدّله يدويًّا.",
        "// كل جواب صحيح وكل شرح منقول من كتابه بحروفه؛ وصيغ الأسئلة وحدها من التطبيق.",
        f"const APP_INFO = {json.dumps({'name': 'مسابقات رجال الحديث', 'unitSpan': 3}, ensure_ascii=False)};",
        f"const CATEGORIES = {json.dumps(CATEGORIES, ensure_ascii=False, indent=1)};",
        f"const STAGES = {json.dumps(stages_out, ensure_ascii=False, separators=(',', ':'))};",
        "function sourceOf(q) { return { label: \"المصدر\", text: q.s || \"\" }; }",
        "",
    ]
    Path(a.out).write_text("\n".join(js), encoding="utf-8")
    print(f"✓ {sum(len(s['questions']) for s in stages_out)} سؤالًا في {top} مرحلة → {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
