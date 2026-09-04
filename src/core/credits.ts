/**
 * Credits ledger. Watching is free; voting costs credits.
 * In-memory with an optional persistence hook (the Node entry writes a JSON file).
 * Production note: swap for a database table and make spend() atomic.
 */
export interface LedgerEntry {
  at: number;
  viewerId: string;
  delta: number;
  reason: string;
}

export interface CreditsOptions {
  starterCredits: number;
  now?: () => number;
  /** Called after every change so the host can persist. */
  onChange?: (ledger: CreditsLedger) => void;
}

export class CreditsLedger {
  private balances = new Map<string, number>();
  private history: LedgerEntry[] = [];
  private readonly starter: number;
  private readonly now: () => number;
  private readonly onChange?: (ledger: CreditsLedger) => void;

  constructor(opts: CreditsOptions) {
    this.starter = opts.starterCredits;
    this.now = opts.now ?? (() => Date.now());
    this.onChange = opts.onChange;
  }

  /** Make sure a viewer exists; brand-new viewers get the starter grant. */
  ensureViewer(viewerId: string): number {
    if (!this.balances.has(viewerId)) {
      this.balances.set(viewerId, 0);
      if (this.starter > 0) this.grant(viewerId, this.starter, "starter");
    }
    return this.balances.get(viewerId)!;
  }

  balance(viewerId: string): number {
    return this.balances.get(viewerId) ?? 0;
  }

  grant(viewerId: string, amount: number, reason: string): number {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("grant amount must be positive");
    const next = this.balance(viewerId) + Math.floor(amount);
    this.balances.set(viewerId, next);
    this.record(viewerId, Math.floor(amount), reason);
    return next;
  }

  /** Returns false (and changes nothing) if the viewer cannot afford it. */
  spend(viewerId: string, amount: number, reason: string): boolean {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("spend amount must be >= 0");
    if (amount === 0) return true;
    const bal = this.balance(viewerId);
    if (bal < amount) return false;
    this.balances.set(viewerId, bal - amount);
    this.record(viewerId, -amount, reason);
    return true;
  }

  private record(viewerId: string, delta: number, reason: string): void {
    this.history.push({ at: this.now(), viewerId, delta, reason });
    if (this.history.length > 10_000) this.history.splice(0, this.history.length - 10_000);
    this.onChange?.(this);
  }

  toJSON(): { balances: Record<string, number>; history: LedgerEntry[] } {
    return { balances: Object.fromEntries(this.balances), history: this.history.slice(-2000) };
  }

  load(data: { balances?: Record<string, number>; history?: LedgerEntry[] } | undefined): void {
    if (!data) return;
    for (const [k, v] of Object.entries(data.balances ?? {})) this.balances.set(k, v);
    this.history = data.history ?? [];
  }

  viewerCount(): number {
    return this.balances.size;
  }
}
