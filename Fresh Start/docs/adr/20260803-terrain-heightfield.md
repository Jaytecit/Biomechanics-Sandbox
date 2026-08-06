# Capability ADR — Terrain heightfield (Environment Studio)

## Status

Accepted / Implemented

## Checklist IDs

G3, C2.3 (unlocks E6.8 rough terrain next)

## Goal

Spawn authored `EnvTerrain` as a Rapier 2D heightfield so Environment Studio hills are physical, and fill D7 `terrainGrade` / terrain-relative contact observations.

## Rapier design (Fresh Start only)

- One fixed rigid body + `ColliderDesc.heightfield(heights, scale)`
- `heights[i] = max(0, samples[i] * amplitude)` (samples are unitless; amplitude → meters)
- Body at `((startX+endX)/2, 0)`; `scale = { x: endX-startX, y: 1 }`
- Collision groups: ground membership bit 2 (same as infinite floor / obstacles)
- Friction / restitution: `GROUND_FRICTION` / `GROUND_RESTITUTION`
- Size / sample clamps in `src/physics/constants.ts`
- Spawn via `spawnTerrainHeightfield`; destroy on env replace
- Gated by `featureFlags.terrainHeightfield`
- Infinite halfspace ground remains; heightfield adds surface above it (valleys clamped ≥ 0)

## Explicit non-goals

- No parent terrain collision math or feel tuning
- No towers (C2.4), rough-terrain goal scoring (E6.8), or para (G10)
- No new collision-group bits
- Does not remove or hole-punch the infinite ground

## Smoke gate

`scripts/smoke-tasks.mts` — `assertTerrainHeightfield`: spawn from design; hopper settles on a bump; `terrainGrade` non-zero on a slope sample.

## Rollback

`featureFlags.terrainHeightfield = false`
