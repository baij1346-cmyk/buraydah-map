/* توحيد البلاغات (تقرير الكهرباء + اليدوية) في سجل واحد للتحليل */
import { S } from '../store/repo.js';
import { zoneOf, trKey, trLoc, parseTr, G } from '../core/geo.js';
import { normAr, isoDay, now, MIN } from '../core/util.js';

export function company(tech) {
  const n = normAr(tech); if (!n) return '';
  const hit = S.settings.co.find(([k]) => k && n.includes(normAr(k)));
  return hit ? hit[1] : 'غير محدد';
}
export const zoneCo = z => z >= 0 ? (S.settings.zones[z] && S.settings.zones[z].co) || ('مقاول ' + G.ZS[z].L) : '';
export const isRain = t => !!S.settings.rainDays[isoDay(t)];
export const isPeak = t => S.settings.rules.peakMonths.includes(new Date(t).getMonth() + 1);

/* بلاغ من تقرير الكهرباء */
export function fromTicket(t) {
  const key = trKey(t), p = trLoc(key, S.settings.tr, t.center);
  const z = p ? zoneOf(p.lat, p.lng) : -1;
  const live = t.closed ? t.dur : Math.round((now() - t.start) / MIN);
  return {
    src: 'sec', id: t.task, ref: t, start: t.start, end: t.closed ? t.end : null, open: !t.closed,
    dur: live, uncertain: !!t.uncertain, center: t.center || '', tech: t.tech || '', sup: t.sup || '',
    co: company(t.tech), zone: z, tr: key, lat: p ? p.lat : null, lng: p ? p.lng : null, approx: p ? p.auto : false,
    cause: t.cause || '', acc: t.acc || '', sub: t.sub || '', affected: 1, repDay: t.repDay || 0, repYear: t.repYear || 0,
    st: t.st || '', kind: t.kind || '', rain: isRain(t.start), peak: isPeak(t.start)
  };
}
/* بلاغ يدوي */
export function fromReport(r) {
  const tp = r.tr ? parseTr(r.tr) : null;
  const end = r.st === 'done' ? (r.ts && r.ts.done) || r.t : null;
  return {
    src: 'manual', id: r.id, ref: r, start: r.t, end, open: r.st !== 'done',
    dur: Math.round(((end || now()) - r.t) / MIN), uncertain: false, center: 'بريدة', tech: '', sup: '',
    co: zoneCo(r.z), zone: r.z, tr: tp ? tp.key : '', lat: r.lat, lng: r.lng, approx: false,
    cause: r.cause || '', acc: '', sub: r.num || '', affected: r.cust || 1, repDay: 0, repYear: 0,
    st: r.st, kind: r.type, rain: isRain(r.t), peak: isPeak(r.t)
  };
}
export function faults({ from = 0, to = Infinity, center = '' } = {}) {
  const a = [...S.tickets.values()].map(fromTicket).concat(S.reports.map(fromReport));
  return a.filter(f => f.start >= from && f.start < to && (!center || f.center === center));
}
export const openFaults = () => faults().filter(f => f.open);
