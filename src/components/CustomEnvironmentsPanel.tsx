import React, { ChangeEvent, useMemo, useState } from 'react';
import {
  Download,
  Map,
  Pencil,
  Play,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';
import {
  EnvironmentPackage,
  deleteEnvironment,
  exportEnvironment,
  importEnvironment,
  loadEnvironments,
  saveEnvironment,
  validateEnvironment,
} from '../environments';
import { getGoalInfo } from '../goalCatalog';

interface CustomEnvironmentsPanelProps {
  activeEnvironmentId: string | null;
  onTrain: (environment: EnvironmentPackage) => void;
  onEditInStudio: (environment: EnvironmentPackage) => void;
  onOpenEnvironmentStudio: () => void;
  refreshToken?: number;
  onEnvironmentsChanged?: () => void;
}

export const CustomEnvironmentsPanel: React.FC<CustomEnvironmentsPanelProps> = ({
  activeEnvironmentId,
  onTrain,
  onEditInStudio,
  onOpenEnvironmentStudio,
  refreshToken = 0,
  onEnvironmentsChanged,
}) => {
  const [message, setMessage] = useState('');
  const environments = useMemo(() => {
    void refreshToken;
    return loadEnvironments().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [refreshToken]);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = importEnvironment(await file.text());
    if (!result.ok || !result.value) {
      setMessage(result.error ?? 'Import failed.');
      return;
    }
    const saved = saveEnvironment(result.value);
    setMessage(saved.ok ? `Imported ${saved.value!.name}.` : saved.error ?? 'Save failed.');
    if (saved.ok) onEnvironmentsChanged?.();
  };

  const handleDelete = (environment: EnvironmentPackage) => {
    if (!window.confirm(`Delete "${environment.name}" permanently?`)) return;
    if (deleteEnvironment(environment.id)) {
      setMessage(`Deleted ${environment.name}.`);
      onEnvironmentsChanged?.();
    } else {
      setMessage('Could not delete environment.');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 shrink-0">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Map className="h-5 w-5 text-violet-600" />
            Custom environments
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Train creatures on courses you authored in Environment Studio. Custom worlds are separate from
            the main scenario sandbox — goals, creatures, and evolution work the same, but geometry comes
            from your saved package.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenEnvironmentStudio}
            className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-900"
          >
            <Wrench className="mr-1 inline h-3.5 w-3.5" />
            Environment Studio
          </button>
          <label className="cursor-pointer rounded-lg border px-3 py-2 text-xs font-bold text-slate-700">
            <Upload className="mr-1 inline h-3.5 w-3.5" />
            Import JSON
            <input type="file" className="hidden" accept=".json" onChange={handleImport} />
          </label>
        </div>
      </div>

      {environments.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <Map className="mb-3 h-10 w-10 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">No saved environments yet</p>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            Open Environment Studio, build a course, and click Save. It will appear here for training.
          </p>
          <button
            type="button"
            onClick={onOpenEnvironmentStudio}
            className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white"
          >
            Create an environment
          </button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {environments.map(environment => {
              const errors = validateEnvironment(environment);
              const isActive = activeEnvironmentId === environment.id;
              const terrainCount = environment.obstacles.filter(o => o.type === 'terrain').length;
              const goalLabel = environment.goal ? getGoalInfo(environment.goal).shortLabel : 'Any goal';
              return (
                <article
                  key={environment.id}
                  className={`rounded-xl border p-3 shadow-xs ${
                    isActive ? 'border-violet-400 bg-violet-50/70' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-slate-900">{environment.name}</h3>
                      <p className="text-[11px] text-slate-500">
                        r{environment.revision} · {environment.obstacles.length} geometry
                        {terrainCount > 0 ? ` · ${terrainCount} terrain` : ''}
                        {environment.worldObjects.length > 0 ? ` · ${environment.worldObjects.length} objects` : ''}
                      </p>
                    </div>
                    {isActive && (
                      <span className="shrink-0 rounded bg-violet-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-600">
                    Theme <span className="font-semibold capitalize">{environment.theme}</span>
                    {' · '}
                    Goal <span className="font-semibold">{goalLabel}</span>
                  </p>
                  {errors.length > 0 ? (
                    <p className="mt-2 text-[11px] text-red-700">{errors[0]}</p>
                  ) : (
                    <p className="mt-2 text-[11px] text-emerald-700">Valid environment</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={errors.length > 0}
                      onClick={() => onTrain(environment)}
                      className="rounded bg-violet-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                    >
                      <Play className="mr-1 inline h-3 w-3" />
                      Train here
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditInStudio(environment)}
                      className="rounded border px-2.5 py-1.5 text-[11px] font-bold text-slate-700"
                    >
                      <Pencil className="mr-1 inline h-3 w-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([exportEnvironment(environment)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const anchor = document.createElement('a');
                        anchor.href = url;
                        anchor.download = `${environment.name.replace(/\W+/g, '_')}.environment.json`;
                        anchor.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="rounded border px-2.5 py-1.5 text-[11px] font-bold text-slate-700"
                    >
                      <Download className="mr-1 inline h-3 w-3" />
                      Export
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(environment)}
                      className="rounded border border-red-200 px-2.5 py-1.5 text-[11px] font-bold text-red-700"
                    >
                      <Trash2 className="mr-1 inline h-3 w-3" />
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {message ? (
        <p className="shrink-0 text-xs text-slate-500" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
};
