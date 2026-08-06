import { useEffect, useRef } from 'react';
import type { AudioBands } from '../audio/audioAnalysis';
import {
  DEFAULT_DISCO_BALL_X,
  DEFAULT_DISCO_BALL_Y,
  DISCO_CAM_Y,
  DISCO_CAM_ZOOM_DEFAULT,
  DISCO_CAM_ZOOM_MIN,
} from '../physics/constants';
import { isFeatureEnabled } from '../port/featureFlags';
import { createCamera, screenToWorld, type Camera } from './Camera';
import {
  clampDiscoBallPos,
  clearDiscoCanvas,
  clearGreenscreenCanvas,
  drawDiscoFloor,
  drawDiscoLights,
  hitTestDiscoBall,
  type DiscoBallPos,
} from './discoFx';
import { applyVisualPoseSmoothing } from './poseInterpolate';
import { clearCanvas, drawGround, drawSnapshot } from './render';
import { drawSimAxisRulers } from './simRulers';
import type { Simulation, SimulationSnapshot } from './simulation';

const DEFAULT_CAM_ZOOM_MIN = 20;

export interface FramePerf {
  fps: number;
  frameMs: number;
}

export interface DiscoFxFrame {
  bands: AudioBands;
  timeSec: number;
}

interface Props {
  simulation: Simulation;
  onFrame?: (snap: SimulationSnapshot) => void;
  /** B9 — smoothed FPS / frame time from the render loop. */
  onPerf?: (perf: FramePerf) => void;
  /** When true, left/right arrows cycle focused creature in a live batch. */
  evolveFocusKeys?: boolean;
  /** Bottom chrome height in CSS px — keeps framing above the train dock. */
  viewportInsetBottom?: number;
  /** H2 — live audio bands for disco lighting / FX (null = off). */
  discoFxProvider?: (() => DiscoFxFrame | null) | null;
  /** Flat chroma-key green; disco ball only (no floor / wall neon). */
  greenscreen?: boolean;
  /** Disco ball world position (drag on canvas to move). */
  discoBallPos?: DiscoBallPos;
  onDiscoBallMoved?: (pos: DiscoBallPos) => void;
  /** Persist dancer X after grab/drop (active-slot index → world X). */
  onDiscoDancerPlaced?: (activeIndex: number, offsetX: number) => void;
}

type DragState =
  | { kind: 'pan'; lastX: number; lastY: number }
  | {
      kind: 'grabDancer';
      index: number;
      lastWorldX: number;
      lastWorldY: number;
    }
  | {
      kind: 'grabBall';
      lastWorldX: number;
      lastWorldY: number;
    }
  | null;

export function SimCanvas({
  simulation,
  onFrame,
  onPerf,
  evolveFocusKeys,
  viewportInsetBottom = 0,
  discoFxProvider = null,
  greenscreen = false,
  discoBallPos,
  onDiscoBallMoved,
  onDiscoDancerPlaced,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>(createCamera());
  const dragRef = useRef<DragState>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const onPerfRef = useRef(onPerf);
  onPerfRef.current = onPerf;
  const insetRef = useRef(viewportInsetBottom);
  insetRef.current = viewportInsetBottom;
  const discoFxRef = useRef(discoFxProvider);
  discoFxRef.current = discoFxProvider;
  const greenscreenRef = useRef(greenscreen);
  greenscreenRef.current = greenscreen;
  const ballPosRef = useRef<DiscoBallPos>({
    x: DEFAULT_DISCO_BALL_X,
    y: DEFAULT_DISCO_BALL_Y,
  });
  const discoBallPosPropRef = useRef(discoBallPos);
  discoBallPosPropRef.current = discoBallPos;
  const onBallMovedRef = useRef(onDiscoBallMoved);
  onBallMovedRef.current = onDiscoBallMoved;
  const onPlacedRef = useRef(onDiscoDancerPlaced);
  onPlacedRef.current = onDiscoDancerPlaced;
  const discoOverviewAppliedRef = useRef(false);
  const fpsEmaRef = useRef(60);
  const msEmaRef = useRef(16);

  // Keep draw position in sync when parent updates (and not mid-drag).
  useEffect(() => {
    if (dragRef.current?.kind === 'grabBall') return;
    if (discoBallPos) {
      ballPosRef.current = clampDiscoBallPos(discoBallPos.x, discoBallPos.y);
    } else {
      ballPosRef.current = {
        x: DEFAULT_DISCO_BALL_X,
        y: DEFAULT_DISCO_BALL_Y,
      };
    }
  }, [discoBallPos]);

  useEffect(() => {
    if (!evolveFocusKeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ']') {
        e.preventDefault();
        simulation.focusNextCreature();
      } else if (e.key === 'ArrowLeft' || e.key === '[') {
        e.preventDefault();
        simulation.focusPrevCreature();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [evolveFocusKeys, simulation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const frameMs = Math.max(0, dt * 1000);
      const instFps = dt > 1e-4 ? 1 / dt : 60;
      fpsEmaRef.current = fpsEmaRef.current * 0.9 + instFps * 0.1;
      msEmaRef.current = msEmaRef.current * 0.9 + frameMs * 0.1;
      if (isFeatureEnabled('performanceDiagnostics')) {
        onPerfRef.current?.({
          fps: fpsEmaRef.current,
          frameMs: msEmaRef.current,
        });
      }
      const rawSnap = simulation.step(dt);
      const snap =
        isFeatureEnabled('visualPoseInterpolation')
          ? applyVisualPoseSmoothing(rawSnap, rawSnap.extrapolateDt)
          : rawSnap;
      onFrameRef.current?.(rawSnap);

      const cam = camRef.current;
      cam.insetBottom = insetRef.current;

      const discoFx =
        isFeatureEnabled('discoMode') && discoFxRef.current
          ? discoFxRef.current()
          : null;

      if (discoFx) {
        if (!discoOverviewAppliedRef.current) {
          cam.x = 0;
          cam.y = DISCO_CAM_Y;
          cam.zoom = DISCO_CAM_ZOOM_DEFAULT;
          discoOverviewAppliedRef.current = true;
        }
      } else {
        discoOverviewAppliedRef.current = false;
      }

      // Disco uses a fixed arena overview; skip creature follow so zoom-out sticks.
      const dragging = dragRef.current !== null;
      if (snap.cameraFollow && !dragging && !discoFx) {
        // Soft follow focused creature (Keiwan-style locked camera).
        const k = 1 - Math.exp(-6 * Math.min(dt, 0.05));
        cam.x += (snap.focusX - cam.x) * k;
        cam.y += (snap.focusY - cam.y) * k;
      }

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const useGreenscreen = greenscreenRef.current;
      if (discoFx && useGreenscreen) {
        clearGreenscreenCanvas(ctx, w, h);
      } else if (discoFx) {
        clearDiscoCanvas(ctx, w, h, discoFx.bands, discoFx.timeSec);
        drawGround(ctx, cam, w, h);
        drawDiscoFloor(ctx, cam, w, h, discoFx.bands, discoFx.timeSec);
      } else if (useGreenscreen) {
        clearGreenscreenCanvas(ctx, w, h);
      } else {
        clearCanvas(ctx, w, h);
        drawGround(ctx, cam, w, h);
      }
      // Axis rulers off in Disco — the arena overview is the framing cue.
      if (isFeatureEnabled('simAxisRulers') && !discoFx && !useGreenscreen) {
        drawSimAxisRulers(ctx, cam, w, h);
      }
      drawSnapshot(ctx, cam, w, h, snap, {
        skipScenery: useGreenscreen,
      });
      if (discoFx) {
        if (dragRef.current?.kind !== 'grabBall') {
          const prop = discoBallPosPropRef.current;
          if (prop) {
            ballPosRef.current = clampDiscoBallPos(prop.x, prop.y);
          }
        }
        drawDiscoLights(ctx, cam, w, h, discoFx.bands, discoFx.timeSec, {
          ballOnly: useGreenscreen,
          ballPos: ballPosRef.current,
        });
      }

      // Generation / focus HUD overlay during live evolve
      if (snap.evolve?.running) {
        drawEvolveHud(ctx, w, snap);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [simulation]);

  const pointerWorld = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(
      camRef.current,
      rect.width,
      rect.height,
      e.clientX - rect.left,
      e.clientY - rect.top,
    );
  };

  const pointerScreen = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    canvas?.setPointerCapture(e.pointerId);

    // LMB: disco ball → dancers → pan.
    if (
      e.button === 0 &&
      isFeatureEnabled('discoMode') &&
      discoFxRef.current
    ) {
      const world = pointerWorld(e);
      const screen = pointerScreen(e);
      const rect = canvas?.getBoundingClientRect();
      if (
        rect &&
        hitTestDiscoBall(
          camRef.current,
          rect.width,
          rect.height,
          screen.x,
          screen.y,
          ballPosRef.current,
        )
      ) {
        if (e.detail >= 2) {
          // Double-click resets the ball to the default stage position.
          const reset = clampDiscoBallPos(
            DEFAULT_DISCO_BALL_X,
            DEFAULT_DISCO_BALL_Y,
          );
          ballPosRef.current = reset;
          onBallMovedRef.current?.(reset);
          dragRef.current = null;
          if (canvas) canvas.style.cursor = 'grab';
          return;
        }
        dragRef.current = {
          kind: 'grabBall',
          lastWorldX: world.x,
          lastWorldY: world.y,
        };
        if (canvas) canvas.style.cursor = 'grabbing';
        return;
      }

      if (simulation.isMultiDisco) {
        const hit = simulation.hitTestDiscoDancer(world.x, world.y);
        if (hit !== null) {
          dragRef.current = {
            kind: 'grabDancer',
            index: hit,
            lastWorldX: world.x,
            lastWorldY: world.y,
          };
          return;
        }
      }
    }

    if (e.button === 0 || e.button === 1 || e.button === 2) {
      dragRef.current = {
        kind: 'pan',
        lastX: e.clientX,
        lastY: e.clientY,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;

    if (!drag) {
      // Hover cursor over the ball when idle in disco.
      if (
        canvas &&
        isFeatureEnabled('discoMode') &&
        discoFxRef.current &&
        e.buttons === 0
      ) {
        const screen = pointerScreen(e);
        const rect = canvas.getBoundingClientRect();
        const over = hitTestDiscoBall(
          camRef.current,
          rect.width,
          rect.height,
          screen.x,
          screen.y,
          ballPosRef.current,
        );
        canvas.style.cursor = over ? 'grab' : '';
      }
      return;
    }

    if (drag.kind === 'grabBall') {
      const world = pointerWorld(e);
      const dx = world.x - drag.lastWorldX;
      const dy = world.y - drag.lastWorldY;
      drag.lastWorldX = world.x;
      drag.lastWorldY = world.y;
      const next = clampDiscoBallPos(
        ballPosRef.current.x + dx,
        ballPosRef.current.y + dy,
      );
      ballPosRef.current = next;
      onBallMovedRef.current?.(next);
      return;
    }

    if (drag.kind === 'grabDancer') {
      const world = pointerWorld(e);
      const dx = world.x - drag.lastWorldX;
      const dy = world.y - drag.lastWorldY;
      drag.lastWorldX = world.x;
      drag.lastWorldY = world.y;
      simulation.translateDiscoDancer(drag.index, dx, dy);
      return;
    }

    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    camRef.current.x -= dx / camRef.current.zoom;
    camRef.current.y += dy / camRef.current.zoom;
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (drag?.kind === 'grabDancer') {
      const center = simulation.discoDancerCenter(drag.index);
      if (center) onPlacedRef.current?.(drag.index, center.x);
    }
    if (drag?.kind === 'grabBall') {
      onBallMovedRef.current?.(ballPosRef.current);
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = 'grab';
    }
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const zoomMin =
      isFeatureEnabled('discoMode') && discoFxRef.current
        ? DISCO_CAM_ZOOM_MIN
        : DEFAULT_CAM_ZOOM_MIN;
    camRef.current.zoom = Math.max(
      zoomMin,
      Math.min(120, camRef.current.zoom * factor),
    );
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

function drawEvolveHud(
  ctx: CanvasRenderingContext2D,
  w: number,
  snap: SimulationSnapshot,
): void {
  const e = snap.evolve;
  if (!e) return;
  const batchLabel =
    e.batchCount && e.batchCount > 1
      ? ` · batch ${e.batch}/${e.batchCount}`
      : '';
  const focusN = (e.focusIndex ?? 0) + 1;
  const cohortN = e.cohortSize ?? snap.agents.length;
  const t = e.episodeT ?? 0;
  const T = e.episodeDuration ?? 10;
  const line1 = `Generation ${e.generation}${batchLabel}`;
  const line2 = `Watching ${focusN}/${cohortN}  ·  t ${t.toFixed(1)}/${T.toFixed(0)}s  ·  best ${e.bestFitness.toFixed(2)}`;

  ctx.save();
  ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(13, 18, 26, 0.55)';
  ctx.fillRect(12, 12, Math.min(w - 24, 420), 52);
  ctx.fillStyle = '#e6ebf2';
  ctx.fillText(line1, 22, 34);
  ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#8a96a8';
  ctx.fillText(line2, 22, 52);
  ctx.restore();
}
