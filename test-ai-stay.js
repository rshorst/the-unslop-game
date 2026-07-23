const fs=require('fs'),path=require('path'),WebSocket=require('ws'),{JSDOM}=require('jsdom');
const PORT=3111,URL='ws://localhost:'+PORT,BASE='http://localhost:'+PORT+'/';
const html=fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8');
const appjs=fs.readFileSync(path.join(__dirname,'public','app.js'),'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms)); let fails=0;
function A(c,m){console.log((c?'  ✓ ':'  ✗ FAIL: ')+m);if(!c)fails++;}
function tab(){const dom=new JSDOM(html,{runScripts:'outside-only',url:BASE,pretendToBeVisual:true});const w=dom.window;
 class MK{constructor(){this.readyState=0;const r=new WebSocket(URL);this._r=r;r.on('open',()=>{this.readyState=1;this.onopen&&this.onopen();});r.on('message',d=>this.onmessage&&this.onmessage({data:d.toString()}));r.on('close',()=>{this.readyState=3;this.onclose&&this.onclose();});}send(s){this._r.readyState===1&&this._r.send(s);}close(){this._r.close();}}
 w.WebSocket=MK; w.fetch=(u,o)=>globalThis.fetch(BASE+String(u).replace(/^\//,''),o); w.eval(appjs);
 return {w,txt:()=>w.document.getElementById('app').textContent};}
(async()=>{
 const fac=new WebSocket(URL);let code=null;fac.on('message',d=>{const m=JSON.parse(d);if(m.type==='joined')code=m.code;});
 await new Promise(r=>fac.on('open',r));fac.send(JSON.stringify({type:'create',name:'F'}));await wait(250);
 const t=tab();await wait(100);t.w.document.getElementById('jcode').value=code;t.w.document.getElementById('jname').value='P1';t.w.__join();await wait(200);
 // add a second real player so an in-phase update can be generated
 const p2=new WebSocket(URL);let p2pid=null;p2.on('message',d=>{const m=JSON.parse(d);if(m.type==='joined')p2pid=m.playerId;});await new Promise(r=>p2.on('open',r));p2.send(JSON.stringify({type:'join',code,name:'P2'}));await wait(200);
 fac.send(JSON.stringify({type:'setAct',act:1}));fac.send(JSON.stringify({type:'startDraft'}));await wait(300);
 t.w.__aiMode();await wait(400); A(/AI machine/.test(t.txt()),'P1 in AI machine');
 // in-phase update: P2 submits a draft (phase stays 'draft')
 p2.send(JSON.stringify({type:'submitDraft',content:'p2 draft'}));await wait(300);
 A(/AI machine/.test(t.txt()),'P1 STAYS in AI machine on an in-phase update (not yanked out)');
 console.log('\n'+(fails?fails+' FAILED':'PASSED')); process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
