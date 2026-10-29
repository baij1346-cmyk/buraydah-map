/* قائمة «المزيد» للجوال */
import { S } from '../store/repo.js';
import { ROOT } from '../core/ui.js';
const I = {
  review: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  control: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 8v5M12 16h.01"/>',
  plan: '<path d="M9 4h6v3H9zM6 6H5v15h14V6h-1"/><path d="M9 12h6M9 16h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'
};
let root;
function mount(el) { root = el; el.innerHTML = '<div class="pad"><div class="more-list" id="moBody"></div></div>'; }
function render() {
  const nc = [...S.tickets.values()].filter(t => (t.closed || (t.mclosed && t.mclosed >= t.lastSeen)) && !t.cause).length + S.reports.filter(r => r.st === 'done' && !r.cause).length;
  const L = [['review', 'المراجعة', nc ? nc + ' بلاغ مقفل بدون سبب' : 'البلاغات المقفلة، المتكرر، النقاط الساخنة'], ['control', 'الضبط', 'مخالفات المقاولين وتصدير المحضر'],
    ['plan', 'الخطة', 'المستويات، الأدوار، التجهيز، ملف الحدث'], ['settings', 'الإعدادات', 'المقاولين، المحولات، النسخ الاحتياطي']];
  root.querySelector('#moBody').innerHTML = L.map(([k, t, d]) => '<a href="#' + k + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + I[k] + '</svg><span>' + t + '<small>' + d + '</small></span></a>').join('') +
    '<a href="' + ROOT + 'map.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + I.map + '</svg><span>خريطة المقاولين<small>البحث برقم العداد أو المحطة</small></span></a>';
}
export default { mount, render };
