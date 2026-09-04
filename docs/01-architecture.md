# Architecture: how the show never stops

## The one rule

**The clock never waits for the machines.** Every 45 seconds a new beat starts, whether or not its clips are ready. Everything else in the design exists to make "not ready" rare and invisible.

## The beat

A beat is 45 seconds = three 15-second slots. Each slot plays one generated clip.

```
beat N            ┌────── slot 0 ──────┬────── slot 1 ──────┬────── slot 2 ──────┐
                  │ SETUP              │ ACTION             │ TURN → cliffhanger │
                  0s                  15s                  30s                  45s
vote                                   ├─── 10 s ───┤ closes
                                      15s           25s
                                      (30s left)     (20s left)
next beat's render                                    └──── 20 s to land clip 0 of beat N+1 ────┘
```

- **Setup / Action / Turn.** The chosen action is spread across all three shots. The writer is told: shot 1 sets it up, shot 2 is the action, shot 3 is the consequence and ends on a frozen decision moment that works as the lead-in for all three next options.
- **The vote opens the moment clip 2 starts and lasts 10 seconds. It decides clip 4**, the first clip of the next beat, never anything in the current beat. That is what buys the 20-second render window. Both numbers are `VOTE_OPENS_AT_SECONDS` and `VOTE_SECONDS` in `.env`; the engine refuses settings that would leave the winner's clip no time to render (20 s minimum for rendered clips, 3 s in Director mode or with `SPECULATION=full`).
- **No votes → option A wins.** Ties are broken at random.

## Timeline of the machinery

| When (beat N clock) | Machinery |
|---|---|
| N−1 vote closed (−25 s) | Beat N is planned. Immediately, the writer drafts all three candidate beats N+1 (three parallel calls) and, with `SPECULATION=keyframes`, paints the opening keyframe of each candidate's first shot. |
| 0 s | Beat N on air. Its three clips were started at −25 s; shot 0 is due now, shots 1 and 2 at +15 s and +30 s. A filler for the location beat N ends in is pre-rendered in the background. |
| 15 s | Vote opens (clip 2 is on air; clips 1–3 were all created before the beat started). |
| 25 s | Vote closes. Winner's clip 4 starts rendering from its ready keyframe; the two losing candidates are cancelled (fal queue cancel). Clips 5 and 6 start at the same time (from their own keyframes). |
| ~40–45 s | Winner's clip 4 lands (15–20 s on H3 Max; ~8–10 s on Turbo). |
| 45 s | Beat N+1 on air. |

Slack on H3 Max at 20 s per render: clip 4 has ~0–5 s (this is the tight one), clip 5 ~20 s, clip 6 ~35 s. Slack can be bought three ways, all configurable in `.env`:

- `TURBO_FOR_DEADLINE=true` renders only the deadline clip on the ~2× faster Turbo tier (recommended with the 10-second vote).
- `SPECULATION=full` also renders the first clip of all three candidates before the vote closes (zero deadline risk, +2 clips per beat, ~1.7× video cost). It also allows a later vote, e.g. `VOTE_OPENS_AT_SECONDS=30` (after clip 2 has fully played), because nothing has to render after the result.
- Director mode has no render deadline at all, so the vote may close as late as 3 s before the beat ends.
- Shorter clips (`CLIP_SECONDS=10`, beat = 30 s) if you ever want a faster cadence.

## When something is late or fails

- **Late clip:** the slot starts with a **filler** (an establishing shot of the current location, no characters, rendered earlier in the background; in mock mode a title card). The moment the real clip lands, it **cuts in** for the rest of the slot, unless fewer than 3 seconds remain. The audience sees an establishing shot followed by the scene, which is normal film grammar.
- **Failed clip:** each clip gets two attempts (not repeated for content-policy rejections). If both fail, the filler covers the whole slot; the story text still advances.
- **Slow or failed writer:** the Claude planner is wrapped in a 45-second timeout with a template planner as fallback, so a beat is always planned. If the next beat is still unplanned when the current one ends, a filler slot holds the screen and the engine retries every second.
- **Cold start:** the show waits up to 60 seconds for the first clip, then goes on air with a filler regardless.

All of these paths are exercised in `test/timing.test.ts` on a fake clock.

## The character lock (see 02-character-consistency.md)

```
identity pack (2–4 approved photos per character, made once by `npm run cast`)
   → keyframe: Nano Banana 2 edit paints the shot's opening frame FROM the photos (~4–8 s, $0.08)
   → video:    H3 Max image-to-video animates that frame for 15 s (~15–20 s, $1.20 at 768p)
```

Every clip is re-anchored to the canonical photos, so drift does not accumulate. Prompts inject the same locked character block verbatim; the writer is told never to describe faces or clothes itself. Alternative modes: `PIPELINE_MODE=reference-r2v` skips the keyframe and passes the photos straight to H3 Max reference-to-video; `text-only` for testing.

## Voting and money

`src/core/votes.ts` implements two modes:

- **value** (default): a vote carries a value in coins. Gifts add their coin value (unit price × repeat count); website taps spend credits (1 credit = 1 coin by default). Viewers can keep adding. A comment "1/2/3" or "A/B/C" sets where a viewer's later gifts go. The highest total wins.
- **count**: one vote per viewer, each worth 1.

Gift routing on TikTok: the three configured gifts (`TIKTOK_GIFT_A/B/C`) both select and count; any other gift counts toward the sender's current selection; a gift with no selection is revenue but not a vote. Streak gifts count once, when the streak ends.

Credits live in `src/core/credits.ts` (in-memory with a JSON file; swap for a database before launch). Stripe Checkout sessions carrying `metadata.viewerId` and `metadata.credits` are granted by the webhook in `src/server/stripe.ts` after signature verification.

## Going on air (TikTok-first)

```
your Mac/PC ──▶ TikTok LIVE Studio (or OBS)
                  └─ Browser Source: http://localhost:8787/?tv=1   (portrait when ASPECT=9:16)
                  └─ optional camera: you, reacting, in a corner (helps with TikTok's "face on camera" norms)
                  └─ streams to TikTok LIVE
your server ──▶ tiktok-live-connector reads gifts + comments from your room ──▶ votes
```

The TV overlay shows the three options with their gift icons, the live value bars, the countdown and the winner. Website viewers get the same page with tap-to-vote buttons. One ffmpeg `tee` relay (or Restream) can mirror the stream to Twitch/YouTube/Kick, whose official chat APIs feed the same vote engine (`src/ingest/twitch.ts` is included; it reads chat anonymously and counts Bits as value).

`src/broadcast/playout.ts` is an experimental server-side ffmpeg RTMP pusher for a headless setup (no OBS). It has not been run end to end here (no ffmpeg in this environment) and does not show late cut-ins to RTMP viewers; use OBS unless you need headless.

## Code map

| Module | Role |
|---|---|
| `core/config.ts` | The timing constants and the rule check (vote must fall in the 20–30 s-remaining window) |
| `core/showrunner.ts` | The state machine: beats, slots, vote open/close, speculation, cut-ins, fillers |
| `core/pipeline.ts` | Prompts with the character lock, keyframe → video, retries, filler bank |
| `core/votes.ts`, `core/credits.ts` | Value-weighted voting, gifts, credits ledger |
| `core/mock-planner.ts`, `core/mock-providers.ts` | The no-key demo |
| `planner/claude-planner.ts` | The writer (Claude Opus 5, structured JSON, prompt caching, TikTok content mode) |
| `generation/fal.ts` | H3 Max / Turbo / Nano Banana 2 on fal's queue API with cancellation |
| `server/server.ts` | HTTP + WebSocket, snapshot for late joiners, vote endpoints, static player |
| `ingest/tiktok.ts`, `ingest/twitch.ts` | Gifts and chat as votes |
| `web/` | Player and TV overlay (vanilla JS) |
