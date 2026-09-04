import WebSocket from "ws";

/**
 * Twitch chat → votes, read-only and anonymous (no token needed).
 * Viewers type 1/2/3 or A/B/C. A cheer ("cheer100 2") counts its bits as value for that option.
 */
export interface TwitchIngestOptions {
  channel: string;
  onChat: (userId: string, text: string, displayName?: string) => void;
  onBits: (userId: string, bits: number, text: string, displayName?: string) => void;
  log: (msg: string) => void;
}

export function startTwitchIngest(opts: TwitchIngestOptions): { stop(): void } {
  let stopped = false;
  let ws: WebSocket | undefined;
  const channel = opts.channel.replace(/^#/, "").toLowerCase();

  const connect = () => {
    if (stopped) return;
    ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    ws.on("open", () => {
      ws!.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws!.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
      ws!.send(`JOIN #${channel}`);
      opts.log(`twitch: joined #${channel} (anonymous read)`);
    });
    ws.on("message", (data) => {
      for (const line of String(data).split("\r\n")) {
        if (!line) continue;
        if (line.startsWith("PING")) {
          ws!.send("PONG :tmi.twitch.tv");
          continue;
        }
        const m = line.match(/^(?:@([^ ]+) )?:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/);
        if (!m) continue;
        const tags = Object.fromEntries((m[1] ?? "").split(";").map((kv) => kv.split("=") as [string, string]));
        const userId = tags["user-id"] || m[2];
        const displayName = tags["display-name"] || m[2];
        const text = m[3];
        const bits = Number(tags.bits ?? 0);
        if (bits > 0) opts.onBits(userId, bits, text.replace(/cheer\d+/gi, "").trim(), displayName);
        else opts.onChat(userId, text, displayName);
      }
    });
    ws.on("close", () => {
      if (!stopped) {
        opts.log("twitch: disconnected; reconnecting in 5 s");
        setTimeout(connect, 5000);
      }
    });
    ws.on("error", (err) => opts.log(`twitch: ${err.message}`));
  };
  connect();
  return {
    stop() {
      stopped = true;
      ws?.close();
    },
  };
}
