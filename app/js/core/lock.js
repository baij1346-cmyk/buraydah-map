/* قفل المنصة برقم سري: كل البيانات المنشورة مشفّرة (AES-GCM، المفتاح من الرقم عبر PBKDF2).
   بدون الرقم الصحيح ما تنفتح البيانات حتى لو أحد نزّل الملفات. */
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let KEY = null;
const K = 'abubandar-pin';
const norm = t => String(t || '').replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776).replace(/\D/g, '');
async function derive(pin, L) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(L.salt), iterations: L.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}
async function open(buf) {
  const u = new Uint8Array(buf);
  /* بدون ضغط عشان يشتغل على كل المتصفحات (آيفون القديم ما يدعم فك الضغط) */
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, KEY, u.slice(12)));
}
/* ملف مشفّر من مجلد البيانات → بايتات */
export async function getEnc(url, opt) { const r = await fetch(url, opt); if (!r.ok) throw new Error('fetch ' + url); return open(await r.arrayBuffer()); }
export const getEncJson = async (url, opt) => JSON.parse(new TextDecoder().decode(await getEnc(url, opt)));

async function tryPin(pin, L) {
  if (!pin) return false;
  try { KEY = await derive(pin, L); await open(b64d(L.check).buffer); return true; } catch (e) { KEY = null; return false; }
}
export function forget() { try { localStorage.removeItem(K); } catch (e) { } location.reload(); }

/* يوقف التشغيل لين ينكتب الرقم الصحيح. الجهاز يتذكر الرقم لين يضغط «قفل هذا الجهاز» */
export async function unlock(base = './data/') {
  const L = await fetch(base + 'lock.json', { cache: 'no-store' }).then(r => r.json());
  let saved = null; try { saved = localStorage.getItem(K); } catch (e) { }
  if (saved && await tryPin(norm(saved), L)) return;
  if (!window.crypto || !crypto.subtle) { document.getElementById('boot').innerHTML = 'المتصفح ما يدعم فتح المنصة المقفلة. افتح الرابط من Safari أو Chrome.'; throw new Error('nocrypto'); }
  const boot = document.getElementById('boot');
  boot.innerHTML = '<form class="lock" autocomplete="off"><div class="lock-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>' +
    '<b>مركز أبو بندر للعمليات</b><span>اكتب الرقم السري</span><input type="password" inputmode="numeric" autocomplete="current-password" dir="ltr" required><button type="submit">دخول</button><small class="lock-err" hidden>الرقم غلط</small></form>';
  const f = boot.querySelector('form'), inp = f.querySelector('input'), err = f.querySelector('.lock-err'), btn = f.querySelector('button');
  inp.focus();
  await new Promise(done => f.onsubmit = async e => {
    e.preventDefault(); btn.disabled = true; btn.textContent = 'جاري التحقق…'; err.hidden = true;
    const pin = norm(inp.value);
    if (await tryPin(pin, L)) { try { localStorage.setItem(K, pin); } catch (x) { } boot.textContent = 'جاري التحميل…'; done(); }
    else { err.hidden = false; btn.disabled = false; btn.textContent = 'دخول'; inp.select(); }
  });
}
