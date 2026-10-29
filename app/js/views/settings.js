/* الإعدادات: المقاولين، ربط الفنيين، مواقع المحولات، التقارير المرفوعة، النسخ الاحتياطي */
import * as repo from '../store/repo.js';
import { S, saveSettings } from '../store/repo.js';
import { G, parseTr, trLabel } from '../core/geo.js';
import { ROOT } from '../core/ui.js';
import { COLORS, DIR } from '../core/const.js';
import { demoSnapshots } from '../core/demo.js';
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
  h += '<p class="sec-title">مواقع المحولات <small>' + nTr + ' محفوظ</small></p><div class="card"><p class="hint">ارفع ملف CSV من GIS فيه ثلاث أعمدة: رقم المحول (مثل 4100-QBS-066128)، خط العرض، خط الطول. بعدها كل بلاغ يطلع على الخريطة ويدخل في الحصر بدقة. بدونه المنصة تستخدم موقع تقريبي من 511 (يطابق تقريبًا نص محولات بريدة).</p>' +
    '<div class="tools"><label class="tbtn primary" for="seTr">رفع قائمة المحولات (CSV)<input type="file" id="seTr" accept=".csv,.txt" hidden></label><button class="tbtn" id="seTrExp">تصدير المواقع المحفوظة</button></div></div>';
  h += '<p class="sec-title">عام</p><div class="card">' +
    '<label class="chk"><input type="checkbox" id="seOnly"' + (p.onlyBuraydah ? ' checked' : '') + '> <span>غرفة العمليات: اعرض بلاغات مركز بريدة فقط</span></label>' + '</div>';
  h += '<p class="sec-title">تقارير الكهرباء المرفوعة <small>' + snaps.length + ' تقرير</small></p><div class="card">' +
    (snaps.length ? '<div class="tbl-wrap" style="max-height:280px;overflow:auto;box-shadow:none"><table class="dtable"><thead><tr><th>وقت التحديث</th><th class="n">بلاغات</th><th>الملف</th><th></th></tr></thead><tbody>' +
      snaps.slice(0, 300).map(s => '<tr><td>' + fmtDateTime(s.at) + '</td><td class="n">' + s.rows.length + '</td><td style="font-size:.75rem;color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.file) + '</td><td><button class="lnk" data-del="' + esc(s.id) + '">حذف</button></td></tr>').join('') + '</tbody></table></div>' : '<p class="hint">ما فيه تقارير مرفوعة. استخدم زر «رفع التقرير» أعلى الشاشة. تقدر ترفع أكثر من ملف مرة وحدة.</p>') + '</div>';
  h += '<p class="sec-title">البيانات والنسخ الاحتياطي</p><div class="card"><p class="hint">كل البيانات محفوظة في هذا الجهاز فقط (قاعدة بيانات المتصفح). خذ نسخة احتياطية بشكل دوري، وانقلها لجهاز ثاني بـ«استرجاع نسخة».</p><div class="tools">' +
    '<button class="tbtn primary" id="seBak">حفظ نسخة احتياطية</button><label class="tbtn" for="seRes">استرجاع نسخة<input type="file" id="seRes" accept=".json" hidden></label>' +
    '<button class="tbtn" id="seDemo">تحميل بيانات تجريبية</button><button class="tbtn danger" id="seWipe">مسح كل البيانات</button></div>' +
    '<p class="hint">⚠️ رابط المنصة عام، وملفات أرقام العدادات ومواقعها منشورة معه. قبل ما توزّع الرابط على أحد، نحتاج نضيف تسجيل دخول (المرحلة الثانية).</p></div>';
  h += '<p class="hint" style="text-align:center">الإصدار ٢ · <a href="' + ROOT + 'board.html">اللوحة القديمة</a> · <a href="' + ROOT + 'map.html">خريطة المقاولين</a></p>';
  root.querySelector('#seBody').innerHTML = h;
  const $ = s => root.querySelector(s);
  root.querySelectorAll('[data-zco]').forEach(i => i.onchange = () => { p.zones[+i.dataset.zco].co = i.value.trim(); saveSettings(); });
  root.querySelectorAll('[data-zwa]').forEach(i => i.onchange = () => { p.zones[+i.dataset.zwa].wa = arDigits(i.value).replace(/\D/g, '').replace(/^0+/, '').replace(/^5/, '9665'); i.value = p.zones[+i.dataset.zwa].wa; saveSettings(); });
  $('#seCo').onchange = e => { p.co = e.target.value.split('\n').map(s => s.trim()).filter(Boolean).map(s => { const [k, l] = s.split('=').map(x => x.trim()); return [k, l || k]; }); saveSettings(); toast('تم الحفظ'); };
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
