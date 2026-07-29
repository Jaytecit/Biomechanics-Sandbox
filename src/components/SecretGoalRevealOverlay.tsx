/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles, Skull, AlertTriangle, X } from 'lucide-react';
import { secretGoalById, SecretGoalFlavor, SecretGoalId } from '../secretGoals';
import type { SecretGoalDiscovery } from '../secretGoalProgress';

interface SecretGoalRevealOverlayProps {
  discovery: SecretGoalDiscovery | null;
  onDismiss: () => void;
  variant?: 'sandbox' | 'arena';
}

function fireConfetti(flavor: SecretGoalFlavor): void {
  const base = { origin: { y: 0.65 }, zIndex: 9999 };
  if (flavor === 'triumph') {
    confetti({
      ...base,
      particleCount: 120,
      spread: 72,
      startVelocity: 42,
      colors: ['#fbbf24', '#f59e0b', '#fcd34d', '#ffffff'],
    });
    window.setTimeout(() => {
      confetti({ ...base, particleCount: 60, spread: 100, scalar: 0.9 });
    }, 180);
  } else if (flavor === 'disaster') {
    confetti({
      ...base,
      particleCount: 90,
      spread: 55,
      startVelocity: 38,
      colors: ['#ef4444', '#991b1b', '#6b7280', '#374151'],
    });
  } else {
    confetti({
      ...base,
      particleCount: 80,
      spread: 65,
      startVelocity: 35,
      colors: ['#a855f7', '#f97316', '#fbbf24', '#94a3b8'],
    });
  }
}

function FlavorIcon({ flavor }: { flavor: SecretGoalFlavor }) {
  if (flavor === 'triumph') return <Sparkles className="w-8 h-8 text-amber-400" />;
  if (flavor === 'disaster') return <Skull className="w-8 h-8 text-red-400" />;
  return <AlertTriangle className="w-8 h-8 text-purple-400" />;
}

export const SecretGoalRevealOverlay: React.FC<SecretGoalRevealOverlayProps> = ({
  discovery,
  onDismiss,
  variant = 'sandbox',
}) => {
  const def = discovery ? secretGoalById(discovery.secretGoalId as SecretGoalId) : undefined;

  useEffect(() => {
    if (!def) return;
    fireConfetti(def.flavor);
  }, [def?.id]);

  if (!discovery || !def) return null;

  const panelClass =
    variant === 'arena'
      ? 'bg-[var(--arena-panel)] border-[var(--arena-gold)] text-[var(--arena-spot)]'
      : 'bg-white border-amber-400 text-slate-900';

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="secret-goal-reveal-title"
    >
      <div
        className={`relative max-w-md w-full rounded-2xl border-2 shadow-2xl p-6 ${panelClass}`}
      >
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg opacity-60 hover:opacity-100 cursor-pointer"
          aria-label="Dismiss"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center gap-3">
          <FlavorIcon flavor={def.flavor} />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">
            Secret Goal Discovered
          </p>
          <h2 id="secret-goal-reveal-title" className="text-2xl font-bold">
            {def.title}
          </h2>
          <p className="text-sm leading-relaxed opacity-90">{def.description}</p>
          <div className="mt-2 text-xs opacity-70">
            <span className="font-semibold">{discovery.modelName}</span>
            {' · '}
            {discovery.context === 'arena' ? 'Arena heat' : 'Sandbox'}
            {discovery.generation !== undefined && ` · Gen ${discovery.generation}`}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className={`mt-3 px-5 py-2 rounded-lg font-bold text-sm cursor-pointer ${
              variant === 'arena'
                ? 'bg-[var(--arena-gold)] text-black hover:brightness-110'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            Collect Trophy
          </button>
        </div>
      </div>
    </div>
  );
};
