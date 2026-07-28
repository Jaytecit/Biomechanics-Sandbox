/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
  id?: string;
  title: string;
  icon?: ReactNode;
  /** Short value shown when collapsed */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  id,
  title,
  icon,
  summary,
  defaultOpen = false,
  children,
  className = '',
}) => {
  const [open, setOpen] = useState(defaultOpen);

  // When the active selection moves into this section, expand it.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  return (
    <div
      id={id}
      className={`rounded-lg border border-slate-100 overflow-hidden bg-white ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50/80 cursor-pointer transition-colors"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
        {icon && <span className="shrink-0 text-indigo-500">{icon}</span>}
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex-1 truncate">
          {title}
        </span>
        {!open && summary && (
          <span className="text-[10px] font-semibold text-slate-700 truncate max-w-[45%] text-right">
            {summary}
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-3 pt-1 border-t border-slate-50">{children}</div>}
    </div>
  );
};
