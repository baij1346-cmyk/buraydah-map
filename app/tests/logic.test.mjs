/* تشغيل: node --test app/tests/*.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../js/sec/reconcile.js';
import { analyze } from '../js/analysis/hasr.js';
import { table } from '../js/analysis/stats.js';
import { DEF_RULES } from '../js/core/const.js';
const M = 60000, H = 60 * M, D = 24 * H;
const row = (task, mins, extra = {}) => ({ task, mins, center: 'بريدة', tech: 'فني', trPre: 'QBS', trNum: '066128', ...extra });

test('ticket that disappears is closed between snapshots', () => {
  const t0 = Date.UTC(2026, 9, 29, 10);
  const snaps = [
    { at: t0, rows: [row('50000001', 30), row('50000002', 10)] },
    { at: t0 + H, rows: [row('50000002', 70), row('50000003', 5)] },
    { at: t0 + 2 * H, rows: [row('50000003', 65)] }];
  const m = reconcile(snaps);
  const a = m.get('50000001'), b = m.get('50000002'), c = m.get('50000003');
  assert.equal(a.closed, true); assert.equal(a.start, t0 - 30 * M);
  assert.equal(a.durMin, 30); assert.equal(a.durMax, 90); assert.equal(a.dur, 60);
  assert.equal(b.closed, true); assert.equal(b.dur, 100);
  assert.equal(c.closed, false); assert.equal(c.seen, 2);
});
test('order of upload does not matter', () => {
  const t0 = 1e12, s1 = { at: t0, rows: [row('5', 10)] }, s2 = { at: t0 + H, rows: [] };
  assert.deepEqual([...reconcile([s2, s1]).values()], [...reconcile([s1, s2]).values()]);
});
test('wide gap marks closure uncertain', () => {
  const m = reconcile([{ at: 0, rows: [row('5', 10)] }, { at: 5 * H, rows: [] }]);
  assert.equal(m.get('5').uncertain, true);
});
test('hasr classifies replace / maintain / reinforce / watch', () => {
  const now = Date.UTC(2026, 9, 29);
  const f = (tr, daysAgo, cause, rain = false, peak = false) => ({ src: 'sec', id: tr + daysAgo + cause, tr, start: now - daysAgo * D, cause, rain, peak, acc: 'a' + daysAgo, zone: 4, center: 'بريدة', lat: 26.3, lng: 43.9 });
  const F = [
    f('QBS-1', 5, 'cable'), f('QBS-1', 20, 'cable'), f('QBS-1', 60, 'cable'),
    f('QBS-2', 3, '', true), f('QBS-2', 40, '', true), f('QBS-2', 100, ''),
    f('QBS-3', 10, 'load'), f('QBS-3', 200, 'load', false, true),
    f('QBS-4', 1, ''), f('QBS-4', 2, ''), f('QBS-4', 3, ''),
    f('QBS-5', 1, 'fuse')];
  const r = Object.fromEntries(analyze(F, DEF_RULES, now).map(x => [x.tr, x]));
  assert.deepEqual(r['QBS-1'].acts, ['replace']);
  assert.deepEqual(r['QBS-2'].acts, ['maintain']);
  assert.deepEqual(r['QBS-3'].acts, ['reinforce']);
  assert.deepEqual(r['QBS-4'].acts, ['watch']);
  assert.deepEqual(r['QBS-5'].acts, []);
  assert.ok(r['QBS-1'].why[0].includes('كيبل'));
});
test('stats within-limits', () => {
  const F = [30, 70, 100, 150, 200].map((d, i) => ({ co: 'x', dur: d, open: false, cause: i ? 'fuse' : '' })).concat([{ co: 'x', dur: 10, open: true }]);
  const [r] = table(F, 'co');
  assert.equal(r.n, 6); assert.equal(r.closed, 5); assert.deepEqual(r.within, [20, 40, 60, 80]); assert.equal(r.noCause, 1);
});
test('hasr does not call everything "peak" when all data is from summer', () => {
  const now = Date.UTC(2026, 7, 30);
  const F = [];
  for (let k = 0; k < 4; k++) F.push({ src: 'sec', id: 'a' + k, tr: 'QBS-9', start: now - k * D, cause: '', rain: false, peak: true, acc: 'x' + k });
  for (let k = 0; k < 20; k++) F.push({ src: 'sec', id: 'b' + k, tr: 'QBS-' + (100 + k), start: now - k * D, cause: '', rain: false, peak: true, acc: 'y' + k });
  const r = analyze(F, DEF_RULES, now).find(x => x.tr === 'QBS-9');
  assert.ok(!r.acts.includes('reinforce'));
});
