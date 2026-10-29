/* نقطة البداية: تحميل البيانات، الشريط العلوي، التنقل بين الأقسام، رفع التقرير */
import * as repo from './store/repo.js';
import { migrateOld } from './store/migrate.js';
import { loadGeo } from './core/geo.js';
import { readReport } from './sec/pdf.js';
import { updatedAt } from './sec/reconcile.js';
import { LV } from './core/const.js';
import { toast, fmtDur, fmtTime, mins, now, esc } from './core/util.js';
import { metrics, suggest, setLevel } from './core/levels.js';
import { openSheet, closeSheet, ctx } from './core/ui.js';
import { openFaults, faults } from './analysis/model.js';
import ops from './views/ops.js';
import manage from './views/manage.js';
import review from './views/review.js';
import control from './views/control.js';
import hasr from './views/hasr.js';
import stats from './views/stats.js';
import plan from './views/plan.js';
import settings from './views/settings.js';
import more from './views/more.js';

const VIEWS = { ops, manage, review, control, hasr, stats, plan, settings, more };
const mounted = new Set();
let cur = 'ops';

/* سياق مشترك تستخدمه الأقسام */
export const app = { go: show, importFiles };
ctx.go = show; ctx.importFiles = importFiles;

function show(v) {
  if (!VIEWS[v]) v = 'ops';
  if (location.hash.slice(1) !== v) history.pushState(null, '', '#' + v);
  cur = v;
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== 'v-' + v);
  document.querySelectorAll('#nav a').forEach(a => a.setAttribute('aria-current', a.dataset.v === v || (v !== 'ops' && ['review', 'control', 'plan', 'settings'].includes(v) && a.dataset.v === 'more' && matchMedia('(max-width:999px)').matches) ? 'page' : 'false'));
  const el = document.getElementById('v-' + v);
  if (!mounted.has(v)) { VIEWS[v].mount(el, app); mounted.add(v); }
  VIEWS[v].render();
  document.title = el.dataset.title + ' — كهرباء بريدة';
}
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

/* ---------- الشريط العلوي ---------- */
const lvlBtn = document.getElementById('lvlBtn');
function renderBar() {
  const l = repo.S.event.level || 1, m = metrics(), sg = suggest(m), e = repo.S.event;
  lvlBtn.style.background = LV[l].bg; lvlBtn.style.color = LV[l].c; lvlBtn.textContent = 'المستوى ' + l + ' — ' + LV[l].n;
  /* حداثة التقرير: أخضر أقل من 45 د، برتقالي لين ساعتين، أحمر بعدها */
  const snap = repo.latestSnapshot(), fresh = document.getElementById('fresh');
  if (snap) {
    const age = mins(now() - snap.at);
    fresh.className = 'fresh' + (age >= 120 ? ' stale' : age >= 45 ? ' old' : '');
    fresh.innerHTML = '<i></i><span>آخر تقرير ' + fmtTime(snap.at) + ' · قبل ' + fmtDur(age) + '</span>';
    fresh.title = 'آخر تقرير كهرباء مرفوع: ' + fmtTime(snap.at);
  } else { fresh.className = 'fresh none'; fresh.innerHTML = '<i></i><span>ما فيه تقرير</span>'; }
  let sub = '', warn = false;
  if (sg > l) { sub = 'المؤشرات تقترح المستوى ' + sg + ' — ' + LV[sg].n; warn = true; }
  else if (l > 1 && LV[l].cad) {
    const last = repo.S.settings.lastUpd && repo.S.settings.lastUpd > (e.start || 0) ? repo.S.settings.lastUpd : e.start || now();
    const left = LV[l].cad - mins(now() - last);
    sub = left <= 0 ? 'موعد تحديث الحالة الآن' : 'تحديث الحالة القادم بعد ' + fmtDur(left); warn = left <= 0;
  } else if (e.start) sub = 'حدث معلن منذ ' + fmtDur(mins(now() - e.start));
  const evSub = document.getElementById('evSub'); evSub.textContent = sub; evSub.className = 'ev-sub' + (warn ? ' warn' : '');
  const op = openFaults(), b90 = op.filter(f => f.dur >= 90 && f.dur < 120).length, b120 = op.filter(f => f.dur >= 120).length;
  const day0 = new Date().setHours(0, 0, 0, 0), today = faults({ from: day0 - 86400000 }).filter(f => !f.open && f.end >= day0);
  const avgToday = today.length ? Math.round(today.reduce((a, f) => a + f.dur, 0) / today.length) : null;
  const noCause = [...repo.S.tickets.values()].filter(t => t.closed && !t.cause).length + repo.S.reports.filter(r => r.st === 'done' && !r.cause).length;
  document.getElementById('kpis').innerHTML =
    kpi(op.length, 'مفتوح', '', 'ops') + kpi(b90, '90–119 د', b90 ? 'warn' : '', 'ops') + kpi(b120, 'تجاوز ساعتين', b120 ? 'alert' : '', 'ops') +
    (m.mv ? kpi(m.mv, 'فصل مغذي', 'alert', 'manage') : '') + kpi(today.length, 'انقفل اليوم', '', 'stats') +
    kpi(avgToday == null ? '—' : fmtDur(avgToday), 'متوسط الإغلاق اليوم', avgToday > 90 ? 'warn' : '', 'stats') + kpi(noCause, 'مقفل بدون سبب', noCause ? 'warn' : '', 'review');
  document.querySelectorAll('.kpi[data-go]').forEach(b => b.onclick = () => app.go(b.dataset.go));
  badge('bOps', b90 + b120); badge('bReview', noCause); badge('bMore', noCause);
}
const kpi = (n, t, cls, go) => '<button class="kpi ' + cls + '" data-go="' + go + '"><b>' + n + '</b><span>' + t + '</span></button>';
function badge(id, n) { const e = document.getElementById(id); if (e) { e.hidden = !n; e.textContent = n; } }
lvlBtn.onclick = () => {
  const l = repo.S.event.level || 1, m = metrics(), sg = suggest(m);
  const sh = openSheet('<h2>مستوى الحدث</h2><p class="hint">المؤشرات الآن: ' + m.open + ' مفتوح · ' + m.over90 + ' تجاوز 90 د · ' + m.mv + ' فصل مغذي · المقترح: <b>المستوى ' + sg + '</b></p>' +
    [1, 2, 3, 4].map(i => '<button class="lvb' + (i === l ? ' cur' : '') + '" data-l="' + i + '" style="--c:' + (i === 4 ? '#A50E0E' : LV[i].c) + '"><b>المستوى ' + i + ' — ' + LV[i].n + (i === sg && i !== l ? ' (مقترح)' : '') + '</b><span>' + LV[i].what + '</span></button>').join('') +
    '<button class="tbtn" data-x style="justify-content:center">إلغاء</button>');
  sh.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { setLevel(+b.dataset.l); closeSheet(); });
  sh.querySelector('[data-x]').onclick = closeSheet;
};

/* ---------- رفع تقرير الكهرباء ---------- */
async function importFiles(files) {
  const out = [];
  for (const f of files) {
    toast('جاري قراءة ' + f.name + '…');
    try {
      const reps = await readReport(f);
      if (!reps.length) { out.push('<li>' + esc(f.name) + ': ما لقيت بلاغات. تأكد إنه تقرير توجيه البلاغات.</li>'); continue; }
      if (reps.length === 1) {
        const res = await repo.addSnapshot(reps[0], f.name);
        out.push('<li><b>' + esc(f.name) + '</b> — تحديث ' + fmtTime(res.at) + ': ' + res.count + ' بلاغ مفتوح' +
          (res.dup ? ' (نفس التقرير مرفوع قبل، تم تحديثه)' : '') + (res.latest ? '' : ' · تقرير أقدم من آخر مرفوع، أُضيف للسجل') +
          '<br>جديد: <b>' + res.added + '</b> · انقفل منذ التقرير السابق: <b>' + res.closed + '</b></li>');
      } else {
        /* ملف مجمّع: كل تقرير فيه لقطة مستقلة */
        const before = repo.S.tickets.size, closedBefore = [...repo.S.tickets.values()].filter(t => t.closed).length;
        await repo.addSnapshots(reps.map(r => Object.assign(r, { file: f.name })));
        const ats = reps.map(r => updatedAt(r.updated)).filter(Boolean).sort((a, b) => a - b);
        out.push('<li><b>' + esc(f.name) + '</b> — ملف مجمّع فيه <b>' + reps.length + '</b> تقرير (من ' + fmtTime(ats[0]) + ' إلى ' + fmtTime(ats[ats.length - 1]) + ')' +
          '<br>بلاغات جديدة على المنصة: <b>' + (repo.S.tickets.size - before) + '</b> · انقفل: <b>' + ([...repo.S.tickets.values()].filter(t => t.closed).length - closedBefore) + '</b></li>');
      }
    } catch (e) {
      console.error(e);
      out.push('<li>' + esc(f.name) + ': ' + (e.message === 'load' ? 'تحتاج إنترنت لقراءة PDF أول مرة' : 'تعذّرت قراءة الملف') + '</li>');
    }
  }
  const closedNoCause = [...repo.S.tickets.values()].filter(t => t.closed && !t.cause).length;
  const sh = openSheet('<h2>نتيجة رفع التقرير</h2><ul class="po">' + out.join('') + '</ul>' +
    (closedNoCause ? '<p class="hint">فيه ' + closedNoCause + ' بلاغ مقفل بدون سبب. سجّل السبب من «المراجعة» عشان يطلع في الحصر.</p>' : '') +
    '<div class="sheet-actions"><button class="tbtn primary" data-ok>تمام</button>' + (closedNoCause ? '<button class="tbtn" data-rv>سجّل الأسباب</button>' : '') + '</div>');
  sh.querySelector('[data-ok]').onclick = closeSheet;
  const rv = sh.querySelector('[data-rv]'); if (rv) rv.onclick = () => { closeSheet(); app.go('review'); };
}
document.getElementById('pdfIn').addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) importFiles(fs); });

/* ---------- التشغيل ---------- */
(async () => {
  const boot = document.getElementById('boot');
  try {
    if (!window.L) throw new Error('leaflet');
    const [first] = await Promise.all([repo.init(), loadGeo()]);
    if (first) {
      const moved = await migrateOld();
      if (moved.length) setTimeout(() => toast('تم نقل بياناتك من اللوحة القديمة: ' + moved.join('، ')), 600);
    }
  } catch (e) {
    console.error(e);
    boot.innerHTML = 'تعذّر التشغيل.<br>' + (e.message === 'leaflet' ? 'تأكد من الاتصال بالإنترنت ثم حدّث الصفحة.' : 'المتصفح ما يدعم التخزين، أو الصفحة مفتوحة في وضع التصفح الخاص.');
    return;
  }
  boot.remove();
  repo.onChange(() => { renderBar(); if (mounted.has(cur)) VIEWS[cur].render(); });
  renderBar(); show(location.hash.slice(1) || 'ops');
  setInterval(() => { renderBar(); if (mounted.has(cur) && VIEWS[cur].tick !== false) VIEWS[cur].render(); }, 60000);
})();
