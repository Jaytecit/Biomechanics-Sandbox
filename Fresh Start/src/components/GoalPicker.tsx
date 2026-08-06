import type { GoalDef, GoalId } from '../goals/catalog';

interface Props {
  goals: GoalDef[];
  selectedId: GoalId;
  onSelect: (id: GoalId) => void;
  /** Compact single-row variant for Train status. */
  compact?: boolean;
}

/** B5 — trainable goal picker. */
export function GoalPicker({ goals, selectedId, onSelect, compact }: Props) {
  return (
    <div className={compact ? 'button-row wrap goal-picker-compact' : 'button-row wrap'}>
      {goals.map((g) => (
        <button
          key={g.id}
          type="button"
          className={selectedId === g.id ? 'active' : ''}
          onClick={() => onSelect(g.id)}
          title={g.blurb}
        >
          {g.title}
        </button>
      ))}
    </div>
  );
}
