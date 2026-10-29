/* 4) الضبط: سجل مخالفات كل مقاول بالوقت والدليل، وتصدير ملف جاهز للمحضر */
import { S, deleteViolation } from '../store/repo.js';
import { faults } from '../analysis/model.js';
import { openSheet, closeSheet } from '../core/ui.js';
import { violationSheet } from './ops.js';
import { VIOL, violName } from '../core/const.js';
import { esc, fmtDateTime, fmtDur, DAY, now, csv, download, isoDay, armed } from '../core/util.js';

let root, co = '', period = 30;
const PERIODS = [[7, '7 أيام'], [30, '30 يوم'], [90, '90 يوم'], [0, 'الكل']];

function mount(el) { root = el; el.innerHTML = '<div class="pad" id="ctBody"></div>'; }
function render() {
  if (!root) return;
  const from = period ? now() - period * DAY : 0;
  const V = S.violations.filter(v => v.t >= from), box = root.querySelector('#ctBody');
  const cos = [...new Set(V.map(v => v.co))].sort();
  const counts = cos.map(c => ({ c, n: V.filter(v => v.co === c).length, by: VIOL.map(t => V.filter(v => v.co === c && v.type === t.k).length) })).sort((a, b) => b.n - a.n);
  const logged = new Set(S.violations.filter(v => v.ref).map(v => v.ref.src + ':' + v.ref.id));
  const sugg = faults({ from }).filter(f => f.dur >= 120 && !logged.has(f.src + ':' + f.id) && f.co && f.co !== 'غير محدد').sort((a, b) => b.dur - a.dur);
  let h = '<div class="row"><div class="seg">' + PERIODS.map(([d, t]) => '<button data-p="' + d + '" aria-pressed="' + (period === d) + '">' + t + '</button>').join('') + '</div><span class="spacer"></span>' +
    '<button class="tbtn primary" id="ctNew">+ مخالفة</button><button class="tbtn" id="ctExp">تصدير للمحضر</button></div>';
  h += counts.length ? '<div class="tbl-wrap"><table class="dtable"><thead><tr><th>المقاول</th><th class="n">الإجمالي</th>' + VIOL.map(t => '<th class="n">' + t.t + '</th>').join('') + '</tr></thead><tbody>' +
    counts.map(x => '<tr data-co="' + esc(x.c) + '" style="cursor:pointer' + (co === x.c ? ';background:var(--accent-soft)' : '') + '"><td><b>' + esc(x.c) + '</b></td><td class="n"><b>' + x.n + '</b></td>' + x.by.map(n => '<td class="n">' + (n || '') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>'
    : '<div class="empty">ما فيه مخالفات مسجلة في هالفترة.<br>سجّل من زر <b>«+ مخالفة»</b> أو من بطاقة أي بلاغ في «الإدارة».</div>';
  if (sugg.length) {
    h += '<p class="sec-title">بلاغات تجاوزت ساعتين بدون مخالفة مسجلة <small>' + sugg.length + '</small></p><div class="card">' +
      sugg.slice(0, 15).map((f, i) => '<div class="row" style="font-size:.86rem"><span class="pill red">' + fmtDur(f.dur) + '</span><span>' + esc(f.co) + '</span><span class="ltr" style="color:var(--muted)">' + esc(f.id) + '</span><span class="spacer"></span><button class="icon-btn" data-sg="' + i + '">سجّل</button></div>').join('') + '</div>';
  }
  const list = V.filter(v => !co || v.co === co).sort((a, b) => b.t - a.t);
  h += '<p class="sec-title">السجل' + (co ? ' — ' + esc(co) + ' <button class="lnk" id="ctAll">عرض الكل</button>' : '') + ' <small>' + list.length + '</small></p>';
  h += list.map(v => '<div class="card" style="gap:6px"><div class="row"><span class="pill red">' + violName(v.type) + '</span><b>' + esc(v.co) + '</b><span class="spacer"></span><span style="font-size:.8rem;color:var(--muted)">' + fmtDateTime(v.t) + '</span></div>' +
    (v.note ? '<p class="rc-note">' + esc(v.note) + '</p>' : '') + (v.ref ? '<p class="hint">' + (v.ref.src === 'sec' ? 'مهمة <span class="ltr">' + esc(v.ref.id) + '</span>' : 'بلاغ #' + v.ref.id) + (v.ref.center ? ' · ' + esc(v.ref.center) : '') + (v.ref.dur ? ' · المدة وقت التسجيل ' + fmtDur(v.ref.dur) : '') + '</p>' : '') +
    (v.pic ? '<img src="' + v.pic + '" alt="صورة الدليل" style="max-width:220px;border-radius:10px">' : '') + '<div><button class="lnk" data-del="' + v.id + '">حذف</button></div></div>').join('');
  box.innerHTML = h;
  box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { period = +b.dataset.p; render(); });
  box.querySelectorAll('[data-co]').forEach(r => r.onclick = () => { co = co === r.dataset.co ? '' : r.dataset.co; render(); });
  const all = box.querySelector('#ctAll'); if (all) all.onclick = () => { co = ''; render(); };
  box.querySelector('#ctNew').onclick = () => violationSheet(null);
  box.querySelector('#ctExp').onclick = () => exportMinutes(V);
  box.querySelectorAll('[data-sg]').forEach(b => b.onclick = () => violationSheet(sugg[+b.dataset.sg]));
  box.querySelectorAll('[data-del]').forEach(b => armed(b, 'حذف', () => deleteViolation(+b.dataset.del)));
}
function exportMinutes(V) {
  if (!V.length) return openSheet('<h2>تصدير للمحضر</h2><p class="hint">ما فيه مخالفات في الفترة المختارة.</p><button class="tbtn" data-x>تمام</button>').querySelector('[data-x]').onclick = closeSheet;
  const rows = [['سجل مخالفات المقاولين — كهرباء بريدة'], ['الفترة', period ? 'آخر ' + period + ' يوم' : 'الكل', 'تاريخ التصدير', fmtDateTime(now())], []];
  const cos = [...new Set(V.map(v => v.co))];
  rows.push(['الملخص']); rows.push(['المقاول', 'الإجمالي', ...VIOL.map(t => t.t)]);
  cos.forEach(c => rows.push([c, V.filter(v => v.co === c).length, ...VIOL.map(t => V.filter(v => v.co === c && v.type === t.k).length)]));
  rows.push([]); rows.push(['م', 'التاريخ والوقت', 'المقاول', 'نوع المخالفة', 'التفاصيل / الدليل', 'رقم المهمة / البلاغ', 'المركز', 'المدة (دقيقة)', 'صورة']);
  V.sort((a, b) => a.co.localeCompare(b.co) || a.t - b.t).forEach((v, i) => rows.push([i + 1, new Date(v.t).toLocaleString('en-GB'), v.co, violName(v.type), v.note, v.ref ? v.ref.id : '', v.ref ? v.ref.center || '' : '', v.ref && v.ref.dur ? v.ref.dur : '', v.pic ? 'مرفقة في المنصة' : '']));
  rows.push([]); rows.push(['توقيع رئيس القسم', '', 'توقيع ممثل المقاول']);
  download('محضر_مخالفات_' + isoDay(now()) + '.csv', csv(rows));
}
export default { mount, render, tick: false };
