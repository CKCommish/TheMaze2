import type { Clock } from "./clock.js";
import type { ImageProvider, KeyframeRequest, KeyframeResult, VideoProvider, VideoRequest, VideoResult } from "./providers.js";

export interface MockOptions {
  clock: Clock;
  /** Simulated generation time. A function lets tests make some clips late. */
  latencyMs?: number | (() => number);
  /** 0..1 chance a request fails (to exercise the never-stop fallbacks). */
  failureRate?: number;
  random?: () => number;
}

function delay(clock: Clock, ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const handle = clock.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clock.clearTimeout(handle);
      reject(new Error("aborted"));
    });
  });
}

/** Pretends to paint a keyframe. Returns a fake URL; nothing is rendered. */
export class MockImageProvider implements ImageProvider {
  readonly name = "mock-image";
  private counter = 0;
  constructor(private readonly opts: MockOptions) {}

  async generateKeyframe(req: KeyframeRequest): Promise<KeyframeResult> {
    const started = this.opts.clock.now();
    const latency = typeof this.opts.latencyMs === "function" ? this.opts.latencyMs() : (this.opts.latencyMs ?? 1500);
    await delay(this.opts.clock, latency, req.signal);
    if ((this.opts.random ?? Math.random)() < (this.opts.failureRate ?? 0)) throw new Error("mock keyframe failure");
    return { url: `mock://keyframe/${++this.counter}`, generatedInMs: this.opts.clock.now() - started, provider: this.name };
  }
}

/** Pretends to render video. Returns a storyboard card that the player draws instead of a video. */
export class MockVideoProvider implements VideoProvider {
  readonly name = "mock-video";
  readonly supportsTextToVideo = true;
  constructor(private readonly opts: MockOptions) {}

  async generateClip(req: VideoRequest): Promise<VideoResult> {
    const started = this.opts.clock.now();
    const latency = typeof this.opts.latencyMs === "function" ? this.opts.latencyMs() : (this.opts.latencyMs ?? 6000);
    await delay(this.opts.clock, latency, req.signal);
    if ((this.opts.random ?? Math.random)() < (this.opts.failureRate ?? 0)) throw new Error("mock video failure");
    return {
      kind: "storyboard",
      text: req.prompt,
      durationMs: req.durationSec * 1000,
      generatedInMs: this.opts.clock.now() - started,
      provider: this.name,
    };
  }
}
