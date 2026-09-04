/** Tiny typed event emitter that works in Node and the browser (no node:events). */
export class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as (payload: never) => void);
    return () => this.off(event, fn);
  }

  off<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): void {
    this.listeners.get(event)?.delete(fn as (payload: never) => void);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        (fn as (p: Events[K]) => void)(payload);
      } catch (err) {
        // a bad listener must never stop the show
        console.error(`[emitter] listener for ${String(event)} threw`, err);
      }
    }
  }
}
