// PROTOTYPE switcher: ?variant=A..D, ?view=grid|match, ?god=0|1, ?t=<event cursor>.
// Each variant registers { key, name, css, render(root, ctx) } on window.VARIANTS.
(() => {
  const { derive, grid, EVENTS } = window.PROTO;
  const V = window.VARIANTS.sort((a, b) => a.key.localeCompare(b.key));
  const $ = (id) => document.getElementById(id);
  const app = $("app");

  for (const v of V) {
    const style = document.createElement("style");
    style.dataset.variantCss = v.key;
    style.textContent = v.css || "";
    document.head.append(style);
  }

  const params = () => new URLSearchParams(location.search);
  function read() {
    const p = params();
    const key = V.some((v) => v.key === p.get("variant")) ? p.get("variant") : V[0]?.key;
    const t = Math.min(Math.max(parseInt(p.get("t") ?? EVENTS.length, 10) || EVENTS.length, 1), EVENTS.length);
    return { key, view: p.get("view") === "match" ? "match" : "grid", god: p.get("god") !== "0", t };
  }
  function write(patch) {
    const p = params();
    for (const [k, v] of Object.entries(patch)) p.set(k, String(v));
    history.replaceState(null, "", `?${p}`);
  }

  function render({ focus = false } = {}) {
    const { key, view, god, t } = read();
    const v = V.find((x) => x.key === key);
    const state = derive(t);
    const tiles = grid(t);
    // Public view: during a Night step, who is acting reveals roles, so with God View off
    // every living Player shows as thinking ("the village sleeps").
    if (!god && state.inflight && (state.inflight.step === "wolf_chat" || state.inflight.step === "night_action")) {
      state.inflight.seats = Object.fromEntries(state.alive.map((s) => [s, "thinking"]));
      tiles[0].thinking = state.alive.length;
    }
    const ctx = {
      view, godView: god, state, tiles, cursor: t,
      // Every tile opens the one Match that has a real fake log.
      openMatch: () => go({ view: "match" }),
      toGrid: () => go({ view: "grid" }),
    };
    document.body.dataset.variant = key;
    document.body.dataset.view = view;
    app.dataset.variant = key;
    app.dataset.view = view;
    app.className = `v${key}`;
    app.replaceChildren();
    if (v) v.render(app, ctx);
    else app.textContent = "No variants registered.";

    $("pb-label").textContent = v ? `${v.key} · ${v.name}` : "—";
    $("pb-view").textContent = view === "grid" ? "→ Match view" : "→ Match grid";
    $("pb-godview").checked = god;
    $("pb-cursor").max = EVENTS.length;
    $("pb-cursor").value = t;
    $("pb-seq").textContent = `event ${t}/${EVENTS.length}`;
    $("pb-dump").querySelector("pre").textContent = JSON.stringify(
      { variant: key, view, godView: god, cursor: t, lastEvent: EVENTS[t - 1], state }, null, 2);
    if (focus) (app.querySelector("[data-focus]") || app).focus({ preventScroll: true });
  }

  // View-transition wrapper with fallback (progressive enhancement).
  function go(patch, { animate = true } = {}) {
    write(patch);
    if (!animate || !document.startViewTransition) return render({ focus: true });
    const vt = document.startViewTransition(() => render());
    vt.finished.finally(() => (app.querySelector("[data-focus]") || app).focus({ preventScroll: true }));
  }

  const cycle = (d) => {
    const i = V.findIndex((v) => v.key === read().key);
    go({ variant: V[(i + d + V.length) % V.length].key });
  };
  $("pb-prev").onclick = () => cycle(-1);
  $("pb-next").onclick = () => cycle(1);
  $("pb-view").onclick = () => go({ view: read().view === "grid" ? "match" : "grid" });
  $("pb-godview").onchange = (e) => go({ god: e.target.checked ? 1 : 0 }, { animate: false });
  $("pb-cursor").oninput = (e) => go({ t: e.target.value }, { animate: false });

  let timer = null;
  $("pb-play").onclick = () => {
    if (timer) { clearInterval(timer); timer = null; $("pb-play").textContent = "▶︎ play"; return; }
    if (read().t >= EVENTS.length) write({ t: 1 });
    $("pb-play").textContent = "❚❚ pause";
    timer = setInterval(() => {
      const t = read().t + 1;
      if (t > EVENTS.length) return $("pb-play").click();
      go({ t }, { animate: false });
    }, 900);
  };

  document.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const el = document.activeElement;
    if (el && (el.matches("input, textarea, select") || el.isContentEditable)) return;
    e.preventDefault();
    cycle(e.key === "ArrowLeft" ? -1 : 1);
  });
  // Variants that draw links from DOM measurements re-render on resize.
  let rz;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => render(), 120); });

  render();
})();
