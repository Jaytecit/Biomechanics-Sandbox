/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Model management hub: Range preview, shelf + untrained lists, load destinations,
 * and permanent rename / export / delete across sandbox menus.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  Check,
  Download,
  ExternalLink,
  FolderOpen,
  Pencil,
  Swords,
  Trash2,
  Trophy,
  Wrench,
  Activity,
  X,
} from 'lucide-react';
import { RangePreviewVisualizer } from './RangePreviewVisualizer';
import { TrainableGoalPicker } from './TrainableGoalPicker';
import { ARENA_CHAMPIONSHIP_HREF } from './ModelsPanel';
import {
  FinishedModel,
  formatGenLengthLabel,
  modelRewardFingerprint,
  traitLabel,
} from '../savedModels';
import { DEFAULT_REWARD_RECIPE_FINGERPRINT } from '../builtInRewardCoeffs';
import {
  AppearanceRig,
  CreaturePackage,
  bodyFingerprint,
  loadCreaturePackages,
} from '../creaturePackages';
import { CreatureBlueprint, EvolutionGoal } from '../types';
import { ArenaZoneId } from '../zones';
import { getGoalInfo } from '../goalCatalog';

export type ModelPickerSelection =
  | { kind: 'shelf'; model: FinishedModel }
  | { kind: 'untrained'; pkg: CreaturePackage };

interface ModelPickerPanelProps {
  finishedModels: FinishedModel[];
  currentGoal: EvolutionGoal;
  activeZone: ArenaZoneId;
  /** Bump to reload creature packages from storage. */
  packagesRefreshToken?: number;
  onContinueTraining: (model: FinishedModel, goal: EvolutionGoal) => void;
  onStartFreshTraining: (blueprint: CreatureBlueprint, goal: EvolutionGoal) => void;
  onOpenInStudio: (blueprint: CreatureBlueprint, appearance?: AppearanceRig) => void;
  onLoadIntoSimulation: (
    blueprint: CreatureBlueprint,
    options?: { preferredGoal?: EvolutionGoal }
  ) => void;
  onRenameShelfModel: (id: string, name: string, notes: string) => void;
  onRenameUntrainedPackage: (id: string, displayName: string) => void;
  onExportShelfModel: (model: FinishedModel) => void;
  onExportUntrainedPackage: (pkg: CreaturePackage) => void;
  /** Permanent purge from shelf, packages, anatomy menus, and active selection. */
  onPermanentlyDeleteShelfModel: (id: string) => void;
  onPermanentlyDeleteUntrainedPackage: (id: string) => void;
  /** Batch permanent purge (one template sync). */
  onPermanentlyDeleteMany: (payload: { shelfIds: string[]; packageIds: string[] }) => void;
}

function resolveAppearance(
  blueprint: CreatureBlueprint,
  packages: CreaturePackage[]
): AppearanceRig | undefined {
  const fingerprint = bodyFingerprint(blueprint);
  return (
    packages.find(item => item.displayName === blueprint.name && item.appearance)?.appearance ??
    packages.find(item => item.bodyFingerprint === fingerprint && item.appearance)?.appearance
  );
}

export const ModelPickerPanel: React.FC<ModelPickerPanelProps> = ({
  finishedModels,
  currentGoal,
  activeZone,
  packagesRefreshToken = 0,
  onContinueTraining,
  onStartFreshTraining,
  onOpenInStudio,
  onLoadIntoSimulation,
  onRenameShelfModel,
  onRenameUntrainedPackage,
  onExportShelfModel,
  onExportUntrainedPackage,
  onPermanentlyDeleteShelfModel,
  onPermanentlyDeleteUntrainedPackage,
  onPermanentlyDeleteMany,
}) => {
  const [packages, setPackages] = useState<CreaturePackage[]>(() => loadCreaturePackages());
  const [selection, setSelection] = useState<ModelPickerSelection | null>(null);
  const [checkedShelfIds, setCheckedShelfIds] = useState<Set<string>>(() => new Set());
  const [checkedPackageIds, setCheckedPackageIds] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setPackages(loadCreaturePackages());
  }, [packagesRefreshToken, finishedModels]);

  const shelfSorted = useMemo(
    () =>
      [...finishedModels].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [finishedModels]
  );

  const untrainedSorted = useMemo(() => {
    const list = [...packages];
    list.sort((a, b) => {
      const aBuiltin = a.id.startsWith('builtin_pkg_') ? 0 : 1;
      const bBuiltin = b.id.startsWith('builtin_pkg_') ? 0 : 1;
      if (aBuiltin !== bBuiltin) return aBuiltin - bBuiltin;
      return a.displayName.localeCompare(b.displayName);
    });
    return list;
  }, [packages]);

  // Drop checks for models that no longer exist.
  useEffect(() => {
    const shelfIds = new Set(shelfSorted.map(m => m.id));
    const pkgIds = new Set(untrainedSorted.map(p => p.id));
    setCheckedShelfIds(prev => {
      const next = new Set([...prev].filter(id => shelfIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setCheckedPackageIds(prev => {
      const next = new Set([...prev].filter(id => pkgIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [shelfSorted, untrainedSorted]);

  // Keep selection valid when lists change; auto-select first available.
  useEffect(() => {
    if (selection?.kind === 'shelf') {
      const still = shelfSorted.find(m => m.id === selection.model.id);
      if (still) {
        if (still !== selection.model) setSelection({ kind: 'shelf', model: still });
        return;
      }
    }
    if (selection?.kind === 'untrained') {
      const still = untrainedSorted.find(p => p.id === selection.pkg.id);
      if (still) {
        if (still !== selection.pkg) setSelection({ kind: 'untrained', pkg: still });
        return;
      }
    }
    setEditing(false);
    setConfirmDelete(false);
    if (shelfSorted[0]) {
      setSelection({ kind: 'shelf', model: shelfSorted[0] });
    } else if (untrainedSorted[0]) {
      setSelection({ kind: 'untrained', pkg: untrainedSorted[0] });
    } else {
      setSelection(null);
    }
  }, [shelfSorted, untrainedSorted]); // eslint-disable-line react-hooks/exhaustive-deps

  const blueprint: CreatureBlueprint | null = selection
    ? selection.kind === 'shelf'
      ? selection.model.blueprint
      : selection.pkg.blueprint
    : null;

  const studioAppearance = useMemo(() => {
    if (!blueprint || !selection) return undefined;
    if (selection.kind === 'shelf' && selection.model.appearance) {
      return selection.model.appearance;
    }
    if (selection.kind === 'untrained' && selection.pkg.appearance) {
      return selection.pkg.appearance;
    }
    return resolveAppearance(blueprint, packages);
  }, [blueprint, selection, packages]);

  const displayName =
    selection?.kind === 'shelf'
      ? selection.model.name
      : selection?.kind === 'untrained'
        ? selection.pkg.displayName
        : null;

  const selectShelf = (model: FinishedModel) => {
    setSelection({ kind: 'shelf', model });
    setEditing(false);
    setConfirmDelete(false);
  };

  const selectUntrained = (pkg: CreaturePackage) => {
    setSelection({ kind: 'untrained', pkg });
    setEditing(false);
    setConfirmDelete(false);
  };

  const toggleShelfChecked = (id: string) => {
    setCheckedShelfIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePackageChecked = (id: string) => {
    setCheckedPackageIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const customUntrained = useMemo(
    () => untrainedSorted.filter(p => !p.id.startsWith('builtin_pkg_')),
    [untrainedSorted]
  );

  const checkedCount = checkedShelfIds.size + checkedPackageIds.size;
  const allShelfChecked =
    shelfSorted.length > 0 && shelfSorted.every(m => checkedShelfIds.has(m.id));
  const allUntrainedChecked =
    customUntrained.length > 0 &&
    customUntrained.every(p => checkedPackageIds.has(p.id));

  const toggleAllShelf = () => {
    if (allShelfChecked) {
      setCheckedShelfIds(new Set());
    } else {
      setCheckedShelfIds(new Set(shelfSorted.map(m => m.id)));
    }
  };

  const toggleAllUntrained = () => {
    if (allUntrainedChecked) {
      setCheckedPackageIds(new Set());
    } else {
      setCheckedPackageIds(new Set(customUntrained.map(p => p.id)));
    }
  };

  const clearChecked = () => {
    setCheckedShelfIds(new Set());
    setCheckedPackageIds(new Set());
  };

  const deleteTargets = useMemo(() => {
    if (checkedCount > 0) {
      const packageIds = [...checkedPackageIds].filter(id => !id.startsWith('builtin_pkg_'));
      return {
        mode: 'batch' as const,
        shelfIds: [...checkedShelfIds],
        packageIds,
        names: [
          ...shelfSorted.filter(m => checkedShelfIds.has(m.id)).map(m => m.name),
          ...untrainedSorted
            .filter(p => packageIds.includes(p.id))
            .map(p => p.displayName),
        ],
      };
    }
    if (selection?.kind === 'shelf') {
      return {
        mode: 'single' as const,
        shelfIds: [selection.model.id],
        packageIds: [] as string[],
        names: [selection.model.name],
      };
    }
    if (selection?.kind === 'untrained' && !selection.pkg.id.startsWith('builtin_pkg_')) {
      return {
        mode: 'single' as const,
        shelfIds: [] as string[],
        packageIds: [selection.pkg.id],
        names: [selection.pkg.displayName],
      };
    }
    return null;
  }, [
    checkedCount,
    checkedShelfIds,
    checkedPackageIds,
    selection,
    shelfSorted,
    untrainedSorted,
  ]);

  const startRename = () => {
    if (!selection) return;
    if (selection.kind === 'shelf') {
      setEditName(selection.model.name);
      setEditNotes(selection.model.notes);
    } else {
      setEditName(selection.pkg.displayName);
      setEditNotes(selection.pkg.notes ?? '');
    }
    setConfirmDelete(false);
    setEditing(true);
  };

  const commitRename = () => {
    if (!selection || !editName.trim()) return;
    if (selection.kind === 'shelf') {
      onRenameShelfModel(selection.model.id, editName.trim(), editNotes.trim());
    } else {
      onRenameUntrainedPackage(selection.pkg.id, editName.trim());
    }
    setEditing(false);
  };

  const requestDelete = () => {
    if (!deleteTargets || deleteTargets.names.length === 0) return;
    setEditing(false);
    setConfirmDelete(true);
  };

  const commitDelete = () => {
    if (!deleteTargets || deleteTargets.names.length === 0) return;
    if (deleteTargets.shelfIds.length + deleteTargets.packageIds.length > 1) {
      onPermanentlyDeleteMany({
        shelfIds: deleteTargets.shelfIds,
        packageIds: deleteTargets.packageIds,
      });
    } else if (deleteTargets.shelfIds[0]) {
      onPermanentlyDeleteShelfModel(deleteTargets.shelfIds[0]);
    } else if (deleteTargets.packageIds[0]) {
      onPermanentlyDeleteUntrainedPackage(deleteTargets.packageIds[0]);
    }
    clearChecked();
    setConfirmDelete(false);
  };

  const deleteLabel =
    checkedCount > 0 ? `Delete selected (${checkedCount})` : 'Delete';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {/* Stats + manage strip */}
      <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        {!selection || !displayName ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Boxes className="h-4 w-4 text-slate-400" />
            No saved models yet. Freeze a finished product from Simulation, or save a body in
            Anatomy Studio.
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              {editing ? (
                <div className="flex max-w-xl flex-col gap-1.5">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm font-semibold text-slate-900"
                    placeholder="Model name"
                    autoFocus
                  />
                  {selection.kind === 'shelf' && (
                    <input
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700"
                      placeholder="Notes (optional)"
                    />
                  )}
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={commitRename}
                      disabled={!editName.trim()}
                      className="flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-40 cursor-pointer"
                    >
                      <Check className="h-3 w-3" /> Save name
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 cursor-pointer"
                    >
                      <X className="h-3 w-3" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-bold text-slate-900">{displayName}</h2>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        selection.kind === 'shelf'
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {selection.kind === 'shelf' ? 'Shelf' : 'Untrained'}
                    </span>
                  </div>
                  {selection.kind === 'shelf' ? (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
                      <span>
                        Goal:{' '}
                        <strong className="text-slate-800">
                          {selection.model.traits.trainedGoalLabel}
                        </strong>
                      </span>
                      <span>
                        Score:{' '}
                        <strong className="tabular-nums text-slate-800">
                          {selection.model.fitness.toFixed(1)}
                        </strong>
                      </span>
                      {modelRewardFingerprint(selection.model) !==
                        DEFAULT_REWARD_RECIPE_FINGERPRINT && (
                        <span className="text-amber-700 font-semibold">
                          Custom rewards
                        </span>
                      )}
                      <span>
                        Gen{' '}
                        <strong className="tabular-nums text-slate-800">
                          {selection.model.generation}
                        </strong>
                      </span>
                      {formatGenLengthLabel(selection.model.generationDurationSec) && (
                        <span className="tabular-nums">
                          {formatGenLengthLabel(selection.model.generationDurationSec)}
                        </span>
                      )}
                      <span>
                        Brain{' '}
                        <strong className="tabular-nums text-slate-800">
                          {selection.model.traits.brainInputs}→
                          {selection.model.traits.brainOutputs}
                        </strong>
                        {selection.model.traits.hiddenNodes > 0
                          ? ` · ${selection.model.traits.hiddenNodes} hidden`
                          : ''}
                      </span>
                      <span>
                        Body{' '}
                        <strong className="tabular-nums text-slate-800">
                          {selection.model.traits.nodeCount}n /{' '}
                          {selection.model.traits.muscleCount}m
                        </strong>
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
                      <span>
                        Revision{' '}
                        <strong className="tabular-nums text-slate-800">
                          {selection.pkg.revision}
                        </strong>
                      </span>
                      <span>
                        Body{' '}
                        <strong className="tabular-nums text-slate-800">
                          {selection.pkg.blueprint.nodes.length}n /{' '}
                          {selection.pkg.blueprint.muscles.length}m
                        </strong>
                      </span>
                      <span>
                        Controllers{' '}
                        <strong className="tabular-nums text-slate-800">
                          {selection.pkg.controllers.length}
                        </strong>
                      </span>
                      <span>
                        Physics{' '}
                        <strong className="text-slate-800">{selection.pkg.physicsVersion}</strong>
                      </span>
                      {selection.pkg.notes ? (
                        <span className="italic text-slate-500">{selection.pkg.notes}</span>
                      ) : null}
                    </div>
                  )}
                  {selection.kind === 'shelf' && selection.model.traits.bodyTraits.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selection.model.traits.bodyTraits.map(t => (
                        <span
                          key={t}
                          className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600"
                        >
                          {traitLabel(t)}
                        </span>
                      ))}
                    </div>
                  )}
                  {selection.kind === 'shelf' && selection.model.notes ? (
                    <p className="text-[11px] italic text-slate-500 line-clamp-2">
                      {selection.model.notes}
                    </p>
                  ) : null}
                </>
              )}
            </div>

            {!editing && (
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={startRename}
                  disabled={selection?.kind === 'untrained' && selection.pkg.id.startsWith('builtin_pkg_')}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  title="Rename"
                >
                  <Pencil className="h-3.5 w-3.5" /> Rename
                </button>
                <button
                  type="button"
                  onClick={() =>
                    selection.kind === 'shelf'
                      ? onExportShelfModel(selection.model)
                      : onExportUntrainedPackage(selection.pkg)
                  }
                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  title="Download JSON"
                >
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
                <button
                  type="button"
                  onClick={requestDelete}
                  disabled={!deleteTargets}
                  className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-40 cursor-pointer"
                  title={
                    checkedCount > 0
                      ? `Permanently delete ${checkedCount} selected models`
                      : 'Permanently delete from all menus'
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" /> {deleteLabel}
                </button>
              </div>
            )}
          </div>
        )}

        {confirmDelete && deleteTargets && (
          <div className="mt-2.5 rounded-lg border border-rose-300 bg-rose-50 p-2.5 space-y-2">
            <p className="text-[11px] leading-relaxed text-rose-950">
              {deleteTargets.names.length === 1 ? (
                <>
                  Permanently delete <strong>{deleteTargets.names[0]}</strong>? This removes it
                  from the Models hub, Finished Models shelf, Creature Anatomy menus, Studio
                  library, and Arena Championship listings. Best Ever score records are kept.
                  This cannot be undone.
                </>
              ) : (
                <>
                  Permanently delete <strong>{deleteTargets.names.length} models</strong>
                  {deleteTargets.names.length <= 8
                    ? ` (${deleteTargets.names.join(', ')})`
                    : ` (including ${deleteTargets.names.slice(0, 5).join(', ')}, …)`}
                  ? They will be removed from every sandbox menu. Best Ever score records are
                  kept. This cannot be undone.
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={commitDelete}
                className="flex items-center gap-1 rounded-md bg-rose-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-rose-800 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" /> Permanently delete
                {deleteTargets.names.length > 1 ? ` (${deleteTargets.names.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-900 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Three columns */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.85fr)_minmax(260px,1fr)]">
        <RangePreviewVisualizer
          blueprint={blueprint}
          className="min-h-[280px] lg:min-h-0 h-full"
        />

        {/* Library lists */}
        <div className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Library
            </div>
            {checkedCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold tabular-nums text-indigo-700">
                  {checkedCount} selected
                </span>
                <button
                  type="button"
                  onClick={clearChecked}
                  className="text-[10px] font-semibold text-slate-500 underline cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={requestDelete}
                  className="flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
            <details className="group rounded-lg border border-amber-200 bg-amber-50/40 open:shadow-sm" open>
              <summary className="cursor-pointer list-none px-2.5 py-2 text-xs font-bold text-amber-950">
                <span className="mr-1.5 inline-block text-amber-600 transition group-open:rotate-90">
                  ▶
                </span>
                <Trophy className="mr-1 inline h-3.5 w-3.5 text-amber-700" />
                Shelf models ({shelfSorted.length})
              </summary>
              <div className="space-y-1 px-1.5 pb-2">
                {shelfSorted.length > 0 && (
                  <label className="flex items-center gap-2 px-1.5 py-1 text-[10px] font-semibold text-amber-900/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allShelfChecked}
                      onChange={toggleAllShelf}
                      className="rounded border-amber-300"
                    />
                    Select all shelf
                  </label>
                )}
                {shelfSorted.length === 0 ? (
                  <p className="px-1.5 py-1 text-[10px] leading-relaxed text-amber-900/80">
                    No finished products yet. Evolve in Simulation, then Freeze &amp; Save from
                    Build → Finished Models.
                  </p>
                ) : (
                  shelfSorted.map(model => {
                    const active =
                      selection?.kind === 'shelf' && selection.model.id === model.id;
                    const checked = checkedShelfIds.has(model.id);
                    return (
                      <div
                        key={model.id}
                        className={`flex items-stretch gap-1 rounded-lg border ${
                          active
                            ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                            : checked
                              ? 'border-amber-300 bg-amber-50/80'
                              : 'border-transparent bg-white/70 hover:border-amber-200 hover:bg-white'
                        }`}
                      >
                        <label
                          className="flex items-center pl-2 cursor-pointer"
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleShelfChecked(model.id)}
                            className="rounded border-slate-300"
                            aria-label={`Select ${model.name}`}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => selectShelf(model)}
                          className="min-w-0 flex-1 px-2 py-2 text-left cursor-pointer"
                        >
                          <div className="truncate text-[12px] font-bold text-slate-800">
                            {model.name}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {getGoalInfo(model.trainedGoal).shortLabel} ·{' '}
                            {model.fitness.toFixed(1)} pts · Gen {model.generation}
                          </div>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </details>

            <details className="group rounded-lg border border-slate-200 bg-slate-50/60 open:shadow-sm" open>
              <summary className="cursor-pointer list-none px-2.5 py-2 text-xs font-bold text-slate-800">
                <span className="mr-1.5 inline-block text-slate-400 transition group-open:rotate-90">
                  ▶
                </span>
                <FolderOpen className="mr-1 inline h-3.5 w-3.5 text-slate-600" />
                Untrained models ({untrainedSorted.length})
              </summary>
              <div className="space-y-1 px-1.5 pb-2">
                {customUntrained.length > 0 && (
                  <label className="flex items-center gap-2 px-1.5 py-1 text-[10px] font-semibold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allUntrainedChecked}
                      onChange={toggleAllUntrained}
                      className="rounded border-slate-300"
                    />
                    Select all custom untrained
                  </label>
                )}
                {untrainedSorted.length === 0 ? (
                  <p className="px-1.5 py-1 text-[10px] leading-relaxed text-slate-500">
                    No body templates yet.
                  </p>
                ) : (
                  untrainedSorted.map(pkg => {
                    const active =
                      selection?.kind === 'untrained' && selection.pkg.id === pkg.id;
                    const checked = checkedPackageIds.has(pkg.id);
                    const isBuiltin = pkg.id.startsWith('builtin_pkg_');
                    return (
                      <div
                        key={pkg.id}
                        className={`flex items-stretch gap-1 rounded-lg border ${
                          active
                            ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                            : checked
                              ? 'border-slate-300 bg-slate-100'
                              : 'border-transparent bg-white/80 hover:border-slate-200 hover:bg-white'
                        }`}
                      >
                        <label
                          className="flex items-center pl-2 cursor-pointer"
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePackageChecked(pkg.id)}
                            className="rounded border-slate-300"
                            aria-label={`Select ${pkg.displayName}`}
                            disabled={isBuiltin}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => selectUntrained(pkg)}
                          className="min-w-0 flex-1 px-2 py-2 text-left cursor-pointer"
                        >
                          <div className="truncate text-[12px] font-bold text-slate-800">
                            {pkg.displayName}
                            {isBuiltin ? (
                              <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                                default
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {isBuiltin ? 'Body only' : `Rev ${pkg.revision}`} ·{' '}
                            {pkg.blueprint.nodes.length}n / {pkg.blueprint.muscles.length}m
                            {pkg.controllers.length > 0
                              ? ` · ${pkg.controllers.length} ctrl`
                              : ''}
                          </div>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </details>
          </div>
        </div>

        {/* Destinations */}
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Load into
          </div>

          {!selection || !blueprint ? (
            <p className="text-[11px] leading-relaxed text-slate-500">
              Select a shelf or untrained model to choose a destination.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {selection.kind === 'shelf' ? (
                <TrainableGoalPicker
                  blueprint={blueprint}
                  activeZone={activeZone}
                  currentGoal={currentGoal}
                  relatedFromGoal={selection.model.trainedGoal}
                  onConfirm={goal => onContinueTraining(selection.model, goal)}
                />
              ) : (
                <TrainableGoalPicker
                  blueprint={blueprint}
                  activeZone={activeZone}
                  currentGoal={currentGoal}
                  title="Start training"
                  description="Pick an eligible goal. A fresh population will be spawned for this body — no cloned shelf brain."
                  confirmLabel="Start fresh run"
                  transferHint="New random brains · Freeze later to create a shelf product."
                  onConfirm={goal => onStartFreshTraining(blueprint, goal)}
                />
              )}

              <button
                type="button"
                onClick={() => onOpenInStudio(blueprint, studioAppearance)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-[11px] font-bold text-indigo-900 hover:bg-indigo-100 cursor-pointer"
              >
                <Wrench className="h-3.5 w-3.5" />
                Open in Anatomy Studio
              </button>

              <button
                type="button"
                onClick={() =>
                  onLoadIntoSimulation(
                    blueprint,
                    selection.kind === 'shelf'
                      ? { preferredGoal: selection.model.trainedGoal }
                      : undefined
                  )
                }
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-[11px] font-bold text-sky-950 hover:bg-sky-100 cursor-pointer"
              >
                <Activity className="h-3.5 w-3.5" />
                Load into Simulation
              </button>

              {selection.kind === 'shelf' ? (
                <a
                  href={ARENA_CHAMPIONSHIP_HREF}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-gradient-to-br from-indigo-600 to-slate-800 px-2.5 py-2 text-[11px] font-bold text-white no-underline hover:brightness-110"
                >
                  <Swords className="h-3.5 w-3.5 text-amber-300" />
                  Arena Championship
                  <ExternalLink className="h-3 w-3 opacity-80" />
                </a>
              ) : (
                <div
                  className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-[10px] leading-relaxed text-slate-500"
                  title="Championship events use frozen shelf products"
                >
                  <Swords className="mr-1 inline h-3 w-3 opacity-60" />
                  Arena Championship requires a shelf (finished) product.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
