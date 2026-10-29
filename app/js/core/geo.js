/* بيانات المواقع: العدادات (من 511)، المحطات، مناطق المقاولين، ومواقع المحولات */
import { arDigits } from './util.js';

export const G = { ready: false, N: 0, ZS: [], SUBS: [], LA: [26.22, 26.47], LO: [43.83, 44.1] };
let NUMS, LAT, LNG, SUBMAP, AUTO;

export async function loadGeo(base = './data/') {
  const [meta, buf] = await Promise.all([
    fetch(base + 'meta.json').then(r => r.json()),
    fetch(base + 'meters.bin').then(r => r.arrayBuffer())]);
  initGeo(meta, buf);
}
/* meters.bin: لكل عداد 8 بايت = فرق الرقم عن السابق (uint32) + lat (uint16) + lng (uint16) */
export function initGeo(meta, buf) {
  const [LA0, LA1] = meta.LA, [LO0, LO1] = meta.LO, dv = new DataView(buf), N = buf.byteLength / 8;
  NUMS = new Float64Array(N); LAT = new Float32Array(N); LNG = new Float32Array(N);
  let v = meta.first;
  for (let i = 0; i < N; i++) {
    const o = i * 8; if (i) v += dv.getUint32(o, true);
    NUMS[i] = v; LAT[i] = LA0 + dv.getUint16(o + 4, true) * (LA1 - LA0) / 65535; LNG[i] = LO0 + dv.getUint16(o + 6, true) * (LO1 - LO0) / 65535;
  }
  SUBMAP = new Map(meta.subs.map(s => [String(s[0]), s]));
  /* مطابقة رقم المحول بأرقام 511: نأخذ الأرقام الفريدة فقط (المكررة نتركها) */
  const m = new Map(), dup = new Set();
  meta.subs.forEach(s => {
    const mm = String(s[0]).match(/^\(?(\d{2,7})\)?(?:[^\d-]*)$/); if (!mm) return;
    const n = String(+mm[1]); if (m.has(n)) dup.add(n); else m.set(n, [s[1], s[2]]);
  });
  dup.forEach(n => m.delete(n)); AUTO = m;
  Object.assign(G, { ready: true, N, ZS: meta.zones, SUBS: meta.subs, LA: meta.LA, LO: meta.LO });
}
export function zoneOf(lat, lng) {
  for (let i = 0; i < 9; i++) { const q = G.ZS[i]; if (lat >= q.lat[0] && lat <= q.lat[1] && lng >= q.lng[0] && lng <= q.lng[1]) return i; }
  return -1;
}
function lb(v) { let lo = 0, hi = G.N; while (lo < hi) { const m = (lo + hi) >> 1; if (NUMS[m] < v) lo = m + 1; else hi = m; } return lo; }
export function lookup(text) {
  const t = arDigits(text).replace(/\s+/g, '');
  if (!t) return null;
  if (/^\d{10}$/.test(t)) { const i = lb(Number(t)); if (i < G.N && NUMS[i] === Number(t)) return { kind: 'عداد', id: t, lat: LAT[i], lng: LNG[i] }; }
  if (SUBMAP.has(t)) { const s = SUBMAP.get(t); return { kind: 'محطة', id: s[0], lat: s[1], lng: s[2] }; }
  if (t.length >= 4) for (const s of G.SUBS) if (String(s[0]).includes(t)) return { kind: 'محطة', id: s[0], lat: s[1], lng: s[2] };
  return null;
}
export function randomMeter() { const i = Math.floor(Math.random() * G.N); return { lat: LAT[i], lng: LNG[i], num: String(NUMS[i]) }; }

/* مفتاح المحول الموحّد: QBS-66128 */
export function trKey(t) { return t && t.trPre && t.trNum ? t.trPre + '-' + String(+t.trNum) : ''; }
export function parseTr(s) {
  const m = String(s || '').toUpperCase().match(/(Q[A-Z]{1,2}S)\D*(\d{3,7})/);
  return m ? { trPre: m[1], trNum: m[2], key: m[1] + '-' + String(+m[2]) } : null;
}
export const trLabel = k => { const [p, n] = String(k).split('-'); return n ? '4100-' + p + '-' + n.padStart(6, '0') : k; };
/* موقع المحول: من القائمة المحفوظة (GIS أو تحديد يدوي)، وإلا تقريبي من 511 لبريدة */
export function trLoc(key, trMap, center) {
  if (!key) return null;
  if (trMap && trMap[key]) return { lat: trMap[key][0], lng: trMap[key][1], auto: false };
  const num = key.split('-')[1];
  if ((!center || center === 'بريدة') && AUTO) { const a = AUTO.get(num); if (a) return { lat: a[0], lng: a[1], auto: true }; }
  return null;
}
