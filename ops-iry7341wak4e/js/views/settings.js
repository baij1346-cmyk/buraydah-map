/* الإعدادات: المقاولين، ربط الفنيين، مواقع المحولات، التقارير المرفوعة، النسخ الاحتياطي */
import * as repo from '../store/repo.js';
import { S, saveSettings } from '../store/repo.js';
import { G, parseTr, trLabel } from '../core/geo.js';
import { ROOT } from '../core/ui.js';
import { COLORS, DIR } from '../core/const.js';
import { demoSnapshots } from '../core/demo.js';
import { DEF_TARGETS } from '../analysis/exec.js';
import { esc, toast, download, fmtDateTime, isoDay, now, armed, arDigits } from '../core/util.js';

let root;
function mount(el) { root = el; el.innerHTML = '<div class="pad" id="seBody"></div>'; }
function render() {
  if (!root || (root.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
  const p = S.settings, snaps = [...S.snapshots].reverse();
  const nTr = Object.keys(p.tr).length;
  let h = '<p class="sec-title">المقاولين حسب المنطقة <small>تقسيم مؤقت حتى يوصل الرسمي</small></p><div class="card">' +
    '<p class="hint">رقم الواتساب بصيغة 9665xxxxxxxx (بدون صفر وبدون +). يُستخدم لإرسال البلاغ مباشرة للمقاول.</p>' +
    G.ZS.map((q, i) => '<div class="row"><span class="ct" style="background:' + COLORS[i] + '">' + q.L + '</span><span style="width:70px;font-size:.8rem;color:var(--muted)">' + DIR[i] + '</span>' +
      '<input class="inp sm" style="flex:1;min-width:120px" data-zco="' + i + '" placeholder="اسم المقاول" value="' + esc(p.zones[i].co) + '">' +
      '<input class="inp sm ltr" style="width:150px" data-zwa="' + i + '" inputmode="numeric" placeholder="9665…" value="' + esc(p.zones[i].wa) + '"></div>').join('') + '</div>';
  h += '<p class="sec-title">ربط الفنيين بالمقاولين</p><div class="card"><p class="hint">كل سطر: كلمة تظهر في اسم الفني بتقرير الكهرباء = اسم المقاول. مثال: <b>السندس = أعمال السندس</b></p>' +
    '<textarea class="cobox" id="seCo" aria-label="كلمات المقاولين">' + esc(p.co.map(([k, l]) => k === l ? k : k + ' = ' + l).join('\n')) + '</textarea></div>';
  const known = [...new Set(p.co.map(x => x[1]))];
  h += '<p class="sec-title">المقاولين المستبعدين <small>بلاغاتهم ما تدخل في المنصة</small></p><div class="card"><p class="hint">اضغط على المقاول لاستبعاده أو إرجاعه. المستبعد ما يظهر في العمليات ولا الإحصائيات ولا التقرير التنفيذي.</p><div class="causes">' +
    known.map(c => '<button type="button" data-ex="' + esc(c) + '" aria-pressed="' + p.exclude.includes(c) + '">' + (p.exclude.includes(c) ? '✕ ' : '') + esc(c) + '</button>').join('') + '</div></div>';
  h += '<p class="sec-title">توزيع الزونات على المقاولين <small>مرجع — خلال 24 ساعة</small></p><div class="tbl-wrap"><table class="dtable"><thead><tr><th>المقاول</th><th>الزونات</th><th class="n">العدد</th></tr></thead><tbody>' +
    Object.entries(p.zonesTable).map(([c, zs]) => '<tr' + (p.exclude.includes(c) ? ' class="muted"' : '') + '><td><b>' + esc(c) + '</b>' + (p.exclude.includes(c) ? ' <span class="tagx">مستبعد</span>' : '') + '</td><td class="ltr" style="text-align:right">' + zs.slice().sort((a, b) => a - b).join('، ') + '</td><td class="n">' + zs.length + '</td></tr>').join('') + '</tbody></table></div>';
  h += '<p class="sec-title">مواقع المحولات <small>' + nTr + ' محفوظ</small></p><div class="card"><p class="hint">ارفع ملف CSV من GIS فيه ثلاث أعمدة: رقم المحول (مثل 4100-QBS-066128)، خط العرض، خط الطول. بعدها كل بلاغ يطلع على الخريطة ويدخل في الحصر بدقة. بدونه المنصة تستخدم موقع تقريبي من 511 (يطابق تقريبًا نص محولات بريدة).</p>' +
    '<div class="tools"><label class="tbtn primary" for="seTr">رفع قائمة المحولات (CSV)<input type="file" id="seTr" accept=".csv,.txt" hidden></label><button class="tbtn" id="seTrExp">تصدير المواقع المحفوظة</button></div></div>';
  const TG = Object.assign({ ...DEF_TARGETS }, p.targets || {});
  h += '<p class="sec-title">أهداف الأداء <small>تُستخدم في التقرير التنفيذي (أخضر / برتقالي / أحمر)</small></p><div class="card">' +
    [['w60', 'نسبة الإغلاق خلال ساعة (%)'], ['w120', 'نسبة الإغلاق خلال ساعتين (%)'], ['w180', 'نسبة الإغلاق خلال 3 ساعات (%)'], ['avg', 'أقصى متوسط لمدة الإغلاق (دقيقة)'], ['over180', 'أقصى عدد بلاغات تتجاوز 3 ساعات']]
      .map(([k, t]) => '<div class="prow"><label for="tg_' + k + '">' + t + '</label><input id="tg_' + k + '" class="inp sm" type="number" min="0" data-tg="' + k + '" value="' + TG[k] + '"></div>').join('') + '</div>';
  h += '<p class="sec-title">عام</p><div class="card">' +
    '<label class="chk"><input type="checkbox" id="seOnly"' + (p.onlyBuraydah ? ' checked' : '') + '> <span><b>بريدة فقط</b> — كل الأقسام تعرض بلاغات مركز بريدة بس (شيل العلامة لعرض القصيم كامل)</span></label>' + '</div>';
  h += '<p class="sec-title">تقارير الكهرباء المرفوعة <small>' + snaps.length + ' تقرير</small></p><div class="card">' +
    (snaps.length ? '<div class="tbl-wrap" style="max-height:280px;overflow:auto;box-shadow:none"><table class="dtable"><thead><tr><th>وقت التحديث</th><th class="n">بلاغات</th><th>الملف</th><th></th></tr></thead><tbody>' +
      snaps.slice(0, 300).map(s => '<tr><td>' + fmtDateTime(s.at) + '</td><td class="n">' + s.rows.length + '</td><td style="font-size:.75rem;color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.file) + '</td><td><button class="lnk" data-del="' + esc(s.id) + '">حذف</button></td></tr>').join('') + '</tbody></table></div>' : '<p class="hint">ما فيه تقارير مرفوعة. استخدم زر «رفع التقرير» أعلى الشاشة. تقدر ترفع أكثر من ملف مرة وحدة.</p>') + '</div>';
  h += '<p class="sec-title">البيانات والنسخ الاحتياطي</p><div class="card"><p class="hint">كل البيانات محفوظة في هذا الجهاز فقط (قاعدة بيانات المتصفح). خذ نسخة احتياطية بشكل دوري، وانقلها لجهاز ثاني بـ«استرجاع نسخة».</p><div class="tools">' +
    '<button class="tbtn primary" id="seBak">حفظ نسخة احتياطية</button><label class="tbtn" for="seRes">استرجاع نسخة<input type="file" id="seRes" accept=".json" hidden></label>' +
    '<button class="tbtn danger" id="seReset">تصفير الأعطال</button><button class="tbtn" id="seDemo">تحميل بيانات تجريبية</button><button class="tbtn danger" id="seWipe">مسح كل البيانات</button></div>' +
    '<p class="hint">⚠️ رابط المنصة عام، وملفات أرقام العدادات ومواقعها منشورة معه. قبل ما توزّع الرابط على أحد، نحتاج نضيف تسجيل دخول (المرحلة الثانية).</p></div>';
  h += '<p class="hint" style="text-align:center">الإصدار 2 · <a href="' + ROOT + 'map.html">خريطة المقاولين</a></p>';
  root.querySelector('#seBody').innerHTML = h;
  const $ = s => root.querySelector(s);
  root.querySelectorAll('[data-zco]').forEach(i => i.onchange = () => { p.zones[+i.dataset.zco].co = i.value.trim(); saveSettings(); });
  root.querySelectorAll('[data-zwa]').forEach(i => i.onchange = () => { p.zones[+i.dataset.zwa].wa = arDigits(i.value).replace(/\D/g, '').replace(/^0+/, '').replace(/^5/, '9665'); i.value = p.zones[+i.dataset.zwa].wa; saveSettings(); });
  $('#seCo').onchange = e => { p.co = e.target.value.split('\n').map(s => s.trim()).filter(Boolean).map(s => { const [k, l] = s.split('=').map(x => x.trim()); return [k, l || k]; }); saveSettings(); toast('تم الحفظ'); };
  root.querySelectorAll('[data-tg]').forEach(i => i.onchange = () => { const v = parseFloat(i.value); if (v >= 0) { p.targets = Object.assign({ ...DEF_TARGETS }, p.targets || {}, { [i.dataset.tg]: v }); saveSettings(); } });
  root.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { const c = b.dataset.ex; p.exclude = p.exclude.includes(c) ? p.exclude.filter(x => x !== c) : [...p.exclude, c]; saveSettings(); });
  $('#seOnly').onchange = e => { p.onlyBuraydah = e.target.checked; saveSettings(); };
  $('#seTr').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; e.target.value = '';
    let n = 0; (await f.text()).split(/\r?\n/).forEach(line => {
      const c = line.split(/[,;\t]/).map(s => s.replace(/"/g, '').trim()); if (c.length < 3) return;
      const t = parseTr(c[0]), lat = parseFloat(c[1]), lng = parseFloat(c[2]);
      if (t && isFinite(lat) && isFinite(lng) && lat > 20 && lat < 32 && lng > 36 && lng < 56) { p.tr[t.key] = [lat, lng]; n++; }
    });
    await saveSettings(); toast(n ? 'تم إضافة ' + n + ' محول' : 'ما لقيت بيانات صالحة. الأعمدة: رقم المحول، خط العرض، خط الطول');
  };
  $('#seTrExp').onclick = () => {
    const rows = Object.entries(p.tr).map(([k, v]) => trLabel(k) + ',' + v[0] + ',' + v[1]);
    if (!rows.length) return toast('ما فيه مواقع محفوظة للحين');
    download('مواقع_المحولات.csv', '﻿رقم المحول,خط العرض,خط الطول\r\n' + rows.join('\r\n'));
  };
  root.querySelectorAll('[data-del]').forEach(b => armed(b, 'حذف', () => repo.deleteSnapshot(b.dataset.del)));
  $('#seBak').onclick = () => download('نسخة_منصة_بريدة_' + isoDay(now()) + '.json', JSON.stringify(repo.backup()), 'application/json');
  $('#seRes').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; e.target.value = '';
    try { await repo.restore(JSON.parse(await f.text())); toast('تم الاسترجاع'); } catch (x) { toast('الملف غير صالح. لازم يكون نسخة من هذي المنصة.'); }
  };
  armed($('#seReset'), 'تصفير الأعطال', async () => { await repo.resetFaults(); toast('تم تصفير الأعطال. الإعدادات والمقاولين باقية'); });
  $('#seDemo').onclick = loadDemo;
  armed($('#seWipe'), 'مسح كل البيانات', async () => { await repo.wipeAll(); toast('تم مسح كل البيانات من الجهاز'); });
}
async function loadDemo() {
  if (S.snapshots.length || S.reports.length) return toast('البيانات التجريبية تنحمل بس لما يكون الجهاز فاضي. خذ نسخة احتياطية وامسح البيانات أول.');
  toast('جاري تجهيز البيانات التجريبية…');
  const { snaps, rainDays } = demoSnapshots();
  rainDays.forEach(d => S.settings.rainDays[d] = true); S.settings.demo = true; await saveSettings();
  await repo.addSnapshots(snaps.map(s => Object.assign(s, { file: 'تجريبي' })));
  /* أسباب تجريبية: نترك ربع المقفلة بدون سبب عشان تتجرب المراجعة */
  let i = 0; const C = ['fuse', 'cable', 'joint', 'water', 'load', 'meter', 'other'];
  await repo.patchTickets(t => { if (!t.closed || (i++ % 4) === 0) return false; const r = (+t.task * 7919) % 100; t.cause = S.settings.rainDays[isoDay(t.start)] ? (r < 70 ? 'water' : 'cable') : C[r % C.length]; return true; });
  toast('تم تحميل ' + snaps.length + ' تقرير تجريبي');
}
export default { mount, render, tick: false };
