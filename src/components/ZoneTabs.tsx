/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Bird, Car, Footprints, ArrowUpToLine, Sparkles } from 'lucide-react';
import { ArenaZoneId, ARENA_ZONES, ZONE_ORDER } from '../zones';

const ZONE_ICONS: Record<ArenaZoneId, React.ReactNode> = {
  flying: <Bird className="w-3.5 h-3.5" />,
  motor: <Car className="w-3.5 h-3.5" />,
  walking: <Footprints className="w-3.5 h-3.5" />,
  jumping: <ArrowUpToLine className="w-3.5 h-3.5" />,
  free: <Sparkles className="w-3.5 h-3.5" />,
};

interface ZoneTabsProps {
  activeZone: ArenaZoneId;
  onSelectZone: (zone: ArenaZoneId) => void;
  /** Hide description line (fullscreen) */
  compact?: boolean;
}

export const ZoneTabs: React.FC<ZoneTabsProps> = ({ activeZone, onSelectZone, compact = false }) => {
  const zone = ARENA_ZONES[activeZone];
  return (
    <div className={`flex flex-col ${compact ? 'gap-0' : 'gap-1.5'}`} id="arena-zone-tabs">
      <div className="flex flex-wrap gap-1.5">
        {ZONE_ORDER.map(id => {
          const z = ARENA_ZONES[id];
          const active = id === activeZone;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectZone(id)}
              title={z.description}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                active
                  ? z.activeTabClass + ' shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {ZONE_ICONS[id]}
              {z.shortLabel}
            </button>
          );
        })}
      </div>
      {!compact && (
        <p className={`text-[10px] font-medium leading-snug ${zone.accentClass}`}>{zone.description}</p>
      )}
    </div>
  );
};
