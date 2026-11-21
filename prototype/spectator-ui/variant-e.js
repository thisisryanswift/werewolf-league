// PROTOTYPE — Variant E: dense neo-brutalist grid sorted by drama, Match view as a <dialog> modal.
// Drama % and flags are FAKE here; in the real thing they'd come from a gemini-decision-1
// score / yes-no pass over each Match's public log.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const BAR = document.getElementById("proto-bar"); // prototype switcher; moved into the modal while open so it stays clickable
  const ui = { sort: "drama", show: "all" };
  let dlg = null, quiet = false, cur = null;

  // ── Fake Matches (deterministic) ──────────────────────────────────────────
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const LINES = [
    "P3 has defended the same seat three times now.", "I'm the Seer. P5 came back village.", "Nobody claims anything? Then I'm voting the quietest seat.",
    "That counterclaim came way too late.", "P1, explain your Night 1 vote.", "I trust P6's read. P2 is dodging.", "Two Doctors? One of you is lying.",
    "I'll abstain until someone gives me a reason.", "P4 flipped their vote at the last second. Why?", "The wolves left P7 alive on purpose.",
  ];
  const FLAGS = ["Claim war", "Close vote", "Wolf fooling the table", "Seer eliminated", "Doctor save", "Village eliminated a villager", "Timeout streak"];
  const AGENTS = ["Hydrogen", "3.8 Flash", "3.6 Flash", "3.5 Flash-Lite"];
  let GEN = null;
  function generated() {
    if (GEN) return GEN;
    const r = rng(0x417), pick = (a) => a[Math.floor(r() * a.length)];
    const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    GEN = [];
    for (let i = 0; i < 30; i++) {
      const seats = r() < 0.55 ? 8 : 7;
      const roles = shuffle(["Werewolf", "Werewolf", "Seer", "Doctor", ...Array(seats - 4).fill("Villager")]);
      const wolves = roles.map((x, k) => (x === "Werewolf" ? k : -1)).filter((k) => k >= 0);
      const village = roles.map((x, k) => (x !== "Werewolf" ? k : -1)).filter((k) => k >= 0);
      let phase, n, step, winner = null, dead = new Set();
      if (i === 6 || i === 17 || i === 25) {
        phase = "over"; n = 3 + Math.floor(r() * 3); winner = i === 17 ? "wolf" : "village";
        step = winner === "village" ? "Village wins" : "Wolves win";
        if (winner === "village") { wolves.forEach((k) => dead.add(k)); shuffle(village).slice(0, 2).forEach((k) => dead.add(k)); }
        else { shuffle(village).slice(0, village.length - 2).forEach((k) => dead.add(k)); }
      } else {
        phase = r() < 0.35 ? "night" : "day"; n = 1 + Math.floor(r() * 3);
        step = phase === "night" ? pick(["Wolf Chat", "Night actions"]) : pick(["Speech Round A", "Speech Round B", "Right of Reply", "Vote", "Vote"]);
        let want = Math.min((n - 1) * 2 + (phase === "day" ? 1 : 0), seats - 4);
        for (const k of shuffle([...Array(seats).keys()])) {
          if (dead.size >= want) break;
          dead.add(k);
          const wA = wolves.filter((w) => !dead.has(w)).length, vA = seats - dead.size - wA;
          if (wA === 0 || wA >= vA) dead.delete(k);
        }
      }
      const alive = [...Array(seats).keys()].filter((k) => !dead.has(k)).map((k) => k + 1);
      const drama = Math.round(5 + r() * 80);
      const flags = drama > 62 ? shuffle(FLAGS).slice(0, 1 + Math.floor(r() * 2)) : r() < 0.12 ? [pick(FLAGS)] : [];
      const speaker = pick(alive);
      GEN.push({
        matchId: `m-0${370 + i}`, phase, n, step, seats, alive, roles, winner, drama, flags,
        latestLine: phase === "night" && n === 1 ? null : { seat: speaker, label: `${pick(AGENTS)} #${1 + Math.floor(r() * 2)}`, text: pick(LINES) },
        thinking: phase === "over" ? 0 : 1 + Math.floor(r() * alive.length),
        timeouts: r() < 0.25 ? 1 + Math.floor(r() * 2) : 0,
      });
    }
    return GEN;
  }
  const META = {
    "m-0417": { drama: 92, flags: ["Claim war", "Seer eliminated", "Wolf fooling the table"] },
    "m-0414": { drama: 74, flags: ["Wolf fooling the table"] }, "m-0415": { drama: 81, flags: ["Claim war", "Close vote"] },
    "m-0416": { drama: 38, flags: [] }, "m-0412": { drama: 66, flags: ["Seer eliminated"] }, "m-0418": { drama: 9, flags: [] },
  };
  const allTiles = (ctx) => [...ctx.tiles.map((t) => ({ ...t, ...(META[t.matchId] || { drama: 20, flags: [] }) })), ...generated()];

  // ── Small helpers ─────────────────────────────────────────────────────────
  const phaseIcon = (p) => (p === "night" ? "☾" : p === "day" ? "☀" : p === "over" ? "■" : "◆");
  const phaseText = (t) => (t.phase === "over" ? "FINAL" : t.phase === "setup" ? "SETUP" : `${phaseIcon(t.phase)} ${t.phase === "night" ? "NIGHT" : "DAY"} ${t.n}`);
  function stepTag(t) {
    if (t.phase === "over") return `ENDED · ${t.winner === "wolf" ? "WOLVES" : "VILLAGE"}`;
    if (t.phase === "night") return "NIGHT";
    return ({ "Vote": "VOTE", "Speech Round A": "SPEECH A", "Speech Round B": "SPEECH B", "Right of Reply": "REPLY" })[t.step] || (t.step || "SETUP").toUpperCase();
  }
  const isVoting = (t) => t.step === "Vote";
  function pips(t, god) {
    return t.roles.map((ro, i) => {
      const s = i + 1, dead = !t.alive.includes(s), wolf = god && ro === "Werewolf";
      return `<span class="pip${dead ? " dead" : ""}${wolf ? " wolf" : ""}" title="P${s}${god ? " · " + ro : ""}${dead ? " · dead" : ""}">${dead ? "✕" : wolf ? "W" : ""}</span>`;
    }).join("");
  }
  const spin = (label) => `<progress class="spin" aria-label="${esc(label)}"></progress>`;

  // ── Grid ──────────────────────────────────────────────────────────────────
  function tileHTML(t, god, big) {
    const flagSticker = t.flags.length ? `<span class="sticker" title="gemini-decision-1 flags: ${esc(t.flags.join(" · "))}">⚑ DECISIONS</span>` : "";
    const cls = ["tile", t.flags.length ? "flagged" : "", big ? "big" : "", t.phase === "night" ? "night" : "", t.phase === "over" ? "over" : "", big && t.phase !== "night" ? "hot" : "", t.featured ? "featured" : ""].join(" ");
    return `<button type="button" class="${cls}" data-id="${esc(t.matchId)}" aria-label="Open Match ${esc(t.matchId)}">
      ${flagSticker}
      <span class="t-top"><span class="t-id">${esc(t.matchId.toUpperCase())}</span><span class="t-phase">${phaseText(t)}</span></span>
      <span class="t-pa"><span class="pips">${pips(t, god)}</span><span class="t-alive">${t.alive.length}/${t.seats} alive${t.timeouts ? ` · ⏱${t.timeouts}` : ""}</span></span>
      <span class="t-drama"><span class="dbar"><i style="width:${t.drama}%"></i></span><span class="dpct">${t.drama}% drama</span></span>
      ${big && t.flags.length ? `<span class="t-flags">${t.flags.map((f) => `<span>⚑ ${esc(f)}</span>`).join("")}</span>` : ""}
      ${big ? `<span class="t-line">${t.latestLine ? `<b>P${t.latestLine.seat} · ${esc(t.latestLine.label)}</b> “${esc(t.latestLine.text)}”` : "<i>No speeches yet.</i>"}</span>` : ""}
      <span class="t-foot"><span class="tag${isVoting(t) ? " vote" : ""}${t.phase === "over" ? " end" : ""}">${esc(stepTag(t))}</span>${t.thinking ? `<span class="think">${spin(`${t.thinking} thinking`)}×${t.thinking}</span>` : ""}</span>
    </button>`;
  }

  function renderGrid(root, ctx, inert) {
    const god = ctx.godView;
    let tiles = allTiles(ctx);
    const live = tiles.filter((t) => t.phase !== "over").length;
    const sorters = { drama: (a, b) => b.drama - a.drama, alive: (a, b) => a.alive.length - b.alive.length || b.drama - a.drama, num: (a, b) => a.matchId.localeCompare(b.matchId) };
    tiles.sort(sorters[ui.sort]);
    const filters = { all: () => true, flagged: (t) => t.flags.length > 0, voting: isVoting, night: (t) => t.phase === "night" };
    tiles = tiles.filter(filters[ui.show]);
    const btn = (group, key, label) => `<button type="button" class="chip${ui[group] === key ? " on" : ""}" data-${group}="${key}" aria-pressed="${ui[group] === key}">${label}</button>`;
    const board = [["Hydrogen", 1268], ["3.8 Flash", 1241], ["3.6 Flash", 1213], ["3.5 Flash-Lite", 1179]];
    root.innerHTML = `
      <header class="hdr">
        <div class="row">
          <h1 ${inert ? "" : 'data-focus tabindex="-1"'}>WEREWOLF LEAGUE</h1>
          <span class="count"><b>${live}</b> Matches live</span>
          <span class="count"><b>${(1284 + tiles.length - live).toLocaleString()}</b> finished</span>
          <ol class="board" aria-label="Top Agents by Overall Rating">${board.map(([a, r], i) => `<li class="${i === 0 ? "first" : ""}">${i + 1} ${esc(a)} <b>${r}</b></li>`).join("")}</ol>
          <span class="god${god ? " on" : ""}">${god ? "◉ GOD VIEW ON" : "○ GOD VIEW OFF"}</span>
        </div>
        <div class="row ctrls">
          <span class="lbl">SORT</span>${btn("sort", "drama", "DRAMA")}${btn("sort", "alive", "ALIVE")}${btn("sort", "num", "#")}
          <span class="lbl">SHOW</span>${btn("show", "all", "ALL")}${btn("show", "flagged", "⚑ FLAGGED")}${btn("show", "voting", "VOTING")}${btn("show", "night", "NIGHT")}
          <span class="note">Drama % and ⚑ flags: <code>gemini-decision-1</code> over each Match's public log</span>
        </div>
      </header>
      <section class="grid" aria-label="Live Matches">${tiles.map((t, i) => tileHTML(t, god, i < 3)).join("") || '<p class="empty">No Matches match this filter.</p>'}</section>`;
    root.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => { ui.sort = b.dataset.sort; render(root, ctx); }));
    root.querySelectorAll("[data-show]").forEach((b) => (b.onclick = () => { ui.show = b.dataset.show; render(root, ctx); }));
    root.querySelectorAll(".tile").forEach((b) => (b.onclick = () => ctx.openMatch()));
  }

  // ── Match modal ───────────────────────────────────────────────────────────
  const roleIcon = { Werewolf: "🐺", Seer: "👁", Doctor: "✚", Villager: "⌂" };
  const P = (st, n) => st.seats[n - 1];
  const claimText = (c) => `CLAIMS ${c.role.toUpperCase()}${c.results?.length ? ": " + c.results.map((r) => `P${r.seat} ${r.side.toUpperCase()}`).join(", ") : ""}`;

  function seatRow(st, s, god) {
    const inf = st.inflight?.seats?.[s.seat];
    const marker = !s.alive ? "" : inf === "thinking" ? `<span class="turn">${spin(`P${s.seat} thinking`)}thinking…</span>`
      : inf === "acted" ? `<span class="turn ok">✓ acted</span>` : inf === "timedout" ? `<span class="turn to">⏱ TIMED OUT</span>` : "";
    const c = st.claims[s.seat];
    const ts = st.tableSuspicion[s.seat];
    const touts = st.timeouts.filter((x) => x.seat === s.seat).length;
    return `<li class="seat${s.alive ? "" : " dead"}${god && s.role === "Werewolf" ? " wolf" : ""}" data-seat="${s.seat}">
      <span class="num">P${s.seat}</span>
      <span class="who">
        <span class="name">${esc(s.label)}${god && s.alive ? ` <span class="role ${s.side}">${roleIcon[s.role]} ${s.role.toUpperCase()}</span>` : ""}</span>
        <span class="meta"><span class="status">${s.alive ? "ALIVE" : `✕ DEAD · ${esc(s.diedAt)} · <b>${s.role.toUpperCase()}</b>`}${touts ? ` · ⏱ ${touts}` : ""}</span>
        ${god && ts != null ? `<span class="susp" title="Table Suspicion: the table's mean stated P(werewolf)"><span class="sbar"><i style="width:${Math.round(ts * 100)}%"></i></span><span>${Math.round(ts * 100)}% suspicion</span></span>` : ""}</span>
        ${c ? `<span class="claim">${esc(claimText(c))}${god ? ` <b class="${c.true ? "true" : "lie"}">${c.true ? "TRUE" : "LIE"}</b>` : ""}</span>` : ""}
      </span>
      ${marker}
    </li>`;
  }

  function tallyHTML(st) {
    if (st.inflight?.step === "vote") {
      const seats = Object.entries(st.inflight.seats);
      return `<div class="tally"><h3>VOTE IN PROGRESS · DAY ${st.n} — ${seats.filter(([, v]) => v !== "thinking").length}/${seats.length} in</h3><p class="muted">Ballots publish together when the vote resolves.</p></div>`;
    }
    const day = [...st.days].reverse().find((d) => d.ballots);
    if (!day) return `<div class="tally"><h3>VOTE</h3><p class="muted">No vote yet — the tally appears when a Day's vote resolves.</p></div>`;
    const counts = {};
    for (const b of day.ballots) counts[b.target] = (counts[b.target] || 0) + 1;
    const targets = [...new Set(day.ballots.map((b) => b.seat).concat(day.ballots.map((b) => b.target).filter((x) => x !== "abstain")))].sort((a, b) => a - b);
    const box = (k, label) => `<span class="box${counts[k] ? " hit" : ""}${day.eliminated === k ? " out" : ""}"><b>${counts[k] || ""}</b><span>${label}</span>${day.eliminated === k ? "<em>OUT</em>" : ""}</span>`;
    const elim = day.eliminated ? `P${day.eliminated} ELIMINATED (${P(st, day.eliminated).role})` : "NO ELIMINATION";
    return `<div class="tally"><h3>VOTE · DAY ${day.n} — ${elim}</h3><div class="boxes">${targets.map((t) => box(t, `P${t}`)).join("")}${box("abstain", "ABSTAIN")}</div></div>`;
  }

  function feedHTML(st, god) {
    const rows = [];
    const add = (cls, html) => rows.push(`<li class="${cls}">${html}</li>`);
    const g = (html) => god && add("godrow", `<span class="gv">GOD VIEW</span> ${html}`);
    const lab = (n) => `P${n} <span class="ag">${esc(P(st, n).label)}</span>`;
    const maxN = Math.max(st.nights.length ? st.nights[st.nights.length - 1].n : 0, st.days.length ? st.days[st.days.length - 1].n : 0);
    if (st.seats.length) add("info", `MATCH STARTED · ${st.seats.length} seats · seed ${esc(st.seed)}`);
    for (let n = 1; n <= maxN; n++) {
      const night = st.nights.find((x) => x.n === n);
      if (night) {
        add("hdr", `☾ NIGHT ${n}${god ? ` <span class="sub">Pack Leader P${night.packLeader}</span>` : ""}`);
        for (const w of night.wolfChat) g(`🐺 Wolf Chat · <b>P${w.seat}</b>: ${esc(w.text)}`);
        for (const c of night.choices) {
          if (c.kind === "propose_kill") g(`P${c.seat} proposes the kill → P${c.target}`);
          if (c.kind === "inspect") g(`👁 Seer P${c.seat} inspects P${c.target} → <b>${c.result.toUpperCase()}</b>`);
          if (c.kind === "protect") g(`✚ Doctor P${c.seat} protects P${c.target}`);
        }
        if (night.leaderPick) g(`Pack Leader P${night.leaderPick.leader} decides: kill P${night.leaderPick.target}`);
        if (night.saved) g(`✚ The Doctor's protection holds — P${night.saved} survives`);
        if (night.killed) add("death", `✕ ${lab(night.killed)} was killed in the Night — <b>${P(st, night.killed).role.toUpperCase()}</b>`);
        else if (night.killed === null) add("info", `DAWN — DAY ${n} · no one died`);
      }
      const day = st.days.find((x) => x.n === n);
      if (!day) continue;
      add("hdr", `☀ DAY ${n} <span class="sub">speaking order from P${day.order[0]}: ${day.order.map((s) => "P" + s).join(" · ")}</span>`);
      for (const r of ["A", "B"]) {
        const sp = day.rounds[r];
        if (!sp) continue;
        add("sub", `ROUND ${r}${r === "B" ? " · having seen Round A" : ""}`);
        for (const s of [...sp].sort((a, b) => day.order.indexOf(a.seat) - day.order.indexOf(b.seat))) {
          if (s.skipped) { add("skip", `⏱ ${lab(s.seat)} — speech skipped (timed out)`); continue; }
          const c = s.claim ? st.claims[s.seat] : null;
          const chips = [
            ...s.accuse.map((t) => `<span class="ch acc">→P${t}</span>`),
            ...s.defend.map((t) => `<span class="ch def">♡P${t}</span>`),
            s.claim ? `<span class="ch clm">${esc(claimText(s.claim))}${god && c ? ` · ${st.seats[s.seat - 1].role === s.claim.role ? "TRUE" : "LIE"}` : ""}</span>` : "",
          ].join("");
          add("speech", `<b>${lab(s.seat)}</b> ${esc(s.text)} ${chips}`);
        }
      }
      if (day.repliers) {
        add("sub", `RIGHT OF REPLY · Repliers ${day.repliers.seats.map((s) => `P${s} (${day.repliers.scores[s]} pts)`).join(" · ")}`);
        for (const r of day.replies) add("speech reply", `<b>${lab(r.seat)}</b> ${esc(r.text)}`);
      }
      if (day.ballots) {
        add("sub", "VOTE");
        for (const b of day.ballots) {
          if (b.timedOut) add("skip", `⏱ ${lab(b.seat)} → ABSTAIN (timed out) · no ballot`);
          else add("ballot", `<b>P${b.seat}</b> → <b>${b.target === "abstain" ? "ABSTAIN" : "P" + b.target}</b> · ${esc(b.reason)}`);
        }
        if (day.eliminated) add("death", `✕ ${lab(day.eliminated)} ELIMINATED — <b>${P(st, day.eliminated).role.toUpperCase()}</b>`);
        else add("info", "No elimination (tie or all Abstain)");
      }
    }
    if (st.inflight) {
      const e = Object.entries(st.inflight.seats);
      const ready = e.filter(([, v]) => v !== "thinking").length;
      const night = st.inflight.step === "wolf_chat" || st.inflight.step === "night_action";
      const label = night && !god ? "Night — the village sleeps" : st.stepLabel;
      add("live", `<b>${esc(label)} — ${ready}/${e.length} ready</b> <span class="muted">${st.inflight.elapsedS}s / ${st.inflight.deadlineS}s</span>
        <span class="marks">${e.map(([s, v]) => `<span class="mk ${v}">P${s} ${v === "thinking" ? spin(`P${s} thinking`) : v === "acted" ? "✓" : "⏱"}</span>`).join("")}</span>`);
    }
    return rows.join("");
  }

  function modalHTML(st, god) {
    const m = META["m-0417"];
    const inf = st.inflight;
    return `
      <header class="mh">
        <h2 id="vE-mtitle" data-focus tabindex="-1" autofocus>MATCH ${esc((st.matchId || "m-0417").toUpperCase())}</h2>
        <span class="chip2">${st.phase === "night" ? "☾" : st.phase === "day" ? "☀" : "◆"} ${esc(st.phaseLabel.toUpperCase())}</span>
        <span class="chip2">${inf ? `${esc(st.stepLabel.toUpperCase())} · ${inf.elapsedS}s/${inf.deadlineS}s` : "BETWEEN STEPS"}</span>
        <span class="chip2">${st.alive.length}/${st.seats.length} ALIVE</span>
        <button type="button" class="close">✕ CLOSE [ESC]</button>
        <span class="mh2"><span class="chip2 drama">DRAMA ${m.drama}%</span>
        ${m.flags.map((f) => `<span class="flag2" title="gemini-decision-1 flag">⚑ ${esc(f)}</span>`).join("")}
        <span class="src">drama + flags: <code>gemini-decision-1</code> over the public log</span></span>
      </header>
      <div class="mbody">
        <section class="left" aria-label="Players">
          <div class="acclbl"></div>
          <div class="seatwrap"><svg class="gutter" aria-hidden="true"></svg><ol class="seats">${st.seats.map((s) => seatRow(st, s, god)).join("")}</ol></div>
          ${god ? "" : '<p class="muted pub">God View off — living roles, Wolf Chat, Night choices and Table Suspicion hidden.</p>'}
        </section>
        <section class="right" aria-label="Match log">
          ${tallyHTML(st)}
          <ol class="feed">${feedHTML(st, god)}</ol>
        </section>
      </div>`;
  }

  function drawArcs(content, st) {
    const svg = content.querySelector(".gutter"), wrap = content.querySelector(".seatwrap"), lbl = content.querySelector(".acclbl");
    const day = [...st.days].reverse().find((d) => st.accusations.some((a) => a.day === d.n));
    if (!day) { lbl.textContent = "ACCUSATIONS · none yet"; return; }
    const accs = st.accusations.filter((a) => a.day === day.n);
    lbl.innerHTML = `ACCUSATIONS · DAY ${day.n}${day.n !== st.n || st.phase !== "day" ? " (latest)" : ""} <span class="k a">┄ ROUND A</span> <span class="k b">━ ROUND B</span>`;
    const wr = wrap.getBoundingClientRect();
    const y = {};
    wrap.querySelectorAll(".seat").forEach((li) => { const r = li.getBoundingClientRect(); y[li.dataset.seat] = r.top - wr.top + r.height / 2; });
    const W = 64, x0 = W - 4;
    svg.setAttribute("viewBox", `0 0 ${W} ${wr.height}`);
    svg.setAttribute("width", W); svg.setAttribute("height", wr.height);
    const off = {};
    const paths = accs.map((a) => {
      const y1 = y[a.from], y2 = y[a.to];
      const k = `${a.from}-${a.to}`; off[k] = (off[k] || 0) + 1;
      const bulge = Math.min(W - 8, 14 + Math.abs(y2 - y1) * 0.09 + (a.round === "B" ? 6 : 0));
      const dy = (a.round === "A" ? -6 : 6);
      return `<path class="arc ${a.round}" d="M${x0},${y1 + dy} C${x0 - bulge},${y1 + dy} ${x0 - bulge},${y2 - dy} ${x0 - 2},${y2 - dy}" marker-end="url(#vE-ah-${a.round})"><title>P${a.from} accuses P${a.to} (Round ${a.round})</title></path>`;
    });
    svg.innerHTML = `<defs>
      <marker id="vE-ah-A" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#111"/></marker>
      <marker id="vE-ah-B" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#e8213b"/></marker>
    </defs>${paths.join("")}`;
  }

  function restoreBar() { if (BAR && BAR.parentElement !== document.body) document.body.append(BAR); }
  function closeQuietly() {
    restoreBar();
    if (dlg?.open) { quiet = true; dlg.close(); }
    dlg?.remove();
  }
  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "vE vE-dialog";
    dlg.setAttribute("closedby", "any"); // light dismiss + Esc (close requests)
    dlg.setAttribute("aria-labelledby", "vE-mtitle");
    dlg.innerHTML = '<div class="mcontent"></div>';
    dlg.addEventListener("close", () => {
      restoreBar();
      if (quiet) { quiet = false; return; }
      cur?.toGrid();
    });
    // Fallback for browsers without closedby (Safari): manual light dismiss.
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      dlg.addEventListener("click", (e) => {
        if (e.target !== dlg) return;
        const r = dlg.getBoundingClientRect();
        if (r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right) return;
        dlg.close();
      });
    }
    return dlg;
  }

  function renderMatch(root, ctx) {
    renderGrid(root, ctx, true);
    root.classList.add("dimmed");
    const d = ensureDialog();
    if (!d.isConnected) document.body.append(d);
    const content = d.querySelector(".mcontent");
    content.innerHTML = modalHTML(ctx.state, ctx.godView);
    content.querySelector(".close").onclick = () => d.close();
    if (!d.open) d.showModal();
    if (BAR && BAR.parentElement !== d) d.append(BAR); // keep the prototype bar usable above the modal
    drawArcs(content, ctx.state);
    const feed = content.querySelector(".feed");
    feed.scrollTop = feed.scrollHeight;
  }

  function render(root, ctx) {
    cur = ctx;
    if (ctx.view === "match") renderMatch(root, ctx);
    else { closeQuietly(); renderGrid(root, ctx, false); }
  }

  // Leaving variant E while the modal is open: close it and give the switcher its bar back.
  new MutationObserver(() => {
    const b = document.body.dataset;
    if (!(b.variant === "E" && b.view === "match")) closeQuietly();
  }).observe(document.body, { attributes: true, attributeFilter: ["data-variant", "data-view"] });

  const css = `
  body[data-variant="E"] { background: #fff4d6; }
  .vE { --pink: #ff8de6; --cream: #fff4d6; --yellow: #ffe600; --lilac: #d9c2ff; --teal: #1d9a8a; --red: #e8213b; --ink: #111;
    font-family: "Space Grotesk", "Helvetica Neue", Arial, "Liberation Sans", sans-serif; color: var(--ink); }
  .vE code, .vE .t-id, .vE .lbl, .vE .tag, .vE .t-alive, .vE .dpct { font-family: ui-monospace, "JetBrains Mono", "DejaVu Sans Mono", monospace; }
  .vE.dimmed .grid, .vE.dimmed .hdr { filter: saturate(.6); }

  /* header */
  .vE .hdr { background: var(--pink); border-bottom: 4px solid var(--ink); padding: 12px 20px 10px; display: grid; gap: 8px; }
  .vE .hdr .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .vE h1 { margin: 0 8px 0 0; font-size: 30px; font-weight: 900; letter-spacing: -.5px; }
  .vE h1:focus { outline: none; }
  .vE .count { background: #fff; border: 3px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); padding: 3px 10px; font-size: 15px; }
  .vE .count b { font-size: 20px; }
  .vE .board { display: flex; gap: 8px; list-style: none; margin: 0 0 0 10px; padding: 0; }
  .vE .board li { background: #fff; border: 3px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); padding: 3px 8px; font-size: 14px; font-weight: 700; }
  .vE .board li.first { background: var(--yellow); }
  .vE .god { margin-left: auto; border: 3px solid var(--ink); padding: 3px 10px; font-weight: 800; font-size: 14px; background: #fff; }
  .vE .god.on { background: var(--ink); color: var(--yellow); }
  .vE .lbl { font-size: 12px; font-weight: 700; margin-left: 6px; }
  .vE .chip { font: 800 13px/1 inherit; font-family: inherit; background: #fff; border: 3px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); padding: 5px 10px; cursor: pointer; }
  .vE .chip.on { background: var(--yellow); }
  .vE .chip:focus-visible, .vE .tile:focus-visible, .vE .close:focus-visible { outline: 3px solid var(--red); outline-offset: 2px; }
  .vE .note { margin-left: auto; font-size: 13px; }

  /* grid */
  .vE .grid { display: grid; grid-template-columns: repeat(8, 1fr); grid-auto-rows: 158px; grid-auto-flow: dense; gap: 14px 16px; padding: 16px 22px 90px; }
  .vE .tile { position: relative; display: flex; flex-direction: column; gap: 5px; text-align: left; font: inherit; color: inherit; cursor: pointer;
    background: #fff; border: 4px solid var(--ink); box-shadow: 6px 6px 0 var(--ink); padding: 8px 10px; min-width: 0; }
  .vE .tile:hover { translate: -2px -2px; box-shadow: 8px 8px 0 var(--ink); }
  .vE .tile.big { grid-column: span 2; }
  .vE .tile.hot { background: var(--yellow); }
  .vE .tile.night { background: var(--lilac); }
  .vE .tile.over { background: #ecebe6; }
  .vE .tile.flagged { padding-top: 20px; }
  .vE .tile.flagged.big { padding-top: 7px; }
  .vE .tile.flagged.big .t-top { padding-right: 120px; }
  .vE .t-top { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .vE .t-id { font-weight: 800; font-size: 15px; }
  .vE .t-phase { font-weight: 800; font-size: 14px; white-space: nowrap; }
  .vE .tile.big .t-id { font-size: 17px; }
  .vE .tile.big .t-phase { font-size: 17px; }
  .vE .tile.big { gap: 4px; padding: 7px 10px; }
  .vE .pips { display: flex; gap: 3px; }
  .vE .pip { width: 14px; height: 14px; border: 2px solid var(--ink); background: var(--teal); display: grid; place-items: center; font: 900 10px/1 sans-serif; color: #fff; }
  .vE .pip.dead { background: #fff; color: var(--ink); }
  .vE .pip.wolf { background: var(--red); }
  .vE .pip.wolf.dead { background: #f6b3bd; color: var(--ink); }
  .vE .tile.big .pip { width: 18px; height: 18px; font-size: 12px; }
  .vE .t-alive { font-size: 12px; font-weight: 700; }
  .vE .t-drama { display: flex; align-items: center; gap: 6px; }
  .vE .dbar { flex: 1; height: 10px; border: 2px solid var(--ink); background: #fff; display: block; }
  .vE .dbar i { display: block; height: 100%; background: var(--ink); }
  .vE .tile.big .dbar i { background: var(--red); }
  .vE .tile > * { flex-shrink: 0; }
  
  .vE .dpct { font-size: 12px; white-space: nowrap; }
  .vE .t-flags { display: flex; gap: 6px; flex-wrap: wrap; }
  .vE .t-flags span { background: var(--red); color: #fff; font-weight: 800; font-size: 12px; padding: 1px 6px; border: 2px solid var(--ink); }
  .vE .t-line { font-size: 13px; line-height: 1.25; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .vE .t-pa { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
  .vE .tile:not(.big) .t-pa { flex-direction: column; align-items: flex-start; }
  .vE .t-foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .vE .tag { font-size: 12px; font-weight: 800; padding: 1px 6px; background: #fff; border: 2px solid var(--ink); }
  .vE .tag.vote { background: var(--ink); color: var(--yellow); }
  .vE .tag.end { background: var(--ink); color: #fff; }
  .vE .think { display: flex; align-items: center; gap: 3px; font-size: 12px; font-weight: 800; }
  .vE .sticker { position: absolute; top: 0; right: 0; rotate: 0deg; flex-shrink: 1; background: var(--red); color: #fff; border: 3px solid var(--ink); font-weight: 900; font-size: 11px; padding: 1px 6px; z-index: 1; }
  .vE .empty { grid-column: 1 / -1; font-size: 20px; }

  /* modal */
  .vE-dialog { width: min(1400px, 94vw); height: min(900px, 86vh); padding: 0; border: 5px solid #111; box-shadow: 10px 10px 0 #111; background: var(--pink); overflow: hidden; }
  .vE-dialog::backdrop { background: rgb(40 20 40 / .55); backdrop-filter: blur(2px); }
  .vE-dialog .mcontent { height: 100%; display: flex; flex-direction: column; }
  .vE .mh { display: flex; align-items: center; gap: 10px 10px; flex-wrap: wrap; padding: 12px 18px; border-bottom: 4px solid var(--ink); }
  .vE .mh h2 { margin: 0; font-size: 28px; font-weight: 900; background: var(--yellow); border: 4px solid var(--ink); box-shadow: 5px 5px 0 var(--ink); padding: 2px 12px; }
  .vE .mh h2:focus { outline: none; }
  .vE .chip2 { background: #fff; border: 3px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); padding: 4px 10px; font-weight: 800; font-size: 16px; }
  .vE .chip2.drama { background: var(--ink); color: var(--yellow); }
  .vE .mh2 { flex-basis: 100%; display: flex; align-items: center; gap: 10px; }
  .vE .src { font-size: 14px; }
  .vE .flag2 { background: var(--red); color: #fff; border: 3px solid var(--ink); padding: 3px 8px; font-weight: 800; font-size: 15px; rotate: -2deg; }
  .vE .close { margin-left: auto; font: 800 15px/1 inherit; font-family: inherit; background: #fff; border: 3px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); padding: 7px 12px; cursor: pointer; }
  .vE .mbody { flex: 1; min-height: 0; display: grid; grid-template-columns: 660px 1fr; gap: 20px; padding: 14px 18px 18px; }
  .vE .left { min-height: 0; overflow: auto; }
  .vE .acclbl { font: 700 14px/1.2 ui-monospace, monospace; margin: 0 0 6px; }
  .vE .acclbl .k { padding: 0 4px; border: 2px solid var(--ink); background: #fff; }
  .vE .acclbl .k.b { color: var(--red); }
  .vE .seatwrap { position: relative; padding-left: 64px; }
  .vE .gutter { position: absolute; left: 0; top: 0; overflow: visible; }
  .vE .arc { fill: none; stroke: #111; stroke-width: 2.5; stroke-dasharray: 5 4; }
  .vE .arc.B { stroke: var(--red); stroke-width: 5; stroke-dasharray: none; }
  .vE .seats { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .vE .seat { display: grid; grid-template-columns: 46px 1fr auto; gap: 10px; align-items: center; background: #fff; border: 4px solid var(--ink); box-shadow: 5px 5px 0 var(--ink); padding: 6px 10px; min-height: 56px; }
  .vE .seat.dead { background: #ecd3e6; color: #3b2236; }
  .vE .seat .num { width: 40px; height: 40px; display: grid; place-items: center; background: var(--teal); color: #fff; font-weight: 900; font-size: 17px; border: 3px solid var(--ink); }
  .vE .seat.dead .num { background: #fff; color: var(--ink); text-decoration: line-through; }
  .vE .seat.wolf .num { background: var(--red); }
  .vE .who { display: grid; gap: 3px; min-width: 0; }
  .vE .name { font-weight: 800; font-size: 17px; }
  .vE .role { font-size: 13px; font-weight: 900; padding: 1px 6px; border: 2px solid var(--ink); background: #fff; }
  .vE .role.wolf { background: var(--red); color: #fff; }
  .vE .status { font: 700 13px/1.2 ui-monospace, monospace; }
  .vE .claim { font-weight: 800; font-size: 14px; background: var(--yellow); border: 2px solid var(--ink); padding: 1px 6px; justify-self: start; }
  .vE .claim .true { background: var(--teal); color: #fff; padding: 0 4px; }
  .vE .claim .lie { background: var(--red); color: #fff; padding: 0 4px; }
  .vE .susp { display: flex; align-items: center; gap: 8px; font: 700 13px/1 ui-monospace, monospace; }
  .vE .meta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .vE .sbar { width: 130px; height: 10px; border: 2px solid var(--ink); background: #fff; display: block; }
  .vE .sbar i { display: block; height: 100%; background: var(--ink); }
  .vE .turn { display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 15px; border: 3px solid var(--ink); padding: 3px 8px; background: #fff; }
  .vE .turn.ok { background: var(--teal); color: #fff; }
  .vE .turn.to { background: var(--ink); color: var(--yellow); }
  .vE .muted { color: #3a3a3a; font-size: 15px; }
  .vE .pub { margin: 12px 0 0 64px; }

  .vE .right { min-height: 0; display: flex; flex-direction: column; gap: 14px; }
  .vE .tally { background: #fff; border: 4px solid var(--ink); box-shadow: 5px 5px 0 var(--ink); padding: 8px 12px 12px; }
  .vE .tally h3 { margin: 0 0 8px; font-size: 16px; font-weight: 900; }
  .vE .tally p { margin: 0; }
  .vE .boxes { display: flex; gap: 8px; }
  .vE .box { flex: 1; position: relative; height: 72px; border: 3px solid var(--ink); display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 4px 0; background: #fff; }
  .vE .box b { font-size: 24px; }
  .vE .box span { font-weight: 800; font-size: 15px; }
  .vE .box.hit { background: var(--yellow); }
  .vE .box.out { outline: 4px solid var(--red); outline-offset: -8px; }
  .vE .box em { position: absolute; top: -10px; right: -6px; background: var(--red); color: #fff; font: 900 12px/1 sans-serif; padding: 2px 4px; border: 2px solid var(--ink); font-style: normal; }
  .vE .feed { flex: 1; min-height: 0; overflow: auto; list-style: none; margin: 0; padding: 8px; display: flex; flex-direction: column; gap: 5px;
    background: #fff; border: 4px solid var(--ink); box-shadow: 5px 5px 0 var(--ink); }
  .vE .feed li { font-size: 16px; line-height: 1.3; padding: 6px 10px; border-left: 6px solid var(--yellow); background: #222; color: #fff; }
  .vE .feed .ag { font-weight: 400; opacity: .85; font-size: 14px; }
  .vE .feed .hdr { background: #fff; color: var(--ink); border-left-color: var(--pink); font-weight: 900; border-top: 3px solid var(--ink); margin-top: 6px; }
  .vE .feed .hdr .sub { font-weight: 600; font-size: 14px; margin-left: 8px; }
  .vE .feed .sub { background: #fff; color: var(--ink); border-left-color: var(--ink); font: 800 14px/1.2 ui-monospace, monospace; }
  .vE .feed .info { background: #fff; color: var(--ink); border-left-color: var(--teal); font-weight: 700; }
  .vE .feed .death { background: #5a0f1c; border-left-color: var(--red); font-weight: 800; }
  .vE .feed .skip { background: #444; border-left-color: #999; font-style: italic; }
  .vE .feed .godrow { background: var(--lilac); color: var(--ink); border-left-color: #7a4dd8; }
  .vE .feed .gv { font: 900 11px/1 ui-monospace, monospace; background: var(--ink); color: var(--lilac); padding: 2px 4px; margin-right: 4px; vertical-align: 2px; }
  .vE .feed .ballot { border-left-color: var(--teal); }
  .vE .feed .reply { border-left-color: var(--pink); }
  .vE .feed .live { background: var(--yellow); color: var(--ink); border: 3px dashed var(--ink); }
  .vE .feed .live .muted { color: var(--ink); }
  .vE .ch { display: inline-block; font: 800 13px/1.3 ui-monospace, monospace; padding: 0 5px; margin-left: 4px; border: 2px solid currentColor; }
  .vE .ch.acc { background: var(--red); color: #fff; border-color: #fff; }
  .vE .ch.def { background: var(--teal); color: #fff; border-color: #fff; }
  .vE .ch.clm { background: var(--yellow); color: var(--ink); border-color: var(--yellow); }
  .vE .marks { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  .vE .mk { display: inline-flex; align-items: center; gap: 4px; font-weight: 800; border: 2px solid var(--ink); padding: 1px 6px; background: #fff; }
  .vE .mk.acted { background: var(--teal); color: #fff; }
  .vE .mk.timedout { background: var(--ink); color: var(--yellow); }

  /* "thinking…" spinner — <progress> pattern (spinner guide) */
  @property --vE-arc-start { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
  @property --vE-arc-end { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
  @property --vE-dash { syntax: "*"; inherits: false; initial-value: , vE-dash 3s ease-in-out infinite; }
  .vE progress.spin:indeterminate::-webkit-progress-bar, .vE progress.spin:indeterminate::-webkit-progress-value { display: none; background: none; }
  .vE progress.spin:indeterminate::-moz-progress-bar { display: none; background: none; }
  .vE progress.spin:indeterminate {
    --_from: calc(90deg + var(--vE-arc-start, 0deg)); --_to: calc(90deg + var(--vE-arc-end, 158deg));
    --size: 16px; --thickness: 3px; --spinner-color: #111; --track-color: #fff; --_dur: 1.5s;
    flex: none; width: var(--size); height: var(--size); border-radius: 50%; appearance: none; position: relative;
    background: conic-gradient(from var(--_from), var(--spinner-color) calc(var(--_to) - var(--_from)), transparent 0) var(--track-color);
    animation: vE-spin var(--_dur) linear infinite var(--vE-dash, );
  }
  @supports (background-clip: border-area) { .vE progress.spin:indeterminate { background-clip: border-area; border: var(--thickness) solid transparent; background-origin: border-box; } }
  @supports not (background-clip: border-area) { .vE progress.spin:indeterminate { --clip: calc(100% - var(--thickness)); mask-image: radial-gradient(farthest-side, transparent var(--clip), black var(--clip)); border: 0; } }
  @media (forced-colors: active) { .vE progress.spin:indeterminate { forced-color-adjust: none; --spinner-color: CanvasText; --track-color: Canvas; } }
  @media (prefers-reduced-motion: reduce) { .vE progress.spin:indeterminate { --_dur: 6s; --vE-dash: ; --vE-arc-end: 158deg; } }
  @keyframes vE-spin { to { rotate: 1turn; } }
  @keyframes vE-dash { from { --vE-arc-start: 0deg; --vE-arc-end: 3deg; } 50% { --vE-arc-start: 100deg; --vE-arc-end: 358deg; } to { --vE-arc-start: 360deg; --vE-arc-end: 363deg; } }
  .vE .turn.ok progress, .vE .mk.acted progress { display: none; }
  `;

  window.VARIANTS.push({ key: "E", name: "Dense grid + modal", css, render });
})();
