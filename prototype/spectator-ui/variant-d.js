// PROTOTYPE — Variant D: "Play script". Editorial / theatre script on paper.
// Grid = newspaper front page. Match = a chronological script with a sticky
// Dramatis Personae margin, claim stamps and per-Day accusation arc diagrams.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let lastKey = null;
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const css = `
body[data-variant="D"] { background: #f3ead4; }
.vD {
  --paper: #f3ead4; --paper-2: #ebe0c4; --ink: #17130f; --ink-2: #3d342b; --red: #9e100c; --rule: #17130f;
  color-scheme: light;
  background: var(--paper); color: var(--ink);
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", "Source Serif 4", "Noto Serif", Georgia, serif;
  font-size: 21px; line-height: 1.45;
  min-height: 100vh; box-sizing: border-box; padding: 0 0 96px;
}
.vD *, .vD *::before, .vD *::after { box-sizing: border-box; }
.vD .sc { font-variant-caps: all-small-caps; letter-spacing: .06em; }
.vD .red { color: var(--red); }
.vD h1, .vD h2, .vD h3 { margin: 0; font-weight: 700; }
.vD h1:focus { outline: none; }
.vD a { color: inherit; }

/* ───────── Front page ───────── */
.vD .fp { max-width: 1840px; margin: 0 auto; padding: 18px 36px 0; }
.vD .masthead { text-align: center; border-bottom: 6px double var(--rule); padding-bottom: 6px; }
.vD .masthead .ears { display: flex; justify-content: space-between; font-size: 18px; border-bottom: 1px solid var(--rule); padding-bottom: 4px; }
.vD .masthead h1 { font-size: 76px; line-height: 1.05; letter-spacing: -.01em; margin: 8px 0 2px; font-family: "UnifrakturMaguntia", "Old English Text MT", inherit; }
.vD .masthead h1 .live { font-size: 34px; vertical-align: middle; color: var(--red); letter-spacing: .1em; }
.vD .masthead .strap { font-style: italic; font-size: 20px; }
.vD .stories { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 0; }
.vD .story { position: relative; padding: 18px 26px 20px; border-bottom: 1px solid var(--rule); cursor: pointer; }
.vD .story:not(.lead):not(:nth-child(3n+2)) { border-left: 1px solid var(--rule); }
.vD .story:hover h2 { text-decoration: underline; text-decoration-thickness: 2px; }
.vD .story h2 a { text-decoration: none; }
.vD .story h2 a::after { content: ""; position: absolute; inset: 0; }
.vD .story h2 a:focus-visible { outline: none; }
.vD .story:has(a:focus-visible) { outline: 3px solid var(--ink); outline-offset: -3px; }
.vD .story.lead { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 0 40px; border-bottom: 3px solid var(--rule); padding: 22px 6px 24px; }
.vD .story.lead h2 { font-size: 58px; line-height: 1.04; }
.vD .story.lead .lead-l { border-right: 1px solid var(--rule); padding-right: 40px; }
.vD .story h2 { font-size: 36px; line-height: 1.08; margin: 4px 0 10px; }
.vD .dateline { font-size: 18px; font-weight: 700; }
.vD .dateline .phase-night { color: var(--ink); }
.vD .roster { font-size: 21px; margin: 8px 0; }
.vD .roster .p { white-space: nowrap; margin-right: .55em; }
.vD .roster .dead { text-decoration: line-through; text-decoration-thickness: 2px; }
.vD .roster .wolf { color: var(--red); font-weight: 700; }
.vD .pull { margin: 12px 0 8px; padding: 8px 0 8px 18px; border-left: 5px solid var(--ink); font-size: 26px; font-style: italic; line-height: 1.3; }
.vD .story.lead .pull { font-size: 36px; border-left-width: 7px; }
.vD .pull cite { display: block; font-style: normal; font-size: 18px; margin-top: 6px; }
.vD .meta { font-size: 19px; font-style: italic; }
.vD .meta b { font-style: normal; }

/* ───────── Match view ───────── */
.vD .mv { display: grid; grid-template-columns: 430px minmax(0, 1fr); max-width: 1900px; margin: 0 auto; }
.vD .personae {
  position: sticky; top: 0; align-self: start; height: 100vh; overflow-y: auto;
  padding: 16px 22px 100px 26px; border-right: 3px double var(--rule); background: var(--paper-2);
}
.vD .personae h2 { font-size: 22px; border-bottom: 2px solid var(--rule); padding-bottom: 2px; margin-bottom: 4px; }
.vD .personae .back { font: inherit; font-size: 18px; background: none; border: 0; padding: 0; text-decoration: underline; cursor: pointer; color: var(--ink); }
.vD .personae .ts-note { font-size: 16px; font-style: italic; margin: 0 0 4px; }
.vD .pers { list-style: none; margin: 0; padding: 0; }
.vD .pers li { display: grid; grid-template-columns: 2.1em 1fr; padding: 6px 0 7px; border-bottom: 1px solid var(--rule); line-height: 1.25; }
.vD .pers .num { font-size: 26px; font-weight: 700; }
.vD .pers .nm { font-weight: 700; }
.vD .pers .nm.dead { text-decoration: line-through; text-decoration-thickness: 2px; }
.vD .pers .line2 { font-size: 18px; display: flex; flex-wrap: wrap; gap: 0 .7em; align-items: center; }
.vD .pers .role { font-weight: 700; }
.vD .pers .wolf, .vD .wolfname { color: var(--red); }
.vD .pers .claim { font-size: 18px; }
.vD .ts { display: flex; align-items: center; gap: 8px; font-size: 17px; }
.vD .ts .bar { flex: 1; height: 12px; border: 1.5px solid var(--ink); background: var(--paper); max-width: 170px; }
.vD .ts .bar i { display: block; height: 100%; background: var(--ink); }
.vD .ts .bar i.wolf { background: var(--red); }
.vD .turn { display: inline-flex; align-items: center; gap: 6px; font-size: 18px; }
.vD .turn.to { font-style: italic; color: var(--red); }

/* thinking… spinner: native <progress>, indeterminate (spinner guide) */
@property --vd-arc-start { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@property --vd-arc-end { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@property --vd-dash-animation { syntax: "*"; inherits: false; initial-value: , vd-progress-dash 3s ease-in-out infinite; }
.vD progress.vd-spin:indeterminate::-webkit-progress-bar { display: none; background: none; }
.vD progress.vd-spin:indeterminate::-webkit-progress-value { display: none; background: none; }
.vD progress.vd-spin:indeterminate::-moz-progress-bar { display: none; background: none; }
.vD progress.vd-spin:indeterminate {
  --_from: calc(90deg + var(--vd-arc-start, 0deg));
  --_to: calc(90deg + var(--vd-arc-end, 158deg));
  --size: 20px; --thickness: 3px; --spinner-color: var(--ink); --track-color: #cdbf9d;
  --spinner-duration: 1.5s; --_used-spinner-duration: var(--spinner-duration);
  position: relative; width: var(--size); height: var(--size); border-radius: 50%; appearance: none; flex: none;
  background: conic-gradient(from var(--_from), var(--spinner-color) calc(var(--_to) - var(--_from)), transparent 0) var(--track-color);
  animation: vd-progress-spin var(--_used-spinner-duration) linear infinite var(--vd-dash-animation, );
}
@supports (background-clip: border-area) {
  .vD progress.vd-spin:indeterminate { background-clip: border-area; border: var(--thickness) solid transparent; background-origin: border-box; }
}
@supports not (background-clip: border-area) {
  .vD progress.vd-spin:indeterminate {
    --clip-boundary: calc(100% - var(--thickness));
    mask-image: radial-gradient(farthest-side, transparent var(--clip-boundary), black var(--clip-boundary)); border: 0;
  }
}
@media (forced-colors: active) {
  .vD progress.vd-spin:indeterminate { forced-color-adjust: none; --spinner-color: CanvasText; --track-color: Canvas; }
}
@media (prefers-reduced-motion: reduce) {
  .vD progress.vd-spin:indeterminate { --_used-spinner-duration: 6s; --vd-dash-animation: ; --vd-arc-end: 158deg; }
}
@keyframes vd-progress-spin { to { rotate: 1turn; } }
@keyframes vd-progress-dash {
  from { --vd-arc-start: 0deg; --vd-arc-end: 3deg; }
  50% { --vd-arc-start: 100deg; --vd-arc-end: 358deg; }
  to { --vd-arc-start: 360deg; --vd-arc-end: 363deg; }
}

/* The script */
.vD .script { padding: 14px 40px 40px 44px; }
.vD .title-block { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 0 36px; border-bottom: 6px double var(--rule); padding-bottom: 8px; margin-bottom: 6px; }
.vD .title-block h1 { font-size: 46px; line-height: 1.05; }
.vD .title-block .sub { font-size: 19px; font-style: italic; }
.vD .title-block .now { align-self: end; text-align: right; font-size: 20px; }
.vD .title-block .now b { font-size: 26px; display: block; line-height: 1.2; }
.vD .row { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 0 36px; }
.vD .row > .main { min-width: 0; }
.vD .row > .margin { min-width: 0; }
.vD .scene { margin-top: 26px; border-top: 3px solid var(--rule); padding-top: 8px; }
.vD .scene h2 { font-size: 34px; letter-spacing: .08em; }
.vD .scene h2 .sc { font-size: inherit; }
.vD .scene .order { font-size: 19px; font-style: italic; }
.vD .sub-h { margin-top: 18px; }
.vD .sub-h h3 { font-size: 23px; letter-spacing: .12em; text-transform: uppercase; border-bottom: 1px solid var(--rule); display: inline-block; padding-bottom: 1px; }
.vD .dir { font-style: italic; margin: 8px 0 8px 3em; }
.vD .dir.priv { color: var(--red); }
.vD .dir.death { font-weight: 700; }
.vD .aside { color: var(--red); margin: 6px 0 6px 3em; }
.vD .aside .who { font-weight: 700; font-variant-caps: all-small-caps; letter-spacing: .06em; }
.vD .aside .tag { font-style: italic; }
.vD .speech { margin: 10px 0; }
.vD .speech .who { font-weight: 700; letter-spacing: .1em; text-transform: uppercase; font-size: 19px; }
.vD .speech .who .agent { font-weight: 400; letter-spacing: .04em; }
.vD .speech .who .role { text-transform: none; letter-spacing: 0; font-style: italic; font-weight: 400; }
.vD .speech .text { margin: 1px 0 0 2.2em; font-size: 23px; }
.vD .speech.reply .text { font-size: 24px; }
.vD .mark { font-style: normal; font-weight: 700; white-space: nowrap; font-size: 20px; margin-left: .35em; border: 1.5px solid var(--ink); padding: 0 .3em; border-radius: 3px; }
.vD .mark.def { border-style: dashed; }
.vD .stamp {
  position: relative; display: inline-block; margin: 14px 0 4px; padding: 6px 12px 5px;
  border: 3px solid var(--ink); outline: 1px solid var(--ink); outline-offset: 2px;
  font-weight: 700; font-variant-caps: all-small-caps; letter-spacing: .08em; font-size: 22px; line-height: 1.15;
  rotate: -2deg;
}
.vD .stamp small { display: block; font-size: 18px; letter-spacing: .04em; }
.vD .stamp { margin-bottom: 40px; }
.vD .stamp .over {
  position: absolute; inset: auto -22px -38px auto; rotate: -9deg;
  color: var(--red); border: 4px solid var(--red); padding: 0 10px; font-size: 28px; line-height: 1.2; letter-spacing: .14em;
  background: var(--paper); font-variant-caps: normal; white-space: nowrap;
}
.vD .stamp.true-stamp .over { color: var(--ink); border-color: var(--ink); font-size: 22px; rotate: 8deg; }
.vD .acc { margin-top: 10px; border: 1.5px solid var(--ink); background: var(--paper-2); padding: 6px 8px 4px; position: sticky; top: 12px; }
.vD .acc .cap { font-size: 17px; font-weight: 700; }
.vD .acc .legend { font-size: 15px; font-style: italic; line-height: 1.25; }
.vD .acc svg { display: block; width: 100%; height: auto; }
.vD table.ballot { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 21px; }
.vD table.ballot th { text-align: left; font-variant-caps: all-small-caps; letter-spacing: .08em; border-bottom: 2px solid var(--rule); padding: 2px 10px 2px 0; }
.vD table.ballot td { border-bottom: 1px solid var(--rule); padding: 5px 14px 5px 0; vertical-align: top; }
.vD table.ballot td.vote { font-weight: 700; white-space: nowrap; }
.vD table.ballot td.reason { font-style: italic; }
.vD table.ballot tr.abst td.vote { font-weight: 400; font-style: italic; }
.vD .tally { font-size: 19px; }
.vD .result { font-size: 25px; font-weight: 700; margin: 8px 0; }
.vD [data-latest], .vD .row:last-child { scroll-margin-bottom: 120px; }
.vD .deliberate { font-style: italic; margin: 14px 0 10px 3em; font-size: 23px; display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
.vD .deliberate .what { flex-basis: 100%; }
.vD .deliberate .who { display: inline-flex; gap: 6px; align-items: center; font-style: normal; font-size: 19px; }
.vD .fin { text-align: center; margin: 30px 0; font-size: 22px; letter-spacing: .3em; }
`;

  const P = (n) => `P${n}`;

  // ───────── helpers ─────────
  function seatName(st, n, god) {
    const s = st.seats[n - 1];
    if (!s) return P(n);
    const wolf = (god || s.revealed) && s.role === "Werewolf";
    return `<span class="${wolf ? "wolfname" : ""}">${P(n)}</span>`;
  }
  const showRole = (s, god) => god || s.revealed;
  const claimText = (c) => `claims ${esc(c.role)}${c.results?.length ? ": " + c.results.map((r) => `${P(r.seat)} ${r.side === "wolf" ? "Werewolf" : "Village"}`).join(", ") : ""}`;

  function spinner(label) {
    return `<progress class="vd-spin" aria-label="${esc(label)}"></progress>`;
  }

  function turnMarker(st, n) {
    const f = st.inflight?.seats?.[n];
    if (f === "thinking") return `<span class="turn">${spinner(`${P(n)} thinking`)}thinking…</span>`;
    if (f === "acted") return `<span class="turn">✓ ready</span>`;
    if (f === "timedout") return `<span class="turn to">⏱ timed out</span>`;
    return "";
  }

  // ───────── accusation arc diagram ─────────
  function accDiagram(st, dayN, god) {
    const accs = st.accusations.filter((a) => a.day === dayN);
    if (!accs.length) return "";
    const N = st.seats.length, W = 320, base = 80, pad = 18;
    const x = (i) => pad + (i - 1) * ((W - pad * 2) / (N - 1));
    const counts = {};
    const arcs = accs.map((a) => {
      const k = `${a.round}${a.from}-${a.to}`; const dup = (counts[k] = (counts[k] || 0) + 1) - 1;
      const x1 = x(a.from), x2 = x(a.to), dx = Math.abs(x2 - x1);
      const h = 10 + dx * 0.2 + dup * 6;
      const above = a.round === "A";
      const y0 = above ? base - 15 : base + 15;
      const cy = above ? y0 - 2 * h : y0 + 2 * h;
      const fromWolf = god && st.seats[a.from - 1]?.role === "Werewolf";
      const col = fromWolf ? "#9e100c" : "#17130f";
      const mk = fromWolf ? "vd-ah-red" : "vd-ah";
      return `<path d="M${x1} ${y0} Q${(x1 + x2) / 2} ${cy} ${x2} ${y0}" fill="none" stroke="${col}" stroke-width="${above ? 2 : 4}" marker-end="url(#${mk}-${dayN})"><title>${P(a.from)} accuses ${P(a.to)} (Round ${a.round})</title></path>`;
    }).join("");
    const seats = st.seats.map((s) => {
      const cx = x(s.seat), wolf = showRole(s, god) && s.role === "Werewolf";
      const col = wolf ? "#9e100c" : "#17130f";
      const dead = !s.alive;
      return `<g><circle cx="${cx}" cy="${base}" r="13" fill="${dead ? "#ebe0c4" : "#f3ead4"}" stroke="${col}" stroke-width="${wolf ? 3 : 2}" ${dead ? 'stroke-dasharray="3 2"' : ""}/>
        <text x="${cx}" y="${base + 6}" text-anchor="middle" font-size="17" font-weight="700" fill="${col}" font-family="Georgia, serif">${s.seat}</text>
        ${dead ? `<line x1="${cx - 11}" y1="${base + 11}" x2="${cx + 11}" y2="${base - 11}" stroke="${col}" stroke-width="2"/>` : ""}</g>`;
    }).join("");
    const marker = (id, col) => `<marker id="${id}-${dayN}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${col}"/></marker>`;
    const list = accs.map((a) => `${P(a.from)}→${P(a.to)} (${a.round})`).join(", ");
    return `<figure class="acc" aria-label="Accusations on Day ${dayN}: ${esc(list)}" style="margin:10px 0 0">
      <div class="cap sc">Accusations, Day ${dayN}</div>
      <svg viewBox="0 0 ${W} 160" role="img" aria-label="${esc(list)}">
        <defs>${marker("vd-ah", "#17130f")}${marker("vd-ah-red", "#9e100c")}</defs>
        ${arcs}${seats}
      </svg>
      <div class="legend">Arcs run accuser → accused. Above, thin: Round A. Below, heavy: Round B.${god ? " Red: from a Werewolf." : ""}</div>
    </figure>`;
  }

  // ───────── speech ─────────
  function speechRow(st, sp, god, { reply = false } = {}) {
    const s = st.seats[sp.seat - 1];
    if (sp.skipped) {
      return `<div class="row"><div class="main"><p class="dir">${P(sp.seat)} is silent. (${sp.timedOut ? "timed out — speech skipped" : "speech skipped"})</p></div><div class="margin"></div></div>`;
    }
    const role = showRole(s, god) ? ` <span class="role ${s.role === "Werewolf" ? "wolfname" : ""}">(${esc(s.role)})</span>` : "";
    const marks = [
      ...(sp.accuse || []).map((t) => `<span class="mark" title="Accusation">→ ${P(t)}</span>`),
      ...(sp.defend || []).map((t) => `<span class="mark def" title="Defence">defends ${P(t)}</span>`),
    ].join("");
    let stamp = "";
    if (sp.claim) {
      const isTrue = s.role === sp.claim.role;
      const res = sp.claim.results?.map((r) => `${P(r.seat)} = ${r.side === "wolf" ? "Werewolf" : "Village"}`).join(", ");
      const over = god ? (isTrue ? `<span class="over">TRUE</span>` : `<span class="over">FALSE</span>`) : "";
      stamp = `<div class="stamp ${god && isTrue ? "true-stamp" : ""}" aria-label="Claim by ${P(sp.seat)}: ${esc(sp.claim.role)}${god ? (isTrue ? ", true" : ", false") : ""}">${P(sp.seat)} claims ${esc(sp.claim.role)}${res ? `<small>${esc(res)}</small>` : ""}${over}</div>`;
    }
    return `<div class="row"><div class="main"><div class="speech ${reply ? "reply" : ""}">
        <div class="who">${seatName(st, sp.seat, god)} · <span class="agent">${esc(s.label)}</span>${role}</div>
        <div class="text">${esc(sp.text)}${marks}</div>
      </div></div><div class="margin">${stamp}</div></div>`;
  }

  const STEP_LABEL = { wolf_chat: "Wolf Chat", night_action: "Night actions", speech_A: "Speech Round A", speech_B: "Speech Round B", reply: "Right of Reply", vote: "the Vote" };

  function deliberation(st, god) {
    const f = st.inflight; if (!f) return "";
    const priv = f.step === "wolf_chat" || f.step === "night_action";
    const timing = f.elapsedS ? `${f.elapsedS}s of ${f.deadlineS}s` : `deadline ${f.deadlineS}s`;
    const who = Object.entries(f.seats).map(([n, v]) => {
      if (priv && !god) return "";
      const m = v === "thinking" ? `${spinner(`${P(n)} thinking`)}${P(n)} thinking…` : v === "acted" ? `✓ ${P(n)} ready` : `<em class="red">${P(n)} timed out</em>`;
      return `<span class="who">${m}</span>`;
    }).join("");
    const what = priv ? (god ? `(${STEP_LABEL[f.step]}, ${timing})` : `(the Night, ${timing})`) : `(${STEP_LABEL[f.step]}, ${timing})`;
    return `<div class="row"><div class="main"><div class="deliberate" data-latest><span class="what">…the players deliberate ${what}</span>${who}</div></div><div class="margin"></div></div>`;
  }

  const sceneHead = (title, sub = "", margin = "") => `<div class="row scene"><div class="main"><h2>${title}</h2>${sub}</div><div class="margin">${margin}</div></div>`;
  const subHead = (title, margin = "") => `<div class="row sub-h"><div class="main"><h3>${title}</h3></div><div class="margin">${margin}</div></div>`;
  const dir = (html, cls = "") => `<div class="row"><div class="main"><p class="dir ${cls}">${html}</p></div><div class="margin"></div></div>`;

  function nightScene(st, night, god, isLast) {
    let h = sceneHead(`<span class="sc">Night</span> ${night.n}`, god && night.packLeader ? `<div class="order red">Pack Leader tonight: ${P(night.packLeader)}</div>` : `<div class="order">The village sleeps.</div>`);
    if (god) {
      if (night.wolfChat.length) {
        h += night.wolfChat.map((w) => `<div class="row"><div class="main"><p class="aside"><span class="tag">[Aside, Wolf Chat ${w.exchange}/2]</span> <span class="who">${P(w.seat)}:</span> ${esc(w.text)}</p></div><div class="margin"></div></div>`).join("");
      }
      for (const c of night.choices) {
        if (c.kind === "propose_kill") h += dir(`${P(c.seat)} proposes the kill: ${P(c.target)}.`, "priv");
        if (c.kind === "inspect") h += dir(`The Seer, ${P(c.seat)}, inspects ${P(c.target)} — ${c.result === "wolf" ? "a Werewolf" : "Village"}.`, "priv");
        if (c.kind === "protect") h += dir(`The Doctor, ${P(c.seat)}, protects ${P(c.target)}.`, "priv");
      }
      if (night.leaderPick) {
        const props = night.choices.filter((c) => c.kind === "propose_kill").map((c) => c.target);
        const split = new Set(props).size > 1;
        h += dir(split ? `The wolves disagree. Pack Leader ${P(night.leaderPick.leader)} decides: ${P(night.leaderPick.target)}.` : `The wolves agree on ${P(night.leaderPick.target)}.`, "priv");
      }
      if (night.saved) h += dir(`The wolves strike at ${P(night.saved)} — but the Doctor's protection holds.`, "priv");
    }
    for (const t of st.timeouts.filter((t) => t.phase === "night" && t.n === night.n)) {
      if (god) h += dir(`${P(t.seat)} does not act. (timed out — no night action)`);
    }
    if (night.killed === null) h += dir(`Dawn. No one has died.`, "death");
    else if (night.killed) {
      const s = st.seats[night.killed - 1];
      h += dir(`Dawn. ${P(s.seat)} (${esc(s.label)}) is found dead. They were ${s.role === "Werewolf" ? `<span class="red">a Werewolf</span>` : `the ${esc(s.role)}`}.`.replace("the Villager", "a Villager"), "death");
    }
    if (isLast) h += deliberation(st, god);
    return h;
  }

  function dayScene(st, day, god, isLast) {
    const order = day.order.map(P).join(" · ");
    let h = sceneHead(`<span class="sc">Day</span> ${day.n}`, `<div class="order">Speaking order from ${P(day.order[0])}: ${order}</div>`, accDiagram(st, day.n, god));
    const rendered = new Set();
    for (const r of ["A", "B"]) {
      if (!day.rounds[r]) continue;
      rendered.add(`speech_${r}`);
      h += subHead(`Day ${day.n} — Round ${r}`);
      h += day.rounds[r].map((sp) => speechRow(st, sp, god)).join("");
    }
    if (day.repliers || day.replies.length) {
      rendered.add("reply");
      const rep = day.repliers;
      h += subHead("Right of Reply");
      if (rep) h += dir(`The most-accused take the floor. Repliers: ${rep.seats.map((n) => `${P(n)} (score ${rep.scores[n]})`).join(", ")}. <span style="font-style:normal">Round A counts once, Round B twice.</span>`);
      h += day.replies.map((r) => speechRow(st, { seat: r.seat, text: r.text, accuse: [], defend: [] }, god, { reply: true })).join("");
    }
    if (day.ballots) {
      rendered.add("vote");
      h += subHead("The Vote");
      const rows = day.ballots.map((b) => {
        const s = st.seats[b.seat - 1];
        const vote = b.timedOut ? "Abstain (timed out)" : b.target === "abstain" ? "Abstain" : P(b.target);
        const abst = b.target === "abstain";
        const reason = b.timedOut ? "— no ballot —" : esc(b.reason);
        const role = god ? ` <span class="${s.role === "Werewolf" ? "wolfname" : ""}" style="font-style:italic;font-size:17px">${esc(s.role)}</span>` : "";
        return `<tr class="${abst ? "abst" : ""}"><td>${seatName(st, b.seat, god)} <span style="font-size:17px">${esc(s.label)}</span>${role}</td><td class="vote">${vote}</td><td class="reason">${reason}</td></tr>`;
      }).join("");
      const tally = {};
      for (const b of day.ballots) { const k = b.target === "abstain" ? "Abstain" : P(b.target); tally[k] = (tally[k] || 0) + 1; }
      const tallyTxt = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ");
      h += `<div class="row"><div class="main"><table class="ballot"><thead><tr><th>Voter</th><th>Vote</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="tally sc">Tally: ${tallyTxt}</div></div><div class="margin"></div></div>`;
      if (day.eliminated) {
        const s = st.seats[day.eliminated - 1];
        const wasWolf = s.role === "Werewolf";
        h += `<div class="row"><div class="main"><p class="result">${P(s.seat)} (${esc(s.label)}) is eliminated. They were ${wasWolf ? `<span class="red">a Werewolf</span>` : s.role === "Villager" ? "a Villager" : `the ${esc(s.role)}`}.</p></div><div class="margin"></div></div>`;
      } else if (day.eliminated === null) {
        h += dir("The vote is tied or all abstain. No one is eliminated.", "death");
      }
    }
    if (isLast && st.inflight) {
      const step = st.inflight.step;
      if (!rendered.has(step)) {
        if (step === "speech_A" || step === "speech_B") h += subHead(`Day ${day.n} — Round ${step.slice(-1)}`);
        if (step === "reply" && !rendered.has("reply")) h += subHead("Right of Reply");
        if (step === "vote") h += subHead("The Vote");
      }
      h += deliberation(st, god);
    }
    return h;
  }

  // ───────── personae ─────────
  function personae(st, ctx) {
    const god = ctx.godView;
    const items = st.seats.map((s) => {
      const wolf = showRole(s, god) && s.role === "Werewolf";
      const claim = st.claims[s.seat];
      const ts = st.tableSuspicion[s.seat];
      const role = showRole(s, god) ? `<span class="role ${wolf ? "wolf" : ""}">${esc(s.role)}</span>` : "";
      const status = s.alive ? "" : `<span>† ${esc(s.diedAt)}</span>`;
      const tos = st.timeouts.filter((t) => t.seat === s.seat).length;
      const claimHtml = claim ? `<span class="claim sc ${god && !claim.true ? "red" : ""}">${claimText(claim)}${god && !claim.true ? " — a lie" : ""}</span>` : "";
      const tsHtml = god && ts != null && s.alive ? `<div class="ts"><span class="sc">Table Suspicion</span><span class="bar" role="img" aria-label="${Math.round(ts * 100)}%"><i class="${wolf ? "wolf" : ""}" style="width:${Math.round(ts * 100)}%"></i></span><b>${Math.round(ts * 100)}%</b></div>` : "";
      return `<li>
        <span class="num ${wolf ? "wolf" : ""}">${s.seat}.</span>
        <div>
          <div class="nm ${s.alive ? "" : "dead"} ${wolf ? "wolf" : ""}">${esc(s.label)}</div>
          <div class="line2">${role}${status}${turnMarker(st, s.seat)}${tos ? `<em>${tos} timeout${tos > 1 ? "s" : ""}</em>` : ""}</div>
          ${claimHtml ? `<div class="line2">${claimHtml}</div>` : ""}
          ${tsHtml}
        </div>
      </li>`;
    }).join("");
    return `<aside class="personae" aria-label="Dramatis Personae">
      <button class="back" type="button" data-back>← Front page</button>
      <h2 class="sc">Dramatis Personae</h2>
      ${god ? `<p class="ts-note">God View: roles shown. Table Suspicion is what the table says, not the truth.</p>` : `<p class="ts-note">Public view: only revealed roles.</p>`}
      <ol class="pers">${items}</ol>
    </aside>`;
  }

  function renderMatch(root, ctx) {
    const st = ctx.state, god = ctx.godView;
    if (!st.seats.length) { root.innerHTML = `<div class="fp"><h1 data-focus tabindex="-1">The Match is being set up…</h1></div>`; return; }
    let body = "";
    const nMax = Math.max(st.nights.length, st.days.length);
    const scenes = [];
    for (let i = 0; i < nMax; i++) {
      if (st.nights[i]) scenes.push(["n", st.nights[i]]);
      if (st.days[i]) scenes.push(["d", st.days[i]]);
    }
    scenes.forEach(([k, sc], i) => {
      const last = i === scenes.length - 1;
      body += k === "n" ? nightScene(st, sc, god, last) : dayScene(st, sc, god, last);
    });
    if (!scenes.length && st.inflight) body += deliberation(st, god);
    const step = st.stepLabel ? ` — ${st.stepLabel}` : "";
    root.innerHTML = `<div class="mv">
      ${personae(st, ctx)}
      <article class="script">
        <header class="title-block">
          <div><h1 data-focus tabindex="-1">Match ${esc(st.matchId)}</h1>
            <div class="sub">A Werewolf Match in ${st.nights.length + st.days.length || 1} scenes, for ${st.seats.length} Players · seed ${esc(st.seed)}${god ? " · <b>God View</b>" : ""}</div></div>
          <div class="now"><span class="sc">Now playing</span><b>${esc(st.phaseLabel)}${esc(step)}</b>${st.alive.length} of ${st.seats.length} alive</div>
        </header>
        ${body}
        ${st.cursor >= st.total ? "" : ""}
      </article>
    </div>`;
    root.querySelector("[data-back]").onclick = () => ctx.toGrid();
    const latest = root.querySelector("[data-latest]") || [...root.querySelectorAll(".row")].pop();
    // Jump instantly when (re)entering the Match; glide while watching it live.
    const key = `${st.matchId}`; const fresh = key !== lastKey; lastKey = key;
    if (latest) requestAnimationFrame(() => latest.scrollIntoView({ block: "end", behavior: fresh || reduceMotion() ? "instant" : "smooth" }));
  }

  // ───────── front page ─────────
  function headline(t) {
    if (t.phase === "over") return t.winner === "village" ? "VILLAGE TRIUMPHS" : "WEREWOLVES TAKE THE TABLE";
    if (t.phase === "night") return t.n === 1 ? "Night Falls on a Fresh Table" : `Wolves Stalk the Survivors as Night ${t.n} Falls`;
    if (t.phase === "setup") return "A New Match Is Dealt";
    if (/vote/i.test(t.step)) return `The Table Votes on Day ${t.n}`;
    if (/reply/i.test(t.step)) return `The Accused Answer Back on Day ${t.n}`;
    return `Day ${t.n} Debate Under Way`;
  }
  function story(t, god, lead) {
    const phase = t.phase === "over" ? `Final — after ${t.n} cycles` : `${t.phase === "night" ? "Night" : t.phase === "day" ? "Day" : "Setup"} ${t.n || ""}${t.step ? ", " + t.step : ""}`;
    const roster = Array.from({ length: t.seats }, (_, i) => {
      const n = i + 1, alive = t.alive.includes(n), role = t.roles?.[i];
      const showR = god || !alive;
      const wolf = showR && role === "Werewolf";
      return `<span class="p ${alive ? "" : "dead"} ${wolf ? "wolf" : ""}">${alive ? "" : "†"}${P(n)}${showR && role ? ` ${esc(role)}` : ""}</span>`;
    }).join(" ");
    const pull = t.latestLine ? `<blockquote class="pull">“${esc(t.latestLine.text)}”<cite>— ${P(t.latestLine.seat)}, ${esc(t.latestLine.label)}</cite></blockquote>` : `<p class="meta">No one has spoken yet.</p>`;
    const meta = [
      `<b>${t.alive.length} of ${t.seats}</b> remain`,
      t.thinking ? `${t.thinking} player${t.thinking > 1 ? "s" : ""} deliberating…` : "",
      t.timeouts ? `${t.timeouts} timeout${t.timeouts > 1 ? "s" : ""}` : "",
    ].filter(Boolean).join(" · ");
    const h = `<div class="dateline sc">Match ${esc(t.matchId)} — ${esc(phase)}${lead ? " · <span class='red'>Lead story</span>" : ""}</div>
      <h2><a href="?variant=D&view=match" data-open>${esc(headline(t))}</a></h2>`;
    const rosterHtml = `<div class="roster sc">${roster}</div><p class="meta">${meta}</p>`;
    if (lead) return `<article class="story lead"><div class="lead-l">${h}${rosterHtml}</div><div>${pull}</div></article>`;
    return `<article class="story">${h}${pull}${rosterHtml}</article>`;
  }
  function renderGrid(root, ctx) {
    const tiles = ctx.tiles;
    const lead = tiles.find((t) => t.featured) || tiles[0];
    const rest = tiles.filter((t) => t !== lead);
    const live = tiles.filter((t) => t.phase !== "over").length;
    lastKey = null;
    root.innerHTML = `<div class="fp">
      <header class="masthead">
        <div class="ears"><span class="sc">Saturday, 21 November 2026</span><span class="sc">${live} Matches live · ${ctx.godView ? "God View edition" : "Public edition"}</span></div>
        <h1 data-focus tabindex="-1">The Werewolf League Gazette <span class="live">· LIVE</span></h1>
        <div class="strap">All the lies that are fit to print. Click any story to read the full script.</div>
      </header>
      <section class="stories">${story(lead, ctx.godView, true)}${rest.map((t) => story(t, ctx.godView, false)).join("")}</section>
    </div>`;
    root.querySelectorAll("[data-open]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); ctx.openMatch(); }));
  }

  window.VARIANTS.push({
    key: "D", name: "Play script", css,
    render(root, ctx) { ctx.view === "match" ? renderMatch(root, ctx) : renderGrid(root, ctx); },
  });
})();
