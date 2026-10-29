/* الخطة: مستويات الحدث، الأدوار، قائمة التجهيز، ترتيب الاستعادة، ملف الحدث */
import { S, saveSettings } from '../store/repo.js';
import { faults } from '../analysis/model.js';
import { metrics, suggest } from '../core/levels.js';
import { LV, WX, ESC } from '../core/const.js';
import { esc, fmtDur, csv, download, isoDay, now, armed, pct } from '../core/util.js';

const ROLES = [['ic', 'قائد الحدث'], ['disp', 'منسق البلاغات'], ['f1', 'منسق ميداني (أ، ب، ج)'], ['f2', 'منسق ميداني (د، هـ، و)'], ['f3', 'منسق ميداني (ز، ح، ط)'], ['safety', 'مسؤول السلامة'], ['log', 'مسؤول الإمداد'], ['doc', 'مسؤول التوثيق']];
const CHECK = [
  ['قبل الموسم', ['قائمة الجهات الحرجة ومغذي كل جهة محدّثة', 'قائمة المحطات والغرف المعرضة للغرق', 'أسماء وأرقام مسؤولي المقاولين ونوابهم مختبرة', 'مولدات أو محطة متنقلة محجوزة لكل جهة حرجة', 'رفع أو عزل المحطات في المنخفضات وتركيب مضخات', 'مخزون مواد يغطي أضعاف الموسم المعتاد']],
  ['قبل ٤٨ ساعة', ['كل مقاول أكد كتابيًا: الفرق، السيارات، المولدات، المواد', 'تفتيش المواقع المعرضة وإغلاق اللوحات المفتوحة', 'مسارات بديلة للفرق إذا انقطعت الطرق']],
  ['قبل ٢٤ ساعة', ['جدول الورديات معتمد والفرق الإضافية في حالة استدعاء', 'غرفة العمليات جاهزة: اللوحة والقروبات', 'تواصل مع الدفاع المدني والبلدية عن الطرق المتوقع إغلاقها']]];
let root;

function mount(el) { root = el; el.innerHTML = '<div class="pad" id="plBody"></div>'; }
function render() {
  if (!root || root.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const p = S.settings, e = S.event, l = e.level || 1, m = metrics(), sg = suggest(m), B = p.baseline;
  let h = '<div class="card"><h3>المستوى الحالي: ' + l + ' — ' + LV[l].n + '</h3><div class="tbl-wrap"><table class="sect lv"><thead><tr><th>المستوى</th><th>المحفز (أيهما أسبق)</th></tr></thead><tbody>' +
    [['١ عادي', 'المفتوح أقل من ' + 2 * B + ' ولا تنبيه'], ['٢ استعداد', 'تنبيه أصفر، أو المفتوح ' + 2 * B + ' فأكثر'], ['٣ حدث كبير', 'تنبيه برتقالي، أو المفتوح ' + 3 * B + ' فأكثر، أو ٥ بلاغات تجاوزت ٩٠ د، أو فصل مغذيين'], ['٤ حدث شامل', 'تنبيه أحمر، أو فصل ٣ مغذيات فأكثر']]
      .map((r, i) => '<tr' + (sg === i + 1 ? ' class="sg"' : '') + '><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</tbody></table></div>' +
    '<p class="hint">الآن: ' + m.open + ' مفتوح · ' + m.over90 + ' تجاوز ٩٠ د · ' + m.mv + ' فصل مغذي → المقترح المستوى ' + sg + '. تغيير المستوى من الزر أعلى الشاشة.</p>' +
    '<div class="prow"><label for="pBase">معدل البلاغات المفتوحة في اليوم العادي (B)</label><input id="pBase" class="inp sm" type="number" min="1" value="' + B + '"></div>' +
    '<div class="prow"><label for="pWx">تنبيه الأرصاد للقصيم</label><select id="pWx" class="inp sm">' + WX.map(([k, t]) => '<option value="' + k + '"' + (p.wx === k ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div></div>';
  h += '<p class="sec-title">التصعيد حسب عمر البلاغ</p><div class="card"><ul class="po">' + ESC.map(x => '<li><b>' + (x.min ? x.min + '+ د' : 'أقل من ٦٠ د') + '</b>: ' + x.t + '</li>').join('') + '</ul></div>';
  h += '<p class="sec-title">الأدوار</p><div class="card">' + ROLES.map(([k, t]) => '<div class="prow"><label for="r_' + k + '">' + t + '</label><input id="r_' + k + '" class="inp sm wide" data-role="' + k + '" value="' + esc(p.roles[k] || '') + '" placeholder="الاسم والجوال"></div>').join('') + '</div>';
  h += '<p class="sec-title">قائمة التجهيز <button class="lnk" id="pReset">بدء موسم جديد</button></p><div class="card">' + CHECK.map(([g, items], gi) => '<p class="pg">' + g + '</p>' + items.map((t, ii) => { const k = gi + '-' + ii; return '<label class="chk"><input type="checkbox" data-ck="' + k + '"' + (p.checks[k] ? ' checked' : '') + '> <span>' + t + '</span></label>'; }).join('')).join('') + '</div>';
  h += '<p class="sec-title">ترتيب الاستعادة</p><div class="card"><ol class="po"><li>خطر على الأرواح</li><li>أسلاك أو معدات ساقطة على طرق رئيسية</li><li>محطات التحويل ونقاط التغذية</li><li>مغذيات تغذي جهات حرجة</li><li>باقي مغذيات الجهد المتوسط</li><li>محطات ومحولات تغذي جهات حرجة</li><li>باقي المحطات والمحولات</li><li>الحالات الطبية الفردية</li><li>المشتركين الأفراد</li><li>التنظيف والإصلاح النهائي</li></ol></div>';
  h += '<p class="sec-title">السلامة في الأمطار</p><div class="card"><ul class="po"><li>لا عمل على معدة مغمورة</li><li>المحطة اللي يرتفع حولها الماء تُفصل قبل ما تغرق</li><li>لا إعادة تشغيل قبل التجفيف وفحص العزل واعتماد مسؤول السلامة</li><li>لا عبور لمجاري السيول بالسيارات</li></ul></div>';
  /* ملف الحدث */
  const from = e.start || (e.log.length ? e.log[e.log.length - 1].t : now() - 86400000);
  const F = faults({ from }), done = F.filter(f => !f.open), in3 = done.filter(f => f.dur <= 180).length;
  h += '<p class="sec-title">ملف الحدث <small>' + (e.start ? 'من بداية الحدث' : 'آخر ٢٤ ساعة') + '</small></p><div class="card"><div class="kgrid"><div><b>' + F.length + '</b><span>بلاغ</span></div><div><b>' + (done.length ? pct(in3, done.length) + '%' : '—') + '</b><span>انتهى خلال ٣ ساعات</span></div><div><b>' + F.filter(f => f.dur >= 120).length + '</b><span>تجاوز ساعتين</span></div></div>' +
    '<div class="tools"><button class="tbtn primary" id="pFile">تصدير ملف الحدث</button></div><p class="hint">الطقس القاسي مستثنى من معايير مستوى الخدمة ما لم يثبت التقصير، ويُبلَّغ المنظم خلال ٥ أيام عمل. ملف الحدث فيه الأوقات وأسباب التأخير لهذا الغرض.</p></div>';
  root.querySelector('#plBody').innerHTML = h;
  const $ = s => root.querySelector(s);
  $('#pBase').onchange = ev => { p.baseline = Math.max(1, parseInt(ev.target.value) || 15); saveSettings(); };
  $('#pWx').onchange = ev => { p.wx = ev.target.value; saveSettings(); };
  root.querySelectorAll('[data-role]').forEach(i => i.onchange = () => { p.roles[i.dataset.role] = i.value.trim(); saveSettings(); });
  root.querySelectorAll('[data-ck]').forEach(i => i.onchange = () => { p.checks[i.dataset.ck] = i.checked; saveSettings(); });
  armed($('#pReset'), 'بدء موسم جديد', () => { p.checks = {}; saveSettings(); });
  $('#pFile').onclick = () => exportFile(F, from);
}
function exportFile(F, from) {
  const e = S.event, rows = [['ملف الحدث — كهرباء بريدة'], ['بداية الحدث', e.start ? new Date(e.start).toLocaleString('en-GB') : new Date(from).toLocaleString('en-GB')], ['نهاية الحدث', e.closedAt && !e.start ? new Date(e.closedAt).toLocaleString('en-GB') : 'مستمر'], [], ['سجل المستويات', 'الوقت', 'المستوى']];
  e.log.forEach(x => rows.push(['', new Date(x.t).toLocaleString('en-GB'), x.level + ' — ' + LV[x.level].n]));
  rows.push([], ['الأدوار']); ROLES.forEach(([k, t]) => rows.push(['', t, S.settings.roles[k] || '']));
  rows.push([], ['المصدر', 'الرقم', 'البداية', 'النهاية', 'المدة (د)', 'المركز', 'المقاول', 'الفني', 'المشرف', 'المحول', 'السبب', 'سبب التأخير', 'ملاحظات', 'خط العرض', 'خط الطول']);
  F.sort((a, b) => a.start - b.start).forEach(f => rows.push([f.src === 'sec' ? 'تقرير الكهرباء' : 'يدوي', f.id, new Date(f.start).toLocaleString('en-GB'), f.end ? new Date(f.end).toLocaleString('en-GB') + (f.uncertain ? ' (تقريبي)' : '') : 'مفتوح', f.dur, f.center, f.co, f.tech, f.sup, f.tr, f.cause, f.ref.delay || '', f.ref.note || '', f.lat ?? '', f.lng ?? '']));
  download('ملف_الحدث_' + isoDay(now()) + '.csv', csv(rows));
}
export default { mount, render, tick: false };
