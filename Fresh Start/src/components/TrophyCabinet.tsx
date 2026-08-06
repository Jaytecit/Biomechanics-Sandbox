import { useState } from 'react';
import {
  SECRET_CATEGORIES,
  SECRET_GOALS,
  type SecretGoalCategory,
  type SecretGoalFlavor,
} from '../secrets/definitions';
import type { SecretGoalDiscovery } from '../secrets/progress';

interface Props {
  discoveries: SecretGoalDiscovery[];
}

function flavorClass(flavor: SecretGoalFlavor): string {
  return `trophy-flavor trophy-flavor-${flavor}`;
}

function categoryLabel(category: SecretGoalCategory | 'all'): string {
  if (category === 'all') return 'All';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/** B11 / E5.5 — discovery trophy cabinet with category filters. */
export function TrophyCabinet({ discoveries }: Props) {
  const [category, setCategory] = useState<SecretGoalCategory | 'all'>('all');
  const found = new Map(discoveries.map((d) => [d.secretGoalId, d]));
  const n = discoveries.length;
  const total = SECRET_GOALS.length;

  const visible =
    category === 'all'
      ? SECRET_GOALS
      : SECRET_GOALS.filter((def) => def.category === category);

  const visibleFound = visible.filter((def) => found.has(def.id)).length;

  return (
    <div className="trophy-cabinet">
      <h3 className="subhead">
        Discoveries ({n}/{total})
      </h3>
      <div className="trophy-filters">
        <button
          type="button"
          className={category === 'all' ? 'active' : undefined}
          onClick={() => setCategory('all')}
        >
          All ({n}/{total})
        </button>
        {SECRET_CATEGORIES.map((cat) => {
          const catTotal = SECRET_GOALS.filter((g) => g.category === cat).length;
          const catFound = SECRET_GOALS.filter(
            (g) => g.category === cat && found.has(g.id),
          ).length;
          return (
            <button
              key={cat}
              type="button"
              className={category === cat ? 'active' : undefined}
              onClick={() => setCategory(cat)}
            >
              {categoryLabel(cat)} ({catFound}/{catTotal})
            </button>
          );
        })}
      </div>
      {category !== 'all' && (
        <p className="hint muted" style={{ margin: '0.25rem 0 0' }}>
          Showing {visibleFound}/{visible.length} in {categoryLabel(category)}
        </p>
      )}
      <div className="trophy-grid">
        {visible.map((def) => {
          const entry = found.get(def.id);
          const unlocked = !!entry;
          return (
            <div
              key={def.id}
              className={
                unlocked
                  ? `trophy-tile unlocked ${flavorClass(def.flavor)}`
                  : 'trophy-tile locked'
              }
              title={
                unlocked
                  ? `${def.description}${entry?.activeTask ? ` · ${entry.activeTask}` : ''}`
                  : 'Locked secret trophy'
              }
            >
              <span className="trophy-title">
                {unlocked ? def.title : '???'}
              </span>
              {unlocked && (
                <span className="trophy-meta">
                  {def.category} · {def.flavor}
                  {entry?.discoveredAt
                    ? ` · ${entry.discoveredAt.slice(0, 10)}`
                    : ''}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
