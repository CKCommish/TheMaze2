import type { BeatPlanBody } from "../core/index.js";

/**
 * A fully worked beat, used two ways:
 *  - as the quality-and-format example inside the writer's instructions (few-shot), and
 *  - as the reference example in docs/10-worked-examples.md.
 *
 * Situation: the opening beat ended with the phone in the stolen bag ringing. The audience chose
 * A) "Answer the phone". This is beat 1.
 */
export const EXAMPLE_ANSWER_THE_PHONE: BeatPlanBody = {
  synopsis:
    "Rae answers the phone in the stolen bag. The caller knows her name and her car and offers a trade at the Meridian by 3 a.m. As she hangs up, two SUVs roll into the container yard, searching.",
  shots: [
    {
      role: "setup",
      summary: "Inside the rain-hammered sedan, Rae stares at the glowing phone in the open bag, then answers it without a word.",
      frame:
        "Interior of a dented silver sedan at night. Rain streaks the windshield; the sodium-orange lights of a container yard smear beyond the glass. On the passenger seat an open black duffel bag, a phone inside it glowing UNKNOWN NUMBER, lighting Rae from below as she looks down at it. Shallow focus on the phone, the yard blurred behind.",
      motion:
        "[0-5 seconds] Rain drums on the roof. The phone buzzes against the bag's lining; Rae watches it, her thumb ring tapping the steering wheel. [5-10 seconds] She wipes her hand on her jeans, lifts the phone, thumbs answer and raises it to her ear without a word. A wiper drags once across the glass. [10-15 seconds] A calm man's voice, close and clear: \"Rae Solano. Silver sedan, plate ending in six. You're sitting in it right now.\" Rae's eyes go to the mirror.",
      camera: "50mm, locked off from the dashboard, then a slow push-in toward Rae",
      location: "Pier 9 container yard, inside the silver sedan",
      charactersOnScreen: ["rae"],
    },
    {
      role: "action",
      summary: "The caller makes his offer: bring the bag to the Meridian's top floor by three and the night ends quietly. Or else.",
      frame:
        "Tight profile of Rae in the driver's seat, phone to her ear, rain-light crawling across the side window behind her. Through the glass, rust-red container stacks in sea mist and one distant swinging work lamp.",
      motion:
        "[0-5 seconds] Rae, low and steady: \"Who is this?\" The voice: \"The man whose bag you're holding. The Meridian, top floor, three a.m. Bring it, and tonight ends quietly.\" [5-10 seconds] Rae looks at the bag, then out at the dark stacks. A foghorn sounds far off. She says nothing; her jaw sets. [10-15 seconds] The voice: \"Or don't, and I send the people who don't ask questions.\" A click, then dial tone. Rae lowers the phone slowly and presses it against the wheel.",
      camera: "85mm profile close-up, handheld, shallow focus, rain on the glass",
      location: "Pier 9 container yard, inside the silver sedan",
      charactersOnScreen: ["rae"],
    },
    {
      role: "turn",
      summary: "Headlights swing into the yard. Two black SUVs roll down the aisle between the containers, spotlights raking the stacks, as Rae kills her dome light and slides down in her seat.",
      frame:
        "Wide shot from behind the sedan: the dented silver car dark among rust-red containers, and at the far end of the aisle two black SUVs turning in through rain and mist, headlights flaring, door-mounted spotlights sweeping the stacks.",
      motion:
        "[0-5 seconds] Rae snaps off the dome light; the cabin drops to darkness lit only by the phone in her hand. Through the rear window, headlights sweep across wet containers. [5-10 seconds] Two black SUVs roll slowly down the aisle, spotlights raking the stacks, engines low under the rain. Rae slides down in her seat. [10-15 seconds] The lead SUV stops one row away. A door opens. Rae's hand finds the ignition key; the other closes on the bag.",
      camera: "28mm wide from behind the car, slow drift, then a rack focus to the key in Rae's hand",
      location: "Pier 9 container yard, inside the silver sedan",
      charactersOnScreen: ["rae"],
    },
  ],
  cliffhanger: "Rae in the dark sedan, one hand on the key and one on the bag, an SUV door standing open one row away.",
  nextChoices: [
    { id: "A", label: "Stay down", hook: "Let them search. Maybe they miss the car.", intent: "Rae stays hidden in the dark sedan and waits for the SUVs to pass." },
    { id: "B", label: "Start it and run", hook: "Lights off, straight for the gate.", intent: "Rae starts the sedan and races for the yard gate with the SUVs behind her." },
    { id: "C", label: "Walk out and talk", hook: "Meet them in the open, bag in hand.", intent: "Rae gets out with the bag and walks toward the SUVs to negotiate." },
  ],
  stateAfter: {
    location: "Pier 9 container yard, inside the silver sedan",
    heat: 3,
    threads: [
      "The caller wants the bag at the Meridian's top floor by 3 a.m.",
      "Two SUVs are searching the container yard for Rae.",
      "Detective Vasquez saw Rae's car at the pier.",
      "What is in the bag?",
    ],
  },
};

/** The example as the writer must emit it (nulls instead of missing fields). */
export function exampleForPrompt(): string {
  const p = EXAMPLE_ANSWER_THE_PHONE;
  const out = {
    synopsis: p.synopsis,
    shots: p.shots,
    cliffhanger: p.cliffhanger,
    nextChoices: p.nextChoices,
    stateAfter: {
      location: p.stateAfter.location ?? null,
      timeOfDay: p.stateAfter.timeOfDay ?? null,
      weather: p.stateAfter.weather ?? null,
      heat: p.stateAfter.heat ?? null,
      cashDelta: p.stateAfter.cashDelta ?? null,
      addAllies: p.stateAfter.addAllies ?? [],
      removeAllies: p.stateAfter.removeAllies ?? [],
      addInventory: p.stateAfter.addInventory ?? [],
      removeInventory: p.stateAfter.removeInventory ?? [],
      threads: p.stateAfter.threads ?? [],
    },
  };
  return JSON.stringify(out, null, 1);
}
