import type { Clock } from "./clock.js";
import type { CreditsLedger } from "./credits.js";
import type { CastResult, Choice, ChoiceId, VoteResult, VoteSource, VoteTally, VoteWindow } from "./types.js";

/**
 * GIFTS ARE THE VOTE. On TikTok a viewer votes by sending the option's gift (Rose = A, GG = B,
 * Ice Cream Cone = C). That gift picks the option AND counts its coin value. Every gift the same
 * viewer sends afterwards in the window adds to that pick. A big gift sent before picking is held
 * and lands the moment the viewer picks. Comments do nothing unless `commentsSelect` is turned on.
 *
 * Two ways to count:
 *  - "value" (default): the option with the highest TOTAL COIN VALUE wins (a 1,000-coin Galaxy
 *    beats three hundred Roses). Website viewers spend credits as value the same way.
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
  /** Value of a free chat vote in coins when chatVotePolicy is "free". Default 0: comments carry no weight. */
  chatVoteValue?: number;
  /** Whether a comment like "2" may pick where a viewer's later gifts go. Default false: gifts only. */
  commentsSelect?: boolean;
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
  /** Coins from viewers who gifted before picking; applied the moment they pick. */
  private pending = new Map<string, number>();
  private readonly clock: Clock;
  private readonly credits: CreditsLedger;
  private readonly mode: VoteMode;
  private readonly voteCost: number;
  private readonly chatVotePolicy: "free" | "requires_credits";
  private readonly chatVoteValue: number;
  private readonly commentsSelect: boolean;
  private readonly random: () => number;
  /** Coins that arrived while no vote was open (still revenue; shown in the log). */
  uncountedCoins = 0;

  constructor(opts: VoteEngineOptions) {
    this.clock = opts.clock;
    this.credits = opts.credits;
    this.mode = opts.mode ?? "value";
    this.voteCost = opts.voteCost;
    this.chatVotePolicy = opts.chatVotePolicy;
    this.chatVoteValue = opts.chatVoteValue ?? 0;
    this.commentsSelect = opts.commentsSelect ?? false;
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
      // a free chat vote: only if the show allows comments to count, once per user per window
      if (this.chatVoteValue <= 0) return { ok: false, reason: "gifts_only" };
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

  /**
   * A chat message like "2" or "B". By default it does nothing (gifts are the vote). With
   * `commentsSelect` it picks where the viewer's later gifts go, and with `chatVoteValue` > 0 it also
   * counts as a small free vote.
   */
  select(userId: string, choiceOrText: string, source: VoteSource): CastResult {
    if (!this.commentsSelect) return { ok: false, reason: "gifts_only" };
    const choiceId = isChoice(choiceOrText) ? choiceOrText : parseChoiceMessage(choiceOrText);
    if (!choiceId) return { ok: false, reason: "bad_choice" };
    const key = `${source}:${userId}`;
    this.selections.set(key, choiceId);
    this.applyPending(key, choiceId);
    if (this.chatVotePolicy === "free" && this.chatVoteValue > 0) return this.cast(userId, choiceId, source);
    return { ok: true };
  }

  /** Coins a viewer sent before picking land on their pick. */
  private applyPending(key: string, target: ChoiceId): void {
    const held = this.pending.get(key) ?? 0;
    if (held > 0 && this.window && !this.window.result) {
      this.window.tally[target] += this.mode === "count" ? 0 : held;
      this.pending.delete(key);
    }
  }

  /**
   * A gift arrived. If it is a selector gift (e.g. Rose = A) it picks the option AND counts its value.
   * Otherwise its value goes to the option the viewer picked earlier this window. A gift from a viewer
   * who has not picked yet is HELD and lands when they pick (before the window closes). Returns the
   * option credited, or undefined if the gift is not (yet) a vote.
   */
  gift(g: GiftVote): ChoiceId | undefined {
    const w = this.window;
    const key = `${g.source}:${g.userId}`;
    const coins = Math.max(0, Math.floor(g.coins));
    if (!w || !this.isOpen()) {
      this.uncountedCoins += coins;
      return undefined;
    }
    if (g.selects) {
      this.selections.set(key, g.selects);
      this.applyPending(key, g.selects);
    }
    const target = g.selects ?? this.selections.get(key);
    if (!target) {
      this.pending.set(key, (this.pending.get(key) ?? 0) + coins);
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
    // selections and held gifts are per window; held coins that never landed are just revenue
    for (const held of this.pending.values()) this.uncountedCoins += held;
    this.pending.clear();
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
