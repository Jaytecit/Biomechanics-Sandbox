# COMPLETED.md — Soft-body Sandbox shipped work

**Updated:** 2026-07-28  
**Physics:** `4.21.0`  
**Active goals:** 49 (+ one retired legacy enum: Motor Bridge)  
**Detail log:** `DECISIONS.md` (D055–D144). Closed flight records: `FLIGHT_*.md`.

---

## Product

- Phase 21 biological sandbox (D081): deterministic physics/goal truth, versioned
  creature packages, renderer-only appearance, capability diagnostics, user
  environments, observation-first UI, visual polish.
- Flight product accepted (D082); temporary standalone glider demo retired.
- Arena Championship app (events, heats, podiums, leaderboards) under
  `Arena Championship/`.
- Zones (Flying / Motor / Walking / Jumping / Free) with launch eligibility.
- Studio: bones, soft muscles, telescopes, pistons, solid segments, feet,
  90° hinge stops, biological skin, drawers clear of canvas.
- Models hub: shelf + untrained picker, continue-training transfer, permanent
  delete, Best Ever ledger (session + shelf + generation length).
- Immersive fullscreen default; viewport-contained builders; Run-tab performance
  diagnostics (opt-in).

---

## Physics & actuation (current truth)

| Version | Decision | What shipped |
|---|---|---|
| 4.21.0 | D144 | Wheeled solid floor plant: wheel-aware depth; always lift penetration; reseat flat-only |
| 4.20.0 | D143 | Bird-like symmetrical flap lift + Stay Aloft / Height sym bonus |
| 4.19.0 | D142 | Soft actuation + aero coupling; motor chassis share; flat replant gated off ramps |
| 4.18.0 | D141 | Verlet-preserving length projections; grounded spawn settle |
| 4.17.0 | D140 | Run travel-primary fitness (step points demoted) |
| 4.16.0 | D139 | Foot-only alternating steps |
| 4.15.0 | D138 | Authored feet + 90° hinge stops |
| 4.14.0 | D137 | Step-strict Run vs Shuffle |
| 4.13.0 | D136 | Solid segments (shape-matched plates; not angle locks) |
| 4.12.0 | D135 | Joint locks removed entirely |
| 4.7.x | D128–D129 | Walk/jump/hop contact defs; plant-frontier anti-farm |
| 4.6.0 | D127 | Authorable pistons |
| 4.5.x | D123–D126 | Telescopes + independent length extremes + jump stroke |
| earlier | D089–D094 | Ramp/pit contact, lip stability, contact caching, analytic ramp |

Aero stack (D070–D076, D114): wing / paraglider / parachute projected-area aero;
downstroke-only wing lift; soft stall; Cl/Cd table; Baseline Glider + flapper
proofs.

---

## Goals & rewards

- Unified points scoring (D112); flight/glide/parachute single-bout honesty
  (D095, D113); Glide Range best uninterrupted airborne bout.
- Goal/reward audit (D098) + R1–R4 repairs (D099–D108): Hang Time, Stay Tall,
  Obstacle Climb, Carry Ball, Hazard Dash, Balance Beam, Motor Technical,
  attempt isolation, support/causality; Motor Bridge retired from selection.
- G1 Rough Terrain Traverse (D109) on unchanged physics; three Motor Cart seeds
  pass held-out variants.
- Flight Height aero-climb bout (D110); Jump & Land / Launch & Land / Landspeed
  and mirrored flight/jump catalog (D063–D079 era).

---

## UI / library

- D087–D088 goal + tuning visibility; D090–D092 fullscreen / performance /
  viewport builders; D096–D097 drawers + library normalization.
- D111 / D115–D118 Best Ever bar + permanent ledger.
- D119–D122 continue-training, model picker hub, permanent delete.
- D125 keep compatible models across zone switches.

---

## Flight recovery (closed)

Phases 1–5 complete (D074–D078): pre-constraint aero velocity, soft stall,
Baseline Glider, scripted flapper, fixed-morph Stay Aloft learning 3/3 seeds.
Recovery/test plans are closed records, not an open implementation gate.

---

## Key regressions to retain

```
npx tsc --noEmit
npm run build
npx tsx scripts/smoke-solid-segments.ts
npx tsx scripts/smoke-motor-ramp-drive.ts
npx tsx scripts/smoke-aero.ts
npx tsx scripts/smoke-physics-invariants.ts
npx tsx scripts/smoke-walk-jump-hop.ts
npx tsx scripts/prove-paraglide.ts
npx tsx scripts/prove-para-ramp.ts
npx tsx scripts/prove-flapper.ts
npx tsx scripts/prove-flight-learn.ts
npm run test:phase21
```

Evidence manifests kept: `G1_ROUGH_TERRAIN_RESULTS.json`,
`R4_CALIBRATION_RESULTS.json`, `GOAL_REWARD_AND_COMPONENT_AUDIT.md`,
`JOINT_LOCK_CONFLICT_AUDIT.md` (historical lock removal).
