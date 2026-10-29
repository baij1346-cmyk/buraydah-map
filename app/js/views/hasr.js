/* 5) الحصر: خريطة حرارية + ترتيب المحولات حسب الحاجة + تصنيف إحلال/تعزيز/صيانة + تصدير قائمة الأعمال */
import { S, saveSettings } from '../store/repo.js';
import { faults } from '../analysis/model.js';
import { analyze, ACTIONS, byZone, suggestRainDays } from '../analysis/hasr.js';
import { makeMap, zoneChip } from '../core/ui.js';
import { pickTr } from './ops.js';
import { hotspotsHtml, latestDay } from './brief.js';
import { trLabel, G } from '../core/geo.js';
import { COLORS, causeName } from '../core/const.js';
import { esc, fmtDate, DAY, now, csv, download, isoDay, pct } from '../core/util.js';

let root, map, heat, pins, period = 90, kind = 'all', act = 'all', limit = 30;
const PERIODS = [[30, '30 يوم'], [90, '90 يوم'], [365, 'سنة'], [0, 'الكل']];
const KINDS = [['all', 'كل الأيام'], ['rain', 'أيام المطر'], ['dry', 'الأيام العادية']];

function mount(el) {
  root = el;
  el.innerHTML = '<div class="pad"><div class="card mapcard" style="height:min(52vh,460px)"><div class="map" id="hsMap" aria-label="خريطة حرارية للأعطال"></div></div><div id="hsBody" style="display:flex;flex-direction:column;gap:10px"></div></div>';
  map = makeMap(el.querySelector('#hsMap'));
  pins = L.layerGroup().addTo(map);
}
function render() {
  if (!root) return;
  const from = period ? now() - period * DAY : 0;
  /* التصنيف دايم على كل أعطال الفترة (عشان نسبة المطر تكون صحيحة)، والفلتر يحدد وش ينعرض */
  const FA = faults({ from }), kf = f => kind === 'rain' ? f.rain : kind === 'dry' ? !f.rain : true;
  const F = FA.filter(kf);
  const items = analyze(FA, S.settings.rules, now()).filter(x => kind === 'all' || x.faults.some(kf));
  const shown = items.filter(x => act === 'all' ? x.n >= 2 || x.acts.length : x.acts.includes(act));
  /* الخريطة الحرارية */
  const pts = F.filter(f => f.lat != null).map(f => [f.lat, f.lng, 1]);
  if (heat) map.removeLayer(heat);
  heat = null;
  if (L.heatLayer && pts.length) {
    const add = () => { if (!map.getSize().x) return setTimeout(add, 200); heat = L.heatLayer(pts, { radius: 20, blur: 16, maxZoom: 14, minOpacity: .35, gradient: { .2: '#FDE68A', .45: '#F59E0B', .7: '#DC2626', 1: '#7F1D1D' } }).addTo(map); };
    add();
  }
  pins.clearLayers();
  shown.slice(0, 60).forEach((x, i) => {
    if (x.lat == null) return;
    const c = x.acts.length ? ACTIONS[x.acts[0]].c : '#5F6368';
    L.marker([x.lat, x.lng], { icon: L.divIcon({ className: '', html: '<div class="zl" style="background:' + c + ';font-size:11px">' + (i + 1) + '</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) })
      .bindPopup('<b>' + esc(trLabel(x.tr)) + '</b><br>' + x.n + ' عطل · ' + (x.acts.map(a => ACTIONS[a].t).join('، ') || 'مراقبة')).addTo(pins);
  });
  const box = root.querySelector('#hsBody');
  const located = F.filter(f => f.lat != null).length, withTr = F.filter(f => f.tr).length, withCause = F.filter(f => !f.open && f.cause).length, closed = F.filter(f => !f.open).length;
  let h = '<div class="row"><div class="seg">' + PERIODS.map(([d, t]) => '<button data-p="' + d + '" aria-pressed="' + (period === d) + '">' + t + '</button>').join('') + '</div>' +
    '<div class="seg">' + KINDS.map(([k, t]) => '<button data-k="' + k + '" aria-pressed="' + (kind === k) + '">' + t + '</button>').join('') + '</div></div>';
  /* جودة البيانات */
  h += '<div class="card"><div class="kgrid"><div><b>' + F.length + '</b><span>عطل في الفترة</span></div><div><b>' + pct(located, F.length) + '%</b><span>معروف موقعه</span></div><div><b>' + pct(withCause, closed) + '%</b><span>من المقفلة لها سبب</span></div></div>' +
    (closed && pct(withCause, closed) < 60 ? '<p class="hint">⚠️ دقة التصنيف تعتمد على تسجيل سبب العطل. سجّل الأسباب من «المراجعة».</p>' : '') +
    (F.length && pct(located, F.length) < 60 ? '<p class="hint">⚠️ كثير من المحولات بدون موقع. ارفع قائمة المحولات من GIS في «الإعدادات» أو حدّد المكان يدويًا.</p>' : '') +
    (withTr < F.length ? '<p class="hint">' + (F.length - withTr) + ' عطل بدون رقم محول، ما تدخل في الترتيب.</p>' : '') + '</div>';
  /* النقاط الساخنة في آخر يوم مرفوع */
  const ld = latestDay();
  if (ld) { const dayF = FA.filter(f => isoDay(f.start) === ld || (f.end && isoDay(f.end) === ld)); const hs = hotspotsHtml(dayF, ''); if (hs) h += hs.replace('النقاط الساخنة', 'النقاط الساخنة في آخر يوم (' + ld + ')'); }
  /* المناطق */
  const z = byZone(F);
  if (z.some(q => q.n)) h += '<p class="sec-title">حسب المنطقة</p><div class="cgrid">' + z.map(q => '<div class="cc"><span class="ct" style="background:' + COLORS[q.zone] + '">' + G.ZS[q.zone].L + '</span><b>' + q.n + '</b><span>' + q.trs.size + ' محول' + (q.rain ? ' · ' + q.rain + ' مطر' : '') + '</span></div>').join('') + '</div>';
  /* قائمة الأعمال */
  const cnt = k => items.filter(x => x.acts.includes(k)).length;
  h += '<div class="row"><p class="sec-title" style="margin:0">قائمة أعمال الشبكة</p><span class="spacer"></span><button class="tbtn primary" id="hsExp">تصدير القائمة</button></div>';
  h += '<div class="filters">' + [['all', 'الكل'], ...Object.entries(ACTIONS).map(([k, a]) => [k, a.t + ' (' + cnt(k) + ')'])].map(([k, t]) => '<button class="fl" data-a="' + k + '" aria-pressed="' + (act === k) + '">' + t + '</button>').join('') + '</div>';
  if (act !== 'all') h += '<p class="hint">' + ACTIONS[act].d + '</p>';
  h += shown.length ? shown.slice(0, limit).map((x, i) => workCard(x, i)).join('') : '<div class="empty">' + (F.length ? 'ما فيه محولات بهالتصنيف في الفترة.' : 'ما فيه أعطال في هالفترة. ارفع تقارير الكهرباء بشكل منتظم وتنبني القاعدة تلقائيًا.') + '</div>';
  if (shown.length > limit) h += '<button class="tbtn" id="hsMore" style="align-self:center">عرض المزيد (' + (shown.length - limit) + ')</button>';
  /* أيام المطر */
  const sug = suggestRainDays(FA, isoDay).filter(d => !S.settings.rainDays[d.d]);
  const rd = Object.keys(S.settings.rainDays).sort().reverse();
  h += '<p class="sec-title">أيام المطر <small>تفرّق أعطال المطر عن العادية</small></p><div class="card"><p class="hint">علّم الأيام اللي فيها مطر. الأعطال اللي تطلع في أيام المطر بس = دخول ماء → صيانة.</p>' +
    '<div class="row"><input type="date" class="inp sm" id="hsDay" style="width:170px" value="' + isoDay(now()) + '"><button class="tbtn" id="hsAddDay">إضافة يوم مطر</button></div>' +
    (sug.length ? '<p class="pg">أيام مقترحة (البلاغات فيها ضعف المعتاد):</p><div class="days">' + sug.map(d => '<button data-day="' + d.d + '" aria-pressed="false">' + d.d + '<small>' + d.n + ' بلاغ</small></button>').join('') + '</div>' : '') +
    (rd.length ? '<p class="pg">المعلّمة:</p><div class="days">' + rd.map(d => '<button data-day="' + d + '" aria-pressed="true">' + d + '<small>اضغط للإلغاء</small></button>').join('') + '</div>' : '') + '</div>';
  /* القواعد */
  const R = S.settings.rules;
  h += '<details class="card"><summary style="cursor:pointer;font-weight:700">قواعد التصنيف (قابلة للضبط)</summary>' +
    rule('replaceN', 'إحلال: عدد الأعطال بنفس السبب (كيبل/وصلة/فيوز)', R.replaceN) + rule('replaceDays', '… خلال كم يوم', R.replaceDays) +
    rule('rainShare', 'صيانة: نسبة أعطال أيام المطر ≥ (%)', R.rainShare) + rule('peakShare', 'تعزيز: نسبة أعطال أشهر الذروة ≥ (%)', R.peakShare) + rule('minForPattern', 'أقل عدد أعطال لاعتبار النمط', R.minForPattern) +
    '<div class="prow"><label for="hsPeak">أشهر الذروة (أرقام مفصولة بفاصلة)</label><input id="hsPeak" class="inp sm ltr" value="' + R.peakMonths.join(',') + '"></div>' +
    '<p class="hint">الأولوية = عدد الأعطال × (1 + لو2(المتأثرين)) × الاتجاه (يزيد 1.3 / يقل 0.8) × خطورة السبب.</p></details>';
  box.innerHTML = h;
  box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { period = +b.dataset.p; limit = 30; render(); });
  box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; render(); });
  box.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { act = b.dataset.a; limit = 30; render(); });
  const more = box.querySelector('#hsMore'); if (more) more.onclick = () => { limit += 30; render(); };
  box.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { const [a, c] = b.dataset.go.split(',').map(Number); map.setView([a, c], 17); root.scrollTo({ top: 0, behavior: 'smooth' }); });
  box.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => pickTr(b.dataset.pick));
  box.querySelector('#hsExp').onclick = () => exportList(items.filter(x => x.acts.length || x.n >= 2));
  box.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { const d = b.dataset.day; if (S.settings.rainDays[d]) delete S.settings.rainDays[d]; else S.settings.rainDays[d] = true; saveSettings(); });
  box.querySelector('#hsAddDay').onclick = () => { const d = box.querySelector('#hsDay').value; if (d) { S.settings.rainDays[d] = true; saveSettings(); } };
  box.querySelectorAll('[data-rule]').forEach(i => i.onchange = () => { const v = parseInt(i.value); if (v > 0) { R[i.dataset.rule] = v; saveSettings(); } });
  box.querySelector('#hsPeak').onchange = e => { const m = e.target.value.split(/[,،\s]+/).map(Number).filter(n => n >= 1 && n <= 12); if (m.length) { R.peakMonths = m; saveSettings(); } };
}
const rule = (k, t, v) => '<div class="prow"><label for="r_' + k + '">' + t + '</label><input id="r_' + k + '" class="inp sm" type="number" min="1" data-rule="' + k + '" value="' + v + '"></div>';
const TREND = { up: '↑ يزيد', down: '↓ يقل', flat: '→ ثابت' };
function workCard(x, i) {
  const a0 = x.acts[0];
  return '<div class="work" style="--c:' + (a0 ? ACTIONS[a0].c : '#DADCE0') + '"><div class="top"><b style="color:var(--muted)">' + (i + 1) + '</b>' +
    x.acts.map(a => '<span class="act" style="background:' + ACTIONS[a].c + '">' + ACTIONS[a].t + '</span>').join('') + (x.acts.length ? '' : '<span class="pill">مراقبة</span>') +
    '<b class="ltr">' + esc(trLabel(x.tr)) + '</b>' + zoneChip(x.zone, 22) + '<span class="score" title="درجة الأولوية">' + x.score + '</span></div>' +
    '<div class="row" style="font-size:.8rem;color:var(--muted)"><span>' + x.n + ' عطل</span><span>آخر 30 يوم: ' + x.n30 + '</span><span>' + TREND[x.trend] + '</span><span>المتأثرين: ' + x.affected + '</span>' + (x.rainN ? '<span>مطر: ' + x.rainN + '</span>' : '') + '<span>آخر عطل: ' + fmtDate(x.last) + '</span>' + (x.center && x.center !== 'بريدة' ? '<span>' + esc(x.center) + '</span>' : '') + '</div>' +
    (x.why.length ? '<ul><b>ليش؟</b>' + x.why.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '') +
    (Object.keys(x.causeCount).length ? '<div class="chips2">' + Object.entries(x.causeCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => '<span>' + causeName(k) + ': ' + n + '</span>').join('') + '</div>' : '') +
    '<div class="steps">' + (x.lat != null ? '<button class="icon-btn" data-go="' + x.lat + ',' + x.lng + '">على الخريطة' + (x.approx ? ' (تقريبي)' : '') + '</button>' : '<button class="icon-btn" data-pick="' + esc(x.tr) + '">📍 حدّد مكان المحول</button>') + '</div></div>';
}
function exportList(items) {
  const rows = [['قائمة أعمال الشبكة — كهرباء بريدة'], ['الفترة', period ? 'آخر ' + period + ' يوم' : 'الكل', 'الأيام', KINDS.find(k => k[0] === kind)[1], 'تاريخ التصدير', new Date().toLocaleString('en-GB')], [],
    ['الترتيب', 'المحول', 'نوع العمل', 'الدرجة', 'المنطقة', 'المركز', 'عدد الأعطال', 'آخر 30 يوم', 'الاتجاه', 'المتأثرين', 'أعطال أيام المطر', 'الأسباب', 'الدليل (ليش؟)', 'خط العرض', 'خط الطول', 'رابط الموقع']];
  items.forEach((x, i) => rows.push([i + 1, trLabel(x.tr), x.acts.map(a => ACTIONS[a].t).join(' + ') || 'مراقبة', x.score, x.zone >= 0 ? G.ZS[x.zone].L : '', x.center, x.n, x.n30, TREND[x.trend], x.affected, x.rainN,
    Object.entries(x.causeCount).map(([k, n]) => causeName(k) + ' ' + n).join('، '), x.why.join(' | '), x.lat ?? '', x.lng ?? '', x.lat != null ? 'https://www.google.com/maps?q=' + x.lat + ',' + x.lng : '']));
  download('قائمة_أعمال_الشبكة_' + isoDay(now()) + '.csv', csv(rows));
}
export default { mount, render, tick: false };
