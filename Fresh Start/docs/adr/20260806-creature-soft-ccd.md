# Capability ADR — Creature soft CCD (anti-tunneling)

## Status

Accepted / Implemented

## Checklist IDs

G1 / C2.1 deepen (static obstacles contact quality); creature spawn hardening

## Goal

Stop joint/bone colliders from visibly tunneling into static obstacles (ramps, boxes, stairs) at evolve speeds — especially thin-ramp → tall-box corners on courses like Gauntlet.

## Rapier design (Fresh Start only)

- Bodies: creature **joints** and **bones** (dynamic)
- API: `RigidBody.setSoftCcdPrediction(...)` each fixed step via `syncCreatureSoftCcd` (`src/physics/spawn.ts`), called from `Simulation` immediately before `world.step()`
- Constants in `src/physics/constants.ts`:
  - `SOFT_CCD_PREDICTION` — meters of path prediction when armed (`0` disables)
  - `SOFT_CCD_SPEED_GATE` — min `|linvel|` (m/s) before prediction is armed (tuned ~24 so walk/sine spikes stay ungated while ballistic wall hits arm)
- Speed gate keeps planted gait / idle coast feel; fast impacts into boxes/ramps get anti-tunneling
- Collision groups: **unchanged** (joints/bones membership + filter bit 2 for ground/obstacles)
- No new collider shapes, materials, joints, or world objects
- Fixed-dt stepping unchanged; still `resetForces` / `resetTorques` each physics step

Soft-CCD is Rapier’s cheaper predictive-constraint path (not full shape-cast CCD substeps). Empirically cuts ballistic wall penetration from ~joint-radius depth to contact slop. Always-on soft CCD was rejected — it inflated idle coast past the feel smoke gate.

## Explicit non-goals

- Do **not** import parent soft-body solver, aero tables, or feel tuning.
- Do **not** step physics with variable/render dt.
- Do **not** introduce unseeded randomness on the eval path.
- No hard `setCcdEnabled` by default (measured no help on this smash/ballistic case; costlier).
- No change to score-only course markers (they are not colliders).

## Smoke gate

- File: `scripts/smoke-tasks.mts` — `assertStaticObstacles` ballistic penetration check
- npm script: `npm run smoke:tasks` / `smoke:all`
- Pass criteria: high-speed joint impact into a tall box keeps max penetration well below `JOINT_RADIUS`

## Rollback

Set `SOFT_CCD_PREDICTION = 0` in `src/physics/constants.ts` (skips `syncCreatureSoftCcd`).
