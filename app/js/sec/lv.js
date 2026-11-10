/* قارئ «تقرير ربط بلاغات الجهد المنخفض (LV) بشبكة MV».
   كل كتلة في التقرير: المحطة ← المغذي ← الزون ← رقم المحول ← نقطة العزل، وتحتها أرقام المهام
   وعدادات المشتركين مع روابط «فتح الموقع» (إحداثيات قوقل ماب).
   المدخل: صفحات [{items:[{s,x,y}], links:[{x,y,lat,lng}]}] بإحداثيات الصفحة (y من تحت لفوق).
   المخرج: سطر لكل رقم مهمة فيه بيانات الشبكة والموقع. */

const near = (x, a, b) => x >= a && x <= b;

export function isLVReport(firstPageText) {
  return /FEEDER\s*TICKET/i.test(firstPageText) && /\bMV\b/.test(firstPageText) && /\bLV\b/.test(firstPageText);
}

export function parseLV(pages) {
  const blocks = []; let cur = null;
  pages.forEach(pg => {
    const rows = [];
    pg.items.forEach(it => {
      const s = it.s.trim(); if (!s) return;
      let r = rows.find(r => Math.abs(r.y - it.y) <= 3); if (!r) { r = { y: it.y, it: [] }; rows.push(r); }
      r.it.push({ s, x: it.x });
    });
    rows.sort((a, b) => b.y - a.y);
    const pageBlocks = [];
    rows.forEach(r => {
      const has = (re, a, b) => r.it.find(t => re.test(t.s) && near(t.x, a, b));
      /* بداية كتلة: صف فيه تاريخ أول/آخر بلاغ أو الجهد */
      const isHead = r.it.some(t => /^\d{4}-\d{2}-$/.test(t.s) && near(t.x, 300, 380)) || has(/^(33|13\.8|13,8)$/, 385, 415);
      if (isHead) {
        const g = (re, a, b) => (has(re, a, b) || {}).s || '';
        cur = { y: r.y, sub: g(/^\d{3,5}$/, 720, 760), feeder: g(/^[A-Za-z]{1,3}[-\d]*\d$/, 690, 725), zone: g(/^[A-Za-z]{1,2}-?\d{2,4}$/, 640, 668),
          trNo: g(/^\d{4,6}$/, 520, 550), iso: g(/^[A-Z]{1,3}\d/, 410, 470), volt: g(/^(33|13\.8|13,8)$/, 385, 415), tasks: [], subs: [], ll: [] };
        blocks.push(cur); pageBlocks.push(cur);
      }
      if (!cur) return;
      r.it.forEach(t => {
        if (/^5\d{7}$/.test(t.s) && near(t.x, 260, 310) && !cur.tasks.includes(t.s)) cur.tasks.push(t.s);
        if (/^\d{7,10}$/.test(t.s) && near(t.x, 140, 200)) cur.subs.push(t.s);
      });
    });
    /* الروابط: كل رابط يتبع الكتلة اللي فوقه في نفس الصفحة (أو آخر كتلة من الصفحة السابقة) */
    pg.links.forEach(l => {
      const b = pageBlocks.filter(b => b.y + 6 >= l.y).pop() || blocks[blocks.indexOf(pageBlocks[0]) - 1] || cur;
      if (b && isFinite(l.lat) && isFinite(l.lng)) b.ll.push([l.lat, l.lng, l.x]);
    });
  });
  const out = [];
  blocks.forEach(b => {
    /* موقع الكتلة: نفضّل رابط «حصر» (العمود الأول من اليمين بين الروابط)، والباقي احتياط */
    const ll = b.ll.length ? b.ll.slice().sort((p, q) => q[2] - p[2])[0] : null;
    b.tasks.forEach(task => out.push({ task, sub: b.sub, feeder: b.feeder, zone: b.zone, trNo: b.trNo, iso: b.iso, volt: b.volt, lat: ll ? ll[0] : null, lng: ll ? ll[1] : null, meters: b.subs.length }));
  });
  return out;
}
