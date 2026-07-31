/**
 * Shared sim axis ruler spacing and canvas drawing (Visualizer + Environment Studio).
 * Height labels are world px above GROUND_Y; horizontal labels are world X px.
 */

import { CREATURE_WORLD_SCALE } from './creatureScale';

export const SIM_RULER_WIDTH = 46;
export const SIM_RULER_HEIGHT = 28;

export interface ViewBoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tick spacing in world px, scaled by effective zoom (plot px / world px). */
export function simRulerIntervals(zoom: number): { minor: number; major: number } {
  const z = zoom * CREATURE_WORLD_SCALE;
  if (z >= 0.7) return { minor: 25, major: 50 };
  if (z >= 0.35) return { minor: 50, major: 100 };
  if (z >= 0.15) return { minor: 100, major: 200 };
  if (z >= 0.08) return { minor: 200, major: 500 };
  return { minor: 500, major: 1000 };
}

function worldToPlotX(worldX: number, viewBox: ViewBoxRect, plotWidth: number): number {
  return ((worldX - viewBox.x) / viewBox.width) * plotWidth;
}

function worldToPlotY(worldY: number, viewBox: ViewBoxRect, plotHeight: number): number {
  return ((worldY - viewBox.y) / viewBox.height) * plotHeight;
}

/** Left-edge height ruler for a fixed world viewBox (Environment Studio). */
export function drawViewBoxHeightRuler(
  ctx: CanvasRenderingContext2D,
  plotHeight: number,
  viewBox: ViewBoxRect,
  groundY: number,
  zoom: number
) {
  const { minor, major } = simRulerIntervals(zoom);
  const rulerWidth = SIM_RULER_WIDTH;
  const maxH = Math.max(0, groundY - viewBox.y);
  const minH = Math.max(0, groundY - (viewBox.y + viewBox.height));

  ctx.clearRect(0, 0, rulerWidth, plotHeight);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.58)';
  ctx.fillRect(0, 0, rulerWidth, plotHeight);
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rulerWidth - 0.5, 0);
  ctx.lineTo(rulerWidth - 0.5, plotHeight);
  ctx.stroke();

  const hStart = Math.floor(minH / minor) * minor;
  const hEnd = Math.ceil(maxH / minor) * minor;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let h = hStart; h <= hEnd; h += minor) {
    if (h < 0) continue;
    const worldY = groundY - h;
    const sy = worldToPlotY(worldY, viewBox, plotHeight);
    if (sy < -6 || sy > plotHeight + 6) continue;
    const isMajor = h % major === 0;
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
}

/** Bottom horizontal ruler for a fixed world viewBox (Environment Studio). */
export function drawViewBoxHorizontalRuler(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  viewBox: ViewBoxRect,
  zoom: number
) {
  const { minor, major } = simRulerIntervals(zoom);
  const rulerHeight = SIM_RULER_HEIGHT;

  ctx.clearRect(0, 0, plotWidth, rulerHeight);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.58)';
  ctx.fillRect(0, 0, plotWidth, rulerHeight);
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.lineTo(plotWidth, 0.5);
  ctx.stroke();

  const xStart = Math.floor(viewBox.x / minor) * minor;
  const xEnd = Math.ceil((viewBox.x + viewBox.width) / minor) * minor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let x = xStart; x <= xEnd; x += minor) {
    const sx = worldToPlotX(x, viewBox, plotWidth);
    if (sx < -6 || sx > plotWidth + 6) continue;
    const isMajor = x % major === 0;
    ctx.strokeStyle = isMajor ? '#94a3b8' : '#64748b';
    ctx.beginPath();
    ctx.moveTo(sx, isMajor ? 10 : 16);
    ctx.lineTo(sx, rulerHeight - 1);
    ctx.stroke();
    if (isMajor) {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 9px ui-sans-serif, system-ui';
      ctx.fillText(`${x}`, sx, 2);
    }
  }

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 8px ui-sans-serif, system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('X px', 6, rulerHeight - 2);
}
