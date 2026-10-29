/* 6) الإحصائيات: يومي/أسبوعي/شهري لكل مقاول ومركز ومشرف وفني ومحول */
import { S } from '../store/repo.js';
import { faults } from '../analysis/model.js';
import { DIMS, LIMITS, table, row, daily, weekly } from '../analysis/stats.js';
import { trLabel } from '../core/geo.js';
import { CENTERS } from '../core/const.js';
import { esc, fmtDur, DAY, now, csv, download, isoDay } from '../core/util.js';

let root, period = 30, dim = 'co', center = 'بريدة', sortK = 'n', sortDir = -1;
const PERIODS = [[1, 'اليوم'], [7, 'أسبوع'], [30, 'شهر'], [90, '3 أشهر'], [365, 'سنة']];

function mount(el) { root = el; el.innerHTML = '<div class="pad" id="stBody"></div>'; }
function render() {
  if (!root) return;
  const start = period === 1 ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : now() - period * DAY;
  const F = faults({ from: start, center }), box = root.querySelector('#stBody');
  const tot = row('الإجمالي', F);
  let rows = table(F, dim);
  rows.sort((a, b) => sortDir * ((sortK === 'k' ? String(a.k).localeCompare(String(b.k)) : (sortK.startsWith('w') ? a.within[+sortK[1]] - b.within[+sortK[1]] : a[sortK] - b[sortK]))));
  const centers = CENTERS.filter(c => [...S.tickets.values()].some(t => t.center === c));
  let h = '<div class="row"><div class="seg">' + PERIODS.map(([d, t]) => '<button data-p="' + d + '" aria-pressed="' + (period === d) + '">' + t + '</button>').join('') + '</div>' +
    '<div class="seg">' + [['', 'كل المراكز'], ...centers.map(c => [c, c])].map(([k, t]) => '<button data-c="' + esc(k) + '" aria-pressed="' + (center === k) + '">' + t + '</button>').join('') + '</div></div>';
  h += '<div class="card"><div class="kgrid" style="grid-template-columns:repeat(auto-fit,minmax(90px,1fr))"><div><b>' + tot.n + '</b><span>بلاغ</span></div><div><b>' + tot.closed + '</b><span>مقفل</span></div><div><b>' + (tot.closed ? fmtDur(tot.avg) : '—') + '</b><span>متوسط المدة</span></div>' +
    LIMITS.map((L, i) => '<div><b>' + (tot.closed ? tot.within[i] + '%' : '—') + '</b><span>خلال ' + L + ' د</span></div>').join('') + '</div>' +
    (tot.uncertain ? '<p class="hint">' + tot.uncertain + ' بلاغ مدته تقريبية (الفرق بين التقريرين أكثر من ساعتين). ارفع التقرير بشكل أكثر انتظامًا لدقة أعلى.</p>' : '') + '</div>';
  /* الاتجاه: بالساعة لليوم، وباليوم/الأسبوع للفترات الأطول (من أول يوم فيه بيانات) */
  if (F.length) {
    let ser, label;
    const t0 = Math.min(...F.map(f => f.start)), t1 = Math.max(...F.map(f => f.start));
    if (period === 1 || t1 - t0 <= 2 * DAY) {
      /* بالساعة من أول ساعة فيها بلاغ لآخر ساعة */
      const h0 = new Date(t0).setMinutes(0, 0, 0), H = 3600000, n = Math.floor((t1 - h0) / H) + 1;
      ser = Array.from({ length: n }, (_, i) => ({ d: String(new Date(h0 + i * H).getHours()).padStart(2, '0') + ':00', n: 0 }));
      F.forEach(f => ser[Math.floor((f.start - h0) / H)].n++);
      label = 'عدد البلاغات الجديدة بالساعة';
    } else {
      const first = Math.max(start, Math.min(...F.map(f => f.start)));
      ser = daily(F, new Date(first).setHours(0, 0, 0, 0), now() + 1);
      ser.forEach(d => d.rain = !!S.settings.rainDays[d.d]);
      if (ser.length > 45) ser = weekly(ser);
      label = (ser.length > 45 ? 'أسبوعي' : 'يومي') + ' · الأزرق الغامق = يوم مطر';
    }
    const mx = Math.max(1, ...ser.map(d => d.n));
    h += '<p class="sec-title">الاتجاه <small>' + label + '</small></p><div class="card"><div class="bars" style="direction:ltr">' +
      ser.map(d => '<div class="' + (d.rain ? 'rain' : '') + '" style="height:' + (100 * d.n / mx) + '%" data-t="' + d.d + ': ' + d.n + '"></div>').join('') + '</div>' +
      '<div class="row" style="direction:ltr;justify-content:space-between;font-size:.72rem;color:var(--muted)"><span>' + ser[0].d + '</span><span>' + ser[ser.length - 1].d + '</span></div></div>';
  }
  /* الجدول */
  h += '<div class="row"><div class="seg">' + DIMS.map(d => '<button data-d="' + d.k + '" aria-pressed="' + (dim === d.k) + '">' + d.t + '</button>').join('') + '</div><span class="spacer"></span><button class="tbtn" id="stExp">تصدير Excel</button></div>';
  const th = (k, t, n) => '<th' + (n ? ' class="n"' : '') + ' data-s="' + k + '">' + t + (sortK === k ? (sortDir < 0 ? ' ↓' : ' ↑') : '') + '</th>';
  h += rows.length ? '<div class="tbl-wrap" style="max-height:60vh;overflow:auto"><table class="dtable"><thead><tr>' + th('k', DIMS.find(d => d.k === dim).t) + th('n', 'العدد', 1) + th('open', 'مفتوح', 1) + th('avg', 'متوسط المدة', 1) +
    LIMITS.map((L, i) => th('w' + i, '≤' + L + ' د', 1)).join('') + th('noCause', 'بدون سبب', 1) + '</tr></thead><tbody>' +
    rows.map(r => '<tr><td' + (dim === 'tr' ? ' class="ltr"' : '') + '>' + esc(dim === 'tr' && r.k !== 'بدون رقم' ? trLabel(r.k) : r.k) + '</td><td class="n"><b>' + r.n + '</b></td><td class="n">' + (r.open || '') + '</td><td class="n">' + (r.closed ? fmtDur(r.avg) : '—') + '</td>' +
      r.within.map(w => '<td class="n"' + (r.closed ? ' style="color:' + (w >= 80 ? '#0D652D' : w >= 50 ? '#8A4B00' : '#A50E0E') + '"' : '') + '>' + (r.closed ? w + '%' : '—') + '</td>').join('') + '<td class="n">' + (r.noCause || '') + '</td></tr>').join('') + '</tbody></table></div>'
    : '<div class="empty">ما فيه بيانات في هالفترة. ارفع تقارير الكهرباء أول بأول وتتجمع الإحصائيات تلقائيًا.</div>';
  h += '<p class="hint">المدة للبلاغ المقفل من تقرير الكهرباء = من بداية البلاغ إلى منتصف الوقت بين آخر تقرير ظهر فيه وأول تقرير اختفى منه.</p>';
  box.innerHTML = h;
  box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { period = +b.dataset.p; render(); });
  box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { center = b.dataset.c; render(); });
  box.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { dim = b.dataset.d; render(); });
  box.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { if (sortK === b.dataset.s) sortDir = -sortDir; else { sortK = b.dataset.s; sortDir = -1; } render(); });
  box.querySelector('#stExp').onclick = () => {
    const out = [['إحصائيات — كهرباء بريدة', 'من ' + isoDay(start) + ' إلى ' + isoDay(now()), center || 'كل المراكز'], [], [DIMS.find(d => d.k === dim).t, 'العدد', 'مفتوح', 'مقفل', 'متوسط المدة (د)', ...LIMITS.map(L => '% خلال ' + L + ' د'), 'بدون سبب']];
    [...rows, tot].forEach(r => out.push([dim === 'tr' && r.k !== 'بدون رقم' && r.k !== 'الإجمالي' ? trLabel(r.k) : r.k, r.n, r.open, r.closed, r.avg, ...r.within, r.noCause]));
    download('إحصائيات_' + dim + '_' + isoDay(now()) + '.csv', csv(out));
  };
}
export default { mount, render, tick: false };
