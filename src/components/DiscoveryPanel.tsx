/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  ChallengeDefinition,
  Creature,
  CreatureBlueprint,
  CustomGoalConfig,
  CustomGoalMetric,
  CustomGoalRule,
  EvolutionGoal,
  SimulationConfig,
} from '../types';
import { CHALLENGES } from '../challenges';
import {
  evaluateChallengeConstraints,
  formatChallengeRules,
} from '../challengeConstraints';
import { encodeSnapshot, decodeSnapshot } from '../shareCode';
import { createRandomMorph } from '../randomMorph';
import {
  Trophy,
  Share2,
  Upload,
  Dices,
  Target,
  Plus,
  Trash2,
  Medal,
} from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { ArenaZoneId, goalAllowedInZone } from '../zones';

interface DiscoveryPanelProps {
  config: SimulationConfig;
  onUpdateConfig: (partial: Partial<SimulationConfig>) => void;
  creatures: Creature[];
  selectedCreatureId: string | null;
  selectedBlueprint: CreatureBlueprint;
  currentGen: number;
  bestEverFitness: number;
  challengeProgress: Record<
    string,
    { cleared: boolean; clearedAtGeneration?: number; bestScore: number; liveTarget?: number; clearCount?: number }
  >;
  activeChallengeId: string | null;
  onStartChallenge: (challenge: ChallengeDefinition) => void;
  onLoadSnapshot: (blueprint: CreatureBlueprint, genome: Creature['genome'], name: string) => void;
  onAddRandomMorph: (blueprint: CreatureBlueprint) => void;
  zoneId?: ArenaZoneId;
}

const METRIC_OPTIONS: { value: CustomGoalMetric; label: string }[] = [
  { value: 'distance_right', label: 'Distance right' },
  { value: 'distance_left', label: 'Distance left' },
  { value: 'jump_height', label: 'Jump height' },
  { value: 'upright', label: 'Stay upright' },
  { value: 'ball_carry', label: 'Ball carry' },
  { value: 'box_push', label: 'Box push' },
  { value: 'survival', label: 'Survival frames' },
  { value: 'speed', label: 'Peak speed' },
  { value: 'stair_height', label: 'Stair climb' },
  { value: 'jump_land', label: 'Jump & land' },
  { value: 'clear_bar', label: 'Clear bar' },
  { value: 'manual', label: 'Manual reward' },
];

export const DiscoveryPanel: React.FC<DiscoveryPanelProps> = ({
  config,
  onUpdateConfig,
  creatures,
  selectedCreatureId,
  selectedBlueprint,
  currentGen,
  bestEverFitness,
  challengeProgress,
  activeChallengeId,
  onStartChallenge,
  onLoadSnapshot,
  onAddRandomMorph,
  zoneId = 'free' as ArenaZoneId,
}) => {
  const [shareCode, setShareCode] = useState('');
  const [importCode, setImportCode] = useState('');
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const zoneChallenges = useMemo(
    () => CHALLENGES.filter(ch => goalAllowedInZone(ch.goal, zoneId)),
    [zoneId]
  );

  const selected = useMemo(
    () => creatures.find(c => c.id === selectedCreatureId) || creatures[0] || null,
    [creatures, selectedCreatureId]
  );

  const handleExportShare = () => {
    if (!selected) {
      setShareMsg('Select a creature first.');
      return;
    }
    const code = encodeSnapshot({
      v: 1,
      name: selected.blueprint.name,
      blueprint: selected.blueprint,
      genome: selected.genome,
      fitness: selected.fitness,
    });
    setShareCode(code);
    navigator.clipboard?.writeText(code).catch(() => undefined);
    setShareMsg('Share code copied to clipboard.');
  };

  const handleImportShare = () => {
    try {
      const snap = decodeSnapshot(importCode);
      onLoadSnapshot(snap.blueprint, snap.genome, snap.name || snap.blueprint.name);
      setShareMsg(`Loaded "${snap.name || snap.blueprint.name}".`);
    } catch (err) {
      setShareMsg(err instanceof Error ? err.message : 'Invalid share code.');
    }
  };

  const updateCustomGoal = (customGoal: CustomGoalConfig) => {
    onUpdateConfig({ customGoal, goal: EvolutionGoal.CUSTOM });
  };

  const addRule = () => {
    const rule: CustomGoalRule = {
      id: `r_${Math.random().toString(36).slice(2, 7)}`,
      name: 'New rule',
      metric: 'distance_right',
      weight: 1,
    };
    updateCustomGoal({
      ...config.customGoal,
      rules: [...config.customGoal.rules, rule],
    });
  };

  const patchRule = (id: string, patch: Partial<CustomGoalRule>) => {
    updateCustomGoal({
      ...config.customGoal,
      rules: config.customGoal.rules.map(r => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  const removeRule = (id: string) => {
    updateCustomGoal({
      ...config.customGoal,
      rules: config.customGoal.rules.filter(r => r.id !== id),
    });
  };

  return (
    <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm flex flex-col gap-2" id="discovery-panel">
      <div className="flex items-center gap-2 px-1 pb-1">
        <Trophy className="w-4 h-4 text-amber-500" />
        <h3 className="text-xs font-bold text-slate-800">Discovery Lab</h3>
      </div>

      <CollapsibleSection
        title="Challenge cards"
        icon={<Medal className="w-3.5 h-3.5" />}
        summary={
          activeChallengeId
            ? zoneChallenges.find(c => c.id === activeChallengeId)?.title ||
              CHALLENGES.find(c => c.id === activeChallengeId)?.title ||
              'Active'
            : `${Object.values(challengeProgress).filter(p => Boolean((p as { cleared?: boolean })?.cleared)).length}/${zoneChallenges.length} cleared`
        }
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
          {zoneChallenges.map(ch => {
            const prog = challengeProgress[ch.id];
            const cleared = prog?.cleared;
            const isActive = activeChallengeId === ch.id;
            const morphology = evaluateChallengeConstraints(selectedBlueprint, ch.constraints);
            const rules = formatChallengeRules(ch);
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onStartChallenge(ch)}
                className={`text-left p-2 rounded-lg border transition-all cursor-pointer ${
                  cleared
                    ? 'border-amber-300 bg-amber-50/80'
                    : isActive
                      ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-200'
                      : morphology.ok
                        ? 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                        : 'border-rose-100 bg-rose-50/40 hover:bg-rose-50/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-800">{ch.title}</span>
                  {cleared && (
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                      {ch.badgeLabel}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug line-clamp-3">{ch.description}</p>
                {rules && (
                  <p className="text-[9px] font-semibold text-slate-400 mt-1 leading-snug">{rules}</p>
                )}
                {!morphology.ok && (
                  <p className="text-[9px] font-semibold text-rose-600 mt-1 leading-snug">
                    Body mismatch: {morphology.reasons.slice(0, 2).join('; ')}
                    {morphology.reasons.length > 2 ? '…' : ''}
                  </p>
                )}
                <div className="mt-1 flex justify-between text-[10px] font-semibold text-slate-400">
                  <span>
                    Best {prog?.bestScore?.toFixed?.(0) ?? 0}/
                    {prog?.liveTarget?.toFixed?.(0) ?? ch.targetValue} pts
                    {(prog?.clearCount ?? 0) > 0 ? ` · ×${prog.clearCount}` : ''}
                  </span>
                  <span>≤{ch.maxGenerations} gens</span>
                </div>
              </button>
            );
          })}
        </div>
        {activeChallengeId && (
          <p className="text-[10px] text-indigo-600 font-medium mt-1.5">
            Active · Gen {currentGen} · Best{' '}
            {(() => {
              const active = CHALLENGES.find(c => c.id === activeChallengeId);
              const ok = active
                ? evaluateChallengeConstraints(selectedBlueprint, active.constraints).ok
                : true;
              return ok ? bestEverFitness.toFixed(1) : '0 (body rules violated)';
            })()}{' '}
            pts
          </p>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Morph & share"
        icon={<Share2 className="w-3.5 h-3.5" />}
        summary="Random / codes"
        defaultOpen={false}
      >
        <div className="flex flex-wrap gap-1.5">
          {(zoneId === 'walking' || zoneId === 'jumping' || zoneId === 'free') && (
            <button
              type="button"
              onClick={() => onAddRandomMorph(createRandomMorph())}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-fuchsia-600 text-white hover:bg-fuchsia-700 cursor-pointer"
            >
              <Dices className="w-3.5 h-3.5" /> Random morph
            </button>
          )}
          <button
            type="button"
            onClick={handleExportShare}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" /> Export code
          </button>
        </div>
        {shareCode && (
          <textarea
            readOnly
            value={shareCode}
            className="w-full text-[10px] font-mono p-2 rounded-lg border border-slate-200 bg-slate-50 h-14 mt-1.5"
          />
        )}
        <div className="flex gap-1.5 mt-1.5">
          <input
            value={importCode}
            onChange={e => setImportCode(e.target.value)}
            placeholder="Paste NEAT1.… share code"
            className="flex-1 text-[11px] px-2 py-1.5 rounded-lg border border-slate-200"
          />
          <button
            type="button"
            onClick={handleImportShare}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 text-white cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" /> Load
          </button>
        </div>
        {shareMsg && <p className="text-[10px] text-slate-500 mt-1">{shareMsg}</p>}
      </CollapsibleSection>

      {zoneId === 'free' && (
      <CollapsibleSection
        title="Custom goal builder"
        icon={<Target className="w-3.5 h-3.5" />}
        summary={config.goal === EvolutionGoal.CUSTOM ? config.customGoal.name : `${config.customGoal.rules.length} rules`}
        defaultOpen={false}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-slate-500 font-medium">Blend reward metrics</span>
          <button
            type="button"
            onClick={() => onUpdateConfig({ goal: EvolutionGoal.CUSTOM })}
            className={`text-[10px] font-bold px-2 py-1 rounded border cursor-pointer ${
              config.goal === EvolutionGoal.CUSTOM
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            Use custom
          </button>
        </div>
        <input
          value={config.customGoal.name}
          onChange={e => updateCustomGoal({ ...config.customGoal, name: e.target.value })}
          className="text-[11px] px-2 py-1.5 rounded-lg border border-slate-200 font-semibold w-full"
          placeholder="Goal name"
        />
        <textarea
          value={config.customGoal.description || ''}
          onChange={e => updateCustomGoal({ ...config.customGoal, description: e.target.value })}
          className="text-[10px] px-2 py-1.5 rounded-lg border border-slate-200 h-10 w-full mt-1.5"
          placeholder="Optional description"
        />
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5 mt-1.5">
          {config.customGoal.rules.map(rule => (
            <div key={rule.id} className="p-2 rounded-lg border border-slate-100 bg-slate-50/60 space-y-1">
              <div className="flex gap-1.5">
                <input
                  value={rule.name}
                  onChange={e => patchRule(rule.id, { name: e.target.value })}
                  className="flex-1 text-[11px] font-semibold px-2 py-1 rounded border border-slate-200"
                />
                <button
                  type="button"
                  onClick={() => removeRule(rule.id)}
                  className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <select
                value={rule.metric}
                onChange={e => patchRule(rule.id, { metric: e.target.value as CustomGoalMetric })}
                className="w-full text-[11px] px-2 py-1 rounded border border-slate-200"
              >
                {METRIC_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-1">
                <label className="text-[9px] text-slate-500 font-semibold">
                  Weight
                  <input
                    type="number"
                    step="0.1"
                    value={rule.weight}
                    onChange={e => patchRule(rule.id, { weight: parseFloat(e.target.value) || 0 })}
                    className="mt-0.5 w-full text-[11px] px-1.5 py-1 rounded border border-slate-200"
                  />
                </label>
                <label className="text-[9px] text-slate-500 font-semibold">
                  Target
                  <input
                    type="number"
                    step="1"
                    value={rule.target ?? ''}
                    onChange={e =>
                      patchRule(rule.id, {
                        target: e.target.value === '' ? undefined : parseFloat(e.target.value),
                      })
                    }
                    className="mt-0.5 w-full text-[11px] px-1.5 py-1 rounded border border-slate-200"
                    placeholder="—"
                  />
                </label>
                <label className="text-[9px] text-slate-500 font-semibold">
                  Bonus
                  <input
                    type="number"
                    step="1"
                    value={rule.bonus ?? ''}
                    onChange={e =>
                      patchRule(rule.id, {
                        bonus: e.target.value === '' ? undefined : parseFloat(e.target.value),
                      })
                    }
                    className="mt-0.5 w-full text-[11px] px-1.5 py-1 rounded border border-slate-200"
                    placeholder="—"
                  />
                </label>
              </div>
              {rule.metric === 'manual' && (
                <input
                  value={rule.manualNote || ''}
                  onChange={e => patchRule(rule.id, { manualNote: e.target.value })}
                  placeholder="Describe your manual reward rule"
                  className="w-full text-[10px] px-2 py-1 rounded border border-amber-200 bg-amber-50/50"
                />
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRule}
          className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer w-full mt-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add reward rule
        </button>
      </CollapsibleSection>
      )}
    </div>
  );
};
