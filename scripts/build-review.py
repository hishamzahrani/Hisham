# يبني review/مراجعة-الأسئلة.xlsx من review/questions.json
import json
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule

rows = json.load(open("review/questions.json", encoding="utf-8"))
wb = Workbook()

# ---------- ورقة التعليمات ----------
info = wb.active
info.title = "طريقة المراجعة"
info.sheet_view.rightToLeft = True
lines = [
    ("مراجعة أسئلة «مسابقات قرآنية»", True),
    ("", False),
    ("١. اقرأ كل سؤال مع إجابته الصحيحة والشرح والمصدر في ورقة «الأسئلة».", False),
    ("٢. اختر الحالة من القائمة في عمود «الحالة»: صحيح / يحتاج تعديل / خطأ / محذوف.", False),
    ("٣. اكتب في «ملاحظات المراجع» التصحيح المقترح ومصدره إن وُجد.", False),
    ("٤. يمكن التصفية بالجزء أو المحور أو الحالة من أسهم رأس الجدول.", False),
    ("٥. بعد المراجعة أرسل الملف ليُطبَّق التصحيح في التطبيق؛ عمود «المعرّف» يربط كل صف بسؤاله.", False),
    ("", False),
    ("عمود «موثّق ✔»: تحقّقنا من مصدره بالبحث في نصوص المكتبة الشاملة (الكتاب والجزء والصفحة).", False),
    ("المصدر بعنوان «للتوسع يُنظر»: مرجع عام للمحور لم يُطابَق نصًّا بعد، وهو أولى بالمراجعة.", False),
    ("ترتيب الصفوف: الجزء ٣٠ ← ١، ثم الدرس، ثم المحور، وهو ترتيب ظهورها في التطبيق.", False),
    ("", False),
    (f"عدد الأسئلة: {len(rows)} — الموثّق منها: {sum(1 for r in rows if r['verified'])}", True),
]
for i, (t, b) in enumerate(lines, 1):
    c = info.cell(row=i, column=1, value=t)
    c.font = Font(name="Arial", size=16 if i == 1 else 12, bold=b)
    c.alignment = Alignment(horizontal="right", wrap_text=True)
info.column_dimensions["A"].width = 110

# ---------- ورقة الأسئلة ----------
ws = wb.create_sheet("الأسئلة")
ws.sheet_view.rightToLeft = True
cols = [
    ("المعرّف", "id", 8), ("الجزء", "juz", 6), ("الدرس", "lesson", 6), ("المحور", "cat", 16), ("النوع", "type", 8),
    ("الموضع", "ref", 14), ("نص الآية", "ayah", 34), ("السؤال", "question", 38),
    ("الإجابة الصحيحة", "answer", 34), ("الخيارات الأخرى", "others", 30), ("الشرح", "explain", 46),
    ("المصدر", "source", 30), ("موثّق", "verified", 7), ("الحالة", None, 13), ("ملاحظات المراجع", None, 40),
]
head_fill = PatternFill("solid", fgColor="58CC02")
thin = Side(style="thin", color="D0D0D0")
for ci, (title, _, w) in enumerate(cols, 1):
    c = ws.cell(row=1, column=ci, value=title)
    c.font = Font(name="Arial", bold=True, color="FFFFFF", size=12)
    c.fill = head_fill
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.column_dimensions[c.column_letter].width = w
ws.row_dimensions[1].height = 30

ayah_font = Font(name="Traditional Arabic", size=14)
body_font = Font(name="Arial", size=11)
for ri, r in enumerate(rows, 2):
    for ci, (_, key, _) in enumerate(cols, 1):
        val = r[key] if key else ("لم يُراجع" if ci == 14 else "")
        c = ws.cell(row=ri, column=ci, value=val)
        c.font = ayah_font if key == "ayah" else body_font
        c.alignment = Alignment(horizontal="right", vertical="top", wrap_text=True)
        c.border = Border(bottom=thin)
    ws.cell(row=ri, column=9).font = Font(name="Arial", size=11, bold=True, color="2E7D0A")

last = len(rows) + 1
dv = DataValidation(type="list", formula1='"لم يُراجع,صحيح,يحتاج تعديل,خطأ,محذوف"', allow_blank=False)
ws.add_data_validation(dv)
dv.add(f"N2:N{last}")
# تلوين الصف بحسب الحالة
for status, color in [("صحيح", "E6F7D9"), ("يحتاج تعديل", "FFF4CC"), ("خطأ", "FFDFE0"), ("محذوف", "EEEEEE")]:
    ws.conditional_formatting.add(f"A2:O{last}", FormulaRule(formula=[f'$N2="{status}"'], fill=PatternFill("solid", fgColor=color)))
ws.freeze_panes = "B2"
ws.auto_filter.ref = f"A1:O{last}"

# ---------- ورقة الملخص ----------
sm = wb.create_sheet("ملخص")
sm.sheet_view.rightToLeft = True
sm.append(["الجزء", "عدد الأسئلة", "موثّق", "صحيح", "يحتاج تعديل", "خطأ", "لم يُراجع"])
for c in sm[1]:
    c.font = Font(bold=True, color="FFFFFF"); c.fill = head_fill; c.alignment = Alignment(horizontal="center")
for j in range(30, 0, -1):
    n = sum(1 for r in rows if r["juz"] == j)
    v = sum(1 for r in rows if r["juz"] == j and r["verified"])
    rr = sm.max_row + 1
    sm.append([j, n, v] + [f'=COUNTIFS(الأسئلة!$B:$B,$A{rr},الأسئلة!$N:$N,"{s}")' for s in ["صحيح", "يحتاج تعديل", "خطأ", "لم يُراجع"]])
for col in "ABCDEFG":
    sm.column_dimensions[col].width = 14

wb.save("review/مراجعة-الأسئلة.xlsx")
print("✓ review/مراجعة-الأسئلة.xlsx")
