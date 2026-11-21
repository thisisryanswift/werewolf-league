// The grid header's help buttons: "How to play" and "About", each opening its
// own <dialog> over the live grid. The copy comes from docs/help/*.md. Esc and
// a backdrop click close a dialog natively (closedby="any"), with a click
// fallback for browsers without closedby; showModal() returns focus to the
// button on close.
import { Fragment, memo, useId, useMemo, useRef, type MouseEvent } from "react";
import about from "../../docs/help/about.md?raw";
import howToPlay from "../../docs/help/how-to-play.md?raw";
import { helpDoc, type Inline } from "./markdown";
import "./help.css";

const closedBySupported = typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype;

export const HelpButtons = memo(function HelpButtons({ landed }: { landed: ReadonlySet<string> }) {
  return (
    <>
      <HelpModal label="? How to play" markdown={howToPlay} landed={landed} testId="help-how-to-play" />
      <HelpModal label="About" markdown={about} landed={landed} testId="help-about" />
    </>
  );
});

function HelpModal({ label, markdown, landed, testId }: { label: string; markdown: string; landed: ReadonlySet<string>; testId: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const doc = useMemo(() => helpDoc(markdown, landed), [markdown, landed]);

  const open = () => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  };
  // Light dismiss for browsers without closedby: a click on the backdrop targets the dialog itself.
  const backdrop = (e: MouseEvent<HTMLDialogElement>) => {
    const d = e.currentTarget;
    if (closedBySupported || e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right) return;
    d.close();
  };

  return (
    <>
      <button type="button" className="lg-help" aria-haspopup="dialog" data-testid={testId} onClick={open}>
        {label}
      </button>
      <dialog ref={ref} className="lg-dialog lg-help-dialog" aria-labelledby={titleId} data-testid={`${testId}-modal`} onClick={backdrop} {...({ closedby: "any" } as object)}>
        <header className="lg-help-bar">
          <h2 id={titleId}>{doc.title}</h2>
          <button type="button" className="lg-help-close" onClick={() => ref.current?.close()}>
            Close ✕
          </button>
        </header>
        <div className="lg-help-body">
          {doc.blocks.map((b, i) =>
            b.kind === "h2" ? (
              <h3 key={i}>
                <Runs runs={b.text} />
              </h3>
            ) : b.kind === "p" ? (
              <p key={i}>
                {b.lines.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    <Runs runs={l} />
                  </Fragment>
                ))}
              </p>
            ) : (
              <List key={i} ordered={b.kind === "ol"} items={b.items} />
            ),
          )}
        </div>
      </dialog>
    </>
  );
}

function List({ ordered, items }: { ordered: boolean; items: Inline[][] }) {
  const lis = items.map((it, i) => (
    <li key={i}>
      <Runs runs={it} />
    </li>
  ));
  return ordered ? <ol>{lis}</ol> : <ul>{lis}</ul>;
}

function Runs({ runs }: { runs: Inline[] }) {
  return runs.map((r, i) =>
    r.href ? (
      <a key={i} href={r.href} target="_blank" rel="noreferrer">
        {r.text}
      </a>
    ) : r.bold ? (
      <b key={i}>{r.text}</b>
    ) : (
      <Fragment key={i}>{r.text}</Fragment>
    ),
  );
}
