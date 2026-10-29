/* عناصر واجهة مشتركة: النافذة السفلية، الخريطة، بطاقة البلاغ */
import { G, zoneOf } from './geo.js';
import { COLORS, BK, bucket, CAUSES, escalation, PRN, typeName, ST, DELAY } from './const.js';
import { esc, fmtDur, fmtTime, fmtDateTime, copy, toast } from './util.js';
import { S, updateTicket, updateReport, setReportStatus } from '../store/repo.js';

/* سياق مشترك بين الأقسام (يعبّيه main.js): ctx.go(v) ينقل للقسم فورًا */
export const ctx = {};
/* مسار جذر الموقع: من app/ نرجع خطوة، ومن نسخة الملف الواحد (في الجذر) لا */
export const ROOT = /\/app\/[^/]*$/.test(location.pathname) ? '../' : '';

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
/* خرائط الأساس: فاتحة (افتراضي)، شوارع، قمر صناعي */
const BASE = {
  light: { t: 'فاتحة', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attr: '&copy; OpenStreetMap &copy; CARTO' },
  streets: { t: 'شوارع', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attr: '&copy; OpenStreetMap &copy; CARTO' },
  sat: { t: 'قمر صناعي', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '&copy; Esri' }
};
const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('map-' + k); localStorage.setItem('map-' + k, v); } catch (e) { return null; } };
const IC = {
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  loc: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  zones: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 12h17M12 3.5v17"/>'
};
const btn = (k, title) => '<button type="button" data-k="' + k + '" title="' + title + '" aria-label="' + title + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + IC[k] + '</svg></button>';

/* خريطة بأزرار مخصصة. opts.zones: إظهار حدود المناطق (يقدر المستخدم يخفيها) */
export function makeMap(el, { zones = true, labels = true } = {}) {
  const b = L.latLngBounds([G.LA[0], G.LO[0]], [G.LA[1], G.LO[1]]);
  const map = L.map(el, { zoomControl: false, zoomSnap: .25, maxZoom: 19, minZoom: 7, attributionControl: true }).fitBounds(b, { padding: [10, 10] });
  map.attributionControl.setPrefix(false);
  let baseKey = BASE[pref('base')] ? pref('base') : 'light', base = null;
  const setBase = k => { if (base) map.removeLayer(base); baseKey = k; base = L.tileLayer(BASE[k].url, { maxZoom: 19, subdomains: 'abcd', attribution: BASE[k].attr, detectRetina: true }).addTo(map); base.bringToBack(); pref('base', k); };
  setBase(baseKey);
  /* المناطق: حدود متقطعة خفيفة + حرف صغير */
  const zl = L.layerGroup();
  G.ZS.forEach((q, i) => {
    L.rectangle([[q.lat[0], q.lng[0]], [q.lat[1], q.lng[1]]], { color: COLORS[i], weight: 1.5, opacity: .8, dashArray: '5 5', fillColor: COLORS[i], fillOpacity: .035, interactive: false }).addTo(zl);
    if (labels) L.marker(q.c, { icon: L.divIcon({ className: '', html: '<div class="zl" style="background:' + COLORS[i] + '">' + q.L + '</div>', iconSize: [24, 24], iconAnchor: [12, 12] }), interactive: false, keyboard: false, zIndexOffset: -1000 }).addTo(zl);
  });
  let showZones = zones && pref('zones') !== '0';
  if (showZones) zl.addTo(map);
  /* الأزرار */
  const ctl = document.createElement('div'); ctl.className = 'mctl';
  ctl.innerHTML = '<div class="grp">' + btn('plus', 'تكبير') + btn('minus', 'تصغير') + '</div><div class="grp">' + btn('fit', 'عرض الكل') + btn('loc', 'موقعي') + '</div><div class="grp">' + btn('layers', 'نوع الخريطة') + (zones ? btn('zones', 'مناطق المقاولين') : '') + '</div>';
  el.parentElement.appendChild(ctl);
  L.DomEvent.disableClickPropagation(ctl);
  const zb = ctl.querySelector('[data-k="zones"]'); if (zb) zb.setAttribute('aria-pressed', showZones);
  let me = null;
  ctl.addEventListener('click', e => {
    const k = (e.target.closest('button') || {}).dataset?.k; if (!k) return;
    if (k === 'plus') map.zoomIn(); else if (k === 'minus') map.zoomOut();
    else if (k === 'fit') (map._fit || (() => map.fitBounds(b, { padding: [10, 10] })))();
    else if (k === 'layers') { const ks = Object.keys(BASE), n = ks[(ks.indexOf(baseKey) + 1) % ks.length]; setBase(n); toast('الخريطة: ' + BASE[n].t); }
    else if (k === 'zones') { showZones = !showZones; showZones ? zl.addTo(map) : map.removeLayer(zl); zb.setAttribute('aria-pressed', showZones); pref('zones', showZones ? '1' : '0'); }
    else if (k === 'loc') {
      if (!navigator.geolocation) return toast('الموقع غير متاح في هذا المتصفح');
      navigator.geolocation.getCurrentPosition(p => {
        const ll = [p.coords.latitude, p.coords.longitude];
        if (me) map.removeLayer(me);
        me = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#1A73E8', fillOpacity: 1 }).addTo(map);
        map.setView(ll, 16);
      }, () => toast('ما قدرت أحدد موقعك. تأكد من السماح بالموقع'), { enableHighAccuracy: true, timeout: 10000 });
    }
  });
  /* الحروف تتزاحم لما نبعد: نخفيها تحت زوم 12 */
  const zcls = () => el.classList.toggle('zoom-lo', map.getZoom() < 11.5);
  map.on('zoomend', zcls); zcls();
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
