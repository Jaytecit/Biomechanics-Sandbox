# Goal, Reward, and Creature-Component Audit

**Date:** 2026-07-25  
**Scope:** The original 44-goal catalogue plus the D109 G1 addition in
`src/goalCatalog.ts`, executable fitness in
`src/physics.ts` / `src/paraPilot.ts`, launch eligibility, current Studio
components, and credible new skills.

## Verdict

The audited catalogue had 44 goals; D108 retires one redundant goal and D109
adds Rough Terrain Traverse, leaving 44 active selections. D128 adds Hop Right,
Hop Left, and Hop Speed under the Jumping category (47 active). The Phase 21
semantics matrix verifies
coverage and deterministic geometry rather than reward integrity.

- **11 goals are sound** at the reward level, though several still need copy or
  eligibility alignment.
- **17 goals need targeted tuning** because a peak, endpoint, or ungated shaping
  term can overshadow the intended event.
- **16 goals need a reward reshape** because implementation contradicts the
  stated skill or permits repeat-attempt, camping, proximity, or bypass farming.
- Category-level zones are too coarse for specialised goals. Para Ramp does not
  require a paraglider and two powered wheels; flight goals admit passive chutes
  indiscriminately; several tips recommend Motor Cart for goals unavailable in
  Motor.
- New physics components must wait until reward-truth repairs are tested, or
  reward, morphology, observations, actions, and physics would change together.

**Ratings:** **Sound** means the intended physical event dominates. **Tune**
means the event is basically correct but shaping or eligibility has an edge
case. **Reshape** means the score does not reliably measure the stated skill.
**Partial fit** means only a subset of category bodies is appropriate or the
catalogue conflicts with zone access.

## Complete 44-goal audit

### Locomotion (5)

| Goal | Creature fit | Reward | Farming audit / required change |
|---|---|---|---|
| Run Right | Yes: muscle walker | **Sound (D129)** | Monotonic plant+body frontiers toward +X; fitness capped by body travel; oscillation / slide without plants scores 0. |
| Run Left | Yes: muscle walker | **Sound (D129)** | Same plant+body frontier rule toward −X. |
| Max Speed | Partial: copy recommends motor carts unavailable in Walking | **Sound (remediated)** | `peakSupportedSpeed` replaces raw impulse peaks; meaningful travel gate required (`smoke-speed.ts`). |
| Sprint Finish | Partial: Motor Cart advice only works in Free | **Sound (remediated)** | Finish requires all checkpoints plus support; tier-0 finish distance paired with ~90s recommended generation. |
| Stay Tall | Yes | **Sound (D100)** | Integrated normalized supported posture; falls penalized; final pose alone cannot win. |

### Jumping (11)

| Goal | Creature fit | Reward | Farming audit / required change |
|---|---|---|---|
| Hang Time | Yes | **Sound (D128)** | Isolated all-points-off bout only; hop chains score 0. |
| Jump Height | Yes | **Sound (D128)** | Peak clearance of the lowest anatomical point during an isolated jump. |
| Jump Right | Yes | **Sound (D128)** | Isolated jump distance; hop chains score on Hop Right instead. |
| Jump Left | Yes | **Sound (D128)** | Mirrors Jump Right leftward. |
| Jump Speed | Yes | **Sound (D128)** | Peak speed in an isolated jump bout only. |
| Jump & Land | Yes | **Sound (D128)** | Isolated jump return-to-takeoff; hop chains score 0. |
| Jump Flips | Yes | **Sound (D128)** | Isolated jump rotation; hop chains score 0. |
| Clear Bar | Yes | **Sound (D128)** | Whole hull clear during an isolated jump; hop chains cannot clear. |
| Hop Right | Yes | **Sound (D128)** | Accumulated rightward travel across hop-chain bouts. |
| Hop Left | Yes | **Sound (D128)** | Accumulated leftward travel across hop-chain bouts. |
| Hop Speed | Yes | **Sound (D128)** | Peak hop-chain travel speed. |

### Flight (10)

| Goal | Creature fit | Reward | Farming audit / required change |
|---|---|---|---|
| Stay Aloft | Partial: intended for active wings, but all aero bodies enter | **Sound** | D113 best single fully-airborne bout; D143 adds symmetrical bird-like flap bonus; any ground contact ends the attempt; episode airtime totals cannot accumulate hops. |
| Flight Height | Partial: wing/paraglider; chute cannot climb | **Sound** | D110 best sustained bout; D143 matched L/R flap earns symmetry bonus and strongest aero lift; cruise altitude under a sustain gate plus flap-powered climb; ballistic peak hops and leapiness lose. |
| Fly Right | Wing/paraglider; chute partial | **Sound** | D106 best continuous flight bout; ground scoot and episode totals are excluded. |
| Fly Left | Wing/paraglider; chute partial | **Sound** | D106 mirrors Fly Right with isolated leftward bouts. |
| Airspeed | Partial: wing/paraglider | **Sound** | D113 best single airborne bout peak + bout shaping; episode peaks and hop totals are ignored. |
| Flight Land | Wing/paraglider; chute can aid landing | **Sound** | D106 resets climb/descent/overshoot shaping per attempt and retains only the best complete climb-descent-stick bout. |
| Aero Acrobatics | Wing/paraglider | **Sound** | D106 rotation, height, and airtime are isolated to the best single aerial sequence. |
| Glide Range | Specifically paraglider/glider | **Sound** | D095 best-uninterrupted-bout scoring, corridor dominance, and ballistic penalty are correct. Enforce paraglider eligibility. |
| Aerial Crossing | Wing/paraglider | **Sound** | D107 completion requires full-hull far-side support; D113 flight shaping is best-single-bout and capped below supported completion. |
| Para Ramp | Intended: paraglider plus powered run-up wheels | **Sound / tune eligibility** | D113 deploy/glide air terms use the best single uninterrupted airborne bout; run-up lock-in remains gap-clear. Enforce paraglider/two-wheel eligibility. |

### Climbing (2)

| Goal | Creature fit | Reward | Farming audit / required change |
|---|---|---|---|
| Stair Climb | Yes | **Sound** | Supported stair height dominates; free jumps do not score as climb. |
| Climb Obstacles | Yes | **Reshape** | Generic peak COM altitude contradicts supported-box semantics. A free jump farms climb. Track supported platform height and ordered mounts. |

### Objects (2)

| Goal | Creature fit | Reward | Farming audit / required change |
|---|---|---|---|
| Carry Ball | Yes, but no object-relative sensor/gripper | **Sound** | D102 continuous collision-chain provenance excludes proximity, stationary contact, environmental motion, and post-release travel; lift unlocks only on directly contacted rightward transport. |
| Push Box | Yes | **Tune** | Crate motion is physical, but proximity substitutes for contact provenance. Record contact and supported crate displacement. |

### Motor (10)

| Goal | Creature fit | Reward | Farming audit / required change |
|---|---|---|---|
| Motor Drive | Powered wheels | **Tune** | Endpoint distance does not prove motor work/support in Free. Track powered-wheel-supported displacement. |
| Motor Ramp | Powered wheels | **Sound** | Supported ramp height dominates; forward shaping is secondary. |
| Motor Ice Run | Powered wheels | **Sound (remediated)** | `motorIceFitness` tracks ice-supported distance separately from Drive endpoint travel (`smoke-motor-drive-ice.ts`). |
| Clear the Gap | Launch-capable motor | **Tune** | Full-hull crossing and pit penalty are good, but semantics claim regained support while `gapCleared` does not. Align success or add far-side support. |
| Launch & Land | Two powered wheels | **Sound / tune eligibility** | Best landing, both-wheel/soft-impact factors, pit penalty, and capped approach are honest. Enforce two wheels. |
| Hamster Hoop | Partial: copy permits weight shift, Motor zone requires wheels | **Sound** | Grounded travel dominates; loft/outside penalties defeat launch exploits. Align category and copy. |
| Jump Hurdles | Motor jumper | **Sound / tune (remediated)** | Tier-0 supported hull drive-over clearance gives wheeled carts gradient; jump actuators optional at low tier (`smoke-motor-hurdles.ts`). |
| Landspeed | Powered wheels | **Sound (remediated)** | Min-travel gate blocks grounded spikes; peak land speed plus travel (`smoke-landspeed.ts`). |
| Bridge Crossing | Powered wheels | **Retired (D108)** | R4 retained a `0/3` learned-policy failure and confirmed the task has no distinct behaviour in strict 2D: a reachable static bridge is ordinary ground driving, while visual width cannot create lateral balance. Removed from selection; legacy enum/scoring remain readable. |
| Motor Technical Course | Powered wheels | **Sound** | D105 counts checkpoints as `index + 1`, requires ordered supported crossings, gates finish on all checkpoints plus support, and bounds supported-travel shaping below one section. |

### Sports (3)

| Goal | Creature fit | Reward | Farming audit / required change |
|---|---|---|---|
| Score a Goal | Object-capable walker | **Sound (remediated)** | Open goal mouth (ball ignores posts); NET aligned to mouth; 300 bonus requires ball in net within 45-frame recent-contact window (`smoke-kick-goal.ts`). |
| Pin Smash (was Bowling) | Partial: body-ram pins, not bowling | **Sound / honest copy** | Renamed Pin Smash; no ball or pin-pin chain reaction. Unique pin displacement score (`smoke-bowling-pins.ts`). |
| Hazard Dash | Locomotion | **Sound (remediated)** | Stray DODGEBALL ball removed so object sensors track course geometry; ordered hazard crossings + supported finish unchanged. |

### Precision (3)

| Goal | Creature fit | Reward | Farming audit / required change |
|---|---|---|---|
| Balance Beam | Yes | **Sound** | D104 accumulates distance and posture only through a continuous authored-beam support chain; far-end completion requires traversing 70%, defeating endpoint travel, bypass leaps, and final-pose recovery. |
| Parking Zone | Partial: valid for walkers, but all guidance describes Motor Cart | **Sound (remediated)** | Body-scaled posture gate allows low wide motor carts; hold-time + support + slow speed unchanged (`smoke-parking-zone.ts`). |
| Hit Targets | Object-capable body | **Sound (remediated)** | Circle collider aligned to visual; approach shaping before first hit; hits require recent ball contact (`smoke-hit-target.ts`). |

### Custom (1)

| Goal | Creature fit | Reward | Farming audit / required change |
|---|---|---|---|
| Custom Goal | Unrestricted by design | **Tune (remediated)** | `manual` metric returns 0 (no gradient). Other inherited metrics retain their exploits; show units/ranges and warn on dominance. |

## New goals using current components

These use existing nodes, muscles/bones, wheels, aero links, private objects,
and authored obstacles. Add them one at a time only after a deterministic
reference and an anti-farming test.

| Category | New skills available without new physics |
|---|---|
| Locomotion | **Shuttle Run** (right checkpoint then return); **Stop-Go**; **Gait Efficiency** (supported distance per work); **Rough Terrain Traverse**. |
| Jumping | **Hop Right / Left / Speed (D128)**; **Target Landing**; **Ordered Jump Sequence**; **Low-Ceiling Long Jump**; **Flip & Stick**. |
| Flight | **Station Keep** under wind; **Glide Efficiency**; **Precision Air Landing**; **Climb-Cruise-Return**; **Chute Descent** specifically for parachutes. |
| Climbing | **Summit & Descend**; **Ordered Platforms**; later **Cargo Climb** after grasp truth. Wall climb waits for grip components. |
| Objects | **Ball Delivery**; **Push to Mark** with overshoot penalty; **Uphill Push**; later **Object Sort** after object sensing. |
| Motor | **Braking Distance**; **Hill Descent Control**; **Reverse Park**; **Payload Push**; **Motor Efficiency**. |
| Sports | **Penalty Accuracy**; **Bowling Proper**; **Target Sequence**; later **Keep-Up** after contact provenance. |
| Precision | **Beam Hold**; **Checkpoint Pose**; **Exact Distance**; **Narrow-Gate Traverse**. |
| Custom | Ordered stages, best-attempt aggregation, event gates, normalized contribution previews. |

## New build components

### Priority 1 — sensing and reward provenance

1. **Object-relative sensor:** range-limited bearing/distance to the goal's
   private object, enabling feedback rather than memorized timing.
2. **Contact/touch sensor:** observes authoritative node/link contacts and
   contacted class; it never creates forces.
3. **Energy/work telemetry:** integrates muscle and powered-wheel work with
   units/caps for honest efficiency goals.

Object sensing changes observation size and therefore stales controllers.

### Priority 2 — manipulation and climbing

4. **Active gripper:** contact-first, force/angle-limited latch that consumes an
   action and can release. No attachment at distance or permanent world anchor.
5. **Grip/contact pad:** directional bounded friction for feet, braking, and
   future wall climbing; static adhesion never earns climb reward.
6. **Physical plate/shell segment:** finite-width collision/mass surface for
   cups, paddles, feet, bumpers, and cargo beds, distinct from visual skin.

### Priority 3 — articulation and vehicles

7. **Telescoping bone (shipped D123) + authorable piston (shipped D127):** hard
   variable-length strut; telescope uses global stroke rate, piston exposes
   per-link compression/expansion rates. Studio allows one hard + one soft per
   unordered pair.
8. **Hinge with angular limits:** passive damping and real knees/elbows/folding
   structures without dense triangular webs.
9. **Rotary servo/torsional spring:** action-driven target angle with torque and
   speed limits and observable work.
10. **Tether/coupler:** contact-first breakable payload attachment for towing and
    pendulum cargo; coupling alone never scores.
11. **Suspension spring-damper:** explicit passive compliance, separate from an
    active muscle.

### Priority 4 — richer honest aerodynamics

12. **Passive airfoil/stabilizer:** non-actuated lift/drag curve with stall,
    mass, and signed orientation; held flapping wings still do not create hover.
13. **Actuated control surface:** bounded hinge flap on an airfoil, consuming
    one action and injecting no thrust.

Propellers, rockets, unlimited world adhesion, and decorative parts that
secretly create force are deliberately deferred.

## Ordered implementation gates

### Implementation progress

- **R1 family 1 complete (D099): Hang Time.** Fitness now uses the best
  supported-takeoff bout, ignores episode-wide hop totals, rejects contact
  flicker below 6 px whole-body clearance, and bounds clearance shaping below
  duration.
- **R1 family 2 complete (D100): Stay Tall.** Fitness now integrates normalized
  posture only on authoritative support and retains a penalty for supported
  collapsed frames; final pose no longer determines the episode score.
- **R1 family 3 complete (D101): Obstacle Climb.** Authored course boxes carry
  contiguous order provenance. Fitness advances only after three consecutive
  supported frames on the next box top; generic altitude, ground travel,
  user-added boxes, and out-of-order landings score nothing.
- **R1 complete (D102-D105).** Carry Ball uses direct collision-chain
  provenance; Hazard Dash uses ordered crossings and a supported finish;
  Balance Beam requires continuous authored-beam support; Motor Technical
  Course gates its supported finish on ordered supported checkpoints.
- **R2 complete (D106).** Jump Right/Left, Fly Right/Left, both Acrobatics
  goals, and Flight Land retain only their best isolated attempt. Inflated
  episode totals cannot combine separate attempts.
- **R3 complete (D107).** Aerial Crossing and Motor Bridge require supported
  completion, ball goals require direct creature contact, shaping is bounded
  below completion, and launch eligibility enforces goal-specific equipment.
- **R4 complete (D108).** The reconstructable calibration manifest compares
  inert, strongest shortcut/shaping-only, and deterministic reference scores
  for all 18 repaired R1-R3 goals. Three fixed-morph learned-policy tracks
  (Hang Time, Fly Right, and Motor Bridge) retain all three seeds and evaluate
  them under two held-out physics variants. Hang Time and Fly Right pass all
  held-out evaluations. Motor Bridge remains an explicit `0/3` failure and is
  retired: static supported traversal is not distinct from ground driving in
  strict side view. Its legacy paths remain readable but it is absent from all
  selectors.
- **G1 complete (D109).** Rough Terrain Traverse uses existing seeded terrain,
  checkpoints, support provenance, and controller I/O. Completion requires
  three ordered supported markers plus a supported finish. Inert and endpoint
  bypass score `0`, shaping-only caps at `150`, checkpoints without finish cap
  at `750`, and the deterministic reference exceeds `1320`. Three learned seeds
  pass two held-out physics/course-length variants. The manifest also retains
  Shuttle Run's rejected `0/3` exploratory result.
- **Full goal remediation complete (2026-07-29).** Kick Goal mouth geometry and
  ball/post collision rules fixed; `ballContactFrame` 45-frame window replaces
  permanent latch. Hit Target circle collider + approach shaping. Bowling renamed
  Pin Smash; Hazard Dash stray ball removed. `recommendedGenerationDuration`
  auto-applies on goal change. Tier-0 finish distances (~5× legacy) paired with
  longer generation for finish-line goals. Speed/Landspeed exploit gates;
  Motor Ice differentiated scoring; Parking wide-cart posture; Motor Hurdles
  tier-0 drive-over; Sprint Finish support-gated finish. Eleven new smoke tests
  wired into `test:phase21`.

- **C2 complete (D147 / `4.23.0`).** Contact/touch sensor: per-node class
  encoding plus fixed summary pack; observation only; held-out wall-retreat
  reactive + learn gate. Next component slices (sticky/claw) must stay
  one-at-a-time. C1 object-relative sensing shipped as D145 (`4.22.0`).
  D128 closed walk/jump/hop reward-truth definitions and added three hop goals
  without changing observation/action I/O. D129 closed the Run Right/Left
  oscillation plant-farm with monotonic plant+body frontiers (physics 4.7.1).

1. **R1 — Reward truth:** Hang Time, Stay Tall, Obstacle Climb, Carry Ball,
   Hazard Dash, Balance Beam, and Motor Technical Course. Prove separate hops,
   final-pose recovery, free jumps, proximity, camping, beam bypass, and
   checkpoint bypass cannot win.
2. **R2 — Attempt isolation:** Jump Right/Left, Fly Right/Left, Flight Land,
   and both Acrobatics goals get explicit best-bout state.
3. **R3 — Support and causality:** supported-travel ledgers, surface/contact
   provenance, supported finishes, and goal-specific equipment eligibility.
4. **R4 — Calibration:** compare inert, shortcut, scripted/reference, and
   learned strategies. Physical completion must dominate all shaping-only play.
5. **G1 — New goals on old physics:** one at a time, with a feasibility probe.
6. **C1 — Components:** sensors first, then one physical family at a time. Each
   observation/action/physics change needs a compatibility version advance,
   package migration, renderer/Studio support, and regression proof.

No reward or component is accepted because its training graph rises.
Evaluation remains separate, failed seeds remain visible, and each new skill
needs a held-out behavioural criterion.
