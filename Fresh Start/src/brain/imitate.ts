/**
 * H6 — Supervised MSE / SGD imitation fit for the fixed tanh MLP.
 * Seeded RNG only; yields between epoch chunks so the UI can breathe.
 */
import { createRng, evaluateNetwork, randomWeights } from './network';
import type { NetworkShape } from './types';

export interface DanceDataset {
  inputs: Float32Array[];
  targets: Float32Array[];
}

export interface FitImitationProgress {
  epoch: number;
  epochs: number;
  loss: number;
}

export interface FitImitationOptions {
  shape: NetworkShape;
  dataset: DanceDataset;
  seed: number;
  epochs?: number;
  lr?: number;
  batchSize?: number;
  /** Yield to the event loop every this many epochs (default 1). */
  yieldEvery?: number;
  /** Warm-start from prior dance weights (copied); else seeded random. */
  initialWeights?: Float32Array | null;
  onProgress?: (p: FitImitationProgress) => void;
}

export interface FitImitationResult {
  weights: Float32Array;
  finalLoss: number;
}

function sech2(y: number): number {
  // d(tanh)/dz = 1 - tanh^2
  return 1 - y * y;
}

/** Mean squared error of network outputs vs targets over the full dataset. */
export function imitationLoss(
  shape: NetworkShape,
  weights: Float32Array,
  dataset: DanceDataset,
): number {
  const { inputs, targets } = dataset;
  if (inputs.length === 0) return 0;
  const out = new Float32Array(shape.outputCount);
  let sum = 0;
  for (let n = 0; n < inputs.length; n++) {
    evaluateNetwork(shape, weights, inputs[n], out);
    const t = targets[n];
    for (let o = 0; o < shape.outputCount; o++) {
      const d = (out[o] ?? 0) - (t[o] ?? 0);
      sum += d * d;
    }
  }
  return sum / (inputs.length * shape.outputCount);
}

/**
 * One SGD step on a mini-batch. Backprop through tanh MLP layout matching
 * evaluateNetwork: [W1, b1, W2, b2].
 */
function sgdBatch(
  shape: NetworkShape,
  weights: Float32Array,
  inputs: Float32Array[],
  targets: Float32Array[],
  indices: number[],
  lr: number,
): void {
  const { inputCount, hiddenCount, outputCount } = shape;
  const w1End = hiddenCount * inputCount;
  const b1End = w1End + hiddenCount;
  const w2End = b1End + outputCount * hiddenCount;

  const grad = new Float32Array(weights.length);
  const hidden = new Float32Array(hiddenCount);
  const out = new Float32Array(outputCount);
  const dOut = new Float32Array(outputCount);
  const dHid = new Float32Array(hiddenCount);

  const n = indices.length;
  if (n === 0) return;

  for (const idx of indices) {
    const x = inputs[idx];
    const t = targets[idx];

    // Forward (same as evaluateNetwork)
    for (let h = 0; h < hiddenCount; h++) {
      let sum = weights[w1End + h];
      const row = h * inputCount;
      for (let i = 0; i < inputCount; i++) sum += weights[row + i] * x[i];
      hidden[h] = Math.tanh(sum);
    }
    for (let o = 0; o < outputCount; o++) {
      let sum = weights[w2End + o];
      const row = b1End + o * hiddenCount;
      for (let h = 0; h < hiddenCount; h++) sum += weights[row + h] * hidden[h];
      out[o] = Math.tanh(sum);
      dOut[o] = (2 / (n * outputCount)) * (out[o] - (t[o] ?? 0)) * sech2(out[o]);
    }

    dHid.fill(0);
    for (let o = 0; o < outputCount; o++) {
      const row = b1End + o * hiddenCount;
      grad[w2End + o] += dOut[o];
      for (let h = 0; h < hiddenCount; h++) {
        grad[row + h] += dOut[o] * hidden[h];
        dHid[h] += dOut[o] * weights[row + h];
      }
    }
    for (let h = 0; h < hiddenCount; h++) {
      const dh = dHid[h] * sech2(hidden[h]);
      grad[w1End + h] += dh;
      const row = h * inputCount;
      for (let i = 0; i < inputCount; i++) {
        grad[row + i] += dh * x[i];
      }
    }
  }

  for (let i = 0; i < weights.length; i++) {
    weights[i] -= lr * grad[i];
  }
}

function shuffleInPlace(arr: number[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function yieldTick(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setTimeout === 'function') setTimeout(resolve, 0);
    else resolve();
  });
}

/** Fit MLP weights to imitate teacher channel drives. */
export async function fitImitation(
  opts: FitImitationOptions,
): Promise<FitImitationResult> {
  const {
    shape,
    dataset,
    seed,
    epochs = 40,
    lr = 0.05,
    batchSize = 32,
    yieldEvery = 1,
    initialWeights = null,
    onProgress,
  } = opts;

  if (dataset.inputs.length === 0) {
    throw new Error('fitImitation: empty dataset');
  }
  if (dataset.inputs.length !== dataset.targets.length) {
    throw new Error('fitImitation: inputs/targets length mismatch');
  }
  for (let i = 0; i < dataset.inputs.length; i++) {
    if (dataset.inputs[i].length < shape.inputCount) {
      throw new Error(`fitImitation: input ${i} too short`);
    }
    if (dataset.targets[i].length < shape.outputCount) {
      throw new Error(`fitImitation: target ${i} too short`);
    }
  }

  const rng = createRng(seed);
  let weights: Float32Array;
  if (initialWeights && initialWeights.length === shape.weightCount) {
    weights = new Float32Array(initialWeights);
  } else {
    weights = randomWeights(shape, rng);
  }
  const order = Array.from({ length: dataset.inputs.length }, (_, i) => i);

  let lastLoss = imitationLoss(shape, weights, dataset);
  onProgress?.({ epoch: 0, epochs, loss: lastLoss });

  for (let epoch = 1; epoch <= epochs; epoch++) {
    shuffleInPlace(order, rng);
    for (let start = 0; start < order.length; start += batchSize) {
      const batch = order.slice(start, start + batchSize);
      sgdBatch(shape, weights, dataset.inputs, dataset.targets, batch, lr);
    }
    lastLoss = imitationLoss(shape, weights, dataset);
    onProgress?.({ epoch, epochs, loss: lastLoss });
    if (yieldEvery > 0 && epoch % yieldEvery === 0) {
      await yieldTick();
    }
  }

  return { weights, finalLoss: lastLoss };
}

/** Library fitness from imitation loss (higher is better). */
export function imitationFitness(loss: number): number {
  return 1 / (1 + Math.max(0, loss));
}
