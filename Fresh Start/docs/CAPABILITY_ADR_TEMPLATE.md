# Capability ADR — (TITLE)

> Copy this file to `docs/adr/YYYYMMDD-short-name.md` before adding any new Rapier body type, joint limit, material, force model, or world object.

## Status

Proposed | Accepted | Implemented | Rejected

## Checklist IDs

List marked `FEATURE_PORT_CHECKLIST.md` IDs this unlocks (e.g. G4, C2.5).

## Goal

What product behavior needs this capability?

## Rapier design (Fresh Start only)

- Bodies / colliders / joints / materials involved:
- Collision group bits (extend the existing scheme deliberately):
- Forces / motors applied where (must respect fixed-dt + resetForces):
- New keys in `src/physics/constants.ts` (no scattered magic numbers):

## Explicit non-goals

- Do **not** import parent soft-body solver, aero tables, or feel tuning.
- Do **not** step physics with variable/render dt.
- Do **not** introduce unseeded randomness on the eval path.

## Smoke gate

New script or assertions:

- File: `scripts/smoke-*.mts`
- npm script:
- Pass criteria:

## Rollback

How to disable (feature flag key in `src/port/featureFlags.ts`):
