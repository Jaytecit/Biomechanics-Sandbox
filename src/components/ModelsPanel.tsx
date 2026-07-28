/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sandbox shelf for finished products. Head-to-head showmanship lives in
 * Arena Championship (`/Arena%20Championship/`). Continue-training clones a
 * frozen brain into any eligible goal scenario.
 */

import React, { useState } from 'react';
import {
  Download,
  Upload,
  Trophy,
  Save,
  Trash2,
  Check,
  Pencil,
  X,
  ExternalLink,
  Swords,
  Play,
  ChevronDown,
} from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { TrainableGoalPicker } from './TrainableGoalPicker';
import { FinishedModel, traitLabel } from '../savedModels';
import { getGoalInfo } from '../goalCatalog';
import { EvolutionGoal } from '../types';
import { ArenaZoneId } from '../zones';

/** Same-origin multi-page entry (see vite.config.ts). */
export const ARENA_CHAMPIONSHIP_HREF = './Arena%20Championship/';

interface ModelsPanelProps {
  models: FinishedModel[];
  canSaveLeader: boolean;
  suggestedSaveName: string;
  currentGoal: EvolutionGoal;
  activeZone: ArenaZoneId;
  onSaveLeader: (name: string, notes: string) => void;
  onDeleteModel: (id: string) => void;
  onRenameModel: (id: string, name: string, notes: string) => void;
  onImportProductFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onExportProduct: (model: FinishedModel) => void;
  /** Clone shelf brain into a new run under the chosen goal (zone may switch). */
  onContinueTraining: (model: FinishedModel, goal: EvolutionGoal) => void;
}

export const ModelsPanel: React.FC<ModelsPanelProps> = ({
  models,
  canSaveLeader,
  suggestedSaveName,
  currentGoal,
  activeZone,
  onSaveLeader,
  onDeleteModel,
  onRenameModel,
  onImportProductFile,
  onExportProduct,
  onContinueTraining,
}) => {
  const [saveName, setSaveName] = useState(suggestedSaveName);
  const [saveNotes, setSaveNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [trainModelId, setTrainModelId] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setSaveName(suggestedSaveName);
  }, [suggestedSaveName]);

  const startEdit = (model: FinishedModel) => {
    setEditingId(model.id);
    setEditName(model.name);
    setEditNotes(model.notes);
    setTrainModelId(null);
  };

  return (
    <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm flex flex-col gap-2">
      <CollapsibleSection
        title="Finished Models"
        icon={<Trophy className="w-3.5 h-3.5" />}
        summary={`${models.length} saved · clone into any eligible goal`}
        defaultOpen
      >
        <div className="flex flex-col gap-3">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Open <span className="font-semibold text-slate-600">Continue training</span> on a
            model, pick any compatible goal scenario, then start a cloned run. The shelf
            product never changes.
          </p>

          {models.length === 0 ? (
            <p className="text-[11px] text-slate-500 leading-relaxed">
              No finished models yet. Evolve a creature, freeze the leader below, then continue
              onto related goals from this shelf.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-0.5">
              {models.map(model => {
                const sourceGoal = getGoalInfo(model.trainedGoal).shortLabel;
                const isTraining = trainModelId === model.id;
                return (
                  <li
                    key={model.id}
                    className={`rounded-lg border p-2.5 ${
                      isTraining
                        ? 'border-emerald-300 bg-white shadow-sm'
                        : 'border-slate-200 bg-slate-50/40'
                    }`}
                  >
                    {editingId === model.id ? (
                      <div className="space-y-1.5">
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full px-2 py-1 text-[11px] rounded border border-slate-200"
                        />
                        <input
                          value={editNotes}
                          onChange={e => setEditNotes(e.target.value)}
                          placeholder="Notes"
                          className="w-full px-2 py-1 text-[11px] rounded border border-slate-200"
                        />
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onRenameModel(model.id, editName, editNotes);
                              setEditingId(null);
                            }}
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold cursor-pointer"
                          >
                            <Check className="w-3 h-3" /> Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1 rounded border border-slate-200 text-[10px] cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-bold text-slate-800 truncate">
                              {model.name}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Trained: {model.traits.trainedGoalLabel} · Gen {model.generation}
                              {model.generationDurationSec
                                ? ` · ${Math.round(model.generationDurationSec)}s gen`
                                : ''}{' '}
                              · {model.fitness.toFixed(1)} pts
                            </div>
                            {model.notes && (
                              <div className="text-[10px] text-slate-600 mt-0.5 italic line-clamp-2">
                                {model.notes}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {model.traits.bodyTraits.map(t => (
                                <span
                                  key={t}
                                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600"
                                >
                                  {traitLabel(t)}
                                </span>
                              ))}
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                                {model.traits.nodeCount}n / {model.traits.muscleCount}m
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => startEdit(model)}
                              className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                              title="Rename"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onExportProduct(model)}
                              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                              title="Download JSON"
                            >
                              <Download className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Permanently delete finished model "${model.name}"?\n\nIt will be removed from the shelf, Model Management, Creature Anatomy menus, and Arena Championship. Best Ever scores are kept. This cannot be undone.`
                                  )
                                ) {
                                  onDeleteModel(model.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {isTraining ? (
                          <TrainableGoalPicker
                            blueprint={model.blueprint}
                            activeZone={activeZone}
                            currentGoal={currentGoal}
                            relatedFromGoal={model.trainedGoal}
                            onConfirm={goal => {
                              setTrainModelId(null);
                              onContinueTraining(model, goal);
                            }}
                            onClose={() => setTrainModelId(null)}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setTrainModelId(model.id);
                            }}
                            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-[10px] font-bold cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                            Continue training
                            <ChevronDown className="w-3 h-3 opacity-70" />
                            <span className="font-semibold opacity-80">from {sourceGoal}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-2.5 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Freeze current leader as a finished product
            </div>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Model name"
              className="w-full px-2 py-1.5 text-[11px] rounded-md border border-amber-200 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <input
              type="text"
              value={saveNotes}
              onChange={e => setSaveNotes(e.target.value)}
              placeholder="Optional notes"
              className="w-full px-2 py-1.5 text-[11px] rounded-md border border-amber-200 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <button
              type="button"
              disabled={!canSaveLeader || !saveName.trim()}
              onClick={() => onSaveLeader(saveName.trim(), saveNotes.trim())}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Freeze & Save
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" /> Import to shelf
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              onChange={onImportProductFile}
              className="hidden"
            />
          </div>

          <a
            href={ARENA_CHAMPIONSHIP_HREF}
            className="rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-600 to-slate-800 p-3 text-white no-underline block hover:brightness-110 transition"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
              <Swords className="w-3.5 h-3.5" />
              Arena Championship
            </div>
            <div className="mt-1 text-sm font-bold flex items-center gap-1.5">
              Open the Arena
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </div>
            <p className="mt-1 text-[10px] text-indigo-100/90 leading-relaxed">
              Events and leaderboards with frozen brains — separate from continue-training.
            </p>
          </a>
        </div>
      </CollapsibleSection>
    </div>
  );
};
