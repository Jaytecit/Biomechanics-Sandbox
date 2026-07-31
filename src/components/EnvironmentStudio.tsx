import React, { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Play, Redo2, Save, Undo2, Upload } from 'lucide-react';
import {
  EnvironmentPackage,
  EnvironmentTheme,
  createEnvironmentPackage,
  exportEnvironment,
  importEnvironment,
  loadEnvironments,
  saveEnvironment,
  validateEnvironment,
} from '../environments';
import { GROUND_Y } from '../physicsConstants';
import { Obstacle, WorldObject } from '../types';
import { SimAxisRulers } from './SimAxisRulers';

const GRID = 20;
const VIEW_LEFT = 0;
const VIEW_TOP = 200;
const VIEW_WIDTH = 2400;
const VIEW_HEIGHT = 420;
const ENV_VIEW_BOX = { x: VIEW_LEFT, y: VIEW_TOP, width: VIEW_WIDTH, height: VIEW_HEIGHT };
const TERRAIN_SAMPLE_MIN = GRID;
const snap = (value: number) => Math.round(value / GRID) * GRID;

const clampSurfaceY = (y: number) => Math.min(y, GROUND_Y);

function terrainFillPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${GROUND_Y + 140}`;
  d += ` L ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${GROUND_Y + 140} Z`;
  return d;
}

type PaletteDrag =
  | { kind: 'obstacle'; make: () => Obstacle }
  | { kind: 'world'; make: () => WorldObject };

type CanvasSelection =
  | { kind: 'obstacle'; index: number }
  | { kind: 'world'; id: string };

const palette: Array<{ label: string; make: () => Obstacle }> = [
  { label: 'Block', make: () => ({ type: 'box', x: 320, y: GROUND_Y - 60, width: 120, height: 60 }) },
  { label: 'Pad', make: () => ({ type: 'box', x: 320, y: GROUND_Y - 24, width: 180, height: 24, label: 'pad' }) },
  { label: 'Ramp', make: () => ({ type: 'ramp', x: 320, y: GROUND_Y - 80, width: 180, height: 80, angle: 24 }) },
  { label: 'Stair', make: () => ({ type: 'stair', x: 320, y: GROUND_Y - 40, width: 100, height: 40, stairIndex: 0 }) },
  { label: 'Pit', make: () => ({ type: 'pit', x: 420, y: GROUND_Y, width: 220, height: 100 }) },
  { label: 'Ice', make: () => ({ type: 'ice', x: 320, y: GROUND_Y - 8, width: 220, height: 8 }) },
  { label: 'Bar', make: () => ({ type: 'bar', x: 420, y: GROUND_Y - 100, width: 100, height: 6, barClearHeight: 100 }) },
  { label: 'Finish', make: () => ({ type: 'finish', x: 700, y: GROUND_Y - 160, width: 8, height: 160, label: 'FINISH' }) },
  { label: 'Target', make: () => ({ type: 'target', x: 600, y: GROUND_Y - 120, width: 60, height: 60, targetRadius: 30 }) },
  { label: 'Beam', make: () => ({ type: 'box', x: 320, y: GROUND_Y - 70, width: 300, height: 12, label: 'beam' }) },
  { label: 'Checkpoint', make: () => ({ type: 'checkpoint', x: 600, y: GROUND_Y - 180, width: 6, height: 180, checkpointIndex: 0 }) },
  { label: 'Tower', make: () => ({ type: 'tower', x: 280, y: GROUND_Y - 280, width: 100, height: 280, label: 'TOWER' }) },
];
const worldPalette: Array<{ label: string; make: () => WorldObject }> = [
  { label: 'Ball', make: () => ({ id: `ball-${Date.now()}`, type: 'ball', x: 360, y: GROUND_Y - 18, oldX: 360, oldY: GROUND_Y - 18, radius: 18, width: 36, height: 36, mass: 0.8, startX: 360, startY: GROUND_Y - 18 }) },
  { label: 'Push box', make: () => ({ id: `box-${Date.now()}`, type: 'box', x: 420, y: GROUND_Y - 30, oldX: 420, oldY: GROUND_Y - 30, radius: 30, width: 60, height: 60, mass: 2.2, startX: 420, startY: GROUND_Y - 30 }) },
  { label: 'Hoop', make: () => ({ id: `hoop-${Date.now()}`, type: 'hoop', x: 440, y: GROUND_Y - 90, oldX: 440, oldY: GROUND_Y - 90, radius: 70, tubeThickness: 12, width: 164, height: 164, mass: 8, startX: 440, startY: GROUND_Y - 90 }) },
];

function snapObstacleToSurface(item: Obstacle): Obstacle {
  if (item.type === 'pit') return { ...item, y: GROUND_Y };
  if (item.type === 'terrain') {
    const y2 = item.y2 ?? item.y;
    const base = Math.max(item.y, y2);
    return { ...item, y: base, y2: base - Math.abs((item.y2 ?? item.y) - item.y) || 40 };
  }
  if (item.type === 'tower') {
    return { ...item, y: GROUND_Y - item.height };
  }
  if (item.type === 'ramp') {
    return { ...item, y: GROUND_Y - item.height };
  }
  if (item.type === 'finish' || item.type === 'checkpoint') {
    return { ...item, y: GROUND_Y - item.height };
  }
  if (item.type === 'bar') {
    return { ...item, y: GROUND_Y - (item.barClearHeight ?? item.height) };
  }
  // box, stair, ice, target — rest on ground
  return { ...item, y: GROUND_Y - item.height };
}

function snapWorldToGround(obj: WorldObject): WorldObject {
  const bottom = obj.type === 'ball' || obj.type === 'hoop' ? obj.radius : obj.height / 2;
  const y = GROUND_Y - bottom;
  return { ...obj, x: snap(obj.x), y, oldX: snap(obj.x), oldY: y, startX: snap(obj.x), startY: y };
}

function terrainSegmentsFromPoints(points: { x: number; y: number }[]): Obstacle[] {
  if (points.length < 2) return [];
  const segs: Obstacle[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) < GRID / 2) continue;
    segs.push({
      type: 'terrain',
      x: a.x,
      y: a.y,
      x2: b.x,
      y2: b.y,
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    });
  }
  return segs;
}

export const EnvironmentStudio: React.FC<{
  onTest: (environment: EnvironmentPackage) => void;
  loadRequest?: EnvironmentPackage | null;
  onLoadRequestHandled?: () => void;
}> = ({ onTest, loadRequest, onLoadRequestHandled }) => {
  const [environment, setEnvironment] = useState(() => createEnvironmentPackage('My Environment'));
  const [selected, setSelected] = useState<CanvasSelection | null>(null);
  const [history, setHistory] = useState<Obstacle[][]>([]);
  const [future, setFuture] = useState<Obstacle[][]>([]);
  const [message, setMessage] = useState('Drag palette items onto the canvas. Draw terrain as a continuous profile.');
  const [paletteDrag, setPaletteDrag] = useState<PaletteDrag | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [terrainMode, setTerrainMode] = useState(false);
  const [terrainDraft, setTerrainDraft] = useState<{ x: number; y: number }[]>([]);
  const [terrainPreview, setTerrainPreview] = useState<{ x: number; y: number } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const terrainDrawingRef = useRef(false);
  const errors = useMemo(() => validateEnvironment(environment), [environment]);

  useEffect(() => {
    if (!loadRequest) return;
    setEnvironment(loadRequest);
    setSelected(null);
    setHistory([]);
    setFuture([]);
    setMessage(`Loaded ${loadRequest.name} for editing.`);
    onLoadRequestHandled?.();
  }, [loadRequest, onLoadRequestHandled]);

  const clientToWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const world = pt.matrixTransform(ctm.inverse());
    return { x: snap(world.x), y: snap(world.y) };
  };

  const commit = (obstacles: Obstacle[]) => {
    setHistory(items => [...items.slice(-30), structuredClone(environment.obstacles)]);
    setFuture([]);
    setEnvironment(current => ({ ...current, obstacles }));
  };

  const placeObstacle = (make: () => Obstacle, x: number, y: number) => {
    const raw = make();
    const placed = snapObstacleToSurface({ ...raw, x: Math.max(VIEW_LEFT, x), y });
    commit([...environment.obstacles, placed]);
    setSelected({ kind: 'obstacle', index: environment.obstacles.length });
  };

  const placeWorld = (make: () => WorldObject, x: number, y: number) => {
    const raw = make();
    const placed = snapWorldToGround({ ...raw, x, y, oldX: x, oldY: y });
    setEnvironment(current => ({ ...current, worldObjects: [...current.worldObjects, placed] }));
  };

  const undo = () => {
    const prior = history.at(-1);
    if (!prior) return;
    setFuture(items => [structuredClone(environment.obstacles), ...items]);
    setHistory(items => items.slice(0, -1));
    setEnvironment(current => ({ ...current, obstacles: prior }));
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory(items => [...items, structuredClone(environment.obstacles)]);
    setFuture(items => items.slice(1));
    setEnvironment(current => ({ ...current, obstacles: next }));
  };
  const save = () => {
    const result = saveEnvironment(environment);
    setMessage(result.ok ? `Saved ${result.value!.name} revision ${result.value!.revision}.` : result.error!);
    if (result.value) setEnvironment(result.value);
  };
  const download = () => {
    const blob = new Blob([exportEnvironment(environment)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${environment.name.replace(/\W+/g, '_')}.environment.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = importEnvironment(await file.text());
    if (result.value) setEnvironment(result.value);
    setMessage(result.ok ? `Imported ${result.value!.name}.` : result.error!);
  };

  const appendTerrainPoint = (points: { x: number; y: number }[], x: number, y: number) => {
    const surfaceY = clampSurfaceY(y);
    const px = Math.max(VIEW_LEFT, x);
    if (points.length === 0) return [{ x: px, y: surfaceY }];
    const last = points[points.length - 1];
    if (Math.hypot(px - last.x, surfaceY - last.y) < TERRAIN_SAMPLE_MIN / 2) return points;
    return [...points, { x: px, y: surfaceY }];
  };

  const finishTerrainDraft = () => {
    setTerrainDraft(draft => {
      if (draft.length < 2) return draft;
      const segs = terrainSegmentsFromPoints(draft);
      if (segs.length) {
        setEnvironment(current => {
          setHistory(items => [...items.slice(-30), structuredClone(current.obstacles)]);
          setFuture([]);
          return { ...current, obstacles: [...current.obstacles, ...segs] };
        });
        setMessage('Terrain profile added.');
      }
      return [];
    });
    setTerrainPreview(null);
  };

  const cancelTerrainDraft = () => {
    setTerrainDraft([]);
    setTerrainPreview(null);
    terrainDrawingRef.current = false;
  };

  useEffect(() => {
    if (!terrainMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finishTerrainDraft();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelTerrainDraft();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [terrainMode]);

  const clearTerrain = () => {
    if (!environment.obstacles.some(o => o.type === 'terrain')) return;
    const next = environment.obstacles.filter(o => o.type !== 'terrain');
    commit(next);
    if (selected?.kind === 'obstacle') {
      const selectedObstacle = environment.obstacles[selected.index];
      const newIndex = selectedObstacle ? next.indexOf(selectedObstacle) : -1;
      setSelected(newIndex >= 0 ? { kind: 'obstacle', index: newIndex } : null);
    }
    setMessage('Terrain cleared.');
  };

  const deleteSelected = () => {
    if (!selected) return;
    if (selected.kind === 'obstacle') {
      const next = environment.obstacles.filter((_, i) => i !== selected.index);
      commit(next);
    } else {
      setEnvironment(current => ({
        ...current,
        worldObjects: current.worldObjects.filter(o => o.id !== selected.id),
      }));
      setMessage('Object removed.');
    }
    setSelected(null);
  };

  const onSvgPointerDown = (event: PointerEvent<SVGElement>) => {
    if (paletteDrag) return;
    if (terrainMode) {
      const { x, y } = clientToWorld(event.clientX, event.clientY);
      terrainDrawingRef.current = true;
      setTerrainDraft(prev => appendTerrainPoint(prev, x, y));
      setTerrainPreview(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    setSelected(null);
  };

  const onSvgPointerMove = (event: PointerEvent<SVGElement>) => {
    const world = clientToWorld(event.clientX, event.clientY);
    if (paletteDrag) {
      setGhost(world);
      return;
    }
    if (terrainMode) {
      const surfaceY = clampSurfaceY(world.y);
      const px = Math.max(VIEW_LEFT, world.x);
      if (terrainDrawingRef.current && event.buttons === 1) {
        setTerrainDraft(prev => {
          if (prev.length === 0) return [{ x: px, y: surfaceY }];
          const last = prev[prev.length - 1];
          if (Math.hypot(px - last.x, surfaceY - last.y) < TERRAIN_SAMPLE_MIN) return prev;
          return [...prev, { x: px, y: surfaceY }];
        });
        return;
      }
      if (terrainDraft.length > 0) {
        setTerrainPreview({ x: px, y: surfaceY });
      }
      return;
    }
    if (dragIndex !== null && event.buttons === 1) {
      const next = environment.obstacles.map((item, i) => {
        if (i !== dragIndex) return item;
        const moved = { ...item, x: world.x, y: item.type === 'pit' ? GROUND_Y : world.y };
        return snapObstacleToSurface(moved);
      });
      setEnvironment(current => ({ ...current, obstacles: next }));
    }
  };

  const onSvgPointerUp = (event: PointerEvent<SVGElement>) => {
    if (paletteDrag && ghost) {
      if (paletteDrag.kind === 'obstacle') placeObstacle(paletteDrag.make, ghost.x, ghost.y);
      else placeWorld(paletteDrag.make, ghost.x, ghost.y);
      setPaletteDrag(null);
      setGhost(null);
      return;
    }
    if (terrainMode) {
      terrainDrawingRef.current = false;
    }
    if (dragIndex !== null) {
      commit(environment.obstacles);
      setDragIndex(null);
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  const terrainSegs = environment.obstacles.filter(o => o.type === 'terrain');

  return (
    <div className="h-full min-h-0 w-full">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
          <input className="min-w-52 rounded border px-2 py-1 text-sm font-bold" value={environment.name} onChange={e => setEnvironment(v => ({ ...v, name: e.target.value }))} aria-label="Environment name" />
          <input type="number" className="w-28 rounded border px-2 py-1 text-xs" value={environment.seed} onChange={e => setEnvironment(v => ({ ...v, seed: Number(e.target.value) }))} aria-label="Environment seed" />
          <select value={environment.theme} onChange={e => setEnvironment(v => ({ ...v, theme: e.target.value as EnvironmentTheme }))} className="rounded border px-2 py-1 text-xs" aria-label="Theme">
            <option value="meadow">Meadow</option><option value="desert">Desert</option><option value="alpine">Alpine</option><option value="night">Night</option><option value="olympic">Olympic (exotic)</option>
          </select>
          <button onClick={undo} disabled={!history.length} className="rounded border p-1 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
          <button onClick={redo} disabled={!future.length} className="rounded border p-1 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
          <button onClick={save} className="ml-auto rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white"><Save className="mr-1 inline h-3 w-3" />Save</button>
          <button onClick={download} className="rounded border px-2 py-1 text-xs"><Download className="inline h-3 w-3" /></button>
          <label className="cursor-pointer rounded border px-2 py-1 text-xs"><Upload className="inline h-3 w-3" /><input type="file" className="hidden" accept=".json" onChange={upload} /></label>
          <button
            disabled={errors.length > 0}
            onClick={() => onTest(environment)}
            className="rounded bg-indigo-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
          >
            <Play className="mr-1 inline h-3 w-3" />Train in Custom
          </button>
        </header>
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-slate-50 p-2">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Geometry</span>
          {palette.map(item => (
            <button
              key={item.label}
              draggable
              onDragStart={e => e.preventDefault()}
              onPointerDown={() => setPaletteDrag({ kind: 'obstacle', make: item.make })}
              className="rounded border bg-white px-2 py-1 text-xs cursor-grab active:cursor-grabbing"
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setTerrainMode(v => {
                if (v) cancelTerrainDraft();
                return !v;
              });
              setPaletteDrag(null);
            }}
            className={`rounded border px-2 py-1 text-xs ${terrainMode ? 'border-indigo-500 bg-indigo-100 text-indigo-900' : 'bg-white'}`}
          >
            Draw terrain
          </button>
          <button
            type="button"
            onClick={finishTerrainDraft}
            disabled={!terrainMode || terrainDraft.length < 2}
            className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs disabled:opacity-30"
          >
            Finish profile
          </button>
          <button
            type="button"
            onClick={clearTerrain}
            disabled={terrainSegs.length === 0}
            className="rounded border px-2 py-1 text-xs disabled:opacity-30"
          >
            Clear terrain
          </button>
          <span className="ml-2 mr-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Objects</span>
          {worldPalette.map(item => (
            <button
              key={item.label}
              draggable
              onDragStart={e => e.preventDefault()}
              onPointerDown={() => setPaletteDrag({ kind: 'world', make: item.make })}
              className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs cursor-grab active:cursor-grabbing"
            >
              {item.label}
            </button>
          ))}
          <select className="ml-auto rounded border px-2 text-xs" onChange={e => { const found = loadEnvironments().find(item => item.id === e.target.value); if (found) setEnvironment(found); }} defaultValue="">
            <option value="">Load saved…</option>
            {loadEnvironments().map(item => <option key={item.id} value={item.id}>{item.name} · r{item.revision}</option>)}
          </select>
        </div>
        <SimAxisRulers viewBox={ENV_VIEW_BOX} groundY={GROUND_Y} className="min-h-[260px]">
          <svg
            ref={svgRef}
            viewBox={`${VIEW_LEFT} ${VIEW_TOP} ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            className="h-full w-full touch-none bg-sky-50"
            onPointerDown={onSvgPointerDown}
            onPointerMove={onSvgPointerMove}
            onPointerUp={onSvgPointerUp}
            onPointerLeave={onSvgPointerUp}
          >
          <defs><pattern id="env-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse"><path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#cbd5e1" strokeWidth="1" /></pattern></defs>
          <rect x={VIEW_LEFT} y={VIEW_TOP} width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#env-grid)" />
          <rect x={VIEW_LEFT} y={GROUND_Y} width={VIEW_WIDTH} height="140" fill="#d6d3d1" />

          {terrainSegs.length > 0 && (
            <path
              d={(() => {
                let d = `M ${terrainSegs[0].x} ${GROUND_Y + 140}`;
                d += ` L ${terrainSegs[0].x} ${terrainSegs[0].y}`;
                for (const seg of terrainSegs) {
                  d += ` L ${seg.x2 ?? seg.x + seg.width} ${seg.y2 ?? seg.y}`;
                }
                const last = terrainSegs[terrainSegs.length - 1];
                d += ` L ${last.x2 ?? last.x + last.width} ${GROUND_Y + 140} Z`;
                return d;
              })()}
              fill="#a8a29e"
              stroke="#57534e"
              strokeWidth={2}
            />
          )}

          {terrainDraft.length >= 2 && (
            <path
              d={terrainFillPath(terrainDraft)}
              fill="rgba(168,162,158,0.55)"
              stroke="#6366f1"
              strokeWidth={2}
            />
          )}
          {terrainDraft.length >= 1 && (
            <>
              <polyline
                points={[
                  ...terrainDraft.map(p => `${p.x},${p.y}`),
                  ...(terrainPreview ? [`${terrainPreview.x},${terrainPreview.y}`] : []),
                ].join(' ')}
                fill="none"
                stroke="#6366f1"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={terrainPreview && !terrainDrawingRef.current ? '6 4' : undefined}
              />
              {terrainDraft.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4} fill="#6366f1" />
              ))}
            </>
          )}

          {environment.obstacles.map((o, i) => {
            if (o.type === 'terrain') return null;
            const selectedFill = selected?.kind === 'obstacle' && selected.index === i ? '#818cf8' : '#64748b';
            if (o.type === 'ramp') {
              return (
                <polygon
                  key={i}
                  points={`${o.x},${o.y + o.height} ${o.x + o.width},${o.y} ${o.x + o.width},${o.y + o.height}`}
                  fill={selectedFill}
                  onPointerDown={e => { e.stopPropagation(); setSelected({ kind: 'obstacle', index: i }); setDragIndex(i); }}
                />
              );
            }
            if (o.type === 'tower') {
              return (
                <g key={i} onPointerDown={e => { e.stopPropagation(); setSelected({ kind: 'obstacle', index: i }); setDragIndex(i); }}>
                  <rect x={o.x} y={o.y} width={o.width} height={o.height} fill={selectedFill} />
                  <rect x={o.x - 4} y={o.y - 10} width={o.width + 8} height={10} fill="#94a3b8" />
                </g>
              );
            }
            return (
              <rect
                key={i}
                x={o.type === 'bar' ? o.x - o.width / 2 : o.x}
                y={o.y}
                width={o.width}
                height={Math.max(4, o.height)}
                fill={o.type === 'pit' ? '#0f172a' : selectedFill}
                onPointerDown={e => { e.stopPropagation(); setSelected({ kind: 'obstacle', index: i }); setDragIndex(i); }}
              />
            );
          })}

          {environment.worldObjects.map(object => {
            const isSelected = selected?.kind === 'world' && selected.id === object.id;
            const onSelect = (e: PointerEvent<SVGElement>) => {
              e.stopPropagation();
              setSelected({ kind: 'world', id: object.id });
            };
            if (object.type === 'ball' || object.type === 'hoop') {
              return (
                <circle
                  key={object.id}
                  cx={object.x}
                  cy={object.y}
                  r={object.radius}
                  fill={object.type === 'hoop' ? 'none' : '#f59e0b'}
                  stroke={isSelected ? '#6366f1' : '#92400e'}
                  strokeWidth={isSelected ? (object.type === 'hoop' ? (object.tubeThickness ?? 10) + 4 : 5) : object.type === 'hoop' ? object.tubeThickness ?? 10 : 3}
                  onPointerDown={onSelect}
                />
              );
            }
            return (
              <rect
                key={object.id}
                x={object.x - object.width / 2}
                y={object.y - object.height / 2}
                width={object.width}
                height={object.height}
                fill="#b45309"
                stroke={isSelected ? '#6366f1' : 'none'}
                strokeWidth={isSelected ? 4 : 0}
                onPointerDown={onSelect}
              />
            );
          })}

          {ghost && paletteDrag && (
            <circle cx={ghost.x} cy={ghost.y} r={14} fill="rgba(99,102,241,0.35)" stroke="#6366f1" strokeWidth={2} strokeDasharray="4 3" />
          )}
          </svg>
        </SimAxisRulers>
        <footer className="flex items-center gap-3 border-t p-3 text-xs">
          <span className={errors.length ? 'text-red-700' : 'text-emerald-700'}>{errors.length ? errors.join(' · ') : 'Environment valid'}</span>
          <span className="text-slate-500">
            {terrainMode
              ? 'Terrain: drag freehand or click to add corners, then Finish profile (Enter). Esc cancels draft.'
              : 'Drag palette buttons onto the canvas; items snap to ground contact.'}
          </span>
          <span className="ml-auto text-slate-500" role="status">{message}</span>
          {selected !== null && (
            <button type="button" className="text-red-700" onClick={deleteSelected}>
              Delete selected
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
