/* قارئ تقرير "توجيه بلاغات المشتركين المسجلة" — منقول كما هو من board.html (مجرّب على العينة: 29 بلاغ صحيحة).
   يشتغل على عناصر نص pdf.js مجمعة بالصفوف حسب y. */
/* SEC dispatch report parser: works on pdf.js text items grouped into rows. Shared by the page and the node test. */
export function secGroupRows(items){
  const rows=[];
  items.forEach(it=>{const y=it.transform[5], x=it.transform[4], s=it.str; if(!s||!s.trim())return;
    let r=rows.find(r=>Math.abs(r.y-y)<=2.5); if(!r){r={y,it:[]};rows.push(r);} r.it.push([x,s]);});
  rows.sort((a,b)=>b.y-a.y);
  return rows.map(r=>r.it.sort((a,b)=>a[0]-b[0]).map(x=>x[1].trim()).filter(Boolean));
}
export function secJoinName(parts){
  /* fragments of an Arabic name: stick 1–2 letter pieces onto the previous piece */
  let out='';
  parts.forEach(p=>{p=p.trim(); if(!p)return; if(out && p.length<=2 && /^[؀-ۿ]+$/.test(p)) out+=p; else out+=(out?' ':'')+p;});
  return out.replace(/\s+/g,' ').trim();
}
export const SEC_CENTERS=['بريدة','عنيزة','غرب القصيم','المذنب','الرس'];
export function secParse(pages){
  /* pages: array of rows (each row = array of strings, left→right) */
  const out={updated:null,tickets:[],summary:null};
  const sumRows={};
  pages.forEach(rows=>rows.forEach(tok=>{
    const line=tok.join(' | ');
    const up=line.match(/(\d{2})\/(\d{2})\/(\d{2})\s*\|?\s*(\d{1,2}):(\d{2})/);
    if(/Last Update/i.test(line)&&up) out.updated={d:+up[1],m:+up[2],y:2000+(+up[3]),h:+up[4],mi:+up[5]};
    const task=tok.findIndex(t=>/^5\d{7}$/.test(t));
    if(task<0){
      /* summary row: "...| center" at the right end with 5 numbers before it */
      const c=tok[tok.length-1]; if(SEC_CENTERS.includes(c)&&!sumRows[c]){const nums=tok.slice(-6,-1).map(Number); if(nums.length===5&&nums.every(n=>!isNaN(n))) sumRows[c]={total:nums[4],lt60:nums[3],m60:nums[2],m90:nums[1],gt120:nums[0]};}
      return;
    }
    const center=SEC_CENTERS.find(c=>tok.slice(task+1).join(' ').includes(c))||'';
    const di=tok.findIndex(t=>/^\d{1,2}:\d{2}$/.test(t));
    const flat=line.replace(/\s*\|\s*/g,'|');
    const tr=flat.match(/4100\|?-\|?(Q[A-Z]{1,2}S)\|?-\|?(\d{4,7})/);
    const ai=tok.findIndex(t=>/^[13]0\d{9}$/.test(t));
    const ti=tok.findIndex(t=>t==='4100');
    let sub='',prio='';
    if(ti>1){prio=tok[ti-1]; if(/^\d{7,10}$/.test(tok[ti-2])) sub=tok[ti-2];}
    if(!sub){const m=tok.find(t=>/^\d{8,10}$/.test(t)&&!/^5\d{7}$/.test(t)); if(m) sub=m;}
    let repDay=0,repYear=0;
    if(ai>=2&&/^\d+$/.test(tok[ai-1])){repYear=+tok[ai-1]; if(/^\d+$/.test(tok[ai-2])) repDay=+tok[ai-2];}
    const si=tok.findIndex(t=>/^(SMOC|SMDC|C4C)$/i.test(t));
    const nTech=si>0&&/^\d+$/.test(tok[si-1])?+tok[si-1]:0;
    const kind=/مجمعة/.test(line)?'تذكرة مجمعة':'بلاغ مشترك';
    /* technician = tokens between transformer number and duration; supervisor = between duration and task */
    let trEnd=-1; if(tr){trEnd=tok.findIndex((t,i)=>i>ti&&t===tr[2]);}
    const tech=secJoinName(tok.slice(trEnd>=0?trEnd+1:ti+5,di>0?di:task));
    const sup=secJoinName(tok.slice(di>=0?di+1:task,task));
    const dur=di>=0?tok[di].split(':').map(Number):[0,0];
    out.tickets.push({task:tok[task],center,mins:dur[0]*60+dur[1],tech,sup,prio,sub,acc:ai>=0?tok[ai]:'',
      tr:tr?('4100-'+tr[1]+'-'+tr[2]):'',trPre:tr?tr[1]:'',trNum:tr?tr[2]:'',src:si>=0?tok[si].toUpperCase():'',nTech,repDay,repYear,kind});
  }));
  out.summary=Object.keys(sumRows).length?sumRows:null;
  return out;
}

