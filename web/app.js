// The Maze — web player. Vanilla JS, no build step.
const qs = new URLSearchParams(location.search);
const TV = qs.get("tv") === "1";
const DIRECTOR = qs.get("director") === "1"; // this page holds the live H3 Max Director session (one instance, on the streaming machine)
const app = document.getElementById("app");
app.dataset.tv = TV ? "1" : "0";
if (TV || qs.get("log") === "0") app.dataset.log = "0";

const $ = (id) => document.getElementById(id);
const els = {
  vA: $("vA"), vB: $("vB"), card: $("card"), sub: $("sub"), title: $("title"),
  credits: $("credits"), getcredits: $("getcredits"), unmute: $("unmute"), togglelog: $("togglelog"),
  votebox: $("votebox"), opts: document.querySelector("#votebox .opts"), timer: document.querySelector("#votebox .t"),
  bar: document.querySelector("#votebox .bar > i"), hint: document.querySelector("#votebox .hint"), err: document.querySelector("#votebox .err"),
  vbeat: document.querySelector("#votebox .beat"), result: $("result"), entries: $("entries"), stats: $("stats"), toasts: $("toasts"),
};

let viewerId = null;
try { viewerId = localStorage.getItem("maze.viewerId"); } catch {}
if (!viewerId) {
  viewerId = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)).slice(0, 36);
  try { localStorage.setItem("maze.viewerId", viewerId); } catch {}
}

let offset = 0, synced = false;
const now = () => Date.now() + offset;
let settings = { voteMode: "value", voteCost: 1, coinUsd: 0.0125, giftMap: { A: "Rose", B: "GG", C: "Ice Cream Cone" }, aspectRatio: "16:9", devGrants: false, renderer: "clips", director: null, directorPreamble: "", commentsSelect: false };
let directorStarted = false, directorLive = false;
const state = { beat: null, np: null, vote: null, credits: null, mine: null, muted: true, fillers: 0, pipeline: null };
let activeVideo = null;

// ---------- websocket ----------
let ws;
function connect() {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ type: "hello", viewerId }));
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
  ws.onclose = () => { els.sub.textContent = "reconnecting…"; setTimeout(connect, 1500); };
}
function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function handle(msg) {
  if (typeof msg.serverTime === "number") {
    const sample = msg.serverTime - Date.now();
    offset = synced ? offset * 0.7 + sample * 0.3 : sample;
    synced = true;
  }
  switch (msg.type) {
    case "snapshot": {
      settings = { ...settings, ...msg.settings };
      app.dataset.aspect = settings.aspectRatio;
      els.getcredits.hidden = !settings.devGrants || TV;
      $("simpanel").hidden = !settings.devGrants || TV;
      if (msg.viewer) setCredits(msg.viewer.credits);
      if (settings.renderer === "director" && DIRECTOR && !directorStarted) startDirector();
      const s = msg.snapshot;
      state.pipeline = s.pipeline;
      if (s.story) els.title.textContent = s.story.title;
      if (s.beat) setBeat(s.beat, s.story, true);
      if (s.nowPlaying) play(s.nowPlaying);
      if (s.vote && !s.vote.result && now() < s.vote.closesAt) openVote(s.vote);
      if (s.lastResult && !s.vote?.result) logVote(s.lastResult.beatIndex, s.lastResult.result, s.lastResult.choice);
      break;
    }
    case "beat": setBeat(msg.beat, msg.story, false); break;
    case "slot": play(msg.nowPlaying); break;
    case "vote_open": openVote(msg.vote); break;
    case "vote_tally": tally(msg.tally, msg.voters); break;
    case "vote_closed": closeVote(msg); break;
    case "vote_ack": ack(msg); break;
    case "log": if (msg.level !== "info") logEntry("warn", "Note", msg.msg); if (/filler/i.test(msg.msg)) state.fillers++; break;
    case "gift": toast(`🎁 ${msg.displayName} sent ${msg.giftName ?? "a gift"} (${msg.coins} coins)${msg.choiceId ? " → " + msg.choiceId : ""}`); break;
    case "external_vote": if (msg.choiceId) toast(`💬 ${msg.displayName} voted ${msg.choiceId}`); break;
  }
}

// ---------- stage ----------
function play(np) {
  state.np = np;
  if (np.clip.kind === "director") {
    if (DIRECTOR && window.MazeDirector && np.clip.prompt) window.MazeDirector.prompt(np.clip.prompt);
    if (!directorLive) showCard(np);
    else els.card.classList.remove("active");
  } else if (np.clip.kind === "video" && np.clip.url) showVideo(np);
  else showCard(np);
  updateStats();
}
function startDirector() {
  directorStarted = true;
  const s = document.createElement("script");
  s.src = "/director.bundle.js";
  s.onload = () => {
    const token = qs.get("token") || "";
    const d = settings.director || {};
    window.MazeDirector.start({
      proxyUrl: "/api/fal/proxy" + (token ? `?token=${encodeURIComponent(token)}` : ""),
      preamble: settings.directorPreamble,
      aspectRatio: settings.aspectRatio,
      resolution: d.resolution || "768p",
      memory: d.memory || 12,
      sessionSeconds: d.sessionSeconds || 120,
      prewarmSeconds: d.prewarmSeconds || 20,
      onStream: (stream) => {
        const next = activeVideo === els.vA ? els.vB : els.vA;
        const prev = activeVideo;
        next.srcObject = stream;
        next.muted = state.muted;
        next.onplaying = () => {
          next.classList.add("active");
          if (prev && prev !== next) { prev.classList.remove("active"); prev.srcObject = null; }
          els.card.classList.remove("active");
          activeVideo = next;
          directorLive = true;
        };
        next.play().catch(() => {});
      },
      onState: (t) => logEntry("warn", "Director", esc(t)),
      log: (m) => console.log(m),
    });
    logEntry("beat", "Director", "Live stream session opened through the server proxy. Each shot's prompt steers the stream; sessions are renewed before fal's cap.");
  };
  s.onerror = () => logEntry("warn", "Director", "director.bundle.js is missing: run npm run build:web");
  document.head.appendChild(s);
}
function showVideo(np) {
  const next = activeVideo === els.vA ? els.vB : els.vA;
  const prev = activeVideo;
  next.muted = state.muted;
  next.src = np.clip.url;
  next.oncanplay = () => {
    next.oncanplay = null;
    const off = (now() - np.startsAt) / 1000;
    if (off > 0.4 && Number.isFinite(next.duration) && off < next.duration) { try { next.currentTime = off; } catch {} }
    next.play().catch(() => {});
    next.classList.add("active");
    if (prev) { prev.classList.remove("active"); setTimeout(() => { if (activeVideo !== prev) { prev.pause(); } }, 300); }
    els.card.classList.remove("active");
    activeVideo = next;
  };
  next.load();
}
function showCard(np) {
  const c = np.clip;
  els.card.querySelector(".beatno").textContent = np.beatIndex >= 0 ? String(np.beatIndex).padStart(2, "0") : "";
  const role = els.card.querySelector(".role");
  role.textContent = (c.title || "").split(" · ")[0] + (np.filler ? " · FILLER" : "") + (np.slot >= 0 ? ` · shot ${np.slot + 1}/3` : "");
  role.classList.toggle("filler", !!np.filler);
  els.card.querySelector(".loc").textContent = c.location || "";
  els.card.querySelector(".text").textContent = c.text || "";
  els.card.querySelector(".cam").textContent = c.provider === "card" ? "" : `rendered by ${c.provider}${c.generatedInMs ? ` in ${(c.generatedInMs / 1000).toFixed(1)}s` : ""}`;
  els.card.classList.add("active");
  for (const v of [els.vA, els.vB]) { v.classList.remove("active"); v.pause(); }
  activeVideo = null;
}

// ---------- beat / hud ----------
function setBeat(beat, story, fromSnapshot) {
  state.beat = beat;
  if (story) {
    els.sub.dataset.loc = story.location;
    els.sub.dataset.heat = story.heat;
  }
  if (!fromSnapshot || !els.entries.children.length) {
    const shots = (beat.shots || []).map((s) => `<li><b>${s.role}</b> — ${esc(s.summary)}</li>`).join("");
    logEntry("beat", `Beat ${beat.index}${beat.choiceTaken ? ` · you chose ${beat.choiceTaken.id}) ${esc(beat.choiceTaken.label)}` : ""}`, `${esc(beat.synopsis)}<ul>${shots}</ul>`);
  }
}
function tick() {
  const np = state.np;
  if (np) {
    const p = Math.min(1, Math.max(0, (now() - np.startsAt) / (np.endsAt - np.startsAt)));
    els.card.querySelector(".progress > i").style.width = `${p * 100}%`;
  }
  if (state.beat) {
    const left = Math.max(0, state.beat.endsAt - now());
    const mm = String(Math.floor(left / 60000)).padStart(2, "0"), ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
    els.sub.textContent = `Beat ${state.beat.index} · shot ${np && np.slot >= 0 ? np.slot + 1 : "–"}/3 · ${mm}:${ss} left · ${els.sub.dataset.loc || ""}${els.sub.dataset.heat ? ` · heat ${"▮".repeat(+els.sub.dataset.heat)}${"▯".repeat(5 - +els.sub.dataset.heat)}` : ""}`;
  }
  if (state.vote && !state.vote.closed) {
    const left = Math.max(0, state.vote.closesAt - now());
    els.timer.textContent = Math.ceil(left / 1000);
    els.bar.style.transform = `scaleX(${left / (state.vote.closesAt - state.vote.opensAt)})`;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- voting ----------
const GIFT_EMOJI = { rose: "🌹", gg: "🎮", "ice cream cone": "🍦", tiktok: "🎵", "finger heart": "🫰", heart: "❤️" };
function giftLine(id) {
  const g = settings.giftMap?.[id] || "";
  const e = GIFT_EMOJI[g.toLowerCase()] || "🎁";
  return settings.commentsSelect ? `Send ${e} ${g} · or type ${id === "A" ? 1 : id === "B" ? 2 : 3}` : `Send ${e} ${g}`;
}
function openVote(v) {
  state.vote = { ...v, closed: false };
  state.mine = null;
  els.err.textContent = "";
  els.vbeat.textContent = `beat ${v.targetBeatIndex}`;
  els.opts.innerHTML = v.choices.map((c) => `
    <button class="opt" data-id="${c.id}">
      <div class="id">${c.id}</div>
      <div class="label">${esc(c.label)}</div>
      <div class="hook">${esc(c.hook)}</div>
      <div class="gift">${giftLine(c.id)}</div>
      <div class="val"></div>
      <div class="tally"></div>
    </button>`).join("");
  for (const b of els.opts.querySelectorAll(".opt")) b.onclick = () => vote(b.dataset.id);
  els.hint.textContent = TV
    ? (settings.voteMode === "value" ? "Send the gift to vote. Every gift after that adds to your pick. Biggest total wins." : "Send the gift to vote. One vote per person.")
    : (settings.voteMode === "value" ? `Each tap spends ${settings.voteCost} credit${settings.voteCost === 1 ? "" : "s"}. Tap again to add more weight.` : `One vote per person · ${settings.voteCost} credit.`);
  tally(v.tally, 0);
  els.votebox.classList.add("open");
}
function vote(choiceId) {
  if (!state.vote || state.vote.closed || TV) return;
  send({ type: "vote", choiceId, value: settings.voteCost });
}
function ack(a) {
  if (a.ok) {
    state.mine = a.choiceId;
    for (const b of els.opts.querySelectorAll(".opt")) b.classList.toggle("mine", b.dataset.id === a.choiceId);
    if (typeof a.balance === "number") setCredits(a.balance);
    els.err.textContent = "";
    if (a.tally) tally(a.tally);
  } else {
    if (typeof a.balance === "number") setCredits(a.balance);
    els.err.textContent = a.reason === "no_credits" ? "You're out of credits." : a.reason === "already_voted" ? "You already voted this round." : a.reason === "closed" ? "Voting is closed." : "Vote failed.";
  }
}
function fmtValue(n) {
  if (settings.voteMode !== "value") return `${n} vote${n === 1 ? "" : "s"}`;
  const usd = n * (settings.coinUsd || 0);
  return `${n.toLocaleString()} coins${usd >= 0.01 ? ` ≈ $${usd.toFixed(2)}` : ""}`;
}
function tally(t, voters) {
  if (!t) return;
  const max = Math.max(1, t.A, t.B, t.C);
  for (const b of els.opts.querySelectorAll(".opt")) {
    const n = t[b.dataset.id] || 0;
    b.querySelector(".tally").style.width = `${(n / max) * 100}%`;
    b.querySelector(".val").textContent = n ? fmtValue(n) : "";
  }
}
function closeVote(r) {
  if (!state.vote) return;
  state.vote.closed = true;
  els.timer.textContent = "0";
  tally(r.result.tally);
  for (const b of els.opts.querySelectorAll(".opt")) { b.disabled = true; b.classList.toggle("winner", b.dataset.id === r.result.winner); }
  els.result.querySelector(".v").textContent = `${r.choice.id}) ${r.choice.label}`;
  const total = r.result.totalVotes;
  els.result.querySelector(".s").textContent = r.result.reason === "no-votes-default" ? "Nobody voted — the story picked for you." : `${fmtValue(r.result.tally[r.result.winner])} of ${fmtValue(total)}${r.result.reason === "tiebreak-random" ? " · tie broken by fate" : ""}`;
  els.result.classList.add("show");
  setTimeout(() => els.votebox.classList.remove("open"), 1400);
  setTimeout(() => els.result.classList.remove("show"), 5000);
  logVote(r.beatIndex, r.result, r.choice);
}
function logVote(beatIndex, result, choice) {
  logEntry("vote", `Vote after beat ${beatIndex}`, `<b>${choice.id}) ${esc(choice.label)}</b> won · A ${result.tally.A} / B ${result.tally.B} / C ${result.tally.C} (${result.reason.replace(/-/g, " ")})`);
}

// ---------- credits ----------
function setCredits(n) { state.credits = n; els.credits.innerHTML = `Credits <b>${n}</b>`; }
els.getcredits.onclick = async () => {
  const r = await fetch("/api/credits/dev-grant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ viewerId, amount: 10 }) }).then((x) => x.json()).catch(() => null);
  if (r && r.ok) { setCredits(r.balance); els.err.textContent = ""; }
};
els.unmute.onclick = () => {
  state.muted = !state.muted;
  for (const v of [els.vA, els.vB]) v.muted = state.muted;
  els.unmute.textContent = state.muted ? "🔇 Sound" : "🔊 Sound on";
  if (activeVideo) activeVideo.play().catch(() => {});
};
els.togglelog.onclick = () => { app.dataset.log = app.dataset.log === "1" ? "0" : "1"; };

// ---------- simulate TikTok (demo mode) ----------
const BOTS = ["mira_k", "dozer99", "ivy.ivy", "nightowl", "kap", "rae_fan", "harborcat", "j0el", "pixelpete", "lulu"];
let simUser = "you";
async function simGift(giftName, coins, userId = simUser, displayName = userId) {
  const r = await fetch("/api/dev/gift", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, coins, giftName, displayName }) }).then((x) => x.json()).catch(() => null);
  if (r && !r.open) els.err.textContent = "The vote is not open right now (it opens 15 s into each beat).";
}
async function simChat(text, userId = simUser) {
  await fetch("/api/dev/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, text, displayName: userId }) }).catch(() => {});
}
for (const b of document.querySelectorAll("#simpanel [data-gift]")) b.onclick = () => simGift(b.dataset.gift, Number(b.dataset.coins));
for (const b of document.querySelectorAll("#simpanel [data-chat]")) b.onclick = () => simChat(b.dataset.chat);
const crowdBtn = $("simcrowd");
if (crowdBtn) crowdBtn.onclick = () => {
  const gifts = [["Rose", 1], ["GG", 1], ["Ice Cream Cone", 1], ["Finger Heart", 5], ["Perfume", 20]];
  for (let i = 0; i < 12; i++) setTimeout(() => {
    const who = BOTS[Math.floor(Math.random() * BOTS.length)];
    const [g, c] = gifts[Math.floor(Math.random() * gifts.length)];
    if (g === "Finger Heart" || g === "Perfume") {
      const pick = [["Rose", "A"], ["GG", "B"], ["Ice Cream Cone", "C"]][Math.floor(Math.random() * 3)][0];
      simGift(pick, 1, who).then(() => simGift(g, c, who)); // pick with a 1-coin gift, then add the bigger one
    } else simGift(g, c, who);
  }, i * 350);
};

// ---------- log ----------
function logEntry(kind, k, html) {
  const d = document.createElement("div");
  d.className = "entry";
  d.innerHTML = `<div class="k ${kind}">${k}</div><div>${html}</div>`;
  els.entries.prepend(d);
  while (els.entries.children.length > 40) els.entries.lastChild.remove();
}
function updateStats() {
  els.stats.textContent = `viewer ${viewerId.slice(0, 8)} · fillers seen ${state.fillers}${state.np?.clip?.provider ? ` · ${state.np.clip.provider}` : ""}`;
}
function toast(text) {
  const d = document.createElement("div");
  d.className = "toast"; d.textContent = text;
  els.toasts.appendChild(d);
  setTimeout(() => d.remove(), 4000);
}
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

connect();
