"""يبني نسخة الملف الواحد من app/ → dist/ops.html (ترفع على GitHub بدون مجلدات).
تشغيل: python3 tools/build-single.py <مسار esbuild>"""
import base64, json, subprocess, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
app = root / 'app'
js = subprocess.run([sys.argv[1], str(app / 'js/main.js'), '--bundle', '--format=iife', '--charset=utf8', '--target=es2020'],
                    check=True, capture_output=True, text=True).stdout
html = (app / 'index.html').read_text(encoding='utf-8')
css = (app / 'css/app.css').read_text(encoding='utf-8')
meta = (app / 'data/meta.json').read_text(encoding='utf-8')
meters = base64.b64encode((app / 'data/meters.bin').read_bytes()).decode()
html = html.replace('<link rel="stylesheet" href="css/app.css">', '<style>\n' + css + '\n</style>')
data = '<script id="meta-data" type="application/json">' + meta + '</script>\n<script id="meters-data" type="text/plain">' + meters + '</script>\n'
js = js.replace('</script', '<\\/script')
html = html.replace('<script type="module" src="js/main.js"></script>', data + '<script>\n' + js + '\n</script>')
out = root / 'dist'; out.mkdir(exist_ok=True)
(out / 'ops.html').write_text(html, encoding='utf-8')
print(out / 'ops.html', round(len(html.encode()) / 1e6, 2), 'MB')
