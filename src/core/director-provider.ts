import type { VideoProvider, VideoRequest, VideoResult } from "./providers.js";

/**
 * Renderer for H3 Max Director (fal's continuous, realtime video stream).
 *
 * Director is not a clip API: one WebRTC session generates video non-stop and you steer it by
 * sending prompt messages. So in Director mode a "clip" is just the prompt for the next 15 seconds.
 * The showrunner keeps its exact 45/15/5 clock; the browser page that holds the session
 * (web/director.bundle.js, opened with ?tv=1&director=1) forwards each slot's prompt to the stream.
 *
 * Nothing is rendered here, so clips are never late. The trade-offs live in docs/08-director-mode.md.
 */
export class DirectorVideoProvider implements VideoProvider {
  readonly name = "fal:minimax/h3-max/director";
  readonly supportsTextToVideo = true;

  async generateClip(req: VideoRequest): Promise<VideoResult> {
    return { kind: "director", text: req.prompt, durationMs: req.durationSec * 1000, generatedInMs: 0, provider: this.name };
  }
}

/** The text every Director session opens with, so a fresh session inherits the world and the cast. */
export function directorPreamble(style: string, castBlocks: string[]): string {
  return [
    "You are generating a continuous live-action crime drama. Keep every character's face, hair and wardrobe exactly as described whenever they appear:",
    ...castBlocks,
    `Visual style: ${style}`,
    "Follow each new instruction as the next 15 seconds of the same continuous story.",
  ].join("\n");
}
