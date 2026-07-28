# Biological Sandbox Development and Fix Plan

**Status:** completed (D081)
**Planned:** 2026-07-25  
**Scope:** `Build an Agent` soft-body sandbox and Arena Championship creative track  
**Authority:** D080 in the repository `DECISIONS.md`

**Completion:** 2026-07-25. All Phase 21A-G exit gates shipped; D081 records
implementation evidence and continuing authority boundaries.

## Intended outcome

The sandbox should let a user:

1. Build a mechanically honest skeleton and dress it as a biological creature.
2. See useful, clearly qualified capability estimates before training.
3. Trust ramps, stairs, gaps, solids, and goal scoring in a side-on 2D world.
4. Build, save, load, and share custom 2D environments.
5. Observe learning with the important metrics always visible.
6. Save or load any creature without Studio category restrictions, while challenge
   entry applies explicit equipment rules.
7. Experience a visually cohesive final product without visual code influencing
   physics, actions, fitness, or learning.

This is a creative-track program. It does not change the authority of the main
observatory learning contract and must not turn sandbox results into verified
benchmark claims.

## Non-negotiable contracts

- Appearance is renderer-only. It is excluded from physics and controller
  fingerprints.
- Capability estimates are diagnostics, not promises and not proof of learning.
- Studio and the creature library are unrestricted. Eligibility is checked only
  when entering a restricted goal, challenge, event, or environment.
- A controller is loaded only when its body fingerprint, physics version, and
  input/output dimensions match. Incompatible controllers remain visible as stale.
- Environment geometry is serializable and deterministic. Rendering and collision
  use the same canonical geometry.
- Physics, reward, goal semantics, training algorithm, and morphology are not
  changed together.
- Existing failed seeds, stale controllers, and incompatible saves are never hidden.

## Baseline findings

The current application already has a strong foundation:

- A canvas Studio with editable nodes, bones, muscles, wheels, and aero surfaces.
- A large side-on visualizer with live telemetry.
- Serializable obstacle primitives for boxes, ramps, stairs, pits, ice, bars,
  loops, targets, terrain, finishes, and checkpoints.
- A goal catalog, zone rules, custom scoring rules, saved anatomies, finished
  models, and JSON model import/export.
- Swept circle-vs-box collision and special ramp/stair contact code.

The audit also found the main architectural issues that the plan must resolve:

- Creature saves are unversioned, name-keyed `localStorage` records.
- Studio imports, tools, saves, and model loads are filtered by the active zone.
- The 280 px menu stacks controls, model management, discovery, charts, brain
  views, and gait views into one long drawer.
- Collision is primarily node-based. Rigid rendered links and future skin have no
  collision hull.
- Ramp collision is a height clamp rather than a swept sloped-segment contact.
- Circle-vs-box resolution has an ambiguous zero-distance case when a node is
  already inside a solid.
- The obstacle-climb course uses unseeded `Math.random()`, so it cannot be exactly
  reconstructed.
- Some goal names and layouts need a 2D semantics review. In particular, a
  side-view motor "slalom" cannot honestly represent weaving through depth.

## Delivery order and gates

### Phase 21A - Physics, object, and goal truth audit

This phase is first because a custom environment editor would otherwise multiply
unverified collision and scoring behavior.

#### Work

- Create a complete object/goal matrix. For every goal record:
  - geometry used;
  - valid creature/equipment requirements;
  - success and failure conditions;
  - exploitable scoring shortcuts;
  - whether the action makes sense in strict side-on 2D.
- Classify each goal as **keep**, **reshape**, **rename**, or **remove**.
- Replace the motor slalom with an honest side-view technical course; do not retain
  a depth-weaving fiction.
- Seed all procedural course generation and include the seed in environment/run
  metadata.
- Introduce canonical collision shapes shared by arena generation, rendering, the
  editor, and tests.
- Fix circle-vs-solid interior resolution.
- Replace ramp height clamping with swept circle-vs-ramp surface and end-cap
  collision.
- Harden stair tread/riser transitions, pit lips, thin landing pads, and
  ground-to-object seams.
- Add capsule collision for **rigid bones only**. Flexible muscles remain
  non-solid links. Cosmetic skin remains non-colliding.
- Bump the soft-body physics version when bone capsules ship. Existing controllers
  remain saved but are marked stale under the new version.
- Make goal completion depend on the relevant physical event, not only COM
  crossing. For example, landing goals require supported contact and gap goals
  distinguish clearing from falling through after a single COM sample.

#### Verification

- Add `scripts/smoke-collisions.ts`:
  - slow and maximum-speed contacts;
  - approach from every relevant side;
  - start-inside recovery;
  - ramp surface, underside, and lip;
  - stair ascent/descent and risers;
  - pit entry/exit;
  - thin pads;
  - rigid-bone capsule contacts;
  - finite-state and no-tunnelling assertions.
- Add `scripts/smoke-goal-semantics.ts` covering every catalog goal.
- Re-run all current aero, hoop, zone, jump, launch/land, and landspeed proofs after
  any physics change.
- Run real short evolution smokes on representative walking, motor, jumping, and
  flying bodies. Preserve every seed result.

#### Exit gate

No known node or rigid-bone tunnelling at supported speeds, no non-deterministic
authored course, and every shipped goal has a written 2D rationale plus a passing
semantic smoke.

### Phase 21B - Versioned creature library and eligibility

This phase provides the storage foundation for appearance, live snapshots, and
custom environments.

#### Work

- Replace name-keyed anatomy records with a versioned repository abstraction.
- Introduce a `CreaturePackage` containing:
  - schema version, stable id, revision, timestamps, and display name;
  - mechanical blueprint;
  - optional appearance rig;
  - zero or more controller snapshots;
  - body fingerprint, physics version, and controller I/O dimensions;
  - source metadata such as Studio draft, live selected creature, generation
    leader, or finished champion.
- Migrate existing `biomech_saved_creatures_v1` entries without deleting them.
- Add autosaved Studio draft recovery.
- Add **Save new**, **Save version**, **Duplicate**, **Rename**, **Delete**, and
  **Export package**.
- Allow saving the selected live creature or current leader without pausing
  evolution.
- Show all creatures in the Studio/library regardless of current zone.
- Allow all equipment tools in Studio regardless of the navigation entry point.
- Replace zone rejection with `evaluateEligibility(creature, environment, goal)`.
  A restricted launch shows precise reasons and allowed destinations.
- Loading a compatible controller preserves it. Loading an incompatible controller
  keeps the package visible and offers a fresh correctly sized brain.

#### Verification

- Add migration, round-trip, duplicate-name, stale-controller, and quota/error
  tests.
- Add a zone matrix proving Studio/library access is unrestricted while challenge
  launch restrictions still hold.
- Import every existing built-in and representative exported model.

#### Exit gate

Any creature can be opened, edited, saved, exported, and recovered from any Studio
entry point. Only a restricted activity launch can reject it.

### Phase 21C - Biological appearance and 2D skin rig

#### Work

- Add an optional `appearance` block to `CreaturePackage`; do not add it to the
  mechanical blueprint.
- Provide two complementary authoring modes:
  - **Parts:** eyes, head, torso, limb capsules, fins, ears, tails, patches, and
    other vector primitives anchored to a node or link.
  - **Skin drawing:** draw a closed vector silhouette or coloured strokes over the
    reference pose.
- Rig skin control points with 2D linear blend skinning. Each point stores
  reference-pose local coordinates and normalized weights for nearby links. The
  runtime renderer transforms those points from the moving skeleton.
- Support behind-skeleton and in-front-of-skeleton layers, z-order, fill, outline,
  opacity, mirroring, and hide/show skeleton.
- Keep a visible "collision skeleton" toggle so users can distinguish aesthetic
  volume from the physical hull.
- Store vector artwork in the creature package. Defer raster image imports until
  the vector rig is stable; raster assets would use IndexedDB rather than inflate
  `localStorage`.
- Render the same rig in Studio, sandbox replay, saved-model previews, and Arena
  Championship.

#### Verification

- Add `scripts/smoke-appearance-rig.ts` for stable anchors, deformation, save/load,
  and malformed rig recovery.
- Run identical simulations with appearance on and off and assert identical node
  states, actions, fitness, and controller fingerprints.
- Browser QA at narrow, desktop, fullscreen, and high-DPI sizes.

#### Exit gate

A user can make a recognizable biological creature, animate it through the
skeleton, save it, reload it, and compete with it without any physics or learning
difference.

### Phase 21D - Pre-training Capability Observatory

The panel must answer "what is this body equipped and plausibly able to attempt?"
without pretending it has already learned those skills.

#### Work

- Show exact structural statistics:
  - total mass, dimensions, centre of mass, node/link/actuator counts;
  - contraction range, aggregate muscle work proxy, power-to-mass proxy;
  - contact count, wheel count/power, grip range;
  - wing/glider/chute area, wing loading proxy, and control-surface count;
  - symmetry and support-span diagnostics.
- Map the body to every goal family with one of:
  - **equipped**;
  - **plausible but unproven**;
  - **missing prerequisite**;
  - **not applicable**.
- Add deterministic, bounded, non-learning probe trials in a worker:
  - settle/stability;
  - contraction and alternating-phase movement;
  - motor forward/reverse pulses;
  - jump impulse/clearance exploration;
  - wing stroke and glide response;
  - braking/landing response.
- Report observed probe envelopes for ground speed, jump clearance, airtime,
  climb/sink response, glide ratio, stability, and turning/rotation where relevant.
- Label all probe results **Untrained potential probe**, include confidence and the
  probe seed, and explain why a learned policy may perform better or worse.
- Debounce recalculation after body edits and keep it off the render thread.
- Never use capability probe output as fitness, a learning verdict, or a
  competition score.

#### Verification

- Add deterministic repeatability tests and monotonic sanity pairs such as:
  stronger otherwise-identical motors should not reduce the power proxy; removing
  all aero must remove flight readiness; zero flexible actuators must remove
  muscle-jump readiness.
- Test malformed, extreme, asymmetric, and very heavy bodies.
- Confirm the UI remains responsive during recalculation.

#### Exit gate

Every Studio edit produces an honest, explainable capability report with explicit
unknowns and no learning claim.

### Phase 21E - User-generated environments and challenges

#### Work

- Introduce a versioned `EnvironmentPackage` with:
  - stable id, revision, name, author notes, deterministic seed;
  - spawn point, camera start, ground/bounds, and background theme;
  - placed collision objects and world objects;
  - optional goal binding and validated custom scoring rules;
  - optional equipment eligibility rules;
  - environment fingerprint and schema version.
- Build an Environment Studio with grid/snap, select, drag, resize, duplicate,
  delete, undo/redo, zoom, and property inspection.
- Initial palette:
  - solid block/pad;
  - ramp;
  - stair set;
  - pit/gap;
  - ice/surface zone;
  - balance beam;
  - bar/hurdle;
  - finish/checkpoint/target;
  - ball, push box, and hoop;
  - deterministic terrain segment.
- Validate impossible or ambiguous layouts:
  - spawn inside solids;
  - overlapping pit and solid ground;
  - inverted or zero-size objects;
  - unreachable required markers;
  - duplicate checkpoint order;
  - unsupported 3D/depth semantics.
- Provide **Test environment** with the current creature, **Save draft**,
  **Save environment**, **Duplicate**, **Export**, and **Import**.
- Let unrestricted environments accept any creature. Authored challenges may set
  explicit equipment restrictions, evaluated at launch.
- Keep layout and goal separate so the same environment can host different valid
  goals without copying geometry.

#### Verification

- Add `scripts/smoke-environment-roundtrip.ts` for exact save/load and fingerprint
  stability.
- Run the Phase 21A collision suite against editor-authored instances of every
  object.
- Add validator tests for every rejected layout.
- Run short, real sandbox trials in at least one walking, motor, jumping, and
  flying user environment.

#### Exit gate

A user can build, validate, test, save, reload, share, and run a custom 2D
environment with no mocked objects and no geometry difference between editor,
renderer, and physics.

### Phase 21F - Observation-first navigation and metric redesign

#### Work

- Replace the twelve always-visible telemetry cards with a compact pinned HUD:
  - run state and generation;
  - active goal metric;
  - current selected/leader value;
  - all-time best for the current run;
  - two to four goal-specific physical metrics;
  - warnings such as stale controller, ineligible body, or invalid environment.
- Move mutation rate and population out of the observation HUD and into setup.
- Replace the long single drawer with a wider tabbed inspector:
  - **Run:** play/pause, speed, generation, reset, evolve;
  - **Creature:** library, snapshots, save/load, eligibility;
  - **Challenge:** goal, environment, rules, modifiers;
  - **Build:** Creature Studio and Environment Studio entry points;
  - **Analyse:** capability report, evolution chart, brain, and gait;
  - **Settings:** mutation/search settings and visual/debug toggles.
- Keep the arena large in normal and fullscreen modes.
- Preserve quick access to play/pause, speed, reset, active goal, and save current
  creature without opening a deep menu.
- Use goal-specific terminology and units consistently.
- Add keyboard focus, accessible labels, reduced-motion behavior, and responsive
  layouts.

#### Verification

- Browser QA for common observation, building, saving, loading, challenge launch,
  and environment editing flows.
- Verify every visible control performs its advertised action.
- Check no important metric is hidden behind the inspector while observing.
- Check narrow-window, 1080p fullscreen, and high-DPI rendering.

#### Exit gate

The arena and its active evidence are visible at a glance, while all setup and
analysis tools have one predictable home.

### Phase 21G - Final visual polish

#### Work

- Add cohesive environment themes with renderer-only sky, horizon, terrain
  materials, vegetation/props, particles, and restrained parallax.
- Give ramps, stairs, pits, ice, pads, goals, and hazards distinct readable
  silhouettes that match their collision geometry.
- Improve creature shadows, contact cues, selection, success/failure feedback, and
  camera transitions.
- Add theme previews to Environment Studio.
- Respect performance budgets and reduced-motion preferences.

#### Verification

- Pixel/visual regression captures for every theme and major object.
- Physics invariance run with backgrounds and effects enabled/disabled.
- Profile worst-case population plus environment and skin complexity.

#### Exit gate

The sandbox looks finished and readable without changing any physical trajectory,
action, score, or learning outcome.

## Requirement coverage

| User request | Primary phase | Supporting phases |
|---|---|---|
| Biological-looking creatures and animated drawings | 21C | 21B, 21G |
| Pre-training ability statistics | 21D | 21A, 21F |
| Ramps/gaps/stairs/object and goal audit | 21A | 21E |
| User-generated environments | 21E | 21A, 21B |
| Menu, metrics, and tools redesign | 21F | 21D |
| Easy unrestricted Studio save/load with challenge-only rules | 21B | 21E, 21F |
| Final aesthetic polish | 21G | 21C, 21E |

## First implementation slice

The next coding session starts with Phase 21A only:

1. Add the collision and goal-semantic harnesses.
2. Make procedural courses deterministic.
3. Fix solid interior, ramp, stair, pit-lip, and thin-pad contacts.
4. Decide every current goal's keep/reshape/rename/remove status in a checked-in
   matrix.
5. Re-run the complete existing regression suite and representative real smokes.
6. Update `DECISIONS.md` and both project-state files with evidence before moving
   to the versioned library.

No appearance, capability estimator, environment editor, or menu rewrite begins
until that exit gate passes.

## Baseline verified during planning

From `Build an Agent/` on 2026-07-25:

```text
npx.cmd tsc --noEmit
npm.cmd run build
npx.cmd tsx scripts/smoke-zones.ts
npx.cmd tsx scripts/smoke-hoop.ts
npx.cmd tsx scripts/smoke-jump-land.ts
npx.cmd tsx scripts/smoke-launch-land.ts
npx.cmd tsx scripts/smoke-landspeed.ts
```

All passed. This proves the pre-session baseline is buildable and the existing
targeted smoke checks are green; it does not prove the untested collision cases
listed in Phase 21A.
