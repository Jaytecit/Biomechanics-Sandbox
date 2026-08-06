/**
 * H7 — Offline waveform analysis for dance curriculum.
 * Deterministic PCM → band envelopes / onset / beat / lookahead at brain rate.
 * Browser decode via decodeAudioData; smoke tests call analyzePcm directly.
 */
import { BRAIN_HZ } from '../brain/constants';
import {
  DANCE_LOOKAHEAD_COUNT,
  DANCE_LOOKAHEAD_HORIZONS_SEC,
} from '../brain/danceObs';
import type { AudioBands } from './audioAnalysis';

export interface OfflineTrackAnalysis {
  sampleRate: number;
  durationSec: number;
  /** Frames at BRAIN_HZ. */
  frameCount: number;
  /** Interleaved [bass, lowMid, highMid, treble, onset, energy] per frame. */
  bands: Float32Array;
  /** Onset strength per frame (also packed into bands[4]). */
  onset: Float32Array;
  /** Estimated beat period in seconds (clamped). */
  beatPeriodSec: number;
  /** Beat phase in [0,1) per frame. */
  beatPhase: Float32Array;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function bandEnergyFromWindow(
  samples: Float32Array,
  sampleRate: number,
  start: number,
  end: number,
  loHz: number,
  hiHz: number,
): number {
  // Goertzel-ish mean energy via simple FIR band proxy: difference of
  // one-pole low-pass envelopes (cheap, deterministic, good enough for dance).
  const n = Math.max(1, end - start);
  let sum = 0;
  let lpLo = 0;
  let lpHi = 0;
  const aLo = Math.exp((-2 * Math.PI * loHz) / sampleRate);
  const aHi = Math.exp((-2 * Math.PI * hiHz) / sampleRate);
  for (let i = start; i < end; i++) {
    const x = samples[i] ?? 0;
    lpLo = aLo * lpLo + (1 - aLo) * x;
    lpHi = aHi * lpHi + (1 - aHi) * x;
    const band = lpHi - lpLo;
    sum += band * band;
  }
  const rms = Math.sqrt(sum / n);
  return clamp01(rms * 8);
}

function loudnessRms(
  samples: Float32Array,
  start: number,
  end: number,
): number {
  let sum = 0;
  const n = Math.max(1, end - start);
  for (let i = start; i < end; i++) {
    const x = samples[i] ?? 0;
    sum += x * x;
  }
  return clamp01(Math.sqrt(sum / n) * 6);
}

/** Autocorrelate onset curve; return best period in seconds within [0.3, 1.2]. */
function estimateBeatPeriod(onset: Float32Array, hz: number): number {
  const minLag = Math.round(0.3 * hz);
  const maxLag = Math.min(onset.length - 1, Math.round(1.2 * hz));
  if (maxLag <= minLag) return 0.5;
  let bestLag = Math.round(0.5 * hz);
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    let count = 0;
    for (let i = 0; i + lag < onset.length; i++) {
      acc += onset[i]! * onset[i + lag]!;
      count++;
    }
    const score = count > 0 ? acc / count : 0;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  return bestLag / hz;
}

/**
 * Analyze mono PCM into brain-rate dance features.
 * Channel mix should already be mono.
 */
export function analyzePcm(
  samples: Float32Array,
  sampleRate: number,
): OfflineTrackAnalysis {
  const durationSec = samples.length / Math.max(1, sampleRate);
  const frameCount = Math.max(1, Math.ceil(durationSec * BRAIN_HZ));
  const bands = new Float32Array(frameCount * 6);
  const onset = new Float32Array(frameCount);
  const beatPhase = new Float32Array(frameCount);
  const hop = sampleRate / BRAIN_HZ;
  const win = Math.max(64, Math.floor(hop * 2));

  let prevBass = 0;
  let prevFlux = 0;
  for (let f = 0; f < frameCount; f++) {
    const center = Math.floor(f * hop);
    const start = Math.max(0, center - (win >> 1));
    const end = Math.min(samples.length, start + win);
    const bass = bandEnergyFromWindow(samples, sampleRate, start, end, 40, 120);
    const lowMid = bandEnergyFromWindow(
      samples,
      sampleRate,
      start,
      end,
      120,
      400,
    );
    const highMid = bandEnergyFromWindow(
      samples,
      sampleRate,
      start,
      end,
      400,
      2000,
    );
    const treble = bandEnergyFromWindow(
      samples,
      sampleRate,
      start,
      end,
      2000,
      8000,
    );
    const energy = loudnessRms(samples, start, end);
    const flux = clamp01(Math.max(0, bass - prevBass) * 4 + Math.max(0, energy - prevFlux) * 2);
    prevBass = bass * 0.85 + prevBass * 0.15;
    prevFlux = energy;
    const o = clamp01(flux);
    onset[f] = o;
    const base = f * 6;
    bands[base + 0] = bass;
    bands[base + 1] = lowMid;
    bands[base + 2] = highMid;
    bands[base + 3] = treble;
    bands[base + 4] = o;
    bands[base + 5] = energy;
  }

  const beatPeriodSec = estimateBeatPeriod(onset, BRAIN_HZ);
  for (let f = 0; f < frameCount; f++) {
    const t = f / BRAIN_HZ;
    beatPhase[f] = (t / beatPeriodSec) % 1;
  }

  return {
    sampleRate,
    durationSec,
    frameCount,
    bands,
    onset,
    beatPeriodSec,
    beatPhase,
  };
}

/** Mix AudioBuffer channels to mono Float32Array. */
export function audioBufferToMono(buffer: {
  numberOfChannels: number;
  length: number;
  getChannelData: (ch: number) => Float32Array;
}): Float32Array {
  const n = buffer.length;
  const out = new Float32Array(n);
  const chans = Math.max(1, buffer.numberOfChannels);
  for (let c = 0; c < chans; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i] ?? 0;
  }
  if (chans > 1) {
    const inv = 1 / chans;
    for (let i = 0; i < n; i++) out[i]! *= inv;
  }
  return out;
}

/** Browser: decode file/array buffer then analyze. */
export async function analyzeAudioArrayBuffer(
  data: ArrayBuffer,
  AudioCtxCtor: typeof AudioContext = AudioContext,
): Promise<OfflineTrackAnalysis> {
  const ctx = new AudioCtxCtor();
  try {
    const decoded = await ctx.decodeAudioData(data.slice(0));
    const mono = audioBufferToMono(decoded);
    return analyzePcm(mono, decoded.sampleRate);
  } finally {
    void ctx.close();
  }
}

export async function analyzeAudioFile(
  file: File,
): Promise<OfflineTrackAnalysis> {
  const data = await file.arrayBuffer();
  return analyzeAudioArrayBuffer(data);
}

function frameIndex(analysis: OfflineTrackAnalysis, timeSec: number): number {
  const f = Math.floor(Math.max(0, timeSec) * BRAIN_HZ);
  return Math.min(analysis.frameCount - 1, f);
}

export function bandsAtTime(
  analysis: OfflineTrackAnalysis,
  timeSec: number,
): AudioBands {
  const f = frameIndex(analysis, timeSec);
  const base = f * 6;
  return {
    bass: analysis.bands[base + 0] ?? 0,
    lowMid: analysis.bands[base + 1] ?? 0,
    highMid: analysis.bands[base + 2] ?? 0,
    treble: analysis.bands[base + 3] ?? 0,
    onset: analysis.bands[base + 4] ?? 0,
    energy: analysis.bands[base + 5] ?? 0,
  };
}

export function onsetAtTime(
  analysis: OfflineTrackAnalysis,
  timeSec: number,
): number {
  return analysis.onset[frameIndex(analysis, timeSec)] ?? 0;
}

export function beatPhaseAtTime(
  analysis: OfflineTrackAnalysis,
  timeSec: number,
): number {
  return analysis.beatPhase[frameIndex(analysis, timeSec)] ?? 0;
}

/** energy/onset at each lookahead horizon → DANCE_LOOKAHEAD_COUNT floats. */
export function lookaheadAtTime(
  analysis: OfflineTrackAnalysis,
  timeSec: number,
  out?: Float32Array,
): Float32Array {
  const buf =
    out && out.length >= DANCE_LOOKAHEAD_COUNT
      ? out
      : new Float32Array(DANCE_LOOKAHEAD_COUNT);
  for (let i = 0; i < DANCE_LOOKAHEAD_HORIZONS_SEC.length; i++) {
    const t = timeSec + DANCE_LOOKAHEAD_HORIZONS_SEC[i]!;
    const b = bandsAtTime(analysis, t);
    buf[i * 2] = b.energy;
    buf[i * 2 + 1] = b.onset;
  }
  return buf;
}
