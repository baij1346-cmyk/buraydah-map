/* 3) المراجعة: البلاغات المقفلة (وتسجيل سببها)، الحسابات المتكررة، المحولات المتكررة، النقاط الساخنة */
import { faults } from '../analysis/model.js';
import { faultCard, bindCards, causeButtons, bindCauses } from '../core/ui.js';
import { goto, pickTr, violationSheet } from './ops.js';
import { trLabel } from '../core/geo.js';
import { esc, fmtDur, fmtDateTime, DAY, now, groupBy } from '../core/util.js';
import { causeName } from '../core/const.js';

let root, tab = 'nocause', period = 7, limit = 60;
const PERIODS = [[1, 'اليوم'], [7, '7 أيام'], [30, '30 يوم'], [90, '90 يوم'], [0, 'الكل']];

function mount(el) { root = el; el.innerHTML = '<div class="pad" id="rvBody"></div>'; }
function render() {
  if (!root) return;
  const from = period ? now() - period * DAY : 0, all = faults({ from }), closed = all.filter(f => !f.open).sort((a, b) => b.end - a.end);
  const noCause = closed.filter(f => !f.cause);
  const box = root.querySelector('#rvBody');
  let h = '<div class="row"><div class="seg">' + PERIODS.map(([d, t]) => '<button data-p="' + d + '" aria-pressed="' + (period === d) + '">' + t + '</button>').join('') + '</div></div>';
  const TABS = [['nocause', 'بدون سبب (' + noCause.length + ')'], ['closed', 'المقفلة (' + closed.length + ')'], ['acc', 'حسابات متكررة'], ['tr', 'محولات متكررة']];
  h += '<div class="filters">' + TABS.map(([k, t]) => '<button class="fl" data-t="' + k + '" aria-pressed="' + (tab === k) + '">' + t + '</button>').join('') + '</div>';
  let list = [];
  if (tab === 'nocause' || tab === 'closed') {
    list = (tab === 'nocause' ? noCause : closed);
    if (tab === 'nocause') h += '<p class="hint">سجّل سبب كل عطل مقفل بضغطة. بدون السبب ما نقدر نفرّق بين إحلال وتعزيز وصيانة في الحصر.</p>';
    const shown = list.slice(0, limit);
    h += shown.length ? (tab === 'nocause' ? '<div class="clist">' + shown.map(crow).join('') + '</div>' : '<div class="slist">' + shown.map(f => faultCard(f, { showCause: true })).join('') + '</div>') : '<div class="empty">' + (tab === 'nocause' ? 'كل البلاغات المقفلة لها سبب 👍' : 'ما فيه بلاغات مقفلة في هالفترة. البلاغ ينقفل لما يختفي من التقرير اللي بعده.') + '</div>';
    if (list.length > limit) h += '<button class="tbtn" id="rvMore" style="align-self:center">عرض المزيد (' + (list.length - limit) + ')</button>';
    list = shown;
  } else if (tab === 'acc') {
    const g = [...groupBy(all.filter(f => f.acc || f.sub), f => f.acc || f.sub)].map(([k, fs]) => ({ k, fs, rep: Math.max(fs.length, ...fs.map(f => f.repYear || 0)) })).filter(x => x.fs.length >= 2 || x.rep >= 2).sort((a, b) => b.fs.length - a.fs.length || b.rep - a.rep);
    h += '<p class="hint">الحساب اللي تكرر بلاغه في الفترة، أو التقرير يقول إنه متكرر من بداية السنة.</p>';
    h += g.length ? '<div class="tbl-wrap"><table class="dtable"><thead><tr><th>الحساب / الاشتراك</th><th class="n">بلاغاته هنا</th><th class="n">من بداية السنة</th><th>المحول</th><th>آخر بلاغ</th></tr></thead><tbody>' +
      g.slice(0, 200).map(x => '<tr><td class="ltr">' + esc(x.k) + '</td><td class="n">' + x.fs.length + '</td><td class="n">' + (Math.max(...x.fs.map(f => f.repYear || 0)) || '—') + '</td><td class="ltr">' + esc(x.fs[0].tr ? trLabel(x.fs[0].tr) : '') + '</td><td>' + fmtDateTime(Math.max(...x.fs.map(f => f.start))) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="empty">ما فيه حسابات متكررة في هالفترة.</div>';
  } else {
    const g = [...groupBy(all.filter(f => f.tr), f => f.tr)].map(([k, fs]) => ({ k, fs })).filter(x => x.fs.length >= 2).sort((a, b) => b.fs.length - a.fs.length);
    h += '<p class="hint">المحولات اللي عليها أكثر من بلاغ في الفترة = نقاط ساخنة. التحليل الكامل في «الحصر».</p>';
    h += g.length ? '<div class="tbl-wrap"><table class="dtable"><thead><tr><th>المحول</th><th class="n">البلاغات</th><th class="n">مفتوح</th><th>الأسباب</th><th>متوسط المدة</th><th></th></tr></thead><tbody>' +
      g.slice(0, 200).map(x => {
        const c = {}; x.fs.forEach(f => { if (f.cause) c[f.cause] = (c[f.cause] || 0) + 1; });
        const cl = x.fs.filter(f => !f.open), loc = x.fs.find(f => f.lat != null);
        return '<tr><td class="ltr">' + esc(trLabel(x.k)) + '</td><td class="n"><b>' + x.fs.length + '</b></td><td class="n">' + x.fs.filter(f => f.open).length + '</td><td>' + (Object.entries(c).map(([k, n]) => causeName(k) + ' ' + n).join('، ') || '<span style="color:var(--muted)">غير مسجل</span>') + '</td><td>' + (cl.length ? fmtDur(cl.reduce((a, f) => a + f.dur, 0) / cl.length) : '—') + '</td><td>' + (loc ? '<button class="icon-btn" data-goto="' + loc.lat + ',' + loc.lng + '">الخريطة</button>' : '<button class="icon-btn" data-pick="' + esc(x.k) + '">📍 حدّد</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>'
      : '<div class="empty">ما فيه محولات متكررة في هالفترة.</div>';
  }
  box.innerHTML = h;
  box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { period = +b.dataset.p; limit = 40; render(); });
  box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; limit = 40; render(); });
  box.querySelectorAll('.crow').forEach(el => { const f = list.find(x => x.src + ':' + x.id === el.dataset.id); if (f) bindCauses(el, f); });
  const more = box.querySelector('#rvMore'); if (more) more.onclick = () => { limit += 40; render(); };
  box.querySelectorAll('tr [data-goto]').forEach(b => b.onclick = () => { const [a, c] = b.dataset.goto.split(',').map(Number); goto(a, c); });
  box.querySelectorAll('tr [data-pick]').forEach(b => b.onclick = () => pickTr(b.dataset.pick));
  bindCards(box, list, { onGoto: goto, onPick: pickTr, onViol: violationSheet, rerender: render });
}
/* صف مختصر لتسجيل السبب بسرعة */
function crow(f) {
  return '<div class="crow" data-id="' + esc(f.src + ':' + f.id) + '"><div class="cm"><b class="ltr">' + esc(f.ref.tr || ('#' + f.id)) + '</b><span>' + esc(f.center) + '</span>' +
    (f.co ? '<span>' + esc(f.co) + '</span>' : '') + '<span>' + (f.uncertain ? '~' : '') + fmtDur(f.dur) + '</span><span class="ltr">' + esc(f.src === 'sec' ? f.id : '') + '</span></div>' + causeButtons(f.cause) + '</div>';
}
export default { mount, render, tick: false };
