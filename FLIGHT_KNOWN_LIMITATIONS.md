# FLIGHT_KNOWN_LIMITATIONS.md

**Status:** completed flight-product record (D082, 2026-07-25). These modelling
limitations remain applicable even though flight is accepted as functional.

Honest limits of the soft-body flight stack.  
This is **not** a CFD or 6-DOF aircraft simulator.

---

## What the model is

- **2D** point-mass + spring / distance-constraint soft body (Verlet).  
- Aerodynamic surfaces are **muscle segments** tagged `wing` | `paraglider` | `parachute`.  
- Forces are **per-step position impulses**, not continuous Newtonian `F=ma` with an explicit `dt`.  
- Time unit: **one simulation frame** (`dt ≡ 1`). Gravity is `+0.4` px/frame²-equivalent added each step.

---

## What it can reproduce (when working)

- Relative-wind drag opposing motion.  
- Projected-area pressure on wings while **flapping** (commanded length change).  
- Paraglider lift that requires **forward airspeed** and a non-edge-on open canopy.  
- Leading-tip pitch trim that changes climb vs dive in a **limited** attitude band,
  with a **soft** stall past mild nose-up (no hard Cl×0.1 cliff; see `FLIGHT_CL_CD_TABLE.md`).  
- Parachute ram-air inflation with edge-on collapse (no vertical hover).  
- Scripted takeoff→glide sequences on the Proven Glider family under tuned schedules.

---

## What it cannot / should not claim

- Classical thin-airfoil theory or accurate stall hysteresis.  
- Lift from a **static** wing hold (by design: no hover from merely having wings).  
- Correct aerodynamic **pitching moment** from equal whole-body impulse (legacy) — **partially addressed (D076)** via canopy-primary load on moderate-tip Baseline Glider; light-tip crafts still use near-legacy chassis share.  
- Real atmospheric scaling (density, Reynolds, induced drag, ground effect).  
- 3D roll/yaw; “roll” in UI is planar pitch/spin only.  
- That NEAT “learned flight” merely because `FLIGHT_TIME` rose (hop-scoot possible).  
- That **flat-ground** motor run-up→glide is solved (`prove-paraglide` motor still fails/tumbles); **ramp/course** motor→deploy remains the owned path (`prove-para-ramp`).

**Addressed (D074 / Phase 1):** Aero freestream now uses **pre-constraint** Verlet samples (`aeroVx`/`aeroVy`), not post-relax `(x−oldX)`. Timestep remains `PHYSICS_DT ≡ 1`.
**Addressed (D075 / Phase 2):** Soft stall + Cl/Cd table; useful AoA band monotonic.
**Addressed (D076 / Phase 3):** Baseline Glider + Test 4 incidence sweep; canopy-primary para load (F02).
**Addressed (D077 / Phase 4):** Scripted Flapper (`prove-flapper.ts`) beats inert drop ≥12%/≥8px on 5 diverse ICs — actuators+wings can produce usable stroke lift; no physics rewrite required.
**Addressed (D078 / Phase 5A):** Wing flight sensors (F06); Stay Aloft streak/flap fitness (F07); flying-zone `addNodeRate=0` + longer gens (F08); multi-seed `prove-flight-learn.ts`.
---

## Approximation honesty

| Feature | Approximation level |
|---|---|
| Wing | Flap-gated flat-plate pressure + skyward-biased lift share |
| Paraglider | Camber/AoA heuristics + clamps + special-case boosts |
| Parachute | One-sided cup ∝ facing² |
| Wind | Optional global nudge, not a field |

Useful for **curriculum games and controller search**, not for aerospace validation.

---

## Evaluation honesty rules

- Rising fitness ≠ flight.  
- Prefer deterministic proves (`prove-*.ts`, harness) over champion anecdotes.  
- Separate training goals from held-out replay.  
- Do not hide failed seeds or failed motor-run-up proves.  
- Arena Championship wins are creative-track only (see observatory `AGENTS.md` / `PROJECT_STATE.md`).
