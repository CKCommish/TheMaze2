import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { worldSummary, type BeatPlan, type Choice, type Planner, type StoryState } from "../core/index.js";

/**
 * The head writer. Claude plans each 45-second beat as three 15-second shots and writes the next
 * three audience choices, using structured outputs so the plan always parses.
 */

// LLM-facing schema: arrays instead of tuples and nullable instead of optional (friendlier to structured outputs).
const LlmShot = z.object({
  role: z.enum(["setup", "action", "turn"]),
  summary: z.string(),
  frame: z.string(),
  motion: z.string(),
  camera: z.string(),
  location: z.string(),
  charactersOnScreen: z.array(z.string()),
});
const LlmChoice = z.object({ id: z.enum(["A", "B", "C"]), label: z.string(), hook: z.string(), intent: z.string() });
const LlmPatch = z.object({
  location: z.string().nullable(),
  timeOfDay: z.string().nullable(),
  weather: z.string().nullable(),
  heat: z.number().int().nullable(),
  cashDelta: z.number().int().nullable(),
  addAllies: z.array(z.string()),
  removeAllies: z.array(z.string()),
  addInventory: z.array(z.string()),
  removeInventory: z.array(z.string()),
  threads: z.array(z.string()),
});
const LlmBeat = z.object({
  synopsis: z.string(),
  shots: z.array(LlmShot),
  cliffhanger: z.string(),
  nextChoices: z.array(LlmChoice),
  stateAfter: LlmPatch,
});
type LlmBeatT = z.infer<typeof LlmBeat>;

const SYSTEM = `You are the head writer and director of THE MAZE, a live, never-stopping crime saga that the audience steers by voting. It is generated shot by shot with an AI video model, so you write for the camera.

FORMAT (non-negotiable)
- One beat = exactly 45 seconds = exactly THREE shots of 15 seconds, in order: "setup", "action", "turn".
- The audience's chosen action must be spread across all three shots: shot 1 sets it up, shot 2 is the action itself, shot 3 is the consequence and ends on the cliffhanger.
- The cliffhanger is a frozen decision moment that works as the lead-in for ALL THREE nextChoices. Never resolve it.
- nextChoices: exactly three, ids A, B, C. Labels are 2–5 punchy words. Make them genuinely different: one careful, one bold, one wild. Each must be doable inside the next 45 seconds and change the story. "hook" is a one-line tease of the consequence. "intent" is the full action in one sentence.
- The protagonist is in every beat. Other characters only from the cast list, referenced by id in charactersOnScreen. Introduce at most one new named extra per beat and put them in nothing but the prompt text.

WRITING THE SHOTS (they are prompts for a video model)
- "frame": the opening still image: composition, subject placement, lighting, weather, foreground/background. Do NOT describe faces, hair or clothing of cast members; the system injects their locked descriptions. Refer to them by first name only.
- "motion": what happens over 15 seconds, as three timecoded blocks: "[0-5 seconds] … [5-10 seconds] … [10-15 seconds] …". Concrete physical action, camera motion, and sound. Dialogue in double quotes, at most two short lines per shot, spoken by named characters.
- "camera": lens and movement in film language (e.g. "35mm anamorphic, slow push-in, handheld").
- Grounded, weighty, cinematic. Rain, neon, harbor, freeways, vast desolate skylines.
- Content rules: no gore, blood, torture, sexual content, drugs in use, real people, real brands, logos, or on-screen text. Weapons may be shown without graphic injury. Threats, chases, crashes, fistfights and heists are fine.

STORY RULES
- Keep continuity with the recent beats, the open threads, heat, cash, allies and inventory. Escalate. Pay something off every 4–6 beats. Reveal the mystery in pieces, never all at once.
- Heat (0–5) rises with violence and public chaos and falls with stealth or deals. Cash changes with jobs, bribes and losses.
- stateAfter describes the world after this beat. threads is the full list of open plot threads (max 6). Use null for fields that do not change and empty arrays for nothing added/removed.

Respond only with the JSON object.`;

/** Extra rules for TikTok LIVE, whose rules forbid showing firearms and physical altercations. */
const TIKTOK_RULES = `

PLATFORM RULES (TikTok LIVE): never show firearms, explosives or knives on screen, and no physical fights, even non-graphic. Threats stay verbal, violence happens off screen or is implied by sound and aftermath. Chases, crashes, break-ins, heists, deals, betrayals and escapes are fine. Keep everything suitable for a general audience.`;

export interface ClaudePlannerOptions {
  apiKey?: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
  /** "tiktok" adds the stricter on-screen rules TikTok LIVE enforces. */
  contentMode?: "standard" | "tiktok";
  log?: (msg: string) => void;
}

export class ClaudePlanner implements Planner {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: "low" | "medium" | "high";
  private readonly timeoutMs: number;
  private readonly log: (msg: string) => void;
  private readonly system: string;

  constructor(opts: ClaudePlannerOptions = {}) {
    this.system = SYSTEM + (opts.contentMode === "tiktok" ? TIKTOK_RULES : "");
    this.client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
    this.model = opts.model ?? "claude-opus-5";
    this.effort = opts.effort ?? "medium";
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.log = opts.log ?? (() => {});
    this.name = `claude:${this.model}`;
  }

  planOpening(state: StoryState, signal?: AbortSignal): Promise<BeatPlan> {
    const req = [
      `Plan BEAT 0, the opening of the show. Start in the middle of trouble: ${state.protagonist.name} at ${state.location} with ${state.inventory[0] ?? "the stolen bag"}.`,
      "There is no audience choice yet; choose the most gripping opening you can and end on a cliffhanger with three choices.",
    ].join("\n");
    return this.plan(state, 0, req, undefined, signal);
  }

  planBeat(state: StoryState, beatIndex: number, choice: Choice, previous: BeatPlan, signal?: AbortSignal): Promise<BeatPlan> {
    const req = [
      `Previous beat (${previous.beatIndex}): ${previous.synopsis}`,
      `It ended on this cliffhanger: ${previous.cliffhanger}`,
      `The audience was offered: ${previous.nextChoices.map((c) => `${c.id}) ${c.label} — ${c.intent}`).join(" | ")}`,
      `THE AUDIENCE CHOSE ${choice.id}) ${choice.label}: ${choice.intent}`,
      `Plan BEAT ${beatIndex}: resolve that choice across three shots, then a new cliffhanger and three new choices.`,
    ].join("\n");
    return this.plan(state, beatIndex, req, choice, signal);
  }

  private async plan(state: StoryState, beatIndex: number, request: string, choice: Choice | undefined, signal?: AbortSignal): Promise<BeatPlan> {
    const cast = state.cast.map((c) => `- ${c.id}: ${c.name} (${c.role})`).join("\n");
    const user = [
      `SHOW: ${state.title}. ${state.logline}`,
      `CAST (use these ids in charactersOnScreen):\n${cast}`,
      `WORLD NOW:\n${worldSummary(state)}`,
      request,
    ].join("\n\n");
    const started = Date.now();
    const response = await this.client.messages.parse(
      {
        model: this.model,
        max_tokens: 6000,
        system: [{ type: "text", text: this.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
        output_config: { effort: this.effort, format: zodOutputFormat(LlmBeat) },
      },
      { signal, timeout: this.timeoutMs },
    );
    if (response.stop_reason === "refusal") throw new Error(`planner refusal: ${response.stop_details?.category ?? "unknown"}`);
    const parsed = response.parsed_output;
    if (!parsed) throw new Error("planner returned no parseable plan");
    const plan = toBeatPlan(parsed, beatIndex, choice, this.name);
    this.log(`planned beat ${beatIndex} in ${((Date.now() - started) / 1000).toFixed(1)}s (${response.usage.output_tokens} out tokens, cache read ${response.usage.cache_read_input_tokens ?? 0})`);
    return plan;
  }
}

export function toBeatPlan(p: LlmBeatT, beatIndex: number, choice: Choice | undefined, plannedBy: string): BeatPlan {
  if (p.shots.length !== 3) throw new Error(`planner returned ${p.shots.length} shots, need 3`);
  if (p.nextChoices.length !== 3) throw new Error(`planner returned ${p.nextChoices.length} choices, need 3`);
  const roles = ["setup", "action", "turn"] as const;
  const ids = ["A", "B", "C"] as const;
  const nz = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
  return {
    beatIndex,
    choiceTaken: choice,
    plannedBy,
    synopsis: p.synopsis.slice(0, 400),
    shots: [0, 1, 2].map((i) => ({
      role: roles[i],
      summary: p.shots[i].summary.slice(0, 300),
      frame: p.shots[i].frame.slice(0, 900),
      motion: p.shots[i].motion.slice(0, 1500),
      camera: p.shots[i].camera.slice(0, 200),
      location: p.shots[i].location.slice(0, 120),
      charactersOnScreen: p.shots[i].charactersOnScreen.slice(0, 4),
    })) as BeatPlan["shots"],
    cliffhanger: p.cliffhanger.slice(0, 300),
    nextChoices: [0, 1, 2].map((i) => ({
      id: ids[i],
      label: p.nextChoices[i].label.slice(0, 60),
      hook: p.nextChoices[i].hook.slice(0, 140),
      intent: p.nextChoices[i].intent.slice(0, 400),
    })) as BeatPlan["nextChoices"],
    stateAfter: {
      location: nz(p.stateAfter.location),
      timeOfDay: nz(p.stateAfter.timeOfDay),
      weather: nz(p.stateAfter.weather),
      heat: nz(p.stateAfter.heat) === undefined ? undefined : Math.max(0, Math.min(5, p.stateAfter.heat as number)),
      cashDelta: nz(p.stateAfter.cashDelta),
      addAllies: p.stateAfter.addAllies,
      removeAllies: p.stateAfter.removeAllies,
      addInventory: p.stateAfter.addInventory,
      removeInventory: p.stateAfter.removeInventory,
      threads: p.stateAfter.threads.slice(0, 6),
    },
  };
}
