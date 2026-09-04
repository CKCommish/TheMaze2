import type http from "node:http";

/**
 * A fal client proxy for node:http, following fal's documented proxy contract, so the browser page
 * that holds the Director session never sees the FAL key:
 *   - GET/POST only (405), `x-fal-target-url` required (400), target must be *.fal.ai / *.fal.run (412)
 *   - forwards with `Authorization: Key <FAL_KEY>`, passes `x-fal-*` headers, mirrors the response
 *   - `wma.fal.run` (the WebRTC media host) accepts POST only
 * Access is gated by DIRECTOR_TOKEN (header `x-maze-token` or `?token=`), because every session costs money.
 */
export interface FalProxyOptions {
  key: string;
  token?: string;
  log: (msg: string) => void;
}

const DROP_RESPONSE_HEADERS = new Set(["content-length", "content-encoding", "transfer-encoding", "connection", "keep-alive"]);

function allowedTarget(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const h = url.host.toLowerCase();
  return h === "fal.ai" || h.endsWith(".fal.ai") || h === "fal.run" || h.endsWith(".fal.run");
}

export function createFalProxy(opts: FalProxyOptions): (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => Promise<void> {
  return async (req, res, url) => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      res.writeHead(405).end("method not allowed");
      return;
    }
    if (opts.token) {
      const given = (req.headers["x-maze-token"] as string | undefined) ?? url.searchParams.get("token") ?? "";
      if (given !== opts.token) {
        res.writeHead(401).end("unauthorized");
        return;
      }
    }
    const targetRaw = req.headers["x-fal-target-url"];
    const targetUrl = Array.isArray(targetRaw) ? targetRaw[0] : targetRaw;
    if (!targetUrl) {
      res.writeHead(400).end("missing x-fal-target-url");
      return;
    }
    let target: URL;
    try {
      target = new URL(targetUrl);
    } catch {
      res.writeHead(400).end("bad target");
      return;
    }
    if (!allowedTarget(target)) {
      res.writeHead(412).end("target not allowed");
      return;
    }
    if (target.host.toLowerCase() === "wma.fal.run" && method !== "POST") {
      res.writeHead(400).end("media host is POST only");
      return;
    }
    const headers: Record<string, string> = {
      authorization: `Key ${opts.key}`,
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": (req.headers["user-agent"] as string) ?? "themaze",
      "x-fal-client-proxy": "themaze/1",
    };
    for (const [k, v] of Object.entries(req.headers)) {
      if (k.toLowerCase().startsWith("x-fal-") && typeof v === "string") headers[k.toLowerCase()] = v;
    }
    const body = method === "GET" ? undefined : await new Promise<string>((resolve, reject) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
    try {
      const upstream = await fetch(target.toString(), { method, headers, body });
      const outHeaders: Record<string, string> = {};
      upstream.headers.forEach((v, k) => {
        if (!DROP_RESPONSE_HEADERS.has(k.toLowerCase())) outHeaders[k] = v;
      });
      res.writeHead(upstream.status, outHeaders);
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      opts.log(`fal proxy error: ${(err as Error).message}`);
      res.writeHead(502).end("upstream error");
    }
  };
}
