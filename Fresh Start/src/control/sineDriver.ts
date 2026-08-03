/** Oscillating per-muscle drive for feel testing without a brain. */

export function sineMuscleOutputs(
  muscleCount: number,
  timeSec: number,
  frequencyHz = 1.2,
  phaseSpread = 0.7,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < muscleCount; i++) {
    const phase = i * phaseSpread;
    out.push(Math.sin(2 * Math.PI * frequencyHz * timeSec + phase));
  }
  return out;
}
