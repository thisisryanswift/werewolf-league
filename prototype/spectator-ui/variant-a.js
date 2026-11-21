// PROTOTYPE — Variant A: Neo-brutalist board. Throwaway.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ROLE_ICON = { Werewolf: "🐺", Seer: "👁", Doctor: "✚", Villager: "⌂" };
  const ROLE_CLASS = { Werewolf: "wolf", Seer: "seer", Doctor: "doc", Villager: "vil" };
  const TILE_COLORS = ["yellow", "pink", "cyan", "white", "yellow", "cyan"];
  let sel = null; // selected timeline tab ("N1", "D1", ...) or null = follow latest

  const css = `
@property --vA-arc-start { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@property --vA-arc-end { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@property --vA-dash-anim { syntax: "*"; inherits: false; initial-value: , vA-dash 3s ease-in-out infinite; }
@keyframes vA-spin { to { rotate: 1turn; } }
@keyframes vA-dash {
  from { --vA-arc-start: 0deg; --vA-arc-end: 3deg; }
  50% { --vA-arc-start: 100deg; --vA-arc-end: 358deg; }
  to { --vA-arc-start: 360deg; --vA-arc-end: 363deg; }
}
body[data-variant="A"] { background: #f4f0e6; }
.vA {
  --ink: #000; --yellow: #f6ff00; --pink: #ff3ea5; --cyan: #00e5ff; --white: #fff; --paper: #f4f0e6; --grey: #b9b9b9;
  --bd: 5px solid var(--ink); --sh: 8px 8px 0 var(--ink);
  --disp: "Arial Black", "Archivo Black", Impact, "Helvetica Neue", sans-serif;
  --mono: ui-monospace, "JetBrains Mono", "Courier New", monospace;
  color: var(--ink); background: var(--paper);
  font: 700 19px/1.3 var(--mono);
  box-sizing: border-box; height: 100vh; padding: 18px 22px 78px;
  display: flex; flex-direction: column; gap: 16px; overflow: hidden;
}
.vA *, .vA *::before, .vA *::after { box-sizing: border-box; }
.vA h1, .vA h2, .vA h3 { font-family: var(--disp); font-weight: 900; margin: 0; text-transform: uppercase; letter-spacing: -.01em; line-height: 1; }
.vA button { font: inherit; color: inherit; cursor: pointer; }
.vA button:focus-visible, .vA [tabindex]:focus-visible { outline: 5px solid var(--pink); outline-offset: 3px; }

/* ── spinner (<progress> pattern) ── */
.vA progress.vA-spin:indeterminate::-webkit-progress-bar { display: none; background: none; }
.vA progress.vA-spin:indeterminate::-webkit-progress-value { display: none; background: none; }
.vA progress.vA-spin:indeterminate::-moz-progress-bar { display: none; background: none; }
.vA progress.vA-spin:indeterminate::slider-fill { display: none; background: none; }
.vA progress.vA-spin:indeterminate {
  --_from: calc(90deg + var(--vA-arc-start, 0deg));
  --_to: calc(90deg + var(--vA-arc-end, 158deg));
  --size: 28px; --thickness: 6px; --spinner-color: #000; --track-color: #fff;
  --_dur: 1.2s;
  flex: none; position: relative; width: var(--size); height: var(--size); border-radius: 50%; appearance: none;
  background: conic-gradient(from var(--_from), var(--spinner-color) calc(var(--_to) - var(--_from)), transparent 0) var(--track-color);
  animation: vA-spin var(--_dur) linear infinite var(--vA-dash-anim, );
  vertical-align: middle;
}
@supports (background-clip: border-area) {
  .vA progress.vA-spin:indeterminate { background-clip: border-area; border: var(--thickness) solid transparent; background-origin: border-box; outline: 3px solid #000; outline-offset: -3px; }
}
@supports not (background-clip: border-area) {
  .vA progress.vA-spin:indeterminate {
    mask-image: radial-gradient(farthest-side, transparent calc(100% - var(--thickness)), black calc(100% - var(--thickness))); border: 0;
  }
}
@media (forced-colors: active) {
  .vA progress.vA-spin:indeterminate { forced-color-adjust: none; --spinner-color: CanvasText; --track-color: Canvas; }
}
@media (prefers-reduced-motion: reduce) {
  .vA progress.vA-spin:indeterminate { --_dur: 6s; --vA-dash-anim: ; --vA-arc-end: 158deg; }
}

/* ── header ── */
.vA-head { display: flex; align-items: stretch; gap: 14px; flex: none; white-space: nowrap; }
.vA-head h1 { font-size: 44px; background: var(--ink); color: var(--yellow); padding: 10px 18px; border: var(--bd); box-shadow: var(--sh); display: flex; align-items: center; }
.vA-chip { border: var(--bd); box-shadow: var(--sh); background: var(--white); padding: 6px 12px; display: flex; align-items: center; gap: 10px; font-size: 20px; text-transform: uppercase; }
.vA-chip b { font-family: var(--disp); font-size: 28px; }
.vA-chip.y { background: var(--yellow); } .vA-chip.p { background: var(--pink); } .vA-chip.c { background: var(--cyan); }
.vA-back { border: var(--bd); box-shadow: var(--sh); background: var(--pink); font-family: var(--disp) !important; font-size: 26px !important; padding: 0 18px; text-transform: uppercase; }
.vA-back:active, .vA-tab:active { translate: 4px 4px; box-shadow: 4px 4px 0 var(--ink); }
.vA-spacer { flex: 1; }

/* ── grid view ── */
.vA-mosaic { flex: 1; min-height: 0; display: grid; gap: 22px; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-rows: repeat(3, minmax(0, 1fr));
  grid-template-areas: "f f a b" "f f c c" "d d e e"; padding: 0 8px 8px 0; }
.vA-tile { border: 6px solid var(--ink); box-shadow: 10px 10px 0 var(--ink); padding: 12px 16px; display: flex; flex-direction: column; gap: 5px; text-align: left; min-height: 0; overflow: hidden; background: var(--white); }
.vA-tile:hover { translate: -3px -3px; box-shadow: 13px 13px 0 var(--ink); }
.vA-tile.yellow { background: var(--yellow); } .vA-tile.pink { background: var(--pink); } .vA-tile.cyan { background: var(--cyan); } .vA-tile.white { background: var(--white); }
.vA-tile.over { background: var(--ink); color: var(--white); }
.vA-tile .id { font-size: 18px; display: flex; justify-content: space-between; gap: 8px; text-transform: uppercase; }
.vA-tile .live { background: var(--ink); color: var(--yellow); padding: 2px 8px; }
.vA-tile.over .live { background: var(--yellow); color: var(--ink); }
.vA-tile h2 { font-size: 32px; }
.vA-tile .step { font-family: var(--disp); font-size: 19px; text-transform: uppercase; }
.vA-tile.feat h2 { font-size: 92px; }
.vA-tile.feat .step { font-size: 34px; }
.vA-pips { display: flex; gap: 5px; }
.vA-pip { position: relative; flex: none; width: 42px; height: 40px; border: 4px solid var(--ink); background: var(--white); color: var(--ink); display: grid; place-items: center; font: 900 17px/1 var(--disp); }
.vA-tile.feat .vA-pip { width: 64px; height: 64px; font-size: 22px; }
.vA-pip small { font: 700 12px/1 var(--mono); display: block; text-align: center; }
.vA-pip.dead { background: var(--grey); }
.vA-pip.dead::after { content: ""; position: absolute; inset: 50% -4px auto; height: 6px; background: var(--ink); rotate: -45deg; }
.vA-pip.wolf { background: var(--pink); } .vA-pip.dead.wolf { background: var(--grey); }
.vA-tile.over .vA-pip { border-color: var(--white); }
.vA-quote { flex: none; border: 4px solid var(--ink); background: var(--white); color: var(--ink); padding: 5px 10px; font-size: 18px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.vA-tile.narrow .vA-quote { display: block; }
.vA-tile.narrow .vA-quote .q { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vA-tile.feat .vA-quote { font-size: 26px; -webkit-line-clamp: 4; padding: 10px 14px; }
.vA-tile.feat { gap: 14px; padding: 18px 22px; }
.vA-quote b { display: block; font-family: var(--disp); font-size: .85em; text-transform: uppercase; }
.vA-tile .foot { flex: none; margin-top: auto; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.vA-tag { border: 4px solid var(--ink); background: var(--white); color: var(--ink); padding: 1px 8px; display: inline-flex; align-items: center; gap: 8px; text-transform: uppercase; font-size: 17px; }
.vA-tag.to { background: var(--ink); color: var(--yellow); }
.vA-tag.win { background: var(--yellow); font-family: var(--disp); font-size: 22px; }

/* ── match view ── */
.vA-tabs { display: flex; gap: 8px; align-items: stretch; }
.vA-tab { border: var(--bd); background: var(--white); font-family: var(--disp) !important; font-size: 22px !important; padding: 0 12px; box-shadow: 5px 5px 0 var(--ink); white-space: nowrap; }
.vA-tab[aria-pressed="true"] { background: var(--ink); color: var(--yellow); }
.vA-tab.night { background: #2b2bff; color: var(--white); }
.vA-tab.night[aria-pressed="true"] { background: var(--ink); color: var(--cyan); }

.vA-seatzone { position: relative; flex: none; }
.vA-arcs { display: block; width: 100%; height: 112px; overflow: visible; }
.vA-legend { display: flex; gap: 10px; font-size: 16px; text-transform: uppercase; }
.vA-legend span { border: 3px solid var(--ink); background: var(--white); padding: 1px 8px; }
.vA-legend .b { background: var(--pink); }
.vA-seats { display: grid; grid-template-columns: repeat(8, 1fr); gap: 14px; }
.vA-seat { position: relative; border: var(--bd); box-shadow: var(--sh); background: var(--white); padding: 8px 10px 10px; min-height: 186px; display: flex; flex-direction: column; gap: 6px; overflow: visible; }
.vA-seat .num { font: 900 48px/0.9 var(--disp); }
.vA-seat .name { font: 900 24px/1.05 var(--disp); text-transform: uppercase; overflow-wrap: anywhere; }
.vA-seat.dead { background: var(--grey); box-shadow: 4px 4px 0 var(--ink); }
.vA-seat.dead .name { text-decoration: line-through 4px; }
.vA-stamp { position: absolute; top: 8px; right: 8px; rotate: 8deg; border: 4px solid var(--ink); background: var(--ink); color: var(--white); font: 900 20px/1 var(--disp); padding: 4px 8px; text-transform: uppercase; }
.vA-role { align-self: flex-start; border: 4px solid var(--ink); padding: 2px 8px; font: 900 18px/1.1 var(--disp); text-transform: uppercase; background: var(--white); }
.vA-role.wolf { background: var(--pink); } .vA-role.seer { background: var(--cyan); } .vA-role.doc { background: #7dff6a; } .vA-role.vil { background: var(--white); }
.vA-claim { position: relative; align-self: flex-start; rotate: -2deg; background: var(--yellow); border: 4px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); padding: 3px 8px; font: 900 16px/1.15 var(--disp); text-transform: uppercase; }
.vA-lie { position: absolute; right: -14px; top: -16px; rotate: 14deg; background: var(--pink); border: 4px solid var(--ink); padding: 1px 6px; font: 900 18px/1 var(--disp); }
.vA-lie.true { background: #7dff6a; }
.vA-status { margin-top: auto; display: flex; align-items: center; gap: 8px; font-size: 18px; text-transform: uppercase; }
.vA-status.acted { background: var(--ink); color: #7dff6a; padding: 3px 8px; align-self: flex-start; }
.vA-status.to { background: var(--ink); color: var(--yellow); padding: 3px 8px; align-self: flex-start; }
.vA-status.think { background: var(--cyan); border: 4px solid var(--ink); padding: 2px 8px; align-self: flex-start; }

.vA-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 470px; gap: 22px; }
.vA-board { min-height: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.vA-board.night { grid-template-columns: 1fr; }
.vA-col { min-height: 0; border: var(--bd); box-shadow: var(--sh); background: var(--white); display: flex; flex-direction: column; }
.vA-col > h3 { font-size: 24px; white-space: nowrap; padding: 8px 12px; border-bottom: var(--bd); background: var(--yellow); display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.vA-col.b > h3 { background: var(--pink); } .vA-col.r > h3 { background: var(--cyan); } .vA-col.v > h3 { background: var(--ink); color: var(--yellow); }
.vA-col > h3 small { font: 700 14px/1.1 var(--mono); white-space: normal; text-align: right; }
.vA-list { flex: 1; min-height: 0; overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; scrollbar-color: var(--ink) var(--white); }
.vA-card { border: 4px solid var(--ink); padding: 8px 10px; background: var(--white); }
.vA-card .who { font: 900 19px/1.1 var(--disp); text-transform: uppercase; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.vA-card .who .ord { background: var(--ink); color: var(--white); padding: 1px 6px; font-size: 16px; }
.vA-card .who .ag { font: 700 15px/1 var(--mono); }
.vA-card p { margin: 6px 0 0; font-size: 18px; font-weight: 600; }
.vA-card .tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.vA-card .t { border: 3px solid var(--ink); padding: 1px 6px; font-size: 15px; text-transform: uppercase; }
.vA-card .t.acc { background: var(--pink); } .vA-card .t.def { background: var(--cyan); } .vA-card .t.clm { background: var(--yellow); }
.vA-card.skip { background: var(--grey); border-style: dashed; }
.vA-card.skip p { font-family: var(--disp); text-transform: uppercase; }
.vA-card.pend { display: flex; align-items: center; gap: 10px; font: 900 19px/1.1 var(--disp); text-transform: uppercase; }
.vA-card.pend.acted { background: var(--ink); color: #7dff6a; }
.vA-card.ballot .who { justify-content: space-between; }
.vA-card.ballot .tgt { background: var(--pink); border: 3px solid var(--ink); padding: 0 6px; }
.vA-card.ballot .tgt.abs { background: var(--white); }
.vA-tally { border: 4px solid var(--ink); background: var(--yellow); padding: 8px 10px; font: 900 20px/1.2 var(--disp); text-transform: uppercase; }
.vA-empty { font: 900 22px/1.2 var(--disp); text-transform: uppercase; color: #555; padding: 6px; }
.vA-score { background: var(--ink); color: var(--cyan); padding: 1px 6px; }

.vA-nightcard { border: var(--bd); box-shadow: var(--sh); background: #2b2bff; color: var(--white); padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; overflow: auto; }
.vA-nightcard h2 { font-size: 56px; }
.vA-nightrow { border: 4px solid var(--white); padding: 10px 14px; font-size: 24px; }
.vA-nightrow b { font-family: var(--disp); text-transform: uppercase; }
.vA-nightrow.kill { background: var(--pink); color: var(--ink); border-color: var(--ink); }

.vA-god { min-height: 0; background: var(--ink); color: var(--white); border: var(--bd); box-shadow: 8px 8px 0 var(--pink); display: flex; flex-direction: column; overflow: hidden; }
.vA-god > h3 { font-size: 30px; padding: 10px 14px; color: var(--ink); background: var(--pink); display: flex; justify-content: space-between; align-items: center; }
.vA-god > h3 small { font: 700 15px/1 var(--mono); }
.vA-godscroll { flex: 1; min-height: 0; overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 14px; scrollbar-color: var(--pink) var(--ink); }
.vA-god h4 { margin: 0; font: 900 22px/1 var(--disp); text-transform: uppercase; color: var(--yellow); }
.vA-god .note { font-size: 15px; color: #ddd; margin: 2px 0 0; }
.vA-bar { display: grid; grid-template-columns: 54px 1fr; gap: 8px; align-items: center; }
.vA-bar .p { font: 900 22px/1 var(--disp); }
.vA-bar .track { position: relative; height: 36px; border: 4px solid var(--white); background: #222; }
.vA-bar .fill { position: absolute; inset: 0 auto 0 0; background: var(--cyan); }
.vA-bar .fill.wolf { background: var(--pink); }
.vA-bar .lbl { position: absolute; inset: 0 6px; display: flex; justify-content: space-between; align-items: center; font: 900 17px/1 var(--disp); text-transform: uppercase; color: var(--white); text-shadow: 2px 2px 0 #000, -1px -1px 0 #000; }
.vA-bar.dead .p { text-decoration: line-through 3px; color: #aaa; }
.vA-wc { border: 4px solid var(--white); padding: 8px 10px; display: flex; flex-direction: column; gap: 8px; }
.vA-wc .msg { font-size: 18px; }
.vA-wc .msg b { font-family: var(--disp); color: var(--pink); text-transform: uppercase; }
.vA-wc .act { font-size: 17px; border-top: 3px dashed #777; padding-top: 6px; }
.vA-wc .act b { color: var(--cyan); }
.vA-godoff { padding: 18px 14px; font: 900 26px/1.2 var(--disp); text-transform: uppercase; color: var(--yellow); }
`;

  function seatName(st, n) { const s = st.seats[n - 1]; return s ? s.label : `P${n}`; }
  function showRole(s, god) { return god || s.revealed; }
  function roleChip(role) { return `<span class="vA-role ${ROLE_CLASS[role]}">${ROLE_ICON[role]} ${esc(role)}</span>`; }
  function claimText(c) {
    const r = (c.results || []).map((x) => `P${x.seat} = ${x.side === "wolf" ? "WOLF" : "VILLAGE"}`).join(", ");
    return `CLAIMS ${esc(c.role)}${r ? `: ${r}` : ""}`;
  }
  const spinner = (label) => `<progress class="vA-spin" aria-label="${esc(label)}"></progress>`;

  // ── GRID ──
  function renderGrid(root, ctx) {
    const live = ctx.tiles.filter((t) => t.phase !== "over").length;
    const areas = ["f", "a", "b", "c", "d", "e"];
    root.innerHTML = `
      <header class="vA-head">
        <h1 data-focus tabindex="-1">Werewolf League</h1>
        <div class="vA-chip y"><b>${live}</b> live Matches</div>
        <div class="vA-chip c">click a tile → Match view</div>
        <div class="vA-spacer"></div>
        <div class="vA-chip p">God View <b>${ctx.godView ? "ON" : "OFF"}</b></div>
      </header>
      <section class="vA-mosaic" aria-label="Live Matches">
        ${ctx.tiles.map((t, i) => tile(t, i, areas[i], ctx.godView)).join("")}
      </section>`;
    root.querySelectorAll(".vA-tile").forEach((el) => (el.onclick = () => ctx.openMatch()));
  }

  function tile(t, i, area, god) {
    const over = t.phase === "over";
    const phase = over ? "Final" : `${t.phase === "night" ? "Night" : "Day"} ${t.n}`;
    const pips = Array.from({ length: t.seats }, (_, k) => {
      const n = k + 1, alive = t.alive.includes(n), role = t.roles[k];
      const show = god || !alive;
      return `<span class="vA-pip ${alive ? "" : "dead"} ${show && role === "Werewolf" ? "wolf" : ""}" title="P${n}${alive ? "" : " (dead)"}${show ? " " + role : ""}">
        <span>P${n}${show ? `<small>${role[0]}</small>` : ""}</span></span>`;
    }).join("");
    const quote = t.latestLine
      ? `<div class="vA-quote"><b>P${t.latestLine.seat} · ${esc(t.latestLine.label)}</b><span class="q">“${esc(t.latestLine.text)}”</span></div>`
      : `<div class="vA-quote"><b>No speeches yet</b>Night 1 in progress.</div>`;
    const color = over ? "" : TILE_COLORS[i % TILE_COLORS.length];
    return `<button type="button" class="vA-tile ${color} ${over ? "over" : ""} ${t.featured ? "feat" : ""} ${area === "a" || area === "b" ? "narrow" : ""}" style="grid-area:${area}">
      <div class="id"><span>${esc(t.matchId)} · ${t.seats} seats</span><span class="live">${over ? "■ ENDED" : "● LIVE"}</span></div>
      <h2>${phase}</h2>
      <div class="step">${esc(t.step)} · ${t.alive.length}/${t.seats} alive</div>
      <div class="vA-pips">${pips}</div>
      ${quote}
      <div class="foot">
        ${over ? `<span class="vA-tag win">🏆 ${t.winner === "village" ? "Village" : "Wolf"} Side wins</span>` : ""}
        ${t.thinking ? `<span class="vA-tag">${spinner("Thinking")} thinking ×${t.thinking}</span>` : ""}
        ${t.timeouts ? `<span class="vA-tag to">⏱ ${t.timeouts} timed out</span>` : ""}
      </div>
    </button>`;
  }

  // ── MATCH ──
  function timeline(st) {
    const out = [];
    const maxN = Math.max(0, ...st.nights.map((x) => x.n), ...st.days.map((x) => x.n));
    for (let n = 1; n <= maxN; n++) {
      if (st.nights.find((x) => x.n === n)) out.push(`N${n}`);
      if (st.days.find((x) => x.n === n)) out.push(`D${n}`);
    }
    return out;
  }

  function renderMatch(root, ctx) {
    const st = ctx.state, god = ctx.godView;
    const tabs = timeline(st);
    const cur = sel && tabs.includes(sel) ? sel : tabs[tabs.length - 1] || null;
    const isNight = cur?.startsWith("N");
    const curN = cur ? +cur.slice(1) : 0;
    // Accusation arcs: the selected Day, or the latest Day before a selected Night.
    // If the selected Day has no Accusations published yet, keep showing the previous Day's.
    let arcDay = isNight ? st.days.filter((d) => d.n < curN).pop() : st.days.find((d) => d.n === curN);
    if (arcDay && !st.accusations.some((a) => a.day === arcDay.n)) arcDay = st.days.filter((d) => d.n < arcDay.n).pop() || arcDay;
    const accs = arcDay ? st.accusations.filter((a) => a.day === arcDay.n) : [];
    const totalTO = st.timeouts.length;
    const inflight = st.inflight;
    const thinkingN = inflight ? Object.values(inflight.seats).filter((v) => v === "thinking").length : 0;

    root.innerHTML = `
      <header class="vA-head">
        <button type="button" class="vA-back">← Grid</button>
        <h1 data-focus tabindex="-1">${esc(st.phaseLabel)}</h1>
        <div class="vA-chip ${inflight ? "c" : "y"}">${inflight ? spinner("Turn in flight") : ""}<b>${esc(st.stepLabel || (st.phase === "setup" ? "Dealing" : "Resolved"))}</b>${inflight ? `${inflight.elapsedS}s / ${inflight.deadlineS}s · ${thinkingN} thinking` : ""}</div>
        <div class="vA-chip">${esc(st.matchId || "—")} · ${st.alive.length}/${st.seats.length} alive</div>
        ${totalTO ? `<div class="vA-chip p">⏱ <b>${totalTO}</b> timeout${totalTO > 1 ? "s" : ""}</div>` : ""}
        <div class="vA-spacer"></div>
        <nav class="vA-tabs" aria-label="Catch up: Nights and Days">
          ${tabs.map((t) => `<button type="button" class="vA-tab ${t[0] === "N" ? "night" : ""}" data-tab="${t}" aria-pressed="${t === cur}">${t[0] === "N" ? "☾ NIGHT" : "☀ DAY"} ${t.slice(1)}</button>`).join("")}
        </nav>
      </header>
      <section class="vA-seatzone" aria-label="Seats and Accusations${arcDay ? ` (Day ${arcDay.n})` : ""}">
        <div class="vA-legend">${arcDay ? `<span>Accusations · Day ${arcDay.n}${arcDay.n !== curN || isNight ? " (latest published)" : ""}</span><span>━ Round A ×1</span><span class="b">██ Round B ×2</span>` : `<span>No Accusations yet</span>`}</div>
        <svg class="vA-arcs" aria-hidden="true"></svg>
        <div class="vA-seats">${st.seats.map((s) => seatBlock(st, s, god)).join("")}</div>
      </section>
      <section class="vA-body">
        ${cur == null ? `<div class="vA-board night"><div class="vA-nightcard"><h2>Dealing roles…</h2><div class="vA-nightrow">Seed ${esc(st.seed)} · ${st.seats.length} seats</div></div></div>`
          : isNight ? nightBoard(st, st.nights.find((x) => x.n === curN), god)
          : dayBoard(st, st.days.find((x) => x.n === curN), god)}
        ${godPanel(st, god, isNight ? curN : null)}
      </section>`;

    root.querySelector(".vA-back").onclick = () => ctx.toGrid();
    root.querySelectorAll(".vA-tab").forEach((b) => (b.onclick = () => {
      sel = b.dataset.tab === tabs[tabs.length - 1] ? null : b.dataset.tab;
      renderMatch(root, ctx);
    }));
    drawArcs(root, accs);
  }

  function seatBlock(st, s, god) {
    const inf = st.inflight?.seats?.[s.seat];
    const claim = st.claims[s.seat];
    let status = "";
    if (s.alive && inf === "thinking") status = `<div class="vA-status think">${spinner(`P${s.seat} thinking`)} thinking…</div>`;
    else if (s.alive && inf === "acted") status = `<div class="vA-status acted">✓ acted</div>`;
    else if (s.alive && inf === "timedout") status = `<div class="vA-status to">⏱ TIMED OUT</div>`;
    const tos = st.timeouts.filter((t) => t.seat === s.seat).length;
    return `<article class="vA-seat ${s.alive ? "" : "dead"}" data-seat="${s.seat}">
      <div class="num">P${s.seat}</div>
      <div class="name">${esc(s.label)}</div>
      ${!s.alive ? `<div class="vA-stamp">☠ Dead</div><div class="vA-status" style="margin:0">Died ${esc(s.diedAt)}</div>` : ""}
      ${showRole(s, god) ? roleChip(s.role) : ""}
      ${claim ? `<div class="vA-claim">${claimText(claim)}${god ? `<span class="vA-lie ${claim.true ? "true" : ""}">${claim.true ? "TRUE" : "LIE"}</span>` : ""}</div>` : ""}
      ${status}
      ${tos && !(s.alive && inf === "timedout") ? `<div class="vA-status" style="font-size:15px">⏱ ${tos} timeout${tos > 1 ? "s" : ""}</div>` : ""}
    </article>`;
  }

  function speechCard(st, sp, i, god) {
    const s = st.seats[sp.seat - 1];
    const who = `<div class="who"><span class="ord">#${i + 1}</span>P${sp.seat}${god ? ` ${ROLE_ICON[s.role]}` : ""} <span class="ag">${esc(s.label)}</span></div>`;
    if (sp.skipped) return `<div class="vA-card skip">${who}<p>⏱ Timed out — speech skipped</p></div>`;
    const tags = [
      ...sp.accuse.map((t) => `<span class="t acc">Accuses P${t}</span>`),
      ...sp.defend.map((t) => `<span class="t def">Defends P${t}</span>`),
      sp.claim ? `<span class="t clm">${claimText(sp.claim)}</span>` : "",
    ].join("");
    return `<div class="vA-card">${who}<p>${esc(sp.text)}</p>${tags ? `<div class="tags">${tags}</div>` : ""}</div>`;
  }

  function pendingList(st, order) {
    const inf = st.inflight;
    return order.filter((n) => n in inf.seats).map((n) => {
      const v = inf.seats[n];
      if (v === "acted") return `<div class="vA-card pend acted">✓ P${n} acted <span style="font:700 15px var(--mono)">${esc(seatName(st, n))}</span></div>`;
      if (v === "timedout") return `<div class="vA-card pend skip">⏱ P${n} timed out</div>`;
      return `<div class="vA-card pend">${spinner(`P${n} thinking`)} P${n} thinking… <span style="font:700 15px var(--mono)">${esc(seatName(st, n))}</span></div>`;
    }).join("") + `<div class="vA-empty">Round publishes when every seat acts or hits the ${inf.deadlineS}s deadline</div>`;
  }

  function dayBoard(st, day, god) {
    const inf = st.inflight, live = day.n === st.n && st.phase === "day" && inf;
    const col = (cls, title, sub, body) => `<section class="vA-col ${cls}"><h3>${title}<small>${sub}</small></h3><div class="vA-list">${body}</div></section>`;
    const round = (r) => {
      const sps = day.rounds[r];
      if (sps) return sps.map((sp, i) => speechCard(st, sp, i, god)).join("");
      if (live && inf.step === `speech_${r}`) return pendingList(st, day.order);
      return `<div class="vA-empty">Not yet</div>`;
    };
    let reply = "";
    if (day.repliers) {
      reply += `<div class="vA-tally">Repliers: ${day.repliers.seats.map((n) => `P${n} <span class="vA-score">${day.repliers.scores[n]} pts</span>`).join(" · ")}</div>`;
      reply += day.replies.map((r, i) => `<div class="vA-card"><div class="who"><span class="ord">#${i + 1}</span>P${r.seat} <span class="ag">${esc(seatName(st, r.seat))}</span></div><p>${esc(r.text)}</p></div>`).join("");
      if (live && inf.step === "reply") reply += pendingList(st, Object.keys(inf.seats).map(Number));
    } else if (day.ballots || (live && inf.step === "vote")) reply = `<div class="vA-empty">No Accusations, no Right of Reply</div>`;
    else reply = `<div class="vA-empty">Scored after Round B<br>(A ×1, B ×2)</div>`;

    let vote = "";
    if (day.ballots) {
      const tally = {};
      for (const b of day.ballots) tally[b.target] = (tally[b.target] || 0) + 1;
      const t = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k === "abstain" ? "Abstain" : "P" + k} ×${v}`).join(" · ");
      const el = day.eliminated ? st.seats[day.eliminated - 1] : null;
      vote += `<div class="vA-tally">${t}<br>→ ${el ? `P${el.seat} eliminated · ${esc(el.role)}` : "No elimination"}</div>`;
      vote += day.ballots.map((b) => `<div class="vA-card ballot">
        <div class="who"><span>P${b.seat} →</span><span class="tgt ${b.target === "abstain" ? "abs" : ""}">${b.target === "abstain" ? (b.timedOut ? "ABSTAIN (timed out)" : "ABSTAIN") : "P" + b.target}</span></div>
        ${b.reason ? `<p>${esc(b.reason)}</p>` : `<p>⏱ No ballot — missed the deadline</p>`}</div>`).join("");
    } else if (live && inf.step === "vote") vote = pendingList(st, day.order);
    else vote = `<div class="vA-empty">Not yet</div>`;

    const order = `order ${day.order.map((n) => "P" + n).join(" ")}`;
    return `<div class="vA-board">
      ${col("a", "Round A", order, round("A"))}
      ${col("b", "Round B", "having seen A", round("B"))}
      ${col("r", "Right of Reply", "most-accused", reply)}
      ${col("v", "Vote", "plurality", vote)}
    </div>`;
  }

  function nightBoard(st, night, god) {
    const rows = [];
    if (night.killed === undefined) rows.push(`<div class="vA-nightrow">${st.inflight ? spinner("Night in progress") : ""} <b>Night in progress</b>${st.stepLabel ? ` — ${esc(st.stepLabel)}` : " — waiting for dawn"}</div>`);
    else if (night.killed) rows.push(`<div class="vA-nightrow kill"><b>☠ Dawn: P${night.killed} (${esc(seatName(st, night.killed))}) was killed</b> — revealed ${esc(st.seats[night.killed - 1].role)}</div>`);
    else rows.push(`<div class="vA-nightrow"><b>☀ Dawn: nobody died</b></div>`);
    if (god) {
      rows.push(`<div class="vA-nightrow"><b>Pack Leader:</b> P${night.packLeader}</div>`);
      for (const c of night.choices) {
        const v = c.kind === "propose_kill" ? `🐺 P${c.seat} proposes killing P${c.target}` : c.kind === "inspect" ? `👁 Seer P${c.seat} inspects P${c.target} → ${c.result === "wolf" ? "WEREWOLF" : "village"}` : `✚ Doctor P${c.seat} protects P${c.target}`;
        rows.push(`<div class="vA-nightrow">${v}</div>`);
      }
      if (night.leaderPick) rows.push(`<div class="vA-nightrow"><b>Split → Pack Leader P${night.leaderPick.leader} decides: P${night.leaderPick.target}</b></div>`);
      if (night.saved) rows.push(`<div class="vA-nightrow"><b>✚ Doctor saved P${night.saved}</b></div>`);
    } else rows.push(`<div class="vA-nightrow">Night actions are secret. Turn God View on to see them.</div>`);
    return `<div class="vA-board night"><div class="vA-nightcard"><h2>☾ Night ${night.n}</h2>${rows.join("")}</div></div>`;
  }

  function godPanel(st, god, nightN) {
    if (!god) return `<aside class="vA-god"><h3>God View <small>OFF</small></h3><div class="vA-godoff">Public info only.<br><br>Living roles, Wolf Chat and Table Suspicion are hidden.</div></aside>`;
    const ts = st.tableSuspicion;
    const bars = Object.keys(ts).length
      ? st.seats.filter((s) => s.seat in ts).map((s) => {
        const p = ts[s.seat];
        return `<div class="vA-bar ${s.alive ? "" : "dead"}"><span class="p">P${s.seat}</span><div class="track"><div class="fill ${s.side === "wolf" ? "wolf" : ""}" style="width:${Math.min(100, p * 100).toFixed(0)}%"></div><div class="lbl"><span>${Math.round(p * 100)}%</span><span>${ROLE_ICON[s.role]} ${esc(s.role)}</span></div></div></div>`;
      }).join("")
      : `<div class="vA-empty" style="color:#aaa">Appears after the first vote</div>`;
    const nights = [...st.nights].reverse().filter((n) => nightN == null || n.n === nightN || true);
    const chats = nights.map((n) => `<div class="vA-wc"><h4>☾ Night ${n.n} · Pack Leader P${n.packLeader}</h4>
      ${n.wolfChat.map((m) => `<div class="msg"><b>P${m.seat}:</b> ${esc(m.text)}</div>`).join("") || `<div class="msg">${spinner("Wolf Chat in flight")} wolves are talking…</div>`}
      ${n.choices.filter((c) => c.kind === "propose_kill").map((c) => `<div class="act">🐺 P${c.seat} → kill <b>P${c.target}</b></div>`).join("")}
      ${n.leaderPick ? `<div class="act">Pack Leader P${n.leaderPick.leader} decides: <b>P${n.leaderPick.target}</b></div>` : ""}
      ${n.saved ? `<div class="act">✚ Doctor saved <b>P${n.saved}</b></div>` : ""}
    </div>`).join("");
    return `<aside class="vA-god"><h3>God View <small>roles · Wolf Chat</small></h3><div class="vA-godscroll">
      <div><h4>Table Suspicion</h4><p class="note">Mean stated P(werewolf) at the last vote, beside the true role.</p></div>
      ${bars}
      <h4>Wolf Chat</h4>
      ${chats || `<div class="vA-empty" style="color:#aaa">No Nights yet</div>`}
    </div></aside>`;
  }

  function drawArcs(root, accs) {
    const svg = root.querySelector(".vA-arcs");
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const H = box.height;
    const cx = {};
    root.querySelectorAll(".vA-seat").forEach((el) => {
      const r = el.getBoundingClientRect();
      cx[el.dataset.seat] = r.left + r.width / 2 - box.left;
    });
    // Spread endpoints so several arcs into one seat don't overlap.
    const ins = {}, outs = {};
    for (const a of accs) { (ins[a.to] ??= []).push(a); (outs[a.from] ??= []).push(a); }
    const off = (list, a, step) => (list.indexOf(a) - (list.length - 1) / 2) * step;
    const paths = accs.map((a) => {
      // Outgoing arcs leave the left half of a seat; incoming arcs land on the right half.
      const sx = cx[a.from] - 40 + off(outs[a.from], a, 14);
      const ex = cx[a.to] + 40 + off(ins[a.to], a, 18);
      const dx = Math.abs(ex - sx);
      const h = Math.min(H - 12, 26 + dx * 0.11);
      const d = `M ${sx} ${H} C ${sx} ${H - h * 1.3}, ${ex} ${H - h * 1.3}, ${ex} ${H - 4}`;
      return a.round === "B"
        ? `<path d="${d}" stroke="#000" stroke-width="13" fill="none"/><path d="${d}" stroke="#ff3ea5" stroke-width="7" fill="none" marker-end="url(#vA-hB)"/>`
        : `<path d="${d}" stroke="#000" stroke-width="4" fill="none" stroke-dasharray="10 6" marker-end="url(#vA-hA)"/>`;
    });
    svg.innerHTML = `<defs>
      <marker id="vA-hA" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#000"/></marker>
      <marker id="vA-hB" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="26" markerHeight="26" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#ff3ea5" stroke="#000" stroke-width="1.5"/></marker>
    </defs>${paths.filter((_, i) => accs[i].round === "A").join("")}${paths.filter((_, i) => accs[i].round === "B").join("")}`;
  }

  window.VARIANTS.push({
    key: "A", name: "Neo-brutalist board", css,
    render(root, ctx) { ctx.view === "grid" ? renderGrid(root, ctx) : renderMatch(root, ctx); },
  });
})();
