# Worked examples: how one gift becomes 45 seconds of story

You send a Rose. Ten seconds later the show knows what the audience wants. Twenty seconds after that, the next 45 seconds of the movie are on screen and they do what you voted for. This document walks through exactly what happens in between, with real text from the engine.

## The engine in one breath

Every beat, the **writer** (Claude, `src/planner/claude-planner.ts`) receives:

- the world right now: location, time of day, weather, heat (0–5), cash, allies, inventory, open plot threads, and the last eight beats;
- the cast list with ids (rae, teo, vasquez, kessler);
- the previous beat's synopsis, its cliffhanger, the three options that were offered, and **the option the audience chose**.

It returns one structured plan, always the same shape:

| Field | What it is |
|---|---|
| `synopsis` | one or two sentences: what happens in this beat |
| `shots[0..2]` | three 15-second shots in fixed roles: **setup → action → turn**. Each has a `summary` (plain words), a `frame` (the opening image, for the keyframe painter), a `motion` script in three 5-second blocks with dialogue in quotes (for the video model), `camera`, `location`, and who is on screen |
| `cliffhanger` | the frozen decision moment shot 3 ends on. It must work as the lead-in for **all three** next options |
| `nextChoices` | A, B, C: label (2–5 words), a one-line hook, and the full intent |
| `stateAfter` | what changed: location, heat, cash, allies, inventory, threads |

The **renderer** (`src/core/pipeline.ts`) then adds two things the writer never touches: the locked description of every character on screen (so the writer cannot drift the look) and the style bible. It paints the opening frame from the character's approved photos, then animates that frame for 15 seconds.

The writer's rules, in plain words: the chosen action is spread across all three shots (set it up, do it, pay it off); never describe faces or clothes (the system injects them); write motion as `[0-5 seconds] … [5-10 seconds] … [10-15 seconds] …`; at most two short lines of dialogue per shot; end on a cliffhanger that any of the three options can follow; make the options careful / bold / wild; no weapons or fights on screen in TikTok mode; escalate, pay something off every few beats, reveal the mystery in pieces.

---

## Example 1: the audience chose "Answer the phone"

### Where the story is

The opening beat (beat 0) ended like this: Rae is in the dented silver sedan in the Pier 9 container yard, rain hammering, the stolen black duffel bag on the passenger seat, and a phone inside the bag is ringing: UNKNOWN NUMBER. World: night, steady rain, heat 2, cash $340. Open threads: someone is calling the phone in the bag; Kessler's people want the bag back by dawn; Detective Vasquez saw Rae's car at the pier.

### The vote (15 to 25 seconds into beat 0)

The panel shows three rows:

| Send | Option | Hook |
|---|---|---|
| 🌹 Rose | **A) Answer the phone** | Find out who wants the bag. |
| 🎮 GG | **B) Toss it and drive** | Lose the tracker, gain the city. |
| 🍦 Ice Cream Cone | **C) Open the bag** | See what you actually stole. |

Say 212 people send a Rose, 61 send a GG, 40 send an Ice Cream. A wins with 212 coins. (Example 4 shows the same vote with a whale.)

### The plan the writer returns

This is the actual example the writer is trained on (`src/planner/examples.ts`); it is also validated by the test suite.

**Synopsis.** Rae answers the phone in the stolen bag. The caller knows her name and her car and offers a trade at the Meridian by 3 a.m. As she hangs up, two SUVs roll into the container yard, searching.

**Shot 1, SETUP (0:00–0:15).** *Inside the rain-hammered sedan, Rae stares at the glowing phone in the open bag, then answers it without a word.*

- Frame: Interior of a dented silver sedan at night. Rain streaks the windshield; the sodium-orange lights of a container yard smear beyond the glass. On the passenger seat an open black duffel bag, a phone inside it glowing UNKNOWN NUMBER, lighting Rae from below as she looks down at it. Shallow focus on the phone, the yard blurred behind.
- Motion: `[0-5 seconds]` Rain drums on the roof. The phone buzzes against the bag's lining; Rae watches it, her thumb ring tapping the steering wheel. `[5-10 seconds]` She wipes her hand on her jeans, lifts the phone, thumbs answer and raises it to her ear without a word. A wiper drags once across the glass. `[10-15 seconds]` A calm man's voice, close and clear: "Rae Solano. Silver sedan, plate ending in six. You're sitting in it right now." Rae's eyes go to the mirror.
- Camera: 50mm, locked off from the dashboard, then a slow push-in toward Rae.

**Shot 2, ACTION (0:15–0:30).** *The caller makes his offer: bring the bag to the Meridian's top floor by three and the night ends quietly. Or else.*

- Frame: Tight profile of Rae in the driver's seat, phone to her ear, rain-light crawling across the side window behind her. Through the glass, rust-red container stacks in sea mist and one distant swinging work lamp.
- Motion: `[0-5 seconds]` Rae, low and steady: "Who is this?" The voice: "The man whose bag you're holding. The Meridian, top floor, three a.m. Bring it, and tonight ends quietly." `[5-10 seconds]` Rae looks at the bag, then out at the dark stacks. A foghorn sounds far off. She says nothing; her jaw sets. `[10-15 seconds]` The voice: "Or don't, and I send the people who don't ask questions." A click, then dial tone. Rae lowers the phone slowly and presses it against the wheel.
- Camera: 85mm profile close-up, handheld, shallow focus, rain on the glass.

**Shot 3, TURN (0:30–0:45).** *Headlights swing into the yard. Two black SUVs roll down the aisle between the containers, spotlights raking the stacks, as Rae kills her dome light and slides down in her seat.*

- Frame: Wide shot from behind the sedan: the dented silver car dark among rust-red containers, and at the far end of the aisle two black SUVs turning in through rain and mist, headlights flaring, door-mounted spotlights sweeping the stacks.
- Motion: `[0-5 seconds]` Rae snaps off the dome light; the cabin drops to darkness lit only by the phone in her hand. Through the rear window, headlights sweep across wet containers. `[5-10 seconds]` Two black SUVs roll slowly down the aisle, spotlights raking the stacks, engines low under the rain. Rae slides down in her seat. `[10-15 seconds]` The lead SUV stops one row away. A door opens. Rae's hand finds the ignition key; the other closes on the bag.
- Camera: 28mm wide from behind the car, slow drift, then a rack focus to the key in Rae's hand.

**Cliffhanger.** Rae in the dark sedan, one hand on the key and one on the bag, an SUV door standing open one row away.

**Next vote** (this is what the panel shows at 0:15 of this beat):

| Send | Option | Hook |
|---|---|---|
| 🌹 Rose | **A) Stay down** | Let them search. Maybe they miss the car. |
| 🎮 GG | **B) Start it and run** | Lights off, straight for the gate. |
| 🍦 Ice Cream Cone | **C) Walk out and talk** | Meet them in the open, bag in hand. |

Notice the cliffhanger works for all three: staying, starting the car, and getting out are all possible from "hand on the key, hand on the bag, door open one row away". That is the trick that lets shot 3 be rendered before the vote is decided.

**World after this beat.** Heat 2 → 3. Threads: the caller wants the bag at the Meridian's top floor by 3 a.m.; two SUVs are searching the yard for Rae; Vasquez saw Rae's car at the pier; what is in the bag?

### What the renderer actually sends for shot 2

The writer's text is only part of the prompt. Here is the complete keyframe prompt the image model receives (the character description is injected verbatim from the story bible, and the reference photos travel with it):

```
A single cinematic film still, vertical 9:16.
Tight profile of Rae in the driver's seat, phone to her ear, rain-light crawling across the side window behind her. Through the glass, rust-red container stacks in sea mist and one distant swinging work lamp.
Location: Pier 9 container yard, inside the silver sedan. night, steady rain, sea mist.
Characters on screen (keep faces, hair and wardrobe exactly like the reference photos): Rae Solano, a woman in her late twenties, wiry and 5'8", light-brown skin, sharp jaw, cropped black hair buzzed short on the left side, a thin pale scar cutting through her left eyebrow, dark watchful eyes, a small silver ring on her right thumb. She always wears: faded grey-green bomber jacket with a worn orange lining, plain black t-shirt, black jeans, scuffed white sneakers, a black canvas sling bag across her chest.
Camera: 85mm profile close-up, handheld, shallow focus, rain on the glass.
Style: Cinematic photoreal live-action. Shot on a large-format digital cinema camera with anamorphic lenses, shallow depth of field, natural motion blur, 24 fps. Overcast coastal light, wet asphalt, sodium-vapor orange and cold cyan neon, drifting sea mist, vast desolate skylines and container yards in the distance. Muted teal-and-amber grade, deep blacks, restrained contrast, subtle film grain. Grounded, weighty physics; no cartoon exaggeration, no text overlays, no logos, no watermarks.
```

And the video prompt the H3 Max model receives together with that painted frame:

```
[0-5 seconds] Rae, low and steady: "Who is this?" The voice: "The man whose bag you're holding. The Meridian, top floor, three a.m. Bring it, and tonight ends quietly." [5-10 seconds] Rae looks at the bag, then out at the dark stacks. A foghorn sounds far off. She says nothing; her jaw sets. [10-15 seconds] The voice: "Or don't, and I send the people who don't ask questions." A click, then dial tone. Rae lowers the phone slowly and presses it against the wheel.
Camera: 85mm profile close-up, handheld, shallow focus, rain on the glass.
Location: Pier 9 container yard, inside the silver sedan. night, steady rain, sea mist.
Characters on screen (keep faces, hair and wardrobe exactly like the reference photos): Rae Solano, a woman in her late twenties, … (same block as above)
Style: Cinematic photoreal live-action. … (same block as above)
```

H3 Max generates the audio too, so the dialogue in quotes is spoken, with the rain and the foghorn.

### What the viewer sees, second by second

| Beat 1 clock | On screen |
|---|---|
| 0:00 | Shot 1: the phone glowing in the bag, Rae answers. (This is "clip 4": it started rendering the instant the previous vote closed.) |
| 0:15 | Shot 2: the call. The vote panel slides up: Stay down / Start it and run / Walk out and talk. 10-second countdown. |
| 0:25 | Panel closes, winner card flashes. The winner's shot 1 starts rendering. |
| 0:30 | Shot 3: the SUVs arrive, Rae's hand on the key. |
| 0:45 | Beat 2 starts with the winner's shot 1. |

---

## Example 2: same vote, but "Toss it and drive" wins

Same world, same cliffhanger, different winner. The writer returns a different beat:

**Synopsis.** Rae hurls the ringing phone into the harbor and tears out of the yard. On the freeway a dark SUV finds her anyway, and a blinking light inside the bag's lining tells her the tracker was never the phone.

- **Shot 1, SETUP.** Rae grabs the buzzing phone from the bag and is out of the car into the rain; she sprints between containers to the pier edge, wind tearing at her jacket, and throws. The phone arcs, its screen a spark, and vanishes into black water. `[10-15 seconds]` She is already running back.
- **Shot 2, ACTION.** The sedan reverses hard, spins, and blasts down the aisle; the yard's barrier arm splinters across the hood; the car climbs the ramp onto the elevated Skyline Freeway, the harbor cranes and a black sea falling away below. Dialogue: none. Sound: engine, rain, the barrier.
- **Shot 3, TURN.** Seventy on the wet freeway. A dark SUV surges up alongside in the next lane and matches her speed, its window black. Rae glances down: inside the bag's lining, a tiny red light blinks. Her eyes go from the light to the SUV.

**Cliffhanger.** Seventy on the freeway, the SUV matching her speed, a red light blinking inside the bag's lining.

**Next vote.** 🌹 A) Harbor tunnel (lose them in the dark) · 🎮 B) Cut across four lanes (take the exit at the last second) · 🍦 C) Throw the bag out (lose it all, lose them).

**World after.** Location: Skyline Freeway, elevated over the harbor. Heat 3. Threads: a tracker is sewn into the bag's lining; a dark SUV is on Rae's tail; Kessler's people want the bag back by dawn.

Two things to notice. First, the cliffhanger again fits all three options. Second, both branches keep the same open mystery (what is in the bag) but each reveals a different piece: in Example 1 we learn the caller knows her; here we learn the bag is tracked. That is the "reveal in pieces" rule at work.

---

## Example 3: a wild option, contained in 45 seconds

Later that night, at the Meridian casino, the audience picks the wild card: **C) Pull the fire alarm**.

- **Shot 1, SETUP.** Kessler's man in the grey suit steps out of the private elevator and stops, blocking the corridor. Rae backs up one step, then two, and her shoulder finds the red alarm box on the marble wall. Dialogue: "Miss Solano. Mr. Kessler is waiting." "Tell him I'll be a minute."
- **Shot 2, ACTION.** She pulls it. Strobes, a klaxon, sprinklers hissing on over the gaming floor; a thousand people rise at once; chips and drinks go over; the grey suit is swallowed by the crowd surging for the doors. Rae moves against the flow toward the service stairs.
- **Shot 3, TURN.** The service stairwell, alarms echoing. Two floors down she pushes through a fire door into the rain of the parking deck and stops: Detective Vasquez is leaning on the sedan, arms folded, badge on its chain, waiting.

**Cliffhanger.** Alarms behind her, rain ahead, Vasquez waiting at her car with an open hand.

**Next vote.** 🌹 A) Talk to Vasquez · 🎮 B) Take another car · 🍦 C) Give her the bag.

A big action fits in 45 seconds because the writer is told each shot is one clear physical beat, and because the cliffhanger is always a *person standing still with a decision in front of them*, which any option can follow. No weapons, no fight: the grey suit is defeated by a crowd, which keeps the beat inside TikTok's LIVE rules.

---

## Example 4: the vote itself, with the money

Same vote as Example 1 (Answer the phone / Toss it and drive / Open the bag), 10 seconds:

| What happened | A | B | C |
|---|---|---|---|
| 212 viewers send a Rose (1 coin each) | 212 | | |
| 61 viewers send a GG | | 61 | |
| 40 viewers send an Ice Cream | | | 40 |
| One viewer sends a Galaxy (1,000 coins) **before picking**. It is held. | | | |
| Four seconds later the same viewer sends a GG. The GG picks B and the held Galaxy lands with it. | | +1,001 | |
| Someone taps Rose ten times in a streak. Counted once at the end of the streak, as 10 coins. | +10 | | |
| **Totals** | **222** | **1,062** | **40** |

**B wins** ("Toss it and drive"), even though A had 222 people and B had 62. The show is explicit about this rule on screen: biggest total wins. The result card reads "The audience chose B) Toss it and drive, 1,062 of 1,324 coins."

Other cases the engine handles:

- **Nobody sends anything:** option A wins (the careful option) and the card says so. The story never waits.
- **A tie:** broken at random, and the card says "tie broken by fate".
- **A gift after the panel closes:** counted as revenue, not as a vote; the toast still shows the thank-you.
- **A Galaxy from someone who never picks:** revenue, not a vote (the panel tells them to send a Rose, GG or Ice Cream to place it).
- **Comments "1", "2", "3":** ignored. Gifts are the only vote.

The money on that one vote: 1,324 coins ≈ $16.55 paid by viewers, of which about half reaches the creator (≈ $8.28) after TikTok's cut. The beat cost about $3.84 to render at fal's list price. A room that votes like this every beat pays for itself; a quieter room does not, which is why the plan is scheduled episodes first.

---

## The clock across two beats

| Time | Beat 1 on screen | Machinery |
|---|---|---|
| −0:20 | (beat 0, shot 2) | Beat 1 was just chosen. Its three shots start rendering. The writer starts drafting all three possible beat 2s. |
| 0:00 | Shot 1 | Beat 2 candidates: scripts done, opening frames being painted. |
| 0:15 | Shot 2 + vote opens | |
| 0:25 | Vote closes | Winner's shot 1 (clip 4) renders from its painted frame; the two losers are cancelled. Shots 2 and 3 of beat 2 render in parallel. |
| 0:30 | Shot 3 | The writer starts drafting all three possible beat 3s. |
| 0:40–0:45 | | Clip 4 lands. |
| 0:45 | Beat 2, shot 1 | And so on, forever. |

---

## When something goes wrong

- **Clip 4 lands late** (say 0:52): at 0:45 an establishing shot of the location plays (rendered earlier, no characters); at 0:52 the real shot cuts in and plays to 1:00. The audience sees an establishing shot then the scene, which is normal film grammar. The 45-second clock never slips.
- **fal rejects a prompt** (content filter): the shot gets one retry with the same text; if it fails again the filler covers that slot and the story text still advances. The log shows `content_policy_violation` so you can tighten the bible.
- **The writer is slow:** after 45 seconds the template writer takes over for that beat, so the vote panel always has three options.
- **A whole beat fails:** fillers cover all three slots and the next vote still runs on time. The tests in `test/timing.test.ts` prove the cadence holds even when every render fails.
