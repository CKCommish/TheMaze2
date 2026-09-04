import { createHmac, timingSafeEqual } from "node:crypto";
import type { CreditsLedger } from "../core/index.js";

/**
 * Stripe Checkout → credits, without the Stripe SDK.
 *
 * Set up in Stripe: a Checkout Session per credit pack with metadata { viewerId, credits }.
 * Point a webhook at POST /webhooks/stripe for the event `checkout.session.completed`.
 * We verify the `Stripe-Signature` header (HMAC-SHA256 over "<timestamp>.<raw body>").
 */
export function verifyStripeSignature(rawBody: string, header: string | undefined, secret: string, toleranceSec = 300, now = Date.now()): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(now / 1000 - Number(t)) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function handleStripeEvent(rawBody: string, credits: CreditsLedger, log: (m: string) => void): { status: number; body: string } {
  let event: { type?: string; data?: { object?: { id?: string; metadata?: Record<string, string>; amount_total?: number } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: "bad json" };
  }
  if (event.type !== "checkout.session.completed") return { status: 200, body: "ignored" };
  const session = event.data?.object;
  const viewerId = session?.metadata?.viewerId;
  const amount = Number(session?.metadata?.credits ?? 0);
  if (!viewerId || !Number.isFinite(amount) || amount <= 0) return { status: 400, body: "missing viewerId/credits metadata" };
  credits.grant(viewerId, amount, `stripe ${session?.id ?? "?"} ${((session?.amount_total ?? 0) / 100).toFixed(2)}`);
  log(`stripe: granted ${amount} credits to ${viewerId}`);
  return { status: 200, body: "ok" };
}
