/* الحصر: وين تتركز الأعطال، وش العمل المطلوب للشبكة (إحلال / تعزيز / صيانة) وليش.
   دالة نقية: تاخذ البلاغات الموحدة + القواعد وترجع قائمة الأعمال مرتبة بالأولوية. */
import { CAUSES, causeName } from '../core/const.js';
import { DAY, pct } from '../core/util.js';

export const ACTIONS = {
  replace: { t: 'إحلال', c: '#D93025', d: 'نفس المعدة تتعطل مرارًا بنفس السبب → استبدال' },
  reinforce: { t: 'تعزيز', c: '#E8710A', d: 'حمل زائد أو تركز في الذروة → محول إضافي / تقسيم أحمال' },
  maintain: { t: 'صيانة', c: '#1A73E8', d: 'أعطال وقت المطر أو بسبب الماء → عزل وإحكام الغرف واللوحات' },
  watch: { t: 'متكرر — سجّل السبب', c: '#5F6368', d: 'يتكرر لكن الأسباب غير مسجلة. سجّل سبب كل عطل عشان يتحدد نوع العمل' }
};

export function analyze(faults, rules, nowT = Date.now()) {
  /* النسبة العامة للمطر والذروة في كل البيانات: المحول لازم يكون أعلى منها بوضوح (×1.5) عشان ما يطلع كل شي "ذروة" لو البيانات كلها صيف */
  const allRain = pct(faults.filter(f => f.rain).length, faults.length), allPeak = pct(faults.filter(f => f.peak).length, faults.length);
  const lifted = (share, base) => base < 85 && share >= Math.max(1, base) * 1.5;
  const groups = new Map();
  faults.forEach(f => { if (!f.tr) return; if (!groups.has(f.tr)) groups.set(f.tr, []); groups.get(f.tr).push(f); });
  const items = [];
  groups.forEach((fs, tr) => {
    const in_ = d => fs.filter(f => nowT - f.start <= d * DAY);
    const n30 = in_(30).length, n90 = in_(rules.replaceDays).length;
    const prev30 = fs.filter(f => nowT - f.start > 30 * DAY && nowT - f.start <= 60 * DAY).length;
    const accs = new Set(); let affected = 0;
    fs.forEach(f => { if (f.src === 'manual') affected += f.affected || 1; else { const k = f.acc || f.sub || f.id; if (!accs.has(k)) { accs.add(k); affected++; } } });
    const rainN = fs.filter(f => f.rain).length, peakN = fs.filter(f => f.peak).length;
    const causeCount = {}; fs.forEach(f => { if (f.cause) causeCount[f.cause] = (causeCount[f.cause] || 0) + 1; });
    const withCause = Object.values(causeCount).reduce((a, b) => a + b, 0);
    const dom = Object.entries(causeCount).sort((a, b) => b[1] - a[1])[0];
    const domK = dom ? dom[0] : '', domN = dom ? dom[1] : 0, domFam = domK ? (CAUSES.find(c => c.k === domK) || {}).fam : '';
    const causeN90 = {}; in_(rules.replaceDays).forEach(f => { if (f.cause) causeN90[f.cause] = (causeN90[f.cause] || 0) + 1; });
    const sameEquip = Object.entries(causeN90).filter(([k]) => (CAUSES.find(c => c.k === k) || {}).fam === 'equip').sort((a, b) => b[1] - a[1])[0];

    const acts = [], why = [];
    if (sameEquip && sameEquip[1] >= rules.replaceN) {
      acts.push('replace'); why.push(sameEquip[1] + ' أعطال "' + causeName(sameEquip[0]) + '" خلال ' + rules.replaceDays + ' يوم');
    }
    const waterN = causeCount.water || 0;
    const rainHit = rainN >= 2 && pct(rainN, fs.length) >= rules.rainShare && lifted(pct(rainN, fs.length), allRain);
    const peakHit = fs.length >= rules.minForPattern && pct(peakN, fs.length) >= rules.peakShare && lifted(pct(peakN, fs.length), allPeak);
    if (rainHit || (waterN && domK === 'water')) {
      acts.push('maintain');
      if (rainHit) why.push(pct(rainN, fs.length) + '% من أعطاله في أيام مطر (' + rainN + ' من ' + fs.length + '، والمعدل العام ' + allRain + '%)');
      if (waterN && domK === 'water') why.push('السبب الغالب: رطوبة / ماء (' + waterN + ')');
    }
    if (domFam === 'load' || peakHit) {
      acts.push('reinforce');
      if (domFam === 'load') why.push('السبب الغالب: حمل زائد (' + domN + ')');
      if (peakHit) why.push(pct(peakN, fs.length) + '% من أعطاله في أشهر الذروة (المعدل العام ' + allPeak + '%)');
    }
    if (!acts.length && n90 >= rules.replaceN && withCause < n90) {
      acts.push('watch'); why.push(n90 + ' أعطال خلال ' + rules.replaceDays + ' يوم، ' + (n90 - Math.min(withCause, n90)) + ' منها بدون سبب مسجل');
    }
    const trend = n30 > prev30 ? 'up' : n30 < prev30 ? 'down' : 'flat';
    const tf = trend === 'up' ? 1.3 : trend === 'down' ? 0.8 : 1;
    const cw = domK ? (CAUSES.find(c => c.k === domK) || { w: 1 }).w : 1;
    const score = Math.round(10 * Math.max(n90, 0.5) * (1 + Math.log2(1 + affected)) * tf * cw) / 10;
    const loc = fs.find(f => f.lat != null && !f.approx) || fs.find(f => f.lat != null);
    const zones = fs.map(f => f.zone).filter(z => z >= 0);
    items.push({
      tr, n: fs.length, n30, n90, prev30, trend, affected, rainN, peakN, causeCount, dom: domK, withCause,
      acts, why, score, lat: loc ? loc.lat : null, lng: loc ? loc.lng : null, approx: loc ? loc.approx : false,
      zone: zones.length ? mode(zones) : -1, center: mode(fs.map(f => f.center).filter(Boolean)) || '',
      last: Math.max(...fs.map(f => f.start)), faults: fs
    });
  });
  items.sort((a, b) => b.score - a.score || b.n - a.n);
  return items;
}
function mode(a) { const c = {}; let best = null, bn = 0; a.forEach(x => { c[x] = (c[x] || 0) + 1; if (c[x] > bn) { bn = c[x]; best = x; } }); return best; }

/* تجميع حسب منطقة المقاول */
export function byZone(faults) {
  const z = Array.from({ length: 9 }, (_, i) => ({ zone: i, n: 0, rain: 0, trs: new Set() }));
  faults.forEach(f => { if (f.zone >= 0) { const q = z[f.zone]; q.n++; if (f.rain) q.rain++; if (f.tr) q.trs.add(f.tr); } });
  return z;
}

/* أيام يُحتمل إنها أيام مطر: عدد البلاغات ≥ ضعف الوسيط */
export function suggestRainDays(faults, isoDay) {
  const c = {}; faults.forEach(f => { const d = isoDay(f.start); c[d] = (c[d] || 0) + 1; });
  const v = Object.values(c).sort((a, b) => a - b); if (v.length < 5) return [];
  const med = v[Math.floor(v.length / 2)];
  return Object.entries(c).filter(([, n]) => n >= Math.max(4, 2 * med)).map(([d, n]) => ({ d, n }));
}
