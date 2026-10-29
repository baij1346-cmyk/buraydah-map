/* الإحصائيات: لكل مقاول / مركز / مشرف / فني / محول — العدد، متوسط المدة، نسبة الإغلاق خلال 60/90/120/180 د */
import { DAY, pct, avg, isoDay } from '../core/util.js';

export const DIMS = [
  { k: 'co', t: 'المقاول', f: x => x.co || (x.src === 'sec' && !x.tech ? 'بدون فني' : 'غير محدد') },
  { k: 'center', t: 'المركز', f: x => x.center || '—' },
  { k: 'sup', t: 'المشرف', f: x => x.sup || '—' },
  { k: 'tech', t: 'الفني', f: x => x.tech || 'بدون فني' },
  { k: 'tr', t: 'المحول', f: x => x.tr || 'بدون رقم' }];
export const LIMITS = [60, 90, 120, 180];

export function table(faults, dimKey) {
  const dim = DIMS.find(d => d.k === dimKey) || DIMS[0], m = new Map();
  faults.forEach(f => { const k = dim.f(f); if (!m.has(k)) m.set(k, []); m.get(k).push(f); });
  return [...m.entries()].map(([k, fs]) => row(k, fs)).sort((a, b) => b.n - a.n);
}
export function row(k, fs) {
  const closed = fs.filter(f => !f.open), d = closed.map(f => f.dur);
  return {
    k, n: fs.length, open: fs.length - closed.length, closed: closed.length, avg: Math.round(avg(d)),
    within: LIMITS.map(L => pct(d.filter(x => x <= L).length, closed.length)),
    uncertain: closed.filter(f => f.uncertain).length, noCause: closed.filter(f => !f.cause).length
  };
}
/* السلسلة اليومية: عدد البلاغات الجديدة في كل يوم */
export function daily(faults, from, to) {
  const out = []; for (let t = from; t < to; t += DAY) out.push({ d: isoDay(t), n: 0, rain: false });
  const idx = new Map(out.map((x, i) => [x.d, i]));
  faults.forEach(f => { const i = idx.get(isoDay(f.start)); if (i !== undefined) out[i].n++; });
  return out;
}
export function weekly(daySeries) {
  const out = []; for (let i = 0; i < daySeries.length; i += 7) { const w = daySeries.slice(i, i + 7); out.push({ d: w[0].d, n: w.reduce((a, x) => a + x.n, 0) }); }
  return out;
}
