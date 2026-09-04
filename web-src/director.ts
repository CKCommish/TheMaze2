// The Director page module: holds the H3 Max Director WebRTC session in the browser (behind our
// key-hiding proxy), forwards each slot's prompt to the stream, and re-opens the session before
// fal's 2-minute cap so the picture never stops. Bundled to web/director.bundle.js by scripts/build-web.mjs.
import { createFalClient, type FalClient } from "fal-client-alpha";
import { wma } from "fal-client-alpha/realtime/wma";

type State = "opening" | "live" | "failed" | "closed";

interface Managed {
  send(msg: object): void;
  close(): Promise<void>;
  readonly state: State;
}

export interface DirectorStartOptions {
  proxyUrl: string;
  endpointId?: string;
  preamble: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  resolution: "480p" | "768p";
  memory: number;
  /** fal's session cap in seconds (120 unless fal approved longer for your account). */
  sessionSeconds: number;
  /** Seconds before the cap at which the next session is pre-warmed. */
  prewarmSeconds: number;
  onStream: (stream: MediaStream, generation: number) => void;
  onState: (text: string) => void;
  log: (msg: string) => void;
}

class Director {
  private fal?: FalClient;
  private opts?: DirectorStartOptions;
  private current?: Managed;
  private next?: Managed;
  private version = 0;
  private generation = 0;
  private lastPrompt = "";
  private prewarmTimer?: number;
  private stopping = false;

  start(opts: DirectorStartOptions): void {
    this.stop();
    this.stopping = false;
    this.opts = opts;
    this.fal = createFalClient({ proxyUrl: opts.proxyUrl });
    this.open(true);
  }

  /** Steer the stream: the next 15 seconds of story. */
  prompt(text: string): void {
    this.lastPrompt = text;
    if (!this.current || this.current.state === "closed" || this.current.state === "failed") return;
    this.current.send({ type: "prompt", prompt: text, prompt_version: ++this.version });
    this.opts?.log(`director: prompt v${this.version} sent`);
  }

  stop(): void {
    this.stopping = true;
    clearTimeout(this.prewarmTimer);
    this.current?.close().catch(() => {});
    this.next?.close().catch(() => {});
    this.current = undefined;
    this.next = undefined;
  }

  private configurePrompt(): string {
    const o = this.opts!;
    return `${o.preamble}\n\nCurrent scene: ${this.lastPrompt || "Opening image: rain over a container yard at night, a lone figure with a black duffel bag."}`;
  }

  /** Open a session. `primary` sessions show immediately; pre-warmed ones swap in when their video arrives. */
  private open(primary: boolean): void {
    const o = this.opts!;
    const gen = ++this.generation;
    let swapped = primary;
    const session = this.fal!.realtime.open(wma(o.endpointId ?? "minimax/h3-max/director"), {
      receive: ["video", "audio"],
      onMedia: (stream) => {
        if (this.stopping) return;
        if (!swapped) {
          // the pre-warmed session is producing video: make it current and retire the old one
          swapped = true;
          const old = this.current;
          this.current = session;
          this.next = undefined;
          old?.close().catch(() => {});
          o.log(`director: switched to session ${gen}`);
        }
        o.onStream(stream, gen);
        this.schedulePrewarm();
      },
      onState: (state) => {
        o.onState(`session ${gen}: ${state}`);
        if ((state === "closed" || state === "failed") && !this.stopping && this.current === session) {
          // the cap (or a failure) hit before the pre-warmed session took over: reopen at once
          o.log(`director: session ${gen} ${state}; reopening`);
          this.current = undefined;
          this.open(true);
        }
      },
      onError: (err) => o.log(`director: error ${(err as Error)?.message ?? String(err)}`),
    }) as unknown as Managed;
    session.send({
      type: "configure",
      protocol_version: 1,
      prompt: this.configurePrompt(),
      prompt_version: ++this.version,
      aspect_ratio: o.aspectRatio,
      resolution: o.resolution,
      memory: o.memory,
      seed: null,
    });
    if (primary) this.current = session;
    else this.next = session;
  }

  private schedulePrewarm(): void {
    const o = this.opts!;
    clearTimeout(this.prewarmTimer);
    const inMs = Math.max(5, o.sessionSeconds - o.prewarmSeconds) * 1000;
    this.prewarmTimer = window.setTimeout(() => {
      if (this.stopping || this.next) return;
      o.log("director: pre-warming the next session");
      this.open(false);
    }, inMs);
  }
}

declare global {
  interface Window {
    MazeDirector: Director;
  }
}
window.MazeDirector = new Director();
