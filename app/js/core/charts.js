/* رسوم بيانية خفيفة بـ HTML/CSS (تتبع اتجاه الصفحة RTL، وتطبع بوضوح) */
import { esc } from './util.js';

/* أعمدة أفقية لمقياس واحد + خط الهدف. rows: [{label, v, txt, warn}] */
export function hbar(rows, { target, targetTxt, max } = {}) {
  const M = max || Math.max(1, target || 0, ...rows.map(r => r.v)) * 1.08;
  const tx = target != null ? '<i class="hb-target" style="inset-inline-start:' + (100 * target / M) + '%"><em>' + esc(targetTxt || 'الهدف') + '</em></i>' : '';
  return '<div class="hb">' + rows.map(r =>
    '<div class="hb-row" title="' + esc(r.label + ': ' + r.txt) + '"><span class="hb-l">' + esc(r.label) + '</span><span class="hb-track">' + tx +
    '<b class="hb-bar' + (r.warn ? ' warn' : '') + '" style="width:' + Math.max(1.5, 100 * r.v / M) + '%"></b></span><span class="hb-v' + (r.warn ? ' warn' : '') + '">' + esc(r.txt) + '</span></div>').join('') + '</div>';
}

/* أعمدة مكدّسة 100% لتوزيع المدة (تسلسلي: فاتح = أسرع، غامق = أبطأ) */
export const DUR_COLS = ['#C6DBF7', '#79A8EE', '#2D6FD6', '#0B3A82'];
export const DUR_LABELS = ['أقل من ساعة', '60–89 د', '90–119 د', '+120 د'];
export function stack100(rows) {
  const legend = '<div class="sk-lg">' + DUR_LABELS.map((l, i) => '<span><i style="background:' + DUR_COLS[i] + '"></i>' + l + '</span>').join('') + '</div>';
  return legend + '<div class="sk">' + rows.map(r => {
    const tot = r.parts.reduce((a, b) => a + b, 0) || 1;
    return '<div class="sk-row"><span class="sk-l">' + esc(r.label) + '</span><span class="sk-bar">' + r.parts.map((n, i) => n ? '<b style="flex:' + n + ';background:' + DUR_COLS[i] + '" title="' + esc(r.label + ' — ' + DUR_LABELS[i] + ': ' + n + ' (' + Math.round(100 * n / tot) + '%)') + '"></b>' : '').join('') +
      '</span><span class="sk-v">' + tot + '</span></div>';
  }).join('') + '</div>';
}

/* أعمدة عمودية بالساعة (الزمن من اليسار لليمين) */
export function hours(hk, H, peak) {
  const mx = Math.max(1, ...hk.map(k => H[k]));
  return '<div class="hr-wrap"><div class="bars hr" style="direction:ltr">' + hk.map(k => '<div class="' + (peak && k >= peak.from && k < peak.to ? 'rain' : '') + '" style="height:' + (100 * H[k] / mx) + '%" data-t="' + k + ':00 — ' + H[k] + ' بلاغ"><span>' + H[k] + '</span></div>').join('') + '</div>' +
    '<div class="hr-ax" style="direction:ltr">' + hk.map(k => '<span>' + k + '</span>').join('') + '</div></div>';
}
