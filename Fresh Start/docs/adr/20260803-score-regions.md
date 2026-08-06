# Capability ADR — Score regions (penalty / reward)

## Status

Accepted / Implemented

## Checklist IDs

C2.9

## Goal

Author axis-aligned penalty and reward regions in Environment Studio so training fitness can discourage keep-out zones (e.g. pit gaps) and grant one-shot bonuses for reaching areas, without new Rapier geometry.

## Design (Fresh Start only — non-Rapier)

- Schema: `EnvironmentDesign.regions: EnvScoreRegion[]` (`penalty` | `reward`)
- Geometry: AABB centered at `(x, y)` with size `w×h`
- **Penalty:** time-in-zone — while any creature joint overlaps, accumulate `rate * dt`
- **Reward:** touch-once — on first overlap of a reward region, add flat `rate` once (staying does not accrue more)
- Apply: `fitness = max(0, baseFitness − penaltyAccum + rewardAccum)` after task base score
- No Rapier bodies, sensors, or collision-group changes
- Visual overlays only (editor + sim snapshot)
- Gated by `featureFlags.scoreRegions`

## Explicit non-goals

- Rapier sensors / solid hazard colliders
- Episode-end-on-enter modes
- Auto-derived pit-gap regions
- Object sensors in observations (D7 stays contact/terrain only)
- Parent soft-body / feel tuning

## Smoke gate

- File: `scripts/smoke-tasks.mts` — `assertScoreRegions`
- npm script: `npm run smoke:tasks` / `smoke:all`
- Pass criteria: penalty lowers fitness vs baseline; reward raises once; import validates kinds; flag off ignores regions

## Rollback

`featureFlags.scoreRegions = false` (authoring UI tools hidden; eval ignores `regions`).
