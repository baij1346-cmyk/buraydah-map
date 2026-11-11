/* قراءة ملف PDF بـ pdf.js (يُحمَّل من الإنترنت أول مرة فقط) */
import { secGroupRows, secParseAll } from './parser.js';
import { isLVReport, parseLV } from './lv.js';
const V = '3.11.174', CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + V + '/';
function loadScript(src) {
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('load')); document.head.appendChild(s); });
}
async function openPdf(file) {
  if (!window.pdfjsLib) {
    await loadScript(CDN + 'pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN + 'pdf.worker.min.js';
  }
  return window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}
/* يرجع {type:'sec', reports} لتقرير توجيه البلاغات، أو {type:'lv', rows} لتقرير ربط LV بشبكة MV */
export async function readAny(file) {
  const doc = await openPdf(file);
  const p1 = await (await doc.getPage(1)).getTextContent();
  if (isLVReport(p1.items.map(i => i.str).join(' '))) {
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.getPage(p);
      const items = (await pg.getTextContent()).items.map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5] }));
      const links = (await pg.getAnnotations()).filter(a => a.url && /maps\?q=/.test(a.url)).map(a => {
        const m = decodeURIComponent(a.url).match(/q=(-?[\d.]+),\s*(-?[\d.]+)/);
        return { x: (a.rect[0] + a.rect[2]) / 2, y: (a.rect[1] + a.rect[3]) / 2, lat: m ? +m[1] : NaN, lng: m ? +m[2] : NaN };
      });
      pages.push({ items, links });
    }
    return { type: 'lv', rows: parseLV(pages) };
  }
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) { const pg = await doc.getPage(p); pages.push(secGroupRows((await pg.getTextContent()).items)); }
  return { type: 'sec', reports: secParseAll(pages) }; /* الملف المجمّع فيه أكثر من تقرير */
}
export async function readReport(file) { const r = await readAny(file); return r.type === 'sec' ? r.reports : []; }
