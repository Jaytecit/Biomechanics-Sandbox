import type { EnvironmentPackage } from '../library/environmentPackages';

interface Props {
  packages: EnvironmentPackage[];
  /** Saved package id, or null when the active design is an unsaved studio draft. */
  selectedPackageId: string | null;
  activeName: string;
  disabled?: boolean;
  onSelect: (pkg: EnvironmentPackage) => void;
  compact?: boolean;
}

/** B14 / F4 — pick the environment used for simulation / training. */
export function EnvPicker({
  packages,
  selectedPackageId,
  activeName,
  disabled,
  onSelect,
  compact,
}: Props) {
  const value = selectedPackageId ?? '__studio__';

  return (
    <div className={compact ? 'env-picker env-picker-compact' : 'env-picker'}>
      <label className="field-row">
        <span>Env</span>
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const id = e.target.value;
            if (id === '__studio__') return;
            const pkg = packages.find((p) => p.id === id);
            if (pkg) onSelect(pkg);
          }}
          title="Environment for the sim / training course"
        >
          {selectedPackageId == null && (
            <option value="__studio__">Studio draft</option>
          )}
          {packages.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.displayName}
              {pkg.source === 'builtin' ? ' ★' : ''}
              {pkg.environment.obstacles.length > 0
                ? ` (${pkg.environment.obstacles.length})`
                : ''}
              {pkg.environment.terrain ? ' · hills' : ''}
              {pkg.environment.tower ? ' · tower' : ''}
            </option>
          ))}
        </select>
      </label>
      {!compact && (
        <p className="hint muted truncate" title={activeName}>
          Active: {activeName}
        </p>
      )}
    </div>
  );
}
