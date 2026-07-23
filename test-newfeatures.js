// Verify: (1) trail includes the opening draft (Quick/Slow Drafter) as first hand,
// (2) facilitator free-agent toggle lets a player swap agents during the relay.
const WebSocket = require('ws'); const URL = 'ws://localhost:3111';
const wait = ms => new Promise(r=>setTimeout(r,ms)); let fails=0;
const A=(c,m)=>{console.log((c?'  ✓ ':'  ✗ FAIL: ')+m);if(!c)fails++;};
function mk(){const o={ws:null,state:null,pid:null};o.connect=()=>new Promise(res=>{o.ws=new WebSocket(URL);o.ws.on('message',d=>{const m=JSON.parse(d);if(m.type==='joined')o.pid=m.playerId;if(m.type==='state')o.state=m;});o.ws.on('open',res);});o.send=x=>o.ws.send(JSON.stringify(x));return o;}
(async()=>{
  const fac=mk();await fac.connect();fac.send({type:'create',name:'Rachel'});await wait(200);
  const code=fac.state.room.code;
  const p1=mk();await p1.connect();p1.send({type:'join',code,name:'P1'});await wait(120);
  const p2=mk();await p2.connect();p2.send({type:'join',code,name:'P2'});await wait(150);
  fac.send({type:'setAct',act:1});fac.send({type:'startDraft'});await wait(200);
  [fac,p1,p2].forEach((c,i)=>c.send({type:'submitDraft',content:'draft '+i}));
  await wait(200);

  console.log('\n[free-agent toggle default off]');
  A(fac.state.room.freeAgentChoice===false,'freeAgentChoice defaults to false');

  fac.send({type:'startRelay'});await wait(250);

  console.log('\n[trail: opening draft recorded]');
  const sheet=(fac.state.allSheets||[])[0];
  A(sheet && sheet.history.length>=1,'sheet has a trail entry after relay start');
  const first=sheet && sheet.history[0];
  A(first && first.action==='first draft','first trail entry is the opening draft');
  A(first && /Quick Drafter/.test(first.agentName),'attributed to The Quick Drafter (slop face): '+(first&&first.agentName));

  console.log('\n[free-agent: blocked while toggle off]');
  const before=p1.state.mySheet ? (p1.state.myCard&&p1.state.myCard.name):null;
  const origAgent=fac.state.room.players.find(x=>x.id===p1.pid).agentId;
  const other=fac.state.room.roster.find(a=>a.id!==origAgent).id;
  p1.send({type:'pickAgent',agentId:other});await wait(150);
  const afterOff=fac.state.room.players.find(x=>x.id===p1.pid).agentId;
  A(afterOff===origAgent,'pickAgent ignored while free choice is OFF');

  console.log('\n[free-agent: works when facilitator turns it on]');
  fac.send({type:'setFreeAgents',on:true});await wait(150);
  A(fac.state.room.freeAgentChoice===true,'freeAgentChoice now true');
  p1.send({type:'pickAgent',agentId:other});await wait(150);
  const afterOn=fac.state.room.players.find(x=>x.id===p1.pid).agentId;
  A(afterOn===other,'player successfully swapped agents mid-relay');

  console.log('\n'+(fails?fails+' FAILED':'ALL NEW-FEATURE CHECKS PASSED'));process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
