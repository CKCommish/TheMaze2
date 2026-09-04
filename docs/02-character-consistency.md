# Character consistency: what is possible in September 2026

**Short answer:** yes, to a "recognizably the same person in ~75–85% of clips" standard, not to a "frame-perfect same actor" standard. Budget for the occasional off clip; use automated face-similarity checks once you can afford to regenerate.

## What changed this year

- **MiniMax H3 (Hailuo 3.0, July 31, 2026)** replaced the old single-face "S2V-01 subject reference" with reference-to-video: up to 9 images, 3 videos and 3 audio clips per generation. MiniMax's own guidance: reuse the same 2–4 images across generations for consistency. fal exposes it as `minimax/h3/reference-to-video` and `minimax/h3-max/reference-to-video` (H3 Max: 768p, $0.08/s, 5–15 s). First+last frame control is `image_url` + `end_image_url` on image-to-video.
- **Image models that keep identity from photos** got good and cheap: Nano Banana 2 (`fal-ai/nano-banana-2/edit`, $0.08 at 1K, up to 14 reference images, "maintains resemblance for up to 5 people"), Nano Banana Pro edit ($0.15), Seedream 5.0 Pro edit ($0.0675), FLUX.1 Kontext Pro ($0.04).
- **Character fine-tunes for video** exist on fal: `minimax/h3/ref2va/trainer` ($0.015/step, ~$30 for the default 2,000 steps, needs ≥10 clips of ≥3 s; 50–200 clips optimal, 1.5–2.5 h). Practitioners report a trained identity holds "across clips of any length" where reference-only "holds 2–3 s then drifts" (Wan 2.2 data point).

## The pipeline this repo implements

1. **Identity pack, once per character** (`npm run cast`). Front, three-quarter, profile and full-body images, neutral expression, flat even light, plain background, one fixed outfit, no props. The front view is generated from the locked text description; the other three are edited from the front view so they are the same person. Approve them, then never regenerate them. Stored in `story/cast/` and referenced from `story/bible.json`.
2. **A locked character block** (`src/core/bible.ts`): age, face landmarks (Rae's eyebrow scar, thumb ring), hair, exact wardrobe. Injected byte-identical into every prompt that shows the character. The writer is instructed never to describe faces or clothing itself.
3. **Per-shot keyframe** (~4–8 s): Nano Banana 2 edit with the identity pack as `image_urls` and the shot's frame description. Output: the opening frame with identity from the pack and composition from the prompt. Optionally also passes the previous shot's frame for location continuity.
4. **Per-shot video** (~15–20 s): H3 Max image-to-video from that keyframe (`PIPELINE_MODE=keyframe-i2v`), or reference-to-video with the pack (`reference-r2v`). Use the 2K base H3 for hero moments if you ever pre-render.
5. **Later, when there is a library of approved clips:** train the H3 ref2va LoRA and use it with reference-to-video. A Flux LoRA ($2–6) only helps step 3.

Why keyframe-first instead of chaining last frame → first frame: chaining compounds error ("errors from each generated frame become the input for the next"); practitioners cap chains at two extensions and re-anchor to the reference. Cutting between shots is normal film grammar, so the audience does not need every shot to be one continuous take.

## Practitioner rules folded into the prompts

- Reference pack: 2–4 matched stills, same lighting, neutral expression, no collages; add a 2–3 s neutral head-movement clip once you have one ("reference hygiene reduces drift ~60%").
- Fixed immutable character block + variable scene block; keep signature wardrobe constant; avoid color-temperature swings ("lighting strongly affects identity perception"); introduce camera motion gradually; with subject reference, prompt action and environment rather than re-describing the face.
- Remove held props from turnarounds; a new pack when the costume changes.

## Honest limits

- What breaks: small faces in wide shots (identity collapses to silhouette), profiles, fast head rotation, wide-to-close cuts, garment color/pattern, accessories appearing/disappearing, hands and held props; multi-reference can blend into a hybrid face; age fluctuates with lighting.
- Measured gap (older models, ArcFace distance): real video 0.05–0.14; Gen-3 0.14–0.28; HunyuanVideo 0.18–0.29. No public 2026 identity benchmark for the commercial reference modes; a third-party same-prompt scorecard put Seedance 2.5 at 89, Kling 3.0 at 82, Veo 3.1 at 76 (Vidu 73) and noted "drift increases with clip count".
- Production math from long-form AI filmmakers: ~70% usable, 15–25% regenerated. Live, we cannot regenerate, so: keep hero close-ups for key moments, prefer medium shots, keep the wardrobe unmistakable (the grey-green bomber with orange lining), and accept the occasional off clip.

## Multi-character scenes

The hard case. Options ranked: Kling v3/O3 `elements` (up to 3 bound characters, 4 angles each, `@Element1` syntax, slower: ~94 s per 5 s on O3 Standard), Seedance 2.0 Fast reference-to-video (9 images, `@Image1..n`), or H3 Max reference-to-video with both packs. For a live 45-second cadence only H3 Max is fast enough, so two-character scenes should be staged as over-the-shoulder and single close-ups rather than two faces in one frame.

## Sources

- MiniMax H3 release, modes and the "reuse 2–4 images" guidance: https://huggingface.co/blog/ResterChed/minimax-h3-hailuo-3-0
- fal endpoints and prices: https://fal.ai/models/minimax/h3/reference-to-video, https://fal.ai/learn/tools/how-to-use-minimax-h3-max, https://fal.ai/learn/devs/minimax-h3-vs-minimax-h3-max
- Old subject reference (single face): https://platform.minimax.io/docs/api-reference/video-generation-s2v, https://fal.ai/models/fal-ai/minimax/video-01-subject-reference
- Nano Banana 2 / Pro: https://fal.ai/models/fal-ai/nano-banana-pro/edit, https://fal.ai/learn/tools/nano-banana-pro-vs-nano-banana-2
- H3 LoRA trainer: https://fal.ai/models/minimax/h3/ref2va/trainer, https://fal.ai/learn/devs/how-to-train-a-lora-for-minimax-h3
- Chaining drift and re-anchoring: https://hackernoon.com/how-to-extend-an-ai-generated-video-clip-past-its-length-limit-without-the-drift, https://invideo.io/blog/anchor-frame-method-ai-video/
- Practitioner rules: https://wavespeed.ai/blog/posts/blog-character-consistency-seedance-2-0/, https://crepal.ai/blog/aivideo/blog-seedance-2-0-character-consistency/, https://magichour.ai/blog/how-to-keep-characters-consistent-in-ai-video, https://www.aimagicx.com/blog/long-form-ai-video-character-consistency-guide-2026
- Consistency scorecard and limits: https://blog.neural4d.com/comparisons/best-ai-video-generator-for-consistent-characters/, https://arxiv.org/html/2505.11425
- Kling elements: https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video, https://kling.ai/blog/kling-3-subject-binding-character-consistency
