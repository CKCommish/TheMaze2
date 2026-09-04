# story/

- `bible.json` — overrides for the story bible in `src/core/bible.ts`. `npm run cast` writes each character's approved reference image URLs here (`cast[].referenceImageUrls`). You can also edit the title, logline, locations and any character's look or wardrobe.
- `cast/` — the locked identity packs (front, three-quarter, profile, full body) downloaded by `npm run cast`. Approve them once; never regenerate an approved pack.
- `samples/` — outputs of `npm run probe` (real keyframe and clip URLs with timings).
