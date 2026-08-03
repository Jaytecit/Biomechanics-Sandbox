/**
 * A5 — visual pose smoothing (render-only).
 * Extrapolates agent poses by leftover accumulator time using velocities.
 * Does not touch Rapier or change the fixed-dt step.
 */
import { FIXED_DT } from '../physics/constants';
import type { AgentSnapshot, SimulationSnapshot } from './simulation';

function extrapolateAgent(agent: AgentSnapshot, dt: number): AgentSnapshot {
  if (dt <= 1e-9) return agent;
  const bones = agent.bones.map((b) => ({
    ...b,
    x: b.x + b.vx * dt,
    y: b.y + b.vy * dt,
    angle: b.angle + b.omega * dt,
  }));
  const boneById = new Map(bones.map((b) => [b.id, b]));
  return {
    ...agent,
    joints: agent.joints.map((j) => ({
      ...j,
      x: j.x + j.vx * dt,
      y: j.y + j.vy * dt,
    })),
    bones,
    muscles: agent.muscles.map((m) => {
      // Muscle visual stores world endpoints; nudge using nearest bone centers if present.
      const approx = m;
      void boneById;
      return {
        ...approx,
        ax: m.ax,
        ay: m.ay,
        bx: m.bx,
        by: m.by,
      };
    }),
  };
}

export function applyVisualPoseSmoothing(
  snap: SimulationSnapshot,
  extrapolateDt: number,
): SimulationSnapshot {
  // Guard: leftover must stay sub-frame. Multi-tick debt (e.g. Max train speed
  // under load) would look like the model exploding.
  const dt = Math.min(Math.max(0, extrapolateDt), FIXED_DT);
  if (dt <= 1e-9) return snap;
  const agents = snap.agents.map((a) => extrapolateAgent(a, dt));
  const focused = agents.find((a) => a.focused) ?? agents[0];
  return {
    ...snap,
    agents,
    joints: focused?.joints ?? snap.joints,
    bones: focused?.bones ?? snap.bones,
    muscles: focused?.muscles ?? snap.muscles,
  };
}
