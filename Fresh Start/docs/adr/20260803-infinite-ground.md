# Capability ADR — Infinite ground halfspace

## Status

Accepted / Implemented

## Checklist IDs

None (correctness fix for locomotion travel range). Supports all ground-based tasks (E6.1+).

## Goal

Agents must not fall off the world at ±80 units. Ground contact should remain available for however far learning travels.

## Rapier design (Fresh Start only)

- Replace finite `cuboid(80, 0.5)` floor with `ColliderDesc.halfspace({ x: 0, y: 1 })`
- Fixed body translated to `GROUND_Y` so the plane is the walkable surface
- Collision groups unchanged: membership bit 2 (ground), collide with creature filters
- No new feel tunables in `constants.ts`

## Explicit non-goals

- No parent terrain / soft-body ground
- No heightfield or Environment Studio geometry in this change
- No change to gravity, friction, or muscle constants

## Smoke gate

`scripts/smoke-firewall.mts` — dynamic probe far from origin (x ≫ 80) settles onto `GROUND_Y` instead of falling through.

## Rollback

Revert `addGround` in `src/physics/world.ts` to a large/finite cuboid (not recommended).
