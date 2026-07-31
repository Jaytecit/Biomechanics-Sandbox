import React, { useCallback, useEffect, useRef } from 'react';
import {
  SIM_RULER_HEIGHT,
  SIM_RULER_WIDTH,
  ViewBoxRect,
  drawViewBoxHeightRuler,
  drawViewBoxHorizontalRuler,
} from '../simRulers';

export interface SimAxisRulersProps {
  viewBox: ViewBoxRect;
  groundY: number;
  className?: string;
  children: React.ReactNode;
}

export const SimAxisRulers: React.FC<SimAxisRulersProps> = ({
  viewBox,
  groundY,
  className = '',
  children,
}) => {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const heightRulerRef = useRef<HTMLCanvasElement | null>(null);
  const widthRulerRef = useRef<HTMLCanvasElement | null>(null);

  const redraw = useCallback(() => {
    const plot = plotRef.current;
    const heightCanvas = heightRulerRef.current;
    const widthCanvas = widthRulerRef.current;
    if (!plot || !heightCanvas || !widthCanvas) return;

    const plotWidth = plot.clientWidth;
    const plotHeight = plot.clientHeight;
    if (plotWidth <= 0 || plotHeight <= 0) return;

    const zoom = Math.min(plotWidth / viewBox.width, plotHeight / viewBox.height);

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    heightCanvas.width = Math.round(SIM_RULER_WIDTH * dpr);
    heightCanvas.height = Math.round(plotHeight * dpr);
    heightCanvas.style.width = `${SIM_RULER_WIDTH}px`;
    heightCanvas.style.height = `${plotHeight}px`;
    const hCtx = heightCanvas.getContext('2d');
    if (hCtx) {
      hCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawViewBoxHeightRuler(hCtx, plotHeight, viewBox, groundY, zoom);
    }

    widthCanvas.width = Math.round(plotWidth * dpr);
    widthCanvas.height = Math.round(SIM_RULER_HEIGHT * dpr);
    widthCanvas.style.width = `${plotWidth}px`;
    widthCanvas.style.height = `${SIM_RULER_HEIGHT}px`;
    const wCtx = widthCanvas.getContext('2d');
    if (wCtx) {
      wCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawViewBoxHorizontalRuler(wCtx, plotWidth, viewBox, zoom);
    }
  }, [viewBox, groundY]);

  useEffect(() => {
    redraw();
    const plot = plotRef.current;
    if (!plot) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(plot);
    return () => observer.disconnect();
  }, [redraw]);

  return (
    <div className={`relative min-h-0 flex-1 ${className}`}>
      <canvas
        ref={heightRulerRef}
        className="pointer-events-none absolute left-0 top-0 z-10"
        aria-hidden
      />
      <canvas
        ref={widthRulerRef}
        className="pointer-events-none absolute bottom-0 z-10"
        style={{ left: SIM_RULER_WIDTH }}
        aria-hidden
      />
      <div
        ref={plotRef}
        className="absolute overflow-hidden"
        style={{
          left: SIM_RULER_WIDTH,
          top: 0,
          right: 0,
          bottom: SIM_RULER_HEIGHT,
        }}
      >
        {children}
      </div>
    </div>
  );
};
