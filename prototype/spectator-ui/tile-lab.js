// PROTOTYPE (throwaway): Match tile variants. See tile-lab.html for the question and how to run it.

// ---- Fake data, shaped like MatchTile / TileSummary (src/shared/protocol.ts) ------------------
const SEATS = [
  { seat: 1, displayName: "Mara", label: "Hydrogen #1" },
  { seat: 2, displayName: "Kai", label: "3.8 Flash #1" },
  { seat: 3, displayName: "Wren", label: "3.6 Flash" },
  { seat: 4, displayName: "Tobias", label: "3.5 Flash-Lite" },
  { seat: 5, displayName: "Ivy", label: "3.8 Flash #2" },
  { seat: 6, displayName: "Ezra", label: "Hydrogen #2" },
  { seat: 7, displayName: "Nell", label: "3.8 Flash #3" },
];
const ROLES = { 1: "villager", 2: "werewolf", 3: "seer", 4: "villager", 5: "doctor", 6: "werewolf", 7: "villager" };
const FLAG_NAMES = {
  claim_war: "Claim war",
  knife_edge_vote: "Knife-edge vote",
  table_split: "Table split",
  power_role_lost: "Village lost a power role",
  wolf_fooling_table: "Wolf fooling table",
  wolves_split: "Wolves split",
};

// Six fixed game states. `result` is a proposed field (the real summary only says phase "Over").
const STATES = [
  { key: "night1", title: "Night 1, just started", n: 3, phase: "Night", round: 1, alive: [1, 2, 3, 4, 5, 6, 7], step: "Night actions", thinking: 7, timeouts: 0, latestSpeech: null },
  { key: "speechA", title: "Day 2, Speech Round A", n: 17, phase: "Day", round: 2, alive: [1, 2, 3, 5, 6, 7], step: "Speech Round A", thinking: 6, timeouts: 0, dramaScore: 0.38, dramaFlags: [{ id: "table_split", visibility: "public-safe" }], latestSpeech: { seat: 3, text: "Kai pushed hardest to kill Tobias yesterday and Tobias flipped Villager. I'd like Kai to explain that before anyone else talks." } },
  { key: "voteHot", title: "Day 4 vote, claim war", n: 9, phase: "Day", round: 4, alive: [1, 2, 3, 5, 6], step: "Vote", thinking: 5, timeouts: 1, dramaScore: 0.95, dramaFlags: [{ id: "claim_war", visibility: "public-safe" }, { id: "wolf_fooling_table", visibility: "secret" }], latestSpeech: { seat: 6, text: "I'm the real Seer. Wren is lying: I checked her on Night 3 and she's a Werewolf. Vote her or lose." } },
  { key: "reply", title: "Day 3, Right of Reply, knife edge", n: 12, phase: "Day", round: 3, alive: [1, 2, 3, 5, 6], step: "Right of Reply", thinking: 1, timeouts: 0, dramaScore: 0.71, dramaFlags: [{ id: "knife_edge_vote", visibility: "public-safe" }, { id: "wolves_split", visibility: "secret" }], latestSpeech: { seat: 1, text: "Three of you voted Nell and she was the Doctor. Explain that before you point at me." } },
  { key: "over", title: "Finished: Werewolves won", n: 6, phase: "Over", round: null, alive: [2, 5, 6], step: null, thinking: 0, timeouts: 2, dramaScore: 0.6, dramaFlags: [], result: "Werewolves win", latestSpeech: { seat: 2, text: "Good game. Ivy, you almost had us on Day 2." } },
  { key: "noNarr", title: "Day 2 vote, Narrator not run yet, timeouts", n: 21, phase: "Day", round: 2, alive: [1, 2, 3, 4, 6, 7], step: "Vote", thinking: 2, timeouts: 4, latestSpeech: { seat: 4, text: "I don't have much, but Ezra's vote reason made no sense to me." } },
];

const params = new URLSearchParams(location.search);
const narratorView = params.get("nv") !== "0";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const seatOf = (n) => SEATS.find((s) => s.seat === n);
const flagsOf = (st) => (st.dramaFlags ?? []).filter((f) => narratorView || f.visibility === "public-safe");
const roleLetter = (r) => ({ werewolf: "W", seer: "S", doctor: "D", villager: "" })[r];
const phaseIcon = (st) => (st.phase === "Night" ? "☾" : st.phase === "Day" ? "☀" : "■");
const phaseText = (st) => (st.phase === "Over" ? "Over" : `${st.phase} ${st.round}`);
const pct = (x) => `${Math.round(x * 100)}%`;
const speaker = (st) => (st.latestSpeech ? seatOf(st.latestSpeech.seat) : null);
const wolvesAlive = (st) => st.alive.filter((s) => ROLES[s] === "werewolf").length;

function pips(st, cls = "pips") {
  return `<span class="${cls}">${SEATS.map((s) => {
    const dead = !st.alive.includes(s.seat);
    const r = narratorView ? ROLES[s.seat] : "villager";
    return `<span class="pip ${dead ? "dead" : ""} r-${r}" title="${esc(s.displayName)} · ${esc(s.label)}">${dead ? "×" : esc(roleLetter(r))}</span>`;
  }).join("")}</span>`;
}

// ---- Variant A: Current card (baseline from variant E / wl-gtil) ------------------------------
function variantA(st, size) {
  const f = flagsOf(st);
  const sp = speaker(st);
  return `<article class="ta ${size}">
    <div class="ta-top"><b>Match ${st.n}</b><span>${phaseIcon(st)} ${phaseText(st)}</span></div>
    <div class="ta-row">${pips(st)}<small>${st.alive.length}/7 alive</small></div>
    ${st.dramaScore != null ? `<div class="ta-row"><span class="bar"><i style="width:${pct(st.dramaScore)}"></i></span><small>${pct(st.dramaScore)} drama</small>
      ${size === "big" ? f.map((x) => `<span class="chip ${x.visibility}">⚑ ${FLAG_NAMES[x.id]}</span>`).join("") : f.length ? `<span class="sticker">⚑ ${f.length}</span>` : ""}</div>` : ""}
    ${size === "big" && sp ? `<p class="ta-quote"><b>${esc(sp.displayName)}</b> “${esc(st.latestSpeech.text)}”</p>` : ""}
    <div class="ta-foot"><span class="step">${esc(st.step ?? st.result ?? "")}</span><small>◔ ×${st.thinking}${st.timeouts ? ` · ⏱ ${st.timeouts}` : ""}</small></div>
  </article>`;
}

// ---- Variant B: Table (seats around a table, state in the middle) -----------------------------
function variantB(st, size) {
  const f = flagsOf(st);
  const sp = speaker(st);
  const R = size === "big" ? 54 : 38, C = R + 14;
  const dots = SEATS.map((s, i) => {
    const a = (i / SEATS.length) * Math.PI * 2 - Math.PI / 2;
    const x = C + R * Math.cos(a), y = C + R * Math.sin(a);
    const dead = !st.alive.includes(s.seat);
    const r = narratorView ? ROLES[s.seat] : "villager";
    const talking = sp && sp.seat === s.seat;
    return `<g class="seat ${dead ? "dead" : ""} r-${r} ${talking ? "talking" : ""}"><circle cx="${x}" cy="${y}" r="${size === "big" ? 11 : 8}"/>
      <text x="${x}" y="${y + 4}">${dead ? "×" : esc(s.displayName[0])}</text></g>`;
  }).join("");
  const heat = st.dramaScore ?? 0;
  return `<article class="tb ${size}" style="--heat:${heat}">
    <svg viewBox="0 0 ${C * 2} ${C * 2}" class="tb-table" aria-label="Seats">
      <circle cx="${C}" cy="${C}" r="${R - 18}" class="felt"/>
      <text x="${C}" y="${C - 2}" class="tb-phase">${phaseIcon(st)}</text>
      <text x="${C}" y="${C + 14}" class="tb-round">${st.phase === "Over" ? "END" : `${st.phase === "Night" ? "N" : "D"}${st.round}`}</text>
      ${dots}
    </svg>
    <div class="tb-side">
      <div class="tb-id">Match ${st.n}</div>
      <div class="tb-step">${esc(st.step ?? st.result ?? "")}</div>
      ${st.dramaScore != null ? `<div class="tb-heat"><span class="flame" style="opacity:${0.3 + heat * 0.7}">🔥</span> ${pct(heat)}</div>` : `<div class="tb-heat muted">no drama yet</div>`}
      ${f.slice(0, size === "big" ? 3 : 1).map((x) => `<div class="tb-flag ${x.visibility}">${FLAG_NAMES[x.id]}</div>`).join("")}
      ${size === "big" && sp ? `<p class="tb-quote"><b>${esc(sp.displayName)}:</b> ${esc(st.latestSpeech.text)}</p>` : ""}
      <small class="tb-meta">${st.alive.length}/7 alive · ◔ ${st.thinking}${st.timeouts ? ` · ⏱ ${st.timeouts}` : ""}</small>
    </div>
  </article>`;
}

// ---- Variant C: Headline (story first, numbers last) ------------------------------------------
function headline(st) {
  const f = flagsOf(st);
  if (st.result) return st.result;
  if (f.length) return FLAG_NAMES[f[0].id];
  if (st.step === "Vote") return "The table votes";
  if (st.phase === "Night") return "Night falls";
  return st.step ?? "Starting";
}
function variantC(st, size) {
  const f = flagsOf(st);
  const sp = speaker(st);
  const hot = (st.dramaScore ?? 0) >= 0.7;
  return `<article class="tc ${size} ${hot ? "hot" : ""} ${st.phase === "Night" ? "night" : ""}">
    <div class="tc-kicker">Match ${st.n} · ${phaseIcon(st)} ${phaseText(st)}${st.step ? ` · ${esc(st.step)}` : ""}</div>
    <h3 class="tc-head">${esc(headline(st))}</h3>
    ${sp ? `<blockquote class="tc-quote">“${esc(size === "big" ? st.latestSpeech.text : st.latestSpeech.text.split(/(?<=[.?!])\s/)[0])}”<cite>${esc(sp.displayName)}${narratorView ? ` · ${esc(sp.label)}` : ""}</cite></blockquote>` : `<blockquote class="tc-quote muted">No one has spoken yet.</blockquote>`}
    ${size === "big" && f.length > 1 ? `<div class="tc-also">Also: ${f.slice(1).map((x) => FLAG_NAMES[x.id]).join(", ")}</div>` : ""}
    <div class="tc-foot">${pips(st, "pips mini")}<span>${st.alive.length}/7</span>${st.dramaScore != null ? `<span>drama ${pct(st.dramaScore)}</span>` : ""}<span>◔ ${st.thinking}</span>${st.timeouts ? `<span>⏱ ${st.timeouts}</span>` : ""}</div>
  </article>`;
}

// ---- Variant D: Scoreboard (sports-style: who's winning, at a glance) --------------------------
function variantD(st, size) {
  const f = flagsOf(st);
  const sp = speaker(st);
  const wolves = wolvesAlive(st);
  const village = st.alive.length - wolves;
  return `<article class="td ${size}" style="--heat:${st.dramaScore ?? 0}">
    <div class="td-strip"></div>
    <div class="td-main">
      <div class="td-line1"><b>#${st.n}</b><span class="td-clock">${phaseIcon(st)} ${phaseText(st)}</span><span class="td-step">${esc(st.step ?? st.result ?? "")}</span></div>
      <div class="td-score">
        ${narratorView
          ? `<span class="side v"><em>${village}</em> Village</span><span class="vs">vs</span><span class="side w"><em>${wolves}</em> Wolves</span>`
          : `<span class="side"><em>${st.alive.length}</em> alive</span><span class="vs">·</span><span class="side"><em>${7 - st.alive.length}</em> out</span>`}
      </div>
      ${f.length ? `<div class="td-flags">${f.map((x) => `<span class="${x.visibility}">${FLAG_NAMES[x.id]}</span>`).join("")}</div>` : ""}
      ${size === "big" && sp ? `<p class="td-quote">${esc(sp.displayName)}: “${esc(st.latestSpeech.text)}”</p>` : ""}
    </div>
    <div class="td-right">${st.dramaScore != null ? `<div class="td-drama">${pct(st.dramaScore)}</div><small>drama</small>` : `<small>—</small>`}<small>◔ ${st.thinking}${st.timeouts ? ` ⏱ ${st.timeouts}` : ""}</small></div>
  </article>`;
}

const VARIANTS = [
  { key: "A", name: "Current card", render: variantA, note: "Today's design (variant E / wl-gtil): stacked rows of pips, drama bar, flags, quote and step." },
  { key: "B", name: "Table", render: variantB, note: "Seats around a round table with the phase in the middle; the current speaker is ringed. State reads spatially." },
  { key: "C", name: "Headline", render: variantC, note: "Story first: a headline from the top Drama Flag or step, then the quote; numbers shrink to a footer." },
  { key: "D", name: "Scoreboard", render: variantD, note: "Sports-style: Village vs Wolves alive (Narrator's View) as the hero number; drama as a heat strip and big %." },
];

// ---- Page ------------------------------------------------------------------------------------
const vKey = (params.get("variant") ?? "A").toUpperCase();
const vi = Math.max(0, VARIANTS.findIndex((v) => v.key === vKey));
const v = VARIANTS[vi];
document.title = `PROTOTYPE · Tile ${v.key} (${v.name})`;
document.getElementById("lab-desc").textContent = `${v.key} · ${v.name}: ${v.note} Narrator's View ${narratorView ? "on" : "off"}.`;
document.getElementById("lab").innerHTML = `
  ${STATES.map((st) => `<section class="lab-row"><h2>${esc(st.title)}</h2>
    <div class="lab-cells"><div class="cell big">${v.render(st, "big")}</div><div class="cell small">${v.render(st, "small")}</div></div></section>`).join("")}
  <section class="lab-row"><h2>Density: 12 small tiles</h2><div class="density">${Array.from({ length: 12 }, (_, i) => v.render(STATES[i % STATES.length], "small")).join("")}</div></section>`;

function go(i) {
  const p = new URLSearchParams(location.search);
  p.set("variant", VARIANTS[(i + VARIANTS.length) % VARIANTS.length].key);
  location.search = p.toString();
}
document.getElementById("lb-label").textContent = `${v.key} (${v.name})`;
document.getElementById("lb-prev").onclick = () => go(vi - 1);
document.getElementById("lb-next").onclick = () => go(vi + 1);
const nv = document.getElementById("lb-nv");
nv.checked = narratorView;
nv.onchange = () => { const p = new URLSearchParams(location.search); p.set("nv", nv.checked ? "1" : "0"); location.search = p.toString(); };
addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, textarea, [contenteditable]")) return;
  if (e.key === "ArrowLeft") go(vi - 1);
  if (e.key === "ArrowRight") go(vi + 1);
});
