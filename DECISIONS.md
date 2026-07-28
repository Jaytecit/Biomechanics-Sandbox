# DECISIONS.md — Soft-body Sandbox

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
