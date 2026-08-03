/**
 * Web Audio analysis for disco (H1) — local file only, no mic/tab capture.
 * Pure DSP → band levels and actuator frames in [-1, 1].
 */

export interface AudioBands {
  bass: number;
  lowMid: number;
  highMid: number;
  treble: number;
  onset: number;
  energy: number;
}

export interface DiscoReactivityGains {
  bass: number;
  lowMid: number;
  highMid: number;
  treble: number;
  onset: number;
  master: number;
}

export interface DiscoMotionControls {
  range: number;
  frequency: number;
}

export const DEFAULT_DISCO_REACTIVITY: DiscoReactivityGains = {
  bass: 1.2,
  lowMid: 1,
  highMid: 0.9,
  treble: 0.8,
  onset: 1.1,
  master: 1,
};

export const DEFAULT_DISCO_MOTION: DiscoMotionControls = {
  range: 1,
  frequency: 2,
};

const SILENCE = 0.02;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampAct(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

export interface DiscoAudioPlayer {
  loadFile(file: File): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  dispose(): void;
  isPlaying(): boolean;
  hasTrack(): boolean;
  duration(): number;
  currentTime(): number;
  trackName(): string;
  getBands(): AudioBands;
  getActuatorFrame(
    muscleCount: number,
    options?: {
      gains?: DiscoReactivityGains;
      motion?: DiscoMotionControls;
      timeSec?: number;
    },
  ): number[];
}

export function createDiscoAudioPlayer(): DiscoAudioPlayer {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaElementAudioSourceNode | null = null;
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let trackName = '';
  let prevSpectrum: Float32Array | null = null;
  let smooth: AudioBands = {
    bass: 0,
    lowMid: 0,
    highMid: 0,
    treble: 0,
    onset: 0,
    energy: 0,
  };

  function ensureGraph(): void {
    if (!audio) return;
    if (!ctx) ctx = new AudioContext();
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.7;
    }
    if (!source) {
      source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
    }
  }

  function bandEnergy(spectrum: Float32Array, sampleRate: number, lo: number, hi: number): number {
    if (!analyser) return 0;
    const binHz = sampleRate / analyser.fftSize;
    let peak = 0;
    const i0 = Math.max(0, Math.floor(lo / binHz));
    const i1 = Math.min(spectrum.length - 1, Math.ceil(hi / binHz));
    for (let i = i0; i <= i1; i++) peak = Math.max(peak, spectrum[i]);
    // spectrum is in dB-ish from getFloatFrequencyData (−∞..0); map to 0..1
    return clamp01((peak + 100) / 70);
  }

  function readBands(): AudioBands {
    if (!analyser || !ctx) {
      return { bass: 0, lowMid: 0, highMid: 0, treble: 0, onset: 0, energy: 0 };
    }
    const spectrum = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(spectrum);
    const sr = ctx.sampleRate;
    const bass = bandEnergy(spectrum, sr, 20, 150);
    const lowMid = bandEnergy(spectrum, sr, 150, 500);
    const highMid = bandEnergy(spectrum, sr, 500, 2000);
    const treble = bandEnergy(spectrum, sr, 2000, 8000);
    let flux = 0;
    if (prevSpectrum) {
      for (let i = 0; i < spectrum.length; i++) {
        const d = spectrum[i] - prevSpectrum[i];
        if (d > 0) flux += d;
      }
      flux = clamp01(flux / (spectrum.length * 8));
    }
    prevSpectrum = spectrum.slice() as Float32Array;
    const energy = clamp01((bass + lowMid + highMid + treble) / 4);
    const alpha = 0.35;
    smooth = {
      bass: smooth.bass * (1 - alpha) + bass * alpha,
      lowMid: smooth.lowMid * (1 - alpha) + lowMid * alpha,
      highMid: smooth.highMid * (1 - alpha) + highMid * alpha,
      treble: smooth.treble * (1 - alpha) + treble * alpha,
      onset: smooth.onset * (1 - alpha) + flux * alpha,
      energy: smooth.energy * (1 - alpha) + energy * alpha,
    };
    return { ...smooth };
  }

  function bandsToActuators(
    bands: AudioBands,
    muscleCount: number,
    gains: DiscoReactivityGains,
  ): number[] {
    const levels = [
      bands.bass * gains.bass,
      bands.lowMid * gains.lowMid,
      bands.highMid * gains.highMid,
      bands.treble * gains.treble,
    ].map((v) => Math.pow(clamp01(v * gains.master), 0.65));
    const out = new Array(muscleCount).fill(0);
    for (let i = 0; i < muscleCount; i++) {
      const level = levels[i % levels.length];
      if (level < SILENCE) continue;
      const sign = i % 2 === 0 ? 1 : -1;
      out[i] = clampAct(sign * level + bands.onset * gains.onset * 0.35 * sign);
    }
    return out;
  }

  function applyMotion(
    actuators: number[],
    motion: DiscoMotionControls,
    timeSec: number,
  ): number[] {
    return actuators.map((a, i) => {
      if (Math.abs(a) < SILENCE) return 0;
      const phase = timeSec * motion.frequency * Math.PI * 2 + i * 0.7;
      const wave = Math.sin(phase);
      const lean = Math.sign(a) * Math.abs(a);
      return clampAct(lean * (0.55 + 0.45 * wave) * motion.range);
    });
  }

  return {
    async loadFile(file: File) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (source) {
        try {
          source.disconnect();
        } catch {
          /* ignore */
        }
        source = null;
      }
      objectUrl = URL.createObjectURL(file);
      trackName = file.name;
      if (!audio) audio = new Audio();
      audio.src = objectUrl;
      audio.crossOrigin = 'anonymous';
      await audio.play().catch(() => undefined);
      audio.pause();
      audio.currentTime = 0;
      ensureGraph();
      if (ctx?.state === 'suspended') await ctx.resume();
    },
    play() {
      ensureGraph();
      void ctx?.resume();
      void audio?.play();
    },
    pause() {
      audio?.pause();
    },
    seek(seconds: number) {
      if (audio) audio.currentTime = Math.max(0, seconds);
    },
    dispose() {
      audio?.pause();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      try {
        source?.disconnect();
        analyser?.disconnect();
      } catch {
        /* ignore */
      }
      source = null;
      analyser = null;
      void ctx?.close();
      ctx = null;
      audio = null;
    },
    isPlaying() {
      return !!audio && !audio.paused && !audio.ended;
    },
    hasTrack() {
      return !!audio?.src;
    },
    duration() {
      return audio?.duration || 0;
    },
    currentTime() {
      return audio?.currentTime || 0;
    },
    trackName() {
      return trackName;
    },
    getBands: readBands,
    getActuatorFrame(muscleCount, options) {
      const bands = readBands();
      const gains = options?.gains ?? DEFAULT_DISCO_REACTIVITY;
      const motion = options?.motion ?? DEFAULT_DISCO_MOTION;
      const t = options?.timeSec ?? audio?.currentTime ?? 0;
      return applyMotion(bandsToActuators(bands, muscleCount, gains), motion, t);
    },
  };
}
