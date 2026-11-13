// إحصاء: في كم سؤالًا يكون الجواب الصحيح هو الأطول؟ (المتوقع عشوائيًا نحو ٢٥٪)
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
const files = ["js/icons.js", "js/config.js", "js/data.js", ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `js/more-${i}.js`), "js/verified.js"];
if (existsSync("js/balance.js")) files.push("js/balance.js");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(files.map((f) => readFileSync(f, "utf8")).join("\n") + ";this.S=STAGES", ctx);
const [from, to] = (process.argv[2] || "30-1").split("-").map(Number);
let n = 0, longest = 0, clear = 0, shortest = 0;
for (const s of ctx.S) {
  if (s.juz > from || s.juz < to) continue;
  for (const q of s.questions) {
    if (q.t !== "mcq" || q.o.length < 3) continue;
    n++;
    const L = q.o.map((x) => x.length), mx = Math.max(...L.slice(1)), mn = Math.min(...L.slice(1));
    if (L[0] > mx) longest++;
    if (L[0] > mx * 1.1) clear++;
    if (L[0] < mn) shortest++;
  }
}
const pct = (x) => Math.round((100 * x) / n) + "٪";
console.log(`الأجزاء ${from}-${to}: ${n} سؤال اختيار — الصحيح هو الأطول: ${longest} (${pct(longest)}) — أطول بوضوح: ${clear} (${pct(clear)}) — الأقصر: ${shortest} (${pct(shortest)})`);
