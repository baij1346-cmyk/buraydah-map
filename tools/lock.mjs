/* يشفّر بيانات المنصة بالرقم السري (AES-GCM 256، المفتاح PBKDF2-SHA256).
   تشغيل: node tools/lock.mjs <الرقم السري> <مجلد النسخة غير المشفّرة (خارج المستودع)>
   المجلد فيه meta.json و meters.bin و seed/*.json (index.json = قائمة الملفات). */
import fs from 'fs';
import zlib from 'zlib';
import { webcrypto as C } from 'crypto';
const [pin, src] = process.argv.slice(2);
if (!pin || !src) { console.error('usage: node tools/lock.mjs <pin> <plainDir>'); process.exit(1); }
const out = new URL('../app/data/', import.meta.url).pathname, ITER = 250000;
const salt = C.getRandomValues(new Uint8Array(16));
const base = await C.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
const key = await C.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
async function seal(buf) {
  const iv = C.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await C.subtle.encrypt({ name: 'AES-GCM', iv }, key, zlib.gzipSync(buf, { level: 9 })));
  return Buffer.concat([iv, ct]);
}
const b64 = u => Buffer.from(u).toString('base64');
fs.writeFileSync(out + 'meta.enc', await seal(fs.readFileSync(src + '/meta.json')));
fs.writeFileSync(out + 'meters.enc', await seal(fs.readFileSync(src + '/meters.bin')));
fs.mkdirSync(out + 'seed', { recursive: true });
for (const f of fs.readdirSync(out + 'seed')) fs.unlinkSync(out + 'seed/' + f);
const list = JSON.parse(fs.readFileSync(src + '/seed/index.json', 'utf8')), names = [];
for (const f of list) { const n = f.replace(/\.json$/, '.bin'); fs.writeFileSync(out + 'seed/' + n, await seal(fs.readFileSync(src + '/seed/' + f))); names.push(n); }
fs.writeFileSync(out + 'seed/index.bin', await seal(Buffer.from(JSON.stringify(names))));
fs.writeFileSync(out + 'lock.json', JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), check: b64(await seal(Buffer.from('ok'))) }));
console.log('locked', names);
