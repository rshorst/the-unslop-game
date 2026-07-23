const WebSocket=require('ws');const URL='ws://localhost:3111';const wait=ms=>new Promise(r=>setTimeout(r,ms));let f=0;
const A=(c,m)=>{console.log((c?'  ✓ ':'  ✗ FAIL: ')+m);if(!c)f++;};
function mk(){const o={ws:null,state:null,pid:null};o.connect=()=>new Promise(res=>{o.ws=new WebSocket(URL);o.ws.on('message',d=>{const m=JSON.parse(d);if(m.type==='joined')o.pid=m.playerId;if(m.type==='state')o.state=m;});o.ws.on('open',res);});o.send=x=>o.ws.send(JSON.stringify(x));return o;}
(async()=>{
  const fac=mk();await fac.connect();fac.send({type:'create',name:'F'});await wait(200);const code=fac.state.room.code;
  const p1=mk();await p1.connect();p1.send({type:'join',code,name:'P1'});await wait(120);
  const p2=mk();await p2.connect();p2.send({type:'join',code,name:'P2'});await wait(150);
  fac.send({type:'setAct',act:1});fac.send({type:'startDraft'});await wait(200);
  [fac,p1,p2].forEach((c,i)=>c.send({type:'submitDraft',content:'draft '+i}));await wait(200);
  fac.send({type:'startRelay'});await wait(250);
  A(Array.isArray(p1.state.allSheets)&&p1.state.allSheets.length===3,'player P1 now receives all 3 sheets to browse (got '+((p1.state.allSheets||[]).length)+')');
  A(Array.isArray(p2.state.allSheets)&&p2.state.allSheets.length===3,'player P2 receives all sheets');
  console.log('\n'+(f?f+' FAILED':'BROWSE CHECK PASSED'));process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
