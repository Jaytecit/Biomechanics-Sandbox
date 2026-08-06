/**
 * C1.2 — Drive groups: collapse muscles that share a driveGroup into one
 * brain output channel, then expand channel drives back to per-muscle arrays.
 */
import type { MuscleDef } from '../creature/types';

export type DriveGroupFields = Pick<MuscleDef, 'id' | 'driveGroup'>;

/** Positive integer group id, else undefined. */
export function normalizeDriveGroup(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const n = Math.floor(value);
  return n >= 1 ? n : undefined;
}

/**
 * Map muscle id → genome output channel index.
 * First member of each driveGroup allocates a channel; later members reuse it;
 * ungrouped muscles each take one channel. Order follows the muscles array.
 */
export function brainActuatorChannelByMuscleId(
  muscles: DriveGroupFields[],
): Map<number, number> {
  const map = new Map<number, number>();
  const groupChannel = new Map<number, number>();
  let channel = 0;
  for (const m of muscles) {
    const g = normalizeDriveGroup(m.driveGroup);
    if (g !== undefined) {
      const existing = groupChannel.get(g);
      if (existing !== undefined) {
        map.set(m.id, existing);
        continue;
      }
      groupChannel.set(g, channel);
    }
    map.set(m.id, channel);
    channel += 1;
  }
  return map;
}

/** Genome output count after drive-group collapse. */
export function countBrainActuatorChannels(muscles: DriveGroupFields[]): number {
  if (muscles.length === 0) return 0;
  const byId = brainActuatorChannelByMuscleId(muscles);
  let max = -1;
  for (const idx of byId.values()) {
    if (idx > max) max = idx;
  }
  return max + 1;
}

/**
 * Expand channel drives into a per-muscle drive array (same order as muscles).
 */
export function expandChannelDrives(
  muscles: DriveGroupFields[],
  channelDrives: ArrayLike<number>,
): number[] {
  const byId = brainActuatorChannelByMuscleId(muscles);
  const out = new Array(muscles.length);
  for (let i = 0; i < muscles.length; i++) {
    const ch = byId.get(muscles[i].id) ?? i;
    out[i] = channelDrives[ch] ?? 0;
  }
  return out;
}

/**
 * Collapse per-muscle drives to brain channel drives (first member of each
 * channel wins — matches expandChannelDrives channel allocation order).
 */
export function collapseMuscleDrivesToChannels(
  muscles: DriveGroupFields[],
  muscleDrives: ArrayLike<number>,
): number[] {
  const n = countBrainActuatorChannels(muscles);
  const out = new Array(n).fill(0);
  const byId = brainActuatorChannelByMuscleId(muscles);
  const seen = new Set<number>();
  for (let i = 0; i < muscles.length; i++) {
    const ch = byId.get(muscles[i].id) ?? i;
    if (seen.has(ch)) continue;
    seen.add(ch);
    out[ch] = muscleDrives[i] ?? 0;
  }
  return out;
}

/** Next free positive driveGroup id. */
export function nextDriveGroupId(muscles: DriveGroupFields[]): number {
  let max = 0;
  for (const m of muscles) {
    const g = normalizeDriveGroup(m.driveGroup);
    if (g !== undefined && g > max) max = g;
  }
  return max + 1;
}

/** Drop singleton / invalid groups (keeps only groups with ≥2 members). */
export function normalizeMuscleDriveGroups<T extends DriveGroupFields>(
  muscles: T[],
): T[] {
  const counts = new Map<number, number>();
  for (const m of muscles) {
    const g = normalizeDriveGroup(m.driveGroup);
    if (g === undefined) continue;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return muscles.map((m) => {
    const g = normalizeDriveGroup(m.driveGroup);
    if (g === undefined || (counts.get(g) ?? 0) < 2) {
      if (m.driveGroup === undefined) return m;
      const next = { ...m };
      delete next.driveGroup;
      return next;
    }
    return m.driveGroup === g ? m : { ...m, driveGroup: g };
  });
}

/** Stable color for a drive group label in the editor. */
export function driveGroupStrokeColor(groupId: number): string {
  const hue = ((groupId * 67) % 360 + 360) % 360;
  return `hsl(${hue} 62% 58%)`;
}
