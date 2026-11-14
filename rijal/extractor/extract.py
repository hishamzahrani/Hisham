#!/usr/bin/env python3
"""استخراج نصوص كتب الرجال من المكتبة الشاملة المنزَّلة على جهازك — حرفًا بحرف.

لا يضيف هذا السكربت شيئًا إلى النص ولا يحذف منه: يأخذ «المتن» (body) كما هو مخزَّن
في الشاملة، ويترك الحواشي (foot) لأنها كلام المحقق لا كلام المصنِّف.

الاستعمال:
    python3 extract.py --root /srv/shamela --inspect     # فحص البنية فقط (لا يكتب شيئًا)
    python3 extract.py --root /srv/shamela --out ../raw  # الاستخراج

يحتاج: Python 3.8+ و Java 11+ (JRE يكفي). مكتبة Lucene مرفقة في lib/.
"""
import argparse, hashlib, json, os, sqlite3, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOOKS = json.loads((HERE / "books.json").read_text(encoding="utf-8"))
BODY_FIELDS = ("body", "nass", "text", "content")
FOOT_FIELDS = ("foot", "hamesh")


def find_db_dir(root: Path) -> Path:
    for c in (root / "database", root):
        if (c / "master.db").exists():
            return c
    hits = list(root.rglob("master.db"))
    if not hits:
        sys.exit(f"لم أجد master.db تحت {root}")
    return hits[0].parent


def find_indexes(db_dir: Path):
    out = []
    for seg in db_dir.rglob("segments_*"):
        out.append(seg.parent)
    return sorted(set(out))


def find_book_db(db_dir: Path, book_id: int):
    for p in (db_dir / "book").rglob(f"{book_id}.db") if (db_dir / "book").exists() else []:
        return p
    for p in db_dir.rglob(f"{book_id}.db"):
        return p
    return None


def tables(con):
    return [r[0] for r in con.execute("select name from sqlite_master where type='table'")]


def rows(con, table):
    cur = con.execute(f'select * from "{table}"')
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur]


def java(mode, out_dir, ids, indexes):
    cp = os.pathsep.join([str(HERE / "lib" / "*"), str(HERE)])
    cmd = ["java", "-cp", cp, "Extract", mode, str(out_dir), ",".join(map(str, ids))] + [str(i) for i in indexes]
    print("» " + " ".join(cmd[:6]) + " …", file=sys.stderr)
    subprocess.run(cmd, check=True)


def pick(d, names):
    for n in names:
        if n in d and d[n] not in (None, ""):
            return d[n]
    return None


def split_id(v):
    s = str(v)
    for sep in "-_:":
        if sep in s:
            a, b = s.split(sep, 1)
            return a, b
    return None, s


def inspect(db_dir: Path):
    print("db dir:", db_dir)
    con = sqlite3.connect(f"file:{db_dir/'master.db'}?mode=ro", uri=True)
    for t in tables(con):
        cols = [c[1] for c in con.execute(f'pragma table_info("{t}")')]
        print(f"master.db {t}: {cols}")
    for b in BOOKS[:2]:
        p = find_book_db(db_dir, b["id"])
        print(f"book {b['id']} db:", p)
        if p:
            bc = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
            for t in tables(bc):
                cols = [c[1] for c in bc.execute(f'pragma table_info("{t}")')]
                first = bc.execute(f'select * from "{t}" limit 1').fetchone()
                print(f"   {t}: {cols}\n      first: {str(first)[:200]}")
    idx = find_indexes(db_dir)
    print("lucene indexes:", [str(i) for i in idx])
    with tempfile.TemporaryDirectory() as tmp:
        java("inspect", tmp, [b["id"] for b in BOOKS], idx)


def meta(db_dir: Path, book_id: int):
    con = sqlite3.connect(f"file:{db_dir/'master.db'}?mode=ro", uri=True)
    try:
        r = con.execute("select * from book where book_id=?", (book_id,))
        cols = [d[0] for d in r.description]
        row = r.fetchone()
        return dict(zip(cols, row)) if row else {}
    except sqlite3.Error:
        return {}


def extract(db_dir: Path, out: Path, only):
    out.mkdir(parents=True, exist_ok=True)
    books = [b for b in BOOKS if not only or b["id"] in only]
    ids = [b["id"] for b in books]
    with tempfile.TemporaryDirectory() as tmp:
        java("dump", tmp, ids, find_indexes(db_dir))
        lucene = {}  # index name -> book -> [docs]
        for d in Path(tmp).iterdir():
            for f in d.glob("*.jsonl"):
                lucene.setdefault(d.name, {})[int(f.stem)] = [
                    json.loads(l) for l in f.read_text(encoding="utf-8").splitlines() if l]
    manifest = []
    for b in books:
        bid = b["id"]
        p = find_book_db(db_dir, bid)
        pages_meta, titles_meta = {}, {}
        if p:
            bc = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
            ts = tables(bc)
            if "page" in ts:
                for r in rows(bc, "page"):
                    pages_meta[int(r["id"])] = r
            if "title" in ts:
                for r in rows(bc, "title"):
                    titles_meta[int(r["id"])] = r
        # نصوص الصفحات: من فهرس Lucene «page»، وإلا من عمود نصي في قاعدة الكتاب
        texts = {}
        for idx_name, per_book in lucene.items():
            if "page" not in idx_name.lower():
                continue
            for doc in per_book.get(bid, []):
                _, pid = split_id(doc.get("id", ""))
                if pid is None or not str(pid).isdigit():
                    continue
                body = pick(doc, BODY_FIELDS)
                if body is not None:
                    texts[int(pid)] = body
        if not texts:
            for pid, r in pages_meta.items():
                body = pick(r, BODY_FIELDS)
                if body is not None:
                    texts[pid] = body
        title_text = {}
        for idx_name, per_book in lucene.items():
            if "title" not in idx_name.lower():
                continue
            for doc in per_book.get(bid, []):
                _, tid = split_id(doc.get("id", ""))
                t = pick(doc, BODY_FIELDS + ("title", "name"))
                if tid and str(tid).isdigit() and t is not None:
                    title_text[int(tid)] = t
        pages = []
        for pid in sorted(set(texts) | set(pages_meta)):
            m = pages_meta.get(pid, {})
            if pid not in texts:
                continue
            if "pages" in b and not (b["pages"][0] <= pid <= b["pages"][1]):
                continue  # نطاق محدد من الكتاب فقط (مثل مقدمة المصنف)
            pages.append({"id": pid, "part": m.get("part"), "page": m.get("page"), "body": texts[pid]})
        titles = []
        if "pages" in b:
            titles_meta, title_text = {}, {}
        for tid in sorted(set(titles_meta) | set(title_text)):
            m = titles_meta.get(tid, {})
            titles.append({"id": tid, "page": m.get("page"), "parent": m.get("parent"),
                           "text": title_text.get(tid, pick(m, ("title", "name", "text", "body")))})
        mm = meta(db_dir, bid)
        rec = {"book_id": bid, "key": b["key"], "name": mm.get("book_name") or b["name"],
               "author": b["author"], "pages": pages, "titles": titles}
        data = json.dumps(rec, ensure_ascii=False, separators=(",", ":"))
        (out / f"{bid}.json").write_text(data, encoding="utf-8")
        sha = hashlib.sha256(data.encode()).hexdigest()
        manifest.append({"book_id": bid, "name": rec["name"], "pages": len(pages),
                         "titles": len(titles), "sha256": sha})
        print(f"✓ {bid} {rec['name']}: {len(pages)} صفحة، {len(titles)} عنوانًا", file=sys.stderr)
        if not pages:
            print(f"  ⚠ لم أجد نصًّا لهذا الكتاب — شغّل --inspect وأرسل الناتج", file=sys.stderr)
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="/srv/shamela")
    ap.add_argument("--out", default=str(HERE.parent / "raw"))
    ap.add_argument("--inspect", action="store_true")
    ap.add_argument("--only", type=int, nargs="*", help="أرقام كتب بعينها")
    a = ap.parse_args()
    db_dir = find_db_dir(Path(a.root))
    if a.inspect:
        inspect(db_dir)
    else:
        extract(db_dir, Path(a.out), set(a.only or []))


if __name__ == "__main__":
    main()
