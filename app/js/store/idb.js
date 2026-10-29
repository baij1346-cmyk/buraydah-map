/* غلاف بسيط على IndexedDB. كل مخزن: مفتاح → كائن */
const DB_NAME = 'buraydah-grid-ops', VERSION = 1;
export const STORES = { kv: 'kv', snapshots: 'snapshots', tickets: 'tickets', reports: 'reports', violations: 'violations' };
const KEYS = { kv: 'k', snapshots: 'id', tickets: 'task', reports: 'id', violations: 'id' };

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((ok, no) => {
    const rq = indexedDB.open(DB_NAME, VERSION);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      Object.entries(KEYS).forEach(([s, kp]) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: kp }); });
    };
    rq.onsuccess = () => ok(rq.result);
    rq.onerror = () => no(rq.error);
  });
  return dbp;
}
function tx(store, mode, fn) {
  return open().then(db => new Promise((ok, no) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => ok(r && 'result' in r ? r.result : undefined);
    t.onerror = () => no(t.error); t.onabort = () => no(t.error);
  }));
}
export const all = store => tx(store, 'readonly', s => s.getAll());
export const put = (store, val) => tx(store, 'readwrite', s => s.put(val));
export const del = (store, key) => tx(store, 'readwrite', s => s.delete(key));
export const putMany = (store, vals) => tx(store, 'readwrite', s => { vals.forEach(v => s.put(v)); });
export const clear = store => tx(store, 'readwrite', s => s.clear());
export async function persist() {
  /* نطلب من المتصفح ما يمسح البيانات تلقائيًا */
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { }
  return false;
}
