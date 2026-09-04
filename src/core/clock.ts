/** A clock the showrunner schedules against. Swapped for a fake in tests so 45 s takes 0 s. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
  setTimeout(fn: () => void, ms: number): unknown {
    return setTimeout(fn, Math.max(0, ms));
  }
  clearTimeout(handle: unknown): void {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

interface FakeTimer {
  id: number;
  at: number;
  seq: number;
  fn: () => void;
}

/** Deterministic clock for tests. `advance(ms)` runs every timer due in that span, in order. */
export class FakeClock implements Clock {
  private t: number;
  private timers: FakeTimer[] = [];
  private nextId = 1;
  private seq = 0;

  constructor(start = 1_000_000) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const timer: FakeTimer = { id: this.nextId++, at: this.t + Math.max(0, ms), seq: this.seq++, fn };
    this.timers.push(timer);
    return timer.id;
  }
  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((x) => x.id !== handle);
  }
  /** Advance time, firing due timers in chronological order. Pending promise work is flushed before every scan. */
  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    for (;;) {
      await flush();
      const due = this.timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at || a.seq - b.seq);
      if (due.length === 0) break;
      const next = due[0];
      this.timers = this.timers.filter((x) => x.id !== next.id);
      this.t = Math.max(this.t, next.at);
      next.fn();
    }
    this.t = target;
    await flush();
  }
  pending(): number {
    return this.timers.length;
  }
}
