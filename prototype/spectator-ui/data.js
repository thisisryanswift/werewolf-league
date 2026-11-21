// PROTOTYPE — throwaway. Hardcoded fake event log for one 8-seat Match, plus
// fake summaries for the other live Match tiles, plus derive() which folds the
// log (up to a cursor) into the state every variant renders from.
// Shapes follow spec wl-xgp7 loosely; they are NOT the real event schema.
window.PROTO = (() => {
  const SEATS = [
    { seat: 1, agent: "Hydrogen", copy: 1, role: "Villager" },
    { seat: 2, agent: "3.8 Flash", copy: 1, role: "Seer" },
    { seat: 3, agent: "3.6 Flash", copy: null, role: "Werewolf" },
    { seat: 4, agent: "3.5 Flash-Lite", copy: 1, role: "Villager" },
    { seat: 5, agent: "Hydrogen", copy: 2, role: "Doctor" },
    { seat: 6, agent: "3.8 Flash", copy: 2, role: "Werewolf" },
    { seat: 7, agent: "3.5 Flash-Lite", copy: 2, role: "Villager" },
    { seat: 8, agent: "Hydrogen", copy: 3, role: "Villager" },
  ];

  const sp = (seat, text, extra = {}) => ({ seat, text, accuse: [], defend: [], claim: null, ...extra });

  // Event log. `private: true` events are visible in God View only.
  const EVENTS = [
    { type: "match_started", matchId: "m-0417", seed: "0x5eed417", seats: SEATS },

    // ── Night 1 ──
    { type: "phase", phase: "night", n: 1, packLeader: 3 },
    { type: "turn_started", step: "wolf_chat", seats: [3, 6], deadlineS: 90 },
    { type: "wolf_chat", private: true, n: 1, exchange: 1, seat: 3, text: "Seer is the threat. I'd take P7 — quiet seats get ignored." },
    { type: "wolf_chat", private: true, n: 1, exchange: 1, seat: 6, text: "P1 reads people too well. I'm proposing P1." },
    { type: "wolf_chat", private: true, n: 1, exchange: 2, seat: 3, text: "I'm Pack Leader tonight, it's P7. If anyone claims Seer tomorrow, we need a counterclaim." },
    { type: "wolf_chat", private: true, n: 1, exchange: 2, seat: 6, text: "I'll counterclaim. You stay clean and back me up." },
    { type: "turn_started", step: "night_action", seats: [2, 3, 5, 6], deadlineS: 90 },
    { type: "night_choice", private: true, n: 1, kind: "propose_kill", seat: 3, target: 7 },
    { type: "night_choice", private: true, n: 1, kind: "propose_kill", seat: 6, target: 1 },
    { type: "night_choice", private: true, n: 1, kind: "inspect", seat: 2, target: 6, result: "wolf" },
    { type: "night_choice", private: true, n: 1, kind: "protect", seat: 5, target: 5 },
    { type: "pack_leader_decides", private: true, n: 1, leader: 3, target: 7 },
    { type: "dawn", n: 1, killed: 7, role: "Villager" },

    // ── Day 1 ── (presentation order rotates: starts at P4)
    { type: "day_started", n: 1, order: [4, 5, 6, 8, 1, 2, 3] },
    { type: "turn_started", step: "speech_A", seats: [4, 5, 6, 8, 1, 2, 3], deadlineS: 60 },
    { type: "turn_timed_out", seat: 8, step: "speech_A", default: "skipped" },
    {
      type: "speech_round", n: 1, round: "A", speeches: [
        sp(4, "P7 was quiet — the wolves picked an easy target. No reads yet. I want to hear from everyone before I commit."),
        sp(5, "I'll keep my role to myself for now. P3 seems far too calm about a death.", { accuse: [3] }),
        sp(6, "Nothing on Night 1. P5 dodging role talk is a small flag for me.", { accuse: [5] }),
        { seat: 8, skipped: true, timedOut: true, accuse: [], defend: [], claim: null },
        sp(1, "Let's not eliminate on vibes. If there's a Seer at this table, now is a good time."),
        sp(2, "I am the Seer. I inspected P6 last night: Werewolf.", { accuse: [6], claim: { role: "Seer", results: [{ seat: 6, side: "wolf" }] } }),
        sp(3, "A Seer claim on Day 1 is bold. P6, anything to say?"),
      ],
    },
    { type: "turn_started", step: "speech_B", seats: [4, 5, 6, 8, 1, 2, 3], deadlineS: 60 },
    {
      type: "speech_round", n: 1, round: "B", speeches: [
        sp(4, "A counterclaim would settle it. P6, are you a Seer or not?", { accuse: [6] }),
        sp(5, "P2's claim is specific and early. I vote P6 unless a real counterclaim appears.", { accuse: [6] }),
        sp(6, "I'm the real Seer. I checked P2 last night: Werewolf. P2 is pre-empting me.", { accuse: [2], claim: { role: "Seer", results: [{ seat: 2, side: "wolf" }] } }),
        sp(8, "Sorry — late. Two Seer claims means one is a wolf, and P6 only claimed after being outed.", { accuse: [6] }),
        sp(1, "P6 counterclaimed under pressure, but P2 claimed suspiciously early too.", { accuse: [2] }),
        sp(2, "Classic counterclaim. Watch who P6 defends tomorrow.", { accuse: [6] }),
        sp(3, "I believe P6. P2 jumped too fast — that's a wolf making the first move.", { accuse: [2], defend: [6] }),
      ],
    },
    // Score: Round A ×1, Round B ×2. P6 = 1 + 4×2 = 9, P2 = 0 + 3×2 = 6.
    { type: "repliers_chosen", n: 1, seats: [6, 2], scores: { 6: 9, 2: 6, 5: 1, 3: 1 } },
    { type: "turn_started", step: "reply", seats: [6], deadlineS: 60 },
    { type: "reply", n: 1, seat: 6, text: "My result stands: P2 is a Werewolf. Eliminate P2 and I'll inspect again tonight." },
    { type: "turn_started", step: "reply", seats: [2], deadlineS: 60 },
    { type: "reply", n: 1, seat: 2, text: "If you eliminate me, the village loses its Seer. P6 is a wolf. Full stop." },
    { type: "turn_started", step: "vote", seats: [1, 2, 3, 4, 5, 6, 8], deadlineS: 60 },
    { type: "turn_timed_out", seat: 8, step: "vote", default: "abstain" },
    {
      type: "vote_resolved", n: 1, eliminated: 2, role: "Seer",
      ballots: [
        { seat: 1, target: 2, reason: "P2's claim came too fast to trust.", beliefs: { 2: .55, 3: .35, 4: .2, 5: .25, 6: .45, 8: .2 } },
        { seat: 2, target: 6, reason: "My inspection: P6 is a Werewolf.", beliefs: { 1: .1, 3: .5, 4: .15, 5: .1, 6: 1, 8: .15 } },
        { seat: 3, target: 2, reason: "Trusting P6's counterclaim.", beliefs: { 1: .2, 2: .35, 4: .15, 5: .15, 6: .05, 8: .1 } },
        { seat: 4, target: "abstain", reason: "Two Seer claims is a coin flip. I won't guess.", beliefs: { 1: .25, 2: .45, 3: .3, 5: .2, 6: .5, 8: .3 } },
        { seat: 5, target: 6, reason: "P2 claimed first and named a result.", beliefs: { 1: .15, 2: .3, 3: .4, 4: .15, 6: .8, 8: .2 } },
        { seat: 6, target: 2, reason: "I inspected P2: Werewolf.", beliefs: { 1: .15, 2: .45, 3: .05, 4: .1, 5: .15, 8: .1 } },
        { seat: 8, target: "abstain", timedOut: true, reason: null, beliefs: null },
      ],
    },

    // ── Night 2 ── (Pack Leader passes to P6)
    { type: "phase", phase: "night", n: 2, packLeader: 6 },
    { type: "turn_started", step: "wolf_chat", seats: [3, 6], deadlineS: 60 },
    { type: "wolf_chat", private: true, n: 2, exchange: 1, seat: 6, text: "That worked perfectly. P1 is already calling the elimination a mistake. Kill P1 before they rally." },
    { type: "wolf_chat", private: true, n: 2, exchange: 1, seat: 3, text: "Agreed. P5 is loud but reads like a plain villager." },
    { type: "wolf_chat", private: true, n: 2, exchange: 2, seat: 6, text: "Locking P1." },
    { type: "wolf_chat", private: true, n: 2, exchange: 2, seat: 3, text: "P1." },
    { type: "turn_started", step: "night_action", seats: [3, 5, 6], deadlineS: 60 },
    { type: "night_choice", private: true, n: 2, kind: "propose_kill", seat: 6, target: 1 },
    { type: "night_choice", private: true, n: 2, kind: "propose_kill", seat: 3, target: 1 },
    { type: "night_choice", private: true, n: 2, kind: "protect", seat: 5, target: 1 },
    { type: "doctor_saved", private: true, n: 2, target: 1 },
    { type: "dawn", n: 2, killed: null },

    // ── Day 2 ── (order rotates: starts at P5). Round A is IN FLIGHT.
    { type: "day_started", n: 2, order: [5, 6, 8, 1, 3, 4] },
    { type: "turn_started", step: "speech_A", seats: [5, 6, 8, 1, 3, 4], deadlineS: 60, elapsedS: 41 },
    { type: "turn_acted", seat: 5 },
    { type: "turn_acted", seat: 1 },
    { type: "turn_acted", seat: 3 },
  ];
  EVENTS.forEach((e, i) => (e.seq = i + 1));

  const label = (s) => (s.copy ? `${s.agent} #${s.copy}` : s.agent);
  const SIDE = { Werewolf: "wolf", Seer: "village", Doctor: "village", Villager: "village" };

  function derive(upto = EVENTS.length) {
    const evs = EVENTS.slice(0, upto);
    const st = {
      matchId: null, seed: null, cursor: upto, total: EVENTS.length,
      seats: [], phase: "setup", n: 0, packLeader: null,
      nights: [], days: [], inflight: null, timeouts: [],
      accusations: [], claims: {}, tableSuspicion: {}, latestLine: null, winner: null,
    };
    const night = () => st.nights[st.nights.length - 1];
    const day = () => st.days[st.days.length - 1];
    for (const e of evs) {
      switch (e.type) {
        case "match_started":
          st.matchId = e.matchId; st.seed = e.seed;
          st.seats = e.seats.map((s) => ({ ...s, label: label(s), side: SIDE[s.role], alive: true, revealed: false, diedAt: null }));
          break;
        case "phase":
          st.phase = e.phase; st.n = e.n; st.packLeader = e.packLeader;
          st.nights.push({ n: e.n, packLeader: e.packLeader, wolfChat: [], choices: [], leaderPick: null, saved: null, killed: undefined });
          break;
        case "turn_started":
          st.inflight = { step: e.step, deadlineS: e.deadlineS, elapsedS: e.elapsedS ?? 0, seats: Object.fromEntries(e.seats.map((s) => [s, "thinking"])) };
          break;
        case "turn_acted":
          if (st.inflight) st.inflight.seats[e.seat] = "acted";
          break;
        case "turn_timed_out":
          if (st.inflight) st.inflight.seats[e.seat] = "timedout";
          st.timeouts.push({ seat: e.seat, step: e.step, default: e.default, phase: st.phase, n: st.n });
          break;
        // Night messages mark the seat as acted; the step stays in flight until the next step or dawn.
        case "wolf_chat": night().wolfChat.push(e); if (st.inflight) st.inflight.seats[e.seat] = "acted"; break;
        case "night_choice": night().choices.push(e); if (st.inflight) st.inflight.seats[e.seat] = "acted"; break;
        case "pack_leader_decides": night().leaderPick = e; break;
        case "doctor_saved": night().saved = e.target; break;
        case "dawn": {
          night().killed = e.killed; st.inflight = null;
          if (e.killed) { const s = st.seats[e.killed - 1]; s.alive = false; s.revealed = true; s.diedAt = `Night ${e.n}`; }
          break;
        }
        case "day_started":
          st.phase = "day"; st.n = e.n;
          st.days.push({ n: e.n, order: e.order, rounds: {}, repliers: null, replies: [], ballots: null, eliminated: undefined });
          break;
        case "speech_round": {
          st.inflight = null;
          day().rounds[e.round] = e.speeches;
          for (const s of e.speeches) {
            for (const t of s.accuse) st.accusations.push({ from: s.seat, to: t, day: e.n, round: e.round });
            if (s.claim) st.claims[s.seat] = { ...s.claim, day: e.n, round: e.round, true: st.seats[s.seat - 1].role === s.claim.role };
            if (!s.skipped) st.latestLine = { seat: s.seat, text: s.text };
          }
          break;
        }
        case "repliers_chosen": day().repliers = e; break;
        case "reply": day().replies.push(e); st.inflight = null; st.latestLine = { seat: e.seat, text: e.text }; break;
        case "vote_resolved": {
          st.inflight = null;
          day().ballots = e.ballots; day().eliminated = e.eliminated;
          if (e.eliminated) { const s = st.seats[e.eliminated - 1]; s.alive = false; s.revealed = true; s.diedAt = `Day ${e.n}`; }
          // Table Suspicion: mean stated P(werewolf) per Player over the latest Day's ballots.
          const sums = {};
          for (const b of e.ballots) if (b.beliefs) for (const [seat, p] of Object.entries(b.beliefs)) (sums[seat] ??= []).push(p);
          st.tableSuspicion = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
          break;
        }
      }
    }
    st.alive = st.seats.filter((s) => s.alive).map((s) => s.seat);
    st.phaseLabel = st.phase === "setup" ? "Setup" : `${st.phase === "night" ? "Night" : "Day"} ${st.n}`;
    st.stepLabel = st.inflight ? ({ wolf_chat: "Wolf Chat", night_action: "Night actions", speech_A: "Speech Round A", speech_B: "Speech Round B", reply: "Right of Reply", vote: "Vote" })[st.inflight.step] : null;
    return st;
  }

  // Fake summaries for the rest of the live Match grid (tile m-0417 is derived from the log).
  const OTHER_TILES = [
    { matchId: "m-0414", phase: "night", n: 3, step: "Wolf Chat", seats: 8, alive: [1, 3, 4, 6, 8], roles: ["Villager", "Werewolf", "Seer", "Villager", "Doctor", "Werewolf", "Villager", "Villager"], latestLine: { seat: 4, label: "3.6 Flash", text: "P2 voted with the wolves twice. That's not a coincidence." }, thinking: 2 },
    { matchId: "m-0415", phase: "day", n: 3, step: "Vote", seats: 7, alive: [1, 2, 5, 6, 7], roles: ["Seer", "Villager", "Werewolf", "Villager", "Werewolf", "Doctor", "Villager"], latestLine: { seat: 5, label: "Hydrogen #2", text: "I'm the Doctor. I saved P1 on Night 2 — check the dawn." }, thinking: 5 },
    { matchId: "m-0416", phase: "day", n: 1, step: "Speech Round B", seats: 8, alive: [1, 2, 3, 4, 5, 6, 8], roles: ["Villager", "Doctor", "Villager", "Werewolf", "Seer", "Villager", "Villager", "Werewolf"], latestLine: { seat: 1, label: "3.5 Flash-Lite #1", text: "Nobody claimed anything. Let's at least pick a lead." }, thinking: 6, timeouts: 1 },
    { matchId: "m-0412", phase: "over", n: 4, step: "Village wins", seats: 7, alive: [2, 4, 7], roles: ["Werewolf", "Seer", "Villager", "Doctor", "Werewolf", "Villager", "Villager"], latestLine: { seat: 2, label: "Hydrogen #1", text: "P5 is the last wolf. My inspection proves it." }, thinking: 0, winner: "village" },
    { matchId: "m-0418", phase: "night", n: 1, step: "Night actions", seats: 7, alive: [1, 2, 3, 4, 5, 6, 7], roles: ["Villager", "Villager", "Doctor", "Werewolf", "Villager", "Seer", "Werewolf"], latestLine: null, thinking: 4 },
  ];

  function grid(upto) {
    const st = derive(upto);
    const live = {
      matchId: st.matchId, phase: st.phase, n: st.n, step: st.stepLabel ?? "", seats: st.seats.length,
      alive: st.alive, roles: st.seats.map((s) => s.role),
      latestLine: st.latestLine && { seat: st.latestLine.seat, label: st.seats[st.latestLine.seat - 1].label, text: st.latestLine.text },
      thinking: st.inflight ? Object.values(st.inflight.seats).filter((v) => v === "thinking").length : 0,
      timeouts: st.timeouts.length, featured: true,
    };
    return [live, ...OTHER_TILES];
  }

  return { SEATS, EVENTS, derive, grid };
})();
