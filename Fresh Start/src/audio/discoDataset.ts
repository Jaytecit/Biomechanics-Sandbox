/**
 * H7 — Mergeable multi-track dance imitation dataset.
 * In-memory primary store; optional IndexedDB persistence for long sessions.
 */
import type { DanceDataset } from '../brain/imitate';
import { BRAIN_HZ } from '../brain/constants';

export interface TrackDatasetSlice {
  trackId: string;
  trackName: string;
  creatureFingerprint: string;
  inputs: Float32Array[];
  targets: Float32Array[];
}

const IDB_NAME = 'freshstart_disco_curriculum_v1';
const IDB_STORE = 'datasets';

export class MultiTrackDanceDataset {
  private slices = new Map<string, TrackDatasetSlice>();

  clear(): void {
    this.slices.clear();
  }

  clearTrack(trackId: string): void {
    this.slices.delete(trackId);
  }

  get trackIds(): string[] {
    return [...this.slices.keys()];
  }

  sampleCount(): number {
    let n = 0;
    for (const s of this.slices.values()) n += s.inputs.length;
    return n;
  }

  durationSec(): number {
    return this.sampleCount() / BRAIN_HZ;
  }

  appendSamples(
    trackId: string,
    trackName: string,
    creatureFingerprint: string,
    obs: ArrayLike<number>,
    channelDrives: ArrayLike<number>,
  ): void {
    let slice = this.slices.get(trackId);
    if (!slice) {
      slice = {
        trackId,
        trackName,
        creatureFingerprint,
        inputs: [],
        targets: [],
      };
      this.slices.set(trackId, slice);
    }
    const inCopy = new Float32Array(obs.length);
    inCopy.set(obs);
    const tCopy = new Float32Array(channelDrives.length);
    tCopy.set(channelDrives);
    slice.inputs.push(inCopy);
    slice.targets.push(tCopy);
  }

  /** Merge all slices (optionally filter by creature fingerprint). */
  toDataset(creatureFingerprint?: string): DanceDataset {
    const inputs: Float32Array[] = [];
    const targets: Float32Array[] = [];
    for (const s of this.slices.values()) {
      if (
        creatureFingerprint &&
        s.creatureFingerprint !== creatureFingerprint
      ) {
        continue;
      }
      for (let i = 0; i < s.inputs.length; i++) {
        inputs.push(s.inputs[i]!);
        targets.push(s.targets[i]!);
      }
    }
    return { inputs, targets };
  }

  /**
   * Hold out every Nth sample from the last track for early-stop validation.
   * Returns { train, holdout }.
   */
  splitHoldout(holdoutEvery = 5): { train: DanceDataset; holdout: DanceDataset } {
    const trainIn: Float32Array[] = [];
    const trainT: Float32Array[] = [];
    const holdIn: Float32Array[] = [];
    const holdT: Float32Array[] = [];
    let i = 0;
    for (const s of this.slices.values()) {
      for (let k = 0; k < s.inputs.length; k++) {
        if (i % holdoutEvery === 0) {
          holdIn.push(s.inputs[k]!);
          holdT.push(s.targets[k]!);
        } else {
          trainIn.push(s.inputs[k]!);
          trainT.push(s.targets[k]!);
        }
        i++;
      }
    }
    if (trainIn.length === 0) {
      return {
        train: { inputs: holdIn, targets: holdT },
        holdout: { inputs: [], targets: [] },
      };
    }
    return {
      train: { inputs: trainIn, targets: trainT },
      holdout: { inputs: holdIn, targets: holdT },
    };
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('idb open failed'));
  });
}

/** Persist one track slice (inputs/targets as plain arrays of number[]). */
export async function persistTrackSlice(slice: TrackDatasetSlice): Promise<void> {
  try {
    const db = await openDb();
    const payload = {
      trackId: slice.trackId,
      trackName: slice.trackName,
      creatureFingerprint: slice.creatureFingerprint,
      inputs: slice.inputs.map((a) => Array.from(a)),
      targets: slice.targets.map((a) => Array.from(a)),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(payload, slice.trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idb put failed'));
    });
    db.close();
  } catch {
    /* optional persistence — ignore when unavailable */
  }
}

export async function loadPersistedSlices(): Promise<TrackDatasetSlice[]> {
  try {
    const db = await openDb();
    const rows = await new Promise<TrackDatasetSlice[]>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => {
        const raw = (req.result ?? []) as Array<{
          trackId: string;
          trackName: string;
          creatureFingerprint: string;
          inputs: number[][];
          targets: number[][];
        }>;
        resolve(
          raw.map((r) => ({
            trackId: r.trackId,
            trackName: r.trackName,
            creatureFingerprint: r.creatureFingerprint,
            inputs: r.inputs.map((a) => Float32Array.from(a)),
            targets: r.targets.map((a) => Float32Array.from(a)),
          })),
        );
      };
      req.onerror = () => reject(req.error ?? new Error('idb getAll failed'));
    });
    db.close();
    return rows;
  } catch {
    return [];
  }
}
