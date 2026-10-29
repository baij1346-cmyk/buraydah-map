/* نقل البيانات من اللوحة القديمة (board.html) أول مرة تنفتح المنصة.
   نفس الموقع (github.io) فالمتصفح يشوف تخزينها. ما نمسح القديم. */
import { S, saveSettings, saveEvent, addSnapshot, markMigrated } from './repo.js';
import * as db from './idb.js';

const get = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };

export async function migrateOld() {
  const board = get('brd-rain-board-v1'), cfg = get('brd-sec-cfg-v1'), rep = get('brd-sec-report-v1');
  const done = [];
  if (cfg) {
    if (Array.isArray(cfg.co) && cfg.co.length) S.settings.co = cfg.co;
    if (cfg.tr) S.settings.tr = Object.assign({}, cfg.tr, S.settings.tr);
    if (cfg.tr && Object.keys(cfg.tr).length) done.push(Object.keys(cfg.tr).length + ' موقع محول');
  }
  if (board) {
    if (board.sla) S.settings.sla = board.sla;
    if (board.plan) ['baseline', 'wx', 'roles', 'checks', 'lastUpd'].forEach(k => { if (board.plan[k] !== undefined) S.settings[k] = board.plan[k]; });
    if (board.event) {
      S.event.level = board.event.level || 1; S.event.start = board.event.start || null;
      S.event.closedAt = board.event.closedAt || null; S.event.log = board.event.log || [];
    }
    if (Array.isArray(board.reports) && board.reports.length) {
      S.reports = board.reports.map(r => Object.assign({ ts: {} }, r));
      S.seq = Math.max(board.seq || 1, ...S.reports.map(r => r.id + 1));
      await db.putMany('reports', S.reports); await db.put('kv', { k: 'seq', v: S.seq });
      done.push(S.reports.length + ' بلاغ يدوي');
    }
  }
  await saveSettings(); await saveEvent();
  if (rep && Array.isArray(rep.tickets) && rep.tickets.length) {
    await addSnapshot(rep, rep.file || 'من اللوحة القديمة');
    done.push('آخر تقرير كهرباء (' + rep.tickets.length + ' بلاغ)');
  }
  await markMigrated();
  return done;
}
