/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { CreatureBlueprint, isRigidBone, isPiston, isHardLengthConstraint, resolveLinkKind, sameUnorderedNodePair, findParallelHardLink, DEFAULT_MOTOR_POWER, MAX_MOTOR_POWER, MIN_MOTOR_POWER, MOTOR_POWER_STEP, DEFAULT_NODE_MASS, MIN_NODE_MASS, MAX_NODE_MASS, NODE_MASS_STEP, DEFAULT_NODE_RADIUS, MIN_NODE_RADIUS, MAX_NODE_RADIUS, DEFAULT_AERO_AREA, DEFAULT_PARACHUTE_AREA, MIN_AERO_AREA, MAX_AERO_AREA, AERO_AREA_STEP, MIN_LINK_LENGTH, MAX_LINK_LENGTH, clampLinkLength, clampRestingLength, restingLengthFromMaxExpansion, clampPistonRate, clampSoftMuscleRate, clampNodeMass, clampNodeRadius, clampMotorPower, clampAeroArea, defaultPistonRatesForStroke, pistonRates, MIN_PISTON_RATE, MAX_PISTON_RATE, MIN_SOFT_MUSCLE_RATE, MAX_SOFT_MUSCLE_RATE, DEFAULT_SOFT_MUSCLE_RATE, MuscleLinkKind, SolidSegmentSpec, LEVER_SLOT_T, isValidLeverSlot, muscleHasLever, type MuscleLeverSlot } from '../types';
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
  Gauge,
  Box,
  Unlock,
  Copy,
  FlipHorizontal,
} from 'lucide-react';
import { ArenaZoneId, ARENA_ZONES, blueprintAllowedInZone } from '../zones';
import {
  AppearancePrimitive,
  AppearanceRig,
  nextCreatureVersionName,
  saveStudioDraft,
} from '../creaturePackages';
import { createGooglyEyePairPrimitive, createEmptyAppearanceRig, drawAppearance, initBodyPartAssets } from '../appearance';
import { createBodyPartPrimitive, bodyPartTransform, muscleBoneMetrics } from '../bodyPartRender';
import {
  BODY_PART_CATALOG,
  BODY_PART_CATEGORIES,
  BodyPartCategory,
  BodyPartPack,
  getBodyPartDef,
} from '../bodyPartCatalog';
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
import {
  PreviewEndWeight,
  PreviewLink,
  leverEndWeights,
  nodeEndWeights,
  solvePreviewPose,
} from '../rangePreviewSolver';
import {
  creatureDrawPx,
  creatureNodeLabelFontSize,
  ensureScaledBlueprint,
} from '../creatureScale';
import {
  LENGTH_ACTUATION_EPS_PX,
  RELAXATION_ITERATIONS,
  WORLD_GRAVITY,
} from '../physicsConstants';

/** Shorthand for legacy absolute draw sizes → world units. */
const D = creatureDrawPx;

/**
 * Studio snap cell in world units.
 * Legacy authoring used 30px; after CREATURE_WORLD_SCALE that is only 3px — too
 * coarse for radius-1 nodes. Snap at the scaled 10px cell (1 world-px) so joints
 * can be placed accurately; major grid lines stay at the old 30px cadence.
 */
const STUDIO_GRID_SIZE = Math.max(1, Math.round(creatureDrawPx(10)));
/** Major grid / ruler interval (legacy 30px authoring → 3 world-px). */
const STUDIO_GRID_MAJOR = Math.max(STUDIO_GRID_SIZE, Math.round(creatureDrawPx(30)));
/** Ground / anatomy origin sits this many major-grid steps above the canvas bottom
 *  (legacy: 3 × 30px = 90px; scaled: 3 × 3px = 9 world-px). */
const STUDIO_GROUND_MAJOR_STEPS = 3;
/** Studio-only zoom: 800% farthest out … 4000% closest for fine node placement. */
const STUDIO_ZOOM_MIN = 8;
const STUDIO_ZOOM_MAX = 40;
const STUDIO_ZOOM_DEFAULT = 22; // 2200%
const STUDIO_ZOOM_STEP = 1;
/** World-space pick slack for muscle/bone/piston lines (legacy 12px authoring). */
const STUDIO_LINK_HIT_SLACK = D(12);
/** World-space paint-mode grab radius (legacy 22px authoring). */
const STUDIO_PAINT_HIT_SLACK = D(22);
/** Max Ctrl+Z depth for Studio anatomy edits. */
const STUDIO_UNDO_LIMIT = 40;

function snapToGrid(value: number, size = STUDIO_GRID_SIZE): number {
  return Math.round(value / size) * size;
}

/** Expand a node-id set so any solid plate intersecting it is included wholly. */
function expandIdsWithSolids(
  ids: Iterable<number>,
  solids: SolidSegmentSpec[]
): Set<number> {
  const set = new Set<number>(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const solid of solids) {
      if (!solid.nodeIds.some(id => set.has(id))) continue;
      for (const id of solid.nodeIds) {
        if (!set.has(id)) {
          set.add(id);
          changed = true;
        }
      }
    }
  }
  return set;
}

function flipLeverSlot(slot: MuscleLeverSlot | undefined): MuscleLeverSlot | undefined {
  if (slot === 'nearA') return 'nearB';
  if (slot === 'nearB') return 'nearA';
  return slot;
}

/** World Y of the ground alignment line (and anatomy origin) in canvas pixels. */
function studioOriginY(canvasHeight: number): number {
  return canvasHeight - STUDIO_GROUND_MAJOR_STEPS * STUDIO_GRID_MAJOR;
}

function parallelSoftStrokeOffset(
  muscle: Pick<StudioMuscle, 'id' | 'nodeA' | 'nodeB' | 'minLength' | 'maxLength' | 'strength' | 'linkKind' | 'aeroType'>,
  all: StudioMuscle[],
  xA: number,
  yA: number,
  xB: number,
  yB: number,
  pixels = D(5)
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

/** Compress / expand tint while Range preview is animating a link. */
type RangeTravelTint = 'compress' | 'expand' | 'mid' | null;

function rangeTravelTint(currentLen: number, originalLength: number): RangeTravelTint {
  const ratio = currentLen / (originalLength || 1);
  if (ratio < 0.92) return 'compress';
  if (ratio > 1.08) return 'expand';
  return 'mid';
}

/** Indigo sleeve/rod for authorable-rate piston struts. */
function drawPistonLink(
  ctx: CanvasRenderingContext2D,
  xA: number,
  yA: number,
  xB: number,
  yB: number,
  selected: boolean,
  thickBoost: number,
  travelTint: RangeTravelTint = null
) {
  const dx = xB - xA;
  const dy = yB - yA;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const mid = 0.55;
  const mx = xA + dx * mid;
  const my = yA + dy * mid;

  const sleeve =
    travelTint === 'compress'
      ? '#0891b2'
      : travelTint === 'expand'
        ? '#ea580c'
        : travelTint === 'mid'
          ? '#7c3aed'
          : selected
            ? '#38bdf8'
            : '#4338ca';
  const sleeveInner =
    travelTint === 'compress'
      ? '#a5f3fc'
      : travelTint === 'expand'
        ? '#fed7aa'
        : travelTint === 'mid'
          ? '#ddd6fe'
          : selected
            ? '#e0e7ff'
            : '#a5b4fc';
  const rod = selected && !travelTint ? '#1d4ed8' : travelTint ? '#1e1b4b' : '#312e81';
  const rodInner = selected && !travelTint ? '#eff6ff' : travelTint ? '#e0e7ff' : '#c7d2fe';
  const collar = selected ? '#fbbf24' : travelTint ? '#c4b5fd' : '#818cf8';

  ctx.lineCap = 'round';
  ctx.strokeStyle = sleeve;
  ctx.lineWidth = (selected ? D(10) : D(8)) + thickBoost;
  ctx.beginPath();
  ctx.moveTo(xA, yA);
  ctx.lineTo(mx, my);
  ctx.stroke();
  ctx.strokeStyle = sleeveInner;
  ctx.lineWidth = (selected ? D(5) : D(3.5)) + thickBoost * 0.5;
  ctx.beginPath();
  ctx.moveTo(xA + ux * D(2), yA + uy * D(2));
  ctx.lineTo(mx, my);
  ctx.stroke();
  ctx.strokeStyle = rod;
  ctx.lineWidth = (selected ? D(5) : D(3.5)) + thickBoost * 0.4;
  ctx.beginPath();
  ctx.moveTo(mx - ux * D(4), my - uy * D(4));
  ctx.lineTo(xB, yB);
  ctx.stroke();
  ctx.strokeStyle = rodInner;
  ctx.lineWidth = (selected ? D(2.5) : D(1.75)) + thickBoost * 0.25;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(xB - ux * D(2), yB - uy * D(2));
  ctx.stroke();
  // Rate collar mark near the sleeve lip
  ctx.strokeStyle = collar;
  ctx.lineWidth = (selected ? D(3) : D(2)) + thickBoost * 0.15;
  ctx.beginPath();
  ctx.moveTo(mx - ux * D(2) - uy * D(4), my - uy * D(2) + ux * D(4));
  ctx.lineTo(mx - ux * D(2) + uy * D(4), my - uy * D(2) - ux * D(4));
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
  /**
   * Soft muscle max |ΔtargetLength|/tick. undefined = inherit body;
   * 0 = unlimited override; >0 = custom cap.
   */
  softMaxDeltaPerTick?: number;
  thickness?: number;
  aeroType?: 'none' | 'wing' | 'paraglider' | 'parachute';
  aeroArea?: number;
  /**
   * Soft muscle only (D151): host bone **muscle id** (Studio), remapped to
   * muscles[] index on blueprint export.
   */
  leverBoneA?: number;
  leverSlotA?: MuscleLeverSlot;
  leverBoneB?: number;
  leverSlotB?: MuscleLeverSlot;
}

/** Snapshot of authored Studio state for Ctrl+Z. */
interface StudioUndoSnapshot {
  nodes: StudioNode[];
  muscles: StudioMuscle[];
  solidSegments: SolidSegmentSpec[];
  appearance: AppearanceRig;
  softMuscleMaxDeltaPerTick: number | undefined;
  selectedNodeId: number | null;
  selectedNodeIds: number[];
  selectedMuscleId: number | null;
  selectedSkinPartId: string | null;
}

/** Anchor while dragging a new soft muscle (node joint or bone slot). */
type StudioLinkAnchor =
  | { type: 'node'; nodeId: number }
  | { type: 'lever'; boneId: number; slot: MuscleLeverSlot };

const LEVER_SLOT_ORDER: MuscleLeverSlot[] = ['nearA', 'mid', 'nearB'];

function stripStudioLevers(m: StudioMuscle): StudioMuscle {
  const {
    leverBoneA: _a,
    leverSlotA: _sa,
    leverBoneB: _b,
    leverSlotB: _sb,
    ...rest
  } = m;
  return rest;
}

function boneSlotWorldPos(
  bone: Pick<StudioMuscle, 'nodeA' | 'nodeB'>,
  slot: MuscleLeverSlot,
  nodeList: { id: number; x: number; y: number }[]
): { x: number; y: number } | null {
  const a = nodeList.find(n => n.id === bone.nodeA);
  const b = nodeList.find(n => n.id === bone.nodeB);
  if (!a || !b) return null;
  const t = LEVER_SLOT_T[slot];
  return { x: a.x * (1 - t) + b.x * t, y: a.y * (1 - t) + b.y * t };
}

function leverTipNodeId(
  bone: Pick<StudioMuscle, 'nodeA' | 'nodeB'>,
  slot: MuscleLeverSlot
): number {
  return slot === 'nearB' ? bone.nodeB : bone.nodeA;
}

function studioAnchorWorldPos(
  anchor: StudioLinkAnchor,
  nodeList: { id: number; x: number; y: number }[],
  muscleList: StudioMuscle[]
): { x: number; y: number } | null {
  if (anchor.type === 'node') {
    const n = nodeList.find(node => node.id === anchor.nodeId);
    return n ? { x: n.x, y: n.y } : null;
  }
  const bone = muscleList.find(m => m.id === anchor.boneId);
  if (!bone || !isRigidBone(bone)) return null;
  return boneSlotWorldPos(bone, anchor.slot, nodeList);
}

function studioMuscleEndPos(
  muscle: StudioMuscle,
  end: 'A' | 'B',
  nodeList: { id: number; x: number; y: number }[],
  muscleList: StudioMuscle[]
): { x: number; y: number; weights: { nodeId: number; w: number }[] } | null {
  const leverBone = end === 'A' ? muscle.leverBoneA : muscle.leverBoneB;
  const leverSlot = end === 'A' ? muscle.leverSlotA : muscle.leverSlotB;
  if (
    leverBone !== undefined &&
    isValidLeverSlot(leverSlot)
  ) {
    const bone = muscleList.find(m => m.id === leverBone);
    if (bone && isRigidBone(bone)) {
      const p = boneSlotWorldPos(bone, leverSlot, nodeList);
      if (!p) return null;
      const t = LEVER_SLOT_T[leverSlot];
      return {
        ...p,
        weights: [
          { nodeId: bone.nodeA, w: 1 - t },
          { nodeId: bone.nodeB, w: t },
        ],
      };
    }
  }
  const nodeId = end === 'A' ? muscle.nodeA : muscle.nodeB;
  const n = nodeList.find(node => node.id === nodeId);
  if (!n) return null;
  return { x: n.x, y: n.y, weights: [{ nodeId, w: 1 }] };
}

/** Drawn link endpoints (lever slots when present) — shared by render and hit-tests. */
function studioLinkEndpoints(
  muscle: StudioMuscle,
  nodeList: { id: number; x: number; y: number }[],
  muscleList: StudioMuscle[]
): { xA: number; yA: number; xB: number; yB: number } | null {
  const nodeA = nodeList.find(n => n.id === muscle.nodeA);
  const nodeB = nodeList.find(n => n.id === muscle.nodeB);
  if (!nodeA || !nodeB) return null;
  const kind = resolveLinkKind(muscle);
  const endA =
    kind === 'muscle' && muscleHasLever(muscle)
      ? studioMuscleEndPos(muscle, 'A', nodeList, muscleList)
      : null;
  const endB =
    kind === 'muscle' && muscleHasLever(muscle)
      ? studioMuscleEndPos(muscle, 'B', nodeList, muscleList)
      : null;
  return {
    xA: endA?.x ?? nodeA.x,
    yA: endA?.y ?? nodeA.y,
    xB: endB?.x ?? nodeB.x,
    yB: endB?.y ?? nodeB.y,
  };
}

/** Distance from a world point to a link's visible segment (incl. parallel soft offset). */
function studioLinkHitDistance(
  muscle: StudioMuscle,
  relativeX: number,
  relativeY: number,
  nodeList: { id: number; x: number; y: number }[],
  muscleList: StudioMuscle[]
): number | null {
  const ends = studioLinkEndpoints(muscle, nodeList, muscleList);
  if (!ends) return null;
  const stroke = parallelSoftStrokeOffset(
    muscle,
    muscleList,
    ends.xA,
    ends.yA,
    ends.xB,
    ends.yB
  );
  const x1 = stroke.xA;
  const y1 = stroke.yA;
  const x2 = stroke.xB;
  const y2 = stroke.yB;
  const ax = relativeX - x1;
  const ay = relativeY - y1;
  const segX = x2 - x1;
  const segY = y2 - y1;
  const lenSq = segX * segX + segY * segY;
  let t = 0;
  if (lenSq !== 0) t = (ax * segX + ay * segY) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * segX;
  const py = y1 + t * segY;
  return Math.hypot(relativeX - px, relativeY - py);
}

type SkinLibraryPart = 'joint' | 'sleeve' | 'googlyEye';
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
  const [studioZoom, setStudioZoom] = useState(STUDIO_ZOOM_DEFAULT);
  const [studioPan, setStudioPan] = useState({ x: 0, y: 0 });
  const [appearance, setAppearance] = useState<AppearanceRig>(() => createEmptyAppearanceRig());
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
    initBodyPartAssets();
  }, []);

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
  /** Creature-wide soft muscle rate cap (px/tick); undefined = unlimited. */
  const [softMuscleMaxDeltaPerTick, setSoftMuscleMaxDeltaPerTick] = useState<
    number | undefined
  >(undefined);
  const solidRestRef = useRef<Map<string, { x: number; y: number }[]>>(new Map());
  const solidsRef = useRef<SolidSegmentSpec[]>([]);

  // Interactive UI state
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<number[]>([]);
  const [selectedMuscleId, setSelectedMuscleId] = useState<number | null>(null);
  const [editorMode, setEditorMode] = useState<
    'select' | 'add_node' | 'add_muscle' | 'add_bone' | 'add_piston' | 'paint'
  >('select');
  const [linkFromAnchor, setLinkFromAnchor] = useState<StudioLinkAnchor | null>(null);
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
  /** All node ids moved rigidly with the primary drag handle (selection + solid plates). */
  const dragGroupIdsRef = useRef<Set<number> | null>(null);
  const dragOriginRef = useRef<Map<number, { x: number; y: number }> | null>(null);
  const dragCursorStartRef = useRef<{ x: number; y: number } | null>(null);
  /** Latest committed drag positions (avoids stale React state on mouseup). */
  const dragLatestPosRef = useRef<Map<number, { x: number; y: number }> | null>(null);
  const isPaintingRef = useRef<boolean>(false);
  const physicsOldRef = useRef<Map<number, { oldX: number; oldY: number }>>(new Map());
  /** Drag-box (marquee) selection in world coords. */
  const [marquee, setMarquee] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const marqueeRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const marqueeActiveRef = useRef(false);
  const marqueeAdditiveRef = useRef(false);
  const suppressCanvasClickRef = useRef(false);
  const [skinFill, setSkinFill] = useState('#84cc16');
  const [skinOutline, setSkinOutline] = useState('#365314');
  const [skinLayer, setSkinLayer] = useState<'behind' | 'front'>('front');
  const [bodyPartPackFilter, setBodyPartPackFilter] = useState<'all' | BodyPartPack>('all');
  const [bodyPartCategoryFilter, setBodyPartCategoryFilter] = useState<'all' | BodyPartCategory>('all');
  const [selectedSkinPartId, setSelectedSkinPartId] = useState<string | null>(null);
  const [libraryRefreshToken, setLibraryRefreshToken] = useState(0);
  const nodesRef = useRef(nodes);
  const musclesRef = useRef(muscles);
  const appearanceRef = useRef(appearance);
  const softMuscleRateRef = useRef(softMuscleMaxDeltaPerTick);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const selectedMuscleIdRef = useRef(selectedMuscleId);
  const selectedSkinPartIdRef = useRef(selectedSkinPartId);
  const physicsEnabledRef = useRef(physicsEnabled);
  const rangePreviewEnabledRef = useRef(rangePreviewEnabled);
  const undoStackRef = useRef<StudioUndoSnapshot[]>([]);
  /** Coalesces continuous edits (sliders / paint strokes) into one undo step. */
  const undoGestureRef = useRef(false);
  nodesRef.current = nodes;
  musclesRef.current = muscles;
  appearanceRef.current = appearance;
  softMuscleRateRef.current = softMuscleMaxDeltaPerTick;
  selectedNodeIdRef.current = selectedNodeId;
  selectedNodeIdsRef.current = selectedNodeIds;
  selectedMuscleIdRef.current = selectedMuscleId;
  selectedSkinPartIdRef.current = selectedSkinPartId;
  physicsEnabledRef.current = physicsEnabled;
  rangePreviewEnabledRef.current = rangePreviewEnabled;
  solidsRef.current = solidSegments;

  const clearUndoStack = () => {
    undoStackRef.current = [];
    undoGestureRef.current = false;
  };

  const pushUndoCheckpoint = () => {
    if (physicsEnabledRef.current || rangePreviewEnabledRef.current) return;
    const snap: StudioUndoSnapshot = {
      nodes: structuredClone(nodesRef.current),
      muscles: structuredClone(musclesRef.current),
      solidSegments: structuredClone(solidsRef.current),
      appearance: structuredClone(appearanceRef.current),
      softMuscleMaxDeltaPerTick: softMuscleRateRef.current,
      selectedNodeId: selectedNodeIdRef.current,
      selectedNodeIds: [...selectedNodeIdsRef.current],
      selectedMuscleId: selectedMuscleIdRef.current,
      selectedSkinPartId: selectedSkinPartIdRef.current,
    };
    undoStackRef.current = [
      ...undoStackRef.current.slice(-(STUDIO_UNDO_LIMIT - 1)),
      snap,
    ];
  };

  /** One checkpoint for a continuous gesture (slider drag, paint stroke). */
  const ensureUndoGestureCheckpoint = () => {
    if (undoGestureRef.current) return;
    pushUndoCheckpoint();
    undoGestureRef.current = true;
  };

  const endUndoGesture = () => {
    undoGestureRef.current = false;
  };

  const resetToolSources = () => {
    setLinkFromAnchor(null);
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
    pushUndoCheckpoint();
    setNodes([]);
    setMuscles([]);
    setSolidSegments([]);
    solidRestRef.current.clear();
    clearNodeSelection();
    setSelectedMuscleId(null);
    setSelectedSkinPartId(null);
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
    let bestDist = STUDIO_PAINT_HIT_SLACK;

    for (const muscle of muscles) {
      const dist = studioLinkHitDistance(muscle, relativeX, relativeY, nodes, muscles);
      if (dist === null) continue;
      if (dist < bestDist) {
        bestDist = dist;
        bestId = muscle.id;
      }
    }

    if (bestId === null) return;
    ensureUndoGestureCheckpoint();
    setMuscles(prev =>
      prev.map(m => {
        if (m.id !== bestId) return m;
        return { ...m, thickness: Math.min(4, (m.thickness ?? 1) + amount) };
      })
    );
    setSelectedMuscleId(bestId);
    setSelectedNodeId(null);
  };

  const muscleLocalAt = (muscleIndex: number, relativeX: number, relativeY: number) => {
    const muscle = muscles[muscleIndex];
    if (!muscle) return null;
    const ends = studioLinkEndpoints(muscle, nodes, muscles);
    if (!ends) return null;
    const dx = ends.xB - ends.xA;
    const dy = ends.yB - ends.yA;
    const lengthSquared = dx * dx + dy * dy;
    const length = Math.sqrt(lengthSquared);
    if (length < D(1)) return null;
    return {
      along: ((relativeX - ends.xA) * dx + (relativeY - ends.yA) * dy) / lengthSquared,
      offset: (-(relativeX - ends.xA) * dy + (relativeY - ends.yA) * dx) / length,
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

  const addSkinLibraryPart = (kind: SkinLibraryPart) => {
    const anchor = selectedSkinAnchor();
    if (!anchor) {
      alert('Select a node or muscle first, then choose a solid body part to attach.');
      return;
    }
    if (kind === 'googlyEye' && anchor.type !== 'node') {
      alert('Googly eyes attach to a node (centre of the head). Select a node first.');
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
      const radius = Math.max(1, node.radius);
      if (kind === 'googlyEye') {
        part = createGooglyEyePairPrimitive(anchor.index, radius);
        part.layer = skinLayer;
        part.z = skinLayer === 'front' ? 112 : 28;
        part.stroke = skinOutline;
      } else {
        part = {
          ...base,
          kind: 'ellipse',
          anchorNode: anchor.index,
          points: [{ x: 0, y: 0 }, { x: radius * 1.45, y: radius * 1.3 }],
        };
      }
    } else {
      const local = muscleLocalAt(anchor.index, 0, 0);
      const muscle = muscles[anchor.index];
      const a = nodes.find(node => node.id === muscle.nodeA)!;
      const b = nodes.find(node => node.id === muscle.nodeB)!;
      const width = Math.max(D(1.3), Math.min(a.radius, b.radius) * 1.8);
      part = {
        ...base,
        kind: 'capsule',
        anchorMuscle: anchor.index,
        points: [{ x: 0, y: 0 }, { x: 1, y: width }],
      };
    }
    pushUndoCheckpoint();
    setSelectedSkinPartId(id);
    setAppearance(current => ({ ...current, primitives: [...current.primitives, part] }));
  };

  const addBodyPartFromCatalog = (assetId: string) => {
    const def = getBodyPartDef(assetId);
    const anchor = selectedSkinAnchor();
    if (!def) return;
    if (!anchor) {
      alert('Select a node or link first, then pick a body part from the library.');
      return;
    }
    if (def.anchorHint === 'node' && anchor.type !== 'node') {
      alert(`${def.label} attaches to a node. Select a node first.`);
      return;
    }
    if (def.anchorHint === 'muscle' && anchor.type !== 'muscle') {
      alert(`${def.label} attaches to a link. Select a muscle or bone first.`);
      return;
    }

    const nodeIndexById = new Map(nodes.map((node, index) => [node.id, index]));
    const skinSkeleton = {
      nodes: nodes.map(node => ({ x: node.x, y: node.y, radius: node.radius })),
      muscles: muscles.map(muscle => ({
        nodeA: nodeIndexById.get(muscle.nodeA) ?? -1,
        nodeB: nodeIndexById.get(muscle.nodeB) ?? -1,
      })),
    };
    const part = createBodyPartPrimitive(
      assetId,
      anchor.type === 'node' ? anchor.index : undefined,
      anchor.type === 'muscle' ? anchor.index : undefined,
      anchor.type === 'muscle'
        ? muscleBoneMetrics(anchor.index, skinSkeleton)?.length
        : undefined
    );
    part.layer = skinLayer;
    part.z = skinLayer === 'front' ? 105 : 22;
    pushUndoCheckpoint();
    setSelectedSkinPartId(part.id);
    setAppearance(current => ({ ...current, primitives: [...current.primitives, part] }));
  };

  const updateSelectedBodyPart = (patch: Partial<{
    offsetX: number;
    offsetY: number;
    scale: number;
    rotationDeg: number;
    mirror: boolean;
    boneAlign: boolean;
    boneStretch: boolean;
    anchorAlong: number;
  }>) => {
    if (!selectedSkinPartId) return;
    ensureUndoGestureCheckpoint();
    const nodeIndexById = new Map(nodes.map((node, index) => [node.id, index]));
    const skinSkeleton = {
      nodes: nodes.map(node => ({ x: node.x, y: node.y, radius: node.radius })),
      muscles: muscles.map(muscle => ({
        nodeA: nodeIndexById.get(muscle.nodeA) ?? -1,
        nodeB: nodeIndexById.get(muscle.nodeB) ?? -1,
      })),
    };
    setAppearance(current => ({
      ...current,
      primitives: current.primitives.map(part => {
        if (part.id !== selectedSkinPartId || part.kind !== 'bodyPart') return part;
        const next = { ...part, points: part.points.map(p => ({ ...p })) };
        if (patch.offsetX !== undefined) next.points[0] = { ...next.points[0], x: patch.offsetX };
        if (patch.offsetY !== undefined) next.points[0] = { ...next.points[0], y: patch.offsetY };
        if (patch.anchorAlong !== undefined) {
          next.points[0] = { ...next.points[0], x: patch.anchorAlong };
        }
        if (patch.scale !== undefined) {
          next.points[1] = { x: patch.scale, y: patch.scale };
        }
        if (patch.rotationDeg !== undefined) {
          next.points[2] = { x: (patch.rotationDeg * Math.PI) / 180, y: 0 };
        }
        if (patch.mirror !== undefined) next.mirror = patch.mirror;
        if (patch.boneAlign !== undefined) {
          next.boneAlign = patch.boneAlign || undefined;
          if (patch.boneAlign && next.anchorMuscle !== undefined && !next.boneStretch) {
            const along = next.points[0]?.x ?? 0;
            if (along === 0 && (next.points[0]?.y ?? 0) === 0) {
              next.points[0] = { x: 0.5, y: 0 };
            }
          }
        }
        if (patch.boneStretch !== undefined) {
          next.boneStretch = patch.boneStretch || undefined;
          if (patch.boneStretch && next.anchorMuscle !== undefined) {
            next.boneAlign = true;
            const bone = muscleBoneMetrics(next.anchorMuscle, skinSkeleton);
            if (bone) next.boneRestLength = bone.length;
            if ((next.points[0]?.x ?? 0.5) === 0.5) {
              next.points[0] = { x: 0, y: next.points[0]?.y ?? 0 };
            }
          }
        }
        return next;
      }),
    }));
  };

  const filteredBodyParts = BODY_PART_CATALOG.filter(part => {
    if (bodyPartPackFilter !== 'all' && part.pack !== bodyPartPackFilter) return false;
    if (bodyPartCategoryFilter !== 'all' && part.category !== bodyPartCategoryFilter) return false;
    return true;
  });

  // Cycle muscle ↔ bone ↔ piston
  const toggleMuscleRigidity = (muscleId: number) => {
    pushUndoCheckpoint();
    setMuscles(prev => prev.map(m => {
      if (m.id !== muscleId) return m;
      const kind = resolveLinkKind(m);
      if (kind === 'bone') {
        // Fixed bone → authorable-rate piston
        const rest = m.originalLength || m.minLength;
        const maxLength = clampLinkLength(Math.round(rest * 1.3));
        const minLength = clampLinkLength(Math.min(Math.round(rest * 0.7), maxLength));
        const rates = defaultPistonRatesForStroke(minLength, maxLength);
        return stripStudioLevers({
          ...m,
          linkKind: 'piston' as const,
          minLength,
          maxLength,
          originalLength: restingLengthFromMaxExpansion(maxLength),
          strength: 1.0,
          extendRate: rates.extendRate,
          retractRate: rates.retractRate,
          softMaxDeltaPerTick: undefined,
        });
      }
      if (kind === 'piston') {
        // Piston → soft muscle
        const rest = m.originalLength || Math.round((m.minLength + m.maxLength) / 2);
        const maxLength = clampLinkLength(Math.round(rest * 1.4));
        const minLength = clampLinkLength(Math.min(Math.round(rest * 0.6), maxLength));
        return {
          ...m,
          linkKind: 'muscle' as const,
          minLength,
          maxLength,
          originalLength: restingLengthFromMaxExpansion(maxLength),
          strength: 0.6,
          extendRate: undefined,
          retractRate: undefined,
          softMaxDeltaPerTick: undefined,
        };
      }
      // Soft muscle → fixed bone
      const rest = m.originalLength || Math.round((m.minLength + m.maxLength) / 2);
      return stripStudioLevers({
        ...m,
        linkKind: 'bone' as const,
        originalLength: rest,
        minLength: rest,
        maxLength: rest,
        strength: 1.0,
        extendRate: undefined,
        retractRate: undefined,
        softMaxDeltaPerTick: undefined,
      });
    }));
  };

  /** Snapshot node positions so physics / range preview can restore the authored pose. */
  const saveStudioRestPose = (sourceNodes: StudioNode[] = nodesRef.current) => {
    const rest = new Map<number, { x: number; y: number }>();
    for (const n of sourceNodes) {
      rest.set(n.id, { x: n.x, y: n.y });
    }
    restPoseRef.current = rest;
  };

  const restoreStudioRestPose = (): StudioNode[] | null => {
    if (restPoseRef.current.size === 0) return null;
    const rest = restPoseRef.current;
    const restoredNodes = nodesRef.current.map(n => {
      const p = rest.get(n.id);
      return p ? { ...n, x: p.x, y: p.y } : n;
    });
    // Keep ref in sync so same-tick callers (e.g. switching Physics ↔ Range) see the pose.
    nodesRef.current = restoredNodes;
    setNodes(restoredNodes);
    // Keep solid plate offsets aligned with the restored authored pose.
    refreshSolidRestOffsets(solidsRef.current, restoredNodes);
    restPoseRef.current.clear();
    return restoredNodes;
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

  const restoreUndoSnapshot = (snap: StudioUndoSnapshot) => {
    nodesRef.current = snap.nodes;
    musclesRef.current = snap.muscles;
    solidsRef.current = snap.solidSegments;
    appearanceRef.current = snap.appearance;
    softMuscleRateRef.current = snap.softMuscleMaxDeltaPerTick;
    setNodes(snap.nodes);
    setMuscles(snap.muscles);
    setSolidSegments(snap.solidSegments);
    setAppearance(snap.appearance);
    setSoftMuscleMaxDeltaPerTick(snap.softMuscleMaxDeltaPerTick);
    setSelectedNodeId(snap.selectedNodeId);
    setSelectedNodeIds(snap.selectedNodeIds);
    setSelectedMuscleId(snap.selectedMuscleId);
    setSelectedSkinPartId(snap.selectedSkinPartId);
    refreshSolidRestOffsets(snap.solidSegments, snap.nodes);
    restPoseRef.current.clear();
  };

  const undoStudio = () => {
    const prior = undoStackRef.current.at(-1);
    if (!prior) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    undoGestureRef.current = false;
    if (physicsEnabledRef.current) {
      setPhysicsEnabled(false);
      physicsOldRef.current.clear();
    }
    if (rangePreviewEnabledRef.current) {
      setRangePreviewEnabled(false);
      rangeTimeRef.current = 0;
    }
    restoreUndoSnapshot(prior);
  };

  const handleLockSolid = () => {
    const ids = selectedNodeIds.length > 0
      ? selectedNodeIds
      : selectedNodeId !== null
        ? [selectedNodeId]
        : [];
    if (ids.length < MIN_SOLID_NODES) {
      alert(`Select at least ${MIN_SOLID_NODES} nodes (drag-box or Shift+click) to create a solid plate.`);
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
    const removeSoft = softInside.length > 0 ? new Set<number>(softInside) : null;
    const nextMuscles = removeSoft
      ? muscles.filter(m => !removeSoft.has(m.id))
      : muscles;
    const err = validateSolidSegments(
      nextSolids,
      nodes.map(n => n.id),
      nextMuscles
    );
    if (err) {
      alert(err);
      return;
    }
    pushUndoCheckpoint();
    if (removeSoft) setMuscles(nextMuscles);
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
    pushUndoCheckpoint();
    const next = solidSegments.filter(s => !unlockIds.has(s.id));
    setSolidSegments(next);
    refreshSolidRestOffsets(next, nodes);
  };

  const stopPhysicsPreview = (restorePose: boolean) => {
    setPhysicsEnabled(false);
    physicsOldRef.current.clear();
    if (restorePose) restoreStudioRestPose();
    else restPoseRef.current.clear();
  };

  const togglePhysics = () => {
    if (physicsEnabled) {
      stopPhysicsPreview(true);
      return;
    }
    if (rangePreviewEnabled) {
      stopRangePreview(true);
    }
    saveStudioRestPose();
    const map = new Map<number, { oldX: number; oldY: number }>();
    for (const n of nodesRef.current) {
      map.set(n.id, { oldX: n.x, oldY: n.y });
    }
    physicsOldRef.current = map;
    refreshSolidRestOffsets(solidsRef.current, nodesRef.current);
    setPhysicsEnabled(true);
  };

  const stopRangePreview = (restorePose: boolean) => {
    setRangePreviewEnabled(false);
    rangeTimeRef.current = 0;
    if (restorePose) restoreStudioRestPose();
    else restPoseRef.current.clear();
  };

  const toggleRangePreview = () => {
    if (rangePreviewEnabled) {
      stopRangePreview(true);
      return;
    }
    if (physicsEnabled) {
      stopPhysicsPreview(true);
    }
    saveStudioRestPose();
    // Solid plate offsets must match the authored pose the preview solves from.
    refreshSolidRestOffsets(solidsRef.current, nodesRef.current);
    rangeTimeRef.current = 0;
    setRangePreviewEnabled(true);
  };

  // Quasi-static muscle/piston range preview (observe min/max travel).
  // Each frame is solved fresh from the authored rest pose and rigid drift is
  // removed (rangePreviewSolver), so the pose is a pure function of the wave
  // phase — the body cannot tumble, wander, or launch off-canvas.
  useEffect(() => {
    if (!rangePreviewEnabled) return;

    let rafId = 0;
    let cancelled = false;
    // Full compress→expand cycle ~5.5s
    const PERIOD = 5.5;

    const step = () => {
      if (cancelled) return;
      rangeTimeRef.current += 1 / 60;
      const cycleT = rangeTimeRef.current / PERIOD;
      const muscleList = musclesRef.current;
      const focusId = selectedMuscleIdRef.current;
      const focusLink = focusId !== null ? muscleList.find(m => m.id === focusId) : undefined;
      const focusKind = focusLink ? resolveLinkKind(focusLink) : null;
      // Single-link mode when a flexible muscle or piston is selected
      const focusActuatorId =
        focusKind === 'muscle' || focusKind === 'piston' ? focusId : null;
      const rest = restPoseRef.current;

      setNodes(prev => {
        if (cancelled) return prev;
        const restMap = new Map<number, { x: number; y: number; radius: number }>();
        const masses = new Map<number, number>();
        for (const n of prev) {
          let r = rest.get(n.id);
          if (!r) {
            // Node added mid-preview: anchor it at its authored position.
            r = { x: n.x, y: n.y };
            rest.set(n.id, r);
          }
          restMap.set(n.id, { x: r.x, y: r.y, radius: n.radius });
          masses.set(n.id, n.mass);
        }

        const endWeights = (m: StudioMuscle, end: 'A' | 'B'): PreviewEndWeight[] | null => {
          const leverBone = end === 'A' ? m.leverBoneA : m.leverBoneB;
          const leverSlot = end === 'A' ? m.leverSlotA : m.leverSlotB;
          if (leverBone !== undefined && isValidLeverSlot(leverSlot)) {
            const bone = muscleList.find(x => x.id === leverBone);
            if (bone && isRigidBone(bone) && restMap.has(bone.nodeA) && restMap.has(bone.nodeB)) {
              return leverEndWeights(bone, LEVER_SLOT_T[leverSlot]);
            }
          }
          const nodeId = end === 'A' ? m.nodeA : m.nodeB;
          return restMap.has(nodeId) ? nodeEndWeights(nodeId) : null;
        };

        const links: PreviewLink[] = [];
        for (const m of muscleList) {
          const endA = endWeights(m, 'A');
          const endB = endWeights(m, 'B');
          if (!endA || !endB) continue;
          const kind = resolveLinkKind(m);
          links.push({
            id: m.id,
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
            phaseOffset: m.phaseOffset || 0,
          });
        }

        const solved = solvePreviewPose(
          {
            rest: restMap,
            masses,
            links,
            solids: solidsRef.current,
            solidRest: solidRestRef.current,
            groundY: 0,
          },
          cycleT,
          focusActuatorId
        );

        return prev.map(n => {
          const p = solved.get(n.id);
          return p ? { ...n, x: p.x, y: p.y } : n;
        });
      });

      if (!cancelled) rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [rangePreviewEnabled]);

  // Verlet-style physics preview while Physics toggle is ON.
  // Mirrors Arena D142 velocity policy so rest-hold constraints do not invent speed.
  useEffect(() => {
    if (!physicsEnabled) return;

    let rafId = 0;
    let cancelled = false;
    const RELAX_ITERS = RELAXATION_ITERATIONS;
    const HARD_EXTRA_ITERS = 6;
    const GRAVITY = WORLD_GRAVITY;
    const DAMPING = 0.99;

    const step = () => {
      if (cancelled) return;
      const muscleList = musclesRef.current;
      const oldMap = physicsOldRef.current;
      const pinnedIds: ReadonlySet<number> | null = isDraggingRef.current
        ? dragGroupIdsRef.current ??
          (dragNodeIdRef.current !== null ? new Set([dragNodeIdRef.current]) : null)
        : null;
      const isPinned = (id: number) => !!pinnedIds?.has(id);

      setNodes(prev => {
        if (cancelled) return prev;
        // Ensure old positions exist for every node
        for (const n of prev) {
          if (!oldMap.has(n.id)) {
            oldMap.set(n.id, { oldX: n.x, oldY: n.y });
          }
        }

        // Integrate Verlet
        const next = prev.map(n => {
          if (isPinned(n.id)) {
            const old = oldMap.get(n.id)!;
            old.oldX = n.x;
            old.oldY = n.y;
            return n;
          }
          const old = oldMap.get(n.id)!;
          const vx = (n.x - old.oldX) * DAMPING;
          const vy = (n.y - old.oldY) * DAMPING;
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

        const projectLinks = (hardOnly: boolean) => {
          const membership = solidMembership(solidsRef.current);
          for (const m of muscleList) {
            if (hardOnly && !isHardLengthConstraint(m)) continue;
            if (isLinkWhollyInsideSolid(m.nodeA, m.nodeB, membership)) continue;
            const nodeSnap = [...pos.entries()].map(([id, p]) => ({
              id,
              x: p.x,
              y: p.y,
            }));
            const endA = studioMuscleEndPos(m, 'A', nodeSnap, muscleList);
            const endB = studioMuscleEndPos(m, 'B', nodeSnap, muscleList);
            if (!endA || !endB) continue;
            const dx = endB.x - endA.x;
            const dy = endB.y - endA.y;
            const dist = Math.hypot(dx, dy) || 1;
            const target = m.originalLength || dist;
            const lengthError = dist - target;
            const strength = isHardLengthConstraint(m) ? 1.0 : Math.min(1, m.strength);
            // Half correction per end → total = strength × error (Arena
            // mass-split parity). A full step per end double-corrects and
            // makes hard links oscillate around the target instead of
            // converging (Studio-preview explosions under piston load).
            const stepScale = 0.5;
            const diff = (lengthError / dist) * stepScale * strength;
            const ox = dx * diff;
            const oy = dy * diff;
            // D142: preserve Verlet history for hard links and near-target soft holds.
            const preserveVel =
              isHardLengthConstraint(m) ||
              Math.abs(lengthError) < LENGTH_ACTUATION_EPS_PX;

            const applyEnd = (
              end: { weights: { nodeId: number; w: number }[] },
              sign: number,
              scale: number
            ) => {
              const wSum = end.weights.reduce((s, w) => s + w.w * w.w, 0) || 1;
              for (const { nodeId, w } of end.weights) {
                if (isPinned(nodeId)) continue;
                const p = pos.get(nodeId);
                if (!p) continue;
                const k = (w / wSum) * scale * sign;
                const dX = ox * k;
                const dY = oy * k;
                p.x += dX;
                p.y += dY;
                if (preserveVel) {
                  const old = oldMap.get(nodeId);
                  if (old) {
                    old.oldX += dX;
                    old.oldY += dY;
                  }
                }
              }
            };

            const aPinned = endA.weights.every(w => isPinned(w.nodeId));
            const bPinned = endB.weights.every(w => isPinned(w.nodeId));
            if (aPinned && bPinned) continue;
            if (!aPinned && !bPinned) {
              applyEnd(endA, 1, 1);
              applyEnd(endB, -1, 1);
            } else if (aPinned && !bPinned) {
              applyEnd(endB, -1, 2);
            } else if (!aPinned && bPinned) {
              applyEnd(endA, 1, 2);
            }
          }
        };

        const projectSolids = (preserveVelocity: boolean) => {
          if (solidsRef.current.length === 0) return;
          const masses = new Map<number, number>();
          for (const n of prev) masses.set(n.id, n.mass);
          projectSolidBodiesOnMap(
            pos,
            oldMap,
            masses,
            solidsRef.current,
            solidRestRef.current,
            { pinnedIds: pinnedIds ?? undefined, preserveVelocity }
          );
        };

        const projectHinges = () => {
          const hingeIds = new Set<number>(
            prev.filter(n => n.isHingeStop).map(n => n.id)
          );
          if (hingeIds.size > 0) {
            projectHingeStopsOnMap(pos, oldMap, muscleList, hingeIds);
          }
        };

        for (let iter = 0; iter < RELAX_ITERS; iter++) {
          projectLinks(false);
          projectSolids(true);
          projectHinges();
        }
        // Extra hard-only passes so bones/pistons/solids converge under load.
        for (let iter = 0; iter < HARD_EXTRA_ITERS; iter++) {
          projectLinks(true);
          projectSolids(true);
        }
        projectHinges();

        // Ground collision at y = 0 (y increases downward)
        for (const [id, p] of pos) {
          if (isPinned(id)) continue;
          if (p.y + p.radius > 0) {
            p.y = -p.radius;
            const old = oldMap.get(id);
            if (old) {
              const vx = p.x - old.oldX;
              const src = prev.find(n => n.id === id);
              if (src?.isWheel) {
                // Passive roll: light drag + spin (Arena rollDrag = 0.02)
                p.x = old.oldX + vx * 0.98;
                old.oldY = p.y;
                const spin = (src.spinAngle ?? 0) - vx / Math.max(1, p.radius);
                (p as Pos & { spinAngle?: number }).spinAngle = spin;
              } else {
                const grip = Math.min(1, Math.max(0, p.friction));
                p.x = old.oldX + vx * (1 - grip);
                old.oldY = p.y;
              }
            }
          }
        }

        // Re-project solids after ground without re-deriving ω from friction
        // residuals (Arena D141/D142 — avoids launch amplification).
        projectSolids(false);
        projectHinges();

        // Replant solid members that still touch the floor after reshape.
        if (solidsRef.current.length > 0) {
          const memberIds = solidNodeIdSet(solidsRef.current);
          for (const id of memberIds) {
            if (isPinned(id)) continue;
            const p = pos.get(id);
            const src = prev.find(n => n.id === id);
            if (!p || !src || src.isWheel) continue;
            if (p.y + p.radius >= -0.75) {
              p.y = -p.radius;
              const old = oldMap.get(id);
              if (old) {
                const vx = p.x - old.oldX;
                const grip = Math.min(
                  1,
                  Math.max(0, (0.8 + p.friction) * 0.5)
                );
                p.x = old.oldX + vx * (1 - grip);
                old.oldY = p.y;
              }
            }
          }
        }

        return next.map(n => {
          if (isPinned(n.id)) return n;
          const p = pos.get(n.id) as (Pos & { spinAngle?: number }) | undefined;
          if (!p) return n;
          if (n.isWheel && p.spinAngle !== undefined) {
            return { ...n, x: p.x, y: p.y, spinAngle: p.spinAngle };
          }
          return { ...n, x: p.x, y: p.y };
        });
      });

      if (!cancelled) rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [physicsEnabled]);

  /** Pan/zoom so the loaded body fills a comfortable fraction of the canvas. */
  const fitStudioViewToNodes = (bodyNodes: StudioNode[]) => {
    if (bodyNodes.length === 0) {
      setStudioZoom(STUDIO_ZOOM_DEFAULT);
      setStudioPan({ x: 0, y: 0 });
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of bodyNodes) {
      minX = Math.min(minX, n.x - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    }
    const width = Math.max(STUDIO_GRID_SIZE, maxX - minX);
    const height = Math.max(STUDIO_GRID_SIZE, maxY - minY);
    const canvasW = Math.max(400, dimensions.width);
    const canvasH = Math.max(280, dimensions.height);
    // Leave margin for the height ruler / chrome.
    const zoomX = (canvasW * 0.62) / width;
    const zoomY = (canvasH * 0.55) / height;
    const zoom = Math.max(
      STUDIO_ZOOM_MIN,
      Math.min(STUDIO_ZOOM_MAX, Math.floor(Math.min(zoomX, zoomY)))
    );
    setStudioZoom(zoom);
    setStudioPan({
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    });
  };

  // Load active template structure on mount/select
  const loadTemplateIntoStudio = (
    template: CreatureBlueprint,
    templateAppearance?: AppearanceRig
  ) => {
    const scaled = ensureScaledBlueprint(template);
    const studioNodes: StudioNode[] = scaled.nodes.map((n, idx) => {
      const relPos = scaled.relativePositions[idx] || { x: 0, y: 0 };
      return {
        id: n.id,
        mass: clampNodeMass(n.mass),
        radius: clampNodeRadius(n.radius),
        friction: n.friction,
        color: n.color || '#3b82f6',
        x: relPos.x,
        y: relPos.y,
        isWheel: n.isWheel ?? false,
        isMotorWheel: n.isMotorWheel ?? false,
        motorPower: clampMotorPower(n.motorPower ?? DEFAULT_MOTOR_POWER),
        isFoot: !!n.isFoot,
        isHingeStop: !!n.isHingeStop,
        spinAngle: 0,
      };
    });

    const studioMuscles: StudioMuscle[] = scaled.muscles.map(m => {
      const kind = resolveLinkKind(m);
      const softCap =
        kind === 'muscle' &&
        typeof m.softMaxDeltaPerTick === 'number' &&
        Number.isFinite(m.softMaxDeltaPerTick)
          ? m.softMaxDeltaPerTick <= 0
            ? 0
            : clampSoftMuscleRate(m.softMaxDeltaPerTick)
          : undefined;
      const pistonSeed =
        kind === 'piston'
          ? defaultPistonRatesForStroke(
              clampLinkLength(m.minLength),
              clampLinkLength(m.maxLength)
            )
          : null;
      return {
        id: m.id,
        nodeA: m.nodeA,
        nodeB: m.nodeB,
        originalLength: clampLinkLength(m.originalLength),
        minLength: clampLinkLength(m.minLength),
        maxLength: clampLinkLength(m.maxLength),
        strength: m.strength,
        phaseOffset: m.phaseOffset,
        thickness: m.thickness ?? 1,
        aeroType: m.aeroType ?? 'none',
        aeroArea: m.aeroArea !== undefined ? clampAeroArea(m.aeroArea) : undefined,
        linkKind: kind,
        extendRate:
          kind === 'piston'
            ? clampPistonRate(m.extendRate ?? pistonSeed!.extendRate)
            : undefined,
        retractRate:
          kind === 'piston'
            ? clampPistonRate(m.retractRate ?? pistonSeed!.retractRate)
            : undefined,
        softMaxDeltaPerTick: softCap,
        ...(kind === 'muscle' &&
        typeof m.leverBoneA === 'number' &&
        scaled.muscles[m.leverBoneA] &&
        isValidLeverSlot(m.leverSlotA)
          ? {
              leverBoneA: scaled.muscles[m.leverBoneA].id,
              leverSlotA: m.leverSlotA,
            }
          : {}),
        ...(kind === 'muscle' &&
        typeof m.leverBoneB === 'number' &&
        scaled.muscles[m.leverBoneB] &&
        isValidLeverSlot(m.leverSlotB)
          ? {
              leverBoneB: scaled.muscles[m.leverBoneB].id,
              leverSlotB: m.leverSlotB,
            }
          : {}),
      };
    });

    setNodes(studioNodes);
    setMuscles(studioMuscles);
    setSoftMuscleMaxDeltaPerTick(
      typeof scaled.softMuscleMaxDeltaPerTick === 'number' &&
        scaled.softMuscleMaxDeltaPerTick > 0
        ? clampSoftMuscleRate(scaled.softMuscleMaxDeltaPerTick)
        : undefined
    );
    const loadedSolids = normalizeSolidSegments(scaled.solidSegments);
    setSolidSegments(loadedSolids);
    refreshSolidRestOffsets(loadedSolids, studioNodes);
    const baseAppearance = templateAppearance
      ? structuredClone(templateAppearance)
      : createEmptyAppearanceRig();
    setAppearance({
      ...baseAppearance,
      primitives: baseAppearance.primitives.filter(part => part.kind !== 'rigidPlate'),
    });
    setCreatureName(
      nextCreatureVersionName(
        scaled.name,
        zoneLibrary.map(item => item.name)
      )
    );
    clearNodeSelection();
    setSelectedMuscleId(null);
    resetToolSources();
    clearUndoStack();
    // Frame the loaded body so world-scale walkers aren't tiny dots at a stale zoom.
    fitStudioViewToNodes(studioNodes);
    // Preview modes keep simulating the newly loaded body; rest pose tracks this load.
    if (physicsEnabled || rangePreviewEnabled) {
      saveStudioRestPose(studioNodes);
    } else {
      restPoseRef.current.clear();
    }
    if (physicsEnabled) {
      const map = new Map<number, { oldX: number; oldY: number }>();
      for (const n of studioNodes) {
        map.set(n.id, { oldX: n.x, oldY: n.y });
      }
      physicsOldRef.current = map;
    }
    if (rangePreviewEnabled) {
      rangeTimeRef.current = 0;
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
    const panX = studioPan.x;
    const panY = studioPan.y;
    const visibleLeft = centerX + panX - centerX / studioZoom;
    const visibleRight = centerX + panX + (canvas.width - centerX) / studioZoom;
    const visibleTop = centerY + panY - centerY / studioZoom;
    const visibleBottom = centerY + panY + (canvas.height - centerY) / studioZoom;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(studioZoom, studioZoom);
    ctx.translate(-centerX - panX, -centerY - panY);

    // Draw reference grid aligned to the anatomy origin (matches snap)
    const gridStartX =
      centerX + Math.floor((visibleLeft - centerX) / STUDIO_GRID_SIZE) * STUDIO_GRID_SIZE;
    const gridStartY =
      centerY + Math.floor((visibleTop - centerY) / STUDIO_GRID_SIZE) * STUDIO_GRID_SIZE;
    for (let x = gridStartX; x <= visibleRight; x += STUDIO_GRID_SIZE) {
      const rel = x - centerX;
      const isMajor =
        Math.abs(rel / STUDIO_GRID_MAJOR - Math.round(rel / STUDIO_GRID_MAJOR)) < 1e-6;
      ctx.strokeStyle = snapToGridEnabled
        ? isMajor
          ? '#64748b'
          : '#334155'
        : '#1e293b';
      ctx.lineWidth = (isMajor ? 1.25 : 1) / studioZoom;
      ctx.beginPath();
      ctx.moveTo(x, visibleTop);
      ctx.lineTo(x, visibleBottom);
      ctx.stroke();
    }
    for (let y = gridStartY; y <= visibleBottom; y += STUDIO_GRID_SIZE) {
      const rel = y - centerY;
      const isMajor =
        Math.abs(rel / STUDIO_GRID_MAJOR - Math.round(rel / STUDIO_GRID_MAJOR)) < 1e-6;
      ctx.strokeStyle = snapToGridEnabled
        ? isMajor
          ? '#64748b'
          : '#334155'
        : '#1e293b';
      ctx.lineWidth = (isMajor ? 1.25 : 1) / studioZoom;
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

    // Ground reference line (raised 2×6px above default bottom margin)
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 1.5 / studioZoom;
    ctx.setLineDash([D(4), D(4)]);
    ctx.beginPath();
    ctx.moveTo(visibleLeft, centerY);
    ctx.lineTo(visibleRight, centerY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f87171';
    ctx.font = `${D(9)}px ui-sans-serif, system-ui`;
    ctx.fillText(
      'GROUND (0 px)',
      visibleLeft + D(52),
      centerY - D(8)
    );

    const nodeIndexById = new Map(nodes.map((node, index) => [node.id, index]));
    const appearanceSkeleton = {
      id: 'studio-preview',
      nodes: nodes.map(node => {
        const old = physicsOldRef.current.get(node.id);
        return {
          x: centerX + node.x,
          y: centerY + node.y,
          radius: node.radius,
          id: node.id,
          ...(old ? { oldX: centerX + old.oldX, oldY: centerY + old.oldY } : {}),
        };
      }),
      muscles: muscles.map(muscle => ({
        nodeA: nodeIndexById.get(muscle.nodeA) ?? -1,
        nodeB: nodeIndexById.get(muscle.nodeB) ?? -1,
      })),
    };
    drawAppearance(ctx, appearanceSkeleton, appearance, 'behind');

    // --- DRAW STUDIO MUSCLES AND BONES ---
    const selectedLink = selectedMuscleId !== null
      ? muscles.find(m => m.id === selectedMuscleId)
      : undefined;
    const selectedLinkKind = selectedLink ? resolveLinkKind(selectedLink) : null;
    const rangeFocusActuatorId =
      selectedLinkKind === 'muscle' || selectedLinkKind === 'piston'
        ? selectedMuscleId
        : null;

    for (const muscle of appearance.hideSkeleton ? [] : muscles) {
      const nodeA = nodes.find(n => n.id === muscle.nodeA);
      const nodeB = nodes.find(n => n.id === muscle.nodeB);

      if (!nodeA || !nodeB) continue;

      const kind = resolveLinkKind(muscle);
      const ends = studioLinkEndpoints(muscle, nodes, muscles);
      if (!ends) continue;
      const xA = centerX + ends.xA;
      const yA = centerY + ends.yA;
      const xB = centerX + ends.xB;
      const yB = centerY + ends.yB;

      const isSelected = selectedMuscleId === muscle.id;
      const isRangeAnimating =
        rangePreviewEnabled &&
        kind !== 'bone' &&
        (rangeFocusActuatorId === null || muscle.id === rangeFocusActuatorId);
      const travelTint = isRangeAnimating
        ? rangeTravelTint(Math.hypot(xB - xA, yB - yA), muscle.originalLength)
        : null;
      const thickBoost = ((muscle.thickness ?? 1) - 1) * D(3);
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
          lineWidth: isSelected ? D(3.4) : D(2.4),
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
          Math.sqrt(Math.max(1, muscle.aeroArea ?? DEFAULT_AERO_AREA)) *
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
        ctx.lineWidth = D(1.2);
        ctx.stroke();
      }
      if (kind === 'piston') {
        drawPistonLink(ctx, sxA, syA, sxB, syB, isSelected, thickBoost, travelTint);
      } else if (kind === 'bone') {
        // Draw Solid Bone
        ctx.lineCap = 'round';
        ctx.strokeStyle = isSelected ? '#38bdf8' : '#1e293b';
        ctx.lineWidth = (isSelected ? D(9) : D(7)) + thickBoost;
        ctx.beginPath();
        ctx.moveTo(sxA, syA);
        ctx.lineTo(sxB, syB);
        ctx.stroke();

        ctx.strokeStyle = isSelected ? '#e0f2fe' : '#e2e8f0';
        ctx.lineWidth = (isSelected ? D(5) : D(3.5)) + thickBoost * 0.6;
        ctx.beginPath();
        ctx.moveTo(sxA, syA);
        ctx.lineTo(sxB, syB);
        ctx.stroke();
      } else {
        // Draw Flexible Muscle — line width reflects painted thickness
        let muscleColor = isSelected ? '#38bdf8' : '#64748b';
        if (travelTint === 'compress') muscleColor = '#22d3ee';
        else if (travelTint === 'expand') muscleColor = '#fb923c';
        else if (travelTint === 'mid') muscleColor = isSelected ? '#c4b5fd' : '#a78bfa';
        ctx.strokeStyle = muscleColor;
        ctx.lineWidth = (isSelected ? D(6) : D(4)) + thickBoost;
        ctx.beginPath();
        ctx.moveTo(sxA, syA);
        ctx.lineTo(sxB, syB);
        ctx.stroke();

        // Draw inner springs piston pattern
        ctx.strokeStyle = isSelected ? '#ffffff' : '#475569';
        ctx.lineWidth = D(1.5);
        ctx.beginPath();
        const dx = sxB - sxA;
        const dy = syB - syA;
        ctx.moveTo(sxA + dx * 0.3, syA + dy * 0.3);
        ctx.lineTo(sxB - dx * 0.3, syB - dy * 0.3);
        ctx.stroke();
      }

      ctx.restore();
    }

    // --- DRAW bone lever slots (add_muscle or selected levered muscle) ---
    const showLeverSlots =
      editorMode === 'add_muscle' ||
      (selectedMuscleId !== null &&
        !!muscles.find(m => m.id === selectedMuscleId && muscleHasLever(m)));
    if (showLeverSlots && !appearance.hideSkeleton) {
      ctx.save();
      for (const bone of muscles) {
        if (!isRigidBone(bone)) continue;
        for (const slot of LEVER_SLOT_ORDER) {
          const p = boneSlotWorldPos(bone, slot, nodes);
          if (!p) continue;
          ctx.beginPath();
          ctx.arc(centerX + p.x, centerY + p.y, D(3.5), 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(52, 211, 153, 0.55)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(6, 95, 70, 0.7)';
          ctx.lineWidth = D(1);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // --- DRAW Active link building line ---
    if (linkFromAnchor !== null && linkCursor &&
        (editorMode === 'add_muscle' || editorMode === 'add_bone' || editorMode === 'add_piston')) {
      const fromPos = studioAnchorWorldPos(linkFromAnchor, nodes, muscles);
      if (fromPos) {
        ctx.save();
        ctx.strokeStyle =
          editorMode === 'add_bone'
            ? '#f59e0b'
            : editorMode === 'add_piston'
              ? '#6366f1'
              : '#bef264';
        ctx.lineWidth = D(2.5);
        ctx.setLineDash([D(5), D(5)]);
        ctx.beginPath();
        ctx.arc(centerX + fromPos.x, centerY + fromPos.y, D(8), 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX + fromPos.x, centerY + fromPos.y);
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
      const isLinkSource =
        linkFromAnchor?.type === 'node' && linkFromAnchor.nodeId === node.id;
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
        ctx.lineWidth = isSelected ? D(3) : node.isMotorWheel ? D(2.5) : D(2);
        ctx.stroke();
        // Hub
        ctx.beginPath();
        ctx.arc(screenX, screenY, Math.max(D(0.2), node.radius * 0.28), 0, Math.PI * 2);
        ctx.fillStyle = node.isMotorWheel ? '#f59e0b' : node.color;
        ctx.fill();
        // Spokes
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = D(1.5);
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
          ctx.arc(screenX, screenY, Math.max(D(0.15), node.radius * 0.12), 0, Math.PI * 2);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
        }
        ctx.fillStyle = '#94a3b8';
        ctx.font = `bold ${creatureNodeLabelFontSize(node.radius)}px monospace`;
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
          ctx.lineWidth = D(3.5);
        } else if (isLinkSource) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = D(3.5);
        } else {
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = D(2);
        }
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${creatureNodeLabelFontSize(node.radius)}px monospace`;
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
          ctx.lineWidth = D(3.5);
        } else if (isLinkSource) {
          ctx.strokeStyle =
            editorMode === 'add_bone'
              ? '#f59e0b'
              : editorMode === 'add_piston'
                ? '#6366f1'
                : '#bef264';
          ctx.lineWidth = D(3.5);
        } else {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = D(1.5);
        }
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${creatureNodeLabelFontSize(node.radius)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${node.id}`, screenX, screenY);
      }

      if (node.isFoot && !node.isWheel) {
        ctx.beginPath();
        ctx.moveTo(screenX - node.radius * 0.85, screenY + node.radius * 0.55);
        ctx.lineTo(screenX + node.radius * 0.85, screenY + node.radius * 0.55);
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = D(2.5);
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
        ctx.lineWidth = D(2);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      ctx.restore();
    }

    drawAppearance(ctx, appearanceSkeleton, appearance, 'front');

    if (marquee) {
      const mx = Math.min(marquee.x0, marquee.x1);
      const my = Math.min(marquee.y0, marquee.y1);
      const mw = Math.abs(marquee.x1 - marquee.x0);
      const mh = Math.abs(marquee.y1 - marquee.y0);
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.25 / studioZoom;
      ctx.setLineDash([5 / studioZoom, 3 / studioZoom]);
      ctx.fillRect(centerX + mx, centerY + my, mw, mh);
      ctx.strokeRect(centerX + mx, centerY + my, mw, mh);
      ctx.restore();
    }

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
    const majorEvery = STUDIO_GRID_MAJOR;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let h = 0; h <= maxWorldHeight; h += STUDIO_GRID_SIZE) {
      const sy = centerY - (h + panY) * studioZoom;
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
    ctx.fillText(`${STUDIO_GRID_SIZE}px snap`, 4, 18);

  }, [nodes, muscles, solidSegments, appearance, selectedNodeId, selectedNodeIds, selectedMuscleId, editorMode, linkFromAnchor, linkCursor, dimensions, rangePreviewEnabled, snapToGridEnabled, studioZoom, studioPan, marquee]);

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
      x: (clickX - centerX) / studioZoom + studioPan.x,
      y: (clickY - centerY) / studioZoom + studioPan.y,
      centerX,
      centerY,
    };
  };

  const applyStudioZoomAt = (anchorX: number, anchorY: number, getNextZoom: (current: number) => number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const centerX = canvas.width / 2;
    const centerY = studioOriginY(canvas.height);
    setStudioZoom(currentZoom => {
      const clamped = Math.max(STUDIO_ZOOM_MIN, Math.min(STUDIO_ZOOM_MAX, getNextZoom(currentZoom)));
      if (clamped === currentZoom) return currentZoom;
      setStudioPan(p => ({
        x: p.x + (anchorX - centerX) * (1 / currentZoom - 1 / clamped),
        y: p.y + (anchorY - centerY) * (1 / currentZoom - 1 / clamped),
      }));
      return clamped;
    });
  };

  const boundAndMaybeSnap = (x: number, y: number, centerX: number, centerY: number, canvasH: number) => {
    const margin = 20 / studioZoom;
    const leftRulerPad = 52 / studioZoom; // keep nodes clear of the height ruler
    const minX = studioPan.x - (centerX - leftRulerPad) / studioZoom;
    const maxX = studioPan.x + (centerX - margin) / studioZoom;
    const minY = studioPan.y - (centerY - margin) / studioZoom;
    const maxY = studioPan.y + (canvasH - centerY - margin) / studioZoom;
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
    if (suppressCanvasClickRef.current) {
      suppressCanvasClickRef.current = false;
      return;
    }
    if (editorMode === 'paint') return;
    // Muscle/bone/piston linking is drag-driven (mousedown → mouseup)
    if (editorMode === 'add_muscle' || editorMode === 'add_bone' || editorMode === 'add_piston') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x: relativeX, y: relativeY, centerX, centerY } = clientToCanvas(event.clientX, event.clientY);

    // 1. Nodes are selected on mousedown (so shift multi-select is not
    // undone by a second toggle on click). Skip here.
    for (const node of nodes) {
      const dx = node.x - relativeX;
      const dy = node.y - relativeY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < node.radius + D(6)) {
        return;
      }
    }

    // 2. Check if clicking an existing muscle / bone / piston (visible segment)
    let clickedMuscle: StudioMuscle | null = null;
    let minLineDist = STUDIO_LINK_HIT_SLACK;

    for (const m of muscles) {
      const dist = studioLinkHitDistance(m, relativeX, relativeY, nodes, muscles);
      if (dist === null) continue;
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
        mass: DEFAULT_NODE_MASS,
        radius: DEFAULT_NODE_RADIUS,
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

      pushUndoCheckpoint();
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
      if (Math.sqrt(dx * dx + dy * dy) < node.radius + D(6)) return node;
    }
    return null;
  };

  const findBoneSlotAt = (
    relativeX: number,
    relativeY: number
  ): { boneId: number; slot: MuscleLeverSlot } | null => {
    const hitR = D(8);
    let best: { boneId: number; slot: MuscleLeverSlot } | null = null;
    let bestD = hitR;
    for (const bone of muscles) {
      if (!isRigidBone(bone)) continue;
      for (const slot of LEVER_SLOT_ORDER) {
        const p = boneSlotWorldPos(bone, slot, nodes);
        if (!p) continue;
        const d = Math.hypot(p.x - relativeX, p.y - relativeY);
        if (d < bestD) {
          bestD = d;
          best = { boneId: bone.id, slot };
        }
      }
    }
    return best;
  };

  const tryCreateLinkFromAnchors = (from: StudioLinkAnchor, to: StudioLinkAnchor) => {
    const fromPos = studioAnchorWorldPos(from, nodes, muscles);
    const toPos = studioAnchorWorldPos(to, nodes, muscles);
    if (!fromPos || !toPos) return;

    const fromHasLever = from.type === 'lever';
    const toHasLever = to.type === 'lever';
    const usesLever = fromHasLever || toHasLever;

    let fromId: number;
    let toId: number;
    if (from.type === 'node') fromId = from.nodeId;
    else {
      const bone = muscles.find(m => m.id === from.boneId);
      if (!bone) return;
      fromId = leverTipNodeId(bone, from.slot);
    }
    if (to.type === 'node') toId = to.nodeId;
    else {
      const bone = muscles.find(m => m.id === to.boneId);
      if (!bone) return;
      toId = leverTipNodeId(bone, to.slot);
    }

    if (from.type === 'node' && to.type === 'node' && fromId === toId) return;
    if (
      from.type === 'lever' &&
      to.type === 'lever' &&
      from.boneId === to.boneId &&
      from.slot === to.slot
    ) {
      return;
    }

    const pairMates = usesLever
      ? []
      : muscles.filter(
          m =>
            (m.nodeA === fromId && m.nodeB === toId) ||
            (m.nodeA === toId && m.nodeB === fromId)
        );
    const addingKind: MuscleLinkKind =
      editorMode === 'add_bone'
        ? 'bone'
        : editorMode === 'add_piston'
          ? 'piston'
          : 'muscle';
    const addingHard = addingKind === 'bone' || addingKind === 'piston';

    if (usesLever && addingHard) {
      alert('Bones and pistons attach to nodes only. Use Add Muscle to snap onto bone slots.');
      return;
    }

    if (!usesLever) {
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
              : 'A soft muscle already exists between these two nodes. Add a bone/piston instead, or remove the muscle.'
          );
          return;
        }
      }
    }

    const dist = Math.round(Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y)) || 5;
    const newId = muscles.length > 0 ? Math.max(...muscles.map(m => m.id)) + 1 : 0;

    if (addingHard) {
      let minLength = dist;
      let maxLength = dist;
      let linkKind: MuscleLinkKind = addingKind === 'bone' ? 'bone' : 'piston';
      if (addingKind === 'piston') {
        maxLength = clampLinkLength(Math.round(dist * 1.3));
        minLength = clampLinkLength(Math.min(Math.round(dist * 0.7), maxLength));
      }
      // Hard onto existing soft → variable hard slaved to soft range.
      if (pairMates.length === 1 && resolveLinkKind(pairMates[0]) === 'muscle') {
        maxLength = clampLinkLength(pairMates[0].maxLength);
        minLength = clampLinkLength(Math.min(pairMates[0].minLength, maxLength));
        linkKind = 'piston';
      }
      const pistonSeed =
        linkKind === 'piston' ? defaultPistonRatesForStroke(minLength, maxLength) : null;
      const newBone: StudioMuscle = {
        id: newId,
        nodeA: fromId,
        nodeB: toId,
        originalLength:
          linkKind === 'piston' ? restingLengthFromMaxExpansion(maxLength) : dist,
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
      pushUndoCheckpoint();
      setMuscles(prev => [...prev, newBone]);
      setSelectedMuscleId(newId);
      setSelectedNodeId(null);
      return;
    }

    // Soft muscle — optionally promote a parallel fixed bone to piston (node-node only).
    const membership = solidMembership(solidSegments);
    if (!usesLever && isLinkWhollyInsideSolid(fromId, toId, membership)) {
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
      ...(from.type === 'lever'
        ? { leverBoneA: from.boneId, leverSlotA: from.slot }
        : {}),
      ...(to.type === 'lever'
        ? { leverBoneB: to.boneId, leverSlotB: to.slot }
        : {}),
    };
    pushUndoCheckpoint();
    setMuscles(prev => {
      if (usesLever) return [...prev, newMuscle];
      const next = prev.map(m => {
        if (!sameUnorderedNodePair(m, newMuscle) || !isHardLengthConstraint(m)) return m;
        const rates = defaultPistonRatesForStroke(softMin, softMax);
        return {
          ...m,
          linkKind: 'piston' as const,
          minLength: softMin,
          maxLength: softMax,
          originalLength: softRest,
          strength: 1.0,
          extendRate: rates.extendRate,
          retractRate: rates.retractRate,
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

    if (editorMode === 'paint') {
      isPaintingRef.current = true;
      paintMuscleAtPoint(relativeX, relativeY);
      return;
    }

    const hitNode = findNodeAt(relativeX, relativeY);

    if (editorMode === 'add_muscle' || editorMode === 'add_bone' || editorMode === 'add_piston') {
      if (hitNode) {
        setLinkFromAnchor({ type: 'node', nodeId: hitNode.id });
        setLinkCursor({ x: relativeX, y: relativeY });
        selectSingleNode(hitNode.id);
        return;
      }
      if (editorMode === 'add_muscle') {
        const slotHit = findBoneSlotAt(relativeX, relativeY);
        if (slotHit) {
          setLinkFromAnchor({ type: 'lever', boneId: slotHit.boneId, slot: slotHit.slot });
          setLinkCursor({ x: relativeX, y: relativeY });
          setSelectedMuscleId(null);
          clearNodeSelection();
          return;
        }
      }
    }

    // Find if clicking inside node (select / drag)
    if (hitNode) {
      if (event.shiftKey) {
        // Shift is multi-select only — do not start a drag.
        toggleNodeInSelection(hitNode.id);
        return;
      }

      let seedIds: number[];
      if (selectedNodeIds.includes(hitNode.id) && selectedNodeIds.length > 1) {
        seedIds = selectedNodeIds;
        setSelectedNodeId(hitNode.id);
        setSelectedMuscleId(null);
      } else {
        seedIds = [hitNode.id];
        selectSingleNode(hitNode.id);
      }

      // Drag solid plates (and multi-selections that touch them) as rigid groups.
      const groupIds = expandIdsWithSolids(seedIds, solidSegments);

      isDraggingRef.current = true;
      dragNodeIdRef.current = hitNode.id;
      dragGroupIdsRef.current = groupIds;
      const origins = new Map<number, { x: number; y: number }>();
      for (const n of nodes) {
        if (groupIds.has(n.id)) origins.set(n.id, { x: n.x, y: n.y });
      }
      dragOriginRef.current = origins;
      dragLatestPosRef.current = new Map(origins);
      dragCursorStartRef.current = { x: relativeX, y: relativeY };
      // Capture pre-drag pose once; first move shares this undo step.
      pushUndoCheckpoint();

      if (physicsEnabled) {
        for (const id of groupIds) {
          const origin = origins.get(id);
          if (!origin) continue;
          const old = physicsOldRef.current.get(id);
          if (old) {
            old.oldX = origin.x;
            old.oldY = origin.y;
          } else {
            physicsOldRef.current.set(id, { oldX: origin.x, oldY: origin.y });
          }
        }
      }
      return;
    }

    // Empty-space drag box in Select mode
    if (editorMode === 'select') {
      marqueeActiveRef.current = true;
      marqueeAdditiveRef.current = event.shiftKey;
      const box = { x0: relativeX, y0: relativeY, x1: relativeX, y1: relativeY };
      marqueeRef.current = box;
      setMarquee(box);
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

    if (linkFromAnchor !== null) {
      setLinkCursor({ x: relativeX, y: relativeY });
      return;
    }

    if (marqueeActiveRef.current) {
      setMarquee(prev => {
        if (!prev) return prev;
        const next = { ...prev, x1: relativeX, y1: relativeY };
        marqueeRef.current = next;
        return next;
      });
      return;
    }

    if (!isDraggingRef.current || dragNodeIdRef.current === null) return;

    const groupIds = dragGroupIdsRef.current;
    const origins = dragOriginRef.current;
    const cursorStart = dragCursorStartRef.current;

    // Multi-node / solid rigid drag: translate the whole group by cursor delta.
    if (groupIds && origins && cursorStart && groupIds.size > 0) {
      const rawDx = relativeX - cursorStart.x;
      const rawDy = relativeY - cursorStart.y;
      const primaryOrigin = origins.get(dragNodeIdRef.current);
      if (!primaryOrigin) return;

      const { x: boundedPrimaryX, y: boundedPrimaryY } = boundAndMaybeSnap(
        primaryOrigin.x + rawDx,
        primaryOrigin.y + rawDy,
        centerX,
        centerY,
        canvas.height
      );
      const dx = boundedPrimaryX - primaryOrigin.x;
      const dy = boundedPrimaryY - primaryOrigin.y;

      const nextPos = new Map<number, { x: number; y: number }>();
      for (const [id, origin] of origins) {
        nextPos.set(id, { x: origin.x + dx, y: origin.y + dy });
      }
      dragLatestPosRef.current = nextPos;

      setNodes(prev =>
        prev.map(n => {
          const p = nextPos.get(n.id);
          return p ? { ...n, x: p.x, y: p.y } : n;
        })
      );

      if (physicsEnabled) {
        for (const [id, p] of nextPos) {
          const old = physicsOldRef.current.get(id);
          if (old) {
            old.oldX = p.x;
            old.oldY = p.y;
          } else {
            physicsOldRef.current.set(id, { oldX: p.x, oldY: p.y });
          }
        }
        return; // don't rewrite rest lengths while simulating
      }

      // Auto-update lengths of muscles that touch the moved group
      setMuscles(prev =>
        prev.map(m => {
          if (!groupIds.has(m.nodeA) && !groupIds.has(m.nodeB)) return m;
          // Pure rigid translate of both ends keeps length — skip.
          if (groupIds.has(m.nodeA) && groupIds.has(m.nodeB)) return m;

          const nodeA = nodes.find(n => n.id === m.nodeA);
          const nodeB = nodes.find(n => n.id === m.nodeB);
          if (!nodeA || !nodeB) return m;

          const aPos = nextPos.get(m.nodeA) ?? nodeA;
          const bPos = nextPos.get(m.nodeB) ?? nodeB;
          const newLength =
            Math.round(Math.hypot(bPos.x - aPos.x, bPos.y - aPos.y)) || 5;
          const kind = resolveLinkKind(m);
          if (kind === 'bone') {
            return {
              ...m,
              originalLength: newLength,
              minLength: newLength,
              maxLength: newLength,
            };
          }
          if (kind === 'piston') {
            const maxLength = clampLinkLength(Math.round(newLength * 1.3));
            const minLength = clampLinkLength(
              Math.min(Math.round(newLength * 0.7), maxLength)
            );
            const rates = defaultPistonRatesForStroke(minLength, maxLength);
            return {
              ...m,
              originalLength: restingLengthFromMaxExpansion(maxLength),
              minLength,
              maxLength,
              extendRate: rates.extendRate,
              retractRate: rates.retractRate,
            };
          }
          const maxLength = clampLinkLength(Math.round(newLength * 1.4));
          const minLength = clampLinkLength(
            Math.min(Math.round(newLength * 0.6), maxLength)
          );
          return {
            ...m,
            originalLength: restingLengthFromMaxExpansion(maxLength),
            minLength,
            maxLength,
          };
        })
      );
      return;
    }

    const { x: boundedX, y: boundedY } = boundAndMaybeSnap(
      relativeX,
      relativeY,
      centerX,
      centerY,
      canvas.height
    );

    setNodes(prev =>
      prev.map(n =>
        n.id === dragNodeIdRef.current ? { ...n, x: boundedX, y: boundedY } : n
      )
    );

    if (physicsEnabled) {
      const old = physicsOldRef.current.get(dragNodeIdRef.current);
      if (old) {
        old.oldX = boundedX;
        old.oldY = boundedY;
      }
      return;
    }

    setMuscles(prev =>
      prev.map(m => {
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
            if (kind === 'piston') {
              const maxLength = clampLinkLength(Math.round(newLength * 1.3));
              const minLength = clampLinkLength(
                Math.min(Math.round(newLength * 0.7), maxLength)
              );
              const rates = defaultPistonRatesForStroke(minLength, maxLength);
              return {
                ...m,
                originalLength: restingLengthFromMaxExpansion(maxLength),
                minLength,
                maxLength,
                extendRate: rates.extendRate,
                retractRate: rates.retractRate,
              };
            }
            {
              const maxLength = clampLinkLength(Math.round(newLength * 1.4));
              const minLength = clampLinkLength(
                Math.min(Math.round(newLength * 0.6), maxLength)
              );
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
      })
    );
  };

  const finishMarqueeSelection = () => {
    const box = marqueeRef.current;
    if (!marqueeActiveRef.current || !box) {
      marqueeActiveRef.current = false;
      marqueeRef.current = null;
      setMarquee(null);
      return;
    }
    const { x0, y0, x1, y1 } = box;
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const draggedFarEnough =
      Math.hypot(x1 - x0, y1 - y0) > 3 / Math.max(1, studioZoom);

    marqueeActiveRef.current = false;
    marqueeRef.current = null;
    setMarquee(null);

    if (!draggedFarEnough) {
      // Tiny click — let the canvas click handler deselect / pick muscles.
      return;
    }

    suppressCanvasClickRef.current = true;
    const hits = nodes
      .filter(n => n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY)
      .map(n => n.id);

    if (marqueeAdditiveRef.current) {
      setSelectedNodeIds(prev => {
        const merged = [...prev];
        for (const id of hits) {
          if (!merged.includes(id)) merged.push(id);
        }
        setSelectedNodeId(merged.length ? merged[merged.length - 1] : null);
        return merged;
      });
      if (hits.length > 0) setSelectedMuscleId(null);
    } else if (hits.length > 0) {
      setSelectedNodeIds(hits);
      setSelectedNodeId(hits[hits.length - 1]);
      setSelectedMuscleId(null);
    } else {
      clearNodeSelection();
      setSelectedMuscleId(null);
    }
  };

  const handleMouseUpOrLeave = (event?: React.MouseEvent<HTMLCanvasElement>) => {
    if (marqueeActiveRef.current) {
      finishMarqueeSelection();
    }

    if (linkFromAnchor !== null && event && event.type === 'mouseup') {
      const { x: relativeX, y: relativeY } = clientToCanvas(event.clientX, event.clientY);
      const hitNode = findNodeAt(relativeX, relativeY);
      let toAnchor: StudioLinkAnchor | null = null;
      if (hitNode) {
        toAnchor = { type: 'node', nodeId: hitNode.id };
      } else if (editorMode === 'add_muscle') {
        const slotHit = findBoneSlotAt(relativeX, relativeY);
        if (slotHit) {
          toAnchor = { type: 'lever', boneId: slotHit.boneId, slot: slotHit.slot };
        }
      }
      if (toAnchor) {
        tryCreateLinkFromAnchors(linkFromAnchor, toAnchor);
      }
    }

    const wasDragging = isDraggingRef.current;
    const draggedGroup = dragGroupIdsRef.current;
    const latestDragPos = dragLatestPosRef.current;
    const dragOrigins = dragOriginRef.current;

    setLinkFromAnchor(null);
    setLinkCursor(null);
    isDraggingRef.current = false;
    dragNodeIdRef.current = null;
    dragGroupIdsRef.current = null;
    dragOriginRef.current = null;
    dragCursorStartRef.current = null;
    dragLatestPosRef.current = null;
    isPaintingRef.current = false;

    if (wasDragging) {
      // Prefer the last drag positions — React state may not have flushed yet.
      const poseNodes =
        latestDragPos && latestDragPos.size > 0
          ? nodesRef.current.map(n => {
              const p = latestDragPos.get(n.id);
              return p ? { ...n, x: p.x, y: p.y } : n;
            })
          : nodesRef.current;
      // Drop the pre-drag undo entry if the pointer never moved the group.
      if (dragOrigins && latestDragPos) {
        let moved = false;
        for (const [id, origin] of dragOrigins) {
          const p = latestDragPos.get(id);
          if (!p || Math.hypot(p.x - origin.x, p.y - origin.y) > 0.05) {
            moved = true;
            break;
          }
        }
        if (!moved && undoStackRef.current.length > 0) {
          undoStackRef.current.pop();
        }
      }
      // Solid rest pose must match the authored positions after a plate move,
      // otherwise the next physics frame shape-matches against stale offsets.
      refreshSolidRestOffsets(solidsRef.current, poseNodes);
      if (physicsEnabled && draggedGroup) {
        for (const n of poseNodes) {
          if (!draggedGroup.has(n.id)) continue;
          physicsOldRef.current.set(n.id, { oldX: n.x, oldY: n.y });
        }
      }
    }
    endUndoGesture();
  };

  // Node editing handlers
  const handleUpdateNodeProp = (prop: keyof StudioNode, value: any) => {
    if (selectedNodeId === null) return;
    ensureUndoGestureCheckpoint();
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
    ensureUndoGestureCheckpoint();
    setMuscles(prev => prev.map(m => {
      if (m.id !== selectedMuscleId) return m;

      // Compression / expansion extremes: independent 1–100px ranges.
      // Only cross-adjust when compression would exceed expansion.
      // Resting length stays where the user set it, clamped into the new span.
      if (prop === 'minLength') {
        const minLength = clampLinkLength(value);
        const maxLength = clampLinkLength(Math.max(m.maxLength, minLength));
        const finalMin = Math.min(minLength, maxLength);
        return {
          ...m,
          minLength: finalMin,
          maxLength,
          originalLength: clampRestingLength(m.originalLength, finalMin, maxLength),
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
          originalLength: clampRestingLength(m.originalLength, minLength, finalMax),
        };
      }
      if (prop === 'originalLength') {
        return {
          ...m,
          originalLength: clampRestingLength(value, m.minLength, m.maxLength),
        };
      }
      if (prop === 'extendRate' || prop === 'retractRate') {
        return { ...m, [prop]: clampPistonRate(value) };
      }
      if (prop === 'softMaxDeltaPerTick') {
        if (value === undefined || value === null) {
          const { softMaxDeltaPerTick: _drop, ...rest } = m;
          return rest;
        }
        if (typeof value === 'number' && value <= 0) {
          return { ...m, softMaxDeltaPerTick: 0 };
        }
        return { ...m, softMaxDeltaPerTick: clampSoftMuscleRate(value) };
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

  /**
   * Clone the current node selection (plus fully-contained muscles/solids/skin)
   * with an optional horizontal mirror across the creature's center X.
   */
  const cloneSelection = (opts: { mirror: boolean }) => {
    const seedIds =
      selectedNodeIds.length > 0
        ? selectedNodeIds
        : selectedNodeId !== null
          ? [selectedNodeId]
          : [];
    if (seedIds.length === 0) {
      alert('Select one or more nodes to duplicate.');
      return;
    }
    pushUndoCheckpoint();

    const selected = new Set(seedIds);
    const sourceNodes = nodes.filter(n => selected.has(n.id));
    if (sourceNodes.length === 0) return;

    let axisX = 0;
    if (opts.mirror) {
      if (nodes.length > 0) {
        axisX = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
      }
    }
    const offsetX = opts.mirror ? 0 : STUDIO_GRID_MAJOR * 2;

    let nextNodeId = nodes.length > 0 ? Math.max(...nodes.map(n => n.id)) + 1 : 0;
    let nextMuscleId = muscles.length > 0 ? Math.max(...muscles.map(m => m.id)) + 1 : 0;

    const nodeIdMap = new Map<number, number>();
    const nodeIndexMap = new Map<number, number>(); // old array index → new array index
    const newNodes: StudioNode[] = [];
    const baseNodeCount = nodes.length;

    nodes.forEach((n, oldIndex) => {
      if (!selected.has(n.id)) return;
      const newId = nextNodeId++;
      nodeIdMap.set(n.id, newId);
      const newIndex = baseNodeCount + newNodes.length;
      nodeIndexMap.set(oldIndex, newIndex);
      const x = opts.mirror ? 2 * axisX - n.x : n.x + offsetX;
      newNodes.push({ ...n, id: newId, x, y: n.y });
    });

    const muscleIdMap = new Map<number, number>();
    const muscleIndexMap = new Map<number, number>(); // old array index → new array index
    const baseMuscleCount = muscles.length;
    const newMuscles: StudioMuscle[] = [];

    muscles.forEach((m, oldIndex) => {
      if (!selected.has(m.nodeA) || !selected.has(m.nodeB)) return;
      const newId = nextMuscleId++;
      muscleIdMap.set(m.id, newId);
      muscleIndexMap.set(oldIndex, baseMuscleCount + newMuscles.length);
      let clone: StudioMuscle = {
        ...m,
        id: newId,
        nodeA: nodeIdMap.get(m.nodeA)!,
        nodeB: nodeIdMap.get(m.nodeB)!,
      };
      if (opts.mirror) {
        if (clone.leverSlotA !== undefined) {
          clone = { ...clone, leverSlotA: flipLeverSlot(clone.leverSlotA) };
        }
        if (clone.leverSlotB !== undefined) {
          clone = { ...clone, leverSlotB: flipLeverSlot(clone.leverSlotB) };
        }
      }
      newMuscles.push(clone);
    });

    // Remap lever host bone ids onto the cloned muscles when both ends were copied.
    for (let i = 0; i < newMuscles.length; i++) {
      const m = newMuscles[i];
      let next = m;
      if (m.leverBoneA !== undefined) {
        const mapped = muscleIdMap.get(m.leverBoneA);
        if (mapped !== undefined) {
          next = { ...next, leverBoneA: mapped };
        } else {
          const { leverBoneA: _a, leverSlotA: _sa, ...rest } = next;
          next = rest;
        }
      }
      if (m.leverBoneB !== undefined) {
        const mapped = muscleIdMap.get(m.leverBoneB);
        if (mapped !== undefined) {
          next = { ...next, leverBoneB: mapped };
        } else {
          const { leverBoneB: _b, leverSlotB: _sb, ...rest } = next;
          next = rest;
        }
      }
      newMuscles[i] = next;
    }

    const nextSolids = [...solidSegments];
    for (const solid of solidSegments) {
      if (!solid.nodeIds.every(id => selected.has(id))) continue;
      nextSolids.push({
        id: newSolidId(nextSolids),
        nodeIds: solid.nodeIds.map(id => nodeIdMap.get(id)!),
      });
    }

    const clonedAppearance: AppearancePrimitive[] = [];
    for (const part of appearance.primitives) {
      const anchoredNode =
        part.anchorNode !== undefined && nodeIndexMap.has(part.anchorNode);
      const anchoredMuscle =
        part.anchorMuscle !== undefined && muscleIndexMap.has(part.anchorMuscle);
      const weighted =
        part.points?.some(p =>
          p.weights?.some(w => muscleIndexMap.has(w.muscle))
        ) ?? false;
      if (!anchoredNode && !anchoredMuscle && !weighted) continue;

      const id = `${part.id}-clone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      let clone: AppearancePrimitive = {
        ...part,
        id,
        points: part.points.map(p => ({
          ...p,
          x: opts.mirror && part.anchorNode !== undefined ? -p.x : p.x,
          weights: p.weights?.map(w => ({
            ...w,
            muscle: muscleIndexMap.get(w.muscle) ?? w.muscle,
            x: opts.mirror && w.x !== undefined ? -w.x : w.x,
          })),
        })),
      };
      if (part.anchorNode !== undefined && nodeIndexMap.has(part.anchorNode)) {
        clone.anchorNode = nodeIndexMap.get(part.anchorNode);
      }
      if (part.anchorMuscle !== undefined && muscleIndexMap.has(part.anchorMuscle)) {
        clone.anchorMuscle = muscleIndexMap.get(part.anchorMuscle);
      }
      if (opts.mirror) {
        clone.mirror = !part.mirror;
        if (clone.points[2]) {
          clone.points[2] = { ...clone.points[2], x: -clone.points[2].x };
        }
        if (
          part.anchorMuscle !== undefined &&
          clone.points[0] &&
          !part.boneAlign &&
          !part.boneStretch
        ) {
          // Lateral offset on link-anchored parts.
          clone.points[0] = { ...clone.points[0], y: -clone.points[0].y };
        }
      }
      clonedAppearance.push(clone);
    }

    const allNodes = [...nodes, ...newNodes];
    const allMuscles = [...muscles, ...newMuscles];
    const normalizedSolids = normalizeSolidSegments(nextSolids);

    setNodes(allNodes);
    setMuscles(allMuscles);
    setSolidSegments(normalizedSolids);
    refreshSolidRestOffsets(normalizedSolids, allNodes);
    if (clonedAppearance.length > 0) {
      setAppearance(current => ({
        ...current,
        primitives: [...current.primitives, ...clonedAppearance],
      }));
    }

    const newIds = newNodes.map(n => n.id);
    setSelectedNodeIds(newIds);
    setSelectedNodeId(newIds.length ? newIds[newIds.length - 1] : null);
    setSelectedMuscleId(null);

    if (physicsEnabled) {
      for (const n of newNodes) {
        physicsOldRef.current.set(n.id, { oldX: n.x, oldY: n.y });
      }
    }
  };

  const handleDuplicateSelection = () => cloneSelection({ mirror: false });
  const handleMirrorSelection = () => cloneSelection({ mirror: true });
  const duplicateSelectionRef = useRef(handleDuplicateSelection);
  const mirrorSelectionRef = useRef(handleMirrorSelection);
  const deleteSelectionRef = useRef(() => {});
  const undoStudioRef = useRef(undoStudio);
  duplicateSelectionRef.current = handleDuplicateSelection;
  mirrorSelectionRef.current = handleMirrorSelection;
  undoStudioRef.current = undoStudio;

  const handleDeleteSelected = () => {
    if (selectedNodeIds.length > 1) {
      pushUndoCheckpoint();
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
      pushUndoCheckpoint();
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
      pushUndoCheckpoint();
      const muscleIndex = muscles.findIndex(muscle => muscle.id === selectedMuscleId);
      reindexAppearanceAfterDelete(null, muscleIndex >= 0 ? [muscleIndex] : []);
      const removedId = selectedMuscleId;
      setMuscles(prev =>
        prev
          .filter(m => m.id !== removedId)
          .map(m => {
            let next = m;
            if (m.leverBoneA === removedId) {
              const { leverBoneA: _a, leverSlotA: _sa, ...rest } = next;
              next = rest;
            }
            if (m.leverBoneB === removedId) {
              const { leverBoneB: _b, leverSlotB: _sb, ...rest } = next;
              next = rest;
            }
            return next;
          })
      );
      setSelectedMuscleId(null);
    } else if (selectedSkinPartId !== null) {
      pushUndoCheckpoint();
      const removedId = selectedSkinPartId;
      setAppearance(current => ({
        ...current,
        primitives: current.primitives.filter(part => part.id !== removedId),
      }));
      setSelectedSkinPartId(null);
    }
  };

  deleteSelectionRef.current = handleDeleteSelected;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable
      ) {
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoStudioRef.current();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const hasSelection =
          selectedNodeIdRef.current !== null ||
          selectedNodeIdsRef.current.length > 0 ||
          selectedMuscleIdRef.current !== null ||
          selectedSkinPartIdRef.current !== null;
        if (!hasSelection) return;
        event.preventDefault();
        deleteSelectionRef.current();
        return;
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelectionRef.current();
        return;
      }
      if (mod && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        mirrorSelectionRef.current();
      }
    };
    const onPointerUp = () => endUndoGesture();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

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
        mass: clampNodeMass(n.mass),
        radius: clampNodeRadius(n.radius),
        friction: n.isWheel ? 0.05 : n.friction,
        color: n.color,
        isWheel: !!n.isWheel,
        isMotorWheel: !!(n.isWheel && n.isMotorWheel),
        motorPower: n.isMotorWheel
          ? clampMotorPower(n.motorPower ?? DEFAULT_MOTOR_POWER)
          : undefined,
        isFoot: !n.isWheel && !!n.isFoot,
        isHingeStop: !!n.isHingeStop,
      };
    });

    const muscleIdToIndex = new Map(muscles.map((m, i) => [m.id, i]));
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
      const softCap =
        kind === 'muscle' && typeof m.softMaxDeltaPerTick === 'number'
          ? m.softMaxDeltaPerTick <= 0
            ? 0
            : clampSoftMuscleRate(m.softMaxDeltaPerTick)
          : undefined;
      const leverAIdx =
        kind === 'muscle' && m.leverBoneA !== undefined
          ? muscleIdToIndex.get(m.leverBoneA)
          : undefined;
      const leverBIdx =
        kind === 'muscle' && m.leverBoneB !== undefined
          ? muscleIdToIndex.get(m.leverBoneB)
          : undefined;
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
        ...(softCap !== undefined ? { softMaxDeltaPerTick: softCap } : {}),
        ...(leverAIdx !== undefined && isValidLeverSlot(m.leverSlotA)
          ? { leverBoneA: leverAIdx, leverSlotA: m.leverSlotA }
          : {}),
        ...(leverBIdx !== undefined && isValidLeverSlot(m.leverSlotB)
          ? { leverBoneB: leverBIdx, leverSlotB: m.leverSlotB }
          : {}),
        aeroType: m.aeroType && m.aeroType !== 'none' ? m.aeroType : undefined,
        aeroArea:
          m.aeroType && m.aeroType !== 'none'
            ? clampAeroArea(
                m.aeroArea ??
                  (m.aeroType === 'parachute' ? DEFAULT_PARACHUTE_AREA : DEFAULT_AERO_AREA)
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
      ...(softMuscleMaxDeltaPerTick !== undefined && softMuscleMaxDeltaPerTick > 0
        ? { softMuscleMaxDeltaPerTick: clampSoftMuscleRate(softMuscleMaxDeltaPerTick) }
        : {}),
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
  }, [nodes, muscles, solidSegments, creatureName, appearance, softMuscleMaxDeltaPerTick]);

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

          {/* Add Piston Mode */}
          <button
            type="button"
            onClick={() => { setEditorMode('add_piston'); resetToolSources(); }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
              editorMode === 'add_piston'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
            title="Hard variable-length strut with authorable compression and expansion rates"
          >
            <Gauge className="w-3.5 h-3.5" /> Piston
          </button>

          {/* Solid plate — compound rigid body */}
          <button
            type="button"
            onClick={handleLockSolid}
            className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 bg-white text-slate-700 hover:bg-amber-50 border-amber-200"
            title="Lock selected nodes (box-select or Shift+click ≥3) into a rigid solid plate. Soft muscles inside are removed."
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
            title={
              snapToGridEnabled
                ? `Snap to grid ON — nodes lock to ${STUDIO_GRID_SIZE}px world cells`
                : 'Snap to grid OFF — free placement'
            }
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
            title={
              physicsEnabled
                ? 'Stop physics and restore the static pose from before preview'
                : 'Run Verlet physics preview (restores static pose when stopped)'
            }
          >
            {physicsEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            Physics
          </button>

          {/* Muscle / piston range expand/compress loop */}
          <button
            type="button"
            onClick={toggleRangePreview}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
              rangePreviewEnabled
                ? 'bg-violet-600 text-white border-violet-600 ring-2 ring-violet-300'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
            title={
              selectedMuscleId !== null &&
              activeMuscle &&
              resolveLinkKind(activeMuscle) !== 'bone'
                ? `Preview only ${resolveLinkKind(activeMuscle) === 'piston' ? 'piston' : 'muscle'} #${activeMuscle.id} min ↔ max`
                : 'Slow loop through each muscle/piston min ↔ max (select one to preview just that link)'
            }
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

          {/* Duplicate / Mirror / Delete */}
          {(selectedNodeId !== null || selectedNodeIds.length > 0) && (
            <>
              <button
                type="button"
                onClick={handleDuplicateSelection}
                className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 flex items-center gap-1.5 ml-auto"
                title="Duplicate selected nodes, links, and solid plates (Ctrl+D)"
                id="studio-duplicate-btn"
              >
                <Copy className="w-3.5 h-3.5" /> Duplicate
              </button>
              <button
                type="button"
                onClick={handleMirrorSelection}
                className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer bg-white text-slate-700 hover:bg-indigo-50 border border-indigo-200 flex items-center gap-1.5"
                title="Mirror-duplicate selection across the creature center (for symmetrical limbs)"
                id="studio-mirror-btn"
              >
                <FlipHorizontal className="w-3.5 h-3.5" /> Mirror
              </button>
            </>
          )}
          {(selectedNodeId !== null ||
            selectedNodeIds.length > 0 ||
            selectedMuscleId !== null ||
            selectedSkinPartId !== null) && (
            <button
              type="button"
              onClick={handleDeleteSelected}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 flex items-center gap-1.5 ${
                selectedNodeId === null && selectedNodeIds.length === 0 ? 'ml-auto' : ''
              }`}
              title="Delete the selected node, link, or skin part (Delete / Backspace)"
              id="studio-delete-selected-btn"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected
            </button>
          )}
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
              const canvas = canvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.width / Math.max(1, rect.width);
              const scaleY = canvas.height / Math.max(1, rect.height);
              const mouseX = (event.clientX - rect.left) * scaleX;
              const mouseY = (event.clientY - rect.top) * scaleY;
              const direction = event.deltaY > 0 ? -1 : 1;
              applyStudioZoomAt(mouseX, mouseY, current => current + direction * STUDIO_ZOOM_STEP);
            }}
            onContextMenu={e => e.preventDefault()}
            className={`block w-full h-full touch-none ${
              editorMode === 'paint' ? 'cursor-cell' : 'cursor-crosshair'
            }`}
            id="studio-canvas"
          />

          <div className="absolute bottom-3 left-3 flex items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950/90 text-slate-100 shadow-lg">
            <button
              type="button"
              aria-label="Zoom out creature canvas"
              title="Zoom out"
              disabled={studioZoom <= STUDIO_ZOOM_MIN}
              onClick={() => {
                const canvas = canvasRef.current;
                const anchorX = canvas ? canvas.width / 2 : 0;
                const anchorY = canvas ? studioOriginY(canvas.height) : 0;
                applyStudioZoomAt(anchorX, anchorY, current => current - STUDIO_ZOOM_STEP);
              }}
              className="border-r border-slate-700 p-2 hover:bg-slate-800 disabled:opacity-35"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Reset creature canvas zoom"
              title="Reset zoom"
              onClick={() => {
                setStudioPan({ x: 0, y: 0 });
                setStudioZoom(STUDIO_ZOOM_DEFAULT);
              }}
              className="min-w-14 px-2 py-2 text-[11px] font-bold tabular-nums hover:bg-slate-800"
            >
              {Math.round(studioZoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="Zoom in creature canvas"
              title="Zoom in"
              disabled={studioZoom >= STUDIO_ZOOM_MAX}
              onClick={() => {
                const canvas = canvasRef.current;
                const anchorX = canvas ? canvas.width / 2 : 0;
                const anchorY = canvas ? studioOriginY(canvas.height) : 0;
                applyStudioZoomAt(anchorX, anchorY, current => current + STUDIO_ZOOM_STEP);
              }}
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
                : 'Drag a box to select · Shift+click / Shift+box to add · Solid / Duplicate / Mirror'
            )}
            {editorMode === 'add_node' && 'Click on workspace to add a node'}
            {editorMode === 'add_muscle' && 'Drag from one node to another to add a muscle (may span an existing bone)'}
            {editorMode === 'add_bone' && 'Drag from one node to another to add a fixed bone'}
            {editorMode === 'add_piston' && 'Drag from one node to another to add a rate-tunable piston bone'}
            {editorMode === 'paint' && 'Drag across muscles/bones to thicken'}
            {snapToGridEnabled && (
              <span className="ml-2 text-slate-300">· Snap {STUDIO_GRID_SIZE}px</span>
            )}
            {physicsEnabled && (
              <span className="ml-2 text-cyan-400">· Physics ON</span>
            )}
            {rangePreviewEnabled && (
              <span className="ml-2 text-violet-300">
                · Range{' '}
                {activeMuscle && resolveLinkKind(activeMuscle) !== 'bone'
                  ? `(${resolveLinkKind(activeMuscle) === 'piston' ? 'P' : 'M'}#${activeMuscle.id})`
                  : '(all)'}{' '}
                min ↔ max
              </span>
            )}
          </div>

          {rangePreviewEnabled && (() => {
            const actuators = muscles.filter(m => resolveLinkKind(m) !== 'bone');
            const focusKind = activeMuscle ? resolveLinkKind(activeMuscle) : null;
            const focused =
              focusKind === 'muscle' || focusKind === 'piston'
                ? actuators.filter(m => m.id === activeMuscle!.id)
                : actuators;
            const shown = focused.slice(0, 6);
            return (
              <div className="absolute top-4 right-4 pointer-events-none bg-slate-950/85 border border-violet-700/60 px-3 py-2 rounded-lg text-[10px] text-violet-100 select-none max-w-[240px] space-y-1">
                <div className="font-bold text-violet-300 uppercase tracking-wider">
                  {focused.length === 1 && focusKind
                    ? `${focusKind === 'piston' ? 'Piston' : 'Muscle'} travel`
                    : 'Actuator travel'}
                </div>
                {actuators.length === 0 ? (
                  <div className="text-slate-400">No muscles or pistons — add one to preview range.</div>
                ) : shown.length === 0 ? (
                  <div className="text-slate-400">Select a muscle or piston to preview its range, or deselect to loop all.</div>
                ) : (
                  shown.map(m => {
                    const kind = resolveLinkKind(m);
                    const a = nodes.find(n => n.id === m.nodeA);
                    const b = nodes.find(n => n.id === m.nodeB);
                    const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : m.originalLength;
                    const pct = m.originalLength > 0 ? (len / m.originalLength) * 100 : 100;
                    const atMin = Math.abs(len - m.minLength) < 2;
                    const atMax = Math.abs(len - m.maxLength) < 2;
                    const tag = kind === 'piston' ? 'P' : 'M';
                    return (
                      <div key={m.id} className="flex justify-between gap-2 font-mono">
                        <span className={selectedMuscleId === m.id ? 'text-white' : 'text-slate-400'}>
                          {tag}{m.id}
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
                {focused.length === actuators.length && actuators.length > 6 && (
                  <div className="text-slate-500">+{actuators.length - 6} more · select one to focus</div>
                )}
              </div>
            );
          })()}
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
        
        <div className="grid shrink-0 grid-cols-1 gap-1.5">
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
              className="mt-1 max-h-[38vh] w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-2"
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
        <section className="mt-1 max-h-[38vh] w-full space-y-2 overflow-y-auto rounded-lg border border-lime-200 bg-lime-50 p-3" aria-label="Biological appearance">
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
              Quick attach
            </span>
            {[
              ['Joint pad', 'joint'],
              ['Limb sleeve', 'sleeve'],
              ['Googly eyes', 'googlyEye'],
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
            <label className="ml-auto flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
              Layer
              <select
                aria-label="Body part layer"
                value={skinLayer}
                onChange={event => setSkinLayer(event.target.value as 'behind' | 'front')}
                className="bg-transparent text-[11px] font-bold text-slate-700"
              >
                <option value="front">Front</option>
                <option value="behind">Behind</option>
              </select>
            </label>
          </div>

          <div className="space-y-2 rounded-lg border border-lime-300 bg-white/80 p-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Body part library
              </span>
              <select
                aria-label="Filter pack"
                value={bodyPartPackFilter}
                onChange={e => setBodyPartPackFilter(e.target.value as 'all' | BodyPartPack)}
                className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold"
              >
                <option value="all">All packs</option>
                <option value="monster">Monster</option>
                <option value="modular">Human / shoes</option>
                <option value="animal">Animals</option>
              </select>
              <select
                aria-label="Filter category"
                value={bodyPartCategoryFilter}
                onChange={e =>
                  setBodyPartCategoryFilter(e.target.value as 'all' | BodyPartCategory)
                }
                className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold"
              >
                <option value="all">All types</option>
                {BODY_PART_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-500">{filteredBodyParts.length} parts</span>
            </div>
            <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-5">
              {filteredBodyParts.map(part => (
                <button
                  key={part.id}
                  type="button"
                  title={part.label}
                  onClick={() => addBodyPartFromCatalog(part.id)}
                  className="flex flex-col items-center gap-0.5 rounded border border-slate-200 bg-slate-50 p-1 hover:border-indigo-400 hover:bg-indigo-50"
                >
                  <img
                    src={part.url}
                    alt=""
                    className="h-10 w-10 object-contain"
                    draggable={false}
                  />
                  <span className="line-clamp-2 w-full text-center text-[8px] font-semibold leading-tight text-slate-600">
                    {part.label}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-relaxed text-slate-500">
              Select a node (face, foot) or link (limb), then click a part. Link-anchored
              limbs follow the bone angle and stretch by default. Toggle follow / stretch in
              Transform. Monster, human/shoe, and animal packs ship with the project (Kenney CC0).
            </p>
          </div>

          {selectedSkinPart?.kind === 'bodyPart' && (
            <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-900">
                Transform — {getBodyPartDef(selectedSkinPart.assetId)?.label ?? 'Part'}
              </div>
              {(() => {
                const t = bodyPartTransform(selectedSkinPart);
                const rotDeg = Math.round((t.rotation * 180) / Math.PI);
                const onLink = selectedSkinPart.anchorMuscle !== undefined;
                const boneAlign = !!selectedSkinPart.boneAlign;
                const boneStretch = !!selectedSkinPart.boneStretch;
                const alongMin = boneStretch ? 0 : 0;
                const alongMax = boneStretch ? 1 : 1;
                const alongVal = onLink && boneAlign
                  ? t.offsetX
                  : t.offsetX;
                return (
                  <>
                    {onLink && (
                      <div className="space-y-1.5 rounded border border-indigo-100 bg-white/70 p-1.5">
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={boneAlign}
                            onChange={e => updateSelectedBodyPart({ boneAlign: e.target.checked })}
                          />
                          Follow link angle
                        </label>
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={boneStretch}
                            onChange={e => updateSelectedBodyPart({ boneStretch: e.target.checked })}
                          />
                          Stretch to link length
                        </label>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                      Scale
                      <input
                        type="range"
                        min={0.15}
                        max={3}
                        step={0.05}
                        value={t.scaleX}
                        onChange={e => updateSelectedBodyPart({ scale: Number(e.target.value) })}
                        className="flex-1 accent-indigo-600"
                      />
                      <span className="w-10 text-right font-mono text-[10px]">{t.scaleX.toFixed(2)}</span>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                      {boneAlign ? 'Angle offset' : 'Rotate'}
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={1}
                        value={rotDeg}
                        onChange={e => updateSelectedBodyPart({ rotationDeg: Number(e.target.value) })}
                        className="flex-1 accent-indigo-600"
                      />
                      <span className="w-10 text-right font-mono text-[10px]">{rotDeg}°</span>
                    </label>
                    {onLink && boneAlign ? (
                      <>
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                          Along link
                          <input
                            type="range"
                            min={alongMin}
                            max={alongMax}
                            step={0.01}
                            value={Math.max(alongMin, Math.min(alongMax, alongVal))}
                            onChange={e => updateSelectedBodyPart({ anchorAlong: Number(e.target.value) })}
                            className="flex-1 accent-indigo-600"
                          />
                          <span className="w-10 text-right font-mono text-[10px]">
                            {Math.round(alongVal * 100)}%
                          </span>
                        </label>
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                          Perpendicular
                          <input
                            type="range"
                            min={-D(40)}
                            max={D(40)}
                            step={D(1)}
                            value={t.offsetY}
                            onChange={e => updateSelectedBodyPart({ offsetY: Number(e.target.value) })}
                            className="flex-1 accent-indigo-600"
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                          Offset X
                          <input
                            type="range"
                            min={-D(80)}
                            max={D(80)}
                            step={D(1)}
                            value={t.offsetX}
                            onChange={e => updateSelectedBodyPart({ offsetX: Number(e.target.value) })}
                            className="flex-1 accent-indigo-600"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                          Offset Y
                          <input
                            type="range"
                            min={-D(80)}
                            max={D(80)}
                            step={D(1)}
                            value={t.offsetY}
                            onChange={e => updateSelectedBodyPart({ offsetY: Number(e.target.value) })}
                            className="flex-1 accent-indigo-600"
                          />
                        </label>
                      </>
                    )}
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!selectedSkinPart.mirror}
                        onChange={e => updateSelectedBodyPart({ mirror: e.target.checked })}
                      />
                      Mirror (flip horizontally)
                    </label>
                  </>
                );
              })()}
            </div>
          )}

          {appearance.primitives.length > 0 && (
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
              Placed parts
              <select
                aria-label="Select placed appearance part"
                value={selectedSkinPartId ?? ''}
                onChange={e => setSelectedSkinPartId(e.target.value || null)}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px]"
              >
                <option value="">—</option>
                {appearance.primitives.map(part => (
                  <option key={part.id} value={part.id}>
                    {part.kind === 'bodyPart'
                      ? getBodyPartDef(part.assetId)?.label ?? part.assetId
                      : `${part.kind} (${part.id.slice(-6)})`}
                  </option>
                ))}
              </select>
            </label>
          )}

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
                pushUndoCheckpoint();
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
                if (appearance.primitives.length === 0) return;
                pushUndoCheckpoint();
                setAppearance(current => ({ ...current, primitives: current.primitives.slice(0, -1) }));
                setSelectedSkinPartId(null);
              }}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600"
            >
              Undo last part
            </button>
            <button
              type="button"
              onClick={() => {
                if (appearance.primitives.length === 0) return;
                pushUndoCheckpoint();
                setAppearance(current => ({ ...current, primitives: [] }));
                setSelectedSkinPartId(null);
                setEditorMode('select');
              }}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600"
            >
              Clear all skin
            </button>
            <span className="w-full text-[10px] leading-relaxed text-slate-500">
              Body parts are cosmetic only — they do not change physics or controllers. Use the
              library above, then scale and rotate the selected part to fit your creature.
            </span>
          </div>
        </section>
          </details>
        </div>

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
          
          {/* Default (nothing selected) — body-wide actuation */}
          {selectedNodeId === null && selectedMuscleId === null && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  Body actuation
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Click a node or muscle to edit parts. Soft-muscle rate caps below limit how fast brain
                commands can change length — use this to block high-speed vibration scooting.
              </p>
              <div className="flex flex-col gap-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700">Limit soft muscle stroke rate</span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      Off = unlimited (legacy). On = max |ΔtargetLength| per tick for all soft muscles
                      that inherit this body default.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={softMuscleMaxDeltaPerTick !== undefined}
                    onChange={e =>
                      setSoftMuscleMaxDeltaPerTick(
                        e.target.checked ? DEFAULT_SOFT_MUSCLE_RATE : undefined
                      )
                    }
                    className="h-4 w-4 accent-indigo-600"
                  />
                </label>
                {softMuscleMaxDeltaPerTick !== undefined && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                      <span>Max stroke rate</span>
                      <span className="text-indigo-600">
                        {clampSoftMuscleRate(softMuscleMaxDeltaPerTick).toFixed(2)} px/tick
                      </span>
                    </div>
                    <input
                      type="range"
                      min={MIN_SOFT_MUSCLE_RATE}
                      max={MAX_SOFT_MUSCLE_RATE}
                      step={0.05}
                      value={clampSoftMuscleRate(softMuscleMaxDeltaPerTick)}
                      onChange={e =>
                        setSoftMuscleMaxDeltaPerTick(clampSoftMuscleRate(parseFloat(e.target.value)))
                      }
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                )}
              </div>
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
                  <span>Node Mass</span>
                  <span className="text-indigo-600">{clampNodeMass(activeNode.mass).toFixed(4)}</span>
                </div>
                <input
                  type="range"
                  min={MIN_NODE_MASS}
                  max={MAX_NODE_MASS}
                  step={NODE_MASS_STEP}
                  value={clampNodeMass(activeNode.mass)}
                  onChange={(e) => handleUpdateNodeProp('mass', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              {/* Radius */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span>Collider Radius</span>
                  <span className="text-indigo-600">{clampNodeRadius(activeNode.radius)} px</span>
                </div>
                <input
                  type="range"
                  min={MIN_NODE_RADIUS}
                  max={MAX_NODE_RADIUS}
                  step={1}
                  value={clampNodeRadius(activeNode.radius)}
                  onChange={(e) => handleUpdateNodeProp('radius', parseInt(e.target.value, 10))}
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
                        onClick={() => {
                          pushUndoCheckpoint();
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
                          );
                        }}
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
                    onClick={() => {
                      pushUndoCheckpoint();
                      setNodes(prev =>
                        prev.map(n =>
                          n.id === selectedNodeId
                            ? { ...n, isFoot: !n.isFoot }
                            : n
                        )
                      );
                    }}
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
                  onClick={() => {
                    pushUndoCheckpoint();
                    setNodes(prev =>
                      prev.map(n =>
                        n.id === selectedNodeId
                          ? { ...n, isHingeStop: !n.isHingeStop }
                          : n
                      )
                    );
                  }}
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
                      {clampMotorPower(activeNode.motorPower ?? DEFAULT_MOTOR_POWER).toFixed(2)}
                      <span className="text-slate-400 font-medium"> / {MAX_MOTOR_POWER}</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={MIN_MOTOR_POWER}
                    max={MAX_MOTOR_POWER}
                    step={MOTOR_POWER_STEP}
                    value={clampMotorPower(activeNode.motorPower ?? DEFAULT_MOTOR_POWER)}
                    onChange={(e) => {
                      ensureUndoGestureCheckpoint();
                      setNodes(prev =>
                        prev.map(n =>
                          n.id === selectedNodeId
                            ? { ...n, motorPower: parseFloat(e.target.value) }
                            : n
                        )
                      );
                    }}
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
            const isPist = kind === 'piston';
            const isSoft = kind === 'muscle';
            const piston = isPist ? pistonRates(activeMuscle) : null;
            const softMode: 'inherit' | 'custom' | 'unlimited' =
              typeof activeMuscle.softMaxDeltaPerTick !== 'number'
                ? 'inherit'
                : activeMuscle.softMaxDeltaPerTick <= 0
                  ? 'unlimited'
                  : 'custom';
            const softCustomRate =
              softMode === 'custom'
                ? clampSoftMuscleRate(activeMuscle.softMaxDeltaPerTick!)
                : DEFAULT_SOFT_MUSCLE_RATE;
            const typeLabel = isBone ? 'Bone' : isPist ? 'Piston' : 'Muscle';
            const typeColor = isBone
              ? 'text-amber-700'
              : isPist
                ? 'text-indigo-700'
                : 'text-emerald-600';
            const typeBtn = isBone
              ? 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
              : isPist
                ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700';
            return (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className={`text-xs font-bold flex items-center gap-1.5 ${typeColor}`}>
                    {isBone ? (
                      <Shield className="w-4 h-4 text-amber-600" />
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

                {isSoft && (
                  <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-emerald-100 bg-emerald-50/60">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-emerald-800">Moment-arm attach</span>
                      <span className="text-[10px] text-emerald-700/80 font-medium">
                        Snap ends to Near A / Mid / Near B on a host bone, or keep node joints.
                      </span>
                    </div>
                    {(['A', 'B'] as const).map(end => {
                      const boneKey = end === 'A' ? 'leverBoneA' : 'leverBoneB';
                      const slotKey = end === 'A' ? 'leverSlotA' : 'leverSlotB';
                      const hostId = end === 'A' ? activeMuscle.leverBoneA : activeMuscle.leverBoneB;
                      const slot =
                        (end === 'A' ? activeMuscle.leverSlotA : activeMuscle.leverSlotB) ?? 'mid';
                      const bones = muscles.filter(
                        m => m.id !== activeMuscle.id && isRigidBone(m)
                      );
                      return (
                        <div key={end} className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-600">End {end}</span>
                          <select
                            className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                            value={hostId === undefined ? 'node' : String(hostId)}
                            onChange={e => {
                              const v = e.target.value;
                              pushUndoCheckpoint();
                              setMuscles(prev =>
                                prev.map(m => {
                                  if (m.id !== selectedMuscleId) return m;
                                  if (v === 'node') {
                                    const next = { ...m };
                                    delete next[boneKey];
                                    delete next[slotKey];
                                    return next;
                                  }
                                  const boneId = parseInt(v, 10);
                                  const bone = prev.find(b => b.id === boneId);
                                  if (!bone || !isRigidBone(bone)) return m;
                                  const nextSlot = isValidLeverSlot(m[slotKey])
                                    ? (m[slotKey] as MuscleLeverSlot)
                                    : 'mid';
                                  return {
                                    ...m,
                                    [boneKey]: boneId,
                                    [slotKey]: nextSlot,
                                    ...(end === 'A'
                                      ? { nodeA: leverTipNodeId(bone, nextSlot) }
                                      : { nodeB: leverTipNodeId(bone, nextSlot) }),
                                  };
                                })
                              );
                            }}
                          >
                            <option value="node">Node (joint)</option>
                            {bones.map(b => (
                              <option key={b.id} value={b.id}>
                                Bone #{b.id} (n{b.nodeA}–n{b.nodeB})
                              </option>
                            ))}
                          </select>
                          {hostId !== undefined && (
                            <div className="flex gap-1">
                              {LEVER_SLOT_ORDER.map(s => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => {
                                    const bone = muscles.find(b => b.id === hostId);
                                    if (!bone) return;
                                    pushUndoCheckpoint();
                                    setMuscles(prev =>
                                      prev.map(m => {
                                        if (m.id !== selectedMuscleId) return m;
                                        return {
                                          ...m,
                                          [slotKey]: s,
                                          ...(end === 'A'
                                            ? { nodeA: leverTipNodeId(bone, s) }
                                            : { nodeB: leverTipNodeId(bone, s) }),
                                        };
                                      })
                                    );
                                  }}
                                  className={`flex-1 px-1.5 py-1 rounded text-[10px] font-bold border cursor-pointer ${
                                    slot === s
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                                  }`}
                                >
                                  {s === 'nearA' ? 'Near A' : s === 'nearB' ? 'Near B' : 'Mid'}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Structural type cycle: bone → piston → muscle */}
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700">Structural Type</span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {isBone
                        ? 'Solid, fixed-length rigid beam'
                        : isPist
                          ? 'Hard strut with authorable compression and expansion rates'
                          : 'Elastic spring muscle'}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleMuscleRigidity(activeMuscle.id)}
                    className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer border ${typeBtn}`}
                  >
                    {isBone ? 'Rigid Bone' : isPist ? 'Piston' : 'Flexible Muscle'}
                  </button>
                </div>

                {/* Fixed bone length, or editable rest for muscle / piston. */}
                {isBone ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                      <span>Bone Length</span>
                      <span className="text-indigo-600">
                        {clampLinkLength(activeMuscle.originalLength)} px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={MIN_LINK_LENGTH}
                      max={MAX_LINK_LENGTH}
                      step={1}
                      value={clampLinkLength(activeMuscle.originalLength)}
                      onChange={(e) => {
                        const originalLength = parseInt(e.target.value, 10);
                        ensureUndoGestureCheckpoint();
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
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                      <span>{isPist ? 'Rest Length' : 'Resting Spring Length'}</span>
                      <span className="text-indigo-600">{activeMuscle.originalLength} px</span>
                    </div>
                    <input
                      type="range"
                      min={Math.min(activeMuscle.minLength, activeMuscle.maxLength)}
                      max={Math.max(activeMuscle.minLength, activeMuscle.maxLength)}
                      step="1"
                      value={clampRestingLength(
                        activeMuscle.originalLength,
                        activeMuscle.minLength,
                        activeMuscle.maxLength,
                      )}
                      onChange={(e) => handleUpdateMuscleProp('originalLength', parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                )}

                {/* Compression / expansion extremes — independent world-px bounds */}
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

                    <button
                      type="button"
                      onClick={toggleRangePreview}
                      className={`w-full px-3 py-2 rounded-lg text-xs font-bold border cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                        rangePreviewEnabled
                          ? 'bg-violet-600 text-white border-violet-600 ring-2 ring-violet-300'
                          : 'bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100'
                      }`}
                      title={`Slow loop this ${isPist ? 'piston' : 'muscle'} between min and max length`}
                      id="studio-link-range-preview-btn"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${rangePreviewEnabled ? 'animate-spin' : ''}`}
                        style={rangePreviewEnabled ? { animationDuration: '5.5s' } : undefined}
                      />
                      {rangePreviewEnabled
                        ? `Stop ${isPist ? 'piston' : 'muscle'} range preview`
                        : `Preview ${isPist ? 'piston' : 'muscle'} range`}
                    </button>
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
                        step={0.05}
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
                        step={0.05}
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
                          onClick={() => {
                            pushUndoCheckpoint();
                            setMuscles(prev =>
                              prev.map(m => {
                                if (m.id !== selectedMuscleId) return m;
                                if (mode.id === 'none') {
                                  return { ...m, aeroType: 'none', aeroArea: undefined };
                                }
                                if (mode.id === 'parachute') {
                                  // Keep soft / flexible so the canopy can arc under load.
                                  const orig = Math.max(D(12), m.originalLength);
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
                            );
                          }}
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
                          {clampAeroArea(
                            activeMuscle.aeroArea ??
                              (activeMuscle.aeroType === 'parachute'
                                ? DEFAULT_PARACHUTE_AREA
                                : DEFAULT_AERO_AREA)
                          ).toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={MIN_AERO_AREA}
                        max={MAX_AERO_AREA}
                        step={AERO_AREA_STEP}
                        value={clampAeroArea(
                          activeMuscle.aeroArea ??
                            (activeMuscle.aeroType === 'parachute'
                              ? DEFAULT_PARACHUTE_AREA
                              : DEFAULT_AERO_AREA)
                        )}
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
                {isSoft && (
                  <div className="flex flex-col gap-3 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-emerald-900">Stroke rate limit</span>
                      <span className="text-[10px] text-emerald-800/80 font-medium">
                        Caps how fast this muscle can change target length. Inherit uses the body default.
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {(
                        [
                          ['inherit', 'Inherit body'],
                          ['custom', 'Custom'],
                          ['unlimited', 'Unlimited'],
                        ] as const
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            if (mode === 'inherit') {
                              handleUpdateMuscleProp('softMaxDeltaPerTick', undefined);
                            } else if (mode === 'unlimited') {
                              handleUpdateMuscleProp('softMaxDeltaPerTick', 0);
                            } else {
                              handleUpdateMuscleProp(
                                'softMaxDeltaPerTick',
                                softMode === 'custom' ? softCustomRate : DEFAULT_SOFT_MUSCLE_RATE
                              );
                            }
                          }}
                          className={`flex-1 px-2 py-1 rounded text-[10px] font-bold border transition-all ${
                            softMode === mode
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {softMode === 'custom' && (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-700">
                          <span>Max stroke rate</span>
                          <span className="text-emerald-700">{softCustomRate.toFixed(2)} px/tick</span>
                        </div>
                        <input
                          type="range"
                          min={MIN_SOFT_MUSCLE_RATE}
                          max={MAX_SOFT_MUSCLE_RATE}
                          step={0.05}
                          value={softCustomRate}
                          onChange={e =>
                            handleUpdateMuscleProp(
                              'softMaxDeltaPerTick',
                              clampSoftMuscleRate(parseFloat(e.target.value))
                            )
                          }
                          className="w-full h-1.5 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                        />
                      </div>
                    )}
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
