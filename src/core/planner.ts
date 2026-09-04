import type { BeatPlan, Choice, StoryState } from "./types.js";

/**
 * The planner writes the story. Given the world and the audience's choice it returns
 * a 45-second beat as three 15-second shots, plus the next three choices.
 * Implementations: MockPlanner (no API, deterministic-ish) and ClaudePlanner (src/planner).
 */
export interface Planner {
  readonly name: string;
  /** The very first beat: no choice yet. */
  planOpening(state: StoryState, signal?: AbortSignal): Promise<BeatPlan>;
  /** Plan beat `beatIndex`, which resolves `choice`, continuing from `previous`. */
  planBeat(state: StoryState, beatIndex: number, choice: Choice, previous: BeatPlan, signal?: AbortSignal): Promise<BeatPlan>;
}

/** Wraps a planner so any failure or timeout falls back to another planner. The show must go on. */
export class ResilientPlanner implements Planner {
  readonly name: string;
  constructor(
    private readonly primary: Planner,
    private readonly fallback: Planner,
    private readonly timeoutMs: number,
    private readonly log: (msg: string) => void = () => {},
  ) {
    this.name = `${primary.name}→${fallback.name}`;
  }

  planOpening(state: StoryState, signal?: AbortSignal): Promise<BeatPlan> {
    return this.guard(() => this.primary.planOpening(state, signal), () => this.fallback.planOpening(state, signal));
  }

  planBeat(state: StoryState, beatIndex: number, choice: Choice, previous: BeatPlan, signal?: AbortSignal): Promise<BeatPlan> {
    return this.guard(
      () => this.primary.planBeat(state, beatIndex, choice, previous, signal),
      () => this.fallback.planBeat(state, beatIndex, choice, previous, signal),
    );
  }

  private async guard(run: () => Promise<BeatPlan>, fallback: () => Promise<BeatPlan>): Promise<BeatPlan> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`planner ${this.primary.name} timed out after ${this.timeoutMs} ms`)), this.timeoutMs);
      });
      return await Promise.race([run(), timeout]);
    } catch (err) {
      this.log(`planner ${this.primary.name} failed (${(err as Error).message}); using ${this.fallback.name}`);
      return fallback();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
