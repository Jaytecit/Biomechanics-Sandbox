/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreatureBlueprint } from './types';

const PALETTE = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185', '#2dd4bf'];

/**
 * One-click weird body: random joint cloud with spring muscles and a few rigid bones.
 */
export function createRandomMorph(seedName?: string): CreatureBlueprint {
  const nodeCount = 5 + Math.floor(Math.random() * 4); // 5–8
  const nodes: CreatureBlueprint['nodes'] = [];
  const relativePositions: { x: number; y: number }[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const angle = (i / nodeCount) * Math.PI * 2 + Math.random() * 0.4;
    const radius = 28 + Math.random() * 55;
    const x = Math.cos(angle) * radius + (Math.random() - 0.5) * 20;
    const y = -35 + Math.sin(angle) * radius * 0.7 + (Math.random() - 0.5) * 15;
    relativePositions.push({ x: Math.round(x), y: Math.round(y) });
    nodes.push({
      id: i,
      mass: 0.7 + Math.random() * 1.4,
      radius: 6 + Math.floor(Math.random() * 5),
      friction: 0.35 + Math.random() * 0.45,
      color: PALETTE[i % PALETTE.length],
    });
  }

  // Ensure at least one near-ground foot
  relativePositions[0].y = Math.max(relativePositions[0].y, -8);
  relativePositions[1].y = Math.max(relativePositions[1].y, -12);

  const muscles: CreatureBlueprint['muscles'] = [];
  let muscleId = 0;

  // Ring + spokes for connectivity
  for (let i = 0; i < nodeCount; i++) {
    const a = i;
    const b = (i + 1) % nodeCount;
    const dx = relativePositions[b].x - relativePositions[a].x;
    const dy = relativePositions[b].y - relativePositions[a].y;
    const len = Math.max(18, Math.round(Math.hypot(dx, dy)));
    const asBone = Math.random() < 0.22;
    muscles.push({
      id: muscleId++,
      nodeA: a,
      nodeB: b,
      originalLength: len,
      minLength: asBone ? len : Math.round(len * 0.55),
      maxLength: asBone ? len : Math.round(len * 1.45),
      strength: asBone ? 1.0 : 0.45 + Math.random() * 0.4,
      phaseOffset: Math.random() * Math.PI * 2,
    });
  }

  // Extra chords
  const extra = 2 + Math.floor(Math.random() * 3);
  for (let e = 0; e < extra; e++) {
    const a = Math.floor(Math.random() * nodeCount);
    let b = Math.floor(Math.random() * nodeCount);
    if (b === a) b = (a + 2) % nodeCount;
    const exists = muscles.some(
      m => (m.nodeA === a && m.nodeB === b) || (m.nodeA === b && m.nodeB === a)
    );
    if (exists) continue;
    const dx = relativePositions[b].x - relativePositions[a].x;
    const dy = relativePositions[b].y - relativePositions[a].y;
    const len = Math.max(18, Math.round(Math.hypot(dx, dy)));
    muscles.push({
      id: muscleId++,
      nodeA: a,
      nodeB: b,
      originalLength: len,
      minLength: Math.round(len * 0.6),
      maxLength: Math.round(len * 1.4),
      strength: 0.5 + Math.random() * 0.35,
      phaseOffset: Math.random() * Math.PI * 2,
    });
  }

  const tag = Math.random().toString(36).substring(2, 6).toUpperCase();
  return {
    name: seedName || `Weird Morph ${tag}`,
    nodes,
    muscles,
    relativePositions,
  };
}
