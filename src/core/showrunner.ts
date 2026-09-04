import type { Clock } from "./clock.js";
import { DEFAULT_SHOW_CONFIG, slotsPerBeat, validateTiming, type ShowConfig, type Timing } from "./config.js";
import { Emitter } from "./emitter.js";
import type { ClipPipeline, PreparedBeat } from "./pipeline.js";
import type { Planner } from "./planner.js";
import type { KeyframeResult } from "./providers.js";
import { projectAfter } from "./story.js";
import type { BeatPlan, Choice, ChoiceId, Clip, NowPlaying, Snapshot, StoryState, VoteResult } from "./types.js";
import type { VoteEngine } from "./votes.js";

/**
 * The Showrunner is the clock of the show. It never waits for anything:
 *
 *   beat N plays for exactly 45 s as three 15 s slots
 *   ├─ slot 0  (0–15 s)   the setup
 *   ├─ slot 1  (15–30 s)  the action — the VOTE opens at 15 s (30 s left) and closes at 25 s (20 s left)
 *   └─ slot 2  (30–45 s)  the turn / cliffhanger, written to work for all three choices
 *
 * While beat N plays, the three possible beat N+1s are already being written (and, with speculation
 * on, their opening keyframes painted). The moment the vote closes, the winner's first clip starts
 * rendering with 20 s to spare. If any clip is late, a filler establishing shot plays and the real
 * clip cuts in as soon as it lands. If the audience does not vote, option A wins by default.
 */

export interface ShowrunnerDeps {
  clock: Clock;
  planner: Planner;
  pipeline: ClipPipeline;
  votes: VoteEngine;
  story: StoryState;
  config?: Omit<Partial<ShowConfig>, "timing"> & { timing?: Partial<Timing> };
  log?: (msg: string) => void;
}

interface Candidate {
  choice: Choice;
  abort: AbortController;
  plan: Promise<BeatPlan>;
  keyframe0?: Promise<KeyframeResult | undefined>;
  clip0?: Promise<Clip>;
}

interface PlayingBeat {
  prepared: PreparedBeat;
  startsAt: number;
  endsAt: number;
  candidates: Map<ChoiceId, Candidate>;
  timers: unknown[];
}

export type ShowrunnerEvents = {
  beat: { index: number; plan: BeatPlan; startsAt: number; endsAt: number };
  slot: NowPlaying;
  vote_open: NonNullable<Snapshot["vote"]>;
  vote_tally: { beatIndex: number; tally: VoteResult["tally"] };
  vote_closed: { beatIndex: number; result: VoteResult; choice: Choice };
  log: { level: "info" | "warn" | "error"; msg: string; at: number };
};

export class Showrunner extends Emitter<ShowrunnerEvents> {
  readonly config: ShowConfig;
  story: StoryState;
  private current?: PlayingBeat;
  private next?: PreparedBeat;
  private nextPending?: Promise<void>;
  private nowPlaying?: NowPlaying;
  private lastResult?: Snapshot["lastResult"];
  private running = false;
  private interstitialTimer?: unknown;

  constructor(private readonly deps: ShowrunnerDeps) {
    super();
    this.config = { ...DEFAULT_SHOW_CONFIG, ...deps.config, timing: { ...DEFAULT_SHOW_CONFIG.timing, ...deps.config?.timing } };
    validateTiming(this.config.timing, this.config.minVoteRemainingMs);
    this.story = deps.story;
  }

  private log(level: "info" | "warn" | "error", msg: string): void {
    this.deps.log?.(`[${level}] ${msg}`);
    this.emit("log", { level, msg, at: this.deps.clock.now() });
  }

  get clock(): Clock {
    return this.deps.clock;
  }

  /** Begin the show. Resolves once the first beat is on air. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const t = this.config.timing;
    this.log("info", `show starting: ${t.beatMs / 1000}s beats, ${t.clipMs / 1000}s clips, vote at ${t.voteOpensAtMs / 1000}s for ${t.voteDurationMs / 1000}s, speculation=${this.config.speculation}`);
    const plan = await this.deps.planner.planOpening(this.story);
    plan.beatIndex = 0;
    const prepared = this.deps.pipeline.prepareBeat(plan, projectAfter(this.story, plan, this.config.memoryBeats));
    // Cold start: give the first clip a moment, then go on air no matter what.
    await Promise.race([prepared.shots[0].promise.catch(() => undefined), this.sleep(t.coldStartMaxMs)]);
    if (!this.running) {
      prepared.abort.abort();
      return;
    }
    this.playBeat(prepared, this.speculate(prepared));
  }

  stop(): void {
    this.running = false;
    if (this.current) for (const h of this.current.timers) this.deps.clock.clearTimeout(h);
    if (this.interstitialTimer) this.deps.clock.clearTimeout(this.interstitialTimer);
    this.current?.candidates.forEach((c) => c.abort.abort());
    this.current?.prepared.abort.abort();
    this.next?.abort.abort();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => this.deps.clock.setTimeout(r, ms));
  }

  // ---------- the beat loop ----------

  private playBeat(prepared: PreparedBeat, candidates: Map<ChoiceId, Candidate>): void {
    const t = this.config.timing;
    const now = this.deps.clock.now();
    const beat: PlayingBeat = { prepared, startsAt: now, endsAt: now + t.beatMs, candidates, timers: [] };
    this.current = beat;
    this.next = undefined;
    this.story = prepared.stateAfter;
    const plan = prepared.plan;
    this.log("info", `beat ${plan.beatIndex} on air: ${plan.synopsis}`);
    this.emit("beat", { index: plan.beatIndex, plan, startsAt: beat.startsAt, endsAt: beat.endsAt });

    this.playSlot(beat, 0);
    for (let k = 1; k < slotsPerBeat(t); k++) {
      beat.timers.push(this.deps.clock.setTimeout(() => this.playSlot(beat, k), k * t.clipMs));
    }
    beat.timers.push(this.deps.clock.setTimeout(() => this.openVote(beat), t.voteOpensAtMs));
    beat.timers.push(this.deps.clock.setTimeout(() => this.closeVote(beat), t.voteOpensAtMs + t.voteDurationMs));
    beat.timers.push(this.deps.clock.setTimeout(() => this.endBeat(beat), t.beatMs));
  }

  private playSlot(beat: PlayingBeat, slot: number): void {
    if (this.current !== beat) return;
    const t = this.config.timing;
    const slotStart = beat.startsAt + slot * t.clipMs;
    const slotEnd = slotStart + t.clipMs;
    const tracked = beat.prepared.shots[slot];
    if (tracked && tracked.status === "ready" && tracked.value) {
      this.setNowPlaying({ beatIndex: beat.prepared.plan.beatIndex, slot, clip: tracked.value, startsAt: slotStart, endsAt: slotEnd, filler: false });
      return;
    }
    // Late (or failed): keep the screen alive with a filler and cut the real clip in when it lands.
    const filler = this.deps.pipeline.takeFiller(this.story, t.clipMs);
    this.log("warn", `beat ${beat.prepared.plan.beatIndex} slot ${slot} not ready (${tracked?.status ?? "missing"}); playing filler`);
    this.setNowPlaying({ beatIndex: beat.prepared.plan.beatIndex, slot, clip: filler, startsAt: slotStart, endsAt: slotEnd, filler: true });
    tracked?.promise
      .then((clip) => {
        const now = this.deps.clock.now();
        if (this.current !== beat || this.nowPlaying?.slot !== slot) return;
        if (now > slotEnd - t.minCutInMs) {
          this.log("warn", `beat ${beat.prepared.plan.beatIndex} slot ${slot} landed too late to cut in`);
          return;
        }
        this.log("info", `beat ${beat.prepared.plan.beatIndex} slot ${slot} cut in ${now - slotStart} ms late`);
        this.setNowPlaying({ beatIndex: beat.prepared.plan.beatIndex, slot, clip: { ...clip, durationMs: slotEnd - now }, startsAt: now, endsAt: slotEnd, filler: false });
      })
      .catch(() => {});
  }

  private setNowPlaying(np: NowPlaying): void {
    this.nowPlaying = np;
    this.emit("slot", np);
  }

  private openVote(beat: PlayingBeat): void {
    if (this.current !== beat) return;
    const t = this.config.timing;
    const now = this.deps.clock.now();
    const plan = beat.prepared.plan;
    const window = this.deps.votes.open({
      beatIndex: plan.beatIndex,
      targetBeatIndex: plan.beatIndex + 1,
      choices: plan.nextChoices,
      opensAt: now,
      closesAt: now + t.voteDurationMs,
    });
    this.log("info", `vote open for beat ${plan.beatIndex + 1}: ${plan.nextChoices.map((c) => `${c.id}) ${c.label}`).join("  ")}`);
    this.emit("vote_open", {
      beatIndex: window.beatIndex,
      targetBeatIndex: window.targetBeatIndex,
      choices: window.choices,
      opensAt: window.opensAt,
      closesAt: window.closesAt,
      tally: { ...window.tally },
    });
  }

  /** Called by the server whenever a vote lands so viewers can watch the tally move. */
  notifyTally(): void {
    const w = this.deps.votes.current();
    if (w && !w.result) this.emit("vote_tally", { beatIndex: w.beatIndex, tally: { ...w.tally } });
  }

  private closeVote(beat: PlayingBeat): void {
    if (this.current !== beat) return;
    const plan = beat.prepared.plan;
    const result = this.deps.votes.close();
    const choice = plan.nextChoices.find((c) => c.id === result.winner) ?? plan.nextChoices[0];
    this.lastResult = { beatIndex: plan.beatIndex, result, choice };
    this.log("info", `vote closed: ${choice.id}) ${choice.label} (${result.reason}, ${result.totalVotes} votes)`);
    this.emit("vote_closed", { beatIndex: plan.beatIndex, result, choice });

    // Losers are cancelled; the winner becomes the next beat.
    for (const [id, cand] of beat.candidates) if (id !== choice.id) cand.abort.abort();
    const winner = beat.candidates.get(choice.id);
    this.nextPending = this.buildNext(beat, choice, winner);
  }

  private async buildNext(beat: PlayingBeat, choice: Choice, winner?: Candidate): Promise<void> {
    const plan = beat.prepared.plan;
    let nextPlan: BeatPlan;
    try {
      nextPlan = winner ? await winner.plan : await this.deps.planner.planBeat(beat.prepared.stateAfter, plan.beatIndex + 1, choice, plan);
    } catch (err) {
      this.log("error", `planning beat ${plan.beatIndex + 1} failed (${(err as Error).message}); re-planning`);
      nextPlan = await this.deps.planner.planBeat(beat.prepared.stateAfter, plan.beatIndex + 1, choice, plan);
    }
    nextPlan.beatIndex = plan.beatIndex + 1;
    nextPlan.choiceTaken = choice;
    const stateAfter = projectAfter(beat.prepared.stateAfter, nextPlan, this.config.memoryBeats);
    const prepared = this.deps.pipeline.prepareBeat(nextPlan, stateAfter, { keyframe0: winner?.keyframe0, clip0: winner?.clip0 }, winner?.abort);
    if (this.current !== beat) {
      // The beat already ended while we were planning: go on air right away.
      this.next = prepared;
      return;
    }
    this.next = prepared;
    // Start writing the three beats that could follow THIS next beat, so they are ready before its vote closes.
    (prepared as PreparedBeat & { candidates?: Map<ChoiceId, Candidate> }).candidates = this.speculate(prepared);
  }

  private endBeat(beat: PlayingBeat): void {
    if (this.current !== beat) return;
    const next = this.next;
    if (next) {
      const cands = (next as PreparedBeat & { candidates?: Map<ChoiceId, Candidate> }).candidates ?? this.speculate(next);
      this.playBeat(next, cands);
      return;
    }
    // Planning is still in flight (the planner is slow or failing). Hold the screen with a filler slot and retry.
    this.log("warn", `beat ${beat.prepared.plan.beatIndex + 1} is not planned yet; holding with a filler`);
    const t = this.config.timing;
    const now = this.deps.clock.now();
    const filler = this.deps.pipeline.takeFiller(this.story, t.clipMs);
    this.setNowPlaying({ beatIndex: beat.prepared.plan.beatIndex + 1, slot: -1, clip: filler, startsAt: now, endsAt: now + t.clipMs, filler: true });
    const poll = () => {
      if (this.next) {
        const n = this.next;
        const cands = (n as PreparedBeat & { candidates?: Map<ChoiceId, Candidate> }).candidates ?? this.speculate(n);
        this.playBeat(n, cands);
      } else if (this.running) {
        this.interstitialTimer = this.deps.clock.setTimeout(poll, 1000);
      }
    };
    this.interstitialTimer = this.deps.clock.setTimeout(poll, t.clipMs);
  }

  // ---------- speculation ----------

  /** Start writing (and optionally painting) all three possible successors of a beat. */
  private speculate(prepared: PreparedBeat): Map<ChoiceId, Candidate> {
    const out = new Map<ChoiceId, Candidate>();
    const plan = prepared.plan;
    for (const choice of plan.nextChoices) {
      const abort = new AbortController();
      const planP = this.deps.planner.planBeat(prepared.stateAfter, plan.beatIndex + 1, choice, plan, abort.signal).then((p) => {
        p.beatIndex = plan.beatIndex + 1;
        p.choiceTaken = choice;
        return p;
      });
      planP.catch(() => {});
      const cand: Candidate = { choice, abort, plan: planP };
      if (this.config.speculation !== "none") {
        cand.keyframe0 = planP.then((p) => this.deps.pipeline.startKeyframe(p, 0, prepared.stateAfter, abort.signal)).catch(() => undefined);
      }
      if (this.config.speculation === "full") {
        cand.clip0 = planP.then((p) => this.deps.pipeline.startClip(p, 0, projectAfter(prepared.stateAfter, p, this.config.memoryBeats), cand.keyframe0, abort.signal, "deadline"));
        cand.clip0.catch(() => {});
      }
      out.set(choice.id, cand);
    }
    return out;
  }

  // ---------- read side ----------

  /** Full picture for a viewer who just connected. */
  snapshot(): Snapshot {
    const now = this.deps.clock.now();
    const beat = this.current;
    const w = this.deps.votes.current();
    const s = this.story;
    return {
      serverTime: now,
      timing: this.config.timing,
      story: { title: s.title, logline: s.logline, location: s.location, timeOfDay: s.timeOfDay, weather: s.weather, heat: s.heat, cash: s.cash, beatCount: s.beatCount, threads: s.threads },
      beat: beat
        ? {
            index: beat.prepared.plan.beatIndex,
            startsAt: beat.startsAt,
            endsAt: beat.endsAt,
            synopsis: beat.prepared.plan.synopsis,
            choiceTaken: beat.prepared.plan.choiceTaken,
            shots: beat.prepared.plan.shots.map((sh) => ({ role: sh.role, summary: sh.summary, location: sh.location })),
            cliffhanger: beat.prepared.plan.cliffhanger,
          }
        : undefined,
      nowPlaying: this.nowPlaying,
      vote: w
        ? { beatIndex: w.beatIndex, targetBeatIndex: w.targetBeatIndex, choices: w.choices, opensAt: w.opensAt, closesAt: w.closesAt, tally: { ...w.tally }, result: w.result }
        : undefined,
      lastResult: this.lastResult,
      pipeline: { inFlight: this.deps.pipeline.stats.inFlight, ready: this.deps.pipeline.stats.ready, failures: this.deps.pipeline.stats.failures, fillersPlayed: this.deps.pipeline.stats.fillersPlayed },
    };
  }

  currentBeatIndex(): number {
    return this.current?.prepared.plan.beatIndex ?? -1;
  }

  /** Exposed for tests: waits for the in-flight next-beat build, if any. */
  async settle(): Promise<void> {
    await this.nextPending;
  }
}
