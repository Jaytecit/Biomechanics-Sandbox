/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Read-only canvas that loops muscle min↔max travel (Studio "Range" preview).
 * No editing chrome — used by the Model Picker hub.
 */

import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  CreatureBlueprint,
  DEFAULT_AERO_AREA,
  LEVER_SLOT_T,
  isHardLengthConstraint,
  isRigidBone,
  isValidLeverSlot,
  resolveLinkKind,
} from '../types';
import { drawChuteString } from '../aero';
import { AppearanceRig } from '../creaturePackages';
import {
  captureSolidRestOffsets,
  normalizeSolidSegments,
  solidNodeIdSet,
} from '../solidSegments';
import {
  PreviewBody,
  PreviewEndWeight,
  PreviewLink,
  leverEndWeights,
  nodeEndWeights,
  solvePreviewPose,
} from '../rangePreviewSolver';

type PreviewNode = {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: string;
  isWheel?: boolean;
  isMotorWheel?: boolean;
  isFoot?: boolean;
  isHingeStop?: boolean;
};

type PreviewMuscle = {
  id: number;
  nodeA: number;
  nodeB: number;
  originalLength: number;
  minLength: number;
  maxLength: number;
  strength: number;
  phaseOffset: number;
  thickness?: number;
  aeroType?: 'none' | 'wing' | 'paraglider' | 'parachute';
  aeroArea?: number;
};

const PERIOD = 5.5;
const PREVIEW_GROUND_Y = 0;

function blueprintToPreview(blueprint: CreatureBlueprint): {
  nodes: PreviewNode[];
  muscles: PreviewMuscle[];
} {
  const nodes: PreviewNode[] = blueprint.nodes.map((n, i) => {
    const rel = blueprint.relativePositions[i] ?? { x: 0, y: 0 };
    return {
      id: i,
      x: rel.x,
      y: rel.y,
      radius: n.radius,
      color: n.color || '#64748b',
      isWheel: n.isWheel,
      isMotorWheel: n.isMotorWheel,
      isFoot: n.isFoot,
      isHingeStop: n.isHingeStop,
    };
  });
  const muscles: PreviewMuscle[] = blueprint.muscles.map((m, i) => ({
    id: i,
    nodeA: m.nodeA,
    nodeB: m.nodeB,
    originalLength: m.originalLength,
    minLength: m.minLength,
    maxLength: m.maxLength,
    strength: m.strength,
    phaseOffset: m.phaseOffset ?? 0,
    thickness: m.thickness,
    aeroType: m.aeroType,
    aeroArea: m.aeroArea,
  }));
  return { nodes, muscles };
}

/** Solver topology for a blueprint (lever ends ride their host bone). */
function blueprintToPreviewBody(blueprint: CreatureBlueprint): PreviewBody {
  const rest = new Map<number, { x: number; y: number; radius: number }>();
  const masses = new Map<number, number>();
  blueprint.nodes.forEach((n, i) => {
    const rel = blueprint.relativePositions[i] ?? { x: 0, y: 0 };
    rest.set(i, { x: rel.x, y: rel.y, radius: n.radius });
    masses.set(i, n.mass ?? 1);
  });

  const endWeights = (
    m: CreatureBlueprint['muscles'][number],
    end: 'A' | 'B'
  ): PreviewEndWeight[] | null => {
    const leverBone = end === 'A' ? m.leverBoneA : m.leverBoneB;
    const leverSlot = end === 'A' ? m.leverSlotA : m.leverSlotB;
    if (leverBone !== undefined && isValidLeverSlot(leverSlot)) {
      const bone = blueprint.muscles[leverBone];
      if (bone && isRigidBone(bone) && rest.has(bone.nodeA) && rest.has(bone.nodeB)) {
        return leverEndWeights(bone, LEVER_SLOT_T[leverSlot]);
      }
    }
    const nodeId = end === 'A' ? m.nodeA : m.nodeB;
    return rest.has(nodeId) ? nodeEndWeights(nodeId) : null;
  };

  const links: PreviewLink[] = [];
  blueprint.muscles.forEach((m, i) => {
    const endA = endWeights(m, 'A');
    const endB = endWeights(m, 'B');
    if (!endA || !endB) return;
    const kind = resolveLinkKind(m);
    links.push({
      id: i,
      nodeA: m.nodeA,
      nodeB: m.nodeB,
      endA,
      endB,
      isBone: kind === 'bone',
      isHard: isHardLengthConstraint(m),
      originalLength: m.originalLength,
      minLength: m.minLength,
      maxLength: m.maxLength,
      strength: m.strength,
      phaseOffset: m.phaseOffset ?? 0,
    });
  });

  const solids = normalizeSolidSegments(blueprint.solidSegments);
  const positions = new Map(
    [...rest.entries()].map(([id, r]) => [id, { x: r.x, y: r.y }])
  );
  return {
    rest,
    masses,
    links,
    solids,
    solidRest: captureSolidRestOffsets(solids, positions, masses),
    groundY: PREVIEW_GROUND_Y,
  };
}

interface RangePreviewVisualizerProps {
  blueprint: CreatureBlueprint | null;
  appearance?: AppearanceRig;
  className?: string;
}

export const RangePreviewVisualizer: React.FC<RangePreviewVisualizerProps> = ({
  blueprint,
  appearance,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 480, height: 360 });
  const nodesRef = useRef<PreviewNode[]>([]);
  const musclesRef = useRef<PreviewMuscle[]>([]);
  const previewBodyRef = useRef<PreviewBody | null>(null);
  const rangeTimeRef = useRef(0);
  const fixedScaleRef = useRef<{ scale: number; cx: number; cy: number } | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const applySize = () => {
      if (!containerRef.current) return;
      const width = Math.max(containerRef.current.clientWidth, 240);
      const height = Math.max(containerRef.current.clientHeight, 200);
      setDimensions(prev =>
        prev.width === width && prev.height === height ? prev : { width, height }
      );
    };
    applySize();
    const ro = new ResizeObserver(() => applySize());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!blueprint) {
      nodesRef.current = [];
      musclesRef.current = [];
      previewBodyRef.current = null;
      return;
    }
    const { nodes, muscles } = blueprintToPreview(blueprint);
    nodesRef.current = nodes;
    musclesRef.current = muscles;
    const body = blueprintToPreviewBody(blueprint);
    previewBodyRef.current = body;
    rangeTimeRef.current = 0;

    // Fixed camera from min/max muscle travel so the model does not appear to resize.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const cycleT of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
      const pos = solvePreviewPose(body, cycleT);
      for (const n of nodes) {
        const p = pos.get(n.id) ?? { x: n.x, y: n.y };
        minX = Math.min(minX, p.x - n.radius);
        maxX = Math.max(maxX, p.x + n.radius);
        minY = Math.min(minY, p.y - n.radius);
        maxY = Math.max(maxY, p.y + n.radius);
      }
    }
    fixedScaleRef.current = {
      scale: Math.min(480 / Math.max(40, maxX - minX), 360 / Math.max(40, maxY - minY)) * 0.82,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
    };

    setTick(t => t + 1);
  }, [blueprint]);

  useEffect(() => {
    if (!blueprint) return;
    let rafId = 0;
    const step = () => {
      rangeTimeRef.current += 1 / 60;
      const body = previewBodyRef.current;
      if (body) {
        const pos = solvePreviewPose(body, rangeTimeRef.current / PERIOD);
        nodesRef.current = nodesRef.current.map(n => {
          const p = pos.get(n.id);
          return p ? { ...n, x: p.x, y: p.y } : n;
        });
      }

      setTick(v => v + 1);
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [blueprint]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // Subtle grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    const grid = 24;
    for (let x = 0; x < width; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const nodes = nodesRef.current;
    const muscles = musclesRef.current;
    if (nodes.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Select a model to preview', width / 2, height / 2);
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    }
    const spanX = Math.max(40, maxX - minX);
    const spanY = Math.max(40, maxY - minY);
    const pad = 36;
    const fixed = fixedScaleRef.current;
    const scale = fixed?.scale ?? Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const cx = fixed?.cx ?? (minX + maxX) / 2;
    const cy = fixed?.cy ?? (minY + maxY) / 2;
    const toScreen = (x: number, y: number) => ({
      x: width / 2 + (x - cx) * scale,
      y: height / 2 + (y - cy) * scale,
    });
    const meanNodeR = Math.max(
      2,
      (nodes.reduce((sum, n) => sum + n.radius, 0) / nodes.length) * scale * 0.85
    );
    const sw = (factor: number) => Math.max(0.45, meanNodeR * factor);

    // Ground reference line
    const g0 = toScreen(minX - 20, PREVIEW_GROUND_Y);
    const g1 = toScreen(maxX + 20, PREVIEW_GROUND_Y);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(g0.x, g0.y);
    ctx.lineTo(g1.x, g1.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const hideSkeleton = appearance?.hideSkeleton === true;
    const nodeById = new Map<number, PreviewNode>(nodes.map(n => [n.id, n]));

    for (const muscle of muscles) {
      const nodeA = nodeById.get(muscle.nodeA);
      const nodeB = nodeById.get(muscle.nodeB);
      if (!nodeA || !nodeB) continue;
      const a = toScreen(nodeA.x, nodeA.y);
      const b = toScreen(nodeB.x, nodeB.y);
      const thickBoost = ((muscle.thickness ?? 1) - 1) * sw(0.35);
      const kind = resolveLinkKind(muscle);
      const isBone = kind === 'bone';
      const isPist = kind === 'piston';

      ctx.save();
      const aero = muscle.aeroType;
      if (aero === 'parachute') {
        drawChuteString(ctx, a.x, a.y, b.x, b.y, muscle, {
          opacity: 1,
          lineWidth: sw(0.12),
          selected: false,
          previewInflate: 0,
        });
        ctx.restore();
        continue;
      }
      if (aero === 'wing' || aero === 'paraglider') {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len;
        const py = dx / len;
        const half =
          Math.sqrt(Math.max(1, muscle.aeroArea ?? DEFAULT_AERO_AREA)) *
          (aero === 'paraglider' ? 0.55 : 0.4) *
          Math.min(1.2, scale / 1.2);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + px * half, a.y + py * half);
        ctx.lineTo(b.x + px * half, b.y + py * half);
        ctx.lineTo(b.x, b.y);
        ctx.closePath();
        ctx.fillStyle =
          aero === 'wing' ? 'rgba(56, 189, 248, 0.28)' : 'rgba(167, 139, 250, 0.32)';
        ctx.fill();
        ctx.strokeStyle =
          aero === 'wing' ? 'rgba(14, 165, 233, 0.7)' : 'rgba(124, 58, 237, 0.75)';
        ctx.lineWidth = sw(0.05);
        ctx.stroke();
      }

      if (isPist) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const mid = 0.55;
        const mx = a.x + dx * mid;
        const my = a.y + dy * mid;
        const ux = dx / len;
        const uy = dy / len;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#4338ca';
        ctx.lineWidth = sw(0.35) + thickBoost;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.strokeStyle = '#a5b4fc';
        ctx.lineWidth = sw(0.15) + thickBoost * 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.strokeStyle = '#312e81';
        ctx.lineWidth = sw(0.15) + thickBoost * 0.4;
        ctx.beginPath();
        ctx.moveTo(mx - ux * sw(0.18), my - uy * sw(0.18));
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = '#c7d2fe';
        ctx.lineWidth = sw(0.08) + thickBoost * 0.25;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(b.x - ux * sw(0.09), b.y - uy * sw(0.09));
        ctx.stroke();
        if (isPist) {
          ctx.strokeStyle = '#818cf8';
          ctx.lineWidth = sw(0.09) + thickBoost * 0.15;
          ctx.beginPath();
          ctx.moveTo(mx - ux * sw(0.09) - uy * sw(0.18), my - uy * sw(0.09) + ux * sw(0.18));
          ctx.lineTo(mx - ux * sw(0.09) + uy * sw(0.18), my - uy * sw(0.09) - ux * sw(0.18));
          ctx.stroke();
        }
      } else if (isBone) {
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = sw(0.3) + thickBoost;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = sw(0.15) + thickBoost * 0.6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else {
        const len = Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y) || 1;
        const ratio = len / (muscle.originalLength || 1);
        let muscleColor = '#a78bfa';
        if (ratio < 0.92) muscleColor = '#22d3ee';
        else if (ratio > 1.08) muscleColor = '#fb923c';
        ctx.strokeStyle = muscleColor;
        ctx.lineWidth = sw(0.18) + thickBoost;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = sw(0.07);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        ctx.beginPath();
        ctx.moveTo(a.x + dx * 0.3, a.y + dy * 0.3);
        ctx.lineTo(b.x - dx * 0.3, b.y - dy * 0.3);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (!hideSkeleton) {
      const solidIds = solidNodeIdSet(previewBodyRef.current?.solids ?? []);
      for (const node of nodes) {
        const p = toScreen(node.x, node.y);
        const r = Math.max(1.5, node.radius * scale * 0.85);
        ctx.save();
        if (node.isWheel) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
          ctx.strokeStyle = node.isMotorWheel ? '#f59e0b' : '#94a3b8';
          ctx.lineWidth = node.isMotorWheel ? sw(0.11) : sw(0.09);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.8, r * 0.28), 0, Math.PI * 2);
          ctx.fillStyle = node.isMotorWheel ? '#f59e0b' : node.color;
          ctx.fill();
        } else if (solidIds.has(node.id)) {
          const s = r * 1.55;
          ctx.fillStyle = node.color;
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = sw(0.07);
          ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = node.color;
          ctx.fill();
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = sw(0.07);
          ctx.stroke();
        }
        if (node.isFoot && !node.isWheel) {
          ctx.beginPath();
          ctx.moveTo(p.x - r * 0.85, p.y + r * 0.55);
          ctx.lineTo(p.x + r * 0.85, p.y + r * 0.55);
          ctx.strokeStyle = '#059669';
          ctx.lineWidth = sw(0.09);
          ctx.lineCap = 'round';
          ctx.stroke();
        }
        if (node.isHingeStop) {
          const s = r * 0.55;
          ctx.beginPath();
          ctx.moveTo(p.x - s, p.y + s);
          ctx.lineTo(p.x - s, p.y - s * 0.15);
          ctx.lineTo(p.x + s * 0.15, p.y - s * 0.15);
          ctx.strokeStyle = '#e11d48';
          ctx.lineWidth = sw(0.08);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  });

  return (
    <div
      ref={containerRef}
      className={`relative flex min-h-[220px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 ${className}`}
    >
      <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-800 shadow-sm">
        <RefreshCw className="h-3 w-3 animate-spin" style={{ animationDuration: '5.5s' }} />
        Range
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.width, height: dimensions.height }}
        className="h-full w-full flex-1"
        aria-label="Model range preview"
      />
    </div>
  );
};
