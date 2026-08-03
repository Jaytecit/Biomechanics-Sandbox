import { useId, type ReactNode } from 'react';

interface Props {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}

/** B2 — accessible collapsible section header + body. */
export function CollapsiblePanel({
  title,
  open,
  onToggle,
  children,
  className,
}: Props) {
  const panelId = useId();
  return (
    <section className={className ? `collapsible-panel ${className}` : 'collapsible-panel'}>
      <button
        type="button"
        className="collapsible-panel-header"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span>{title}</span>
        <span className="collapsible-chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div id={panelId} className="collapsible-panel-body">
          {children}
        </div>
      )}
    </section>
  );
}
