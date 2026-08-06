# Capability ADR — Disco puppet modes

## Status

Accepted / Implemented

## Checklist IDs

H2 (Disco mode) — feel variants for testing; does not unlock new checklist rows.

## Goal

Selectable disco-only body feels (Natural / Stiff strings / Marionette / Full puppet) so dancers can hold pose like puppets with muscles as strings, without changing Evolve/Edit physics.

## Rapier design (Fresh Start only)

- Existing dynamic joint/bone bodies only (no new body types or collision groups)
- Per mode: `RigidBody.setGravityScale`, `setLinearDamping`, `setAngularDamping` on disco dancers (and solo disco arena creature)
- Muscle path: optional spring/damper/maxForce multipliers + optional rest-length drive in `applyMuscleForces` (disco steps only)
- Tunables in `src/physics/constants.ts` → `DISCO_PUPPET_MODES`
- Still fixed-dt + `resetForces` / `resetTorques` every physics step

## Explicit non-goals

- Do not import parent soft-body puppet / hinge-stop solvers
- Do not retune global `MUSCLE_SPRING` / `GRAVITY_Y` used by evolve
- Do not step physics with variable/render dt

## Smoke gate

`npm run smoke:all` — existing feel / firewall / evolve gates (no mode-specific script; disco modes are opt-in UI).

## Rollback

Leave selector on **Natural** (default). Or ignore `setDiscoPuppetMode` / always pass no muscle options outside disco.
