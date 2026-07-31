# DECISIONS.md — Soft-body Sandbox

## D153 — Physics/geometry repair sweep (2026-07-31)

**Decision:** Soft-body physics advances `4.25.0` → `4.26.0`. A cross-area
audit (Studio previews, arena solver, course geometry) fixed the following.
(D152 is reserved for the Studio range-preview solver rework happening in a
parallel session — `src/rangePreviewSolver.ts`.)

**Solver (behavioral — version bump):**
- D142 actuation flag wired in: `markLengthActuationForTick` set
  `_actuatingThisTick` but the preserve policy never read it. Actively
  commanded links (targetLength changed this tick) now always use
  position-only correction, matching the documented D142 policy; held
  commands near target still preserve Verlet history.
- Spawn seeds `targetLength` (and `_constraintTargetSeen`) clamped inside
  `[minLength, maxLength]` — some authored bodies carry rest lengths outside
  the stroke, which made first ticks fight the clamp and pop on first command.
- `rateLimitLengthTarget` normalizes inverted bounds (`minLength > maxLength`)
  before clamping; `normalizeBlueprintMuscle` also swaps inverted stroke
  bounds at load so downstream code can assume `min ≤ max`.
- Ice friction band follows authored patch geometry (`obs.y`) instead of a
  hard-coded `GROUND_Y` strip.

**Course geometry:**
- Balance Beam / Motor Bridge: deck now spans the pit lip-to-lip with a small
  `scaleD(12)` mountable lip. Legacy layout floated the deck 55–70 unscaled px
  up (pre-CREATURE_WORLD_SCALE; unmountable for ~12px bodies) and started
  60–90px inside the pit (guaranteed lip fall).
- `snapObstaclesToTerrain` preserves authored elevation above `GROUND_Y`
  (shift by terrain lift) instead of seating every box on the local surface —
  elevated pads/beams/platforms no longer flatten onto terrain.
- Challenge launches no longer inherit the user's stale sandbox modifier
  toggles (terrain/ice/wind/pit/ramp default to the challenge's own flags).
- `motor_gap_350` no longer advertises `rampEnabled` (the optional-course
  appender always skipped MOTOR_GAP; the flag never took effect).

**Render/collision alignment (no physics change):**
- Kick Goal crossbar drawn with its authored left-edge convention (Clear Bar
  keeps center convention) — was drawn half a mouth-width left of scoring.
- Chute tower platform deck drawn flush under the collision top so creatures
  stand on the drawn platform instead of floating above it.
- Ice patch drawn at its authored band, matching the friction zone.

**Persistence fidelity (found while gating — no behavior change):**
- `sanitizeAppearanceRig` and `normalizeBlueprintMuscle` /
  `normalizeCreatureBlueprint` wrote inapplicable optional fields as explicit
  `undefined` keys. JSON persistence drops those keys, so sanitized objects
  deep-compared unequal to their own saved round-trips. All normalizers now
  omit the keys instead.
- `smoke-continue-training` template selector: `name.includes('Cart')` grabbed
  the aero-equipped Glide Cart (which legitimately lists flight goals) once
  cart templates multiplied; now selects Motor Cart / non-aero motor bodies.

**Evidence:** `npx tsc --noEmit` clean; 18 targeted smokes green
(physics-invariants, piston, telescope, soft-muscle-rate, hinge-stops,
moment-arm, solid-segments, collisions, balance-beam, motor-technical,
kick-goal, gap, walk-jump-hop, motor-ramp-drive, motor-drive-ice,
rough-terrain, stair-climb, aero); full `test:phase21` suite (31 scripts)
exits 0; continue-training + finished-models smokes green.

**Deferred (audited, not fixed here):** slope-tangent surface friction on
ramps/stairs; swept-TOI placement in `collideNodeRamp`; rigid-bone ramp/capsule
contacts without `oldX/oldY` sync; legacy `0.35`/`0.4` mass floors in
`projectRigidBoneAxialVelocity`, wind, and aero (force scales were tuned with
the floors — needs a dedicated retune); terrain-aware spawn for custom
environments (`settleSpawnOnGround` is flat-only); stair riser depth vs actual
uneven rise; `bar` obstacles have no body collision (scoring volumes only);
hinge-stop global preserve (deliberate D138) narrowing.

**Reversible:** Each fix is an isolated diff; revert physics to `4.25.0`.

## D151 — Soft-muscle bone-slot moment arms (2026-07-31)

**Decision:** Soft-body physics advances `4.24.0` → `4.25.0`. Soft muscles may
attach an end to a discrete virtual slot on an existing rigid bone
(`nearA` / `mid` / `nearB` at t = 0.25 / 0.5 / 0.75) instead of only node
centers. Force splits to the host bone’s endpoints by barycentric weights.

**Why:** Designers need mid-bone leverage (different moment arms) without
subdividing bones or growing brain I/O. Node clicks remain joint-exact; the
three inset slots are the new gearing options.

**Rules:**
- Soft `muscle` only; bones/pistons stay node↔node.
- Host must be `linkKind: 'bone'` in `muscles[]` (`leverBoneA/B` + `leverSlotA/B`).
- Levered soft muscles do not form parallel soft/hard piston slave pairs.
- Brain output count unchanged; fingerprint includes lever fields.
- Gate with D142 smokes + `scripts/smoke-moment-arm.ts`.

**Evidence:** `scripts/smoke-moment-arm.ts`, `scripts/smoke-physics-invariants.ts`,
`scripts/smoke-motor-ramp-drive.ts`.

**Reversible:** Strip lever fields; revert length solver to two-node path;
physics `4.24.0`.

## D150 — Soft-muscle rate caps + telescope→piston (2026-07-31)

**Decision:** Soft-body physics advances `4.23.1` → `4.24.0`. Creature Studio
exposes opt-in soft-muscle command rate caps (creature default + per-muscle
override). The redundant **telescope** link kind is collapsed into **piston**.

**Why:** Soft muscles could flip `targetLength` full stroke every tick, enabling
high-frequency vibration scooting that looks like sliding. Run/Shuffle already
split scoring (D137); authors still needed a physics-side opt-in to prevent
oscillation at source. Telescope and piston already shared the hard variable
strut solver — keeping both kinds only duplicated UI/rate authorship.

**Rules:**
- Soft muscles: `resolveSoftMuscleMaxDelta` — muscle `softMaxDeltaPerTick` >
  0 overrides; muscle `0` = unlimited; else creature
  `softMuscleMaxDeltaPerTick`; else unlimited (legacy).
- Cap applied at brain→`targetLength` assignment via `rateLimitLengthTarget`.
- Legacy `linkKind: 'telescope'` and stiff-range inference normalize to
  `piston` with `defaultPistonRatesForStroke` rates.
- Studio: bone ↔ piston ↔ muscle cycle; body “Limit soft muscle stroke rate”
  + per-muscle Inherit / Custom / Unlimited.
- Controllers under `≤4.23.x` remain visible but stale when fingerprints or
  physics version diverge.

**Evidence:** `scripts/smoke-soft-muscle-rate.ts`, `scripts/smoke-piston.ts`,
`scripts/smoke-physics-invariants.ts`.

**Reversible:** Drop soft rate fields; restore telescope kind + global
`telescopeCommandDeltaBudget` hard path; revert physics to `4.23.1`.

## D149 — Post-scale observation + reward-gate retune (2026-07-31)

**Decision:** Soft-body physics advances `4.23.0` → `4.23.1`. After
`CREATURE_WORLD_SCALE = 0.1`, retune brain observation divisors and leftover
legacy-px reward/escalation gates so world-scale bodies can learn again.

**Why:** Creatures shrank 10× in linear world units. Clearance / travel **gates**
in `physicsConstants` were mostly retuned earlier, but:
1. Proprioception still divided node offsets and flight clearance by `100`
   (legacy body scale) → inputs ~0.05–0.1, so random genomes produced near-zero
   muscle drive and fitness stayed flat.
2. Hard score gates still used legacy absolutes (`upright > 50`,
   `peakAir >= 32`, box near `60`, para loft peaks `50`/`90`) that world-scale
   bodies cannot pass → entire goals stuck at 0.
3. Motor chassis share used `max(0.35, massSum)` while node masses are ~0.001,
   zeroing rigid-bone drive coupling.
4. Progressive height/air bars and jump challenge targets still cited legacy px.

**Rules:**
- `BODY_OBS_LENGTH_DIVISOR = 100 × CREATURE_WORLD_SCALE` (=10); speed obs
  divisors likewise × scale. Arena-range sensors (`/400`, object range 480)
  stay arena-scale.
- Flight Land / Chute stick gate uses `UPRIGHT_SCORE_GOOD` (not 50).
- Motor Launch min air = `max(MOTOR_LAUNCH_MIN_AIR_PX, jumpLandMinHeight)`.
- Box-push near/falloff and clear-bar approach windows use world-px constants.
- Para loft/leap height thresholds via `worldLen(...)`.
- Progressive jump/flight height + air-distance bars × `CREATURE_WORLD_SCALE`.
- Jump challenge targets retuned to world-scale clearances/scores.
- Controllers trained under `≤4.23.0` remain visible but stale (obs scale).

**Evidence:** `scripts/diagnose-scale-fitness.ts` (obs magnitude + upright gate);
updated phase-21 smokes; motor ramp / walk / parking / push-box smokes.

**Reversible:** Restore `/100` obs divisors and legacy absolute gates; revert
physics to `4.23.0`.

## D148 — Live built-in reward recipes (Phase 22A) (2026-07-31)

**Decision:** Parameterize SPEED and JUMP_SPEED fitness term coefficients into a
shared editable recipe (`src/builtInRewardCoeffs.ts`) consumed by both
`calculateFitness` and `calculateRewardBreakdown`. Users can live-tune those
coeffs from the Elite Rewards overlay, reset to defaults, and freeze the recipe
onto finished products. Best Ever ledger keys separate default vs custom recipes.

**Why:** Built-in goals had hard-coded multipliers; custom goals already allowed
live weight edits. Exposing pilot-goal coeffs is the highest-leverage path to
“fine-tuning learning feel” without a global reward rewrite or physics change.

**Rules:**
- Defaults must match pre-22A shipped numbers exactly (SPEED: belowGate 0.15,
  peak 45, distance 0.35; JUMP_SPEED: peakSpeed 50, clearance 0.3, airtime 0.35).
- Gates (`SPEED_MIN_TRAVEL_FLOOR`, `JUMP_MIN_FRAMES`, clearance floors) stay
  fixed in `physicsConstants.ts` — not sliders in 22A.
- `SimulationConfig.rewardRecipe` optional; omit means defaults.
- Non-default recipes show a UI badge; freeze stores recipe + fingerprint on
  `FinishedModel`. Best Ever uses bare `goal` for default fingerprint and
  `goal::fingerprint` for custom — never merge across recipes.
- Custom goals remain on `CustomGoalConfig`. No physics / feel / part changes.

**Evidence:** `scripts/smoke-speed.ts` (default parity); `scripts/smoke-builtin-reward-recipe.ts`
(override + fingerprint + breakdown alignment).

**Reversible:** Ignore `rewardRecipe` / fingerprints and restore inline literals.

## D147 — Contact / touch sensor (C2) (2026-07-31)

**Decision:** Soft-body physics advances `4.22.5` → `4.23.0`. Every brain gains
authoritative contact-class observations: per-node Touch encodes
floor / structure / object (`0`, `1/3`, `2/3`, `1`), plus a fixed 5-input summary
pack after the object sensor (`anyNodeFloor`, `anyNodeStructure`, `anyNodeObject`,
`linkStructure`, `linkObject`). Observation only — never creates forces.

**Why:** Binary `isGround` cannot tell floor from wall from ball. Gripper / sticky
/ climb parts need class-discriminating contact feedback first. C2 adds that
without a grip pad, reward rewrite, or physics-bearing component.

**Rules:**
- Classes: floor (flat / terrain), structure (box, ramp, stair, pit, loop, …),
  object (ball, hoop, private box). Priority object > structure > floor.
- Hard-link capsule hits set `linkContactStructure` and tag endpoints.
- Controllers trained under `≤4.22.x` remain visible but stale (I/O + physics).
- No fitness formula changes; no gripper / contact-pad forces in this gate.

**Evidence:** `scripts/smoke-contact-sensor.ts`; `scripts/prove-contact-sensor.ts`
(reactive wall retreat on held-out faces + 2/3 Motor Cart learn seeds with
ablation contrast). Object-class tagging covered in the smoke.

**Reversible:** Drop the contact pack from sensors + `genomeIOForBlueprint`;
restore binary Touch; revert physics to `4.22.5`.

## D146 — Studio world-scale authoring clamps (2026-07-30)

**Decision:** Soft-body physics advances `4.22.4` → `4.22.5`. Studio mass,
radius, bone/link length, motor power, piston rate, aero-area, and appearance
offset sliders use **world units** matching `CREATURE_WORLD_SCALE` bodies.
`scaleCreatureBlueprint` now scales `motorPower`; leftover legacy drive on
already-scaled geometry is migrated once via `ensureScaledBlueprint`. Telescope
command floor is `0.4` world-px/tick (was legacy `4`).

**Why:** After creature downscale, the mass slider still spanned legacy
`0.5–5.0`, so touching it snapped nodes to ~300× true mass (and similar
mismatches on bone length / piston max). Authoring controls must match the
bodies they edit.

**Rules:**
- Mass `0.0005–0.005` (default `0.0015`); radius `1–5`; link lengths `1–50`;
  motor `0.05–2.0`; piston rates `0.05–50`; aero area `0.5–16`.
- Load/save clamps through the same helpers; fingerprint / physics version
  diverge marks older controllers stale when clamps change behaviour.

**Evidence:** Studio slider ranges; `ensureScaledBlueprint` motor/mass migration;
existing smoke suite retained.

**Reversible:** Restore legacy slider mins/maxes and `TELESCOPE_MAX_DELTA_PER_FRAME = 4`;
stop scaling `motorPower`; revert physics to `4.22.4`.

## D145 — Object-relative sensor (C1) (2026-07-29)

**Decision:** Soft-body physics advances `4.21.0` → `4.22.0`. Every brain gains a
fixed 3-input object-relative pack: range-limited `relX`, `relY`, and proximity
to the goal's private interactive object (prefer unique ball, else hoop, else
nearest box/pin). Out of range or missing target → `[0,0,0]`. Observation only.

**Why:** Carry Ball / Push Box / sports goals still force memorized timing
because controllers cannot see the private object. C1 adds feedback without a
gripper, contact pad, or reward rewrite.

**Rules:**
- `OBJECT_SENSOR_RANGE_PX = 480`; in-range values are `dx/R`, `dy/R`, `1−dist/R`.
- Pack is always present in `genomeIOForBlueprint` (after wing/para packs).
- Controllers trained under `≤4.21.0` remain visible but stale (I/O + physics).
- No forces, no fitness formula changes, no manipulation components in this gate.

**Evidence:** `scripts/smoke-object-sensor.ts`; `scripts/prove-object-sensor.ts`
(reactive left/right held-outs + 3/3 Motor Cart learn seeds with ablation
contrast). Carry Ball / package smokes retained.

**Reversible:** Drop the trailing pack from sensors + `genomeIOForBlueprint`;
revert physics to `4.21.0`.

## D144 — Wheeled solid chassis floor plant (2026-07-28)

**Decision:** Soft-body physics advances `4.20.0` → `4.21.0`. Solid flat-ground
replant measures deepest penetration across **all** plate members (including
wheels) and always lifts when members penetrate `GROUND_Y`. Downward reseating
of a solid that merely contacted this frame remains flat-course-only.

**Why:** `resolveSolidFlatGround` skipped wheels when measuring depth. Wheeled
solid chassis plates (user Glydor: motor wheels + elevated body nodes locked as
one solid) reported a large **negative** depth from the chassis and yanked the
whole plate into the floor every frame. That burial also fought Motor Ramp
drive on the approach pad / incline. D142 correctly gated node-level flat
replant on structured courses, but solid plates still needed wheel-aware depth
and a penetration-only lift on ramp arenas.

**Rules:**
- Deepest = max(`y + radius − GROUND_Y`) over every solid member, wheels
  included.
- If deepest > 0: uniform lift out of the floor (all courses).
- If deepest ≤ 0 and flat-course contact this frame: reseat to floor height
  (preserves post-reshape plant; never used on ramp/stair/box/pit/loop/terrain
  courses).
- Motor Cart ramp climb regression retained.

**Evidence:** `scripts/smoke-solid-segments.ts` (wheeled solid flat + Motor Ramp
approach), `scripts/smoke-motor-ramp-drive.ts`, Glydor elite replay
(worstPen 72→~3; ramp approach burial cleared).

**Reversible:** Restore wheel-skipping deepest + unconditional
solidsThatHitGround plant; revert physics to `4.20.0`.

## D143 — Bird-like symmetrical flap lift + reward (2026-07-28)

**Decision:** Soft-body physics advances `4.19.0` → `4.20.0`. Wing aero pairs
left/right wing muscles and scales downstroke pressure/lift by a bird-like
symmetry score. Stay Aloft and Flight Height add an explicit symmetrical-flap
bonus on top of existing flap work. The Flapper template's right-wing
`phaseOffset` is set in-phase with the left wing.

**Why:** One-sided thrashing could still farm flap counters and produce
comparable tip impulses, so evolution had little pressure toward matched L/R
strokes. Bird-like flight needs both a physical advantage (best lift from
synchronised downstrokes) and a direct fitness signal on Stay Aloft / Height.

**Rules:**
- Pair outermost opposite-side wing tips about COM; score matched power
  strokes (authority + command + tip level) in `[0, 1]`.
- Paired lift scale ≈ `0.88 + 0.47 × bird` (solo ~0.88×, matched ~1.35×).
  Unpaired single wings keep unit scale.
- `wingSymFlapFrames` / `wingSymFlapQuality` accumulate when bird ≥ 0.4.
- Stay Aloft / Flight Height bout scores add a capped sym bonus; bout bases
  snapshot these counters like flap work (D113 single-bout honesty retained).
- Asymmetric tip authority for steering is retained, with matched strokes
  producing the best climb.

**Evidence:** `scripts/smoke-aero.ts` (symmetric COM lift > solo; asymmetric
tip dominance retained), `scripts/smoke-flight-height.ts`,
`scripts/smoke-flight-single-bout.ts`, `scripts/prove-flapper.ts`.

**Reversible:** Drop pair scale + sym counters/bonuses; restore Flapper
right-wing `phaseOffset = π`; revert physics to `4.19.0`.

## D142 — Actuation / aero / ramp coupling repair (2026-07-28)

**Decision:** Soft-body physics advances `4.18.0` → `4.19.0`. D141's universal
Verlet-preserving length projections are narrowed so legitimate actuation and
force transmission work again, without bringing back ramp floor-yank or quiet
chassis energy on fixed bones.

**Why:** Universal `oldX`/`oldY` sync on every length correction stopped residual
hops, but also:
1. Soft muscles no longer created tip velocity when `targetLength` changed →
   flapping flight died.
2. Soft tension no longer coupled sail/chute drag into the payload when held
   near rest length with large stretch under load.
3. Fixed-bone preserve blocked axial force sharing on chute risers and motor
   axles until explicit coupling was restored.
4. Flat-floor pre-plant + post-settle replant to `GROUND_Y` yanked Motor Cart
   climbers off ramps and fought paraglider takeoff.

**Rules:**
- Soft / telescope / piston: classic position-only correction when
  `|target − length| ≥ LENGTH_ACTUATION_EPS_PX` (0.5px); preserve when nearer
  (limits rest-hold drip).
- Fixed bones: always preserve geometric corrections, then remove relative
  axial velocity so tension/drive couples through the link.
- Grounded motor drive also shares impulse into rigidly connected chassis nodes.
- Flat-floor pre-constraint plant disabled; post-settle replant only on non-aero
  bodies and only when the node is still near the floor; structured supports
  (ramp/stair/box/pit/loop/terrain) never use flat-floor replant.
- Studio preview: classic soft links; preserve on fixed bones.

**Evidence:** `scripts/smoke-aero.ts`, `scripts/prove-flapper.ts`,
`scripts/prove-flight-learn.ts` (3/3), `scripts/prove-paraglide.ts`,
`scripts/prove-para-ramp.ts`, `scripts/smoke-motor-ramp-drive.ts`,
`scripts/smoke-physics-invariants.ts`, `scripts/smoke-walk-jump-hop.ts`.

**Reversible:** Restore D141 universal preserve + flat pre/replant; drop motor
share and axial bone projection; revert physics to `4.18.0`.

## D141 — Universal Verlet-preserving length projections (2026-07-28)

**Decision:** Every soft/hard length constraint projection in simulation (main
relaxation loop and `projectHardLengthConstraints`) updates `oldX`/`oldY` by the
same delta as positions. Studio physics preview mirrors this. Soft-body physics
advances `4.17.0` → `4.18.0`.

**Why:** D133 proved constraint residuals inject kinetic energy when positions
move without updating Verlet history. That fix applied only when solid segments
or hinge stops were present. Plain walkers (soft muscles + fixed bones only)
still gained phantom speed and jitter — movement with no visible actuator push.
User reports matched: unnatural motion in simulation even without telescopes.

**Rules:**
- Constraint satisfaction never invents velocity; actuation comes only from
  changing `targetLength` (brain / rate-limited hard struts).
- `spawnCreature` plants on GROUND_Y, zeroes velocity, and statically relaxes
  link lengths before the first tick.
- Flat courses resolve floor support before and after the final hard-length
  settle so contact and bone projections do not fight.
- Post-contact solid reshape with `preserveVelocity: false` unchanged (friction
  already wrote velocity; avoids launch amplification).
- Hinge stops already preserved velocity; unchanged.

**Evidence:** `scripts/smoke-physics-invariants.ts` — passive bone bar + all
templates + synthetic link matrix (bone / soft / telescope / piston / parallel
pairs / solid / hinge) under rest-hold for 360 frames.

**Reversible:** Restore solids/hinge-only velocity preservation; revert physics
to `4.17.0`.

**Superseded in part by D142** for soft-link actuation, aero coupling, and
flat-floor / ramp support gating.

## D140 — Run Right/Left travel-primary fitness (2026-07-28)

**Decision:** Run Right/Left fitness is **forward body travel** (capped by the
stride ledger) plus a **small alternating-step bonus** capped at travel.
Discrete step points (`WALK_STEP_POINTS` × count) no longer drive selection.
Soft-body physics advances `4.16.0` → `4.17.0`.

**Why:** D137 made step points (48 + 16 alternate) dominate
`min(strides, body)`. A high-frequency in-place stepper could outscore a model
that ran further and stayed upright — generation winners did not match the best
visible locomotion.

**Rules:**
- Gate unchanged: ≥1 swing-gated step and ≥1 foot→foot alternate (D137/D139).
- Fitness = `min(body, strides)` + `min(alternateCount × WALK_ALTERNATE_BONUS, travel)`.
- `walkStepScore*` remains telemetry only.
- One-time migration `wipeStepPointRunBestEverOnce` clears Run Right/Left Best
  Ever and shelf fitness from the step-point era.

**Evidence:** `scripts/smoke-walk-jump-hop.ts` (twitchy vs strider ordering).

**Reversible:** Restore step-point-dominant fitness; revert physics to `4.16.0`.

## D139 — Foot-only alternating steps (2026-07-28)

**Decision:** Run Right/Left alternate-step credit (bonus + fitness unlock)
requires a **foot→foot** transfer. Distinct non-foot contacts (knees, hips,
hands) never count as alternating steps. Soft-body physics advances
`4.15.0` → `4.16.0`. Biped / Quadruped / Flapper templates mark their sole
nodes as `isFoot`.

**Why:** D138 gated plants when feet were authored, but unmarked bodies (and
tests that planted hip/knee indices) still unlocked Run via any two contact
nodes. That defeated the foot-marker intent.

**Rules:**
- `walkAlternateStepCount*` and `WALK_ALTERNATE_BONUS` only when both the prior
  and current credited plant nodes have `isFoot`.
- Bodies with no marked feet can still mint ungated auto-gait plants, but cannot
  unlock Run fitness (alternate count stays 0).
- Shuffle unchanged (no alternate term).

**Evidence:** `scripts/smoke-walk-jump-hop.ts` (foot→foot unlocks; knee↔knee
stays 0); `scripts/smoke-hinge-stops.ts`.

**Reversible:** Restore any-distinct-node alternation; revert physics to
`4.15.0`; clear template `isFoot` flags if desired.

## D138 — Authored feet + 90° hinge stops (2026-07-28)

**Decision:** Creators can mark grip nodes as **feet** and mark joints as
**hinge stops** (max 90° between hard bones). Soft-body physics advances
`4.14.0` → `4.15.0`.

**Why:** Run Right/Left alternate-step scoring was polluted by knees, hands, and
chassis contacts entering the auto gait set. Authors need explicit plant points.
Separately, knees/elbows need a unilateral fold limit (parallel → right angle)
without restoring the removed D131–D135 freeze locks.

**Rules:**
- `isFoot`: when any node is marked, Run and Shuffle plant ledgers only credit
  marked feet; alternation is foot-to-foot. With no feet marked, behaviour is
  unchanged (auto 1–4 contact gait). Wheels cannot be feet.
- `isHingeStop`: every pair of hard links (bone / telescope / piston) meeting at
  the node is clamped to ≤ 90°. Soft muscles do not define the angle. Projection
  always preserves Verlet velocity; length corrections also preserve velocity
  while any hinge stop is active (D133 lesson). Best with exactly two hard
  spokes (knee/elbow).
- Fingerprint includes both flags. Controllers trained under 4.14.x are stale
  when feet/hinges appear or physics version diverges.
- Studio: Foot plant toggle + 90° stop toggle; green sole and rose L chrome in
  Studio, Visualizer, and range preview.

**Evidence:** `scripts/smoke-hinge-stops.ts`; retained
`scripts/smoke-walk-jump-hop.ts`, `smoke-solid-segments.ts`, `smoke-piston.ts`,
`smoke-telescope.ts`.

**Reversible:** Drop `isFoot` / `isHingeStop` and `src/hingeStops.ts`; restore
auto-only gait; revert physics to `4.14.0`.

## D137 — Step-strict Run vs Shuffle vibration subcategory (2026-07-28)

**Decision:** Split flat walking rewards. **Run Right/Left** (locomotion) now
score discrete swing-gated steps with high step points; vibration / grounded
flicker / body slide without steps score **0**. New Walking subcategory
**Shuffle** (`SHUFFLE_RIGHT` / `SHUFFLE_LEFT`) rewards body travel plus weighted
oscillation-plant co-progress so vibrating scooters remain a first-class
strategy. Soft-body physics advances `4.13.0` → `4.14.0`.

**Why:** Elite bipeds learned high-frequency muscle oscillation that advanced
plant + body frontiers under D129 without real swing/transfer steps. That gait
is interesting but is not “walking.” Keeping one reward for both skills forced
either silent acceptance of vibration on Run or deletion of a valid behaviour.

**Rules:**
- Run step credit requires: rising-edge plant after ≥`WALK_SWING_MIN_FRAMES`
  airborne on that node, ≥`WALK_STEP_MIN_INTERVAL` since the last step, and
  co-progress of plant + body frontiers. Alternating contact nodes earn
  `WALK_ALTERNATE_BONUS`. Fitness = step points + min(strides, body); requires
  ≥1 alternating foot transfer (zero steps or same-foot-only → zero score).
- Shuffle fitness = body travel + `SHUFFLE_OSC_WEIGHT` × min(oscillation plant
  travel, body). Oscillation ledger uses the old ungated plant co-progress path.
- Goal category `shuffle` appears under Walking (and Free). Controllers trained
  under 4.13.x Run rewards are stale.
- One-time migration `wipePreStepRunBestEverOnce` clears Run Right/Left Best
  Ever ledger entries and zeroes shelf fitness for those goals so vibration-era
  champions cannot remain as all-time Run records.

**Evidence:** `scripts/smoke-walk-jump-hop.ts` (vibration→0 on Run, >0 Shuffle
ledger; swing-gated steps earn step points); `scripts/smoke-zones.ts`.

**Reversible:** Restore D129 plant-distance Run fitness; remove Shuffle goals /
category; revert physics to `4.13.0`.

## D136 — Solid segments (compound rigid plates) (2026-07-28)

**Decision:** Studio can lock ≥3 selected nodes into a **solid segment** — a
compound rigid body kept by mass-weighted 2D shape matching. Soft-body physics
advances `4.12.0` → `4.13.0`. This replaces the failed D130–D135 lock path; it
does **not** reintroduce per-joint angle locks.

**Why:** Creators need rigid plates (torso, chassis, armor) without dense bone
triangulation, while soft muscles / telescopes / pistons outside the plate keep
today’s length-only Verlet behaviour. Prior angle-lock attempts fought soft
constraints and injected Verlet energy.

**Rules:**
- Solids are relative (tumble freely); never world-pinned.
- Soft muscles may not span two nodes inside the same solid (Studio strips /
  rejects them). Hard chords wholly inside a solid are kept for collision but
  skipped in length projection — the plate owns relative geometry.
- External soft/hard links hinge on boundary members only.
- Caps: ≥3 nodes / solid, ≤64 nodes, ≤4 solids; membership is disjoint.
- Shape matching preserves the rigid velocity field (COM + ω × r) during the
  constraint loop so residual corrections do not invent kinetic energy. Length
  projections touching solids are also velocity-preserving while solids are
  active. After contact, solids reshape without re-deriving ω from contact
  residuals, then plant with a uniform translation (never per-node squash).
- Fingerprint includes `solidSegments`; controllers trained without solids (or
  under 4.12.x) are stale when solids appear / physics version diverges.
- Indication: squared node chrome in Studio, Arena Visualizer, and range preview.

**Evidence:** `scripts/smoke-solid-segments.ts`.

**Reversible:** Remove `solidSegments` / shape-matching projection; revert
physics to `4.12.0`.

## D135 — Remove joint locks entirely (2026-07-28)

**Decision:** Delete per-joint angle locks (and the superseded D130 rigid groups)
from physics, blueprints, fingerprints, Studio, Arena Visualizer, and range
preview. Soft-body physics advances `4.9.0` → `4.12.0`.

**Why:** Lock Joint and its follow-on repair patches (D132–D134) added
morphology/solver complexity without a stable product path. Creators build with
bones, telescopes, pistons, and soft muscles only.

**Rules:**
- No `lockedJoints` / `rigidGroups` on `CreatureBlueprint`.
- No `src/jointLocks.ts`; no Lock Joint / Unlock Studio controls or squared
  locked-node chrome.
- Physics no longer projects joint angles; length constraints alone remain.
- Legacy saves that still carry `lockedJoints` are ignored (extra JSON fields
  are dropped on load/rebuild).
- Fingerprints no longer include locks; controllers trained under lock-era
  physics are stale under `4.12.0`.

**Evidence:** `npx tsc --noEmit`; `scripts/smoke-telescope.ts`,
`scripts/smoke-piston.ts`, `scripts/smoke-walk-jump-hop.ts`. One-time browser
wipe via `wipeBrokenScoresOnce` clears Best Ever / challenge / arena score
ledgers and zeroes finished-model fitness.

**Reversible:** Restore D131 `jointLocks` + Studio wiring from history (not
D132/D133 repairs unless explicitly re-chosen). Score wipe is intentional and
not auto-restored.

## D134 — Reverse D132/D133 lock repairs (2026-07-28) — superseded by D135

**Status:** Superseded. Joint locks were removed entirely (D135). Kept as a
historical record of the interim rollback to D131 behaviour.

**Decision:** Revert soft-body physics and Studio/range previews from the D132
lock/soft conflict repair and the D133 Verlet launch repair back to the D131
per-joint lock behaviour. Soft-body physics returns `4.11.0` → `4.9.0`.

**Why:** Post-introduction lock “fixes” changed solver behaviour across soft
links, hard interleave, floor reclamp, and Verlet velocity preservation. The
sandbox is restored to the state at introduction of fixed (per-joint) locks,
before those repair patches.

**Rules restored (D131):**
- `ANGLE_STIFFNESS = 1` with single-pass full angle snaps.
- Soft muscles are not scaled or skipped for locks.
- Hard-length block stays hard-only (no lock interleave inside that block).
- Length projections inject Verlet velocity as before D133.
- No post-contact floor reclamp or locked-subgraph damping from D132/D133.
- Studio / range preview use the same unscaled length + lock projection path.

**Evidence:** `scripts/smoke-joint-locks.ts` (D131 elbow / hub gates); physics
version asserts at `4.9.0`.

**Consequences:** Known D131 conflict modes (soft chords across locked fans,
multi-lock cascades, chassis over-constraint) can reappear — see
`JOINT_LOCK_CONFLICT_AUDIT.md`. Controllers trained under 4.10.x / 4.11.0 lock
repairs are stale relative to 4.9.0.

**Reversible:** Re-apply D132 then D133.

## D133 — Lock / Verlet energy launch repair (2026-07-28) — REVERSED by D134

**Status:** Reversed. Soft-body physics returned to `4.9.0` (D131). Kept as a
historical record of the diagnosis and patch that was later rolled back.

**Decision:** Stop locked-joint residual fights from inventing kinetic energy and
launching wingless bodies. Soft-body physics advances `4.10.0` → `4.11.0`.

**Why:** The shipped Biped Walker V18 locked elite (and lock-only ablations of
joints 3/4/5) left the ground for hundreds of pixels with node speeds >1000
px/frame and Best Ever scores in the 1e21 range. D132 had fixed soft-chord /
truss explosions in the audit harness, but not this energy path.

**Actual cause (proven, not first guess):**
1. Rejected: scoring / camera illusion — deterministic replay reproduced launches.
2. Rejected: brain / muscle actuation alone — rest and hold outputs still launched
   when locks were present; removing locks collapsed the launch.
3. Rejected: post-contact floor reclamp velocity leak as the primary cause —
   fixing reclamp alone did not stop launches (kept as a hardening).
4. Rejected: soft spokes at 0.18 as the sole cause — lock-5 on a pure hard
   skeleton still launched.
5. Confirmed: with locks active, fixed-bone length projections moved positions
   without updating `oldX`/`oldY`, injecting Verlet velocity every constraint
   pass. Angle locks preserved that velocity while fighting length residuals, so
   kinetic energy compounded into sky launches. Manual solver with
   velocity-preserving hard projections dropped lock-5 peak clearance from
   ~728 px to ~86 px.

**Rules:**
- While any joint locks are active, fixed-bone length corrections preserve
  Verlet velocity (telescopes / pistons / undamped soft actuators still do work).
- Lock-damped soft spokes (`softScale < 1`) also preserve velocity.
- Lock projection skips neighbors that already share a hard chord with the
  chosen reference (hard triangles own those angles).
- After post-contact lock/hard/floor passes, lightly damp the locked subgraph
  (`0.9`) and kill into-floor velocity on flat reclamp.
- Studio physics preview mirrors the velocity-preserving bone path.

**Evidence:** `scripts/smoke-joint-locks.ts` D133 biped gate (no air time,
bounded clearance/speed); elite replay peak clearance ~85 px / longestAir 0
versus pre-fix ~800–1500 px launches.

**Consequences:** Controllers that farmed lock-induced launches under 4.10.x are
stale.

**Reversible:** Restore inject-only length projections for locked bodies; revert
physics to 4.10.0.

## D132 — Lock / soft constraint conflict repair (2026-07-28) — REVERSED by D134

**Status:** Reversed. Soft-body physics returned to `4.9.0` (D131). Kept as a
historical record of the audit-driven repair that was later rolled back.

**Decision:** Repair D131 joint locks so they no longer fight flexible length
constraints, adjacent locks, or closed hard trusses. Soft-body physics advances
`4.9.0` → `4.10.0`.

**Why:** Audit (`JOINT_LOCK_CONFLICT_AUDIT.md`) showed hard-only locks are stable
but soft chords across locked fans, soft spokes from locked joints, multi-lock
cascades, and angle locks on closed chassis frames produced stretch, spin, floor
penetration, and sky launches.

**Rules:**
- Soft chords spanning two hard neighbors of the same lock are skipped in length
  projection (the lock owns that angle).
- Soft links touching a locked joint are strength-scaled (~0.18) so they cannot
  overpower the fan.
- Angle projection uses partial stiffness (0.28) with multiple passes; locks with
  hard chords among neighbors are further damped or skipped when fully determined.
- Hard length and lock projections stay interleaved (no hard-only block that
  reopens angles).
- After post-contact lock/hard passes, flat ground is reclamped.
- Studio range/physics preview uses the same soft scaling.

**Evidence:** `scripts/smoke-joint-locks.ts` (B/D/F/G/H gates);
`scripts/audit-joint-lock-conflicts.ts` (locked cases no longer FAIL).

**Consequences:** Controllers trained under 4.9.x with joint locks are stale.

**Reversible:** Restore `ANGLE_STIFFNESS = 1`, remove soft scaling / interleave /
floor reclamp; revert physics to 4.9.0.

## D131 — Per-joint angle locks (2026-07-27) — removed by D135

**Decision:** Replace D130 multi-node rigid groups with independent per-joint
angle locks. Selecting a node and choosing Lock Joint freezes the angles between
**all** hard links (bones / telescopes / pistons) that meet at that node only.
Soft-body physics advances `4.8.0` → `4.9.0`.

**Why:** Creators need to pin individual articulations while building normally —
not lock clusters of nodes into plates. Each locked joint is independent.

**Rules:**
- A joint needs ≥2 hard links to lock; soft muscles do not define lock angles.
- Every hard link at the joint is included (not limited to a single pair).
- Rest angles are relative to one reference neighbor so the creature can still
  tumble; only the internal fan at that node is frozen.
- Projection skips grounded/pinned neighbors as the movable set (uses them as
  the reference ray) so sandbox contact stays stable.
- Any number of joints may be locked; Unlock clears locks on the selection.
- Legacy `rigidGroups` on saves are ignored.
- Fingerprint includes `lockedJoints`; pre-4.9.0 controllers are stale when locks
  are present.
- Arena Visualizer and Model Management range preview draw locked joints as
  squared chrome (same as Studio).

**Evidence:** `scripts/smoke-joint-locks.ts`.

**Reversible:** Restore D130 rigid groups; revert physics to 4.8.0.

## D130 — Rigid lock groups (2026-07-27) — superseded by D131

**Status:** Superseded. Multi-node shape-matched plates are replaced by per-joint
angle locks (D131).

**Decision:** Studio can lock 1–N selected nodes into a rigid group that keeps a
fixed relative shape under physics via shape-matching projection. Soft-body
physics advances `4.7.1` → `4.8.0`. Locked nodes use squared chrome only — no
filled face is drawn by default.

**Why:** Bone webs still crumple at angles. Users need solid plates (torso,
armor, frames) that do not distort like skinned sheets or soft bone clusters,
while keeping the same place-and-drag node authoring.

**Rules:**
- Lock is relative rigidity (never world-pin). Unlock restores free relative motion.
- Passive morphology only — no new brain I/O. External soft/hard links may hinge
  on group members; links wholly inside a group are redundant for rigidity.
- Indication is squared locked-node chrome; optional `rigidPlate` fill stays off
  unless explicitly enabled (`visible: true`).
- Caps: ≥1 node per group (soft max 64), max 4 groups. Fingerprint includes
  group membership.
- Controllers trained under 4.7.x are stale when rigid groups are present or
  fingerprints diverge.

**Evidence:** `scripts/smoke-rigid-groups.ts`.

**Reversible:** Remove `rigidGroups` / `rigidPlate`; revert physics to 4.7.1.

## D129 — Walk plant frontier anti-farm (2026-07-27)

**Decision:** Run Right / Run Left credit only monotonic plant progress that is
contemporaneously matched by body-COM travel, and fitness is
`min(credited strides, body displacement toward the goal)`. Soft-body physics
advances `4.7.0` → `4.7.1`.

**Why:** D128 compared each plant to the previous plant X and updated that mark
even on backward plants. Alternating two feet (or chatter) re-credited the same
span forever while the body stood still, producing massive farmed scores with no
forward progress.

**Rules:**
- First gait plant seeds plant and body frontiers (no credit).
- A later rising-edge plant credits `min(plantAdvance, bodyAdvance)` only when
  both clear `WALK_STRIDE_MIN_PROGRESS` past their frontiers; frontiers advance
  by the credited amount only.
- Fitness never exceeds net body travel from spawn in the goal direction.
- Endpoint slide without plant credits still scores 0.

**Evidence:** `scripts/smoke-walk-jump-hop.ts` (oscillation farm → 0; body-capped
fitness; one-time forward plant+body credit).

**Consequences:** Controllers trained under 4.7.0 Run Right/Left are stale.

**Reversible:** Restore last-contact differencing and uncapped stride fitness;
revert physics to 4.7.0.

## D128 — Walk / jump / hop contact definitions (2026-07-27)

**Decision:** Apply strict contact-point semantics to locomotion and jumping
rewards, and add Hop Right / Hop Left / Hop Speed. Soft-body physics advances
`4.6.0` → `4.7.0`.

**Definitions:**
- **Walk:** a plant of one contact point followed by another plant closer to the
  goal direction, repeated. The active gait sequence may use 1 (monoped) through
  4 (quadruped) distinct contact nodes. Run Right/Left score credited plant-stride
  progress only.
- **Jump:** all contact points leave the floor; the jump ends when any point
  touches again. Isolated jumps (grounded longer than `HOP_CHAIN_GROUND_MAX`
  before takeoff) score Hang Time, Jump Height/Right/Left/Speed/Flips/Land, and
  Clear Bar. Hop-chain continuations score 0 on those goals and revoke the prior
  tentative isolated-jump ledger.
- **High jump:** peak clearance of the **lowest anatomical point**
  (`min` over nodes of ground clearance), not COM.
- **Hop:** repeated all-points-off bouts chained by brief landings. Hop Right /
  Hop Left accumulate travel; Hop Speed rewards peak hop-chain speed.

**Evidence:** `scripts/smoke-walk-jump-hop.ts`, updated `smoke-hang-time.ts`
(hop chains → 0), `smoke-goal-semantics.ts` (47 active goals).

**Consequences:** Controllers trained under pre-4.7.0 walk/jump reward
trajectories are stale. Flight bout rules are unchanged.

**Reversible:** Restore endpoint Run Right/Left and COM Jump Height; remove hop
goals; revert physics to 4.6.0.

## D127 — Authorable-rate piston bone (2026-07-27)

**Decision:** Add `linkKind: 'piston'`, a hard variable-length strut identical to
`telescope` except compression and expansion rates are authored per link
(`retractRate` / `extendRate`, px per physics tick, clamped 0.25–500). Soft-body
physics advances `4.5.1` → `4.6.0`. Telescopes keep the global
`max(4px, 25% stroke)` budget unchanged.

**Why:** Telescope stroke rate was a single global constant, so jump vs glide
struts could not be tuned independently without changing all telescopes.

**Rules:**
- Pistons are hard constraints, brain-driven unless a parallel soft muscle slaves
  them, and participate in capsule collision like telescopes.
- Studio exposes a Piston tool, type-cycle slot (bone → telescope → piston →
  muscle), and independent compression/expansion rate sliders.
- Body fingerprint includes piston rates; controllers trained under 4.5.x are
  stale when fingerprints or physics version diverge.
- Soft onto a fixed bone still promotes to `telescope` (default companion).

**Reversible:** Remove `piston` from `MuscleLinkKind` and map existing pistons to
`telescope`; revert physics to 4.5.1.

## D126 — Telescope jump stroke rate + legacy inference (2026-07-27)

**Decision:** Telescope command rate is `max(4px, 25% of stroke)` per physics
tick so crouch/extend can deliver a jump impulse. Soft-body physics advances
`4.5.0` → `4.5.1`. Legacy links with `min ≠ max` and strength ≥ 0.98 (and no
`linkKind`) infer as `telescope` rather than frozen `bone`.

**Why:** The prior 4 px/tick cap made telescopes look static under Jump Height
compared with soft muscles that snap to target. Strength-1.0 telescopes that
lost `linkKind` were also inferred as fixed bones with zero brain outputs.

**Rules:**
- Authored min/max stroke is morphology — it does not evolve across generations.
- Only the neural command of length within that range evolves.
- Explicit `linkKind` still wins over inference.

**Reversible:** Restore 4 px/tick cap and strength≥0.98 → bone inference; revert physics to 4.5.0.

## D125 — Keep compatible models across zone switches (2026-07-27)

**Decision:** Switching Flying / Motor / Walking / Jumping / Free keeps the
currently loaded body when it is allowed in the destination zone. If it is not
allowed, the user must confirm a warning that the model will be unloaded and
replaced by the zone default (or first allowed body). Cancel aborts the switch.

**Why:** Zone tabs previously preferred each zone's default template, so a
compatible body (e.g. muscle walker Walking → Jumping) was discarded without
cause, and incompatible switches gave no warning.

**Rules:**
- Eligibility uses `blueprintAllowedInZone` (same as anatomy menus).
- Confirm before replacing an incompatible loaded body; no silent swap.
- Library entries are not deleted — only the active session load changes.

**Reversible:** Restore default-first template selection on zone change.

## D124 — Independent muscle/telescope length extremes (2026-07-27)

**Decision:** Studio compression and expansion sliders for muscles and telescopes
use independent ranges of 10–1000 px. Neither bound is limited by resting length
or by the other slider's available range. The only cross-rule is
`minLength ≤ maxLength` (dragging past the other bound pushes that bound).
Resting length is display-only and always set to 50% of max expansion.

**Why:** The prior UI capped expansion at 200 px and tied both extremes to the
rest slider, so users could not author long-stroke telescopes/muscles.

**Rules:**
- Fixed bones keep an editable length slider (unchanged).
- Changing min or max refreshes `originalLength = round(maxLength × 0.5)`.
- Constants: `MIN_LINK_LENGTH` / `MAX_LINK_LENGTH` in `types.ts`.

**Reversible:** Restore rest-relative slider caps and editable rest for flexible links.

## D122 — Model Management permanent delete (2026-07-27)

**Decision:** The Models tab is the model management hub. Permanent delete removes
a shelf product or untrained package from every sandbox menu that lists it
(Models hub, Finished Models shelf, Creature Anatomy selector, Studio library,
Arena Championship shelf load). Best Ever ledger entries are retained (D118).

**Why:** Users need one place to retire bodies and products without leftovers
appearing in anatomy menus or championship.

**Rules:**
- Built-in templates are never deleted.
- Shelf delete removes the finished product and matching custom body names.
- Untrained delete removes the creature package and its anatomy menu entry.
- Rename / export are available on the same hub.

**Reversible:** Import JSON / re-freeze products; Best Ever history survives.

## D121 — Model Picker hub tab (2026-07-27)

**Decision:** Add a left-most **Models** tab that lists Shelf (finished products)
and Untrained (saved creature packages), previews the selected body with Range
animation always on, and offers load destinations: continue/start training
(eligible goals), Anatomy Studio, Simulation, and Arena Championship (shelf
only). Simulation remains the default landing tab.

**Why:** Finished Models were buried under Build; users needed one clear place
to inspect bodies, see movement range, and send a model into training or an
editor without hunting through menus.

**Rules:**
- UI navigates and seeds only — no authoritative learning logic in the tab.
- Shelf continue-training still freezes the source product (D119/D120).
- Untrained fresh starts spawn random brains (no cloned shelf genome).
- Zone tabs hide on this hub; destination actions may switch zone when needed.

**Reversible:** Remove the tab; Build → Finished Models and Studio library remain.

## D120 — Shelf goal-picker for continue-training (2026-07-27)

**Decision:** Continue-training is driven from the Finished Models card: pick any
eligible goal scenario on the model, then start a cloned run. Do not require the
user to pre-select the goal in Run.

**Why:** Transfer (e.g. Stay Aloft → Flight Height) failed the “easy to navigate”
test when the Run goal had to be changed first. The shelf is the natural place
to choose the next skill for a frozen product.

**Rules:**
- Goal list is eligibility-filtered for that body (category permitting).
- Auto-switch zone when the current arena cannot host the chosen goal.
- Preserve sequential transfer (D119): clone only, never overwrite shelf.

**Reversible:** Collapse the picker and fall back to “train on current goal”.

## D119 — Sequential continue-training transfer (2026-07-27)

**Decision:** Bring finished models back into evolution by cloning the frozen
brain into a new population under the *currently selected* goal. Never overwrite
the source product; never train one network on a blend of goals.

**Why:** Stay Aloft and Flight Height share body I/O. Transfer is weight fine-
tuning on a related reward, not a new architecture. Multi-goal overload and
in-place overwrite would destroy reconstructable skill products.

**Rules:**
- Source shelf entry remains the Stay Aloft (or prior) artifact.
- New run uses weight mutation only by default (`addNodeRate=0`).
- Freeze saves a *new* product tagged with the new `trainedGoal`.
- Eligibility must pass for body + zone + target goal.

**Reversible:** Remove the Train button; import JSON + Load Snapshot remains.

## D118 — Permanent per-goal Best Ever ledger (2026-07-27)

**Decision:** Store all-time Best Ever scores in a dedicated localStorage map
keyed by goal (`biomech_goal_best_ever_v1`), independent of the Finished Models
shelf and of React session state.

**Why:** Session high-water and shelf-only merge (D115) lost records when the
user changed goal, body, challenge, reset the run, or deleted the champion
product. Best Ever must be a permanent achievement board for each goal.

**Rules:**
- Promote only when fitness strictly exceeds the stored record.
- Never clear or lower a goal’s record on UI / population / goal switches.
- Seed from existing shelf products on boot so prior champions are not lost.
- Display resolves max(ledger, session, shelf); ledger attribution wins on ties.

**Reversible:** Remove the storage key and fall back to D115 shelf+session merge.
