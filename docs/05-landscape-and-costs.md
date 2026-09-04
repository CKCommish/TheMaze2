# Who else is doing this, and what it costs

## Prior art (2022–2026)

| Show | What | What happened | Lesson |
|---|---|---|---|
| **fal.live / "H3 Max Live"** (Sept 1, 2026) | fal's own 24/7 "AI television directed by everyone": viewers type `!prompt` and upvote suggestions; runs on H3 Max Director | Twitch and YouTube removed the streams; fal self-hosts. Reviewers: "pure slop… no plot" | Free prompting produces chaos; own the player |
| **Infinite Slop** (Aug 29, 2026, Pieter Levels) | 15-second H3 Max clips, 4 per minute, each chained from the last | 37k visitors day one, 2,000+ concurrent; NSFW filter leaks; ~$207k/month at list price, fal-sponsored; Levels rejected pay-to-bid as "less fun" | Demand is real; a plotless feed has no retention; costs are the constraint |
| **Mirage News Network** (Aug 11, 2026) | 24-hour AI anchor newscast on X | 50–60k viewers, ~1-minute average watch time, ~$50k in tokens, two on-air factual errors | Novelty without a reason to stay |
| **Fairground AI Creator TV** (Aug 2026) | 24/7 AI channel on Roku, $4M seed | "robotic, uncanny" | Quality bar matters |
| **Fable Showrunner** ("Netflix of AI", July 2025) | user-authored animated episodes; Amazon-backed; "playable film" promised for 2026 | not live, not voted | adjacent, not a competitor |
| **Nothing, Forever** (AI Seinfeld, Dec 2022) | GPT-3 + Unity 24/7 on Twitch | 15,097 peak concurrent; 14-day ban for a generated transphobic bit after a model swap broke moderation; now ~8 viewers | Moderation is one outage away; novelty decays |
| **Unlimited Steam** / AI Family Guy (2023) | AI Simpsons / Family Guy streams | permanently banned (antisemitic line; "bomb threat" line) | Filter the script, not just the chat |
| **Twitch Plays Pokémon** (2014) | crowd controls a game; "Democracy" tallied inputs every ~30 s | 1.16M participants, 121k peak concurrent, 16 days | 30-second tallies work; the crowd likes chaos windows |
| **Netflix Bandersnatch** | interactive film | Netflix removed nearly all interactive titles by 2025 | interactivity alone is not a product |
| **Silent Hill: Ascension** (2023) | paid "Influence Points" to vote on story | "slammed as complete garbage", reviews disabled | Naked vote-buying backfires; frame it as gifting/support |
| **Crowd Control** | viewers pay Bits to trigger effects in a streamer's game, 80/20 split | claims 1.8× revenue lift | paid *effects* monetize well |
| **Neuro-sama** | AI VTuber on Twitch | 162k subs (Twitch's most-subscribed channel), est. ≥$400k/month | an AI show can earn six figures |

## Real-time "world models" vs. stitched clips

Real-time generated worlds (Google Genie 3, Decart Oasis 3 and Lucy, Odyssey-2, Runway GWM, Dynamics Lab Mirage 2) run at 720–768p and 20–24 fps, drift within seconds to minutes, and none appears on a human-preference leaderboard; Genie 3 needs a $200/month tier with 60-second sessions and no API; Oasis 3 is $0.02/s ($72/hour) but "thematic integrity degraded rapidly". The stitched-clip approach with a top model gives 768p–2K at 24 fps with native audio and holds the Elo leaderboards. **Today, stitched clips look materially better; world models win only on latency and price.** The 45-second beat structure is the right compromise for now; a world model could later render "free roam" moments between beats.

## The Death Stranding II bar

DS2 (Decima engine) is native-4K/30 or upscaled-4K/60 with real-time global illumination, volumetric clouds, water and terrain simulation, strand hair and performance-captured faces. What AI video matches in 2026: single-shot landscapes, weather, cinematic lighting and camera moves. What it does not: faces across cuts, hands, fluids, physics that is "locally plausible but globally inconsistent", coherence beyond ~30–90 s. Artificial Analysis (Sept 2026), image-to-video with audio: H3 Max 1,201, Seedance 2.0 1,190, H3 1,186, Gemini Omni Flash 1,179, Wan 3.0 1,175, Veo 3.1 1,086, Kling 3.0 Pro 1,071. Sora 2's API shuts down September 24, 2026. The bible's visual language (vast desolate frames, rain, mist, silhouettes) deliberately plays to what the models do well.

## Cost model

Inputs (fal list, Sept 2026): H3 Max 768p $0.08/s; H3 Max Turbo $0.04/s; H3 2K $0.13/s; LTX-2 Fast 1080p $0.04/s; Kling v3 Pro 1080p with audio $0.168/s; Seedance 2.0 1080p $0.68/s; Nano Banana 2 keyframe $0.08; Kontext $0.04. One beat = 45 s = three 15-second clips + keyframes. 80 beats per hour, 1,920 per day.

| Tier | Video per beat | Keyframes | $/beat | $/hour | $/24 h |
|---|---|---|---|---|---|
| LTX-2 Fast 1080p + 1 Kontext | $1.80 | $0.04 | $1.84 | $147 | $3,533 |
| **H3 Max Turbo 768p + 3 Nano Banana 2** | $1.80 | $0.24 | $2.04 | $163 | $3,917 |
| **H3 Max 768p + 3 Nano Banana 2** (this repo's default) | $3.60 | $0.24 | $3.84 | $307 | $7,373 |
| H3 Max + speculative keyframes for all 3 candidates (`SPECULATION=keyframes`) | $3.60 | $0.40 | $4.00 | $320 | $7,680 |
| H3 Max + speculative first clips for all 3 candidates (`SPECULATION=full`) | $6.00 | $0.40 | $6.40 | $512 | $12,288 |
| H3 2K + 2 Nano Banana 2 | $5.85 | $0.16 | $6.01 | $481 | $11,539 |
| Kling v3 Pro 1080p w/ audio + 3 Nano Banana Pro | $7.56 | $0.45 | $8.01 | $641 | $15,379 |
| Seedance 2.0 1080p + 3 Nano Banana Pro | $30.69 | $0.45 | $31.14 | $2,491 | $59,789 |

Fillers add roughly one clip per location change (a few dollars an hour). The writer (Claude Opus 5, three candidate plans per beat, cached system prompt) is on the order of $0.10–0.15 per beat, about $10 an hour. Delivery for the website is extra (see 04-platforms.md); TikTok delivery is free.

Only H3 Max/Turbo and LTX-Fast-class models are fast enough to keep a live 45-second cadence; premium models (Kling, Seedance, Veo) are for pre-rendered "hero" beats or a nightly showcase.

**What this means:** a scheduled 3-hour nightly show costs about $500 (Turbo) to $920 (H3 Max) a night at list price; 24/7 is $3,900–7,400 a day. fal is sponsoring exactly this kind of show right now (fal.live, Infinite Slop); ask.

## Break-even on TikTok, roughly

You keep ~50% of coin value, and coins cost viewers ~$0.0125. To cover $163/hour (Turbo) you need ~$326/hour of gifts, about 26,000 coins an hour. With 1.5–4% of viewers gifting, that is a room of several thousand concurrent viewers, or a smaller room with whales (the value-weighted vote is designed to invite exactly that: one 1,000-coin Galaxy is a legitimate, visible way to win a beat). Silent Hill: Ascension's failure was charging *fees* to vote with nothing given back; TikTok gifting is already a support ritual, and the vote is the reason to send one.

## Naming and IP

"GTA" is a live US registration (No. 3439237, Take-Two) covering games and motion pictures; Take-Two sent a cease-and-desist over AI-generated GTA-6-style images in 2026. Keep "GTA", "Grand Theft Auto", Rockstar's art style, logos and place names out of the title, tags, thumbnails and prompts. Safe framing: "open-world crime saga", "a live crime epic you steer". A one-off descriptive comparison in press is defensible; brand assets are not.

## Sources

- fal.live: https://www.latent.space/p/ainews-fals-h3-max-live-breaks-the · https://fal.live · Infinite Slop: https://levels.io/i-built-infinite-slop · https://levels.io/37000-watched-infinite-slop
- Mirage News Network: https://captions.ai/blog/mirage-news-network-24-hour-experiment · Fairground: https://tech.yahoo.com/streaming/articles/roku-adds-24-7-ai-162300359.html · Showrunner: https://variety.com/2025/digital/news/netflix-of-ai-amazon-invests-fable-showrunner-launch-1236471989/
- Nothing, Forever: https://techcrunch.com/2023/02/03/nothing-forever-ai-generated-seinfeld-twitch/ · https://en.wikipedia.org/wiki/Nothing,_Forever · Unlimited Steam: https://gizmodo.com/twitch-ai-the-simpsons-unlimited-steam-openai-1850145942
- Twitch Plays Pokémon: https://en.wikipedia.org/wiki/Twitch_Plays_Pok%C3%A9mon · Bandersnatch removal: https://variety.com/2025/tv/news/black-mirror-bandersnatch-removal-netflix-1236392097
- Silent Hill: Ascension: https://www.techradar.com/gaming/silent-hill-ascension-slammed-as-complete-garbage-by-players-as-microtransactions-spark-backlash · Crowd Control: https://crowdcontrol.live/?faq=what-is-the-revenue-split · Neuro-sama: https://www.dexerto.com/twitch/an-ai-powered-vtuber-is-now-the-most-popular-twitch-streamer-in-the-world-3300052/
- World models: https://techcrunch.com/2026/06/10/decarts-new-world-model-can-simulate-hours-of-photorealistic-driving-with-some-caveats/ · https://docs.platform.decart.ai/getting-started/pricing · https://en.wikipedia.org/wiki/Genie_(world_model) · https://odyssey.ml/introducing-odyssey-2 · https://runway.com/research/introducing-gwm-worlds-2
- Leaderboards: https://artificialanalysis.ai/video/leaderboard/image-to-video · https://artificialanalysis.ai/video/leaderboard/text-to-video · DS2 tech: https://gamingbolt.com/death-stranding-2-ps5-graphics-analysis-a-true-current-gen-visual-showcase
- Prices: https://fal.ai/minimax-h3-max · https://fal.ai/models/minimax/h3/image-to-video · https://fal.ai/models/fal-ai/ltx-2/image-to-video/fast · https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video · https://fal.ai/models/bytedance/seedance-2.0/image-to-video · https://fal.ai/models/fal-ai/nano-banana-2
- TikTok gift economics: https://influencerfee.com/blog/tiktok-live-gifting-revenue-guide/ · https://insights.ttsvibes.com/tiktok-live-gift-conversion-rate-by-viewer
- GTA trademark: https://trademarks.justia.com/771/44/gta-77144006.html · https://www.gtaboom.com/the-gta-6-ai-fake-problem-just-got-its-latest-legal-takedown-779e
