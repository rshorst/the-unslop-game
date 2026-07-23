/* The (un)Slop Game — client */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var flashEl = document.getElementById('flash');
  var ws = null, state = null, MYID = null, IS_FAC = false, code = null;
  var castFace = 'slop'; // which face the lobby cast gallery is showing

  // ---- tiny helpers ----
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function flash(msg){ flashEl.textContent = msg; flashEl.classList.add('show'); clearTimeout(flash._t); flash._t=setTimeout(function(){flashEl.classList.remove('show');},2200); }
  function send(obj){ if(ws && ws.readyState===1) ws.send(JSON.stringify(obj)); }
  function store(k,v){ try{ sessionStorage.setItem(k,v);}catch(e){} }
  function load(k){ try{ return sessionStorage.getItem(k);}catch(e){ return null; } }

  // ---- websocket ----
  function connect(then){
    var proto = location.protocol==='https:'?'wss':'ws';
    ws = new WebSocket(proto+'://'+location.host);
    ws.onopen = function(){ if(then) then(); };
    ws.onmessage = function(ev){
      var m; try{ m=JSON.parse(ev.data);}catch(e){return;}
      if(m.type==='joined'){ MYID=m.playerId; IS_FAC=m.isFacilitator; code=m.code; store('unslop_code',code); store('unslop_pid',MYID); }
      else if(m.type==='state'){
        var prevPhase = (state && state.room) ? state.room.phase : null;
        state=m; MYID=m.youId; IS_FAC=m.isFacilitator;
        var newPhase = (m.room) ? m.room.phase : null;
        if(ai){
          // A player may explore the AI machine mid-game. Don't yank them out on
          // incidental updates (ready ticks, joins) — but NEVER strand them when the
          // facilitator advances the phase: follow the table to the new screen.
          if(newPhase !== prevPhase){ ai=null; flash('The facilitator moved the game on.'); safeRender(); }
        } else {
          safeRender();
        }
      }
      else if(m.type==='error'){ flash(m.message); if(!state) landing(); }
    };
    ws.onclose = function(){ setTimeout(function(){ connect(function(){ var c=load('unslop_code'), p=load('unslop_pid'); if(c&&p) send({type:'rejoin',code:c,playerId:p}); }); }, 900); };
  }

  // =====================================================================
  //  CARD RENDERING
  // =====================================================================
  function cardImage(agentId, face){
    return '<div class="cardwrap"><img class="cimg" alt="agent card" '+
      'src="cards/card_'+esc(agentId)+'_'+esc(face)+'.png" '+
      'onerror="this.parentNode.innerHTML=window.__cardFallback('+"'"+esc(agentId)+"','"+esc(face)+"'"+')"></div>';
  }
  // fallback (custom agents, or if image missing) — HTML card
  window.__cardFallback = function(agentId, face){
    var ag = rosterById(agentId); if(!ag) return '<div class="panel">card unavailable</div>';
    return cardHTML(ag, face, false);
  };
  function skillsHTML(skills){
    if(!skills||!skills.length) return '';
    return skills.map(function(s){
      var m = s.split(' — ');
      if(m.length>1){ return '<div class="skill"><span class="k">'+esc(m[0])+' —</span> '+esc(m.slice(1).join(' — '))+'</div>'; }
      return '<div class="skill">'+esc(s)+'</div>';
    }).join('');
  }
  function cardHTML(ag, face, editable){
    var f = ag[face] || ag.slop || ag.unslop || {};
    var isDraft = ag.__drafter;
    var top = isDraft ? 'FIRST AGENT' : (ag.custom ? 'NEW AGENT' : 'AGENT');
    var actionTxt = isDraft
      ? esc(f.action||'')
      : 'read the draft, then <span class="red">edit it as your agent would</span> — or leave it as is. Write one note on what you did, and why, in your voice.';
    var inputTxt = isDraft ? esc(f.input||'') : 'The draft, and the notes other agents have left.';
    var outputTxt = isDraft ? esc(f.output||'') : 'A revised (or unchanged) draft, and a note in my voice.';
    if(editable){
      return ''+
      '<div class="card" data-agent="'+esc(ag.id)+'"><div class="eng"></div><div class="cbody">'+
        '<div class="ctop"><span class="lbl">'+top+'</span><span class="dot ready"></span></div>'+
        '<input class="ed-name" value="'+esc(f.name||'')+'" style="font-size:24px;font-weight:700;margin:6px 0;border:none;background:transparent;border-bottom:1px dashed var(--line)">'+
        '<div class="csec"><span class="lbl">◯ Stance</span>'+
          '<div class="cfield"><em>i care about</em><textarea class="ed-cares" style="min-height:60px">'+esc(f.cares||'')+'</textarea></div>'+
          '<div class="cfield"><em>i refuse</em><textarea class="ed-refuses" style="min-height:60px">'+esc(f.refuses||'')+'</textarea></div>'+
        '</div>'+
        '<div class="csec"><span class="lbl">◯ Skills</span> <span class="muted" style="font-size:12px">(one per line)</span>'+
          '<textarea class="ed-skills" style="min-height:100px">'+esc((f.skills||[]).join('\n'))+'</textarea></div>'+
        '<div class="row" style="margin-top:12px"><button class="sm save-agent">Save amendment</button></div>'+
      '</div></div>';
    }
    var faceCls = face==='unslop'?'unslop':'slop';
    var faceLabel = isDraft ? (face==='unslop'?'SLOW / UNSLOP':'QUICK / SLOP') : (face==='unslop'?'UNSLOP SIDE':'SLOP SIDE');
    return ''+
    '<div class="card2 '+faceCls+'"><div class="eng"></div><div class="cbody">'+
      '<div class="ctop"><span class="lbl">'+top+'</span><span class="row" style="gap:8px"><span class="faceTag '+faceCls+'">'+faceLabel+'</span><span class="dot ready"></span></span></div>'+
      '<div class="cname">'+esc(f.name||'')+'</div>'+
      '<div class="panels">'+
        '<div class="pane">'+
          '<div class="csec"><span class="lbl">◯ Stance</span>'+
            '<div class="cfield"><em>i care about</em>'+esc(f.cares||'')+'</div>'+
            '<div class="cfield"><em>i refuse</em>'+esc(f.refuses||'')+'</div>'+
          '</div>'+
          '<div class="csec"><span class="lbl">◯ Input</span><div class="cfield">'+inputTxt+'</div></div>'+
          '<div class="csec"><span class="lbl">◯ Output</span><div class="cfield">'+outputTxt+'</div></div>'+
        '</div>'+
        '<div class="pane">'+
          '<div class="csec"><span class="lbl">◯ Skills</span>'+skillsHTML(f.skills)+'</div>'+
          '<div class="caction"><span class="lbl red">● Action — on your turn</span><div style="margin-top:4px">'+actionTxt+'</div></div>'+
        '</div>'+
      '</div>'+
    '</div></div>';
  }
  function rosterById(id){
    if(!state) return null;
    if(id==='first-agent' && state.room && state.room.drafter){ var d=state.room.drafter; return {id:'first-agent',hasImage:true,slop:d.slop,unslop:d.unslop,custom:false}; }
    var r=(state.room.roster||[]).find(function(a){return a.id===id;});
    return r||null;
  }

  // =====================================================================
  //  LANDING
  // =====================================================================
  function landing(){
    app.innerHTML =
    '<div class="landing">'+
      '<img class="machinebg" src="assets/machinic-fiction.png" alt="">'+
      '<div class="fg">'+
        '<div class="pill">UBC MET · Creative Architecture</div>'+
        '<h1 style="font-size:46px;margin:10px 0 4px">The <span class="red">(un)</span>Slop Game</h1>'+
        '<div class="muted big" style="max-width:560px;margin:0 auto 12px">Become an agent in a human multi-agent machine. Manufacture slop, try to resist it, then redesign the system.</div>'+
        '<button class="ghost" onclick="__howto()" style="margin-bottom:22px">What is this? · How to play</button>'+
    '<div class="grid" style="grid-template-columns:1fr 1fr;max-width:760px;margin:0 auto" id="entry">'+
      '<div class="panel col"><h3>Start a table</h3><div class="muted" style="font-size:14px">You facilitate: set the seed, run the acts, keep the metronome.</div>'+
        '<input id="fname" placeholder="Your name (facilitator)" value="Facilitator">'+
        '<button class="red" onclick="__create()">Create room →</button></div>'+
      '<div class="panel col"><h3>Join a table</h3><div class="muted" style="font-size:14px">Enter the 4-letter room code from your facilitator.</div>'+
        '<input id="jcode" placeholder="Room code" style="text-transform:uppercase;font-family:var(--mono);letter-spacing:.2em">'+
        '<input id="jname" placeholder="Your name">'+
        '<button onclick="__join()">Join →</button></div>'+
    '</div>'+
        '<div style="margin-top:20px"><button class="ghost sm" onclick="__aiMode()">⚙ Explore the AI machine on your own →</button></div>'+
        creditsBlock()+
      '</div>'+
    '</div>';
  }
  window.__create=function(){ var n=document.getElementById('fname').value.trim()||'Facilitator'; connect(function(){ send({type:'create',name:n}); }); };
  window.__join=function(){ var c=document.getElementById('jcode').value.trim().toUpperCase(); var n=document.getElementById('jname').value.trim()||'Player'; if(!c){flash('Enter a room code');return;} connect(function(){ send({type:'join',code:c,name:n}); }); };

  // ---- credits / background block ----
  var SVG_LI='<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM3 9h4v12H3zM9 9h3.8v1.64h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.29-.03-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.86V21H9z"/></svg>';
  var SVG_SS='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3.5 4.2h17v2.7h-17zM3.5 9.4h17v10.4l-8.5-4.35L3.5 19.8z"/></svg>';
  var SVG_WEB='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.5 2.6 15.5 0 18M12 3c-2.6 2.5-2.6 15.5 0 18"/></svg>';
  function creditsBlock(){
    return '<div class="credits">'+
      '<div class="lbl center" style="margin-bottom:10px">Background</div>'+
      '<div class="panel cgrid">'+
        '<a class="talk-thumb" href="https://www.youtube.com/watch?v=Z5BxyIlWU74" target="_blank" rel="noopener">'+
          '<img src="https://img.youtube.com/vi/Z5BxyIlWU74/hqdefault.jpg" alt="Watch the talk" onerror="this.style.display=\'none\';this.parentNode.classList.add(\'thumb-fallback\')">'+
          '<span class="play"><i></i></span></a>'+
        '<div>'+
          '<p style="margin:0 0 6px">The <b>(un)Slop Game</b> grew out of a contest provocation about AI fiction. This talk — given at the <b>AI Vancouver Meetup</b> — tells the story of the contest and the build.</p>'+
          '<div style="font-size:15px">By <b>Dr. Rachel Horst</b>, UBC MET</div>'+
          '<div class="iconrow">'+
            '<a href="https://ca.linkedin.com/in/rachelhorst-futures" target="_blank" rel="noopener">'+SVG_LI+'LinkedIn</a>'+
            '<a href="https://substack.com/@rhorst" target="_blank" rel="noopener">'+SVG_SS+'Substack</a>'+
            '<a href="https://www.rachelhorst.ca" target="_blank" rel="noopener">'+SVG_WEB+'rachelhorst.ca</a>'+
          '</div>'+
          '<div class="muted" style="font-size:13px;margin-top:8px">Artwork made with <a href="https://rshorst.github.io/diagrammatic-studies/" target="_blank" rel="noopener">Diagrammatic Studies</a></div>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  // =====================================================================
  //  FACILITATOR TOOLBAR + TIMER
  // =====================================================================
  var timer = { elapsed:0, running:false };
  function fmt(s){ s=Math.max(0,s|0); var m=(s/60)|0, ss=s%60; return m+':'+(ss<10?'0':'')+ss; }
  function tickTimer(){ if(timer.running){ timer.elapsed++; var c=document.getElementById('clock'); if(c) c.textContent=fmt(timer.elapsed); } }
  setInterval(tickTimer,1000);
  // act transitions restart the stopwatch from zero
  window.__setTimer=function(){ timer.elapsed=0; timer.running=true; var c=document.getElementById('clock'); if(c)c.textContent=fmt(timer.elapsed); };
  window.__toggleTimer=function(){ timer.running=!timer.running; };
  window.__resetTimer=function(){ timer.elapsed=0; timer.running=false; var c=document.getElementById('clock'); if(c)c.textContent=fmt(0); };

  function toolbar(){
    if(!state || !state.room) return '';
    var r=state.room;
    var left = '<div class="row" style="gap:6px"><span class="pill">Room '+esc(r.code)+'</span>';
    if(IS_FAC){
      left += '<span class="lbl" style="margin:0 2px">Review</span>'+
        '<button class="sm ghost" onclick="__reviewAct(1)">Act 1</button>'+
        '<button class="sm ghost" onclick="__reviewAct(2)">Act 2</button>'+
        '<button class="sm ghost" onclick="__reviewAct(3)">Act 3</button>';
    }
    left += '<button class="sm ghost" onclick="__aiMode()" title="Explore the AI machine">AI machine</button></div>';
    var right = '';
    if(IS_FAC){
      right = '<div class="row" style="gap:8px">'+
        '<span class="clock" id="clock">'+fmt(timer.elapsed)+'</span>'+
        '<button class="sm ghost" onclick="__toggleTimer()">Start / pause</button>'+
        '<button class="sm ghost" onclick="__resetTimer()">Reset</button></div>';
    }
    return '<div class="toolbar"><div class="row">'+left+right+'</div></div>'+playersStrip();
  }

  // Table status visible on every in-game screen, to everyone (not just the facilitator).
  function playersStrip(){
    var r=state.room;
    if(!r || !r.players || !r.players.length || r.phase==='lobby') return '';
    var showReady = (r.phase==='draft'||r.phase==='relay'||r.phase==='closing');
    return '<div class="panel" style="padding:8px 12px;margin:0 0 12px;box-shadow:none">'+
      '<div class="row" style="justify-content:space-between;gap:8px">'+
        '<div class="row" style="gap:6px;align-items:center"><span class="lbl">Table</span>'+
          r.players.map(function(p){
            var d = !p.connected?'dot':(p.ready?'dot ready':'dot on');
            var you = p.id===MYID?' <b>(you)</b>':'';
            var star = p.id===facId()?' ★':'';
            return '<span class="chip" style="padding:4px 10px;font-size:13px"><span class="'+d+'"></span>'+esc(p.name)+you+star+'</span>';
          }).join('')+'</div>'+
        (showReady?'<span class="muted" style="font-size:13px;white-space:nowrap">'+readyCount()+'</span>':'')+
      '</div></div>';
  }

  function playersBar(){
    var r=state.room;
    return '<div class="players">'+r.players.map(function(p){
      var d = !p.connected?'dot':(p.ready?'dot ready':'dot on');
      var you = p.id===MYID?' <b>(you)</b>':'';
      var fac = p.id && state.room.players[0] && p.id===facId()?' ★':'';
      return '<span class="chip"><span class="'+d+'"></span>'+esc(p.name)+you+fac+'</span>';
    }).join('')+'</div>';
  }
  function facId(){ // first seat is facilitator (created the room)
    return state.room.players.length?state.room.players[0].id:null;
  }
  function readyCount(){ var r=state.room; var n=r.players.filter(function(p){return p.ready;}).length; return n+' / '+r.players.length+' ready'; }

  // =====================================================================
  //  LOBBY
  // =====================================================================
  function lobby(){
    var r=state.room;
    var cf = castFace;
    var browse = '<div class="row" style="justify-content:space-between;align-items:center;margin-top:22px"><h3 style="margin:0">The cast — read the whole machine</h3>'+
      '<div class="row">'+
        '<button class="sm '+(cf==='slop'?'':'ghost')+'" onclick="__deck(\'slop\')">Full slop deck</button>'+
        '<button class="sm '+(cf==='unslop'?'':'ghost')+'" onclick="__deck(\'unslop\')">Full unslop deck</button>'+
      '</div></div>'+
      '<div class="muted" style="font-size:14px;margin:6px 0 10px">The full deck, in order: the opening drafter, the revising agents, and the closing agent. Everyone gets a random card when the game starts. Tap any card to read it full-size.</div>'+
      '<div class="roster">'+ (
        [{id:'first-agent',hasImage:true,slop:r.drafter.slop,unslop:r.drafter.unslop}]
          .concat((r.roster||[]).filter(function(a){return a.id!=='ending';}))
          .concat((r.roster||[]).filter(function(a){return a.id==='ending';}))
      ).map(function(a){
        var nm=(a[cf]||{}).name||'';
        var role = a.id==='first-agent'?' <span class="muted">· opening</span>':(a.id==='ending'?' <span class="muted">· closing</span>':'');
        var img = a.hasImage? '<img src="cards/card_'+esc(a.id)+'_'+cf+'.png" alt="">' : '<div style="padding:24px" class="muted center">'+esc(nm)+'</div>';
        return '<div class="mini" onclick="__peek(\''+esc(a.id)+'\',\''+cf+'\')">'+img+'<div class="cap">'+esc(nm)+role+'</div></div>';
      }).join('')+'</div>';

    if(IS_FAC){
      app.innerHTML = toolbar()+
      '<div class="panel center col" style="align-items:center">'+
        '<div class="lbl">Players join at this address with code</div>'+
        '<div class="code">'+esc(r.code)+'</div>'+
        '<div class="muted">'+esc(location.host)+'</div>'+
      '</div>'+
      '<div class="panel col" style="margin-top:14px">'+
        '<div class="lbl">Seed — written at the top of every sheet</div>'+
        '<input id="seed" value="'+esc(r.seed)+'" onchange="__seed(this.value)">'+
        '<div style="margin-top:6px">'+playersBar()+'</div>'+
        '<div class="row" style="margin-top:8px"><button class="red" onclick="__startAct1()">Start Act 1 — Run the slop machine ▶</button>'+
          '<span class="muted" style="font-size:14px">'+r.players.length+' player(s) at the table</span></div>'+
      '</div>'+ '<div class="panel" style="margin-top:14px">'+browse+'</div>';
    } else {
      app.innerHTML = toolbar()+
      '<div class="panel center col" style="align-items:center;margin-top:2vh">'+
        '<div class="pill">In room '+esc(r.code)+'</div>'+
        '<h2>You\'re in. Waiting for the facilitator…</h2>'+
        '<div class="seed" style="margin:8px 0">'+esc(r.seed)+'</div>'+
        '<div>'+playersBar()+'</div>'+
      '</div>'+ '<div class="panel" style="margin-top:14px">'+browse+'</div>';
    }
  }
  window.__peek=function(id,face){
    var ag=rosterById(id); if(!ag) return;
    // Wide readable card (now carries the artwork background from CSS).
    var body = '<div class="cardfull">'+cardHTML(ag,face,false)+'</div>';
    openModal(body+'<div class="row center" style="justify-content:center;margin-top:10px">'+
      '<button class="sm '+(face==='slop'?'':'ghost')+'" onclick="__peek('+"'"+id+"','slop'"+')">Slop side</button>'+
      '<button class="sm '+(face==='unslop'?'':'ghost')+'" onclick="__peek('+"'"+id+"','unslop'"+')">Unslop side</button>'+
      '<button class="sm" onclick="closeModal()">Close</button></div>', true);
  };
  window.__deck=function(face){ castFace = face==='unslop'?'unslop':'slop'; render(); };
  window.__seed=function(v){ send({type:'setSeed',seed:v}); };
  window.__startAct1=function(){ send({type:'setAct',act:1}); send({type:'startDraft'}); window.__setTimer(13); };

  // =====================================================================
  //  DRAFT
  // =====================================================================
  function draftScreen(){
    var r=state.room, c=state.myCard, s=state.mySheet;
    var drafterAgent = { id:'first-agent', __drafter:true, slop:r.drafter.slop, unslop:r.drafter.unslop };
    var mode = r.face==='slop'?'Quick':'Slow';
    var head = '<div class="row" style="justify-content:space-between"><div><span class="pill">Act '+r.act+' · '+(r.face==='slop'?'SLOP':'UNSLOP')+'</span> <span class="pill">Draft</span> '+explainBtn()+'</div>'+
      (IS_FAC?'<div class="row"><button class="sm '+(r.freeAgentChoice?'':'ghost')+'" onclick="__toggleFreeAgents()" title="Let players swap to a different agent between turns during the relay. Off = the canonical game (one fixed random agent each).">Free agent choice: '+(r.freeAgentChoice?'on':'off')+'</button><button class="red sm" onclick="__startRelay()">Everyone drafted → Start the relay ▶</button></div>':'')+'</div>';
    var seed = '<div class="seed" style="margin:14px 0">'+esc(r.seed)+'</div>';
    var cardCol = '<div class="cardfull" style="margin-bottom:14px">'+cardHTML(drafterAgent, r.face, false)+'</div>';
    var submitted = s && s.submitted;
    var draftCol = '<div class="panel col">'+
      '<div class="lbl">Your draft — 2 to 5 sentences, in your voice</div>'+
      '<div class="muted" style="font-size:14px">'+(r.face==='slop'
        ? 'Quick Drafter mode: write something fluent, immediately. Don\'t wait to know where you stand.'
        : 'Slow Drafter mode: find one true thing. Ask the person next to you (or in chat) what they actually think, and write from that.')+'</div>'+
      '<textarea id="draft" placeholder="Respond to the seed…">'+esc(s?s.content:'')+'</textarea>'+
      '<input id="draftNote" placeholder="Optional — a note in the drafter\'s voice on what you did (shows first in the trail)" value="'+esc(s&&s.draftNote?s.draftNote:'')+'">'+
      '<div class="row"><button class="'+(submitted?'ghost':'red')+'" onclick="__submitDraft()">'+(submitted?'Update draft':'Submit draft')+'</button>'+
        (submitted?'<span class="muted">✓ submitted — you can still edit until the relay starts</span>':'')+'</div>'+
    '</div>';
    app.innerHTML = toolbar()+head+cardCol+seed+draftCol;
  }
  window.__submitDraft=function(){ var v=document.getElementById('draft').value.trim(); if(!v){flash('Write a sentence or two first');return;} var n=document.getElementById('draftNote'); send({type:'submitDraft',content:v,note:n?n.value.trim():''}); flash('Draft submitted'); };
  window.__startRelay=function(){ send({type:'startRelay'}); };

  // =====================================================================
  //  RELAY
  // =====================================================================
  function relayScreen(){
    var r=state.room, s=state.mySheet;
    var xerox = r.xeroxMode;
    var lockedName = '';
    if(xerox){ var la=rosterById(r.lockedAgentId); lockedName = la?((la[r.face]||la.slop).name):'one agent'; }
    var head='<div class="row" style="justify-content:space-between">'+
      '<div><span class="pill">Act '+r.act+' · '+(r.face==='slop'?'SLOP':'UNSLOP')+'</span> '+
      '<span class="pill">'+(xerox?'XEROX TEST':'Relay')+' · round '+r.relayRound+' / '+r.relayTotal+'</span> '+explainBtn()+'</div>'+
      (IS_FAC?'<div class="row"><button class="sm '+(r.freeAgentChoice?'':'ghost')+'" onclick="__toggleFreeAgents()" title="Let players swap to a different agent between turns. Off = the canonical game (one fixed agent each).">Free agent choice: '+(r.freeAgentChoice?'on':'off')+'</button><button class="sm" onclick="__tick()">Pass left ▶</button><button class="sm ghost" onclick="__startClosing()" title="Everyone writes a closing next. You can still come back to the relay.">End relay → closing round ▶</button></div>':'')+'</div>';
    if(IS_FAC) head += '<div class="muted" style="font-size:13px;margin-top:6px">“Pass left” is your metronome. Reading a sheet aloud from the monitor below <b>won\'t</b> end the round. When the lap is done, “End relay → closing round” sends everyone to write a closing.</div>';
    if(IS_FAC && r.players.length<2) head += '<div class="note act" style="margin-top:8px"><b>Solo table.</b> With one seat, sheets have nowhere to pass. Open more tabs and join with the code to see the relay move — or turn on <b>Free agent choice</b> above to try each agent yourself, turn by turn.</div>';
    if(xerox) head += '<div class="note act" style="margin-top:8px"><b>Xerox test.</b> Every station now applies <b>'+esc(lockedName)+'</b>\'s move — the same rule at scale. Watch it calcify into its own texture.</div>';

    // my card (image acts 1/2; xerox uses locked agent)
    var myAgentId = xerox? r.lockedAgentId : (myPlayer()?myPlayer().agentId:null);
    var myAg = rosterById(myAgentId);
    var cardCol = myAg? '<div class="cardfull" style="margin:12px auto">'+cardHTML(myAg,r.face,false)+'</div>' : '<div class="panel muted">No card yet.</div>';

    // free agent choice: swap the agent you play for this turn (never during a Xerox test)
    var switcher = '';
    if(r.freeAgentChoice && !xerox){
      switcher = '<div class="panel col" style="margin-top:12px"><div class="lbl">Free agent choice is on — pick the agent for this turn</div>'+
        '<div class="muted" style="font-size:13px">Your note this turn is stamped with whichever agent is active. Switch as often as you like.</div>'+
        '<div class="row" style="flex-wrap:wrap;margin-top:6px">'+
        (r.roster||[]).filter(function(a){return !r.disabled[a.id];}).map(function(a){
          var nm=(a[r.face]||a.slop||{}).name||''; var mine=a.id===myAgentId;
          return '<button class="sm '+(mine?'':'ghost')+'" onclick="__pickAgent(\''+esc(a.id)+'\')">'+esc(nm)+'</button>';
        }).join('')+'</div></div>';
    }

    var sheetCol;
    if(!s){ sheetCol='<div class="panel muted">Waiting for a sheet to reach you…</div>'; }
    else{
      var acted = myPlayer() && myPlayer().ready;
      sheetCol='<div class="panel col">'+
        '<div class="lbl">The sheet in front of you'+(s.mine?' — <span class="red">this one started as yours</span>':' · started by '+esc(s.originName))+'</div>'+
        '<div class="muted" style="font-size:14px">Edit the draft as your agent would — or leave it as is. Then write a note on what you did (or why you left it) in your agent\'s voice.</div>'+
        '<div class="seed" style="font-size:15px">'+esc(r.seed)+'</div>'+
        '<textarea id="sheet">'+esc(s.content)+'</textarea>'+
        '<input id="note" placeholder="Your note — what you did and why (in your agent\'s voice)">'+
        '<div class="row"><button class="red" onclick="__submitMove()">'+(acted?'Update my turn':'Done — my turn')+'</button>'+
          (acted?'<span class="muted">✓ done — waiting for the pass</span>':'')+'</div>'+
        trailHTML(s.history)+
      '</div>';
    }
    var facmon = IS_FAC? facMonitor('relay') : sheetBrowser();
    app.innerHTML = toolbar()+head+cardCol+switcher+sheetCol+facmon;
  }
  window.__toggleFreeAgents=function(){ send({type:'setFreeAgents', on: !(state && state.room && state.room.freeAgentChoice)}); };
  function trailHTML(hist){
    if(!hist||!hist.length) return '<div class="trail muted" style="font-size:14px">No notes yet — you may be the first hand on this sheet.</div>';
    return '<div class="trail"><div class="lbl">The trail — every hand that touched this sheet</div>'+
      hist.map(function(h){ return '<div class="note '+(h.action!=='pass'?'act':'')+'"><div class="who">'+esc(h.agentName)+' · '+esc(h.playerName)+' · '+esc(h.action)+'</div>'+esc(h.note||'(no note)')+'</div>'; }).join('')+'</div>';
  }
  window.__submitMove=function(){ var content=document.getElementById('sheet').value; var note=document.getElementById('note').value.trim(); if(!note){ flash('Add a one-line note on your turn'); return; } send({type:'submitMove',content:content,note:note}); flash('Your turn is in'); };
  window.__tick=function(){ send({type:'tick'}); relayScreen._mv=null; };
  window.__toSpotlight=function(){ send({type:'spotlight'}); };
  window.__resumeRelay=function(){ send({type:'resumeRelay'}); };
  window.__startClosing=function(){ send({type:'startClosing'}); };
  function myPlayer(){ return state.room.players.find(function(p){return p.id===MYID;}); }
  function facMonitor(mode){
    var sheets=state.allSheets||[];
    var relay = mode==='relay';
    var label = relay
      ? 'Sheet monitor — tap a sheet to open & read it aloud (this won\'t end the relay)'
      : 'Tap a sheet to feature it on everyone\'s screen';
    var fn = relay ? '__readAloud' : '__spot';
    return '<div class="panel" style="margin-top:14px"><div class="row" style="justify-content:space-between"><div class="lbl">'+label+'</div><div class="muted">'+readyCount()+'</div></div>'+
      '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-top:10px">'+
      sheets.map(function(s){ return '<div class="sheet" style="cursor:pointer" onclick="'+fn+'('+"'"+s.id+"'"+')"><div class="lbl">'+esc(s.originName)+'\'s sheet · '+(s.history?s.history.length:0)+' hands</div><div class="content" style="font-size:14px;max-height:120px;overflow:auto">'+esc(s.content||'(empty)')+'</div></div>'; }).join('')+
      '</div></div>';
  }
  // Read-only browser of every sheet in play, for players (facilitator uses facMonitor).
  function sheetBrowser(){
    var sheets=state.allSheets||[];
    if(!sheets.length) return '<div class="panel" style="margin-top:14px"><div class="muted">'+readyCount()+'</div></div>';
    return '<div class="panel" style="margin-top:14px"><div class="lbl">All sheets in play — tap any to read (view only)</div>'+
      '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-top:10px">'+
      sheets.map(function(s){ return '<div class="sheet" style="cursor:pointer" onclick="__readAloud('+"'"+s.id+"'"+')"><div class="lbl">'+esc(s.originName)+'\'s sheet · '+(s.history?s.history.length:0)+' hands</div><div class="content" style="font-size:14px;max-height:120px;overflow:auto">'+esc(s.content||'(empty)')+'</div></div>'; }).join('')+
      '</div></div>';
  }
  window.__spot=function(id){ send({type:'spotlight',sheetId:id}); };
  window.__readAloud=function(id){
    var s=(state.allSheets||[]).find(function(x){return x.id===id;}); if(!s) return;
    openModal('<div class="lbl">'+esc(s.originName)+'\'s sheet</div>'+
      '<div class="seed" style="margin:6px 0 12px">'+esc(state.room.seed)+'</div>'+
      '<div class="sheet"><div class="content">'+esc(s.content||'(empty)')+'</div>'+trailHTML(s.history)+'</div>'+
      '<div class="row center" style="justify-content:center;margin-top:12px"><button class="sm" onclick="closeModal()">Close</button></div>');
  };

  // =====================================================================
  //  CLOSING ROUND — everyone writes an ending (Closer / Lingerer)
  // =====================================================================
  function closingScreen(){
    var r=state.room, s=state.mySheet;
    var endName = r.face==='slop'?'The Closer':'The Lingerer';
    var head='<div class="row" style="justify-content:space-between"><div><span class="pill">Act '+r.act+' · '+(r.face==='slop'?'SLOP':'UNSLOP')+'</span> <span class="pill">Closing round</span> '+explainBtn()+'</div>'+
      (IS_FAC?'<div class="row"><button class="sm ghost" onclick="__resumeRelay()">◀ Back to the relay</button><button class="sm ghost" onclick="__toSpotlight()">Finish → trace a sheet ▶</button></div>':'')+'</div>';
    if(IS_FAC) head+='<div class="muted" style="font-size:13px;margin-top:6px">Everyone writes the ending for the sheet in front of them — in '+esc(endName)+'\'s voice. The endings always land last.</div>';
    var endAg = rosterById('ending');
    var cardCol = endAg? '<div class="cardfull" style="margin:12px auto">'+cardHTML(endAg, r.face, false)+'</div>' : '';
    var acted = myPlayer() && myPlayer().ready;
    var sheetCol = !s? '<div class="panel muted">Waiting for a sheet…</div>' :
      '<div class="panel col">'+
        '<div class="lbl">Write the closing for the sheet in front of you — in <b>'+esc(endName)+'</b>\'s voice</div>'+
        '<div class="seed closing-accent" style="font-size:15px">'+esc(r.seed)+'</div>'+
        '<textarea id="sheet">'+esc(s.content)+'</textarea>'+
        '<input id="note" placeholder="A one-line note on how you ended it (optional)">'+
        '<div class="row"><button class="red" onclick="__submitClosing()">'+(acted?'Update my closing':'Write the closing → done')+'</button>'+(acted?'<span class="muted">✓ done</span>':'')+'</div>'+
        trailHTML(s.history)+
      '</div>';
    var facmon = IS_FAC? facMonitor('relay') : sheetBrowser();
    app.innerHTML = toolbar()+head+cardCol+sheetCol+facmon;
  }
  window.__submitClosing=function(){ var content=document.getElementById('sheet').value; var note=document.getElementById('note').value.trim(); send({type:'submitClosing',content:content,note:note}); flash('Closing recorded'); };

  // =====================================================================
  //  SPOTLIGHT
  // =====================================================================
  function spotlightScreen(){
    var r=state.room, sp=state.spotlight;
    var head='<div class="row" style="justify-content:space-between"><div><span class="pill">Act '+r.act+' · Trace one sheet, read aloud</span> '+explainBtn()+'</div>'+
      (IS_FAC?'<div class="row"><button class="sm ghost" onclick="__resumeRelay()">◀ Back to the relay (keep passing)</button>'+facNext()+'</div>':'')+'</div>';
    var body = sp? '<div class="panel" style="margin-top:12px"><div class="lbl">Started by '+esc(sp.originName)+' · seed:</div>'+
      '<div class="seed" style="margin:6px 0 12px">'+esc(r.seed)+'</div>'+
      '<div class="sheet"><div class="content">'+esc(sp.content||'(empty)')+'</div>'+trailHTML(sp.history)+'</div></div>'
      : '<div class="panel muted">Facilitator is choosing a sheet…</div>';
    var picker = IS_FAC? facMonitor('spotlight'):'';
    app.innerHTML = toolbar()+head+body+picker;
  }
  function facNext(){
    var a=state.room.act;
    if(a===1) return '<button class="red sm" onclick="__beginAct2()">Begin Act 2 — Flip to unslop ▶</button>';
    if(a===2) return '<button class="red sm" onclick="__beginAct3()">Begin Act 3 — Become the architect ▶</button>';
    return '<button class="red sm" onclick="__debrief()">To the debrief ▶</button>';
  }
  window.__beginAct2=function(){ send({type:'setAct',act:2}); send({type:'startDraft'}); window.__setTimer(13); };
  window.__beginAct3=function(){ send({type:'beginArchitect'}); window.__setTimer(22); };
  window.__debrief=function(){ send({type:'debrief'}); };

  // =====================================================================
  //  ARCHITECT (Act 3)
  // =====================================================================
  function architectScreen(){
    var r=state.room;
    var head='<div class="row" style="justify-content:space-between"><div><span class="pill red">Act 3</span> <span class="pill">Become the architect</span> '+explainBtn()+'</div>'+
      (IS_FAC?'<button class="sm" onclick="__debrief()">To debrief ▶</button>':'')+'</div>';
    var introFac='<div class="panel" style="margin-top:12px"><b>Redesign the machine.</b> Amend an agent\'s stance or skills, cut agents from the line, write a new one — then run the <b>Xerox test</b>: make every station apply one rule and watch it calcify into its own texture. Everyone at the table can redesign too — their changes show up here live.</div>';
    var introPlayer='<div class="panel" style="margin-top:12px"><b>You\'re an architect now.</b> Amend your own agent below — its stance, what it refuses, its moves — or write a brand-new agent from scratch and become it. You can also switch to a different card. When everyone\'s ready, the facilitator runs the redesigned machine.</div>';

    function addAgentForm(){
      return '<div class="panel col" style="margin-top:14px"><h3 style="margin:0">Write a new agent'+(IS_FAC?'':' — and become it')+'</h3>'+
        '<input id="na-name" placeholder="Name (e.g. The Witness)">'+
        '<textarea id="na-cares" placeholder="i care about…" style="min-height:60px"></textarea>'+
        '<textarea id="na-refuses" placeholder="i refuse…" style="min-height:60px"></textarea>'+
        '<textarea id="na-skills" placeholder="skills — one per line, e.g.  name it — replace the abstraction with the thing itself"></textarea>'+
        '<div class="row"><button class="red" onclick="__addAgent()">'+(IS_FAC?'Add to the machine':'Add it & become it')+'</button></div></div>';
    }

    if(IS_FAC){
      var cards = r.roster.map(function(a){
        var disabled = r.disabled[a.id];
        return '<div class="col"><div style="opacity:'+(disabled?'.4':'1')+'">'+cardHTML(a, r.face, true)+'</div>'+
          '<div class="row"><button class="sm ghost" onclick="__toggle(\''+a.id+'\')">'+(disabled?'Restore to line':'Cut from line')+'</button>'+
          '<button class="sm ghost" onclick="__xerox(\''+a.id+'\')">Xerox-test this →</button></div></div>';
      }).join('');
      var runbar='<div class="panel row" style="margin-top:14px;justify-content:space-between"><div class="muted">When the redesigned machine is ready:</div>'+
        '<div class="row"><button onclick="__redesignRun()">Run the redesigned relay ▶</button></div></div>';
      app.innerHTML = toolbar()+head+introFac+
        '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));margin-top:14px">'+cards+'</div>'+
        addAgentForm()+runbar;
    } else {
      var me=myPlayer();
      var myAg = rosterById(me && me.agentId);
      var myBlock = myAg? '<div class="panel col" style="margin-top:14px"><div class="lbl">Your agent — amend it</div><div class="cardfull">'+cardHTML(myAg, r.face, true)+'</div></div>'
        : '<div class="panel muted" style="margin-top:14px">No agent assigned yet.</div>';
      var picker='<div class="panel col"><div class="lbl">…or switch to a different card</div><div class="row" style="flex-wrap:wrap">'+
        r.roster.filter(function(a){return !r.disabled[a.id];}).map(function(a){ var nm=(a[r.face]||a.slop||{}).name||''; var mine=myAg&&a.id===myAg.id; return '<button class="sm '+(mine?'':'ghost')+'" onclick="__pickAgent(\''+a.id+'\')">'+esc(nm)+'</button>'; }).join('')+'</div></div>';
      var lineup='<div class="panel"><div class="lbl">The whole line right now — tap to read</div><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-top:8px">'+
        r.roster.map(function(a){ return '<div class="mini" style="padding:12px;text-align:center" onclick="__peek(\''+a.id+'\',\''+r.face+'\')"><b>'+esc((a[r.face]||a.slop||{}).name||'')+'</b>'+(a.custom?'<div class="muted" style="font-size:11px">new · '+esc(a.author||'')+'</div>':'')+'</div>'; }).join('')+'</div></div>';
      var wait='<div class="panel muted" style="margin-top:14px">When everyone has redesigned, the facilitator runs the machine.</div>';
      app.innerHTML = toolbar()+head+introPlayer+myBlock+picker+addAgentForm()+lineup+wait;
    }

    // wire save-agent buttons (any editable card on screen)
    document.querySelectorAll('.save-agent').forEach(function(btn){
      btn.onclick=function(){
        var card=btn.closest('.card'); var id=card.getAttribute('data-agent');
        send({type:'editAgent',agentId:id,face:r.face,
          name:card.querySelector('.ed-name').value,
          cares:card.querySelector('.ed-cares').value,
          refuses:card.querySelector('.ed-refuses').value,
          skills:card.querySelector('.ed-skills').value});
        flash('Amendment saved');
      };
    });
  }
  window.__toggle=function(id){ send({type:'toggleAgent',agentId:id}); };
  window.__pickAgent=function(id){ send({type:'pickAgent',agentId:id}); flash('Switched your card'); };
  window.__xerox=function(id){ send({type:'xerox',agentId:id}); window.__setTimer(6); };
  window.__addAgent=function(){
    var a={ name:val('na-name'), cares:val('na-cares'), refuses:val('na-refuses'), skills:val('na-skills') };
    if(!a.name){ flash('Give your agent a name'); return; }
    send({type:'addAgent',agent:a}); flash('New agent added');
    ['na-name','na-cares','na-refuses','na-skills'].forEach(function(i){var e=document.getElementById(i); if(e)e.value='';});
  };
  window.__redesignRun=function(){ send({type:'startDraft'}); window.__setTimer(13); };
  function val(id){ var e=document.getElementById(id); return e?e.value.trim():''; }

  // =====================================================================
  //  DEBRIEF
  // =====================================================================
  function debriefScreen(){
    var r=state.room, arc=state.archive||[];
    var qs=['What did the system make easy to think?','What did it make hard?','What did it smooth over, or leave out?','Which moves actually survived — and what did they reach for outside the machine?','What would you change about the architecture?'];
    var acts = arc.length? arc.map(renderActSection).join('') : '<div class="muted" style="margin-top:8px">No sheets were recorded.</div>';
    app.innerHTML = toolbar()+
      '<div class="center"><span class="pill">Debrief</span><h1 style="margin:8px 0">Change the architecture, change the output.</h1></div>'+
      '<div class="panel" style="margin-top:12px"><div class="lbl">Discussion</div><div class="stack" style="margin-top:8px">'+
        qs.map(function(q){return '<div class="seed" style="font-size:18px">'+esc(q)+'</div>';}).join('')+'</div></div>'+
      '<div class="panel" style="margin-top:14px"><div class="row" style="justify-content:space-between;align-items:center"><div class="lbl">Everything the machine produced — across all acts</div>'+
        '<button class="sm ghost" onclick="__downloadEntries()">⬇ Download all entries</button></div>'+
        acts+'</div>';
  }

  // ---- modal ----
  function openModal(html, wide){ closeModal(); var d=document.createElement('div'); d.className='modal-bg'; d.id='modal'; d.onclick=function(e){if(e.target===d)closeModal();}; d.innerHTML='<div class="modal'+(wide?' wide':'')+'">'+html+'</div>'; document.body.appendChild(d); }
  window.closeModal=function(){ var m=document.getElementById('modal'); if(m)m.remove(); };

  // ---- instructions & per-act learning ----
  window.__howto=function(){
    openModal(
      '<h2 style="margin:0 0 8px">The <span class="red">(un)</span>Slop Game</h2>'+
      '<p style="margin:8px 0"><b>What it is.</b> A hands-on game about <i>creative architecture</i> — the practice of designing the conditions through which meaning gets made, with and without AI. You and your group become agents in a human multi-agent machine.</p>'+
      '<p style="margin:8px 0"><b>The idea.</b> Left to its own devices, a system tends to produce <i>slop</i>: writing that\'s fluent, structured, and about almost nothing. Slop isn\'t failure — it\'s when nothing is load-bearing, when any piece could be swapped for any other. You\'ll build slop on purpose, try to resist it, then redesign the machine itself.</p>'+
      '<p style="margin:8px 0"><b>How to play.</b> One person facilitates — sets the seed question and runs the acts. Everyone else joins the room code on their own device and is dealt a random agent: a role with a stance and a couple of moves.</p>'+
      '<div class="stack" style="margin:10px 0">'+
        '<div class="note act"><b>Act 1 — Slop.</b> Everyone drafts a quick response. Sheets pass around; on your turn you apply your agent\'s move and leave a note. Everyone writes a closing. Then trace one sheet aloud.</div>'+
        '<div class="note act"><b>Act 2 — Unslop.</b> Same seed, cards flip to their unslop side. Try to resist the slop — and feel the wall you hit.</div>'+
        '<div class="note act"><b>Act 3 — Architect.</b> Redesign the machine: amend agents, cut them, write new ones, run the Xerox test.</div>'+
      '</div>'+
      '<p style="margin:8px 0"><b>The point.</b> Change the architecture, change the output.</p>'+
      '<p style="margin:8px 0" class="muted"><b>Background.</b> This grew out of a contest provocation about AI fiction. <a href="https://www.youtube.com/watch?v=Z5BxyIlWU74" target="_blank" rel="noopener">Watch the talk</a> for the story of the contest and the build — by <a href="https://ca.linkedin.com/in/rachelhorst-futures" target="_blank" rel="noopener">Dr. Rachel Horst</a> (<a href="https://substack.com/@rhorst" target="_blank" rel="noopener">Substack</a>). Artwork made with <a href="https://rshorst.github.io/diagrammatic-studies/" target="_blank" rel="noopener">Diagrammatic Studies</a>.</p>'+
      '<div class="row center" style="justify-content:center;margin-top:12px"><button class="sm" onclick="closeModal()">Close</button></div>', true);
  };
  var LEARN={
    1:['Act 1 — Manufacturing slop','Writing this draft may take real effort — the ease isn\'t in the writing. Notice instead what the machine keeps <i>pulling toward</i>: fluent, warm, structured prose that\'s about almost nothing. That\'s the path of least resistance, the shape a system slides into. Its problem is <b>fungibility</b> — any character, metaphor, or ending swaps for another and the whole thing just shrugs and carries on. Slop isn\'t bad writing, and it isn\'t the effortless way out. It\'s when nothing is load-bearing.'],
    2:['Act 2 — The arms-race wall','Trying to resist slop, you find something frustrating: any move you can <i>name</i> — be specific, state it plainly, don\'t resolve — can be automated, and at scale it becomes its own slop. You can\'t rule your way to non-fungibility. What actually resists is what reaches <b>outside</b> the system: a real face, a real place, a person\'s actual words.'],
    3:['Act 3 — Authorship moves upstream','You stop editing sentences and start designing the machine that makes them. That\'s creative architecture. A closed system averages toward slop; the non-fungible has to be <b>imported from outside</b>. Build a machine with holes in it, and let the world leak through.']
  };
  function explainBtn(){ return '<button class="sm ghost" onclick="__explain()">ⓘ What\'s being learned</button>'; }
  window.__explain=function(){
    var a=state.room.act, L=LEARN[a]||LEARN[1];
    openModal('<div class="lbl">What\'s being learned</div><h3 style="margin:4px 0 8px">'+L[0]+'</h3><p style="font-size:17px;line-height:1.6">'+L[1]+'</p>'+
      '<div class="row center" style="justify-content:center;margin-top:12px"><button class="sm" onclick="closeModal()">Close</button></div>');
  };

  // ---- review across acts + export ----
  function renderSheetTile(s){
    return '<div class="sheet"><div class="lbl">'+esc(s.originName)+' · '+((s.history&&s.history.length)||0)+' hands</div>'+
      '<div class="content" style="font-size:15px">'+esc(s.content||'(empty)')+'</div>'+trailHTML(s.history)+'</div>';
  }
  function renderActSection(entry){
    return '<div style="margin-top:18px"><h3 style="margin:0 0 4px">'+esc(entry.label)+'</h3>'+
      '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));margin-top:8px">'+
      entry.sheets.map(renderSheetTile).join('')+'</div></div>';
  }
  window.__reviewAct=function(n){
    var arc=(state.archive||[]).filter(function(e){return e.act===n;});
    if(!arc.length){ openModal('<h3 style="margin:0 0 6px">Act '+n+'</h3><div class="muted">Nothing has been written in Act '+n+' yet — it\'ll show here once that act produces sheets.</div><div class="row center" style="justify-content:center;margin-top:12px"><button class="sm" onclick="closeModal()">Close</button></div>'); return; }
    var body='<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Act '+n+' — what was written</h3><button class="sm ghost" onclick="__downloadEntries()">⬇ Download all entries</button></div>'+
      arc.map(renderActSection).join('')+
      '<div class="row center" style="justify-content:center;margin-top:16px"><button class="sm" onclick="closeModal()">Close</button></div>';
    openModal(body, true);
  };
  window.__reviewActs=function(){
    var arc=state.archive||[];
    if(!arc.length){ openModal('<h3>Review acts</h3><div class="muted">Nothing has been written yet. Once an act produces sheets, they\'ll appear here so you can click back through Act 1, Act 2, and Act 3.</div><div class="row center" style="justify-content:center;margin-top:12px"><button class="sm" onclick="closeModal()">Close</button></div>'); return; }
    var body='<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Review — every act</h3><button class="sm ghost" onclick="__downloadEntries()">⬇ Download all entries</button></div>'+
      arc.map(renderActSection).join('')+
      '<div class="row center" style="justify-content:center;margin-top:16px"><button class="sm" onclick="closeModal()">Close</button></div>';
    openModal(body, true);
  };
  window.__downloadEntries=function(){
    var arc=state.archive||[], r=state.room;
    var lines=['THE (UN)SLOP GAME — session entries','Room '+r.code,'Seed: '+r.seed,''];
    arc.forEach(function(e){
      lines.push('','========================================','  '+e.label,'========================================','');
      e.sheets.forEach(function(s){
        lines.push('— '+s.originName+"'s sheet —", (s.content||'(empty)'));
        if(s.history&&s.history.length){ lines.push('  trail:'); s.history.forEach(function(h){ lines.push('   • ['+h.agentName+' · '+h.playerName+' · '+h.action+'] '+(h.note||'')); }); }
        lines.push('');
      });
    });
    var blob=new Blob([lines.join('\n')],{type:'text/plain'});
    var url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download='unslop-'+r.code+'-entries.txt'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    flash('Downloaded all entries');
  };

  // =====================================================================
  //  AI MACHINE MODE (solo) — design agents, real LLM agents run them
  // =====================================================================
  var ai = null;
  var aiKeyOpen = false;
  function aiClone(x){ return JSON.parse(JSON.stringify(x)); }
  var AI_PALETTE=[
    {s:'#d0563f',t:'rgba(208,86,63,.18)'},{s:'#2f7d78',t:'rgba(47,125,120,.18)'},
    {s:'#b8862b',t:'rgba(184,134,43,.20)'},{s:'#8a4f86',t:'rgba(138,79,134,.18)'},
    {s:'#5f8a3f',t:'rgba(95,138,63,.18)'},{s:'#3f6f9e',t:'rgba(63,111,158,.18)'},
    {s:'#9c6b4a',t:'rgba(156,107,74,.18)'},{s:'#c26d86',t:'rgba(194,109,134,.18)'},
    {s:'#5f6b7a',t:'rgba(95,107,122,.18)'},{s:'#7a5aa8',t:'rgba(122,90,168,.18)'}
  ];
  function aiColor(i){ return AI_PALETTE[((i%AI_PALETTE.length)+AI_PALETTE.length)%AI_PALETTE.length]; }
  function aiTok(s){ return (s||'').split(/(\s+)/); }
  function aiDiff(a,b){
    var n=a.length,m=b.length, dp=[];
    for(var i=0;i<=n;i++) dp.push(new Array(m+1).fill(0));
    for(var i=n-1;i>=0;i--) for(var j=m-1;j>=0;j--) dp[i][j]= a[i]===b[j]? dp[i+1][j+1]+1 : (dp[i+1][j]>=dp[i][j+1]?dp[i+1][j]:dp[i][j+1]);
    var res=[], i=0, j=0;
    while(i<n&&j<m){
      if(a[i]===b[j]){ res.push({t:b[j],added:false,oldIdx:i}); i++; j++; }
      else if(dp[i+1][j]>=dp[i][j+1]){ i++; }
      else { res.push({t:b[j],added:true,oldIdx:-1}); j++; }
    }
    while(j<m){ res.push({t:b[j],added:true,oldIdx:-1}); j++; }
    return res;
  }
  function aiKey(){ try{ return localStorage.getItem('unslop_ai_key')||''; }catch(e){ return ''; } }
  window.__aiKeyToggle=function(){ aiKeyOpen=!aiKeyOpen; aiScreen(); };
  window.__aiSaveKey=function(){
    var el=document.getElementById('ai-key'); var v=(el?el.value:'').trim();
    if(v && v.indexOf('sk-')!==0){ flash('That doesn\'t look like an Anthropic key (starts with sk-)'); return; }
    try{ if(v) localStorage.setItem('unslop_ai_key', v); }catch(e){}
    aiKeyOpen=false; aiScreen(); flash(v?'Key saved in this browser':'Enter a key');
  };
  window.__aiForgetKey=function(){ try{ localStorage.removeItem('unslop_ai_key'); }catch(e){} aiKeyOpen=true; aiScreen(); flash('Key forgotten'); };
  window.__aiSaveRoomKey=function(){
    var el=document.getElementById('ai-key'); var v=(el?el.value:'').trim();
    if(!v || v.indexOf('sk-')!==0){ flash('Paste a valid key (starts with sk-)'); return; }
    send({type:'setAiKey',key:v}); aiKeyOpen=false; flash('Shared key set for the room'); setTimeout(aiScreen,350);
  };
  window.__aiClearRoomKey=function(){ send({type:'setAiKey',key:''}); flash('Shared key removed'); setTimeout(aiScreen,350); };
  function aiKeyRow(){
    // In a room: the facilitator sets one shared key for everyone.
    if(ai.roomCode){
      var roomSet = state && state.room && state.room.aiKeySet;
      if(IS_FAC){
        if(roomSet && !aiKeyOpen){
          return '<div class="note" style="border-color:#3fae5a;margin-top:10px">✓ <b>Shared key set for this room</b> — everyone here can run the AI on it. <button class="sm ghost" onclick="__aiKeyToggle()">Change</button> <button class="sm ghost" onclick="__aiClearRoomKey()">Remove</button></div>';
        }
        return '<div class="panel col" style="margin-top:10px"><div class="lbl">Shared Anthropic key for this room</div>'+
          '<div class="muted" style="font-size:13px">Paste your key once and <b>everyone in the room</b> can explore the AI machine on it — even mid-game. It stays on the server for this room only and is never sent to players. Get one at <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a>.</div>'+
          '<input id="ai-key" type="password" placeholder="sk-ant-..." autocomplete="off">'+
          '<div class="row"><button class="red sm" onclick="__aiSaveRoomKey()">Set room key</button></div></div>';
      }
      if(roomSet) return '<div class="note" style="border-color:#3fae5a;margin-top:10px">✓ Using the <b>shared key</b> your facilitator set for this room — just design and run.</div>';
      return '<div class="note act" style="margin-top:10px"><b>No shared key yet.</b> Ask your facilitator to set one for the room — or paste your own below.'+
        '<div style="margin-top:8px"><input id="ai-key" type="password" placeholder="sk-ant-... (your own)" autocomplete="off"><div class="row" style="margin-top:6px"><button class="red sm" onclick="__aiSaveKey()">Use my key</button></div></div></div>';
    }
    var have = aiKey() || ai.hasKey;
    if(have && !aiKeyOpen){
      var src = aiKey()? 'stored in this browser' : 'set on the server';
      return '<div class="note" style="border-color:#3fae5a;margin-top:10px">✓ <b>API key ready</b> ('+src+') — the machine will produce real output. '+
        (aiKey()? '<button class="sm ghost" onclick="__aiForgetKey()">Forget key</button>' : '<button class="sm ghost" onclick="__aiKeyToggle()">Use my own key</button>')+'</div>';
    }
    return '<div class="panel col" style="margin-top:10px"><div class="lbl">Anthropic API key</div>'+
      '<div class="muted" style="font-size:13px">Paste your key to run real agents. It\'s stored only in this browser and sent to your own server — never anywhere else. Get one at <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a>. Without a key, runs are labelled &ldquo;simulated.&rdquo;</div>'+
      '<input id="ai-key" type="password" placeholder="sk-ant-..." autocomplete="off">'+
      '<div class="row"><button class="red sm" onclick="__aiSaveKey()">Save key</button>'+
        (aiKey()?'<button class="sm ghost" onclick="__aiForgetKey()">Forget</button>':'')+
        (ai.hasKey?'<span class="muted" style="font-size:13px">(or use the server\'s key — leave blank)</span>':'')+'</div></div>';
  }

  window.__aiMode = function(){
    if(ai){ aiScreen(); return; }
    var inRoom = !!(state && state.room && MYID);
    fetch('api/agents').then(function(r){return r.json();}).then(function(d){
      var agents=(d.agents||[]).map(function(a){ return { id:a.id, custom:false, slop:aiClone(a.slop), unslop:aiClone(a.unslop) }; });
      ai = { seed: inRoom? state.room.seed : 'Should AI be allowed in K–12 schools?', face:'slop', drafter:d.drafter,
        agents:agents, _default:aiClone(agents), hasKey:d.hasKey, model:d.model,
        roomCode: inRoom? state.room.code : null,
        running:false, runningName:'', trail:[], finalText:'' };
      aiScreen();
    }).catch(function(){ flash('Could not load agents'); });
  };
  window.__aiHome=function(){ ai=null; render(); };
  window.__aiFace=function(fc){ __aiCapture(); ai.face=fc; aiScreen(); };
  window.__aiReset=function(){ __aiCapture(); ai.agents=aiClone(ai._default); aiScreen(); flash('Lineup reset'); };
  window.__aiSaveEdits=function(){ __aiCapture(); aiScreen(); flash('Edits saved'); };
  window.__aiMoveA=function(i,dir){ __aiCapture(); var j=i+dir; if(j<0||j>=ai.agents.length) return; var t=ai.agents[i]; ai.agents[i]=ai.agents[j]; ai.agents[j]=t; aiScreen(); };
  var aiDragIdx=null;
  window.__aiDragStart=function(e,i){ aiDragIdx=i; if(e.dataTransfer){ e.dataTransfer.effectAllowed='move'; try{ e.dataTransfer.setData('text/plain',String(i)); }catch(_){} } };
  window.__aiDragOver=function(e,el){ e.preventDefault(); if(e.dataTransfer) e.dataTransfer.dropEffect='move'; if(el) el.classList.add('dragover'); };
  window.__aiDrop=function(e,i){ e.preventDefault(); var from=aiDragIdx; aiDragIdx=null; if(from==null||from===i){ aiScreen(); return; } __aiCapture(); var moved=ai.agents.splice(from,1)[0]; ai.agents.splice(i,0,moved); aiScreen(); };
  window.__aiCut=function(i){ __aiCapture(); ai.agents.splice(i,1); aiScreen(); };
  window.__aiAdd=function(){ __aiCapture(); var blank={name:'New Agent',cares:'',refuses:'',skills:[]}; ai.agents.push({id:'ai-'+Math.random().toString(36).slice(2,6),custom:true,slop:aiClone(blank),unslop:aiClone(blank)}); aiScreen(); };
  function __aiCapture(){
    var seed=document.getElementById('ai-seed'); if(seed) ai.seed=seed.value;
    var mdl=document.getElementById('ai-model'); if(mdl) ai.model=mdl.value.trim();
    document.querySelectorAll('[data-ai-i]').forEach(function(el){
      var i=+el.getAttribute('data-ai-i'); var a=ai.agents[i]; if(!a) return; var s=a[ai.face]||(a[ai.face]={});
      var n=el.querySelector('.ai-name'), c=el.querySelector('.ai-cares'), r=el.querySelector('.ai-refuses'), k=el.querySelector('.ai-skills');
      if(n) s.name=n.value; if(c) s.cares=c.value; if(r) s.refuses=r.value;
      if(k) s.skills=k.value.split('\n').map(function(x){return x.trim();}).filter(Boolean);
    });
  }

  function aiScreen(){
    var f=ai.face;
    var head='<div class="row" style="justify-content:space-between"><div><span class="pill red">AI machine</span> <span class="muted" style="font-size:13px">design the agents · run them · tweak · re-run</span></div>'+
      '<button class="sm ghost" onclick="__aiHome()">'+(ai.roomCode?'◀ Back to the game':'◀ Back to home')+'</button></div>';
    var keyWarn = aiKeyRow();
    var controls='<div class="panel col">'+
      '<div class="lbl">Seed</div><input id="ai-seed" value="'+esc(ai.seed)+'">'+
      '<div class="row" style="margin-top:6px;flex-wrap:wrap"><span class="lbl">Machine:</span>'+
        '<button class="sm '+(f==='slop'?'':'ghost')+'" onclick="__aiFace(\'slop\')">Slop side</button>'+
        '<button class="sm '+(f==='unslop'?'':'ghost')+'" onclick="__aiFace(\'unslop\')">Unslop side</button>'+
        '<button class="sm ghost" onclick="__aiReset()">Reset lineup</button></div>'+
      '<div class="lbl" style="margin-top:6px">Model</div><input id="ai-model" value="'+esc(ai.model||'')+'" placeholder="claude-haiku-4-5">'+
      '<div class="muted" style="font-size:12px">The Anthropic model the agents run on. Default is the cheapest (Haiku).</div></div>';
    var fc = f==='unslop'?'unslop':'slop';
    var lineup = ai.agents.map(function(a,i){
      var s=a[f]||{};
      return '<div class="ai-card '+fc+'" data-ai-i="'+i+'" ondragover="__aiDragOver(event,this)" ondragleave="this.classList.remove(\'dragover\')" ondrop="__aiDrop(event,'+i+')">'+
        '<div class="eng"></div><div class="cbody">'+
          '<div class="ctop">'+
            '<span class="drag-handle" draggable="true" ondragstart="__aiDragStart(event,'+i+')" title="drag to reorder">⠿</span>'+
            '<span class="ai-swatch" style="background:'+aiColor(i).s+'" title="this agent\'s colour in the output"></span>'+
            '<span class="faceTag '+fc+'">'+(f==='unslop'?'UNSLOP':'SLOP')+'</span>'+
            '<div class="row" style="gap:2px;margin-left:auto"><button class="sm ghost" onclick="__aiMoveA('+i+',-1)" title="move up">↑</button><button class="sm ghost" onclick="__aiMoveA('+i+',1)" title="move down">↓</button><button class="sm ghost" onclick="__aiCut('+i+')" title="remove">✕</button></div>'+
          '</div>'+
          '<input class="ai-name-edit ai-name" value="'+esc(s.name||'')+'">'+
          '<div class="csec"><span class="lbl">◯ Stance</span>'+
            '<div class="cfield"><em>i care about</em><textarea class="ai-edit ai-cares" rows="2">'+esc(s.cares||'')+'</textarea></div>'+
            '<div class="cfield"><em>i refuse</em><textarea class="ai-edit ai-refuses" rows="2">'+esc(s.refuses||'')+'</textarea></div>'+
          '</div>'+
          '<div class="csec"><span class="lbl">◯ Moves</span> <span class="muted" style="font-size:11px">(one per line)</span><textarea class="ai-edit ai-skills" rows="3">'+esc((s.skills||[]).join('\n'))+'</textarea></div>'+
        '</div></div>';
    }).join('');
    var left='<div class="col">'+controls+
      '<div class="lbl" style="margin-top:6px">The lineup — the draft passes through these in order</div>'+lineup+
      '<div class="row"><button class="sm ghost" onclick="__aiAdd()">+ Add an agent</button><button class="sm ghost" onclick="__aiSaveEdits()">Save edits</button></div>'+
      '<div class="row" style="margin-top:8px"><button class="red" onclick="__aiRun()" '+(ai.running?'disabled':'')+'>'+(ai.running?'Running…':'▶ Run the machine')+'</button></div></div>';
    app.innerHTML = head+keyWarn+'<div class="split" style="margin-top:12px;align-items:start">'+left+'<div class="col">'+aiOutput()+'</div></div>';
  }
  function aiOutput(){
    if(!ai.trail.length && !ai.running) return '<div class="panel muted">Design the machine on the left, then hit <b>Run</b>. Each agent takes the draft, applies its move, and passes it on — you\'ll watch the output build up here, <b>colour-coded by which agent changed what</b>. Then tweak an agent and run again to see what changes.</div>';
    var legend = '<div class="ai-legend">'+ ai.agents.map(function(a,i){ var s=a[ai.face]||{}; return '<span class="item"><span class="sw" style="background:'+aiColor(i).s+'"></span>'+esc(s.name||('Agent '+(i+1)))+'</span>'; }).join('')+'</div>';
    var running = ai.running? '<div class="note act">Running <b>'+esc(ai.runningName||'…')+'</b></div>':'';
    var steps = ai.trail.map(function(st){
      if(st.kind==='draft'){
        return '<div class="sheet" style="margin-bottom:10px"><div class="who lbl">'+esc(st.name)+' · first draft</div><div class="content ai-out" style="font-size:15px;white-space:pre-wrap">'+esc(st.text)+'</div></div>';
      }
      var c=aiColor(st.colorIdx);
      var html = st.diff.map(function(dd){ return dd.added? '<span class="add" style="background:'+c.t+';border-bottom:2px solid '+c.s+'">'+esc(dd.t)+'</span>' : esc(dd.t); }).join('');
      return '<div class="sheet" style="margin-bottom:10px;border-left:3px solid '+c.s+'"><div class="who lbl" style="color:'+c.s+'">'+esc(st.name)+(st.note?' · '+esc(st.note):'')+'</div><div class="content ai-out" style="font-size:15px;white-space:pre-wrap">'+(html||'<span class="muted">(left unchanged)</span>')+'</div></div>';
    }).join('');
    var fin='';
    if(!ai.running && ai.finalTokens){
      var fhtml = ai.finalTokens.map(function(t,k){
        if(/^\s+$/.test(t)) return esc(t);
        var owner=ai.finalAttr[k];
        if(owner==='draft') return esc(t);
        return '<span style="border-bottom:2px solid '+aiColor(owner).s+'">'+esc(t)+'</span>';
      }).join('');
      fin='<div class="panel" style="border:2px solid var(--red);margin-top:6px"><div class="lbl red">Final output — underlined by who contributed each part</div><div class="content ai-out" style="font-size:17px;white-space:pre-wrap;margin-top:6px">'+fhtml+'</div></div>';
    }
    return '<div class="lbl">What the machine produced</div>'+legend+running+steps+fin;
  }
  window.__aiRun = function(){
    __aiCapture();
    if(ai.running) return;
    ai.running=true; ai.trail=[]; ai.finalText=''; ai.finalTokens=null; ai.finalAttr=null; ai.runningName='the first agent'; aiScreen();
    var f=ai.face, d=ai.drafter, df=d[f]||{};
    var notes=[];
    var curTok=[], curAttr=[]; // current draft tokens and who owns each
    aiPost({mode:'draft', seed:ai.seed, face:f, drafter:{name:df.name,cares:df.cares,refuses:df.refuses,skills:df.skills}})
    .then(function(res){
      var draft=res.text;
      curTok=aiTok(draft); curAttr=curTok.map(function(){return 'draft';});
      ai.trail.push({kind:'draft',name:df.name||'First Agent',text:draft}); ai.finalText=draft; aiScreen();
      var i=0;
      function nextAgent(prevDraft){
        if(i>=ai.agents.length){ ai.running=false; ai.runningName=''; ai.finalTokens=curTok; ai.finalAttr=curAttr; aiScreen(); return; }
        var idx=i, s=ai.agents[idx][f]||{}; ai.runningName=s.name||('agent '+(idx+1)); aiScreen();
        aiPost({mode:'revise', seed:ai.seed, face:f, agent:{name:s.name,cares:s.cares,refuses:s.refuses,skills:s.skills}, draft:prevDraft, priorNotes:notes})
        .then(function(r){
          var nd=r.text||prevDraft; if(r.note) notes.push((s.name||'agent')+': '+r.note);
          var nt=aiTok(nd); var diff=aiDiff(curTok,nt);
          var nAttr=diff.map(function(dd){ return dd.added? idx : curAttr[dd.oldIdx]; });
          ai.trail.push({kind:'agent',name:s.name||('Agent '+(idx+1)),note:r.note||'',colorIdx:idx,diff:diff});
          curTok=nt; curAttr=nAttr; ai.finalText=nd; i++; aiScreen();
          nextAgent(nd);
        }).catch(function(e){ ai.running=false; aiScreen(); flash('Run error: '+(e.message||e)); });
      }
      nextAgent(draft);
    }).catch(function(e){ ai.running=false; aiScreen(); flash('Run error: '+(e.message||e)); });
  };
  function aiPost(body){
    var k=aiKey(); if(k) body.apiKey=k;
    if(ai.roomCode) body.room=ai.roomCode;
    if(ai.model) body.model=ai.model;
    return fetch('api/agent-step',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json();}).then(function(d){ if(d.error) throw new Error(d.error); return d; });
  }

  // =====================================================================
  //  ROUTER
  // =====================================================================
  // Never let a render exception silently strand a client on a stale screen: a
  // thrown error here would otherwise leave the old DOM in place with no signal.
  function safeRender(){
    try { render(); }
    catch(e){ if(window.console && console.error) console.error('render failed', e); flash('Display glitch — retrying…'); }
  }
  function render(){
    if(!state){ landing(); return; }
    var ph=state.room.phase;
    if(ph==='lobby') lobby();
    else if(ph==='draft') draftScreen();
    else if(ph==='relay') relayScreen();
    else if(ph==='closing') closingScreen();
    else if(ph==='spotlight') spotlightScreen();
    else if(ph==='architect') architectScreen();
    else if(ph==='debrief') debriefScreen();
    else lobby();
  }

  // ---- boot: try to rejoin an existing session ----
  var savedCode=load('unslop_code'), savedPid=load('unslop_pid');
  if(savedCode && savedPid){ connect(function(){ send({type:'rejoin',code:savedCode,playerId:savedPid}); }); }
  else landing();
})();
