# The (un)Slop Game — online

A synchronous, room-by-code web version of Dr. Rachel Horst's card game (UBC MET · Creative Architecture). A group becomes a human multi-agent machine: everyone joins one room on their own device, manufactures slop from a shared seed, flips to the unslop side and hits the arms-race wall, then — in the final act — becomes the architect and redesigns the machine.

Works the same whether players are together in one room on their phones or scattered remotely. One facilitator runs the acts and the metronome; everyone else joins with a 4-letter code.

## What's in the box

- **`server.js`** — Node + WebSocket server. Holds all room state in memory (ephemeral, no database). Deals cards at random, runs the three-act state machine, the relay/pass logic, the Xerox test, and per-player views.
- **`agents.js`** — your seven double-sided agent cards as structured, editable text.
- **`public/`** — the single-page client (`index.html` + `app.js`) plus your actual card artwork rendered from `agent_cards.pptx` (`public/cards/`) and the fiction-machine engine art (`public/assets/`).
- **`test.js`** — an end-to-end logic test (`npm test`).

## Run it locally (2 minutes)

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:3000`. Click **Create room**, and you're the facilitator. Anyone on the same network can join at `http://<your-computer-ip>:3000` with the code. (For players on other networks, deploy it — see below.)

## Put it online so anyone can join by link

The app is a plain Node server, so any host that runs Node and allows WebSockets works. Two free, no-credit-card-needed options:

This needs a host that runs a real Node process and supports **WebSockets** (that's the live sync). Vercel and Netlify won't work for that — use Render (free), or Railway / Fly.io.

**Render** (easiest — this repo includes a `render.yaml` blueprint)
1. Push this repo to GitHub.
2. On [render.com](https://render.com) → **New → Blueprint** → point at the repo. Render reads `render.yaml` and sets it up (build `npm install`, start `npm start`, free plan). Or use **New → Web Service** and set those commands manually.
3. You get a URL like `https://unslop-game.onrender.com`. Share it; players open it and enter the room code. Render sets `PORT` automatically — the server already reads it.

Notes: the free tier **sleeps after ~15 min idle** and takes 30–60s to wake, so open the link a minute before a session. Rooms live in memory, so a restart clears any in-progress game (fine for one-off workshops).

**Bring-your-own API key (recommended for a public link):** leave `ANTHROPIC_API_KEY` **unset** on the host. The AI machine then asks each visitor to paste their own key (stored only in their browser, forwarded to Anthropic, never stored on the server). Set the env var only for a private, trusted audience — otherwise every stranger's runs bill to your account.

## How to facilitate a session

The screens walk you through it, following your run-of-show:

1. **Lobby** — set the seed (defaults to *"Should AI be allowed in K–12 schools?"*). Everyone browses the full cast while they wait. Cards are dealt **at random** when you start.
2. **Act 1 — Slop.** Everyone drafts (Quick Drafter mode), then you start the relay. Hit **Pass left ▶** as your metronome; each player applies their agent's slop-side move and leaves a note. End the relay and **spotlight** a sheet to read its trail aloud.
3. **Act 2 — Unslop.** Same seed, cards flip to their unslop faces (Slow Drafter mode). Run it again into the arms-race wall.
4. **Act 3 — Architect.** The machine becomes editable: **amend** any agent's stance or skills, **cut** agents from the line, **write a new agent**, or run the **Xerox test** (every station applies one agent's move — watch it calcify). Then run the redesigned relay.
5. **Debrief** — the closing discussion prompts, with every sheet the machine produced.

The timer buttons (13m / 8m / 22m) match your run-of-show segments.

## AI machine mode

There's a solo **AI machine** mode (the link is at the bottom of the landing page). Instead of humans playing the agents, you design the lineup — edit each agent's stance and moves, cut them, add new ones, reorder them, pick the slop or unslop side — set a seed, and hit **Run**. Real LLM agents then execute the machine: a first agent drafts, then each agent in turn applies its move to the draft, and you watch the output build up, with the note each agent leaves. Tweak an agent and run again to see how the architecture changes what comes out. The human game is untouched — this is a separate mode.

To run it for real you need an Anthropic API key. The easiest way: open the AI machine page and **paste your key into the field at the top** — it's stored only in that browser and sent to your own server with each run. Get a key at console.anthropic.com.

Alternatively, set it in the environment before starting the server (useful for a shared deployment so nobody has to paste it):

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

or `export ANTHROPIC_API_KEY=sk-ant-...` once in your Terminal, then `npm start`. Get a key at console.anthropic.com. Each agent is one short model call, so a full run is a handful of cheap calls; costs add up only if you run it many times.

Without a key the mode still works but returns clearly-labelled **simulated** output, so you can preview the interface. The model is set in the AI machine page (a field near the top) and defaults to `claude-haiku-4-5` (the cheapest). You can also set a server-wide default with `AI_MODEL=...`. Model names change over time — if a run returns a "model not found" error, pick a current id from platform.claude.com/docs (e.g. `claude-haiku-4-5`, `claude-sonnet-5`).

## Notes

- **Ephemeral by design.** Rooms live in memory and are cleared ~30 min after everyone leaves — perfect for one-off workshops, nothing to clean up. If you want sessions to survive a server restart, that's a small add (swap the in-memory store for a file or Redis).
- **Reconnects** are handled: if a player refreshes or drops wifi, they rejoin their seat automatically.
- **Table size** — designed for 3–7 per room, like the physical game. One server can host many rooms at once (run several codes for several tables).
- The cards are your real designs: `public/cards/` are pixel renders of `agent_cards.pptx`; the Act 3 editable cards are rebuilt in HTML from `agents.js` so they can be amended live.

## License

Two parts, licensed separately:

- **Code** — [MIT License](LICENSE). Use, adapt, and host it freely.
- **Game content & artwork** — © 2026 Rachel Horst, [CC BY-NC-SA 4.0](LICENSE-CONTENT.md). Share and adapt for non-commercial use with attribution; adaptations stay under the same license.

By Dr. Rachel Horst, UBC MET.
