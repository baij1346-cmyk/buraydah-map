/* قراءة ملف PDF بـ pdf.js (يُحمَّل من الإنترنت أول مرة فقط) */
import { secGroupRows, secParseAll } from './parser.js';
const V = '3.11.174', CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + V + '/';
function loadScript(src) {
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('load')); document.head.appendChild(s); });
}
export async function readReport(file) {
  if (!window.pdfjsLib) {
    await loadScript(CDN + 'pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN + 'pdf.worker.min.js';
  }
  const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) { const pg = await doc.getPage(p); pages.push(secGroupRows((await pg.getTextContent()).items)); }
  return secParseAll(pages); /* مصفوفة تقارير (الملف المجمّع فيه أكثر من تقرير) */
}
