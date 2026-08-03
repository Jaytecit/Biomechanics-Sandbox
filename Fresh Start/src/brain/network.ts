import {
  HIDDEN_MAX,
  HIDDEN_MIN,
  OBS_COUNT,
  WEIGHT_INIT_SIGMA,
} from './constants';
import type { NetworkShape } from './types';

/** Seeded mulberry32 RNG for reproducible init / mutation. */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller Gaussian from a [0,1) rng. */
export function gaussian(rng: () => number, sigma = 1): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function hiddenWidth(inputCount: number, outputCount: number): number {
  const raw = 2 * Math.max(inputCount, outputCount);
  return Math.max(HIDDEN_MIN, Math.min(HIDDEN_MAX, raw));
}

/**
 * Build MLP shape. `outputCount` is brain actuator channel count
 * (after drive-group collapse), not necessarily muscle count.
 */
export function makeShape(outputCount: number, inputCount = OBS_COUNT): NetworkShape {
  const hiddenCount = hiddenWidth(inputCount, outputCount);
  // W1: hidden×input, b1: hidden, W2: out×hidden, b2: out
  const weightCount =
    hiddenCount * inputCount + hiddenCount + outputCount * hiddenCount + outputCount;
  return { inputCount, hiddenCount, outputCount, weightCount };
}

export function randomWeights(shape: NetworkShape, rng: () => number): Float32Array {
  const w = new Float32Array(shape.weightCount);
  for (let i = 0; i < w.length; i++) {
    w[i] = gaussian(rng, WEIGHT_INIT_SIGMA);
  }
  return w;
}

export function cloneWeights(weights: Float32Array): Float32Array {
  return new Float32Array(weights);
}

/**
 * Fixed MLP: tanh(W1·x + b1) → tanh(W2·h + b2).
 * Layout: [W1 row-major, b1, W2 row-major, b2].
 * Optional `hiddenOut` receives post-activation hidden units (A7 live viz).
 */
export function evaluateNetwork(
  shape: NetworkShape,
  weights: Float32Array,
  inputs: ArrayLike<number>,
  out?: Float32Array,
  hiddenOut?: Float32Array,
): Float32Array {
  const { inputCount, hiddenCount, outputCount } = shape;
  if (weights.length !== shape.weightCount) {
    throw new Error(`weight length ${weights.length} != ${shape.weightCount}`);
  }
  if (inputs.length < inputCount) {
    throw new Error(`need ${inputCount} inputs, got ${inputs.length}`);
  }

  const result = out && out.length >= outputCount ? out : new Float32Array(outputCount);
  const w1End = hiddenCount * inputCount;
  const b1End = w1End + hiddenCount;
  const w2End = b1End + outputCount * hiddenCount;

  const hidden =
    hiddenOut && hiddenOut.length >= hiddenCount
      ? hiddenOut
      : new Float32Array(hiddenCount);
  for (let h = 0; h < hiddenCount; h++) {
    let sum = weights[w1End + h]; // bias
    const row = h * inputCount;
    for (let i = 0; i < inputCount; i++) {
      sum += weights[row + i] * inputs[i];
    }
    hidden[h] = Math.tanh(sum);
  }

  // Output
  for (let o = 0; o < outputCount; o++) {
    let sum = weights[w2End + o]; // bias
    const row = b1End + o * hiddenCount;
    for (let h = 0; h < hiddenCount; h++) {
      sum += weights[row + h] * hidden[h];
    }
    result[o] = Math.tanh(sum);
  }

  return result;
}
