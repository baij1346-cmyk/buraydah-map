/* الطبقة التنفيذية: مؤشرات الأداء مقابل الأهداف (RAG)، الرسائل الرئيسية، والتوصيات.
   دوال نقية تاخذ نتيجة analyzeDay وترجع بيانات جاهزة للعرض والتقرير. */
import { table } from './stats.js';
import { fmtDur, groupBy, pct } from '../core/util.js';

export const DEF_TARGETS = { w60: 70, w120: 95, w180: 100, avg: 60, over180: 0 };

/* حالة المؤشر: g أخضر (محقق) · a برتقالي (قريب) · r أحمر (بعيد) */
const rag = (val, target, higherIsBetter, tol) => {
  if (val == null) return 'n';
  const gap = higherIsBetter ? target - val : val - target;
  return gap <= 0 ? 'g' : gap <= tol ? 'a' : 'r';
};
export const RAG_LABEL = { g: 'محقق', a: 'قريب من الهدف', r: 'غير محقق', n: '—' };

export function scorecard(F, T) {
  const closed = F.filter(f => !f.open), d = closed.map(f => f.dur), n = d.length;
  const w = L => n ? pct(d.filter(x => x <= L).length, n) : null;
  const avg = n ? Math.round(d.reduce((a, b) => a + b, 0) / n) : null;
  const over180 = F.filter(f => f.dur > 180).length;
  return [
    { k: 'w60', t: 'نسبة الإغلاق خلال ساعة', v: w(60), unit: '%', target: T.w60, s: rag(w(60), T.w60, true, 10), why: 'سرعة الاستجابة الأولى' },
    { k: 'w120', t: 'نسبة الإغلاق خلال ساعتين', v: w(120), unit: '%', target: T.w120, s: rag(w(120), T.w120, true, 5), why: 'حد التصعيد لقائد الحدث' },
    { k: 'w180', t: 'نسبة الإغلاق خلال 3 ساعات', v: w(180), unit: '%', target: T.w180, s: rag(w(180), T.w180, true, 2), why: 'المعيار النظامي (تعويض المشترك بعده)' },
    { k: 'avg', t: 'متوسط مدة الإغلاق', v: avg, unit: 'د', target: T.avg, s: rag(avg, T.avg, false, 15), why: 'كفاءة التشغيل العامة' },
    { k: 'over180', t: 'بلاغات تجاوزت 3 ساعات', v: over180, unit: '', target: T.over180, s: rag(over180, T.over180, false, 2), why: 'تعرّض نظامي مباشر' }];
}

/* ترتيب المقاولين: درجة مركبة (سرعة + التزام) */
export function contractorBoard(FC) {
  return table(FC, 'co').filter(r => r.n).map(r => {
    const L = FC.filter(f => (f.co || (f.src === 'sec' && !f.tech ? 'بدون فني' : 'غير محدد')) === r.k);
    const over120 = L.filter(f => f.dur > 120).length, b = [0, 0, 0, 0];
    L.forEach(f => b[f.dur < 60 ? 0 : f.dur < 90 ? 1 : f.dur < 120 ? 2 : 3]++);
    const real = r.k !== 'بدون فني' && r.k !== 'غير محدد';
    /* الدرجة من 100: نص لنسبة الإغلاق خلال ساعة، ونص للالتزام (بدون تجاوز ساعتين) */
    const score = r.closed ? Math.round(0.5 * r.within[0] + 0.5 * (100 - pct(over120, r.n))) : null;
    return { ...r, over120, b, real, score, s: score == null ? 'n' : score >= 75 ? 'g' : score >= 60 ? 'a' : 'r' };
  }).sort((a, b) => (b.real - a.real) || ((b.score ?? -1) - (a.score ?? -1)));
}

/* الرسائل الرئيسية (3 جمل تختصر اليوم) */
export function keyMessages(A, focus, T) {
  const out = [], a = A.all;
  /* حدث جاري: المفتوح يتصاعد */
  const sr = A.series || [];
  const pk = sr.length ? sr.reduce((m, x) => x.n > m.n ? x : m, sr[0]) : null, last = sr[sr.length - 1];
  if (A.ended) out.push('<b>انتهى الحدث:</b> عاد المفتوح إلى <b>' + last.n + '</b> بلاغًا (' + fmtClock(last.at) + ') بعد ذروة بلغت <b>' + pk.n + '</b> (' + fmtClock(pk.at) + ')، دون أي بلاغ مفتوح تجاوز ساعتين.');
  else if (sr.length >= 3 && pk !== last && last.n <= .6 * pk.n) out.push('<b>الحدث في تراجع:</b> انخفض المفتوح من ذروة <b>' + pk.n + '</b> (' + fmtClock(pk.at) + ') إلى <b>' + last.n + '</b> (' + fmtClock(last.at) + ')' + (A.inflow != null ? '، وخلال الساعة الأخيرة ورد ' + A.inflow + ' مقابل ' + A.outflow + ' أُغلق' : '') + '.');
  else if (sr.length >= 3 && sr[sr.length - 1].n >= 1.5 * Math.max(1, sr[0].n)) out.push('<b>الحدث في تصاعد:</b> ارتفع المفتوح من <b>' + sr[0].n + '</b> (' + fmtClock(sr[0].at) + ') إلى <b>' + sr[sr.length - 1].n + '</b> (' + fmtClock(sr[sr.length - 1].at) + ')' + (A.inflow != null ? '، وخلال الساعة الأخيرة ورد ' + A.inflow + ' مقابل ' + A.outflow + ' أُغلق.' : '.'));
  const sc = scorecard(A.F, T), w60 = sc[0], w180 = sc[2];
  out.push('أُغلق <b>' + pct(a.closed, a.n) + '%</b> من ' + a.n + ' بلاغ خلال ' + spanTxt(A) + '، بمتوسط <b>' + fmtDur(a.avg) + '</b>؛ ونسبة الإغلاق خلال ساعة <b>' + a.within[0] + '%</b> مقابل هدف ' + T.w60 + '%' + (w60.s === 'g' ? ' (محقق).' : '.'));
  const ok = A.centers.filter(x => x.r.closed >= 5).sort((x, y) => y.r.avg - x.r.avg);
  if (ok.length > 1) out.push('<b>' + ok[0].c + '</b> هو المركز الأبطأ (' + fmtDur(ok[0].r.avg) + ') مقابل ' + ok[ok.length - 1].c + ' (' + fmtDur(ok[ok.length - 1].r.avg) + ')' + (A.peak && A.peak.x >= 1.5 ? '، وتركّز الضغط بين <b>' + A.peak.from + ':00 و' + A.peak.to + ':00</b> بـ' + A.peak.x + '× المعدل.' : '.'));
  else if (A.peak && A.peak.x >= 1.5) out.push('تركّز الضغط بين <b>' + A.peak.from + ':00 و' + A.peak.to + ':00</b>: بمعدل ' + A.peak.perHour + ' بلاغًا في الساعة، أي <b>' + A.peak.x + (A.d === 'all' ? '×</b> بقية فترة الحدث.' : '×</b> باقي اليوم.'));
  /* حدث تذاكر مجمّعة (فصل مغذي محتمل): أكثف تجمّع خلال ساعة */
  const mass = A.F.filter(f => f.kind && f.kind !== 'بلاغ مشترك').sort((x, y) => x.start - y.start);
  if (mass.length >= 10) {
    let best = [0, 0];
    for (let i = 0, j = 0; i < mass.length; i++) { while (mass[i].start - mass[j].start > 60 * 60000) j++; if (i - j + 1 > best[1] - best[0]) best = [j, i + 1]; }
    const C = mass.slice(best[0], best[1]), cc = C.filter(f => !f.open), sub = A.F.filter(f => f.kind === 'بلاغ مشترك' && !f.open);
    const avgOf = L => L.length ? Math.round(L.reduce((x, f) => x + f.dur, 0) / L.length) : 0;
    if (C.length >= 10) out.push('<b>' + C.length + ' تذكرة مجمّعة</b> بين ' + fmtClock(C[0].start) + ' و' + fmtClock(C[C.length - 1].start) + ' على ' + new Set(C.map(f => f.tr)).size + ' محولًا (يرجّح فصل مغذٍ)، ومتوسط إغلاقها <b>' + fmtDur(avgOf(cc)) + '</b> مقابل ' + fmtDur(avgOf(sub)) + ' لبلاغات المشتركين' + (avgOf(cc) > avgOf(sub) ? '، وقد رفعت المتوسط العام' : '') + (mass.length > C.length ? (A.d === 'all' ? ' (إجمالي المجمّعة خلال الحدث ' : ' (إجمالي المجمّعة اليوم ') + mass.length + ')' : '') + '.');
  }
  const exposed = A.F.filter(f => f.dur > 180).length, near = A.F.filter(f => f.open && f.dur >= 150 && f.dur <= 180).length;
  out.push(exposed ? '<b>' + exposed + ' بلاغ تجاوز 3 ساعات</b> (تعرّض نظامي)' + (near ? ' و' + near + (near > 2 && near < 11 ? ' بلاغات مفتوحة قريبة' : ' بلاغًا مفتوحًا قريبًا') + ' من الحد' : '') + '؛ ويتعين توثيق سبب التأخير لكل منها خلال 5 أيام عمل.'
    : near ? '<b>' + near + ' بلاغ مفتوح قريب من حد الـ3 ساعات</b> — أولوية فورية.' : 'لم يتجاوز أي بلاغ المعيار النظامي (3 ساعات) ✓');
  return out;
}
const fmtClock = t => new Date(t).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
const spanTxt = A => { const h = Math.round((A.t1 - A.t0) / 3600000); return h + (h > 2 && h < 11 ? ' ساعات' : ' ساعة'); };

/* التوصيات: إجراء + سبب + مسؤول + أولوية */
export function recommendations(A, focus, T, extra = {}) {
  const R = [], F = A.F, FC = F.filter(f => f.center === focus);
  const LVN = { 2: 'استعداد', 3: 'حدث كبير', 4: 'حدث شامل' };
  if (extra.sugLv && extra.sugLv > (extra.level || 1)) R.push({ p: 1, t: 'إعلان المستوى ' + extra.sugLv + ' (' + LVN[extra.sugLv] + ')', why: A.all.open + ' بلاغ مفتوح مقابل معدل يومي ' + extra.B0 + ' (' + Math.round(A.all.open / extra.B0 * 10) / 10 + '×)', who: 'رئيس القسم' });
  if (A.inflow > A.outflow && A.inflow >= 10) R.push({ p: 1, t: 'نقل فرق إضافية للمقاولين الأعلى ضغطًا', why: 'خلال الساعة الأخيرة ورد ' + A.inflow + ' وأُغلق ' + A.outflow + ' — الفجوة في ازدياد', who: 'المنسق الميداني' });
  const near = F.filter(f => f.open && f.dur >= 120).sort((x, y) => y.dur - x.dur);
  if (near.length) R.push({ p: 1, t: 'تصعيد فوري لـ' + near.length + ' بلاغ مفتوح تجاوز ساعتين', why: 'أقدمها ' + fmtDur(near[0].dur) + ' (' + (near[0].co || 'بدون فني') + ' · ' + near[0].center + ')', who: 'قائد الحدث + المشرف' });
  const board = contractorBoard(FC).filter(r => r.real && r.closed >= 5);
  const weak = board.filter(r => r.s === 'r').sort((x, y) => y.over120 - x.over120);
  weak.slice(0, 2).forEach(r => R.push({ p: 1, t: 'اجتماع أداء مع ' + r.k + ' ومراجعة المخالفات المحتملة', why: r.n + ' بلاغ، ' + r.within[0] + '% خلال ساعة، ' + r.over120 + ' تجاوز ساعتين (درجة ' + r.score + '/100)', who: 'رئيس القسم' }));
  if (A.peak && A.peak.x >= 1.8) R.push({ p: 2, t: 'تعزيز الفرق بين ' + A.peak.from + ':00 و' + A.peak.to + ':00', why: 'البلاغات ' + A.peak.x + (A.d === 'all' ? '× بقية فترة الحدث (' : '× باقي اليوم (') + A.peak.perHour + ' بالساعة)', who: 'المقاولين' });
  const accs = [...groupBy(FC.filter(f => f.acc), f => f.acc)].filter(([, L]) => L.length >= 3);
  accs.slice(0, 2).forEach(([, L]) => R.push({ p: 1, t: 'زيارة ميدانية وفحص جذري للمحول ' + (L[0].ref.tr || ''), why: 'المشترك نفسه بلّغ ' + L.length + ' مرات' + (L.some(f => f.open) ? ' وما زال مفتوحًا' : ''), who: 'المشرف + المقاول' }));
  const trs = [...groupBy(FC.filter(f => f.tr), f => f.tr)].filter(([, L]) => L.length >= 4).sort((x, y) => y[1].length - x[1].length);
  if (trs.length) R.push({ p: 2, t: 'إدراج ' + trs.length + ' محول في قائمة الفحص الوقائي', why: trs.slice(0, 3).map(([k, L]) => k + ' (' + L.length + ')').join('، '), who: 'التخطيط والصيانة' });
  (extra.feeders || []).filter(g => g.L.length >= 5 && g.zones >= 2).slice(0, 2).forEach(g => R.push({ p: 1, t: 'فحص المغذي ' + g.k + ' (جهد متوسط)', why: cnt(g.L.length, 'بلاغ', 'بلاغات') + ' في ' + cnt(g.zones, 'منطقة', 'مناطق') + ' على ' + cnt(g.trs, 'محول', 'محولات') + (g.open ? '، منها ' + g.open + ' مفتوح' : ''), who: 'تحكم الجهد المتوسط' }));
  const nt = F.filter(f => !f.open && !f.tech).length;
  if (nt >= Math.max(5, F.length * 0.1)) R.push({ p: 3, t: 'مراجعة ' + nt + ' بلاغًا أُغلق دون إسناد فني', why: 'التحقق من صحة الإغلاق وعدم تكرار البلاغ', who: 'منسق البلاغات' });
  if (extra.noCause) R.push({ p: 3, t: 'تسجيل سبب العطل لـ' + extra.noCause + ' بلاغ مقفل', why: 'لا يمكن تحديد نوع العمل (إحلال/تعزيز/صيانة) دونه', who: 'المشرفين' });
  if (extra.located != null && extra.located < 60) R.push({ p: 3, t: 'استكمال إحداثيات المحولات من GIS', why: 'المعروف موقعه ' + extra.located + '% فقط من البلاغات', who: 'نظم المعلومات الجغرافية' });
  return R.sort((a, b) => a.p - b.p);
}
export const PRIO = { 1: 'عالية', 2: 'متوسطة', 3: 'منخفضة' };

/* الحدث انتهى: المفتوح رجع ≤ 20% من الذروة وما فيه مفتوح تجاوز ساعتين */
export function isEnded(A) {
  const sr = A.series || []; if (sr.length < 6) return false;
  const pk = Math.max(...sr.map(x => x.n)), last = sr[sr.length - 1].n;
  return last <= .2 * pk && !A.F.some(f => f.open && f.dur >= 120);
}

/* العدد مع المعدود: 3–10 جمع، غيره مفرد */
function cnt(n, one, many) { return n + ' ' + (n >= 3 && n <= 10 ? many : one); }
