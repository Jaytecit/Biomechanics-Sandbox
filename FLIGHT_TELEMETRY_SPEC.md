# FLIGHT_TELEMETRY_SPEC.md

**Status:** completed flight-testing specification (D082, 2026-07-25).
Retained as the observability contract for future regression work.

Required metrics for flight debug mode and automated tests.  
Units assume **pixel-space**, **+Y down**, **1 sim frame = 1 time unit** (`dt ≡ 1`).

---

## 1. Per aerodynamic surface

| Metric | Symbol | Unit | Range / notes | Presentation |
|---|---|---|---|---|
| Chord direction | \(\hat{t}\) | — | unit | Cyan line along muscle |
| Normal direction | \(\hat{n}\) | — | unit; show selected face | Magenta line |
| Relative airflow | \(\vec{v}_{rel}\) | px/frame | freestream − wind | White arrow from midpoint |
| Angle of attack | \(\alpha\) | rad (also deg label) | (−π, π]; wrap-safe | Numeric HUD |
| Lift vector | \(\vec{L}\) | impulse px | this step’s applied lift share | Green arrow |
| Drag vector | \(\vec{D}\) | impulse px | this step | Orange arrow |
| Total aero force | \(\vec{F}\) | impulse px | L+D (+pressure) | Yellow arrow |
| Force application point | — | px | midpoint or harness | Dot |
| Lift coefficient | \(C_L\) | — | model-specific | HUD |
| Drag coefficient | \(C_D\) | — | model-specific | HUD |
| Local speed | \|v\| | px/frame | ≥0 | HUD |
| Openness / inflation | — | 0…1 | para / chute | HUD + existing draw |
| Flap gate active | bool | — | wings only | Badge |

**Source:** Compute in `aero.ts` during force apply; stash on muscle runtime fields (e.g. `_dbg*`) for Visualizer read-only draw. Renderer must not write physics.

---

## 2. Per creature

| Metric | Unit | Notes |
|---|---|---|
| Centre of mass | px | mass-weighted preferred |
| COM velocity | px/frame | pre- and post-constraint if debugging F01 |
| Body angle | rad | spine / longest bone (`spineAngle`) |
| Angular velocity | rad/frame | Δangle unwrapped |
| Total mass | mass units | sum node.mass |
| Total lift / drag | impulse px | sum surfaces |
| Actuator effort | — | Σ\|Δtarget\| or Σ\|output\| |
| Altitude / clearance | px | `GROUND_Y − (y+r)` min |
| Descent rate | px/frame | + = sinking |
| Glide ratio | — | Δx / Δh over window |
| KE / PE estimate | arbitrary | ½Σm v² ; m g h with g=0.4 |
| Constraint error | px | max \|currentLen − target\| |
| Max spring stretch | — | max length / original |
| Max point speed | px/frame | |
| Fitness + breakdown | — | per-term contributions |
| Network inputs / outputs | — | labeled |
| Episode failure reason | enum | see below |
| Para phase / stage | enum | when applicable |

---

## 3. Failure reason enum

Prefer concrete labels:

- `ground_impact`
- `structural_break` (if/when stretch limit exists)
- `excessive_angular_velocity`
- `left_world_bounds`
- `numerical_instability`
- `nan_detected`
- `no_useful_lift`
- `stalled_continuously`
- `insufficient_forward_speed`
- `actuator_saturation`
- `invalid_morphology`
- `fell_in_pit`
- `canopy_ground_strike`

Avoid bare `failed`.

---

## 4. Fitness breakdown (required for flight goals)

Expose each term used by `calculateFitness` for the active goal, e.g. for `GLIDE_RANGE`:

- corridor frames / dist  
- streak bonus  
- flyDist / openGlide  
- cruiseHeight / leapPenalty  
- sailTechniqueBonus parts (reef peak, deploy, early penalty)

Same pattern for `FLIGHT_TIME`, `FLIGHT_LAND`, `PARA_RAMP_GLIDE` stage metrics.

---

## 5. UI placement

- Toggle: **Flight debug** in sandbox menu (Flying / Free zones).  
- Overlay on Visualizer only; values from last physics step of focused creature.  
- Optional CSV / console dump button for Test 4/5 tables.

---

## 6. Automated test telemetry

Harness and prove scripts should print one-line summaries:

`tag key=value …`  

and exit non-zero on assert failure (already the pattern in smoke/prove scripts).
