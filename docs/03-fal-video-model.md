# The video model: "H3 Max by fal"

The model described as "fal's post-trained MiniMax variant, 50× faster, 15 seconds of video in 9 seconds" is **H3 Max by fal** (marketed "MiniMax H3 Max, post-trained by fal"). fal Research post-trained the open-weight MiniMax H3 (Hailuo 3.0, released July 31, 2026) with reinforcement learning on prompt adherence and aesthetics, and co-designed an inference engine on NVIDIA GB200 NVL72. Announced August 26–27, 2026; press release September 1; MiniMax publicly endorsed it.

## Endpoints (note: `minimax/` namespace, no `fal-ai/` prefix)

| Endpoint | Purpose |
|---|---|
| `minimax/h3-max/text-to-video` | text to video |
| `minimax/h3-max/image-to-video` | first frame (+ optional last frame) |
| `minimax/h3-max/reference-to-video` | subject/style/motion/audio references |
| `minimax/h3-max/director` | realtime WebRTC continuous stream ("H3 Max Live"), not a clip API |
| `minimax/h3-max-turbo/text-to-video`, `…/image-to-video` | September 2026 preview distillation, ~2× faster, no reference mode |
| `minimax/h3/image-to-video`, `minimax/h3/reference-to-video` | base H3, up to 2K/4K, slower |

## Input schema (verified against fal's OpenAPI on 2026-09-04)

Shared by text/image/reference and Turbo:

- `prompt` (required): 1–50,000 chars; fal recommends ≤7,000 and time-coded blocks like `[0-2 seconds] …`. Dialogue in double quotes.
- `prompt_expansion_mode` (required): `"balanced"` (~1 s rewrite) or `"quality"` (~30 s). There is no "off".
- `duration`: integer 5–15 (default 5).
- `resolution`: `"480P"` or `"768P"` (uppercase P; default 768P = 1344×768 at 16:9, 24 fps).
- `seed`, `enable_safety_checker` (default true), `sync_mode`.
- Text-to-video only: `aspect_ratio` ∈ 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 (default 16:9).
- Image-to-video only: `image_url`, `end_image_url`. Output aspect follows the image.
- Reference-to-video only: `aspect_ratio` adds `"adaptive"`; `reference_image_urls` (≤9), `reference_video_urls` (≤3, 2–15 s each), `reference_audio_urls` (≤3); prompts refer to "Image 1", "Video 1".

Output: `{ video: { url, content_type, file_name, file_size }, expanded_prompt, timings }`. **Native synchronized audio, dialogue and lip-sync are always generated** and cannot be turned off (no surcharge).

## Speed

- fal's landing page: "a 15-second clip takes around 15 seconds"; "a 5-second video in under 3 seconds"; ~35× the throughput of the official MiniMax endpoint.
- Design Arena: "nearly 50× faster than the base model"; measured arena latencies of 6.4 s (image-to-video) and 4.7 s (text-to-video) for short clips.
- "15 seconds in roughly 9 seconds" comes from press coverage of a fal engineer's August 29 livestream.
- Model-page `timings.inference` examples: ~2.5–2.8 s (H3 Max), ~1.7 s (Turbo).

**Planning number used in this repo: 15–20 s per 15-second clip** including prompt expansion, queue and transfer. Measure with `npm run probe`.

## Price (fal list, per second of output)

| Tier | 480p | 768p | 15 s at 768p |
|---|---|---|---|
| H3 Max text/image/reference | $0.05 | $0.08 | $1.20 |
| H3 Max Turbo | $0.025 | $0.04 | $0.60 |
| Base H3 | $0.05 | $0.06 (2K $0.13, 4K $0.16) | $0.90 |
| Director (live stream) | $0.08/s, 60-second minimum per session | | |

Promo at the time of writing: 75% off ($0.02/s at 768p) through September 7, 2026; assume list after that. Reference-to-video charges extra for reference tokens beyond the first 4,096 ($0.02 per 1K; an image is w×h/1024 tokens). Free tier: 5 generations per rolling 24 h.

## Rankings

Design Arena image-to-video #1 (Elo 1,341); Artificial Analysis image-to-video-with-audio #1 (Elo 1,201 ± 11), ahead of Seedance 2.0 (1,190), H3 (1,186), Gemini Omni Flash (1,179), Wan 3.0 (1,175); Veo 3.1 is 1,086.

## Queue API (what `src/generation/fal.ts` does)

1. `POST https://queue.fal.run/minimax/h3-max/image-to-video` with the JSON input → `{ request_id, status_url, response_url, cancel_url }`.
2. Poll `GET …/requests/{id}/status` until `COMPLETED` (states `IN_QUEUE`, `IN_PROGRESS`, `COMPLETED`).
3. `GET …/requests/{id}` → result JSON. `PUT …/requests/{id}/cancel` to abandon (used for the two losing candidates).
4. Errors: HTTP 422 with `detail[].type === "content_policy_violation"` is non-retryable; the pipeline stops retrying those.

The `@fal-ai/client` package wraps this (`fal.queue.submit/status/result/cancel`, `fal.storage.upload`).

## Content moderation that matters for a crime story

- fal's Acceptable Use Policy prohibits gratuitous violence, gore, torture, incitement, illegal goods, deepfakes and IP violations; it does not address dramatized fiction. fal runs input filtering (OpenAI omni-moderation) and `enable_safety_checker` defaults to true. Blocked prompts return 422 `content_policy_violation`.
- Base-H3 tests on another host: weapons present without injury pass; explicit blood was silently removed; named IP ("Darth Vader") rejected fastest. Practical rule: chases, heists, brandished weapons, threats and fistfights are likely fine; avoid gore, blood, torture wording, real people, brands and franchise names. TikTok LIVE's rules are stricter (no weapons or fights on screen), which is why the writer has `CONTENT_MODE=tiktok`.

## Alternatives on fal for 10–15 s image-to-video

| Model | Durations | Price | Notes |
|---|---|---|---|
| Kling v3 Pro `fal-ai/kling-video/v3/pro/image-to-video` | 3–15 s | $0.112/s ($0.168 with audio) | end frame, `@Element` character binding, 4K variant; much slower |
| LTX-2.3 Fast `fal-ai/ltx-2.3/image-to-video/fast` | 6–20 s | ~$0.04–0.06/s at 1080p | 1080p+, native audio; the cheapest 1080p option |
| Seedance 2.5 `bytedance/seedance-2.5/image-to-video` | 4–30 s | ~$0.22–0.47/s | end frame, joint audio; a 15 s 1080p clip measured 4m56s vs 18 s on H3 Max |
| Hailuo 2.3 Fast `fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video` | 6 or 10 s only | $0.19 / $0.32 per clip | no 15 s |
| Veo 3.1 Fast `fal-ai/veo3.1/fast/image-to-video` | 4/6/8 s only | $0.10–0.15/s | too short for our slots |

At list price H3 Max 768p is cheaper than Kling and Seedance, a bit dearer than LTX-2.3 Fast, and far faster than all of them. Only H3 Max/Turbo and LTX-Fast-class speed keeps a 45-second cadence live.

## Uncertain

- The "9 seconds" figure is a livestream demo, not a spec.
- Promo history is inconsistent across fal's pages (50% vs 75%, dates); assume list from September 8.
- Whether `enable_safety_checker=false` changes anything is undocumented.
- No video-extension endpoint for H3 Max yet.

## Sources

- https://blog.fal.ai/introducing-h3-max-by-fal/ · https://fal.ai/minimax-h3-max · https://fal.ai/learn/tools/how-to-use-minimax-h3-max · https://fal.ai/learn/devs/minimax-h3-vs-minimax-h3-max
- https://www.prnewswire.com/news-releases/fal-launches-h3-max-a-new-post-trained-video-model-with-frontier-quality-and-faster-than-real-time-generation-302866462.html
- Schemas: https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3-max/image-to-video (and text-to-video, reference-to-video, h3-max-turbo/image-to-video)
- Prices: https://fal.ai/models/minimax/h3-max/image-to-video · https://fal.ai/models/minimax/h3-max-turbo/image-to-video · https://fal.ai/models/minimax/h3-max/director
- "15 s in ~9 s" coverage: https://www.kucoin.com/news/flash/ai-video-model-h3-max-generates-content-35x-faster-than-predecessor
- Queue API: https://fal.ai/docs/model-endpoints/queue · https://fal.ai/docs/documentation/model-apis/errors · https://fal.ai/docs/clients/javascript
- Moderation: https://fal.ai/legal/acceptable-use-policy · https://fal.ai/legal/trust-and-safety · https://www.atlascloud.ai/blog/tips/minimax-h3-content-restrictions
- Alternatives: https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video · https://fal.ai/models/fal-ai/ltx-2.3/image-to-video/fast · https://fal.ai/models/bytedance/seedance-2.5/image-to-video · https://fal.ai/models/fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video · https://fal.ai/models/fal-ai/veo3.1/fast/image-to-video
