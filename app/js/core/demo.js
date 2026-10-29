/* بيانات تجريبية للتدريب والتجربة: لقطات تقرير وهمية على ١٢٠ يوم بمحولات حقيقية من 511 */
import { G } from './geo.js';
import { DAY, HOUR, MIN } from './util.js';

export function demoSnapshots(nowT = Date.now(), seed = 7) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pickN = a => a[Math.floor(rnd() * a.length)];
  const trs = G.SUBS.filter(x => /^\d{4,6}$/.test(String(x[0])) && x[1] > 26.25 && x[1] < 26.45 && x[2] > 43.85 && x[2] < 44.05).slice(0, 400).map(x => String(x[0]));
  const hot = trs.slice(0, 25);
  const techs = ['محمد - أعمال السندس', 'خالد الفاروق', 'سعد سماء الميدان', 'فهد مستورة', 'عبدالله كثم', 'ناصر الحمزي', 'سلمان الجناحي', 'تركي الشهراني', ''];
  const sups = ['م. أحمد', 'م. يوسف', 'م. عبدالعزيز'];
  const rainDays = new Set([12, 13, 40, 41, 42, 77, 100].map(d => new Date(nowT - d * DAY).toDateString()));
  const tickets = []; let id = 50000000;
  for (let d = 120; d >= 0; d--) {
    const day = new Date(nowT - d * DAY).setHours(0, 0, 0, 0), span = Math.min(DAY, nowT - day), rain = rainDays.has(new Date(day).toDateString());
    const n = Math.round((rain ? 30 : 8) * (0.6 + rnd() * 0.8));
    for (let k = 0; k < n; k++) {
      const t0 = day + rnd() * span, tr = rnd() < (rain ? 0.5 : 0.3) ? pickN(hot.slice(rain ? 0 : 10, rain ? 12 : 25)) : pickN(trs);
      tickets.push({ task: String(id++), start: t0, dur: Math.round(20 + rnd() * (rain ? 200 : 110)), tr, center: rnd() < 0.85 ? 'بريدة' : 'عنيزة', tech: pickN(techs), sup: pickN(sups),
        sub: String(10000000 + Math.floor(rnd() * 9e7)), acc: '30' + String(Math.floor(rnd() * 1e9)).padStart(9, '0') });
    }
  }
  /* بلاغات مفتوحة الحين عشان تظهر غرفة العمليات */
  [15, 40, 65, 80, 95, 100, 115, 130, 190].forEach((m, k) => tickets.push({ task: String(id++), start: nowT - m * MIN, dur: 9999, tr: hot[k], center: k === 8 ? 'عنيزة' : 'بريدة', tech: k === 3 ? '' : techs[k], sup: sups[k % 3],
    sub: String(20000000 + k), acc: '3012345678' + k }));
  /* لقطات كل ساعتين تقريبًا، وآخر وحدة قبل ٥ دقائق */
  const snaps = [];
  const times = []; for (let t = nowT - 121 * DAY; t <= nowT - HOUR; t += 2 * HOUR + Math.floor(rnd() * 40) * MIN) times.push(t);
  times.push(nowT - 5 * MIN);
  for (const t of times) {
    const rows = tickets.filter(x => x.start <= t && x.start + x.dur * MIN > t).map(x => ({
      task: x.task, mins: Math.floor((t - x.start) / MIN), center: x.center, tech: x.tech, sup: x.sup, prio: '3', sub: x.sub, acc: x.acc,
      tr: '4100-QBS-' + x.tr.padStart(6, '0'), trPre: 'QBS', trNum: x.tr.padStart(6, '0'), src: 'SMOC', kind: 'بلاغ مشترك', nTech: 1, repDay: 0, repYear: 0 }));
    const d = new Date(t);
    snaps.push({ updated: { d: d.getDate(), m: d.getMonth() + 1, y: d.getFullYear(), h: d.getHours(), mi: d.getMinutes() }, tickets: rows, summary: null });
  }
  return { snaps, rainDays: [...rainDays].map(x => { const d = new Date(x); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }) };
}
