# Capability ADR — Structural aero parts (wing / glider / parachute)

## Status

Accepted / Implemented

## Checklist IDs

G10, C1.8 (deepen), E6.6 (deepen). D6 multi-brain explicitly out of scope.

## Goal

Author three structural aero part types on bones, driven by the normal single MLP + muscles (no deploy state machine, no multi-brain phases):

- **Wing** — must be authored in pairs; lift from flapping (paddle/pressure against relative airflow).
- **Glider** — rigid sail; lift from forward airspeed + pitch (AoA).
- **Parachute** — jointed canopy chain; inflation drag when *descending* into a cupped canopy (strong on vertical fall, streams/deflates on horizontal motion so gait forward speed is not ruined).

## Rapier design (Fresh Start only)

- Bodies / colliders / joints / materials involved:
  - Existing bone capsules + revolute impulse joints only.
  - Parachute “flexibility” = user-authored (or preset) chain of short bones tagged `aeroType: 'parachute'`; no soft-body solver.
- Collision group bits: unchanged.
- Forces / motors applied where:
  - `applyAeroForces` each fixed step after muscles, before `world.step()`, with `resetForces`/`resetTorques` already applied that step.
  - Mutable runtime `chuteInflation` on parachute bones (0…1), not part of blueprint.
- New keys in `src/physics/constants.ts`:
  - `WING_FLAP_LIFT_COEFF` (downstroke world-up lift), `WING_PADDLE_DRAG_COEFF` (light two-way drag)
  - `GLIDER_LIFT_COEFF`, `GLIDER_DRAG_COEFF`
  - `PARA_DRAG_COEFF`, `PARA_INFLATE_RATE`, `PARA_DEFLATE_RATE`, `PARA_STREAM_DRAG_SCALE`
  - Legacy `AERO_DRAG_COEFF` / `AERO_LIFT_COEFF` retained when structural flag off or type omitted.
- Wing model: lift only while the wing bone’s world `vy < 0` (downstroke); upstroke feathered. Symmetric paddle-only force self-braked flaps and canceled over a cycle.

## Explicit non-goals

- Do **not** import parent soft-body solver, aero tables, paraPilot gates, or flight-audit tuning.
- No parachute deploy / packed state machine.
- No multi-brain phase handoff (D6 deferred).
- Do **not** step physics with variable/render dt.
- Do **not** introduce unseeded randomness on the eval path.

## Smoke gate

`scripts/smoke-tasks.mts`:

- Legacy/glider body still falls slower with aero than without.
- Parachute-tagged dropper falls slower than identical bare body.
- Parachute streaming (mostly horizontal coast) retains more forward speed than a face-cupped high-inflation case (or vs always-max drag baseline).
- High-area paired flapper under sine drive gains height vs the same body with wing forces disabled.

## Rollback

`featureFlags.structuralAeroParts` — when off, use legacy G9 lift/drag on any `aeroArea`.
