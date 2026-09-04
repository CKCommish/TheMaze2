import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ClipPipeline,
  CreditsLedger,
  DirectorVideoProvider,
  characterBlock,
  directorPreamble,
  MockImageProvider,
  MockPlanner,
  MockVideoProvider,
  ResilientPlanner,
  Showrunner,
  SystemClock,
  VoteEngine,
  defaultStory,
  type CharacterSheet,
  type ImageProvider,
  type Planner,
  type Speculation,
  type StoryState,
  type VideoProvider,
} from "./core/index.js";
import { ffmpegAvailable, RtmpPlayout } from "./broadcast/playout.js";
import { FalImageProvider, FalVideoProvider } from "./generation/fal.js";
import { startTikTokIngest } from "./ingest/tiktok.js";
import { startTwitchIngest } from "./ingest/twitch.js";
import { ClaudePlanner } from "./planner/claude-planner.js";
import { createShowServer } from "./server/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

/** Minimal .env loader (no dependency): only sets keys that are not already in the environment. */
function loadEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv(path.join(root, ".env"));

const env = (k: string, d = ""): string => (process.env[k] ?? d).trim();
const log = (msg: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`);

// ---- story ----
function loadStory(): StoryState {
  const story = defaultStory();
  const file = path.join(root, "story", "bible.json");
  if (!fs.existsSync(file)) return story;
  const custom = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<StoryState> & { cast?: Partial<CharacterSheet>[] };
  const cast = (custom.cast ?? []).map((c) => {
    const base = story.cast.find((x) => x.id === c.id);
    return { ...(base ?? {}), ...c } as CharacterSheet;
  });
  const merged: StoryState = { ...story, ...custom, cast: cast.length ? cast : story.cast } as StoryState;
  merged.protagonist = merged.cast.find((c) => c.role === "protagonist") ?? merged.protagonist;
  return merged;
}

const story = loadStory();
const clock = new SystemClock();
const clipSeconds = Number(env("CLIP_SECONDS", "15"));
const aspectRatio = env("ASPECT", "16:9") === "9:16" ? "9:16" : "16:9";
const falKey = env("FAL_KEY");
const anthropicKey = env("ANTHROPIC_API_KEY");
const renderer: "clips" | "director" = env("RENDERER", "clips") === "director" ? "director" : "clips";

// ---- generation ----
let video: VideoProvider;
let image: ImageProvider | undefined;
if (falKey && renderer === "director") {
  video = new DirectorVideoProvider();
  image = undefined;
  log("generation: H3 MAX DIRECTOR (continuous stream) — open http://localhost:PORT/?tv=1&director=1&token=<DIRECTOR_TOKEN> on the streaming machine");
} else if (falKey) {
  const resolution = env("VIDEO_RESOLUTION", "768P").toUpperCase() === "480P" ? "480P" : "768P";
  video = new FalVideoProvider({
    key: falKey,
    model: env("FAL_VIDEO_MODEL", "minimax/h3-max/image-to-video"),
    turboModel: env("FAL_TURBO_MODEL", "minimax/h3-max-turbo/image-to-video"),
    useTurboForDeadline: env("TURBO_FOR_DEADLINE", "false") === "true",
    resolution,
    promptExpansion: env("PROMPT_EXPANSION", "balanced") === "quality" ? "quality" : "balanced",
    log,
  });
  image = new FalImageProvider({ key: falKey, model: env("FAL_IMAGE_MODEL", "fal-ai/nano-banana-2"), editModel: env("FAL_IMAGE_EDIT_MODEL", "fal-ai/nano-banana-2/edit"), log });
  log(`generation: fal (${env("FAL_VIDEO_MODEL", "minimax/h3-max/image-to-video")} @ ${resolution}, keyframes via nano-banana-2)`);
} else {
  const latency = Number(env("MOCK_GENERATION_MS", "6000"));
  video = new MockVideoProvider({ clock, latencyMs: latency, failureRate: Number(env("MOCK_FAILURE_RATE", "0")) });
  image = new MockImageProvider({ clock, latencyMs: Math.round(latency / 4) });
  log(`generation: MOCK (no FAL_KEY) — storyboard cards, ${latency} ms simulated render`);
}
const pipeline = new ClipPipeline({ clock, video, image, mode: renderer === "director" ? "text-only" : (env("PIPELINE_MODE", "keyframe-i2v") as "keyframe-i2v" | "reference-r2v" | "text-only"), clipMs: clipSeconds * 1000, aspectRatio, log });

// ---- planner ----
let planner: Planner;
if (anthropicKey) {
  const claude = new ClaudePlanner({ apiKey: anthropicKey, model: env("PLANNER_MODEL", "claude-opus-5"), effort: (env("PLANNER_EFFORT", "medium") as "low" | "medium" | "high"), contentMode: env("CONTENT_MODE", "tiktok") === "standard" ? "standard" : "tiktok", log });
  planner = new ResilientPlanner(claude, new MockPlanner(), Number(env("PLANNER_TIMEOUT_MS", "45000")), log);
  log(`planner: ${claude.name} (falls back to the template planner on error)`);
} else {
  planner = new MockPlanner(300);
  log("planner: template planner (no ANTHROPIC_API_KEY)");
}

// ---- credits & votes ----
const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });
const creditsFile = path.join(dataDir, "credits.json");
let saveTimer: NodeJS.Timeout | undefined;
const credits = new CreditsLedger({
  starterCredits: Number(env("STARTER_CREDITS", "3")),
  onChange: (l) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => fs.writeFileSync(creditsFile, JSON.stringify(l.toJSON())), 500);
  },
});
if (fs.existsSync(creditsFile)) credits.load(JSON.parse(fs.readFileSync(creditsFile, "utf8")));
const voteMode = env("VOTE_MODE", "value") === "count" ? "count" : "value";
const voteCost = Number(env("VOTE_COST", "1"));
const commentsSelect = env("COMMENTS_SELECT", "false") === "true";
const votes = new VoteEngine({
  clock,
  credits,
  mode: voteMode,
  voteCost,
  chatVotePolicy: env("CHAT_VOTE_POLICY", "free") === "requires_credits" ? "requires_credits" : "free",
  chatVoteValue: Number(env("CHAT_VOTE_VALUE", "0")),
  commentsSelect,
});

// ---- the show ----
const speculation: Speculation = renderer === "director" ? "none" : (env("SPECULATION", "keyframes") as Speculation);
// With nothing to render after the vote (Director) or everything pre-rendered (full speculation), the vote may close late.
const minVoteRemainingMs = renderer === "director" || speculation === "full" ? 3_000 : 20_000;
const showrunner = new Showrunner({
  clock,
  planner,
  pipeline,
  votes,
  story,
  config: {
    speculation,
    voteCost,
    starterCredits: Number(env("STARTER_CREDITS", "3")),
    minVoteRemainingMs,
    timing: {
      clipMs: clipSeconds * 1000,
      beatMs: clipSeconds * 3000,
      voteOpensAtMs: Number(env("VOTE_OPENS_AT_SECONDS", "15")) * 1000,
      voteDurationMs: Number(env("VOTE_SECONDS", "10")) * 1000,
    },
  },
  log,
});

const giftMap = { A: env("TIKTOK_GIFT_A", "Rose"), B: env("TIKTOK_GIFT_B", "GG"), C: env("TIKTOK_GIFT_C", "Ice Cream Cone") };
const server = createShowServer({
  showrunner,
  votes,
  credits,
  port: Number(env("PORT", "8787")),
  webDir: path.join(root, "web"),
  devGrants: env("DEV_GRANTS", falKey ? "false" : "true") === "true",
  coinUsd: Number(env("COIN_USD", "0.0125")),
  voteMode,
  voteCost,
  giftMap,
  aspectRatio,
  stripeWebhookSecret: env("STRIPE_WEBHOOK_SECRET") || undefined,
  renderer: falKey ? renderer : "clips",
  commentsSelect,
  director:
    falKey && renderer === "director"
      ? {
          resolution: env("DIRECTOR_RESOLUTION", "768p") === "480p" ? "480p" : "768p",
          memory: Number(env("DIRECTOR_MEMORY", "12")),
          sessionSeconds: Number(env("DIRECTOR_SESSION_SECONDS", "120")),
          prewarmSeconds: Number(env("DIRECTOR_PREWARM_SECONDS", "20")),
          token: env("DIRECTOR_TOKEN") || undefined,
          preamble: directorPreamble(story.style, story.cast.map((c) => characterBlock(c))),
          falKey,
        }
      : undefined,
  log,
});

// ---- platform adapters ----
const stops: (() => void)[] = [];
if (env("TIKTOK_USERNAME")) {
  stops.push(
    startTikTokIngest({
      username: env("TIKTOK_USERNAME"),
      signApiKey: env("EULER_API_KEY") || undefined,
      onChat: (id, text, name) => server.castExternal("tiktok", id, text, name),
      onGift: (id, coins, giftName, name) => server.giftExternal("tiktok", id, coins, giftName, name),
      log,
    }).stop,
  );
}
if (env("TWITCH_CHANNEL")) {
  const bitCoins = Number(env("BIT_COINS", "1"));
  stops.push(
    startTwitchIngest({
      channel: env("TWITCH_CHANNEL"),
      onChat: (id, text, name) => server.castExternal("twitch", id, text, name),
      onBits: (id, bits, text, name) => {
        server.castExternal("twitch", id, text, name);
        server.giftExternal("twitch", id, Math.round(bits * bitCoins), `${bits} bits`, name);
      },
      log,
    }).stop,
  );
}
if (env("RTMP_URL")) {
  if (ffmpegAvailable()) {
    const playout = new RtmpPlayout({ rtmpUrl: env("RTMP_URL"), width: aspectRatio === "9:16" ? 720 : 1280, height: aspectRatio === "9:16" ? 1280 : 720, log });
    playout.start();
    showrunner.on("slot", (np) => playout.onSlot(np));
    stops.push(() => playout.stop());
  } else {
    log("RTMP_URL is set but ffmpeg is not installed; use OBS with a Browser Source on /?tv=1 instead");
  }
}

showrunner.start().catch((err) => {
  console.error("the show could not start", err);
  process.exit(1);
});

const shutdown = () => {
  log("shutting down");
  showrunner.stop();
  for (const s of stops) s();
  server.close();
  setTimeout(() => process.exit(0), 300).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
