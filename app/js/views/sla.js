/* حد الـ3 ساعات: البلاغات اللي تجاوزت المعيار النظامي أو قربت منه، توثيق سبب التأخير، وتصدير ملف للهيئة */
import { S, patchTickets, updateTicket, updateReport } from '../store/repo.js';
import { faults } from '../analysis/model.js';
import { DELAY } from '../core/const.js';
import { goto } from './ops.js';
import { esc, fmtDur, fmtDateTime, DAY, now, csv, download, isoDay, toast, copy } from '../core/util.js';

let root, period = 1, tab = 'over';
const PERIODS = [[1, 'آخر 24 ساعة'], [7, '7 أيام'], [30, '30 يوم'], [0, 'الكل']];
const LIMIT = 180;

function mount(el) { root = el; el.innerHTML = '<div class="pad" id="slBody"></div>'; }

export function slaSets(from = 0) {
  const F = faults({ from });
  return {
    over: F.filter(f => f.dur > LIMIT).sort((a, b) => b.dur - a.dur),
    near: F.filter(f => f.open && f.dur >= 150 && f.dur <= LIMIT).sort((a, b) => b.dur - a.dur),
    next: F.filter(f => f.open && f.dur >= 120 && f.dur < 150).sort((a, b) => b.dur - a.dur)
  };
}
const delayOf = f => f.ref.delay || '';
const setDelay = (f, v) => f.src === 'sec' ? updateTicket(f.id, { delay: v }) : updateReport(f.id, { delay: v });

function render() {
  if (!root || (root.contains(document.activeElement) && document.activeElement.tagName === 'SELECT')) return;
  const from = period ? now() - period * DAY : 0, X = slaSets(from), box = root.querySelector('#slBody');
  const undocumented = X.over.filter(f => !delayOf(f));
  const TABS = [['over', 'تجاوز 3 ساعات', X.over.length], ['near', 'قريب (2:30–3:00)', X.near.length], ['next', 'بعده (2:00–2:30)', X.next.length]];
  const list = X[tab];
  let h = '<div class="row"><div class="seg">' + PERIODS.map(([d, t]) => '<button data-p="' + d + '" aria-pressed="' + (period === d) + '">' + t + '</button>').join('') + '</div><span class="spacer"></span>' +
    '<button class="tbtn primary" id="slExp">تصدير ملف الهيئة</button><button class="tbtn" id="slCopy">نسخ للواتساب</button></div>';
  h += '<div class="kgrid big"><div class="' + (X.over.length ? 'r' : '') + '"><b>' + X.over.length + '</b><span>تجاوز 3 ساعات</span></div><div class="' + (undocumented.length ? 'w' : '') + '"><b>' + undocumented.length + '</b><span>بدون سبب موثّق</span></div>' +
    '<div class="' + (X.near.length ? 'w' : '') + '"><b>' + X.near.length + '</b><span>مفتوح قريب من الحد</span></div><div><b>' + X.next.length + '</b><span>مفتوح تجاوز ساعتين</span></div></div>';
  h += '<p class="hint">المعيار النظامي: إعادة الخدمة خلال 3 ساعات. الطقس القاسي مستثنى ما لم يثبت التقصير، بشرط توثيق السبب والإبلاغ خلال 5 أيام عمل. وثّق سبب كل بلاغ هنا.</p>';
  h += '<div class="filters">' + TABS.map(([k, t, n]) => '<button class="fl" data-t="' + k + '" aria-pressed="' + (tab === k) + '">' + t + ' (' + n + ')</button>').join('') + '</div>';
  if (tab === 'over' && undocumented.length) h += '<div class="card"><div class="row"><b style="flex:1;min-width:180px">توثيق دفعة وحدة: ' + undocumented.length + ' بلاغ بدون سبب</b><select class="inp sm" id="slBulk" style="width:230px"><option value="">اختر السبب…</option>' + DELAY.map(x => '<option>' + x + '</option>').join('') + '</select><button class="tbtn" id="slApply">طبّق على الكل</button></div></div>';
  h += list.length ? '<div class="tbl-wrap"><table class="dtable"><thead><tr><th>المهمة</th><th>المحول</th><th>المقاول</th><th>المشرف</th><th>البداية</th><th class="n">المدة</th><th class="n">الحالة</th><th>سبب التأخير</th><th></th></tr></thead><tbody>' +
    list.map((f, i) => '<tr><td class="ltr">' + esc(f.src === 'sec' ? f.id : '#' + f.id) + '</td><td class="ltr">' + esc(f.ref.tr || '') + '</td><td>' + esc(f.co || 'بدون فني') + '</td><td>' + esc(f.sup || '—') + '</td><td>' + fmtDateTime(f.start) + '</td>' +
      '<td class="n" style="font-weight:700;color:' + (f.dur > LIMIT ? 'var(--bad)' : 'var(--warn)') + '">' + (f.uncertain ? '~' : '') + fmtDur(f.dur) + '</td><td class="n">' + (f.open ? '<span class="pill red">مفتوح</span>' : '<span class="pill">انقفل</span>') + '</td>' +
      '<td><select class="icon-btn" data-i="' + i + '" aria-label="سبب التأخير"><option value="">— اختر —</option>' + DELAY.map(x => '<option' + (delayOf(f) === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></td>' +
      '<td>' + (f.lat != null ? '<button class="icon-btn" data-go="' + f.lat + ',' + f.lng + '">الخريطة</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>'
    : '<div class="empty">' + (tab === 'over' ? 'ما فيه بلاغات تجاوزت 3 ساعات في هالفترة ✓' : 'ما فيه بلاغات هنا.') + '</div>';
  box.innerHTML = h;
  box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { period = +b.dataset.p; render(); });
  box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });
  box.querySelectorAll('select[data-i]').forEach(s => s.onchange = async () => { await setDelay(list[+s.dataset.i], s.value); s.blur(); toast('تم توثيق السبب'); });
  box.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { const [a, c] = b.dataset.go.split(',').map(Number); goto(a, c); });
  const ap = box.querySelector('#slApply');
  if (ap) ap.onclick = async () => {
    const v = box.querySelector('#slBulk').value; if (!v) return toast('اختر السبب أول');
    const ids = new Set(undocumented.filter(f => f.src === 'sec').map(f => f.id));
    await patchTickets(t => { if (!ids.has(t.task)) return false; t.delay = v; return true; });
    for (const f of undocumented.filter(f => f.src !== 'sec')) await updateReport(f.id, { delay: v });
    toast('تم توثيق ' + undocumented.length + ' بلاغ');
  };
  box.querySelector('#slExp').onclick = () => exportFile(X);
  box.querySelector('#slCopy').onclick = () => copy(waText(X));
}
function waText(X) {
  let s = '⏱️ متابعة حد الـ3 ساعات — TBG\n\nتجاوز 3 ساعات: ' + X.over.length + ' | قريب من الحد: ' + X.near.length + ' | تجاوز ساعتين: ' + X.next.length + '\n';
  const line = f => '• ' + (f.src === 'sec' ? f.id : '#' + f.id) + ' — ' + fmtDur(f.dur) + ' — ' + (f.co || 'بدون فني') + (f.sup ? ' — ' + f.sup : '') + (f.ref.tr ? ' — ' + f.ref.tr : '') + '\n';
  const oo = X.over.filter(f => f.open);
  if (oo.length) { s += '\n🔴 مفتوح وتجاوز 3 ساعات:\n'; oo.forEach(f => s += line(f)); }
  if (X.near.length) { s += '\n🟠 قريب من الحد:\n'; X.near.forEach(f => s += line(f)); }
  return s;
}
function exportFile(X) {
  if (!X.over.length && !X.near.length) return toast('ما فيه بلاغات للتصدير');
  const rows = [['سجل البلاغات المتجاوزة للمعيار النظامي (3 ساعات) — TBG'], ['تاريخ التصدير', new Date().toLocaleString('en-GB'), 'الفترة', period ? 'آخر ' + period + ' يوم' : 'الكل'], [],
    ['م', 'رقم المهمة', 'المركز', 'المحول', 'المحطة', 'المغذي', 'وقت البلاغ', 'وقت الإغلاق', 'المدة (دقيقة)', 'التجاوز (دقيقة)', 'الحالة', 'المقاول', 'المشرف', 'يوم مطر', 'سبب التأخير']];
  X.over.concat(X.near).forEach((f, i) => rows.push([i + 1, f.id, f.center, f.ref.tr || '', f.net ? f.net.sub : '', f.net ? f.net.feeder : '', new Date(f.start).toLocaleString('en-GB'),
    f.open ? 'مفتوح' : new Date(f.end).toLocaleString('en-GB') + (f.uncertain ? ' (تقريبي)' : ''), f.dur, Math.max(0, f.dur - LIMIT), f.dur > LIMIT ? 'تجاوز' : 'قريب من الحد', f.co || 'بدون فني', f.sup || '', f.rain ? 'نعم' : 'لا', delayOf(f)]));
  download('بلاغات_تجاوزت_3_ساعات_' + isoDay(now()) + '.csv', csv(rows));
}
export default { mount, render };
