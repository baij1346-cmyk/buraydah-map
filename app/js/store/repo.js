/* طبقة البيانات (repository): كل القراءة والكتابة تمر من هنا.
   الحين: IndexedDB في الجهاز. لاحقًا (المرحلة 2) تتبدل بـ Supabase بنفس الدوال. */
import * as db from './idb.js';
import { reconcile, updatedAt } from '../sec/reconcile.js';
import { DEF_CO, DEF_RULES, DEF_EXCLUDE, DEF_ZONES_TABLE } from '../core/const.js';
import { now } from '../core/util.js';

const USER_FIELDS = ['cause', 'causeNote', 'st', 'ts', 'delay', 'note', 'mclosed'];
const DEF_SETTINGS = () => ({
  co: DEF_CO.map(x => x.slice()), tr: {}, zones: Array.from({ length: 9 }, () => ({ co: '', wa: '' })),
  sla: { 1: 30, 2: 60, 3: 120, 4: 240 }, rules: { ...DEF_RULES }, rainDays: {},
  baseline: 15, wx: 'none', roles: {}, checks: {}, lastUpd: null, exclude: [...DEF_EXCLUDE], zonesTable: JSON.parse(JSON.stringify(DEF_ZONES_TABLE))
});
const DEF_EVENT = () => ({ level: 1, start: null, closedAt: null, log: [] });

export const S = { settings: DEF_SETTINGS(), event: DEF_EVENT(), seq: 1, snapshots: [], tickets: new Map(), reports: [], violations: [] };
const subs = new Set();
export const onChange = fn => subs.add(fn);
const emit = () => subs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

export async function init() {
  const [kv, snaps, tix, reps, vio] = await Promise.all(['kv', 'snapshots', 'tickets', 'reports', 'violations'].map(db.all));
  const K = Object.fromEntries(kv.map(x => [x.k, x.v]));
  S.settings = Object.assign(DEF_SETTINGS(), K.settings || {});
  S.settings.rules = Object.assign({ ...DEF_RULES }, S.settings.rules || {});
  /* كلمات مقاولين جديدة تنضاف لقائمة المستخدم بدون ما تمس تعديلاته */
  DEF_CO.forEach(([k, l]) => { if (!S.settings.co.some(x => x[0] === k)) S.settings.co.push([k, l]); });
  if (!Array.isArray(S.settings.exclude)) S.settings.exclude = [...DEF_EXCLUDE];
  if (!S.settings.zonesTable) S.settings.zonesTable = JSON.parse(JSON.stringify(DEF_ZONES_TABLE));
  S.event = Object.assign(DEF_EVENT(), K.event || {});
  S.seq = K.seq || 1;
  S.snapshots = snaps.sort((a, b) => a.at - b.at);
  S.tickets = new Map(tix.map(t => [t.task, t]));
  S.reports = reps.sort((a, b) => a.t - b.t);
  S.violations = vio.sort((a, b) => a.t - b.t);
  db.persist();
  return !K.migrated;
}
const saveKV = (k, v) => db.put('kv', { k, v });
export const saveSettings = () => { emit(); return saveKV('settings', S.settings); };
export const saveEvent = () => { emit(); return saveKV('event', S.event); };
export const markMigrated = () => saveKV('migrated', true);
function nextId() { const id = S.seq++; saveKV('seq', S.seq); return id; }

/* ---------- لقطات تقرير الكهرباء ---------- */
/* يرجع {added, closed, isNew, dup} */
export async function addSnapshot(parsed, file) {
  const at = updatedAt(parsed.updated) || now();
  const prevOpen = new Set([...S.tickets.values()].filter(t => !t.closed).map(t => t.task));
  const old = S.snapshots.find(s => s.at === at);
  const snap = { id: old ? old.id : at + '-' + Math.random().toString(36).slice(2, 7), at, importedAt: now(), file: file || '', rows: parsed.tickets, summary: parsed.summary || null };
  if (old) S.snapshots[S.snapshots.indexOf(old)] = snap; else S.snapshots.push(snap);
  S.snapshots.sort((a, b) => a.at - b.at);
  await db.put('snapshots', snap);
  await rebuildTickets();
  const nowOpen = [...S.tickets.values()].filter(t => !t.closed);
  const added = nowOpen.filter(t => !prevOpen.has(t.task)).length;
  const closed = [...prevOpen].filter(k => { const t = S.tickets.get(k); return t && t.closed; }).length;
  emit();
  return { at, added, closed, dup: !!old, latest: at === S.snapshots[S.snapshots.length - 1].at, count: parsed.tickets.length };
}
/* رفع دفعة لقطات مرة وحدة (للبيانات التجريبية أو الاسترجاع) */
export async function addSnapshots(list) {
  const snaps = list.map(p => { const at = updatedAt(p.updated) || now(); return { id: at + '-' + Math.random().toString(36).slice(2, 7), at, importedAt: now(), file: p.file || '', rows: p.tickets, summary: p.summary || null }; });
  S.snapshots = S.snapshots.filter(s => !snaps.some(x => x.at === s.at)).concat(snaps).sort((a, b) => a.at - b.at);
  await db.putMany('snapshots', snaps); await rebuildTickets(); emit();
}
export async function patchTickets(fn) {
  const changed = []; S.tickets.forEach(t => { if (fn(t)) changed.push(t); });
  await db.putMany('tickets', changed); emit();
}
export async function deleteSnapshot(id) {
  S.snapshots = S.snapshots.filter(s => s.id !== id);
  await db.del('snapshots', id); await rebuildTickets(); emit();
}
async function rebuildTickets() {
  const derived = reconcile(S.snapshots);
  const next = new Map();
  derived.forEach((t, k) => {
    const old = S.tickets.get(k);
    if (old) USER_FIELDS.forEach(f => { if (old[f] !== undefined) t[f] = old[f]; });
    next.set(k, t);
  });
  const gone = [...S.tickets.keys()].filter(k => !next.has(k));
  S.tickets = next;
  await db.clear('tickets'); await db.putMany('tickets', [...next.values()]);
  return gone;
}
export const latestSnapshot = () => S.snapshots[S.snapshots.length - 1] || null;
export async function updateTicket(task, patch) {
  const t = S.tickets.get(task); if (!t) return;
  Object.assign(t, patch); await db.put('tickets', t); emit();
}

/* ---------- البلاغات اليدوية ---------- */
export async function addReport(r) { r.id = nextId(); S.reports.push(r); await db.put('reports', r); emit(); return r; }
export async function updateReport(id, patch) {
  const r = S.reports.find(x => x.id === id); if (!r) return;
  Object.assign(r, patch); await db.put('reports', r); emit(); return r;
}
export async function setReportStatus(id, st) {
  const r = S.reports.find(x => x.id === id); if (!r) return;
  r.st = st; r.ts = r.ts || {}; r.ts[st] = r.ts[st] || now(); await db.put('reports', r); emit();
}
export async function clearReports() { S.reports = []; await db.clear('reports'); emit(); }

/* ---------- مخالفات المقاولين ---------- */
export async function addViolation(v) { v.id = nextId(); v.t = v.t || now(); S.violations.push(v); await db.put('violations', v); emit(); return v; }
export async function deleteViolation(id) { S.violations = S.violations.filter(v => v.id !== id); await db.del('violations', id); emit(); }

/* ---------- النسخ الاحتياطي ---------- */
export function backup() {
  return { app: 'buraydah-grid-ops', v: 1, at: now(), settings: S.settings, event: S.event, seq: S.seq, snapshots: S.snapshots, tickets: [...S.tickets.values()], reports: S.reports, violations: S.violations };
}
export async function restore(b) {
  if (!b || b.app !== 'buraydah-grid-ops') throw new Error('bad');
  await Promise.all(['snapshots', 'tickets', 'reports', 'violations'].map(db.clear));
  S.settings = Object.assign(DEF_SETTINGS(), b.settings || {}); S.event = Object.assign(DEF_EVENT(), b.event || {}); S.seq = b.seq || 1;
  S.snapshots = b.snapshots || []; S.tickets = new Map((b.tickets || []).map(t => [t.task, t]));
  S.reports = b.reports || []; S.violations = b.violations || [];
  await Promise.all([saveKV('settings', S.settings), saveKV('event', S.event), saveKV('seq', S.seq),
    db.putMany('snapshots', S.snapshots), db.putMany('tickets', [...S.tickets.values()]), db.putMany('reports', S.reports), db.putMany('violations', S.violations)]);
  emit();
}
/* تصفير الأعطال: يمسح التقارير والبلاغات ويبقي الإعدادات والمقاولين والأهداف والمخالفات */
export async function resetFaults() {
  await Promise.all(['snapshots', 'tickets', 'reports'].map(db.clear));
  S.snapshots = []; S.tickets = new Map(); S.reports = [];
  S.event = { level: 1, start: null, closedAt: null, log: [] }; await saveKV('event', S.event);
  emit();
}
export async function wipeAll() {
  await Promise.all(['snapshots', 'tickets', 'reports', 'violations', 'kv'].map(db.clear));
  Object.assign(S, { settings: DEF_SETTINGS(), event: DEF_EVENT(), seq: 1, snapshots: [], tickets: new Map(), reports: [], violations: [] });
  await markMigrated(); emit();
}
