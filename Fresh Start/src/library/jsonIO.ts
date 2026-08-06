/**
 * C5 — JSON import/export for creatures, trained models, and environments.
 */
import { cloneAppearance } from '../appearance/types';
import type { NetworkShape, TaskId } from '../brain/types';
import { cloneDesign, type CreatureDesign } from '../creature/types';
import { isAeroType } from '../editor/aeroValidation';
import { clampTerrain } from '../env/terrainMath';
import { clampScoreRegion } from '../brain/scoreRegions';
import { clampCourseMarker } from '../brain/courseMarkers';
import {
  clampSpawn,
  cloneEnvironment,
  defaultSpawn,
  isCourseMarkerKind,
  isEnvTheme,
  isObstacleKind,
  isScoreRegionKind,
  type EnvironmentDesign,
  type EnvCourseMarker,
  type EnvObstacle,
  type EnvScoreRegion,
  type EnvSpawn,
  type EnvTerrain,
  type EnvTower,
} from '../env/types';
import { clampTower } from '../physics/tower';
import {
  decodeWeights,
  encodeWeights,
  type DanceCurriculumMeta,
} from './savedModels';

export type JsonResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface CreatureExport {
  kind: 'freshstart-creature';
  version: 1;
  design: CreatureDesign;
}

export interface ModelExport {
  kind: 'freshstart-model';
  version: 1;
  name: string;
  task: TaskId;
  shape: NetworkShape;
  weightsB64: string;
  fitness: number;
  design: CreatureDesign;
  danceMeta?: DanceCurriculumMeta;
}

export interface EnvironmentExport {
  kind: 'freshstart-environment';
  version: 1;
  environment: EnvironmentDesign;
}

const TASK_IDS: ReadonlySet<string> = new Set([
  'run',
  'jump',
  'climb',
  'motor',
  'flight',
  'rough',
  'sprint',
  'speed',
  'stay',
  'hang',
  'longjump',
  'dance',
]);

function isTaskId(v: unknown): v is TaskId {
  return typeof v === 'string' && TASK_IDS.has(v);
}

function isNetworkShape(v: unknown): v is NetworkShape {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<NetworkShape>;
  return (
    typeof s.inputCount === 'number' &&
    typeof s.hiddenCount === 'number' &&
    typeof s.outputCount === 'number' &&
    typeof s.weightCount === 'number'
  );
}

export function exportCreatureJson(design: CreatureDesign): string {
  const payload: CreatureExport = {
    kind: 'freshstart-creature',
    version: 1,
    design: cloneDesign(design),
  };
  return JSON.stringify(payload, null, 2);
}

export function exportModelJson(opts: {
  name: string;
  task: TaskId;
  shape: NetworkShape;
  weights: Float32Array;
  fitness: number;
  design: CreatureDesign;
  danceMeta?: DanceCurriculumMeta;
}): string {
  const payload: ModelExport = {
    kind: 'freshstart-model',
    version: 1,
    name: opts.name,
    task: opts.task,
    shape: { ...opts.shape },
    weightsB64: encodeWeights(opts.weights),
    fitness: opts.fitness,
    design: cloneDesign(opts.design),
    ...(opts.danceMeta ? { danceMeta: { ...opts.danceMeta } } : {}),
  };
  return JSON.stringify(payload, null, 2);
}

export function importModelJson(raw: string): JsonResult<{
  name: string;
  task: TaskId;
  shape: NetworkShape;
  weights: Float32Array;
  fitness: number;
  design: CreatureDesign;
  danceMeta?: DanceCurriculumMeta;
}> {
  try {
    const data = JSON.parse(raw) as Partial<ModelExport>;
    if (data.kind !== 'freshstart-model') {
      return { ok: false, error: 'Invalid model JSON: expected freshstart-model' };
    }
    if (!isTaskId(data.task) || !isNetworkShape(data.shape)) {
      return { ok: false, error: 'Invalid model JSON: bad task/shape' };
    }
    if (typeof data.weightsB64 !== 'string' || !data.weightsB64) {
      return { ok: false, error: 'Invalid model JSON: missing weights' };
    }
    const designResult = data.design
      ? importCreatureJson(
          JSON.stringify({
            kind: 'freshstart-creature',
            version: 1,
            design: data.design,
          }),
        )
      : { ok: false as const, error: 'Invalid model JSON: missing design' };
    if (!designResult.ok) {
      return { ok: false, error: designResult.error };
    }
    let weights: Float32Array;
    try {
      weights = decodeWeights(data.weightsB64);
    } catch {
      return { ok: false, error: 'Invalid model JSON: bad weights encoding' };
    }
    if (weights.length !== data.shape.weightCount) {
      return { ok: false, error: 'Invalid model JSON: weight count mismatch' };
    }
    return {
      ok: true,
      value: {
        name: (typeof data.name === 'string' && data.name.trim()) || 'ImportedT',
        task: data.task,
        shape: { ...data.shape },
        weights,
        fitness: typeof data.fitness === 'number' ? data.fitness : 0,
        design: designResult.value,
        ...(data.danceMeta ? { danceMeta: { ...data.danceMeta } } : {}),
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function importCreatureJson(raw: string): JsonResult<CreatureDesign> {
  try {
    const data = JSON.parse(raw) as Partial<CreatureExport> & Partial<CreatureDesign>;
    const design =
      data.kind === 'freshstart-creature' && data.design
        ? data.design
        : (data as CreatureDesign);

    if (!design || !Array.isArray(design.joints) || !Array.isArray(design.bones)) {
      return { ok: false, error: 'Invalid creature JSON: missing joints/bones' };
    }
    if (!Array.isArray(design.muscles)) {
      return { ok: false, error: 'Invalid creature JSON: missing muscles' };
    }
    return {
      ok: true,
      value: {
        name: design.name || 'Imported',
        joints: design.joints.map((j) => ({ ...j })),
        bones: design.bones.map((b) => {
          const next = { ...b };
          if (next.aeroType !== undefined && !isAeroType(next.aeroType)) {
            delete next.aeroType;
          }
          if ((next.aeroArea ?? 0) <= 0) {
            delete next.aeroArea;
            delete next.aeroType;
          }
          return next;
        }),
        muscles: design.muscles.map((m) => ({ ...m })),
        appearance: cloneAppearance(design.appearance),
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function exportEnvironmentJson(environment: EnvironmentDesign): string {
  const payload: EnvironmentExport = {
    kind: 'freshstart-environment',
    version: 1,
    environment: cloneEnvironment(environment),
  };
  return JSON.stringify(payload, null, 2);
}

export function importEnvironmentJson(raw: string): JsonResult<EnvironmentDesign> {
  try {
    const data = JSON.parse(raw) as Partial<EnvironmentExport> &
      Partial<EnvironmentDesign>;
    const environment =
      data.kind === 'freshstart-environment' && data.environment
        ? data.environment
        : (data as EnvironmentDesign);

    if (!environment || typeof environment.name !== 'string') {
      return { ok: false, error: 'Invalid environment JSON: missing name' };
    }
    if (!isEnvTheme(environment.theme ?? '')) {
      return { ok: false, error: 'Invalid environment JSON: bad theme' };
    }
    if (!Array.isArray(environment.obstacles)) {
      return { ok: false, error: 'Invalid environment JSON: missing obstacles' };
    }
    const obstacles: EnvObstacle[] = [];
    for (const raw of environment.obstacles) {
      const o = raw as Partial<EnvObstacle>;
      if (!o || typeof o.id !== 'string' || !isObstacleKind(o.kind ?? '')) {
        return { ok: false, error: 'Invalid environment JSON: bad obstacle' };
      }
      if (
        typeof o.x !== 'number' ||
        typeof o.y !== 'number' ||
        typeof o.w !== 'number' ||
        typeof o.h !== 'number'
      ) {
        return { ok: false, error: 'Invalid environment JSON: obstacle numbers' };
      }
      obstacles.push({
        id: o.id,
        kind: o.kind!,
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        ...(typeof o.rot === 'number' ? { rot: o.rot } : {}),
      });
    }
    const regions: EnvScoreRegion[] = [];
    if (environment.regions !== undefined && environment.regions !== null) {
      if (!Array.isArray(environment.regions)) {
        return { ok: false, error: 'Invalid environment JSON: bad regions' };
      }
      for (const raw of environment.regions) {
        const r = raw as Partial<EnvScoreRegion>;
        if (!r || typeof r.id !== 'string' || !isScoreRegionKind(r.kind ?? '')) {
          return { ok: false, error: 'Invalid environment JSON: bad region' };
        }
        if (
          typeof r.x !== 'number' ||
          typeof r.y !== 'number' ||
          typeof r.w !== 'number' ||
          typeof r.h !== 'number' ||
          typeof r.rate !== 'number'
        ) {
          return {
            ok: false,
            error: 'Invalid environment JSON: region numbers',
          };
        }
        regions.push(
          clampScoreRegion({
            id: r.id,
            kind: r.kind!,
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
            rate: r.rate,
          }),
        );
      }
    }
    const markers: EnvCourseMarker[] = [];
    if (environment.markers !== undefined && environment.markers !== null) {
      if (!Array.isArray(environment.markers)) {
        return { ok: false, error: 'Invalid environment JSON: bad markers' };
      }
      for (const raw of environment.markers) {
        const m = raw as Partial<EnvCourseMarker>;
        if (!m || typeof m.id !== 'string' || !isCourseMarkerKind(m.kind ?? '')) {
          return { ok: false, error: 'Invalid environment JSON: bad marker' };
        }
        if (
          typeof m.x !== 'number' ||
          typeof m.y !== 'number' ||
          typeof m.w !== 'number' ||
          typeof m.h !== 'number'
        ) {
          return {
            ok: false,
            error: 'Invalid environment JSON: marker numbers',
          };
        }
        markers.push(
          clampCourseMarker({
            id: m.id,
            kind: m.kind!,
            x: m.x,
            y: m.y,
            w: m.w,
            h: m.h,
            ...(m.kind === 'checkpoint' && typeof m.order === 'number'
              ? { order: m.order }
              : {}),
          }),
        );
      }
    }
    let terrain: EnvTerrain | undefined;
    if (environment.terrain !== undefined && environment.terrain !== null) {
      const rawT = environment.terrain as Partial<EnvTerrain>;
      if (
        typeof rawT.startX !== 'number' ||
        typeof rawT.endX !== 'number' ||
        typeof rawT.amplitude !== 'number' ||
        !Array.isArray(rawT.samples) ||
        rawT.samples.length < 2 ||
        !rawT.samples.every((s) => typeof s === 'number' && Number.isFinite(s))
      ) {
        return { ok: false, error: 'Invalid environment JSON: bad terrain' };
      }
      terrain = clampTerrain({
        startX: rawT.startX,
        endX: rawT.endX,
        amplitude: rawT.amplitude,
        samples: rawT.samples.slice(),
      });
    }
    let tower: EnvTower | undefined;
    if (environment.tower !== undefined && environment.tower !== null) {
      const rawTower = environment.tower as Partial<EnvTower>;
      if (
        typeof rawTower.x !== 'number' ||
        typeof rawTower.baseW !== 'number' ||
        typeof rawTower.height !== 'number'
      ) {
        return { ok: false, error: 'Invalid environment JSON: bad tower' };
      }
      tower = clampTower({
        x: rawTower.x,
        baseW: rawTower.baseW,
        height: rawTower.height,
      });
    }
    let spawn: EnvSpawn = defaultSpawn();
    if (environment.spawn !== undefined && environment.spawn !== null) {
      const rawSpawn = environment.spawn as Partial<EnvSpawn>;
      if (typeof rawSpawn.x !== 'number' || typeof rawSpawn.y !== 'number') {
        return { ok: false, error: 'Invalid environment JSON: bad spawn' };
      }
      spawn = clampSpawn({ x: rawSpawn.x, y: rawSpawn.y });
    }
    return {
      ok: true,
      value: cloneEnvironment({
        ...(environment as EnvironmentDesign),
        obstacles,
        regions,
        markers,
        terrain,
        tower,
        spawn,
      }),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
