/**
 * Lock the look of the cast: generate an approved identity pack (front, three-quarter, profile, full body)
 * for each character that has no reference images yet, save the files under story/cast/, and write the
 * URLs into story/bible.json. Run once; never regenerate an approved pack (that is the whole point).
 *
 *   npx tsx scripts/make-cast.ts            # all characters missing references
 *   npx tsx scripts/make-cast.ts rae        # one character
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFalClient } from "@fal-ai/client";
import { CAST, defaultStory, type CharacterSheet } from "../src/core/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.existsSync(path.join(root, ".env")) ? fs.readFileSync(path.join(root, ".env"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const key = process.env.FAL_KEY;
if (!key) throw new Error("FAL_KEY is not set");
const fal = createFalClient({ credentials: key });

const VIEWS: { key: string; prompt: string }[] = [
  { key: "front", prompt: "Frontal head-and-shoulders portrait, looking straight into the lens, neutral expression, mouth closed." },
  { key: "threequarter", prompt: "Three-quarter view head-and-shoulders portrait, face turned 45 degrees to camera-left, neutral expression." },
  { key: "profile", prompt: "Exact side profile portrait facing camera-right, neutral expression." },
  { key: "fullbody", prompt: "Full-body shot standing relaxed, arms at the sides, whole outfit and shoes visible, plain floor." },
];
const LIGHT = "Photoreal, shot on a cinema camera with an 85mm lens, soft even studio key light, plain mid-grey seamless background, no props, no text, no watermark. The same person in every image.";

function bibleFile(): string {
  return path.join(root, "story", "bible.json");
}
function loadBible(): { cast: Partial<CharacterSheet>[] } {
  const f = bibleFile();
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : { cast: [] };
}

async function download(url: string, file: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function generate(endpoint: string, input: Record<string, unknown>): Promise<string> {
  const { data } = await fal.subscribe(endpoint, { input, logs: false });
  const url = (data as { images?: { url?: string }[] }).images?.[0]?.url;
  if (!url) throw new Error(`no image from ${endpoint}`);
  return url;
}

async function main() {
  const only = process.argv[2];
  const bible = loadBible();
  const outDir = path.join(root, "story", "cast");
  fs.mkdirSync(outDir, { recursive: true });
  const story = defaultStory();
  for (const base of CAST) {
    if (only && base.id !== only) continue;
    const existing = bible.cast.find((c) => c.id === base.id);
    if (existing?.referenceImageUrls?.length) {
      console.log(`${base.id}: already has ${existing.referenceImageUrls.length} references, skipping`);
      continue;
    }
    console.log(`${base.id}: generating identity pack…`);
    const who = `${base.look} Wearing: ${base.wardrobe}.`;
    const urls: string[] = [];
    // 1) the canonical front view from text
    const front = await generate("fal-ai/nano-banana-2", { prompt: `${VIEWS[0].prompt} ${who} ${LIGHT} ${story.style}`, aspect_ratio: "1:1", resolution: "1K", num_images: 1, output_format: "jpeg" });
    urls.push(front);
    console.log(`  front: ${front}`);
    // 2) the other views, edited FROM the front view so they are the same person
    for (const v of VIEWS.slice(1)) {
      const url = await generate("fal-ai/nano-banana-2/edit", {
        prompt: `Same person as the reference photo, identical face, hair, scar and outfit. ${v.prompt} ${who} ${LIGHT}`,
        image_urls: [front],
        aspect_ratio: v.key === "fullbody" ? "3:4" : "1:1",
        resolution: "1K",
        num_images: 1,
        output_format: "jpeg",
      });
      urls.push(url);
      console.log(`  ${v.key}: ${url}`);
    }
    for (let i = 0; i < urls.length; i++) await download(urls[i], path.join(outDir, `${base.id}-${VIEWS[i].key}.jpg`));
    const entry: Partial<CharacterSheet> = { ...(existing ?? {}), id: base.id, referenceImageUrls: urls };
    bible.cast = [...bible.cast.filter((c) => c.id !== base.id), entry];
    fs.writeFileSync(bibleFile(), JSON.stringify(bible, null, 2));
    console.log(`${base.id}: saved ${urls.length} references to story/cast and story/bible.json`);
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
