// يطبع أسئلة الاختيار التي يكون فيها الجواب الصحيح أطول الخيارات (لإعادة موازنتها)
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
const files = ["js/icons.js", "js/config.js", "js/data.js", ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((i) => `js/more-${i}.js`), "js/cite-mkh.js", "js/audit.js", "js/cite-wadii.js", "js/verified.js"];
if (existsSync("js/balance.js")) files.push("js/balance.js");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(files.map((f) => readFileSync(f, "utf8")).join("\n") + ";this.S=STAGES", ctx);
const [from, to] = (process.argv[2] || "30-1").split("-").map(Number);
let n = 0;
for (const s of ctx.S) {
  if (s.juz > from || s.juz < to) continue;
  s.questions.forEach((q, i) => {
    if (q.t !== "mcq" || q.o.length < 3) return;
    const L = q.o.map((x) => x.length), mx = Math.max(...L.slice(1));
    if (L[0] > mx * 1.1) { n++; console.log(`${s.juz}:${i}\t${q.q}\t${q.o.join(" || ")}`); }
  });
}
console.error("count", n);
