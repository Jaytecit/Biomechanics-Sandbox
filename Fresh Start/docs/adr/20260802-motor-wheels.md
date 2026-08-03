# Capability ADR — Motor wheel torque

## Status

Accepted / Implemented

## Checklist IDs

E6.5 (Motor / wheeled). Minimal unlock; full G6 Studio authoring still unchecked.

## Goal

Allow brain (or manual) drives to spin designated wheel joints via Rapier torque each fixed step.

## Rapier design (Fresh Start only)

- Optional `JointDef.isWheel` + `motorStrength?`
- Each physics step after muscle forces: `addTorque` on wheel joint bodies from drive channel
- Torque constants in `physics/constants.ts`: `MOTOR_TORQUE_SCALE`
- Still uses fixed-dt + resetForces/resetTorques every step
- Collision groups unchanged (wheels are joint balls)

## Explicit non-goals

- No parent soft-body motor cart formulas
- No wheel-as-separate-body / axle constraint v1 (joint ball + torque is enough for a motor task)

## Smoke gate

`scripts/smoke-tasks.mts` — wheeled design under constant torque moves in +X vs idle.

## Rollback

`featureFlags.motorWheels`; ignore `isWheel` when flag off / task ≠ motor.
