/* عناصر واجهة مشتركة: النافذة السفلية، الخريطة، بطاقة البلاغ */
import { G, zoneOf } from './geo.js';
import { COLORS, BK, bucket, CAUSES, escalation, PRN, typeName, ST, DELAY } from './const.js';
import { esc, fmtDur, fmtTime, fmtDateTime, copy } from './util.js';
import { S, updateTicket, updateReport, setReportStatus } from '../store/repo.js';

/* سياق مشترك بين الأقسام (يعبّيه main.js): ctx.go(v) ينقل للقسم فورًا */
export const ctx = {};

/* ---------- النافذة ---------- */
const modal = () => document.getElementById('modal'), sheet = () => document.getElementById('sheet');
export function openSheet(html, wide) {
  sheet().className = 'sheet' + (wide ? ' sheet-wide' : ''); sheet().innerHTML = html; modal().hidden = false;
  return sheet();
}
export const closeSheet = () => { modal().hidden = true; sheet().innerHTML = ''; };
document.addEventListener('click', e => { if (e.target === modal()) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal().hidden) closeSheet(); });

/* ---------- الخريطة ---------- */
export function makeMap(el, { zones = true } = {}) {
  const b = L.latLngBounds([G.LA[0], G.LO[0]], [G.LA[1], G.LO[1]]);
  const map = L.map(el, { zoomControl: false, zoomSnap: .25, maxZoom: 19, minZoom: 9 }).fitBounds(b, { padding: [4, 4] });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  if (zones) G.ZS.forEach((q, i) => {
    L.rectangle([[q.lat[0], q.lng[0]], [q.lat[1], q.lng[1]]], { color: COLORS[i], weight: 2, fillOpacity: .06, interactive: false }).addTo(map);
    L.marker(q.c, { icon: L.divIcon({ className: '', html: '<div class="zl" style="background:' + COLORS[i] + '">' + q.L + '</div>', iconSize: [30, 30], iconAnchor: [15, 15] }), interactive: false, keyboard: false }).addTo(map);
  });
  map._home = b;
  /* لا نحدّث المقاس وهي مخفية (مقاس صفر يكسر الخريطة الحرارية) */
  new ResizeObserver(() => { if (el.clientWidth && el.clientHeight) map.invalidateSize(); }).observe(el);
  return map;
}
export const zoneChip = (z, size) => z >= 0 ? '<span class="ct" style="background:' + COLORS[z] + (size ? ';width:' + size + 'px;height:' + size + 'px' : '') + '" title="منطقة ' + G.ZS[z].L + '">' + G.ZS[z].L + '</span>' : '';
export const gmapsDir = (lat, lng) => 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng;
export const gmapsPin = (lat, lng) => 'https://www.google.com/maps?q=' + lat + ',' + lng;
export const waLink = (text, phone) => 'https://wa.me/' + (phone || '') + '?text=' + encodeURIComponent(text);

/* ---------- سبب العطل ---------- */
export function causeButtons(cur) {
  return '<div class="causes">' + CAUSES.map(c => '<button type="button" data-cause="' + c.k + '" aria-pressed="' + (cur === c.k) + '">' + c.t + '</button>').join('') + '</div>';
}
export function bindCauses(root, f, after) {
  root.querySelectorAll('[data-cause]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const k = b.dataset.cause === f.cause ? '' : b.dataset.cause;
    if (f.src === 'sec') await updateTicket(f.id, { cause: k }); else await updateReport(f.id, { cause: k });
    f.cause = k; after && after();
  });
}

/* ---------- رسالة واتساب ---------- */
export function waText(f) {
  if (f.src === 'sec') {
    const t = f.ref;
    return 'بلاغ مهمة ' + t.task + ' — ' + t.center + '\nالمدة: ' + fmtDur(f.dur) + '\nرقم الاشتراك: ' + (t.sub || '') + '\nرقم المحول: ' + (t.tr || '') +
      (t.tech ? '\nالفني: ' + t.tech : '') + (t.sup ? '\nالمشرف: ' + t.sup : '') + (f.lat != null ? '\nالموقع' + (f.approx ? ' (تقريبي)' : '') + ': ' + gmapsPin(f.lat, f.lng) : '');
  }
  const r = f.ref;
  return '🔴 بلاغ رقم ' + r.id + ' — ' + PRN[r.p] + '\n' + typeName(r.type) + (r.z >= 0 ? ' — منطقة ' + G.ZS[r.z].L : '') + '\n' + (r.num ? r.kind + ': ' + r.num + '\n' : '') +
    (r.cust ? 'المتأثرين تقريبًا: ' + r.cust + '\n' : '') + (r.note ? 'ملاحظة: ' + r.note + '\n' : '') + 'الموقع: ' + gmapsPin(r.lat, r.lng) + '\nوقت البلاغ: ' + fmtTime(r.t);
}
export function phoneFor(f) { return f.zone >= 0 && S.settings.zones[f.zone] ? (S.settings.zones[f.zone].wa || '') : ''; }

/* ---------- بطاقة البلاغ (لكل الأقسام) ---------- */
export function faultCard(f, { manage = false, showCause = false } = {}) {
  const b = bucket(f.dur), late = f.open && f.dur >= 90;
  const head = f.src === 'sec'
    ? '<span class="bk ' + (f.open ? BK[b].c : 'done') + '">' + (f.open ? BK[b].t : 'مقفل') + '</span><span class="rc-type">' + esc(f.center) + '</span>' + (f.kind && f.kind !== 'بلاغ مشترك' ? '<span class="tagx">' + esc(f.kind) + '</span>' : '')
    : '<span class="pr p' + f.ref.p + '">' + PRN[f.ref.p] + '</span><span class="rc-type">' + typeName(f.kind) + '</span><span class="tagx">يدوي</span>';
  const time = f.open ? (late ? 'متأخر · ' : '') + 'منذ ' + fmtDur(f.dur) : 'أُغلق بعد ' + (f.uncertain ? '~' : '') + fmtDur(f.dur);
  let h = '<article class="sc ' + (f.open ? BK[b].c : '') + '" data-id="' + esc(f.src + ':' + f.id) + '">' +
    '<div class="rc-top">' + head + zoneChip(f.zone, 22) + '<span class="rc-time' + (late ? ' late' : '') + '">' + time + '</span></div>';
  if (f.open && f.dur >= 60) h += '<div class="pill ' + (f.dur >= 120 ? 'red' : 'amber') + '">التصعيد: ' + escalation(f.dur).t + '</div>';
  if (f.tech || f.src === 'sec') h += '<div class="kv"><span>الفني</span><b>' + (f.tech ? esc(f.tech) + (f.co && f.co !== 'غير محدد' ? ' <span class="tagx">' + esc(f.co) + '</span>' : '') : '<span style="color:var(--p1)">لم يُسند لفني</span>') + '</b></div>';
  if (f.sup) h += '<div class="kv"><span>المشرف</span><b>' + esc(f.sup) + '</b></div>';
  if (f.src === 'manual' && f.ref.note) h += '<p class="rc-note">' + esc(f.ref.note) + '</p>';
  const nums = [];
  if (f.src === 'sec') {
    nums.push(['مهمة', f.id]); if (f.sub) nums.push(['اشتراك', f.sub]); if (f.ref.tr) nums.push(['محول', f.ref.tr]); if (f.acc) nums.push(['حساب', f.acc]);
  } else { if (f.sub) nums.push([f.ref.kind || 'رقم', f.sub]); if (f.ref.tr) nums.push(['محول', f.ref.tr]); nums.push(['#', f.id]); }
  h += '<div class="nums">' + nums.map(([k, v]) => '<span>' + k + ' <button class="numb" data-copy="' + esc(v) + '">' + esc(v) + '</button></span>').join('') +
    (f.src === 'sec' ? '<span>' + fmtDateTime(f.start) + '</span>' : '<span>' + fmtDateTime(f.start) + '</span>') + '</div>';
  const tags = [];
  if (f.repDay >= 2) tags.push('تكرر ' + f.repDay + ' مرات اليوم');
  if (f.repYear >= 2) tags.push('تكرر ' + f.repYear + ' مرات من بداية السنة');
  if (f.approx) tags.push('موقع تقريبي من 511');
  if (f.rain) tags.push('يوم مطر');
  if (tags.length) h += '<div>' + tags.map(t => '<span class="tagx rep">' + t + '</span>').join('') + '</div>';
  if (showCause || (!f.open)) h += '<div><span class="lbl">سبب العطل' + (f.cause ? '' : ' <b style="color:var(--p1)">— مطلوب للحصر</b>') + '</span>' + causeButtons(f.cause) + '</div>';
  /* الأزرار */
  h += '<div class="steps">';
  if (manage && f.src === 'manual') {
    const idx = ST.findIndex(s => s[0] === f.st);
    ST.forEach((s, i) => { if (i) h += '<button class="st' + (i <= idx ? ' on' : '') + (i === idx + 1 ? ' next' : '') + '" data-st="' + s[0] + '">' + (i <= idx ? '✓ ' : '') + s[1] + '</button>'; });
  }
  if (manage && f.src === 'sec' && f.open) {
    const cur = f.st || '';
    [['sent', 'تواصلت مع المقاول'], ['site', 'الفرقة في الموقع']].forEach(([k, t]) => h += '<button class="st' + (cur === k || (k === 'sent' && cur === 'site') ? ' on' : '') + '" data-sst="' + k + '">' + t + '</button>');
  }
  h += '<a class="icon-btn" target="_blank" rel="noopener" data-wa href="' + waLink(waText(f), phoneFor(f)) + '">واتساب</a>';
  if (f.lat != null) h += '<button class="icon-btn" data-goto="' + f.lat + ',' + f.lng + '">على الخريطة</button><a class="icon-btn" target="_blank" rel="noopener" href="' + gmapsDir(f.lat, f.lng) + '">الاتجاهات</a>';
  if (f.src === 'sec' && f.ref.trPre) h += '<button class="icon-btn" data-pick="' + esc(f.tr) + '">' + (f.lat != null ? 'تعديل مكان المحول' : '📍 حدّد مكان المحول') + '</button>';
  if (manage && f.open && f.dur >= 90) {
    const cur = f.ref.delay || '';
    h += '<select class="icon-btn" data-delay aria-label="سبب التأخير"><option value="">سبب التأخير؟</option>' + DELAY.map(x => '<option' + (cur === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>';
  }
  if (manage) h += '<button class="icon-btn" data-viol>تسجيل مخالفة</button>';
  h += '</div></article>';
  return h;
}

/* ربط أزرار البطاقات داخل عنصر */
export function bindCards(root, list, { onGoto, onPick, onViol, rerender } = {}) {
  const byKey = new Map(list.map(f => [f.src + ':' + f.id, f]));
  root.querySelectorAll('article[data-id]').forEach(el => {
    const f = byKey.get(el.dataset.id); if (!f) return;
    bindCauses(el, f, rerender);
    el.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(b.dataset.copy));
    el.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { const [a, c] = b.dataset.goto.split(',').map(Number); onGoto && onGoto(a, c); });
    el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => onPick && onPick(b.dataset.pick));
    el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
      if (b.dataset.st === 'done' && !f.cause) {
        openSheet('<h2>سبب العطل</h2><p class="hint">اختر السبب قبل الإغلاق. هذا اللي يبني قائمة الإحلال والتعزيز والصيانة.</p>' + causeButtons('') + '<button class="tbtn" data-x>إلغاء</button>');
        const sh = document.getElementById('sheet');
        sh.querySelector('[data-x]').onclick = closeSheet;
        sh.querySelectorAll('[data-cause]').forEach(c => c.onclick = async () => { await updateReport(f.id, { cause: c.dataset.cause }); await setReportStatus(f.id, 'done'); closeSheet(); });
        return;
      }
      setReportStatus(f.id, b.dataset.st);
    });
    el.querySelectorAll('[data-sst]').forEach(b => b.onclick = () => {
      const ts = Object.assign({}, f.ref.ts || {}); ts[b.dataset.sst] = ts[b.dataset.sst] || Date.now();
      updateTicket(f.id, { st: b.dataset.sst, ts });
    });
    el.querySelectorAll('[data-wa]').forEach(a => a.addEventListener('click', () => {
      if (f.src === 'manual' && f.st === 'new') setTimeout(() => setReportStatus(f.id, 'sent'), 300);
      if (f.src === 'sec' && !f.st) setTimeout(() => updateTicket(f.id, { st: 'sent', ts: { sent: Date.now() } }), 300);
    }));
    el.querySelectorAll('[data-delay]').forEach(s => s.onchange = () => (f.src === 'sec' ? updateTicket(f.id, { delay: s.value }) : updateReport(f.id, { delay: s.value })));
    el.querySelectorAll('[data-viol]').forEach(b => b.onclick = () => onViol && onViol(f));
  });
}
export function zoneOfFault(lat, lng) { return lat != null ? zoneOf(lat, lng) : -1; }
