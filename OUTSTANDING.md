# OUTSTANDING.md — Soft-body Sandbox next work

**Updated:** 2026-07-31  
**Authority for shipped truth:** `COMPLETED.md` + `DECISIONS.md`  
**Program plan:** `IDEAS_DEVELOPMENT_PLAN.md` (Phase 22)

Ask the creative director only when progress is genuinely blocked. Ordinary
technical ambiguity is resolved by defaults, tests, and reversible decisions.

---

## Next gate (do this first)

**Phase 22B — Feel presets + Studio↔arena alignment.** Plan fully before coding
(see `IDEAS_DEVELOPMENT_PLAN.md` sketch). Do not mix with gripper / sticky /
further reward rewrites.

D150 (soft-muscle rate caps + telescope→piston) shipped under physics `4.24.0`.
D149 obs/gate retune still warrants re-validation of learning on Run / Jump /
Flight before treating fitness collapse as open.

Suggested order after 22B:
1. Sticky feet or grab claw (one physics-bearing part at a time) — 22C
2. Multi-brain bank + Gauntlet — 22D (can parallel 22C)
3. Morphological evolution — 22E (later)

Phase 22A (D148 live reward recipes) is shipped.

---

## Deferred

### Flight Height learning feel

Stay Aloft elites can fly under Flight Height, but the D110 gated product
plateaus. Candidate repair: capped early duration bridge + three-seed Height
gate. Re-probe after D143 symmetry bias before rewriting the Height formula
again. Retain `smoke-flight-height`, `smoke-flight-single-bout`, and
`prove-flight-learn` when touching this.

Diagnostic scripts (optional, not a gate): `scripts/diagnose-flight-height-vs-aloft.ts`,
`scripts/probe-flight-height-*.ts`.

### Gripper / sticky / platform parts

Implement one vertical slice at a time with exploit smokes after 22B. Do not
mix with reward rewrites.

### Physics/geometry audit leftovers (D153)

The 2026-07-31 repair sweep fixed the highest-severity defects (see D153).
Audited but deferred, roughly in priority order:

1. Surface friction damps world-horizontal velocity only — on ramps/stairs it
   should project onto the surface tangent (downhill slide/spin artifacts).
2. `collideNodeRamp` computes a swept time-of-impact but resolves at the
   endpoint — fast bodies can partially tunnel or launch at the lip.
3. Rigid-bone ramp/capsule contacts move `x/y` without syncing `oldX/oldY`
   (phantom bounce velocity on carts hitting ramps).
4. Legacy `0.35` / `0.4` mass floors in `projectRigidBoneAxialVelocity`,
   `applyWind`, and aero COM math — force scales were tuned around the floors,
   so removing them requires a dedicated retune + flight regression pass.
5. Custom environments: spawn/settle is flat-`GROUND_Y` only
   (`settleSpawnOnGround`); authored terrain at spawn X causes pops.
6. Stair riser collision depth uses fixed `STAIR_STEP_HEIGHT` while actual
   rises vary 0.65×–1.55×.
7. `bar` obstacles are scoring volumes with no body collision — either add a
   thin collider or make the visuals read as non-solid.
8. Hinge-stop `forcePreserveVelocity` applies globally to every link on the
   creature (deliberate D138); narrowing it to links incident on stop nodes
   would restore actuation coupling on hinge bodies — needs its own gate.

### Built-in reward recipe expansion

22A covers SPEED + JUMP_SPEED only. Expand the shared coeff table to more goals
when needed; keep fingerprinting rules from D148.

---

## Standing rules while working

- Soft-body physics version bumps invalidate old controllers; leave them visible
  but stale.
- Evaluation ≠ training; renderer never alters physics or actions.
- Prefer simplest option that proves learning; record reversible decisions in
  `DECISIONS.md`.
- After meaningful changes: run relevant smokes, inspect logs, update
  `COMPLETED.md` / this file, and keep `PROJECT_STATE.md` as the short index.

---

## Explicitly out of scope right now

- Resuming joint angle locks (removed D135; solids replace that need).
- Reopening Flight Recovery as an implementation program (closed D082).
- Observatory Ant/Humanoid capability freeze work (separate track; not in this
  sandbox tree).
