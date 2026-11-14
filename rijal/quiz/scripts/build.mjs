// يجمع ملفات التطبيق في مجلد www لتغليفها بـ Capacitor
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";

const out = "www";
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const p of ["index.html", "privacy.html", "manifest.webmanifest", "css", "js", "icons"]) {
  cpSync(p, `${out}/${p}`, { recursive: true });
}
await build({
  entryPoints: ["src/native-payments.js"],
  bundle: true, minify: true, format: "iife", target: "es2019",
  outfile: `${out}/js/native-payments.js`,
});
// تحميل جسر الشراء قبل app.js، ولا حاجة لـ Service Worker داخل التطبيق
let html = readFileSync(`${out}/index.html`, "utf8");
html = html.replace('<script src="js/app.js"></script>', '<script src="js/native-payments.js"></script>\n  <script src="js/app.js"></script>');
writeFileSync(`${out}/index.html`, html);
console.log("✓ www جاهز");
