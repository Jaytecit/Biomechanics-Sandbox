# Capability ADR — Static obstacles (Environment Studio)

## Status

Accepted / Implemented

## Checklist IDs

G1, C2.1 (partial set: box / ramp / stair / pit / loop)

## Goal

Spawn authored environment obstacles as fixed Rapier colliders so Environment Studio packages are playable, not data-only. Climb’s hardcoded course (E6.3) stays separate.

## Rapier design (Fresh Start only)

- Fixed rigid bodies + cuboid colliders composed per `ObstacleKind`
- Collision groups: same as ground (membership bit 2), collide with creature parts — no new bits
- Friction / restitution: `GROUND_FRICTION` / `GROUND_RESTITUTION` for most kinds; ramps use `RAMP_FRICTION` (1.85 — higher grip, same restitution)
- Plant-slide brake: feet in Rapier contact with obstacle bodies (ramps/stairs/boxes) get the same horizontal damp as terrain plants, so elevated slabs are not ice-skates
- Size clamps in `src/physics/constants.ts` (`OBSTACLE_*`); kind composition in `src/physics/obstacles.ts`
- Spawn via `spawnStaticObstacles(world, obstacles)`; destroy on env replace / clear
- Gated by `featureFlags.staticObstacles`

Kind mapping (Fresh Start–native, not parent):

| Kind | Composition |
|---|---|
| box | Single cuboid at `(x,y)`, full size `w×h`, optional `rot` |
| ramp | Thin cuboid slab, default tilt if `rot` omitted; `RAMP_FRICTION` |
| stair | Ascending platform steps filling the `w×h` footprint |
| pit | Left/right raised platforms with gap `w` (floor remains infinite ground) |
| loop | Open ring of thin cuboid segments (gap at bottom) |

## Explicit non-goals

- No parent obstacle / soft-body / feel tuning
- No heightfields (G3), towers (C2.4), or para deployables (G10)
- No ice, world objects, or collision-group scheme changes
- Does not replace climb course for task `climb`

## Smoke gate

`scripts/smoke-tasks.mts` — `assertStaticObstacles`: each kind spawns ≥1 body; hopper settles on a box without NaN.

## Rollback

`featureFlags.staticObstacles = false` (geometry authoring UI can remain; spawn skipped).
