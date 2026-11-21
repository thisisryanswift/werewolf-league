// PROTOTYPE — Variant C: "Broadcast". Live sports / esports TV feed.
// Grid = TV-wall multiview. Match = scoreboard, filmstrip of speeches, accusation
// bipartite diagram, vote results + lower-third ballot ticker, God View hot mic.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ROLE_SHORT = { Werewolf: "WOLF", Seer: "SEER", Doctor: "DOC", Villager: "VILL" };
  const fmt = (s) => `0:${String(Math.max(0, Math.round(s))).padStart(2, "0")}`;

  // Filmstrip selection persists across re-renders; follows the live edge unless the user picks an older segment.
  let sel = null;
  let follow = true;

  const css = `
@property --vc-arc-start { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@property --vc-arc-end { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@property --vc-dash-anim { syntax: "*"; inherits: false; initial-value: , vc-dash 3s ease-in-out infinite; }
@keyframes vc-spin { to { rotate: 1turn; } }
@keyframes vc-dash {
  from { --vc-arc-start: 0deg; --vc-arc-end: 3deg; }
  50% { --vc-arc-start: 100deg; --vc-arc-end: 358deg; }
  to { --vc-arc-start: 360deg; --vc-arc-end: 363deg; }
}
@keyframes vc-ticker { from { translate: 0 0; } to { translate: -50% 0; } }
@keyframes vc-blink { 50% { opacity: .35; } }

body[data-variant="C"] { background: #0d0f13; color-scheme: dark; }
.vC {
  --bg: #0d0f13; --panel: #171a21; --panel2: #1f232c; --line: #3a3f4b;
  --ink: #f4f5f7; --mute: #a8afbd; --accent: #ff5a1f; --accent-ink: #160700;
  --wolf: #ff3b4a; --village: #3fc9ff; --ok: #3ee07a; --warn: #ffd23f;
  --cond: "Barlow Condensed", "Roboto Condensed", "Arial Narrow", "DejaVu Sans Condensed", "Liberation Sans Narrow", sans-serif;
  min-height: 100vh; box-sizing: border-box; color: var(--ink);
  background: radial-gradient(1200px 500px at 50% -10%, #262b36 0%, transparent 70%), var(--bg);
  font: 500 18px/1.25 var(--cond); font-stretch: condensed; font-variant-numeric: tabular-nums;
}
.vC *, .vC *::before, .vC *::after { box-sizing: border-box; }
.vC h1, .vC h2, .vC h3 { margin: 0; text-transform: uppercase; letter-spacing: .04em; font-weight: 800; }
.vC h1:focus { outline: none; }
.vC button { font: inherit; color: inherit; }
.vC .up { text-transform: uppercase; letter-spacing: .05em; }

/* LIVE bug */
.vC .bug { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; background: var(--accent); color: var(--accent-ink);
  font-weight: 900; text-transform: uppercase; letter-spacing: .08em; border-radius: 3px; }
.vC .bug::before { content: ""; width: .6em; height: .6em; border-radius: 50%; background: currentColor; animation: vc-blink 1.4s steps(2) infinite; }
.vC .bug.ended { background: #5b6070; color: #fff; }
.vC .bug.ended::before { display: none; }

/* thinking spinner (progress) — from spinner guide */
.vC progress.vc-spin:indeterminate::-webkit-progress-bar { display: none; background: none; }
.vC progress.vc-spin:indeterminate::-webkit-progress-value { display: none; background: none; }
.vC progress.vc-spin:indeterminate::-moz-progress-bar { display: none; background: none; }
.vC progress.vc-spin:indeterminate::slider-fill { display: none; background: none; }
.vC progress.vc-spin:indeterminate {
  --_from: calc(90deg + var(--vc-arc-start, 0deg));
  --_to: calc(90deg + var(--vc-arc-end, 158deg));
  --size: 22px; --thickness: 4px; --spinner-color: var(--accent); --track-color: #3a3f4b;
  --spinner-duration: 1.5s; --_used-spinner-duration: var(--spinner-duration);
  position: relative; width: var(--size); height: var(--size); border-radius: 50%; appearance: none; flex: none; margin: 0;
  background: conic-gradient(from var(--_from), var(--spinner-color) calc(var(--_to) - var(--_from)), transparent 0) var(--track-color);
  @supports (background-clip: border-area) { background-clip: border-area; border: var(--thickness) solid transparent; background-origin: border-box; }
  @supports not (background-clip: border-area) {
    --clip-boundary: calc(100% - var(--thickness));
    mask-image: radial-gradient(farthest-side, transparent var(--clip-boundary), black var(--clip-boundary)); border: 0;
  }
  @media (forced-colors: active) { forced-color-adjust: none; --spinner-color: CanvasText; --track-color: Canvas; }
  animation: vc-spin var(--_used-spinner-duration) linear infinite var(--vc-dash-anim, );
}
@media (prefers-reduced-motion: reduce) {
  .vC progress.vc-spin:indeterminate { --_used-spinner-duration: 6s; --vc-dash-anim: ; --vc-arc-end: 158deg; }
  .vC .bug::before { animation: none; }
}

/* jerseys */
.vC .jersey { --c: #4a505e; display: inline-grid; place-items: center; position: relative; flex: none;
  width: 44px; height: 48px; border-radius: 6px 6px 10px 10px; background: linear-gradient(#ffffff22, transparent 45%), var(--c);
  font-weight: 900; font-size: 22px; color: #fff; border: 2px solid #ffffff30; }
.vC .jersey.wolf { --c: #b3121f; border-color: var(--wolf); }
.vC .jersey.dead { --c: #23262e; color: #747a88; border-style: dashed; }
.vC .jersey.dead::after { content: "✕"; position: absolute; inset: 0; display: grid; place-items: center; font-size: 34px; color: #ff6b6b; }
.vC .jersey .r { position: absolute; bottom: -8px; left: 50%; translate: -50% 0; font-size: 11px; padding: 0 4px; border-radius: 3px;
  background: #000; color: #fff; letter-spacing: .05em; z-index: 1; white-space: nowrap; }
.vC .jersey .r.wolf { background: var(--wolf); }

.vC .role { display: inline-block; padding: 1px 7px; border-radius: 3px; font-weight: 800; font-size: .8em; letter-spacing: .06em; text-transform: uppercase;
  background: #2b3a48; color: var(--village); border: 1px solid currentColor; }
.vC .role.wolf { background: #3a1218; color: #ff8a93; }

/* ============ GRID: TV wall ============ */
.vC .vc-grid { height: 100vh; display: grid; grid-template-rows: auto auto 1fr; gap: 14px; padding: 0 22px 78px; }
.vC .ticker { display: flex; align-items: stretch; height: 46px; overflow: hidden; background: #000; border-bottom: 3px solid var(--accent); margin: 0 -22px; }
.vC .ticker .tag { flex: none; display: grid; place-items: center; padding: 0 18px; background: var(--accent); color: var(--accent-ink);
  font-weight: 900; font-size: 20px; letter-spacing: .08em; text-transform: uppercase; }
.vC .ticker .track { display: flex; width: max-content; align-items: center; gap: 44px; padding-left: 30px;
  animation: vc-ticker 40s linear infinite; font-size: 20px; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
.vC .ticker .track b { color: var(--accent); }
@media (prefers-reduced-motion: reduce) {
  .vC .ticker { height: auto; }
  .vC .ticker .track { animation: none; width: auto; flex-wrap: wrap; white-space: normal; gap: 6px 30px; padding: 8px 18px; }
  .vC .ticker .track .dup { display: none; }
}
.vC .wall-head { display: flex; align-items: baseline; gap: 18px; }
.vC .wall-head h1 { font-size: 44px; }
.vC .wall-head .mute { color: var(--mute); font-size: 22px; text-transform: uppercase; }
.vC .wall { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, auto); gap: 18px; align-content: start; }
.vC .mon { position: relative; aspect-ratio: 16 / 9; width: 100%; padding: 0; text-align: left; cursor: pointer; overflow: hidden;
  border: 3px solid #2c313c; border-radius: 10px; background: #1a1d24; display: grid; grid-template-rows: auto 1fr auto; }
.vC .mon:hover, .vC .mon:focus-visible { border-color: var(--accent); outline: none; box-shadow: 0 0 0 3px #ff5a1f55; }
.vC .mon.night { background: radial-gradient(circle at 75% 20%, #2a3d6e 0%, #0f1630 60%, #0a0e1c 100%); }
.vC .mon.day { background: radial-gradient(circle at 25% 15%, #4a3a26 0%, #22201f 60%, #15151a 100%); }
.vC .mon.over { background: linear-gradient(160deg, #1e2a24, #101513); }
.vC .mon::after { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(#ffffff14, transparent 30%), repeating-linear-gradient(#0000 0 3px, #0000001c 3px 4px); }
.vC .mon .top { display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 14px 0; gap: 10px; }
.vC .mon .mid { font-size: 18px; font-weight: 700; letter-spacing: .1em; }
.vC .mon .phase { background: #000c; border-left: 5px solid var(--accent); padding: 3px 12px; text-align: right; }
.vC .mon .phase b { display: block; font-size: 30px; line-height: 1; font-weight: 900; text-transform: uppercase; }
.vC .mon .phase span { font-size: 17px; color: var(--mute); text-transform: uppercase; letter-spacing: .05em; }
.vC .mon .seats { display: flex; gap: 8px; justify-content: center; align-self: center; flex-wrap: wrap; padding: 0 12px; }
.vC .mon .sub { background: #000d; padding: 10px 14px; font-size: 19px; line-height: 1.25; min-height: 64px; position: relative; z-index: 1; }
.vC .mon .sub .who { color: var(--accent); font-weight: 900; text-transform: uppercase; margin-right: 6px; }
.vC .mon .sub .quiet { color: var(--mute); font-style: italic; }
.vC .mon .meta { display: flex; gap: 14px; font-size: 16px; text-transform: uppercase; letter-spacing: .05em; color: var(--mute); margin-top: 4px; align-items: center; }
.vC .mon .meta .to { color: var(--warn); font-weight: 800; }
.vC .mon .meta .th { display: inline-flex; gap: 6px; align-items: center; color: var(--ink); }
.vC .mon .final { position: absolute; inset: 96px 70px 96px; z-index: 2; display: grid; place-items: center; text-align: center;
  background: #000d; border: 3px solid var(--village); border-radius: 8px; }
.vC .mon .final .k { font-size: 16px; letter-spacing: .2em; color: var(--mute); }
.vC .mon .final .w { font-size: 40px; font-weight: 900; line-height: 1; color: var(--village); text-transform: uppercase; }
.vC .mon .final.wolf { border-color: var(--wolf); } .vC .mon .final.wolf .w { color: var(--wolf); }
.vC .feat { background: var(--warn); color: #000; font-weight: 900; padding: 1px 7px; border-radius: 3px; font-size: 14px; letter-spacing: .08em; margin-left: 6px; }

/* ============ MATCH ============ */
.vC .vc-match { height: 100vh; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; gap: 10px; padding: 0 16px 74px; }
.vC .score { display: grid; grid-template-columns: auto 1fr auto 1fr auto; align-items: stretch; margin: 0 -16px; background: linear-gradient(#262a33, #12141a);
  border-bottom: 4px solid var(--accent); min-height: 92px; }
.vC .score .back { border: 0; background: #000; padding: 0 22px; font-size: 20px; font-weight: 800; text-transform: uppercase; cursor: pointer; letter-spacing: .05em; }
.vC .score .back:hover, .vC .score .back:focus-visible { background: var(--accent); color: var(--accent-ink); outline: none; }
.vC .score .team { display: flex; align-items: center; gap: 18px; padding: 0 24px; }
.vC .score .team.v { justify-content: flex-end; background: linear-gradient(90deg, transparent, #10384a); }
.vC .score .team.w { background: linear-gradient(270deg, transparent, #4a1018); }
.vC .score .team .nm { font-size: 30px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
.vC .score .team .num { font-size: 64px; font-weight: 900; line-height: 1; min-width: 1.3ch; text-align: center; padding: 2px 10px; background: #000; border-radius: 6px; }
.vC .score .team.v .num { color: var(--village); } .vC .score .team.w .num { color: var(--wolf); }
.vC .score .team .lbl { font-size: 15px; color: var(--mute); text-transform: uppercase; letter-spacing: .1em; }
.vC .score .center { display: grid; place-items: center; align-content: center; gap: 2px; padding: 6px 26px; background: #000; min-width: 360px; }
.vC .score .center h1 { font-size: 40px; line-height: 1; }
.vC .score .center .step { font-size: 20px; color: var(--accent); font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
.vC .score .clock { display: flex; align-items: center; gap: 10px; font-size: 18px; color: var(--mute); }
.vC .score .clock b { color: var(--ink); font-size: 24px; }
.vC .score .clock .bar { width: 120px; height: 8px; background: #333; border-radius: 4px; overflow: hidden; }
.vC .score .clock .bar i { display: block; height: 100%; background: var(--warn); }
.vC .score .mid { display: grid; align-content: center; justify-items: end; padding: 0 20px; gap: 4px; background: #000; }
.vC .score .mid .id { font-size: 18px; color: var(--mute); letter-spacing: .08em; }

.vC .recap { display: flex; align-items: center; gap: 10px; overflow: hidden; min-height: 40px; }
.vC .recap .k { flex: none; font-size: 16px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); }
.vC .recap .chip { flex: none; padding: 5px 12px; background: var(--panel2); border-left: 4px solid #5b6070; font-size: 18px; text-transform: uppercase; letter-spacing: .03em; border-radius: 3px; }
.vC .recap .chip.n { border-left-color: #5a7cff; } .vC .recap .chip.d { border-left-color: var(--warn); }
.vC .recap .chip .gv { color: var(--ok); }

.vC .stage { display: grid; grid-template-columns: 290px minmax(0, 1fr) 430px; gap: 14px; min-height: 0; }
.vC .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.vC .panel > h2 { font-size: 20px; padding: 8px 14px; background: linear-gradient(90deg, #2a2f3a, transparent); border-bottom: 2px solid var(--line);
  display: flex; justify-content: space-between; align-items: center; gap: 8px; flex: none; }
.vC .panel > h2 .s { font-size: 15px; color: var(--mute); font-weight: 600; }
.vC .panel > h2.gv { background: linear-gradient(90deg, #3d1520, transparent); }
.vC .panel > h2.gv::before { content: "GOD VIEW"; font-size: 12px; background: var(--wolf); color: #fff; padding: 1px 6px; border-radius: 3px; margin-right: auto; order: -1; letter-spacing: .1em; }
.vC .panel > h2.gv { justify-content: flex-start; }

/* seat rail */
.vC .rail { display: flex; flex-direction: column; gap: 0; overflow: auto; }
.vC .seat { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; align-items: center; padding: 9px 12px 12px; border-bottom: 1px solid var(--line); }
.vC .seat .nm { font-size: 20px; font-weight: 800; line-height: 1.1; }
.vC .seat .st { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 16px; text-transform: uppercase; letter-spacing: .05em; }
.vC .seat .st .think { color: var(--accent); font-weight: 800; }
.vC .seat .st .acted { color: var(--ok); font-weight: 800; }
.vC .seat .st .to { color: #000; background: var(--warn); padding: 0 6px; border-radius: 3px; font-weight: 900; }
.vC .seat .st .dead { color: #ff8a8a; font-weight: 800; }
.vC .seat.isdead .nm { color: #8a90a0; text-decoration: line-through; text-decoration-thickness: 2px; }
.vC .claimb { display: inline-block; font-size: 14px; font-weight: 900; letter-spacing: .05em; padding: 2px 7px; border-radius: 3px; background: var(--warn); color: #000; text-transform: uppercase; }
.vC .claimb.false { background: var(--wolf); color: #fff; }
.vC .claimb.false::after { content: " · FALSE CLAIM"; }
.vC .claimb.true.gv::after { content: " · TRUE"; }

/* center */
.vC .center-col { display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 10px; min-height: 0; }
.vC .segs { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.vC .segs button { border: 2px solid var(--line); background: var(--panel2); padding: 4px 14px; border-radius: 4px; cursor: pointer;
  font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; }
.vC .segs button[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.vC .segs button:focus-visible { outline: 3px solid var(--warn); outline-offset: 2px; }
.vC .segs button .lv { color: var(--wolf); margin-left: 4px; }
.vC .segs button[aria-pressed="true"] .lv { color: #000; }
.vC .segs .hint { margin-left: auto; color: var(--mute); font-size: 16px; text-transform: uppercase; letter-spacing: .05em; }

.vC .film { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 4px 2px 10px; height: 318px; }
.vC .card { flex: 0 0 292px; scroll-snap-align: start; display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 8px;
  background: linear-gradient(#ffffff10, transparent 30%), var(--panel2); border: 2px solid var(--line); position: relative; }
.vC .card .hd { display: flex; gap: 10px; align-items: center; }
.vC .card .hd .ord { position: absolute; top: 8px; right: 10px; font-size: 14px; color: var(--mute); letter-spacing: .1em; }
.vC .card .hd .nm { font-size: 20px; font-weight: 800; line-height: 1.05; }
.vC .card .txt { font-size: 21px; line-height: 1.25; font-weight: 500; flex: 1; overflow: auto; }
.vC .card .txt::before { content: "“"; color: var(--accent); font-weight: 900; }
.vC .card .txt::after { content: "”"; color: var(--accent); font-weight: 900; }
.vC .card .tags { display: flex; gap: 6px; flex-wrap: wrap; }
.vC .chipx { font-size: 15px; font-weight: 800; padding: 1px 7px; border-radius: 3px; text-transform: uppercase; letter-spacing: .04em; }
.vC .chipx.acc { background: #3a1218; color: #ffb3ba; border: 1px solid var(--wolf); }
.vC .chipx.acc::before { content: "⚑ ACCUSES "; }
.vC .chipx.def { background: #10384a; color: #b8ecff; border: 1px solid var(--village); }
.vC .chipx.def::before { content: "🛡 DEFENDS "; }
.vC .card.nosig { background: repeating-linear-gradient(135deg, #1b1d22 0 14px, #23262d 14px 28px); border-style: dashed; border-color: var(--warn); }
.vC .card.nosig .big { flex: 1; display: grid; place-items: center; text-align: center; font-size: 34px; font-weight: 900; letter-spacing: .1em; color: var(--warn); }
.vC .card.nosig .big small { display: block; font-size: 16px; color: var(--mute); letter-spacing: .08em; }
.vC .card.pending .big { flex: 1; display: grid; place-items: center; text-align: center; gap: 10px; font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
.vC .card.pending .big progress { --size: 54px; --thickness: 6px; }
.vC .card.pending.acted .big { color: var(--ok); }
.vC .card.pending .big small { display: block; font-size: 15px; color: var(--mute); font-weight: 600; }
.vC .card.reply { border-color: var(--accent); }
.vC .card .rtag { font-size: 14px; font-weight: 900; background: var(--accent); color: var(--accent-ink); padding: 1px 7px; border-radius: 3px; letter-spacing: .08em; }
.vC .card.empty { flex: 1 1 auto; display: grid; place-items: center; text-align: center; font-size: 30px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: var(--mute);
  background: radial-gradient(circle at 50% 30%, #23305a, #11152a); border-color: #34407a; }
.vC .card.empty small { display: block; font-size: 18px; font-weight: 600; margin-top: 6px; }

.vC .lower { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; min-height: 0; }
.vC .accsvg { flex: 1; min-height: 0; width: 100%; height: 100%; }
.vC .accsvg text { font-family: var(--cond); font-stretch: condensed; fill: var(--ink); font-weight: 800; }
.vC .accsvg .lbl { font-size: 17px; }
.vC .accsvg .cnt { font-size: 16px; fill: #000; }
.vC .accsvg .dim { fill: #6d7383; }
.vC .legend { display: flex; gap: 16px; padding: 4px 12px 8px; font-size: 15px; color: var(--mute); text-transform: uppercase; letter-spacing: .05em; flex: none; }
.vC .legend i { display: inline-block; width: 30px; vertical-align: middle; margin-right: 6px; border-top: 2px dashed var(--accent); }
.vC .legend i.b { border-top: 6px solid var(--wolf); }

.vC .votes { padding: 10px 14px; display: flex; flex-direction: column; gap: 10px; overflow: auto; }
.vC .vbar { display: grid; grid-template-columns: 170px 1fr 44px; gap: 10px; align-items: center; }
.vC .vbar .who { font-size: 19px; font-weight: 800; line-height: 1.05; }
.vC .vbar .who small { display: block; font-size: 14px; color: var(--mute); font-weight: 600; }
.vC .vbar .trk { height: 30px; background: #000; border-radius: 4px; overflow: hidden; border: 1px solid var(--line); }
.vC .vbar .trk i { display: block; height: 100%; background: linear-gradient(90deg, #ff8a3a, var(--accent)); }
.vC .vbar.ab .trk i { background: repeating-linear-gradient(135deg, #7b8190 0 8px, #5b6070 8px 16px); }
.vC .vbar .n { font-size: 30px; font-weight: 900; text-align: right; }
.vC .vbar.out .who::after { content: "ELIMINATED"; display: inline-block; margin-top: 3px; font-size: 13px; background: var(--wolf); color: #fff; padding: 0 6px; border-radius: 3px; letter-spacing: .08em; }
.vC .outcome { font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; padding: 6px 10px; background: #000; border-left: 5px solid var(--wolf); }
.vC .nodata { color: var(--mute); font-size: 20px; padding: 16px; text-transform: uppercase; letter-spacing: .05em; }

/* right col */
.vC .right-col { display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 10px; min-height: 0; }
.vC .right-col.pub { grid-template-rows: auto minmax(0, 1fr); }
.vC .claims { padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; }
.vC .claims .row { display: flex; align-items: center; gap: 8px; font-size: 18px; flex-wrap: wrap; }
.vC .claims .row b { font-weight: 900; }
.vC .sus { padding: 6px 12px 10px; display: flex; flex-direction: column; gap: 5px; }
.vC .sus .row { display: grid; grid-template-columns: 40px 1fr 52px 58px; gap: 8px; align-items: center; font-size: 18px; }
.vC .sus .row .p { font-weight: 900; }
.vC .sus .row .trk { height: 20px; background: #000; border-radius: 3px; overflow: hidden; }
.vC .sus .row .trk i { display: block; height: 100%; background: var(--village); }
.vC .sus .row.wolf .trk i { background: var(--wolf); }
.vC .sus .row .pct { text-align: right; font-weight: 800; }
.vC .sus .row.isdead { opacity: .65; }
.vC .sus .call { grid-column: 2 / -1; font-size: 13px; font-weight: 900; letter-spacing: .08em; padding: 0 6px; border-radius: 3px; width: fit-content; margin-top: -2px; }
.vC .sus .call.fool { background: var(--wolf); color: #fff; }
.vC .sus .call.wrong { background: var(--village); color: #000; }
.vC .mic { padding: 8px 12px; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.vC .mic h3 { font-size: 16px; color: var(--wolf); letter-spacing: .1em; margin-top: 4px; display: flex; gap: 8px; align-items: center; }
.vC .mic .line { font-size: 18px; line-height: 1.25; padding-left: 10px; border-left: 3px solid #5a1a24; }
.vC .mic .line b { color: #ff8a93; font-weight: 900; }
.vC .mic .act { font-size: 16px; text-transform: uppercase; letter-spacing: .04em; color: var(--mute); display: flex; gap: 8px; flex-wrap: wrap; }
.vC .mic .act span { background: #000; padding: 1px 7px; border-radius: 3px; }
.vC .mic .act .pl { color: #000; background: var(--accent); font-weight: 900; }
.vC .mic .act .save { color: #000; background: var(--ok); font-weight: 900; }

/* lower-third ballots */
.vC .l3 { display: flex; align-items: stretch; min-height: 54px; overflow: hidden; background: #000; border: 2px solid var(--accent); border-radius: 6px; }
.vC .l3 .tag { flex: none; display: grid; place-items: center; padding: 0 16px; background: var(--accent); color: var(--accent-ink); font-weight: 900; font-size: 20px; letter-spacing: .08em; text-transform: uppercase; }
.vC .l3 .track { display: flex; width: max-content; align-items: center; gap: 40px; padding-left: 24px; animation: vc-ticker 45s linear infinite; font-size: 22px; white-space: nowrap; }
.vC .l3 .track b { color: var(--accent); font-weight: 900; }
.vC .l3 .track .ab { color: var(--mute); }
.vC .l3 .track .to { color: #000; background: var(--warn); padding: 0 6px; border-radius: 3px; font-size: 16px; font-weight: 900; }
@media (prefers-reduced-motion: reduce) {
  .vC .l3 .track { animation: none; width: auto; flex-wrap: wrap; white-space: normal; gap: 4px 28px; padding: 6px 16px; font-size: 18px; }
  .vC .l3 .track .dup { display: none; }
}
@media (forced-colors: active) {
  .vC .jersey, .vC .card, .vC .mon, .vC .panel { border: 2px solid CanvasText; }
  .vC .vbar .trk i, .vC .sus .row .trk i { background: Highlight; forced-color-adjust: none; }
}
`;

  function jersey(s, { god, small } = {}) {
    const wolfShown = s.role === "Werewolf" && (god || s.revealed);
    const roleShown = god || s.revealed;
    const cls = ["jersey", wolfShown ? "wolf" : "", s.alive ? "" : "dead"].join(" ");
    const r = roleShown ? `<span class="r ${s.role === "Werewolf" ? "wolf" : ""}">${ROLE_SHORT[s.role]}</span>` : "";
    return `<span class="${cls}" ${small ? 'style="width:38px;height:42px;font-size:19px"' : ""} title="P${s.seat}${s.alive ? "" : " (dead)"}">${s.seat}${r}</span>`;
  }

  function roleTag(role) { return `<span class="role ${role === "Werewolf" ? "wolf" : ""}">${ROLE_SHORT[role]}</span>`; }

  function claimBadge(c, god) {
    if (!c) return "";
    const res = (c.results || []).map((r) => ` · P${r.seat} ${r.side.toUpperCase()}`).join("");
    const truth = god ? (c.true ? "true gv" : "false") : "";
    return `<span class="claimb ${truth}">CLAIM: ${esc(c.role)}${res}</span>`;
  }

  // ---------------- GRID ----------------
  function renderGrid(root, ctx) {
    const god = ctx.godView;
    const tiles = ctx.tiles;
    const live = tiles.filter((t) => t.phase !== "over").length;
    const tickItems = [
      `<b>WEREWOLF LEAGUE</b> ${live} LIVE MATCHES`,
      ...tiles.map((t) => t.phase === "over"
        ? `<b>FINAL</b> ${esc(t.matchId)} · ${t.winner === "wolf" ? "WOLVES" : "VILLAGE"} WIN`
        : `<b>${esc(t.matchId)}</b> ${t.phase === "night" ? "NIGHT" : "DAY"} ${t.n} · ${esc(t.step)} · ${t.alive.length}/${t.seats} ALIVE`),
    ];
    const track = tickItems.map((x) => `<span>${x}</span>`).join("");
    root.innerHTML = `
      <div class="vc-grid">
        <div class="ticker" aria-label="League ticker"><span class="tag">League</span><div class="track">${track}<span class="dup" aria-hidden="true" style="display:contents">${track}</span></div></div>
        <div class="wall-head"><h1 data-focus tabindex="-1">Live Match Wall</h1><span class="mute">${live} live · pick a feed${god ? " · God View on" : ""}</span></div>
        <div class="wall">${tiles.map((t) => monitor(t, god)).join("")}</div>
      </div>`;
    root.querySelectorAll(".mon").forEach((b) => (b.onclick = () => ctx.openMatch(b.dataset.id)));
  }

  function monitor(t, god) {
    const over = t.phase === "over";
    const seats = Array.from({ length: t.seats }, (_, i) => ({
      seat: i + 1, role: t.roles[i], alive: t.alive.includes(i + 1), revealed: !t.alive.includes(i + 1),
    }));
    const phaseName = over ? "Final" : `${t.phase === "night" ? "Night" : "Day"} ${t.n}`;
    const line = t.latestLine
      ? `<span class="who">P${t.latestLine.seat} ${esc(t.latestLine.label)}</span>${esc(t.latestLine.text)}`
      : `<span class="quiet">No speeches yet — ${t.phase === "night" ? "the village sleeps" : "waiting for the first round"}.</span>`;
    const th = t.thinking ? `<span class="th"><progress class="vc-spin" aria-label="${t.thinking} thinking" style="--size:16px;--thickness:3px"></progress>${t.thinking} thinking…</span>` : "";
    const to = t.timeouts ? `<span class="to">⏱ ${t.timeouts} timeout${t.timeouts > 1 ? "s" : ""}</span>` : "";
    const final = over ? `<div class="final ${t.winner === "wolf" ? "wolf" : ""}"><div><div class="k">FINAL · ${t.n} CYCLES</div><div class="w">${t.winner === "wolf" ? "Wolves" : "Village"} win</div></div></div>` : "";
    return `
      <button class="mon ${over ? "over" : t.phase}" data-id="${esc(t.matchId)}" aria-label="Open Match ${esc(t.matchId)}, ${phaseName}">
        <div class="top">
          <div><span class="bug ${over ? "ended" : ""}">${over ? "Ended" : "Live"}</span>
            <div class="mid" style="margin-top:6px">${esc(t.matchId).toUpperCase()}${t.featured ? '<span class="feat">FEATURED</span>' : ""}</div></div>
          <div class="phase"><b>${phaseName}</b><span>${esc(t.step)}</span></div>
        </div>
        <div class="seats">${seats.map((s) => jersey(s, { god, small: true })).join("")}</div>
        <div class="sub">${line}<div class="meta"><span>${t.alive.length}/${t.seats} alive</span>${th}${to}</div></div>
        ${final}
      </button>`;
  }

  // ---------------- MATCH ----------------
  function segmentsFor(st) {
    const segs = [];
    const last = st.days[st.days.length - 1];
    const live = st.inflight?.step;
    for (const d of st.days) {
      const isLast = d === last && st.phase === "day";
      if (d.rounds.A || (isLast && live === "speech_A")) segs.push({ key: `${d.n}A`, day: d, kind: "A", live: !d.rounds.A });
      if (d.rounds.B || (isLast && live === "speech_B")) segs.push({ key: `${d.n}B`, day: d, kind: "B", live: !d.rounds.B });
      if (d.replies.length || (isLast && live === "reply")) segs.push({ key: `${d.n}R`, day: d, kind: "R", live: isLast && live === "reply" });
    }
    return segs;
  }

  function renderMatch(root, ctx) {
    const st = ctx.state, god = ctx.godView;
    if (!st.seats.length) { root.innerHTML = `<div class="vc-match"><h1 data-focus tabindex="-1" style="padding:40px">Match setup…</h1></div>`; return; }
    const S = (n) => st.seats[n - 1];
    const aliveSeats = st.seats.filter((s) => s.alive);
    const wolvesAlive = aliveSeats.filter((s) => s.side === "wolf").length;
    const villAlive = aliveSeats.length - wolvesAlive;

    // segments + selection
    const segs = segmentsFor(st);
    const lastKey = segs.at(-1)?.key;
    if (follow || !segs.some((s) => s.key === sel)) sel = lastKey;
    const seg = segs.find((s) => s.key === sel);

    // scoreboard
    const inf = st.inflight;
    const clock = inf
      ? `<div class="clock">⏱ <b>${fmt(inf.elapsedS)}</b> / ${fmt(inf.deadlineS)}<span class="bar"><i style="width:${Math.min(100, (inf.elapsedS / inf.deadlineS) * 100)}%"></i></span></div>`
      : "";
    const score = `
      <header class="score">
        <button class="back" type="button">◀ Wall</button>
        <div class="team v"><div><div class="nm">${god ? "Village" : "Alive"}</div><div class="lbl">${god ? "village alive" : "players alive"}</div></div><div class="num">${god ? villAlive : aliveSeats.length}</div></div>
        <div class="center"><h1 data-focus tabindex="-1">${esc(st.phaseLabel)}</h1><div class="step">${inf ? esc(st.stepLabel) + " · live" : "Between steps"}</div>${clock}</div>
        <div class="team w"><div class="num">${god ? wolvesAlive : "?"}</div><div><div class="nm">Wolves</div><div class="lbl">${god ? "wolves alive" : "hidden · God View off"}</div></div></div>
        <div class="mid"><span class="bug">Live</span><span class="id">${esc(st.matchId).toUpperCase()} · SEED ${esc(st.seed)}</span></div>
      </header>`;

    // recap
    const chips = [];
    for (let i = 0; i < Math.max(st.nights.length, st.days.length); i++) {
      const n = st.nights[i], d = st.days[i];
      if (n && n.killed !== undefined) {
        const txt = n.killed ? `N${n.n} · P${n.killed} killed · ${S(n.killed).role}` : `N${n.n} · no death`;
        const sv = god && n.saved ? ` <span class="gv">· Doctor saved P${n.saved}</span>` : "";
        chips.push(`<span class="chip n">${esc(txt)}${sv}</span>`);
      }
      if (d) {
        for (const [seat, c] of Object.entries(st.claims)) if (c.day === d.n) chips.push(`<span class="chip d">D${d.n} · P${seat} claims ${esc(c.role)}</span>`);
        if (d.eliminated !== undefined) {
          const votes = d.ballots.filter((b) => b.target === d.eliminated).length;
          chips.push(`<span class="chip d">${d.eliminated ? `D${d.n} · P${d.eliminated} eliminated · ${S(d.eliminated).role} · ${votes} votes` : `D${d.n} · no elimination`}</span>`);
        }
      }
    }
    const recap = `<div class="recap"><span class="k">Previously on…</span>${chips.length ? chips.join("") : '<span class="chip">Match start · roles dealt</span>'}</div>`;

    // seat rail
    const rail = st.seats.map((s) => {
      const f = inf?.seats[s.seat];
      let status = "";
      if (!s.alive) status = `<span class="dead">✕ Dead · ${esc(s.diedAt)}</span>${roleTag(s.role)}`;
      else if (f === "thinking") status = `<progress class="vc-spin" aria-label="P${s.seat} thinking"></progress><span class="think">thinking…</span>`;
      else if (f === "acted") status = `<span class="acted">✓ locked in</span>`;
      else if (f === "timedout") status = `<span class="to">⏱ Timed out</span>`;
      else status = `<span style="color:var(--mute)">waiting</span>`;
      const role = s.alive && god ? roleTag(s.role) : "";
      const c = st.claims[s.seat] ? claimBadge(st.claims[s.seat], god) : "";
      return `<div class="seat ${s.alive ? "" : "isdead"}">${jersey(s, { god })}<div><div class="nm">${esc(s.label)}</div><div class="st">${status}${role}</div>${c ? `<div style="margin-top:4px">${c}</div>` : ""}</div></div>`;
    }).join("");

    // filmstrip
    const segBtns = segs.map((s) => `<button type="button" data-seg="${s.key}" aria-pressed="${s.key === sel}">D${s.day.n} · ${s.kind === "R" ? "Right of Reply" : "Round " + s.kind}${s.live ? '<span class="lv">● live</span>' : ""}</button>`).join("");
    let film = "";
    if (!seg) {
      film = `<div class="card empty"><div>${st.phase === "night" ? `🌙 ${esc(st.phaseLabel)} — the village sleeps` : "Waiting for the first Speech Round"}<small>${inf ? esc(st.stepLabel) + " in progress" : ""}</small></div></div>`;
    } else if (seg.kind === "R") {
      const rc = seg.day.repliers;
      film = seg.day.replies.map((r, i) => `
        <article class="card reply"><div class="hd">${jersey(S(r.seat), { god })}<div><div class="nm">P${r.seat} ${esc(S(r.seat).label)}</div><span class="rtag">Replier ${i + 1} · score ${rc?.scores?.[r.seat] ?? "?"}</span></div></div>
        <div class="txt">${esc(r.text)}</div></article>`).join("");
      if (seg.live && inf) for (const seatN of Object.keys(inf.seats)) film += pendingCard(S(+seatN), inf.seats[seatN], god);
    } else if (seg.live) {
      film = seg.day.order.filter((n) => inf?.seats[n]).map((n) => pendingCard(S(n), inf.seats[n], god)).join("");
    } else {
      const speeches = seg.day.rounds[seg.kind];
      film = speeches.map((sp, i) => {
        const s = S(sp.seat);
        const ord = `<span class="ord">#${i + 1}</span>`;
        if (sp.skipped) return `<article class="card nosig"><div class="hd">${jersey(s, { god })}<div class="nm">P${sp.seat} ${esc(s.label)}</div>${ord}</div><div class="big"><div>No signal<small>⏱ Timed out · speech skipped</small></div></div></article>`;
        const tags = [
          sp.claim ? claimBadge({ ...sp.claim, true: s.role === sp.claim.role }, god) : "",
          ...sp.accuse.map((a) => `<span class="chipx acc">P${a}</span>`),
          ...sp.defend.map((a) => `<span class="chipx def">P${a}</span>`),
        ].join("");
        return `<article class="card"><div class="hd">${jersey(s, { god })}<div class="nm">P${sp.seat} ${esc(s.label)}</div>${ord}</div><div class="txt">${esc(sp.text)}</div>${tags ? `<div class="tags">${tags}</div>` : ""}</article>`;
      }).join("");
    }
    const hint = seg && !seg.live && seg.kind !== "R" ? `<span class="hint">presentation order · from P${seg.day.order[0]}</span>` : "";

    // accusation diagram (for the segment's Day, or the latest Day)
    const accDay = (seg && st.accusations.some((a) => a.day === seg.day.n)) ? seg.day.n : st.accusations.at(-1)?.day;
    const accs = st.accusations.filter((a) => a.day === accDay);
    const accPanel = `<section class="panel"><h2>Who accused whom <span class="s">${accDay ? `Day ${accDay}` : ""}</span></h2>${accs.length ? accSvg(st, accs, god) + `<div class="legend"><span><i></i>Round A</span><span><i class="b"></i>Round B (×2)</span></div>` : `<div class="nodata">No Accusations yet</div>`}</section>`;

    // votes: latest Day with ballots
    const vDay = [...st.days].reverse().find((d) => d.ballots);
    let votePanel, l3 = "";
    if (vDay) {
      const tally = {};
      for (const b of vDay.ballots) tally[b.target] = (tally[b.target] || 0) + 1;
      const max = Math.max(...Object.values(tally));
      const rows = Object.entries(tally).filter(([k]) => k !== "abstain").sort((a, b) => b[1] - a[1]).map(([k, n]) => {
        const s = S(+k);
        return `<div class="vbar ${vDay.eliminated === +k ? "out" : ""}"><div class="who">P${k} ${esc(s.label)}${s.revealed || god ? ` <small>${s.role}</small>` : ""}</div><div class="trk"><i style="width:${(n / max) * 100}%"></i></div><div class="n">${n}</div></div>`;
      });
      if (tally.abstain) {
        const tos = vDay.ballots.filter((b) => b.timedOut).length;
        rows.push(`<div class="vbar ab"><div class="who">Abstain<small>${tos ? `incl. ${tos} timed out` : "chosen"}</small></div><div class="trk"><i style="width:${(tally.abstain / max) * 100}%"></i></div><div class="n">${tally.abstain}</div></div>`);
      }
      const out = vDay.eliminated ? `P${vDay.eliminated} ${esc(S(vDay.eliminated).label)} eliminated — was the ${esc(S(vDay.eliminated).role)}` : "Tie or all Abstain — no elimination";
      votePanel = `<section class="panel"><h2>Vote result <span class="s">Day ${vDay.n}</span></h2><div class="votes">${rows.join("")}<div class="outcome">${out}</div></div></section>`;
      const items = vDay.ballots.map((b) => b.timedOut
        ? `<span><b>P${b.seat}</b> → <span class="ab">ABSTAIN</span> <span class="to">⏱ TIMED OUT</span></span>`
        : `<span><b>P${b.seat}</b> → ${b.target === "abstain" ? '<span class="ab">ABSTAIN</span>' : `<b>P${b.target}</b>`}: ${esc(b.reason)}</span>`).join("");
      l3 = `<div class="l3" aria-label="Day ${vDay.n} ballots"><span class="tag">D${vDay.n} Ballots</span><div class="track">${items}<span class="dup" aria-hidden="true" style="display:contents">${items}</span></div></div>`;
    } else {
      votePanel = `<section class="panel"><h2>Vote result</h2><div class="nodata">${inf?.step === "vote" ? "Ballots are in the box…" : "No vote yet"}</div></section>`;
      l3 = `<div class="l3"><span class="tag">Ballots</span><div class="track" style="animation:none">No ballots yet — votes publish when the Day's vote resolves</div></div>`;
    }

    // right column
    const claimsRows = Object.entries(st.claims).map(([seat, c]) => `<div class="row"><b>P${seat}</b> ${esc(S(+seat).label)} ${claimBadge(c, god)}</div>`).join("");
    const claimsPanel = `<section class="panel"><h2>Claim war</h2><div class="claims">${claimsRows || '<div class="nodata" style="padding:4px 0">No Claims yet</div>'}</div></section>`;
    let right;
    if (god) right = `<div class="right-col">${claimsPanel}${susPanel(st)}${micPanel(st)}</div>`;
    else right = `<div class="right-col pub">${claimsPanel}${heatPanel(st)}</div>`;

    root.innerHTML = `
      <div class="vc-match">
        ${score}
        ${recap}
        <div class="stage">
          <section class="panel"><h2>Seats <span class="s">${aliveSeats.length}/${st.seats.length} alive</span></h2><div class="rail">${rail}</div></section>
          <div class="center-col">
            <div class="segs">${segBtns || ""}${hint}</div>
            <div class="film">${film}</div>
            <div class="lower">${accPanel}${votePanel}</div>
          </div>
          ${right}
        </div>
        ${l3}
      </div>`;

    root.querySelector(".back").onclick = () => ctx.toGrid();
    root.querySelectorAll("[data-seg]").forEach((b) => (b.onclick = () => {
      sel = b.dataset.seg; follow = sel === lastKey;
      api.render(root, ctx);
    }));
  }

  function pendingCard(s, f, god) {
    const body = f === "thinking"
      ? `<progress class="vc-spin" aria-label="P${s.seat} thinking"></progress><div>Thinking…<small>speech publishes when the round resolves</small></div>`
      : f === "acted" ? `<div style="font-size:54px">✓</div><div>Locked in<small>waiting for the rest of the table</small></div>`
      : `<div style="font-size:54px">⏱</div><div>Timed out<small>speech skipped</small></div>`;
    return `<article class="card pending ${f === "acted" ? "acted" : ""} ${f === "timedout" ? "nosig" : ""}"><div class="hd">${jersey(s, { god })}<div class="nm">P${s.seat} ${esc(s.label)}</div></div><div class="big">${body}</div></article>`;
  }

  function accSvg(st, accs, god) {
    const seats = st.seats;
    const W = 600, top = 34, rowH = 40, H = top * 2 + rowH * (seats.length - 1);
    const xl = 175, xr = 425;
    const y = (n) => top + (n - 1) * rowH;
    const score = {};
    for (const a of accs) score[a.to] = (score[a.to] || 0) + (a.round === "B" ? 2 : 1);
    const nodes = seats.map((s) => {
      const fill = (god || s.revealed) && s.role === "Werewolf" ? "#b3121f" : s.alive ? "#4a505e" : "#23262e";
      const dim = s.alive ? "" : "dim";
      return `
        <text class="lbl ${dim}" x="${xl - 26}" y="${y(s.seat) + 6}" text-anchor="end">${esc(s.label)}</text>
        <rect x="${xl - 18}" y="${y(s.seat) - 14}" width="30" height="28" rx="5" fill="${fill}" stroke="#ffffff40"/>
        <text x="${xl - 3}" y="${y(s.seat) + 6}" text-anchor="middle" style="font-size:18px">${s.seat}</text>
        <rect x="${xr - 12}" y="${y(s.seat) - 14}" width="30" height="28" rx="5" fill="${fill}" stroke="#ffffff40"/>
        <text x="${xr + 3}" y="${y(s.seat) + 6}" text-anchor="middle" style="font-size:18px">${s.seat}</text>
        ${score[s.seat] ? `<rect x="${xr + 26}" y="${y(s.seat) - 12}" width="${30 + String(score[s.seat]).length * 8}" height="24" rx="12" fill="#ff5a1f"/><text class="cnt" x="${xr + 41 + String(score[s.seat]).length * 4}" y="${y(s.seat) + 6}" text-anchor="middle">${score[s.seat]}</text>` : ""}
        <text class="lbl ${dim}" x="${xr + 76}" y="${y(s.seat) + 6}">${s.alive ? "" : "✕"}</text>`;
    }).join("");
    const lines = accs.map((a) => {
      const b = a.round === "B";
      return `<path d="M${xl + 14} ${y(a.from)} C ${(xl + xr) / 2} ${y(a.from)}, ${(xl + xr) / 2} ${y(a.to)}, ${xr - 16} ${y(a.to)}"
        fill="none" stroke="${b ? "#ff3b4a" : "#ff5a1f"}" stroke-width="${b ? 5 : 2.5}" ${b ? "" : 'stroke-dasharray="7 5"'} marker-end="url(#vc-arrow-${b ? "b" : "a"})" opacity="${b ? .95 : .85}"/>`;
    }).join("");
    return `<svg class="accsvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Accusations: ${accs.map((a) => `P${a.from} accused P${a.to} in Round ${a.round}`).join(", ")}">
      <defs>
        <marker id="vc-arrow-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ff5a1f"/></marker>
        <marker id="vc-arrow-b" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.4" markerHeight="3.4" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ff3b4a"/></marker>
      </defs>
      <text x="${xl - 3}" y="12" text-anchor="middle" class="dim" style="font-size:12px">ACCUSER</text>
      <text x="${xr + 3}" y="12" text-anchor="middle" class="dim" style="font-size:12px">ACCUSED</text>
      ${lines}${nodes}</svg>`;
  }

  // Public alternative to Table Suspicion: Accusation heat (A ×1, B ×2) across the whole Match.
  function heatPanel(st) {
    const sc = {};
    for (const x of st.accusations) sc[x.to] = (sc[x.to] || 0) + (x.round === "B" ? 2 : 1);
    const ent = Object.entries(sc).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...ent.map((e) => e[1]));
    const rows = ent.map(([k, v]) => { const s = st.seats[k - 1];
      return `<div class="row ${s.alive ? "" : "isdead"}"><span class="p">P${k}</span><span class="trk"><i style="width:${(v / max) * 100}%;background:var(--accent)"></i></span><span class="pct">${v}</span>${s.revealed ? roleTag(s.role) : "<span></span>"}</div>`; }).join("");
    return `<section class="panel"><h2>Accusation heat <span class="s">public · A×1 B×2</span></h2><div class="sus">${rows || '<div class="nodata" style="padding:0">No Accusations yet</div>'}<div class="nodata" style="padding:10px 0 0;font-size:16px">God View off: living roles, Wolf Chat, Night choices and Table Suspicion hidden.</div></div></section>`;
  }

  function susPanel(st) {
    const ent = Object.entries(st.tableSuspicion).map(([k, v]) => ({ s: st.seats[k - 1], v })).sort((a, b) => b.v - a.v);
    if (!ent.length) return `<section class="panel"><h2 class="gv">Who's fooling the table</h2><div class="nodata">Table Suspicion appears after the first vote</div></section>`;
    const wolves = ent.filter((e) => e.s.side === "wolf"), vill = ent.filter((e) => e.s.side !== "wolf");
    const maxV = Math.max(...vill.map((e) => e.v), 0), minW = Math.min(...wolves.map((e) => e.v), 1);
    const rows = ent.map(({ s, v }) => {
      const fool = s.side === "wolf" && v < maxV;
      const wrong = s.side !== "wolf" && v > minW;
      return `<div class="row ${s.side === "wolf" ? "wolf" : ""} ${s.alive ? "" : "isdead"}"><span class="p">P${s.seat}</span><span class="trk"><i style="width:${v * 100}%"></i></span><span class="pct">${Math.round(v * 100)}%</span>${roleTag(s.role)}
        ${fool ? '<span class="call fool">🐺 FOOLING THE TABLE</span>' : ""}${wrong ? `<span class="call wrong">WRONGLY SUSPECTED${s.alive ? "" : " · " + esc(s.diedAt)}</span>` : ""}</div>`;
    }).join("");
    return `<section class="panel"><h2 class="gv">Who's fooling the table <span class="s">Table Suspicion</span></h2><div class="sus">${rows}</div></section>`;
  }

  function micPanel(st) {
    const S = (n) => st.seats[n - 1];
    const live = st.inflight && (st.inflight.step === "wolf_chat" || st.inflight.step === "night_action") && st.phase === "night";
    const blocks = [...st.nights].reverse().map((n) => {
      const lines = n.wolfChat.map((w) => `<div class="line"><b>P${w.seat}</b> ${esc(w.text)}</div>`).join("");
      const acts = n.choices.map((c) => c.kind === "propose_kill" ? `<span>P${c.seat} proposes P${c.target}</span>`
        : c.kind === "inspect" ? `<span>🔍 Seer P${c.seat} → P${c.target}: ${c.result.toUpperCase()}</span>`
        : `<span>✚ Doctor P${c.seat} protects P${c.target}</span>`);
      if (n.leaderPick) acts.push(`<span class="pl">Pack Leader P${n.leaderPick.leader} → P${n.leaderPick.target}</span>`);
      if (n.saved) acts.push(`<span class="save">SAVE · P${n.saved} survives</span>`);
      if (n.killed) acts.push(`<span>☠ P${n.killed} ${esc(S(n.killed).label)} killed</span>`);
      const isLive = live && n === st.nights.at(-1);
      return `<h3>Night ${n.n} · Pack Leader P${n.packLeader}${isLive ? ' <progress class="vc-spin" aria-label="Wolf Chat in progress" style="--size:16px;--thickness:3px"></progress> live' : ""}</h3>${lines || '<div class="act">…</div>'}${acts.length ? `<div class="act">${acts.join("")}</div>` : ""}`;
    }).join("");
    return `<section class="panel"><h2 class="gv">Wolf Chat · hot mic</h2><div class="mic">${blocks || '<div class="nodata">Night 1 has not started</div>'}</div></section>`;
  }

  const api = {
    key: "C",
    name: "Broadcast",
    css,
    render(root, ctx) {
      if (ctx.view === "grid") renderGrid(root, ctx);
      else renderMatch(root, ctx);
    },
  };
  window.VARIANTS.push(api);
})();
