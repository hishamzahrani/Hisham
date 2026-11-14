#!/usr/bin/env python3
"""مصدر بديل: نسخ مشروع OpenITI من كتب المكتبة الشاملة (ملفات *.ShamelaNNNNNNN-ara*).

هذه الملفات نصُّ الشاملة نفسه مع علامات تنسيق أضافها المشروع؛ يزيلها هذا السكربت فقط:
  • «PageV01P077» علامة نهاية الصفحة 77 من الجزء 1 → حدود الصفحات.
  • «# » بداية فقرة، و«~~» تتمة سطر طويل قُطع → يوصل بمسافة.
  • «### | عنوان» عناوين الفصول → سطر في المتن وعنوان في الفهرس.
  • «### | 12- » رقم الترجمة جعله المشروع عنوانًا → يعود في أول سطر الترجمة «١٢- …».
  • «ms001» علامات أقسام للمشروع → تُحذف.
  • الأرقام اللاتينية التي حوّلها المشروع → تعود هندية كما في الشاملة.
لا يُمَسّ غير ذلك. ويُتحقَّق بعدُ من مطابقة النص للشاملة بمقارنة عيّنات (انظر README).

الاستعمال:  python3 openiti.py <ملف OpenITI> <رقم الكتاب في الشاملة> <المفتاح> --out ../raw
"""
import argparse, json, re, sys
from pathlib import Path

PAGE = re.compile(r"PageV(\d+)P(\d+)")
MS = re.compile(r"\s*\bms\d+\b\s*")
DIG = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
ENTRY = "\ue000"  # علامة بداية ترجمة؛ يحذفها build.py


def convert(text: str):
    if "#META#Header#End#" in text:
        text = text.split("#META#Header#End#", 1)[1]
    pages, titles = [], []
    lines, cur, pending_num = [], None, None
    vols = set()

    def flush_line():
        nonlocal cur
        if cur is not None:
            lines.append(cur.strip())
            cur = None

    def flush_page(v, p):
        flush_line()
        body = "\n".join(l for l in lines if l)
        lines.clear()
        if body:
            known = not (int(v) == 0 and int(p) == 0)
            pages.append({"id": len(pages) + 1, "part": str(int(v)) if known else None,
                          "page": str(int(p)) if known else None, "body": body.translate(DIG)})
            if known:
                vols.add(v)

    for raw in text.split("\n"):
        raw = raw.rstrip()
        if not raw:
            continue
        # علامات الصفحات قد تأتي في سطر وحدها أو في وسط السطر
        parts = PAGE.split(raw)
        segs = [parts[0]]
        marks = []
        for i in range(1, len(parts), 3):
            marks.append((parts[i], parts[i + 1]))
            segs.append(parts[i + 2])
        for si, seg in enumerate(segs):
            seg = MS.sub(" ", seg)
            s = seg.strip()
            if s.startswith("###"):
                marks_ = re.match(r"^#+\s*([|$]*)\s*", s).group(1)
                h = s[len(re.match(r"^#+\s*[|$]*\s*", s).group(0)):].strip()
                flush_line()
                if re.fullmatch(r"\d+\s*[-ـ]\s*", h + " ") or re.fullmatch(r"\d+\s*-", h):
                    pending_num = re.match(r"\d+", h).group(0)
                elif marks_ == "$" or (marks_.startswith("|") and re.match(r"\d+\s*-\s*\S", h)):
                    cur = ENTRY + h  # بداية ترجمة (علامة داخلية لا تُعرض)
                elif marks_.startswith("$"):
                    cur = h          # عنوان فرعي داخل الترجمة: سطر عادي
                elif h:
                    level = s.count("|")
                    titles.append({"id": len(titles) + 1, "page": len(pages) + 1, "parent": level - 1, "text": h.translate(DIG)})
                    lines.append(h)
            elif s.startswith("#"):
                flush_line()
                cur = re.sub(r"^#\s?", "", s)
                if pending_num:
                    cur = f"{pending_num}- {cur}"
                    pending_num = None
            elif s.startswith("~~"):
                t = s[2:].strip()
                cur = t if cur is None else (cur + " " + t if t else cur)
            elif s:
                cur = s if cur is None else cur + " " + s
            if si < len(marks):
                v, p = marks[si]
                flush_page(v, p)  # V00P000: نهاية صفحة رقمها غير مذكور في ملف المشروع
    flush_page("99", "999") if lines or cur else None
    if len(vols) <= 1:
        for p in pages:
            p["part"] = None
    for p in pages:
        p["body"] = re.sub(r"[ \t]{2,}", " ", p["body"])
    return pages, titles


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("book_id", type=int)
    ap.add_argument("key")
    ap.add_argument("--name", default="")
    ap.add_argument("--author", default="")
    ap.add_argument("--page-offset", type=int, default=None,
                    help="للصفحات التي لا رقم لها في ملف المشروع: رقم المطبوع = ترتيب الصفحة في الشاملة + هذا العدد (تحقّق منه بالشاملة)")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "raw"))
    a = ap.parse_args()
    src = Path(a.file)
    pages, titles = convert(src.read_text(encoding="utf-8"))
    if a.page_offset is not None:
        for p in pages:
            if p["page"] is None:
                p["page"] = str(p["id"] + a.page_offset)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    rec = {"book_id": a.book_id, "key": a.key, "name": a.name, "author": a.author,
           "source": f"OpenITI: {src.name}", "pages": pages, "titles": titles}
    (out / f"{a.book_id}.json").write_text(json.dumps(rec, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"✓ {a.book_id} {a.name}: {len(pages)} صفحة، {len(titles)} عنوانًا", file=sys.stderr)


if __name__ == "__main__":
    main()
