import type { Clock } from "./clock.js";
import type { CreditsLedger } from "./credits.js";
import type { CastResult, Choice, ChoiceId, VoteResult, VoteSource, VoteTally, VoteWindow } from "./types.js";

/**
 * Two ways to count a vote:
 *
 *  - "value" (default): every vote carries a value in COINS (TikTok's unit). A gift worth 500 coins
 *    counts 500; a website viewer spending 3 credits counts 3. Viewers may keep adding. The option
 *    with the highest TOTAL VALUE wins. This is the "donations are votes" model.
 *  - "count": one vote per viewer per window, each worth 1. Classic poll.
 */
export type VoteMode = "value" | "count";

export interface VoteEngineOptions {
  clock: Clock;
  credits: CreditsLedger;
  mode?: VoteMode;
  /** Credits (= coins) a website vote costs at minimum. */
  voteCost: number;
  /** Whether plain chat messages from platforms count as votes (they carry no money). */
  chatVotePolicy: "free" | "requires_credits";
  /** Value of a free chat vote in coins when chatVotePolicy is "free" (0 = advisory only). */
  chatVoteValue?: number;
  /** Deterministic tie-breaks in tests. */
  random?: () => number;
}

export interface OpenSpec {
  beatIndex: number;
  targetBeatIndex: number;
  choices: [Choice, Choice, Choice];
  opensAt: number;
  closesAt: number;
}

export interface GiftVote {
  /** Platform user id (unique per platform). */
  userId: string;
  displayName?: string;
  source: VoteSource;
  /** Gift value in coins (unit price × repeat count). */
  coins: number;
  /** The option the gift selects, if the gift itself is a selector (e.g. Rose = A). */
  selects?: ChoiceId;
  giftName?: string;
}

export class VoteEngine {
  private window: VoteWindow | null = null;
  /** Sticky selection per platform user: which option their gifts go to. */
  private selections = new Map<string, ChoiceId>();
  private readonly clock: Clock;
  private readonly credits: CreditsLedger;
  private readonly mode: VoteMode;
  private readonly voteCost: number;
  private readonly chatVotePolicy: "free" | "requires_credits";
  private readonly chatVoteValue: number;
  private readonly random: () => number;
  /** Coins that arrived while no vote was open (still revenue; shown in the log). */
  uncountedCoins = 0;

  constructor(opts: VoteEngineOptions) {
    this.clock = opts.clock;
    this.credits = opts.credits;
    this.mode = opts.mode ?? "value";
    this.voteCost = opts.voteCost;
    this.chatVotePolicy = opts.chatVotePolicy;
    this.chatVoteValue = opts.chatVoteValue ?? 1;
    this.random = opts.random ?? Math.random;
  }

  open(spec: OpenSpec): VoteWindow {
    this.window = { ...spec, tally: { A: 0, B: 0, C: 0 }, voters: new Set() };
    return this.window;
  }

  current(): VoteWindow | null {
    return this.window;
  }

  isOpen(): boolean {
    const w = this.window;
    if (!w || w.result) return false;
    const now = this.clock.now();
    return now >= w.opensAt && now < w.closesAt;
  }

  /**
   * A website viewer votes. In "value" mode `value` is how many credits they put on the option
   * (minimum voteCost); they may vote again to add more. In "count" mode it is one vote, once.
   */
  cast(viewerId: string, choiceId: string, source: VoteSource = "web", value = this.voteCost): CastResult {
    const w = this.window;
    if (!w || !this.isOpen()) return { ok: false, reason: "closed" };
    if (!isChoice(choiceId)) return { ok: false, reason: "bad_choice" };
    const key = `${source}:${viewerId}`;
    const paid = source === "web" || source === "sim" || this.chatVotePolicy === "requires_credits";

    if (this.mode === "count") {
      if (w.voters.has(key)) return { ok: false, reason: "already_voted", balance: this.credits.balance(viewerId) };
      if (paid) {
        this.credits.ensureViewer(viewerId);
        if (!this.credits.spend(viewerId, this.voteCost, `vote beat ${w.targetBeatIndex} ${choiceId}`)) {
          return { ok: false, reason: "no_credits", balance: this.credits.balance(viewerId) };
        }
      }
      w.voters.add(key);
      w.tally[choiceId] += 1;
      return { ok: true, balance: this.credits.balance(viewerId) };
    }

    // value mode
    let amount = Math.max(1, Math.floor(value));
    if (paid) {
      amount = Math.max(this.voteCost, amount);
      this.credits.ensureViewer(viewerId);
      if (!this.credits.spend(viewerId, amount, `vote beat ${w.targetBeatIndex} ${choiceId} x${amount}`)) {
        return { ok: false, reason: "no_credits", balance: this.credits.balance(viewerId) };
      }
    } else {
      // a free chat vote: advisory value, once per user per window
      if (w.voters.has(key)) {
        this.selections.set(key, choiceId);
        return { ok: false, reason: "already_voted" };
      }
      amount = this.chatVoteValue;
    }
    w.voters.add(key);
    this.selections.set(key, choiceId);
    w.tally[choiceId] += amount;
    return { ok: true, balance: this.credits.balance(viewerId) };
  }

  /** A chat message like "2" or "B" picks where a viewer's later gifts go (and may count as a free vote). */
  select(userId: string, choiceOrText: string, source: VoteSource): CastResult {
    const choiceId = isChoice(choiceOrText) ? choiceOrText : parseChoiceMessage(choiceOrText);
    if (!choiceId) return { ok: false, reason: "bad_choice" };
    const key = `${source}:${userId}`;
    this.selections.set(key, choiceId);
    if (this.chatVotePolicy === "free" && this.chatVoteValue > 0) return this.cast(userId, choiceId, source);
    return { ok: true };
  }

  /**
   * A gift arrived. If it is a selector gift (e.g. Rose = A) it picks the option AND counts its value.
   * Otherwise its value goes to the option the viewer selected earlier this window. Returns the option
   * credited, or undefined if the gift could not be counted (no open vote, no selection).
   */
  gift(g: GiftVote): ChoiceId | undefined {
    const w = this.window;
    const key = `${g.source}:${g.userId}`;
    if (g.selects) this.selections.set(key, g.selects);
    const coins = Math.max(0, Math.floor(g.coins));
    if (!w || !this.isOpen()) {
      this.uncountedCoins += coins;
      return undefined;
    }
    const target = g.selects ?? this.selections.get(key);
    if (!target) {
      this.uncountedCoins += coins;
      return undefined;
    }
    if (this.mode === "count") {
      if (w.voters.has(key)) return target;
      w.voters.add(key);
      w.tally[target] += 1;
      return target;
    }
    w.voters.add(key);
    w.tally[target] += coins;
    return target;
  }

  /** Closes the window and decides the winner. Safe to call more than once. */
  close(): VoteResult {
    const w = this.window;
    if (!w) throw new Error("no vote window to close");
    if (w.result) return w.result;
    w.result = decide(w.tally, this.random);
    // selections are per window
    this.selections.clear();
    return w.result;
  }

  tally(): VoteTally | null {
    return this.window ? { ...this.window.tally } : null;
  }

  voterCount(): number {
    return this.window?.voters.size ?? 0;
  }
}

export function isChoice(id: string): id is ChoiceId {
  return id === "A" || id === "B" || id === "C";
}

/** Maps a chat message to a choice: "1"/"2"/"3", "a"/"b"/"c", "!vote 2", "vote b". */
export function parseChoiceMessage(text: string): ChoiceId | undefined {
  const m = text.trim().toLowerCase().match(/^(?:!?vote\s*)?([abc123])\b/);
  if (!m) return undefined;
  const map: Record<string, ChoiceId> = { "1": "A", "2": "B", "3": "C", a: "A", b: "B", c: "C" };
  return map[m[1]];
}

export function decide(tally: VoteTally, random: () => number = Math.random): VoteResult {
  const total = tally.A + tally.B + tally.C;
  if (total === 0) {
    // Nobody voted: the show must go on. Default to option A (the planner's "most natural" continuation).
    return { winner: "A", tally: { ...tally }, totalVotes: 0, reason: "no-votes-default" };
  }
  const max = Math.max(tally.A, tally.B, tally.C);
  const leaders = (["A", "B", "C"] as ChoiceId[]).filter((id) => tally[id] === max);
  if (leaders.length === 1) return { winner: leaders[0], tally: { ...tally }, totalVotes: total, reason: "majority" };
  const pick = leaders[Math.min(leaders.length - 1, Math.floor(random() * leaders.length))];
  return { winner: pick, tally: { ...tally }, totalVotes: total, reason: "tiebreak-random" };
}
