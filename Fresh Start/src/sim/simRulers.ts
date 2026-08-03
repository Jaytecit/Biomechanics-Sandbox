/**
 * A6 — world-space height / horizontal rulers (render-only).
 */
import { type Camera, worldToScreen } from './Camera';

export function drawSimAxisRulers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
): void {
  const origin = worldToScreen(cam, w, h, 0, 0);
  ctx.save();
  ctx.strokeStyle = 'rgba(212, 160, 74, 0.55)';
  ctx.fillStyle = 'rgba(230, 235, 242, 0.75)';
  ctx.lineWidth = 1;
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';

  // Horizontal axis (y = 0 ground)
  ctx.beginPath();
  ctx.moveTo(0, origin.y);
  ctx.lineTo(w, origin.y);
  ctx.stroke();

  // Vertical axis (x = 0)
  ctx.beginPath();
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, h);
  ctx.stroke();

  // Tick marks in world units (1.0)
  const tickWorld = 1;
  const left = (-cam.x * cam.zoom + w / 2) / cam.zoom; // unused; use screen span
  void left;
  const fh = Math.max(1, h - (cam.insetBottom ?? 0));
  const worldLeft = cam.x - w / (2 * cam.zoom);
  const worldRight = cam.x + w / (2 * cam.zoom);
  const worldBottom = cam.y - fh / (2 * cam.zoom);
  const worldTop = cam.y + fh / (2 * cam.zoom);

  const x0 = Math.floor(worldLeft / tickWorld) * tickWorld;
  for (let x = x0; x <= worldRight + tickWorld; x += tickWorld) {
    const p = worldToScreen(cam, w, h, x, 0);
    ctx.beginPath();
    ctx.moveTo(p.x, origin.y - 4);
    ctx.lineTo(p.x, origin.y + 4);
    ctx.stroke();
    if (Math.abs(x) > 0.01) {
      ctx.fillText(x.toFixed(0), p.x + 2, origin.y - 6);
    }
  }

  const y0 = Math.floor(worldBottom / tickWorld) * tickWorld;
  for (let y = y0; y <= worldTop + tickWorld; y += tickWorld) {
    const p = worldToScreen(cam, w, h, 0, y);
    ctx.beginPath();
    ctx.moveTo(origin.x - 4, p.y);
    ctx.lineTo(origin.x + 4, p.y);
    ctx.stroke();
    if (Math.abs(y) > 0.01) {
      ctx.fillText(y.toFixed(0), origin.x + 6, p.y - 2);
    }
  }

  ctx.restore();
}
