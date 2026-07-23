const fs=require('fs'),path=require('path'),WebSocket=require('ws'),{JSDOM}=require('jsdom');
const PORT=3111,URL='ws://localhost:'+PORT,BASE='http://localhost:'+PORT+'/';
const html=fs.readFileSync('public/index.html','utf8'),appjs=fs.readFileSync('public/app.js','utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms)); const errs=[];
function tab(){const dom=new JSDOM(html,{runScripts:'outside-only',url:BASE,pretendToBeVisual:true});const w=dom.window;
 class MK{constructor(){this.readyState=0;const r=new WebSocket(URL);this._r=r;r.on('open',()=>{this.readyState=1;this.onopen&&this.onopen();});r.on('message',d=>{if(!this.onmessage)return;try{this.onmessage({data:d.toString()});}catch(e){errs.push('render threw: '+(e&&e.stack||e));}});}send(s){this._r.readyState===1&&this._r.send(s);}close(){}}
 w.WebSocket=MK;w.fetch=(u,o)=>globalThis.fetch(BASE+String(u).replace(/^\//,''),o);w.onerror=m=>errs.push('onerror: '+m);w.eval(appjs);
 return {w,txt:()=>w.document.getElementById('app').textContent};}
(async()=>{
  const fac=tab();await wait(120);
  // create room as facilitator via the landing form
  fac.w.document.getElementById('fname').value='Rachel';fac.w.__create();await wait(300);
  fac.w.__startAct1();await wait(300);
  fac.w.document.getElementById('draft').value='A draft.';fac.w.__submitDraft();await wait(200);
  fac.w.__startRelay();await wait(300);
  // do a move so the sheet has a trail
  const sh=fac.w.document.getElementById('sheet'); if(sh){sh.value='A draft. edited';const n=fac.w.document.getElementById('note');if(n)n.value='my move';fac.w.__submitMove();}
  await wait(250);
  fac.w.__startClosing();await wait(300);
  console.log('on closing screen:', /Closing round/.test(fac.txt()));
  console.log('clicking "Finish → trace a sheet" (__toSpotlight)...');
  fac.w.__toSpotlight();await wait(350);
  const t=fac.txt();
  console.log('phase now spotlight:', fac.w.__label, /Trace one sheet|Trace a sheet|read aloud|Started by/.test(t));
  console.log('shows a sheet body:', /Started by|The trail|read aloud|\(empty\)|edited/.test(t));
  console.log('shows facNext (Begin Act 2):', /Begin Act 2/.test(t));
  if(errs.length){console.log('\nERRORS:');errs.forEach(e=>console.log('  ! '+e));}
  else console.log('\nno render errors');
  process.exit(0);
})().catch(e=>{console.error('TESTERR',e);process.exit(1);});
