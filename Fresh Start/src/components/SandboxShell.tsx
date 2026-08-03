import {
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

export type SandboxTabId = 'zone' | 'creatures' | 'edit' | 'train' | 'world';

export interface SandboxTab {
  id: SandboxTabId;
  label: string;
  content: ReactNode;
}

interface Props {
  tabs: SandboxTab[];
  activeTab: SandboxTabId;
  onActiveTabChange: (id: SandboxTabId) => void;
  viewport: ReactNode;
  /** Simulate-mode train/evolve chrome overlaid under the ground band. */
  dock?: ReactNode | null;
  dockCollapsed: boolean;
  onDockCollapsedChange: (collapsed: boolean) => void;
  /** Reports dock height in CSS px for camera bottom inset. */
  onDockHeightChange?: (heightPx: number) => void;
}

/** B3 — left exclusive tabs + optional bottom dock over the viewport. */
export function SandboxShell({
  tabs,
  activeTab,
  onActiveTabChange,
  viewport,
  dock,
  dockCollapsed,
  onDockCollapsedChange,
  onDockHeightChange,
}: Props) {
  const dockRef = useRef<HTMLDivElement>(null);
  const showDock = dock != null;

  useEffect(() => {
    if (!showDock) {
      onDockHeightChange?.(0);
      return;
    }
    const el = dockRef.current;
    if (!el) return;

    const report = () => {
      onDockHeightChange?.(el.getBoundingClientRect().height);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showDock, dockCollapsed, onDockHeightChange]);

  // Re-measure when dock body content swaps (summary ↔ full) without tearing down RO.
  useEffect(() => {
    if (!showDock || !dockRef.current) return;
    onDockHeightChange?.(dockRef.current.getBoundingClientRect().height);
  }, [dock, showDock, onDockHeightChange]);

  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <div className="main sandbox-shell">
      <aside className="sandbox-sidebar">
        <div className="tab-rail" role="tablist" aria-label="Sandbox panels">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === active?.id}
              className={tab.id === active?.id ? 'active' : ''}
              onClick={() => onActiveTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div
          className="tab-panel"
          role="tabpanel"
          aria-label={active?.label ?? 'Panel'}
        >
          {active?.content}
        </div>
      </aside>

      <div className="viewport">
        {viewport}
        {showDock && (
          <div
            ref={dockRef}
            className={
              dockCollapsed ? 'bottom-dock bottom-dock-collapsed' : 'bottom-dock'
            }
          >
            <div className="bottom-dock-bar">
              <span className="bottom-dock-label">Train</span>
              <button
                type="button"
                className="bottom-dock-toggle"
                aria-expanded={!dockCollapsed}
                onClick={() => onDockCollapsedChange(!dockCollapsed)}
              >
                {dockCollapsed ? 'Expand ▴' : 'Collapse ▾'}
              </button>
            </div>
            <div className="bottom-dock-body">{dock}</div>
          </div>
        )}
      </div>
    </div>
  );
}
