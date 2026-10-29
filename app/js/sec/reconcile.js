/* بناء سجل البلاغات التاريخي من لقطات تقرير الكهرباء.
   كل لقطة = قائمة البلاغات المفتوحة وقت تحديث التقرير.
   البلاغ اللي يختفي من لقطة لاحقة = انقفل بين آخر لقطة ظهر فيها وأول لقطة بعدها.
   دالة نقية (بدون متصفح) عشان تنختبر. */
import { MIN } from '../core/util.js';

export const DETAIL_FIELDS = ['center', 'tech', 'sup', 'prio', 'sub', 'acc', 'tr', 'trPre', 'trNum', 'src', 'kind', 'nTech', 'repDay', 'repYear'];

/* snapshots: [{id, at, rows:[parsed ticket]}]  →  Map(task → derived ticket) */
export function reconcile(snapshots) {
  const snaps = [...snapshots].sort((a, b) => a.at - b.at);
  const times = snaps.map(s => s.at);
  const out = new Map();
  snaps.forEach(s => s.rows.forEach(r => {
    let t = out.get(r.task);
    if (!t) { t = { task: r.task, firstSeen: s.at, seen: 0 }; out.set(r.task, t); }
    t.seen++;
    t.lastSeen = s.at; t.lastMins = r.mins;
    DETAIL_FIELDS.forEach(f => { if (r[f] !== undefined && r[f] !== '') t[f] = r[f]; });
    /* بداية البلاغ: وقت التقرير ناقص مدته. نأخذ الأقدم لأن المدة أحيانًا تتصفر عند إعادة التوجيه */
    const st = s.at - r.mins * MIN;
    t.start = t.start ? Math.min(t.start, st) : st;
  }));
  out.forEach(t => {
    const next = times.find(x => x > t.lastSeen);
    if (next === undefined) { t.closed = false; t.closedAfter = t.closedBefore = t.end = null; return; }
    t.closed = true;
    t.closedAfter = t.lastSeen; t.closedBefore = next;
    t.end = Math.round((t.lastSeen + next) / 2);
    t.durMin = Math.round((t.lastSeen - t.start) / MIN);
    t.durMax = Math.round((next - t.start) / MIN);
    t.dur = Math.round((t.end - t.start) / MIN);
    t.uncertain = (next - t.lastSeen) > 2 * 60 * MIN;
  });
  return out;
}

/* وقت التقرير من حقل Last Update */
export function updatedAt(u) { return u ? new Date(u.y, u.m - 1, u.d, u.h, u.mi).getTime() : null; }
