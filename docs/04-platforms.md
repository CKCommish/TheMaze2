# Where the show lives: TikTok LIVE first, the website as home

## Summary

| | TikTok LIVE | Own website | Twitch / YouTube / Kick |
|---|---|---|---|
| Audience | huge, free discovery | none until you earn it | medium, gaming-native |
| Vote input | gifts + comments via an **unofficial** connector | your own buttons | official chat APIs |
| Vote UI | must be burned into the video | native buttons, countdown, live bars | burned in + extensions (Twitch) |
| Your cut of $ | ~50% of coin value (less on iOS) | ~97% after Stripe | Bits ≈ $0.01 each to you; YouTube 70%; Kick 95% |
| Policy fit | face-on-camera norms, no weapons/fights on LIVE, AI labels, no off-platform links | only gambling law (no prizes) | AI OK; strikes have all been for offensive generated dialogue |
| Risk | connector can break; rules change Sept 24, 2026 | traffic | 48 h stream cap on Twitch |

**Plan:** TikTok LIVE is the front door (reach, gifting culture). The website is the home (revenue, control, real vote UI, cannot be taken down). Mirror to Twitch/YouTube/Kick with one relay. Post the best beats as clips.

## TikTok LIVE: how it works technically

- **Eligibility.** 18+ to go LIVE or gift (Community Guidelines). LIVE access needs "a certain number of followers" (officially unspecified; consistently reported as 1,000).
- **Streaming from a computer.** TikTok LIVE Studio (Windows/Mac) is the official desktop app; Streamlabs has an official integration; OBS needs an RTMP "LIVE server" key, which not every account gets. Keys are unlocked for established accounts or through a Creator Network (agency), and the key changes each time you log out. No public application form exists.
- **Reading gifts and comments.** TikTok publishes no LIVE API (its developer products are Login, Share, Content Posting, Research, Display, Data Portability, Commercial Content). Every third-party "gift game" uses **tiktok-live-connector**, a reverse-engineered client that talks to TikTok's internal webcast WebSocket; WebSocket signing goes through the Euler Stream sign server (free: 2,500 requests/day and 25 cloud sockets; Business $50/month). Its README: "not a production-ready API… a reverse engineering project". TikTok's Terms prohibit automated extraction and reverse engineering. Read-only use of a public room is low-risk in practice and ubiquitous, but the plumbing can break any week. `src/ingest/tiktok.ts` uses it.
- **Overlays.** No third-party UI inside TikTok's player. Everything (options, gift icons, value bars, countdown, winner) is burned into the video through a Browser Source (`/?tv=1`, portrait when `ASPECT=9:16`). LIVE Studio's own widgets are limited to alerts, chatbox, goals, viewer ranking and countdown.
- **Duration.** No hard cap on stream length, but LIVEs that "lack clear objectives or direct interaction" or show "low quality content" are ineligible for the For You feed.

## TikTok LIVE: money

- Coins cost viewers roughly $0.0105–0.0135; creators receive ~$0.005 per diamond, i.e. about 50% of coin value (about 30–35% of what a fan paid on iOS after Apple's cut). TikTok converts diamonds "at a rate… determined by us in our sole discretion". $10 minimum withdrawal. 1.5–4% of viewers gift; $1.5B was spent on TikTok LIVE gifts in 2024.
- **Gift = vote is tolerated in practice.** TikTok's own LIVE Match lets gifts decide a winner, and gift-driven games are everywhere. What is prohibited: "gambling or gambling-like activities", "mystery value" mechanics, and LIVEs that "trick or pressure people into giving gifts". Keep the vote deterministic (highest value wins, no randomness, no prize) and it is not gambling.
- **No off-platform selling.** QR codes and third-party links are penalized on LIVE, and content directing users to buy off-platform is down-ranked. Do not use the LIVE to sell website credits; let the website be its own funnel.

## TikTok LIVE: rules that shape the story

- AI-generated realistic scenes or people **must be labeled**; unlabeled content may be removed or restricted.
- LIVE Studio guidance: "make sure your face is visible on camera", streaming pre-recorded content "is not recommended", the "no-face effect… may be regarded as a recording". A human host in a corner (reacting, reading the vote) is the practical answer.
- **LIVE sessions may not show or promote firearms or explosives, or physical altercations "even if they aren't graphic"**; graphic fictional violence is 18+ and ineligible for the feed; mature game content is restricted. Hence `CONTENT_MODE=tiktok` in the writer: chases, heists, deals, betrayals and escapes on screen; weapons and fights off screen.
- TikTok Shop LIVEs (commerce only, from July 31, 2026) ban "AI-generated voices" and animated figures covering more than half the screen; the stated target was 24/7 AI-avatar streams. Not our category, but it signals TikTok's direction.
- The Community Guidelines change again on **September 24, 2026**. Re-read before launch.

## Own website

- **Delivery.** Standard HLS lags 25–30 s; LL-HLS about 5 s; WebRTC/WHEP under half a second. With a 45-second cadence LL-HLS is acceptable; WebRTC makes "my vote changed the story" feel immediate. The repo's player currently plays clips directly (fine for a demo and for OBS capture); for scale, push the OBS/ffmpeg output into Cloudflare Stream ($1 per 1,000 minutes delivered, WebRTC GA, ~$60 per 1,000 concurrent viewers per hour), Livepeer (~$30/hour per 1,000), Mux (~$50), AWS IVS ($36–72), or self-host OvenMediaEngine. A 24/7 stream at 1,000 average viewers is roughly $22k–43k a month on Livepeer/Cloudflare; billing follows average, not peak, concurrency.
- **Payments.** Stripe: 2.9% + 30¢ (+1.5% international); sell credit packs of $5+ to amortize the 30¢. Stripe prohibits games of chance and prize sweepstakes; deterministic paid voting with no prize is fine. `src/server/stripe.ts` verifies the webhook and grants credits.
- **Law.** US lottery = prize + chance + consideration; remove prize (and chance) and it is not gambling. If you ever add prizes you need a free entry route, official rules and state registration in FL/NY/RI.

## Twitch / YouTube / Kick

- **Twitch:** official chat via EventSub; Extensions may use Bits "to show support for a desired outcome… through a poll or voting mechanic" but not for wagering or random loot; Bits pay creators ~$0.01 each. 48-hour broadcast cap (auto-reconnect is allowed for 24/7). No AI ban; since August 2026 streams feed Amazon AI training unless opted out. Precedents: Twitch Plays Pokémon (2014, 121k peak concurrent, 1.16M participants) was embraced; "Nothing, Forever" got a 14-day ban for a generated transphobic bit, "Unlimited Steam" and AI Family Guy were banned for generated antisemitic/bomb-threat lines. Every ban was a content-filter failure, not an "AI" rule. `src/ingest/twitch.ts` reads chat anonymously and counts Bits as vote value.
- **YouTube:** live chat API with Super Chat amounts; creators get 70%; the "inauthentic content" policy explicitly covers live streams and excludes templated AI content from monetization; streams over 12 h may not be archived.
- **Kick:** official webhooks for chat, gifts, subs and reward redemptions; 95/5 split; AI content allowed if reality-mimicking content is labeled; no length limit.
- **Multistreaming:** Restream ($19–239/month) or ffmpeg's `tee` muxer on a $10 VPS pushes one encode to several RTMP targets; TikTok still needs its own RTMP key.

## Sources

- TikTok Community Guidelines (LIVE, AI labels, weapons, gambling): https://www.tiktok.com/community-guidelines/en/ · https://www.tiktok.com/community-guidelines/en/sensitive-mature-themes · https://www.tiktok.com/community-guidelines/en/integrity-authenticity · https://www.tiktok.com/community-guidelines/en/regulated-commercial-activities
- LIVE Studio: https://www.tiktok.com/live/studio/help/article/Before-you-go-LIVE/Apply-for-LIVE-access?lang=en · https://www.tiktok.com/live/studio/help/article/Before-you-go-LIVE/Community-Guidelines?lang=en · https://www.tiktok.com/live/studio/help/article/Boost-viewer-engagement/Add-widgets-to-make-your-LIVE-more-engaging?lang=en
- RTMP keys: https://restream.io/learn/platforms/how-to-find-tiktok-stream-key/ · https://www.toktutorials.com/post/how-to-get-a-tiktok-live-stream-key-in-2026-free-and-use-it-in-obs-streamlabs-or-meld-studio
- Developer products (no LIVE API): https://developers.tiktok.com/products/ · Terms: https://www.tiktok.com/legal/page/us/terms-of-service/en
- tiktok-live-connector: https://github.com/zerodytrash/TikTok-Live-Connector · Euler Stream: https://www.eulerstream.com/pricing · gift games: https://livecade.io/ · https://tikfinity.zerody.one/
- Gifts economics: https://www.tiktok.com/legal/page/global/virtual-items/en · https://influencerfee.com/blog/tiktok-live-gifting-revenue-guide/ · https://insights.ttsvibes.com/tiktok-live-gift-conversion-rate-by-viewer · LIVE Match: https://support.tiktok.com/en/live-gifts-wallet/tiktok-live/live-match
- TikTok Shop AI-voice ban: https://www.socialmediatoday.com/news/tiktok-bans-ai-generated-voices-in-shopping-livestreams/822977/ · Aug 2025 guideline changes: https://techcrunch.com/2025/08/15/tiktoks-new-guidelines-add-subtle-changes-for-live-creators-ai-content-and-more/
- Delivery costs: https://developers.cloudflare.com/stream/pricing/ · https://livepeer.studio/pricing · https://www.mux.com/pricing · https://aws.amazon.com/ivs/pricing/ · https://ovenmedia.com/docs/ome
- Stripe: https://stripe.com/pricing · https://stripe.com/legal/restricted-businesses · lottery law: https://kickofflabs.com/blog/usa-giveaway-sweepstakes-laws/
- Twitch: https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/ · https://dev.twitch.tv/docs/extensions/guidelines-and-policies/ · https://en.wikipedia.org/wiki/Twitch_Plays_Pok%C3%A9mon · https://techcrunch.com/2023/02/06/ai-generated-seinfeld-suspended-on-twitch-for-ai-generated-transphobic-jokes/
- YouTube: https://developers.google.com/youtube/v3/live/streaming-live-chat · https://support.google.com/youtube/answer/1311392 · Kick: https://docs.kick.com/events/event-types.md · https://help.kick.com/en/articles/15159722-understanding-kick-s-revenue-split
- Multistream: https://restream.io/pricing · https://ffmpeg.org/ffmpeg-formats.html#tee
