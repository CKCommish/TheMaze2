import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TIMING, validateTiming, type NowPlaying } from "../src/core/index.js";
import { harness, startShow } from "./helpers.js";

test("default timing obeys the 20–30 seconds-remaining vote rule", () => {
  validateTiming(DEFAULT_TIMING);
  assert.equal(DEFAULT_TIMING.beatMs - DEFAULT_TIMING.voteOpensAtMs, 30_000);
  assert.equal(DEFAULT_TIMING.beatMs - (DEFAULT_TIMING.voteOpensAtMs + DEFAULT_TIMING.voteDurationMs), 20_000);
  assert.equal(DEFAULT_TIMING.voteDurationMs, 10_000);
});

test("a late vote (after clip 2 has played) is allowed only when the render budget is relaxed", () => {
  const late = { ...DEFAULT_TIMING, voteOpensAtMs: 30_000, voteDurationMs: 10_000 }; // closes with 5 s left
  assert.throws(() => validateTiming(late), /too late/);
  validateTiming(late, 3_000); // SPECULATION=full or Director mode
});

test("timing validation rejects votes outside the window", () => {
  assert.throws(() => validateTiming({ ...DEFAULT_TIMING, voteOpensAtMs: 10_000 }), /too early/);
  assert.throws(() => validateTiming({ ...DEFAULT_TIMING, voteOpensAtMs: 20_000 }), /too late/);
  assert.throws(() => validateTiming({ ...DEFAULT_TIMING, clipMs: 20_000 }), /multiple/);
});

test("beats are exactly 45 s, three 15 s slots, vote opens with 30 s left and closes with 20 s left", async () => {
  const h = harness();
  const t0 = await startShow(h);
  await h.clock.advance(45_000 * 4 + 1);

  const beats = h.events.filter((e) => e.name === "beat");
  assert.ok(beats.length >= 5, `expected 5 beats, got ${beats.length}`);
  for (let i = 1; i < beats.length; i++) assert.equal(beats[i].at - beats[i - 1].at, 45_000);

  const opens = h.events.filter((e) => e.name === "vote_open");
  const closes = h.events.filter((e) => e.name === "vote_closed");
  assert.equal(opens.length, closes.length);
  for (let i = 0; i < opens.length; i++) {
    const beatStart = beats[i].at;
    const beatEnd = beatStart + 45_000;
    assert.equal(beatEnd - opens[i].at, 30_000, "vote opens with 30 s remaining");
    assert.equal(beatEnd - closes[i].at, 20_000, "vote closes with 20 s remaining");
    assert.equal(closes[i].at - opens[i].at, 10_000, "10 seconds to vote");
  }

  const slots = h.events.filter((e) => e.name === "slot").map((e) => ({ at: e.at, np: e.payload as NowPlaying }));
  const beat1Slots = slots.filter((s) => s.np.beatIndex === 1);
  assert.deepEqual(beat1Slots.map((s) => s.np.slot), [0, 1, 2]);
  assert.deepEqual(beat1Slots.map((s) => s.at - beats[1].at), [0, 15_000, 30_000]);
  assert.equal(t0, beats[0].at);
});

test("with normal generation speed the next beat's clips are real, not fillers", async () => {
  const h = harness({ videoLatency: 12_000, imageLatency: 4_000 });
  await startShow(h, 20_000);
  await h.clock.advance(45_000 * 3);
  const slots = h.events.filter((e) => e.name === "slot").map((e) => e.payload as NowPlaying).filter((np) => np.beatIndex >= 1);
  assert.ok(slots.length >= 6);
  for (const s of slots) assert.equal(s.filler, false, `beat ${s.beatIndex} slot ${s.slot} should be a real clip`);
});

test("a late clip is covered by a filler and cuts in when it lands; the clock never slips", async () => {
  // 30 s per clip: the first clip of beat 1 starts rendering when the vote closes (25 s) and lands at 55 s,
  // 10 s into its slot. The filler covers those 10 s.
  const h = harness({ videoLatency: 30_000, imageLatency: 100 });
  await startShow(h, 31_000);
  const beat0 = h.events.find((e) => e.name === "beat")!.at;
  await h.clock.advance(45_000 * 2);
  const beat1 = h.events.filter((e) => e.name === "beat")[1];
  assert.equal(beat1.at - beat0, 45_000, "beat 1 still starts on time");
  const beat1Slot0 = h.events.filter((e) => e.name === "slot").map((e) => ({ at: e.at, np: e.payload as NowPlaying })).filter((s) => s.np.beatIndex === 1 && s.np.slot === 0);
  assert.equal(beat1Slot0.length, 2, "filler first, then the real clip cuts in");
  assert.equal(beat1Slot0[0].np.filler, true);
  assert.equal(beat1Slot0[0].at, beat1.at);
  assert.equal(beat1Slot0[1].np.filler, false);
  assert.equal(beat1Slot0[1].at, beat1.at + 10_000);
  assert.equal(beat1Slot0[1].np.clip.durationMs, 5_000, "the real clip plays for the rest of the slot");
});

test("when every generation fails the show still runs on fillers at the same cadence", async () => {
  const h = harness({ failureRate: 1, random: () => 0 });
  await startShow(h, 20_000);
  await h.clock.advance(45_000 * 3);
  const beats = h.events.filter((e) => e.name === "beat");
  assert.ok(beats.length >= 4);
  for (let i = 1; i < beats.length; i++) assert.equal(beats[i].at - beats[i - 1].at, 45_000);
  const slots = h.events.filter((e) => e.name === "slot").map((e) => e.payload as NowPlaying);
  assert.ok(slots.every((s) => s.filler), "everything on air is a filler");
  assert.ok(h.pipeline.stats.failures > 0);
});

test("the audience's choice becomes the next beat; no votes defaults to A", async () => {
  const h = harness();
  await startShow(h);
  // beat 0 vote: cast a vote for C
  await h.clock.advance(16_000);
  const open = h.events.filter((e) => e.name === "vote_open").at(-1)!.payload as { choices: { id: string; label: string }[] };
  h.credits.ensureViewer("v1");
  assert.equal(h.votes.cast("v1", "C").ok, true);
  await h.clock.advance(29_000);
  const beat1 = h.events.filter((e) => e.name === "beat")[1].payload as { plan: { choiceTaken?: { id: string; label: string } } };
  assert.equal(beat1.plan.choiceTaken?.id, "C");
  assert.equal(beat1.plan.choiceTaken?.label, open.choices[2].label);
  // beat 1 vote: nobody votes
  await h.clock.advance(45_000);
  const closed = h.events.filter((e) => e.name === "vote_closed").at(-1)!.payload as { result: { reason: string; winner: string } };
  assert.equal(closed.result.reason, "no-votes-default");
  assert.equal(closed.result.winner, "A");
});

test("speculation modes all keep the cadence", async () => {
  for (const speculation of ["none", "keyframes", "full"] as const) {
    const h = harness({ config: { speculation } });
    await startShow(h);
    await h.clock.advance(45_000 * 2);
    const beats = h.events.filter((e) => e.name === "beat");
    assert.equal(beats.length, 3, `${speculation}: 3 beats`);
    assert.equal(beats[2].at - beats[1].at, 45_000);
  }
});

test("snapshot describes the beat, the vote and what is on air", async () => {
  const h = harness();
  await startShow(h);
  await h.clock.advance(16_000);
  const snap = h.showrunner.snapshot();
  assert.equal(snap.beat?.index, 0);
  assert.equal(snap.nowPlaying?.slot, 1);
  assert.equal(snap.vote?.targetBeatIndex, 1);
  assert.equal(snap.vote?.choices.length, 3);
  assert.equal(snap.timing.beatMs, 45_000);
});
