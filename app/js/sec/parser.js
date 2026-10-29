/* قارئ تقرير "توجيه بلاغات المشتركين المسجلة".
   يشتغل على عناصر نص pdf.js. يدعم:
   - الصيغة القديمة (Last Update : 29/10/26 14:41، المحول مقطّع 4100 | - | QBS | - | 066128، فيه SMOC/C4C)
   - الصيغة الجديدة (Last Update : 10/29/2026 18:20، المحول قطعة وحدة، ووقت فتح البلاغ مكتوب فوق وتحت الصف)
   - العربي اللي يطلع حروف مفرقة بالترتيب المعكوس (ة | د | ي | ر | ب = بريدة)
   - ملف مجمّع فيه أكثر من تقرير (كل "Last Update" = تقرير جديد) */

export const SEC_CENTERS = ['بريدة', 'عنيزة', 'غرب القصيم', 'المذنب', 'الرس'];
const AR = /[؀-ۿ]/;

/* تجميع العناصر بالصفوف حسب y، وكل صف مرتب من اليسار لليمين */
export function secGroupRows(items) {
  const rows = [];
  items.forEach(it => {
    const s = it.str; if (!s || !s.trim()) return;
    const y = it.transform[5];
    let r = rows.find(r => Math.abs(r.y - y) <= 2.5); if (!r) { r = { y, it: [] }; rows.push(r); }
    r.it.push({ s: s.trim(), x: it.transform[4], w: it.width || 0 });
  });
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => cells(r.it.sort((a, b) => a.x - b.x)));
}

/* دمج الحروف العربية المفرقة: كل تتابع حروف قصيرة = كلمة/اسم مكتوب بالعكس.
   المسافة بين الكلمات نعرفها من الفراغ بين الحروف (≥0.6). */
function cells(toks) {
  /* حرف بعرض صفر (غالبًا ي في آخر الكلمة) يطلع في مكان غلط: مكانه الصحيح قبل الحرف اللي قبله */
  toks = toks.slice();
  /* حرف بعرض صفر بعد كلمة كاملة (مثل «محمد البطح» + «ي») = آخر حرف في الكلمة */
  for (let i = toks.length - 1; i > 0; i--) {
    const t = toks[i], p = toks[i - 1];
    if (t.w === 0 && t.s.length === 1 && AR.test(t.s) && p.s.length > 2 && AR.test(p.s)) { toks[i - 1] = { ...p, s: p.s + t.s }; toks.splice(i, 1); }
  }
  for (let i = 1; i < toks.length; i++) {
    const t = toks[i], p = toks[i - 1];
    if (t.w === 0 && t.s.length === 1 && AR.test(t.s) && p.s.length <= 2 && AR.test(p.s)) { toks[i] = p; toks[i - 1] = t; }
  }
  const out = []; let run = null;
  const flush = () => { if (run) { out.push([...run.s].reverse().join('').replace(/\s+/g, ' ').trim()); run = null; } };
  toks.forEach(t => {
    const piece = t.s.length <= 2 && AR.test(t.s) && !/\d/.test(t.s);
    if (piece) {
      if (run) { const gap = t.x - run.end; run.s += (gap >= 0.6 && run.lastW > 0 ? ' ' : '') + t.s; }
      else run = { s: t.s };
      run.end = t.x + t.w; run.lastW = t.w;
    } else { flush(); out.push(t.s); }
  });
  flush();
  return out.filter(Boolean);
}

export function secJoinName(parts) { return parts.join(' ').replace(/\s+/g, ' ').trim(); }

/* وقت التحديث: 29/10/26 14:41 (يوم/شهر/سنة) أو 10/29/2026 18:20 (شهر/يوم/سنة) */
function parseUpdated(line) {
  let m = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*\|?\s*(\d{1,2}):(\d{2})/);
  if (m) return { d: +m[2], m: +m[1], y: +m[3], h: +m[4], mi: +m[5] };
  m = line.match(/(\d{2})\/(\d{2})\/(\d{2})\s*\|?\s*(\d{1,2}):(\d{2})/);
  if (m) return { d: +m[1], m: +m[2], y: 2000 + (+m[3]), h: +m[4], mi: +m[5] };
  return null;
}

/* صف بلاغ → كائن */
function parseTicket(tok, prev, next) {
  const task = tok.findIndex(t => /^5\d{7}$/.test(t)); if (task < 0) return null;
  const di = tok.findIndex(t => /^\d{1,2}:\d{2}$/.test(t));
  let t0 = tok.findIndex(t => /^4100(-Q[A-Z]{1,2}S-\d+)?$/.test(t)), t1 = t0, pre = '', num = '';
  if (t0 >= 0) {
    const one = tok[t0].match(/^4100-(Q[A-Z]{1,2}S)-(\d+)$/);
    if (one) { pre = one[1]; num = one[2]; }
    else if (tok[t0 + 1] === '-' && /^Q[A-Z]{1,2}S$/.test(tok[t0 + 2] || '') && tok[t0 + 3] === '-' && /^\d{3,7}$/.test(tok[t0 + 4] || '')) { pre = tok[t0 + 2]; num = tok[t0 + 4]; t1 = t0 + 4; }
  }
  const ai = tok.findIndex(t => /^[13]0\d{9}$/.test(t));
  const prio = t0 > 0 ? tok[t0 - 1] : '';
  let sub = t0 > 1 && /^\d{7,10}$/.test(tok[t0 - 2]) ? tok[t0 - 2] : '';
  if (!sub) { const m = tok.find((t, i) => i !== task && /^\d{8,10}$/.test(t)); if (m) sub = m; }
  let repDay = 0, repYear = 0;
  if (ai >= 2 && /^\d+$/.test(tok[ai - 1])) { repYear = +tok[ai - 1]; if (/^\d+$/.test(tok[ai - 2])) repDay = +tok[ai - 2]; }
  const si = tok.findIndex(t => /^(SMOC|SMDC|C4C)$/i.test(t));
  const ki = tok.findIndex(t => /بلاغ|مجمع|تذكر/.test(t));
  const first = Math.min(...[si, ki].filter(i => i >= 0), Infinity);
  const nTech = first > 0 && /^\d+$/.test(tok[first - 1]) ? +tok[first - 1] : 0;
  const tech = di > t1 && t1 >= 0 ? secJoinName(tok.slice(t1 + 1, di)) : '';
  const sup = di >= 0 && task > di ? secJoinName(tok.slice(di + 1, task)) : '';
  const after = tok.slice(task + 1).join(' ');
  const center = SEC_CENTERS.find(c => after.includes(c)) || '';
  const dur = di >= 0 ? tok[di].split(':').map(Number) : [0, 0];
  /* الصيغة الجديدة: وقت فتح البلاغ "2026-10-" فوق الصف و"29T15:56:00.0" تحته */
  let opened = null;
  const a = prev && prev.length === 1 && prev[0].match(/^(\d{4})-(\d{2})-$/), b = next && next.length === 1 && next[0].match(/^(\d{2})T(\d{2}):(\d{2})/);
  if (a && b) opened = { y: +a[1], m: +a[2], d: +b[1], h: +b[2], mi: +b[3] };
  return {
    task: tok[task], center, mins: dur[0] * 60 + dur[1], tech, sup, prio, sub, acc: ai >= 0 ? tok[ai] : '',
    tr: pre ? '4100-' + pre + '-' + num : '', trPre: pre, trNum: num, src: si >= 0 ? tok[si].toUpperCase() : '', nTech, repDay, repYear,
    kind: /مجمع/.test(tok.join(' ')) ? 'تذكرة مجمعة' : 'بلاغ مشترك', opened
  };
}

/* تقرير واحد من مجموعة صفحات */
export function secParse(pages) {
  const out = { updated: null, tickets: [], summary: null }, sumRows = {}, seen = new Set();
  pages.forEach(rows => rows.forEach((tok, i) => {
    const line = tok.join(' | ');
    if (/Last Update/i.test(line) && !out.updated) out.updated = parseUpdated(line);
    if (!tok.some(t => /^5\d{7}$/.test(t))) {
      const c = tok[tok.length - 1];
      if (SEC_CENTERS.includes(c) && !sumRows[c]) { const nums = tok.slice(-6, -1).map(Number); if (nums.length === 5 && nums.every(n => !isNaN(n))) sumRows[c] = { total: nums[4], lt60: nums[3], m60: nums[2], m90: nums[1], gt120: nums[0] }; }
      return;
    }
    const t = parseTicket(tok, rows[i - 1], rows[i + 1]);
    if (t && !seen.has(t.task)) { seen.add(t.task); out.tickets.push(t); }
  }));
  out.summary = Object.keys(sumRows).length ? sumRows : null;
  return out;
}

/* ملف فيه تقرير أو أكثر: كل صفحة فيها "Last Update" تبدأ تقرير جديد */
export function secParseAll(pages) {
  const groups = [];
  pages.forEach(rows => {
    const starts = rows.some(tok => /Last Update/i.test(tok.join(' ')));
    if (starts || !groups.length) groups.push([]);
    groups[groups.length - 1].push(rows);
  });
  return groups.map(secParse).filter(r => r.tickets.length);
}
