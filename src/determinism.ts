/** Deterministic helpers for reconstructable worlds, probes, and fingerprints. */
export function normalizeSeed(seed: number | undefined, fallback = 42): number {
  return Number.isFinite(seed) ? (Math.trunc(seed as number) >>> 0) : (fallback >>> 0);
}

export function seededRandom(seed: number): () => number {
  let state = normalizeSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(
    key => `${JSON.stringify(key)}:${stableStringify(record[key])}`
  ).join(',')}}`;
}

export function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
