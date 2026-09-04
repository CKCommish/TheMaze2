import { ClipPipeline, CreditsLedger, FakeClock, MockImageProvider, MockPlanner, MockVideoProvider, Showrunner, VoteEngine, defaultStory, type ShowConfig, type ShowrunnerEvents } from "../src/core/index.js";

export interface Harness {
  clock: FakeClock;
  showrunner: Showrunner;
  votes: VoteEngine;
  credits: CreditsLedger;
  pipeline: ClipPipeline;
  events: { name: keyof ShowrunnerEvents; at: number; payload: unknown }[];
}

export function harness(opts: { videoLatency?: number | (() => number); imageLatency?: number; failureRate?: number; config?: Partial<ShowConfig>; random?: () => number } = {}): Harness {
  const clock = new FakeClock(1_000_000);
  const credits = new CreditsLedger({ starterCredits: opts.config?.starterCredits ?? 3, now: () => clock.now() });
  const votes = new VoteEngine({ clock, credits, voteCost: opts.config?.voteCost ?? 1, chatVotePolicy: "free", random: opts.random ?? (() => 0) });
  const pipeline = new ClipPipeline({
    clock,
    video: new MockVideoProvider({ clock, latencyMs: opts.videoLatency ?? 6000, failureRate: opts.failureRate ?? 0, random: opts.random ?? (() => 0.5) }),
    image: new MockImageProvider({ clock, latencyMs: opts.imageLatency ?? 1500 }),
    mode: "keyframe-i2v",
    clipMs: 15_000,
    aspectRatio: "16:9",
  });
  const showrunner = new Showrunner({ clock, planner: new MockPlanner(), pipeline, votes, story: defaultStory(), config: opts.config });
  const events: Harness["events"] = [];
  for (const name of ["beat", "slot", "vote_open", "vote_closed", "vote_tally", "log"] as (keyof ShowrunnerEvents)[]) {
    showrunner.on(name, (payload) => events.push({ name, at: clock.now(), payload }));
  }
  return { clock, showrunner, votes, credits, pipeline, events };
}

/** Starts the show and advances the fake clock until the first beat is on air. */
export async function startShow(h: Harness, warmupMs = 10_000): Promise<number> {
  const started = h.showrunner.start();
  await h.clock.advance(warmupMs);
  await started;
  const beat = h.events.find((e) => e.name === "beat");
  if (!beat) throw new Error("show did not start");
  return beat.at;
}
