import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  bodyPartHandles,
  hitBodyPartHandle,
  hitTestBodyPart,
  moveBodyPart,
  removeBodyPart,
  resizeBodyPart,
  type BodyPartHandle,
} from '../appearance/bodyPartOps';
import type { CreatureDesign } from '../creature/types';
import { nextId } from '../creature/types';
import { isFeatureEnabled } from '../port/featureFlags';
import { createCamera, screenToWorld, worldToScreen, type Camera } from '../sim/Camera';
import { clearCanvas, drawDesign, drawGrid, drawGround } from '../sim/render';
import { deleteBone, deleteJoint, deleteMuscle, moveJoint } from './editOps';
import { snapToGrid } from './grid';
import {
  jointsSelection,
  selectedJointIds,
  type EditorSelection,
} from './selection';
import {
  handleWorldPos,
  hitSelectionHandle,
  jointsInRect,
  moveSelection,
  pointInFootprint,
  rotateSelection,
  scaleSelection,
  selectionCentroid,
  selectionFootprint,
  selectionHandles,
  type SelectionFootprint,
  type SelectionHandleId,
} from './selectionOps';

export type EditTool = 'joint' | 'bone' | 'muscle' | 'select';
export type { EditorSelection } from './selection';

interface Props {
  design: CreatureDesign;
  onChange: (design: CreatureDesign) => void;
  tool: EditTool;
  snapEnabled: boolean;
  selection?: EditorSelection;
  onSelect?: (sel: EditorSelection) => void;
  /**
   * Optional shared camera — keeps pan/zoom across tool/selection changes and
   * remounts (e.g. leaving Edit for Physics settle and returning).
   */
  cameraRef?: MutableRefObject<Camera>;
}

type DragLink =
  | {
      kind: 'bone';
      fromId: number;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      hoverId: number | null;
    }
  | {
      kind: 'muscle';
      fromId: number;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      hoverId: number | null;
    };

interface JointDrag {
  jointId: number;
  /** Design at drag start (for cancel / no-op). */
  origin: CreatureDesign;
  moved: boolean;
}

type PartDrag =
  | {
      kind: 'movePart';
      index: number;
      origin: CreatureDesign;
      moved: boolean;
    }
  | {
      kind: 'resizePart';
      index: number;
      handle: BodyPartHandle;
      origin: CreatureDesign;
      moved: boolean;
    };

type MarqueeDrag = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  additive: boolean;
};

type SelectionTransformDrag =
  | {
      kind: 'move';
      jointIds: number[];
      origin: CreatureDesign;
      startWx: number;
      startWy: number;
      moved: boolean;
    }
  | {
      kind: 'scale';
      jointIds: number[];
      origin: CreatureDesign;
      centroid: { x: number; y: number };
      startDist: number;
      moved: boolean;
    }
  | {
      kind: 'rotate';
      jointIds: number[];
      origin: CreatureDesign;
      centroid: { x: number; y: number };
      startAngle: number;
      moved: boolean;
    };

const MIN_JOINT_Y = 0.15;
const JOINT_OCCUPY_EPS = 1e-6;

export function EditorCanvas({
  design,
  onChange,
  tool,
  snapEnabled,
  selection = null,
  onSelect,
  cameraRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localCamRef = useRef<Camera>(createCamera());
  const camRef = cameraRef ?? localCamRef;
  const linkDragRef = useRef<DragLink | null>(null);
  const jointDragRef = useRef<JointDrag | null>(null);
  const partDragRef = useRef<PartDrag | null>(null);
  const marqueeRef = useRef<MarqueeDrag | null>(null);
  const selXformRef = useRef<SelectionTransformDrag | null>(null);
  const panRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const designRef = useRef(design);
  const toolRef = useRef(tool);
  const snapRef = useRef(snapEnabled);
  const onChangeRef = useRef(onChange);
  const selectionRef = useRef(selection);
  const onSelectRef = useRef(onSelect);
  // Don't clobber an in-progress drag with a stale prop snapshot.
  if (
    !jointDragRef.current &&
    !partDragRef.current &&
    !selXformRef.current
  ) {
    designRef.current = design;
  }
  toolRef.current = tool;
  snapRef.current = snapEnabled;
  onChangeRef.current = onChange;
  selectionRef.current = selection;
  onSelectRef.current = onSelect;

  const multiSelectOn = () => isFeatureEnabled('editorMultiSelectTransforms');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const paint = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      clearCanvas(ctx, w, h);
      if (snapRef.current) {
        drawGrid(ctx, camRef.current, w, h);
      }
      drawGround(ctx, camRef.current, w, h);
      const drag = linkDragRef.current;
      const jointDrag = jointDragRef.current;
      const sel = selectionRef.current;
      const jointIds = selectedJointIds(sel);
      const partIndex =
        sel?.kind === 'bodyPart'
          ? sel.index
          : partDragRef.current?.index ?? null;
      drawDesign(ctx, camRef.current, w, h, designRef.current, {
        selectedJointId: jointDrag
          ? jointDrag.jointId
          : drag?.kind === 'bone'
            ? drag.fromId
            : null,
        selectedJointIds: jointDrag
          ? [jointDrag.jointId]
          : jointIds.length > 0
            ? jointIds
            : null,
        selectedBoneId:
          drag?.kind === 'muscle'
            ? drag.fromId
            : sel?.kind === 'bone'
              ? sel.id
              : null,
        selectedMuscleId: sel?.kind === 'muscle' ? sel.id : null,
        selectedBodyPartIndex: partIndex,
        hoverJointId: drag?.kind === 'bone' ? drag.hoverId : null,
        hoverBoneId: drag?.kind === 'muscle' ? drag.hoverId : null,
        dragPreview: drag
          ? {
              kind: drag.kind,
              fromX: drag.fromX,
              fromY: drag.fromY,
              toX: drag.toX,
              toY: drag.toY,
            }
          : null,
      });

      // Selection footprint + handles (C1.11).
      if (multiSelectOn() && jointIds.length > 0) {
        const fp = selectionFootprint(designRef.current, jointIds);
        if (fp) {
          drawSelectionFootprint(ctx, camRef.current, w, h, fp);
        }
      }

      // Marquee overlay.
      const marquee = marqueeRef.current;
      if (marquee) {
        const a = worldToScreen(camRef.current, w, h, marquee.startX, marquee.startY);
        const b = worldToScreen(camRef.current, w, h, marquee.endX, marquee.endY);
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const rw = Math.abs(b.x - a.x);
        const rh = Math.abs(b.y - a.y);
        ctx.fillStyle = 'rgba(240, 192, 64, 0.12)';
        ctx.strokeStyle = 'rgba(240, 192, 64, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.fillRect(x, y, rw, rh);
        ctx.strokeRect(x, y, rw, rh);
        ctx.setLineDash([]);
      }

      // Env-style corner handles for the selected body part.
      if (
        isFeatureEnabled('spriteBodyParts') &&
        partIndex !== null &&
        partIndex !== undefined
      ) {
        const handles = bodyPartHandles(designRef.current, partIndex);
        for (const hnd of handles) {
          const p = worldToScreen(camRef.current, w, h, hnd.x, hnd.y);
          ctx.fillStyle = '#f0c040';
          ctx.strokeStyle = '#2a3340';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.rect(p.x - 5, p.y - 5, 10, 10);
          ctx.fill();
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);

  const clientToLocal = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height };
  };

  const hitJoint = (wx: number, wy: number, d: CreatureDesign): number | null => {
    let best: number | null = null;
    let bestDist = 0.4;
    for (const j of d.joints) {
      const dist = Math.hypot(j.x - wx, j.y - wy);
      if (dist < bestDist) {
        bestDist = dist;
        best = j.id;
      }
    }
    return best;
  };

  const boneCenter = (
    d: CreatureDesign,
    boneId: number,
  ): { x: number; y: number } | null => {
    const bone = d.bones.find((b) => b.id === boneId);
    if (!bone) return null;
    const a = d.joints.find((j) => j.id === bone.startJointId);
    const b = d.joints.find((j) => j.id === bone.endJointId);
    if (!a || !b) return null;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const hitBone = (wx: number, wy: number, d: CreatureDesign): number | null => {
    const jointPos = new Map(d.joints.map((j) => [j.id, j]));
    let best: number | null = null;
    let bestDist = 0.35;
    for (const b of d.bones) {
      const a = jointPos.get(b.startJointId);
      const c = jointPos.get(b.endJointId);
      if (!a || !c) continue;
      const dist = distToSegment(wx, wy, a.x, a.y, c.x, c.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = b.id;
      }
    }
    return best;
  };

  const hitMuscle = (wx: number, wy: number, d: CreatureDesign): number | null => {
    let best: number | null = null;
    let bestDist = 0.3;
    for (const m of d.muscles) {
      const a = boneCenter(d, m.startBoneId);
      const b = boneCenter(d, m.endBoneId);
      if (!a || !b) continue;
      const dist = distToSegment(wx, wy, a.x, a.y, b.x, b.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = m.id;
      }
    }
    return best;
  };

  const selectJoints = (ids: number[], additive: boolean) => {
    if (additive) {
      const prev = selectedJointIds(selectionRef.current);
      onSelectRef.current?.(jointsSelection([...prev, ...ids]));
    } else {
      onSelectRef.current?.(jointsSelection(ids));
    }
  };

  /** Right-click delete: body part > joint > bone > muscle under cursor. */
  const tryDeleteAt = (wx: number, wy: number, d: CreatureDesign): boolean => {
    if (isFeatureEnabled('spriteBodyParts')) {
      const partIdx = hitTestBodyPart(d, wx, wy);
      if (partIdx != null) {
        onChangeRef.current(removeBodyPart(d, partIdx));
        onSelectRef.current?.(null);
        return true;
      }
    }
    const jointId = hitJoint(wx, wy, d);
    if (jointId != null) {
      onChangeRef.current(deleteJoint(d, jointId));
      return true;
    }
    const boneId = hitBone(wx, wy, d);
    if (boneId != null) {
      onChangeRef.current(deleteBone(d, boneId));
      return true;
    }
    const muscleId = hitMuscle(wx, wy, d);
    if (muscleId != null) {
      onChangeRef.current(deleteMuscle(d, muscleId));
      return true;
    }
    return false;
  };

  const beginSelectionTransform = (
    handle: SelectionHandleId | 'move',
    jointIds: number[],
    d: CreatureDesign,
    wx: number,
    wy: number,
  ) => {
    const centroid = selectionCentroid(d, jointIds);
    if (!centroid) return;
    if (handle === 'move') {
      selXformRef.current = {
        kind: 'move',
        jointIds,
        origin: d,
        startWx: wx,
        startWy: wy,
        moved: false,
      };
      return;
    }
    if (handle === 'rotate') {
      selXformRef.current = {
        kind: 'rotate',
        jointIds,
        origin: d,
        centroid,
        startAngle: Math.atan2(wy - centroid.y, wx - centroid.x),
        moved: false,
      };
      return;
    }
    const dist = Math.hypot(wx - centroid.x, wy - centroid.y);
    selXformRef.current = {
      kind: 'scale',
      jointIds,
      origin: d,
      centroid,
      startDist: Math.max(1e-4, dist),
      moved: false,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);

    // Pan: middle mouse or Alt + left drag (right-click is reserved for delete).
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      panRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
      return;
    }

    const { x, y, w, h } = clientToLocal(e);
    const world = screenToWorld(camRef.current, w, h, x, y);
    const d = designRef.current;

    if (e.button === 2) {
      tryDeleteAt(world.x, world.y, d);
      return;
    }

    if (e.button !== 0) return;

    const currentTool = toolRef.current;
    const additive = e.shiftKey;

    // Select tool: body-part handles / parts, then joint > bone > muscle.
    if (currentTool === 'select') {
      if (isFeatureEnabled('spriteBodyParts')) {
        const sel = selectionRef.current;
        if (sel?.kind === 'bodyPart') {
          const handle = hitBodyPartHandle(d, sel.index, world.x, world.y);
          if (handle) {
            partDragRef.current = {
              kind: 'resizePart',
              index: sel.index,
              handle,
              origin: d,
              moved: false,
            };
            return;
          }
        }
        const partHit = hitTestBodyPart(d, world.x, world.y);
        if (partHit != null) {
          onSelectRef.current?.({ kind: 'bodyPart', index: partHit });
          partDragRef.current = {
            kind: 'movePart',
            index: partHit,
            origin: d,
            moved: false,
          };
          return;
        }
      }

      // C1.11: footprint handles / move before hit-testing individual joints.
      if (multiSelectOn()) {
        const jointIds = selectedJointIds(selectionRef.current);
        if (jointIds.length > 0) {
          const fp = selectionFootprint(d, jointIds);
          if (fp) {
            const handle = hitSelectionHandle(world.x, world.y, fp);
            if (handle) {
              beginSelectionTransform(handle, jointIds, d, world.x, world.y);
              return;
            }
            if (pointInFootprint(world.x, world.y, fp)) {
              // Clicking a joint inside the box still selects/drags that joint
              // unless we're starting a group move on empty interior.
              const jointHit = hitJoint(world.x, world.y, d);
              if (jointHit == null || !jointIds.includes(jointHit)) {
                beginSelectionTransform('move', jointIds, d, world.x, world.y);
                return;
              }
            }
          }
        }
      }

      const jointHit = hitJoint(world.x, world.y, d);
      if (jointHit != null) {
        if (multiSelectOn()) {
          const prev = selectedJointIds(selectionRef.current);
          let ids: number[];
          if (additive) {
            ids = prev.includes(jointHit)
              ? prev.filter((id) => id !== jointHit)
              : [...prev, jointHit];
          } else if (prev.includes(jointHit) && prev.length > 1) {
            ids = prev;
          } else {
            ids = [jointHit];
          }
          selectJoints(ids, false);
          if (ids.length > 1) {
            beginSelectionTransform('move', ids, d, world.x, world.y);
          } else if (ids.length === 1) {
            jointDragRef.current = {
              jointId: ids[0],
              origin: d,
              moved: false,
            };
          }
          return;
        }
        onSelectRef.current?.(jointsSelection([jointHit]));
        jointDragRef.current = {
          jointId: jointHit,
          origin: d,
          moved: false,
        };
        return;
      }
      const boneHit = hitBone(world.x, world.y, d);
      if (boneHit != null) {
        onSelectRef.current?.({ kind: 'bone', id: boneHit });
        return;
      }
      const muscleHit = hitMuscle(world.x, world.y, d);
      if (muscleHit != null) {
        onSelectRef.current?.({ kind: 'muscle', id: muscleHit });
        return;
      }

      // Empty space: marquee (C1.11) or clear.
      if (multiSelectOn()) {
        marqueeRef.current = {
          startX: world.x,
          startY: world.y,
          endX: world.x,
          endY: world.y,
          additive,
        };
        if (!additive) onSelectRef.current?.(null);
        return;
      }
      onSelectRef.current?.(null);
      return;
    }

    // Joint tool: drag existing joints or place new ones.
    if (currentTool === 'joint') {
      const jointHit = hitJoint(world.x, world.y, d);
      if (jointHit != null) {
        onSelectRef.current?.(jointsSelection([jointHit]));
        jointDragRef.current = {
          jointId: jointHit,
          origin: d,
          moved: false,
        };
        return;
      }
      // Joint tool on empty space: place a new joint.
      if (world.y < MIN_JOINT_Y) return;
      const snapped = snapToGrid(world.x, world.y, snapRef.current);
      if (snapped.y < MIN_JOINT_Y) return;
      const exists = d.joints.some(
        (j) => Math.hypot(j.x - snapped.x, j.y - snapped.y) < JOINT_OCCUPY_EPS,
      );
      if (exists) return;
      const id = nextId(d.joints);
      onSelectRef.current?.(jointsSelection([id]));
      onChangeRef.current({
        ...d,
        name: 'Custom',
        joints: [...d.joints, { id, x: snapped.x, y: snapped.y }],
      });
      return;
    }

    if (currentTool === 'bone') {
      const jointHit = hitJoint(world.x, world.y, d);
      if (jointHit == null) return;
      const joint = d.joints.find((j) => j.id === jointHit)!;
      linkDragRef.current = {
        kind: 'bone',
        fromId: jointHit,
        fromX: joint.x,
        fromY: joint.y,
        toX: world.x,
        toY: world.y,
        hoverId: null,
      };
      return;
    }

    if (currentTool === 'muscle') {
      const boneHit = hitBone(world.x, world.y, d);
      if (boneHit == null) return;
      const center = boneCenter(d, boneHit);
      if (!center) return;
      linkDragRef.current = {
        kind: 'muscle',
        fromId: boneHit,
        fromX: center.x,
        fromY: center.y,
        toX: world.x,
        toY: world.y,
        hoverId: null,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (panRef.current.active) {
      const dx = e.clientX - panRef.current.lastX;
      const dy = e.clientY - panRef.current.lastY;
      panRef.current.lastX = e.clientX;
      panRef.current.lastY = e.clientY;
      camRef.current.x -= dx / camRef.current.zoom;
      camRef.current.y += dy / camRef.current.zoom;
      return;
    }

    const { x, y, w, h } = clientToLocal(e);
    const world = screenToWorld(camRef.current, w, h, x, y);

    const marquee = marqueeRef.current;
    if (marquee) {
      marquee.endX = world.x;
      marquee.endY = world.y;
      return;
    }

    const selXform = selXformRef.current;
    if (selXform) {
      if (selXform.kind === 'move') {
        const dx = world.x - selXform.startWx;
        const dy = world.y - selXform.startWy;
        designRef.current = moveSelection(
          selXform.origin,
          selXform.jointIds,
          dx,
          dy,
        );
      } else if (selXform.kind === 'scale') {
        const dist = Math.hypot(
          world.x - selXform.centroid.x,
          world.y - selXform.centroid.y,
        );
        const factor = dist / selXform.startDist;
        designRef.current = scaleSelection(
          selXform.origin,
          selXform.jointIds,
          factor,
          selXform.centroid,
        );
      } else {
        const angle = Math.atan2(
          world.y - selXform.centroid.y,
          world.x - selXform.centroid.x,
        );
        designRef.current = rotateSelection(
          selXform.origin,
          selXform.jointIds,
          angle - selXform.startAngle,
          selXform.centroid,
        );
      }
      selXform.moved = true;
      return;
    }

    const jointDrag = jointDragRef.current;
    if (jointDrag) {
      let { x: nx, y: ny } = snapToGrid(world.x, world.y, snapRef.current);
      if (ny < MIN_JOINT_Y) ny = MIN_JOINT_Y;
      const occupied = designRef.current.joints.some(
        (j) =>
          j.id !== jointDrag.jointId &&
          Math.hypot(j.x - nx, j.y - ny) < JOINT_OCCUPY_EPS,
      );
      if (occupied) return;
      designRef.current = moveJoint(designRef.current, jointDrag.jointId, nx, ny);
      jointDrag.moved = true;
      return;
    }

    const partDrag = partDragRef.current;
    if (partDrag) {
      if (partDrag.kind === 'movePart') {
        designRef.current = moveBodyPart(
          designRef.current,
          partDrag.index,
          world.x,
          world.y,
        );
      } else {
        designRef.current = resizeBodyPart(
          designRef.current,
          partDrag.index,
          world.x,
          world.y,
        );
      }
      partDrag.moved = true;
      return;
    }

    const drag = linkDragRef.current;
    if (!drag) return;

    const d = designRef.current;

    if (drag.kind === 'bone') {
      const hover = hitJoint(world.x, world.y, d);
      const target =
        hover != null && hover !== drag.fromId
          ? d.joints.find((j) => j.id === hover)
          : null;
      drag.toX = target?.x ?? world.x;
      drag.toY = target?.y ?? world.y;
      drag.hoverId = target && hover !== drag.fromId ? hover : null;
    } else {
      const hover = hitBone(world.x, world.y, d);
      const target =
        hover != null && hover !== drag.fromId ? boneCenter(d, hover) : null;
      drag.toX = target?.x ?? world.x;
      drag.toY = target?.y ?? world.y;
      drag.hoverId = target && hover !== drag.fromId ? hover : null;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (panRef.current.active) {
      panRef.current.active = false;
      return;
    }

    const marquee = marqueeRef.current;
    if (marquee) {
      marqueeRef.current = null;
      if (e.button !== 0) return;
      const ids = jointsInRect(
        designRef.current,
        marquee.startX,
        marquee.startY,
        marquee.endX,
        marquee.endY,
      );
      if (ids.length === 0) {
        if (!marquee.additive) onSelectRef.current?.(null);
        return;
      }
      selectJoints(ids, marquee.additive);
      return;
    }

    const selXform = selXformRef.current;
    if (selXform) {
      selXformRef.current = null;
      if (e.button === 0 && selXform.moved) {
        onChangeRef.current(designRef.current);
      } else {
        designRef.current = selXform.origin;
      }
      return;
    }

    const jointDrag = jointDragRef.current;
    if (jointDrag) {
      jointDragRef.current = null;
      if (e.button === 0 && jointDrag.moved) {
        onChangeRef.current(designRef.current);
      } else {
        designRef.current = jointDrag.origin;
      }
      return;
    }

    const partDrag = partDragRef.current;
    if (partDrag) {
      partDragRef.current = null;
      if (e.button === 0 && partDrag.moved) {
        onChangeRef.current(designRef.current);
      } else {
        designRef.current = partDrag.origin;
      }
      return;
    }

    const drag = linkDragRef.current;
    linkDragRef.current = null;
    if (!drag || e.button !== 0) return;

    const { x, y, w, h } = clientToLocal(e);
    const world = screenToWorld(camRef.current, w, h, x, y);
    const d = designRef.current;

    if (drag.kind === 'bone') {
      const hit = hitJoint(world.x, world.y, d);
      if (hit == null || hit === drag.fromId) return;
      const exists = d.bones.some(
        (b) =>
          (b.startJointId === drag.fromId && b.endJointId === hit) ||
          (b.startJointId === hit && b.endJointId === drag.fromId),
      );
      if (exists) return;
      onChangeRef.current({
        ...d,
        name: 'Custom',
        bones: [
          ...d.bones,
          { id: nextId(d.bones), startJointId: drag.fromId, endJointId: hit },
        ],
      });
      return;
    }

    const hit = hitBone(world.x, world.y, d);
    if (hit == null || hit === drag.fromId) return;
    const exists = d.muscles.some(
      (m) =>
        (m.startBoneId === drag.fromId && m.endBoneId === hit) ||
        (m.startBoneId === hit && m.endBoneId === drag.fromId),
    );
    if (exists) return;
    onChangeRef.current({
      ...d,
      name: 'Custom',
      muscles: [
        ...d.muscles,
        {
          id: nextId(d.muscles),
          startBoneId: drag.fromId,
          endBoneId: hit,
          canExpand: true,
        },
      ],
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    camRef.current.zoom = Math.max(20, Math.min(120, camRef.current.zoom * factor));
  };

  return (
    <canvas
      ref={canvasRef}
      className="viewport-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

function drawSelectionFootprint(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  fp: SelectionFootprint,
): void {
  const corners: SelectionHandleId[] = ['nw', 'ne', 'se', 'sw'];
  ctx.save();
  ctx.strokeStyle = 'rgba(240, 192, 64, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  for (let i = 0; i < corners.length; i++) {
    const p = handleWorldPos(fp, corners[i]);
    const s = worldToScreen(cam, w, h, p.x, p.y);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  for (const id of selectionHandles()) {
    const p = handleWorldPos(fp, id);
    const s = worldToScreen(cam, w, h, p.x, p.y);
    if (id === 'rotate') {
      const topMid = { x: fp.cx, y: fp.cy + fp.hh };
      const a = worldToScreen(cam, w, h, topMid.x, topMid.y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(s.x, s.y);
      ctx.strokeStyle = 'rgba(240, 192, 64, 0.7)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 220, 120, 0.95)';
      ctx.fill();
      ctx.strokeStyle = '#2a3340';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#f0c040';
      ctx.strokeStyle = '#2a3340';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(s.x - 5, s.y - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}
