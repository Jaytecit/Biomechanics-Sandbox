/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Read-only canvas that loops muscle min↔max travel (Studio "Range" preview).
 * No editing chrome — used by the Model Picker hub.
 */

import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { CreatureBlueprint, DEFAULT_AERO_AREA, isHardLengthConstraint, resolveLinkKind } from '../types';
import { drawChuteString } from '../aero';
import { AppearanceRig } from '../creaturePackages';
import {
  captureSolidRestOffsets,
  isLinkWhollyInsideSolid,
  normalizeSolidSegments,
  projectSolidBodiesOnMap,
  solidMembership,
  solidNodeIdSet,
} from '../solidSegments';

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
const RELAX_ITERS = 6;

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
  const solidsRef = useRef<ReturnType<typeof normalizeSolidSegments>>([]);
  const solidRestRef = useRef<Map<string, { x: number; y: number }[]>>(new Map());
  const rangeTimeRef = useRef(0);
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
      solidsRef.current = [];
      solidRestRef.current.clear();
      return;
    }
    const { nodes, muscles } = blueprintToPreview(blueprint);
    nodesRef.current = nodes;
    musclesRef.current = muscles;
    const solids = normalizeSolidSegments(blueprint.solidSegments);
    solidsRef.current = solids;
    const positions = new Map(nodes.map(n => [n.id, { x: n.x, y: n.y }]));
    const masses = new Map(nodes.map(n => [n.id, 1]));
    solidRestRef.current = captureSolidRestOffsets(solids, positions, masses);
    rangeTimeRef.current = 0;
    setTick(t => t + 1);
  }, [blueprint]);

  useEffect(() => {
    if (!blueprint) return;
    let rafId = 0;
    const step = () => {
      rangeTimeRef.current += 1 / 60;
      const t = rangeTimeRef.current;
      const muscleList = musclesRef.current;

      const pos = new Map<number, { x: number; y: number }>();
      for (const n of nodesRef.current) {
        pos.set(n.id, { x: n.x, y: n.y });
      }

      for (let iter = 0; iter < RELAX_ITERS; iter++) {
        const membership = solidMembership(solidsRef.current);
        for (const m of muscleList) {
          if (isLinkWhollyInsideSolid(m.nodeA, m.nodeB, membership)) continue;
          const a = pos.get(m.nodeA);
          const b = pos.get(m.nodeB);
          if (!a || !b) continue;
          const kind = resolveLinkKind(m);
          const isFixedBone = kind === 'bone';
          const phase = (m.phaseOffset || 0) * Math.PI * 2;
          const wave = (Math.sin((t / PERIOD) * Math.PI * 2 + phase) + 1) / 2;
          const target = isFixedBone
            ? m.originalLength
            : m.minLength + wave * (m.maxLength - m.minLength);
          const strength = isHardLengthConstraint(m)
            ? 1.0
            : Math.min(1, Math.max(0.35, m.strength));

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 1;
          const diff = ((dist - target) / dist) * 0.5 * strength;
          const ox = dx * diff;
          const oy = dy * diff;
          a.x += ox;
          a.y += oy;
          b.x -= ox;
          b.y -= oy;
        }
        if (solidsRef.current.length > 0) {
          const masses = new Map<number, number>(nodesRef.current.map(n => [n.id, 1]));
          const oldMap = new Map<number, { oldX: number; oldY: number }>(
            [...pos.entries()].map(([id, p]) => [id, { oldX: p.x, oldY: p.y }])
          );
          projectSolidBodiesOnMap(
            pos,
            oldMap,
            masses,
            solidsRef.current,
            solidRestRef.current,
            { preserveVelocity: false }
          );
        }
      }

      nodesRef.current = nodesRef.current.map(n => {
        const p = pos.get(n.id);
        return p ? { ...n, x: p.x, y: p.y } : n;
      });

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
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const toScreen = (x: number, y: number) => ({
      x: width / 2 + (x - cx) * scale,
      y: height / 2 + (y - cy) * scale,
    });

    const hideSkeleton = appearance?.hideSkeleton === true;
    const nodeById = new Map<number, PreviewNode>(nodes.map(n => [n.id, n]));

    for (const muscle of muscles) {
      const nodeA = nodeById.get(muscle.nodeA);
      const nodeB = nodeById.get(muscle.nodeB);
      if (!nodeA || !nodeB) continue;
      const a = toScreen(nodeA.x, nodeA.y);
      const b = toScreen(nodeB.x, nodeB.y);
      const thickBoost = ((muscle.thickness ?? 1) - 1) * 3;
      const kind = resolveLinkKind(muscle);
      const isBone = kind === 'bone';
      const isTel = kind === 'telescope';
      const isPist = kind === 'piston';

      ctx.save();
      const aero = muscle.aeroType;
      if (aero === 'parachute') {
        drawChuteString(ctx, a.x, a.y, b.x, b.y, muscle, {
          opacity: 1,
          lineWidth: 2.4,
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
          Math.sqrt(Math.max(8, muscle.aeroArea ?? DEFAULT_AERO_AREA)) *
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
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      if (isTel || isPist) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const mid = 0.55;
        const mx = a.x + dx * mid;
        const my = a.y + dy * mid;
        const ux = dx / len;
        const uy = dy / len;
        ctx.lineCap = 'round';
        ctx.strokeStyle = isPist ? '#4338ca' : '#0f766e';
        ctx.lineWidth = 8 + thickBoost;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.strokeStyle = isPist ? '#a5b4fc' : '#5eead4';
        ctx.lineWidth = 3.5 + thickBoost * 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.strokeStyle = isPist ? '#312e81' : '#134e4a';
        ctx.lineWidth = 3.5 + thickBoost * 0.4;
        ctx.beginPath();
        ctx.moveTo(mx - ux * 4, my - uy * 4);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = isPist ? '#c7d2fe' : '#99f6e4';
        ctx.lineWidth = 1.75 + thickBoost * 0.25;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(b.x - ux * 2, b.y - uy * 2);
        ctx.stroke();
        if (isPist) {
          ctx.strokeStyle = '#818cf8';
          ctx.lineWidth = 2 + thickBoost * 0.15;
          ctx.beginPath();
          ctx.moveTo(mx - ux * 2 - uy * 4, my - uy * 2 + ux * 4);
          ctx.lineTo(mx - ux * 2 + uy * 4, my - uy * 2 - ux * 4);
          ctx.stroke();
        }
      } else if (isBone) {
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 7 + thickBoost;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 3.5 + thickBoost * 0.6;
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
        ctx.lineWidth = 4 + thickBoost;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
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
      const solidIds = solidNodeIdSet(solidsRef.current);
      for (const node of nodes) {
        const p = toScreen(node.x, node.y);
        const r = Math.max(3, node.radius * scale * 0.85);
        ctx.save();
        if (node.isWheel) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
          ctx.strokeStyle = node.isMotorWheel ? '#f59e0b' : '#94a3b8';
          ctx.lineWidth = node.isMotorWheel ? 2.5 : 2;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(2, r * 0.28), 0, Math.PI * 2);
          ctx.fillStyle = node.isMotorWheel ? '#f59e0b' : node.color;
          ctx.fill();
        } else if (solidIds.has(node.id)) {
          const s = r * 1.55;
          ctx.fillStyle = node.color;
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = node.color;
          ctx.fill();
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        if (node.isFoot && !node.isWheel) {
          ctx.beginPath();
          ctx.moveTo(p.x - r * 0.85, p.y + r * 0.55);
          ctx.lineTo(p.x + r * 0.85, p.y + r * 0.55);
          ctx.strokeStyle = '#059669';
          ctx.lineWidth = 2;
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
          ctx.lineWidth = 1.75;
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
