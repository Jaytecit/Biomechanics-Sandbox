/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LeaderboardEntry {
  id: string;
  eventId: string;
  eventTitle: string;
  modelId: string;
  modelName: string;
  score: number;
  recordedAt: string;
  traits: string[];
  notes?: string;
}

const STORAGE_KEY = 'biomech_arena_leaderboard_v1';
const MAX_PER_EVENT = 25;

function loadAll(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: LeaderboardEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota
  }
}

export function loadLeaderboard(eventId?: string): LeaderboardEntry[] {
  const all = loadAll();
  const filtered = eventId ? all.filter(e => e.eventId === eventId) : all;
  return [...filtered].sort((a, b) => b.score - a.score);
}

export function recordHeatResults(
  results: Omit<LeaderboardEntry, 'id' | 'recordedAt'>[]
): LeaderboardEntry[] {
  const now = new Date().toISOString();
  const incoming: LeaderboardEntry[] = results.map(r => ({
    ...r,
    id: `lb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    recordedAt: now,
  }));

  const existing = loadAll();
  const merged = [...incoming, ...existing];

  // Keep top scores per event (by score), then global cap
  const byEvent = new Map<string, LeaderboardEntry[]>();
  for (const entry of merged) {
    const list = byEvent.get(entry.eventId) ?? [];
    list.push(entry);
    byEvent.set(entry.eventId, list);
  }

  const trimmed: LeaderboardEntry[] = [];
  for (const [, list] of byEvent) {
    const sorted = [...list].sort((a, b) => b.score - a.score);
    // Dedupe by modelId keeping best score
    const bestByModel = new Map<string, LeaderboardEntry>();
    for (const row of sorted) {
      const prev = bestByModel.get(row.modelId);
      if (!prev || row.score > prev.score) bestByModel.set(row.modelId, row);
    }
    trimmed.push(
      ...[...bestByModel.values()].sort((a, b) => b.score - a.score).slice(0, MAX_PER_EVENT)
    );
  }

  writeAll(trimmed);
  return trimmed;
}

export function clearLeaderboard(eventId?: string): LeaderboardEntry[] {
  if (!eventId) {
    writeAll([]);
    return [];
  }
  const next = loadAll().filter(e => e.eventId !== eventId);
  writeAll(next);
  return next;
}
