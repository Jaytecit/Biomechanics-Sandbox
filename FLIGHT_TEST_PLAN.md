# FLIGHT_TEST_PLAN.md

**Status:** completed and archived (D082, 2026-07-25). Retained scripts remain
regressions for future physics/aero changes; the removed demo is not test
authority.

Deterministic tests for soft-body flight (no NEAT).  
Companion to `FLIGHT_SYSTEM_AUDIT.md`.

**Harness entry:** `npx tsx scripts/flight-physics-harness.ts`  
**Existing aero smokes:** `npx tsx scripts/smoke-aero.ts`  
**Glide proves:** `npx tsx scripts/prove-paraglide.ts`, `prove-para-ramp.ts`

---

## Test 1 — Ballistic body

| Field | Detail |
|---|---|
| Purpose | Confirm gravity, Verlet integration, determinism |
| Setup | Single node; initial vx, vy; gravity `WORLD_GRAVITY`; no aero |
| Exact inputs | x=100,y=100, vx=3, vy=−2 (vy via oldY), 40 steps |
| Expected | Finite path; net descent; identical replay |
| Telemetry | Position path; end (x,y) |
| Pass criteria | No NaN; end.y > start.y; bit-identical second run |
| Failure interpretation | Integration / damping bug |
| Implementation | `scripts/flight-physics-harness.ts` `testBallistic` |
| Mode | Automated |

**Status (audit):** PASS

---

## Test 2 — Drag-only body

| Field | Detail |
|---|---|
| Purpose | Drag opposes travel; larger area slows more |
| Setup | Horizontal wing segment, hold (no flap), +vx freestream |
| Exact inputs | areas 20 vs 120; vx≈4 |
| Expected | Δx ≤ 0; large area more negative Δx |
| Telemetry | Midpoint Δx |
| Pass criteria | smallDx ≤ 0.001; largeDx < smallDx − 0.001 |
| Failure interpretation | Drag sign error or area unused |
| Implementation | harness `testDragOnly` |
| Mode | Automated |

**Status:** PASS

---

## Test 3 — Fixed plate drop

| Field | Detail |
|---|---|
| Purpose | Orientation changes aero response |
| Setup | Broadside vs edge-on wing; downward freestream; flap gate open |
| Exact inputs | 12 steps gravity+wing |
| Expected | Broadside resists sink more than edge-on (wing pressure model) |
| Telemetry | COM sink Δy |
| Pass criteria | Finite; log comparative sinks (informational under flap-gated model) |
| Failure interpretation | Normal/facing reversed |
| Implementation | harness `testFixedPlateDrop` |
| Mode | Automated (informational assert) |

**Status:** PASS (classical diagnostic plate asserts broadside < edge sink; D075)

---

## Test 4 — Fixed glider launch

| Field | Detail |
|---|---|
| Purpose | Prove passive glide envelope without actuators/NN |
| Setup | Near-rigid body + fixed sail/wing; known mass & area; launch speed/angle sweep; incidence sweep |
| Exact inputs | Baseline Glider; vx ∈ {3,5,7}; tipΔY incidence ∈ {−15…+15} |
| Expected | Measurable glide ratio band; not rocket; not brick |
| Telemetry | Range, Δh (peak→land), air time, mean speed, peakClr |
| Pass criteria | ≥1 cell with L/D ≥ 1.5, air ≥ 30, peakClr ∈ [10,70], altLoss ≥ 12; no NaN |
| Failure interpretation | F02 torque / F03 no-hold-lift / mass ratio |
| Implementation | `scripts/prove-paraglide.ts` `proveIncidenceSweep` |
| Mode | Automated |

**Status:** PASS (D076) — best L/D≈8.9 @ vx=3 tipΔY=+10; useful band at vx=5–7 across incidences

---

## Test 5 — Angle-of-attack / pitch sweep

| Field | Detail |
|---|---|
| Purpose | Continuous, understandable Cl/lift vs pitch |
| Setup | Fixed freestream; vary leading-tip height |
| Exact inputs | Smoke geometry tip-up vs tip-down; diagnostic tipΔY −24…+24 |
| Expected | Tip-up lift > tip-down on smoke geometry; full curve monotonic in useful band |
| Telemetry | tipΔY, lift impulse |
| Pass criteria | Gate: up > down + 0.01; log full sweep |
| Failure interpretation | F04 non-monotonic coefficients |
| Implementation | harness `testAoASweep` + `smoke-aero.ts` pitch test |
| Mode | Automated |

**Status:** PASS — useful band [−12,+12] monotonic; tip16/tip12≈0.66 (soft stall, D075); Cl/Cd table in `FLIGHT_CL_CD_TABLE.md`

---

## Test 6 — Symmetry

| Field | Detail |
|---|---|
| Purpose | Mirrored wings → equal impulses |
| Setup | Body + L/R tips; identical stroke state |
| Exact inputs | Downstroke gate; tip vy matched |
| Expected | \|dL − dR\| < 1e−6 |
| Telemetry | Tip Δy |
| Pass criteria | As above |
| Failure interpretation | Normal sign / node index bug |
| Implementation | harness `testSymmetry` |
| Mode | Automated |

**Status:** PASS

---

## Test 7 — Scripted flapper

| Field | Detail |
|---|---|
| Purpose | Prove actuators + wings can produce **net upward impulse / reduced sink** on a full body |
| Setup | Flapper template; scripted `actuatorOverride`; no NEAT |
| Exact inputs | 180-frame airborne drop; 5 ICs (clearance ∈ {140…180}, launch vx, tipΔY); inert hold vs stroke grid |
| Reference stroke | `sine_inphase` amp=0.55 ω=0.4 foot=−0.35 (both wings in phase) |
| Expected | Flapping sink ≪ inert sink; finite nodes |
| Telemetry | COM Δy, air frames, upward impulse sum, clearance |
| Pass criteria | Reference beats inert by ≥12% relative **and** ≥8px absolute Δy on ≥3 ICs |
| Failure interpretation | F01/F03/authority limits |
| Implementation | `scripts/prove-flapper.ts` |
| Mode | Automated |

**Status:** PASS (D077) — 5/5 ICs; best gap ≈55–65% vs inert; discovery also finds antiphase/asymmetric winners

---

## Test 8 — Numerical stability

| Field | Detail |
|---|---|
| Purpose | Long runs / speed multipliers stay finite |
| Setup | 2000-frame flap+verlet with soft ground |
| Exact inputs | Sinusoidal target; gravity on |
| Expected | No NaN/Inf; bounded positions |
| Telemetry | Final positions |
| Pass criteria | Finite; \|x\|,\|y\| < 1e7 |
| Failure interpretation | Energy explosion / constraint blow-up |
| Implementation | harness `testStability` |
| Mode | Automated |

**Implemented coverage:** same step count at simulationSpeed 0.5/1/2;
relaxation iter 4/8/16.

**Status:** PASS — base 2000-frame + speed (1000/2000/4000 ticks) + relaxIters (4/8/16) sweeps finite under pre-constraint aero (D074)

---

## F01 regression — Pre-constraint airspeed

| Field | Detail |
|---|---|
| Purpose | Constraint tip shove must not invent freestream |
| Setup | Resting wing; tip Δy without updating `old*`; compare with/without `aeroVx/aeroVy=0` |
| Pass criteria | Contaminated path produces impulse; pre-constraint path ≈ 0 |
| Implementation | harness `testPreConstraintAeroVelocity` |
| Mode | Automated |

**Status:** PASS (D074)
---

## Existing prove scripts (ownership)

| Script | Maps to | Status (2026-07-24) |
|---|---|---|
| `smoke-aero.ts` | Plate, no-float, pitch gate, chute, forced flap | ALL PASS |
| `prove-paraglide.ts` clean (Baseline) | Test 4 subset | PASS |
| `prove-paraglide.ts` Test 4 sweep | Incidence × launch | PASS (D076) |
| `prove-paraglide.ts` motor flat | Scripted flat takeoff | **FAIL / WAIVED** → ramp proves |
| `prove-para-ramp.ts` | Curriculum physics path (motor→deploy) | PASS |
| `flight-physics-harness.ts` | Tests 1–3,5–6,8 | PASS |
| `prove-flapper.ts` | Test 7 full Flapper body | PASS (D077) |
| `prove-flight-learn.ts` | Phase 5 fixed-morph learning gate | PASS (D078) 3/3 seeds |

---

## Promotion rule

Do not start NEAT flight claims until:

1. Test 4 incidence sweep shows a useful glide band on a **fixed** baseline glider — **done (D076)**
2. Test 7 shows scripted Flapper net lift / reduced sink — **done (D077)**
3. Motor run-up prove is green **or** run-up is explicitly removed from the learning path — **waived flat; ramp path green**
4. Fixed-morph learning rises across seeds with held-out honesty — **done stage A (D078)**

**Flight test program complete (D082).** The historical Phase 6 contract was
closed by an explicit product-scope decision after flight was accepted as
functional; this is not an observatory benchmark-verification claim.
