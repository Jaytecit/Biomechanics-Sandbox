/**
 * H6 — Buffer of (dance obs → channel drives) samples for imitation learning.
 */
import { BRAIN_HZ } from '../brain/constants';
import type { DanceDataset } from '../brain/imitate';

/** ~90s at brain rate. */
export const DISCO_RECORD_MAX_SAMPLES = BRAIN_HZ * 90;
/** Minimum samples before Learn is enabled (~5s). */
export const DISCO_RECORD_MIN_SAMPLES = BRAIN_HZ * 5;

export class DiscoRecordBuffer {
  private inputs: Float32Array[] = [];
  private targets: Float32Array[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = DISCO_RECORD_MAX_SAMPLES) {
    this.maxSamples = Math.max(1, maxSamples);
  }

  get sampleCount(): number {
    return this.inputs.length;
  }

  get durationSec(): number {
    return this.inputs.length / BRAIN_HZ;
  }

  clear(): void {
    this.inputs = [];
    this.targets = [];
  }

  pushSample(obs: ArrayLike<number>, channelDrives: ArrayLike<number>): void {
    const inCopy = new Float32Array(obs.length);
    inCopy.set(obs);
    const tCopy = new Float32Array(channelDrives.length);
    tCopy.set(channelDrives);
    if (this.inputs.length >= this.maxSamples) {
      this.inputs.shift();
      this.targets.shift();
    }
    this.inputs.push(inCopy);
    this.targets.push(tCopy);
  }

  toDataset(): DanceDataset {
    return {
      inputs: this.inputs.slice(),
      targets: this.targets.slice(),
    };
  }
}
