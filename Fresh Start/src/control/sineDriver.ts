/** Oscillating per-muscle drive for feel testing without a brain. */

export function sineMuscleOutputs(
  muscleCount: number,
  timeSec: number,
  /** Default ~matches PHASE_CLOCK_HZ so Oscillate can sustain flaps. */
  frequencyHz = 2.5,
  phaseSpread = 0.7,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < muscleCount; i++) {
    const phase = i * phaseSpread;
    out.push(Math.sin(2 * Math.PI * frequencyHz * timeSec + phase));
  }
  return out;
}
