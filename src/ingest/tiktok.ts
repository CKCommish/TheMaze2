import { TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";

/**
 * TikTok LIVE → votes. Reads comments and gifts from a live room using tiktok-live-connector
 * (an unofficial, reverse-engineered client; TikTok publishes no LIVE API, see docs/04-platforms.md).
 *
 * Rules implemented here:
 *  - a comment "1", "2", "3", "A", "B" or "C" picks where the viewer's gifts go this vote
 *  - a gift whose name matches the gift map (e.g. Rose = A) picks the option AND counts its value
 *  - any other gift counts toward the viewer's current pick; gift value = coins × repeat count
 *  - streakable gifts (tap-to-combo) are counted once, when the streak ends
 */
export interface TikTokIngestOptions {
  username: string;
  /** Euler Stream sign-server key (optional; the free tier works for small rooms). */
  signApiKey?: string;
  onChat: (userId: string, text: string, displayName?: string) => void;
  onGift: (userId: string, coins: number, giftName?: string, displayName?: string) => void;
  log: (msg: string) => void;
}

interface GiftLike {
  giftId?: string | number;
  repeatCount?: number;
  repeatEnd?: number | boolean;
  user?: { id?: string; displayId?: string; nickname?: string };
  gift?: { id?: string | number; name?: string; type?: number; diamondCount?: number; combo?: boolean };
  extendedGiftInfo?: { diamond_count?: number; name?: string; type?: number };
}

/** The connector's emitter typing depends on an optional package; this is the surface we use. */
interface ConnectionLike {
  on(event: string, handler: (m: never) => void): unknown;
  connect(): Promise<unknown>;
  disconnect?(): unknown;
}

export function startTikTokIngest(opts: TikTokIngestOptions): { stop(): void } {
  let stopped = false;
  let conn: ConnectionLike | undefined;

  const connect = async () => {
    if (stopped) return;
    conn = new TikTokLiveConnection(opts.username, {
      signApiKey: opts.signApiKey,
      enableExtendedGiftInfo: true,
      processInitialData: false,
    }) as unknown as ConnectionLike;

    conn.on(WebcastEvent.CHAT, (m: { user?: { id?: string; displayId?: string; nickname?: string }; content?: string }) => {
      const id = m.user?.id ?? m.user?.displayId;
      if (!id || !m.content) return;
      opts.onChat(String(id), m.content, m.user?.nickname ?? m.user?.displayId);
    });

    conn.on(WebcastEvent.GIFT, (m: GiftLike) => {
      const id = m.user?.id ?? m.user?.displayId;
      if (!id) return;
      const unit = m.gift?.diamondCount ?? m.extendedGiftInfo?.diamond_count ?? 0;
      const streakable = (m.gift?.type ?? m.extendedGiftInfo?.type) === 1 || m.gift?.combo === true;
      if (streakable && !m.repeatEnd) return; // wait for the end of the tap-combo; the final message carries the total
      const coins = unit * Math.max(1, m.repeatCount ?? 1);
      opts.onGift(String(id), coins, m.gift?.name ?? m.extendedGiftInfo?.name, m.user?.nickname ?? m.user?.displayId);
    });

    try {
      const state = await conn.connect();
      opts.log(`tiktok: connected to @${opts.username} (room ${(state as { roomId?: string }).roomId ?? "?"})`);
    } catch (err) {
      opts.log(`tiktok: connect failed (${(err as Error).message}); retrying in 30 s`);
      setTimeout(connect, 30_000);
      return;
    }
    conn.on("disconnected", () => {
      opts.log("tiktok: disconnected; reconnecting in 10 s");
      if (!stopped) setTimeout(connect, 10_000);
    });
  };

  void connect();
  return {
    stop() {
      stopped = true;
      conn?.disconnect?.();
    },
  };
}
