import type { CharacterSheet, StoryState } from "./types.js";

/**
 * The story bible: the world, the locked look of the cast, and the visual style.
 * Everything here is injected verbatim into prompts so the look never drifts.
 * Edit story/bible.json to change the show without touching code.
 */

export const STYLE_BIBLE =
  "Cinematic photoreal live-action. Shot on a large-format digital cinema camera with anamorphic lenses, " +
  "shallow depth of field, natural motion blur, 24 fps. Overcast coastal light, wet asphalt, sodium-vapor " +
  "orange and cold cyan neon, drifting sea mist, vast desolate skylines and container yards in the distance. " +
  "Muted teal-and-amber grade, deep blacks, restrained contrast, subtle film grain. Grounded, weighty " +
  "physics; no cartoon exaggeration, no text overlays, no logos, no watermarks.";

export const PROTAGONIST: CharacterSheet = {
  id: "rae",
  name: "Rae Solano",
  role: "protagonist",
  look:
    "Rae Solano, a woman in her late twenties, wiry and 5'8\", light-brown skin, sharp jaw, cropped black hair " +
    "buzzed short on the left side, a thin pale scar cutting through her left eyebrow, dark watchful eyes, " +
    "a small silver ring on her right thumb.",
  wardrobe:
    "faded grey-green bomber jacket with a worn orange lining, plain black t-shirt, black jeans, scuffed white " +
    "sneakers, a black canvas sling bag across her chest",
  referenceImageUrls: [],
};

export const CAST: CharacterSheet[] = [
  PROTAGONIST,
  {
    id: "teo",
    name: "Teo Marsh",
    role: "ally",
    look:
      "Teo Marsh, a man around forty, broad and heavy-set, pale weathered skin, a greying reddish beard, " +
      "receding hairline, tired grey eyes, a faded anchor tattoo on his right forearm.",
    wardrobe: "navy fisherman's sweater with a hole at the collar, oil-stained work trousers, steel-toe boots",
    referenceImageUrls: [],
  },
  {
    id: "vasquez",
    name: "Detective Ana Vasquez",
    role: "rival",
    look:
      "Detective Ana Vasquez, a woman in her mid-forties, tall, olive skin, dark hair pulled into a tight low bun, " +
      "strong brows, a small mole under her right eye, an unhurried stare.",
    wardrobe: "charcoal trench coat over a white shirt, dark trousers, a badge on a chain, black leather gloves",
    referenceImageUrls: [],
  },
  {
    id: "kessler",
    name: "Milo Kessler",
    role: "rival",
    look:
      "Milo Kessler, a man in his fifties, lean and immaculate, silver hair swept back, tanned skin, thin lips, " +
      "rimless glasses, a gold signet ring on his left little finger.",
    wardrobe: "slate-blue tailored suit, no tie, open collar, polished black oxfords, a slim black umbrella",
    referenceImageUrls: [],
  },
];

export function defaultStory(): StoryState {
  return {
    title: "The Maze",
    logline:
      "Port Marrow, a rain-soaked coastal city run by shipping money and old debts. Rae Solano, a courier who " +
      "just stole the wrong bag, has one night to turn it into a way out. The audience decides how.",
    style: STYLE_BIBLE,
    protagonist: PROTAGONIST,
    cast: CAST,
    location: "Pier 9 container yard, Port Marrow harbor",
    timeOfDay: "night",
    weather: "steady rain, sea mist",
    heat: 1,
    cash: 340,
    allies: [],
    inventory: ["the stolen black duffel bag", "a burner phone", "a dented silver sedan"],
    threads: [
      "What is in the duffel bag?",
      "Kessler's people want the bag back by dawn.",
      "Detective Vasquez saw Rae's car at the pier.",
    ],
    recentBeats: [],
    beatCount: 0,
  };
}
