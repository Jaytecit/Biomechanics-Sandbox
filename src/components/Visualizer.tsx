/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { Creature, Obstacle, EvolutionGoal, WorldObject, isRigidBone, resolveLinkKind, findParallelHardLink, effectiveAeroArea } from '../types';
import { GROUND_Y } from '../physics';
import {
  parseProceduralTerrain,
  proceduralTerrainSurfaceY,
  TERRAIN_RENDER_STEP,
} from '../terrain';
import { drawChuteString } from '../aero';
import { getGoalInfo } from '../goalCatalog';
import { GoalInfoDialog } from './GoalInfoCard';
import { RewardsBreakdownPanel } from './RewardsBreakdownPanel';
import { AppearanceRig } from '../creaturePackages';
import { drawAppearance, initBodyPartAssets } from '../appearance';
import { EnvironmentTheme } from '../environments';
import { normalizeSolidSegments, solidNodeIdSet } from '../solidSegments';
import {
  isPerformanceDiagnosticsActive,
  recordRendererFrame,
} from '../performanceDiagnostics';
import type { RewardBreakdown } from '../rewardBreakdown';
import {
  Flag,
  Trophy,
  Target,
  Award,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  EyeOff,
  Package,
  Circle,
  Info,
  Gauge,
  Users,
  User,
  Play,
  Pause,
  SkipForward,
  Settings,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

/** Stable 0–1 hash for irregular backdrop placement (no regular lattice → less strobe). */
function backdropHash(n: number, salt = 0): number {
  const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/** Zoom +/− / scroll step: 5% of default. */
const VISUALIZER_ZOOM_STEP = 0.05;
/** Zoom range: 5% (zoomed out) … 100% (default / max zoom in). */
const VISUALIZER_ZOOM_MIN = 0.05;
const VISUALIZER_ZOOM_MAX = 1.0;

/** Tick spacing for the left-edge height ruler (world px), scaled by zoom. */
function heightRulerIntervals(zoom: number): { minor: number; major: number } {
  if (zoom >= 0.7) return { minor: 25, major: 50 };
  if (zoom >= 0.35) return { minor: 50, major: 100 };
  if (zoom >= 0.15) return { minor: 100, major: 200 };
  if (zoom >= 0.08) return { minor: 200, major: 500 };
  return { minor: 500, major: 1000 };
}

/**
 * Screen-space height ruler along the left edge of the sim visualizer.
 * Labels are world px above GROUND_Y so creature / flight height is readable at any zoom.
 */
function drawSimHeightRuler(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  camY: number,
  zoom: number,
  groundY: number
) {
  const centerY = canvasHeight / 2;
  const worldToScreenY = (wy: number) => centerY + (wy - camY - centerY) * zoom;
  const screenToWorldY = (sy: number) => camY + centerY + (sy - centerY) / zoom;

  const groundSy = worldToScreenY(groundY);
  const maxH = Math.max(0, groundY - screenToWorldY(0));
  const minH = Math.min(0, groundY - screenToWorldY(canvasHeight));
  const { minor, major } = heightRulerIntervals(zoom);
  const rulerWidth = 46;

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.58)';
  ctx.fillRect(0, 0, rulerWidth, canvasHeight);
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rulerWidth - 0.5, 0);
  ctx.lineTo(rulerWidth - 0.5, canvasHeight);
  ctx.stroke();

  const hStart = Math.floor(minH / minor) * minor;
  const hEnd = Math.ceil(maxH / minor) * minor;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let h = hStart; h <= hEnd; h += minor) {
    if (h < 0) continue;
    const sy = groundSy - h * zoom;
    if (sy < -6 || sy > canvasHeight + 6) continue;
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
  ctx.restore();
}

function backdropHash2(ix: number, iy: number, salt = 0): number {
  return backdropHash(ix * 73856093 ^ iy * 19349663, salt);
}

/**
 * Sky + ground scenery. Sky features are placed in world space so they remain
 * visible at any flight altitude (not only near the floor).
 */
function drawMotionBackdrop(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  bgLeft: number,
  bgTop: number,
  bgWidth: number,
  bgHeight: number,
  groundY: number,
  drawGroundScenery = true
) {
  const bgBottom = bgTop + bgHeight;
  const viewMidY = bgTop + bgHeight * 0.5;
  const altitude = Math.max(0, groundY - viewMidY); // px above ground

  // --- Full-viewport sky (deepens with altitude) ---
  const skyGrad = ctx.createLinearGradient(0, bgTop, 0, Math.min(bgBottom, groundY + 40));
  const t = Math.min(1, altitude / 6000);
  // Near ground: pale; high up: deeper indigo / dusk
  const topR = Math.round(238 - t * 100);
  const topG = Math.round(242 - t * 90);
  const topB = Math.round(255 - t * 40);
  const midR = Math.round(241 - t * 70);
  const midG = Math.round(245 - t * 60);
  const midB = Math.round(249 - t * 20);
  skyGrad.addColorStop(0, `rgb(${topR},${topG},${topB})`);
  skyGrad.addColorStop(0.55, `rgb(${midR},${midG},${midB})`);
  skyGrad.addColorStop(1, altitude > 2000 ? '#c7d2fe' : '#e2e8f0');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(bgLeft, bgTop, bgWidth, bgHeight);

  // Soft vertical haze bands (irregular Y) — motion cue while climbing
  const hazeBucket = 380;
  const hz0 = Math.floor(bgTop / hazeBucket) - 1;
  const hz1 = Math.ceil(bgBottom / hazeBucket) + 1;
  for (let b = hz0; b <= hz1; b++) {
    if (backdropHash(b, 50) < 0.35) continue;
    const y = b * hazeBucket + backdropHash(b, 51) * 120;
    const h = 18 + backdropHash(b, 52) * 40;
    const alpha = 0.04 + backdropHash(b, 53) * 0.07;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(bgLeft, y, bgWidth, h);
  }

  // --- High sky: sparse stars / sparkles (fade in with altitude) ---
  const starAlpha = Math.min(0.85, Math.max(0, (altitude - 400) / 3500));
  if (starAlpha > 0.02) {
    const starBucket = 90;
    const sx0 = Math.floor(bgLeft / starBucket) - 1;
    const sx1 = Math.ceil((bgLeft + bgWidth) / starBucket) + 1;
    const sy0 = Math.floor(bgTop / starBucket) - 1;
    const sy1 = Math.ceil(bgBottom / starBucket) + 1;
    for (let ix = sx0; ix <= sx1; ix++) {
      for (let iy = sy0; iy <= sy1; iy++) {
        // Skip near-ground cells so stars don't litter the meadow
        const cellY = iy * starBucket;
        if (cellY > groundY - 500) continue;
        if (backdropHash2(ix, iy, 60) < 0.72) continue;
        const x = ix * starBucket + backdropHash2(ix, iy, 61) * starBucket;
        const y = iy * starBucket + backdropHash2(ix, iy, 62) * starBucket;
        const r = 0.6 + backdropHash2(ix, iy, 63) * 1.8;
        const a = starAlpha * (0.35 + backdropHash2(ix, iy, 64) * 0.65);
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (backdropHash2(ix, iy, 65) > 0.85) {
          ctx.strokeStyle = `rgba(199,210,254,${a * 0.8})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(x - r * 2.2, y);
          ctx.lineTo(x + r * 2.2, y);
          ctx.moveTo(x, y - r * 2.2);
          ctx.lineTo(x, y + r * 2.2);
          ctx.stroke();
        }
      }
    }
  }

  // --- Cloud decks at fixed world altitudes (fly through different layers) ---
  // Parallax `p` is camera-follow amount: screen scroll ≈ (1-p). Near → small p (fast), far → large p (slow).
  const cloudDecks = [
    { y: groundY - 420, parallax: 0.08, scale: 1, alpha: 0.5 },
    { y: groundY - 1100, parallax: 0.18, scale: 1.25, alpha: 0.45 },
    { y: groundY - 2400, parallax: 0.32, scale: 1.5, alpha: 0.4 },
    { y: groundY - 4800, parallax: 0.48, scale: 1.8, alpha: 0.38 },
    { y: groundY - 9000, parallax: 0.62, scale: 2.2, alpha: 0.35 },
    { y: groundY - 16000, parallax: 0.78, scale: 2.6, alpha: 0.32 },
  ];
  for (let d = 0; d < cloudDecks.length; d++) {
    const deck = cloudDecks[d];
    // Only draw decks near the current view (with margin)
    if (deck.y < bgTop - 200 || deck.y > bgBottom + 200) continue;
    const parallax = camX * deck.parallax;
    const bucket = Math.round(200 * deck.scale);
    const c0 = Math.floor((bgLeft - parallax) / bucket) - 1;
    const c1 = Math.ceil((bgLeft + bgWidth - parallax) / bucket) + 1;
    for (let b = c0; b <= c1; b++) {
      if (backdropHash(b + d * 97, 70) < 0.4) continue;
      const cx = b * bucket + backdropHash(b, 71 + d) * bucket * 0.7 + parallax;
      const cy = deck.y + (backdropHash(b, 72 + d) - 0.5) * 80 * deck.scale;
      const w = (50 + backdropHash(b, 73 + d) * 90) * deck.scale;
      const h = (12 + backdropHash(b, 74 + d) * 20) * deck.scale;
      ctx.fillStyle = `rgba(255,255,255,${deck.alpha})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - w * 0.4, cy + 3, w * 0.5, h * 0.75, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + w * 0.45, cy + 2, w * 0.55, h * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Distant floating haze “islands” (any altitude, slow parallax) ---
  const islandBucketX = 320;
  const islandBucketY = 450;
  const islandParallax = 0.88; // high follow → slow on-screen drift
  const ix0 = Math.floor((bgLeft - camX * islandParallax) / islandBucketX) - 1;
  const ix1 = Math.ceil((bgLeft + bgWidth - camX * islandParallax) / islandBucketX) + 1;
  const iy0 = Math.floor(bgTop / islandBucketY) - 1;
  const iy1 = Math.ceil(bgBottom / islandBucketY) + 1;
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iy = iy0; iy <= iy1; iy++) {
      const cellY = iy * islandBucketY;
      if (cellY > groundY - 300) continue;
      if (backdropHash2(ix, iy, 80) < 0.78) continue;
      const x = ix * islandBucketX + backdropHash2(ix, iy, 81) * 160 + camX * islandParallax;
      const y = cellY + backdropHash2(ix, iy, 82) * 200;
      const rw = 30 + backdropHash2(ix, iy, 83) * 70;
      const rh = 8 + backdropHash2(ix, iy, 84) * 18;
      ctx.fillStyle = `rgba(165,180,252,${0.12 + backdropHash2(ix, iy, 85) * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, backdropHash2(ix, iy, 86) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Ground-relative scenery (only when the floor is in/near view) ---
  if (
    drawGroundScenery &&
    groundY < bgBottom + 80 &&
    groundY > bgTop - 40
  ) {
    // Far hills (slow) → mid ridge → near props (fast). Higher follow-p = slower scroll.
    const hillParallax = camX * 0.55;
    ctx.beginPath();
    const hillStart = Math.floor((bgLeft - hillParallax) / 180) * 180;
    const hillEnd = bgLeft + bgWidth - hillParallax + 200;
    ctx.moveTo(hillStart + hillParallax, groundY);
    for (let x = hillStart; x <= hillEnd; x += 40) {
      const h =
        28 +
        backdropHash(x, 1) * 55 +
        Math.sin(x * 0.011 + 0.4) * 18 +
        Math.sin(x * 0.0037) * 30;
      ctx.lineTo(x + hillParallax, groundY - h);
    }
    ctx.lineTo(hillEnd + hillParallax, groundY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.fill();

    const ridgeParallax = camX * 0.38;
    ctx.beginPath();
    const ridgeStart = Math.floor((bgLeft - ridgeParallax) / 140) * 140;
    const ridgeEnd = bgLeft + bgWidth - ridgeParallax + 160;
    ctx.moveTo(ridgeStart + ridgeParallax, groundY);
    for (let x = ridgeStart; x <= ridgeEnd; x += 32) {
      const h = 12 + backdropHash(x, 2) * 34 + Math.sin(x * 0.019 + 1.7) * 10;
      ctx.lineTo(x + ridgeParallax, groundY - h);
    }
    ctx.lineTo(ridgeEnd + ridgeParallax, groundY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(100, 116, 139, 0.22)';
    ctx.fill();

    // Mid-ground props
    const propParallax = camX * 0.22;
    const propBucket = 70;
    const p0 = Math.floor((bgLeft - propParallax) / propBucket) - 1;
    const p1 = Math.ceil((bgLeft + bgWidth - propParallax) / propBucket) + 1;
    for (let b = p0; b <= p1; b++) {
      const roll = backdropHash(b, 20);
      if (roll < 0.38) continue;
      const x = b * propBucket + backdropHash(b, 21) * (propBucket * 0.85) + propParallax;
      const kind = backdropHash(b, 22);
      if (kind < 0.4) {
        const trunkH = 10 + backdropHash(b, 23) * 16;
        const canopy = 8 + backdropHash(b, 24) * 14;
        ctx.fillStyle = '#78716c';
        ctx.fillRect(x - 1.5, groundY - trunkH, 3, trunkH);
        ctx.fillStyle = 'rgba(71, 85, 105, 0.55)';
        ctx.beginPath();
        ctx.moveTo(x, groundY - trunkH - canopy * 1.6);
        ctx.lineTo(x - canopy, groundY - trunkH + 2);
        ctx.lineTo(x + canopy, groundY - trunkH + 2);
        ctx.closePath();
        ctx.fill();
      } else if (kind < 0.7) {
        const h = 16 + backdropHash(b, 25) * 36;
        ctx.fillStyle = 'rgba(71, 85, 105, 0.4)';
        ctx.fillRect(x - 2, groundY - h, 4, h);
        ctx.fillStyle = 'rgba(51, 65, 85, 0.5)';
        ctx.fillRect(x - 3, groundY - h - 3, 6, 4);
      } else {
        const r = 5 + backdropHash(b, 26) * 9;
        ctx.fillStyle = 'rgba(120, 113, 108, 0.45)';
        ctx.beginPath();
        ctx.ellipse(x, groundY - r * 0.55, r, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Near grit
    const gritBucket = 28;
    const g0 = Math.floor(bgLeft / gritBucket) - 1;
    const g1 = Math.ceil((bgLeft + bgWidth) / gritBucket) + 1;
    for (let b = g0; b <= g1; b++) {
      if (backdropHash(b, 30) < 0.25) continue;
      const x = b * gritBucket + backdropHash(b, 31) * gritBucket;
      const yOff = backdropHash(b, 32) * 3;
      if (backdropHash(b, 33) < 0.55) {
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, groundY - 1 - yOff);
        ctx.lineTo(x + 1, groundY - 5 - backdropHash(b, 34) * 6 - yOff);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(120, 113, 108, 0.4)';
        ctx.beginPath();
        ctx.arc(x, groundY - 1.5 - yOff, 1.2 + backdropHash(b, 37) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Distance marks
    const markBucket = 160;
    const m0 = Math.floor(bgLeft / markBucket) - 1;
    const m1 = Math.ceil((bgLeft + bgWidth) / markBucket) + 1;
    ctx.font = '10px ui-sans-serif, system-ui';
    for (let b = m0; b <= m1; b++) {
      if (backdropHash(b, 40) < 0.35) continue;
      const x = Math.round(b * markBucket + backdropHash(b, 41) * 70);
      ctx.fillStyle = 'rgba(100, 116, 139, 0.55)';
      ctx.fillRect(x, groundY - 14, 2, 14);
      ctx.fillStyle = 'rgba(71, 85, 105, 0.7)';
      ctx.fillText(`${x}`, x + 4, groundY - 16);
    }
  }

  // Altitude readout cue when high (helps motion/orientation)
  if (altitude > 600) {
    const labelY = Math.max(bgTop + 24, Math.min(bgBottom - 24, viewMidY));
    ctx.fillStyle = 'rgba(67, 56, 202, 0.45)';
    ctx.font = 'bold 11px ui-sans-serif, system-ui';
    // Keep clear of the screen-space height ruler on the left edge
    ctx.fillText(`↑ ${Math.round(altitude)} px`, bgLeft + 70, labelY);
  }
}

/** Exotic-world Olympic broadcast layer — twin moons, aurora, distant ring motif. */
function drawOlympicExoticOverlay(
  ctx: CanvasRenderingContext2D,
  camX: number,
  bgLeft: number,
  bgTop: number,
  bgWidth: number,
  bgHeight: number,
  groundY: number
) {
  const bgBottom = bgTop + bgHeight;

  // Dusk-indigo sky wash over the default backdrop
  const skyWash = ctx.createLinearGradient(0, bgTop, 0, Math.min(bgBottom, groundY + 120));
  skyWash.addColorStop(0, 'rgba(49, 46, 129, 0.55)');
  skyWash.addColorStop(0.45, 'rgba(76, 29, 149, 0.28)');
  skyWash.addColorStop(1, 'rgba(13, 148, 136, 0.18)');
  ctx.fillStyle = skyWash;
  ctx.fillRect(bgLeft, bgTop, bgWidth, bgHeight);

  // Aurora ribbons (slow parallax)
  const auroraParallax = camX * 0.12;
  for (let band = 0; band < 4; band++) {
    const y = bgTop + 40 + band * 55 + backdropHash(band, 901) * 30;
    if (y > groundY - 200) continue;
    ctx.save();
    ctx.globalAlpha = 0.22 + backdropHash(band, 902) * 0.18;
    ctx.beginPath();
    const startX = bgLeft - auroraParallax + band * 40;
    ctx.moveTo(startX, y);
    for (let x = 0; x <= bgWidth + 80; x += 36) {
      const wave = Math.sin(x * 0.012 + band * 1.7) * 18 + backdropHash(band, 903 + x) * 10;
      ctx.lineTo(startX + x, y + wave);
    }
    const colors = ['#5eead4', '#a78bfa', '#fbbf24', '#f472b6'];
    ctx.strokeStyle = colors[band % colors.length];
    ctx.lineWidth = 14 + band * 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // Twin moons
  const moonParallax = camX * 0.06;
  const moons = [
    { x: bgLeft + bgWidth * 0.72 + moonParallax, y: bgTop + 58, r: 22, fill: '#fde68a', glow: 'rgba(251, 191, 36, 0.35)' },
    { x: bgLeft + bgWidth * 0.84 + moonParallax, y: bgTop + 92, r: 14, fill: '#c4b5fd', glow: 'rgba(167, 139, 250, 0.3)' },
  ];
  for (const moon of moons) {
    if (moon.y > groundY - 120) continue;
    ctx.fillStyle = moon.glow;
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, moon.r * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = moon.fill;
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, moon.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(moon.x - moon.r * 0.25, moon.y - moon.r * 0.2, moon.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // Faint Olympic rings in the upper sky (broadcast watermark)
  const ringsX = bgLeft + bgWidth * 0.18 + camX * 0.04;
  const ringsY = bgTop + 72;
  if (ringsY < groundY - 180) {
    const ringColors = ['#0085c7', '#f4c300', '#000000', '#009f3d', '#df0024'];
    const ringR = 11;
    const ringGap = 26;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 3.5;
    for (let i = 0; i < 5; i++) {
      const row = i < 3 ? 0 : 1;
      const col = i < 3 ? i : i - 2;
      const cx = ringsX + col * ringGap + (row === 1 ? ringGap * 0.5 : 0);
      const cy = ringsY + row * ringGap * 0.85;
      ctx.strokeStyle = ringColors[i];
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Alien crystal spires on the horizon
  const spireParallax = camX * 0.42;
  const spireBucket = 220;
  const s0 = Math.floor((bgLeft - spireParallax) / spireBucket) - 1;
  const s1 = Math.ceil((bgLeft + bgWidth - spireParallax) / spireBucket) + 1;
  for (let b = s0; b <= s1; b++) {
    if (backdropHash(b, 910) < 0.55) continue;
    const x = b * spireBucket + backdropHash(b, 911) * 120 + spireParallax;
    const baseY = groundY;
    const h = 60 + backdropHash(b, 912) * 110;
    const w = 16 + backdropHash(b, 913) * 22;
    if (baseY - h < bgTop - 40 || baseY > bgBottom + 40) continue;
    ctx.fillStyle = `rgba(${120 + backdropHash(b, 914) * 80}, ${60 + backdropHash(b, 915) * 50}, ${180 + backdropHash(b, 916) * 60}, 0.35)`;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x + w * 0.5, baseY - h);
    ctx.lineTo(x + w, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function fillRoughRockTerrain(
  ctx: CanvasRenderingContext2D,
  camX: number,
  groundY: number,
  leftX: number,
  rightX: number,
  surfaceY: (x: number) => number
) {
  const step = Math.max(8, TERRAIN_RENDER_STEP);
  ctx.beginPath();
  ctx.moveTo(leftX, groundY + 600);
  ctx.lineTo(leftX, surfaceY(leftX));
  for (let x = leftX + step; x < rightX; x += step) {
    ctx.lineTo(x, surfaceY(x));
  }
  ctx.lineTo(rightX, surfaceY(rightX));
  ctx.lineTo(rightX, groundY + 600);
  ctx.closePath();
  const dirtGrad = ctx.createLinearGradient(camX, groundY - 80, camX, groundY + 300);
  dirtGrad.addColorStop(0, '#78716c');
  dirtGrad.addColorStop(0.25, '#57534e');
  dirtGrad.addColorStop(0.65, '#44403c');
  dirtGrad.addColorStop(1, '#292524');
  ctx.fillStyle = dirtGrad;
  ctx.fill();
  ctx.strokeStyle = '#1c1917';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(leftX, surfaceY(leftX));
  for (let x = leftX + step; x <= rightX; x += step) {
    ctx.lineTo(x, surfaceY(x));
  }
  ctx.stroke();
  // Rocky grit along the surface
  const gritBucket = 24;
  const g0 = Math.floor(leftX / gritBucket);
  const g1 = Math.ceil(rightX / gritBucket);
  for (let b = g0; b <= g1; b++) {
    if (backdropHash(b, 920) < 0.4) continue;
    const x = b * gritBucket + backdropHash(b, 921) * gritBucket * 0.6;
    if (x < leftX - 8 || x > rightX + 8) continue;
    const y = surfaceY(x);
    const size = 2 + backdropHash(b, 922) * 5;
    ctx.fillStyle = backdropHash(b, 923) > 0.5 ? '#a8a29e' : '#44403c';
    ctx.beginPath();
    ctx.arc(x, y - size * 0.3, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

interface VisualizerProps {
  creatures: Creature[];
  selectedCreatureId: string | null;
  onSelectCreature: (id: string) => void;
  obstacles: Obstacle[];
  worldObjects: WorldObject[];
  goal: EvolutionGoal;
  isRunning: boolean;
  bestEverDistance: number;
  /** All-time record for the active goal (score + model name + gen length). */
  goalBestEver?: {
    scoreLabel: string;
    modelName: string;
    durationLabel?: string | null;
  } | null;
  /** Grow to fill parent height (fullscreen / side-by-side layouts) */
  fillHeight?: boolean;
  /** Extra classes on the outer shell */
  className?: string;
  /** Bottom-left run controls overlay */
  simulationSpeed?: number;
  effectiveSimulationSpeed?: number;
  simStepsPerSecond?: number;
  autoThrottleActive?: boolean;
  currentGen?: number;
  elapsedSeconds?: number;
  generationDuration?: number;
  currentModelBestLabel?: string;
  onResetGoalBestEver?: () => void;
  onToggleRun?: () => void;
  onManualBreed?: () => void;
  onResetSimulation?: () => void;
  onSetSimulationSpeed?: (speed: number) => void;
  /** Disable Next Gen / Reset (e.g. competition) */
  runControlsLocked?: boolean;
  appearance?: AppearanceRig;
  /** Per-creature cosmetics (arena heats with mixed models). */
  appearanceByCreatureId?: Record<string, AppearanceRig>;
  environmentTheme?: EnvironmentTheme;
  /** Live leader reward terms for the active goal */
  rewardBreakdown?: RewardBreakdown | null;
  /** Previous generation's leader breakdown (for up/down arrows) */
  rewardBaseline?: RewardBreakdown | null;
}

export const Visualizer: React.FC<VisualizerProps> = ({
  creatures,
  selectedCreatureId,
  onSelectCreature,
  obstacles,
  worldObjects,
  goal,
  isRunning,
  bestEverDistance,
  goalBestEver = null,
  fillHeight = false,
  className = '',
  simulationSpeed = 1,
  effectiveSimulationSpeed = simulationSpeed,
  simStepsPerSecond = 0,
  autoThrottleActive = false,
  currentGen = 1,
  elapsedSeconds = 0,
  generationDuration = 0,
  currentModelBestLabel = '0',
  onResetGoalBestEver,
  onToggleRun,
  onManualBreed,
  onResetSimulation,
  onSetSimulationSpeed,
  runControlsLocked = false,
  appearance,
  appearanceByCreatureId,
  environmentTheme = 'meadow',
  rewardBreakdown = null,
  rewardBaseline = null,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cameraXRef = useRef<number>(0);
  const cameraYRef = useRef<number>(200);

  const [dimensions, setDimensions] = useState({ width: 800, height: 450 }); // keep width ≈ ARENA_SCREEN_WIDTH
  const [zoom, setZoom] = useState(1.0);
  const [showMuscles, setShowMuscles] = useState(true);
  const [showGhostPack, setShowGhostPack] = useState(true);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [simOverlayOpen, setSimOverlayOpen] = useState(true);

  const showRunOverlay = !!(onToggleRun && onManualBreed && onResetSimulation && onSetSimulationSpeed);

  const handleZoomIn = () =>
    setZoom(prev =>
      Math.min(VISUALIZER_ZOOM_MAX, Math.round((prev + VISUALIZER_ZOOM_STEP) * 100) / 100)
    );
  const handleZoomOut = () =>
    setZoom(prev =>
      Math.max(VISUALIZER_ZOOM_MIN, Math.round((prev - VISUALIZER_ZOOM_STEP) * 100) / 100)
    );
  const handleResetZoom = () => setZoom(1.0);

  useEffect(() => {
    initBodyPartAssets();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY;
      setZoom(prev => {
        const next = delta > 0 ? prev - VISUALIZER_ZOOM_STEP : prev + VISUALIZER_ZOOM_STEP;
        return (
          Math.round(Math.max(VISUALIZER_ZOOM_MIN, Math.min(VISUALIZER_ZOOM_MAX, next)) * 100) / 100
        );
      });
    };
    canvas.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheelNative);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const applySize = () => {
      const el = containerRef.current;
      if (!el) return;
      // Use client size of the *fixed* arena box only — never let the canvas
      // bitmap attributes drive layout (that caused continuous lengthening).
      const width = Math.max(1, Math.floor(el.clientWidth));
      const height = Math.max(1, Math.floor(el.clientHeight));
      setDimensions(prev => {
        if (prev.width === width && prev.height === height) return prev;
        return { width, height };
      });
    };

    applySize();
    const resizeObserver = new ResizeObserver(() => applySize());
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const screenToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (clientX - rect.left) * scaleX;
    const clickY = (clientY - rect.top) * scaleY;
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    return {
      x: (clickX - centerX) / zoom + centerX + cameraXRef.current,
      y: (clickY - centerY) / zoom + centerY + cameraYRef.current,
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const trackedCreature =
      creatures.find(c => c.id === selectedCreatureId) ||
      creatures.reduce((prev, current) => (current.fitness > prev.fitness ? current : prev), creatures[0]);

    const visibleCreatures = showGhostPack
      ? creatures
      : creatures.filter(c => c.id === (trackedCreature?.id ?? selectedCreatureId));

    const render = () => {
      const measurePerformance = isPerformanceDiagnosticsActive();
      const renderStartedAt = measurePerformance ? performance.now() : 0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let targetCamX = 0;
      let targetCamY = 200;
      if (trackedCreature) {
        targetCamX = trackedCreature.currentX - dimensions.width / 2;
        targetCamY = trackedCreature.currentY - dimensions.height / 2;
      }

      cameraXRef.current += (targetCamX - cameraXRef.current) * 0.1;
      cameraYRef.current += (targetCamY - cameraYRef.current) * 0.1;
      const camX = cameraXRef.current;
      const camY = cameraYRef.current;

      ctx.save();
      ctx.translate(dimensions.width / 2, dimensions.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-dimensions.width / 2, -dimensions.height / 2);
      ctx.translate(-camX, -camY);

      const viewW = dimensions.width / zoom;
      const viewH = dimensions.height / zoom;
      const bgLeft = camX + dimensions.width / 2 - viewW / 2 - 200;
      const bgTop = camY + dimensions.height / 2 - viewH / 2 - 200;
      const bgWidth = viewW + 400;
      const bgHeight = viewH + 400;

      const terrainActive = obstacles.some(o => o.type === 'terrain');
      const proceduralTerrain = parseProceduralTerrain(obstacles);

      // Sky fill + layered backdrop (works at any flight altitude)
      drawMotionBackdrop(
        ctx,
        camX,
        camY,
        bgLeft,
        bgTop,
        bgWidth,
        bgHeight,
        GROUND_Y,
        !terrainActive
      );
      if (environmentTheme === 'olympic') {
        drawOlympicExoticOverlay(ctx, camX, bgLeft, bgTop, bgWidth, bgHeight, GROUND_Y);
      }
      const themeTint: Record<EnvironmentTheme, string> = {
        meadow: 'rgba(134, 239, 172, 0.05)',
        desert: 'rgba(251, 191, 36, 0.12)',
        alpine: 'rgba(186, 230, 253, 0.12)',
        night: 'rgba(15, 23, 42, 0.30)',
        olympic: 'rgba(94, 234, 212, 0.08)',
      };
      ctx.fillStyle = themeTint[environmentTheme];
      ctx.fillRect(bgLeft, bgTop, bgWidth, bgHeight);

      const terrainSegs = terrainActive && !proceduralTerrain
        ? obstacles
            .filter(o => o.type === 'terrain')
            .sort((a, b) => a.x - b.x)
        : [];

      const drawTerrainProfile = (
        leftX: number,
        rightX: number,
        surfaceY: (x: number) => number
      ) => {
        if (environmentTheme === 'olympic') {
          fillRoughRockTerrain(ctx, camX, GROUND_Y, leftX, rightX, surfaceY);
          return;
        }
        const step = Math.max(8, Math.min(TERRAIN_RENDER_STEP, Math.round(TERRAIN_RENDER_STEP / zoom)));
        ctx.beginPath();
        ctx.moveTo(leftX, GROUND_Y + 600);
        ctx.lineTo(leftX, surfaceY(leftX));
        for (let x = leftX + step; x < rightX; x += step) {
          ctx.lineTo(x, surfaceY(x));
        }
        ctx.lineTo(rightX, surfaceY(rightX));
        ctx.lineTo(rightX, GROUND_Y + 600);
        ctx.closePath();
        const dirtGrad = ctx.createLinearGradient(camX, GROUND_Y - 80, camX, GROUND_Y + 300);
        dirtGrad.addColorStop(0, '#d6d3d1');
        dirtGrad.addColorStop(0.35, '#a8a29e');
        dirtGrad.addColorStop(1, '#78716c');
        ctx.fillStyle = dirtGrad;
        ctx.fill();
        ctx.strokeStyle = '#57534e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(leftX, surfaceY(leftX));
        for (let x = leftX + step; x <= rightX; x += step) {
          ctx.lineTo(x, surfaceY(x));
        }
        ctx.stroke();
      };

      if (proceduralTerrain) {
        const leftX = bgLeft - 40;
        const rightX = bgLeft + bgWidth + 40;
        drawTerrainProfile(leftX, rightX, x =>
          proceduralTerrainSurfaceY(x, proceduralTerrain.seed, proceduralTerrain.difficulty)
        );
      } else if (terrainSegs.length > 0) {
        // Filled undulating ground polygon
        ctx.beginPath();
        const first = terrainSegs[0];
        ctx.moveTo(first.x, GROUND_Y + 600);
        ctx.lineTo(first.x, first.y);
        for (const seg of terrainSegs) {
          const x2 = seg.x2 ?? seg.x + seg.width;
          const y2 = seg.y2 ?? seg.y;
          ctx.lineTo(x2, y2);
        }
        const last = terrainSegs[terrainSegs.length - 1];
        const lastX = last.x2 ?? last.x + last.width;
        ctx.lineTo(lastX, GROUND_Y + 600);
        ctx.closePath();
        const dirtGrad = ctx.createLinearGradient(camX, GROUND_Y - 80, camX, GROUND_Y + 300);
        if (environmentTheme === 'olympic') {
          dirtGrad.addColorStop(0, '#78716c');
          dirtGrad.addColorStop(0.35, '#57534e');
          dirtGrad.addColorStop(1, '#292524');
        } else {
          dirtGrad.addColorStop(0, '#d6d3d1');
          dirtGrad.addColorStop(0.35, '#a8a29e');
          dirtGrad.addColorStop(1, '#78716c');
        }
        ctx.fillStyle = dirtGrad;
        ctx.fill();
        ctx.strokeStyle = environmentTheme === 'olympic' ? '#1c1917' : '#57534e';
        ctx.lineWidth = environmentTheme === 'olympic' ? 2.5 : 2;
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (const seg of terrainSegs) {
          const x2 = seg.x2 ?? seg.x + seg.width;
          const y2 = seg.y2 ?? seg.y;
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      } else if (environmentTheme === 'olympic') {
        ctx.fillStyle = '#57534e';
        ctx.fillRect(bgLeft, GROUND_Y, bgWidth, 5);
        const dirtGrad = ctx.createLinearGradient(camX, GROUND_Y + 5, camX, GROUND_Y + 300);
        dirtGrad.addColorStop(0, '#78716c');
        dirtGrad.addColorStop(0.5, '#44403c');
        dirtGrad.addColorStop(1, '#292524');
        ctx.fillStyle = dirtGrad;
        ctx.fillRect(bgLeft, GROUND_Y + 5, bgWidth, 600);
      } else {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(bgLeft, GROUND_Y, bgWidth, 4);
        const dirtGrad = ctx.createLinearGradient(camX, GROUND_Y + 4, camX, GROUND_Y + 300);
        dirtGrad.addColorStop(0, '#f1f5f9');
        dirtGrad.addColorStop(1, '#e2e8f0');
        ctx.fillStyle = dirtGrad;
        ctx.fillRect(bgLeft, GROUND_Y + 4, bgWidth, 600);
      }

      // Obstacles / modifiers
      for (const obs of obstacles) {
        if (obs.type === 'ice') {
          ctx.fillStyle = 'rgba(125, 211, 252, 0.55)';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.rect(obs.x, GROUND_Y - 6, obs.width, 6);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#0284c7';
          ctx.font = 'bold 9px ui-sans-serif, system-ui';
          ctx.fillText('ICE', obs.x + 6, GROUND_Y - 10);
        } else if (obs.type === 'box') {
          const isRock = obs.label === 'rock' || obs.label === 'boulder';
          const isPad =
            obs.label === 'pad' ||
            obs.label === 'LAND' ||
            obs.label === 'bridge' ||
            obs.label === 'beam' ||
            obs.label === 'park' ||
            obs.label === 'hazard';
          ctx.fillStyle = isRock
            ? obs.label === 'boulder'
              ? '#57534e'
              : '#78716c'
            : isPad
              ? '#64748b'
              : '#64748b';
          ctx.strokeStyle = isRock ? '#44403c' : '#475569';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.rect(obs.x, obs.y, obs.width, obs.height);
          ctx.fill();
          ctx.stroke();
          if (isRock) {
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(obs.x + 2, obs.y + 2, Math.max(4, obs.width * 0.35), Math.max(3, obs.height * 0.25));
          }
        } else if (obs.type === 'terrain') {
          // Drawn as continuous ground fill above; skip per-segment boxes
        } else if (obs.type === 'stair') {
          ctx.fillStyle = '#78716c';
          ctx.strokeStyle = '#57534e';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.rect(obs.x, obs.y, obs.width, obs.height);
          ctx.fill();
          ctx.stroke();
          // tread highlight
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(obs.x, obs.y, obs.width, 3);
        } else if (obs.type === 'bar') {
          const barLeft = obs.x - obs.width / 2;
          ctx.fillStyle = '#facc15';
          ctx.strokeStyle = '#ca8a04';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.rect(barLeft, obs.y, obs.width, Math.max(4, obs.height));
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#a16207';
          ctx.font = 'bold 10px ui-sans-serif, system-ui';
          ctx.fillText(
            `BAR ${(obs.barClearHeight ?? 0).toFixed(0)}px`,
            barLeft,
            obs.y - 8
          );
        } else if (obs.type === 'ramp') {
          ctx.fillStyle = '#64748b';
          ctx.strokeStyle = '#475569';
          ctx.beginPath();
          ctx.moveTo(obs.x, obs.y + obs.height);
          ctx.lineTo(obs.x + obs.width, obs.y);
          ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (obs.type === 'pit') {
          const pitDepth = Math.max(1, obs.height);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(obs.x, obs.y, obs.width, pitDepth);
          ctx.fillStyle = 'rgba(248, 113, 113, 0.35)';
          ctx.fillRect(obs.x, obs.y - 4, obs.width, 4);
          ctx.fillStyle = '#475569';
          ctx.fillRect(obs.x, obs.y + pitDepth - 3, obs.width, 3);
          ctx.fillStyle = '#f87171';
          ctx.font = 'bold 10px ui-sans-serif, system-ui';
          ctx.fillText('GAP', obs.x + obs.width / 2 - 10, obs.y + Math.min(18, pitDepth - 4));
        } else if (obs.type === 'loop') {
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = Math.max(10, obs.width);
          ctx.beginPath();
          ctx.arc(obs.x, obs.y, obs.height, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(obs.x, obs.y, obs.height, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 10px ui-sans-serif, system-ui';
          ctx.fillText('LOOP', obs.x - 14, obs.y - obs.height - 8);
        } else if (obs.type === 'finish') {
          const w = obs.zoneWidth ?? Math.max(6, obs.width);
          ctx.fillStyle = obs.label === 'PARK' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(34, 197, 94, 0.2)';
          ctx.fillRect(obs.x, obs.y, w, obs.height);
          ctx.strokeStyle = obs.label === 'PARK' ? '#7c3aed' : '#16a34a';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(obs.x, obs.y, w, obs.height);
          ctx.setLineDash([]);
          ctx.fillStyle = obs.label === 'PARK' ? '#6d28d9' : '#15803d';
          ctx.font = 'bold 11px ui-sans-serif, system-ui';
          ctx.fillText(obs.label || 'FINISH', obs.x + 4, obs.y - 6);
        } else if (obs.type === 'checkpoint') {
          ctx.strokeStyle = '#0ea5e9';
          ctx.lineWidth = 3;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(obs.x, obs.y);
          ctx.lineTo(obs.x, obs.y + obs.height);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#0369a1';
          ctx.font = 'bold 9px ui-sans-serif, system-ui';
          ctx.fillText(`CP${(obs.checkpointIndex ?? 0) + 1}`, obs.x + 4, obs.y + 12);
        } else if (obs.type === 'target') {
          const r = obs.targetRadius ?? obs.width / 2;
          const cx = obs.x + obs.width / 2;
          const cy = obs.y + obs.height / 2;
          ctx.strokeStyle = '#e11d48';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#be123c';
          ctx.beginPath();
          ctx.arc(cx, cy, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Cut floor line across pits so the gap reads clearly
      for (const obs of obstacles) {
        if (obs.type !== 'pit') continue;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(obs.x - 1, GROUND_Y - 1, obs.width + 2, 6);
      }

      // World objects
      for (const obj of worldObjects) {
        if (obj.type === 'hoop') {
          const tube = obj.tubeThickness ?? 14;
          const outer = obj.radius + tube;
          const angle = obj.angle ?? 0;
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = tube;
          ctx.beginPath();
          ctx.arc(obj.x, obj.y, obj.radius + tube / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(obj.x, obj.y, outer, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
          ctx.stroke();
          // Rotation mark / spoke
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(obj.x, obj.y);
          ctx.lineTo(obj.x + Math.cos(angle) * obj.radius, obj.y + Math.sin(angle) * obj.radius);
          ctx.stroke();
          ctx.fillStyle = '#334155';
          ctx.font = 'bold 10px ui-sans-serif, system-ui';
          ctx.fillText('HOOP', obj.x - 16, obj.y - outer - 6);
        } else if (obj.type === 'ball') {
          const grad = ctx.createRadialGradient(obj.x - 4, obj.y - 4, 2, obj.x, obj.y, obj.radius);
          grad.addColorStop(0, '#fdba74');
          grad.addColorStop(1, '#ea580c');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#9a3412';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = '#92400e';
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.rect(obj.x - obj.width / 2, obj.y - obj.height / 2, obj.width, obj.height);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.beginPath();
          ctx.moveTo(obj.x - obj.width / 2, obj.y);
          ctx.lineTo(obj.x + obj.width / 2, obj.y);
          ctx.moveTo(obj.x, obj.y - obj.height / 2);
          ctx.lineTo(obj.x, obj.y + obj.height / 2);
          ctx.stroke();
        }
      }

      if (
        bestEverDistance > 0 &&
        (goal === EvolutionGoal.LOCOMOTION_RIGHT ||
          goal === EvolutionGoal.LOCOMOTION_LEFT ||
          goal === EvolutionGoal.SHUFFLE_RIGHT ||
          goal === EvolutionGoal.SHUFFLE_LEFT ||
          goal === EvolutionGoal.OBSTACLE_CLIMB ||
          goal === EvolutionGoal.SPEED ||
          goal === EvolutionGoal.STAIR_CLIMB ||
          goal === EvolutionGoal.MOTOR_DRIVE ||
          goal === EvolutionGoal.MOTOR_ICE ||
          goal === EvolutionGoal.MOTOR_RAMP ||
          goal === EvolutionGoal.MOTOR_GAP ||
          goal === EvolutionGoal.MOTOR_BRIDGE ||
          goal === EvolutionGoal.MOTOR_SLALOM ||
          goal === EvolutionGoal.MOTOR_LANDSPEED ||
          goal === EvolutionGoal.MOTOR_LOOP ||
          goal === EvolutionGoal.SPRINT_FINISH ||
          goal === EvolutionGoal.ROUGH_TERRAIN_TRAVERSE ||
          goal === EvolutionGoal.DODGEBALL ||
          goal === EvolutionGoal.GLIDE_RANGE ||
          goal === EvolutionGoal.AERIAL_CROSSING ||
          goal === EvolutionGoal.PARA_RAMP_GLIDE ||
          goal === EvolutionGoal.FLIGHT_RIGHT ||
          goal === EvolutionGoal.LONG_JUMP)
      ) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(bestEverDistance, camY);
        ctx.lineTo(bestEverDistance, GROUND_Y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#d97706';
        ctx.font = 'bold 11px ui-sans-serif, system-ui';
        ctx.fillText('All-Time Record', bestEverDistance + 8, camY + 25);
        ctx.fillText(`${bestEverDistance.toFixed(1)}m`, bestEverDistance + 8, camY + 40);
      }

      const sortedCreatures = [...visibleCreatures].sort((a, b) => {
        if (a.id === selectedCreatureId) return 1;
        if (b.id === selectedCreatureId) return -1;
        if (a.fitness === trackedCreature?.fitness) return 1;
        if (b.fitness === trackedCreature?.fitness) return -1;
        return 0;
      });

      for (const creature of sortedCreatures) {
        const isSelected = creature.id === selectedCreatureId;
        const isLeader = creature.id === trackedCreature?.id;
        let opacity = 0.15;
        if (isSelected) opacity = 1.0;
        else if (isLeader) opacity = 0.75;

        const creatureAppearance = appearanceByCreatureId?.[creature.id] ?? appearance;

        drawAppearance(ctx, creature, creatureAppearance, 'behind', opacity);

        if (!creatureAppearance?.hideSkeleton && showMuscles) {
        for (const muscle of creature.muscles) {
          const nodeA = creature.nodes[muscle.nodeA];
          const nodeB = creature.nodes[muscle.nodeB];
          if (!nodeA || !nodeB) continue;

          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const kind = resolveLinkKind(muscle);

          // Offset soft stroke when paralleled with a hard link on the same pair
          let drawAx = nodeA.x;
          let drawAy = nodeA.y;
          let drawBx = nodeB.x;
          let drawBy = nodeB.y;
          if (kind === 'muscle' && findParallelHardLink(muscle, creature.muscles)) {
            const ux = dx / len;
            const uy = dy / len;
            const ox = -uy * 4;
            const oy = ux * 4;
            drawAx += ox;
            drawAy += oy;
            drawBx += ox;
            drawBy += oy;
          }

          const aero = muscle.aeroType;
          if (aero === 'parachute') {
            // Chute is a string: straight when limp, dome when inflated.
            drawChuteString(ctx, nodeA.x, nodeA.y, nodeB.x, nodeB.y, muscle, {
              opacity,
              lineWidth: isSelected ? 3.2 : isLeader ? 2.6 : 2.1,
              selected: isSelected,
            });
            continue;
          }
          if (aero === 'wing' || aero === 'paraglider') {
            const px = -dy / len;
            const py = dx / len;
            const half =
              Math.sqrt(effectiveAeroArea(muscle)) * (aero === 'paraglider' ? 0.55 : 0.4);
            ctx.save();
            ctx.globalAlpha = opacity * 0.85;
            ctx.beginPath();
            ctx.moveTo(nodeA.x, nodeA.y);
            ctx.lineTo(nodeA.x + px * half, nodeA.y + py * half);
            ctx.lineTo(nodeB.x + px * half, nodeB.y + py * half);
            ctx.lineTo(nodeB.x, nodeB.y);
            ctx.closePath();
            ctx.fillStyle = aero === 'wing' ? '#7dd3fc' : '#c4b5fd';
            ctx.fill();
            ctx.strokeStyle = aero === 'wing' ? '#0284c7' : '#7c3aed';
            ctx.lineWidth = 1.25;
            ctx.stroke();
            ctx.restore();
          }

          if (kind === 'telescope') {
            const thickBoost = ((muscle.thickness ?? 1) - 1) * 2.5;
            const mid = 0.55;
            const mx = drawAx + (drawBx - drawAx) * mid;
            const my = drawAy + (drawBy - drawAy) * mid;
            const ux = (drawBx - drawAx) / len;
            const uy = (drawBy - drawAy) / len;
            ctx.save();
            ctx.lineCap = 'round';
            ctx.strokeStyle = `rgba(15, 118, 110, ${opacity})`;
            ctx.lineWidth = (isSelected ? 8 : isLeader ? 6 : 4.5) + thickBoost;
            ctx.beginPath();
            ctx.moveTo(drawAx, drawAy);
            ctx.lineTo(mx, my);
            ctx.stroke();
            ctx.strokeStyle = `rgba(94, 234, 212, ${opacity})`;
            ctx.lineWidth = (isSelected ? 4 : isLeader ? 2.75 : 2) + thickBoost * 0.45;
            ctx.beginPath();
            ctx.moveTo(drawAx, drawAy);
            ctx.lineTo(mx, my);
            ctx.stroke();
            ctx.strokeStyle = `rgba(19, 78, 74, ${opacity})`;
            ctx.lineWidth = (isSelected ? 4.5 : isLeader ? 3.25 : 2.5) + thickBoost * 0.35;
            ctx.beginPath();
            ctx.moveTo(mx - ux * 3, my - uy * 3);
            ctx.lineTo(drawBx, drawBy);
            ctx.stroke();
            ctx.strokeStyle = `rgba(153, 246, 228, ${opacity})`;
            ctx.lineWidth = (isSelected ? 2.25 : isLeader ? 1.75 : 1.25) + thickBoost * 0.2;
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(drawBx - ux * 2, drawBy - uy * 2);
            ctx.stroke();
            ctx.restore();
          } else if (kind === 'piston') {
            const thickBoost = ((muscle.thickness ?? 1) - 1) * 2.5;
            const mid = 0.55;
            const mx = drawAx + (drawBx - drawAx) * mid;
            const my = drawAy + (drawBy - drawAy) * mid;
            const ux = (drawBx - drawAx) / len;
            const uy = (drawBy - drawAy) / len;
            ctx.save();
            ctx.lineCap = 'round';
            ctx.strokeStyle = `rgba(67, 56, 202, ${opacity})`;
            ctx.lineWidth = (isSelected ? 8 : isLeader ? 6 : 4.5) + thickBoost;
            ctx.beginPath();
            ctx.moveTo(drawAx, drawAy);
            ctx.lineTo(mx, my);
            ctx.stroke();
            ctx.strokeStyle = `rgba(165, 180, 252, ${opacity})`;
            ctx.lineWidth = (isSelected ? 4 : isLeader ? 2.75 : 2) + thickBoost * 0.45;
            ctx.beginPath();
            ctx.moveTo(drawAx, drawAy);
            ctx.lineTo(mx, my);
            ctx.stroke();
            ctx.strokeStyle = `rgba(49, 46, 129, ${opacity})`;
            ctx.lineWidth = (isSelected ? 4.5 : isLeader ? 3.25 : 2.5) + thickBoost * 0.35;
            ctx.beginPath();
            ctx.moveTo(mx - ux * 3, my - uy * 3);
            ctx.lineTo(drawBx, drawBy);
            ctx.stroke();
            ctx.strokeStyle = `rgba(199, 210, 254, ${opacity})`;
            ctx.lineWidth = (isSelected ? 2.25 : isLeader ? 1.75 : 1.25) + thickBoost * 0.2;
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(drawBx - ux * 2, drawBy - uy * 2);
            ctx.stroke();
            ctx.strokeStyle = `rgba(129, 140, 248, ${opacity})`;
            ctx.lineWidth = (isSelected ? 2.5 : isLeader ? 2 : 1.5) + thickBoost * 0.15;
            ctx.beginPath();
            ctx.moveTo(mx - ux * 2 - uy * 4, my - uy * 2 + ux * 4);
            ctx.lineTo(mx - ux * 2 + uy * 4, my - uy * 2 - ux * 4);
            ctx.stroke();
            ctx.restore();
          } else if (isRigidBone(muscle)) {
            const thickBoost = ((muscle.thickness ?? 1) - 1) * 2.5;
            ctx.save();
            ctx.lineCap = 'round';
            ctx.strokeStyle = `rgba(51, 65, 85, ${opacity})`;
            ctx.lineWidth = (isSelected ? 8 : isLeader ? 6 : 4.5) + thickBoost;
            ctx.beginPath();
            ctx.moveTo(drawAx, drawAy);
            ctx.lineTo(drawBx, drawBy);
            ctx.stroke();
            ctx.strokeStyle = `rgba(241, 245, 249, ${opacity})`;
            ctx.lineWidth = (isSelected ? 4.5 : isLeader ? 3 : 2) + thickBoost * 0.5;
            ctx.beginPath();
            ctx.moveTo(drawAx, drawAy);
            ctx.lineTo(drawBx, drawBy);
            ctx.stroke();
            ctx.restore();
          } else {
            const ratio = len / muscle.originalLength;
            let muscleColor = `rgba(100, 116, 139, ${opacity})`;
            if (opacity > 0.4) {
              if (ratio < 0.9) muscleColor = `rgba(14, 116, 144, ${opacity})`;
              else if (ratio > 1.1) muscleColor = `rgba(194, 65, 12, ${opacity})`;
            }
            const thickBoost = ((muscle.thickness ?? 1) - 1) * 3;
            ctx.strokeStyle = muscleColor;
            ctx.lineWidth = (isSelected ? 6 : isLeader ? 4 : 2.5) + thickBoost;
            ctx.beginPath();
            ctx.moveTo(drawAx, drawAy);
            ctx.lineTo(drawBx, drawBy);
            ctx.stroke();
            if (isSelected) {
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(drawAx + (drawBx - drawAx) * 0.3, drawAy + (drawBy - drawAy) * 0.3);
              ctx.lineTo(drawBx - (drawBx - drawAx) * 0.3, drawBy - (drawBy - drawAy) * 0.3);
              ctx.stroke();
            }
          }
        }

        const solidIds = solidNodeIdSet(
          normalizeSolidSegments(creature.blueprint.solidSegments)
        );
        for (const node of creature.nodes) {
          ctx.save();
          ctx.globalAlpha = opacity;
          if (isSelected) {
            ctx.shadowColor = node.color || '#3b82f6';
            ctx.shadowBlur = 8;
          }

          const isSolidNode = solidIds.has(node.id);

          if (node.isWheel) {
            const spin = node.spinAngle ?? 0;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#0f172a';
            ctx.fill();
            ctx.strokeStyle = isSelected
              ? '#ffffff'
              : node.isMotorWheel
                ? 'rgba(245, 158, 11, 0.95)'
                : 'rgba(148, 163, 184, 0.9)';
            ctx.lineWidth = isSelected ? 2.5 : node.isMotorWheel ? 2 : 1.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(node.x, node.y, Math.max(2, node.radius * 0.3), 0, Math.PI * 2);
            ctx.fillStyle = node.isMotorWheel ? '#f59e0b' : (node.color || '#64748b');
            ctx.fill();
            ctx.strokeStyle = 'rgba(226, 232, 240, 0.9)';
            ctx.lineWidth = 1.5;
            for (let s = 0; s < 3; s++) {
              const a = spin + (s * Math.PI * 2) / 3;
              ctx.beginPath();
              ctx.moveTo(node.x, node.y);
              ctx.lineTo(
                node.x + Math.cos(a) * node.radius * 0.88,
                node.y + Math.sin(a) * node.radius * 0.88
              );
              ctx.stroke();
            }
            if (node.isMotorWheel) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, Math.max(1.5, node.radius * 0.12), 0, Math.PI * 2);
              ctx.fillStyle = '#0f172a';
              ctx.fill();
            }
          } else if (isSolidNode) {
            const s = node.radius * 1.55;
            ctx.fillStyle = node.color || '#3b82f6';
            ctx.fillRect(node.x - s / 2, node.y - s / 2, s, s);
            ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(15, 23, 42, 0.85)';
            ctx.lineWidth = isSelected ? 2 : 1.5;
            ctx.strokeRect(node.x - s / 2, node.y - s / 2, s, s);
            if (node.isGround && opacity > 0.5) {
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(node.x, node.y + node.radius - 3, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            ctx.fillStyle = node.color || '#3b82f6';
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(0,0,0,0.15)';
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.stroke();
            if (node.isGround && opacity > 0.5) {
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(node.x, node.y + node.radius - 3, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          if (node.isFoot && !node.isWheel && opacity > 0.4) {
            ctx.beginPath();
            ctx.moveTo(node.x - node.radius * 0.85, node.y + node.radius * 0.55);
            ctx.lineTo(node.x + node.radius * 0.85, node.y + node.radius * 0.55);
            ctx.strokeStyle = 'rgba(5, 150, 105, 0.95)';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.stroke();
          }
          if (node.isHingeStop && opacity > 0.4) {
            const s = node.radius * 0.55;
            ctx.beginPath();
            ctx.moveTo(node.x - s, node.y + s);
            ctx.lineTo(node.x - s, node.y - s * 0.15);
            ctx.lineTo(node.x + s * 0.15, node.y - s * 0.15);
            ctx.strokeStyle = 'rgba(225, 29, 72, 0.95)';
            ctx.lineWidth = 1.75;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
          }
          ctx.restore();
        }
        }

        drawAppearance(ctx, creature, creatureAppearance, 'front', opacity);

        if ((isLeader || isSelected || creature.displayName) && opacity > 0.45) {
          const indicatorY = Math.min(...creature.nodes.map(n => n.y)) - 18;
          const label =
            creature.displayName ||
            (isLeader ? 'LEADER' : isSelected ? creature.blueprint.name : '');
          if (label) {
            if (isLeader) {
              ctx.fillStyle = '#f59e0b';
              ctx.beginPath();
              ctx.moveTo(creature.currentX, indicatorY);
              ctx.lineTo(creature.currentX - 6, indicatorY - 10);
              ctx.lineTo(creature.currentX + 6, indicatorY - 10);
              ctx.closePath();
              ctx.fill();
            }
            ctx.fillStyle = isLeader ? '#d97706' : isSelected ? '#4f46e5' : '#64748b';
            ctx.font = 'bold 9px ui-sans-serif, system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(label, creature.currentX, indicatorY - (isLeader ? 12 : 4));
          }
        }
      }

      ctx.restore();

      drawSimHeightRuler(ctx, dimensions.width, dimensions.height, camY, zoom, GROUND_Y);

      if (measurePerformance) {
        recordRendererFrame(performance.now() - renderStartedAt, sortedCreatures.length);
      }
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [creatures, selectedCreatureId, dimensions, obstacles, worldObjects, goal, bestEverDistance, zoom, showMuscles, showGhostPack, appearance, appearanceByCreatureId, environmentTheme]);

  const handleCanvasMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();

    const { x: worldClickX, y: worldClickY } = screenToWorld(event.clientX, event.clientY);
    const pickFrom = showGhostPack
      ? creatures
      : creatures.filter(c => c.id === selectedCreatureId);
    let closestCreature: Creature | null = null;
    let minDist = 45 / zoom;
    for (const creature of pickFrom) {
      for (const node of creature.nodes) {
        const dist = Math.hypot(node.x - worldClickX, node.y - worldClickY);
        if (dist < minDist) {
          minDist = dist;
          closestCreature = creature;
        }
      }
    }
    if (closestCreature) onSelectCreature(closestCreature.id);
  };

  const renderGoalHeaderIcon = () => {
    const cat = getGoalInfo(goal).category;
    if (cat === 'motor') return <Gauge className="w-5 h-5 text-lime-700" />;
    if (cat === 'sports') return <Trophy className="w-5 h-5 text-green-700" />;
    if (cat === 'precision') return <Target className="w-5 h-5 text-violet-700" />;
    if (cat === 'jump') return <Award className="w-5 h-5 text-amber-500" />;
    if (cat === 'climb') return <Flag className="w-5 h-5 text-orange-600" />;
    if (cat === 'object') return <Package className="w-5 h-5 text-amber-700" />;
    if (goal === EvolutionGoal.CARRY_BALL) return <Circle className="w-5 h-5 text-orange-500" />;
    return <Trophy className="w-5 h-5 text-emerald-600" />;
  };

  const goalInfo = getGoalInfo(goal);

  return (
    <div
      className={`flex flex-col bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-sm ${
        fillHeight ? 'h-full min-h-0' : ''
      } ${className}`}
      id="visualizer-container"
    >      <div
        className={`relative flex items-center justify-between border-b border-slate-100 bg-slate-50/50 shrink-0 gap-3 ${
          fillHeight ? 'px-3 py-1.5' : 'px-5 py-3'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 z-10">
          {renderGoalHeaderIcon()}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`font-semibold text-slate-800 truncate ${
                  fillHeight ? 'text-xs' : 'text-sm'
                }`}
              >
                Goal: {goalInfo.title}
              </span>
              <button
                type="button"
                onClick={() => setGoalDialogOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50 cursor-pointer shrink-0"
                title="Explain this goal"
              >
                <Info className="w-3 h-3" />
                How?
              </button>
            </div>
            <p
              className={`text-[11px] text-slate-500 truncate mt-0.5 ${
                fillHeight ? 'hidden' : ''
              }`}
            >
              {goalInfo.tip}
            </p>
          </div>
        </div>
        <div
          className={`flex items-center gap-4 text-xs font-medium text-slate-500 shrink-0 z-10 ${
            fillHeight ? 'hidden lg:flex gap-2.5' : ''
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block shadow-sm" />
            Selected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-sm" />
            Leader
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400/40 inline-block" />
            Ghost Pack
          </span>
        </div>
      </div>

      {/* Arena canvas — fixed vh normally; flex-fill in fullscreen */}
      <div
        ref={containerRef}
        className={`relative w-full bg-slate-50 overflow-hidden ${
          fillHeight
            ? 'flex-1 min-h-0'
            : 'h-[min(72vh,780px)] min-h-[520px]'
        }`}
      >
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          onMouseDown={handleCanvasMouseDown}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          id="simulation-canvas"
        />

        {showRunOverlay && rewardBreakdown && (
          <RewardsBreakdownPanel
            breakdown={rewardBreakdown}
            baseline={rewardBaseline}
            generation={currentGen}
          />
        )}

        {showRunOverlay && (
          <div
            className="absolute bottom-4 left-4 z-10 select-none max-w-[min(100%-2rem,22rem)]"
            id="sim-run-overlay"
          >
            <div className="rounded-xl border border-white/40 bg-slate-900/55 backdrop-blur-md shadow-lg text-white overflow-hidden">
              <button
                type="button"
                onClick={() => setSimOverlayOpen(v => !v)}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-white/10 cursor-pointer transition-colors"
                aria-expanded={simOverlayOpen}
              >
                {simOverlayOpen ? (
                  <ChevronDown className="w-3 h-3 text-white/70 shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-white/70 shrink-0" />
                )}
                <Settings className="w-3.5 h-3.5 text-indigo-200 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">
                  Simulation
                </span>
                {!simOverlayOpen && (
                  <span className="ml-auto text-[10px] font-semibold text-white/70 tabular-nums">
                    {isRunning ? 'Running' : 'Paused'} · {effectiveSimulationSpeed.toFixed(2)}x
                  </span>
                )}
              </button>
              {simOverlayOpen && (
                <div className="px-2.5 pb-2.5 pt-0.5 flex flex-col gap-2 border-t border-white/15">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onToggleRun}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white shadow-sm cursor-pointer ${
                        isRunning
                          ? 'bg-amber-500/90 hover:bg-amber-500'
                          : 'bg-indigo-500/90 hover:bg-indigo-500'
                      }`}
                    >
                      {isRunning ? (
                        <>
                          <Pause className="w-3.5 h-3.5 fill-white" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-white" /> Start
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={onManualBreed}
                      disabled={runControlsLocked}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-white/30 bg-white/15 hover:bg-white/25 text-[11px] font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={
                        runControlsLocked
                          ? 'Breeding disabled in competition'
                          : 'Breed next generation now'
                      }
                    >
                      <SkipForward className="w-3.5 h-3.5" /> Next Gen
                    </button>
                    <button
                      type="button"
                      onClick={onResetSimulation}
                      disabled={runControlsLocked}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-rose-300/50 bg-rose-500/20 hover:bg-rose-500/35 text-[11px] font-semibold text-rose-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reset
                    </button>
                  </div>
                  <div className="flex items-center rounded-lg overflow-hidden border border-white/25 bg-black/25 w-fit">
                    {([0.05, 0.5, 1, 2, 4, 10, 25] as const).map(speed => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => onSetSimulationSpeed(speed)}
                        className={`px-2 py-1 text-[10px] font-bold transition-all cursor-pointer ${
                          simulationSpeed === speed
                            ? 'bg-white text-slate-900'
                            : 'text-white/80 hover:bg-white/15'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold text-white/75 tabular-nums">
                    <span>Requested {simulationSpeed}x</span>
                    <span>Effective {effectiveSimulationSpeed.toFixed(2)}x</span>
                    <span>{simStepsPerSecond.toFixed(0)} steps/s</span>
                    <span className={autoThrottleActive ? 'text-amber-200' : 'text-emerald-200'}>
                      Auto-throttle {autoThrottleActive ? 'on' : 'off'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10 select-none">
          {!isRunning && creatures.length > 0 && (
            <div
              id="simulation-paused-status"
              className="flex items-center px-2.5 py-1.5 bg-white/95 backdrop-blur-sm border border-slate-200/90 shadow-lg rounded-xl text-xs font-semibold text-slate-700"
            >
              Simulation Paused
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowGhostPack(prev => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-white/90 backdrop-blur-sm border shadow-lg rounded-xl text-xs font-bold transition-all cursor-pointer ${
              showGhostPack
                ? 'border-slate-200/90 text-slate-700 hover:bg-slate-100'
                : 'border-indigo-300 bg-indigo-50/95 text-indigo-800 hover:bg-indigo-100'
            }`}
            title={
              showGhostPack
                ? 'Showing whole pack (display only — each agent still has private ball/crate for scoring)'
                : 'Showing focused agent only'
            }
            aria-pressed={showGhostPack}
          >
            {showGhostPack ? <Users className="w-4 h-4" /> : <User className="w-4 h-4" />}
            {showGhostPack ? 'Pack' : 'Focused'}
          </button>

          <button
            type="button"
            onClick={() => setShowMuscles(prev => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-white/90 backdrop-blur-sm border shadow-lg rounded-xl text-xs font-bold transition-all cursor-pointer ${
              showMuscles
                ? 'border-slate-200/90 text-slate-700 hover:bg-slate-100'
                : 'border-amber-300 bg-amber-50/95 text-amber-800 hover:bg-amber-100'
            }`}
            title={showMuscles ? 'Hide skeleton (nodes, muscles, and bones)' : 'Show skeleton'}
            id="toggle-muscles-btn"
            aria-pressed={!showMuscles}
          >
            {showMuscles ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {showMuscles ? 'Muscles' : 'Muscles Off'}
          </button>

          <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm border border-slate-200/90 shadow-lg rounded-xl p-1.5">
            <button type="button" onClick={handleZoomOut} disabled={zoom <= VISUALIZER_ZOOM_MIN} className="p-1.5 hover:bg-slate-100 disabled:opacity-30 rounded-lg text-slate-700 cursor-pointer" title="Zoom Out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button type="button" onClick={handleResetZoom} className="px-2.5 py-1 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1" title="Reset Zoom">
              <span>{Math.round(zoom * 100)}%</span>
              {zoom !== 1.0 && <RotateCcw className="w-3 h-3 text-slate-400" />}
            </button>
            <button type="button" onClick={handleZoomIn} disabled={zoom >= VISUALIZER_ZOOM_MAX} className="p-1.5 hover:bg-slate-100 disabled:opacity-30 rounded-lg text-slate-700 cursor-pointer" title="Zoom In">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!isRunning && creatures.length > 0 && (
          <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[1px] pointer-events-none" />
        )}
      </div>

      <GoalInfoDialog goal={goal} open={goalDialogOpen} onClose={() => setGoalDialogOpen(false)} />
    </div>
  );
};
