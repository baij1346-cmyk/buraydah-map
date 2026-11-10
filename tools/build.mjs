/* يبني المنصة لملف واحد برقم إصدار (عشان المتصفح ما يخلط ملفات قديمة وجديدة):
   app/app.js + app/version.json، ويحدّث الروابط في app/index.html.
   تشغيل: node tools/build.mjs <مسار esbuild> */
import { execFileSync } from 'child_process';
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname, app = root + 'app/';
const V = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
execFileSync(process.argv[2], [app + 'js/main.js', '--bundle', '--format=esm', '--minify', '--charset=utf8', '--target=es2020', '--define:__VERSION__="' + V + '"', '--outfile=' + app + 'app.js'], { stdio: 'inherit' });
fs.writeFileSync(app + 'version.json', JSON.stringify({ v: V }));
let h = fs.readFileSync(app + 'index.html', 'utf8');
h = h.replace(/<script type="module" src="[^"]*"><\/script>/, '<script type="module" src="app.js?v=' + V + '"></script>')
     .replace(/href="css\/app\.css(\?v=\d+)?"/, 'href="css/app.css?v=' + V + '"');
fs.writeFileSync(app + 'index.html', h);
console.log('version', V);
