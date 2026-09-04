import { createFalClient, type FalClient } from "@fal-ai/client";
import type { ImageProvider, KeyframeRequest, KeyframeResult, VideoProvider, VideoRequest, VideoResult } from "../core/index.js";

/**
 * fal.ai providers.
 *
 * Video: "H3 Max by fal" (MiniMax H3, post-trained by fal). Endpoints, verified against fal's
 * OpenAPI on 2026-09-04:
 *   minimax/h3-max/image-to-video      prompt, prompt_expansion_mode, duration 5–15, resolution 480P|768P,
 *                                       image_url, end_image_url, seed, enable_safety_checker
 *   minimax/h3-max/text-to-video       + aspect_ratio (21:9, 16:9, 4:3, 1:1, 3:4, 9:16)
 *   minimax/h3-max/reference-to-video  + reference_image_urls (≤9), reference_video_urls, reference_audio_urls
 *   minimax/h3-max-turbo/…              ~2x faster preview tier, no reference mode
 * Output: { video: { url }, expanded_prompt, timings }. Native audio and dialogue are always generated.
 *
 * Keyframes: Google "Nano Banana 2" via fal (fal-ai/nano-banana-2 for text-to-image, /edit with image_urls
 * for reference-guided images). Output: { images: [{ url }], description }.
 */

export type H3Resolution = "480P" | "768P";

export interface FalVideoOptions {
  key: string;
  /** Base endpoint; the last path segment is swapped per request (image-to-video / text-to-video / reference-to-video). */
  model?: string;
  /** Faster tier used for the clip the audience is waiting for. */
  turboModel?: string;
  useTurboForDeadline?: boolean;
  resolution?: H3Resolution;
  promptExpansion?: "balanced" | "quality";
  pollMs?: number;
  log?: (msg: string) => void;
}

type QueueStatusLike = { status: string; queue_position?: number };

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    });
  });
}

/** Runs a fal queue request to completion with polling and cancellation. */
async function runQueue<T>(fal: FalClient, endpoint: string, input: Record<string, unknown>, pollMs: number, signal: AbortSignal | undefined, log: (m: string) => void): Promise<T> {
  if (signal?.aborted) throw new Error("aborted");
  const { request_id: requestId } = await fal.queue.submit(endpoint, { input });
  let lastPos: number | undefined;
  for (;;) {
    if (signal?.aborted) {
      fal.queue.cancel(endpoint, { requestId }).catch(() => {});
      throw new Error("aborted");
    }
    const st = (await fal.queue.status(endpoint, { requestId, logs: false })) as unknown as QueueStatusLike;
    if (st.status === "COMPLETED") break;
    if (st.queue_position !== undefined && st.queue_position !== lastPos) {
      lastPos = st.queue_position;
      log(`${endpoint} queue position ${st.queue_position}`);
    }
    await sleep(pollMs, signal);
  }
  const { data } = await fal.queue.result(endpoint, { requestId });
  return data as T;
}

function isNonRetryable(err: unknown): boolean {
  const e = err as { status?: number; message?: string; body?: { detail?: { type?: string }[] } };
  if (e?.status === 422) return true;
  const detail = e?.body?.detail;
  if (Array.isArray(detail) && detail.some((d) => d?.type === "content_policy_violation")) return true;
  return /content_policy|safety/i.test(String(e?.message ?? ""));
}

function withEndpointMode(base: string, mode: "image-to-video" | "text-to-video" | "reference-to-video"): string {
  return base.replace(/\/(image-to-video|text-to-video|reference-to-video)$/, "") + "/" + mode;
}

export class FalVideoProvider implements VideoProvider {
  readonly name: string;
  readonly supportsTextToVideo = true;
  private readonly fal: FalClient;
  private readonly model: string;
  private readonly turboModel?: string;
  private readonly resolution: H3Resolution;
  private readonly promptExpansion: "balanced" | "quality";
  private readonly pollMs: number;
  private readonly log: (m: string) => void;
  private readonly useTurboForDeadline: boolean;

  constructor(opts: FalVideoOptions) {
    this.fal = createFalClient({ credentials: opts.key });
    this.model = opts.model ?? "minimax/h3-max/image-to-video";
    this.turboModel = opts.turboModel;
    this.useTurboForDeadline = opts.useTurboForDeadline ?? false;
    this.resolution = opts.resolution ?? "768P";
    this.promptExpansion = opts.promptExpansion ?? "balanced";
    this.pollMs = opts.pollMs ?? 750;
    this.log = opts.log ?? (() => {});
    this.name = `fal:${this.model}`;
  }

  async generateClip(req: VideoRequest): Promise<VideoResult> {
    const base = req.priority === "deadline" && this.useTurboForDeadline && this.turboModel ? this.turboModel : this.model;
    const mode = req.referenceImageUrls?.length && !req.imageUrl ? "reference-to-video" : req.imageUrl ? "image-to-video" : "text-to-video";
    const endpoint = withEndpointMode(base, mode);
    const duration = Math.min(15, Math.max(5, Math.round(req.durationSec)));
    const input: Record<string, unknown> = {
      prompt: req.prompt.slice(0, 7000),
      prompt_expansion_mode: this.promptExpansion,
      duration,
      resolution: this.resolution,
      enable_safety_checker: true,
    };
    if (mode === "image-to-video") {
      input.image_url = req.imageUrl;
      if (req.endImageUrl) input.end_image_url = req.endImageUrl;
    } else {
      input.aspect_ratio = req.aspectRatio;
      if (mode === "reference-to-video") input.reference_image_urls = req.referenceImageUrls!.slice(0, 9);
    }
    const started = Date.now();
    try {
      const data = await runQueue<{ video?: { url?: string }; timings?: Record<string, number> }>(this.fal, endpoint, input, this.pollMs, req.signal, this.log);
      const url = data.video?.url;
      if (!url) throw new Error("fal returned no video url");
      const ms = Date.now() - started;
      this.log(`${endpoint}: ${duration}s clip in ${(ms / 1000).toFixed(1)}s (inference ${data.timings?.inference ?? "?"}s)`);
      return { kind: "video", url, durationMs: duration * 1000, generatedInMs: ms, provider: endpoint };
    } catch (err) {
      if (isNonRetryable(err)) (err as { retryable?: boolean }).retryable = false;
      throw err;
    }
  }
}

export interface FalImageOptions {
  key: string;
  /** Text-to-image endpoint (no references). */
  model?: string;
  /** Reference-guided edit endpoint (takes image_urls). */
  editModel?: string;
  resolution?: "0.5K" | "1K" | "2K";
  pollMs?: number;
  log?: (msg: string) => void;
}

export class FalImageProvider implements ImageProvider {
  readonly name: string;
  private readonly fal: FalClient;
  private readonly model: string;
  private readonly editModel: string;
  private readonly resolution: "0.5K" | "1K" | "2K";
  private readonly pollMs: number;
  private readonly log: (m: string) => void;

  constructor(opts: FalImageOptions) {
    this.fal = createFalClient({ credentials: opts.key });
    this.model = opts.model ?? "fal-ai/nano-banana-2";
    this.editModel = opts.editModel ?? "fal-ai/nano-banana-2/edit";
    this.resolution = opts.resolution ?? "1K";
    this.pollMs = opts.pollMs ?? 500;
    this.log = opts.log ?? (() => {});
    this.name = `fal:${this.editModel}`;
  }

  async generateKeyframe(req: KeyframeRequest): Promise<KeyframeResult> {
    const useEdit = req.referenceImageUrls.length > 0;
    const endpoint = useEdit ? this.editModel : this.model;
    const input: Record<string, unknown> = {
      prompt: req.prompt,
      aspect_ratio: req.aspectRatio,
      resolution: this.resolution,
      num_images: 1,
      output_format: "jpeg",
    };
    if (useEdit) input.image_urls = req.referenceImageUrls.slice(0, 14);
    const started = Date.now();
    try {
      const data = await runQueue<{ images?: { url?: string }[] }>(this.fal, endpoint, input, this.pollMs, req.signal, this.log);
      const url = data.images?.[0]?.url;
      if (!url) throw new Error("fal returned no image url");
      const ms = Date.now() - started;
      this.log(`${endpoint}: keyframe in ${(ms / 1000).toFixed(1)}s`);
      return { url, generatedInMs: ms, provider: endpoint };
    } catch (err) {
      if (isNonRetryable(err)) (err as { retryable?: boolean }).retryable = false;
      throw err;
    }
  }

  /** Upload a local file (e.g. an approved reference photo) to fal storage and get a URL. */
  async upload(bytes: Uint8Array, contentType: string): Promise<string> {
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return this.fal.storage.upload(new Blob([copy], { type: contentType }));
  }
}
