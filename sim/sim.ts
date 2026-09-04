// The Maze simulator: the real engine (src/core) running in the browser with a template writer
// and storyboard cards instead of video. Everything about timing, voting and money is the real code.
import {
  ClipPipeline,
  CreditsLedger,
  MockImageProvider,
  MockPlanner,
  MockVideoProvider,
  Showrunner,
  VoteEngine,
  defaultStory,
  type Choice,
  type ChoiceId,
  type Clock,
  type NowPlaying,
  type VoteResult,
  type VoteTally,
} from "../src/core/index.js";

/** Real time, optionally sped up (timers and the clock scale together). */
class ScaledClock implements Clock {
  private readonly t0 = Date.now();
  constructor(private readonly k: number) {}
  now(): number {
    return this.t0 + (Date.now() - this.t0) * this.k;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    return setTimeout(fn, Math.max(0, ms / this.k));
  }
  clearTimeout(h: unknown): void {
    clearTimeout(h as number);
  }
}

const COIN_USD = 0.0125;
const CREATOR_SHARE = 0.5;
const COST_PER_BEAT = 3.84;
const GIFT_ICON: Record<ChoiceId, string> = { A: "🌹", B: "🎮", C: "🍦" };
const GIFT_NAME: Record<ChoiceId, string> = { A: "Rose", B: "GG", C: "Ice Cream Cone" };
const BOT_NAMES = ["mira_k", "dozer99", "ivy.ivy", "nightowl", "kap", "rae_fan", "solano_stan", "harborcat", "j0el", "pixelpete", "lulu", "tomas_v", "zed", "quill", "marrow_mike"];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const shot = document.querySelector(".shot") as HTMLElement;
const voteEl = $("vote"), voptsEl = $("vopts"), countEl = $("count"), vbarEl = $("vbar"), winnerEl = $("winner"), toastsEl = $("toasts"), logEl = $("log"), hintEl = $("hint");
const tallyEls = { A: $("tA"), B: $("tB"), C: $("tC") }, unitEls = { A: $("uA"), B: $("uB"), C: $("uC") };

interface Session {
  clock: ScaledClock;
  showrunner: Showrunner;
  votes: VoteEngine;
  beatStart: number;
  beatEnd: number;
  np?: NowPlaying;
  vote?: { opensAt: number; closesAt: number; closed: boolean; choices: Choice[] };
  coins: number;
  beats: number;
  myPick?: ChoiceId;
  crowd: boolean;
  crowdTimer?: number;
  stopped: boolean;
}
let S: Session;

function boot(): void {
  if (S) {
    S.stopped = true;
    S.showrunner.stop();
    clearInterval(S.crowdTimer);
  }
  const speed = Number(($("speed") as HTMLSelectElement).value);
  const renderMs = Number(($("render") as HTMLSelectElement).value);
  const clock = new ScaledClock(speed);
  const credits = new CreditsLedger({ starterCredits: 0, now: () => clock.now() });
  const votes = new VoteEngine({ clock, credits, mode: "value", voteCost: 1, chatVotePolicy: "free", chatVoteValue: 1 });
  const pipeline = new ClipPipeline({
    clock,
    video: new MockVideoProvider({ clock, latencyMs: () => renderMs * (0.8 + Math.random() * 0.4) }),
    image: new MockImageProvider({ clock, latencyMs: 2500 }),
    mode: "keyframe-i2v",
    clipMs: 15_000,
    aspectRatio: "9:16",
  });
  const showrunner = new Showrunner({ clock, planner: new MockPlanner(400), pipeline, votes, story: defaultStory(), config: { speculation: "keyframes" } });
  S = { clock, showrunner, votes, beatStart: 0, beatEnd: 0, coins: 0, beats: 0, crowd: S ? S.crowd : true, stopped: false };
  $("renderlbl").textContent = `renders take ~${Math.round(renderMs / 1000)} s per 15 s clip`;
  logEl.innerHTML = "";
  voteEl.classList.remove("open");
  updateMoney();

  const mine = () => S.showrunner === showrunner; // ignore events from an instance that was restarted away
  showrunner.on("beat", (b) => {
    if (!mine()) return;
    S.beatStart = b.startsAt;
    S.beatEnd = b.endsAt;
    S.beats++;
    $("beatlbl").textContent = `beat ${b.index}${b.plan.choiceTaken ? ` · after “${b.plan.choiceTaken.label}”` : ""}`;
    logEntry("beat", `Beat ${b.index}${b.plan.choiceTaken ? ` · the audience chose ${b.plan.choiceTaken.id}) ${esc(b.plan.choiceTaken.label)}` : ""}`, `${esc(b.plan.synopsis)}<ul>${b.plan.shots.map((s) => `<li><b>${s.role}</b> — ${esc(s.summary)}</li>`).join("")}</ul>`);
    $("status").textContent = `on air · beat ${b.index}`;
    updateMoney();
  });
  showrunner.on("slot", (np) => {
    if (!mine()) return;
    S.np = np;
    const c = np.clip;
    shot.querySelector(".beatno")!.textContent = np.beatIndex >= 0 ? String(np.beatIndex).padStart(2, "0") : "";
    const role = shot.querySelector(".role") as HTMLElement;
    role.textContent = `${(c.title || "").split(" · ")[0]}${np.filler ? " · filler" : ""}${np.slot >= 0 ? ` · shot ${np.slot + 1}/3` : ""}`;
    role.classList.toggle("filler", !!np.filler);
    shot.querySelector(".loc")!.textContent = c.location || "";
    shot.querySelector(".text")!.textContent = c.text || "";
    if (np.filler) logEntry("warn", "Filler", `Shot ${np.slot + 1} of beat ${np.beatIndex} was not rendered in time, so an establishing shot of ${esc(c.location || "the location")} is covering. The real clip cuts in if it lands.`);
    else if (np.startsAt > S.beatStart + np.slot * 15_000 + 500) logEntry("warn", "Cut in", `The real shot ${np.slot + 1} landed ${((np.startsAt - (S.beatStart + np.slot * 15_000)) / 1000).toFixed(1)} s late and replaced the filler.`);
  });
  showrunner.on("vote_open", (v) => {
    if (!mine()) return;
    S.vote = { opensAt: v.opensAt, closesAt: v.closesAt, closed: false, choices: v.choices };
    S.myPick = undefined;
    voptsEl.innerHTML = v.choices.map((c) => `<div class="vopt" data-id="${c.id}"><div class="ico">${GIFT_ICON[c.id]}</div><div><div class="lbl">${esc(c.label)}</div><div class="sub">send ${GIFT_NAME[c.id]}</div></div><div class="val"></div><div class="fill"></div></div>`).join("");
    voteEl.classList.add("open");
    winnerEl.classList.remove("show");
    renderTally({ A: 0, B: 0, C: 0 });
    hintEl.className = "hint";
    hintEl.textContent = "Vote is open: send a gift for your option. Bigger gifts count more.";
    if (S.crowd) startCrowd();
  });
  showrunner.on("vote_tally", (t) => mine() && renderTally(t.tally));
  showrunner.on("vote_closed", (r) => {
    if (!mine()) return;
    if (S.vote) S.vote.closed = true;
    stopCrowd();
    renderTally(r.result.tally);
    for (const el of voptsEl.querySelectorAll<HTMLElement>(".vopt")) el.classList.toggle("win", el.dataset.id === r.result.winner);
    winnerEl.querySelector(".v")!.textContent = `${r.choice.id}) ${r.choice.label}`;
    winnerEl.querySelector(".s")!.textContent = describeResult(r.result);
    winnerEl.classList.add("show");
    setTimeout(() => voteEl.classList.remove("open"), 1400);
    setTimeout(() => winnerEl.classList.remove("show"), 5000);
    logEntry("vote", `Vote after beat ${r.beatIndex}`, `<b>${r.choice.id}) ${esc(r.choice.label)}</b> wins with ${r.result.tally[r.result.winner].toLocaleString()} coins (A ${r.result.tally.A} · B ${r.result.tally.B} · C ${r.result.tally.C}). ${r.result.reason === "no-votes-default" ? "Nobody voted, so the careful option won by default." : r.result.reason === "tiebreak-random" ? "Tie, broken at random." : ""}`);
    hintEl.className = "hint";
    hintEl.textContent = "Vote closed. The winner's clip 4 is rendering now, with 20 seconds to spare.";
  });
  showrunner.start().catch((e) => ($("status").textContent = `failed: ${e.message}`));
}

function describeResult(r: VoteResult): string {
  if (r.reason === "no-votes-default") return "Nobody voted — the careful option wins by default.";
  const total = r.totalVotes;
  return `${r.tally[r.winner].toLocaleString()} of ${total.toLocaleString()} coins${r.reason === "tiebreak-random" ? " · tie broken by fate" : ""}`;
}

function renderTally(t: VoteTally): void {
  const max = Math.max(1, t.A, t.B, t.C);
  for (const id of ["A", "B", "C"] as ChoiceId[]) {
    const n = t[id];
    tallyEls[id].textContent = n.toLocaleString();
    unitEls[id].textContent = n ? `coins ≈ $${(n * COIN_USD).toFixed(2)}` : "no gifts yet";
    const el = voptsEl.querySelector<HTMLElement>(`.vopt[data-id="${id}"]`);
    if (el) {
      el.querySelector<HTMLElement>(".fill")!.style.width = `${(n / max) * 100}%`;
      el.querySelector(".val")!.textContent = n ? `${n.toLocaleString()} 🪙` : "";
    }
  }
}

// ---------- the audience (you) ----------
function sendGift(name: string, coins: number, selects: ChoiceId | undefined, who: string, mine: boolean): void {
  const before = S.votes.tally();
  const credited = S.votes.gift({ userId: who, source: "tiktok", coins, selects, giftName: name, displayName: who });
  S.coins += coins;
  if (mine && selects) S.myPick = selects;
  if (mine && !credited) {
    hintEl.className = "hint err";
    hintEl.textContent = S.votes.isOpen() ? "That gift is waiting: send a Rose, GG or Ice Cream to pick an option and it lands there." : "The vote is not open right now. The gift still counts as revenue.";
  }
  toast(`${who} sent ${name} <b>${coins.toLocaleString()} 🪙</b>${credited ? ` → ${credited}` : ""}`);
  if (S.votes.tally() && before) S.showrunner.notifyTally();
  updateMoney();
}
for (const b of document.querySelectorAll<HTMLButtonElement>(".gift")) {
  b.onclick = () => sendGift(b.dataset.gift!, Number(b.dataset.coins), b.dataset.sel as ChoiceId | undefined, "you", true);
}
$("crowd").onclick = () => {
  S.crowd = !S.crowd;
  $("crowd").textContent = `Simulated crowd: ${S.crowd ? "on" : "off"}`;
  $("crowd").classList.toggle("on", S.crowd);
  if (!S.crowd) stopCrowd();
  else if (S.votes.isOpen()) startCrowd();
};
$("crowd").classList.add("on");
$("restart").onclick = boot;

// ---------- simulated crowd ----------
function startCrowd(): void {
  stopCrowd();
  const lean = (["A", "B", "C"] as ChoiceId[])[Math.floor(Math.random() * 3)];
  S.crowdTimer = window.setInterval(() => {
    if (!S.votes.isOpen()) return stopCrowd();
    if (Math.random() < 0.55) return;
    const who = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const r = Math.random();
    const pick = Math.random() < 0.5 ? lean : (["A", "B", "C"] as ChoiceId[])[Math.floor(Math.random() * 3)];
    // bots pick with the option's 1-coin gift, then bigger gifts add to that pick
    if (r < 0.04) { sendGift(GIFT_NAME[pick], 1, pick, who, false); sendGift("Galaxy", 1000, undefined, who, false); }
    else if (r < 0.15) { sendGift(GIFT_NAME[pick], 1, pick, who, false); sendGift("Finger Heart", 5, undefined, who, false); }
    else if (r < 0.3) { sendGift(GIFT_NAME[pick], 1, pick, who, false); sendGift("Perfume", 20, undefined, who, false); }
    else sendGift(GIFT_NAME[pick], 1, pick, who, false);
  }, 380 / Number(($("speed") as HTMLSelectElement).value));
}
function stopCrowd(): void {
  clearInterval(S.crowdTimer);
  S.crowdTimer = undefined;
}

// ---------- money ----------
function updateMoney(): void {
  $("mCoins").textContent = `${S.coins.toLocaleString()} coins`;
  $("mUsd").textContent = `$${(S.coins * COIN_USD).toFixed(2)} paid by viewers`;
  $("mShare").textContent = `$${(S.coins * COIN_USD * CREATOR_SHARE).toFixed(2)}`;
  $("mCost").textContent = `−$${(S.beats * COST_PER_BEAT).toFixed(2)}`;
}

// ---------- animation ----------
function frame(): void {
  if (S && !S.stopped) {
    const now = S.clock.now();
    if (S.beatEnd > S.beatStart) {
      const p = Math.min(1, Math.max(0, (now - S.beatStart) / (S.beatEnd - S.beatStart)));
      $("head").style.left = `${p * 100}%`;
    }
    if (S.np) {
      const p = Math.min(1, Math.max(0, (now - S.np.startsAt) / (S.np.endsAt - S.np.startsAt)));
      (shot.querySelector(".prog i") as HTMLElement).style.width = `${p * 100}%`;
    }
    if (S.vote && !S.vote.closed) {
      const left = Math.max(0, S.vote.closesAt - now);
      countEl.textContent = String(Math.ceil(left / 1000));
      vbarEl.style.transform = `scaleX(${left / (S.vote.closesAt - S.vote.opensAt)})`;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- helpers ----------
function toast(html: string): void {
  const d = document.createElement("div");
  d.className = "toast";
  d.innerHTML = html;
  toastsEl.appendChild(d);
  while (toastsEl.children.length > 4) toastsEl.firstChild!.remove();
  setTimeout(() => d.remove(), 3600);
}
function logEntry(kind: string, k: string, html: string): void {
  const d = document.createElement("div");
  d.className = "e";
  d.innerHTML = `<div class="k ${kind}">${k}</div><div>${html}</div>`;
  logEl.prepend(d);
  while (logEl.children.length > 30) logEl.lastChild!.remove();
}
function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
// viewers counter drifts for flavor
setInterval(() => ($("viewers").textContent = `${(1.6 + Math.random() * 0.6).toFixed(1)}K`), 5000);

boot();
