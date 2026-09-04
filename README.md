# The Maze

**A live show that plays like a video game.** A never-ending, AI-generated crime saga where the audience decides what happens next, every 45 seconds, by sending gifts on TikTok LIVE (or spending credits on the website). The option with the highest total gift value wins. Watching is free.

This repository holds the plan, the research, and a working engine:

- **The engine runs the clock.** 45-second beats, three 15-second clips each, a 10-second vote that opens when the second clip starts and decides the fourth, and a "never stop" rule: if a clip is late, a filler shot plays and the real clip cuts in when it lands. Proven by tests that run the whole loop on a fake clock.
- **The writer** (Claude) turns each audience choice into three shots and writes the next three choices, keeping a persistent world (location, heat, cash, allies, open threads).
- **The renderer** (fal.ai "H3 Max", the post-trained MiniMax model you asked about) turns each shot into a 15-second clip with sound and dialogue, from a keyframe painted from the character's locked reference photos so the cast stays consistent.
- **Director mode** (`RENDERER=director`) runs the same show on fal's continuous H3 Max Director stream instead of clips; see [docs/08-director-mode.md](docs/08-director-mode.md).
- **The vote** is gifts only and counts value, not heads: a Rose picks A (GG = B, Ice Cream = C) and every later gift from that viewer adds to their pick. Comments do nothing.
- **The player/overlay** is a web page: viewers use it on the website, and TikTok LIVE Studio or OBS captures it as the stream.

Start with **[docs/00-answers.md](docs/00-answers.md)** for plain-English answers to the questions that started this project, and **[docs/09-go-live-on-tiktok.md](docs/09-go-live-on-tiktok.md)** for the step-by-step TikTok hookup.

## Run the free demo (no API keys)

```bash
npm install
npm run demo
# open http://localhost:8787   (TV overlay for OBS / LIVE Studio: http://localhost:8787/?tv=1)
```

Without keys the show runs on a template writer and "storyboard cards" instead of video, with a simulated render delay, so you can watch the timing, the vote, and the credits work end to end. Every viewer gets 3 starter credits; the "+ Get credits" button is a demo-only top-up.

## Run it for real

1. Copy `.env.example` to `.env` and fill in `FAL_KEY` (video and keyframes) and `ANTHROPIC_API_KEY` (the writer).
2. Lock the cast's look once: `npm run cast` paints an approved identity pack (front, three-quarter, profile, full body) for each character and saves it under `story/cast/` and `story/bible.json`. Never regenerate an approved pack.
3. Optional: `npm run probe` renders one keyframe and one 15-second clip and prints the real timings.
4. `npm run demo` again: now the writer is Claude and the clips are real. For TikTok, set `ASPECT=9:16` and `TIKTOK_USERNAME=<your handle>` so gifts and comments count as votes.

Costs are real: at fal's list price a beat costs about $3.84 (three 15-second clips plus keyframes), roughly $300 an hour. See [docs/05-landscape-and-costs.md](docs/05-landscape-and-costs.md).

## Repository map

| Path | What it is |
|---|---|
| `docs/` | Answers, architecture, research with sources, story bible, costs, roadmap, Director mode |
| `src/core/` | The engine: timing, showrunner loop, votes, credits, story state, pipeline, mock planner/renderers (runs in Node and the browser) |
| `src/planner/` | The Claude writer (structured JSON output) |
| `src/generation/` | fal.ai providers: H3 Max video, Nano Banana 2 keyframes |
| `src/ingest/` | TikTok LIVE gifts/comments and Twitch chat as vote sources |
| `src/server/` | Web server, WebSocket, Stripe webhook for credit purchases |
| `src/broadcast/` | Experimental ffmpeg RTMP playout (OBS is the recommended path) |
| `web/`, `web-src/` | The player, the TV overlay, and the Director session module (bundled by `npm run build:web`) |
| `scripts/` | `make-cast.ts` (lock the cast), `probe.ts` (measure real latency), `build-sim.mjs` (browser simulator) |
| `test/` | Timing, votes, credits, and planner tests (`npm test`) |
| `story/` | `bible.json` overrides (cast references), generated cast images, probe samples |

## Commands

| Command | Does |
|---|---|
| `npm run demo` | Start the show (mock mode without keys) |
| `npm test` | Run the tests |
| `npm run typecheck` | Type-check the code |
| `npm run cast` | Generate the locked identity pack for the cast (costs money) |
| `npm run probe` | Render one keyframe and one clip, print timings (costs money) |
| `npm run sim:build` | Build the single-file browser simulator (`dist/sim.html`) |
