import { z } from "zod";

export type ChoiceId = "A" | "B" | "C";
export const CHOICE_IDS: ChoiceId[] = ["A", "B", "C"];

/** One option the audience can vote for. */
export const ChoiceSchema = z.object({
  id: z.enum(["A", "B", "C"]),
  /** 2–6 words, what the audience sees on the button. */
  label: z.string().min(1).max(60),
  /** One short line teasing the consequence. */
  hook: z.string().max(140),
  /** The full action, for the planner. */
  intent: z.string().max(400),
});
export type Choice = z.infer<typeof ChoiceSchema>;

/** One 15-second shot. Three of these make a 45-second beat. */
export const ShotSchema = z.object({
  /** setup → action → turn: the chosen action is spread across all three. */
  role: z.enum(["setup", "action", "turn"]),
  /** What the audience sees happen in this shot, in plain words (also shown in the director log). */
  summary: z.string().max(300),
  /** Description of the opening still image, for the keyframe image model. */
  frame: z.string().max(900),
  /** What happens over the 15 seconds, for the video model (may include dialogue in quotes). */
  motion: z.string().max(1500),
  /** Lens / camera movement language. */
  camera: z.string().max(200),
  /** Where this shot takes place. */
  location: z.string().max(120),
  /** Character ids on screen (must exist in the cast). */
  charactersOnScreen: z.array(z.string()).max(4),
});
export type Shot = z.infer<typeof ShotSchema>;

/** A patch the planner applies to the world after a beat. */
export const StoryPatchSchema = z.object({
  location: z.string().max(120).optional(),
  timeOfDay: z.string().max(60).optional(),
  weather: z.string().max(60).optional(),
  /** 0 = nobody is looking for you, 5 = the whole city is. */
  heat: z.number().int().min(0).max(5).optional(),
  cashDelta: z.number().int().optional(),
  addAllies: z.array(z.string()).optional(),
  removeAllies: z.array(z.string()).optional(),
  addInventory: z.array(z.string()).optional(),
  removeInventory: z.array(z.string()).optional(),
  /** Open plot threads after this beat (replaces the list). */
  threads: z.array(z.string().max(160)).max(6).optional(),
});
export type StoryPatch = z.infer<typeof StoryPatchSchema>;

/** The plan for one 45-second beat, produced by the planner. */
export const BeatPlanSchema = z.object({
  /** One or two sentences: what happens in this beat. */
  synopsis: z.string().max(400),
  shots: z.tuple([ShotSchema, ShotSchema, ShotSchema]),
  /** How shot 3 ends. Must work as the lead-in for ALL three nextChoices. */
  cliffhanger: z.string().max(300),
  /** The three options the audience votes on for the NEXT beat. */
  nextChoices: z.tuple([ChoiceSchema, ChoiceSchema, ChoiceSchema]),
  stateAfter: StoryPatchSchema,
});
export type BeatPlanBody = z.infer<typeof BeatPlanSchema>;

export interface BeatPlan extends BeatPlanBody {
  beatIndex: number;
  /** The audience choice this beat resolves (undefined for the opening beat). */
  choiceTaken?: Choice;
  plannedBy: string;
}

export interface CharacterSheet {
  id: string;
  name: string;
  role: "protagonist" | "ally" | "rival" | "extra";
  /** The locked look. Injected verbatim into every prompt that shows this character. */
  look: string;
  wardrobe: string;
  /** Approved reference images (front, 3/4, profile, full body). Never regenerated. */
  referenceImageUrls: string[];
}

export interface StoryState {
  title: string;
  logline: string;
  /** The visual style bible, injected verbatim into every prompt. */
  style: string;
  protagonist: CharacterSheet;
  cast: CharacterSheet[];
  location: string;
  timeOfDay: string;
  weather: string;
  heat: number;
  cash: number;
  allies: string[];
  inventory: string[];
  threads: string[];
  /** Synopses of recent beats, oldest first. */
  recentBeats: string[];
  beatCount: number;
}

/** video: a rendered file · storyboard: a text card (mock) · director: a live-stream prompt (H3 Max Director) */
export type ClipKind = "video" | "storyboard" | "director";

export interface Clip {
  id: string;
  beatIndex: number;
  /** 0..2 within the beat; -1 for fillers. */
  shotIndex: number;
  kind: ClipKind;
  /** Playable video URL (kind = video). */
  url?: string;
  keyframeUrl?: string;
  lastFrameUrl?: string;
  durationMs: number;
  /** Text shown on storyboard cards (mock mode) and in the director log. */
  title?: string;
  text?: string;
  /** The full prompt sent to the live stream (kind = director). */
  prompt?: string;
  provider: string;
  generatedInMs?: number;
  filler?: boolean;
  location?: string;
}

export interface VoteTally {
  A: number;
  B: number;
  C: number;
}

export interface VoteResult {
  winner: ChoiceId;
  tally: VoteTally;
  totalVotes: number;
  reason: "majority" | "tiebreak-random" | "no-votes-default";
}

export interface VoteWindow {
  beatIndex: number;
  targetBeatIndex: number;
  choices: [Choice, Choice, Choice];
  opensAt: number;
  closesAt: number;
  tally: VoteTally;
  voters: Set<string>;
  result?: VoteResult;
}

export type VoteSource = "web" | "twitch" | "tiktok" | "youtube" | "kick" | "sim";

export interface CastResult {
  ok: boolean;
  reason?: "closed" | "already_voted" | "no_credits" | "bad_choice" | "gifts_only";
  balance?: number;
}

/** What is playing right now. */
export interface NowPlaying {
  beatIndex: number;
  slot: number;
  clip: Clip;
  startsAt: number;
  endsAt: number;
  /** True when a filler is playing because the real clip was late. */
  filler: boolean;
}

export interface Snapshot {
  serverTime: number;
  timing: import("./config.js").Timing;
  story: {
    title: string;
    logline: string;
    location: string;
    timeOfDay: string;
    weather: string;
    heat: number;
    cash: number;
    beatCount: number;
    threads: string[];
  };
  beat?: {
    index: number;
    startsAt: number;
    endsAt: number;
    synopsis: string;
    choiceTaken?: Choice;
    shots: { role: Shot["role"]; summary: string; location: string }[];
    cliffhanger: string;
  };
  nowPlaying?: NowPlaying;
  vote?: {
    beatIndex: number;
    targetBeatIndex: number;
    choices: [Choice, Choice, Choice];
    opensAt: number;
    closesAt: number;
    tally: VoteTally;
    result?: VoteResult;
  };
  lastResult?: { beatIndex: number; result: VoteResult; choice: Choice };
  pipeline: { inFlight: number; ready: number; failures: number; fillersPlayed: number };
}
