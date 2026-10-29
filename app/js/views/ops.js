/* 1) غرفة العمليات: البلاغات المفتوحة الآن على الخريطة + قائمة، بأعمار حية وألوان فترات الكهرباء */
import { S, saveSettings, addReport, addViolation } from '../store/repo.js';
import { openFaults } from '../analysis/model.js';
import { makeMap, faultCard, bindCards, openSheet, closeSheet, ctx, gmapsDir, waLink, waText, phoneFor } from '../core/ui.js';
import { BK, bucket, CENTERS, CENTER_LL, TYPES, PRN, VIOL } from '../core/const.js';
import { lookup, zoneOf, G, trLabel } from '../core/geo.js';
import { esc, toast, fmtDur, arDigits, now } from '../core/util.js';

let root, map, layer, filt = 'all', mode = 'map', pickCb = null, banner;

const BCOL = ['#F4A259', '#E9B308', '#DC2626', '#7F1D1D'];
function mount(el) {
  root = el;
  el.innerHTML = '<div class="ops"><div class="ops-map"><div class="map" id="opsMap" aria-label="خريطة البلاغات المفتوحة"></div>' +
    '<div class="map-legend" id="opsLegend"></div>' +
    '<div class="picking" id="opsPick" hidden><span>اضغط على مكان المحول في الخريطة</span><button type="button">إلغاء</button></div></div>' +
    '<div class="ops-list"><div class="pad" id="opsList"></div></div>' +
    '<div class="ops-toggle"><button data-m="map" aria-pressed="true">الخريطة</button><button data-m="list" aria-pressed="false">القائمة</button></div>' +
    '<button class="fab-add" id="opsAdd"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>بلاغ يدوي</button></div>';
  map = makeMap(el.querySelector('#opsMap'));
  layer = L.layerGroup().addTo(map);
  map._fit = () => fitAll(true);
  banner = el.querySelector('#opsPick');
  banner.querySelector('button').onclick = () => { pickCb = null; banner.hidden = true; };
  map.on('click', e => { if (!pickCb) return; const cb = pickCb; pickCb = null; banner.hidden = true; cb(e.latlng.lat, e.latlng.lng); });
  el.querySelectorAll('.ops-toggle button').forEach(b => b.onclick = () => setMode(b.dataset.m));
  el.querySelector('#opsAdd').onclick = () => newReport();
}
let bounds = null, fitted = false;
function fitAll(anim) { if (bounds && bounds.isValid()) map.fitBounds(bounds, { maxZoom: 15, animate: !!anim, paddingTopLeft: [70, 40], paddingBottomRight: [90, 60] }); }
function setMode(m) {
  mode = m; root.querySelector('.ops').classList.toggle('list', m === 'list');
  root.querySelectorAll('.ops-toggle button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m));
  if (m === 'map') setTimeout(() => map.invalidateSize(), 50);
}
export function goto(lat, lng) { ctx.go('ops'); setMode('map'); setTimeout(() => map.setView([lat, lng], 17), 80); }
/* تحديد مكان على الخريطة (لمحول أو بلاغ) */
function pick(text, cb) { ctx.go('ops'); setMode('map'); banner.querySelector('span').textContent = text; banner.hidden = false; pickCb = cb; }
export function pickTr(key) {
  pick('اضغط على مكان المحول ' + trLabel(key) + ' في الخريطة', (lat, lng) => {
    S.settings.tr[key] = [+lat.toFixed(6), +lng.toFixed(6)]; saveSettings();
    toast('تم حفظ مكان المحول. أي بلاغ عليه بيطلع هنا تلقائيًا');
  });
}

function popup(f) {
  const b = bucket(f.dur);
  return '<div class="pop"><h4><span class="bk ' + BK[b].c + '">' + fmtDur(f.dur) + '</span>' + (f.src === 'sec' ? 'مهمة ' + esc(f.id) : 'بلاغ يدوي #' + f.id) + '</h4>' +
    '<div>' + esc(f.center) + (f.co ? ' · ' + esc(f.co) : '') + '</div>' + (f.sup ? '<div class="m">المشرف: ' + esc(f.sup) + '</div>' : '') +
    (f.ref.tr ? '<div class="m ltr">' + esc(f.ref.tr) + '</div>' : '') + (f.approx ? '<div class="m">موقع تقريبي من 511</div>' : '') +
    '<div class="acts"><a target="_blank" rel="noopener" href="' + gmapsDir(f.lat, f.lng) + '">الاتجاهات</a><a target="_blank" rel="noopener" href="' + waLink(waText(f), phoneFor(f)) + '">واتساب</a></div></div>';
}
const FILTERS = [
  ['all', 'الكل', () => true], ['b3', 'تجاوز ساعتين', f => f.dur >= 120], ['b2', '90–119 د', f => f.dur >= 90 && f.dur < 120],
  ['rep', 'متكرر', f => f.repDay >= 2 || f.repYear >= 2], ['nt', 'بدون فني', f => f.src === 'sec' && !f.tech],
  ['nl', 'بدون موقع', f => f.lat == null], ['man', 'يدوي', f => f.src === 'manual']];

function render() {
  if (!root) return;
  const all = openFaults().filter(f => f.center === 'بريدة' || !S.settings.onlyBuraydah);
  /* الخريطة: البلاغ المعروف موقعه = نقطة، والباقي = فقاعة عدد فوق مدينة المركز */
  layer.clearLayers();
  const pts = [];
  all.forEach(f => {
    if (f.lat == null) return;
    const b = bucket(f.dur);
    const html = '<div class="pin ' + (f.src === 'manual' ? 'man' : BK[b].c) + (f.approx ? ' approx' : '') + '"></div>';
    L.marker([f.lat, f.lng], { icon: L.divIcon({ className: '', html, iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: f.dur, riseOnHover: true })
      .bindPopup(popup(f), { maxWidth: 280 }).addTo(layer);
    pts.push([f.lat, f.lng]);
  });
  CENTERS.forEach(c => {
    const un = all.filter(f => f.center === c && f.lat == null); if (!un.length) return;
    const worst = Math.max(...un.map(f => bucket(f.dur))), ll = CENTER_LL[c];
    const m = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="bub" title="' + un.length + ' بلاغ في ' + c + ' بدون موقع محول"><b class="' + BK[worst].c + '">' + un.length + '</b><span>' + c + '</span></div>', iconSize: [0, 0] }), zIndexOffset: 2000 }).addTo(layer);
    m.on('click', () => { filt = 'c:' + c; setMode('list'); render(); });
    pts.push(ll);
  });
  if (all.some(f => f.center === 'بريدة')) pts.push([G.LA[0], G.LO[0]], [G.LA[1], G.LO[1]]);
  bounds = pts.length ? L.latLngBounds(pts) : null;
  if (!fitted && bounds) { fitted = true; setTimeout(() => fitAll(false), 60); }
  const lg = root.querySelector('#opsLegend');
  lg.innerHTML = BK.map((b, i) => '<span><i style="background:' + BCOL[i] + '"></i>' + b.t + '<b>' + all.filter(f => bucket(f.dur) === i).length + '</b></span>').join('') +
    (all.some(f => f.src === 'manual') ? '<span><i style="background:#0B57D0;border-radius:3px"></i>بلاغ يدوي</span>' : '') +
    (all.some(f => f.lat == null) ? '<span class="lg-note"><i class="lg-bub"></i>رقم فوق المدينة = بدون موقع محول</span>' : '');
  lg.hidden = !all.length;
  /* القائمة */
  const ok = FILTERS.find(x => x[0] === filt) || FILTERS[0];
  let fs = filt.startsWith('c:') ? all.filter(f => f.center === filt.slice(2)) : filt.startsWith('co:') ? all.filter(f => (f.co || 'بدون فني') === filt.slice(3)) : all.filter(ok[2]);
  fs.sort((a, b) => b.dur - a.dur);
  const centers = CENTERS.filter(c => all.some(f => f.center === c));
  let h = '';
  /* جدول المراكز × الفترات */
  if (all.length) {
    const rows = centers.map(c => { const s = all.filter(f => f.center === c); return [c, s.length, ...[0, 1, 2, 3].map(b => s.filter(f => bucket(f.dur) === b).length)]; });
    const tot = rows.reduce((a, r) => a.map((v, i) => i ? v + r[i] : v), ['الإجمالي', 0, 0, 0, 0, 0]);
    h += '<div class="tbl-wrap"><table class="sect"><thead><tr><th>المركز</th><th>الكل</th>' + BK.map(b => '<th title="' + b.t + '">' + b.s + '</th>').join('') + '</tr></thead><tbody>' +
      [...rows, tot].map((r, ri) => '<tr' + (ri === rows.length ? ' class="tot"' : '') + '><td>' + r[0] + '</td><td>' + r[1] + '</td>' + [2, 3, 4, 5].map((i, bi) => '<td class="' + (r[i] ? BK[bi].c : 'z') + '">' + r[i] + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    /* حسب المقاول */
    const cos = {}; all.forEach(f => { const k = f.co || (f.src === 'sec' ? 'بدون فني' : 'يدوي'); (cos[k] = cos[k] || { n: 0, max: 0, late: 0 }); cos[k].n++; cos[k].max = Math.max(cos[k].max, f.dur); if (f.dur >= 90) cos[k].late++; });
    h += '<p class="sec-title">حسب المقاول <small>من اسم الفني</small></p><div class="cos">' + Object.entries(cos).sort((a, b) => b[1].n - a[1].n).map(([k, v]) =>
      '<button class="co' + (v.late ? ' hot' : '') + '" data-f="co:' + esc(k) + '"><b>' + v.n + '</b><span>' + esc(k) + '</span><small>' + (v.late ? v.late + ' تجاوز 90 د' : 'أقدم ' + fmtDur(v.max)) + '</small></button>').join('') + '</div>';
  }
  const FL = FILTERS.map(([k, t, fn]) => [k, t + ' (' + all.filter(fn).length + ')']).filter(([k], i) => i === 0 || all.some(FILTERS[i][2])).concat(centers.length > 1 ? centers.map(c => ['c:' + c, c + ' (' + all.filter(f => f.center === c).length + ')']) : []);
  h += '<p class="sec-title">البلاغات المفتوحة <small>الأقدم أولًا</small></p><div class="filters">' + FL.map(([k, t]) => '<button class="fl" data-f="' + esc(k) + '" aria-pressed="' + (filt === k) + '">' + t + '</button>').join('') +
    (filt.startsWith('co:') ? '<button class="fl" aria-pressed="true" data-f="all">' + esc(filt.slice(3)) + ' ✕</button>' : '') + '</div>';
  h += fs.length ? '<div class="slist">' + fs.map(f => faultCard(f, { manage: false })).join('') + '</div>'
    : all.length ? '<div class="empty">ما فيه بلاغات بهالتصفية.</div>'
    : '<div class="hero"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg></div><h3>ما فيه بلاغات مفتوحة</h3><p>ارفع تقرير توجيه البلاغات (PDF) من زر «رفع التقرير» فوق. تقدر ترفع ملف مجمّع فيه أكثر من تقرير.</p><label class="tbtn primary" for="pdfIn">رفع التقرير</label></div>';
  const list = root.querySelector('#opsList'); list.innerHTML = h;
  list.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filt = b.dataset.f; render(); });
  bindCards(list, fs, { onGoto: goto, onPick: pickTr, onViol: violationSheet, rerender: render });
}

/* ---------- بلاغ يدوي جديد ---------- */
let draft = null;
function newReport(keep) {
  if (!keep) draft = { type: null, p: null, loc: null, num: '', cust: '', note: '', tr: '' };
  const sh = openSheet('<h2>بلاغ يدوي جديد</h2><div><span class="lbl">نوع البلاغ</span><div class="types">' + TYPES.map(t => '<button type="button" class="type" data-t="' + t.k + '" aria-pressed="' + (draft.type === t.k) + '"><b>' + t.t + '</b><span>' + t.d + '</span></button>').join('') + '</div></div>' +
    '<div><label class="lbl" for="fLoc">رقم العداد أو المحطة</label><div class="locrow"><input class="inp" id="fLoc" inputmode="numeric" autocomplete="off" placeholder="مثال: 5010500123" value="' + esc(draft.num) + '"><button class="tbtn" id="fPick" type="button">من الخريطة</button></div></div>' +
    '<div class="found" id="fFound"></div>' +
    '<div><span class="lbl">الأولوية</span><div class="prs">' + [1, 2, 3, 4].map(p => '<button type="button" class="p' + p + '" data-p="' + p + '" aria-pressed="' + (draft.p === p) + '">' + PRN[p] + '</button>').join('') + '</div></div>' +
    '<div class="grid2"><div><label class="lbl" for="fCust">المتأثرين (تقريبي)</label><input class="inp" id="fCust" inputmode="numeric" placeholder="اختياري" value="' + esc(draft.cust) + '"></div>' +
    '<div><label class="lbl" for="fTr">رقم المحول</label><input class="inp ltr" id="fTr" placeholder="4100-QBS-066128" value="' + esc(draft.tr) + '"></div></div>' +
    '<div><label class="lbl" for="fNote">ملاحظات</label><textarea class="inp" id="fNote" placeholder="مثال: مغذي رقم 5 طافي، الحي كامل بدون كهرباء">' + esc(draft.note) + '</textarea></div>' +
    '<div class="sheet-actions"><button class="tbtn primary" id="fSave">حفظ البلاغ</button><button class="tbtn" id="fCancel">إلغاء</button></div>');
  const $ = s => sh.querySelector(s), keepFields = () => { draft.num = $('#fLoc').value; draft.cust = $('#fCust').value; draft.note = $('#fNote').value; draft.tr = $('#fTr').value; };
  const found = () => {
    const el = $('#fFound'), l = draft.loc;
    if (!l) { el.className = 'found' + ($('#fLoc').value.trim() ? ' bad' : ''); el.textContent = $('#fLoc').value.trim() ? 'ما لقيت هذا الرقم. تأكد منه أو حدّد المكان من الخريطة.' : 'اكتب الرقم أو حدّد المكان من الخريطة.'; return; }
    const z = zoneOf(l.lat, l.lng);
    el.className = 'found ' + (z >= 0 ? 'ok' : 'bad');
    el.innerHTML = z >= 0 ? l.kind + (l.id ? ' <span class="ltr">' + esc(l.id) + '</span>' : '') + ' — تبع <b>منطقة ' + G.ZS[z].L + '</b>' : 'المكان خارج حدود التقسيم.';
  };
  found();
  sh.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { draft.type = b.dataset.t; draft.p = TYPES.find(t => t.k === draft.type).p; keepFields(); newReport(true); });
  sh.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { draft.p = +b.dataset.p; sh.querySelectorAll('[data-p]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  let lt; $('#fLoc').oninput = () => { clearTimeout(lt); lt = setTimeout(() => { draft.loc = lookup($('#fLoc').value); found(); }, 150); };
  $('#fPick').onclick = () => { keepFields(); closeSheet(); pick('اضغط على مكان البلاغ في الخريطة', (lat, lng) => { draft.loc = { kind: 'موقع', id: '', lat, lng }; newReport(true); }); };
  $('#fCancel').onclick = closeSheet;
  $('#fSave').onclick = async () => {
    keepFields();
    if (!draft.type) return toast('اختر نوع البلاغ');
    if (!draft.loc) return toast('حدّد مكان البلاغ: رقم أو من الخريطة');
    const r = await addReport({
      t: now(), type: draft.type, p: draft.p || 3, kind: draft.loc.kind, num: draft.loc.id ? String(draft.loc.id) : '', lat: +draft.loc.lat.toFixed(6), lng: +draft.loc.lng.toFixed(6),
      z: zoneOf(draft.loc.lat, draft.loc.lng), cust: parseInt(arDigits(draft.cust)) || 0, note: draft.note.trim(), tr: draft.tr.trim(), st: 'new', ts: {}
    });
    closeSheet(); toast('تم حفظ البلاغ رقم ' + r.id);
  };
}

/* ---------- تسجيل مخالفة من بطاقة بلاغ ---------- */
export function violationSheet(f) {
  const cos = [...new Set(S.settings.co.map(x => x[1]).concat(S.settings.zones.map(z => z.co).filter(Boolean)))];
  const sh = openSheet('<h2>تسجيل مخالفة</h2><p class="hint">' + (f ? (f.src === 'sec' ? 'مهمة ' + esc(f.id) : 'بلاغ #' + f.id) + ' · منذ ' + fmtDur(f.dur) : '') + '</p>' +
    '<div><label class="lbl" for="vCo">المقاول</label><input class="inp" id="vCo" list="vCoL" value="' + esc(f && f.co && f.co !== 'غير محدد' ? f.co : '') + '"><datalist id="vCoL">' + cos.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist></div>' +
    '<div><span class="lbl">النوع</span><div class="causes" id="vType">' + VIOL.map((v, i) => '<button type="button" data-v="' + v.k + '" aria-pressed="' + (i === 0) + '">' + v.t + '</button>').join('') + '</div></div>' +
    '<div><label class="lbl" for="vNote">التفاصيل / الدليل</label><textarea class="inp" id="vNote" placeholder="مثال: الفرقة وصلت بعد ساعتين ونص، المشرف ما رد على 3 اتصالات">' + (f && f.dur >= 90 ? 'مدة البلاغ ' + fmtDur(f.dur) : '') + '</textarea></div>' +
    '<div><label class="lbl" for="vPic">صورة (اختياري)</label><input type="file" id="vPic" accept="image/*" capture="environment"></div>' +
    '<div class="sheet-actions"><button class="tbtn primary" id="vSave">حفظ المخالفة</button><button class="tbtn" id="vX">إلغاء</button></div>');
  let type = 'late';
  sh.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { type = b.dataset.v; sh.querySelectorAll('[data-v]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  sh.querySelector('#vX').onclick = closeSheet;
  sh.querySelector('#vSave').onclick = async () => {
    const co = sh.querySelector('#vCo').value.trim(); if (!co) return toast('اكتب اسم المقاول');
    const file = sh.querySelector('#vPic').files[0];
    const pic = file ? await shrink(file) : '';
    await addViolation({ co, type, note: sh.querySelector('#vNote').value.trim(), ref: f ? { src: f.src, id: f.id, dur: f.dur, center: f.center, tr: f.tr } : null, pic });
    closeSheet(); toast('تم تسجيل المخالفة على ' + co);
  };
}
/* تصغير الصورة قبل الحفظ */
function shrink(file) {
  return new Promise(ok => {
    const img = new Image(); img.onload = () => {
      const k = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', .7)); URL.revokeObjectURL(img.src);
    }; img.onerror = () => ok(''); img.src = URL.createObjectURL(file);
  });
}
export default { mount, render };
