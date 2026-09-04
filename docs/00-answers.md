# Answers, in plain English

You asked seven things. Here they are, with what I found and what I recommend. Sources for every number are in the research docs (02–05).

## 1. Can the main character stay consistent? Yes, mostly.

**Verdict: yes, to the standard of "clearly the same person in roughly 75–85% of clips", not "frame-perfect same actor".** Two things changed this year that make it workable live:

- **The video model now takes reference photos.** MiniMax H3 (July 31, 2026) replaced the old single-face "subject reference" with a mode that accepts up to 9 reference images. fal exposes it as `minimax/h3-max/reference-to-video`. Repeat the same 2–4 approved photos of the character in every call and the model holds the face and outfit.
- **Keyframe-first re-anchoring.** Instead of chaining clip after clip (where errors pile up and the face melts by clip five), the engine paints the opening frame of every shot from the approved photos with an image model (Google's Nano Banana 2 on fal, which keeps identity from reference photos and costs about $0.08 an image), then animates that frame. Every clip is re-anchored to the canonical face, so drift does not accumulate over hours.

What still breaks: small faces in wide shots, side profiles, wardrobe details (accessories vanish first), hands, and lighting changes that shift apparent age. Practitioners budget 15–25% regenerations; we cannot regenerate live, so we accept the occasional off clip and keep the camera close in "hero" shots. After the first few hundred approved clips, fal offers a $30 fine-tune (`minimax/h3/ref2va/trainer`) that hardens the character further.

The repo does this: `npm run cast` creates and locks the identity pack; the pipeline paints a keyframe per shot from it. See [02-character-consistency.md](02-character-consistency.md).

## 2. The fal model you meant is "H3 Max by fal"

fal post-trained MiniMax's open-weight H3 (Hailuo 3.0) and built a custom inference engine for it. Announced August 26–27, 2026; MiniMax endorsed it. Facts that matter for the show:

| | |
|---|---|
| Clip length | any whole number of seconds from 5 to 15 |
| Resolution | 768p max (1344×768). No 1080p on H3 Max; the base H3 does 2K/4K but slower and pricier |
| Sound | native audio, dialogue and lip-sync are always generated (a big plus for us) |
| Speed | fal's own page: a 15-second clip in about 15 seconds. The "15 seconds in 9" figure came from a fal engineer's livestream; arena tests measured ~5–6 seconds for short clips. Plan on 15–20 seconds per 15-second clip including upload and queue |
| Price | list $0.08 per second at 768p ($1.20 per 15-second clip); 480p $0.05/s. A 75%-off promo ends Sept 7. "Turbo" preview tier: ~2× faster, $0.04/s |
| Modes | text-to-video, image-to-video (first frame, optional last frame), reference-to-video (up to 9 images) |
| Content | fal's filter blocks gore, torture, real people and brands; weapons, chases, threats and fistfights pass |

Endpoint IDs and the exact request schema (verified against fal's API on Sept 4, 2026) are in [03-fal-video-model.md](03-fal-video-model.md) and coded in `src/generation/fal.ts`.

**I could not run it yet.** Your key authenticated, but fal reported an exhausted balance ("User is locked. Top up at fal.ai/dashboard/billing"), so nothing was rendered and no money was spent. Top up, then run `npm run cast` and `npm run probe`. Also: rotate that key when you can, since it was pasted into chat.

## 3. How the 45-second vote fits 15-second clips

One beat is 45 seconds, made of three shots of 15 seconds: **setup → action → turn**. The audience's choice is written across all three (shot 1 sets it up, shot 2 is the action, shot 3 is the consequence). Shot 3 always ends on a frozen "decision moment" that works as the lead-in for all three next options, so nothing has to be rendered before the vote result is known.

The clock, every beat:

| Time | What happens |
|---|---|
| 0:00 | Beat N starts. The writer is already drafting all three possible next beats and painting their opening keyframes. |
| 0:15 | Vote opens (30 s left), the moment clip 2 starts playing. Clips 1–3 were created before the beat began. |
| 0:25 | Vote closes after 10 seconds (20 s left). The winner's clip 4 starts rendering; the two losers are cancelled. |
| ~0:40–0:45 | Clip 4 lands (15–20 s render; ~8–10 s on the Turbo tier, which I recommend for this one clip). |
| 0:45 | Beat N+1 starts with clip 4. Clips 5 and 6 have 20–35 s of slack. |

Both numbers are settings (`VOTE_OPENS_AT_SECONDS`, `VOTE_SECONDS`). If you want the vote after clip 2 has fully played (opening at 30 s), the winner's clip must already be rendered when the vote closes: turn on `SPECULATION=full` (all three candidate clips are rendered during the vote, about 1.7× the video cost) or use Director mode. If a clip is late, an establishing shot of the current location (pre-rendered in the background) plays and the real clip cuts in the moment it lands. If it never lands, the filler covers the slot and the story text still advances. If nobody votes, option A wins. The tests in `test/timing.test.ts` prove all of this on a fake clock, including the "every render fails" case, where the show keeps its 45-second cadence on fillers alone.

## 4. Free to watch, gifts are votes, value wins

Implemented exactly as you described it in your second message:

- Every option is assigned a cheap TikTok gift (default: 🌹 Rose = A, GG = B, 🍦 Ice Cream Cone = C). Sending it picks the option **and** counts its coin value. **Gifts are the only vote; comments do nothing.**
- Any gift a viewer sends after picking adds to their option. A big gift sent before picking waits and lands the moment that viewer sends a Rose, GG or Ice Cream.
- **The option with the highest total coin value wins**, not the most voters. A 500-coin Galaxy beats three hundred Roses.
- Tap-combo (streak) gifts are counted once, when the streak ends, at their full total.
- On the website, credits are the same unit: each tap spends credits on an option and viewers can tap again to add weight. Credits come from Stripe checkout (webhook included).

## 5. TikTok first: doable, with three real caveats

You now want TikTok first, and it is the right call for reach: 1.5–4% of TikTok LIVE viewers gift, and TikTok gift-driven "interactive games" (Livecade, TikFinity and the like) already condition audiences to send gifts to influence a stream. The engine, overlay and gift-to-vote adapter are built for it (portrait 9:16, `TIKTOK_USERNAME` in `.env`). The caveats, so you go in with eyes open:

1. **There is no official TikTok LIVE API.** Reading gifts and comments uses a reverse-engineered library (tiktok-live-connector, the same one every third-party gift game uses). It works today, it can break any week, and TikTok's terms prohibit it on paper. Treat it as fragile plumbing, not a foundation, and keep the website as the fallback vote surface.
2. **TikTok LIVE's rules bite a crime story.** LIVE content may not show firearms or explosives, or physical fights even non-graphic ones; AI-realistic content must be labeled; LIVE Studio guidance wants a face on camera and discourages "pre-recorded"-looking streams; QR codes and off-platform links are penalized. The writer therefore has a `CONTENT_MODE=tiktok` rule set: chases, heists, deals, betrayals and escapes are in; guns and fights stay off screen. A human host reacting on camera in a corner of the stream helps with the "authenticity" rules and is good showmanship anyway. TikTok's guidelines update again on Sept 24, 2026; re-check before launch.
3. **TikTok keeps about half.** Viewers pay roughly $0.0105–0.0135 per coin; creators receive about $0.005 per diamond, i.e. ~50% of the coin value (less after Apple's cut on iOS). Nothing about "gift = vote" is prohibited (TikTok's own LIVE Match lets gifts decide a winner), but never add a prize or a random element, which turns it into a gambling-like mechanic that is banned.

Getting on air: you need a TikTok account 18+ with LIVE access (typically 1,000+ followers), and either TikTok LIVE Studio (Windows/Mac) or an RTMP stream key (unlocked for established accounts or via a Creator Network/agency). The show's TV overlay page (`/?tv=1`) is captured as a Browser Source. Details and every source: [04-platforms.md](04-platforms.md).

**My recommendation:** TikTok LIVE as the front door, your own website as the home. The site keeps 97% of revenue, has a real vote UI, and cannot be taken down by a rule change. Mirror the same stream to Twitch/YouTube/Kick, which have official chat APIs, and post the best 45-second beats as TikTok clips for discovery.

## 6. Is "GTA-style" the right story? Yes, framed carefully

An open-world crime saga is the most mass-appeal frame: everyone understands "one night, one city, one bad decision after another", it generates natural three-way choices (careful / bold / wild), and it suits what the video model does best (rain, neon, harbors, freeways, vast skylines, which is exactly the Death Stranding look you want). Two adjustments:

- **Do not call it GTA.** Take-Two holds a live "GTA" trademark that covers motion pictures, and sent a cease-and-desist over AI-generated GTA-style images this year. Say "open-world crime saga" or "a live crime epic you steer". Never put "GTA", "Grand Theft Auto" or Rockstar's art style in the title, tags or prompts.
- **Tension over violence.** For TikTok LIVE the story runs on heists, chases, deals and betrayals with violence off screen. That also plays better with fal's content filter and makes the show advertiser-safe.

The working bible (city of Port Marrow, courier Rae Solano, the stolen bag, Detective Vasquez, the fixer Kessler) is in [06-story-bible.md](06-story-bible.md). Change any of it in `story/bible.json` and `src/core/bible.ts`.

## 6b. You then asked for `minimax/h3-max/director`

Director is fal's continuous, realtime stream (the fal.live engine): one WebRTC session you steer with prompts, no clip deadlines, and a true "the world keeps going" feel. The repo now supports it as `RENDERER=director`: the same clock, writer, votes and overlay, with each shot sent as a prompt instead of rendered as a clip. Three things to know before choosing it: sessions are capped at 2 minutes unless fal approves longer (the page re-opens sessions before the cap, with a visible reset), there are no reference photos in Director yet so the character lock is text-only, and it uses fal's alpha client, which I could not run here. Price is the same $0.08/s at 768p. Full comparison and my recommendation to prototype both: [08-director-mode.md](08-director-mode.md).

## 7. What I think overall

Two shows launched in the last week with this exact model: fal's own **fal.live** (Sept 1) and Pieter Levels' **Infinite Slop** (Aug 29; 37,000 visitors day one, 2,000+ concurrent). Both are plotless, characterless, and reviewers called them "pure slop". They prove demand and they show the gap: **nobody has combined this model with a persistent story, a locked cast and a structured vote.** That is your product.

Three things decide whether it works:

1. **Cost discipline.** At list price the show burns about $300 an hour on H3 Max (about $160 on the Turbo tier, about $150 on LTX-2 Fast). Running 24/7 is $3,500–7,400 a day. Levels' 24/7 stream would cost ~$207,000 a month and fal is sponsoring it. Start with scheduled episodes (2–3 hours a night, ~$500–900), then extend hours as gifts cover the burn. Also ask fal for a sponsorship or committed-use price; they are actively sponsoring exactly this kind of show.
2. **Quality bar.** "As good as Death Stranding II" is achievable in single shots (landscapes, weather, lighting) and not yet achievable in continuity (faces across cuts, hands, physics). The visual language in the bible plays to the strengths: wide desolate frames, rain, silhouettes, short dialogue, hero close-ups only when needed.
3. **Moderation.** Every AI stream that got banned (AI Seinfeld, AI Simpsons, AI Family Guy) was banned for what the generated script said, not for being AI. The writer has content rules baked in, and the plan includes a text-side check on every shot before it renders.

Next step from here: top up fal, run `npm run cast` to lock Rae's look, run `npm run probe` for real timings, and watch one real beat.
