# Solemn Sandbox

**A serious environment to carry out silly experiments.**

Phase 1: a clean rigid-body creature sandbox inspired by
[Evolution by Keiwan](https://keiwando.com/evolution/).

This is **not** a port of the soft-body sandbox in the parent repo, and **not** a
copy of Evolution’s source (that project is not redistributable OSS). It
reimplements the documented feel:

- **Joints** — massy contact points (circles)
- **Bones** — rigid capsules hinged to joints
- **Muscles** — always-on springs toward rest length, plus active contract / expand forces along the bone-to-bone axis
- **Control** — per-muscle `[-1, 1]` (sign = expand/contract, magnitude = force)

**Phase 2** adds a fixed MLP brain + weight evolution for a run (distance) task.
See [`PHASE2_NEURAL_NETWORK.md`](./PHASE2_NEURAL_NETWORK.md).

## Feature ports (from parent sandbox)

Product features from the parent Biomechanics Sandbox may be rewritten into Fresh
Start **without** importing parent physics, notes, or NEAT.

1. Mark what you want in [`FEATURE_PORT_CHECKLIST.md`](./FEATURE_PORT_CHECKLIST.md) (unmarked items are kept for later)
2. Refresh [`FEATURE_PORT_BACKLOG.md`](./FEATURE_PORT_BACKLOG.md)
3. Follow the physics firewall: [`docs/PHYSICS_FIREWALL.md`](./docs/PHYSICS_FIREWALL.md)

Immediate ports already landed include zones, googly eyes, Kenney body parts, creature library, disco mode, and jump/climb/motor/flight tasks (Rapier-native).

## Run

```bat
start.bat
```

Or:

```bash
npm install
npm run dev
```

Opens at **http://localhost:3001/** (port 3001 so it does not clash with the old sandbox on 3000).

## Use

1. Load a **preset** (Triangle Walker / Simple Hopper / Floppy Chain), or build with tools:
   - **joint** — left-click empty to place; drag a joint to move (bones/muscles resize)
   - **select** — drag joints to reposition
   - **bone** — left-drag joint→joint to draw
   - **muscle** — left-drag bone→bone to draw
   - **right-click** — delete joint / bone / muscle under the cursor
   - **Ctrl+Z** (or Undo button) — undo last edit
2. **Drop / Simulate** — gravity + springs.
3. Drive muscles with **Idle**, **Manual** sliders, or **Oscillate**.
4. In simulate mode: **Evolve** runs a live cohort (ghosted peers, camera focus ← →);
   **Play best** replays the elite genome alone.

**Lesson from Evolution:** brace with triangles. Serial chains pancake under gravity.

## Feel / evolve gates

```bash
npm run smoke:firewall
npm run smoke:feel
npm run smoke:evolve
npm run smoke:all
```

`smoke:firewall` checks fixed-dt / muscle third-law / determinism / no parent physics imports / flags-off.  
`smoke:feel` checks braced settle, hopper contract/expand, and under-braced collapse.  
`smoke:evolve` checks that run-task fitness improves vs generation-0 on ≥2/3 seeds.  
`smoke:all` runs firewall + feel + evolve (required after physics-adjacent ports).

## Tunables

All physics knobs live in [`src/physics/constants.ts`](src/physics/constants.ts)
(gravity, spring, damper, max muscle force, damping, friction).

## Stack

Vite + React + TypeScript + Rapier2D (`@dimforge/rapier2d-compat`).
