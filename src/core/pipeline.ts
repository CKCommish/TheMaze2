import type { Clock } from "./clock.js";
import { Emitter } from "./emitter.js";
import type { AspectRatio, ImageProvider, KeyframeResult, VideoProvider } from "./providers.js";
import { characterBlock, characterById } from "./story.js";
import type { BeatPlan, Clip, Shot, StoryState } from "./types.js";

/**
 * Turns a beat plan into playable clips, with the character lock applied:
 *
 *   identity pack (approved reference photos, never regenerated)
 *     → keyframe: an image model paints the opening frame of the shot FROM the references
 *     → video: the video model animates that keyframe for 15 s (image-to-video)
 *
 * Every clip is re-anchored to the canonical references, so drift does not accumulate
 * across hours of show. Fillers (empty establishing shots of the current location) are
 * generated in the background so there is always something on air.
 */

export type PipelineMode = "keyframe-i2v" | "reference-r2v" | "text-only";

export interface PipelineOptions {
  clock: Clock;
  video: VideoProvider;
  image?: ImageProvider;
  mode: PipelineMode;
  clipMs: number;
  aspectRatio: AspectRatio;
  /** Attempts per clip before giving up (the filler covers the gap). */
  maxAttempts?: number;
  /** Max fillers to keep per location. */
  fillerBankSize?: number;
  log?: (msg: string) => void;
}

export interface Tracked<T> {
  promise: Promise<T>;
  status: "pending" | "ready" | "failed";
  value?: T;
  error?: unknown;
}

export function track<T>(promise: Promise<T>): Tracked<T> {
  const t: Tracked<T> = { promise, status: "pending" };
  t.promise = promise.then(
    (v) => {
      t.status = "ready";
      t.value = v;
      return v;
    },
    (e) => {
      t.status = "failed";
      t.error = e;
      throw e;
    },
  );
  // avoid unhandled rejection noise; consumers still get the rejection via t.promise
  t.promise.catch(() => {});
  return t;
}

export interface PreparedBeat {
  plan: BeatPlan;
  /** World state after this beat (used to plan its successors). */
  stateAfter: StoryState;
  shots: Tracked<Clip>[];
  abort: AbortController;
}

export interface PipelineStats {
  inFlight: number;
  ready: number;
  failures: number;
  fillersPlayed: number;
  keyframes: number;
}

type PipelineEvents = {
  clip_ready: Clip;
  clip_failed: { beatIndex: number; shotIndex: number; error: string };
  filler_ready: Clip;
};

export class ClipPipeline extends Emitter<PipelineEvents> {
  readonly stats: PipelineStats = { inFlight: 0, ready: 0, failures: 0, fillersPlayed: 0, keyframes: 0 };
  private fillerBank = new Map<string, Clip[]>();
  private fillersInFlight = new Set<string>();
  private counter = 0;
  private readonly maxAttempts: number;
  private readonly fillerBankSize: number;
  private readonly log: (msg: string) => void;

  constructor(private readonly opts: PipelineOptions) {
    super();
    this.maxAttempts = opts.maxAttempts ?? 2;
    this.fillerBankSize = opts.fillerBankSize ?? 2;
    this.log = opts.log ?? (() => {});
  }

  get mode(): PipelineMode {
    return this.opts.mode;
  }

  // ---------- prompts ----------

  /** The identity pack for the characters in a shot. */
  referencesFor(shot: Shot, state: StoryState): string[] {
    const urls: string[] = [];
    for (const id of shot.charactersOnScreen) {
      const c = characterById(state, id);
      if (c) urls.push(...c.referenceImageUrls);
    }
    return urls.slice(0, 9);
  }

  private castText(shot: Shot, state: StoryState): string {
    const blocks = shot.charactersOnScreen
      .map((id) => characterById(state, id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => characterBlock(c));
    return blocks.length ? `Characters on screen (keep faces, hair and wardrobe exactly like the reference photos): ${blocks.join(" ")}` : "No main characters on screen.";
  }

  keyframePrompt(shot: Shot, state: StoryState): string {
    return [
      `A single cinematic film still, ${this.opts.aspectRatio === "16:9" ? "widescreen 16:9" : "vertical 9:16"}.`,
      shot.frame,
      `Location: ${shot.location}. ${state.timeOfDay}, ${state.weather}.`,
      this.castText(shot, state),
      `Camera: ${shot.camera}.`,
      `Style: ${state.style}`,
    ].join("\n");
  }

  videoPrompt(shot: Shot, state: StoryState): string {
    return [
      shot.motion,
      `Camera: ${shot.camera}.`,
      `Location: ${shot.location}. ${state.timeOfDay}, ${state.weather}.`,
      this.castText(shot, state),
      `Style: ${state.style}`,
    ].join("\n");
  }

  fillerPrompt(state: StoryState): string {
    return [
      `Establishing shot of ${state.location}. ${state.timeOfDay}, ${state.weather}. No people in frame.`,
      "Slow, steady cinematic camera move (a drift, a rise, or a push-in). Ambient sound only, no dialogue.",
      `Style: ${state.style}`,
    ].join("\n");
  }

  // ---------- generation ----------

  /** Paint the opening frame of a shot from the identity pack. Returns undefined when the pipeline has no image model. */
  async startKeyframe(plan: BeatPlan, shotIndex: number, state: StoryState, signal?: AbortSignal, previousFrameUrl?: string): Promise<KeyframeResult | undefined> {
    if (!this.opts.image || this.opts.mode !== "keyframe-i2v") return undefined;
    const shot = plan.shots[shotIndex];
    const refs = this.referencesFor(shot, state);
    if (previousFrameUrl) refs.push(previousFrameUrl);
    const started = this.opts.clock.now();
    try {
      const res = await this.opts.image.generateKeyframe({ prompt: this.keyframePrompt(shot, state), referenceImageUrls: refs, aspectRatio: this.opts.aspectRatio, signal });
      this.stats.keyframes++;
      this.log(`keyframe b${plan.beatIndex}s${shotIndex} ready in ${this.opts.clock.now() - started} ms`);
      return res;
    } catch (err) {
      if (signal?.aborted) throw err;
      this.log(`keyframe b${plan.beatIndex}s${shotIndex} failed: ${(err as Error).message}; falling back to text prompt`);
      return undefined;
    }
  }

  /** Generate one shot's clip. Retries once; the caller's filler covers any remaining gap. */
  async startClip(plan: BeatPlan, shotIndex: number, state: StoryState, keyframe?: Promise<KeyframeResult | undefined>, signal?: AbortSignal, priority: "deadline" | "normal" = "normal"): Promise<Clip> {
    const shot = plan.shots[shotIndex];
    const kf = keyframe ? await keyframe.catch(() => undefined) : undefined;
    const started = this.opts.clock.now();
    this.stats.inFlight++;
    let lastError: unknown;
    try {
      for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
        if (signal?.aborted) throw new Error("aborted");
        try {
          const res = await this.opts.video.generateClip({
            prompt: this.videoPrompt(shot, state),
            imageUrl: kf?.url,
            referenceImageUrls: this.opts.mode === "reference-r2v" ? this.referencesFor(shot, state) : undefined,
            durationSec: Math.round(this.opts.clipMs / 1000),
            aspectRatio: this.opts.aspectRatio,
            priority,
            signal,
          });
          const clip: Clip = {
            id: `b${plan.beatIndex}s${shotIndex}-${++this.counter}`,
            beatIndex: plan.beatIndex,
            shotIndex,
            kind: res.kind,
            url: res.url,
            keyframeUrl: kf?.url,
            durationMs: res.durationMs,
            title: `${shot.role.toUpperCase()} · ${shot.location}`,
            text: res.kind === "video" ? undefined : shot.summary,
            prompt: res.kind === "director" ? res.text : undefined,
            provider: res.provider,
            generatedInMs: this.opts.clock.now() - started,
            location: shot.location,
          };
          this.stats.ready++;
          this.emit("clip_ready", clip);
          return clip;
        } catch (err) {
          lastError = err;
          if (signal?.aborted) throw err;
          this.log(`clip b${plan.beatIndex}s${shotIndex} attempt ${attempt} failed: ${(err as Error).message}`);
          // e.g. a content-policy rejection: the same prompt will fail again, so stop early
          if ((err as { retryable?: boolean }).retryable === false) break;
        }
      }
      this.stats.failures++;
      this.emit("clip_failed", { beatIndex: plan.beatIndex, shotIndex, error: String((lastError as Error)?.message ?? lastError) });
      throw lastError ?? new Error("clip failed");
    } finally {
      this.stats.inFlight--;
    }
  }

  /**
   * Start every shot of a beat. Shot 0 is the deadline clip (the audience is waiting for it);
   * shots 1 and 2 have a full slot of slack each. `pre` carries anything speculated before the vote.
   */
  prepareBeat(plan: BeatPlan, stateAfter: StoryState, pre?: { keyframe0?: Promise<KeyframeResult | undefined>; clip0?: Promise<Clip> }, parentAbort?: AbortController): PreparedBeat {
    const abort = parentAbort ?? new AbortController();
    const shots: Tracked<Clip>[] = [];
    for (let i = 0; i < plan.shots.length; i++) {
      let p: Promise<Clip>;
      if (i === 0 && pre?.clip0) {
        p = pre.clip0;
      } else {
        const kf = i === 0 && pre?.keyframe0 ? pre.keyframe0 : this.startKeyframe(plan, i, stateAfter, abort.signal);
        p = this.startClip(plan, i, stateAfter, kf, abort.signal, i === 0 ? "deadline" : "normal");
      }
      shots.push(track(p));
    }
    // Keep a filler warm for the location this beat ends in.
    this.ensureFiller(stateAfter);
    return { plan, stateAfter, shots, abort };
  }

  // ---------- fillers ----------

  /** Make sure a filler exists (or is being made) for the state's location. Cheap insurance. */
  ensureFiller(state: StoryState): void {
    const key = state.location;
    const have = this.fillerBank.get(key)?.length ?? 0;
    if (have >= this.fillerBankSize || this.fillersInFlight.has(key)) return;
    if (!this.opts.video.supportsTextToVideo) return;
    this.fillersInFlight.add(key);
    const started = this.opts.clock.now();
    this.opts.video
      .generateClip({ prompt: this.fillerPrompt(state), durationSec: Math.round(this.opts.clipMs / 1000), aspectRatio: this.opts.aspectRatio, priority: "normal" })
      .then((res) => {
        const clip: Clip = {
          id: `filler-${++this.counter}`,
          beatIndex: -1,
          shotIndex: -1,
          kind: res.kind,
          url: res.url,
          durationMs: res.durationMs,
          title: `ESTABLISHING · ${key}`,
          text: res.kind === "video" ? undefined : `Establishing shot: ${key}. ${state.timeOfDay}, ${state.weather}.`,
          prompt: res.kind === "director" ? res.text : undefined,
          provider: res.provider,
          generatedInMs: this.opts.clock.now() - started,
          filler: true,
          location: key,
        };
        const list = this.fillerBank.get(key) ?? [];
        list.push(clip);
        this.fillerBank.set(key, list);
        this.emit("filler_ready", clip);
      })
      .catch((err) => this.log(`filler for ${key} failed: ${(err as Error).message}`))
      .finally(() => this.fillersInFlight.delete(key));
  }

  /** Never throws: returns the best available filler, or a storyboard card as the last resort. */
  takeFiller(state: StoryState, durationMs: number): Clip {
    this.stats.fillersPlayed++;
    const local = this.fillerBank.get(state.location);
    const any = local?.length ? local : Array.from(this.fillerBank.values()).find((l) => l.length);
    if (any?.length) {
      // rotate so the same filler is not shown twice in a row
      const clip = any.shift()!;
      any.push(clip);
      this.ensureFiller(state);
      return { ...clip, id: `${clip.id}-p${++this.counter}`, durationMs };
    }
    this.ensureFiller(state);
    return {
      id: `card-${++this.counter}`,
      beatIndex: -1,
      shotIndex: -1,
      kind: "storyboard",
      durationMs,
      title: `ESTABLISHING · ${state.location}`,
      text: `${state.location}. ${state.timeOfDay}, ${state.weather}.`,
      provider: "card",
      filler: true,
      location: state.location,
    };
  }

  fillerCount(): number {
    let n = 0;
    for (const l of this.fillerBank.values()) n += l.length;
    return n;
  }
}
