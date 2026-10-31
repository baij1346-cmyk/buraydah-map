/* التقرير اليومي: ملخص تحليلي لكل يوم من تقارير الكهرباء المرفوعة (نفس تحليل رئيس القسم) */
import { S } from '../store/repo.js';
import { faults } from '../analysis/model.js';
import { table, row } from '../analysis/stats.js';
import { CENTERS, escalation } from '../core/const.js';
import { trLabel } from '../core/geo.js';
import { esc, fmtDur, fmtTime, isoDay, DAY, HOUR, pct, groupBy, copy } from '../core/util.js';
import { waLink } from '../core/ui.js';
import { hbar, stack100, hours } from '../core/charts.js';
import { DEF_TARGETS, scorecard, contractorBoard, keyMessages, recommendations, RAG_LABEL, PRIO } from '../analysis/exec.js';

let root, day = '', center = 'بريدة';

function mount(el) { root = el; el.innerHTML = '<div class="pad" id="brBody"></div>'; }

/* الأيام اللي فيها تقارير مرفوعة، الأحدث أول */
const days = () => [...new Set(S.snapshots.map(s => isoDay(s.at)))].sort().reverse();

export function analyzeDay(d) {
  const snaps = S.snapshots.filter(s => isoDay(s.at) === d);
  if (!snaps.length) return null;
  const t0 = snaps[0].at, t1 = snaps[snaps.length - 1].at;
  /* بلاغات اليوم: كل بلاغ ظهر في تقارير هذا اليوم */
  const seen = new Set(snaps.flatMap(s => s.rows.map(r => r.task)));
  const F = faults({ from: t0 - 2 * DAY }).filter(f => f.src === 'sec' && seen.has(f.id));
  /* المدة: للمفتوح = عمره وقت آخر تقرير في اليوم (مو الحين) */
  F.forEach(f => { if (f.open || (f.end > t1 && !f.manual)) { f.open = true; f.dur = Math.round((t1 - f.start) / 60000); } });
  const centers = CENTERS.map(c => ({ c, r: row(c, F.filter(f => f.center === c)), over: F.filter(f => f.center === c && f.dur > 120).length })).filter(x => x.r.n);
  const all = row(S.settings.onlyBuraydah ? 'بريدة' : 'القصيم', F); all.over = F.filter(f => f.dur > 120).length;
  /* الذروة بالساعة */
  const hours = {}; F.filter(f => f.start >= t0 - HOUR).forEach(f => { const h = new Date(f.start).getHours(); hours[h] = (hours[h] || 0) + 1; });
  const hk = Object.keys(hours).map(Number).sort((a, b) => a - b);
  let peak = null;
  if (hk.length >= 3) {
    let best = -1; for (let i = 0; i + 2 < hk.length; i++) { const s3 = hours[hk[i]] + (hours[hk[i] + 1] || 0) + (hours[hk[i] + 2] || 0); if (s3 > best) { best = s3; peak = hk[i]; } }
    const rest = hk.filter(h => h < peak || h > peak + 2), restAvg = rest.length ? rest.reduce((a, h) => a + hours[h], 0) / rest.length : 0;
    peak = { from: peak, to: peak + 3, perHour: Math.round(best / 3), restAvg: Math.round(restAvg), x: restAvg ? Math.round(10 * best / 3 / restAvg) / 10 : null };
  }
  return { d, snaps, t0, t1, F, centers, all, hours, peak };
}

function render() {
  if (!root) return;
  const box = root.querySelector('#brBody'), D = days();
  if (!D.length) { box.innerHTML = '<div class="hero"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4h6v3H9zM6 6H5v15h14V6h-1"/><path d="M9 12h6M9 16h4"/></svg></div><h3>ما فيه تقارير للحين</h3><p>ارفع تقرير توجيه البلاغات (PDF)، ويطلع هنا ملخص اليوم: المراكز، المقاولين، الذروة، والنقاط الساخنة.</p><label class="tbtn primary" for="pdfIn">رفع التقرير</label></div>'; return; }
  if (!D.includes(day)) day = D[0];
  const A = analyzeDay(day), F = A.F, FC = F.filter(f => f.center === center);
  const dlabel = new Date(A.t0).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long' });
  const T = Object.assign({ ...DEF_TARGETS }, S.settings.targets || {}), a = A.all;
  let sn = 0; const N = () => ++sn;
  const noCause = F.filter(f => !f.open && !f.cause).length, located = pct(F.filter(f => f.lat != null).length, F.length);
  let h = '<div class="row no-print">' + (D.length > 1 ? '<div class="seg">' + D.slice(0, 7).map(x => '<button data-d="' + x + '" aria-pressed="' + (x === day) + '">' + x.slice(5) + '</button>').join('') + '</div>' : '') +
    '<span class="spacer"></span><button class="tbtn primary" id="brPrint"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><path d="M6 14h12v7H6z"/></svg>التقرير التنفيذي (PDF)</button><a class="tbtn" id="brWa" target="_blank" rel="noopener">واتساب</a><button class="tbtn" id="brCopy">نسخ</button></div>';
  /* الغلاف */
  h += '<div class="rep-cover"><div class="rep-brand"><span class="logo"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/></svg></span><div><small>مركز أبو بندر للعمليات · الجهد المتوسط والمنخفض · ' + (S.settings.onlyBuraydah ? 'بريدة' : 'القصيم') + '</small><h2>تقرير أداء معالجة الأعطال</h2><p>' + dlabel + ' · ' + fmtTime(A.t0) + ' – ' + fmtTime(A.t1) + ' · ' + A.snaps.length + ' تقرير توجيه بلاغات</p></div></div></div>';
  /* الخلاصة التنفيذية */
  h += '<section class="rep-sec"><h3 class="rep-h"><span>' + N() + '</span>الخلاصة التنفيذية</h3><ol class="msgs">' + keyMessages(A, center, T).map(m => '<li>' + m + '</li>').join('') + '</ol></section>';
  /* مؤشرات الأداء مقابل الأهداف */
  const SC = scorecard(F, T), ICON = { g: '✓', a: '!', r: '✕', n: '' };
  h += '<section class="rep-sec"><h3 class="rep-h"><span>' + N() + '</span>مؤشرات الأداء مقابل الأهداف <small>' + (S.settings.onlyBuraydah ? 'بريدة' : 'القصيم') + '</small></h3><div class="kpis-x">' + SC.map(k =>
    '<div class="kx ' + k.s + '"><span class="kx-t">' + k.t + '</span><b>' + (k.v == null ? '—' : k.unit === 'د' ? fmtDur(k.v) : k.v + k.unit) + '</b><span class="kx-g">الهدف ' + (k.unit === 'د' ? '≤ ' + k.target + ' د' : (k.k === 'over180' ? k.target : k.target + k.unit)) + '</span><span class="rag ' + k.s + '"><i>' + ICON[k.s] + '</i>' + RAG_LABEL[k.s] + '</span></div>').join('') + '</div>' +
    '<div class="vol"><span><b>' + a.n + '</b> بلاغ' + (F.some(f => f.kind && f.kind !== 'بلاغ مشترك') ? ' (' + F.filter(f => f.kind === 'بلاغ مشترك').length + ' مشترك + ' + F.filter(f => f.kind && f.kind !== 'بلاغ مشترك').length + ' تذكرة مجمّعة)' : '') + '</span><span><b>' + a.closed + '</b> انحل</span><span><b>' + a.open + '</b> مفتوح وقت آخر تقرير</span><span><b>' + a.over + '</b> تجاوز ساعتين</span></div></section>';
  /* المراكز */
  const ok = A.centers.filter(x => x.r.closed);
  if (A.centers.length > 1) h += '<section class="rep-sec"><h3 class="rep-h"><span>' + N() + '</span>مقارنة المراكز <small>متوسط مدة الإغلاق مقابل الهدف ' + T.avg + ' د</small></h3><div class="card">' +
    hbar(ok.map(x => ({ label: x.c, v: x.r.avg, txt: fmtDur(x.r.avg), warn: x.r.avg > T.avg })).sort((x, y) => y.v - x.v), { target: T.avg, targetTxt: 'الهدف' }) + '</div>' +
    '<div class="tbl-wrap"><table class="dtable"><thead><tr><th>المركز</th><th class="n">البلاغات</th><th class="n">انحل</th><th class="n">مفتوح</th><th class="n">المتوسط</th><th class="n">خلال ساعة</th><th class="n">خلال 3 ساعات</th><th class="n">تجاوز ساعتين</th></tr></thead><tbody>' +
    A.centers.map(x => '<tr><td><b>' + x.c + '</b></td><td class="n">' + x.r.n + '</td><td class="n">' + x.r.closed + '</td><td class="n">' + (x.r.open || '—') + '</td><td class="n">' + fmtDur(x.r.avg) + '</td><td class="n"><span class="rag sm ' + (x.r.within[0] >= T.w60 ? 'g' : x.r.within[0] >= T.w60 - 10 ? 'a' : 'r') + '">' + x.r.within[0] + '%</span></td><td class="n">' + x.r.within[3] + '%</td><td class="n">' + (x.over || '—') + '</td></tr>').join('') +
    '<tr class="tot"><td><b>الإجمالي</b></td><td class="n"><b>' + a.n + '</b></td><td class="n">' + a.closed + '</td><td class="n">' + a.open + '</td><td class="n">' + fmtDur(a.avg) + '</td><td class="n">' + a.within[0] + '%</td><td class="n">' + a.within[3] + '%</td><td class="n">' + a.over + '</td></tr></tbody></table></div></section>';
  /* الطلب بالساعة */
  const hk = Object.keys(A.hours).map(Number).sort((x, y) => x - y);
  if (hk.length > 1) h += '<section class="rep-sec"><h3 class="rep-h"><span>' + N() + '</span>نمط الطلب خلال اليوم' + (A.peak ? ' <small>الذروة ' + A.peak.from + ':00–' + A.peak.to + ':00 · ' + A.peak.x + '× المعدل</small>' : '') + '</h3><div class="card">' + hours(hk, A.hours, A.peak) + '<p class="hint">عدد البلاغات الجديدة حسب ساعة فتحها. الأعمدة الغامقة = فترة الذروة.</p></div></section>';
  /* المقاولين */
  const cs = CENTERS.filter(c => F.some(f => f.center === c)), B = contractorBoard(FC);
  h += '<section class="rep-sec"><div class="row"><h3 class="rep-h" style="margin:0"><span>' + N() + '</span>أداء المقاولين — ' + center + '</h3><span class="spacer"></span><div class="seg no-print">' + cs.map(c => '<button data-c="' + c + '" aria-pressed="' + (c === center) + '">' + c + '</button>').join('') + '</div></div>';
  h += B.length ? '<div class="tbl-wrap"><table class="dtable"><thead><tr><th>المقاول</th><th class="n">البلاغات</th><th class="n">مفتوح</th><th class="n">المتوسط</th><th class="n">خلال ساعة</th><th class="n">تجاوز ساعتين</th><th class="n">الدرجة</th></tr></thead><tbody>' +
    B.map(r => '<tr' + (r.real ? '' : ' class="muted"') + '><td>' + esc(r.k) + '</td><td class="n"><b>' + r.n + '</b></td><td class="n">' + (r.open || '—') + '</td><td class="n">' + (r.closed ? fmtDur(r.avg) : '—') + '</td><td class="n">' + (r.closed ? r.within[0] + '%' : '—') + '</td><td class="n">' + (r.over120 || '—') + '</td><td class="n">' + (r.real && r.score != null ? '<span class="rag sm ' + r.s + '">' + r.score + '</span>' : '—') + '</td></tr>').join('') + '</tbody></table></div>' +
    '<div class="card"><p class="pg" style="margin:0">توزيع مدة الإغلاق لكل مقاول</p>' + stack100(B.filter(r => r.n >= 3).map(r => ({ label: r.k, parts: r.b }))) + '<p class="hint">الدرجة من 100 = نصفها نسبة الإغلاق خلال ساعة، ونصفها الالتزام بعدم تجاوز ساعتين. أخضر ≥ 75، برتقالي ≥ 60.</p></div>'
    : '<div class="empty">ما فيه بلاغات لهالمركز.</div>';
  h += '</section>';
  /* التوصيات */
  const RC = recommendations(A, center, T, { noCause, located });
  if (RC.length) h += '<section class="rep-sec"><h3 class="rep-h"><span>' + N() + '</span>التوصيات والإجراءات</h3><div class="tbl-wrap"><table class="dtable recs"><thead><tr><th>الأولوية</th><th>الإجراء</th><th>المبرر</th><th>المسؤول</th></tr></thead><tbody>' +
    RC.map(r => '<tr><td><span class="prio p' + r.p + '">' + PRIO[r.p] + '</span></td><td><b>' + bidi(r.t) + '</b></td><td>' + bidi(r.why) + '</td><td>' + esc(r.who) + '</td></tr>').join('') + '</tbody></table></div></section>';
  /* ملاحظات تشغيلية */
  const pts = insights(A, center);
  if (pts.length) h += '<section class="rep-sec"><h3 class="rep-h"><span>' + N() + '</span>ملاحظات تشغيلية</h3><div class="card"><ul class="insights">' + pts.map(p => '<li class="' + (p.lv || '') + '">' + p.t + '</li>').join('') + '</ul></div></section>';
  const open = FC.filter(f => f.open).sort((x, y) => y.dur - x.dur);
  if (open.length) h += '<section class="rep-sec"><h3 class="rep-h"><span>' + N() + '</span>المفتوح وقت آخر تقرير — ' + center + ' <small>' + open.length + '</small></h3><div class="tbl-wrap"><table class="dtable"><thead><tr><th>المهمة</th><th>المحول</th><th>المقاول</th><th class="n">العمر</th><th>التصعيد</th></tr></thead><tbody>' +
    open.slice(0, 10).map(f => '<tr><td class="ltr">' + esc(f.id) + '</td><td class="ltr">' + esc(f.ref.tr || '') + '</td><td>' + esc(f.co || 'بدون فني') + '</td><td class="n" style="' + (f.dur >= 120 ? 'color:var(--bad);font-weight:700' : '') + '">' + fmtDur(f.dur) + '</td><td style="font-size:.78rem">' + escalation(f.dur).t + '</td></tr>').join('') + '</tbody></table></div></section>';
  h += hotspotsHtml(FC, center);
  h += '<section class="rep-sec rep-method"><h3 class="rep-h"><span>i</span>المنهجية وحدود البيانات</h3><p class="hint">المصدر: تقارير «توجيه بلاغات المشتركين المسجلة» من إدارة كهرباء القصيم. كل تقرير يعرض البلاغات المفتوحة وقت صدوره؛ البلاغ اللي يختفي من التقرير التالي يُحتسب منحلًا، ووقت إغلاقه = منتصف الفترة بين التقريرين (دقة ± ' + Math.round(Math.max(...A.snaps.slice(1).map((s, i) => s.at - A.snaps[i].at), 0) / 120000) + ' د). البلاغات اللي انفتحت وانحلت قبل أول تقرير ما تظهر. المقاول مستنتج من اسم الفني. الأهداف قابلة للتعديل من الإعدادات.</p></section>';
  box.innerHTML = h;
  const text = summary(A);
  box.querySelector('#brWa').href = waLink(text);
  box.querySelector('#brCopy').onclick = () => copy(text);
  box.querySelector('#brPrint').onclick = () => { document.body.classList.add('printing'); setTimeout(() => { window.print(); }, 50); };
  box.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { day = b.dataset.d; render(); });
  box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { center = b.dataset.c; render(); });
}

/* أرقام المحولات والمهام داخل جملة عربية: نعزلها عشان ما تنقلب */
const bidi = t => esc(t).replace(/(4100-Q[A-Z]{1,2}S-\d+|Q[A-Z]{1,2}S-\d+|\b5\d{7}\b)/g, '<bdi class="ltr">$1</bdi>');

/* النقاط الساخنة: حساب بلّغ أكثر من مرة، ومحول عليه 3 بلاغات أو أكثر */
export function hotspotsHtml(FC, label) {
  const trs = [...groupBy(FC.filter(f => f.tr), f => f.tr)].filter(([, L]) => L.length >= 3).sort((x, y) => y[1].length - x[1].length);
  const accs = [...groupBy(FC.filter(f => f.acc), f => f.acc)].filter(([, L]) => L.length >= 2).sort((x, y) => y[1].length - x[1].length);
  if (!trs.length && !accs.length) return '';
  return '<p class="sec-title">النقاط الساخنة' + (label ? ' — ' + label : '') + '</p><div class="card"><ul class="insights">' +
    accs.slice(0, 5).map(([, L]) => '<li class="r">حساب واحد بلّغ <b>' + L.length + ' مرات</b> على محول <span class="ltr">' + esc(L[0].ref.tr || '') + '</span>' + (L.some(f => f.open) ? ' — <b>وللحين مفتوح</b>: العطل ما انحل من جذوره' : '') + '</li>').join('') +
    trs.slice(0, 8).map(([k, L]) => '<li>محول <span class="ltr">' + esc(trLabel(k)) + '</span>' + (label ? '' : ' (' + L[0].center + ')') + ': <b>' + L.length + ' بلاغات</b> (' + [...new Set(L.map(f => f.co || 'بدون فني'))].join('، ') + ')' + (L.some(f => f.open) ? ' · فيه مفتوح' : '') + '</li>').join('') + '</ul></div>';
}
export const latestDay = () => days()[0] || '';

/* أبرز النقاط بكلام واضح */
function insights(A, focus) {
  const out = [], F = A.F, a = A.all;
  const ok = A.centers.filter(x => x.r.closed >= 5).sort((x, y) => y.r.avg - x.r.avg);
  if (ok.length > 1) out.push({ t: '<b>' + ok[0].c + '</b> الأبطأ: متوسط الإغلاق ' + fmtDur(ok[0].r.avg) + ' و' + ok[0].r.within[0] + '% بس انقفلت خلال ساعة (الأسرع ' + ok[ok.length - 1].c + ' ' + fmtDur(ok[ok.length - 1].r.avg) + ').', lv: ok[0].c === focus ? 'r' : '' });
  if (A.peak && A.peak.x >= 1.5) out.push({ t: 'الذروة من <b>' + A.peak.from + ':00 إلى ' + A.peak.to + ':00</b>: حوالي ' + A.peak.perHour + ' بلاغ بالساعة، يعني <b>' + A.peak.x + '×</b> باقي اليوم.' });
  const FC = F.filter(f => f.center === focus), T = table(FC, 'co').filter(r => r.closed >= 5 && r.k !== 'بدون فني' && r.k !== 'غير محدد');
  if (T.length > 1) {
    const over = k => FC.filter(f => f.co === k && f.dur > 120).length;
    const worst = [...T].sort((x, y) => (over(y.k) - over(x.k)) || (y.avg - x.avg))[0], best = [...T].sort((x, y) => x.avg - y.avg)[0];
    out.push({ t: '<b>' + esc(worst.k) + '</b> (' + focus + '): ' + worst.n + ' بلاغ، متوسطه ' + fmtDur(worst.avg) + (over(worst.k) ? '، و<b>' + over(worst.k) + ' تجاوزت ساعتين</b>' : '') + '.', lv: 'r' });
    if (best.k !== worst.k) out.push({ t: '<b>' + esc(best.k) + '</b> الأفضل في ' + focus + ': متوسطه ' + fmtDur(best.avg) + (over(best.k) ? '' : ' وما عنده ولا بلاغ تجاوز ساعتين') + '.', lv: 'g' });
  }
  const oldest = F.filter(f => f.open).sort((x, y) => y.dur - x.dur)[0];
  if (oldest && oldest.dur >= 90) out.push({ t: 'أقدم بلاغ مفتوح: <span class="ltr">' + esc(oldest.id) + '</span> في ' + oldest.center + ' (' + esc(oldest.co || 'بدون فني') + ') — <b>' + fmtDur(oldest.dur) + '</b>' + (oldest.dur >= 150 ? '، قريب من حد الـ3 ساعات النظامي' : '') + '.', lv: 'r' });
  const longest = F.filter(f => !f.open).sort((x, y) => y.dur - x.dur)[0];
  if (longest && longest.dur > 180) out.push({ t: 'أطول بلاغ انقفل: ' + fmtDur(longest.dur) + ' في ' + longest.center + ' (' + esc(longest.co || 'بدون فني') + ').' });
  const mass = groupBy(F.filter(f => f.kind === 'تذكرة مجمعة'), f => f.center);
  mass.forEach((L, c) => { if (L.length >= 10) out.push({ t: '<b>' + c + '</b>: ' + L.length + ' تذكرة مجمّعة بين ' + fmtTime(Math.min(...L.map(f => f.start))) + ' و' + fmtTime(Math.max(...L.map(f => f.start))) + ' — الغالب فصل مغذي.' }); });
  const nt = F.filter(f => !f.tech && !f.open).length;
  if (nt >= 5) out.push({ t: nt + ' بلاغ انقفل بدون فني مسند (الغالب رجعت الكهرباء عن بعد).' });
  return out;
}

function summary(A) {
  const a = A.all;
  let s = '📋 ملخص بلاغات ' + isoDay(A.t0) + ' (' + fmtTime(A.t0) + '–' + fmtTime(A.t1) + ')\n\n';
  s += (S.settings.onlyBuraydah ? 'بريدة' : 'القصيم') + ': ' + a.n + ' بلاغ · انحل ' + a.closed + ' · مفتوح ' + a.open + ' · متوسط ' + fmtDur(a.avg) + ' · خلال ساعة ' + a.within[0] + '% · تجاوز ساعتين ' + a.over + '\n\n';
  A.centers.forEach(x => s += '• ' + x.c + ': ' + x.r.n + ' بلاغ، متوسط ' + fmtDur(x.r.avg) + '، خلال ساعة ' + x.r.within[0] + '%' + (x.over ? '، تجاوز ساعتين ' + x.over : '') + '\n');
  const pts = insights(A, center);
  if (pts.length) { s += '\nأبرز النقاط:\n'; pts.forEach(p => s += '- ' + p.t.replace(/<[^>]+>/g, '') + '\n'); }
  return s;
}
export default { mount, render, tick: false };
export { days };
