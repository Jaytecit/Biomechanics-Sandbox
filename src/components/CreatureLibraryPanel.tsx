import React, { ChangeEvent, useEffect, useState } from 'react';
import { Copy, Download, FolderOpen, Save, Trash2, Upload } from 'lucide-react';
import { CreatureBlueprint } from '../types';
import {
  AppearanceRig,
  CreaturePackage,
  deletePackage,
  duplicatePackage,
  exportCreaturePackage,
  importCreaturePackage,
  loadCreaturePackages,
  renamePackage,
  saveNewPackage,
  savePackageRevision,
} from '../creaturePackages';

interface Props {
  getCurrentBlueprint: () => CreatureBlueprint | null;
  getAppearance?: () => AppearanceRig | undefined;
  onOpen: (blueprint: CreatureBlueprint, appearance?: AppearanceRig) => void;
  refreshToken?: number;
  className?: string;
}

export const CreatureLibraryPanel: React.FC<Props> = ({
  getCurrentBlueprint,
  getAppearance,
  onOpen,
  refreshToken = 0,
  className = '',
}) => {
  const [items, setItems] = useState<CreaturePackage[]>(() => loadCreaturePackages());
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? '');
  const [pendingDeleteId, setPendingDeleteId] = useState('');
  const [message, setMessage] = useState('Library is unrestricted; eligibility is checked at launch.');
  const selected = items.find(item => item.id === selectedId);
  const refresh = (preferredId?: string) => {
    const next = loadCreaturePackages();
    setItems(next);
    setSelectedId(preferredId && next.some(item => item.id === preferredId) ? preferredId : next[0]?.id ?? '');
  };
  useEffect(() => {
    refresh(selectedId);
  }, [refreshToken]);
  const current = () => {
    const blueprint = getCurrentBlueprint();
    if (!blueprint) setMessage('Finish at least two joints and one link before saving.');
    return blueprint;
  };
  const saveNew = () => {
    const blueprint = current();
    if (!blueprint) return;
    const result = saveNewPackage(blueprint, {
      displayName: blueprint.name,
      source: 'studio-draft',
      appearance: getAppearance?.(),
    });
    setMessage(result.ok ? `Saved new package "${result.value!.displayName}".` : result.error!);
    refresh(result.value?.id);
  };
  const saveVersion = () => {
    const blueprint = current();
    if (!blueprint || !selected) return;
    const result = savePackageRevision(selected.id, {
      blueprint,
      displayName: blueprint.name,
      appearance: getAppearance?.(),
    });
    setMessage(result.ok ? `Saved revision ${result.value!.revision}.` : result.error!);
    refresh(selected.id);
  };
  const duplicate = () => {
    if (!selected) return;
    const result = duplicatePackage(selected.id);
    setMessage(result.ok ? `Duplicated as "${result.value!.displayName}".` : result.error!);
    refresh(result.value?.id);
  };
  const rename = () => {
    if (!selected) return;
    const displayName = window.prompt('New creature name', selected.displayName)?.trim();
    if (!displayName) return;
    const result = renamePackage(selected.id, displayName);
    setMessage(result.ok ? `Renamed to "${displayName}".` : result.error!);
    refresh(selected.id);
  };
  const remove = () => {
    if (!selected) return;
    if (pendingDeleteId !== selected.id) {
      setPendingDeleteId(selected.id);
      setMessage(`Press delete again to confirm removing "${selected.displayName}".`);
      return;
    }
    const result = deletePackage(selected.id);
    setPendingDeleteId('');
    setMessage(result.ok ? 'Creature package deleted.' : result.error!);
    refresh();
  };
  const download = () => {
    if (!selected) return;
    const blob = new Blob([exportCreaturePackage(selected)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selected.displayName.replace(/[^a-z0-9_-]+/gi, '_')}.creature.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = importCreaturePackage(await file.text());
    setMessage(result.ok ? `Imported "${result.value!.displayName}".` : result.error!);
    refresh(result.value?.id);
    event.target.value = '';
  };

  return (
    <section className={`border border-slate-200 bg-white p-3 ${className}`} aria-label="Creature library">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-xs text-slate-800">Versioned creature library</strong>
        <select
          className="min-w-48 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
          value={selectedId}
          onChange={event => setSelectedId(event.target.value)}
          aria-label="Saved creature package"
        >
          {items.length === 0 && <option value="">No saved packages</option>}
          {items.map(item => <option key={item.id} value={item.id}>{item.displayName} · r{item.revision}</option>)}
        </select>
        <button type="button" onClick={saveNew} className="rounded bg-emerald-600 px-2 py-1 text-xs font-bold text-white"><Save className="mr-1 inline h-3 w-3" />Save new</button>
        <button type="button" onClick={saveVersion} disabled={!selected} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Save version</button>
        <button
          type="button"
          onClick={() => selected && onOpen(
            structuredClone(selected.blueprint),
            selected.appearance ? structuredClone(selected.appearance) : undefined
          )}
          disabled={!selected}
          className="rounded border px-2 py-1 text-xs disabled:opacity-40"
        >
          <FolderOpen className="mr-1 inline h-3 w-3" />Open
        </button>
        <button type="button" aria-label="Duplicate creature" onClick={duplicate} disabled={!selected} className="rounded border px-2 py-1 text-xs disabled:opacity-40"><Copy className="inline h-3 w-3" /></button>
        <button type="button" onClick={rename} disabled={!selected} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Rename</button>
        <button type="button" aria-label="Export creature package" onClick={download} disabled={!selected} className="rounded border px-2 py-1 text-xs disabled:opacity-40"><Download className="inline h-3 w-3" /></button>
        <label aria-label="Import creature package" className="cursor-pointer rounded border px-2 py-1 text-xs"><Upload className="inline h-3 w-3" /><input aria-label="Import creature package file" className="hidden" type="file" accept=".json,application/json" onChange={importFile} /></label>
        <button
          type="button"
          aria-label={pendingDeleteId === selected?.id ? 'Confirm delete creature package' : 'Delete creature package'}
          title={pendingDeleteId === selected?.id ? 'Confirm delete' : 'Delete'}
          onClick={remove}
          disabled={!selected}
          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-40"
        >
          <Trash2 className="inline h-3 w-3" />
        </button>
        {pendingDeleteId === selected?.id && (
          <button
            type="button"
            onClick={() => {
              setPendingDeleteId('');
              setMessage('Delete cancelled.');
            }}
            className="rounded border px-2 py-1 text-xs"
          >
            Cancel
          </button>
        )}
      </div>
      <p className="mt-2 text-[10px] text-slate-500" role="status">{message}</p>
    </section>
  );
};
