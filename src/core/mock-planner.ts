import type { Planner } from "./planner.js";
import type { BeatPlan, Choice, ChoiceId, Shot, StoryPatch, StoryState } from "./types.js";

/**
 * A planner that needs no API key. It stitches beats together from a small
 * open-world crime-saga template bank so the demo loop can run for hours.
 * It is deliberately simple; the real writing is done by ClaudePlanner.
 */

interface Situation {
  key: string;
  location: string;
  /** Three shots: setup, action, turn. {choice} is replaced with the chosen action. */
  shots: [string, string, string];
  cliffhanger: string;
  /** Three follow-up options. */
  next: [Omit<Choice, "id">, Omit<Choice, "id">, Omit<Choice, "id">];
  patch: StoryPatch;
}

const CAMERAS = [
  "wide establishing shot, slow push-in, 35mm anamorphic",
  "handheld medium shot tracking the character, 50mm",
  "low-angle tracking shot from the wet asphalt, 24mm",
  "tight close-up, shallow focus, 85mm, rain on the lens",
  "over-the-shoulder shot, slow dolly, 40mm",
  "high crane shot descending through sea mist, 28mm",
];

const SITUATIONS: Situation[] = [
  {
    key: "pier",
    location: "Pier 9 container yard, Port Marrow harbor",
    shots: [
      "Rain hammers the container yard. Rae crouches behind a rust-red container, the black duffel bag clutched to her chest, headlights sweeping the stacks behind her.",
      "Rae {choice}. Boots splash, a forklift alarm wails, the beam of a flashlight cuts across the puddles inches from her.",
      "She reaches the dented silver sedan, throws the bag onto the passenger seat and freezes: a phone inside the bag is ringing.",
    ],
    cliffhanger: "The burner in the bag glows: UNKNOWN NUMBER. Rae's hand hovers over it.",
    next: [
      { label: "Answer the phone", hook: "Find out who wants the bag.", intent: "Rae answers the ringing phone inside the stolen duffel bag and negotiates with the caller." },
      { label: "Toss it and drive", hook: "Lose the tracker, gain the city.", intent: "Rae throws the phone into the harbor and speeds out of the container yard toward the freeway." },
      { label: "Open the bag", hook: "See what you actually stole.", intent: "Rae unzips the duffel bag in the car and examines what is inside." },
    ],
    patch: { heat: 2, threads: ["Someone is calling the phone in the bag.", "Kessler's people want the bag back by dawn."] },
  },
  {
    key: "freeway",
    location: "Skyline Freeway, elevated over the harbor",
    shots: [
      "The silver sedan climbs onto the elevated freeway, the harbor cranes and a black sea below. Rae grips the wheel, eyes flicking to the mirror.",
      "Rae {choice}. A dark SUV surges up alongside, its window lowering, the freeway lights strobing across her face.",
      "Sparks fly as the SUV clips her rear quarter; the sedan fishtails toward the exit ramp and Rae yanks the wheel.",
    ],
    cliffhanger: "The exit ramp splits: harbor tunnel left, the old quarter right, the SUV closing.",
    next: [
      { label: "Take the tunnel", hook: "Dark, fast, no way out.", intent: "Rae dives into the harbor tunnel to outrun the SUV." },
      { label: "Old quarter alleys", hook: "Tight streets favor a small car.", intent: "Rae swerves into the narrow alleys of the old quarter to lose the SUV." },
      { label: "Brake and fight", hook: "Stop running. Face them.", intent: "Rae brakes hard so the SUV overshoots, then confronts its driver." },
    ],
    patch: { location: "Skyline Freeway exit ramps", heat: 3, threads: ["A dark SUV is chasing Rae.", "Kessler's people want the bag back by dawn."] },
  },
  {
    key: "teo",
    location: "Teo's boat shed, Marrow inlet",
    shots: [
      "A tin-roofed boat shed on the inlet, rain drumming, one bare bulb. Teo Marsh looks up from an outboard motor as Rae pushes in, soaked, bag on her shoulder.",
      "Rae {choice}. Teo wipes his hands slowly, glances at the bag, then at the door behind her.",
      "Teo unrolls a harbor chart across the workbench and taps a dock on the far side of the bay; outside, a boat engine coughs to life that neither of them started.",
    ],
    cliffhanger: "Someone is outside the shed, starting Teo's boat.",
    next: [
      { label: "Rush outside", hook: "Catch whoever it is.", intent: "Rae runs out of the shed to catch the person stealing Teo's boat." },
      { label: "Kill the light", hook: "Wait in the dark and listen.", intent: "Rae kills the light, and she and Teo wait in the dark to see who comes in." },
      { label: "Trust Teo's plan", hook: "Leave by water, tonight.", intent: "Rae and Teo take the other boat and cross the bay toward the dock on the chart." },
    ],
    patch: { location: "Teo's boat shed, Marrow inlet", addAllies: ["Teo Marsh"], heat: 2, threads: ["Someone is at Teo's shed.", "The dock across the bay on Teo's chart."] },
  },
  {
    key: "nightmarket",
    location: "Lantern Row night market, old quarter",
    shots: [
      "Lantern Row: a covered night market of steaming food stalls and wet neon, crowds under dripping tarps. Rae moves through the crush, hood up, bag held tight.",
      "Rae {choice}. A vendor's radio crackles with a police bulletin; two uniforms drift into the far end of the row.",
      "Detective Vasquez steps out from behind a noodle stall, coat dripping, and looks straight at Rae.",
    ],
    cliffhanger: "Vasquez raises one gloved hand: stay. The crowd flows between them.",
    next: [
      { label: "Talk to Vasquez", hook: "Maybe she wants Kessler more than you.", intent: "Rae stays and talks to Detective Vasquez, testing whether they share an enemy." },
      { label: "Vanish in the crowd", hook: "Use the market.", intent: "Rae slips into the crowd and escapes through the back of the night market." },
      { label: "Create a distraction", hook: "Tip a stall. Run.", intent: "Rae knocks over a food stall to create chaos and escapes in the confusion." },
    ],
    patch: { location: "Lantern Row night market, old quarter", heat: 3, threads: ["Detective Vasquez has found Rae.", "Kessler's people want the bag back by dawn."] },
  },
  {
    key: "meridian",
    location: "The Meridian casino, hillside above the port",
    shots: [
      "The Meridian glows on the hillside, glass and gold above the drowned city. Rae walks up the wet marble steps under the awning, bag swapped for a valet ticket.",
      "Rae {choice}. Milo Kessler watches from the mezzanine, umbrella hooked on his arm, and lifts two fingers; a man in a grey suit peels away toward her.",
      "A private elevator opens. Kessler's voice from inside: 'Miss Solano. You have something of mine.'",
    ],
    cliffhanger: "The elevator doors hold open. The grey suit stands behind her.",
    next: [
      { label: "Get in the elevator", hook: "Deal with Kessler face to face.", intent: "Rae steps into the elevator to negotiate directly with Milo Kessler." },
      { label: "Bluff: 'It's not here'", hook: "Buy time, name a price.", intent: "Rae bluffs that the bag is hidden elsewhere and demands money for its location." },
      { label: "Pull the fire alarm", hook: "Chaos is a door.", intent: "Rae pulls the fire alarm and escapes through the evacuating casino." },
    ],
    patch: { location: "The Meridian casino, hillside above the port", heat: 3, threads: ["Kessler has Rae cornered at the Meridian.", "What is in the bag?"] },
  },
  {
    key: "chopshop",
    location: "Delgado's chop shop under the freeway",
    shots: [
      "A chop shop under the freeway pylons, sparks from a grinder, stripped cars stacked like bones. Rae rolls the sedan in and kills the lights.",
      "Rae {choice}. The mechanics stop working and stare; one reaches slowly for a phone on the bench.",
      "Rae's sedan is already up on the lift, plates gone, when a second engine idles outside the roll-up door and someone knocks three times.",
    ],
    cliffhanger: "Three knocks on the steel door. The mechanic mouths: 'Kessler.'",
    next: [
      { label: "Hide in the pit", hook: "Let them search.", intent: "Rae hides in the inspection pit under a car while Kessler's men search the shop." },
      { label: "Take a new car", hook: "Something fast, something clean.", intent: "Rae steals a freshly resprayed car from the shop and crashes out through the back." },
      { label: "Open the door", hook: "Cut a deal for the bag.", intent: "Rae opens the door herself and offers Kessler's men a trade." },
    ],
    patch: { location: "Delgado's chop shop under the freeway", heat: 2, addInventory: ["fresh plates"], threads: ["Kessler's men are at the chop shop.", "What is in the bag?"] },
  },
  {
    key: "rooftop",
    location: "Rooftop of the Marrow Grand Hotel, dawn approaching",
    shots: [
      "First grey light over the harbor. Rae stands at the parapet of a hotel rooftop, the city steaming below, the bag open at her feet.",
      "Rae {choice}. Wind tears at her jacket; a helicopter's searchlight sweeps the waterfront far below.",
      "The rooftop door bangs open behind her: Vasquez, out of breath, hands empty and open. 'Rae. Let's end this without anyone falling.'",
    ],
    cliffhanger: "Vasquez stops three steps away and holds out an open hand.",
    next: [
      { label: "Hand over the bag", hook: "Trade it for a way out.", intent: "Rae gives Vasquez the bag in exchange for protection from Kessler." },
      { label: "Show her what's inside", hook: "Make her choose too.", intent: "Rae shows Vasquez the contents of the bag, forcing the detective to decide whose side she is on." },
      { label: "Fire escape", hook: "One more run.", intent: "Rae bolts down the fire escape with the bag." },
    ],
    patch: { location: "Rooftop of the Marrow Grand Hotel", timeOfDay: "dawn", weather: "clearing rain, low cloud", heat: 4, threads: ["Vasquez offers a deal on the rooftop.", "What is in the bag?"] },
  },
];

const ORDER = ["pier", "freeway", "teo", "nightmarket", "meridian", "chopshop", "rooftop"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class MockPlanner implements Planner {
  readonly name = "mock";
  constructor(private readonly latencyMs = 0) {}

  async planOpening(state: StoryState, signal?: AbortSignal): Promise<BeatPlan> {
    await this.wait(signal);
    const s = SITUATIONS[0];
    return this.build(0, s, undefined, state, "The night begins.");
  }

  async planBeat(state: StoryState, beatIndex: number, choice: Choice, previous: BeatPlan, signal?: AbortSignal): Promise<BeatPlan> {
    await this.wait(signal);
    const prevKey = (previous as BeatPlan & { situationKey?: string }).situationKey ?? ORDER[(beatIndex - 1) % ORDER.length];
    const prevIdx = Math.max(0, ORDER.indexOf(prevKey));
    // Move forward through the world; the choice nudges which situation comes next.
    const step = 1 + (hash(choice.intent) % 2);
    const next = SITUATIONS[(prevIdx + step) % SITUATIONS.length];
    return this.build(beatIndex, next, choice, state, choice.intent);
  }

  private build(beatIndex: number, s: Situation, choice: Choice | undefined, state: StoryState, action: string): BeatPlan {
    const seed = hash(`${beatIndex}:${s.key}:${action}`);
    const actionText = choice ? lowerFirst(choice.intent.replace(/^Rae\s+/i, "")) : "checks the yard for movement";
    const shots = s.shots.map((tpl, i) => {
      const summary = tpl.replace("{choice}", actionText);
      const camera = CAMERAS[(seed + i) % CAMERAS.length];
      const shot: Shot = {
        role: i === 0 ? "setup" : i === 1 ? "action" : "turn",
        summary,
        frame: `${summary} ${camera}.`,
        motion: summary,
        camera,
        location: s.location,
        charactersOnScreen: ["rae", ...(s.key === "teo" ? ["teo"] : s.key === "nightmarket" || s.key === "rooftop" ? ["vasquez"] : s.key === "meridian" ? ["kessler"] : [])],
      };
      return shot;
    }) as [Shot, Shot, Shot];
    const nextChoices = s.next.map((c, i) => ({ id: (["A", "B", "C"] as ChoiceId[])[i], ...c })) as [Choice, Choice, Choice];
    const plan: BeatPlan & { situationKey: string } = {
      beatIndex,
      choiceTaken: choice,
      plannedBy: this.name,
      synopsis: choice ? `${choice.label}: ${shots[1].summary}` : `${state.protagonist.name} hides in the container yard with the stolen bag.`,
      shots,
      cliffhanger: s.cliffhanger,
      nextChoices,
      stateAfter: { ...s.patch, cashDelta: (seed % 3) * 50 - 50 },
      situationKey: s.key,
    };
    return plan;
  }

  private wait(signal?: AbortSignal): Promise<void> {
    if (this.latencyMs <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, this.latencyMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      });
    });
  }
}

function lowerFirst(s: string): string {
  return s.length ? s[0].toLowerCase() + s.slice(1) : s;
}
