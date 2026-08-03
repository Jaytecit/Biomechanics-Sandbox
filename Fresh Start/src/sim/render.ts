import {
  drawGooglyEye,
  stepGooglyEye,
} from '../appearance/googlyEyes';
import type { AppearanceRig } from '../appearance/types';
import { getBodyPart, getBodyPartImage } from '../appearance/bodyPartCatalog';
import { driveGroupStrokeColor, normalizeDriveGroup } from '../brain/driveGroups';
import type { CreatureDesign } from '../creature/types';
import { EDITOR_GRID } from '../editor/grid';
import { GROUND_Y } from '../physics/constants';
import { isFeatureEnabled } from '../port/featureFlags';
import { type Camera, screenToWorld, worldToScreen } from './Camera';
import type { SimulationSnapshot } from './simulation';

export function clearCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1a2332');
  g.addColorStop(1, '#0d121a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Draw a light world grid in the visible camera region. */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  grid = EDITOR_GRID,
): void {
  const topLeft = screenToWorld(cam, w, h, 0, 0);
  const bottomRight = screenToWorld(cam, w, h, w, h);
  const minX = Math.min(topLeft.x, bottomRight.x);
  const maxX = Math.max(topLeft.x, bottomRight.x);
  const minY = Math.min(topLeft.y, bottomRight.y);
  const maxY = Math.max(topLeft.y, bottomRight.y);

  const startX = Math.floor(minX / grid) * grid;
  const startY = Math.floor(minY / grid) * grid;

  ctx.save();
  ctx.lineWidth = 1;
  for (let x = startX; x <= maxX + grid; x += grid) {
    const a = worldToScreen(cam, w, h, x, minY);
    const b = worldToScreen(cam, w, h, x, maxY);
    const major = Math.round(x / grid) % 2 === 0;
    ctx.strokeStyle = major ? 'rgba(90, 110, 130, 0.35)' : 'rgba(90, 110, 130, 0.15)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let y = startY; y <= maxY + grid; y += grid) {
    const a = worldToScreen(cam, w, h, minX, y);
    const b = worldToScreen(cam, w, h, maxX, y);
    const major = Math.round(y / grid) % 2 === 0;
    ctx.strokeStyle = major ? 'rgba(90, 110, 130, 0.35)' : 'rgba(90, 110, 130, 0.15)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Distance reference marks on the ground plane.
 * Minor ticks every 1 unit; major ticks + labels every 5 (origin emphasized).
 * Ground is an infinite halfspace — draw across the visible viewport only.
 */
export function drawGround(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
): void {
  const left = worldToScreen(cam, w, h, 0, GROUND_Y);
  ctx.strokeStyle = '#5a6a7a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, left.y);
  ctx.lineTo(w, left.y);
  ctx.stroke();

  ctx.fillStyle = '#152028';
  ctx.fillRect(0, left.y, w, h - left.y);

  drawGroundDistanceMarks(ctx, cam, w, h);
}

function drawGroundDistanceMarks(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
): void {
  const topLeft = screenToWorld(cam, w, h, 0, 0);
  const bottomRight = screenToWorld(cam, w, h, w, h);
  const viewMinX = Math.min(topLeft.x, bottomRight.x);
  const viewMaxX = Math.max(topLeft.x, bottomRight.x);
  const minX = Math.floor(viewMinX) - 1;
  const maxX = Math.ceil(viewMaxX) + 1;

  // Skip labels when ticks are too dense on screen (~<28px between majors).
  const majorStep = 5;
  const labelSpacing = majorStep * cam.zoom;
  const showLabels = labelSpacing >= 28;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';

  for (let x = Math.ceil(minX); x <= maxX; x++) {
    const major = x % majorStep === 0;
    const origin = x === 0;
    const a = worldToScreen(cam, w, h, x, GROUND_Y);
    // Tick height in screen px (up into the air side of the ground line).
    const tickH = origin ? 14 : major ? 10 : 5;

    ctx.strokeStyle = origin
      ? 'rgba(220, 200, 120, 0.85)'
      : major
        ? 'rgba(140, 160, 180, 0.7)'
        : 'rgba(100, 120, 140, 0.4)';
    ctx.lineWidth = origin ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x, a.y - tickH);
    ctx.stroke();

    // Short stub into the ground fill for major marks.
    if (major) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x, a.y + (origin ? 8 : 5));
      ctx.stroke();
    }

    if (showLabels && major) {
      ctx.fillStyle = origin
        ? 'rgba(230, 210, 140, 0.95)'
        : 'rgba(160, 175, 190, 0.85)';
      ctx.fillText(String(x), a.x, a.y + 7);
    }
  }

  ctx.restore();
}

export function drawSnapshot(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  snap: SimulationSnapshot,
): void {
  const agents =
    snap.agents.length > 0
      ? snap.agents
      : [
          {
            joints: snap.joints,
            bones: snap.bones,
            muscles: snap.muscles,
            opacity: 1,
            focused: true,
          },
        ];

  // Ghosts first, focused creature last (on top) — Keiwan layering.
  const ordered = agents.slice().sort((a, b) => {
    if (a.focused === b.focused) return 0;
    return a.focused ? 1 : -1;
  });

  for (const agent of ordered) {
    ctx.save();
    ctx.globalAlpha = agent.opacity;
    drawAgent(
      ctx,
      cam,
      w,
      h,
      agent,
      snap.appearance,
      1 / 60,
      agent.focused ? 'focus' : 'ghost',
    );
    ctx.restore();
  }
}

function drawAgent(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  agent: {
    joints: SimulationSnapshot['joints'];
    bones: SimulationSnapshot['bones'];
    muscles: SimulationSnapshot['muscles'];
  },
  appearance?: AppearanceRig,
  dt = 1 / 60,
  creatureKey = 'agent',
): void {
  for (const m of agent.muscles) {
    const a = worldToScreen(cam, w, h, m.ax, m.ay);
    const b = worldToScreen(cam, w, h, m.bx, m.by);
    const width =
      2 + Math.abs(m.drive) * 4 + (m.action === 'idle' ? 0 : 1);
    if (m.action === 'contract') ctx.strokeStyle = '#e85d4c';
    else if (m.action === 'expand') ctx.strokeStyle = '#4c8fe8';
    else ctx.strokeStyle = '#8a6a5a';
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const bone of agent.bones) {
    drawBone(ctx, cam, w, h, bone.x, bone.y, bone.angle, bone.halfLength, bone.halfWidth);
  }

  const hideSkeleton = appearance?.hideSkeleton === true;
  if (!hideSkeleton) {
    for (const joint of agent.joints) {
      const p = worldToScreen(cam, w, h, joint.x, joint.y);
      const r = joint.radius * cam.zoom;
      ctx.fillStyle = '#d8dde6';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a3340';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  if (isFeatureEnabled('spriteBodyParts') && appearance?.bodyParts?.length) {
    for (const part of appearance.bodyParts) {
      const joint = agent.joints.find((j) => j.id === part.jointId);
      const def = getBodyPart(part.assetId);
      const img = getBodyPartImage(part.assetId);
      if (!joint || !def || !img) continue;
      const p = worldToScreen(cam, w, h, joint.x, joint.y);
      const scale = (part.scale ?? def.defaultScale) * cam.zoom * 64;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (part.mirror) ctx.scale(-1, 1);
      ctx.drawImage(img, -scale * def.pivotX, -scale * def.pivotY, scale, scale);
      ctx.restore();
    }
  }

  if (isFeatureEnabled('googlyEyes') && appearance?.googlyEyes?.length) {
    appearance.googlyEyes.forEach((eye, idx) => {
      const joint = agent.joints.find((j) => j.id === eye.jointId);
      if (!joint) return;
      const dome = eye.domeRadius ?? 0.16;
      const pupilR = dome * 0.45;
      const pupil = stepGooglyEye(
        `${creatureKey}:eye:${idx}`,
        joint.vx ?? 0,
        joint.vy ?? 0,
        dome,
        pupilR,
        dt,
      );
      const p = worldToScreen(
        cam,
        w,
        h,
        joint.x + (eye.offsetX ?? 0),
        joint.y + (eye.offsetY ?? 0),
      );
      drawGooglyEye(ctx, p.x, p.y, cam.zoom, pupil);
    });
  }
}

export function drawDesign(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  design: CreatureDesign,
  opts?: {
    selectedJointId?: number | null;
    selectedBoneId?: number | null;
    selectedMuscleId?: number | null;
    hoverJointId?: number | null;
    hoverBoneId?: number | null;
    dragPreview?: {
      kind: 'bone' | 'muscle';
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
    } | null;
  },
): void {
  const jointPos = new Map(design.joints.map((j) => [j.id, j]));
  const boneCenter = new Map<number, { x: number; y: number }>();

  for (const bone of design.bones) {
    const a = jointPos.get(bone.startJointId);
    const b = jointPos.get(bone.endJointId);
    if (!a || !b) continue;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    boneCenter.set(bone.id, { x: cx, y: cy });
    const angle = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
    const halfLength = Math.hypot(b.x - a.x, b.y - a.y) / 2;
    const selected =
      opts?.selectedBoneId === bone.id || opts?.hoverBoneId === bone.id;
    const aero = (bone.aeroArea ?? 0) > 0;
    const fill = selected
      ? '#f0c040'
      : aero
        ? '#6ab0c8'
        : '#6a8aaa';
    drawBone(ctx, cam, w, h, cx, cy, angle, halfLength, 0.14, fill);
  }

  for (const muscle of design.muscles) {
    const a = boneCenter.get(muscle.startBoneId);
    const b = boneCenter.get(muscle.endBoneId);
    if (!a || !b) continue;
    const pa = worldToScreen(cam, w, h, a.x, a.y);
    const pb = worldToScreen(cam, w, h, b.x, b.y);
    const g = normalizeDriveGroup(muscle.driveGroup);
    const selected = opts?.selectedMuscleId === muscle.id;
    ctx.strokeStyle = selected
      ? '#f0c040'
      : g !== undefined
        ? driveGroupStrokeColor(g)
        : '#c07060';
    ctx.lineWidth = selected ? 4 : 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (g !== undefined) {
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      ctx.fillStyle = driveGroupStrokeColor(g);
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`G${g}`, mx, my - 4);
    }
  }

  if (opts?.dragPreview) {
    const p = opts.dragPreview;
    const a = worldToScreen(cam, w, h, p.fromX, p.fromY);
    const b = worldToScreen(cam, w, h, p.toX, p.toY);
    ctx.strokeStyle = p.kind === 'muscle' ? '#e09070' : '#f0c040';
    ctx.lineWidth = p.kind === 'muscle' ? 3 : 4;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const joint of design.joints) {
    const p = worldToScreen(cam, w, h, joint.x, joint.y);
    const selected =
      opts?.selectedJointId === joint.id || opts?.hoverJointId === joint.id;
    const r = 0.28 * cam.zoom;
    ctx.fillStyle = selected ? '#f0c040' : '#d8dde6';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a3340';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (joint.isWheel) {
      ctx.strokeStyle = '#d4a04a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (joint.isFoot) {
      ctx.fillStyle = '#3d9a6a';
      ctx.beginPath();
      ctx.arc(p.x, p.y + r * 0.85, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    if (joint.isHead) {
      ctx.fillStyle = '#c45c4a';
      ctx.beginPath();
      ctx.arc(p.x, p.y - r * 0.85, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBone(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  x: number,
  y: number,
  angle: number,
  halfLength: number,
  halfWidth: number,
  fill = '#7a9bb8',
): void {
  // Bone local Y is along length (Rapier capsule orientation).
  const c = worldToScreen(cam, w, h, x, y);
  const len = halfLength * 2 * cam.zoom;
  const wid = halfWidth * 2 * cam.zoom;
  ctx.save();
  ctx.translate(c.x, c.y);
  // Screen Y is flipped; world angle is CCW from +X.
  // Body rotation is bone angle (local Y along bone).
  ctx.rotate(-angle);
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#2a3340';
  ctx.lineWidth = 1.5;
  roundRect(ctx, -wid / 2, -len / 2, wid, len, wid / 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
