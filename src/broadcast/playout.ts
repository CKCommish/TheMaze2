import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { NowPlaying } from "../core/index.js";

/**
 * EXPERIMENTAL RTMP playout (needs ffmpeg). Pushes each on-air clip to an RTMP destination
 * (Twitch, YouTube, Kick, or a TikTok LIVE server key) as one continuous stream.
 *
 * The recommended production path is simpler and battle-tested: open OBS or TikTok LIVE Studio,
 * add a Browser Source pointing at http://localhost:8787/?tv=1 and stream that. See docs/01-architecture.md.
 *
 * Known limits of this module: a clip that "cuts in" late is not shown to RTMP viewers (they keep
 * seeing the filler for that slot), and storyboard cards are rendered as plain color slates.
 * This module has not been run end-to-end in the environment it was written in (no ffmpeg there).
 */
export interface PlayoutOptions {
  rtmpUrl: string;
  width?: number;
  height?: number;
  fps?: number;
  videoBitrate?: string;
  log: (msg: string) => void;
}

export function ffmpegAvailable(): boolean {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

export class RtmpPlayout {
  private out?: ChildProcess;
  private queue: Promise<void> = Promise.resolve();
  private readonly w: number;
  private readonly h: number;
  private readonly fps: number;
  private readonly bitrate: string;

  constructor(private readonly opts: PlayoutOptions) {
    this.w = opts.width ?? 1280;
    this.h = opts.height ?? 720;
    this.fps = opts.fps ?? 30;
    this.bitrate = opts.videoBitrate ?? "4500k";
  }

  start(): void {
    // The output process reads MPEG-TS from stdin at real time and republishes it as FLV over RTMP.
    this.out = spawn("ffmpeg", ["-hide_banner", "-loglevel", "warning", "-re", "-f", "mpegts", "-i", "pipe:0", "-c", "copy", "-f", "flv", this.opts.rtmpUrl], { stdio: ["pipe", "ignore", "pipe"] });
    this.out.stderr?.on("data", (d) => this.opts.log(`ffmpeg(out): ${String(d).trim()}`));
    this.out.on("exit", (code) => this.opts.log(`ffmpeg(out) exited with ${code}`));
    this.opts.log(`rtmp playout → ${this.opts.rtmpUrl.replace(/\/[^/]+$/, "/<key>")}`);
  }

  /** Called on every "slot" event. Clips are transcoded to a uniform MPEG-TS and appended in order. */
  onSlot(np: NowPlaying): void {
    const seconds = Math.max(1, Math.round((np.endsAt - np.startsAt) / 1000));
    this.queue = this.queue.then(() => this.push(np, seconds)).catch((err) => this.opts.log(`playout error: ${(err as Error).message}`));
  }

  private push(np: NowPlaying, seconds: number): Promise<void> {
    return new Promise((resolve) => {
      const common = ["-hide_banner", "-loglevel", "error", "-t", String(seconds)];
      const input = np.clip.kind === "video" && np.clip.url ? ["-i", np.clip.url] : ["-f", "lavfi", "-i", `color=c=0x0b0f14:s=${this.w}x${this.h}:r=${this.fps}`, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"];
      const args = [
        ...common,
        ...input,
        "-vf", `scale=${this.w}:${this.h}:force_original_aspect_ratio=decrease,pad=${this.w}:${this.h}:(ow-iw)/2:(oh-ih)/2,fps=${this.fps},format=yuv420p`,
        "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-b:v", this.bitrate, "-g", String(this.fps * 2), "-keyint_min", String(this.fps * 2),
        "-c:a", "aac", "-ar", "44100", "-b:a", "128k", "-shortest",
        "-f", "mpegts", "pipe:1",
      ];
      const tc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      tc.stderr?.on("data", (d) => this.opts.log(`ffmpeg(tc): ${String(d).trim()}`));
      tc.stdout?.on("data", (chunk) => {
        if (this.out?.stdin?.writable) this.out.stdin.write(chunk);
      });
      tc.on("exit", () => resolve());
    });
  }

  stop(): void {
    this.out?.stdin?.end();
    this.out?.kill("SIGINT");
  }
}
