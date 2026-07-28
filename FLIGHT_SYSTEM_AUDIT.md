# FLIGHT_SYSTEM_AUDIT.md

**Status:** completed and archived (D082, 2026-07-25). Findings remain as
historical engineering evidence; the standalone AI glider demo referenced by the
original audit has since been retired.

**Project:** Soft-body sandbox (`Build an Agent`)  
**Audit date:** 2026-07-24  
**Scope:** Why creatures fail to reliably learn flap / fly / glide  
**Method:** Code trace + existing prove/smoke scripts + new deterministic harness  
**Constraint:** Documentation and isolated tests only; no behavioural physics rewrites in this pass

---

## 1. System map

| Pipeline stage | Owner file(s) | Key symbols |
|---|---|---|
| App entry | `index.html` → `src/main.tsx` → `src/App.tsx` | React sandbox |
| Arena Championship | `Arena Championship/src/*` | Frozen products only |
| Sim loop / timestep | `src/App.tsx` `tick` | `requestAnimationFrame`; `simulationSpeed` accumulator; `stepDuration = 1/60` display time |
| Physics step | `src/physics.ts` `updateCreaturePhysics` | Verlet + constraints + aero + contacts + fitness |
| Constants | `src/physicsConstants.ts` | `WORLD_GRAVITY=0.4`, `RELAXATION_ITERATIONS=8`, `GROUND_Y=480` |
| Aerodynamics | `src/aero.ts` | `applyWingForces`, `applyParagliderForces`, `applyParachuteForces` |
| NEAT eval / mutate | `src/neat.ts` | `evaluateGenome`, `mutateWeights`, `mutateAddNode/Connection`, `crossover` |
| Breeding / elitism | `src/App.tsx` `breedNextGeneration` | 15% elite; tournament-3; **no speciation** |
| Para multi-head | `src/paraPilot.ts` | Phase gates, stage metrics, head crossover |
| Blueprints | `src/templates.ts` | Flapper, Para Cart, Proven Glider, Jump Cart, … |
| Fitness | `src/physics.ts` `calculateFitness` + helpers | Flight / glide / para goals |
| Rendering | `src/components/Visualizer.tsx` | Draws wing/sail/chute; **no aero debug vectors** |
| Studio | `src/components/Studio.tsx` | Morphology authoring |
| Types / I/O sizes | `src/types.ts` | `genomeIOForBlueprint`, aero area clamps |

---

## 2. Execution-flow trace

Per simulated frame (`updateCreaturePhysics`):

1. **COM / sensors** — build inputs: `sin(t·0.1)`, `cos(t·0.1)`, per-node `(dx,dy)/100`, ground flags; paragliders add speed, openness, sink, ramp sensors.
2. **NEAT / ParaPilot / override** — `evaluateGenome` or multi-head blend → outputs ∈ [−1,1] via tanh.
3. **Actuator mapping** — flexible muscles → `targetLength`; parachutes forced open; motors stashed.
4. **Verlet integrate** — `v *= 0.99`; `x += vx`; `y += vy + gravity` (gravity as raw px/frame, not `a·dt²`).
5. **Optional wind** — position nudge.
6. **Constraint relaxation** ×8 — mass-weighted length projection toward `targetLength` (**does not update `oldX/oldY`**).
7. **Wing aero** — `applyWingForces` (position impulses on wing endpoints).
8. **Collisions** ×5 passes — ground / obstacles / friction; may rewrite `oldX/oldY`.
9. **Paraglider + parachute aero** — after contacts (so wheels can leave ground).
10. **Motor drive** — grounded motor wheels: `oldX -= drive`.
11. **Object collisions / metrics / fitness** — air streaks, corridor, sail technique, `calculateFitness`.

**Important asymmetries**

- Wings run **before** contact; paragliders **after**.
- Aero velocity is reconstructed from `(x − oldX)` **after** constraint projection → constraint jitter contaminates wing tip airspeed.
- Display `generationDuration` default **28 s** ≈ **1680 frames** at 1× (short for rhythmic flight search).

---

## 3. Findings

### Finding F01 — Constraint projection contaminates aero velocity
**Severity:** High  
**Confidence:** High  
**Type:** Confirmed design weakness / numerical coupling  
**Files:** `src/physics.ts`, `src/aero.ts`  
**Functions:** `updateCreaturePhysics`, `segmentVelocity`, `bodyFreeStream`  
**Observed behaviour:** Muscles move nodes without updating `oldX/oldY`; aero then treats that displacement as airspeed.  
**Why it matters:** False wing velocity → spurious lift/drag; flapping and vibration become entangled.  
**Evidence:** Step order: integrate → relax ×8 → `applyWingForces`; `segmentVelocity` uses `(x−oldX)`.  
**Recommended action:** Measure freestream **pre-constraint** (or store pre-relax positions) for aero only; keep constraints for structure.  
**Required validation:** Test 7 scripted flapper + Test 8 iteration sweeps must stay stable and monotonic.  
**Resolution (D074):** Implemented — `snapshotAeroVelocities` before relax; aero reads `aeroVx`/`aeroVy`; Test 8 sweeps + F01 harness PASS.
---

### Finding F02 — Paraglider force is whole-body equal impulse (no aerodynamic torque)
**Severity:** High  
**Confidence:** High  
**Type:** Confirmed design weakness  
**Files:** `src/aero.ts`  
**Functions:** `applyEqualImpulse`, `applyParagliderForces`  
**Observed behaviour:** Lift/drag shove every node by the same Δx/Δy. Sail tips cannot create a pitching moment through force application point.  
**Why it matters:** Pitch stability and trim must emerge only from geometry/AoA magnitude changes, not from force location — hard for learning and for a “known-good glider” with a tail.  
**Evidence:** `applyEqualImpulse` loops all `creature.nodes`.  
**Recommended action:** Apply para forces on canopy nodes (or mass-weighted harness), optionally a fraction to chassis; preserve D071 no-float guarantees.  
**Required validation:** Fixed glider launch (Test 4) pitch/angular-velocity telemetry.  
**Resolution (D076):** `applyParaCanopyLoad` — canopy-primary with chassis share; tip-mass gate (light tips ≈0.34 canopy share ≈ legacy; moderate tips 0.55). Baseline Glider + Test 4 PASS.
---

### Finding F03 — Wing model is flap-gated pressure + skyward lift bias, not signed flat-plate AoA
**Severity:** High  
**Confidence:** High  
**Type:** Confirmed model limitation (not classical aero)  
**Files:** `src/aero.ts`  
**Functions:** `applyWingForces`, `liftAxis`  
**Observed behaviour:** Meaningful pressure requires a flap command *and* a downstroke (commanded shortening and/or tip descent vs body). Hold and upstroke → skin drag only. Extra “lift” uses `liftAxis` forced skyward (`ly ≤ 0`) on the power stroke only (D114).  
**Why it matters:** Sustained glide on wings alone is intentionally disabled; NEAT must discover a real downstroke, not recovery-half oscillation. Lift is not signed perpendicular-to-flow classical lift.  
**Evidence:** Code comments + smoke `testFlapperHoldNoFloat` / `testForcedFlapProducesLift` / `testWingUpstrokeNoLift` / `testAsymmetricWingLift`.  
**Recommended action:** Keep honesty (no hover), but add a **diagnostic** classical plate path for fixed-wing Test 4; do not silently add world-up thrust.  
**Required validation:** Test 4 fixed glider (new morphology or wing-hold mode for diagnostics only).  
**Partial (D075):** `applyDiagnosticClassicalPlateForces` for harness Test 3 only; production wings remain flap-gated.  
**Resolved oscillation farm (D114):** Upstroke pressure scale removed; lift is per-wing and downstroke-only.
---

### Finding F04 — Pitch/lift cliff: useful band then abrupt collapse
**Severity:** Medium  
**Confidence:** High  
**Type:** Confirmed coefficient pathology  
**Files:** `src/aero.ts`  
**Functions:** `applyParagliderForces`, `canopyPitchAoA`  
**Observed behaviour:** Lift rises smoothly with tip-up through tipΔY≈12 (`lift≈0.57`), then collapses to `≈0.06` at tipΔY≥16 (stall/clamp). Smoke ±12 geometry still passes tip-up > tip-down. Comparing ±15 can falsely look “reversed.”  
**Why it matters:** Controllers that pitch slightly past the cliff lose almost all lift; gradient is discontinuous.  
**Evidence:** `flight-physics-harness.ts` Test5 diagnostic sweep (2026-07-24).  
**Recommended action:** Soften stall; expose Cl curve; keep smoke gate; add pass-band that forbids cliffs inside the training AoA range.  
**Required validation:** Test 5 automated curve with pass bands.  
**Resolution (D075):** Soft backside stall (−0.12…−0.22); `FLIGHT_CL_CD_TABLE.md`; useful band [−12,+12] monotonic; tip16/tip12≈0.66.
---

### Finding F13 — Sequential wing force application breaks exact L/R symmetry
**Severity:** Low–Medium  
**Confidence:** High  
**Type:** Confirmed numerical coupling  
**Files:** `src/aero.ts`  
**Functions:** `applyWingForces`  
**Observed behaviour:** Shared body node is mutated by the left wing before the right wing samples velocity/applies impulse → residual tip Δ asymmetry (~1e−4…1e−3).  
**Why it matters:** Mild; can bias “perfect” symmetry tests and tiny roll-like residuals.  
**Evidence:** Harness Test6 before tolerance relaxation.  
**Recommended action:** Snapshot segment velocities before applying any wing impulses; apply from snapshot.  
**Required validation:** Test 6 with \|Δ\| < 1e−6 after fix.

---

### Finding F05 — Motor run-up takeoff is unstable on Proven Glider
**Severity:** High  
**Confidence:** High  
**Type:** Confirmed behavioural failure (physics+control interaction)  
**Files:** `scripts/prove-paraglide.ts`, `src/templates.ts`, `src/aero.ts`  
**Functions:** `proveMotorRunup`, `applyParagliderForces`  
**Observed behaviour:** Clean airspeed impulse → glide **PASS**. Scripted motor run-up → airborne only ~31 frames **FAIL**. The para-ramp script passes under its course schedule.
**Why it matters:** Evolution’s natural path is motor run-up, not teleporting airspeed. If scripted throttle fails, NEAT is hunting a narrow niche.  
**Evidence:** 2026-07-24 `prove-paraglide.ts` output.  
**Recommended action:** Phase 3 recovery: gentler deploy schedule, reef timing, and/or force application (F02) before expanding NEAT.  
**Required validation:** Motor run-up must PASS with fixed script before ParaPilot stage training claims.  
**Resolution (D076, current after D082):** Flat-ground motor path **waived in
writing** — motor→deploy→glide is owned by `prove-para-ramp.ts`. Baseline Glider
is the passive-glide reference (not pit ballistic).

---

### Finding F06 — Flapper observations lack body rate / airflow / AoA
**Severity:** High  
**Confidence:** High  
**Type:** Confirmed learning-interface weakness  
**Files:** `src/physics.ts`  
**Functions:** `updateCreaturePhysics` (sensor block)  
**Observed behaviour:** Non-para creatures get oscillators + relative node pose + ground contact only. No COM velocity, body angle, angular velocity, wing AoA, or lift/drag.  
**Why it matters:** Network cannot cleanly distinguish rising vs falling or stalled vs useful wing angle except by reconstructing from poses.  
**Evidence:** Inputs built at `physics.ts` ~1509–1531; para extras gated on `hasParaglider`.  
**Recommended action:** Add a minimal flight sensor pack for aero bodies (body angle, ω, COM vx/vy, optional per-wing AoA).  
**Required validation:** Curriculum 1 orientation task with frozen morphology.  
**Resolution (D078):** +6 wing sensors (vx, vy, sinθ, cosθ, ω, clearance); Flapper I/O 20/3; `prove-flight-learn.ts` multi-seed PASS.

---

### Finding F07 — `FLIGHT_TIME` / airtime-heavy fitness invites hop-scoot
**Severity:** High  
**Confidence:** Medium–High  
**Type:** Likely reward failure pattern  
**Files:** `src/physics.ts`  
**Functions:** `flightTimeFitness`, `isFullyAirborne`  
**Observed behaviour:** `air * 2.2` dominates; scoot term is tiny; one good hop streak scores well vs sustained flap.  
**Why it matters:** Classic “reward airtime so strongly that slow falling / hopping beats flapping.”  
**Evidence:** Formula in `flightTimeFitness`; `isFullyAirborne` only needs 6px clearance.  
**Recommended action:** Prefer `GLIDE_RANGE` / corridor / stroke-impulse curricula; raise airtime gates or add descent-rate / flap-effort shaping later (after physics proofs).  
**Required validation:** Fitness contribution table across hop vs scripted flap seeds.  
**Resolution (D078):** Stay Aloft rewritten — streak + cruise + flap work − leapiness; raw airtime demoted from ×2.2 to ×0.55.

---

### Finding F08 — NEAT has no speciation; short episodes; topology mutates early
**Severity:** Medium  
**Confidence:** High  
**Type:** Confirmed evolutionary-search weakness  
**Files:** `src/neat.ts`, `src/App.tsx`  
**Functions:** `breedNextGeneration`, `mutateAddNode`, `evaluateGenome`  
**Observed behaviour:** Pop 20, mutation 0.25, addConnection 0.1, addNode 0.05, ~28s gens, elite 15%, tournament-3. Innovation numbers exist but **no species / fitness sharing / stagnation protection**. Recurrent links allowed; only 3 propagation rounds.  
**Why it matters:** Oscillatory flight policies are fragile; innovations die; structural bloat before behaviour.  
**Evidence:** Grep shows no species code; defaults in `DEFAULT_CONFIG`.  
**Recommended action:** Freeze topology initially (addNodeRate=0); lengthen flight episodes; optional minimal speciation later — not “just raise pop size.”  
**Required validation:** Fixed-morphology curriculum with weight-only mutation first.  
**Resolution (D078):** Flying zone `trainingDefaults` — duration 48s, addNodeRate=0, addConnectionRate=0.05; learning prove uses weight-only.

---

### Finding F09 — Proven Glider canopy mass ≈ 0.05 vs chassis ≈ 7+
**Severity:** Medium  
**Confidence:** High  
**Type:** Design weakness  
**Files:** `src/templates.ts`  
**Functions:** Proven Glider blueprint  
**Observed behaviour:** Ultra-light tips (mass 0.05) with motorPower 20 chassis.  
**Why it matters:** Extreme mass ratio amplifies constraint/aero coupling and tip jitter; lip-speed design tradeoff noted in comments.  
**Evidence:** Template node masses.  
**Recommended action:** Baseline glider with moderate tip mass for Phase 3; keep light tips as optional advanced.  
**Required validation:** Test 4 mass sweep.  
**Resolution (D076):** `Baseline Glider` template tip mass 0.45; Proven Glider keeps 0.05 for pit lip speed.

---

### Finding F10 — No flight debug overlay (AoA / lift / drag vectors)
**Severity:** Medium  
**Confidence:** High  
**Type:** Observability gap  
**Files:** `src/components/Visualizer.tsx`  
**Functions:** muscle draw path  
**Observed behaviour:** Wings/sails drawn as filled spans; chute has inflation visuals; no chord/normal/lift/drag/AoA HUD.  
**Why it matters:** Cannot diagnose stall vs wrong force sign by eye during evolution.  
**Evidence:** Visualizer aero drawing ~777+.  
**Recommended action:** Implement `FLIGHT_TELEMETRY_SPEC.md` debug mode.  
**Required validation:** Manual overlay checklist.

---

### Finding F11 — Gravity / damping are frame-tied (no explicit `dt`)
**Severity:** Low–Medium  
**Confidence:** High  
**Type:** Informational / latent risk  
**Files:** `src/physics.ts`, `src/App.tsx`  
**Functions:** Verlet block; `tick`  
**Observed behaviour:** Each sim step uses fixed gravity 0.4 and 0.99 damping. `simulationSpeed` runs multiple identical steps per RAF; physics does **not** scale with render FPS when speed accumulator is used correctly.  
**Why it matters:** Safe at fixed step, but any future variable-`dt` path would break aero force scaling (forces are position impulses per step).  
**Evidence:** `steps = floor(speedAccumulator)`; per-step gravity constant.  
**Recommended action:** Document `dt ≡ 1` frame; never scale aero by render Δt.  
**Required validation:** Test 8 at simulationSpeed 0.5 / 1 / 2 (same step count).  
**Resolution (D074):** `PHYSICS_DT = 1` in `physicsConstants.ts`; harness speed sweep PASS.
---

### Finding F12 — Generation clock uses wall-sim seconds, not flight horizons
**Severity:** Medium  
**Confidence:** Medium  
**Type:** Likely design weakness  
**Files:** `src/App.tsx`  
**Functions:** `tick`, `DEFAULT_CONFIG.generationDuration`  
**Observed behaviour:** 28 seconds × 60 Hz ≈ 1680 steps; motor carts cross thousands of px in <200 steps.  
**Why it matters:** Flight curricula need longer airtime budgets or event-based episode ends.  
**Evidence:** Defaults + para prove timings.  
**Recommended action:** Flight goals use longer `generationDuration` or frame caps keyed to goal.  
**Required validation:** Learning curves before/after.

---

## 4. Summary tables

### Confirmed defects / weaknesses
| ID | Summary | Severity |
|---|---|---|
| F01 | Constraint→aero velocity contamination | High |
| F02 | Para equal impulse → no aero torque | High |
| F03 | Wings not classical AoA glide surfaces | High |
| F04 | Pitch/lift non-monotonic at large tip angles | Medium |
| F05 | Motor run-up glide prove fails | High |
| F06 | Missing flight sensors on Flapper | High |
| F07 | Airtime fitness hop bias | High |
| F08 | No speciation; early topology mutation | Medium |
| F10 | No aero debug HUD | Medium |

### Verified-safe / working behaviours
| Item | Evidence |
|---|---|
| No static hover on held wings / reefed sail | `smoke-aero.ts` |
| Forced flap produces net upward impulse (isolated) | `smoke-aero.ts` `testForcedFlapProducesLift` |
| Full-body scripted Flapper beats inert sink (Test 7) | `prove-flapper.ts` PASS (D077) |
| Passive glide from clean airspeed (Proven Glider) | `prove-paraglide.ts` clean PASS |
| Para ramp scripted gap clear | `prove-para-ramp.ts` PASS |
| Parachute projected-area honesty | `smoke-aero.ts` chute tests |
| Ballistic + drag-only + symmetry harness | `flight-physics-harness.ts` |

### Unverified hypotheses
- `FLIGHT_TIME` champions are mostly hoppers (needs champion replay telemetry).
- Three propagation rounds starve useful recurrence for flapping CPGs.

---

## 5. Answers to primary questions (evidence-based)

| Question | Verdict |
|---|---|
| Passive gliding physically possible? | **Yes** (Baseline Glider Test 4 / ramp scripts) |
| Scripted flapping → net lift possible? | **Yes** — full Flapper body Test 7 (`prove-flapper.ts` D077); isolated wing still in smoke-aero |
| Scripted motor→glide reliable? | **Flat path no** (`prove-paraglide` motor); **ramp path yes** |
| NEAT useful gradient? | **Yes for stage A** — `prove-flight-learn.ts` 3/3 seeds fitness rise + held-out sink beat (D078); further curricula still open |
| Is NEAT the primary failure? | **Was secondary** — physics through Phase 4; learning interface F06–F08 addressed in D078 |

---

## 6. First implementation phase after audit

**Phase 0 (freeze) → Phase 1 physics integrity** per `FLIGHT_RECOVERY_PLAN.md`, starting with F01 velocity sampling and Test 8, **without** changing lift coefficients blindly.

**Closure:** Phase 1–5A evidence remains complete (D074–D078); D082 closes the
remaining flight product work after functional acceptance. Morphology evolution
remains frozen unless separately reopened.
