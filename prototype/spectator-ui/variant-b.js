// PROTOTYPE — Variant B: "Round table". Theatrical dark stage; Players sit around a circle,
// Accusations are chords across it, votes are arrows, Table Suspicion is a halo per seat.
(() => {
  const ROLE_GLYPH = { Werewolf: "🐺", Seer: "👁", Doctor: "✚", Villager: "" };
  const STEP_SECRET = new Set(["wolf_chat", "night_action"]);
  let mode = null; // "acc" | "votes" | null (auto)

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const pct = (p) => `${Math.round(p * 100)}%`;
  const seatPos = (i, n, R = 380) => { const a = ((-90 + (i * 360) / n) * Math.PI) / 180; return [500 + R * Math.cos(a), 500 + R * Math.sin(a), a]; };
  const fmt = (v) => v.toFixed(1);

  function chord(p, q, { bend = 45, trim = 84 } = {}) {
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const a = [p[0] + ux * trim, p[1] + uy * trim], b = [q[0] - ux * trim, q[1] - uy * trim];
    const mx = (a[0] + b[0]) / 2 - uy * bend, my = (a[1] + b[1]) / 2 + ux * bend;
    return `M${fmt(a[0])},${fmt(a[1])} Q${fmt(mx)},${fmt(my)} ${fmt(b[0])},${fmt(b[1])}`;
  }
  const marker = (id, c) => `<marker id="vb-m-${id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="26" markerHeight="26" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`;

  const css = `
@property --vb-arc-start { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@property --vb-arc-end { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@property --vb-dash-anim { syntax: "*"; inherits: false; initial-value: , vb-progress-dash 3s ease-in-out infinite; }
@keyframes vb-progress-spin { to { rotate: 1turn; } }
@keyframes vb-progress-dash {
  from { --vb-arc-start: 0deg; --vb-arc-end: 3deg; }
  50% { --vb-arc-start: 100deg; --vb-arc-end: 358deg; }
  to { --vb-arc-start: 360deg; --vb-arc-end: 363deg; }
}
body[data-variant="B"] {
  background: #060912 radial-gradient(ellipse at 40% 45%, #16203a 0%, #0a1020 45%, #04060c 100%) fixed;
  color-scheme: dark;
}
.vB {
  --ink: #f4ecd9; --muted: #b9b2a3; --candle: #ffc46b; --ember: #ffb347; --emberA: #d98a3a;
  --moon: #a9c1ff; --blood: #ff5d6c; --sky: #8fd3ff; --gold: #ffe08a;
  --accent: var(--candle);
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  min-height: 100vh; color: var(--ink); font: 20px/1.35 system-ui, sans-serif;
}
.vB.is-night { --accent: var(--moon); }
.vB h1, .vB h2, .vB h3 { font-family: var(--serif); font-weight: 600; margin: 0; letter-spacing: .01em; }
.vB button { font: inherit; color: inherit; }
.vB :focus-visible { outline: 3px solid var(--gold); outline-offset: 3px; }

/* ── spinner (<progress> pattern) ── */
.vB progress.vB-spin:indeterminate::-webkit-progress-bar { display: none; background: none; }
.vB progress.vB-spin:indeterminate::-webkit-progress-value { display: none; background: none; }
.vB progress.vB-spin:indeterminate::-moz-progress-bar { display: none; background: none; }
.vB progress.vB-spin:indeterminate {
  --_from: calc(90deg + var(--vb-arc-start, 0deg));
  --_to: calc(90deg + var(--vb-arc-end, 158deg));
  --size: 26px; --thickness: 4px; --spinner-color: var(--accent); --track-color: #2a3350;
  --_dur: 1.5s;
  position: relative; width: var(--size); height: var(--size); border-radius: 50%; appearance: none;
  vertical-align: middle; flex: none;
  background: conic-gradient(from var(--_from), var(--spinner-color) calc(var(--_to) - var(--_from)), transparent 0) var(--track-color);
  @supports (background-clip: border-area) {
    background-clip: border-area; border: var(--thickness) solid transparent; background-origin: border-box;
  }
  @supports not (background-clip: border-area) {
    --clip-boundary: calc(100% - var(--thickness));
    mask-image: radial-gradient(farthest-side, transparent var(--clip-boundary), black var(--clip-boundary));
    border: 0;
  }
  @media (forced-colors: active) { forced-color-adjust: none; --spinner-color: CanvasText; --track-color: Canvas; }
  animation: vb-progress-spin var(--_dur) linear infinite var(--vb-dash-anim, );
}
@media (prefers-reduced-motion: reduce) {
  .vB progress.vB-spin:indeterminate { --_dur: 6s; --vb-dash-anim: ; --vb-arc-end: 158deg; }
}

/* ── grid view ── */
.vB-gridview { padding: 20px 48px 80px; }
.vB-gridhead { display: flex; align-items: baseline; gap: 24px; margin-bottom: 18px; }
.vB-gridhead h1 { font-size: 52px; color: var(--candle); }
.vB-gridhead p { margin: 0; color: var(--muted); font-size: 22px; }
.vB-stage { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 2fr); gap: 32px; align-items: center; }
.vB-honey { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 26px; padding-bottom: 90px; }
.vB-honey > :nth-child(3n + 2) { translate: 0 90px; }
.vB-table {
  --c: var(--candle);
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  background: none; border: 0; padding: 8px; cursor: pointer; border-radius: 24px; text-align: center;
}
.vB-table.ph-night { --c: var(--moon); }
.vB-table.ph-over { --c: var(--gold); }
.vB-table:hover { background: rgb(255 255 255 / .05); }
.vB-table svg { width: 100%; max-width: 240px; height: auto; overflow: visible; }
.vB-table.is-featured svg { max-width: 560px; }
.vB-table .id { font: 600 18px/1 ui-monospace, monospace; color: var(--muted); letter-spacing: .08em; }
.vB-table .live { color: var(--blood); font-weight: 800; letter-spacing: .12em; }
.vB-cap { font-family: var(--serif); font-style: italic; font-size: 20px; max-width: 32ch; color: var(--ink);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.vB-table.is-featured .vB-cap { font-size: 26px; max-width: 30ch; -webkit-line-clamp: 3; }
.vB-cap .who { font-style: normal; font-family: system-ui, sans-serif; font-size: .8em; color: var(--muted); }
.vB-tstat { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; white-space: nowrap; align-items: center; font-size: 18px; color: var(--muted); }
.vB-tstat .to { color: var(--gold); }
.vB-legend { display: flex; gap: 28px; flex-wrap: wrap; font-size: 18px; color: var(--muted); margin-top: 8px; }
.vB-legend b { color: var(--ink); }

/* ── match view ── */
.vB-match { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); height: 100vh; }
.vB-left { display: flex; flex-direction: column; padding: 16px 24px 84px; min-height: 0; }
.vB-head { display: flex; align-items: center; gap: 20px; }
.vB-head h1 { font-size: 40px; }
.vB-head h1 small { font-size: .55em; color: var(--muted); font-family: ui-monospace, monospace; }
.vB-back { background: rgb(255 255 255 / .08); border: 2px solid rgb(255 255 255 / .3); border-radius: 999px; padding: 6px 16px; cursor: pointer; }
.vB-god { margin-left: auto; font-size: 18px; padding: 4px 12px; border: 2px solid; border-radius: 999px; }
.vB-god.on { color: var(--blood); }
.vB-god.off { color: var(--muted); }
.vB-tablewrap { flex: 1; display: grid; place-items: center; position: relative; min-height: 0; }
.vB-circle { --D: min(calc(66vw - 90px), calc(100vh - 170px)); width: var(--D); height: var(--D); position: relative; }
.vB-felt { position: absolute; inset: 13%; border-radius: 50%;
  background: radial-gradient(circle, rgb(255 196 107 / .10), rgb(255 196 107 / .02) 70%);
  border: 3px solid rgb(255 196 107 / .25); box-shadow: 0 0 120px rgb(255 196 107 / .08) inset; }
.vB.is-night .vB-felt { background: radial-gradient(circle, rgb(169 193 255 / .10), rgb(169 193 255 / .02) 70%); border-color: rgb(169 193 255 / .28); }
.vB-lines { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.vB-ln .acc { fill: none; stroke: var(--ember); stroke-linecap: round; }
.vB-ln .accA { stroke: var(--emberA); stroke-width: 4; opacity: .85; }
.vB-ln .accB { stroke-width: 9; }
.vB-ln .def { fill: none; stroke: var(--sky); stroke-width: 5; stroke-dasharray: 14 10; stroke-linecap: round; }
.vB-ln .vote { fill: none; stroke: var(--gold); stroke-width: 7; stroke-linecap: round; }
.vB-ln .pack { fill: none; stroke: var(--blood); stroke-width: 5; stroke-dasharray: 2 14; stroke-linecap: round; opacity: .8; }
.vB-ln .halo-t { fill: none; stroke: rgb(255 255 255 / .12); stroke-width: 9; }
.vB-ln .halo { fill: none; stroke: var(--blood); stroke-width: 11; stroke-linecap: round; }
.vB-seat { position: absolute; width: 0; height: 0; }
.vB-token {
  --T: calc(var(--D) * .12);
  position: absolute; left: calc(var(--T) / -2); top: calc(var(--T) / -2); width: var(--T); height: var(--T);
  border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle at 35% 30%, #3a3020, #17130c); border: 4px solid var(--candle);
  box-shadow: 0 0 30px rgb(255 196 107 / .25);
  font: 700 calc(var(--T) * .32)/1 var(--serif);
}
.vB.is-night .vB-token { border-color: var(--moon); box-shadow: 0 0 30px rgb(169 193 255 / .22); background: radial-gradient(circle at 35% 30%, #26304d, #0d1222); }
.vB-seat.is-wolf .vB-token { border-color: var(--blood); border-style: double; border-width: 8px; }
.vB-seat.is-dead .vB-token { border-color: #555; background: #111; color: #777; box-shadow: none; border-style: solid; border-width: 4px; }
.vB-token .x { position: absolute; inset: 0; display: grid; place-items: center; font-size: calc(var(--T) * .8); color: rgb(255 93 108 / .75); line-height: 1; }
.vB-meta {
  position: absolute; left: 0; translate: -50% 0; width: max-content; max-width: 230px;
  display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center;
  top: calc(var(--D) * .065); font-size: 18px; line-height: 1.2;
}
.vB-seat.meta-up .vB-meta { top: auto; bottom: calc(var(--D) * .065); flex-direction: column-reverse; }
.vB-seat.m-left .vB-meta, .vB-seat.m-right .vB-meta { top: 0; translate: 0 -50%; }
.vB-seat.m-left .vB-meta { left: auto; right: calc(var(--D) * .085); align-items: flex-end; text-align: right; }
.vB-seat.m-right .vB-meta { left: calc(var(--D) * .085); align-items: flex-start; text-align: left; }
.vB-meta .agent { font-weight: 700; font-size: 19px; background: rgb(4 6 12 / .7); padding: 1px 8px; border-radius: 6px; }
.vB-seat.is-dead .vB-meta .agent { color: #999; text-decoration: line-through; text-decoration-thickness: 2px; }
.vB-role { font-family: var(--serif); font-size: 19px; color: var(--candle); background: rgb(4 6 12 / .7); padding: 0 8px; border-radius: 6px; }
.vB-role.wolf { color: var(--blood); font-weight: 700; }
.vB-role.dead { color: #ddd; }
.vB-susp { font-size: 16px; color: #ffb0b8; background: rgb(4 6 12 / .7); padding: 0 6px; border-radius: 6px; }
.vB-claim { white-space: nowrap; font-size: 16px; font-weight: 700; padding: 2px 10px 2px 8px; color: #1b1205; background: var(--gold);
  clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 50%, 100% 100%, 0 100%); }
.vB-claim .lie { background: var(--blood); color: #fff; padding: 0 5px; margin-left: 4px; border-radius: 3px; }
.vB-claim .true { background: #1d6b3a; color: #fff; padding: 0 5px; margin-left: 4px; border-radius: 3px; }
.vB-st { display: flex; align-items: center; gap: 6px; font-size: 17px; font-weight: 700; background: rgb(4 6 12 / .8); padding: 2px 8px; border-radius: 999px; }
.vB-st.acted { color: #9fe3a8; }
.vB-st.timedout { color: #111; background: var(--gold); letter-spacing: .05em; }
.vB-st.abst { color: var(--gold); border: 2px dashed var(--gold); }
.vB-centre {
  position: absolute; left: 50%; top: 50%; translate: -50% -50%; width: 34%;
  display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
  padding: 18px 14px; border-radius: 50%; aspect-ratio: 1; justify-content: center;
  background: radial-gradient(circle, rgb(6 9 18 / .95) 60%, rgb(6 9 18 / .0) 72%);
}
.vB-centre .ph { font: 700 calc(var(--D) * .062)/1 var(--serif); color: var(--accent); }
.vB-centre .step { font-size: 22px; font-weight: 600; }
.vB-centre progress.dl { width: 80%; height: 12px; appearance: none; border: 2px solid var(--accent); border-radius: 8px; background: transparent; overflow: hidden; }
.vB-centre progress.dl::-webkit-progress-bar { background: transparent; }
.vB-centre progress.dl::-webkit-progress-value { background: var(--accent); }
.vB-centre progress.dl::-moz-progress-bar { background: var(--accent); }
.vB-centre .sub { font-size: 17px; color: var(--muted); }
.vB-centre .news { font-family: var(--serif); font-size: 21px; color: var(--ink); }
.vB-centre .news b { color: var(--blood); }
.vB-modes { position: absolute; top: 4px; right: 0; display: flex; border: 2px solid var(--accent); border-radius: 999px; overflow: hidden; z-index: 2; }
.vB-modes button { background: none; border: 0; padding: 6px 16px; cursor: pointer; font-size: 18px; }
.vB-modes button[aria-pressed="true"] { background: var(--accent); color: #0a0d16; font-weight: 700; }
.vB-modes button:disabled { opacity: .4; cursor: default; }
.vB-key { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; gap: 4px; font-size: 16px; color: var(--muted); }
.vB-key svg { width: 54px; height: 12px; vertical-align: middle; margin-right: 6px; }
.vB-key .what { color: var(--ink); font-size: 18px; font-weight: 700; }

/* transcript */
.vB-right { overflow: auto; padding: 18px 22px 96px; background: rgb(0 0 0 / .35); border-left: 3px solid rgb(255 196 107 / .25); scrollbar-color: #555 transparent; }
.vB-right h2 { font-size: 30px; color: var(--candle); margin-bottom: 8px; }
.vB-sec { margin: 0 0 14px; border: 2px solid rgb(255 255 255 / .12); border-radius: 14px; background: rgb(255 255 255 / .03); }
.vB-sec > summary { cursor: pointer; padding: 10px 14px; font: 600 24px/1.2 var(--serif); list-style-position: inside; }
.vB-sec.night > summary { color: var(--moon); }
.vB-sec.day > summary { color: var(--candle); }
.vB-sec > .body { padding: 0 14px 12px; display: flex; flex-direction: column; gap: 10px; }
.vB-sec h3 { font-size: 20px; color: var(--muted); text-transform: uppercase; letter-spacing: .1em; font-family: system-ui, sans-serif; margin-top: 6px; }
.vB-order { font-size: 16px; color: var(--muted); }
.vB-line { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; align-items: start; }
.vB-chip { font: 700 17px/1 ui-monospace, monospace; padding: 5px 7px; border-radius: 8px; border: 2px solid var(--candle); color: var(--candle); min-width: 2.4em; text-align: center; }
.vB-chip.wolf { border-color: var(--blood); color: var(--blood); border-style: double; border-width: 4px; }
.vB-line .who { font-size: 15px; color: var(--muted); }
.vB-line q { font-family: var(--serif); font-size: 20px; quotes: "“" "”"; }
.vB-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.vB-tag { font-size: 15px; padding: 1px 8px; border-radius: 999px; border: 2px solid; }
.vB-tag.acc { color: var(--ember); }
.vB-tag.def { color: var(--sky); border-style: dashed; }
.vB-skip { color: var(--gold); font-style: italic; }
.vB-pend { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 10px; border: 2px dashed var(--accent); border-radius: 10px; font-size: 18px; }
.vB-pend .s { display: inline-flex; gap: 4px; align-items: center; }
.vB-ballot { display: grid; grid-template-columns: auto auto 1fr; gap: 4px 10px; align-items: baseline; font-size: 18px; }
.vB-ballot .arrow { color: var(--gold); font-weight: 700; white-space: nowrap; }
.vB-ballot .reason { font-family: var(--serif); font-style: italic; }
.vB-outcome { font: 600 22px/1.3 var(--serif); padding: 8px 12px; border-left: 6px solid var(--blood); background: rgb(255 93 108 / .08); }
.vB-public { font: 20px/1.3 var(--serif); }
.vB-redink { border: 2px solid rgb(255 93 108 / .55); border-radius: 12px; padding: 8px 12px; background: rgb(120 10 25 / .18); display: flex; flex-direction: column; gap: 8px; }
.vB-redink .lbl { font-size: 14px; font-weight: 800; letter-spacing: .14em; color: var(--blood); }
.vB-whisper { display: flex; gap: 8px; align-items: flex-start; }
.vB-whisper q { font-family: var(--serif); font-style: italic; font-size: 19px; color: #ffd6da; background: rgb(255 93 108 / .12); padding: 4px 10px; border-radius: 12px 12px 12px 2px; quotes: "“" "”"; }
.vB-nightact { font-size: 17px; color: #ffd6da; }
.vB-hidden { font-size: 16px; color: var(--muted); font-style: italic; }
`;

  // ──────────────── grid view ────────────────
  function miniTable(t, god) {
    const n = t.seats, R = 100;
    let dots = "";
    for (let i = 0; i < n; i++) {
      const a = ((-90 + (i * 360) / n) * Math.PI) / 180, x = 150 + R * Math.cos(a), y = 150 + R * Math.sin(a);
      const seat = i + 1, alive = t.alive.includes(seat), wolf = god && t.roles?.[i] === "Werewolf";
      if (!alive) {
        dots += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="18" fill="#111" stroke="#666" stroke-width="3"/>
          <path d="M${fmt(x - 9)},${fmt(y - 9)} L${fmt(x + 9)},${fmt(y + 9)} M${fmt(x + 9)},${fmt(y - 9)} L${fmt(x - 9)},${fmt(y + 9)}" stroke="#ff5d6c" stroke-width="4" stroke-linecap="round"/>`;
      } else if (wolf) {
        dots += `<rect x="${fmt(x - 16)}" y="${fmt(y - 16)}" width="32" height="32" transform="rotate(45 ${fmt(x)} ${fmt(y)})" fill="#5a0f19" stroke="#ff5d6c" stroke-width="4"/>
          <text x="${fmt(x)}" y="${fmt(y + 6)}" text-anchor="middle" font-size="17" font-weight="700" fill="#fff">${seat}</text>`;
      } else {
        dots += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="18" fill="#2b2416" stroke="var(--c)" stroke-width="4"/>
          <text x="${fmt(x)}" y="${fmt(y + 6)}" text-anchor="middle" font-size="17" font-weight="700" fill="#f4ecd9">${seat}</text>`;
      }
    }
    const over = t.phase === "over";
    const ph = over ? (t.winner === "village" ? "Village wins" : "Wolves win") : `${t.phase === "night" ? "☾ Night" : "☀ Day"} ${t.n}`;
    const step = over ? "Match over" : t.step || "";
    return `<svg viewBox="0 0 300 300" role="img" aria-label="${esc(`${t.matchId}: ${ph}, ${step}, ${t.alive.length} of ${n} alive`)}">
      <circle cx="150" cy="150" r="138" fill="rgb(255 255 255 / .03)" stroke="var(--c)" stroke-width="6" stroke-dasharray="${over ? "none" : "600 267"}" transform="rotate(-90 150 150)"/>
      <circle cx="150" cy="150" r="66" fill="rgb(6 9 18 / .85)" stroke="rgb(255 255 255 / .15)" stroke-width="3"/>
      <text x="150" y="${over ? 148 : 152}" text-anchor="middle" font-family="Palatino, Georgia, serif" font-weight="700" font-size="${over ? 22 : 30}" fill="var(--c)">${esc(ph)}</text>
      <text x="150" y="178" text-anchor="middle" font-size="15" fill="#d8d0bf">${esc(step)}</text>
      ${dots}
    </svg>`;
  }

  function tileHTML(t, god) {
    const ph = t.phase === "over" ? "ph-over" : t.phase === "night" ? "ph-night" : "ph-day";
    const line = t.latestLine ? `<div class="vB-cap">“${esc(t.latestLine.text)}” <span class="who">— P${t.latestLine.seat} · ${esc(t.latestLine.label)}</span></div>` : `<div class="vB-cap"><span class="who">No speeches yet</span></div>`;
    const stats = [
      t.phase !== "over" ? `<span class="live">● LIVE</span>` : `<span>Replay</span>`,
      `<span>${t.alive.length}/${t.seats} alive</span>`,
      t.thinking ? `<span><progress class="vB-spin" aria-label="${t.thinking} thinking"></progress> ${t.thinking} thinking…</span>` : "",
      t.timeouts ? `<span class="to">⏱ ${t.timeouts} timeout${t.timeouts > 1 ? "s" : ""}</span>` : "",
    ].join("");
    return `<button type="button" class="vB-table ${ph} ${t.featured ? "is-featured" : ""}" data-open>
      <span class="id">${esc(t.matchId)}${t.featured ? " · featured" : ""}</span>
      ${miniTable(t, god)}
      <div class="vB-tstat">${stats}</div>
      ${line}
    </button>`;
  }

  function renderGrid(root, ctx) {
    const [feat, ...rest] = ctx.tiles;
    root.innerHTML = `<div class="vB-gridview">
      <div class="vB-gridhead"><h1 data-focus tabindex="-1">The League sits at ${ctx.tiles.length} tables</h1>
        <p>${ctx.tiles.filter((t) => t.phase !== "over").length} live Matches · click a table to take a seat in the gallery</p></div>
      <div class="vB-stage">
        <div>${tileHTML(feat, ctx.godView)}</div>
        <div class="vB-honey">${rest.map((t) => tileHTML(t, ctx.godView)).join("")}</div>
      </div>
      <div class="vB-legend"><span><b>●</b> alive Player</span><span><b>✕</b> dead</span>${ctx.godView ? `<span><b style="color:var(--blood)">◆</b> Werewolf (God View)</span>` : `<span>God View off: roles hidden</span>`}<span><b>ring</b> blue = Night, amber = Day, gold = finished</span></div>
    </div>`;
    root.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => ctx.openMatch()));
  }

  // ──────────────── match view ────────────────
  function renderMatch(root, ctx) {
    const st = ctx.state, god = ctx.godView, seats = st.seats, n = seats.length || 8;
    const S = (k) => seats[k - 1];
    const chip = (k) => `<span class="vB-chip ${god && S(k)?.role === "Werewolf" ? "wolf" : ""}">P${k}</span>`;
    const roleVisible = (s) => god || s.revealed;
    const day = st.days[st.days.length - 1];
    const lastPhaseIsDay = st.phase === "day";
    const curDay = lastPhaseIsDay ? day : null;
    const ballotDay = [...st.days].reverse().find((d) => d.ballots);
    const accDayN = st.accusations.length ? Math.max(...st.accusations.map((a) => a.day)) : null;
    const auto = day && day.ballots ? "votes" : "acc";
    let m = mode ?? auto;
    if (m === "votes" && !ballotDay) m = "acc";
    const secretStep = st.inflight && STEP_SECRET.has(st.inflight.step);
    const showInflightSeats = st.inflight && (god || !secretStep);

    const pos = seats.map((_, i) => seatPos(i, n, 380));
    let svg = `<svg class="vB-lines vB-ln" viewBox="0 0 1000 1000" aria-hidden="true"><defs>
      ${marker("acc", "#ffb347")}${marker("accA", "#d98a3a")}${marker("def", "#8fd3ff")}${marker("vote", "#ffe08a")}</defs>`;

    // Table Suspicion halos (God View only)
    if (god) {
      const C = 2 * Math.PI * 76;
      for (const s of seats) {
        const p = st.tableSuspicion[s.seat];
        if (p == null) continue;
        const [x, y] = pos[s.seat - 1];
        svg += `<circle class="halo-t" cx="${fmt(x)}" cy="${fmt(y)}" r="76"/>
          <circle class="halo" cx="${fmt(x)}" cy="${fmt(y)}" r="76" stroke-dasharray="${fmt(p * C)} ${fmt(C)}" transform="rotate(-90 ${fmt(x)} ${fmt(y)})"/>`;
      }
      const wolves = seats.filter((s) => s.role === "Werewolf");
      if (wolves.length === 2) svg += `<path class="pack" d="${chord(pos[wolves[0].seat - 1], pos[wolves[1].seat - 1], { bend: -70, trim: 90 })}"/>`;
    }

    let linesLabel = "";
    if (m === "acc" && accDayN) {
      const pairs = new Map();
      for (const a of st.accusations.filter((a) => a.day === accDayN)) {
        const k = `${a.from}-${a.to}`;
        (pairs.get(k) ?? pairs.set(k, { from: a.from, to: a.to, rounds: new Set() }).get(k)).rounds.add(a.round);
      }
      for (const p of pairs.values()) {
        const b = p.rounds.has("B");
        svg += `<path class="acc ${b ? "accB" : "accA"}" d="${chord(pos[p.from - 1], pos[p.to - 1])}" marker-end="url(#vb-m-${b ? "acc" : "accA"})"/>`;
      }
      const d = st.days.find((x) => x.n === accDayN);
      for (const r of ["A", "B"]) for (const sp of d?.rounds[r] ?? []) for (const t of sp.defend ?? []) svg += `<path class="def" d="${chord(pos[sp.seat - 1], pos[t - 1], { bend: -45 })}" marker-end="url(#vb-m-def)"/>`;
      linesLabel = `Accusations · Day ${accDayN}${curDay && curDay.n !== accDayN ? " (previous Day)" : ""}`;
    } else if (m === "votes" && ballotDay) {
      for (const b of ballotDay.ballots) if (b.target !== "abstain") svg += `<path class="vote" d="${chord(pos[b.seat - 1], pos[b.target - 1], { bend: 30 })}" marker-end="url(#vb-m-vote)"/>`;
      linesLabel = `Votes · Day ${ballotDay.n}`;
    } else linesLabel = "No Accusations yet";
    svg += `</svg>`;

    // seats
    const abstainers = m === "votes" && ballotDay ? new Map(ballotDay.ballots.filter((b) => b.target === "abstain").map((b) => [b.seat, b.timedOut])) : new Map();
    const timeoutCount = (k) => st.timeouts.filter((t) => t.seat === k).length;
    const seatHTML = seats.map((s, i) => {
      const [x, y, a] = pos[i];
      const place = Math.sin(a) < -0.5 ? "" : Math.abs(Math.cos(a)) > 0.3 ? (Math.cos(a) < 0 ? "m-left" : "m-right") : "meta-up";
      const wolf = god && s.role === "Werewolf";
      const bits = [`<span class="agent">${esc(s.label)}</span>`];
      if (roleVisible(s)) bits.push(`<span class="vB-role ${s.role === "Werewolf" ? "wolf" : ""} ${s.revealed ? "dead" : ""}">${ROLE_GLYPH[s.role]} ${s.role}${s.diedAt ? ` · died ${s.diedAt}` : ""}</span>`);
      if (god && st.tableSuspicion[s.seat] != null) bits.push(`<span class="vB-susp">Table Suspicion ${pct(st.tableSuspicion[s.seat])}</span>`);
      const c = st.claims[s.seat];
      if (c) bits.push(`<span class="vB-claim">⚑ Claims ${esc(c.role)}${(c.results ?? []).map((r) => ` · P${r.seat} ${r.side}`).join("")}${god ? (c.true ? `<span class="true">TRUE</span>` : `<span class="lie">LIE</span>`) : ""}</span>`);
      const f = showInflightSeats ? st.inflight.seats[s.seat] : null;
      if (f === "thinking") bits.push(`<span class="vB-st"><progress class="vB-spin" aria-label="P${s.seat} thinking"></progress>thinking…</span>`);
      else if (f === "acted") bits.push(`<span class="vB-st acted">✓ ready</span>`);
      else if (f === "timedout") bits.push(`<span class="vB-st timedout">⏱ TIMED OUT</span>`);
      if (abstainers.has(s.seat)) bits.push(`<span class="vB-st abst">${abstainers.get(s.seat) ? "Abstain (timed out)" : "Abstain"}</span>`);
      else if (!f && timeoutCount(s.seat)) bits.push(`<span class="vB-st" style="color:var(--gold)">⏱ ${timeoutCount(s.seat)} timeout${timeoutCount(s.seat) > 1 ? "s" : ""}</span>`);
      return `<div class="vB-seat ${s.alive ? "" : "is-dead"} ${wolf ? "is-wolf" : ""} ${place}" style="left:${fmt(x / 10)}%;top:${fmt(y / 10)}%">
        <div class="vB-token" title="${esc(s.label)}">P${s.seat}${s.alive ? "" : `<span class="x" aria-label="dead">✕</span>`}</div>
        <div class="vB-meta">${bits.join("")}</div></div>`;
    }).join("");

    // centre
    const cbits = [`<div class="ph">${st.phase === "night" ? "☾" : st.phase === "day" ? "☀" : ""} ${esc(st.phaseLabel)}</div>`];
    if (st.inflight) {
      const done = Object.values(st.inflight.seats).filter((v) => v !== "thinking").length, all = Object.keys(st.inflight.seats).length;
      cbits.push(`<div class="step">${esc(st.stepLabel)}</div>`);
      cbits.push(`<progress class="dl" max="${st.inflight.deadlineS}" value="${st.inflight.elapsedS}" aria-label="Deadline"></progress>`);
      cbits.push(`<div class="sub">${st.inflight.elapsedS}s of ${st.inflight.deadlineS}s · ${secretStep && !god ? "roles acting in secret" : `${done}/${all} ready`}</div>`);
    }
    if (curDay?.repliers) cbits.push(`<div class="sub">Repliers: ${curDay.repliers.seats.map((k) => `<b style="color:var(--ink)">P${k}</b>`).join(", ")}</div>`);
    if (m === "votes" && ballotDay) {
      const tally = {};
      for (const b of ballotDay.ballots) tally[b.target] = (tally[b.target] ?? 0) + 1;
      cbits.push(`<div class="sub">${Object.entries(tally).map(([k, v]) => `${k === "abstain" ? "Abstain" : `P${k}`} ×${v}`).join(" · ")}</div>`);
      cbits.push(`<div class="news">${ballotDay.eliminated ? `<b>P${ballotDay.eliminated} eliminated</b> — ${esc(S(ballotDay.eliminated).role)}` : "No elimination"}</div>`);
    } else {
      const lastNight = st.nights[st.nights.length - 1];
      if (lastNight && lastNight.killed !== undefined && (!day || day.n === lastNight.n) && !day?.rounds?.A)
        cbits.push(`<div class="news">${lastNight.killed ? `<b>P${lastNight.killed} killed</b> — ${esc(S(lastNight.killed).role)}` : "Dawn: no one died"}</div>`);
    }

    const keySvg = (cls, mk) => `<svg class="vB-ln" viewBox="0 0 54 12"><path class="${cls}" d="M2,6 L44,6" ${mk ? `marker-end="url(#vb-m-${mk})"` : ""} style="fill:none"/></svg>`;
    const key = m === "acc"
      ? `<span class="what">${esc(linesLabel)}</span><span>${keySvg("acc accA", "")} Round A accuses</span><span>${keySvg("acc accB", "")} Round B accuses (counts ×2)</span><span>${keySvg("def", "")} defends</span>${god ? `<span>${keySvg("pack", "")} Werewolf pack</span><span>red halo = Table Suspicion</span>` : ""}`
      : `<span class="what">${esc(linesLabel)}</span><span>${keySvg("vote", "")} vote</span><span>dashed tag = Abstain</span>${god ? `<span>red halo = Table Suspicion</span>` : ""}`;

    root.innerHTML = `<div class="vB-match">
      <section class="vB-left">
        <div class="vB-head">
          <button type="button" class="vB-back" data-back>← All tables</button>
          <h1 data-focus tabindex="-1">Match <small>${esc(st.matchId)}</small> · ${esc(st.phaseLabel)}</h1>
          <span class="vB-god ${god ? "on" : "off"}">${god ? "God View on" : "God View off"}</span>
        </div>
        <div class="vB-tablewrap">
          <div class="vB-modes" role="group" aria-label="Lines on the table">
            <button type="button" data-mode="acc" aria-pressed="${m === "acc"}">Accusations</button>
            <button type="button" data-mode="votes" aria-pressed="${m === "votes"}" ${ballotDay ? "" : "disabled"}>Votes</button>
          </div>
          <div class="vB-circle">
            <div class="vB-felt"></div>
            ${svg}
            <div class="vB-centre">${cbits.join("")}</div>
            ${seatHTML}
          </div>
          <div class="vB-key">${key}</div>
        </div>
      </section>
      <aside class="vB-right" aria-label="Transcript">
        <h2>The story so far</h2>
        ${transcript(st, god, chip, S)}
      </aside>
    </div>`;
    root.querySelector("[data-back]").onclick = () => ctx.toGrid();
    root.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => { mode = b.dataset.mode; renderMatch(root, ctx); }));
    const r = root.querySelector(".vB-right");
    r.scrollTop = r.scrollHeight;
  }

  function transcript(st, god, chip, S) {
    const secs = [];
    const maxN = Math.max(st.nights.length, st.days.length);
    for (let k = 1; k <= maxN; k++) {
      const nt = st.nights.find((x) => x.n === k), d = st.days.find((x) => x.n === k);
      if (nt) secs.push({ kind: "night", k, html: nightHTML(nt, st, god, chip, S) });
      if (d) secs.push({ kind: "day", k, html: dayHTML(d, st, god, chip, S) });
    }
    if (!secs.length) return `<p class="vB-hidden">The Match has just been dealt. Night 1 begins shortly.</p>`;
    const last = secs.length - 1;
    // Pending step markers go in the last section.
    if (st.inflight) secs[last].html += pendingHTML(st, god);
    return secs.map((s, i) => `<details class="vB-sec ${s.kind}" ${i >= last - 1 ? "open" : ""}>
      <summary>${s.kind === "night" ? "☾ Night" : "☀ Day"} ${s.k}</summary><div class="body">${s.html}</div></details>`).join("");
  }

  function pendingHTML(st, god) {
    const f = st.inflight;
    if (STEP_SECRET.has(f.step) && !god) return `<div class="vB-pend"><progress class="vB-spin" aria-label="Night in progress"></progress> The Night's secret actions are in progress…</div>`;
    const seats = Object.entries(f.seats).map(([k, v]) =>
      `<span class="s">${v === "thinking" ? `<progress class="vB-spin" aria-label="P${k} thinking"></progress>` : v === "acted" ? "✓" : "⏱"}P${k}${v === "timedout" ? " timed out" : ""}</span>`).join("");
    return `<div class="vB-pend"><b>${esc(st.stepLabel)}</b> in progress — published when everyone is in: ${seats}</div>`;
  }

  function nightHTML(nt, st, god, chip, S) {
    let h = "";
    if (nt.killed === undefined) h += `<div class="vB-public">The village sleeps…</div>`;
    else h += `<div class="vB-public">${nt.killed ? `Dawn: ${chip(nt.killed)} ${esc(S(nt.killed).label)} was killed — <b>${esc(S(nt.killed).role)}</b>.` : "Dawn: no one died."}</div>`;
    if (!god) return h + `<div class="vB-hidden">Wolf Chat and Night choices are hidden (God View off).</div>`;
    let r = `<div class="vB-redink"><span class="lbl">WOLF CHAT · GOD VIEW · Pack Leader P${nt.packLeader}</span>`;
    for (const w of nt.wolfChat) r += `<div class="vB-whisper">${chip(w.seat)}<q>${esc(w.text)}</q></div>`;
    const props = nt.choices.filter((c) => c.kind === "propose_kill");
    if (props.length) r += `<div class="vB-nightact">🗡 Kill proposals: ${props.map((c) => `P${c.seat} → P${c.target}`).join(", ")}${nt.leaderPick ? ` · split, so Pack Leader P${nt.leaderPick.leader} picks <b>P${nt.leaderPick.target}</b>` : props.length === 2 && props[0].target === props[1].target ? " · agreed" : ""}</div>`;
    for (const c of nt.choices.filter((c) => c.kind === "inspect")) r += `<div class="vB-nightact">👁 Seer P${c.seat} inspects P${c.target}: <b>${esc(c.result)}</b></div>`;
    for (const c of nt.choices.filter((c) => c.kind === "protect")) r += `<div class="vB-nightact">✚ Doctor P${c.seat} protects P${c.target}</div>`;
    if (nt.saved) r += `<div class="vB-nightact">✚ <b>The Doctor saved P${nt.saved}</b></div>`;
    return h + r + `</div>`;
  }

  function speechHTML(sp, chip, S, god) {
    const s = S(sp.seat);
    const tags = [
      ...sp.accuse.map((t) => `<span class="vB-tag acc">→ accuses P${t}</span>`),
      ...(sp.defend ?? []).map((t) => `<span class="vB-tag def">defends P${t}</span>`),
    ];
    if (sp.claim) tags.unshift(`<span class="vB-claim">⚑ Claims ${esc(sp.claim.role)}${(sp.claim.results ?? []).map((r) => ` · P${r.seat} ${r.side}`).join("")}${god ? (s.role === sp.claim.role ? `<span class="true">TRUE</span>` : `<span class="lie">LIE</span>`) : ""}</span>`);
    const body = sp.skipped ? `<span class="vB-skip">⏱ Speech skipped — timed out</span>` : `<q>${esc(sp.text)}</q>`;
    return `<div class="vB-line">${chip(sp.seat)}<div><div class="who">${esc(s.label)}</div>${body}${tags.length ? `<div class="vB-tags">${tags.join("")}</div>` : ""}</div></div>`;
  }

  function dayHTML(d, st, god, chip, S) {
    let h = `<div class="vB-order">Presentation order: ${d.order.map((k) => `P${k}`).join(" → ")}</div>`;
    for (const r of ["A", "B"]) if (d.rounds[r]) h += `<h3>Speech Round ${r}</h3>` + d.rounds[r].map((sp) => speechHTML(sp, chip, S, god)).join("");
    if (d.repliers) {
      h += `<h3>Right of Reply</h3><div class="vB-order">Repliers: ${d.repliers.seats.map((k) => `P${k} (score ${d.repliers.scores[k]})`).join(", ")}</div>`;
      for (const rp of d.replies) h += speechHTML({ seat: rp.seat, text: rp.text, accuse: [], defend: [], claim: null }, chip, S, god);
    }
    if (d.ballots) {
      h += `<h3>Vote</h3>`;
      for (const b of d.ballots) {
        const tgt = b.target === "abstain" ? (b.timedOut ? "Abstain (timed out)" : "Abstain") : `P${b.target}`;
        h += `<div class="vB-ballot">${chip(b.seat)}<span class="arrow">→ ${tgt}</span><span class="reason">${b.reason ? esc(b.reason) : b.timedOut ? "⏱ no ballot" : ""}</span></div>`;
      }
      h += `<div class="vB-outcome">${d.eliminated ? `${chip(d.eliminated)} ${esc(S(d.eliminated).label)} eliminated — ${esc(S(d.eliminated).role)}` : "Tie or all Abstain: no elimination"}</div>`;
    }
    return h;
  }

  window.VARIANTS.push({
    key: "B",
    name: "Round table",
    css,
    render(root, ctx) {
      root.classList.toggle("is-night", ctx.view === "match" && ctx.state.phase === "night");
      if (ctx.view === "grid") renderGrid(root, ctx);
      else renderMatch(root, ctx);
    },
  });
})();
