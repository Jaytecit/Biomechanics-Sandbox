# FLIGHT_RECOVERY_PLAN.md

**Status:** completed and archived (D082, 2026-07-25). Flight is accepted as
functional for the creative sandbox. This closes product recovery work without
creating a new observatory learning-contract claim.

Staged recovery after `FLIGHT_SYSTEM_AUDIT.md`.  
**Rule:** Do not advance a phase until its exit criteria pass.  
**Prohibited globally:** fake upward forces, hidden thrust, world-up assistance, scripted motion inside evolved controllers, silent criterion changes, simultaneous env+reward+algo rewrites.

---

## Phase 0 — Freeze and preserve

**Objective:** Baseline evidence without feature churn.

| Item | Detail |
|---|---|
| Tasks | Keep current `aero.ts` / `physics.ts` behaviour; archive audit docs; record prove/smoke outputs; pin deterministic seeds for scripts |
| Files | Docs only; `scripts/*` read-only baselines |
| Tests | Re-run smoke-aero, prove-paraglide, prove-para-ramp, flight-physics-harness |
| Manual | Note motor run-up FAIL |
| Risks | Temptation to “tune until it flies” |
| Prohibited | Coefficient fishing; NEAT hyperparameter thrash; morphology evolution |
| Exit | Audit docs landed; baselines recorded in `PROJECT_STATE.md` |

**Status:** Complete with this audit pass.

---

## Phase 1 — Physics integrity

**Objective:** Fix integration/constraint/aero **coupling** faults that invalidate force measurement (F01, F11).

| Item | Detail |
|---|---|
| Likely files | `src/physics.ts`, `src/aero.ts`, harness |
| Tasks | Sample aero velocity from pre-constraint state (or snapshot); document `dt≡1`; assert finite forces; optional aero-vs-relax iteration sweep |
| Tests | Test 1, 8 (+ speed/iter sweeps); smoke-aero still green |
| Manual | Visual: no new hover |
| Risks | Changing velocity sampling alters lift magnitudes |
| Prohibited | Changing Cl/Cd “to compensate”; replacing Verlet |
| Exit | Harness+smoke pass; written note that aero uses pre-constraint airspeed |
| Status | **Complete (D074)** — `aeroVx`/`aeroVy` pre-relax samples; `PHYSICS_DT≡1`; Test8 speed/iter sweeps + F01 regression green |

---

## Phase 2 — Aerodynamic integrity

**Objective:** Validate plate / AoA / lift-drag signs and continuity (F03, F04).

| Item | Detail |
|---|---|
| Likely files | `src/aero.ts` |
| Tasks | Fix non-monotonic pitch curve; publish Cl/Cd vs AoA table; optional diagnostic classical plate for **tests only**; keep evolved path honest (no hold-hover) |
| Tests | Test 2, 3, 5 (full curve bands); symmetry Test 6 |
| Manual | Overlay vectors (Phase I telemetry) |
| Risks | Breaking prove-paraglide / D071 no-float |
| Prohibited | World-space lift; zero-airspeed lift |
| Exit | Monotonic useful AoA band; smoke pitch + harness sweep pass; prove-paraglide clean still PASS |
| Status | **Complete (D075)** — soft stall; Cl/Cd table; Test5 band asserts; diagnostic classical plate (tests only) |

---

## Phase 3 — Known-good glider

**Objective:** Deterministic passive glide with telemetry (F02, F05, F09).

| Item | Detail |
|---|---|
| Likely files | `src/templates.ts` or `src/baselines/`, `src/aero.ts` (force application point), prove scripts |
| Tasks | Baseline rigid/near-rigid glider; canopy-local forces (torque allowed); moderate tip mass; incidence/launch sweep (Test 4); fix motor run-up script **or** document excluded path |
| Tests | Test 4 automated; prove-paraglide motor green or explicitly deferred |
| Manual | Watch glide corridor |
| Risks | Equal-impulse change breaks Para Cart |
| Prohibited | NN control; morphology mutation |
| Exit | ≥1 fixed incidence with repeatable glide ratio; clean airspeed PASS; motor path PASS or waived in writing |
| Status | **Complete (D076)** — Baseline Glider; canopy-primary load (F02); Test 4 L/D band; flat motor waived → ramp proves |

---

## Phase 4 — Known-good scripted flapper

**Objective:** Prove stroke → net lift on Flapper body (Test 7).

| Item | Detail |
|---|---|
| Likely files | `scripts/prove-flapper.ts`, maybe actuator rate limits in physics |
| Tasks | Sine / asymmetric stroke grid; measure vertical impulse & sink vs inert; stop if none succeed |
| Tests | Test 7 |
| Manual | Visual flap |
| Risks | Constraint jitter farming |
| Prohibited | Starting NEAT flight training |
| Exit | Scripted controller beats inert drop by agreed margin across ≥3 seeds/ICs |
| Status | **Complete (D077)** — `prove-flapper.ts`; pinned `sine_inphase` amp=0.55 ω=0.4 foot=−0.35; ≥12% / ≥8px sink cut on 5/5 diverse ICs; no physics rewrite required |

---

## Phase 5 — Fixed-morphology learning

**Objective:** Train controller only, curriculum (F06–F08, F12).

| Item | Detail |
|---|---|
| Likely files | `src/physics.ts` sensors, fitness helpers, `src/App.tsx` defaults, `src/neat.ts` optional |
| Tasks | Flight sensor pack; freeze topology (`addNodeRate=0`); longer episodes; curriculum 1→5 from Audit.md; prefer glide/corridor metrics over raw airtime |
| Tests | Multi-seed eval; held-out replay |
| Manual | Champion replay honesty |
| Risks | Reward exploits return |
| Prohibited | Morphology mutation; criterion silent edits |
| Exit | Repeatable promotion across seeds for curriculum stage N before N+1 |
| Status | **Complete stage A (D078)** — wing sensors; Stay Aloft streak/flap fitness; flying-zone topology freeze; `prove-flight-learn.ts` 3/3 seeds. Further curriculum stages optional before Phase 6. |

---

## Phase 6 — Stable evolved flight

**Objective:** Altitude + stability + direction after Phase 5.

| Item | Detail |
|---|---|
| Tasks | Combine maintenance + heading; harden failure reports |
| Exit | Multi-seed sustained flight meeting written contract |
| Status | **Closed as completed product work (D082)** — the creative director accepted current flight as functional. This is an explicit scope decision, not a claim that a new benchmark contract was satisfied. |

---

## Phase 7 — Controlled morphology evolution

**Objective:** Limited morphology mutation only after control works.

| Item | Detail |
|---|---|
| Tasks | Safe mutation bounds; freeze aero type counts initially |
| Exit | Improvements vs fixed-morph baseline under same eval |

---

## Immediate next phase

**None.** Flight Recovery is complete and archived under D082. Morphology
evolution remains frozen unless a separate future decision explicitly opens it.
