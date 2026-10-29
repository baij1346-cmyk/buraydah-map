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
    { k: 'w60', t: 'انقفل خلال ساعة', v: w(60), unit: '%', target: T.w60, s: rag(w(60), T.w60, true, 10), why: 'سرعة الاستجابة الأولى' },
    { k: 'w120', t: 'انقفل خلال ساعتين', v: w(120), unit: '%', target: T.w120, s: rag(w(120), T.w120, true, 5), why: 'حد التصعيد لقائد الحدث' },
    { k: 'w180', t: 'انقفل خلال 3 ساعات', v: w(180), unit: '%', target: T.w180, s: rag(w(180), T.w180, true, 2), why: 'المعيار النظامي (تعويض المشترك بعده)' },
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
  const sc = scorecard(A.F, T), w60 = sc[0], w180 = sc[2];
  out.push('أُغلق <b>' + pct(a.closed, a.n) + '%</b> من ' + a.n + ' بلاغ خلال ' + spanTxt(A) + '، بمتوسط <b>' + fmtDur(a.avg) + '</b>؛ ونسبة الإغلاق خلال ساعة <b>' + a.within[0] + '%</b> مقابل هدف ' + T.w60 + '%' + (w60.s === 'g' ? ' (محقق).' : '.'));
  const ok = A.centers.filter(x => x.r.closed >= 5).sort((x, y) => y.r.avg - x.r.avg);
  if (ok.length > 1) out.push('<b>' + ok[0].c + '</b> هو المركز الأبطأ (' + fmtDur(ok[0].r.avg) + ') مقابل ' + ok[ok.length - 1].c + ' (' + fmtDur(ok[ok.length - 1].r.avg) + ')' + (A.peak && A.peak.x >= 1.5 ? '، والضغط تركّز بين <b>' + A.peak.from + ':00 و' + A.peak.to + ':00</b> بـ' + A.peak.x + '× المعدل.' : '.'));
  const exposed = A.F.filter(f => f.dur > 180).length, near = A.F.filter(f => f.open && f.dur >= 150 && f.dur <= 180).length;
  out.push(exposed ? '<b>' + exposed + ' بلاغ تجاوز 3 ساعات</b> (تعرّض نظامي)' + (near ? ' و' + near + ' بلاغ مفتوح قريب من الحد' : '') + '؛ يلزم توثيق سبب التأخير لكل منها خلال 5 أيام عمل.'
    : near ? '<b>' + near + ' بلاغ مفتوح قريب من حد الـ3 ساعات</b> — أولوية فورية.' : 'ما فيه أي بلاغ تجاوز المعيار النظامي (3 ساعات) ✓');
  return out;
}
const spanTxt = A => Math.round((A.t1 - A.t0) / 3600000) + ' ساعات';

/* التوصيات: إجراء + سبب + مسؤول + أولوية */
export function recommendations(A, focus, T, extra = {}) {
  const R = [], F = A.F, FC = F.filter(f => f.center === focus);
  const near = F.filter(f => f.open && f.dur >= 120).sort((x, y) => y.dur - x.dur);
  if (near.length) R.push({ p: 1, t: 'تصعيد فوري لـ' + near.length + ' بلاغ مفتوح تجاوز ساعتين', why: 'أقدمها ' + fmtDur(near[0].dur) + ' (' + (near[0].co || 'بدون فني') + ' · ' + near[0].center + ')', who: 'قائد الحدث + المشرف' });
  const board = contractorBoard(FC).filter(r => r.real && r.closed >= 5);
  const weak = board.filter(r => r.s === 'r').sort((x, y) => y.over120 - x.over120);
  weak.slice(0, 2).forEach(r => R.push({ p: 1, t: 'اجتماع أداء مع ' + r.k + ' وتسجيل المخالفات', why: r.n + ' بلاغ، ' + r.within[0] + '% خلال ساعة، ' + r.over120 + ' تجاوز ساعتين (درجة ' + r.score + '/100)', who: 'رئيس القسم' }));
  if (A.peak && A.peak.x >= 1.8) R.push({ p: 2, t: 'تعزيز الفرق بين ' + A.peak.from + ':00 و' + A.peak.to + ':00', why: 'البلاغات ' + A.peak.x + '× باقي اليوم (' + A.peak.perHour + ' بالساعة)', who: 'المقاولين' });
  const accs = [...groupBy(FC.filter(f => f.acc), f => f.acc)].filter(([, L]) => L.length >= 3);
  accs.slice(0, 2).forEach(([, L]) => R.push({ p: 1, t: 'زيارة ميدانية وفحص جذري للمحول ' + (L[0].ref.tr || ''), why: 'نفس المشترك بلّغ ' + L.length + ' مرات' + (L.some(f => f.open) ? ' وللحين مفتوح' : ''), who: 'المشرف + المقاول' }));
  const trs = [...groupBy(FC.filter(f => f.tr), f => f.tr)].filter(([, L]) => L.length >= 4).sort((x, y) => y[1].length - x[1].length);
  if (trs.length) R.push({ p: 2, t: 'إدراج ' + trs.length + ' محول في قائمة الفحص الوقائي', why: trs.slice(0, 3).map(([k, L]) => k + ' (' + L.length + ')').join('، '), who: 'التخطيط والصيانة' });
  const nt = F.filter(f => !f.open && !f.tech).length;
  if (nt >= Math.max(5, F.length * 0.1)) R.push({ p: 3, t: 'مراجعة ' + nt + ' بلاغ انقفل بدون فني مسند', why: 'التحقق إن الإغلاق صحيح وما يتكرر البلاغ', who: 'منسق البلاغات' });
  if (extra.noCause) R.push({ p: 3, t: 'تسجيل سبب العطل لـ' + extra.noCause + ' بلاغ مقفل', why: 'بدونه ما يتحدد نوع العمل (إحلال/تعزيز/صيانة)', who: 'المشرفين' });
  if (extra.located != null && extra.located < 60) R.push({ p: 3, t: 'استكمال إحداثيات المحولات من GIS', why: 'المعروف موقعه ' + extra.located + '% بس من البلاغات', who: 'نظم المعلومات الجغرافية' });
  return R.sort((a, b) => a.p - b.p);
}
export const PRIO = { 1: 'عالية', 2: 'متوسطة', 3: 'منخفضة' };
