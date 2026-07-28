import React, { ChangeEvent, PointerEvent, useMemo, useState } from 'react';
import { Download, Play, Redo2, Save, Undo2, Upload } from 'lucide-react';
import { EnvironmentPackage, EnvironmentTheme, createEnvironmentPackage, exportEnvironment, importEnvironment, loadEnvironments, saveEnvironment, validateEnvironment } from '../environments';
import { GROUND_Y } from '../physicsConstants';
import { Obstacle } from '../types';
import { WorldObject } from '../types';

const GRID = 20;
const snap = (value: number) => Math.round(value / GRID) * GRID;
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
  { label: 'Terrain', make: () => ({ type: 'terrain', x: 320, y: GROUND_Y, width: 240, height: 0, x2: 560, y2: GROUND_Y - 40 }) },
];
const worldPalette: Array<{ label: string; make: () => WorldObject }> = [
  { label: 'Ball', make: () => ({ id: `ball-${Date.now()}`, type: 'ball', x: 360, y: GROUND_Y - 18, oldX: 360, oldY: GROUND_Y - 18, radius: 18, width: 36, height: 36, mass: 0.8, startX: 360, startY: GROUND_Y - 18 }) },
  { label: 'Push box', make: () => ({ id: `box-${Date.now()}`, type: 'box', x: 420, y: GROUND_Y - 30, oldX: 420, oldY: GROUND_Y - 30, radius: 30, width: 60, height: 60, mass: 2.2, startX: 420, startY: GROUND_Y - 30 }) },
  { label: 'Hoop', make: () => ({ id: `hoop-${Date.now()}`, type: 'hoop', x: 440, y: GROUND_Y - 90, oldX: 440, oldY: GROUND_Y - 90, radius: 70, tubeThickness: 12, width: 164, height: 164, mass: 8, startX: 440, startY: GROUND_Y - 90 }) },
];
export const EnvironmentStudio: React.FC<{ onTest: (environment: EnvironmentPackage) => void }> = ({ onTest }) => {
  const [environment, setEnvironment] = useState(() => createEnvironmentPackage('My Environment'));
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState<Obstacle[][]>([]);
  const [future, setFuture] = useState<Obstacle[][]>([]);
  const [message, setMessage] = useState('Build deterministic 2D geometry, validate it, then test with the current creature.');
  const errors = useMemo(() => validateEnvironment(environment), [environment]);
  const commit = (obstacles: Obstacle[]) => {
    setHistory(items => [...items.slice(-30), structuredClone(environment.obstacles)]);
    setFuture([]);
    setEnvironment(current => ({ ...current, obstacles }));
  };
  const add = (make: () => Obstacle) => { commit([...environment.obstacles, make()]); setSelected(environment.obstacles.length); };
  const drag = (event: PointerEvent<SVGElement>, index: number) => {
    if (event.buttons !== 1) return;
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const x = snap((event.clientX - rect.left) * 3);
    const y = snap(event.clientY - rect.top + 200);
    const next = environment.obstacles.map((item, i) => i === index ? { ...item, x, y: item.type === 'pit' ? GROUND_Y : y } : item);
    setEnvironment(current => ({ ...current, obstacles: next }));
  };
  const undo = () => {
    const prior = history.at(-1); if (!prior) return;
    setFuture(items => [structuredClone(environment.obstacles), ...items]);
    setHistory(items => items.slice(0, -1)); setEnvironment(current => ({ ...current, obstacles: prior }));
  };
  const redo = () => {
    const next = future[0]; if (!next) return;
    setHistory(items => [...items, structuredClone(environment.obstacles)]);
    setFuture(items => items.slice(1)); setEnvironment(current => ({ ...current, obstacles: next }));
  };
  const save = () => {
    const result = saveEnvironment(environment);
    setMessage(result.ok ? `Saved ${result.value!.name} revision ${result.value!.revision}.` : result.error!);
    if (result.value) setEnvironment(result.value);
  };
  const download = () => {
    const blob = new Blob([exportEnvironment(environment)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${environment.name.replace(/\W+/g, '_')}.environment.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    const result = importEnvironment(await file.text());
    if (result.value) setEnvironment(result.value);
    setMessage(result.ok ? `Imported ${result.value!.name}.` : result.error!);
  };
  return <div className="h-full min-h-0 w-full">
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <input className="min-w-52 rounded border px-2 py-1 text-sm font-bold" value={environment.name} onChange={e => setEnvironment(v => ({ ...v, name: e.target.value }))} aria-label="Environment name" />
        <input type="number" className="w-28 rounded border px-2 py-1 text-xs" value={environment.seed} onChange={e => setEnvironment(v => ({ ...v, seed: Number(e.target.value) }))} aria-label="Environment seed" />
        <select value={environment.theme} onChange={e => setEnvironment(v => ({ ...v, theme: e.target.value as EnvironmentTheme }))} className="rounded border px-2 py-1 text-xs" aria-label="Theme">
          <option value="meadow">Meadow</option><option value="desert">Desert</option><option value="alpine">Alpine</option><option value="night">Night</option>
        </select>
        <button onClick={undo} disabled={!history.length} className="rounded border p-1 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
        <button onClick={redo} disabled={!future.length} className="rounded border p-1 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
        <button onClick={save} className="ml-auto rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white"><Save className="mr-1 inline h-3 w-3" />Save</button>
        <button onClick={download} className="rounded border px-2 py-1 text-xs"><Download className="inline h-3 w-3" /></button>
        <label className="cursor-pointer rounded border px-2 py-1 text-xs"><Upload className="inline h-3 w-3" /><input type="file" className="hidden" accept=".json" onChange={upload} /></label>
        <button disabled={errors.length > 0} onClick={() => onTest(environment)} className="rounded bg-indigo-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-40"><Play className="mr-1 inline h-3 w-3" />Test in fullscreen</button>
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-slate-50 p-2">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Geometry</span>
        {palette.map(item => <button key={item.label} onClick={() => add(item.make)} className="rounded border bg-white px-2 py-1 text-xs">{item.label}</button>)}
        <span className="ml-2 mr-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Objects</span>
        {worldPalette.map(item => <button key={item.label} onClick={() => setEnvironment(current => ({ ...current, worldObjects: [...current.worldObjects, item.make()] }))} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs">{item.label}</button>)}
        <select className="ml-auto rounded border px-2 text-xs" onChange={e => { const found = loadEnvironments().find(item => item.id === e.target.value); if (found) setEnvironment(found); }} defaultValue=""><option value="">Load saved…</option>{loadEnvironments().map(item => <option key={item.id} value={item.id}>{item.name} · r{item.revision}</option>)}</select>
      </div>
      <svg viewBox="0 200 2400 420" className="min-h-[260px] w-full flex-1 bg-sky-50" onPointerLeave={() => setSelected(selected)}>
        <defs><pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse"><path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#cbd5e1" strokeWidth="1" /></pattern></defs>
        <rect x="0" y="200" width="2400" height="420" fill="url(#grid)" /><rect x="0" y={GROUND_Y} width="2400" height="140" fill="#d6d3d1" />
        {environment.obstacles.map((o, i) => o.type === 'ramp'
          ? <polygon key={i} points={`${o.x},${o.y + o.height} ${o.x + o.width},${o.y} ${o.x + o.width},${o.y + o.height}`} fill={i === selected ? '#818cf8' : '#64748b'} onPointerDown={() => setSelected(i)} onPointerMove={e => drag(e, i)} />
          : <rect key={i} x={o.type === 'bar' ? o.x - o.width / 2 : o.x} y={o.y} width={o.width} height={Math.max(4, o.height)} fill={o.type === 'pit' ? '#0f172a' : i === selected ? '#818cf8' : '#64748b'} onPointerDown={() => setSelected(i)} onPointerMove={e => drag(e, i)} />)}
        {environment.worldObjects.map(object => object.type === 'ball' || object.type === 'hoop'
          ? <circle key={object.id} cx={object.x} cy={object.y} r={object.type === 'hoop' ? object.radius : object.radius} fill={object.type === 'hoop' ? 'none' : '#f59e0b'} stroke="#92400e" strokeWidth={object.type === 'hoop' ? object.tubeThickness ?? 10 : 3} />
          : <rect key={object.id} x={object.x - object.width / 2} y={object.y - object.height / 2} width={object.width} height={object.height} fill="#b45309" />)}
      </svg>
      <footer className="flex items-center gap-3 border-t p-3 text-xs"><span className={errors.length ? 'text-red-700' : 'text-emerald-700'}>{errors.length ? errors.join(' · ') : 'Environment valid'}</span><span className="ml-auto text-slate-500" role="status">{message}</span>{selected !== null && <button className="text-red-700" onClick={() => { commit(environment.obstacles.filter((_, i) => i !== selected)); setSelected(null); }}>Delete selected</button>}</footer>
    </div>
  </div>;
};
