import assert from "node:assert/strict";
import { test } from "node:test";
import { ClipPipeline, CreditsLedger, DirectorVideoProvider, FakeClock, MockPlanner, Showrunner, VoteEngine, defaultStory, directorPreamble, type NowPlaying } from "../src/core/index.js";

test("director mode: every slot carries a prompt with the character lock, on the same 45/15/5 clock", async () => {
  const clock = new FakeClock(0);
  const credits = new CreditsLedger({ starterCredits: 0, now: () => clock.now() });
  const votes = new VoteEngine({ clock, credits, voteCost: 1, chatVotePolicy: "free" });
  const pipeline = new ClipPipeline({ clock, video: new DirectorVideoProvider(), mode: "text-only", clipMs: 15_000, aspectRatio: "9:16" });
  const sr = new Showrunner({ clock, planner: new MockPlanner(), pipeline, votes, story: defaultStory(), config: { speculation: "none" } });
  const slots: { at: number; np: NowPlaying }[] = [];
  const opens: number[] = [];
  sr.on("slot", (np) => slots.push({ at: clock.now(), np }));
  sr.on("vote_open", () => opens.push(clock.now()));
  const started = sr.start();
  await clock.advance(1000);
  await started;
  await clock.advance(90_000);
  assert.ok(slots.length >= 6);
  for (const s of slots) {
    assert.equal(s.np.clip.kind, "director");
    assert.equal(s.np.filler, false, "director prompts are never late");
    assert.ok(s.np.clip.prompt?.includes("Rae Solano"), "the locked character block is in every prompt");
    assert.ok(s.np.clip.prompt?.includes("Cinematic photoreal"), "the style bible is in every prompt");
  }
  assert.deepEqual(slots.slice(0, 3).map((s) => s.at - slots[0].at), [0, 15_000, 30_000]);
  assert.equal(opens[0] - slots[0].at, 15_000);
  const pre = directorPreamble("STYLE", ["Rae block"]);
  assert.ok(pre.includes("Rae block") && pre.includes("STYLE"));
});
