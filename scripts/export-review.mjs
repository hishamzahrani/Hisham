// يصدّر كل الأسئلة إلى review/questions.json (ثم يبني build-review.py ملف Excel للمراجعة)
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const files = ["js/icons.js", "js/config.js", "js/data.js", ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `js/more-${i}.js`), "js/verified.js", "js/balance.js"];
const code = files.map((f) => readFileSync(f, "utf8")).join("\n") +
  "\n;this.__out = { STAGES, CATEGORIES, sourceOf };";
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const { STAGES, CATEGORIES, sourceOf } = ctx.__out;
const CAT_ORDER = Object.keys(CATEGORIES);
const LESSONS = 6;

const rows = [];
for (const st of STAGES) {
  const items = st.questions.map((q, i) => ({ q, i }));
  // نفس توزيع الدروس في التطبيق
  const ordered = CAT_ORDER.flatMap((c) => items.filter((it) => it.q.c === c));
  const lessonOf = {};
  ordered.forEach((it, n) => (lessonOf[it.i] = (n % LESSONS) + 1));
  for (const it of ordered) {
    const q = it.q;
    let answer, others;
    if (q.t === "match") { answer = q.p.map(([w, m]) => `${w} ← ${m}`).join("\n"); others = ""; }
    else if (q.t === "tf") { answer = q.v ? "صحيح" : "خطأ"; others = q.v ? "خطأ" : "صحيح"; }
    else { answer = q.o[0]; others = q.o.slice(1).join("\n"); }
    const src = sourceOf(q);
    rows.push({
      id: `${st.juz}:${it.i}`, juz: st.juz, lesson: lessonOf[it.i], cat: CATEGORIES[q.c].name,
      type: q.t === "match" ? "مطابقة" : q.t === "tf" ? "صح/خطأ" : "اختيار",
      ref: q.r || "", ayah: q.a || "", question: q.q, answer, others, explain: q.e || "",
      source: `${src.label}: ${src.text}`, verified: q.verified ? "✔" : "",
    });
  }
}
writeFileSync("review/questions.json", JSON.stringify(rows, null, 1));
console.log(`✓ ${rows.length} سؤالًا`);
