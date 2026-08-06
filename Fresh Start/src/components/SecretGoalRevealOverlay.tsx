/**
 * E5.4 / H4 — Secret discovery reveal + confetti.
 */
import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  secretGoalById,
  type SecretGoalFlavor,
} from '../secrets/definitions';
import type { SecretGoalDiscovery } from '../secrets/progress';

interface SecretGoalRevealOverlayProps {
  discovery: SecretGoalDiscovery | null;
  onDismiss: () => void;
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

export function SecretGoalRevealOverlay({
  discovery,
  onDismiss,
}: SecretGoalRevealOverlayProps) {
  const def = discovery
    ? secretGoalById(discovery.secretGoalId)
    : undefined;

  useEffect(() => {
    if (!def) return;
    fireConfetti(def.flavor);
  }, [def?.id]);

  if (!discovery || !def) return null;

  const flavorLabel =
    def.flavor === 'triumph'
      ? 'Triumph'
      : def.flavor === 'disaster'
        ? 'Disaster'
        : 'Mishap';

  return (
    <div
      className="secret-reveal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="secret-goal-reveal-title"
    >
      <div className={`secret-reveal-panel flavor-${def.flavor}`}>
        <button
          type="button"
          className="secret-reveal-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
        <p className="secret-reveal-eyebrow">Secret Goal Discovered · {flavorLabel}</p>
        <h2 id="secret-goal-reveal-title">{def.title}</h2>
        <p className="secret-reveal-desc">{def.description}</p>
        <p className="secret-reveal-meta muted">
          <span>{discovery.modelName}</span>
          {' · '}
          {discovery.context === 'evolve' ? 'Evolve' : 'Replay'}
          {discovery.generation !== undefined && ` · Gen ${discovery.generation}`}
        </p>
        <button type="button" className="secret-reveal-collect" onClick={onDismiss}>
          Collect Trophy
        </button>
      </div>
    </div>
  );
}
