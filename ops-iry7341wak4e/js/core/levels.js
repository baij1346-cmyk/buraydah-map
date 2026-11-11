/* مستويات الحدث: المؤشرات، المستوى المقترح، والإعلان */
import { S, saveEvent, saveSettings } from '../store/repo.js';
import { openFaults } from '../analysis/model.js';
import { LV } from './const.js';
import { now, toast } from './util.js';

export function metrics() {
  const op = openFaults();
  return {
    open: op.length,
    over90: op.filter(f => f.dur >= 90 && !(f.src === 'manual' && f.st === 'site')).length,
    over120: op.filter(f => f.dur >= 120).length,
    mv: op.filter(f => f.src === 'manual' && f.kind === 'mv').length
  };
}
export function suggest(m = metrics()) {
  const b = Math.max(1, S.settings.baseline || 15), wx = S.settings.wx;
  if (wx === 'red' || m.mv >= 3) return 4;
  if (wx === 'orange' || m.open >= 3 * b || m.over90 >= 5 || m.mv >= 2) return 3;
  if (wx === 'yellow' || m.open >= 2 * b) return 2;
  return 1;
}
export function setLevel(l) {
  const e = S.event; if (e.level === l) return;
  e.level = l; e.log.push({ t: now(), level: l });
  if (l >= 2 && !e.start) { e.start = now(); e.closedAt = null; }
  if (l === 1 && e.start) { e.closedAt = now(); e.start = null; }
  saveEvent(); toast('تم إعلان المستوى ' + l + ' — ' + LV[l].n);
}
export function markUpdateSent() { S.settings.lastUpd = now(); saveSettings(); }
