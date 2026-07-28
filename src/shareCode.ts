/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreatureBlueprint, Genome } from './types';

export interface CreatureSnapshot {
  v: 1;
  name: string;
  blueprint: CreatureBlueprint;
  genome: Genome;
  fitness?: number;
}

/** Compact URL-safe share code for a creature brain + body. */
export function encodeSnapshot(snapshot: CreatureSnapshot): string {
  const json = JSON.stringify(snapshot);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `NEAT1.${b64}`;
}

export function decodeSnapshot(code: string): CreatureSnapshot {
  const trimmed = code.trim();
  if (!trimmed.startsWith('NEAT1.')) {
    throw new Error('Share code must start with NEAT1.');
  }
  const b64 = trimmed.slice(6);
  const json = decodeURIComponent(escape(atob(b64)));
  const data = JSON.parse(json) as CreatureSnapshot;
  if (!data.blueprint || !data.genome) {
    throw new Error('Share code is missing blueprint or genome.');
  }
  return data;
}
