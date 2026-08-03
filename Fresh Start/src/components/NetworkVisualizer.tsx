/**
 * A7 — MLP network visualizer (Fresh Start fixed topology, not NEAT).
 * Shows live activations and weight strength/sign when a probe is available.
 */
import { useMemo } from 'react';
import type { NetworkShape } from '../brain/types';

export interface BrainProbe {
  shape: NetworkShape;
  weights: ArrayLike<number>;
  inputs?: ArrayLike<number> | null;
  outputs?: ArrayLike<number> | null;
  hidden?: ArrayLike<number> | null;
}

interface Props {
  shape: NetworkShape | null;
  /** Optional latest observation sample for input glow. */
  inputs?: ArrayLike<number> | null;
  /** Optional latest outputs for output glow. */
  outputs?: ArrayLike<number> | null;
  /** Optional hidden activations. */
  hidden?: ArrayLike<number> | null;
  /** Flat genome weights — edge thickness/color by strength & sign. */
  weights?: ArrayLike<number> | null;
  /** Live evolve label (focused creature). */
  liveLabel?: string | null;
  width?: number;
  height?: number;
}

function weightEdgeStyle(w: number): { stroke: string; strokeWidth: number; opacity: number } {
  const mag = Math.min(1.5, Math.abs(w));
  const t = mag / 1.5;
  const positive = w >= 0;
  return {
    stroke: positive ? 'rgb(77, 160, 255)' : 'rgb(232, 93, 76)',
    strokeWidth: 0.4 + t * 2.2,
    opacity: 0.08 + t * 0.72,
  };
}

export function NetworkVisualizer({
  shape,
  inputs,
  outputs,
  hidden,
  weights,
  liveLabel,
  width = 280,
  height = 180,
}: Props) {
  const layout = useMemo(() => {
    if (!shape) return null;
    const { inputCount, hiddenCount, outputCount } = shape;
    const colX = [36, width / 2, width - 36];
    const place = (n: number, col: number) => {
      const nodes: { x: number; y: number; i: number }[] = [];
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        nodes.push({ x: colX[col], y: 20 + t * (height - 40), i });
      }
      return nodes;
    };
    return {
      in: place(inputCount, 0),
      hid: place(hiddenCount, 1),
      out: place(outputCount, 2),
    };
  }, [shape, width, height]);

  const edges = useMemo(() => {
    if (!shape || !layout) return null;
    const { inputCount, hiddenCount, weightCount } = shape;
    if (!weights || weights.length < weightCount) {
      return {
        ih: layout.in.flatMap((a) =>
          layout.hid.map((b) => ({
            key: `ih-${a.i}-${b.i}`,
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            style: { stroke: 'rgba(138,150,168,0.15)', strokeWidth: 0.75, opacity: 1 },
          })),
        ),
        ho: layout.hid.flatMap((a) =>
          layout.out.map((b) => ({
            key: `ho-${a.i}-${b.i}`,
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            style: { stroke: 'rgba(138,150,168,0.15)', strokeWidth: 0.75, opacity: 1 },
          })),
        ),
      };
    }
    const w1End = hiddenCount * inputCount;
    const b1End = w1End + hiddenCount;
    const ih = [];
    for (const a of layout.in) {
      for (const b of layout.hid) {
        const w = weights[b.i * inputCount + a.i] ?? 0;
        ih.push({
          key: `ih-${a.i}-${b.i}`,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          style: weightEdgeStyle(w),
        });
      }
    }
    const ho = [];
    for (const a of layout.hid) {
      for (const b of layout.out) {
        const w = weights[b1End + b.i * hiddenCount + a.i] ?? 0;
        ho.push({
          key: `ho-${a.i}-${b.i}`,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          style: weightEdgeStyle(w),
        });
      }
    }
    // Draw weak edges first so strong ones sit on top.
    ih.sort((a, b) => a.style.opacity - b.style.opacity);
    ho.sort((a, b) => a.style.opacity - b.style.opacity);
    return { ih, ho };
  }, [shape, layout, weights]);

  if (!shape || !layout || !edges) {
    return <p className="hint muted">No brain loaded — evolve or Play best to inspect the MLP.</p>;
  }

  const glow = (v: number | undefined) => {
    if (v === undefined || Number.isNaN(v)) return 0.25;
    return 0.25 + 0.75 * Math.min(1, Math.abs(v));
  };

  return (
    <div className="network-viz-wrap">
      <svg
        className="network-viz"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`MLP ${shape.inputCount}–${shape.hiddenCount}–${shape.outputCount}${
          liveLabel ? ` · ${liveLabel}` : ''
        }`}
      >
        {edges.ih.map((e) => (
          <line
            key={e.key}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={e.style.stroke}
            strokeWidth={e.style.strokeWidth}
            opacity={e.style.opacity}
          />
        ))}
        {edges.ho.map((e) => (
          <line
            key={e.key}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={e.style.stroke}
            strokeWidth={e.style.strokeWidth}
            opacity={e.style.opacity}
          />
        ))}
        {layout.in.map((n) => (
          <circle
            key={`in-${n.i}`}
            cx={n.x}
            cy={n.y}
            r={5}
            fill={`rgba(77, 160, 255, ${glow(inputs?.[n.i])})`}
          />
        ))}
        {layout.hid.map((n) => (
          <circle
            key={`h-${n.i}`}
            cx={n.x}
            cy={n.y}
            r={4.5}
            fill={`rgba(212, 160, 74, ${glow(hidden?.[n.i] ?? 0.35)})`}
          />
        ))}
        {layout.out.map((n) => (
          <circle
            key={`o-${n.i}`}
            cx={n.x}
            cy={n.y}
            r={5}
            fill={`rgba(232, 93, 76, ${glow(outputs?.[n.i])})`}
          />
        ))}
        <text x={28} y={14} fill="#8a96a8" fontSize={10}>
          in
        </text>
        <text x={width / 2 - 10} y={14} fill="#8a96a8" fontSize={10}>
          hid
        </text>
        <text x={width - 48} y={14} fill="#8a96a8" fontSize={10}>
          out
        </text>
      </svg>
      {liveLabel && <p className="hint network-live-label">{liveLabel}</p>}
      {weights && (
        <p className="hint muted network-legend">
          Blue + / red − · thicker = stronger weight · nodes pulse with activation
        </p>
      )}
    </div>
  );
}
