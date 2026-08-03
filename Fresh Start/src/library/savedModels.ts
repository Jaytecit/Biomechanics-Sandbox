/**
 * D5 — Saved models hub + continue-training transfer.
 */
import type { Genome, NetworkShape, TaskId } from '../brain/types';
import type { CreatureDesign } from '../creature/types';
import { recipeFingerprint } from './bestEver';

const STORAGE_KEY = 'freshstart_saved_models_v1';

export interface SavedModel {
  id: string;
  name: string;
  task: TaskId;
  shape: NetworkShape;
  /** Base64 of Float32 weights for compact JSON. */
  weightsB64: string;
  designFingerprint: string;
  designName: string;
  fitness: number;
  savedAt: number;
}

function encodeWeights(weights: Float32Array): string {
  const bytes = new Uint8Array(weights.buffer, weights.byteOffset, weights.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function decodeWeights(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function readAll(): SavedModel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedModel[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(models: SavedModel[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
}

export function loadSavedModels(): SavedModel[] {
  return readAll().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveModel(opts: {
  name: string;
  task: TaskId;
  shape: NetworkShape;
  genome: Genome;
  design: CreatureDesign;
}): SavedModel {
  const model: SavedModel = {
    id: `m_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: opts.name || `${opts.task} model`,
    task: opts.task,
    shape: { ...opts.shape },
    weightsB64: encodeWeights(opts.genome.weights),
    designFingerprint: recipeFingerprint(opts.task, opts.design),
    designName: opts.design.name,
    fitness: opts.genome.fitness,
    savedAt: Date.now(),
  };
  const all = readAll();
  all.push(model);
  writeAll(all);
  return model;
}

export function deleteSavedModel(id: string): void {
  writeAll(readAll().filter((m) => m.id !== id));
}

export function shapesCompatible(a: NetworkShape, b: NetworkShape): boolean {
  return (
    a.inputCount === b.inputCount &&
    a.hiddenCount === b.hiddenCount &&
    a.outputCount === b.outputCount &&
    a.weightCount === b.weightCount
  );
}

export function modelToSeed(model: SavedModel): {
  shape: NetworkShape;
  weights: Float32Array;
} {
  return {
    shape: { ...model.shape },
    weights: decodeWeights(model.weightsB64),
  };
}
