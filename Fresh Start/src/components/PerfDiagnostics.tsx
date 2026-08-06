interface Props {
  fps: number;
  frameMs: number;
  open: boolean;
  onToggle: () => void;
}

/** B9 — performance diagnostics. */
export function PerfDiagnostics({ fps, frameMs, open, onToggle }: Props) {
  return (
    <section className="collapsible-panel">
      <button
        type="button"
        className="collapsible-panel-header"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>Diagnostics</span>
        <span className="collapsible-chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="collapsible-panel-body">
          <ul className="stats">
            <li>FPS: {fps.toFixed(0)}</li>
            <li>Frame: {frameMs.toFixed(1)} ms</li>
          </ul>
          <p className="hint muted">Render loop only — not physics step cost.</p>
        </div>
      )}
    </section>
  );
}
