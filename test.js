const WebSocket = require('ws');
const URL='ws://localhost:3111';
function client(){ const ws=new WebSocket(URL); ws.state=null; ws.pid=null;
  ws.on('message',d=>{const m=JSON.parse(d); if(m.type==='joined'){ws.pid=m.playerId;ws.isFac=m.isFacilitator;} if(m.type==='state'){ws.state=m;} if(m.type==='error'){console.log('ERR',m.message);} });
  return ws; }
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function open(ws){return new Promise(r=>ws.on('open',r));}
const s=o=>o;

(async()=>{
  const fac=client(); await open(fac);
  fac.send(JSON.stringify({type:'create',name:'Rachel'}));
  await wait(200);
  const code=fac.state.room.code; console.log('room code:',code,'| facilitator seat present:',fac.state.room.players.length);

  const p=[]; for(let i=0;i<3;i++){ const c=client(); await open(c); c.send(JSON.stringify({type:'join',code,name:'P'+(i+1)})); p.push(c); }
  await wait(300);
  console.log('players in room:',fac.state.room.players.length,'| roster size:',fac.state.room.roster.length);

  // Act 1: start draft (deals random agents)
  fac.send(JSON.stringify({type:'setAct',act:1}));
  fac.send(JSON.stringify({type:'startDraft'}));
  await wait(200);
  const assigns=fac.state.room.players.map(x=>x.agentId);
  console.log('ACT1 phase:',fac.state.room.phase,'| dealt agents:',assigns.join(','));
  console.log('random check (not identical round-robin order):', new Set(assigns).size, 'distinct across', assigns.length);

  // everyone drafts
  [fac,...p].forEach((c,i)=>c.send(JSON.stringify({type:'submitDraft',content:'Draft from player '+i+'. AI in schools is fine.'})));
  await wait(200);
  console.log('drafts submitted, ready:',fac.state.room.players.filter(x=>x.ready).length,'/',fac.state.room.players.length);

  // start relay
  fac.send(JSON.stringify({type:'startRelay'}));
  await wait(200);
  console.log('ACT1 relay round',fac.state.room.relayRound,'/',fac.state.room.relayTotal);
  // each acts on held sheet
  function actAll(){ [fac,...p].forEach(c=>{ const sh=c.state.mySheet; if(sh) c.send(JSON.stringify({type:'submitMove',action:'change',content:(sh.content||'')+' [edited]',note:'my move'})); }); }
  actAll(); await wait(150);
  // tick through remaining rounds
  for(let r=1;r<fac.state.room.relayTotal;r++){ fac.send(JSON.stringify({type:'tick'})); await wait(120); actAll(); await wait(120); }
  await wait(150);
  // check a sheet has history from multiple agents
  fac.send(JSON.stringify({type:'spotlight'})); await wait(150);
  const sp=fac.state.spotlight; console.log('SPOTLIGHT sheet hands:',sp?sp.history.length:'none','| distinct agents:', sp?new Set(sp.history.map(h=>h.agentName)).size:0);

  // Act 2
  fac.send(JSON.stringify({type:'setAct',act:2})); fac.send(JSON.stringify({type:'startDraft'})); await wait(200);
  console.log('ACT2 phase:',fac.state.room.phase,'| face:',fac.state.room.face,'(should be unslop)');
  // verify a player's card is unslop side
  const anyP=p[0]; console.log('ACT2 my drafter face name via room.drafter.unslop:', fac.state.room.drafter.unslop.name);

  // Act 3 architect
  fac.send(JSON.stringify({type:'beginArchitect'})); await wait(200);
  console.log('ACT3 phase:',fac.state.room.phase,'| act:',fac.state.room.act);
  // amend an agent (edit gated to act3)
  const targetId=fac.state.room.roster[0].id;
  fac.send(JSON.stringify({type:'editAgent',agentId:targetId,face:'unslop',name:'AMENDED AGENT',cares:'x',refuses:'y',skills:'name it — do the thing\nsecond skill'}));
  await wait(150);
  const edited=fac.state.room.roster.find(a=>a.id===targetId);
  console.log('amend applied:', edited.unslop.name==='AMENDED AGENT', '| skills:',edited.unslop.skills.length);
  // add new agent
  fac.send(JSON.stringify({type:'addAgent',agent:{name:'The Witness',cares:'what was in the room',refuses:'abstraction',skills:'name it — the thing itself'}}));
  await wait(150);
  console.log('roster after add:',fac.state.room.roster.length,'| has custom:',fac.state.room.roster.some(a=>a.custom));
  // cut an agent
  fac.send(JSON.stringify({type:'toggleAgent',agentId:targetId})); await wait(120);
  console.log('after cut, roster live:',fac.state.room.roster.length);
  // xerox test
  const xid=fac.state.room.roster[0].id;
  fac.send(JSON.stringify({type:'xerox',agentId:xid})); await wait(150);
  console.log('XEROX phase:',fac.state.room.phase,'| xeroxMode:',fac.state.room.xeroxMode,'| locked:',fac.state.room.lockedAgentId===xid);

  // debrief
  fac.send(JSON.stringify({type:'debrief'})); await wait(150);
  console.log('DEBRIEF phase:',fac.state.room.phase,'| allSheets to facilitator:',(fac.state.allSheets||[]).length);

  // negative test: player tries to edit (should be ignored - not facilitator)
  p[0].send(JSON.stringify({type:'editAgent',agentId:xid,face:'slop',name:'HACKED'})); await wait(150);
  const nothacked=!fac.state.room.roster.find(a=>a.id===xid) || fac.state.room.roster.find(a=>a.id===xid).slop.name!=='HACKED';
  console.log('non-facilitator edit blocked:', nothacked);

  console.log('\nALL CHECKS DONE');
  process.exit(0);
})().catch(e=>{console.error('TEST ERROR',e);process.exit(1);});
