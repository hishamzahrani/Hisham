# يبني review/الأسئلة-حسب-المحور.xlsx من review/questions.json:
# ورقة لكل محور (المفردات أولًا)، فيها السؤال وإجابته وخياراته والشرح والكتاب المرجوع إليه.
import json, re
from collections import OrderedDict
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side

rows = json.load(open("review/questions.json", encoding="utf-8"))

# ترتيب المحاور: المفردات أولًا ثم البقية بترتيب التطبيق
order = []
for r in rows:
    if r["cat"] not in order:
        order.append(r["cat"])
mf = [c for c in order if "مفردات" in c or "غريب" in c]
order = mf + [c for c in order if c not in mf]

def split_source(s):
    """يفصل اسم الكتاب عن موضع الإحالة (الصفحة/الجزء/الحكم)."""
    s = s or ""
    label = ""
    if ": " in s and s.split(": ", 1)[0] in ("المصدر", "للتوسع يُنظر", "المرجع"):
        label, s = s.split(": ", 1)
    m = re.search(r"\s*(،\s*ص\s|\s[٠-٩0-9]+\s*/\s*|\s—\s)", s)
    book, where = (s[:m.start()].strip(), s[m.start():].strip(" ،—")) if m else (s.strip(), "")
    if label == "للتوسع يُنظر":
        where = ("مرجع عام للمحور" + (" — " + where if where else "")).strip()
    return book, where

GREEN, GOLD = "1F7A5C", "C9A227"
head_fill = PatternFill("solid", fgColor=GREEN)
thin = Side(style="thin", color="D9D4C7")
body = Font(name="Arial", size=11)
ayah_font = Font(name="Traditional Arabic", size=14)
cols = [("الجزء", 6), ("النوع", 9), ("الموضع", 14), ("نص الآية", 34), ("السؤال", 40),
        ("الإجابة الصحيحة", 30), ("الخيارات الأخرى", 30), ("الشرح", 46),
        ("الكتاب المرجوع إليه", 34), ("الصفحة / التفصيل", 26)]

wb = Workbook()
idx = wb.active
idx.title = "الفهرس"
idx.sheet_view.rightToLeft = True
idx.append(["المحور", "عدد الأسئلة", "بمرجع محدد (كتاب وصفحة)", "بمرجع عام"])
for c in idx[1]:
    c.font = Font(name="Arial", bold=True, color="FFFFFF", size=12); c.fill = head_fill
    c.alignment = Alignment(horizontal="center")

for cat in order:
    items = [r for r in rows if r["cat"] == cat]
    items.sort(key=lambda r: (-r["juz"], r["id"]))
    ws = wb.create_sheet(cat[:31])
    ws.sheet_view.rightToLeft = True
    for ci, (t, w) in enumerate(cols, 1):
        c = ws.cell(row=1, column=ci, value=t)
        c.font = Font(name="Arial", bold=True, color="FFFFFF", size=12)
        c.fill = head_fill
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[c.column_letter].width = w
    ws.row_dimensions[1].height = 28
    specific = 0
    for ri, r in enumerate(items, 2):
        book, where = split_source(r["source"])
        if where and "مرجع عام" not in where:
            specific += 1
        vals = [r["juz"], r["type"], r["ref"], r["ayah"], r["question"], r["answer"], r["others"],
                r["explain"], book, where]
        vals = ["" if v is None or v == "None" else v for v in vals]
        for ci, v in enumerate(vals, 1):
            c = ws.cell(row=ri, column=ci, value=v)
            c.font = ayah_font if ci == 4 else body
            c.alignment = Alignment(horizontal="right", vertical="top", wrap_text=True)
            c.border = Border(bottom=thin)
        ws.cell(row=ri, column=6).font = Font(name="Arial", size=11, bold=True, color=GREEN)
    ws.freeze_panes = "F2"
    ws.auto_filter.ref = f"A1:J{len(items) + 1}"
    idx.append([cat, len(items), specific, len(items) - specific])

for row in idx.iter_rows(min_row=2):
    for c in row:
        c.font = body; c.alignment = Alignment(horizontal="right")
idx.append(["المجموع", len(rows), f"=SUM(C2:C{idx.max_row})", f"=SUM(D2:D{idx.max_row})"])
for c in idx[idx.max_row]:
    c.font = Font(name="Arial", bold=True, color=GREEN)
for col, w in zip("ABCD", (20, 12, 24, 14)):
    idx.column_dimensions[col].width = w

out = "review/الأسئلة-حسب-المحور.xlsx"
wb.save(out)
print("✓", out, "—", len(order), "محورًا")
