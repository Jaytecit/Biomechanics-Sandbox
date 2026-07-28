/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, PanelRightOpen, PanelRightClose } from 'lucide-react';

interface SandboxMenuProps {
  /** Compact summary when collapsed */
  summary?: string;
  sections: {
    run: ReactNode;
    creature: ReactNode;
    challenge: ReactNode;
    build: ReactNode;
    analyse: ReactNode;
    settings: ReactNode;
  };
  defaultOpen?: boolean;
  /**
   * side = slim column to the right of the visualizer (default).
   * Collapsed width is minimal; open width is content-sized with a tight max.
   */
  placement?: 'side' | 'below';
  /** When true, panel fills parent height and scrolls internally */
  fillHeight?: boolean;
  className?: string;
}

/**
 * Collapsible single-column control drawer.
 * Side placement keeps a narrow rail beside the arena so the visualizer stays primary.
 */
export const SandboxMenu: React.FC<SandboxMenuProps> = ({
  summary = 'Controls',
  sections,
  defaultOpen = false,
  placement = 'side',
  fillHeight = false,
  className = '',
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<'run' | 'creature' | 'challenge' | 'build' | 'analyse' | 'settings'>('challenge');
  const tabContent = sections[tab];
  const tabLabels = {
    run: 'Run',
    creature: 'Creature',
    challenge: 'Goals',
    build: 'Build',
    analyse: 'Analyse',
    settings: 'Tuning',
  } as const;
  const inspector = (
    <>
      <div className="grid grid-cols-3 gap-1 border-b border-slate-100 pb-2" role="tablist" aria-label="Inspector sections">
        {(['run', 'creature', 'challenge', 'build', 'analyse', 'settings'] as const).map(id => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded px-1 py-1.5 text-[9px] font-bold uppercase tracking-wide ${
              tab === id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tabLabels[id]}
          </button>
        ))}
      </div>
      {tabContent}
    </>
  );

  if (placement === 'below') {
    return (
      <div
        className={`bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden ${className}`}
        id="sandbox-collapsible-menu"
      >
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50/90 cursor-pointer transition-colors"
          aria-expanded={open}
        >
          {open ? (
            <PanelRightClose className="w-4 h-4 text-indigo-600 shrink-0" />
          ) : (
            <PanelRightOpen className="w-4 h-4 text-indigo-600 shrink-0" />
          )}
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex-1">
            {open ? 'Hide menu' : 'Open menu'}
          </span>
          {!open && (
            <span className="text-[10px] font-semibold text-slate-500 truncate max-w-[55%] text-right">
              {summary}
            </span>
          )}
        </button>
        {open && (
          <div className="border-t border-slate-100 px-3 pb-3 pt-2 flex flex-col gap-2.5 w-full">
            {inspector}
          </div>
        )}
      </div>
    );
  }

  // --- Side column (right of visualizer) ---
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200/80 shadow-sm flex flex-col shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${
        open ? 'w-[min(100%,420px)]' : 'w-11'
      } ${fillHeight ? 'h-full min-h-0' : ''} ${className}`}
      id="sandbox-collapsible-menu"
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 hover:bg-slate-50/90 cursor-pointer transition-colors shrink-0 ${
          open
            ? 'px-2.5 py-2 border-b border-slate-100 text-left w-full'
            : 'flex-col justify-start gap-2 px-1.5 py-2.5 h-full w-full'
        }`}
        aria-expanded={open}
        title={open ? 'Collapse menu' : summary}
      >
        {open ? (
          <>
            <PanelRightClose className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex-1 truncate">
              Menu
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </>
        ) : (
          <>
            <PanelRightOpen className="w-4 h-4 text-indigo-600 shrink-0" />
            <ChevronLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span
              className="text-[9px] font-bold text-slate-500 uppercase tracking-widest"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              Menu
            </span>
          </>
        )}
      </button>
      {open && (
        <div
          className={`px-2 pb-2 pt-1.5 flex flex-col gap-2 min-w-0 ${
            fillHeight
              ? 'flex-1 min-h-0 overflow-y-auto'
              : 'overflow-y-auto max-h-[calc(100vh-8rem)]'
          }`}
        >
          {inspector}
        </div>
      )}
    </div>
  );
};
