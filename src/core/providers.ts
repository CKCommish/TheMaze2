import type { ClipKind } from "./types.js";

export type AspectRatio = "16:9" | "9:16";

export interface KeyframeRequest {
  prompt: string;
  /** Identity pack for the characters on screen, plus (optionally) the previous frame for scene continuity. */
  referenceImageUrls: string[];
  aspectRatio: AspectRatio;
  signal?: AbortSignal;
}

export interface KeyframeResult {
  url: string;
  generatedInMs: number;
  provider: string;
}

export interface VideoRequest {
  prompt: string;
  /** First frame (image-to-video). */
  imageUrl?: string;
  /** Optional last frame (first+last frame control). */
  endImageUrl?: string;
  /** Reference images (reference-to-video). */
  referenceImageUrls?: string[];
  durationSec: number;
  aspectRatio: AspectRatio;
  /** "deadline" clips are the ones the audience is waiting for; providers may use a faster tier. */
  priority: "deadline" | "normal";
  signal?: AbortSignal;
}

export interface VideoResult {
  kind: ClipKind;
  url?: string;
  /** For storyboard (mock) clips: the text to show. */
  text?: string;
  durationMs: number;
  generatedInMs: number;
  provider: string;
}

export interface ImageProvider {
  readonly name: string;
  generateKeyframe(req: KeyframeRequest): Promise<KeyframeResult>;
}

export interface VideoProvider {
  readonly name: string;
  /** Whether the provider can make a clip from text alone (used for fillers when no keyframe exists). */
  readonly supportsTextToVideo: boolean;
  generateClip(req: VideoRequest): Promise<VideoResult>;
}
