import React, { useEffect, useState } from 'react';
import {
  downloadPerformanceDiagnostics,
  getLatestPerformanceDiagnosticsSample,
  getPerformanceDiagnosticsSamples,
  isPerformanceDiagnosticsActive,
  resetPerformanceDiagnostics,
  startPerformanceDiagnostics,
  stopPerformanceDiagnostics,
} from '../performanceDiagnostics';

export const PerformanceDiagnosticsPanel = React.memo(
  function PerformanceDiagnosticsPanel() {
    const [recording, setRecording] = useState(isPerformanceDiagnosticsActive());
    const [revision, setRevision] = useState(0);

    useEffect(() => {
      const timer = window.setInterval(() => setRevision(value => value + 1), 1000);
      return () => window.clearInterval(timer);
    }, []);

    const latest = getLatestPerformanceDiagnosticsSample();
    const sampleCount = getPerformanceDiagnosticsSamples().length;
    void revision;

    const toggle = () => {
      if (recording) {
        stopPerformanceDiagnostics();
        setRecording(false);
      } else {
        startPerformanceDiagnostics();
        setRecording(true);
      }
      setRevision(value => value + 1);
    };

    return (
      <section
        className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        aria-label="Performance diagnostics"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-800">Performance diagnostics</h3>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Opt-in, bounded to 15 minutes. No creature or controller data is included.
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-1 text-[9px] font-bold ${
              recording
                ? 'bg-rose-100 text-rose-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {recording ? 'RECORDING' : 'OFF'}
          </span>
        </div>

        {latest ? (
          <div className="mt-2 grid grid-cols-3 gap-1 text-center">
            <div className="rounded bg-slate-50 p-1.5">
              <div className="text-[9px] text-slate-500">Wall FPS</div>
              <div className="text-xs font-bold text-slate-800">{latest.wallFps.toFixed(1)}</div>
            </div>
            <div className="rounded bg-slate-50 p-1.5">
              <div className="text-[9px] text-slate-500">Physics</div>
              <div className="text-xs font-bold text-slate-800">
                {latest.averagePhysicsFrameMs.toFixed(1)} ms
              </div>
            </div>
            <div className="rounded bg-slate-50 p-1.5">
              <div className="text-[9px] text-slate-500">Canvas</div>
              <div className="text-xs font-bold text-slate-800">
                {latest.averageRenderMs.toFixed(1)} ms
              </div>
            </div>
            <div className="rounded bg-slate-50 p-1.5">
              <div className="text-[9px] text-slate-500">Sim steps/s</div>
              <div className="text-xs font-bold text-slate-800">
                {latest.simStepsPerSecond.toFixed(0)}
              </div>
            </div>
            <div className="rounded bg-slate-50 p-1.5">
              <div className="text-[9px] text-slate-500">Connections</div>
              <div className="text-xs font-bold text-slate-800">
                {latest.averageGenomeConnections.toFixed(0)}
              </div>
            </div>
            <div className="rounded bg-slate-50 p-1.5">
              <div className="text-[9px] text-slate-500">Samples</div>
              <div className="text-xs font-bold text-slate-800">{sampleCount}</div>
            </div>
          </div>
        ) : (
          <p className="mt-2 rounded bg-slate-50 p-2 text-[10px] text-slate-500">
            Start recording, then run several generations at the affected speed.
          </p>
        )}

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={toggle}
            className={`rounded px-2 py-1.5 text-[10px] font-bold text-white ${
              recording ? 'bg-rose-600' : 'bg-indigo-600'
            }`}
          >
            {recording ? 'Stop' : 'Record'}
          </button>
          <button
            type="button"
            onClick={() => {
              resetPerformanceDiagnostics();
              setRevision(value => value + 1);
            }}
            className="rounded border border-slate-200 px-2 py-1.5 text-[10px] font-bold text-slate-700"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={sampleCount === 0}
            onClick={downloadPerformanceDiagnostics}
            className="rounded border border-slate-200 px-2 py-1.5 text-[10px] font-bold text-slate-700 disabled:opacity-40"
          >
            Export JSON
          </button>
        </div>
      </section>
    );
  }
);
