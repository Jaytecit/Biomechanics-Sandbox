/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { HelpCircle, Sparkles, Skull, AlertTriangle } from 'lucide-react';
import { GOAL_CATEGORY_LABELS, GoalCategory } from '../goalCatalog';
import {
  SECRET_GOALS,
  SECRET_GOAL_COUNT,
  SecretGoalDefinition,
  SecretGoalFlavor,
} from '../secretGoals';
import { loadSecretDiscoveries, SecretGoalDiscovery } from '../secretGoalProgress';

const CATEGORY_ORDER: GoalCategory[] = [
  'locomotion',
  'shuffle',
  'jump',
  'flight',
  'climb',
  'object',
  'motor',
  'sports',
  'precision',
  'custom',
];

function slotFlavorIcon(flavor: SecretGoalFlavor) {
  if (flavor === 'triumph') return <Sparkles className="w-3.5 h-3.5 text-amber-400" />;
  if (flavor === 'disaster') return <Skull className="w-3.5 h-3.5 text-red-400" />;
  return <AlertTriangle className="w-3.5 h-3.5 text-purple-400" />;
}

interface SecretTrophiesPanelProps {
  variant?: 'sandbox' | 'arena';
  /** Bump to reload discoveries from localStorage */
  refreshKey?: number;
}

export const SecretTrophiesPanel: React.FC<SecretTrophiesPanelProps> = ({
  variant = 'arena',
  refreshKey = 0,
}) => {
  const discoveries = useMemo(() => loadSecretDiscoveries(), [refreshKey]);
  const discoveredCount = Object.keys(discoveries).length;

  const byCategory = useMemo(() => {
    const map = new Map<GoalCategory, SecretGoalDefinition[]>();
    for (const cat of CATEGORY_ORDER) {
      map.set(
        cat,
        SECRET_GOALS.filter(g => g.category === cat)
      );
    }
    return map;
  }, []);

  const isArena = variant === 'arena';

  return (
    <div className="flex flex-col gap-3">
      <p className={`text-sm ${isArena ? 'text-[var(--arena-crowd)]' : 'text-slate-600'}`}>
        {discoveredCount} / {SECRET_GOAL_COUNT} discovered
      </p>

      {CATEGORY_ORDER.map(cat => {
        const goals = byCategory.get(cat) ?? [];
        return (
          <section key={cat}>
            <h4
              className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${
                isArena ? 'text-[var(--arena-gold)]' : 'text-amber-700'
              }`}
            >
              {GOAL_CATEGORY_LABELS[cat]}
            </h4>
            <ul className="grid grid-cols-2 gap-1.5">
              {goals.map(goal => {
                const entry: SecretGoalDiscovery | undefined = discoveries[goal.id];
                const discovered = !!entry;
                return (
                  <li
                    key={goal.id}
                    className={`rounded-lg border px-2 py-1.5 min-h-[52px] ${
                      discovered
                        ? isArena
                          ? 'border-[var(--arena-mint)]/40 bg-[var(--arena-mint)]/5'
                          : 'border-amber-300 bg-amber-50'
                        : isArena
                          ? 'border-[var(--arena-line)] bg-black/20'
                          : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    {discovered ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          {slotFlavorIcon(goal.flavor)}
                          <span
                            className={`text-[11px] font-bold truncate ${
                              isArena ? 'text-[var(--arena-spot)]' : 'text-slate-800'
                            }`}
                          >
                            {goal.title}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] truncate ${
                            isArena ? 'text-[var(--arena-crowd)]' : 'text-slate-500'
                          }`}
                        >
                          {entry!.modelName}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full min-h-[36px]">
                        <HelpCircle
                          className={`w-5 h-5 ${
                            isArena ? 'text-[var(--arena-crowd)]/50' : 'text-slate-300'
                          }`}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
};

/** Tab label for Arena side rail */
export function secretTrophiesTabLabel(refreshKey = 0): string {
  void refreshKey;
  const discoveries = loadSecretDiscoveries();
  return Object.keys(discoveries).length > 0 ? 'Secret Trophies' : '?';
}
