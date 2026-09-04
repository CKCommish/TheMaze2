import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { isChoice, type ChoiceId, type CreditsLedger, type Showrunner, type VoteEngine, type VoteSource } from "../core/index.js";
import { createFalProxy } from "./fal-proxy.js";
import { handleStripeEvent, verifyStripeSignature } from "./stripe.js";

export interface GiftMap {
  A: string;
  B: string;
  C: string;
}

export interface ShowServerOptions {
  showrunner: Showrunner;
  votes: VoteEngine;
  credits: CreditsLedger;
  port: number;
  webDir: string;
  /** Allow viewers to grant themselves credits (demo only). */
  devGrants: boolean;
  /** Display rate for normalizing coins to dollars. */
  coinUsd: number;
  voteMode: "value" | "count";
  voteCost: number;
  giftMap: GiftMap;
  aspectRatio: "16:9" | "9:16";
  stripeWebhookSecret?: string;
  /** "clips" (rendered files) or "director" (one continuous H3 Max Director stream). */
  renderer: "clips" | "director";
  director?: { resolution: "480p" | "768p"; memory: number; sessionSeconds: number; prewarmSeconds: number; token?: string; preamble: string; falKey: string };
  log: (msg: string) => void;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
};

function readBody(req: http.IncomingMessage, limit = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

export interface ShowServer {
  server: http.Server;
  /** Feed a vote from a platform adapter (Twitch/TikTok chat). */
  castExternal(source: VoteSource, userId: string, text: string, displayName?: string): void;
  /** Feed a gift from a platform adapter. */
  giftExternal(source: VoteSource, userId: string, coins: number, giftName?: string, displayName?: string): void;
  broadcast(msg: Record<string, unknown>): void;
  close(): void;
}

export function createShowServer(opts: ShowServerOptions): ShowServer {
  const { showrunner, votes, credits, log } = opts;
  const clients = new Map<WebSocket, { viewerId?: string }>();

  const falProxy = opts.director ? createFalProxy({ key: opts.director.falKey, token: opts.director.token, log }) : undefined;
  const settings = () => ({
    renderer: opts.renderer,
    director: opts.director ? { resolution: opts.director.resolution, memory: opts.director.memory, sessionSeconds: opts.director.sessionSeconds, prewarmSeconds: opts.director.prewarmSeconds } : null,
    directorPreamble: opts.director?.preamble ?? "",
    voteMode: opts.voteMode,
    voteCost: opts.voteCost,
    coinUsd: opts.coinUsd,
    giftMap: opts.giftMap,
    aspectRatio: opts.aspectRatio,
    devGrants: opts.devGrants,
  });

  const broadcast = (msg: Record<string, unknown>) => {
    const data = JSON.stringify({ ...msg, serverTime: showrunner.clock.now() });
    for (const ws of clients.keys()) if (ws.readyState === ws.OPEN) ws.send(data);
  };

  // ---- showrunner → viewers ----
  showrunner.on("beat", (e) => broadcast({ type: "beat", beat: { index: e.index, startsAt: e.startsAt, endsAt: e.endsAt, synopsis: e.plan.synopsis, choiceTaken: e.plan.choiceTaken, shots: e.plan.shots.map((s) => ({ role: s.role, summary: s.summary, location: s.location })), cliffhanger: e.plan.cliffhanger }, story: showrunner.snapshot().story }));
  showrunner.on("slot", (np) => broadcast({ type: "slot", nowPlaying: np }));
  showrunner.on("vote_open", (v) => broadcast({ type: "vote_open", vote: v }));
  showrunner.on("vote_tally", (t) => broadcast({ type: "vote_tally", ...t, voters: votes.voterCount() }));
  showrunner.on("vote_closed", (r) => broadcast({ type: "vote_closed", ...r }));
  showrunner.on("log", (l) => broadcast({ type: "log", ...l }));

  const castExternal = (source: VoteSource, userId: string, text: string, displayName?: string) => {
    const r = votes.select(userId, text, source);
    if (r.ok) {
      showrunner.notifyTally();
      broadcast({ type: "external_vote", source, displayName: displayName ?? userId, choiceId: parseChoiceForDisplay(text) });
    }
  };
  const giftExternal = (source: VoteSource, userId: string, coins: number, giftName?: string, displayName?: string) => {
    const selects = giftSelects(opts.giftMap, giftName);
    const credited = votes.gift({ userId, source, coins, selects, giftName, displayName });
    showrunner.notifyTally();
    broadcast({ type: "gift", source, displayName: displayName ?? userId, coins, giftName, choiceId: credited ?? null });
  };

  // ---- HTTP ----
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/api/fal/proxy") {
        if (!falProxy) return sendJson(res, 404, { ok: false, reason: "director mode is off" });
        return falProxy(req, res, url);
      }
      if (req.method === "GET" && url.pathname === "/health") return sendJson(res, 200, { ok: true, beat: showrunner.currentBeatIndex() });
      if (req.method === "GET" && url.pathname === "/api/snapshot") return sendJson(res, 200, { snapshot: showrunner.snapshot(), settings: settings() });
      if (req.method === "POST" && url.pathname === "/api/vote") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const viewerId = String(body.viewerId ?? "");
        const choiceId = String(body.choiceId ?? "");
        if (!viewerId || !isChoice(choiceId)) return sendJson(res, 400, { ok: false, reason: "bad_request" });
        const result = votes.cast(viewerId, choiceId, "web", Number(body.value ?? opts.voteCost));
        showrunner.notifyTally();
        return sendJson(res, 200, { ...result, tally: votes.tally() });
      }
      if (req.method === "POST" && url.pathname === "/api/credits/dev-grant") {
        if (!opts.devGrants) return sendJson(res, 403, { ok: false, reason: "disabled" });
        const body = JSON.parse((await readBody(req)) || "{}");
        const viewerId = String(body.viewerId ?? "");
        if (!viewerId) return sendJson(res, 400, { ok: false });
        credits.ensureViewer(viewerId);
        const balance = credits.grant(viewerId, Math.min(100, Math.max(1, Number(body.amount ?? 10))), "dev-grant");
        return sendJson(res, 200, { ok: true, balance });
      }
      // Demo only: pretend a TikTok viewer sent a gift or a comment, so the overlay can be seen without going live.
      if (req.method === "POST" && url.pathname === "/api/dev/gift") {
        if (!opts.devGrants) return sendJson(res, 403, { ok: false, reason: "disabled" });
        const body = JSON.parse((await readBody(req)) || "{}");
        const coins = Math.max(1, Math.min(100_000, Number(body.coins ?? 1)));
        giftExternal("tiktok", String(body.userId ?? "tester"), coins, body.giftName ? String(body.giftName) : undefined, body.displayName ? String(body.displayName) : undefined);
        return sendJson(res, 200, { ok: true, tally: votes.tally(), open: votes.isOpen() });
      }
      if (req.method === "POST" && url.pathname === "/api/dev/chat") {
        if (!opts.devGrants) return sendJson(res, 403, { ok: false, reason: "disabled" });
        const body = JSON.parse((await readBody(req)) || "{}");
        castExternal("tiktok", String(body.userId ?? "tester"), String(body.text ?? ""), body.displayName ? String(body.displayName) : undefined);
        return sendJson(res, 200, { ok: true, tally: votes.tally(), open: votes.isOpen() });
      }
      if (req.method === "POST" && url.pathname === "/webhooks/stripe") {
        const raw = await readBody(req);
        if (!opts.stripeWebhookSecret || !verifyStripeSignature(raw, req.headers["stripe-signature"] as string | undefined, opts.stripeWebhookSecret)) {
          res.writeHead(400).end("bad signature");
          return;
        }
        const out = handleStripeEvent(raw, credits, log);
        res.writeHead(out.status).end(out.body);
        return;
      }
      // static
      if (req.method === "GET") {
        let p = url.pathname === "/" ? "/index.html" : url.pathname;
        p = path.normalize(p).replace(/^(\.\.[/\\])+/, "");
        const file = path.join(opts.webDir, p);
        if (!file.startsWith(opts.webDir)) {
          res.writeHead(403).end();
          return;
        }
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
          fs.createReadStream(file).pipe(res);
          return;
        }
      }
      res.writeHead(404).end("not found");
    } catch (err) {
      log(`http error: ${(err as Error).message}`);
      if (!res.headersSent) sendJson(res, 500, { ok: false });
    }
  });

  // ---- WebSocket ----
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    clients.set(ws, {});
    ws.on("message", (raw) => {
      let msg: { type?: string; viewerId?: string; choiceId?: string; value?: number };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const c = clients.get(ws)!;
      if (msg.type === "hello") {
        c.viewerId = String(msg.viewerId ?? "").slice(0, 64) || undefined;
        if (c.viewerId) credits.ensureViewer(c.viewerId);
        ws.send(JSON.stringify({ type: "snapshot", snapshot: showrunner.snapshot(), settings: settings(), viewer: c.viewerId ? { id: c.viewerId, credits: credits.balance(c.viewerId) } : undefined, serverTime: showrunner.clock.now() }));
      } else if (msg.type === "vote") {
        if (!c.viewerId) return ws.send(JSON.stringify({ type: "vote_ack", ok: false, reason: "no_viewer" }));
        const choiceId = String(msg.choiceId ?? "");
        if (!isChoice(choiceId)) return;
        const result = votes.cast(c.viewerId, choiceId, "web", Number(msg.value ?? opts.voteCost));
        ws.send(JSON.stringify({ type: "vote_ack", ...result, choiceId, tally: votes.tally(), serverTime: showrunner.clock.now() }));
        showrunner.notifyTally();
      } else if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", serverTime: showrunner.clock.now() }));
      }
    });
    ws.on("close", () => clients.delete(ws));
  });

  server.listen(opts.port, () => log(`web player on http://localhost:${opts.port}  (TV overlay: /?tv=1)`));

  return { server, castExternal, giftExternal, broadcast, close: () => { wss.close(); server.close(); } };
}

function parseChoiceForDisplay(text: string): ChoiceId | undefined {
  const t = text.trim().toUpperCase();
  return t === "1" || t === "A" ? "A" : t === "2" || t === "B" ? "B" : t === "3" || t === "C" ? "C" : undefined;
}

/** Which option a named gift selects, per the gift map (case-insensitive). */
export function giftSelects(map: GiftMap, giftName?: string): ChoiceId | undefined {
  if (!giftName) return undefined;
  const n = giftName.trim().toLowerCase();
  for (const id of ["A", "B", "C"] as ChoiceId[]) if (map[id].trim().toLowerCase() === n) return id;
  return undefined;
}
