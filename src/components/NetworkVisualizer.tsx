/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { Creature } from '../types';
import { Network, Zap } from 'lucide-react';

interface NetworkVisualizerProps {
  creature: Creature | null;
}

const BASE_WIDTH = 340;
const MIN_HEIGHT = 280;
const MAX_HEIGHT = 720;
const NODE_SLOT_PX = 22;

function canvasHeightFor(inputCount: number, outputCount: number, hiddenCount: number): number {
  const tallestColumn = Math.max(inputCount, outputCount, Math.ceil(hiddenCount / 2), 4);
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, tallestColumn * NODE_SLOT_PX + 48));
}

export const NetworkVisualizer: React.FC<NetworkVisualizerProps> = ({ creature }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: BASE_WIDTH, height: MIN_HEIGHT });

  useEffect(() => {
    const genome = creature?.genome;
    const inputCount = genome?.nodes.filter(n => n.type === 'input').length ?? 0;
    const outputCount = genome?.nodes.filter(n => n.type === 'output').length ?? 0;
    const hiddenCount = genome?.nodes.filter(n => n.type === 'hidden').length ?? 0;
    const height = canvasHeightFor(inputCount, outputCount, hiddenCount);

    const el = containerRef.current;
    if (!el) {
      setCanvasSize({ width: BASE_WIDTH, height });
      return;
    }

    const applyWidth = (clientWidth: number) => {
      const width = Math.max(280, Math.floor(clientWidth));
      setCanvasSize({ width, height });
    };

    applyWidth(el.clientWidth);
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      applyWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [creature]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvasSize.width;
    const height = canvasSize.height;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    if (!creature) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Select a creature in the arena', width / 2, height / 2 - 10);
      ctx.fillText('to view its evolved brain structure', width / 2, height / 2 + 10);
      return;
    }

    const genome = creature.genome;
    const inputNodes = genome.nodes.filter(n => n.type === 'input');
    const hiddenNodes = genome.nodes.filter(n => n.type === 'hidden');
    const outputNodes = genome.nodes.filter(n => n.type === 'output');

    const labelPad = 56;
    const inputX = labelPad;
    const outputX = width - labelPad;
    const hiddenXRange = [labelPad + 70, width - labelPad - 70];

    const positions = new Map<number, { x: number; y: number; label: string }>();

    inputNodes.forEach((node, idx) => {
      let label = `In ${node.id}`;
      if (idx === 0) label = 'Sin(t)';
      else if (idx === 1) label = 'Cos(t)';
      else {
        const nodeOffset = Math.floor((idx - 2) / 3);
        const sensorType = (idx - 2) % 3;
        if (sensorType === 0) label = `N${nodeOffset} dX`;
        else if (sensorType === 1) label = `N${nodeOffset} dY`;
        else label = `N${nodeOffset} Touch`;
      }

      const spacing = (height - 40) / Math.max(1, inputNodes.length - 1);
      const y = inputNodes.length === 1 ? height / 2 : 20 + idx * spacing;
      positions.set(node.id, { x: inputX, y, label });
    });

    const flexibleMuscleCount = creature.muscles.filter(
      m => !(m.minLength === m.maxLength || m.strength >= 0.98)
    ).length;
    outputNodes.forEach((node, idx) => {
      const label =
        idx < flexibleMuscleCount
          ? `M${idx + 1}`
          : `W${idx - flexibleMuscleCount + 1}`;
      const spacing = (height - 40) / Math.max(1, outputNodes.length - 1);
      const y = outputNodes.length === 1 ? height / 2 : 20 + idx * spacing;
      positions.set(node.id, { x: outputX, y, label });
    });

    hiddenNodes.forEach((node, idx) => {
      const label = `H${node.id}`;
      let x = hiddenXRange[0];
      if (hiddenNodes.length > 1) {
        const col = idx % 2;
        x = hiddenXRange[0] + col * (hiddenXRange[1] - hiddenXRange[0]);
      } else {
        x = (hiddenXRange[0] + hiddenXRange[1]) / 2;
      }

      const spacing = (height - 40) / Math.max(1, hiddenNodes.length);
      const y = 30 + idx * (spacing * 0.95);
      positions.set(node.id, { x, y, label });
    });

    for (const conn of genome.connections) {
      const fromPos = positions.get(conn.fromNode);
      const toPos = positions.get(conn.toNode);
      if (!fromPos || !toPos) continue;

      ctx.save();
      const absWeight = Math.abs(conn.weight);
      ctx.lineWidth = Math.max(0.75, absWeight * 2);

      if (!conn.enabled) {
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.25)';
        ctx.setLineDash([3, 3]);
      } else if (conn.weight > 0) {
        ctx.strokeStyle = `rgba(37, 99, 235, ${Math.min(0.85, 0.2 + absWeight * 0.3)})`;
      } else {
        ctx.strokeStyle = `rgba(239, 68, 68, ${Math.min(0.85, 0.2 + absWeight * 0.3)})`;
      }

      ctx.beginPath();
      ctx.moveTo(fromPos.x, fromPos.y);
      const controlOffset = Math.abs(toPos.x - fromPos.x) * 0.4;
      ctx.bezierCurveTo(
        fromPos.x + controlOffset, fromPos.y,
        toPos.x - controlOffset, toPos.y,
        toPos.x, toPos.y
      );
      ctx.stroke();
      ctx.restore();
    }

    positions.forEach((pos, id) => {
      const nodeGene = genome.nodes.find(n => n.id === id);
      const type = nodeGene?.type || 'hidden';

      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);

      if (type === 'input') {
        ctx.fillStyle = '#eff6ff';
        ctx.strokeStyle = '#3b82f6';
      } else if (type === 'output') {
        ctx.fillStyle = '#ecfdf5';
        ctx.strokeStyle = '#10b981';
      } else {
        ctx.fillStyle = '#f5f3ff';
        ctx.strokeStyle = '#8b5cf6';
      }

      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 9px ui-sans-serif, system-ui';
      ctx.textAlign = type === 'input' ? 'right' : (type === 'output' ? 'left' : 'center');

      const labelOffsetX = type === 'input' ? -12 : (type === 'output' ? 12 : 0);
      const labelOffsetY = type === 'hidden' ? -12 : 3;

      ctx.fillText(pos.label, pos.x + labelOffsetX, pos.y + labelOffsetY);
      ctx.restore();
    });
  }, [creature, canvasSize]);

  return (
    <div className="flex flex-col bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-sm min-w-0" id="network-visualizer">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50/50 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Network className="w-4 h-4 text-indigo-600 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-800 truncate">Evolved Neural Network</h3>
        </div>
        {creature && (
          <div className="flex items-center gap-1.5 text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-medium shrink-0">
            <Zap className="w-3 h-3 text-indigo-500" />
            <span>
              {creature.genome.nodes.length}n ·{' '}
              {creature.genome.connections.filter(c => c.enabled).length}e
            </span>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="bg-slate-50/40 p-2 w-full overflow-x-auto overflow-y-auto max-h-[min(72vh,760px)]"
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="block w-full bg-transparent"
          style={{ height: canvasSize.height }}
        />
      </div>

      {creature && (
        <div className="px-3 py-1.5 bg-slate-50/30 border-t border-slate-100 grid grid-cols-2 gap-1 text-[9px] text-slate-500 font-medium shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-blue-500 inline-block"></span>
            <span>Blue: + weight</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-red-400 inline-block"></span>
            <span>Red: − weight</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-blue-500 bg-blue-50 inline-block"></span>
            <span>Input sensors</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-emerald-500 bg-emerald-50 inline-block"></span>
            <span>Output actuators</span>
          </div>
        </div>
      )}
    </div>
  );
};
