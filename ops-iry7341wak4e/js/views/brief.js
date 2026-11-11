/* التقرير اليومي: ملخص تحليلي لكل يوم من تقارير الكهرباء المرفوعة (نفس تحليل رئيس القسم) */
import { S } from '../store/repo.js';
import { faults } from '../analysis/model.js';
import { table, row } from '../analysis/stats.js';
import { CENTERS, escalation, DEL_INFO } from '../core/const.js';
import { trLabel } from '../core/geo.js';
import { makeMap } from '../core/ui.js';
import { esc, fmtDur, fmtTime, isoDay, DAY, HOUR, pct, groupBy, copy } from '../core/util.js';
import { waLink } from '../core/ui.js';
import { hbar, stack100, hours } from '../core/charts.js';
import { isEnded, DEF_TARGETS, scorecard, contractorBoard, keyMessages, recommendations, RAG_LABEL, PRIO } from '../analysis/exec.js';

let root, day = '', center = 'بريدة', full = false, areaMap = null;

function mount(el) { root = el; el.innerHTML = '<div class="pad" id="brBody"></div>'; }

/* الأيام اللي فيها تقارير مرفوعة، الأحدث أول */
const days = () => [...new Set(S.snapshots.map(s => isoDay(s.at)))].sort().reverse();

/* 'all' = الحدث كامل: من بداية الحدث المعلن، وإلا كل التقارير المتتالية (بدون فجوة أكثر من يومين) */
function eventSnaps() {
  const A = S.snapshots; if (!A.length) return [];
  if (S.event.start) { const x = A.filter(s => s.at >= S.event.start - 6 * HOUR); if (x.length) return x; }
  let i = A.length - 1; while (i > 0 && A[i].at - A[i - 1].at <= 2 * DAY) i--;
  return A.slice(i);
}
export function analyzeDay(d) {
  const snaps = d === 'all' ? eventSnaps() : S.snapshots.filter(s => isoDay(s.at) === d);
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
  /* تطور المفتوح عبر التقارير + الوارد والمنقفل آخر ساعة */
  const ids = new Set(F.map(f => f.id));
  const series = snaps.map(s => ({ at: s.at, n: s.rows.filter(r => ids.has(r.task)).length }));
  const inflow = F.filter(f => f.start >= t1 - HOUR).length, outflow = F.filter(f => !f.open && f.end >= t1 - HOUR && f.end <= t1).length;
  return { d, snaps, t0, t1, F, centers, all, hours, peak, series, inflow, outflow };
}

function render() {
  if (!root) return;
  const box = root.querySelector('#brBody'), D = days();
  if (!D.length) { box.innerHTML = '<div class="hero"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4h6v3H9zM6 6H5v15h14V6h-1"/><path d="M9 12h6M9 16h4"/></svg></div><h3>ما فيه تقارير للحين</h3><p>ارفع تقرير توجيه البلاغات (PDF)، ويطلع هنا ملخص اليوم: المراكز، المقاولين، الذروة، والنقاط الساخنة.</p><label class="tbtn primary" for="pdfIn">رفع التقرير</label></div>'; return; }
  if (day !== 'all' && !D.includes(day)) day = D[0];
  const A = analyzeDay(day), F = A.F, FC = F.filter(f => f.center === center);
  A.ended = day === 'all' && isEnded(A);
  A.exclIds = Object.keys(DEL_INFO).filter(k => DEL_INFO[k] >= A.t0 - 6 * HOUR && DEL_INFO[k] <= A.t1); A.excl = A.exclIds.length;
  const dl = t => new Date(t).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long' });
  const dlabel = isoDay(A.t0) === isoDay(A.t1) ? dl(A.t0) : dl(A.t0) + ' ← ' + dl(A.t1);
  const T = Object.assign({ ...DEF_TARGETS }, S.settings.targets || {}), a = A.all;
  let sn = 0; const N = () => ++sn;
  const EV = day === 'all', multi = isoDay(A.t0) !== isoDay(A.t1);
  const noCause = F.filter(f => !f.open && !f.cause).length, located = pct(F.filter(f => f.lat != null).length, F.length);
  let h = '<div class="row no-print">' + '<div class="seg">' + D.slice(0, 7).map(x => '<button data-d="' + x + '" aria-pressed="' + (x === day) + '">' + x.slice(5) + '</button>').join('') + '<button data-d="all" aria-pressed="' + (day === 'all') + '">تقرير الحدث كامل</button></div>' +
    '<span class="spacer"></span><div class="seg"><button data-v="0" aria-pressed="' + !full + '">مختصر</button><button data-v="1" aria-pressed="' + full + '">مفصّل</button></div><button class="tbtn primary" id="brPrint"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><path d="M6 14h12v7H6z"/></svg>التقرير التنفيذي (PDF)</button><a class="tbtn" id="brWa" target="_blank" rel="noopener">واتساب</a><button class="tbtn" id="brCopy">نسخ</button></div>';
  /* الغلاف */
  h += '<div class="rep-cover"><div class="rep-brand"><span class="logo"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/></svg></span><div><small>قسم الصيانة والطوارئ · الجهد المتوسط والمنخفض · ' + (S.settings.onlyBuraydah ? 'بريدة' : 'القصيم') + '</small><h2>' + (EV ? (A.ended ? 'التقرير الختامي' : 'تقرير الحدث') + (F.some(f => f.rain) ? ' — حالة الأمطار' : '') : 'تقرير أداء معالجة الأعطال') + '</h2><p>' + dlabel + ' · ' + fmtTime(A.t0) + ' – ' + fmtTime(A.t1) + ' · ' + A.snaps.length + ' تقرير توجيه بلاغات</p></div></div></div>';
  /* الخلاصة التنفيذية */
  h += '<section class="rep-sec"><h3 class="rep-h"><span class="sn"></span>الخلاصة التنفيذية</h3><ol class="msgs">' + keyMessages(A, center, T).map(m => '<li>' + m + '</li>').join('') + '</ol></section>';
  /* مؤشرات الأداء مقابل الأهداف */
  const SC = scorecard(F, T), ICON = { g: '✓', a: '!', r: '✕', n: '' };
  h += '<section class="rep-sec"><h3 class="rep-h"><span class="sn"></span>مؤشرات الأداء مقابل الأهداف <small>' + (S.settings.onlyBuraydah ? 'بريدة' : 'القصيم') + '</small></h3><div class="kpis-x">' + SC.map(k =>
    '<div class="kx ' + k.s + '"><span class="kx-t">' + k.t + '</span><b>' + (k.v == null ? '—' : k.unit === 'د' ? fmtDur(k.v) : k.v + k.unit) + '</b><span class="kx-g">الهدف ' + (k.unit === 'د' ? '≤ ' + k.target + ' د' : (k.k === 'over180' ? k.target : k.target + k.unit)) + '</span><span class="rag ' + k.s + '"><i>' + ICON[k.s] + '</i>' + RAG_LABEL[k.s] + '</span></div>').join('') + '</div>' +
    '<div class="vol"><span><b>' + a.n + '</b> بلاغ' + (F.some(f => f.kind && f.kind !== 'بلاغ مشترك') ? ' (' + F.filter(f => f.kind === 'بلاغ مشترك').length + ' مشترك + ' + F.filter(f => f.kind && f.kind !== 'بلاغ مشترك').length + ' تذكرة مجمّعة)' : '') + '</span><span><b>' + a.closed + '</b> انحل</span><span><b>' + a.open + '</b> مفتوح وقت آخر تقرير</span><span><b>' + a.over + '</b> تجاوز ساعتين</span></div></section>';
  /* خريطة المناطق الأكثر تأثرًا */
  const AR = areas(FC); curCells = AR.cells;
  if (AR.cells.length) {
    h += '<section class="rep-sec"><h3 class="rep-h"><span class="sn"></span>المناطق الأكثر تأثرًا — ' + center + ' <small>' + AR.located + ' من ' + FC.length + ' بلاغ معروف موقعه</small></h3><div class="card area-card"><div class="area-map" id="areaMap"></div>' +
      '<div class="area-lg"><span><i style="background:#F4A259"></i>أقل</span><span><i style="background:#EA580C"></i>متوسط</span><span><i style="background:#B91C1C"></i>أكثر</span><span>الرقم = عدد البلاغات ضمن نطاق 1 كم تقريبًا</span></div></div>' +
      '<div class="tbl-wrap"><table class="dtable"><thead><tr><th>#</th><th class="n">البلاغات</th><th class="n">تجاوز ساعتين</th><th>أكثر المحولات</th><th>المقاول</th><th class="no-print">الموقع</th></tr></thead><tbody>' +
      AR.cells.slice(0, 6).map((c, i) => { const trs = [...groupBy(c.L.filter(f => f.tr), f => f.tr)].sort((x, y) => y[1].length - x[1].length).slice(0, 2);
        return '<tr><td><b>' + (i + 1) + '</b></td><td class="n"><b>' + c.L.length + '</b></td><td class="n">' + (c.L.filter(f => f.dur > 120).length || '—') + '</td><td><span class="ltr">' + trs.map(([k, L]) => esc(trLabel(k)) + ' (' + L.length + ')').join('، ') + '</span></td><td>' + esc([...new Set(c.L.map(f => f.co).filter(Boolean))].slice(0, 2).join('، ') || '—') + '</td><td class="no-print"><a target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + c.lat.toFixed(5) + ',' + c.lng.toFixed(5) + '">فتح</a></td></tr>'; }).join('') + '</tbody></table></div></section>';
  }
  /* تطور المفتوح */
  if (A.series.length >= 3) {
    const mx = Math.max(1, ...A.series.map(x => x.n)), pk = Math.max(...A.series.map(x => x.n)), lastN = A.series[A.series.length - 1].n, up = lastN >= 1.5 * Math.max(1, A.series[0].n) && lastN > .6 * pk;
    h += '<section class="rep-sec"><h3 class="rep-h"><span class="sn"></span>تطور البلاغات المفتوحة <small>في كل تقرير' + (up ? ' · في تصاعد' : '') + '</small></h3><div class="card"><div class="hr-wrap"><div class="bars hr" style="direction:ltr">' +
      A.series.map((x, i) => '<div class="' + (i === A.series.length - 1 ? 'rain' : '') + '" style="height:' + (100 * x.n / mx) + '%" data-t="' + fmtTime(x.at) + ' — ' + x.n + ' مفتوح"><span>' + x.n + '</span></div>').join('') + '</div>' +
      '<div class="hr-ax" style="direction:ltr">' + A.series.map((x, i, Z) => { const st = Math.ceil(Z.length / 12); return '<span>' + (i % st === 0 || i === Z.length - 1 ? new Date(x.at).toTimeString().slice(0, 5) : '') + '</span>'; }).join('') + '</div></div>' +
      '<p class="hint">خلال الساعة الأخيرة: ورد <b>' + A.inflow + '</b> بلاغًا وأُغلق <b>' + A.outflow + '</b>.' + (A.inflow > A.outflow ? ' الوارد يفوق المُغلق، ما يعني استمرار ارتفاع المفتوح.' : '') + '</p></div></section>';
  }
  /* المراكز */
  const ok = A.centers.filter(x => x.r.closed);
  if (A.centers.length > 1) h += '<section class="rep-sec"><h3 class="rep-h"><span class="sn"></span>مقارنة المراكز <small>متوسط مدة الإغلاق مقابل الهدف ' + T.avg + ' د</small></h3><div class="card">' +
    hbar(ok.map(x => ({ label: x.c, v: x.r.avg, txt: fmtDur(x.r.avg), warn: x.r.avg > T.avg })).sort((x, y) => y.v - x.v), { target: T.avg, targetTxt: 'الهدف' }) + '</div>' +
    '<div class="tbl-wrap"><table class="dtable"><thead><tr><th>المركز</th><th class="n">البلاغات</th><th class="n">انحل</th><th class="n">مفتوح</th><th class="n">المتوسط</th><th class="n">خلال ساعة</th><th class="n">خلال 3 ساعات</th><th class="n">تجاوز ساعتين</th></tr></thead><tbody>' +
    A.centers.map(x => '<tr><td><b>' + x.c + '</b></td><td class="n">' + x.r.n + '</td><td class="n">' + x.r.closed + '</td><td class="n">' + (x.r.open || '—') + '</td><td class="n">' + fmtDur(x.r.avg) + '</td><td class="n"><span class="rag sm ' + (x.r.within[0] >= T.w60 ? 'g' : x.r.within[0] >= T.w60 - 10 ? 'a' : 'r') + '">' + x.r.within[0] + '%</span></td><td class="n">' + x.r.within[3] + '%</td><td class="n">' + (x.over || '—') + '</td></tr>').join('') +
    '<tr class="tot"><td><b>الإجمالي</b></td><td class="n"><b>' + a.n + '</b></td><td class="n">' + a.closed + '</td><td class="n">' + a.open + '</td><td class="n">' + fmtDur(a.avg) + '</td><td class="n">' + a.within[0] + '%</td><td class="n">' + a.within[3] + '%</td><td class="n">' + a.over + '</td></tr></tbody></table></div></section>';
  /* الطلب بالساعة */
  const hk = Object.keys(A.hours).map(Number).sort((x, y) => x - y);
  if (hk.length > 1) h += '<section class="rep-sec rep-full"><h3 class="rep-h"><span class="sn"></span>نمط الطلب خلال اليوم' + (A.peak ? ' <small>الذروة ' + A.peak.from + ':00–' + A.peak.to + ':00 · ' + A.peak.x + '× المعدل</small>' : '') + '</h3><div class="card">' + hours(hk, A.hours, A.peak) + '<p class="hint">عدد البلاغات الجديدة حسب ساعة فتحها. الأعمدة الغامقة = فترة الذروة.</p></div></section>';
  /* المقاولين */
  const cs = CENTERS.filter(c => F.some(f => f.center === c)), B = contractorBoard(FC);
  h += '<section class="rep-sec"><div class="row"><h3 class="rep-h" style="margin:0"><span class="sn"></span>أداء المقاولين — ' + center + '</h3><span class="spacer"></span><div class="seg no-print">' + cs.map(c => '<button data-c="' + c + '" aria-pressed="' + (c === center) + '">' + c + '</button>').join('') + '</div></div>';
  h += B.length ? '<div class="tbl-wrap"><table class="dtable"><thead><tr><th>المقاول</th><th class="n">البلاغات</th><th class="n">مفتوح</th><th class="n">المتوسط</th><th class="n">خلال ساعة</th><th class="n">تجاوز ساعتين</th><th class="n">الدرجة</th></tr></thead><tbody>' +
    B.map(r => '<tr' + (r.real ? '' : ' class="muted"') + '><td>' + esc(r.k) + '</td><td class="n"><b>' + r.n + '</b></td><td class="n">' + (r.open || '—') + '</td><td class="n">' + (r.closed ? fmtDur(r.avg) : '—') + '</td><td class="n">' + (r.closed ? r.within[0] + '%' : '—') + '</td><td class="n">' + (r.over120 || '—') + '</td><td class="n">' + (r.real && r.score != null ? '<span class="rag sm ' + r.s + '">' + r.score + '</span>' : '—') + '</td></tr>').join('') + '</tbody></table></div>' +
    '<div class="card rep-full"><p class="pg" style="margin:0">توزيع مدة الإغلاق لكل مقاول</p>' + stack100(B.filter(r => r.n >= 3).map(r => ({ label: r.k, parts: r.b }))) + '<p class="hint">الدرجة من 100 = نصفها نسبة الإغلاق خلال ساعة، ونصفها الالتزام بعدم تجاوز ساعتين. أخضر ≥ 75، برتقالي ≥ 60.</p></div>'
    : '<div class="empty">لا توجد بلاغات لهذا المركز.</div>';
  h += '</section>';
  /* التركّز على المغذيات (من تقرير ربط LV بشبكة MV) */
  const withNet = F.filter(f => f.net && f.net.feeder);
  if (withNet.length >= 5) {
    const G = [...groupBy(withNet, f => f.net.sub + '/' + f.net.feeder)].map(([k, L]) => ({ k, L, zones: new Set(L.map(f => f.net.zone).filter(Boolean)).size, trs: new Set(L.map(f => f.net.trNo).filter(Boolean)).size, open: L.filter(f => f.open).length })).sort((x, y) => y.L.length - x.L.length);
    h += '<section class="rep-sec rep-full"><h3 class="rep-h"><span class="sn"></span>التركّز على المغذيات <small>' + withNet.length + ' من ' + F.length + ' بلاغ مربوط بالشبكة</small></h3><div class="tbl-wrap"><table class="dtable"><thead><tr><th>المحطة / المغذي</th><th class="n">البلاغات</th><th class="n">مفتوح</th><th class="n">زونات</th><th class="n">محولات</th><th>أكثر نقطة عزل</th></tr></thead><tbody>' +
      G.slice(0, 10).map(g => { const iso = [...groupBy(g.L.filter(f => f.net.iso), f => f.net.iso)].sort((a, b) => b[1].length - a[1].length)[0];
        return '<tr><td class="ltr" style="text-align:right"><b>' + esc(g.k) + '</b></td><td class="n"><b>' + g.L.length + '</b></td><td class="n">' + (g.open || '—') + '</td><td class="n">' + g.zones + '</td><td class="n">' + g.trs + '</td><td class="ltr" style="text-align:right">' + (iso ? esc(iso[0]) + ' (' + iso[1].length + ')' : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="hint">تعدد البلاغات على مغذٍ واحد عبر أكثر من منطقة يرجّح وجود مشكلة في الجهد المتوسط (فصل أو تذبذب) لا أعطالًا فردية.</p></section>';
    A.feeders = G;
  }
  if (EV) {
    /* يوم بيوم */
    if (multi) {
      const byDay = [...groupBy(F, f => isoDay(f.start))].sort((x, y) => x[0] < y[0] ? -1 : 1);
      h += '<section class="rep-sec rep-full"><h3 class="rep-h"><span class="sn"></span>الحدث يوم بيوم</h3><div class="tbl-wrap"><table class="dtable"><thead><tr><th>اليوم</th><th class="n">البلاغات</th><th class="n">انحل</th><th class="n">المتوسط</th><th class="n">خلال ساعة</th><th class="n">تجاوز ساعتين</th><th class="n">تجاوز 3 ساعات</th></tr></thead><tbody>' +
        byDay.map(([d, L]) => { const r = row(d, L); return '<tr><td><b class="ltr">' + d + '</b>' + (S.settings.rainDays[d] ? ' <span class="pill blue">مطر</span>' : '') + '</td><td class="n">' + r.n + '</td><td class="n">' + r.closed + '</td><td class="n">' + (r.closed ? fmtDur(r.avg) : '—') + '</td><td class="n">' + (r.closed ? r.within[0] + '%' : '—') + '</td><td class="n">' + (L.filter(f => f.dur > 120).length || '—') + '</td><td class="n">' + (L.filter(f => f.dur > 180).length || '—') + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
    }
    /* مقارنة مع الأيام العادية */
    const evDays = new Set(F.map(f => isoDay(f.start))), base = faults({ from: A.t0 - 60 * DAY, to: A.t0 }).filter(f => f.src === 'sec' && !f.open && !evDays.has(isoDay(f.start)));
    if (base.length >= 20) {
      const rb = row('', base), nd = new Set(base.map(f => isoDay(f.start))).size, ed = Math.max(1, evDays.size);
      h += '<section class="rep-sec rep-full"><h3 class="rep-h"><span class="sn"></span>مقارنة مع الأيام العادية <small>' + nd + ' يوم قبل الحدث</small></h3><div class="kgrid big"><div><b>' + Math.round(10 * (F.length / ed) / (base.length / nd)) / 10 + '×</b><span>حجم البلاغات اليومي</span></div><div><b>' + fmtDur(a.avg) + '</b><span>متوسط الإغلاق (العادي ' + fmtDur(rb.avg) + ')</span></div><div><b>' + a.within[0] + '%</b><span>خلال ساعة (العادي ' + rb.within[0] + '%)</span></div></div></section>';
    }
    /* المحولات الأكثر تكرارًا */
    const TR = [...groupBy(FC.filter(f => f.tr), f => f.tr)].filter(([, L]) => L.length >= 3).sort((x, y) => y[1].length - x[1].length);
    if (TR.length) h += '<section class="rep-sec rep-full"><h3 class="rep-h"><span class="sn"></span>المحولات الأكثر تكرارًا — ' + center + ' <small>' + TR.length + ' محول عليه 3 بلاغات أو أكثر</small></h3><div class="tbl-wrap"><table class="dtable"><thead><tr><th>المحول</th><th class="n">البلاغات</th><th class="n">مجمّعة</th><th class="n">مفتوح</th><th>المقاول</th><th>الفترة</th></tr></thead><tbody>' +
      TR.slice(0, 15).map(([k, L]) => '<tr><td class="ltr">' + esc(trLabel(k)) + '</td><td class="n"><b>' + L.length + '</b></td><td class="n">' + (L.filter(f => f.kind !== 'بلاغ مشترك').length || '—') + '</td><td class="n">' + (L.filter(f => f.open).length || '—') + '</td><td>' + esc([...new Set(L.map(f => f.co || 'بدون فني'))].join('، ')) + '</td><td>' + fmtTime(Math.min(...L.map(f => f.start))) + ' – ' + fmtTime(Math.max(...L.map(f => f.start))) + '</td></tr>').join('') + '</tbody></table></div><p class="hint">هذي المحولات مرشحة للفحص والعزل ضد الماء قبل الحالة المطرية الجاية (تفاصيلها في «الحصر»).</p></section>';
    /* الدروس المستفادة */
    const LS = lessons(A, FC, TR);
    if (LS.length) h += '<section class="rep-sec rep-full"><h3 class="rep-h"><span class="sn"></span>الدروس المستفادة</h3><div class="card"><ul class="insights">' + LS.map(x => '<li>' + x + '</li>').join('') + '</ul></div></section>';
  }
  /* التوصيات */
  const B0 = Math.max(1, S.settings.baseline || 15), wx = S.settings.wx, op = a.open;
  const sugLv = wx === 'red' ? 4 : (wx === 'orange' || op >= 3 * B0) ? 3 : (wx === 'yellow' || op >= 2 * B0) ? 2 : 1;
  const RC = recommendations(A, center, T, { noCause, located, level: S.event.level || 1, sugLv, B0, feeders: A.feeders })
    .filter(r => !A.ended || !/إعلان المستوى|نقل فرق إضافية|تصعيد فوري/.test(r.a || r.act || r.t || JSON.stringify(r)));
  if (RC.length) h += '<section class="rep-sec"><h3 class="rep-h"><span class="sn"></span>التوصيات والإجراءات</h3><div class="tbl-wrap"><table class="dtable recs lim5"><thead><tr><th>الأولوية</th><th>الإجراء</th><th>المبرر</th><th>المسؤول</th></tr></thead><tbody>' +
    RC.map(r => '<tr><td><span class="prio p' + r.p + '">' + PRIO[r.p] + '</span></td><td><b>' + bidi(r.t) + '</b></td><td>' + bidi(r.why) + '</td><td>' + esc(r.who) + '</td></tr>').join('') + '</tbody></table></div></section>';
  /* ملاحظات تشغيلية */
  const pts = insights(A, center);
  if (pts.length) h += '<section class="rep-sec rep-full"><h3 class="rep-h"><span class="sn"></span>ملاحظات تشغيلية</h3><div class="card"><ul class="insights">' + pts.map(p => '<li class="' + (p.lv || '') + '">' + p.t + '</li>').join('') + '</ul></div></section>';
  const open = FC.filter(f => f.open).sort((x, y) => y.dur - x.dur);
  if (open.length) h += '<section class="rep-sec rep-full"><h3 class="rep-h"><span class="sn"></span>المفتوح وقت آخر تقرير — ' + center + ' <small>' + open.length + '</small></h3><div class="tbl-wrap"><table class="dtable"><thead><tr><th>المهمة</th><th>المحول</th><th>المقاول</th><th class="n">العمر</th><th>التصعيد</th></tr></thead><tbody>' +
    open.slice(0, 10).map(f => '<tr><td class="ltr">' + esc(f.id) + '</td><td class="ltr">' + esc(f.ref.tr || '') + '</td><td>' + esc(f.co || 'بدون فني') + '</td><td class="n" style="' + (f.dur >= 120 ? 'color:var(--bad);font-weight:700' : '') + '">' + fmtDur(f.dur) + '</td><td style="font-size:.78rem">' + escalation(f.dur).t + '</td></tr>').join('') + '</tbody></table></div></section>';
  h += '<div class="rep-full">' + hotspotsHtml(FC, center) + '</div>';
  h += '<section class="rep-sec rep-method"><h3 class="rep-h"><span>i</span>المنهجية وحدود البيانات</h3><p class="hint">المصدر: تقارير «توجيه بلاغات المشتركين المسجلة» من إدارة كهرباء القصيم. كل تقرير يعرض البلاغات المفتوحة وقت صدوره؛ البلاغ الذي يختفي من التقرير التالي يُحتسب مُغلقًا، ووقت إغلاقه = منتصف الفترة بين التقريرين (الدقة عادةً ± ' + (() => { const g = A.snaps.slice(1).map((s, i) => s.at - A.snaps[i].at).sort((x, y) => x - y); return g.length ? Math.round(g[g.length >> 1] / 120000) : 0; })() + ' د). البلاغات التي فُتحت وأُغلقت قبل أول تقرير لا تظهر. المقاول مستنتج من اسم الفني. الأهداف قابلة للتعديل من الإعدادات.' + (A.excl ? ' استُبعد من الأرقام ' + A.excl + ' بلاغ بقرار رئيس القسم (' + A.exclIds.join('، ') + ').' : '') + '</p></section>';
  box.innerHTML = h; box.classList.toggle('rep-compact', !full);
  drawAreas();
  const text = summary(A);
  box.querySelector('#brWa').href = waLink(text);
  box.querySelector('#brCopy').onclick = () => copy(text);
  box.querySelector('#brPrint').onclick = () => { document.body.classList.add('printing'); if (areaMap) areaMap.invalidateSize(); setTimeout(() => { window.print(); }, 300); };
  box.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { day = b.dataset.d; render(); });
  box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { center = b.dataset.c; render(); });
  box.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { full = b.dataset.v === '1'; render(); });
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
    trs.slice(0, 8).map(([k, L]) => '<li>محول <span class="ltr">' + esc(trLabel(k)) + '</span>' + (label ? '' : ' (' + L[0].center + ')') + ': <b>' + L.length + ' بلاغات</b> (' + [...new Set(L.map(f => f.co || 'بدون فني'))].join('، ') + ')' + (L.some(f => f.open) ? ' · يوجد مفتوح' : '') + '</li>').join('') + '</ul></div>';
}
export const latestDay = () => days()[0] || '';

window.addEventListener('beforeprint', () => { if (areaMap) { areaMap.invalidateSize(false); areaMap._fit(); } });
/* تجميع البلاغات المعروف موقعها في مربعات ~1 كم */
let curCells = [];
function areas(FC) {
  const loc = FC.filter(f => f.lat != null), g = new Map(), K = 0.01;
  loc.forEach(f => { const k = Math.round(f.lat / K) + ':' + Math.round(f.lng / K); if (!g.has(k)) g.set(k, []); g.get(k).push(f); });
  const cells = [...g.values()].map(L => ({ L, lat: L.reduce((x, f) => x + f.lat, 0) / L.length, lng: L.reduce((x, f) => x + f.lng, 0) / L.length })).sort((x, y) => y.L.length - x.L.length);
  return { cells, located: loc.length };
}
function drawAreas() {
  if (areaMap) { areaMap.remove(); areaMap = null; }
  const el = root.querySelector('#areaMap'); if (!el || !window.L || !curCells.length) return;
  const C = curCells, mx = Math.max(1, ...C.map(c => c.L.length));
  el.parentElement.querySelectorAll('.mctl').forEach(x => x.remove());
  areaMap = makeMap(el, { zones: false, base: 'streets' }); areaMap.scrollWheelZoom.disable();
  const col = n => { const t = n / mx; return t > .5 ? '#B91C1C' : t > .2 ? '#EA580C' : '#F4A259'; };
  C.slice().reverse().forEach(c => {
    const n = c.L.length, r = 7 + 20 * Math.sqrt(n / mx);
    L.circleMarker([c.lat, c.lng], { radius: r, color: '#fff', weight: 1.5, fillColor: col(n), fillOpacity: .8 }).addTo(areaMap);
    if (n >= 3) L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'area-ic', html: '<b>' + n + '</b>', iconSize: [30, 18] }), interactive: false }).addTo(areaMap);
  });
  /* نركّز على المربعات اللي فيها أغلب البلاغات عشان الأطراف البعيدة ما تصغّر الخريطة */
  const pts = C.slice(0, 15).map(c => [c.lat, c.lng]);
  areaMap._fit = () => areaMap.fitBounds(L.latLngBounds(pts).pad(.08), { maxZoom: 14, animate: false });
  areaMap._fit();
  setTimeout(() => { if (areaMap) { areaMap.invalidateSize(false); areaMap._fit(); } }, 80);
}

/* دروس الحدث: تُستخرج من الأرقام */
function lessons(A, FC, TR) {
  const out = [], late = FC.filter(f => f.dur > 120), nt = late.filter(f => !f.tech).length;
  if (late.length >= 5 && pct(nt, late.length) >= 30) out.push('<b>الإسناد هو عنق الزجاجة:</b> ' + pct(nt, late.length) + '% من البلاغات التي تجاوزت ساعتين (' + nt + ' من ' + late.length + ') ما كان مسند لها فني. المطلوب: آلية إسناد سريعة وقت الذروة ومتابعة المشرف كل 30 دقيقة.');
  const sr = A.series || [], pk = sr.length ? sr.reduce((m, x) => x.n > m.n ? x : m, sr[0]) : null;
  if (pk && sr.length >= 3) out.push('<b>ذروة المفتوح:</b> ' + pk.n + ' بلاغ الساعة ' + fmtTime(pk.at) + (sr[0].n ? '، أي ' + Math.round(10 * pk.n / Math.max(1, sr[0].n)) / 10 + '× بداية الحدث' : '') + '. جاهزية الفرق الإضافية لازم تسبق هالوقت.');
  if (A.peak) out.push('<b>وقت الضغط:</b> بين ' + A.peak.from + ':00 و' + A.peak.to + ':00 بمعدل ' + A.peak.perHour + ' بلاغًا في الساعة؛ ويُوصى بتعزيز ورديات المقاولين في هذه الفترة.');
  if (TR.length) out.push('<b>' + TR.length + ' محول تكرر عليه 3 بلاغات أو أكثر</b> (أعلاها ' + trLabel(TR[0][0]) + ' بـ' + TR[0][1].length + '): تدخل برنامج العزل والإحكام قبل الموسم.');
  const B = contractorBoard(FC).filter(r => r.real && r.closed >= 5);
  if (B.length > 1) out.push('<b>تفاوت المقاولين:</b> الأفضل ' + esc(B[0].k) + ' (' + B[0].score + '/100) والأضعف ' + esc(B[B.length - 1].k) + ' (' + B[B.length - 1].score + '/100). يُراجع توزيع الفرق والمناطق حسب الأداء.');
  const over = FC.filter(f => f.dur > 180), und = over.filter(f => !f.ref.delay).length;
  if (over.length) out.push('<b>' + over.length + ' بلاغ تجاوز 3 ساعات</b>' + (und ? '، منها ' + und + ' بدون سبب موثّق — يُستكمل التوثيق من شاشة «حد 3 ساعات» قبل انتهاء مهلة الـ5 أيام.' : '، وكلها موثّقة السبب ✓'));
  const gap = Math.max(0, ...A.snaps.slice(1).map((x, i) => x.at - A.snaps[i].at)) / 60000;
  if (gap > 60) out.push('<b>دقة البيانات:</b> أطول فجوة بين تقريرين ' + fmtDur(gap) + '. رفع التقرير كل 30 دقيقة وقت الحدث يعطي أوقات إغلاق أدق.');
  return out;
}

/* أبرز النقاط بكلام واضح */
function insights(A, focus) {
  const out = [], F = A.F, a = A.all;
  const ok = A.centers.filter(x => x.r.closed >= 5).sort((x, y) => y.r.avg - x.r.avg);
  if (ok.length > 1) out.push({ t: '<b>' + ok[0].c + '</b> الأبطأ: متوسط الإغلاق ' + fmtDur(ok[0].r.avg) + ' و' + ok[0].r.within[0] + '% فقط أُغلقت خلال ساعة (الأسرع ' + ok[ok.length - 1].c + ' ' + fmtDur(ok[ok.length - 1].r.avg) + ').', lv: ok[0].c === focus ? 'r' : '' });
  if (A.peak && A.peak.x >= 1.5) out.push({ t: 'الذروة من <b>' + A.peak.from + ':00 إلى ' + A.peak.to + ':00</b>: بمعدل ' + A.peak.perHour + ' بلاغ بالساعة، أي <b>' + A.peak.x + '×</b> باقي اليوم.' });
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
  if (longest && longest.dur > 180) out.push({ t: 'أطول بلاغ مُغلق: ' + fmtDur(longest.dur) + ' في ' + longest.center + ' (' + esc(longest.co || 'بدون فني') + ').' });
  const mass = groupBy(F.filter(f => f.kind === 'تذكرة مجمعة'), f => f.center);
  mass.forEach((L, c) => { if (L.length >= 10) out.push({ t: '<b>' + c + '</b>: ' + L.length + ' تذكرة مجمّعة بين ' + fmtTime(Math.min(...L.map(f => f.start))) + ' و' + fmtTime(Math.max(...L.map(f => f.start))) + ' — الغالب فصل مغذي.' }); });
  const nt = F.filter(f => !f.tech && !f.open).length;
  if (nt >= 5) out.push({ t: nt + ' بلاغًا أُغلق دون إسناد فني (يرجّح عودة التيار عن بُعد).' });
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
