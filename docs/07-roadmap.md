# Roadmap

## Done (this repo)

- Engine with the 45/15/5 clock, speculation, fillers and cut-ins; proven by tests on a fake clock.
- Value-weighted voting (gifts and credits), TikTok gift routing rules, Twitch chat/Bits adapter.
- Claude writer with structured output, persistent world, TikTok content mode.
- fal providers for H3 Max / Turbo (video) and Nano Banana 2 (keyframes), with cancellation and non-retryable content errors.
- Web player and TV overlay (landscape and portrait), credits, Stripe webhook.
- Research with sources, cost model, story bible.

## Phase 1: first real beat (a day, ~$10)

1. Top up fal. `npm run cast` (locks Rae's look; ~$0.32 per character). Look at `story/cast/`; if you do not like a pack, delete it and run again. Never regenerate an approved pack.
2. `npm run probe`: one keyframe + one 15-second clip; note the real timings and put them in `.env` decisions (`TURBO_FOR_DEADLINE`, `SPECULATION`).
3. Add `ANTHROPIC_API_KEY`, run `npm run demo`, watch three beats. Tune the bible.

## Phase 2: private TikTok LIVE rehearsal (a week, ~$300–900 per 3-hour night)

1. TikTok LIVE Studio on a Mac/PC; Browser Source on `http://localhost:8787/?tv=1` with `ASPECT=9:16`; camera of a host in a corner.
2. `TIKTOK_USERNAME=<handle>` so gifts and comments count. Test with friends: Rose/GG/Ice Cream select, a bigger gift adds, a comment "2" redirects.
3. Label the stream as AI-generated. Watch fillers per hour and content rejections in the log.

## Phase 3: launch (2–4 weeks)

- Move credits to a database; add accounts on the website; Stripe credit packs.
- Text-side moderation on every shot before render; a "kill switch" that swaps to fillers.
- Push the OBS output to Cloudflare Stream/Livepeer for the website; ffmpeg `tee` or Restream to Twitch/YouTube/Kick.
- Fine-tune the H3 character LoRA from approved clips ($30).
- Ask fal for sponsorship / committed-use pricing (they sponsor fal.live and Infinite Slop).

## Open questions for you

- Episode length and schedule (the cost lever).
- How hard to sell the vote: gifts-only (TikTok-native) vs. credits packs on the site vs. free base vote + paid boosts.
- Whether a human host appears on camera (helps with TikTok's norms, and is good TV).
- The show's name and the protagonist (everything in the bible is a placeholder you can rename).
