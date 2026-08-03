import { useEffect, useRef } from 'react';
import { isFeatureEnabled } from '../port/featureFlags';
import { createCamera, type Camera } from './Camera';
import { applyVisualPoseSmoothing } from './poseInterpolate';
import { clearCanvas, drawGround, drawSnapshot } from './render';
import { drawSimAxisRulers } from './simRulers';
import type { Simulation, SimulationSnapshot } from './simulation';

interface Props {
  simulation: Simulation;
  onFrame?: (snap: SimulationSnapshot) => void;
  /** When true, left/right arrows cycle focused creature in a live batch. */
  evolveFocusKeys?: boolean;
  /** Bottom chrome height in CSS px — keeps framing above the train dock. */
  viewportInsetBottom?: number;
}

export function SimCanvas({
  simulation,
  onFrame,
  evolveFocusKeys,
  viewportInsetBottom = 0,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>(createCamera());
  const dragRef = useRef({ panning: false, lastX: 0, lastY: 0 });
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const insetRef = useRef(viewportInsetBottom);
  insetRef.current = viewportInsetBottom;

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
      const rawSnap = simulation.step(dt);
      const snap =
        isFeatureEnabled('visualPoseInterpolation')
          ? applyVisualPoseSmoothing(rawSnap, rawSnap.extrapolateDt)
          : rawSnap;
      onFrameRef.current?.(rawSnap);

      const cam = camRef.current;
      cam.insetBottom = insetRef.current;

      if (snap.cameraFollow && !dragRef.current.panning) {
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

      clearCanvas(ctx, w, h);
      drawGround(ctx, cam, w, h);
      if (isFeatureEnabled('simAxisRulers')) {
        drawSimAxisRulers(ctx, cam, w, h);
      }
      drawSnapshot(ctx, cam, w, h, snap);

      // Generation / focus HUD overlay during live evolve
      if (snap.evolve?.running) {
        drawEvolveHud(ctx, w, snap);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [simulation]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      canvasRef.current?.setPointerCapture(e.pointerId);
      dragRef.current = { panning: true, lastX: e.clientX, lastY: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.panning) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    camRef.current.x -= dx / camRef.current.zoom;
    camRef.current.y += dy / camRef.current.zoom;
  };

  const onPointerUp = () => {
    dragRef.current.panning = false;
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
  const cohortN = snap.agents.length;
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
