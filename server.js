// The (un)Slop Game — synchronous online server
// Node + Express + ws. In-memory, ephemeral rooms (perfect for workshops).
// Authoritative game state lives here; clients render per-recipient views.

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { DRAFTER, AGENTS, RELAY_ACTION, RELAY_INPUT, RELAY_OUTPUT } = require('./agents');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// =====================================================================
//  AI MACHINE MODE — design the agents, let real LLM agents run them.
//  Separate from the human game. Needs ANTHROPIC_API_KEY in the env.
//  Without a key it returns clearly-labelled simulated output so the
//  interface still works for previewing the flow.
// =====================================================================
const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';

async function callModel(system, user, maxTokens, providedKey, providedModel) {
  const clean = (typeof providedKey === 'string' && providedKey.trim().startsWith('sk-')) ? providedKey.trim() : '';
  const key = clean || process.env.ANTHROPIC_API_KEY;
  if (!key) return { simulated: true, text: null };
  const model = (typeof providedModel === 'string' && providedModel.trim()) ? providedModel.trim() : AI_MODEL;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: model, max_tokens: maxTokens || 700, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error('Anthropic API ' + res.status + ': ' + t.slice(0, 300)); }
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('').trim();
  return { simulated: false, text };
}

function safeJson(s) {
  if (!s) return {};
  try { return JSON.parse(s); } catch (e) {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return { text: s };
}

function persona(spec) {
  const skills = (spec.skills || []).join(' · ');
  return 'You are ' + (spec.name || 'an agent') + ', one agent in a human-designed writing machine.\n' +
    'You care about: ' + (spec.cares || '') + '\n' +
    'You refuse: ' + (spec.refuses || '') + '\n' +
    (skills ? 'Your moves: ' + skills + '\n' : '') +
    'Stay strictly in character — this stance and these moves are the whole of who you are.';
}

app.get('/api/agents', (req, res) => {
  res.json({ drafter: DRAFTER, agents: AGENTS, hasKey: !!process.env.ANTHROPIC_API_KEY, model: AI_MODEL });
});

// Resolve which key to use: the caller's own key wins; else the room's shared key.
function pickKey(b) {
  if (typeof b.apiKey === 'string' && b.apiKey.trim().startsWith('sk-')) return b.apiKey.trim();
  if (b.room) { const rm = rooms.get(String(b.room).toUpperCase()); if (rm && rm.aiKey) return rm.aiKey; }
  return '';
}

// One step of the machine. mode 'draft' = first agent writes; 'revise' = an agent edits the draft.
app.post('/api/agent-step', async (req, res) => {
  try {
    const b = req.body || {};
    const useKey = pickKey(b);
    const seed = (b.seed || '').slice(0, 500);
    const face = b.face === 'unslop' ? 'unslop' : 'slop';
    if (b.mode === 'draft') {
      const d = b.drafter || {};
      const sys = 'You write in character as one agent in a writing machine. No preamble, no markdown, no meta-commentary. Output ONLY a JSON object of the form {"text": "..."}.';
      const user = persona(d) + '\n\nThe seed (the prompt everyone answers) is:\n"' + seed + '"\n\n' +
        'Write your response to the seed in 2–5 sentences, in your voice. Return JSON: {"text": "your response"}.';
      const r = await callModel(sys, user, 500, useKey, b.model);
      if (r.simulated) return res.json({ text: simDraft(seed, face), simulated: true });
      const p = safeJson(r.text);
      return res.json({ text: (p.text || r.text || '').trim() });
    }
    const agent = b.agent || {};
    const draft = (b.draft || '').slice(0, 6000);
    const priorNotes = Array.isArray(b.priorNotes) ? b.priorNotes.slice(-8) : [];
    const sys = 'You act in character as one agent in a writing machine. You edit the draft as your role dictates — add, change, remove, or leave it if nothing applies. Keep roughly the same length. No preamble, no markdown. Output ONLY JSON of the form {"text": "the full revised draft", "note": "one short line in your voice on what you did"}.';
    const notes = priorNotes.length ? '\n\nNotes earlier agents left:\n' + priorNotes.map((n) => '- ' + n).join('\n') : '';
    const user = persona(agent) + '\n\nThe seed was:\n"' + seed + '"\n\nThe current draft:\n"""\n' + draft + '\n"""' + notes +
      '\n\nApply your move to the draft. Return JSON: {"text": "the full revised draft", "note": "one short line in your voice"}.';
    const r = await callModel(sys, user, 900, useKey, b.model);
    if (r.simulated) return res.json({ text: draft, note: '(simulated — add your API key for real output)', simulated: true });
    const p = safeJson(r.text);
    return res.json({ text: (p.text || draft).trim(), note: (p.note || '').trim() });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
});

function simDraft(seed, face) {
  return (face === 'slop'
    ? 'This is a genuinely important and multifaceted question. There are compelling considerations on all sides, and thoughtful people can disagree. Ultimately, with care and dialogue, a balanced path forward is possible.'
    : 'I keep thinking about one classroom, one Tuesday. I do not know the answer yet. What I can say is that the question changes depending on who is in the room.') +
    ' [simulated — add ANTHROPIC_API_KEY for real output]';
}

// ---------- room store ----------
const rooms = new Map(); // code -> room

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let code;
  do {
    code = Array.from({ length: 4 }, () => alphabet[(Math.random() * alphabet.length) | 0]).join('');
  } while (rooms.has(code));
  return code;
}
function pid() {
  return 'p_' + Math.random().toString(36).slice(2, 10);
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }

function newRoom(code) {
  return {
    code,
    facilitatorId: null,
    seed: 'Should AI be allowed in K–12 schools?',
    phase: 'lobby', // lobby | draft | relay | spotlight | debrief
    act: 1, // 1 slop | 2 unslop | 3 architect
    face: 'slop', // which card face is live
    // mutable, per-room copies so text is editable in-app
    agentData: clone(AGENTS),
    drafter: clone(DRAFTER),
    players: {}, // id -> {id,name,seat,agentId,connected,socket,ready}
    seatOrder: [], // seat index -> playerId
    disabled: {}, // agentId -> true (Act 3)
    custom: [], // custom agents written in Act 3 (also appended to agentData)
    sheets: [], // {id, originSeat, originName, content, history:[{agentName,playerName,note,action}]}
    aiKey: '', // optional shared Anthropic key set by the facilitator for the room
    sheetsAct: null, // which act the live sheets belong to
    sheetsFace: null,
    archive: [], // snapshots of completed acts: {id, act, face, label, sheets}
    holder: [], // sheet index -> holder seat
    relayRound: 0,
    relayTotal: 0,
    lockedAgentId: null, // Xerox test: everyone uses this agent
    xeroxMode: false,
    spotlightSheetId: null,
  };
}

// ---------- agent helpers ----------
function baseRoster(room) {
  return room.agentData.filter((a) => !room.disabled[a.id]);
}
function findAgent(room, id) {
  return room.agentData.find((a) => a.id === id) || null;
}
function cardFace(agent, face) {
  const f = agent[face] || agent.slop || agent.unslop;
  return {
    name: f.name,
    cares: f.cares,
    refuses: f.refuses,
    skills: f.skills || [],
    action: RELAY_ACTION,
    input: RELAY_INPUT,
    output: RELAY_OUTPUT,
    pair: agent.pair,
    agentId: agent.id,
  };
}
function drafterCard(room, face) {
  const f = room.drafter[face] || room.drafter.slop;
  return { title: room.drafter.title, ...f };
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deal agents to seated players at RANDOM.
// Everyone browses the full cast in the lobby; the deal is a surprise.
// Distinct cards first (shuffled); if more players than agents, wrap with a
// fresh shuffle so duplicates are spread, not clustered.
function dealAgents(room) {
  const roster = baseRoster(room);
  if (!roster.length) { room.seatOrder.forEach((id) => { if (room.players[id]) room.players[id].agentId = null; }); return; }
  const bag = [];
  while (bag.length < room.seatOrder.length) bag.push(...shuffle(roster));
  const deal = bag.slice(0, room.seatOrder.length);
  room.seatOrder.forEach((id, i) => {
    const p = room.players[id];
    if (p) p.agentId = deal[i].id;
  });
}

// Give a single (late-joining) player a random open card.
function dealOne(room, playerId) {
  const roster = baseRoster(room);
  if (!roster.length) return;
  const taken = {};
  room.seatOrder.forEach((id) => { const p = room.players[id]; if (p && p.id !== playerId && p.agentId) taken[p.agentId] = (taken[p.agentId] || 0) + 1; });
  const open = roster.filter((a) => !taken[a.id]);
  const pick = (open.length ? shuffle(open) : shuffle(roster))[0];
  if (room.players[playerId]) room.players[playerId].agentId = pick.id;
}

// ---------- lifecycle ----------
function seatPlayer(room, player) {
  player.seat = room.seatOrder.length;
  room.seatOrder.push(player.id);
}

function currentSheetForSeat(room, seat) {
  const idx = room.holder.findIndex((h) => h === seat);
  return idx >= 0 ? room.sheets[idx] : null;
}

// Snapshot the current live sheets into the archive so no act's writing is lost.
function archiveCurrent(room) {
  if (room.sheetsAct == null) return;
  var hasContent = room.sheets.some(function (s) { return (s.content && s.content.trim()) || (s.history && s.history.length); });
  if (!hasContent) return;
  var face = room.sheetsFace || 'slop';
  room.archive.push({
    id: 'ar_' + room.archive.length,
    act: room.sheetsAct,
    face: face,
    label: 'Act ' + room.sheetsAct + ' · ' + (face === 'slop' ? 'Slop' : 'Unslop'),
    sheets: room.sheets.map(function (s) { return { originName: s.originName, content: s.content, history: clone(s.history || []) }; }),
  });
  room.sheetsAct = null; // mark as archived so we don't double-save
}

function beginDraft(room) {
  archiveCurrent(room); // preserve the previous act before resetting
  room.phase = 'draft';
  room.face = room.act === 1 ? 'slop' : 'unslop';
  room.lockedAgentId = null;
  room.xeroxMode = false;
  room.spotlightSheetId = null;
  // fresh sheets, one per seated player, empty until they submit
  room.sheets = room.seatOrder.map((id, seat) => ({
    id: 's_' + seat + '_' + Math.random().toString(36).slice(2, 6),
    originSeat: seat,
    originName: room.players[id] ? room.players[id].name : 'seat ' + (seat + 1),
    content: '',
    submitted: false,
    history: [],
  }));
  room.holder = room.seatOrder.map((_, seat) => seat); // each holds own
  room.relayRound = 0;
  room.sheetsAct = room.act;
  room.sheetsFace = room.face;
  Object.values(room.players).forEach((p) => (p.ready = false));
}

function beginRelay(room, opts = {}) {
  room.phase = 'relay';
  room.xeroxMode = !!opts.lockedAgentId;
  room.lockedAgentId = opts.lockedAgentId || null;
  room.spotlightSheetId = null;
  const n = room.seatOrder.length;
  // pass once so nobody holds their own draft to start
  if (n > 1) room.holder = room.holder.map((seat) => (seat + 1) % n);
  room.relayRound = 1;
  room.relayTotal = Math.max(1, n - 1);
  Object.values(room.players).forEach((p) => (p.ready = false));
}

function tickRelay(room) {
  const n = room.seatOrder.length;
  if (n > 1) room.holder = room.holder.map((seat) => (seat + 1) % n);
  room.relayRound += 1;
  Object.values(room.players).forEach((p) => (p.ready = false));
}

// The closing round: after the relay, everyone writes a closing on the sheet
// in front of them — in the Closer's voice (slop) or the Lingerer's (unslop).
// This is where every ending happens, so the ending agents always land last.
function beginClosing(room) {
  room.phase = 'closing';
  room.spotlightSheetId = null;
  Object.values(room.players).forEach((p) => (p.ready = false));
}

// ---------- per-recipient view ----------
function viewFor(room, playerId) {
  const me = room.players[playerId] || null;
  const isFac = playerId === room.facilitatorId;
  // full roster incl. both faces so clients can render + edit cards
  const roster = baseRoster(room).map((a) => ({
    id: a.id,
    pair: a.pair,
    custom: !!a.custom,
    author: a.author || '',
    hasImage: !a.custom, // built-ins have a rendered PNG reference view
    slop: a.slop,
    unslop: a.unslop,
  }));
  const drafter = { title: room.drafter.title, slop: room.drafter.slop, unslop: room.drafter.unslop };

  const players = room.seatOrder.map((id, seat) => {
    const p = room.players[id];
    return { id, seat, name: p ? p.name : '—', connected: p ? p.connected : false, ready: p ? p.ready : false, agentId: p ? p.agentId : null };
  });

  // my live card
  let myCard = null;
  if (me && room.phase !== 'lobby') {
    if (room.phase === 'draft') {
      myCard = { kind: 'drafter', ...drafterCard(room, room.face) };
    } else if (room.phase === 'closing') {
      const ag = findAgent(room, 'ending'); // Closer (slop) / Lingerer (unslop)
      if (ag) myCard = { kind: 'agent', ...cardFace(ag, room.face) };
    } else {
      const agId = room.lockedAgentId || (me.agentId);
      const ag = findAgent(room, agId);
      if (ag) myCard = { kind: 'agent', ...cardFace(ag, room.face) };
    }
  }

  // my current sheet (draft: my own; relay/closing: the one I hold)
  let mySheet = null;
  if (me && (room.phase === 'draft' || room.phase === 'relay' || room.phase === 'closing')) {
    const s = room.phase === 'draft'
      ? room.sheets[me.seat]
      : currentSheetForSeat(room, me.seat);
    if (s) mySheet = { id: s.id, originName: s.originName, content: s.content, submitted: s.submitted, history: s.history, mine: s.originSeat === me.seat };
  }

  // sheets visible to everyone (facilitator always; spotlight to all; debrief all)
  let allSheets = null;
  if (isFac || room.phase === 'spotlight' || room.phase === 'debrief') {
    allSheets = room.sheets.map((s) => ({ id: s.id, originName: s.originName, content: s.content, history: s.history, submitted: s.submitted }));
  }
  const spotlight = room.spotlightSheetId
    ? room.sheets.find((s) => s.id === room.spotlightSheetId) || null
    : null;

  // archive of completed acts (+ the live act appended so review shows everything)
  let archive = null;
  if (isFac || room.phase === 'debrief') {
    archive = room.archive.map((a) => ({ id: a.id, act: a.act, face: a.face, label: a.label, sheets: a.sheets }));
    const liveHasContent = room.sheetsAct != null && room.sheets.some((s) => (s.content && s.content.trim()) || (s.history && s.history.length));
    if (liveHasContent) {
      archive.push({
        id: 'live', act: room.sheetsAct, face: room.sheetsFace,
        label: 'Act ' + room.sheetsAct + ' · ' + (room.sheetsFace === 'slop' ? 'Slop' : 'Unslop') + ' (current)',
        sheets: room.sheets.map((s) => ({ originName: s.originName, content: s.content, history: s.history })),
      });
    }
  }

  return {
    type: 'state',
    youId: playerId,
    isFacilitator: isFac,
    room: {
      code: room.code,
      seed: room.seed,
      phase: room.phase,
      act: room.act,
      face: room.face,
      xeroxMode: room.xeroxMode,
      lockedAgentId: room.lockedAgentId,
      relayRound: room.relayRound,
      relayTotal: room.relayTotal,
      players,
      roster,
      drafter,
      aiKeySet: !!room.aiKey,
      disabled: room.disabled,
      hasCustom: room.custom.length,
    },
    myCard,
    mySheet,
    allSheets,
    archive,
    spotlight: spotlight ? { id: spotlight.id, originName: spotlight.originName, content: spotlight.content, history: spotlight.history } : null,
  };
}

function broadcast(room) {
  for (const p of Object.values(room.players)) {
    if (p.connected && p.socket && p.socket.readyState === 1) {
      try { p.socket.send(JSON.stringify(viewFor(room, p.id))); } catch (e) {}
    }
  }
}

function send(sock, obj) {
  try { sock.send(JSON.stringify(obj)); } catch (e) {}
}

// ---------- message handling ----------
wss.on('connection', (socket) => {
  socket.meta = { roomCode: null, playerId: null };
  // Heartbeat: a half-open ("zombie") socket never fires 'close', so the player
  // stays marked connected and silently misses every broadcast — including phase
  // transitions. Ping periodically; terminate any socket that missed the last pong,
  // which fires 'close' and lets the client reconnect + rejoin into the current phase.
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });

  socket.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const t = msg.type;

    // ---- create / join ----
    if (t === 'create') {
      const code = makeCode();
      const room = newRoom(code);
      const id = pid();
      const player = { id, name: (msg.name || 'Facilitator').slice(0, 40), seat: -1, agentId: null, connected: true, socket, ready: false };
      room.players[id] = player;
      room.facilitatorId = id;
      seatPlayer(room, player);
      rooms.set(code, room);
      socket.meta = { roomCode: code, playerId: id };
      send(socket, { type: 'joined', code, playerId: id, isFacilitator: true });
      broadcast(room);
      return;
    }

    if (t === 'join') {
      const code = (msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return send(socket, { type: 'error', message: 'No room with that code.' });
      const id = pid();
      const player = { id, name: (msg.name || 'Player').slice(0, 40), seat: -1, agentId: null, connected: true, socket, ready: false };
      room.players[id] = player;
      seatPlayer(room, player);
      if (room.phase !== 'lobby') dealOne(room, id); // late joiner gets a random open card
      socket.meta = { roomCode: code, playerId: id };
      send(socket, { type: 'joined', code, playerId: id, isFacilitator: false });
      broadcast(room);
      return;
    }

    if (t === 'rejoin') {
      const code = (msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room || !room.players[msg.playerId]) return send(socket, { type: 'error', message: 'Session expired — join fresh.' });
      const player = room.players[msg.playerId];
      player.connected = true;
      player.socket = socket;
      socket.meta = { roomCode: code, playerId: msg.playerId };
      send(socket, { type: 'joined', code, playerId: msg.playerId, isFacilitator: msg.playerId === room.facilitatorId });
      broadcast(room);
      return;
    }

    // ---- everything below needs a room + player ----
    const { roomCode, playerId } = socket.meta;
    const room = rooms.get(roomCode);
    if (!room || !room.players[playerId]) return;
    const isFac = playerId === room.facilitatorId;

    if (t === 'setName') {
      room.players[playerId].name = (msg.name || '').slice(0, 40) || room.players[playerId].name;
      broadcast(room); return;
    }

    // ---- facilitator controls ----
    if (isFac) {
      if (t === 'setSeed') { room.seed = (msg.seed || '').slice(0, 300) || room.seed; broadcast(room); return; }
      if (t === 'setAiKey') { const k = (msg.key || '').trim(); room.aiKey = k.startsWith('sk-') ? k : ''; broadcast(room); return; }
      if (t === 'setAct') { room.act = Math.min(3, Math.max(1, msg.act | 0)); broadcast(room); return; }
      if (t === 'beginArchitect') { room.act = 3; if (room.seatOrder.some((id) => room.players[id] && !room.players[id].agentId)) dealAgents(room); room.phase = 'architect'; room.face = 'unslop'; broadcast(room); return; }
      if (t === 'deal') { dealAgents(room); broadcast(room); return; }
      if (t === 'startDraft') { dealAgents(room); beginDraft(room); broadcast(room); return; }
      if (t === 'startRelay') { beginRelay(room); broadcast(room); return; }
      if (t === 'tick') { tickRelay(room); broadcast(room); return; }
      if (t === 'startClosing') { beginClosing(room); broadcast(room); return; }
      if (t === 'spotlight') { room.phase = 'spotlight'; room.spotlightSheetId = msg.sheetId || (room.sheets[0] && room.sheets[0].id); broadcast(room); return; }
      if (t === 'resumeRelay') { if (room.sheets.length) { room.phase = 'relay'; broadcast(room); } return; }
      if (t === 'debrief') { archiveCurrent(room); room.phase = 'debrief'; broadcast(room); return; }

      // ---- ARCHITECT (Act 3 only): the machine becomes editable ----
      const architect = room.act === 3;
      if (t === 'toggleAgent') { if (architect) { room.disabled[msg.agentId] = !room.disabled[msg.agentId]; broadcast(room); } return; }
      if (t === 'reassign') {
        if (architect) { const p = room.players[msg.playerId]; if (p) p.agentId = msg.agentId; broadcast(room); }
        return;
      }
      if (t === 'xerox') {
        if (!architect) return;
        // Xerox test: run a relay where EVERY station applies one agent's move.
        if (!room.sheets.length) beginDraft(room); // safety
        beginRelay(room, { lockedAgentId: msg.agentId });
        broadcast(room); return;
      }
    }

    // ---- ARCHITECT, open to EVERYONE (Act 3): each player redesigns ----
    if (room.act === 3) {
      if (t === 'editAgent') {
        const ag = findAgent(room, msg.agentId);
        if (ag) {
          const face = msg.face === 'unslop' ? 'unslop' : 'slop';
          const f = ag[face] || (ag[face] = {});
          if (typeof msg.name === 'string') f.name = msg.name.slice(0, 60);
          if (typeof msg.cares === 'string') f.cares = msg.cares.slice(0, 400);
          if (typeof msg.refuses === 'string') f.refuses = msg.refuses.slice(0, 400);
          if (typeof msg.skills === 'string') f.skills = msg.skills.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5);
          broadcast(room);
        }
        return;
      }
      if (t === 'addAgent') {
        const a = msg.agent || {};
        const id = 'custom-' + Math.random().toString(36).slice(2, 7);
        const face = {
          name: (a.name || 'New Agent').slice(0, 60),
          cares: (a.cares || '').slice(0, 400),
          refuses: (a.refuses || '').slice(0, 400),
          skills: (a.skills || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5),
        };
        const agent = { id, pair: 'New', custom: true, author: room.players[playerId].name, slop: face, unslop: clone(face) };
        room.custom.push(agent);
        room.agentData.push(agent);
        // the author adopts the agent they just wrote
        if (msg.adopt !== false) room.players[playerId].agentId = id;
        broadcast(room); return;
      }
      if (t === 'pickAgent') {
        const ag = findAgent(room, msg.agentId);
        if (ag && !room.disabled[ag.id]) { room.players[playerId].agentId = ag.id; broadcast(room); }
        return;
      }
    }

    // ---- player actions ----
    if (t === 'submitDraft') {
      const p = room.players[playerId];
      const s = room.sheets[p.seat];
      if (s && room.phase === 'draft') {
        s.content = (msg.content || '').slice(0, 4000);
        s.submitted = true;
        p.ready = true;
      }
      broadcast(room); return;
    }

    if (t === 'submitClosing') {
      const p = room.players[playerId];
      if (room.phase !== 'closing') return;
      const s = currentSheetForSeat(room, p.seat);
      if (!s) return;
      const endName = room.face === 'slop' ? 'The Closer' : 'The Lingerer';
      if (typeof msg.content === 'string') s.content = msg.content.slice(0, 4000);
      s.history.push({ agentName: endName, playerName: p.name, action: 'closing', note: (msg.note || '').slice(0, 500) });
      p.ready = true;
      broadcast(room); return;
    }

    if (t === 'submitMove') {
      const p = room.players[playerId];
      if (room.phase !== 'relay') return;
      const s = currentSheetForSeat(room, p.seat);
      if (!s) return;
      const agId = room.lockedAgentId || p.agentId;
      const ag = findAgent(room, agId);
      const agentName = ag ? (ag[room.face] || ag.slop).name : 'Agent';
      // No more add/remove/change/pass — you just edit the sheet (or don't) and note why.
      const before = s.content;
      if (typeof msg.content === 'string') s.content = msg.content.slice(0, 4000);
      const action = s.content !== before ? 'revised' : 'left as is';
      s.history.push({
        agentName,
        playerName: p.name,
        action,
        note: (msg.note || '').slice(0, 500),
      });
      p.ready = true;
      broadcast(room); return;
    }
  });

  socket.on('close', () => {
    const { roomCode, playerId } = socket.meta;
    const room = rooms.get(roomCode);
    if (room && room.players[playerId]) {
      room.players[playerId].connected = false;
      room.players[playerId].socket = null;
      broadcast(room);
    }
  });
});

// ping every 30s; drop sockets that didn't pong since the last round
const heartbeat = setInterval(() => {
  wss.clients.forEach((socket) => {
    if (socket.isAlive === false) return socket.terminate();
    socket.isAlive = false;
    try { socket.ping(); } catch (e) {}
  });
}, 30 * 1000);
wss.on('close', () => clearInterval(heartbeat));

// prune empty rooms every 10 min
setInterval(() => {
  for (const [code, room] of rooms) {
    const anyConnected = Object.values(room.players).some((p) => p.connected);
    if (!anyConnected) {
      room._emptySince = room._emptySince || Date.now();
      if (Date.now() - room._emptySince > 30 * 60 * 1000) rooms.delete(code);
    } else {
      room._emptySince = null;
    }
  }
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`(un)Slop Game running on http://localhost:${PORT}`));
