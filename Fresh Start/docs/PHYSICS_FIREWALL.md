# Physics Firewall

Fresh Start physics must remain correct and independent of the parent soft-body sandbox.

## Must preserve

| Invariant | Location |
|---|---|
| Rapier is the sole integrator / constraint solver | `src/physics/` |
| Fixed-dt stepping (`FIXED_DT = 1/60`) via accumulator | `src/sim/simulation.ts` |
| Muscle spring + damper + active force; equal and opposite | `src/control/muscleDrive.ts` |
| `resetForces` / `resetTorques` every physics step before apply | `src/sim/simulation.ts` |
| Collision groups: creature self-non-collision; collide with ground | `src/physics/spawn.ts`, `src/physics/world.ts` |
| All physics tunables in one place | `src/physics/constants.ts` |
| No unseeded `Math.random` on physics / brain eval path | `src/brain/network.ts` (seeded RNG) |
| Feel gate stays green | `npm run smoke:feel` |

## Hard exclude (parent)

Never copy and never use as physics design guidance:

- `physics.ts`, `physicsConstants.ts`, `aero.ts`, `hingeStops.ts`, `solidSegments.ts`
- Parent terrain collision math, reward/capability physics formulas, `paraPilot` physics gates
- `neat.ts` (learning stack decision: keep Fresh Start MLP + GA)
- Decision logs, flight audits, calibration JSON, parent physics smoke/calibrate scripts
- Any parent notes/rules that would retune Fresh Start feel

## Allowed when porting a marked feature

- Product behavior, UX flows, data-shape *ideas*, asset catalogs
- Rewrite against Fresh Start types and Rapier APIs only
- New Rapier capabilities only after a Fresh Start ADR (`docs/CAPABILITY_ADR_TEMPLATE.md`) and a new smoke assertion

## Regression bar

Before merging any physics-adjacent change:

```bash
npm run smoke:all
```

That runs firewall invariants, feel, and evolve gates.
