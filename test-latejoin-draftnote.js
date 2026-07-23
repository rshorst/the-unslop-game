// (1) Late joiner mid-relay gets their own sheet (no "waiting" stuck state, and
//     no other seat becomes empty-handed). (2) Draft comment flows into the trail.
const WebSocket=require('ws'); const URL='ws://localhost:3111';
const wait=ms=>new Promise(r=>setTimeout(r,ms)); let fails=0;
const A=(c,m)=>{console.log((c?'  ✓ ':'  ✗ FAIL: ')+m);if(!c)fails++;};
function mk(){const o={ws:null,state:null,pid:null};o.connect=()=>new Promise(res=>{o.ws=new WebSocket(URL);o.ws.on('message',d=>{const m=JSON.parse(d);if(m.type==='joined')o.pid=m.playerId;if(m.type==='state')o.state=m;});o.ws.on('open',res);});o.send=x=>o.ws.send(JSON.stringify(x));return o;}
(async()=>{
  const fac=mk();await fac.connect();fac.send({type:'create',name:'Rachel'});await wait(200);
  const code=fac.state.room.code;
  const p1=mk();await p1.connect();p1.send({type:'join',code,name:'P1'});await wait(150);

  fac.send({type:'setAct',act:1});fac.send({type:'startDraft'});await wait(200);
  // draft WITH a comment
  fac.send({type:'submitDraft',content:'Fac draft',note:'wrote fast, on purpose'});
  p1.send({type:'submitDraft',content:'P1 draft',note:'hedged everything'});
  await wait(200);
  fac.send({type:'startRelay'});await wait(250);

  console.log('[draft comment in trail]');
  const sh=(fac.state.allSheets||[]).find(s=>/wrote fast/.test((s.history[0]||{}).note||''));
  A(!!sh,'a sheet trail starts with the drafter comment');
  A(sh && sh.history[0].action==='first draft','first entry action is "first draft"');

  console.log('\n[late joiner mid-relay]');
  const late=mk();await late.connect();late.send({type:'join',code,name:'Latecomer'});await wait(300);
  A(late.state && late.state.room.phase==='relay','late joiner is in the relay');
  A(late.state && !!late.state.mySheet,'late joiner HAS a sheet (not stuck waiting)');

  // verify nobody is empty-handed: every seat holds exactly one sheet
  console.log('\n[no seat left empty-handed]');
  // pull mySheet from all three
  await wait(50);
  const facSheet=fac.state.mySheet, p1Sheet=p1.state.mySheet, lateSheet=late.state.mySheet;
  A(facSheet&&p1Sheet&&lateSheet,'all three players hold a sheet after late join');
  const ids=[facSheet&&facSheet.id,p1Sheet&&p1Sheet.id,lateSheet&&lateSheet.id];
  A(new Set(ids).size===3,'all three hold DISTINCT sheets: '+ids.join(','));

  console.log('\n[pass left keeps everyone holding a sheet]');
  fac.send({type:'tick'});await wait(250);
  A(fac.state.mySheet&&p1.state.mySheet&&late.state.mySheet,'after pass, all three still hold a sheet');

  console.log('\n'+(fails?fails+' FAILED':'ALL LATE-JOIN + DRAFT-NOTE CHECKS PASSED'));process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
