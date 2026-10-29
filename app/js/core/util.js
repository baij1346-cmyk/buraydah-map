/* أدوات عامة صغيرة */
export const now = () => Date.now();
export const MIN = 60000, HOUR = 3600000, DAY = 86400000;
export const mins = ms => Math.floor(ms / MIN);
export const fmtDur = m => { m = Math.max(0, Math.round(m)); return m < 60 ? m + ' د' : Math.floor(m / 60) + ' س ' + (m % 60) + ' د'; };
export const fmtTime = t => new Date(t).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
export const fmtDate = t => new Date(t).toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'short' });
export const fmtDateTime = t => fmtDate(t) + ' ' + fmtTime(t);
export const isoDay = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const arDigits = s => String(s ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
export const normAr = s => String(s || '').replace(/\s+/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
export const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
export const sum = a => a.reduce((x, y) => x + y, 0);
export const avg = a => a.length ? sum(a) / a.length : 0;
export const groupBy = (arr, fn) => { const m = new Map(); arr.forEach(x => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return m; };

export function csv(rows) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return '﻿' + rows.map(r => Array.isArray(r) ? r.map(q).join(',') : '').join('\r\n');
}
export function download(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
let tt;
export function toast(m) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2800);
}
export function copy(text) {
  return (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('تم النسخ'), () => toast(text));
}
/* زر يحتاج ضغطتين للتأكيد */
export function armed(btn, label, fn) {
  let at = 0;
  btn.onclick = () => {
    if (now() - at < 4000) { at = 0; btn.textContent = label; fn(); return; }
    at = now(); btn.textContent = 'اضغط مرة ثانية للتأكيد';
    setTimeout(() => { if (at) btn.textContent = label; }, 4000);
  };
}
export const h = (strings, ...vals) => strings.reduce((a, s, i) => a + s + (i < vals.length ? vals[i] : ''), '');
