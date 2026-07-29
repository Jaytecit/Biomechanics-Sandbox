/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { CreatureBlueprint, isRigidBone, isTelescope, isPiston, isHardLengthConstraint, resolveLinkKind, sameUnorderedNodePair, findParallelHardLink, DEFAULT_MOTOR_POWER, MAX_MOTOR_POWER, MIN_MOTOR_POWER, DEFAULT_AERO_AREA, DEFAULT_PARACHUTE_AREA, MIN_AERO_AREA, MAX_AERO_AREA, MIN_LINK_LENGTH, MAX_LINK_LENGTH, clampLinkLength, restingLengthFromMaxExpansion, clampPistonRate, defaultPistonRatesForStroke, pistonRates, MIN_PISTON_RATE, MAX_PISTON_RATE, MuscleLinkKind, SolidSegmentSpec } from '../types';
import { drawChuteString } from '../aero';
import { CREATURE_TEMPLATES } from '../templates';
import { createRandomMorph } from '../randomMorph';
import {
  Wrench,
  Plus,
  Trash2,
  CheckCircle,
  Dna,
  Link,
  ChevronRight,
  Sparkles,
  Info,
  Shield,
  Dices,
  Paintbrush,
  Eraser,
  Play,
  Pause,
  RefreshCw,
  Grid3x3,
  Save,
  ZoomIn,
  ZoomOut,
  MoveVertical,
  Gauge,
  Box,
  Unlock,
} from 'lucide-react';
import { ArenaZoneId, ARENA_ZONES, blueprintAllowedInZone } from '../zones';
import {
  AppearancePrimitive,
  AppearanceRig,
  nextCreatureVersionName,
  saveStudioDraft,
} from '../creaturePackages';
import { BiologicalPreset, createBiologicalPreset, drawAppearance } from '../appearance';
import { CreatureLibraryPanel } from './CreatureLibraryPanel';
import {
  MAX_SOLID_SEGMENTS,
  MIN_SOLID_NODES,
  captureSolidRestOffsets,
  isLinkWhollyInsideSolid,
  newSolidId,
  normalizeSolidSegments,
  projectSolidBodiesOnMap,
  pruneSolidSegments,
  remapSolidSegments,
  softLinksInsideSolid,
  solidMembership,
  solidNodeIdSet,
  validateSolidSegments,
} from '../solidSegments';
import { projectHingeStopsOnMap } from '../hingeStops';

const STUDIO_GRID_SIZE = 30;
/** Ground / anatomy origin sits this many grid cells above the canvas bottom. */
const STUDIO_GROUND_GRID_OFFSET = 3;
const STUDIO_ZOOM_MIN = 0.5;
const STUDIO_ZOOM_MAX = 2;
const STUDIO_ZOOM_STEP = 0.25;

function snapToGrid(value: number, size = STUDIO_GRID_SIZE): number {
  return Math.round(value / size) * size;
}

/** World Y of the ground alignment line (and anatomy origin) in canvas pixels. */
function studioOriginY(canvasHeight: number): number {
  return canvasHeight - STUDIO_GROUND_GRID_OFFSET * STUDIO_GRID_SIZE;
}

function parallelSoftStrokeOffset(
  muscle: Pick<StudioMuscle, 'id' | 'nodeA' | 'nodeB' | 'minLength' | 'maxLength' | 'strength' | 'linkKind' | 'aeroType'>,
  all: StudioMuscle[],
  xA: number,
  yA: number,
  xB: number,
  yB: number,
  pixels = 5
): { xA: number; yA: number; xB: number; yB: number } {
  if (resolveLinkKind(muscle) !== 'muscle' || !findParallelHardLink(muscle, all)) {
    return { xA, yA, xB, yB };
  }
  const dx = xB - xA;
  const dy = yB - yA;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * pixels;
  const oy = (dx / len) * pixels;
  return { xA: xA + ox, yA: yA + oy, xB: xB + ox, yB: yB + oy };
}

function drawTelescopeLink(
  ctx: CanvasRenderingContext2D,
  xA: number,
  yA: number,
  xB: number,
  yB: number,
  selected: boolean,
  thickBoost: number
) {
  const dx = xB - xA;
  const dy = yB - yA;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const mid = 0.55;
  const mx = xA + dx * mid;
  const my = yA + dy * mid;

  ctx.lineCap = 'round';
  // Outer sleeve
  ctx.strokeStyle = selected ? '#38bdf8' : '#0f766e';
  ctx.lineWidth = (selected ? 10 : 8) + thickBoost;
  ctx.beginPath();
  ctx.moveTo(xA, yA);
  ctx.lineTo(mx, my);
  ctx.stroke();
  ctx.strokeStyle = selected ? '#ccfbf1' : '#5eead4';
  ctx.lineWidth = (selected ? 5 : 3.5) + thickBoost * 0.5;
  ctx.beginPath();
  ctx.moveTo(xA + ux * 2, yA + uy * 2);
  ctx.lineTo(mx, my);
  ctx.stroke();
  // Inner rod
  ctx.strokeStyle = selected ? '#0284c7' : '#134e4a';
  ctx.lineWidth = (selected ? 5 : 3.5) + thickBoost * 0.4;
  ctx.beginPath();
  ctx.moveTo(mx - ux * 4, my - uy * 4);
  ctx.lineTo(xB, yB);
  ctx.stroke();
  ctx.strokeStyle = selected ? '#e0f2fe' : '#99f6e4';
  ctx.lineWidth = (selected ? 2.5 : 1.75) + thickBoost * 0.25;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(xB - ux * 2, yB - uy * 2);
  ctx.stroke();
}

/** Indigo sleeve/rod for authorable-rate pistons (distinct from teal telescopes). */
function drawPistonLink(
  ctx: CanvasRenderingContext2D,
  xA: number,
  yA: number,
  xB: number,
  yB: number,
  selected: boolean,
  thickBoost: number
) {
  const dx = xB - xA;
  const dy = yB - yA;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const mid = 0.55;
  const mx = xA + dx * mid;
  const my = yA + dy * mid;

  ctx.lineCap = 'round';
  ctx.strokeStyle = selected ? '#38bdf8' : '#4338ca';
  ctx.lineWidth = (selected ? 10 : 8) + thickBoost;
  ctx.beginPath();
  ctx.moveTo(xA, yA);
  ctx.lineTo(mx, my);
  ctx.stroke();
  ctx.strokeStyle = selected ? '#e0e7ff' : '#a5b4fc';
  ctx.lineWidth = (selected ? 5 : 3.5) + thickBoost * 0.5;
  ctx.beginPath();
  ctx.moveTo(xA + ux * 2, yA + uy * 2);
  ctx.lineTo(mx, my);
  ctx.stroke();
  ctx.strokeStyle = selected ? '#1d4ed8' : '#312e81';
  ctx.lineWidth = (selected ? 5 : 3.5) + thickBoost * 0.4;
  ctx.beginPath();
  ctx.moveTo(mx - ux * 4, my - uy * 4);
  ctx.lineTo(xB, yB);
  ctx.stroke();
  ctx.strokeStyle = selected ? '#eff6ff' : '#c7d2fe';
  ctx.lineWidth = (selected ? 2.5 : 1.75) + thickBoost * 0.25;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(xB - ux * 2, yB - uy * 2);
  ctx.stroke();
  // Rate collar mark near the sleeve lip
  ctx.strokeStyle = selected ? '#fbbf24' : '#818cf8';
  ctx.lineWidth = (selected ? 3 : 2) + thickBoost * 0.15;
  ctx.beginPath();
  ctx.moveTo(mx - ux * 2 - uy * 4, my - uy * 2 + ux * 4);
  ctx.lineTo(mx - ux * 2 + uy * 4, my - uy * 2 - ux * 4);
  ctx.stroke();
}

interface StudioProps {
  onLoadCustomTemplate: (blueprint: CreatureBlueprint, appearance?: AppearanceRig) => void;
  /** Persist anatomy into the Creature Anatomy selector without leaving the Studio. */
  onSaveCreature?: (blueprint: CreatureBlueprint, appearance?: AppearanceRig) => boolean;
  activeTemplate: CreatureBlueprint;
  activeAppearance?: AppearanceRig;
  /** Built-ins + saved customs for quick import */
  libraryTemplates?: CreatureBlueprint[];
  /** Active arena zone — restricts wheels / aero equipment */
  zoneId?: ArenaZoneId;
}

interface StudioNode {
  id: number;
  mass: number;
  radius: number;
  friction: number;
  color: string;
  x: number;
  y: number;
  /** Rolling wheel (passive or motor) */
  isWheel?: boolean;
  /** Powered wheel driven by the brain when grounded */
  isMotorWheel?: boolean;
  /** Max drive strength for motor wheels */
  motorPower?: number;
  /** Runtime spin for physics preview visuals */
  spinAngle?: number;
  /** Authored foot for walk plant / alternate-step scoring */
  isFoot?: boolean;
  /** Right-angle hinge stop (hard bones ≤ 90°) */
  isHingeStop?: boolean;
}

interface StudioMuscle {
  id: number;
  nodeA: number; // Node ID
  nodeB: number; // Node ID
  originalLength: number;
  minLength: number;
  maxLength: number;
  strength: number;
  phaseOffset: number;
  linkKind?: MuscleLinkKind;
  /** Piston expansion rate (px / physics tick). */
  extendRate?: number;
  /** Piston compression rate (px / physics tick). */
  retractRate?: number;
  thickness?: number;
  aeroType?: 'none' | 'wing' | 'paraglider' | 'parachute';
  aeroArea?: number;
}

type SkinLibraryPart = 'joint' | 'sleeve' | 'torso' | 'ear' | 'fin' | 'tail';
type SkinAnchor =
  | { type: 'node'; index: number; id: number }
  | { type: 'muscle'; index: number; id: number };

export const Studio: React.FC<StudioProps> = ({
  onLoadCustomTemplate,
  onSaveCreature,
  activeTemplate,
  activeAppearance,
  libraryTemplates,
  zoneId = 'free' as ArenaZoneId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 580, height: 380 });
  const [studioZoom, setStudioZoom] = useState(1);
  const [appearance, setAppearance] = useState<AppearanceRig>(() => createBiologicalPreset(activeTemplate));
  // Studio is an unrestricted workshop. Eligibility is evaluated only when a
  // creature is launched into a zone/challenge.
  const zoneEquip = {
    allowPassiveWheels: true,
    allowMotorWheels: true,
    allowAero: true,
  };
  const zoneLibrary = libraryTemplates || CREATURE_TEMPLATES;

  // Handle responsive sizing — only track width; height is locked to avoid origin jump
  useEffect(() => {
    if (!containerRef.current) return;

    const applySize = () => {
      if (!containerRef.current) return;
      const width = Math.max(containerRef.current.clientWidth, 400);
      const height = Math.max(containerRef.current.clientHeight, 280);
      setDimensions(prev =>
        prev.width === width && prev.height === height ? prev : { width, height }
      );
    };

    applySize();
    const resizeObserver = new ResizeObserver(() => applySize());
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);
  
  // Custom anatomy state
  const [nodes, setNodes] = useState<StudioNode[]>([]);
  const [muscles, setMuscles] = useState<StudioMuscle[]>([]);
  const [solidSegments, setSolidSegments] = useState<SolidSegmentSpec[]>([]);
  const [creatureName, setCreatureName] = useState<string>('Custom Mech');
  const solidRestRef = useRef<Map<string, { x: number; y: number }[]>>(new Map());
  const solidsRef = useRef<SolidSegmentSpec[]>([]);

  // Interactive UI state
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<number[]>([]);
  const [selectedMuscleId, setSelectedMuscleId] = useState<number | null>(null);
  const [editorMode, setEditorMode] = useState<
    'select' | 'add_node' | 'add_muscle' | 'add_bone' | 'add_telescope' | 'add_piston' | 'paint' | 'skin_ellipse' | 'skin_sheet'
  >('select');
  const [linkFromNodeId, setLinkFromNodeId] = useState<number | null>(null);
  const [linkCursor, setLinkCursor] = useState<{ x: number; y: number } | null>(null);
  const [physicsEnabled, setPhysicsEnabled] = useState(false);
  /** Snap node placement / drag to the blueprint grid */
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(true);
  /** Slow cyclic expand/compress of flexible muscles to their min/max lengths */
  const [rangePreviewEnabled, setRangePreviewEnabled] = useState(false);
  const rangeTimeRef = useRef(0);
  const restPoseRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // Dragging / paint / physics state
  const isDraggingRef = useRef<boolean>(false);
  const dragNodeIdRef = useRef<number | null>(null);
  const isPaintingRef = useRef<boolean>(false);
  const activeSkinPrimitiveIdRef = useRef<string | null>(null);
  const lastSkinCursorRef = useRef<{ x: number; y: number } | null>(null);
  const skinEllipseStartRef = useRef<{
    x: number;
    y: number;
    anchor: SkinAnchor;
  } | null>(null);
  const physicsOldRef = useRef<Map<number, { oldX: number; oldY: number }>>(new Map());
  const [skinFill, setSkinFill] = useState('#84cc16');
  const [skinOutline, setSkinOutline] = useState('#365314');
  const [skinLayer, setSkinLayer] = useState<'behind' | 'front'>('front');
  const [selectedSkinPreset, setSelectedSkinPreset] = useState<BiologicalPreset | null>('leaf');
  const [selectedSkinPartId, setSelectedSkinPartId] = useState<string | null>(null);
  const [libraryRefreshToken, setLibraryRefreshToken] = useState(0);
  const nodesRef = useRef(nodes);
  const musclesRef = useRef(muscles);
  nodesRef.current = nodes;
  musclesRef.current = muscles;
  solidsRef.current = solidSegments;

  const resetToolSources = () => {
    setLinkFromNodeId(null);
    setLinkCursor(null);
  };

  const clearNodeSelection = () => {
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
  };

  const selectSingleNode = (nodeId: number) => {
    setSelectedNodeId(nodeId);
    setSelectedNodeIds([nodeId]);
    setSelectedMuscleId(null);
  };

  const toggleNodeInSelection = (nodeId: number) => {
    setSelectedMuscleId(null);
    setSelectedNodeIds(prev => {
      const exists = prev.includes(nodeId);
      const next = exists ? prev.filter(id => id !== nodeId) : [...prev, nodeId];
      setSelectedNodeId(next.length ? next[next.length - 1] : null);
      return next;
    });
  };

  const positionsMap = () => {
    const map = new Map<number, { x: number; y: number }>();
    for (const node of nodes) map.set(node.id, { x: node.x, y: node.y });
    return map;
  };


  const handleClearCanvas = () => {
    setNodes([]);
    setMuscles([]);
    setSolidSegments([]);
    solidRestRef.current.clear();
    clearNodeSelection();
    setSelectedMuscleId(null);
    setSelectedSkinPartId(null);
    setSelectedSkinPreset(null);
    setAppearance(current => ({ ...current, primitives: [] }));
    resetToolSources();
    setEditorMode('select');
    setPhysicsEnabled(false);
    physicsOldRef.current.clear();
    isDraggingRef.current = false;
    dragNodeIdRef.current = null;
    isPaintingRef.current = false;
    setRangePreviewEnabled(false);
    rangeTimeRef.current = 0;
    restPoseRef.current.clear();
  };

  /** Soft-body paint: thicken nearest muscle or bone under the cursor. */
  const paintMuscleAtPoint = (relativeX: number, relativeY: number, amount = 0.05) => {
    let bestId: number | null = null;
    let bestDist = 22;

    for (const muscle of muscles) {
      const a = nodes.find(n => n.id === muscle.nodeA);
      const b = nodes.find(n => n.id === muscle.nodeB);
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((relativeX - a.x) * dx + (relativeY - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + t * dx;
      const py = a.y + t * dy;
      const dist = Math.hypot(relativeX - px, relativeY - py);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = muscle.id;
      }
    }

    if (bestId === null) return;
    setMuscles(prev =>
      prev.map(m => {
        if (m.id !== bestId) return m;
        return { ...m, thickness: Math.min(4, (m.thickness ?? 1) + amount) };
      })
    );
    setSelectedMuscleId(bestId);
    setSelectedNodeId(null);
  };

  const skinPointAt = (
    relativeX: number,
    relativeY: number
  ): AppearancePrimitive['points'][number] | null => {
    const candidates: Array<{
      muscleIndex: number;
      distance: number;
      along: number;
      offset: number;
    }> = [];
    muscles.forEach((muscle, muscleIndex) => {
      const a = nodes.find(node => node.id === muscle.nodeA);
      const b = nodes.find(node => node.id === muscle.nodeB);
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const length = Math.sqrt(lengthSquared);
      if (length < 1) return;
      const along = ((relativeX - a.x) * dx + (relativeY - a.y) * dy) / lengthSquared;
      const projectedX = a.x + along * dx;
      const projectedY = a.y + along * dy;
      const distance = Math.hypot(relativeX - projectedX, relativeY - projectedY);
      const offset = (-(relativeX - a.x) * dy + (relativeY - a.y) * dx) / length;
      candidates.push({ muscleIndex, distance, along, offset });
    });

    candidates.sort((a, b) => a.distance - b.distance);
    const nearest = candidates.slice(0, 2);
    if (nearest.length === 0) return null;
    const rawWeights = nearest.map(candidate => 1 / Math.max(4, candidate.distance));
    const weightTotal = rawWeights.reduce((sum, weight) => sum + weight, 0);
    return {
      x: nearest[0].along,
      y: nearest[0].offset,
      weights: nearest.map((candidate, index) => ({
        muscle: candidate.muscleIndex,
        weight: rawWeights[index] / weightTotal,
        x: candidate.along,
        y: candidate.offset,
      })),
    };
  };

  const muscleLocalAt = (muscleIndex: number, relativeX: number, relativeY: number) => {
    const muscle = muscles[muscleIndex];
    const a = muscle && nodes.find(node => node.id === muscle.nodeA);
    const b = muscle && nodes.find(node => node.id === muscle.nodeB);
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const length = Math.sqrt(lengthSquared);
    if (length < 1) return null;
    return {
      along: ((relativeX - a.x) * dx + (relativeY - a.y) * dy) / lengthSquared,
      offset: (-(relativeX - a.x) * dy + (relativeY - a.y) * dx) / length,
      length,
    };
  };

  const selectedSkinAnchor = (): SkinAnchor | null => {
    if (selectedNodeId !== null) {
      const index = nodes.findIndex(node => node.id === selectedNodeId);
      if (index >= 0) return { type: 'node', index, id: selectedNodeId };
    }
    if (selectedMuscleId !== null) {
      const index = muscles.findIndex(muscle => muscle.id === selectedMuscleId);
      if (index >= 0) return { type: 'muscle', index, id: selectedMuscleId };
    }
    return null;
  };

  const nearestSkinAnchor = (relativeX: number, relativeY: number): SkinAnchor | null => {
    let bestNode: { index: number; id: number; distance: number } | null = null;
    nodes.forEach((node, index) => {
      const distance = Math.hypot(relativeX - node.x, relativeY - node.y);
      if (!bestNode || distance < bestNode.distance) {
        bestNode = { index, id: node.id, distance };
      }
    });
    let bestMuscle: { index: number; id: number; distance: number } | null = null;
    muscles.forEach((muscle, index) => {
      const local = muscleLocalAt(index, relativeX, relativeY);
      if (!local) return;
      const along = Math.max(0, Math.min(1, local.along));
      const a = nodes.find(node => node.id === muscle.nodeA)!;
      const b = nodes.find(node => node.id === muscle.nodeB)!;
      const px = a.x + (b.x - a.x) * along;
      const py = a.y + (b.y - a.y) * along;
      const distance = Math.hypot(relativeX - px, relativeY - py);
      if (!bestMuscle || distance < bestMuscle.distance) {
        bestMuscle = { index, id: muscle.id, distance };
      }
    });
    if (!bestNode) {
      return bestMuscle
        ? { type: 'muscle', index: bestMuscle.index, id: bestMuscle.id }
        : null;
    }
    if (!bestMuscle || bestNode.distance <= bestMuscle.distance) {
      return { type: 'node', index: bestNode.index, id: bestNode.id };
    }
    return { type: 'muscle', index: bestMuscle.index, id: bestMuscle.id };
  };

  const addSkinLibraryPart = (kind: SkinLibraryPart) => {
    const anchor = selectedSkinAnchor();
    if (!anchor) {
      alert('Select a node or muscle first, then choose a solid body part to attach.');
      return;
    }
    if (kind === 'joint' && anchor.type !== 'node') {
      alert('Joint pads attach to nodes. Select a node first.');
      return;
    }
    if (kind === 'sleeve' && anchor.type !== 'muscle') {
      alert('Limb sleeves attach to muscles or bones. Select a link first.');
      return;
    }

    const id = `skin-part-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const base = {
      id,
      layer: skinLayer,
      z: skinLayer === 'front' ? 75 : 15,
      fill: skinFill,
      stroke: skinOutline,
      opacity: 0.96,
    } as const;
    let part: AppearancePrimitive;

    if (anchor.type === 'node') {
      const node = nodes[anchor.index];
      const radius = Math.max(10, node.radius);
      const shapes: Record<Exclude<SkinLibraryPart, 'sleeve'>, AppearancePrimitive> = {
        joint: {
          ...base,
          kind: 'ellipse',
          anchorNode: anchor.index,
          points: [{ x: 0, y: 0 }, { x: radius * 1.45, y: radius * 1.3 }],
        },
        torso: {
          ...base,
          kind: 'ellipse',
          anchorNode: anchor.index,
          points: [{ x: 0, y: 0 }, { x: radius * 2.3, y: radius * 1.65 }],
        },
        ear: {
          ...base,
          kind: 'ear',
          anchorNode: anchor.index,
          points: [{ x: -radius * 0.7, y: 0 }, { x: 0, y: -radius * 2.2 }, { x: radius * 0.7, y: 0 }],
        },
        fin: {
          ...base,
          kind: 'fin',
          anchorNode: anchor.index,
          points: [{ x: -radius, y: 0 }, { x: 0, y: -radius * 2 }, { x: radius, y: 0 }, { x: 0, y: radius * 0.6 }],
        },
        tail: {
          ...base,
          kind: 'tail',
          anchorNode: anchor.index,
          points: [
            { x: 0, y: -radius * 0.55 },
            { x: radius * 2.8, y: -radius },
            { x: radius * 4, y: 0 },
            { x: radius * 2.8, y: radius },
            { x: 0, y: radius * 0.55 },
          ],
        },
      };
      part = shapes[kind as Exclude<SkinLibraryPart, 'sleeve'>];
    } else {
      const local = muscleLocalAt(anchor.index, 0, 0);
      const muscle = muscles[anchor.index];
      const a = nodes.find(node => node.id === muscle.nodeA)!;
      const b = nodes.find(node => node.id === muscle.nodeB)!;
      const length = local?.length ?? Math.hypot(b.x - a.x, b.y - a.y);
      const width = Math.max(13, Math.min(a.radius, b.radius) * 1.8);
      const shapes: Record<Exclude<SkinLibraryPart, 'joint'>, AppearancePrimitive> = {
        sleeve: {
          ...base,
          kind: 'capsule',
          anchorMuscle: anchor.index,
          points: [{ x: 0, y: 0 }, { x: 1, y: width }],
        },
        torso: {
          ...base,
          kind: 'ellipse',
          anchorMuscle: anchor.index,
          points: [{ x: 0.5, y: 0 }, { x: length * 0.38, y: width * 1.25 }],
        },
        ear: {
          ...base,
          kind: 'ear',
          anchorMuscle: anchor.index,
          points: [{ x: 0.18, y: 0 }, { x: 0.35, y: -width * 1.8 }, { x: 0.5, y: 0 }],
        },
        fin: {
          ...base,
          kind: 'fin',
          anchorMuscle: anchor.index,
          points: [{ x: 0.15, y: 0 }, { x: 0.5, y: -width * 1.9 }, { x: 0.85, y: 0 }],
        },
        tail: {
          ...base,
          kind: 'tail',
          anchorMuscle: anchor.index,
          points: [
            { x: 0.72, y: -width * 0.35 },
            { x: 1.25, y: -width },
            { x: 1.7, y: 0 },
            { x: 1.25, y: width },
            { x: 0.72, y: width * 0.35 },
          ],
        },
      };
      part = shapes[kind as Exclude<SkinLibraryPart, 'joint'>];
    }
    setSelectedSkinPreset(null);
    setSelectedSkinPartId(id);
    setAppearance(current => ({ ...current, primitives: [...current.primitives, part] }));
  };

  const beginSkinSheet = (relativeX: number, relativeY: number) => {
    const point = skinPointAt(relativeX, relativeY);
    if (!point) return;
    const id = `skin-sheet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    activeSkinPrimitiveIdRef.current = id;
    lastSkinCursorRef.current = { x: relativeX, y: relativeY };
    setSelectedSkinPreset(null);
    setSelectedSkinPartId(id);
    setAppearance(current => ({
      ...current,
      primitives: [
        ...current.primitives,
        {
          id,
          kind: 'patch',
          layer: skinLayer,
          z: skinLayer === 'front' ? 80 : 20,
          fill: skinFill,
          stroke: skinOutline,
          opacity: 0.96,
          points: [point],
        },
      ],
    }));
  };

  const continueSkinSheet = (relativeX: number, relativeY: number) => {
    const id = activeSkinPrimitiveIdRef.current;
    const last = lastSkinCursorRef.current;
    if (!id || (last && Math.hypot(relativeX - last.x, relativeY - last.y) < 7)) return;
    const point = skinPointAt(relativeX, relativeY);
    if (!point) return;
    lastSkinCursorRef.current = { x: relativeX, y: relativeY };
    setAppearance(current => ({
      ...current,
      primitives: current.primitives.map(part =>
        part.id === id ? { ...part, points: [...part.points, point] } : part
      ),
    }));
  };

  const beginSkinEllipse = (relativeX: number, relativeY: number) => {
    const anchor = selectedSkinAnchor() ?? nearestSkinAnchor(relativeX, relativeY);
    if (!anchor) return;
    if (anchor.type === 'node') {
      setSelectedNodeId(anchor.id);
      setSelectedMuscleId(null);
    } else {
      setSelectedMuscleId(anchor.id);
      setSelectedNodeId(null);
    }
    const id = `skin-ellipse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    activeSkinPrimitiveIdRef.current = id;
    skinEllipseStartRef.current = { x: relativeX, y: relativeY, anchor };
    setSelectedSkinPreset(null);
    setSelectedSkinPartId(id);
    const center = anchor.type === 'node'
      ? {
          x: relativeX - nodes[anchor.index].x,
          y: relativeY - nodes[anchor.index].y,
        }
      : (() => {
          const local = muscleLocalAt(anchor.index, relativeX, relativeY)!;
          return { x: local.along, y: local.offset };
        })();
    setAppearance(current => ({
      ...current,
      primitives: [...current.primitives, {
        id,
        kind: 'ellipse',
        anchorNode: anchor.type === 'node' ? anchor.index : undefined,
        anchorMuscle: anchor.type === 'muscle' ? anchor.index : undefined,
        layer: skinLayer,
        z: skinLayer === 'front' ? 78 : 18,
        fill: skinFill,
        stroke: skinOutline,
        opacity: 0.96,
        points: [center, { x: 2, y: 2 }],
      }],
    }));
  };

  const continueSkinEllipse = (relativeX: number, relativeY: number) => {
    const id = activeSkinPrimitiveIdRef.current;
    const start = skinEllipseStartRef.current;
    if (!id || !start) return;
    let center: { x: number; y: number };
    let size: { x: number; y: number };
    if (start.anchor.type === 'node') {
      const node = nodes[start.anchor.index];
      const startX = start.x - node.x;
      const startY = start.y - node.y;
      const currentX = relativeX - node.x;
      const currentY = relativeY - node.y;
      center = { x: (startX + currentX) / 2, y: (startY + currentY) / 2 };
      size = { x: Math.abs(currentX - startX) / 2, y: Math.abs(currentY - startY) / 2 };
    } else {
      const startLocal = muscleLocalAt(start.anchor.index, start.x, start.y);
      const currentLocal = muscleLocalAt(start.anchor.index, relativeX, relativeY);
      if (!startLocal || !currentLocal) return;
      center = {
        x: (startLocal.along + currentLocal.along) / 2,
        y: (startLocal.offset + currentLocal.offset) / 2,
      };
      size = {
        x: Math.abs(currentLocal.along - startLocal.along) * startLocal.length / 2,
        y: Math.abs(currentLocal.offset - startLocal.offset) / 2,
      };
    }
    setAppearance(current => ({
      ...current,
      primitives: current.primitives.map(part =>
        part.id === id ? { ...part, points: [center, size] } : part
      ),
    }));
  };

  const finishSkinPrimitive = () => {
    const id = activeSkinPrimitiveIdRef.current;
    if (id) {
      setAppearance(current => ({
        ...current,
        primitives: current.primitives.filter(part => {
          if (part.id !== id) return true;
          if (part.kind === 'patch') return part.points.length >= 3;
          if (part.kind === 'ellipse') {
            const size = part.points[1];
            return !!size && Math.abs(size.x) >= 3 && Math.abs(size.y) >= 3;
          }
          return true;
        }),
      }));
    }
    activeSkinPrimitiveIdRef.current = null;
    lastSkinCursorRef.current = null;
    skinEllipseStartRef.current = null;
  };

  // Cycle muscle ↔ bone ↔ telescope ↔ piston
  const toggleMuscleRigidity = (muscleId: number) => {
    setMuscles(prev => prev.map(m => {
      if (m.id !== muscleId) return m;
      const kind = resolveLinkKind(m);
      if (kind === 'bone') {
        // Fixed bone → telescope (variable hard, global rate)
        const rest = m.originalLength || m.minLength;
        const maxLength = clampLinkLength(Math.round(rest * 1.3));
        const minLength = clampLinkLength(Math.min(Math.round(rest * 0.7), maxLength));
        return {
          ...m,
          linkKind: 'telescope',
          minLength,
          maxLength,
          originalLength: restingLengthFromMaxExpansion(maxLength),
          strength: 1.0,
          extendRate: undefined,
          retractRate: undefined,
        };
      }
      if (kind === 'telescope') {
        // Telescope → authorable-rate piston
        const rates = defaultPistonRatesForStroke(m.minLength, m.maxLength);
        return {
          ...m,
          linkKind: 'piston',
          strength: 1.0,
          extendRate: rates.extendRate,
          retractRate: rates.retractRate,
        };
      }
      if (kind === 'piston') {
        // Piston → soft muscle
        const rest = m.originalLength || Math.round((m.minLength + m.maxLength) / 2);
        const maxLength = clampLinkLength(Math.round(rest * 1.4));
        const minLength = clampLinkLength(Math.min(Math.round(rest * 0.6), maxLength));
        return {
          ...m,
          linkKind: 'muscle',
          minLength,
          maxLength,
          originalLength: restingLengthFromMaxExpansion(maxLength),
          strength: 0.6,
          extendRate: undefined,
          retractRate: undefined,
        };
      }
      // Soft muscle → fixed bone
      const rest = m.originalLength || Math.round((m.minLength + m.maxLength) / 2);
      return {
        ...m,
        linkKind: 'bone',
        originalLength: rest,
        minLength: rest,
        maxLength: rest,
        strength: 1.0,
        extendRate: undefined,
        retractRate: undefined,
      };
    }));
  };

  const capturePhysicsPose = () => {
    const currentNodes = nodesRef.current;
    setMuscles(prev =>
      prev.map(m => {
        const a = currentNodes.find(n => n.id === m.nodeA);
        const b = currentNodes.find(n => n.id === m.nodeB);
        if (!a || !b) return m;
        const dist = Math.round(Math.hypot(b.x - a.x, b.y - a.y)) || 5;
        if (isRigidBone(m)) {
          return { ...m, linkKind: 'bone', originalLength: dist, minLength: dist, maxLength: dist };
        }
        if (isTelescope(m) || isPiston(m)) {
          const span = Math.max(8, Math.round(dist * 0.3));
          const maxLength = clampLinkLength(dist + span);
          const minLength = clampLinkLength(Math.min(Math.max(MIN_LINK_LENGTH, dist - span), maxLength));
          const rates = isPiston(m)
            ? defaultPistonRatesForStroke(minLength, maxLength)
            : undefined;
          return {
            ...m,
            linkKind: isPiston(m) ? ('piston' as const) : ('telescope' as const),
            originalLength: restingLengthFromMaxExpansion(maxLength),
            minLength,
            maxLength,
            strength: 1.0,
            ...(rates
              ? { extendRate: rates.extendRate, retractRate: rates.retractRate }
              : { extendRate: undefined, retractRate: undefined }),
          };
        }
        const maxLength = clampLinkLength(Math.round(dist * 1.4));
        const minLength = clampLinkLength(Math.min(Math.round(dist * 0.6), maxLength));
        return {
          ...m,
          originalLength: restingLengthFromMaxExpansion(maxLength),
          minLength,
          maxLength,
        };
      })
    );
  };

  const refreshSolidRestOffsets = (nextSolids: SolidSegmentSpec[], nextNodes: StudioNode[]) => {
    const positions = new Map<number, { x: number; y: number }>();
    const masses = new Map<number, number>();
    for (const n of nextNodes) {
      positions.set(n.id, { x: n.x, y: n.y });
      masses.set(n.id, n.mass);
    }
    solidRestRef.current = captureSolidRestOffsets(nextSolids, positions, masses);
  };

  const handleLockSolid = () => {
    const ids = selectedNodeIds.length > 0
      ? selectedNodeIds
      : selectedNodeId !== null
        ? [selectedNodeId]
        : [];
    if (ids.length < MIN_SOLID_NODES) {
      alert(`Select at least ${MIN_SOLID_NODES} nodes (Shift+click) to create a solid plate.`);
      return;
    }
    if (solidSegments.length >= MAX_SOLID_SEGMENTS) {
      alert(`At most ${MAX_SOLID_SEGMENTS} solid segments are allowed.`);
      return;
    }
    const membership = solidMembership(solidSegments);
    if (ids.some(id => membership.has(id))) {
      alert('One or more selected nodes already belong to a solid. Unlock them first.');
      return;
    }
    const draft: SolidSegmentSpec = {
      id: newSolidId(solidSegments),
      nodeIds: [...ids],
    };
    const nextSolids = normalizeSolidSegments([...solidSegments, draft]);
    const softInside = softLinksInsideSolid(muscles, nextSolids);
    let nextMuscles = muscles;
    if (softInside.length > 0) {
      const remove = new Set<number>(softInside);
      nextMuscles = muscles.filter(m => !remove.has(m.id));
      setMuscles(nextMuscles);
    }
    const err = validateSolidSegments(
      nextSolids,
      nodes.map(n => n.id),
      nextMuscles
    );
    if (err) {
      alert(err);
      return;
    }
    setSolidSegments(nextSolids);
    refreshSolidRestOffsets(nextSolids, nodes);
  };

  const handleUnlockSolid = () => {
    const ids = new Set<number>(
      selectedNodeIds.length > 0
        ? selectedNodeIds
        : selectedNodeId !== null
          ? [selectedNodeId]
          : []
    );
    if (ids.size === 0) {
      alert('Select a solid node (or several) to unlock its plate.');
      return;
    }
    const membership = solidMembership(solidSegments);
    const unlockIds = new Set<string>();
    for (const id of ids) {
      const sid = membership.get(id);
      if (sid) unlockIds.add(sid);
    }
    if (unlockIds.size === 0) {
      alert('Selection is not part of a solid plate.');
      return;
    }
    const next = solidSegments.filter(s => !unlockIds.has(s.id));
    setSolidSegments(next);
    refreshSolidRestOffsets(next, nodes);
  };

  const togglePhysics = () => {
    if (physicsEnabled) {
      capturePhysicsPose();
      setPhysicsEnabled(false);
      physicsOldRef.current.clear();
    } else {
      if (rangePreviewEnabled) {
        stopRangePreview(true);
      }
      const map = new Map<number, { oldX: number; oldY: number }>();
      for (const n of nodesRef.current) {
        map.set(n.id, { oldX: n.x, oldY: n.y });
      }
      physicsOldRef.current = map;
      refreshSolidRestOffsets(solidsRef.current, nodesRef.current);
      setPhysicsEnabled(true);
    }
  };

  const stopRangePreview = (restorePose: boolean) => {
    setRangePreviewEnabled(false);
    rangeTimeRef.current = 0;
    if (restorePose && restPoseRef.current.size > 0) {
      setNodes(prev =>
        prev.map(n => {
          const rest = restPoseRef.current.get(n.id);
          return rest ? { ...n, x: rest.x, y: rest.y } : n;
        })
      );
    }
    restPoseRef.current.clear();
  };

  const toggleRangePreview = () => {
    if (rangePreviewEnabled) {
      stopRangePreview(true);
      return;
    }
    if (physicsEnabled) {
      capturePhysicsPose();
      setPhysicsEnabled(false);
      physicsOldRef.current.clear();
    }
    const rest = new Map<number, { x: number; y: number }>();
    for (const n of nodesRef.current) {
      rest.set(n.id, { x: n.x, y: n.y });
    }
    restPoseRef.current = rest;
    rangeTimeRef.current = 0;
    setRangePreviewEnabled(true);
  };

  // Slow muscle range expand/compress loop (observe min/max travel)
  useEffect(() => {
    if (!rangePreviewEnabled) return;

    let rafId = 0;
    const RELAX_ITERS = 6;
    // Full compress→expand cycle ~5.5s
    const PERIOD = 5.5;

    const step = () => {
      rangeTimeRef.current += 1 / 60;
      const t = rangeTimeRef.current;
      const muscleList = musclesRef.current;

      setNodes(prev => {
        type Pos = { x: number; y: number };
        const pos = new Map<number, Pos>();
        for (const n of prev) {
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
            // 0 = fully compressed (min), 1 = fully expanded (max)
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
            const masses = new Map<number, number>(prev.map(n => [n.id, n.mass]));
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

        return prev.map(n => {
          const p = pos.get(n.id);
          return p ? { ...n, x: p.x, y: p.y } : n;
        });
      });

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [rangePreviewEnabled]);

  // Verlet-style physics preview while Physics toggle is ON
  useEffect(() => {
    if (!physicsEnabled) return;

    let rafId = 0;
    const RELAX_ITERS = 4;
    const GRAVITY = 0.25;
    const DAMPING = 0.99;

    const step = () => {
      const muscleList = musclesRef.current;
      const oldMap = physicsOldRef.current;
      const pinnedId = isDraggingRef.current ? dragNodeIdRef.current : null;

      setNodes(prev => {
        // Ensure old positions exist for every node
        for (const n of prev) {
          if (!oldMap.has(n.id)) {
            oldMap.set(n.id, { oldX: n.x, oldY: n.y });
          }
        }

        // Integrate Verlet
        const next = prev.map(n => {
          if (pinnedId === n.id) {
            const old = oldMap.get(n.id)!;
            old.oldX = n.x;
            old.oldY = n.y;
            return n;
          }
          const old = oldMap.get(n.id)!;
          let vx = (n.x - old.oldX) * DAMPING;
          let vy = (n.y - old.oldY) * DAMPING;
          const newX = n.x + vx;
          const newY = n.y + vy + GRAVITY;
          old.oldX = n.x;
          old.oldY = n.y;
          return { ...n, x: newX, y: newY };
        });

        // Build mutable working copy for constraint relaxation
        type Pos = { x: number; y: number; radius: number; friction: number };
        const pos = new Map<number, Pos>();
        for (const n of next) {
          pos.set(n.id, { x: n.x, y: n.y, radius: n.radius, friction: n.friction });
        }

        for (let iter = 0; iter < RELAX_ITERS; iter++) {
          const membership = solidMembership(solidsRef.current);
          for (const m of muscleList) {
            if (isLinkWhollyInsideSolid(m.nodeA, m.nodeB, membership)) continue;
            const a = pos.get(m.nodeA);
            const b = pos.get(m.nodeB);
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 1;
            const target = m.originalLength || dist;
            const strength = isHardLengthConstraint(m) ? 1.0 : Math.min(1, m.strength);
            const diff = ((dist - target) / dist) * 0.5 * strength;
            const ox = dx * diff;
            const oy = dy * diff;
            const pinA = pinnedId === m.nodeA;
            const pinB = pinnedId === m.nodeB;
            if (!pinA && !pinB) {
              a.x += ox;
              a.y += oy;
              b.x -= ox;
              b.y -= oy;
            } else if (pinA && !pinB) {
              b.x -= ox * 2;
              b.y -= oy * 2;
            } else if (!pinA && pinB) {
              a.x += ox * 2;
              a.y += oy * 2;
            }
            // D142: soft / telescope / piston — classic Verlet (force + actuation).
            // Fixed bones preserve history (quiet chassis).
            if (isRigidBone(m)) {
              if (!pinA && !pinB) {
                const oA = oldMap.get(m.nodeA);
                const oB = oldMap.get(m.nodeB);
                if (oA) {
                  oA.oldX += ox;
                  oA.oldY += oy;
                }
                if (oB) {
                  oB.oldX -= ox;
                  oB.oldY -= oy;
                }
              } else if (pinA && !pinB) {
                const oB = oldMap.get(m.nodeB);
                if (oB) {
                  oB.oldX -= ox * 2;
                  oB.oldY -= oy * 2;
                }
              } else if (!pinA && pinB) {
                const oA = oldMap.get(m.nodeA);
                if (oA) {
                  oA.oldX += ox * 2;
                  oA.oldY += oy * 2;
                }
              }
            }
          }
          // Shape-match solid plates every relaxation pass.
          if (solidsRef.current.length > 0) {
            const masses = new Map<number, number>();
            for (const n of prev) masses.set(n.id, n.mass);
            const pinned = pinnedId !== null ? new Set([pinnedId]) : undefined;
            projectSolidBodiesOnMap(
              pos,
              oldMap,
              masses,
              solidsRef.current,
              solidRestRef.current,
              { pinnedIds: pinned, preserveVelocity: true }
            );
          }
          const hingeIds = new Set<number>(
            prev.filter(n => n.isHingeStop).map(n => n.id)
          );
          if (hingeIds.size > 0) {
            projectHingeStopsOnMap(pos, oldMap, muscleList, hingeIds);
          }
        }

        // Ground collision at y = 0 (y increases downward)
        for (const [id, p] of pos) {
          if (pinnedId === id) continue;
          if (p.y + p.radius > 0) {
            p.y = -p.radius;
            const old = oldMap.get(id);
            if (old) {
              const vx = p.x - old.oldX;
              const src = prev.find(n => n.id === id);
              if (src?.isWheel) {
                // Passive roll: light drag + spin
                p.x = old.oldX + vx * 0.98;
                old.oldY = p.y;
                old.oldX = p.x;
                const spin = (src.spinAngle ?? 0) - vx / Math.max(1, p.radius);
                // stash spin on pos via side channel
                (p as Pos & { spinAngle?: number }).spinAngle = spin;
              } else {
                p.x -= vx * Math.min(1, Math.max(0, p.friction));
                old.oldY = p.y;
                old.oldX = p.x;
              }
            }
          }
        }

        // Re-project solids after ground so plates survive contact.
        if (solidsRef.current.length > 0) {
          const masses = new Map<number, number>();
          for (const n of prev) masses.set(n.id, n.mass);
          const pinned = pinnedId !== null ? new Set([pinnedId]) : undefined;
          projectSolidBodiesOnMap(
            pos,
            oldMap,
            masses,
            solidsRef.current,
            solidRestRef.current,
            { pinnedIds: pinned, preserveVelocity: true }
          );
        }
        {
          const hingeIds = new Set<number>(
            prev.filter(n => n.isHingeStop).map(n => n.id)
          );
          if (hingeIds.size > 0) {
            projectHingeStopsOnMap(pos, oldMap, muscleList, hingeIds);
          }
        }

        return next.map(n => {
          if (pinnedId === n.id) return n;
          const p = pos.get(n.id) as (Pos & { spinAngle?: number }) | undefined;
          if (!p) return n;
          if (n.isWheel && p.spinAngle !== undefined) {
            return { ...n, x: p.x, y: p.y, spinAngle: p.spinAngle };
          }
          return { ...n, x: p.x, y: p.y };
        });
      });

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [physicsEnabled]);

  // Load active template structure on mount/select
  const loadTemplateIntoStudio = (
    template: CreatureBlueprint,
    templateAppearance?: AppearanceRig
  ) => {
    const studioNodes: StudioNode[] = template.nodes.map((n, idx) => {
      const relPos = template.relativePositions[idx] || { x: 0, y: 0 };
      return {
        id: n.id,
        mass: n.mass,
        radius: n.radius,
        friction: n.friction,
        color: n.color || '#3b82f6',
        x: relPos.x,
        y: relPos.y,
        isWheel: n.isWheel ?? false,
        isMotorWheel: n.isMotorWheel ?? false,
        motorPower: n.motorPower ?? DEFAULT_MOTOR_POWER,
        isFoot: !!n.isFoot,
        isHingeStop: !!n.isHingeStop,
        spinAngle: 0,
      };
    });

    const studioMuscles: StudioMuscle[] = template.muscles.map(m => ({
      id: m.id,
      nodeA: m.nodeA,
      nodeB: m.nodeB,
      originalLength: m.originalLength,
      minLength: m.minLength,
      maxLength: m.maxLength,
      strength: m.strength,
      phaseOffset: m.phaseOffset,
      thickness: m.thickness ?? 1,
      aeroType: m.aeroType ?? 'none',
      aeroArea: m.aeroArea,
      linkKind: m.linkKind ?? resolveLinkKind(m),
      extendRate: m.extendRate,
      retractRate: m.retractRate,
    }));

    setNodes(studioNodes);
    setMuscles(studioMuscles);
    const loadedSolids = normalizeSolidSegments(template.solidSegments);
    setSolidSegments(loadedSolids);
    refreshSolidRestOffsets(loadedSolids, studioNodes);
    const baseAppearance = templateAppearance
      ? structuredClone(templateAppearance)
      : createBiologicalPreset(template);
    setAppearance({
      ...baseAppearance,
      primitives: baseAppearance.primitives.filter(part => part.kind !== 'rigidPlate'),
    });
    setSelectedSkinPreset(templateAppearance ? null : 'leaf');
    setCreatureName(
      nextCreatureVersionName(
        template.name,
        zoneLibrary.map(item => item.name)
      )
    );
    clearNodeSelection();
    setSelectedMuscleId(null);
    resetToolSources();
    if (physicsEnabled) {
      const map = new Map<number, { oldX: number; oldY: number }>();
      for (const n of studioNodes) {
        map.set(n.id, { oldX: n.x, oldY: n.y });
      }
      physicsOldRef.current = map;
    }
  };

  useEffect(() => {
    loadTemplateIntoStudio(activeTemplate, activeAppearance);
  }, [activeTemplate]);

  // Render loop for the Studio workbench grid
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background with soft blueprint mesh
    ctx.fillStyle = '#1e293b'; // Slate 800 theme for the studio dark workspace
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = studioOriginY(canvas.height);
    const visibleLeft = centerX - canvas.width / (2 * studioZoom);
    const visibleRight = centerX + canvas.width / (2 * studioZoom);
    const visibleTop = centerY - centerY / studioZoom;
    const visibleBottom = centerY + (canvas.height - centerY) / studioZoom;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(studioZoom, studioZoom);
    ctx.translate(-centerX, -centerY);

    // Draw reference grid aligned to the anatomy origin (matches snap)
    ctx.strokeStyle = snapToGridEnabled ? '#475569' : '#334155';
    ctx.lineWidth = 1 / studioZoom;
    const gridStartX =
      centerX + Math.floor((visibleLeft - centerX) / STUDIO_GRID_SIZE) * STUDIO_GRID_SIZE;
    const gridStartY =
      centerY + Math.floor((visibleTop - centerY) / STUDIO_GRID_SIZE) * STUDIO_GRID_SIZE;
    for (let x = gridStartX; x <= visibleRight; x += STUDIO_GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, visibleTop);
      ctx.lineTo(x, visibleBottom);
      ctx.stroke();
    }
    for (let y = gridStartY; y <= visibleBottom; y += STUDIO_GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(visibleLeft, y);
      ctx.lineTo(visibleRight, y);
      ctx.stroke();
    }

    // Draw Center/Origin lines
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5 / studioZoom;
    ctx.beginPath();
    ctx.moveTo(centerX, visibleTop);
    ctx.lineTo(centerX, visibleBottom);
    ctx.moveTo(visibleLeft, centerY);
    ctx.lineTo(visibleRight, centerY);
    ctx.stroke();

    // Ground reference line (3 grid squares above canvas bottom in default view)
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 1.5 / studioZoom;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(visibleLeft, centerY);
    ctx.lineTo(visibleRight, centerY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f87171';
    ctx.font = `${Math.max(9, 9 / studioZoom)}px ui-sans-serif, system-ui`;
    ctx.fillText(
      'GROUND (0 px)',
      visibleLeft + 52 / studioZoom,
      centerY - 8 / studioZoom
    );

    const nodeIndexById = new Map(nodes.map((node, index) => [node.id, index]));
    const appearanceSkeleton = {
      nodes: nodes.map(node => ({
        x: centerX + node.x,
        y: centerY + node.y,
        radius: node.radius,
        id: node.id,
      })),
      muscles: muscles.map(muscle => ({
        nodeA: nodeIndexById.get(muscle.nodeA) ?? -1,
        nodeB: nodeIndexById.get(muscle.nodeB) ?? -1,
      })),
    };
    drawAppearance(ctx, appearanceSkeleton, appearance, 'behind');

    // --- DRAW STUDIO MUSCLES AND BONES ---
    for (const muscle of appearance.hideSkeleton ? [] : muscles) {
      const nodeA = nodes.find(n => n.id === muscle.nodeA);
      const nodeB = nodes.find(n => n.id === muscle.nodeB);

      if (!nodeA || !nodeB) continue;

      const xA = centerX + nodeA.x;
      const yA = centerY + nodeA.y;
      const xB = centerX + nodeB.x;
      const yB = centerY + nodeB.y;

      const isSelected = selectedMuscleId === muscle.id;
      const kind = resolveLinkKind(muscle);
      const thickBoost = ((muscle.thickness ?? 1) - 1) * 3;
      const stroke = parallelSoftStrokeOffset(muscle, muscles, xA, yA, xB, yB);
      const sxA = stroke.xA;
      const syA = stroke.yA;
      const sxB = stroke.xB;
      const syB = stroke.yB;

      ctx.save();
      const aero = muscle.aeroType;
      if (aero === 'parachute') {
        // Studio: limp string by default; slight dome when selected so the shape is obvious.
        drawChuteString(ctx, xA, yA, xB, yB, muscle, {
          opacity: 1,
          lineWidth: isSelected ? 3.4 : 2.4,
          selected: isSelected,
          previewInflate: isSelected ? 0.7 : 0,
        });
        ctx.restore();
        continue;
      }
      if (aero === 'wing' || aero === 'paraglider') {
        const dx = xB - xA;
        const dy = yB - yA;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len;
        const py = dx / len;
        const half =
          Math.sqrt(Math.max(8, muscle.aeroArea ?? DEFAULT_AERO_AREA)) *
          (aero === 'paraglider' ? 0.55 : 0.4);
        ctx.beginPath();
        ctx.moveTo(xA, yA);
        ctx.lineTo(xA + px * half, yA + py * half);
        ctx.lineTo(xB + px * half, yB + py * half);
        ctx.lineTo(xB, yB);
        ctx.closePath();
        ctx.fillStyle =
          aero === 'wing' ? 'rgba(56, 189, 248, 0.28)' : 'rgba(167, 139, 250, 0.32)';
        ctx.fill();
        ctx.strokeStyle =
          aero === 'wing' ? 'rgba(14, 165, 233, 0.7)' : 'rgba(124, 58, 237, 0.75)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      if (kind === 'telescope') {
        drawTelescopeLink(ctx, sxA, syA, sxB, syB, isSelected, thickBoost);
      } else if (kind === 'piston') {
        drawPistonLink(ctx, sxA, syA, sxB, syB, isSelected, thickBoost);
      } else if (kind === 'bone') {
        // Draw Solid Bone
        ctx.lineCap = 'round';
        ctx.strokeStyle = isSelected ? '#38bdf8' : '#1e293b';
        ctx.lineWidth = (isSelected ? 9 : 7) + thickBoost;
        ctx.beginPath();
        ctx.moveTo(sxA, syA);
        ctx.lineTo(sxB, syB);
        ctx.stroke();

        ctx.strokeStyle = isSelected ? '#e0f2fe' : '#e2e8f0';
        ctx.lineWidth = (isSelected ? 5 : 3.5) + thickBoost * 0.6;
        ctx.beginPath();
        ctx.moveTo(sxA, syA);
        ctx.lineTo(sxB, syB);
        ctx.stroke();
      } else {
        // Draw Flexible Muscle — line width reflects painted thickness
        const len = Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y) || 1;
        const ratio = len / (muscle.originalLength || 1);
        let muscleColor = isSelected ? '#38bdf8' : '#64748b';
        if (rangePreviewEnabled && !isSelected) {
          if (ratio < 0.92) muscleColor = '#22d3ee'; // compressed
          else if (ratio > 1.08) muscleColor = '#fb923c'; // expanded
          else muscleColor = '#a78bfa';
        }
        ctx.strokeStyle = muscleColor;
        ctx.lineWidth = (isSelected ? 6 : 4) + thickBoost;
        ctx.beginPath();
        ctx.moveTo(sxA, syA);
        ctx.lineTo(sxB, syB);
        ctx.stroke();

        // Draw inner springs piston pattern
        ctx.strokeStyle = isSelected ? '#ffffff' : '#475569';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const dx = sxB - sxA;
        const dy = syB - syA;
        ctx.moveTo(sxA + dx * 0.3, syA + dy * 0.3);
        ctx.lineTo(sxB - dx * 0.3, syB - dy * 0.3);
        ctx.stroke();
      }

      ctx.restore();
    }

    // --- DRAW Active link building line ---
    if (linkFromNodeId !== null && linkCursor &&
        (editorMode === 'add_muscle' || editorMode === 'add_bone' || editorMode === 'add_telescope' || editorMode === 'add_piston')) {
      const sourceNode = nodes.find(n => n.id === linkFromNodeId);
      if (sourceNode) {
        ctx.save();
        ctx.strokeStyle =
          editorMode === 'add_bone'
            ? '#f59e0b'
            : editorMode === 'add_telescope'
              ? '#14b8a6'
              : editorMode === 'add_piston'
                ? '#6366f1'
                : '#bef264';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(centerX + sourceNode.x, centerY + sourceNode.y, sourceNode.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX + sourceNode.x, centerY + sourceNode.y);
        ctx.lineTo(centerX + linkCursor.x, centerY + linkCursor.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // --- DRAW STUDIO NODES ---
    const solidIds = solidNodeIdSet(solidSegments);
    for (const node of appearance.hideSkeleton ? [] : nodes) {
      const screenX = centerX + node.x;
      const screenY = centerY + node.y;

      const isSelected = selectedNodeIds.includes(node.id) || selectedNodeId === node.id;
      const isLinkSource = linkFromNodeId === node.id;
      const isSolid = solidIds.has(node.id);
      const spin = node.spinAngle ?? 0;

      ctx.save();
      if (node.isWheel) {
        // Tire
        ctx.beginPath();
        ctx.arc(screenX, screenY, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = isSelected
          ? '#38bdf8'
          : isLinkSource
            ? '#fbbf24'
            : node.isMotorWheel
              ? '#f59e0b'
              : '#94a3b8';
        ctx.lineWidth = isSelected ? 3 : node.isMotorWheel ? 2.5 : 2;
        ctx.stroke();
        // Hub
        ctx.beginPath();
        ctx.arc(screenX, screenY, Math.max(2, node.radius * 0.28), 0, Math.PI * 2);
        ctx.fillStyle = node.isMotorWheel ? '#f59e0b' : node.color;
        ctx.fill();
        // Spokes
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        for (let s = 0; s < 3; s++) {
          const a = spin + (s * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(screenX + Math.cos(a) * node.radius * 0.85, screenY + Math.sin(a) * node.radius * 0.85);
          ctx.stroke();
        }
        // Motor hub bolt mark
        if (node.isMotorWheel) {
          ctx.beginPath();
          ctx.arc(screenX, screenY, Math.max(1.5, node.radius * 0.12), 0, Math.PI * 2);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
        }
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${node.id}`, screenX, screenY);
      } else if (isSolid) {
        const s = node.radius * 1.55;
        ctx.beginPath();
        ctx.rect(screenX - s / 2, screenY - s / 2, s, s);
        ctx.fillStyle = node.color;
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3.5;
        } else if (isLinkSource) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 3.5;
        } else {
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 2;
        }
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${node.id}`, screenX, screenY);
      } else {
        ctx.beginPath();
        ctx.arc(screenX, screenY, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3.5;
        } else if (isLinkSource) {
          ctx.strokeStyle =
            editorMode === 'add_bone'
              ? '#f59e0b'
              : editorMode === 'add_telescope'
                ? '#14b8a6'
                : editorMode === 'add_piston'
                  ? '#6366f1'
                  : '#bef264';
          ctx.lineWidth = 3.5;
        } else {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
        }
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${node.id}`, screenX, screenY);
      }

      if (node.isFoot && !node.isWheel) {
        ctx.beginPath();
        ctx.moveTo(screenX - node.radius * 0.85, screenY + node.radius * 0.55);
        ctx.lineTo(screenX + node.radius * 0.85, screenY + node.radius * 0.55);
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      if (node.isHingeStop) {
        const s = node.radius * 0.55;
        ctx.beginPath();
        ctx.moveTo(screenX - s, screenY + s);
        ctx.lineTo(screenX - s, screenY - s * 0.15);
        ctx.lineTo(screenX + s * 0.15, screenY - s * 0.15);
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      ctx.restore();
    }

    drawAppearance(ctx, appearanceSkeleton, appearance, 'front');
    ctx.restore();

    // Height ruler along the left edge of the visualizer (screen space; stays readable when zoomed)
    const rulerWidth = 44;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fillRect(0, 0, rulerWidth, canvas.height);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rulerWidth - 0.5, 0);
    ctx.lineTo(rulerWidth - 0.5, canvas.height);
    ctx.stroke();

    const maxWorldHeight = Math.ceil(centerY / studioZoom / STUDIO_GRID_SIZE) * STUDIO_GRID_SIZE;
    const majorEvery = STUDIO_GRID_SIZE * 2; // label every 60px
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let h = 0; h <= maxWorldHeight; h += STUDIO_GRID_SIZE) {
      const sy = centerY - h * studioZoom;
      if (sy < -4 || sy > canvas.height + 4) continue;
      const isMajor = h % majorEvery === 0;
      ctx.strokeStyle = isMajor ? '#94a3b8' : '#64748b';
      ctx.beginPath();
      ctx.moveTo(isMajor ? 28 : 34, sy);
      ctx.lineTo(rulerWidth - 1, sy);
      ctx.stroke();
      if (isMajor) {
        ctx.fillStyle = h === 0 ? '#f87171' : '#e2e8f0';
        ctx.font = 'bold 9px ui-sans-serif, system-ui';
        ctx.fillText(`${h}`, 26, sy);
      }
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 8px ui-sans-serif, system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('H px', 6, 6);
    ctx.fillStyle = '#64748b';
    ctx.font = '7px ui-sans-serif, system-ui';
    ctx.fillText(`${STUDIO_GRID_SIZE}px/sq`, 4, 18);

  }, [nodes, muscles, solidSegments, appearance, selectedNodeId, selectedNodeIds, selectedMuscleId, editorMode, linkFromNodeId, linkCursor, dimensions, rangePreviewEnabled, snapToGridEnabled, studioZoom]);

  // Convert client coords to canvas buffer coords (prevents offset when CSS scales canvas)
  const clientToCanvas = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, centerX: 0, centerY: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    const clickX = (clientX - rect.left) * scaleX;
    const clickY = (clientY - rect.top) * scaleY;
    const centerX = canvas.width / 2;
    const centerY = studioOriginY(canvas.height);
    return {
      x: (clickX - centerX) / studioZoom,
      y: (clickY - centerY) / studioZoom,
      centerX,
      centerY,
    };
  };

  const boundAndMaybeSnap = (x: number, y: number, centerX: number, centerY: number, canvasH: number) => {
    const margin = 20 / studioZoom;
    const leftRulerPad = 52 / studioZoom; // keep nodes clear of the height ruler
    const minX = -centerX / studioZoom + leftRulerPad;
    const maxX = centerX / studioZoom - margin;
    const minY = -centerY / studioZoom + margin;
    const maxY = (canvasH - centerY) / studioZoom - margin;
    let nx = Math.max(minX, Math.min(maxX, x));
    let ny = Math.max(minY, Math.min(maxY, y));
    if (snapToGridEnabled) {
      nx = snapToGrid(nx);
      ny = snapToGrid(ny);
      nx = Math.max(minX, Math.min(maxX, nx));
      ny = Math.max(minY, Math.min(maxY, ny));
    } else {
      nx = Math.round(nx);
      ny = Math.round(ny);
    }
    return { x: nx, y: ny };
  };

  // Handle click on canvas
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (
      editorMode === 'paint' ||
      editorMode === 'skin_ellipse' ||
      editorMode === 'skin_sheet'
    ) return; // drawing tools are drag-driven
    // Muscle/bone/telescope linking is drag-driven (mousedown → mouseup)
    if (editorMode === 'add_muscle' || editorMode === 'add_bone' || editorMode === 'add_telescope' || editorMode === 'add_piston') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x: relativeX, y: relativeY, centerX, centerY } = clientToCanvas(event.clientX, event.clientY);

    // 1. Nodes are selected on mousedown (so shift multi-select is not
    // undone by a second toggle on click). Skip here.
    for (const node of nodes) {
      const dx = node.x - relativeX;
      const dy = node.y - relativeY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < node.radius + 6) {
        return;
      }
    }

    // 2. Check if clicking an existing muscle line
    let clickedMuscle: StudioMuscle | null = null;
    let minLineDist = 12;

    for (const m of muscles) {
      const nodeA = nodes.find(n => n.id === m.nodeA);
      const nodeB = nodes.find(n => n.id === m.nodeB);

      if (!nodeA || !nodeB) continue;

      const stroke = parallelSoftStrokeOffset(
        m,
        muscles,
        nodeA.x,
        nodeA.y,
        nodeB.x,
        nodeB.y
      );

      // Distance from point to line segment
      const x = relativeX;
      const y = relativeY;
      const x1 = stroke.xA;
      const y1 = stroke.yA;
      const x2 = stroke.xB;
      const y2 = stroke.yB;

      const A = x - x1;
      const B = y - y1;
      const C = x2 - x1;
      const D = y2 - y1;

      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;
      if (lenSq !== 0) param = dot / lenSq;

      let xx, yy;

      if (param < 0) {
        xx = x1;
        yy = y1;
      } else if (param > 1) {
        xx = x2;
        yy = y2;
      } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
      }

      const dx = x - xx;
      const dy = y - yy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minLineDist) {
        minLineDist = dist;
        clickedMuscle = m;
      }
    }

    if (clickedMuscle) {
      setSelectedMuscleId(clickedMuscle.id);
      clearNodeSelection();
      return;
    }

    // 3. Clicked empty space
    if (editorMode === 'add_node') {
      // Add a node at this click position
      const newId = nodes.length > 0 ? Math.max(...nodes.map(n => n.id)) + 1 : 0;
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      const { x: boundedX, y: boundedY } = boundAndMaybeSnap(
        relativeX,
        relativeY,
        centerX,
        centerY,
        canvas.height
      );

      const newNode: StudioNode = {
        id: newId,
        mass: 1.5,
        radius: 10,
        friction: 0.5,
        color: randomColor,
        x: boundedX,
        y: boundedY,
        isWheel: false,
        isMotorWheel: false,
        motorPower: DEFAULT_MOTOR_POWER,
        isFoot: false,
        isHingeStop: false,
        spinAngle: 0,
      };

      setNodes([...nodes, newNode]);
      selectSingleNode(newId);
      // Keep Place Node (or current tool) selected for repeated placement
    } else if (editorMode === 'select') {
      // Deselect only in Direct Select mode when clicking empty space
      clearNodeSelection();
      setSelectedMuscleId(null);
    }
  };

  const findNodeAt = (relativeX: number, relativeY: number): StudioNode | null => {
    for (const node of nodes) {
      const dx = node.x - relativeX;
      const dy = node.y - relativeY;
      if (Math.sqrt(dx * dx + dy * dy) < node.radius + 6) return node;
    }
    return null;
  };

  const tryCreateLink = (fromId: number, toId: number) => {
    if (fromId === toId) return;

    const pairMates = muscles.filter(
      m =>
        (m.nodeA === fromId && m.nodeB === toId) ||
        (m.nodeA === toId && m.nodeB === fromId)
    );
    const addingKind: MuscleLinkKind =
      editorMode === 'add_bone'
        ? 'bone'
        : editorMode === 'add_telescope'
          ? 'telescope'
          : editorMode === 'add_piston'
            ? 'piston'
            : 'muscle';
    const addingHard = addingKind === 'bone' || addingKind === 'telescope' || addingKind === 'piston';

    if (pairMates.length >= 2) {
      alert('This node pair already has a hard link and a soft muscle.');
      return;
    }
    if (pairMates.length === 1) {
      const existingHard = isHardLengthConstraint(pairMates[0]);
      if (existingHard === addingHard) {
        alert(
          existingHard
            ? 'A hard link already exists between these two nodes. Add a soft muscle instead, or remove the hard link.'
            : 'A soft muscle already exists between these two nodes. Add a bone/telescope/piston instead, or remove the muscle.'
        );
        return;
      }
    }

    const sourceNode = nodes.find(n => n.id === fromId);
    const destNode = nodes.find(n => n.id === toId);
    if (!sourceNode || !destNode) return;

    const dist = Math.round(Math.hypot(destNode.x - sourceNode.x, destNode.y - sourceNode.y)) || 5;
    const newId = muscles.length > 0 ? Math.max(...muscles.map(m => m.id)) + 1 : 0;

    if (addingHard) {
      let minLength = dist;
      let maxLength = dist;
      let linkKind: MuscleLinkKind = addingKind === 'bone' ? 'bone' : addingKind === 'piston' ? 'piston' : 'telescope';
      if (addingKind === 'telescope' || addingKind === 'piston') {
        maxLength = clampLinkLength(Math.round(dist * 1.3));
        minLength = clampLinkLength(Math.min(Math.round(dist * 0.7), maxLength));
      }
      // Hard onto existing soft → variable hard slaved to soft range.
      if (pairMates.length === 1 && resolveLinkKind(pairMates[0]) === 'muscle') {
        maxLength = clampLinkLength(pairMates[0].maxLength);
        minLength = clampLinkLength(Math.min(pairMates[0].minLength, maxLength));
        linkKind = addingKind === 'piston' ? 'piston' : 'telescope';
      }
      const pistonSeed =
        linkKind === 'piston' ? defaultPistonRatesForStroke(minLength, maxLength) : null;
      const newBone: StudioMuscle = {
        id: newId,
        nodeA: fromId,
        nodeB: toId,
        originalLength:
          linkKind === 'telescope' || linkKind === 'piston'
            ? restingLengthFromMaxExpansion(maxLength)
            : dist,
        minLength,
        maxLength,
        strength: 1.0,
        phaseOffset: 0,
        thickness: 1,
        linkKind,
        ...(pistonSeed
          ? { extendRate: pistonSeed.extendRate, retractRate: pistonSeed.retractRate }
          : {}),
      };
      setMuscles(prev => [...prev, newBone]);
      setSelectedMuscleId(newId);
      setSelectedNodeId(null);
      return;
    }

    // Soft muscle — optionally promote a parallel fixed bone to telescope.
    const membership = solidMembership(solidSegments);
    if (isLinkWhollyInsideSolid(fromId, toId, membership)) {
      alert('Soft muscles cannot connect two nodes inside the same solid plate. Attach only on the boundary.');
      return;
    }
    const softMax = clampLinkLength(Math.round(dist * 1.4));
    const softMin = clampLinkLength(Math.min(Math.round(dist * 0.6), softMax));
    const softRest = restingLengthFromMaxExpansion(softMax);
    const newMuscle: StudioMuscle = {
      id: newId,
      nodeA: fromId,
      nodeB: toId,
      originalLength: softRest,
      minLength: softMin,
      maxLength: softMax,
      strength: 0.6,
      phaseOffset: 0,
      thickness: 1,
      linkKind: 'muscle',
    };
    setMuscles(prev => {
      const next = prev.map(m => {
        if (!sameUnorderedNodePair(m, newMuscle) || !isHardLengthConstraint(m)) return m;
        return {
          ...m,
          linkKind: 'telescope' as const,
          minLength: softMin,
          maxLength: softMax,
          originalLength: softRest,
          strength: 1.0,
        };
      });
      return [...next, newMuscle];
    });
    setSelectedMuscleId(newId);
    setSelectedNodeId(null);
  };

  // Drag node / paint / link capabilities
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x: relativeX, y: relativeY } = clientToCanvas(event.clientX, event.clientY);

    if (editorMode === 'skin_sheet') {
      beginSkinSheet(relativeX, relativeY);
      return;
    }

    if (editorMode === 'skin_ellipse') {
      beginSkinEllipse(relativeX, relativeY);
      return;
    }

    if (editorMode === 'paint') {
      isPaintingRef.current = true;
      paintMuscleAtPoint(relativeX, relativeY);
      return;
    }

    const hitNode = findNodeAt(relativeX, relativeY);

    if ((editorMode === 'add_muscle' || editorMode === 'add_bone' || editorMode === 'add_telescope' || editorMode === 'add_piston') && hitNode) {
      setLinkFromNodeId(hitNode.id);
      setLinkCursor({ x: relativeX, y: relativeY });
      selectSingleNode(hitNode.id);
      return;
    }

    // Find if clicking inside node (select / drag)
    if (hitNode) {
      if (event.shiftKey) {
        // Shift is multi-select only — do not start a drag.
        toggleNodeInSelection(hitNode.id);
        return;
      }
      isDraggingRef.current = true;
      dragNodeIdRef.current = hitNode.id;
      if (!selectedNodeIds.includes(hitNode.id)) {
        selectSingleNode(hitNode.id);
      } else {
        setSelectedNodeId(hitNode.id);
        setSelectedMuscleId(null);
      }
      if (physicsEnabled) {
        const old = physicsOldRef.current.get(hitNode.id);
        if (old) {
          old.oldX = hitNode.x;
          old.oldY = hitNode.y;
        } else {
          physicsOldRef.current.set(hitNode.id, { oldX: hitNode.x, oldY: hitNode.y });
        }
      }
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x: relativeX, y: relativeY, centerX, centerY } = clientToCanvas(event.clientX, event.clientY);

    if (editorMode === 'paint' && isPaintingRef.current) {
      paintMuscleAtPoint(relativeX, relativeY);
      return;
    }

    if (editorMode === 'skin_sheet' && activeSkinPrimitiveIdRef.current) {
      continueSkinSheet(relativeX, relativeY);
      return;
    }

    if (editorMode === 'skin_ellipse' && activeSkinPrimitiveIdRef.current) {
      continueSkinEllipse(relativeX, relativeY);
      return;
    }

    if (linkFromNodeId !== null) {
      setLinkCursor({ x: relativeX, y: relativeY });
      return;
    }

    if (!isDraggingRef.current || dragNodeIdRef.current === null) return;

    const { x: boundedX, y: boundedY } = boundAndMaybeSnap(
      relativeX,
      relativeY,
      centerX,
      centerY,
      canvas.height
    );

    // Update node coordinate positions
    setNodes(prev => prev.map(n => {
      if (n.id === dragNodeIdRef.current) {
        return { ...n, x: boundedX, y: boundedY };
      }
      return n;
    }));

    if (physicsEnabled) {
      const old = physicsOldRef.current.get(dragNodeIdRef.current);
      if (old) {
        old.oldX = boundedX;
        old.oldY = boundedY;
      }
      return; // don't rewrite rest lengths while simulating
    }

    // Auto-update lengths of connected muscles to reflect new position
    setMuscles(prev => prev.map(m => {
      if (m.nodeA === dragNodeIdRef.current || m.nodeB === dragNodeIdRef.current) {
        const nodeA = nodes.find(n => n.id === m.nodeA);
        const nodeB = nodes.find(n => n.id === m.nodeB);

        if (nodeA && nodeB) {
          const nAX = m.nodeA === dragNodeIdRef.current ? boundedX : nodeA.x;
          const nAY = m.nodeA === dragNodeIdRef.current ? boundedY : nodeA.y;
          const nBX = m.nodeB === dragNodeIdRef.current ? boundedX : nodeB.x;
          const nBY = m.nodeB === dragNodeIdRef.current ? boundedY : nodeB.y;

          const dx = nBX - nAX;
          const dy = nBY - nAY;
          const newLength = Math.round(Math.sqrt(dx * dx + dy * dy)) || 5;
          const kind = resolveLinkKind(m);
          if (kind === 'bone') {
            return {
              ...m,
              originalLength: newLength,
              minLength: newLength,
              maxLength: newLength,
            };
          }
          if (kind === 'telescope' || kind === 'piston') {
            const maxLength = clampLinkLength(Math.round(newLength * 1.3));
            const minLength = clampLinkLength(Math.min(Math.round(newLength * 0.7), maxLength));
            const rates =
              kind === 'piston' ? defaultPistonRatesForStroke(minLength, maxLength) : null;
            return {
              ...m,
              originalLength: restingLengthFromMaxExpansion(maxLength),
              minLength,
              maxLength,
              ...(rates
                ? { extendRate: rates.extendRate, retractRate: rates.retractRate }
                : {}),
            };
          }
          {
            const maxLength = clampLinkLength(Math.round(newLength * 1.4));
            const minLength = clampLinkLength(Math.min(Math.round(newLength * 0.6), maxLength));
            return {
              ...m,
              originalLength: restingLengthFromMaxExpansion(maxLength),
              minLength,
              maxLength,
            };
          }
        }
      }
      return m;
    }));
  };

  const handleMouseUpOrLeave = (event?: React.MouseEvent<HTMLCanvasElement>) => {
    if (linkFromNodeId !== null && event && event.type === 'mouseup') {
      const { x: relativeX, y: relativeY } = clientToCanvas(event.clientX, event.clientY);
      const hit = findNodeAt(relativeX, relativeY);
      if (hit && hit.id !== linkFromNodeId) {
        tryCreateLink(linkFromNodeId, hit.id);
      }
    }

    setLinkFromNodeId(null);
    setLinkCursor(null);
    finishSkinPrimitive();
    isDraggingRef.current = false;
    dragNodeIdRef.current = null;
    isPaintingRef.current = false;
  };

  // Node editing handlers
  const handleUpdateNodeProp = (prop: keyof StudioNode, value: any) => {
    if (selectedNodeId === null) return;
    setNodes(prev => prev.map(n => {
      if (n.id === selectedNodeId) {
        return { ...n, [prop]: value };
      }
      return n;
    }));
  };

  // Muscle editing handlers
  const handleUpdateMuscleProp = (prop: keyof StudioMuscle, value: any) => {
    if (selectedMuscleId === null) return;
    setMuscles(prev => prev.map(m => {
      if (m.id !== selectedMuscleId) return m;

      // Compression / expansion extremes: independent 10–1000px ranges.
      // Only cross-adjust when compression would exceed expansion.
      // Resting length always tracks 50% of max expansion.
      if (prop === 'minLength') {
        const minLength = clampLinkLength(value);
        const maxLength = clampLinkLength(Math.max(m.maxLength, minLength));
        return {
          ...m,
          minLength: Math.min(minLength, maxLength),
          maxLength,
          originalLength: restingLengthFromMaxExpansion(maxLength),
        };
      }
      if (prop === 'maxLength') {
        const maxLength = clampLinkLength(value);
        const minLength = clampLinkLength(Math.min(m.minLength, maxLength));
        const finalMax = Math.max(maxLength, minLength);
        return {
          ...m,
          minLength,
          maxLength: finalMax,
          originalLength: restingLengthFromMaxExpansion(finalMax),
        };
      }
      if (prop === 'extendRate' || prop === 'retractRate') {
        return { ...m, [prop]: clampPistonRate(value) };
      }

      return { ...m, [prop]: value };
    }));
  };

  // Deletion operations
  const reindexAppearanceAfterDelete = (
    removedNodeIndex: number | null,
    removedMuscleIndices: number[]
  ) => {
    const removedMuscles = new Set(removedMuscleIndices);
    const nextMuscleIndex = (oldIndex: number) =>
      oldIndex - removedMuscleIndices.filter(index => index < oldIndex).length;
    setAppearance(current => ({
      ...current,
      primitives: current.primitives.flatMap(part => {
        if (removedNodeIndex !== null && part.anchorNode === removedNodeIndex) return [];
        if (part.anchorMuscle !== undefined && removedMuscles.has(part.anchorMuscle)) return [];
        const points = part.points.map(point => {
          if (!point.weights?.length) return point;
          const kept = point.weights.filter(weight => !removedMuscles.has(weight.muscle));
          const total = kept.reduce((sum, weight) => sum + weight.weight, 0);
          return {
            ...point,
            weights: kept.map(weight => ({
              ...weight,
              muscle: nextMuscleIndex(weight.muscle),
              weight: total > 0 ? weight.weight / total : 0,
            })),
          };
        });
        if (points.some(point => point.weights && point.weights.length === 0)) return [];
        return [{
          ...part,
          anchorNode:
            part.anchorNode !== undefined && removedNodeIndex !== null && part.anchorNode > removedNodeIndex
              ? part.anchorNode - 1
              : part.anchorNode,
          anchorMuscle:
            part.anchorMuscle !== undefined
              ? nextMuscleIndex(part.anchorMuscle)
              : undefined,
          points,
        }];
      }),
    }));
    setSelectedSkinPartId(null);
  };

  const handleDeleteSelected = () => {
    if (selectedNodeIds.length > 1) {
      const remove = new Set(selectedNodeIds);
      const removedNodeIndices = nodes.flatMap((node, index) =>
        remove.has(node.id) ? [index] : []
      );
      const removedMuscleIndices = muscles.flatMap((muscle, index) =>
        remove.has(muscle.nodeA) || remove.has(muscle.nodeB) ? [index] : []
      );
      // Delete one-by-one from highest index for appearance reindex is hard;
      // clear appearance anchors by rebuilding non-plate skin after multi-delete.
      setMuscles(prev => prev.filter(m => !remove.has(m.nodeA) && !remove.has(m.nodeB)));
      const nextNodes = nodes.filter(n => !remove.has(n.id));
      setNodes(nextNodes);
      const surviving = new Set<number>(nextNodes.map(n => n.id));
      const nextSolids = pruneSolidSegments(solidSegments, surviving);
      setSolidSegments(nextSolids);
      refreshSolidRestOffsets(nextSolids, nextNodes);
      void removedNodeIndices;
      void removedMuscleIndices;
      clearNodeSelection();
      return;
    }
    if (selectedNodeId !== null) {
      // Remove connected muscles first, then node
      const nodeIndex = nodes.findIndex(node => node.id === selectedNodeId);
      const removedMuscleIndices = muscles.flatMap((muscle, index) =>
        muscle.nodeA === selectedNodeId || muscle.nodeB === selectedNodeId ? [index] : []
      );
      reindexAppearanceAfterDelete(nodeIndex >= 0 ? nodeIndex : null, removedMuscleIndices);
      setMuscles(prev => prev.filter(m => m.nodeA !== selectedNodeId && m.nodeB !== selectedNodeId));
      const nextNodes = nodes.filter(n => n.id !== selectedNodeId);
      setNodes(nextNodes);
      const surviving = new Set<number>(nextNodes.map(n => n.id));
      const nextSolids = pruneSolidSegments(solidSegments, surviving);
      setSolidSegments(nextSolids);
      refreshSolidRestOffsets(nextSolids, nextNodes);
      clearNodeSelection();
    } else if (selectedMuscleId !== null) {
      const muscleIndex = muscles.findIndex(muscle => muscle.id === selectedMuscleId);
      reindexAppearanceAfterDelete(null, muscleIndex >= 0 ? [muscleIndex] : []);
      setMuscles(prev => prev.filter(m => m.id !== selectedMuscleId));
      setSelectedMuscleId(null);
    }
  };

  const getStudioValidationError = (): string | null => {
    if (nodes.length < 2) {
      return 'Biomechanics Validation Error: A creature requires at least 2 connected nodes to support joint physics.';
    }
    if (muscles.length === 0) {
      return 'Biomechanics Validation Error: A creature must have at least 1 muscle connecting nodes to allow locomotion.';
    }
    const solidErr = validateSolidSegments(
      solidSegments,
      nodes.map(n => n.id),
      muscles
    );
    if (solidErr) return `Biomechanics Validation Error: ${solidErr}`;
    return null;
  };

  // Build a blueprint only when the draft is structurally valid. This stays
  // silent because it also runs during background draft autosaves.
  const buildBlueprint = (): CreatureBlueprint | null => {
    if (getStudioValidationError()) return null;

    const idMap = new Map<number, number>();
    const remappedNodes = nodes.map((n, index) => {
      idMap.set(n.id, index);
      return {
        id: index,
        mass: n.mass,
        radius: n.radius,
        friction: n.isWheel ? 0.05 : n.friction,
        color: n.color,
        isWheel: !!n.isWheel,
        isMotorWheel: !!(n.isWheel && n.isMotorWheel),
        motorPower: n.isMotorWheel
          ? Math.min(MAX_MOTOR_POWER, Math.max(MIN_MOTOR_POWER, n.motorPower ?? DEFAULT_MOTOR_POWER))
          : undefined,
        isFoot: !n.isWheel && !!n.isFoot,
        isHingeStop: !!n.isHingeStop,
      };
    });

    const remappedMuscles = muscles.map((m, index) => {
      const kind = resolveLinkKind(m);
      const rates =
        kind === 'piston'
          ? (() => {
              const seeded = defaultPistonRatesForStroke(m.minLength, m.maxLength);
              return {
                extendRate: clampPistonRate(m.extendRate ?? seeded.extendRate),
                retractRate: clampPistonRate(m.retractRate ?? seeded.retractRate),
              };
            })()
          : null;
      return {
        id: index,
        nodeA: idMap.get(m.nodeA)!,
        nodeB: idMap.get(m.nodeB)!,
        originalLength: m.originalLength,
        minLength: m.minLength,
        maxLength: m.maxLength,
        strength: m.strength,
        phaseOffset: m.phaseOffset,
        thickness: m.thickness ?? 1,
        linkKind: kind,
        ...(rates ?? {}),
        aeroType: m.aeroType && m.aeroType !== 'none' ? m.aeroType : undefined,
        aeroArea:
          m.aeroType && m.aeroType !== 'none'
            ? Math.min(
                MAX_AERO_AREA,
                Math.max(
                  MIN_AERO_AREA,
                  m.aeroArea ??
                    (m.aeroType === 'parachute' ? DEFAULT_PARACHUTE_AREA : DEFAULT_AERO_AREA)
                )
              )
            : undefined,
      };
    });

    const relativePositions = nodes.map(n => ({
      x: n.x,
      y: n.y,
    }));

    const remappedSolids = remapSolidSegments(solidSegments, idMap);

    return {
      name: (creatureName || 'Custom Sandbox Mech').trim(),
      nodes: remappedNodes,
      muscles: remappedMuscles,
      relativePositions,
      ...(remappedSolids.length > 0 ? { solidSegments: remappedSolids } : {}),
    };
  };

  // User-triggered Save and Apply actions should explain why an invalid draft
  // cannot be persisted or used.
  const buildBlueprintForAction = (): CreatureBlueprint | null => {
    const validationError = getStudioValidationError();
    if (validationError) {
      alert(validationError);
      return null;
    }
    return buildBlueprint();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const blueprint = buildBlueprint();
      if (blueprint) saveStudioDraft(blueprint, appearance);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [nodes, muscles, solidSegments, creatureName, appearance]);

  const assertZoneLegal = (blueprint: CreatureBlueprint): boolean => {
    if (blueprintAllowedInZone(blueprint, zoneId)) return true;
    const zone = ARENA_ZONES[zoneId];
    alert(
      `Zone rule: "${blueprint.name}" is not allowed in ${zone.title}. ` +
        `Use only equipment permitted here (${
          zone.equipment.allowAero ? 'aero OK' : 'no wings/sails'
        }; ${
          zone.equipment.allowMotorWheels ? 'motors OK' : 'no motor wheels'
        }), or switch to Free for all.`
    );
    return false;
  };

  const handleSaveToLibrary = () => {
    const blueprint = buildBlueprintForAction();
    if (!blueprint) return;
    if (!onSaveCreature) {
      saveStudioDraft(blueprint, appearance);
      return;
    }
    const ok = onSaveCreature(blueprint, appearance);
    if (ok) {
      setLibraryRefreshToken(value => value + 1);
      alert(`Saved "${blueprint.name}" to Creature Anatomy. You can select it anytime from the simulation controls.`);
    }
  };

  const handleInjectAnatomy = () => {
    const blueprint = buildBlueprintForAction();
    if (!blueprint) return;
    if (!assertZoneLegal(blueprint)) return;
    onLoadCustomTemplate(blueprint, appearance);
    alert(
      `Successfully loaded custom anatomy "${blueprint.name}" into the training simulation! Pre-trained neural connections are resetting around this anatomy.`
    );
  };

  // Render variables
  const activeNode = nodes.find(n => n.id === selectedNodeId);
  const activeMuscle = muscles.find(m => m.id === selectedMuscleId);
  const activeSkinAnchor = selectedSkinAnchor();
  const selectedSkinPart = appearance.primitives.find(part => part.id === selectedSkinPartId);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-3" id="studio-view-panel">
      
      {/* Visual Workspace Editor - takes 2 cols */}
      <div className="flex min-h-0 flex-col overflow-visible rounded-xl border border-slate-200/80 bg-white shadow-sm lg:col-span-2">
        
        {/* Header toolbar */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-indigo-600 animate-pulse" />
            <h3 className="text-sm font-bold text-slate-800">Visual Creature Editor</h3>
          </div>
        </div>

        {/* Action Button Strip */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-100/50 p-2">
          {/* Select Mode */}
          <button
            type="button"
            onClick={() => { setEditorMode('select'); resetToolSources(); }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
              editorMode === 'select'
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
          >
            <ChevronRight className="w-3.5 h-3.5" /> Select
          </button>

          {/* Add Node Mode */}
          <button
            type="button"
            onClick={() => { setEditorMode('add_node'); resetToolSources(); }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
              editorMode === 'add_node'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Node
          </button>

          {/* Add Muscle Mode */}
          <button
            type="button"
            onClick={() => { setEditorMode('add_muscle'); resetToolSources(); }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
              editorMode === 'add_muscle'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
          >
            <Link className="w-3.5 h-3.5" /> Muscle
          </button>

          {/* Add Bone Mode */}
          <button
            type="button"
            onClick={() => { setEditorMode('add_bone'); resetToolSources(); }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
              editorMode === 'add_bone'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" /> Bone
          </button>

          {/* Add Telescope Mode */}
          <button
            type="button"
            onClick={() => { setEditorMode('add_telescope'); resetToolSources(); }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
              editorMode === 'add_telescope'
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
            title="Hard strut that shortens and lengthens under brain control (global stroke rate)"
          >
            <MoveVertical className="w-3.5 h-3.5" /> Telescope
          </button>

          {/* Add Piston Mode */}
          <button
            type="button"
            onClick={() => { setEditorMode('add_piston'); resetToolSources(); }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
              editorMode === 'add_piston'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
            title="Hard strut like a telescope, with authorable compression and expansion rates"
          >
            <Gauge className="w-3.5 h-3.5" /> Piston
          </button>

          {/* Solid plate — compound rigid body */}
          <button
            type="button"
            onClick={handleLockSolid}
            className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 bg-white text-slate-700 hover:bg-amber-50 border-amber-200"
            title="Lock selected nodes (Shift+click ≥3) into a rigid solid plate. Soft muscles inside are removed."
            id="studio-solid-btn"
          >
            <Box className="w-3.5 h-3.5" /> Solid
          </button>
          <button
            type="button"
            onClick={handleUnlockSolid}
            className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 bg-white text-slate-600 hover:bg-slate-50 border-slate-200"
            title="Unlock the solid plate that contains the selection"
            id="studio-unsolid-btn"
          >
            <Unlock className="w-3.5 h-3.5" /> Unsolid
          </button>

          {/* Mechanical link thickness */}
          <button
            type="button"
            onClick={() => { setEditorMode('paint'); resetToolSources(); }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
              editorMode === 'paint'
                ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
            title="Drag over muscles and bones to increase their rendered thickness"
          >
            <Paintbrush className="w-3.5 h-3.5" /> Thicken
          </button>

          {/* Snap to grid */}
          <button
            type="button"
            onClick={() => setSnapToGridEnabled(v => !v)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
              snapToGridEnabled
                ? 'bg-slate-700 text-white border-slate-700 ring-2 ring-slate-400'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
            title={snapToGridEnabled ? 'Snap to grid ON — nodes lock to 30px cells' : 'Snap to grid OFF — free placement'}
            id="studio-snap-grid-btn"
            aria-pressed={snapToGridEnabled}
          >
            <Grid3x3 className="w-3.5 h-3.5" />
            Snap
          </button>

          {/* Physics preview */}
          <button
            type="button"
            onClick={togglePhysics}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
              physicsEnabled
                ? 'bg-cyan-600 text-white border-cyan-600 ring-2 ring-cyan-300'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
            title={physicsEnabled ? 'Pause physics and capture settled pose' : 'Run Verlet physics preview'}
          >
            {physicsEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            Physics
          </button>

          {/* Muscle range expand/compress loop */}
          <button
            type="button"
            onClick={toggleRangePreview}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
              rangePreviewEnabled
                ? 'bg-violet-600 text-white border-violet-600 ring-2 ring-violet-300'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
            title="Slow loop through each muscle's min compression and max expansion"
            id="studio-range-preview-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rangePreviewEnabled ? 'animate-spin' : ''}`} style={rangePreviewEnabled ? { animationDuration: '5.5s' } : undefined} />
            Range
          </button>

          <button
            type="button"
            onClick={() => loadTemplateIntoStudio(createRandomMorph())}
            className="px-2.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 hover:bg-fuchsia-100 flex items-center gap-1 transition-all"
            title="Generate a weird random morphology seed"
          >
            <Dices className="w-3.5 h-3.5" /> Random
          </button>

          <button
            type="button"
            onClick={handleClearCanvas}
            className="px-2.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center gap-1 transition-all"
            title="Clear all nodes and muscles from the canvas"
            id="studio-clear-btn"
          >
            <Eraser className="w-3.5 h-3.5" /> Clear
          </button>

          {/* Spacer / Delete */}
          {(selectedNodeId !== null || selectedNodeIds.length > 0 || selectedMuscleId !== null) && (
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 flex items-center gap-1.5 ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected
            </button>
          )}
        </div>

        <div className="relative z-20 grid shrink-0 grid-cols-1 gap-1.5 border-b border-slate-100 bg-white p-2 xl:grid-cols-2">
          <details name="studio-tool-drawer" className="group relative rounded-lg border border-slate-200 bg-slate-50 open:shadow-sm">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-bold text-slate-700">
              <span className="mr-2 inline-block text-slate-400 group-open:rotate-90">▶</span>
              Saved bodies & versions
            </summary>
            <CreatureLibraryPanel
              getCurrentBlueprint={buildBlueprint}
              getAppearance={() => appearance}
              onOpen={loadTemplateIntoStudio}
              refreshToken={libraryRefreshToken}
              className="mt-1 max-h-[46vh] w-full overflow-y-auto rounded-lg shadow-xl xl:absolute xl:left-[calc(200%+1.25rem)] xl:top-0 xl:z-50 xl:mt-0"
            />
          </details>

          <details name="studio-tool-drawer" className="group relative rounded-lg border border-lime-200 bg-lime-50/60 open:shadow-sm">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-bold text-lime-950">
              <span className="mr-2 inline-block text-lime-700 group-open:rotate-90">▶</span>
              Appearance & skin
              <span className="ml-2 text-[10px] font-semibold text-lime-700">
                {appearance.primitives.length} parts
              </span>
            </summary>
        <section className="mt-1 max-h-[46vh] w-full space-y-2 overflow-y-auto rounded-lg border border-lime-200 bg-lime-50 p-3 shadow-xl xl:absolute xl:left-[calc(100%+1.25rem)] xl:top-0 xl:z-50 xl:mt-0" aria-label="Biological appearance">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-xs text-lime-950">Solid biological skin</strong>
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
              activeSkinAnchor
                ? 'bg-indigo-100 text-indigo-800'
                : 'bg-amber-100 text-amber-800'
            }`}>
              {activeSkinAnchor
                ? `Attachment target: ${activeSkinAnchor.type === 'node' ? 'Node' : 'Link'} ${activeSkinAnchor.id}`
                : 'Select a node or link to attach a part'}
            </span>
            <label className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={!appearance.hideSkeleton}
                onChange={event => setAppearance(current => ({ ...current, hideSkeleton: !event.target.checked }))}
              />
              Collision skeleton visible
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Full-body base
            </span>
            {[
              ['Leaf', '#84cc16', '#365314', 'leaf'],
              ['Fox', '#f97316', '#7c2d12', 'fox'],
              ['Ocean', '#38bdf8', '#164e63', 'ocean'],
              ['Plum', '#c084fc', '#581c87', 'plum'],
            ].map(([label, fill, stroke, preset]) => (
              <button
                key={label}
                type="button"
                aria-pressed={selectedSkinPreset === preset}
                className={`rounded border px-2 py-1 text-[11px] font-bold ${
                  selectedSkinPreset === preset
                    ? 'border-lime-600 bg-lime-100 text-lime-950 ring-2 ring-lime-300'
                    : 'border-white bg-white text-slate-700 hover:border-lime-300'
                }`}
                onClick={() => {
                  const blueprint = buildBlueprint();
                  if (!blueprint) return;
                  setAppearance(createBiologicalPreset(
                    blueprint,
                    fill,
                    stroke,
                    preset as BiologicalPreset
                  ));
                  setSkinFill(fill);
                  setSkinOutline(stroke);
                  setSelectedSkinPreset(preset as BiologicalPreset);
                  setSelectedSkinPartId(null);
                  setEditorMode('select');
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Attach part
            </span>
            {[
              ['Joint pad', 'joint'],
              ['Limb sleeve', 'sleeve'],
              ['Torso', 'torso'],
              ['Ear', 'ear'],
              ['Fin', 'fin'],
              ['Tail', 'tail'],
            ].map(([label, kind]) => (
              <button
                key={kind}
                type="button"
                onClick={() => addSkinLibraryPart(kind as SkinLibraryPart)}
                className="rounded border border-white bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Draw filled skin
            </span>
            <button
              type="button"
              aria-pressed={editorMode === 'skin_ellipse'}
              className={`rounded border px-2 py-1 text-[11px] font-bold ${
                editorMode === 'skin_ellipse'
                  ? 'border-violet-600 bg-violet-600 text-white ring-2 ring-violet-300'
                  : 'border-violet-200 bg-white text-violet-800 hover:bg-violet-50'
              }`}
              onClick={() => {
                setEditorMode('skin_ellipse');
                resetToolSources();
              }}
            >
              Filled ellipse
            </button>
            <button
              type="button"
              aria-pressed={editorMode === 'skin_sheet'}
              className={`rounded border px-2 py-1 text-[11px] font-bold ${
                editorMode === 'skin_sheet'
                  ? 'border-violet-600 bg-violet-600 text-white ring-2 ring-violet-300'
                  : 'border-violet-200 bg-white text-violet-800 hover:bg-violet-50'
              }`}
              onClick={() => {
                setEditorMode('skin_sheet');
                resetToolSources();
              }}
            >
              <Paintbrush className="mr-1 inline h-3 w-3" />
              Whole-body sheet
            </button>
            <label className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
              Fill
              <input
                type="color"
                aria-label="Skin fill colour"
                value={skinFill}
                onChange={event => setSkinFill(event.target.value)}
                className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
            <label className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
              Outline
              <input
                type="color"
                aria-label="Skin outline colour"
                value={skinOutline}
                onChange={event => setSkinOutline(event.target.value)}
                className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
            <label className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
              Layer
              <select
                aria-label="Skin drawing layer"
                value={skinLayer}
                onChange={event => setSkinLayer(event.target.value as 'behind' | 'front')}
                className="bg-transparent text-[11px] font-bold text-slate-700"
              >
                <option value="front">Front</option>
                <option value="behind">Behind</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-t border-lime-200 pt-2">
            <span className="text-[10px] text-slate-600">
              {appearance.primitives.length} solid parts
              {selectedSkinPart ? ` · selected ${selectedSkinPart.kind}` : ''}
            </span>
            <button
              type="button"
              disabled={!selectedSkinPart}
              onClick={() => {
                if (!selectedSkinPartId) return;
                setAppearance(current => ({
                  ...current,
                  primitives: current.primitives.filter(part => part.id !== selectedSkinPartId),
                }));
                setSelectedSkinPartId(null);
              }}
              className="rounded border border-rose-200 bg-white px-2 py-1 text-[10px] font-bold text-rose-700 disabled:opacity-40"
            >
              Remove selected part
            </button>
            <button
              type="button"
              onClick={() => {
                setAppearance(current => ({ ...current, primitives: current.primitives.slice(0, -1) }));
                setSelectedSkinPreset(null);
                setSelectedSkinPartId(null);
              }}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600"
            >
              Undo last part
            </button>
            <button
              type="button"
              onClick={() => {
                setAppearance(current => ({ ...current, primitives: [] }));
                setSelectedSkinPreset(null);
                setSelectedSkinPartId(null);
                setEditorMode('select');
              }}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600"
            >
              Clear all skin
            </button>
            <span className="w-full text-[10px] leading-relaxed text-slate-500">
              Parts are filled surfaces bound to the selected joint or link. Filled ellipses follow one
              selected anchor. A whole-body sheet closes and fills the shape you trace, then blends each
              control point across nearby links so the sheet stretches and distorts with the frame.
              Skin remains renderer-only and does not change morphology or controllers.
            </span>
          </div>
        </section>
          </details>
        </div>

        {/* Primary Interactive Workbench Canvas */}
        <div className="relative min-h-[280px] flex-1 overflow-hidden bg-slate-900" ref={containerRef}>
          <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onWheel={event => {
              event.preventDefault();
              setStudioZoom(current => {
                const direction = event.deltaY > 0 ? -1 : 1;
                return Math.max(
                  STUDIO_ZOOM_MIN,
                  Math.min(STUDIO_ZOOM_MAX, current + direction * STUDIO_ZOOM_STEP)
                );
              });
            }}
            onContextMenu={e => e.preventDefault()}
            className={`block w-full h-full touch-none ${
              editorMode === 'paint' ||
              editorMode === 'skin_ellipse' ||
              editorMode === 'skin_sheet'
                ? 'cursor-cell'
                : 'cursor-crosshair'
            }`}
            id="studio-canvas"
          />

          <div className="absolute bottom-3 left-3 flex items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950/90 text-slate-100 shadow-lg">
            <button
              type="button"
              aria-label="Zoom out creature canvas"
              title="Zoom out"
              disabled={studioZoom <= STUDIO_ZOOM_MIN}
              onClick={() =>
                setStudioZoom(current =>
                  Math.max(STUDIO_ZOOM_MIN, current - STUDIO_ZOOM_STEP)
                )
              }
              className="border-r border-slate-700 p-2 hover:bg-slate-800 disabled:opacity-35"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Reset creature canvas zoom"
              title="Reset zoom"
              onClick={() => setStudioZoom(1)}
              className="min-w-14 px-2 py-2 text-[11px] font-bold tabular-nums hover:bg-slate-800"
            >
              {Math.round(studioZoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="Zoom in creature canvas"
              title="Zoom in"
              disabled={studioZoom >= STUDIO_ZOOM_MAX}
              onClick={() =>
                setStudioZoom(current =>
                  Math.min(STUDIO_ZOOM_MAX, current + STUDIO_ZOOM_STEP)
                )
              }
              className="border-l border-slate-700 p-2 hover:bg-slate-800 disabled:opacity-35"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          {/* Mini mode status visual overlay */}
          <div className="absolute top-4 left-4 pointer-events-none bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-slate-400 select-none">
            {editorMode === 'select' && (
              selectedNodeIds.length > 0
                ? `${selectedNodeIds.length} node${selectedNodeIds.length === 1 ? '' : 's'} selected${
                    solidSegments.length
                      ? ` · ${solidSegments.length} solid plate${solidSegments.length === 1 ? '' : 's'}`
                      : ''
                  }`
                : 'Select a node to inspect or connect — Shift+click multi-select, then Solid'
            )}
            {editorMode === 'add_node' && 'Click on workspace to add a node'}
            {editorMode === 'add_muscle' && 'Drag from one node to another to add a muscle (may span an existing bone)'}
            {editorMode === 'add_bone' && 'Drag from one node to another to add a fixed bone'}
            {editorMode === 'add_telescope' && 'Drag from one node to another to add a telescoping bone'}
            {editorMode === 'add_piston' && 'Drag from one node to another to add a rate-tunable piston bone'}
            {editorMode === 'paint' && 'Drag across muscles/bones to thicken'}
            {editorMode === 'skin_ellipse' && 'Drag a filled ellipse around one selected node or link'}
            {editorMode === 'skin_sheet' && 'Trace a closed whole-body sheet around the frame'}
            {snapToGridEnabled && (
              <span className="ml-2 text-slate-300">· Snap {STUDIO_GRID_SIZE}px</span>
            )}
            {physicsEnabled && (
              <span className="ml-2 text-cyan-400">· Physics ON</span>
            )}
            {rangePreviewEnabled && (
              <span className="ml-2 text-violet-300">· Range loop (min ↔ max)</span>
            )}
          </div>

          {rangePreviewEnabled && (
            <div className="absolute top-4 right-4 pointer-events-none bg-slate-950/85 border border-violet-700/60 px-3 py-2 rounded-lg text-[10px] text-violet-100 select-none max-w-[220px] space-y-1">
              <div className="font-bold text-violet-300 uppercase tracking-wider">Muscle travel</div>
              {muscles.filter(m => !(m.minLength === m.maxLength || m.strength >= 0.98)).length === 0 ? (
                <div className="text-slate-400">No flexible muscles — add stretch muscles to preview range.</div>
              ) : (
                muscles
                  .filter(m => !(m.minLength === m.maxLength || m.strength >= 0.98))
                  .slice(0, 6)
                  .map(m => {
                    const a = nodes.find(n => n.id === m.nodeA);
                    const b = nodes.find(n => n.id === m.nodeB);
                    const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : m.originalLength;
                    const pct = m.originalLength > 0 ? (len / m.originalLength) * 100 : 100;
                    const atMin = Math.abs(len - m.minLength) < 2;
                    const atMax = Math.abs(len - m.maxLength) < 2;
                    return (
                      <div key={m.id} className="flex justify-between gap-2 font-mono">
                        <span className={selectedMuscleId === m.id ? 'text-white' : 'text-slate-400'}>
                          M{m.id}
                        </span>
                        <span>
                          {m.minLength}–{m.maxLength}px
                        </span>
                        <span className={atMin ? 'text-cyan-300' : atMax ? 'text-orange-300' : 'text-violet-200'}>
                          {pct.toFixed(0)}%
                          {atMin ? ' min' : atMax ? ' max' : ''}
                        </span>
                      </div>
                    );
                  })
              )}
            </div>
          )}
        </div>

        {/* Footer info ribbon */}
        <div className="flex shrink-0 flex-col justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-3 py-2 text-[11px] font-medium text-slate-500 md:flex-row md:items-center">
          <span className="flex items-center gap-1.5">
            <Info className="w-4 h-4 text-blue-500" />
            Physics Nodes represent joint weights. Muscles act as spring-contraction pistons.
          </span>
          <div className="flex gap-4">
            <span>Nodes: <strong>{nodes.length}</strong></span>
            <span>
              Muscles:{' '}
              <strong>{muscles.filter(m => !(m.minLength === m.maxLength || m.strength >= 0.98)).length}</strong>
            </span>
            <span>
              Bones:{' '}
              <strong>{muscles.filter(m => m.minLength === m.maxLength || m.strength >= 0.98).length}</strong>
            </span>
            <span>
              Motors:{' '}
              <strong>{nodes.filter(n => n.isMotorWheel).length}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Sidebar Inspector Panel - takes 1 col */}
      <div className="flex min-h-0 flex-col gap-2 lg:col-span-1">
        
        {/* Anatomy Name Card */}
        <div className="flex shrink-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Dna className="w-3.5 h-3.5 text-indigo-500" />
            Name
          </label>
          <input
            type="text"
            value={creatureName}
            onChange={(e) => setCreatureName(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-sm font-bold focus:border-indigo-500 focus:bg-white focus:outline-none"
            placeholder="E.g. Custom Crawler"
          />
        </div>

        {/* Core parameter inspector (dynamic based on selection) */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          
          {/* Default (nothing selected) */}
          {selectedNodeId === null && selectedMuscleId === null && (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 py-10 px-4">
              <Sparkles className="w-8 h-8 text-indigo-400 stroke-[1.5] mb-2 animate-pulse" />
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Anatomy Inspector</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Click any Node or Muscle inside the visual workspace to inspect and adjust its physical properties.
              </p>
            </div>
          )}

          {/* Node Selected */}
          {selectedNodeId !== null && activeNode && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block border border-indigo-200" style={{ backgroundColor: activeNode.color }}></span>
                  Node #{activeNode.id} Inspector
                </span>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  X: {activeNode.x} | Y: {activeNode.y}
                </span>
              </div>

              {/* Mass */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span>Node Mass (Rigidity multiplier)</span>
                  <span className="text-indigo-600">{activeNode.mass.toFixed(1)} kg</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.1"
                  value={activeNode.mass}
                  onChange={(e) => handleUpdateNodeProp('mass', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              {/* Radius */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span>Collider Radius</span>
                  <span className="text-indigo-600">{activeNode.radius} px</span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="20"
                  step="1"
                  value={activeNode.radius}
                  onChange={(e) => handleUpdateNodeProp('radius', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              {/* Joint type: Grip | Passive | Motor */}
              <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-700">Joint type</span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {activeNode.isMotorWheel
                      ? 'Motor wheel — brain-driven when on the ground'
                      : activeNode.isWheel
                        ? 'Passive wheel — rolls on contact, no grip'
                        : 'Grip joint — friction against the ground'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'grip', label: 'Grip' },
                      ...(zoneEquip.allowPassiveWheels
                        ? [{ id: 'passive' as const, label: 'Passive' }]
                        : []),
                      ...(zoneEquip.allowMotorWheels
                        ? [{ id: 'motor' as const, label: 'Motor' }]
                        : []),
                    ] as const
                  ).map(mode => {
                    const selected =
                      mode.id === 'motor'
                        ? !!activeNode.isMotorWheel
                        : mode.id === 'passive'
                          ? !!activeNode.isWheel && !activeNode.isMotorWheel
                          : !activeNode.isWheel;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() =>
                          setNodes(prev =>
                            prev.map(n => {
                              if (n.id !== selectedNodeId) return n;
                              if (mode.id === 'grip') {
                                return {
                                  ...n,
                                  isWheel: false,
                                  isMotorWheel: false,
                                  friction: n.friction < 0.15 ? 0.5 : n.friction,
                                  spinAngle: 0,
                                };
                              }
                              if (mode.id === 'passive') {
                                return {
                                  ...n,
                                  isWheel: true,
                                  isMotorWheel: false,
                                  isFoot: false,
                                  friction: 0.05,
                                  spinAngle: 0,
                                };
                              }
                              return {
                                ...n,
                                isWheel: true,
                                isMotorWheel: true,
                                isFoot: false,
                                friction: 0.05,
                                motorPower: n.motorPower ?? DEFAULT_MOTOR_POWER,
                                spinAngle: 0,
                              };
                            })
                          )
                        }
                        className={`px-2 py-1.5 rounded text-[11px] font-bold transition-all cursor-pointer border ${
                          selected
                            ? mode.id === 'motor'
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
                {(!zoneEquip.allowMotorWheels || !zoneEquip.allowPassiveWheels) && (
                  <p className="text-[9px] text-slate-500 font-medium leading-snug">
                    {ARENA_ZONES[zoneId].title}: wheels/motors restricted for this zone.
                  </p>
                )}
              </div>

              {!activeNode.isWheel && (
                <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700">Foot plant</span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {activeNode.isFoot
                        ? 'Marked as a foot — Run / Shuffle only credit marked feet for steps and alternation'
                        : 'When any foot is marked, only feet count as walk plants'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setNodes(prev =>
                        prev.map(n =>
                          n.id === selectedNodeId
                            ? { ...n, isFoot: !n.isFoot }
                            : n
                        )
                      )
                    }
                    className={`px-2 py-1.5 rounded text-[11px] font-bold transition-all cursor-pointer border ${
                      activeNode.isFoot
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {activeNode.isFoot ? 'Foot' : 'Mark as foot'}
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-700">Hinge stop</span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {activeNode.isHingeStop
                      ? 'Hard bones meeting here stop at 90° (parallel OK, no opening past a right angle)'
                      : 'Optional knee/elbow limit — best with exactly two hard bones at this joint'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setNodes(prev =>
                      prev.map(n =>
                        n.id === selectedNodeId
                          ? { ...n, isHingeStop: !n.isHingeStop }
                          : n
                      )
                    )
                  }
                  className={`px-2 py-1.5 rounded text-[11px] font-bold transition-all cursor-pointer border ${
                    activeNode.isHingeStop
                      ? 'bg-rose-700 text-white border-rose-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {activeNode.isHingeStop ? '90° stop on' : 'Add 90° stop'}
                </button>
              </div>

              {activeNode.isMotorWheel && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span>Drive power</span>
                    <span className="text-amber-600">
                      {(activeNode.motorPower ?? DEFAULT_MOTOR_POWER).toFixed(2)}
                      <span className="text-slate-400 font-medium"> / {MAX_MOTOR_POWER}</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={MIN_MOTOR_POWER}
                    max={MAX_MOTOR_POWER}
                    step="0.05"
                    value={activeNode.motorPower ?? DEFAULT_MOTOR_POWER}
                    onChange={(e) =>
                      setNodes(prev =>
                        prev.map(n =>
                          n.id === selectedNodeId
                            ? { ...n, motorPower: parseFloat(e.target.value) }
                            : n
                        )
                      )
                    }
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                  />
                </div>
              )}

              {!activeNode.isWheel && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span>Surface Grip/Friction</span>
                    <span className="text-indigo-600">{(activeNode.friction * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value={activeNode.friction}
                    onChange={(e) => handleUpdateNodeProp('friction', parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              )}

              {/* Color Selection */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-700">Display Color Node</span>
                <div className="flex gap-2">
                  {['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#dc2626'].map((col) => (
                    <button
                      key={col}
                      onClick={() => handleUpdateNodeProp('color', col)}
                      className={`w-6 h-6 rounded-full transition-all border ${
                        activeNode.color === col ? 'scale-115 border-slate-900 ring-2 ring-indigo-200' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Muscle Selected */}
          {selectedMuscleId !== null && activeMuscle && (() => {
            const kind = resolveLinkKind(activeMuscle);
            const isBone = kind === 'bone';
            const isTel = kind === 'telescope';
            const isPist = kind === 'piston';
            const piston = isPist ? pistonRates(activeMuscle) : null;
            const typeLabel = isBone ? 'Bone' : isTel ? 'Telescope' : isPist ? 'Piston' : 'Muscle';
            const typeColor = isBone
              ? 'text-amber-700'
              : isTel
                ? 'text-teal-700'
                : isPist
                  ? 'text-indigo-700'
                  : 'text-emerald-600';
            const typeBtn = isBone
              ? 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
              : isTel
                ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
                : isPist
                  ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                  : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700';
            return (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className={`text-xs font-bold flex items-center gap-1.5 ${typeColor}`}>
                    {isBone ? (
                      <Shield className="w-4 h-4 text-amber-600" />
                    ) : isTel ? (
                      <MoveVertical className="w-4 h-4 text-teal-600" />
                    ) : isPist ? (
                      <Gauge className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <Link className="w-4 h-4" />
                    )}
                    {typeLabel} #{activeMuscle.id} Inspector
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    Node {activeMuscle.nodeA} ↔️ {activeMuscle.nodeB}
                  </span>
                </div>

                {/* Structural type cycle: bone → telescope → piston → muscle */}
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700">Structural Type</span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {isBone
                        ? 'Solid, fixed-length rigid beam'
                        : isTel
                          ? 'Hard strut; stroke rate is global (max 4px or 25% stroke)'
                          : isPist
                            ? 'Hard strut with authorable compression and expansion rates'
                            : 'Elastic spring piston muscle'}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleMuscleRigidity(activeMuscle.id)}
                    className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer border ${typeBtn}`}
                  >
                    {isBone ? 'Rigid Bone' : isTel ? 'Telescope' : isPist ? 'Piston' : 'Flexible Muscle'}
                  </button>
                </div>

                {/* Fixed bone length (editable). Muscles / telescopes / pistons derive rest from max expansion. */}
                {isBone ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                      <span>Bone Length</span>
                      <span className="text-indigo-600">{activeMuscle.originalLength} px</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="150"
                      step="1"
                      value={activeMuscle.originalLength}
                      onChange={(e) => {
                        const originalLength = parseInt(e.target.value);
                        setMuscles(prev => prev.map(m => {
                          if (m.id !== selectedMuscleId) return m;
                          return {
                            ...m,
                            originalLength,
                            minLength: originalLength,
                            maxLength: originalLength,
                          };
                        }));
                      }}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                ) : (
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span>{isTel || isPist ? 'Rest Length' : 'Resting Spring Length'}</span>
                    <span className="text-indigo-600">
                      {activeMuscle.originalLength} px
                      <span className="text-slate-400 font-medium"> (50% of max)</span>
                    </span>
                  </div>
                )}

                {/* Compression / expansion extremes — independent 10–1000px (min ≤ max) */}
                {!isBone && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <span>Minimum Contraction Bound</span>
                        <span className="text-indigo-600">{activeMuscle.minLength} px</span>
                      </div>
                      <input
                        type="range"
                        min={MIN_LINK_LENGTH}
                        max={MAX_LINK_LENGTH}
                        step="1"
                        value={clampLinkLength(activeMuscle.minLength)}
                        onChange={(e) => handleUpdateMuscleProp('minLength', parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <span>Maximum Expansion Bound</span>
                        <span className="text-indigo-600">{activeMuscle.maxLength} px</span>
                      </div>
                      <input
                        type="range"
                        min={MIN_LINK_LENGTH}
                        max={MAX_LINK_LENGTH}
                        step="1"
                        value={clampLinkLength(activeMuscle.maxLength)}
                        onChange={(e) => handleUpdateMuscleProp('maxLength', parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>
                  </>
                )}

                {isPist && piston && (
                  <div className="flex flex-col gap-3 p-2.5 rounded-lg border border-indigo-200 bg-indigo-50/60">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-indigo-900">Stroke rates</span>
                      <span className="text-[10px] text-indigo-700/80 font-medium">
                        Absolute px per physics tick. Compression and expansion are independent.
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <span>Compression rate</span>
                        <span className="text-indigo-600">{piston.retractRate.toFixed(2)} px/tick</span>
                      </div>
                      <input
                        type="range"
                        min={MIN_PISTON_RATE}
                        max={MAX_PISTON_RATE}
                        step="0.25"
                        value={piston.retractRate}
                        onChange={e =>
                          handleUpdateMuscleProp('retractRate', parseFloat(e.target.value))
                        }
                        className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <span>Expansion rate</span>
                        <span className="text-indigo-600">{piston.extendRate.toFixed(2)} px/tick</span>
                      </div>
                      <input
                        type="range"
                        min={MIN_PISTON_RATE}
                        max={MAX_PISTON_RATE}
                        step="0.25"
                        value={piston.extendRate}
                        onChange={e =>
                          handleUpdateMuscleProp('extendRate', parseFloat(e.target.value))
                        }
                        className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>
                  </div>
                )}

                {/* Aerodynamic surface */}
                <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700">Air surface</span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {!zoneEquip.allowAero
                        ? `${ARENA_ZONES[zoneId].title} forbids wings, paragliders, and parachutes.`
                        : activeMuscle.aeroType === 'wing'
                          ? 'Wing — projected-area plate: flap through air for lift. Holding still or edge-on is drag only (no float).'
                          : activeMuscle.aeroType === 'paraglider'
                            ? 'Paraglider — forward air under an open canopy makes lift. Tip the leading node up to climb, down to dive. Edge-on / still = no float.'
                            : activeMuscle.aeroType === 'parachute'
                              ? 'Parachute string — hangs straight when limp; billows into a dome (with gores) when it catches air. Edge-on / vertical captures nothing. No brain control.'
                              : 'No aero — normal bone/muscle only'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        { id: 'none', label: 'None' },
                        ...(zoneEquip.allowAero
                          ? ([
                              { id: 'wing', label: 'Wing' },
                              { id: 'paraglider', label: 'Glider' },
                              { id: 'parachute', label: 'Chute' },
                            ] as const)
                          : []),
                      ] as const
                    ).map(mode => {
                      const selected = (activeMuscle.aeroType ?? 'none') === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() =>
                            setMuscles(prev =>
                              prev.map(m => {
                                if (m.id !== selectedMuscleId) return m;
                                if (mode.id === 'none') {
                                  return { ...m, aeroType: 'none', aeroArea: undefined };
                                }
                                if (mode.id === 'parachute') {
                                  // Keep soft / flexible so the canopy can arc under load.
                                  const orig = Math.max(12, m.originalLength);
                                  return {
                                    ...m,
                                    aeroType: 'parachute',
                                    aeroArea: m.aeroArea ?? DEFAULT_PARACHUTE_AREA,
                                    minLength: Math.min(m.minLength, Math.round(orig * 0.72)),
                                    maxLength: Math.max(m.maxLength, Math.round(orig * 1.2)),
                                    strength: Math.min(m.strength, 0.55),
                                  };
                                }
                                return {
                                  ...m,
                                  aeroType: mode.id,
                                  aeroArea: m.aeroArea ?? DEFAULT_AERO_AREA,
                                };
                              })
                            )
                          }
                          className={`px-2 py-1.5 rounded text-[11px] font-bold transition-all cursor-pointer border ${
                            selected
                              ? mode.id === 'wing'
                                ? 'bg-sky-600 text-white border-sky-600'
                                : mode.id === 'paraglider'
                                  ? 'bg-violet-600 text-white border-violet-600'
                                  : mode.id === 'parachute'
                                    ? 'bg-orange-600 text-white border-orange-600'
                                    : 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                  {zoneEquip.allowAero &&
                    (activeMuscle.aeroType === 'wing' ||
                      activeMuscle.aeroType === 'paraglider' ||
                      activeMuscle.aeroType === 'parachute') && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <span>
                          {activeMuscle.aeroType === 'parachute'
                            ? 'Canopy area'
                            : 'Sail / wing area'}
                        </span>
                        <span
                          className={
                            activeMuscle.aeroType === 'wing'
                              ? 'text-sky-600'
                              : activeMuscle.aeroType === 'parachute'
                                ? 'text-orange-600'
                                : 'text-violet-600'
                          }
                        >
                          {(
                            activeMuscle.aeroArea ??
                            (activeMuscle.aeroType === 'parachute'
                              ? DEFAULT_PARACHUTE_AREA
                              : DEFAULT_AERO_AREA)
                          ).toFixed(0)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={MIN_AERO_AREA}
                        max={MAX_AERO_AREA}
                        step="1"
                        value={
                          activeMuscle.aeroArea ??
                          (activeMuscle.aeroType === 'parachute'
                            ? DEFAULT_PARACHUTE_AREA
                            : DEFAULT_AERO_AREA)
                        }
                        onChange={e =>
                          handleUpdateMuscleProp('aeroArea', parseFloat(e.target.value))
                        }
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-600"
                      />
                    </div>
                  )}
                </div>

                {/* Strength (Stiffness) — hard links always project at full strength */}
                {!isHardLengthConstraint(activeMuscle) && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span>Muscle Stiffness / Force</span>
                    <span className="text-indigo-600">{(activeMuscle.strength * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.97"
                    step="0.05"
                    value={activeMuscle.strength}
                    onChange={(e) => handleUpdateMuscleProp('strength', parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
                )}
                {isHardLengthConstraint(activeMuscle) && (
                  <p className="text-[10px] text-slate-500 font-medium">
                    Hard links always project at full rigidity (100%).
                  </p>
                )}
              </div>
            );
          })()}

          {/* Action validation injector */}
          <div className="sticky bottom-0 mt-auto -mx-4 -mb-4 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_18px_rgba(255,255,255,0.95)] backdrop-blur-sm">
            <button
              type="button"
              onClick={handleSaveToLibrary}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-md shadow-emerald-100 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" /> Save to Creature Anatomy
            </button>
            <button
              type="button"
              onClick={handleInjectAnatomy}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-100 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4 fill-white text-indigo-600" /> Apply & Test in Fullscreen
            </button>
            <p className="text-[10px] text-slate-400 font-medium text-center leading-relaxed">
              Save keeps this body in the Creature Anatomy selector. Apply starts a fresh fullscreen simulation with it.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};
