/**
 * C5 — JSON import/export for creatures and environments.
 */
import { cloneAppearance } from '../appearance/types';
import { cloneDesign, type CreatureDesign } from '../creature/types';
import {
  cloneEnvironment,
  isEnvTheme,
  type EnvironmentDesign,
} from '../env/types';

export type JsonResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface CreatureExport {
  kind: 'freshstart-creature';
  version: 1;
  design: CreatureDesign;
}

export interface EnvironmentExport {
  kind: 'freshstart-environment';
  version: 1;
  environment: EnvironmentDesign;
}

export function exportCreatureJson(design: CreatureDesign): string {
  const payload: CreatureExport = {
    kind: 'freshstart-creature',
    version: 1,
    design: cloneDesign(design),
  };
  return JSON.stringify(payload, null, 2);
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
        bones: design.bones.map((b) => ({ ...b })),
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
    return { ok: true, value: cloneEnvironment(environment as EnvironmentDesign) };
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
