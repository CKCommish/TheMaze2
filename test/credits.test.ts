import assert from "node:assert/strict";
import { test } from "node:test";
import { CreditsLedger } from "../src/core/index.js";

test("new viewers get starter credits once", () => {
  const l = new CreditsLedger({ starterCredits: 3, now: () => 1 });
  assert.equal(l.ensureViewer("a"), 3);
  assert.equal(l.ensureViewer("a"), 3);
  assert.equal(l.viewerCount(), 1);
});

test("spend fails without changing the balance when short", () => {
  const l = new CreditsLedger({ starterCredits: 0, now: () => 1 });
  l.grant("a", 2, "buy");
  assert.equal(l.spend("a", 3, "vote"), false);
  assert.equal(l.balance("a"), 2);
  assert.equal(l.spend("a", 2, "vote"), true);
  assert.equal(l.balance("a"), 0);
});

test("ledger persists and reloads", () => {
  let saved: ReturnType<CreditsLedger["toJSON"]> | undefined;
  const l = new CreditsLedger({ starterCredits: 1, now: () => 1, onChange: (x) => (saved = x.toJSON()) });
  l.ensureViewer("a");
  l.grant("a", 4, "buy");
  const l2 = new CreditsLedger({ starterCredits: 1, now: () => 1 });
  l2.load(saved);
  assert.equal(l2.balance("a"), 5);
  assert.equal(l2.toJSON().history.length, 2);
});
