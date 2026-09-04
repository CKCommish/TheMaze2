import assert from "node:assert/strict";
import { test } from "node:test";
import { CreditsLedger, FakeClock, VoteEngine, decide, parseChoiceMessage, type Choice, type VoteMode } from "../src/core/index.js";

const choices: [Choice, Choice, Choice] = [
  { id: "A", label: "A", hook: "", intent: "" },
  { id: "B", label: "B", hook: "", intent: "" },
  { id: "C", label: "C", hook: "", intent: "" },
];

function setup(opts: { mode?: VoteMode; voteCost?: number; starter?: number; chatVoteValue?: number; commentsSelect?: boolean } = {}) {
  const clock = new FakeClock(0);
  const credits = new CreditsLedger({ starterCredits: opts.starter ?? 3, now: () => clock.now() });
  const votes = new VoteEngine({ clock, credits, mode: opts.mode ?? "value", voteCost: opts.voteCost ?? 1, chatVotePolicy: "free", chatVoteValue: opts.chatVoteValue ?? 0, commentsSelect: opts.commentsSelect ?? false, random: () => 0.99 });
  votes.open({ beatIndex: 0, targetBeatIndex: 1, choices, opensAt: 0, closesAt: 5000 });
  return { clock, credits, votes };
}

test("value mode: gifts add their coin value to an option and the biggest total wins", () => {
  const { votes } = setup();
  // 3 people send a 1-coin selector gift for A; one whale sends a 500-coin gift for B
  assert.equal(votes.gift({ userId: "u1", source: "tiktok", coins: 1, selects: "A" }), "A");
  assert.equal(votes.gift({ userId: "u2", source: "tiktok", coins: 1, selects: "A" }), "A");
  assert.equal(votes.gift({ userId: "u3", source: "tiktok", coins: 1, selects: "A" }), "A");
  assert.equal(votes.gift({ userId: "whale", source: "tiktok", coins: 500, selects: "B" }), "B");
  assert.deepEqual(votes.tally(), { A: 3, B: 500, C: 0 });
  assert.equal(votes.close().winner, "B");
});

test("gifts only: a comment does nothing; a big gift before picking is held and lands on the pick", () => {
  const { votes } = setup();
  assert.deepEqual(votes.select("u1", "3", "tiktok"), { ok: false, reason: "gifts_only" });
  assert.deepEqual(votes.cast("u1", "C", "tiktok"), { ok: false, reason: "gifts_only" });
  assert.equal(votes.gift({ userId: "u1", source: "tiktok", coins: 1000, giftName: "Galaxy" }), undefined, "no pick yet: held");
  assert.deepEqual(votes.tally(), { A: 0, B: 0, C: 0 });
  assert.equal(votes.gift({ userId: "u1", source: "tiktok", coins: 1, selects: "C", giftName: "Ice Cream Cone" }), "C");
  assert.deepEqual(votes.tally(), { A: 0, B: 0, C: 1001 }, "the held Galaxy landed with the Ice Cream");
  assert.equal(votes.gift({ userId: "u1", source: "tiktok", coins: 20, giftName: "Perfume" }), "C", "later gifts add to the pick");
  assert.deepEqual(votes.tally(), { A: 0, B: 0, C: 1021 });
});

test("held gifts that never land are revenue, not votes", () => {
  const { votes } = setup();
  votes.gift({ userId: "whale", source: "tiktok", coins: 500 });
  const r = votes.close();
  assert.equal(r.reason, "no-votes-default");
  assert.equal(votes.uncountedCoins, 500);
});

test("optional: comments may pick (and even count) when the show turns that on", () => {
  const { votes } = setup({ commentsSelect: true, chatVoteValue: 1 });
  votes.select("u1", "3", "tiktok"); // typed "3" → C, plus a free 1-coin advisory vote
  assert.equal(votes.gift({ userId: "u1", source: "tiktok", coins: 200, giftName: "Galaxy" }), "C");
  assert.deepEqual(votes.tally(), { A: 0, B: 0, C: 201 });
});

test("value mode: website viewers spend credits as value and can add more", () => {
  const { votes, credits } = setup({ starter: 5 });
  assert.equal(votes.cast("v1", "B", "web", 2).ok, true);
  assert.equal(votes.cast("v1", "B", "web", 2).ok, true);
  assert.deepEqual(votes.cast("v1", "B", "web", 2), { ok: false, reason: "no_credits", balance: 1 });
  assert.deepEqual(votes.tally(), { A: 0, B: 4, C: 0 });
  assert.equal(credits.balance("v1"), 1);
});

test("count mode: one vote per viewer, each worth one", () => {
  const { credits, votes } = setup({ mode: "count" });
  assert.equal(votes.cast("v1", "B").ok, true);
  assert.equal(credits.balance("v1"), 2);
  assert.deepEqual(votes.cast("v1", "B"), { ok: false, reason: "already_voted", balance: 2 });
  assert.equal(votes.gift({ userId: "g1", source: "tiktok", coins: 1000, selects: "A" }), "A");
  assert.deepEqual(votes.tally(), { A: 1, B: 1, C: 0 });
});

test("a viewer with no credits cannot vote from the website", () => {
  const { votes, credits } = setup({ starter: 0 });
  assert.deepEqual(votes.cast("broke", "A"), { ok: false, reason: "no_credits", balance: 0 });
  credits.grant("broke", 5, "purchase");
  assert.equal(votes.cast("broke", "A").ok, true);
  assert.equal(credits.balance("broke"), 4);
});

test("votes and gifts outside the window are rejected / left uncounted", async () => {
  const { votes, clock } = setup();
  await clock.advance(5000);
  assert.deepEqual(votes.cast("v1", "A"), { ok: false, reason: "closed" });
  assert.equal(votes.gift({ userId: "u", source: "tiktok", coins: 5, selects: "A" }), undefined);
  assert.equal(votes.uncountedCoins, 5);
});

test("bad choices are rejected", () => {
  const { votes } = setup();
  assert.deepEqual(votes.cast("v1", "D"), { ok: false, reason: "bad_choice" });
});

test("free chat votes (when enabled) count once per user and never touch credits", () => {
  const { votes, credits } = setup({ chatVoteValue: 1 });
  assert.equal(votes.cast("twitch-user", "C", "twitch").ok, true);
  assert.equal(credits.balance("twitch-user"), 0);
  assert.equal(votes.cast("twitch-user", "C", "twitch").ok, false);
  assert.deepEqual(votes.tally(), { A: 0, B: 0, C: 1 });
});

test("chat messages map to choices", () => {
  assert.equal(parseChoiceMessage("2"), "B");
  assert.equal(parseChoiceMessage(" c "), "C");
  assert.equal(parseChoiceMessage("!vote 1"), "A");
  assert.equal(parseChoiceMessage("vote b"), "B");
  assert.equal(parseChoiceMessage("hello"), undefined);
  assert.equal(parseChoiceMessage("3rd time lucky"), undefined);
});

test("decide: majority, tie-break, and no-votes default", () => {
  assert.equal(decide({ A: 1, B: 3, C: 2 }).winner, "B");
  assert.equal(decide({ A: 0, B: 0, C: 0 }).reason, "no-votes-default");
  const tie = decide({ A: 2, B: 2, C: 0 }, () => 0.99);
  assert.equal(tie.reason, "tiebreak-random");
  assert.equal(tie.winner, "B");
  assert.equal(decide({ A: 2, B: 2, C: 0 }, () => 0).winner, "A");
});

test("close() is idempotent and clears sticky picks", () => {
  const { votes } = setup();
  votes.gift({ userId: "u1", source: "tiktok", coins: 5, selects: "C" });
  const r1 = votes.close();
  assert.deepEqual(votes.close(), r1);
  assert.equal(r1.winner, "C");
  votes.open({ beatIndex: 1, targetBeatIndex: 2, choices, opensAt: 0, closesAt: 5000 });
  assert.equal(votes.gift({ userId: "u1", source: "tiktok", coins: 5 }), undefined, "selection does not carry over");
});
