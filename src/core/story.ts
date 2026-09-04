import type { BeatPlan, CharacterSheet, StoryPatch, StoryState } from "./types.js";

/** Pure: returns a new story state with the patch applied. */
export function applyPatch(state: StoryState, patch: StoryPatch, synopsis: string, memoryBeats: number): StoryState {
  const allies = new Set(state.allies);
  for (const a of patch.addAllies ?? []) allies.add(a);
  for (const a of patch.removeAllies ?? []) allies.delete(a);
  const inventory = new Set(state.inventory);
  for (const i of patch.addInventory ?? []) inventory.add(i);
  for (const i of patch.removeInventory ?? []) inventory.delete(i);
  const recentBeats = [...state.recentBeats, synopsis].slice(-memoryBeats);
  return {
    ...state,
    location: patch.location ?? state.location,
    timeOfDay: patch.timeOfDay ?? state.timeOfDay,
    weather: patch.weather ?? state.weather,
    heat: patch.heat ?? state.heat,
    cash: Math.max(0, state.cash + (patch.cashDelta ?? 0)),
    allies: Array.from(allies),
    inventory: Array.from(inventory),
    threads: patch.threads ?? state.threads,
    recentBeats,
    beatCount: state.beatCount + 1,
  };
}

export function projectAfter(state: StoryState, plan: BeatPlan, memoryBeats: number): StoryState {
  return applyPatch(state, plan.stateAfter, plan.synopsis, memoryBeats);
}

export function characterById(state: StoryState, id: string): CharacterSheet | undefined {
  return state.cast.find((c) => c.id === id);
}

/** The character block that is injected verbatim into every prompt that shows this character. */
export function characterBlock(c: CharacterSheet): string {
  return `${c.look} She/he always wears: ${c.wardrobe}.`.replace("She/he", c.role === "protagonist" ? "She" : "They");
}

/** A short, stable summary of the world for the planner. */
export function worldSummary(state: StoryState): string {
  return [
    `Location: ${state.location}. Time: ${state.timeOfDay}. Weather: ${state.weather}.`,
    `Heat (police attention 0-5): ${state.heat}. Cash: $${state.cash}.`,
    `Allies: ${state.allies.length ? state.allies.join(", ") : "none"}.`,
    `Inventory: ${state.inventory.join(", ") || "nothing"}.`,
    `Open threads: ${state.threads.join(" | ") || "none"}.`,
    `Recent beats: ${state.recentBeats.length ? state.recentBeats.map((s, i) => `${i + 1}. ${s}`).join(" ") : "(the story is just starting)"}`,
  ].join("\n");
}
