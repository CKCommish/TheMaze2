# Director mode: running the show on `minimax/h3-max/director`

You asked to use fal's **H3 Max Director** instead of clips. This doc says what it is, what changes, what it costs, what is risky, and how the repo supports it. Everything below about the protocol was read from fal's model page and API docs on Sept 4, 2026; the browser-side session code could not be executed here (the fal account had no balance), so treat it as a first draft to test on a funded account.

## What Director is

Director is fal's "H3 Max Live" mode: **one continuous, realtime video stream you steer with text prompts** over WebRTC. It is what fal.live runs on. The model keeps a memory of recent segments (`memory`: 1–50, default 12) so characters, places and plot threads carry over inside a session. Output is 24 fps in 10-second chunks (5–15 s), audio at 32 kHz. Prompt updates take effect at the next chunk.

| | Clips (`RENDERER=clips`) | Director (`RENDERER=director`) |
|---|---|---|
| What we send | a keyframe painted from the character's approved photos + a 15 s prompt | a text prompt for the next 15 s |
| Character lock | photos every clip (strongest) | text only; no reference images documented for Director |
| Latency risk | the winner's first clip must land within 25 s (fillers cover) | none; the stream never stops by construction |
| Continuity | cut between shots (film grammar) | continuous camera; feels like a game |
| Session limits | none | **2-minute cap** unless fal approves longer; 60 s minimum billing per session |
| Price (fal list) | $0.08/s at 768p (+ $0.08 per keyframe) | $0.08/s at 768p (promo $0.02/s until Sept 14, 2026) |
| Where it renders | fal, downloaded as files | streamed to a browser page on your streaming machine |

## How the repo runs it

- `RENDERER=director` in `.env`. The engine keeps the exact same 45/15/5 clock, writer, votes and overlay. Instead of rendering a clip per shot, each slot carries the shot's prompt (`clip.kind = "director"`); the character block and style bible are in every prompt because text is Director's only anchor.
- **One page holds the stream:** open `http://localhost:8787/?tv=1&director=1&token=<DIRECTOR_TOKEN>` on the machine that runs TikTok LIVE Studio/OBS and capture it as the Browser Source. That page (`web/director.bundle.js`, built by `npm run build:web` from `web-src/director.ts`) opens the WebRTC session through the server's proxy (`/api/fal/proxy`, so the browser never sees your fal key; gated by `DIRECTOR_TOKEN` because every session costs money), sends the `configure` message (preamble + current scene, aspect ratio, resolution, memory), then a `prompt` message every 15 seconds as slots change.
- **The 2-minute cap:** 20 seconds before the cap the page pre-warms a second session with the same preamble and the current scene, and switches to it when its video arrives; if a session dies first, it re-opens immediately. Expect a visible reset at each switch (new session, no visual memory of the old one) until fal grants longer sessions. Ask fal for that now: their page says they are "gradually enabling longer Director sessions for approved use cases".
- Website viewers and TikTok viewers watch the captured stream; other browser tabs show storyboard cards, never a second paid session.

## What Director changes in the design

- **Voting can move closer to the action.** With no render deadline, the vote could close with 10–15 s left instead of 25. The default clock stays as you specified (20–30 s left); change `voteOpensAtMs` in `src/core/config.ts` if you want a tighter loop, the rule check will tell you if it breaks the window.
- **Speculation is off** (nothing to pre-render). The writer still pre-plans all three next beats so the prompt is ready the instant the vote closes.
- **Fillers are prompts too:** an establishing-shot prompt, used only if the writer is late.

## Honest risks

1. **Consistency.** Without reference photos, Rae's face is whatever the model makes of the text each session; inside a session the memory helps, across sessions it does not. fal.live's look ("fever dream mishmash", per Latent Space) is the ceiling today, though our structured prompts and persistent story will do much better than a chat free-for-all. If fal adds reference images to Director (base H3 already has reference-to-video), this gap closes.
2. **Session cap.** 2 minutes means a reset every 2 minutes unless approved.
3. **Alpha software.** `fal.realtime.open()` exists only in fal's alpha client (installed here as the alias `fal-client-alpha`) and is marked experimental.
4. **Minimum billing.** 60 s per session; pre-warming overlaps ~20 s per switch (about +17% at a 2-minute cap).
5. **Untested here.** The proxy and session module follow fal's documented contract but have not been run against a live session.

## Recommendation

Prototype both on a funded account (`RENDERER=clips` vs `RENDERER=director`, same writer, same bible) and watch 20 minutes of each. My expectation: Director wins on feel and simplicity, clips win on character consistency and shot control. A strong middle path: Director for the continuous world, and a clip-rendered, keyframe-locked "hero" close-up spliced in at each cliffhanger. The engine can do that later because both renderers speak the same slot interface.

## Sources

- https://fal.ai/models/minimax/h3-max/director (2-minute cap, "gradually enabling longer sessions", $0.02 promo / $0.08 list, 60 s minimum)
- https://fal.ai/models/minimax/h3-max/director/api (configure/prompt/ping/stop messages, `memory` 1–50, 24 fps, 10 s chunks, 32 kHz audio, proxy guidance)
- fal alpha client types (`@fal-ai/client@alpha`: `fal.realtime.open(wma(endpoint), { receive, onMedia, onState, onError })`, states opening/live/failed/closed)
- fal proxy contract: https://fal.ai/docs/model-endpoints/server-side
