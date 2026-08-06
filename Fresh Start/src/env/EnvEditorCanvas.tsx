import { useEffect, useRef } from 'react';
import { EDITOR_GRID, snapToGrid } from '../editor/grid';
import {
  clearCanvas,
  drawCourseMarkers,
  drawGround,
  drawGrid,
  drawObstacles,
  drawScoreRegions,
  drawTerrain,
  drawTower,
} from '../sim/render';
import { createCamera, screenToWorld, worldToScreen, type Camera } from '../sim/Camera';
import {
  deleteSelection,
  handleWorldPos,
  hitHandle,
  hitTerrainEndpoint,
  hitTestEnv,
  localToWorld,
  markerHandles,
  moveMarker,
  moveObstacle,
  moveRegion,
  moveSpawn,
  moveTower,
  obstacleHandles,
  placeCourseMarkerAt,
  placeObstacleAt,
  placeScoreRegionAt,
  placeSpawnAt,
  placeTowerAt,
  regionHandles,
  resizeMarkerByCorner,
  resizeObstacleByCorner,
  resizeRegionByCorner,
  resizeTowerByHandle,
  rotateObstacle,
  selectionFootprint,
  setTerrainEndpoint,
  terrainEndpointWorld,
  towerHandles,
  type Footprint,
  type HandleId,
  type TerrainEndpoint,
} from './envEditOps';
import {
  previewCourseMarkers,
  previewObstacleVisuals,
  previewScoreRegions,
  previewTerrainVisual,
  previewTowerVisuals,
} from './envPreview';
import {
  isPlaceMarkerTool,
  isPlaceObstacleTool,
  isPlaceRegionTool,
  type EnvSelection,
  type EnvTool,
} from './envSelection';
import { resolveSpawn, type EnvironmentDesign } from './types';
import { isFeatureEnabled } from '../port/featureFlags';

interface Props {
  environment: EnvironmentDesign;
  onChange: (env: EnvironmentDesign) => void;
  tool: EnvTool;
  onToolChange?: (tool: EnvTool) => void;
  snapEnabled: boolean;
  selection: EnvSelection;
  onSelect: (sel: EnvSelection) => void;
  /** Bottom chrome height in CSS px for camera framing. */
  viewportInsetBottom?: number;
}

type DragState =
  | {
      kind: 'moveObstacle';
      id: string;
      lastX: number;
      lastY: number;
      moved: boolean;
    }
  | {
      kind: 'moveRegion';
      id: string;
      lastX: number;
      lastY: number;
      moved: boolean;
    }
  | {
      kind: 'moveMarker';
      id: string;
      lastX: number;
      lastY: number;
      moved: boolean;
    }
  | {
      kind: 'moveTower';
      lastX: number;
      moved: boolean;
    }
  | {
      kind: 'moveSpawn';
      lastX: number;
      lastY: number;
      moved: boolean;
    }
  | {
      kind: 'resizeObstacle';
      id: string;
      handle: 'nw' | 'ne' | 'sw' | 'se';
      moved: boolean;
    }
  | {
      kind: 'resizeRegion';
      id: string;
      handle: 'nw' | 'ne' | 'sw' | 'se';
      moved: boolean;
    }
  | {
      kind: 'resizeMarker';
      id: string;
      handle: 'nw' | 'ne' | 'sw' | 'se';
      moved: boolean;
    }
  | {
      kind: 'rotateObstacle';
      id: string;
      moved: boolean;
    }
  | {
      kind: 'resizeTower';
      handle: 'towerLeft' | 'towerRight' | 'towerTop';
      moved: boolean;
    }
  | {
      kind: 'resizeTerrain';
      endpoint: TerrainEndpoint;
      moved: boolean;
    };

const HANDLE_HIT_R = 0.28;

export function EnvEditorCanvas({
  environment,
  onChange,
  tool,
  onToolChange,
  snapEnabled,
  selection,
  onSelect,
  viewportInsetBottom = 0,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>(createCamera());
  const panRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const dragRef = useRef<DragState | null>(null);
  const spaceRef = useRef(false);
  const envRef = useRef(environment);
  const toolRef = useRef(tool);
  const snapRef = useRef(snapEnabled);
  const selectionRef = useRef(selection);
  const onChangeRef = useRef(onChange);
  const onSelectRef = useRef(onSelect);
  const onToolChangeRef = useRef(onToolChange);
  const insetRef = useRef(viewportInsetBottom);

  if (!dragRef.current) {
    envRef.current = environment;
  }
  toolRef.current = tool;
  snapRef.current = snapEnabled;
  selectionRef.current = selection;
  onChangeRef.current = onChange;
  onSelectRef.current = onSelect;
  onToolChangeRef.current = onToolChange;
  insetRef.current = viewportInsetBottom;

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

      const cam = camRef.current;
      cam.insetBottom = insetRef.current;

      clearCanvas(ctx, w, h);
      if (snapRef.current) {
        drawGrid(ctx, cam, w, h, EDITOR_GRID);
      }
      drawGround(ctx, cam, w, h);

      const env = envRef.current;
      drawTerrain(ctx, cam, w, h, previewTerrainVisual(env.terrain));
      if (env.tower) {
        drawTower(ctx, cam, w, h, previewTowerVisuals(env.tower));
      }
      drawObstacles(ctx, cam, w, h, previewObstacleVisuals(env.obstacles));
      if (isFeatureEnabled('scoreRegions')) {
        drawScoreRegions(ctx, cam, w, h, previewScoreRegions(env.regions));
      }
      if (isFeatureEnabled('courseMarkers')) {
        drawCourseMarkers(ctx, cam, w, h, previewCourseMarkers(env.markers));
      }
      if (env.terrain) {
        drawTerrainEndpoints(
          ctx,
          cam,
          w,
          h,
          env.terrain,
          selectionRef.current?.kind === 'terrain',
        );
      }
      drawSpawnMarker(
        ctx,
        cam,
        w,
        h,
        resolveSpawn(env),
        selectionRef.current?.kind === 'spawn',
      );

      const sel = selectionRef.current;
      const fp = selectionFootprint(env, sel);
      if (
        fp &&
        sel &&
        sel.kind !== 'spawn' &&
        sel.kind !== 'terrain'
      ) {
        drawSelectionOverlay(ctx, cam, w, h, fp, sel, env);
      }

      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (e.code === 'Space') {
        spaceRef.current = true;
        if (!inField) e.preventDefault();
      }
      if (inField) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = selectionRef.current;
        if (!sel) return;
        e.preventDefault();
        const result = deleteSelection(envRef.current, sel);
        envRef.current = result.env;
        onSelectRef.current(result.selection);
        onChangeRef.current(result.env);
      }
      if (e.key === 'Escape') {
        onSelectRef.current(null);
        onToolChangeRef.current?.('select');
      }
      if (e.key === 'v' || e.key === 'V') {
        onToolChangeRef.current?.('select');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const clientToLocal = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      w: rect.width,
      h: rect.height,
    };
  };

  const finishDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.moved) {
      onChangeRef.current(envRef.current);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);

    if (e.button === 1 || (e.button === 0 && (e.altKey || spaceRef.current))) {
      panRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
      return;
    }

    if (e.button === 2) {
      const { x, y, w, h } = clientToLocal(e);
      const world = screenToWorld(camRef.current, w, h, x, y);
      const hit = hitTestEnv(envRef.current, world.x, world.y);
      if (hit) {
        const result = deleteSelection(envRef.current, hit);
        envRef.current = result.env;
        onSelectRef.current(result.selection);
        onChangeRef.current(result.env);
      }
      return;
    }

    if (e.button !== 0) return;

    const { x, y, w, h } = clientToLocal(e);
    const world = screenToWorld(camRef.current, w, h, x, y);
    const snapped = snapToGrid(world.x, world.y, snapRef.current);
    const currentTool = toolRef.current;
    const env = envRef.current;

    if (isPlaceObstacleTool(currentTool)) {
      const obs = placeObstacleAt(currentTool, snapped.x, snapped.y);
      const next = { ...env, obstacles: [...env.obstacles, obs] };
      envRef.current = next;
      onSelectRef.current({ kind: 'obstacle', id: obs.id });
      onChangeRef.current(next);
      onToolChangeRef.current?.('select');
      return;
    }

    if (isPlaceRegionTool(currentTool) && isFeatureEnabled('scoreRegions')) {
      const region = placeScoreRegionAt(currentTool, snapped.x, snapped.y);
      const next = {
        ...env,
        regions: [...(env.regions ?? []), region],
      };
      envRef.current = next;
      onSelectRef.current({ kind: 'region', id: region.id });
      onChangeRef.current(next);
      onToolChangeRef.current?.('select');
      return;
    }

    if (isPlaceMarkerTool(currentTool) && isFeatureEnabled('courseMarkers')) {
      const marker = placeCourseMarkerAt(
        currentTool,
        snapped.x,
        snapped.y,
        env.markers ?? [],
      );
      const next = {
        ...env,
        markers: [...(env.markers ?? []), marker],
      };
      envRef.current = next;
      onSelectRef.current({ kind: 'marker', id: marker.id });
      onChangeRef.current(next);
      onToolChangeRef.current?.('select');
      return;
    }

    if (currentTool === 'tower') {
      if (!env.tower) {
        const tower = placeTowerAt(snapped.x);
        const next = { ...env, tower };
        envRef.current = next;
        onSelectRef.current({ kind: 'tower' });
        onChangeRef.current(next);
        onToolChangeRef.current?.('select');
      } else {
        onSelectRef.current({ kind: 'tower' });
        onToolChangeRef.current?.('select');
      }
      return;
    }

    if (currentTool === 'spawn') {
      const spawn = placeSpawnAt(snapped.x, snapped.y);
      const next = { ...env, spawn };
      envRef.current = next;
      onSelectRef.current({ kind: 'spawn' });
      onChangeRef.current(next);
      onToolChangeRef.current?.('select');
      return;
    }

    // Terrain endpoints are always grabbable when hills exist.
    const terrainEnd = hitTerrainEndpoint(env.terrain, world.x, world.y);
    if (terrainEnd && env.terrain) {
      onSelectRef.current({ kind: 'terrain' });
      dragRef.current = {
        kind: 'resizeTerrain',
        endpoint: terrainEnd,
        moved: false,
      };
      return;
    }

    // Select tool
    const sel = selectionRef.current;
    const fp = selectionFootprint(env, sel);
    if (
      fp &&
      sel &&
      (sel.kind === 'obstacle' ||
        sel.kind === 'tower' ||
        sel.kind === 'region' ||
        sel.kind === 'marker')
    ) {
      const handles =
        sel.kind === 'tower'
          ? towerHandles()
          : sel.kind === 'region'
            ? regionHandles()
            : sel.kind === 'marker'
              ? markerHandles()
              : (() => {
                const o = env.obstacles.find((x) => x.id === sel.id);
                return o ? obstacleHandles(o) : [];
              })();
      const handle = hitHandle(
        world.x,
        world.y,
        fp,
        handles,
        HANDLE_HIT_R,
      );
      if (handle) {
        if (sel.kind === 'tower') {
          if (
            handle === 'towerLeft' ||
            handle === 'towerRight' ||
            handle === 'towerTop'
          ) {
            dragRef.current = {
              kind: 'resizeTower',
              handle,
              moved: false,
            };
          }
        } else if (sel.kind === 'region') {
          if (
            handle === 'nw' ||
            handle === 'ne' ||
            handle === 'sw' ||
            handle === 'se'
          ) {
            dragRef.current = {
              kind: 'resizeRegion',
              id: sel.id,
              handle,
              moved: false,
            };
          }
        } else if (sel.kind === 'marker') {
          if (
            handle === 'nw' ||
            handle === 'ne' ||
            handle === 'sw' ||
            handle === 'se'
          ) {
            dragRef.current = {
              kind: 'resizeMarker',
              id: sel.id,
              handle,
              moved: false,
            };
          }
        } else if (handle === 'rotate') {
          dragRef.current = {
            kind: 'rotateObstacle',
            id: sel.id,
            moved: false,
          };
        } else if (
          handle === 'nw' ||
          handle === 'ne' ||
          handle === 'sw' ||
          handle === 'se'
        ) {
          dragRef.current = {
            kind: 'resizeObstacle',
            id: sel.id,
            handle,
            moved: false,
          };
        }
        return;
      }
    }

    const hit = hitTestEnv(env, world.x, world.y);
    onSelectRef.current(hit);
    if (hit?.kind === 'obstacle') {
      dragRef.current = {
        kind: 'moveObstacle',
        id: hit.id,
        lastX: world.x,
        lastY: world.y,
        moved: false,
      };
    } else if (hit?.kind === 'region') {
      dragRef.current = {
        kind: 'moveRegion',
        id: hit.id,
        lastX: world.x,
        lastY: world.y,
        moved: false,
      };
    } else if (hit?.kind === 'marker') {
      dragRef.current = {
        kind: 'moveMarker',
        id: hit.id,
        lastX: world.x,
        lastY: world.y,
        moved: false,
      };
    } else if (hit?.kind === 'tower') {
      dragRef.current = {
        kind: 'moveTower',
        lastX: world.x,
        moved: false,
      };
    } else if (hit?.kind === 'spawn') {
      dragRef.current = {
        kind: 'moveSpawn',
        lastX: world.x,
        lastY: world.y,
        moved: false,
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

    const drag = dragRef.current;
    if (!drag) return;

    const { x, y, w, h } = clientToLocal(e);
    const world = screenToWorld(camRef.current, w, h, x, y);
    let env = envRef.current;

    if (drag.kind === 'moveObstacle') {
      let dx = world.x - drag.lastX;
      let dy = world.y - drag.lastY;
      if (snapRef.current) {
        const o = env.obstacles.find((ob) => ob.id === drag.id);
        if (o) {
          const snapped = snapToGrid(o.x + dx, o.y + dy, true);
          dx = snapped.x - o.x;
          dy = snapped.y - o.y;
        }
      }
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return;
      env = {
        ...env,
        obstacles: env.obstacles.map((o) =>
          o.id === drag.id ? moveObstacle(o, dx, dy) : o,
        ),
      };
      drag.lastX = world.x;
      drag.lastY = world.y;
      drag.moved = true;
      envRef.current = env;
      return;
    }

    if (drag.kind === 'moveRegion') {
      let dx = world.x - drag.lastX;
      let dy = world.y - drag.lastY;
      const regions = env.regions ?? [];
      if (snapRef.current) {
        const r = regions.find((reg) => reg.id === drag.id);
        if (r) {
          const snapped = snapToGrid(r.x + dx, r.y + dy, true);
          dx = snapped.x - r.x;
          dy = snapped.y - r.y;
        }
      }
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return;
      env = {
        ...env,
        regions: regions.map((r) =>
          r.id === drag.id ? moveRegion(r, dx, dy) : r,
        ),
      };
      drag.lastX = world.x;
      drag.lastY = world.y;
      drag.moved = true;
      envRef.current = env;
      return;
    }

    if (drag.kind === 'moveMarker') {
      let dx = world.x - drag.lastX;
      let dy = world.y - drag.lastY;
      const markers = env.markers ?? [];
      if (snapRef.current) {
        const m = markers.find((mark) => mark.id === drag.id);
        if (m) {
          const snapped = snapToGrid(m.x + dx, m.y + dy, true);
          dx = snapped.x - m.x;
          dy = snapped.y - m.y;
        }
      }
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return;
      env = {
        ...env,
        markers: markers.map((m) =>
          m.id === drag.id ? moveMarker(m, dx, dy) : m,
        ),
      };
      drag.lastX = world.x;
      drag.lastY = world.y;
      drag.moved = true;
      envRef.current = env;
      return;
    }

    if (drag.kind === 'moveTower' && env.tower) {
      let dx = world.x - drag.lastX;
      if (snapRef.current) {
        const snapped = snapToGrid(env.tower.x + dx, 0, true);
        dx = snapped.x - env.tower.x;
      }
      if (Math.abs(dx) < 1e-9) return;
      env = { ...env, tower: moveTower(env.tower, dx) };
      drag.lastX = world.x;
      drag.moved = true;
      envRef.current = env;
      return;
    }

    if (drag.kind === 'moveSpawn') {
      const cur = resolveSpawn(env);
      let dx = world.x - drag.lastX;
      let dy = world.y - drag.lastY;
      if (snapRef.current) {
        const snapped = snapToGrid(cur.x + dx, cur.y + dy, true);
        dx = snapped.x - cur.x;
        dy = snapped.y - cur.y;
      }
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return;
      env = { ...env, spawn: moveSpawn(cur, dx, dy) };
      drag.lastX = world.x;
      drag.lastY = world.y;
      drag.moved = true;
      envRef.current = env;
      return;
    }

    if (drag.kind === 'resizeObstacle') {
      const snapped = snapToGrid(world.x, world.y, snapRef.current);
      env = {
        ...env,
        obstacles: env.obstacles.map((o) =>
          o.id === drag.id
            ? resizeObstacleByCorner(o, drag.handle, snapped.x, snapped.y)
            : o,
        ),
      };
      drag.moved = true;
      envRef.current = env;
      return;
    }

    if (drag.kind === 'resizeRegion') {
      const snapped = snapToGrid(world.x, world.y, snapRef.current);
      const regions = env.regions ?? [];
      env = {
        ...env,
        regions: regions.map((r) =>
          r.id === drag.id
            ? resizeRegionByCorner(r, drag.handle, snapped.x, snapped.y)
            : r,
        ),
      };
      drag.moved = true;
      envRef.current = env;
      return;
    }

    if (drag.kind === 'resizeMarker') {
      const snapped = snapToGrid(world.x, world.y, snapRef.current);
      const markers = env.markers ?? [];
      env = {
        ...env,
        markers: markers.map((m) =>
          m.id === drag.id
            ? resizeMarkerByCorner(m, drag.handle, snapped.x, snapped.y)
            : m,
        ),
      };
      drag.moved = true;
      envRef.current = env;
      return;
    }

    if (drag.kind === 'rotateObstacle') {
      env = {
        ...env,
        obstacles: env.obstacles.map((o) =>
          o.id === drag.id ? rotateObstacle(o, world.x, world.y) : o,
        ),
      };
      drag.moved = true;
      envRef.current = env;
      return;
    }

    if (drag.kind === 'resizeTower' && env.tower) {
      const snapped = snapToGrid(world.x, world.y, snapRef.current);
      env = {
        ...env,
        tower: resizeTowerByHandle(
          env.tower,
          drag.handle,
          snapped.x,
          snapped.y,
        ),
      };
      drag.moved = true;
      envRef.current = env;
      return;
    }

    if (drag.kind === 'resizeTerrain' && env.terrain) {
      const snapped = snapToGrid(world.x, world.y, snapRef.current);
      env = {
        ...env,
        terrain: setTerrainEndpoint(env.terrain, drag.endpoint, snapped.x),
      };
      drag.moved = true;
      envRef.current = env;
    }
  };

  const onPointerUp = () => {
    panRef.current.active = false;
    finishDrag();
  };

  return (
    <canvas
      ref={canvasRef}
      className="viewport-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={(e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        camRef.current.zoom = Math.max(
          16,
          Math.min(140, camRef.current.zoom * factor),
        );
      }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

function drawSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  fp: Footprint,
  sel: NonNullable<EnvSelection>,
  env: EnvironmentDesign,
): void {
  const corners: HandleId[] = ['nw', 'ne', 'se', 'sw'];
  ctx.save();
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.9)';
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

  const handles: HandleId[] =
    sel.kind === 'tower'
      ? towerHandles()
      : sel.kind === 'region'
        ? regionHandles()
        : sel.kind === 'marker'
          ? markerHandles()
          : sel.kind === 'obstacle'
            ? (() => {
              const o = env.obstacles.find((x) => x.id === sel.id);
              return o ? obstacleHandles(o) : corners;
            })()
          : [];

  for (const id of handles) {
    const p = handleWorldPos(fp, id);
    const s = worldToScreen(cam, w, h, p.x, p.y);
    if (id === 'rotate') {
      const topMid = localToWorld(0, fp.hh, fp);
      const a = worldToScreen(cam, w, h, topMid.x, topMid.y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(s.x, s.y);
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.7)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(180, 230, 255, 0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(40, 80, 120, 0.9)';
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(180, 230, 255, 0.95)';
      ctx.strokeStyle = 'rgba(40, 80, 120, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(s.x - 4, s.y - 4, 8, 8);
      ctx.strokeRect(s.x - 4, s.y - 4, 8, 8);
    }
  }
  ctx.restore();
}

function drawTerrainEndpoints(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  terrain: NonNullable<EnvironmentDesign['terrain']>,
  selected: boolean,
): void {
  ctx.save();
  for (const which of ['start', 'end'] as const) {
    const p = terrainEndpointWorld(terrain, which);
    const s = worldToScreen(cam, w, h, p.x, p.y);
    const ground = worldToScreen(cam, w, h, p.x, 0);
    ctx.strokeStyle = selected
      ? 'rgba(140, 220, 170, 0.9)'
      : 'rgba(110, 180, 140, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(ground.x, ground.y);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = selected
      ? 'rgba(160, 240, 190, 0.95)'
      : 'rgba(130, 200, 160, 0.9)';
    ctx.strokeStyle = 'rgba(30, 70, 50, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, selected ? 7 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = selected ? '#c8f0d8' : '#9bc4ae';
    ctx.fillText(which === 'start' ? 'Start' : 'End', s.x + 9, s.y - 8);
  }
  ctx.restore();
}

function drawSpawnMarker(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  spawn: { x: number; y: number },
  selected: boolean,
): void {
  const p = worldToScreen(cam, w, h, spawn.x, spawn.y);
  const r = Math.max(6, cam.zoom * 0.18);
  ctx.save();
  // Ground pin
  ctx.strokeStyle = selected
    ? 'rgba(255, 210, 90, 0.95)'
    : 'rgba(240, 180, 70, 0.85)';
  ctx.fillStyle = selected
    ? 'rgba(255, 210, 90, 0.35)'
    : 'rgba(240, 180, 70, 0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Crosshair
  ctx.beginPath();
  ctx.moveTo(p.x - r * 1.6, p.y);
  ctx.lineTo(p.x + r * 1.6, p.y);
  ctx.moveTo(p.x, p.y - r * 1.6);
  ctx.lineTo(p.x, p.y + r * 1.6);
  ctx.stroke();
  // Flag pole + banner
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x, p.y - r * 3.2);
  ctx.stroke();
  ctx.fillStyle = selected
    ? 'rgba(255, 200, 80, 0.9)'
    : 'rgba(230, 160, 50, 0.85)';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - r * 3.2);
  ctx.lineTo(p.x + r * 1.8, p.y - r * 2.6);
  ctx.lineTo(p.x, p.y - r * 2);
  ctx.closePath();
  ctx.fill();
  ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = selected ? '#ffe6a0' : '#d4a85a';
  ctx.fillText('Spawn', p.x + r * 2, p.y - r * 2.4);
  ctx.restore();
}
