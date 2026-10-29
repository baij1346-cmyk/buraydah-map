/* 2) الإدارة: توجيه البلاغ للمقاول، متابعة الحالة، واتساب برسالة جاهزة، الاتجاهات، ضغط المقاولين */
import { S, patchTickets } from '../store/repo.js';
import { openFaults } from '../analysis/model.js';
import { faultCard, bindCards, waLink } from '../core/ui.js';
import { goto, pickTr, violationSheet } from './ops.js';
import { COLORS, DIR, NEI, LV } from '../core/const.js';
import { G } from '../core/geo.js';
import { esc, fmtDur, fmtTime, mins, now, copy, armed, toast } from '../core/util.js';
import { markUpdateSent } from '../core/levels.js';

let root, filt = 'todo';
const FL = [
  ['todo', 'يحتاج توجيه', f => f.src === 'manual' ? f.st === 'new' : !f.st],
  ['wait', 'بانتظار الوصول', f => f.st === 'sent'],
  ['site', 'في الموقع', f => f.st === 'site'],
  ['late', 'تجاوز 90 د', f => f.dur >= 90],
  ['all', 'الكل', () => true]];

function mount(el) { root = el; el.innerHTML = '<div class="pad" id="mgBody"></div>'; }
function render() {
  if (!root) return;
  const op = openFaults(), box = root.querySelector('#mgBody');
  /* ضغط المقاولين (من اسم الفني) — وضغط المناطق إذا أغلب البلاغات معروف موقعها */
  const cos = {}; op.forEach(f => { const k = f.co || (f.src === 'sec' ? 'بدون فني' : 'غير محدد'); (cos[k] = cos[k] || { n: 0, late: 0, over: 0, max: 0 }); cos[k].n++; if (f.dur >= 90) cos[k].late++; if (f.dur >= 120) cos[k].over++; cos[k].max = Math.max(cos[k].max, f.dur); });
  let h = '<p class="sec-title">ضغط المقاولين <small>البلاغات المفتوحة الآن</small></p>';
  h += op.length ? '<div class="cos">' + Object.entries(cos).sort((a, b) => b[1].late - a[1].late || b[1].n - a[1].n).map(([k, v]) =>
    '<div class="co' + (v.over ? ' hot' : '') + '"><span>' + esc(k) + '</span><b>' + v.n + '</b><small>' + (v.late ? v.late + ' متأخر' + (v.over ? ' · ' + v.over + ' فوق ساعتين' : '') : 'أقدم ' + fmtDur(v.max)) + '</small></div>').join('') + '</div>'
    : '<div class="empty">ما فيه بلاغات مفتوحة.</div>';
  const load = G.ZS.map((q, i) => ({ i, n: op.filter(f => f.zone === i).length, late: op.filter(f => f.zone === i && f.dur >= 90).length }));
  const located = op.filter(f => f.zone >= 0).length, avg = located / 9;
  if (located && located >= op.length / 2) {
    load.forEach(o => o.lvl = o.n === 0 ? '' : (o.n >= Math.max(4, avg * 1.8) || o.late >= 2) ? 'high' : o.n >= Math.max(2, avg * 1.2) ? 'mid' : '');
    h += '<p class="sec-title">ضغط المناطق <small>' + located + ' من ' + op.length + ' معروف موقعه</small></p><div class="cgrid">' +
      load.map(o => '<div class="cc ' + o.lvl + '"><span class="ct" style="background:' + COLORS[o.i] + '">' + G.ZS[o.i].L + '</span><span>' + esc((S.settings.zones[o.i] || {}).co || DIR[o.i]) + (o.late ? '<br><span class="p1n">' + o.late + ' متأخر</span>' : '') + '</span><b>' + o.n + '</b></div>').join('') + '</div>';
    const tips = [];
    load.filter(o => o.lvl === 'high').forEach(o => {
      const nb = NEI[o.i].map(j => load[j]).sort((a, b) => a.n - b.n)[0];
      if (nb && nb.n < o.n) tips.push('منطقة <b>' + G.ZS[o.i].L + '</b> عليها ضغط (' + o.n + ' مفتوح). اقتراح: اسحب لها فرقة من منطقة <b>' + G.ZS[nb.i].L + '</b> (' + nb.n + ' مفتوح).');
    });
    h += tips.map(t => '<div class="tip">' + t + '</div>').join('');
  }
  h += '<div class="tools"><a class="tbtn primary" id="mgWa" target="_blank" rel="noopener" href="' + waLink(summary(op)) + '">أرسل تحديث الحالة واتساب</a><button class="tbtn" id="mgCopy">نسخ التحديث</button></div>';
  /* القائمة */
  const fn = (FL.find(x => x[0] === filt) || FL[0])[2], fs = op.filter(fn).sort((a, b) => b.dur - a.dur);
  const secOpen = op.filter(f => f.src === 'sec');
  if (secOpen.length) h += '<div class="card"><div class="row"><div style="flex:1;min-width:200px"><b>إقفال البلاغات</b><p class="hint">كل بلاغ فيه زر «✓ تم الإصلاح». ولو خلص اليوم وما بترفع تقرير جديد، تقدر تقفل الكل مرة وحدة بوقت آخر تقرير ظهرت فيه.</p></div><button class="tbtn" id="mgCloseAll">إقفال كل المفتوح (' + secOpen.length + ')</button></div></div>';
  h += '<p class="sec-title">متابعة البلاغات</p><div class="filters">' + FL.map(([k, t, f]) => '<button class="fl" data-f="' + k + '" aria-pressed="' + (filt === k) + '">' + t + ' (' + op.filter(f).length + ')</button>').join('') + '</div>';
  h += fs.length ? '<div class="slist">' + fs.map(f => faultCard(f, { manage: true })).join('') + '</div>' : '<div class="empty">ما فيه بلاغات هنا.</div>';
  box.innerHTML = h;
  box.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filt = b.dataset.f; render(); });
  box.querySelector('#mgWa').addEventListener('click', markUpdateSent);
  box.querySelector('#mgCopy').onclick = () => { copy(summary(op)); markUpdateSent(); };
  const ca = box.querySelector('#mgCloseAll');
  if (ca) armed(ca, 'إقفال كل المفتوح (' + secOpen.length + ')', async () => {
    const ids = new Set(secOpen.map(f => f.id));
    await patchTickets(t => { if (!ids.has(t.task)) return false; t.mclosed = t.lastSeen + 60000; return true; });
    toast('تم إقفال ' + secOpen.length + ' بلاغ');
  });
  bindCards(box, fs, { onGoto: goto, onPick: pickTr, onViol: violationSheet, rerender: render });
}
function summary(op) {
  const e = S.event, l = e.level || 1;
  let s = '📊 تحديث الحالة — مركز أبو بندر للعمليات\nالساعة ' + fmtTime(now()) + ' · المستوى ' + l + ' (' + LV[l].n + ')' + (e.start ? ' · منذ ' + fmtDur(mins(now() - e.start)) : '') + '\n\n';
  s += 'مفتوح: ' + op.length + ' | 90–119 د: ' + op.filter(f => f.dur >= 90 && f.dur < 120).length + ' | تجاوز ساعتين: ' + op.filter(f => f.dur >= 120).length + '\n';
  const cos = {}; op.forEach(f => { const k = f.co || 'غير محدد'; cos[k] = cos[k] || [0, 0]; cos[k][0]++; if (f.dur >= 90) cos[k][1]++; });
  if (Object.keys(cos).length) { s += '\nحسب المقاول:\n'; Object.entries(cos).sort((a, b) => b[1][0] - a[1][0]).forEach(([k, v]) => s += '• ' + k + ': ' + v[0] + (v[1] ? ' (' + v[1] + ' تجاوز 90 د)' : '') + '\n'); }
  const hot = op.filter(f => f.dur >= 90).sort((a, b) => b.dur - a.dur).slice(0, 8);
  if (hot.length) { s += '\n⚠️ الأقدم:\n'; hot.forEach(f => s += '• ' + (f.src === 'sec' ? f.id : '#' + f.id) + ' — ' + f.center + ' — ' + fmtDur(f.dur) + (f.sup ? ' — ' + f.sup : '') + '\n'); }
  return s;
}
export default { mount, render };
