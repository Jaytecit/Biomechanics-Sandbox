import { useEffect, useRef } from 'react';
import type { CreatureDesign } from '../creature/types';
import { nextId } from '../creature/types';
import { createCamera, screenToWorld, type Camera } from '../sim/Camera';
import { clearCanvas, drawDesign, drawGrid, drawGround } from '../sim/render';
import { deleteBone, deleteJoint, deleteMuscle, moveJoint } from './editOps';
import { snapToGrid } from './grid';
import type { EditorSelection } from './selection';

export type EditTool = 'joint' | 'bone' | 'muscle' | 'select';
export type { EditorSelection } from './selection';

interface Props {
  design: CreatureDesign;
  onChange: (design: CreatureDesign) => void;
  tool: EditTool;
  snapEnabled: boolean;
  selection?: EditorSelection;
  onSelect?: (sel: EditorSelection) => void;
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

const MIN_JOINT_Y = 0.15;
const JOINT_OCCUPY_EPS = 1e-6;

export function EditorCanvas({
  design,
  onChange,
  tool,
  snapEnabled,
  selection = null,
  onSelect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>(createCamera());
  const linkDragRef = useRef<DragLink | null>(null);
  const jointDragRef = useRef<JointDrag | null>(null);
  const panRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const designRef = useRef(design);
  const toolRef = useRef(tool);
  const snapRef = useRef(snapEnabled);
  const onChangeRef = useRef(onChange);
  const selectionRef = useRef(selection);
  const onSelectRef = useRef(onSelect);
  // Don't clobber an in-progress joint drag with a stale prop snapshot.
  if (!jointDragRef.current) {
    designRef.current = design;
  }
  toolRef.current = tool;
  snapRef.current = snapEnabled;
  onChangeRef.current = onChange;
  selectionRef.current = selection;
  onSelectRef.current = onSelect;

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
      drawDesign(ctx, camRef.current, w, h, designRef.current, {
        selectedJointId: jointDrag
          ? jointDrag.jointId
          : drag?.kind === 'bone'
            ? drag.fromId
            : sel?.kind === 'joint'
              ? sel.id
              : null,
        selectedBoneId:
          drag?.kind === 'muscle'
            ? drag.fromId
            : sel?.kind === 'bone'
              ? sel.id
              : null,
        selectedMuscleId: sel?.kind === 'muscle' ? sel.id : null,
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

  /** Right-click delete: joint > bone > muscle under cursor. */
  const tryDeleteAt = (wx: number, wy: number, d: CreatureDesign): boolean => {
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

    // Select tool: pick joint / bone / muscle (priority joint > bone > muscle).
    if (currentTool === 'select') {
      const jointHit = hitJoint(world.x, world.y, d);
      if (jointHit != null) {
        onSelectRef.current?.({ kind: 'joint', id: jointHit });
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
      onSelectRef.current?.(null);
      return;
    }

    // Joint tool: drag existing joints or place new ones.
    if (currentTool === 'joint') {
      const jointHit = hitJoint(world.x, world.y, d);
      if (jointHit != null) {
        onSelectRef.current?.({ kind: 'joint', id: jointHit });
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
      onSelectRef.current?.({ kind: 'joint', id });
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
