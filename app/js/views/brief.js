/* التقرير اليومي: ملخص تحليلي لكل يوم من تقارير الكهرباء المرفوعة (نفس تحليل رئيس القسم) */
import { S } from '../store/repo.js';
import { faults } from '../analysis/model.js';
import { table, row } from '../analysis/stats.js';
import { CENTERS, escalation } from '../core/const.js';
import { trLabel } from '../core/geo.js';
import { esc, fmtDur, fmtTime, isoDay, DAY, HOUR, pct, groupBy, copy } from '../core/util.js';
import { waLink } from '../core/ui.js';

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
  F.forEach(f => { if (f.open || f.end > t1) { f.open = true; f.dur = Math.round((t1 - f.start) / 60000); } });
  const centers = CENTERS.map(c => ({ c, r: row(c, F.filter(f => f.center === c)), over: F.filter(f => f.center === c && f.dur > 120).length })).filter(x => x.r.n);
  const all = row('القصيم', F); all.over = F.filter(f => f.dur > 120).length;
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
  let h = '<div class="row">' + (D.length > 1 ? '<div class="seg">' + D.slice(0, 7).map(x => '<button data-d="' + x + '" aria-pressed="' + (x === day) + '">' + x.slice(5) + '</button>').join('') + '</div>' : '') +
    '<span class="spacer"></span><a class="tbtn primary" id="brWa" target="_blank" rel="noopener">أرسل الملخص واتساب</a><button class="tbtn" id="brCopy">نسخ</button></div>';
  h += '<div class="card brief-head"><div><h3>تقرير ' + dlabel + '</h3><p class="hint">' + A.snaps.length + ' تقرير كهرباء · من ' + fmtTime(A.t0) + ' إلى ' + fmtTime(A.t1) + (A.snaps.some(s => /29 أكتوبر/.test(s.file)) ? ' · نسخة منشورة بدون أسماء' : '') + '</p></div></div>';
  /* الأرقام الكبيرة */
  const a = A.all;
  h += '<div class="kgrid big"><div><b>' + a.n + '</b><span>بلاغ</span></div><div><b>' + a.closed + '</b><span>انحل</span></div><div class="' + (a.open ? 'w' : '') + '"><b>' + a.open + '</b><span>مفتوح وقت آخر تقرير</span></div><div><b>' + fmtDur(a.avg) + '</b><span>متوسط الإغلاق</span></div><div><b>' + a.within[0] + '%</b><span>انقفل خلال ساعة</span></div><div class="' + (a.over ? 'r' : '') + '"><b>' + a.over + '</b><span>تجاوز ساعتين</span></div></div>';
  /* أبرز النقاط */
  const pts = insights(A, center);
  if (pts.length) h += '<p class="sec-title">أبرز النقاط</p><div class="card"><ul class="insights">' + pts.map(p => '<li class="' + (p.lv || '') + '">' + p.t + '</li>').join('') + '</ul></div>';
  /* المراكز */
  const best = Math.min(...A.centers.filter(x => x.r.closed >= 5).map(x => x.r.avg)), worst = Math.max(...A.centers.filter(x => x.r.closed >= 5).map(x => x.r.avg));
  h += '<p class="sec-title">المراكز</p><div class="tbl-wrap"><table class="dtable"><thead><tr><th>المركز</th><th class="n">البلاغات</th><th class="n">انحل</th><th class="n">مفتوح</th><th class="n">متوسط الإغلاق</th><th class="n">خلال ساعة</th><th class="n">تجاوز ساعتين</th></tr></thead><tbody>' +
    A.centers.map(x => '<tr><td><b>' + x.c + '</b></td><td class="n">' + x.r.n + '</td><td class="n">' + x.r.closed + '</td><td class="n">' + (x.r.open || '—') + '</td><td class="n" style="' + (x.r.avg === worst && A.centers.length > 1 ? 'color:var(--bad);font-weight:700' : x.r.avg === best ? 'color:var(--ok);font-weight:700' : '') + '">' + fmtDur(x.r.avg) + '</td><td class="n">' + x.r.within[0] + '%</td><td class="n">' + (x.over || '—') + '</td></tr>').join('') +
    '<tr class="tot"><td><b>الإجمالي</b></td><td class="n"><b>' + a.n + '</b></td><td class="n">' + a.closed + '</td><td class="n">' + a.open + '</td><td class="n">' + fmtDur(a.avg) + '</td><td class="n">' + a.within[0] + '%</td><td class="n">' + a.over + '</td></tr></tbody></table></div>';
  /* الذروة */
  const hk = Object.keys(A.hours).map(Number).sort((x, y) => x - y);
  if (hk.length > 1) {
    const mx = Math.max(...hk.map(k => A.hours[k]));
    h += '<p class="sec-title">البلاغات الجديدة بالساعة' + (A.peak ? ' <small>الذروة ' + A.peak.from + ':00–' + A.peak.to + ':00</small>' : '') + '</p><div class="card"><div class="bars" style="direction:ltr">' +
      hk.map(k => '<div class="' + (A.peak && k >= A.peak.from && k < A.peak.to ? 'rain' : '') + '" style="height:' + (100 * A.hours[k] / mx) + '%" data-t="' + k + ':00 — ' + A.hours[k] + '"></div>').join('') + '</div>' +
      '<div class="row" style="direction:ltr;justify-content:space-between;font-size:.72rem;color:var(--muted)"><span>' + hk[0] + ':00</span><span>' + hk[hk.length - 1] + ':00</span></div></div>';
  }
  /* المقاولين في المركز المختار */
  const cs = CENTERS.filter(c => F.some(f => f.center === c));
  h += '<div class="row"><p class="sec-title" style="margin:0">المقاولين</p><span class="spacer"></span><div class="seg">' + cs.map(c => '<button data-c="' + c + '" aria-pressed="' + (c === center) + '">' + c + '</button>').join('') + '</div></div>';
  const T = table(FC, 'co').filter(r => r.n);
  const enough = T.filter(r => r.closed >= 5), slow = enough.length ? Math.max(...enough.map(r => r.avg)) : -1, fast = enough.length ? Math.min(...enough.map(r => r.avg)) : -1;
  h += T.length ? '<div class="tbl-wrap"><table class="dtable"><thead><tr><th>المقاول</th><th class="n">البلاغات</th><th class="n">مفتوح</th><th class="n">المتوسط</th><th class="n">خلال ساعة</th><th class="n">تجاوز ساعتين</th></tr></thead><tbody>' +
    T.map(r => { const over = FC.filter(f => (f.co || (f.tech ? 'غير محدد' : 'بدون فني')) === r.k && f.dur > 120).length;
      return '<tr><td>' + esc(r.k) + (r.avg === slow && enough.length > 1 ? ' <span class="pill red">الأبطأ</span>' : r.avg === fast && enough.length > 1 ? ' <span class="pill green">الأفضل</span>' : '') + '</td><td class="n"><b>' + r.n + '</b></td><td class="n">' + (r.open || '—') + '</td><td class="n">' + (r.closed ? fmtDur(r.avg) : '—') + '</td><td class="n">' + (r.closed ? r.within[0] + '%' : '—') + '</td><td class="n" style="' + (over ? 'color:var(--bad);font-weight:700' : '') + '">' + (over || '—') + '</td></tr>'; }).join('') + '</tbody></table></div>'
    : '<div class="empty">ما فيه بلاغات لهالمركز.</div>';
  /* المفتوح الأقدم + النقاط الساخنة */
  const open = FC.filter(f => f.open).sort((x, y) => y.dur - x.dur);
  if (open.length) h += '<p class="sec-title">مفتوح وقت آخر تقرير — ' + center + ' <small>' + open.length + '</small></p><div class="tbl-wrap"><table class="dtable"><thead><tr><th>المهمة</th><th>المحول</th><th>المقاول</th><th class="n">العمر</th><th>التصعيد</th></tr></thead><tbody>' +
    open.slice(0, 10).map(f => '<tr><td class="ltr">' + esc(f.id) + '</td><td class="ltr">' + esc(f.ref.tr || '') + '</td><td>' + esc(f.co || 'بدون فني') + '</td><td class="n" style="' + (f.dur >= 120 ? 'color:var(--bad);font-weight:700' : '') + '">' + fmtDur(f.dur) + '</td><td style="font-size:.78rem">' + escalation(f.dur).t + '</td></tr>').join('') + '</tbody></table></div>';
  h += hotspotsHtml(FC, center);
  box.innerHTML = h;
  const text = summary(A);
  box.querySelector('#brWa').href = waLink(text);
  box.querySelector('#brCopy').onclick = () => copy(text);
  box.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { day = b.dataset.d; render(); });
  box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { center = b.dataset.c; render(); });
}

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
  s += 'القصيم: ' + a.n + ' بلاغ · انحل ' + a.closed + ' · مفتوح ' + a.open + ' · متوسط ' + fmtDur(a.avg) + ' · خلال ساعة ' + a.within[0] + '% · تجاوز ساعتين ' + a.over + '\n\n';
  A.centers.forEach(x => s += '• ' + x.c + ': ' + x.r.n + ' بلاغ، متوسط ' + fmtDur(x.r.avg) + '، خلال ساعة ' + x.r.within[0] + '%' + (x.over ? '، تجاوز ساعتين ' + x.over : '') + '\n');
  const pts = insights(A, center);
  if (pts.length) { s += '\nأبرز النقاط:\n'; pts.forEach(p => s += '- ' + p.t.replace(/<[^>]+>/g, '') + '\n'); }
  return s;
}
export default { mount, render, tick: false };
export { days };
