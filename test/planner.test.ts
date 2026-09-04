import assert from "node:assert/strict";
import { test } from "node:test";
import { BeatPlanSchema, MockPlanner, ResilientPlanner, defaultStory, type BeatPlan, type Choice, type Planner, type StoryState } from "../src/core/index.js";

test("the mock planner spreads one choice across three 15 s shots and offers three new choices", async () => {
  const p = new MockPlanner();
  const story = defaultStory();
  const opening = await p.planOpening(story);
  assert.equal(opening.shots.length, 3);
  assert.deepEqual(opening.shots.map((s) => s.role), ["setup", "action", "turn"]);
  assert.deepEqual(opening.nextChoices.map((c) => c.id), ["A", "B", "C"]);
  assert.ok(BeatPlanSchema.safeParse(opening).success, "plan matches the schema");

  const choice = opening.nextChoices[1];
  const next = await p.planBeat(story, 1, choice, opening);
  assert.equal(next.choiceTaken, choice);
  assert.ok(next.shots[1].summary.toLowerCase().includes(choice.intent.replace(/^Rae\s+/i, "").slice(0, 12).toLowerCase()), "the chosen action drives the middle shot");
  assert.ok(next.cliffhanger.length > 0);
  assert.ok(BeatPlanSchema.safeParse(next).success);
});

test("the resilient planner falls back when the primary fails or hangs", async () => {
  const failing: Planner = {
    name: "failing",
    planOpening: async () => {
      throw new Error("boom");
    },
    planBeat: () => new Promise<BeatPlan>(() => {}),
  };
  const logs: string[] = [];
  const p = new ResilientPlanner(failing, new MockPlanner(), 50, (m) => logs.push(m));
  const story: StoryState = defaultStory();
  const opening = await p.planOpening(story);
  assert.equal(opening.plannedBy, "mock");
  const choice: Choice = opening.nextChoices[0];
  const next = await p.planBeat(story, 1, choice, opening);
  assert.equal(next.plannedBy, "mock");
  assert.equal(logs.length, 2);
  assert.match(logs[1], /timed out/);
});
