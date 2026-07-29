# Biomechanics Sandbox

An interactive **2D soft-body biomechanics sandbox** for designing creature anatomies and evolving locomotion with **NEAT** neural networks. Build skeletons, dress them as biological creatures, train them on dozens of goals (walk, jump, fly, motor drive, climb, and more), and race finished models in **Arena Championship**.

Physics version: **4.21.0** · Active trainable goals: **49**

---

## What you can do

1. **Design** — Studio editor for nodes, bones, soft muscles, telescopes, pistons, solid segments, feet, wheels, aero surfaces (wings / paraglider / parachute), and 90° hinge stops.
2. **Estimate** — Capability diagnostics before training (qualified estimates, not promises).
3. **Train** — Neuroevolution (NEAT) against zone-scoped goals with live telemetry, gait fingerprints, and network visualization.
4. **Save & share** — Versioned creature packages, finished model shelf, continue-training transfer, JSON import/export, Best Ever ledger.
5. **Environments** — Author custom side-on courses (boxes, ramps, stairs, pits, ice, terrain, checkpoints) with deterministic geometry.
6. **Compete** — Freeze models and run heats in [Arena Championship](./Arena%20Championship/).

Appearance is **renderer-only**: skin and visuals never affect physics, actions, fitness, or learning.

---

## Zones

| Zone | Focus |
|------|--------|
| **Flying** | Wings / paragliders, flight goals, wind |
| **Motor** | Wheeled drive, ramps, ice, rough terrain |
| **Walking** | Biped / multiped gait, balance, climb |
| **Jumping** | Vertical / horizontal jumps, hang time, landings |
| **Free** | Unrestricted equipment and goal mix |

Studio and the creature library stay open; **eligibility** is enforced when entering a restricted goal, challenge, or event.

---

## Goals (examples)

- **Locomotion** — Run / Shuffle left & right, Speed, Sprint Finish, Stay Upright, Rough Terrain Traverse  
- **Jump / hop** — High Jump, Long Jump, Clear Bar, Hang Time, Jump & Land, Hop  
- **Flight** — Stay Aloft, Flight Height, Glide Range, Aerial Crossing, Para Ramp Glide, Flight Land  
- **Motor** — Drive, Ramp, Ice, Technical courses  
- **Skill / object** — Obstacle Climb, Balance Beam, Carry Ball, Push Box, Hazard Dash, Hit Target  

Full catalog and scoring notes live in `src/goalCatalog.ts`, `GOAL_SEMANTICS.md`, and `COMPLETED.md`.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| UI | React 19, Vite 6, Tailwind CSS 4, Motion |
| Physics | Custom 2D point-spring / Verlet soft-body (`src/physics.ts`) |
| Learning | NEAT-style genomes (`src/neat.ts`) |
| Language | TypeScript |
| Optional AI | Google Gemini (`@google/genai`) via `GEMINI_API_KEY` |

---

## Quick start

**Prerequisites:** [Node.js](https://nodejs.org/) (LTS recommended)

```bash
npm install
npm run dev
```

Then open:

| App | URL |
|-----|-----|
| Sandbox | http://localhost:3000/ |
| Arena Championship | http://localhost:3000/Arena%20Championship/ |

On Windows you can also double-click `start-sandbox.bat` (installs deps if needed and opens the browser).

### Environment (optional)

Copy `.env.example` to `.env.local` if you use Gemini features:

```bash
cp .env.example .env.local
```

Set `GEMINI_API_KEY` (and optionally `APP_URL`). Core physics, training, and sandbox play do not require an API key.

### Build & typecheck

```bash
npm run lint    # tsc --noEmit
npm run build   # production bundle (sandbox + arena)
npm run preview # preview the production build
```

---

## Arena Championship

Standalone showmanship app for **finished** models (shared `localStorage` with the sandbox):

1. Evolve a creature in the Sandbox  
2. **Freeze & Save** a finished model  
3. Open Arena Championship → pick an event → select roster → **Start heat**

Details: [`Arena Championship/README.md`](./Arena%20Championship/README.md)

---

## Repository layout

```
├── src/                    # Sandbox app (physics, NEAT, UI, zones, goals)
│   ├── components/         # Studio, Visualizer, Models, Environment Studio, …
│   ├── physics.ts          # Soft-body simulation
│   ├── neat.ts             # Neuroevolution
│   ├── goalCatalog.ts      # Goal definitions
│   └── zones.ts            # Arena zones & eligibility
├── Arena Championship/     # Events, heats, podiums, leaderboards
├── scripts/                # Smoke tests, proofs, calibration harnesses
├── PROJECT_STATE.md        # Short status index
├── COMPLETED.md            # Shipped product / physics / UI summary
├── OUTSTANDING.md          # Next gates and deferred work
└── DECISIONS.md            # Decision log (D055–D144+)
```

---

## Testing & regressions

Phase 21 smoke suite:

```bash
npm run test:phase21
```

Useful targeted checks after physics or goal changes:

```bash
npx tsx scripts/smoke-physics-invariants.ts
npx tsx scripts/smoke-aero.ts
npx tsx scripts/smoke-walk-jump-hop.ts
npx tsx scripts/smoke-solid-segments.ts
npx tsx scripts/prove-flight-learn.ts
```

Calibration (writes result JSON when passed `--write`):

```bash
npm run calibrate:r4
npm run calibrate:g1
```

---

## Project status docs

| File | Role |
|------|------|
| [`PROJECT_STATE.md`](./PROJECT_STATE.md) | Living tip / index |
| [`COMPLETED.md`](./COMPLETED.md) | What has shipped |
| [`OUTSTANDING.md`](./OUTSTANDING.md) | Next required work (currently C1 object-relative sensor) |
| [`DECISIONS.md`](./DECISIONS.md) | Full decision history |
| [`SANDBOX_DEVELOPMENT_PLAN.md`](./SANDBOX_DEVELOPMENT_PLAN.md) | Phase 21 plan (historical) |

Creative-track sandbox results are for exploration and showmanship — they are **not** verified observatory benchmarks.

---

## License

MIT © 2026 Jay Martooni — see [`LICENSE`](./LICENSE).
