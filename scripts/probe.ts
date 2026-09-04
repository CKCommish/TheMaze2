/**
 * Spend a few cents to measure the real pipeline: one character-locked keyframe (Nano Banana 2 edit
 * from the identity pack) and one 15-second H3 Max clip animated from it. Prints timings and URLs.
 *
 *   npx tsx scripts/probe.ts [duration=15] [model=minimax/h3-max/image-to-video]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FalImageProvider, FalVideoProvider } from "../src/generation/fal.js";
import { ClipPipeline, MockPlanner, SystemClock, defaultStory, type CharacterSheet } from "../src/core/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.existsSync(path.join(root, ".env")) ? fs.readFileSync(path.join(root, ".env"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const key = process.env.FAL_KEY;
if (!key) throw new Error("FAL_KEY is not set");
const duration = Number(process.argv[2] ?? 15);
const model = process.argv[3] ?? "minimax/h3-max/image-to-video";
const log = (m: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

async function main() {
  const story = defaultStory();
  const bibleFile = path.join(root, "story", "bible.json");
  if (fs.existsSync(bibleFile)) {
    const bible = JSON.parse(fs.readFileSync(bibleFile, "utf8")) as { cast: Partial<CharacterSheet>[] };
    for (const c of bible.cast) {
      const target = story.cast.find((x) => x.id === c.id);
      if (target && c.referenceImageUrls) target.referenceImageUrls = c.referenceImageUrls;
    }
  }
  const clock = new SystemClock();
  const video = new FalVideoProvider({ key, model, log });
  const image = new FalImageProvider({ key, log });
  const pipeline = new ClipPipeline({ clock, video, image, mode: "keyframe-i2v", clipMs: duration * 1000, aspectRatio: "16:9", log });
  const plan = await new MockPlanner().planOpening(story);
  const shot = plan.shots[1];
  log(`shot: ${shot.summary}`);
  log(`references: ${pipeline.referencesFor(shot, story).length}`);

  const t0 = Date.now();
  const kf = await pipeline.startKeyframe(plan, 1, story);
  const tKf = Date.now();
  log(`keyframe: ${kf?.url} (${((tKf - t0) / 1000).toFixed(1)}s)`);
  const clip = await pipeline.startClip(plan, 1, story, Promise.resolve(kf), undefined, "deadline");
  const tClip = Date.now();
  log(`clip: ${clip.url} (${((tClip - tKf) / 1000).toFixed(1)}s for ${duration}s of video)`);
  const out = { at: new Date().toISOString(), model, duration, keyframeUrl: kf?.url, keyframeMs: tKf - t0, clipUrl: clip.url, clipMs: tClip - tKf, prompt: pipeline.videoPrompt(shot, story) };
  fs.mkdirSync(path.join(root, "story", "samples"), { recursive: true });
  const f = path.join(root, "story", "samples", `probe-${Date.now()}.json`);
  fs.writeFileSync(f, JSON.stringify(out, null, 2));
  log(`saved ${path.relative(root, f)}`);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
