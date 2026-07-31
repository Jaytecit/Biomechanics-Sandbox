import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, Check } from 'lucide-react';
import { analyzeCapability, CapabilityReport, FlightFeasibility, FlightHint } from '../capability';
import { CreatureBlueprint } from '../types';

const hintIcon = (hint: FlightHint) => {
  if (hint === 'up') return <ArrowUp className="inline h-3 w-3 text-emerald-600" aria-label="increase" />;
  if (hint === 'down') return <ArrowDown className="inline h-3 w-3 text-rose-600" aria-label="decrease" />;
  return <Check className="inline h-3 w-3 text-slate-500" aria-label="ok" />;
};

const verdictTone = (verdict: FlightFeasibility['verdict']) => {
  switch (verdict) {
    case 'likely':
      return 'bg-emerald-100 text-emerald-900 border-emerald-300';
    case 'marginal':
      return 'bg-amber-100 text-amber-900 border-amber-300';
    case 'unlikely':
      return 'bg-rose-100 text-rose-900 border-rose-300';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300';
  }
};

export const CapabilityPanel: React.FC<{ blueprint: CreatureBlueprint }> = ({ blueprint }) => {
  const [report, setReport] = useState<CapabilityReport>(() => analyzeCapability(blueprint));
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const worker = new Worker(new URL('../capability.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = event => { setReport(event.data); worker.terminate(); };
        worker.onerror = () => { setReport(analyzeCapability(blueprint)); worker.terminate(); };
        worker.postMessage({ blueprint, seed: 21004 });
      } catch {
        setReport(analyzeCapability(blueprint));
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [blueprint]);
  const s = report.structural;
  const e = report.envelopes;
  const f = report.flight;
  return (
    <section
      className="rounded-xl border border-cyan-200 bg-cyan-50/60 px-3 py-2 shrink-0"
      aria-label="Capability observatory"
      id="capability-observatory-strip"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-1.5 shrink-0">
          <Activity className="h-3.5 w-3.5 text-cyan-800" />
          <strong className="text-[11px] text-cyan-950">Capability Observatory</strong>
          <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-cyan-800">
            {report.label}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-slate-700">
          <span>Mass <b>{s.mass.toFixed(1)}</b></span>
          <span>Size <b>{s.width.toFixed(0)}×{s.height.toFixed(0)}</b></span>
          <span>Actuators <b>{s.flexibleActuators}</b></span>
          <span>Power/mass <b>{s.powerToMassProxy.toFixed(2)}</b></span>
          <span>Support <b>{s.supportSpan.toFixed(0)}</b></span>
          <span>Aero <b>{s.aeroArea.toFixed(0)}</b></span>
          <span>Probe speed <b>{e.groundSpeed.toFixed(2)}</b></span>
          <span>Jump <b>{e.jumpClearance.toFixed(1)}</b></span>
          <span>Glide <b>{e.glideRatio.toFixed(2)}</b></span>
        </div>
        <div
          className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded border px-2 py-0.5 text-[10px] basis-full sm:basis-auto ${verdictTone(f.verdict)}`}
          aria-label="Flight feasibility"
        >
          <strong>Can it fly?</strong>
          <span className="font-semibold capitalize">{f.verdict.replace('no aero', 'no aero')}</span>
          <span className="hidden md:inline text-slate-600">· {f.summary}</span>
          <span title={f.mass.note}>Mass {hintIcon(f.mass.hint)}</span>
          <span title={f.aeroArea.note}>Area {hintIcon(f.aeroArea.hint)}</span>
          <span title={f.wingLoading.note}>
            Load {f.wingLoading.value !== null ? f.wingLoading.value.toFixed(2) : '—'} {hintIcon(f.wingLoading.hint)}
          </span>
          <span title={f.glideRatio.note}>Glide {hintIcon(f.glideRatio.hint)}</span>
        </div>
        <p className="text-[9px] leading-snug text-amber-800 basis-full sm:basis-auto sm:ml-auto">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          {report.caveat} Seed {report.seed}; confidence {report.confidence}.
        </p>
      </div>
    </section>
  );
};
