/**
 * The show's clock. Every number here is in milliseconds.
 *
 * A "beat" is one 45-second chunk of story. Each beat is three 15-second clips
 * ("slots"). The audience votes ONCE per beat, during the second slot, so that
 * the vote closes while there are still 25 seconds of the current beat left to
 * generate the next one. The action never stops: if a clip is late, a filler
 * plays and the real clip cuts in as soon as it lands.
 */
export interface Timing {
  /** Length of one beat (one audience decision). */
  beatMs: number;
  /** Length of one generated clip. beatMs must be a whole multiple of this. */
  clipMs: number;
  /** When the vote opens, measured from the start of the beat. */
  voteOpensAtMs: number;
  /** How long the audience has to vote. */
  voteDurationMs: number;
  /** A clip must be ready this long before its slot starts to be used from the top. */
  readyMarginMs: number;
  /** If a late clip lands with less than this left in its slot, skip it (keep the filler). */
  minCutInMs: number;
  /** Cold start: how long to wait for the very first clip before playing a title-card filler. */
  coldStartMaxMs: number;
}

export const DEFAULT_TIMING: Timing = {
  beatMs: 45_000,
  clipMs: 15_000,
  voteOpensAtMs: 15_000, // 30 s remaining
  voteDurationMs: 5_000, // closes with 25 s remaining
  readyMarginMs: 750,
  minCutInMs: 3_000,
  coldStartMaxMs: 60_000,
};

/** The user's rule: the vote must happen while 20–30 seconds of the beat remain. */
export const VOTE_WINDOW_RULE = { minRemainingMs: 20_000, maxRemainingMs: 30_000 };

export function slotsPerBeat(t: Timing): number {
  return Math.round(t.beatMs / t.clipMs);
}

/** Throws if the timing breaks the show's rules. Called once at startup and in tests. */
export function validateTiming(t: Timing): void {
  if (t.beatMs % t.clipMs !== 0) {
    throw new Error(`beatMs (${t.beatMs}) must be a whole multiple of clipMs (${t.clipMs})`);
  }
  const remainingAtOpen = t.beatMs - t.voteOpensAtMs;
  const remainingAtClose = t.beatMs - (t.voteOpensAtMs + t.voteDurationMs);
  if (remainingAtOpen > VOTE_WINDOW_RULE.maxRemainingMs) {
    throw new Error(`vote opens too early: ${remainingAtOpen} ms remain (max ${VOTE_WINDOW_RULE.maxRemainingMs})`);
  }
  if (remainingAtClose < VOTE_WINDOW_RULE.minRemainingMs) {
    throw new Error(`vote closes too late: ${remainingAtClose} ms remain (min ${VOTE_WINDOW_RULE.minRemainingMs})`);
  }
  if (t.voteDurationMs <= 0 || t.readyMarginMs < 0 || t.minCutInMs < 0) {
    throw new Error("timing values must be positive");
  }
}

export type Speculation = "none" | "keyframes" | "full";

export interface ShowConfig {
  timing: Timing;
  /** How much of the NEXT beat to pre-generate before the vote closes. */
  speculation: Speculation;
  /** Credits one vote costs. */
  voteCost: number;
  /** Free credits a brand-new viewer receives. */
  starterCredits: number;
  /** Whether votes from platform chat (Twitch/TikTok) need credits. On those platforms, gifts/bits map to credits instead. */
  chatVotePolicy: "free" | "requires_credits";
  /** How many past beats the planner remembers in detail. */
  memoryBeats: number;
}

export const DEFAULT_SHOW_CONFIG: ShowConfig = {
  timing: DEFAULT_TIMING,
  speculation: "keyframes",
  voteCost: 1,
  starterCredits: 3,
  chatVotePolicy: "free",
  memoryBeats: 8,
};
