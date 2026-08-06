# Fresh Start — Feature Port Checklist

**Source of truth for what to port from the parent Biomechanics Sandbox.**

Implementation is Fresh Start–native (rewrite). Parent physics code, tuning, notes, and history must **never** be copied or used as physics guidance.

## How to mark


| Mark    | Meaning                                 |
| ------- | --------------------------------------- |
| `- [x]` | Want / port (or already implemented)    |
| `- [ ]` | Keep for later — stays on the checklist |
| `- [O]` | Ignore forever — removed on prune       |


1. Edit marks as above.
2. Optionally note constraints under an item.
3. Tell the agent to refresh `[FEATURE_PORT_BACKLOG.md](./FEATURE_PORT_BACKLOG.md)` and/or **prune** `[O]` **items**.
4. Only `[x]` items enter the implementation backlog.

**Decisions locked in**

- Physics: Rapier-native extensions when needed; never port parent soft-body solver/tuning.
- Learning: keep Fresh Start MLP + GA; do **not** port parent NEAT.
- Section B layout: defer UI chrome until the feature that needs it lands (see B note).

**Updated:** 2026-08-06 — D16 training telemetry log; D9–D15 training experimentation (dock IA, recipes, warm starts, schedules, priorities, new experiences, shareable packs).

### Clarifications resolved


| ID                               | Question               | Answer                                                                                                                                 | Mark                         |
| -------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **A8** Gait fingerprints         | What is this?          | Parent debug viz: a scrolling “barcode” of which contacts were planted over time (gait timeline). Not required for training.           | Removed (`[O]`)              |
| **C1.1** Mark feet               | Only if goals benefit? | Yes — Fresh Start run/jump already treat all joints as feet; explicit foot marks improve lift/landing scoring.                         | `[x]`                        |
| **D3** Progressive limits        | What is this?          | After a clear, auto-raise course difficulty (taller tower, wider gap, rougher terrain). Useful later for climb / E6.8.                 | `[ ]` defer                  |
| **D6** Multi-brain phase handoff | What is this?          | Sequence brains by stage (e.g. run-up → deploy → glide). **Not needed** — G10 uses structural aero parts + single MLP/muscles.         | `[ ]` defer                  |
| **D7** Expanded observations     | Needed?                | Object sensors skipped (world objects omitted). Keep **contact / terrain-relative** packs for climb & rough terrain.                   | `[x]` (contact/terrain only) |
| **E6 expand**                    | Which parent goals?    | Port all realistic skill goals that fit Rapier + existing world features. Skip object/sports/ice/gimmick/retired (see E6 ignore list). | `[x]`                        |
| **E5 count**                     | How many secrets?      | Target **100** discoverable secrets (parent had 90; FS currently 10).                                                                  | `[x]`                        |
| **Brand**                        | Rename / tagline?      | **Solemn Sandbox** — *A serious environment to carry out silly experiments.*                                                           | `[x]` B19                    |


---



## A. Rendering and cosmetics

- [x] **A1.2 / A4 Eye / googly-eye primitives** — done
- [x] **A2 Sprite body-part library** — done (animal / modular / monster + tint/mirror/pivot + preload)
- [x] **A5 Visual pose interpolation** (render lerp between fixed physics ticks) — *only if relevant: yes, keeps 60 Hz feel when frames hitch*
- [x] **A6 Sim axis rulers** (height / horizontal overlays)
- [x] **A7 Network visualizer** (MLP graph; Fresh Start network, not NEAT)



## B. UI / UX shell

> **Note:** Layout is designed **with** each feature. **B1–B3** shipped (zone tabs + hybrid shell). Remaining wanted B items are UI polish on top of already-shipped owners. **B17** a11y deferred. **B15** dumped (arena pruned).

- [x] **B1 Zone tabs** — done
- [x] **B2 Collapsible section pattern** — done (hybrid shell)
- [x] **B3 Sandbox menu shell** — done (left exclusive tabs + sim bottom dock)
- [x] **B4 Goal info card** — with E1/E5
- [x] **B5 Trainable goal picker** — with E1
- [x] **B6 Stats panel**
- [x] **B7 Control panel** — with D1 (partial exists; deepen)
- [x] **B8 Capability panel** — Fresh Start morphology/traits summary (not parent capability physics)
- [x] **B9 Performance diagnostics panel**
- [x] **B10 Rewards breakdown panel**
- [x] **B11 Discovery / secret trophies UI** — with E5 (light exists; deepen)
- [x] **B12 Model picker / models hub** — with D5
- [x] **B13 Creature library panel** — F1 exists; richer panel
- [x] **B14 Custom environments panel** — with F4 / C2 (scaffold exists; deepen)
- [x] **B16 Immersive fullscreen mode**
- [ ] **B17 Reduced-motion / a11y polish** — defer for now
- [x] **B18 Brand theme tokens / custom fonts**
- [x] **B19 Solemn Sandbox branding** — **done** (title, header, README → Solemn Sandbox + locked tagline)
- [x] **B20 Head-to-Head tab** — **done** (H2H shell tab → I6 gauntlet)



## C. Editor / tools

- [ ] **C1 Studio-depth creature editor upgrades**
  - [x] **C1.1 Mark feet** — benefits run/jump scoring
  - [x] **C1.2 Drive groups** (shared brain channel across muscles)
  - [x] **C1.8 Aero surface authoring** (wing / glider / parachute) — deepen with G10 part types
  - [x] **C1.9 Wheel / motor-wheel authoring** — needs G6 (minimal torque exists; editor next)
  - [x] **C1.11 Multi-select + subgraph transforms** — marquee / Shift-click · Copy · Mirror-duplicate · scale/rotate handles
- [ ] **C2 Environment Studio** (partial vs parent)
  - [x] **C2.1 Obstacle authoring** (box / ramp / stair / pit / loop) — partial set only
  - [x] **C2.3 Terrain heightfield authoring**
  - [x] **C2.4 Tower / launch structure**
  - [x] **C2.7 Theme selection**
  - [x] **C2.8 Undo/redo + export/import**
  - [x] **C2.9 Score regions** (penalty time-in-zone / reward touch-once; score-only AABBs)
  - [x] **C2.10 Start / finish / checkpoint markers** — **done** (score-only AABBs; Sprint Finish; ADR + smoke)
- [x] **C5 JSON import/export** (creatures / models / environments with validation)



## D. Learning product (MLP/GA stays; no NEAT port)

- [x] **D1 Richer training controls UI** (speed presets, observe vs train speed)
- [x] **D3 Progressive limits / escalation** — defer; revisit with climb / E6.8
- [x] **D4 Best Ever ledger** (per-goal all-time best + recipe fingerprint)
- [x] **D5 Continue-training / transfer into saved models**

- [O] **D6 Multi-brain phase handoff** — defer; not required for G10 structural aero parts

- [x] **D7 Expanded observation packs** — contact / terrain only (no object sensors)
- [x] **D8 Additional trainable tasks** — jump/climb/motor/flight/rough done
- [x] **D9 Train dock IA + plain labels** — Watch & speed · Training setup · Progress; side panel How to train / Saved brains (see `docs/TRAINING_EXPERIMENTATION_PLAN.md`)
- [x] **D10 Population / batch / mutation recipes** — How many try / watch · Mutation style · recipe chips (Balanced · Quick look · Serious search · Fine tune · Wild ideas)
- [x] **D11 Start-from + selection Advanced** — Fresh / best of run / saved brain · Keep the champions · Who gets to breed · Rounds limit · Run #
- [x] **D12 Annealing / adaptive try length / crossover toggles** — Settle down · Short tries first · Stop after fall · Mix two parents
- [x] **D13 Goal priorities + stage trainer** — What matters more sliders · Train in stages checklist · **course stages** (Gauntlet spawn/finish windows + start-line race timer)
- [x] **D14 New experiences pack** — Copy my demo · Practice with messy bodies · Race your record · Mix goals (flag-gated slices)
- [x] **D15 Shareable training recipes / experiment packs** — Named knob sets + body/env/goal/recipe/brain bundle (extend C5)
- [x] **D16 Training telemetry log** — Train-dock toggle; capture gen-champion morphology + metrics + stall contact (Rapier foot↔obstacle: ramp angle/height/slip) + failure/reward insights over a 50-gen window; JSON download
- [x] **D17 Soft morphology evolution** — Messy bodies jitter + morph genes (mass/leg length/aero/wheels, fixed topology); per-member spawn; telemetry + saved morph snapshot; flag `morphEvolve`



## E. Goals / challenges / zones

- [x] **E1 Goal catalog framework**
- [x] **E2 Zone framework** — *eligibility gating not required for any zone*
- [x] **E5 Secret/hidden goal system** — **done** at **100** discoverable secrets
  - [x] E5.1 Secret goal definitions + flavor text — **100** across locomotion / jump / flight / climb / motor / precision / meta
  - [x] E5.2 Eligibility gating by morphology/traits
  - [x] E5.3 Evaluation hooks on Fresh Start state
  - [x] E5.4 Discovery ledger + confetti reveal overlay
  - [x] E5.5 Trophy cabinet scaled for 100 (category filters / progress)
- [x] **E6 Goal families** (Rapier-native formulas) — core expansion shipped; further parent mirrors optional deepen
  - [x] E6.1 Locomotion — run · **Max Speed** · **Sprint Finish** (C2.10) · **Stay Tall** · rough
  - [x] E6.2 Jump — jump height · **Hang Time** · **Long Jump** (Clear the Bar / flips / hops = later deepen)
  - [x] E6.3 Climb — step course (stair/obstacles/beam/park = later deepen)
  - [x] E6.5 Motor / wheeled — minimal drive (ramp/gap/hurdles/technical = later deepen via markers)
  - [x] E6.6 Flight / glide / para — minimal sustain (specialist variants = later deepen)
  - [x] E6.8 Rough terrain — done



## F. Persistence / library

- [x] **F1 Creature packages repository** — done
- [x] **F3 Default / bundled models library** — done
- [x] **F4 Environments repository**



## G. World / materials / interactions (Rapier)

- [x] **G1 Static obstacle set**
- [x] **G3 Procedural / authored terrain heightfield**
- [x] **G6 Wheels / motor wheels** — minimal done; deepen with C1.9
- [x] **G9 Aero-like forces** — minimal done; deepen with C1.8 / G10
- [x] **G10 Structural aero parts** — Wing (paired, flap) / Glider (rigid pitch sail) / Parachute (jointed inflation drag); single brain (done)



## H. Audio / effects

- [x] **H1 Web Audio analysis** — done
- [x] **H2 Disco mode** — **done** (band → muscle / drive-group reactivity + sliders)
- [x] **H3 Bundled disco dancer preset(s)** — done
- [x] **H4 Confetti / reveal effects for discoveries** — with E5.4
- [x] **H5 Multi-dancer disco** — **done** (up to 6 slots)
- [x] **H6 Dance imitation / freestyle brain** — Record disco teacher drives → MSE/SGD MLP fit → music-conditioned freestyle (solo)
- [x] **H7 Dance curriculum** — Local playlist, offline waveform analysis, multi-track imitation (warm-start), Disco-local refine (upright + beat sync + energy), portable dance brain reload (Disco only; Free evolve unchanged)
- [x] **H8 Disco setup presets** — Named save/load of full Disco stage (tuning, routing, puppet, viz, slots, optional dance brain); audio files not embedded



## I. Competition (focused — not full Arena Championship)

- [x] **I6 Head-to-Head gauntlet** — **done** (two saved models, timed heat; not full Arena)



## J. Dev tooling

- [x] **J1 Broader headless smoke suite** — done (`smoke:tasks`); extend as features land

---



## Brand (locked)


| Surface          | Copy                                                  |
| ---------------- | ----------------------------------------------------- |
| **Product name** | Solemn Sandbox                                        |
| **Header**       | Solemn Sandbox                                        |
| **Tagline**      | A serious environment to carry out silly experiments. |


---



## Pruned (ignored — removed from active list)

A1.1/A1.3–A1.6 primitives & skinning · A3 biological presets · A8 gait fingerprints · A9 range preview · A10 skeleton/cosmetics modes · **B15 arena modifiers** · C1.3–C1.7/C1.10 · C2.2 ice · C2.5 world objects · C2.6 spawn/camera/bounds · C3 random morph · C4 share codes · D2 elite replay · E3 challenges · E4 custom goals · E6.4 object interaction · E6.7 sports · F2 finished models shelf · F5 challenge progress · F6 templates · F7 schema migrations/fingerprinting · G2 ice · G4 world objects · G5 wind modifiers · G7 joint limits · G8 rigid plates · G11 pistons · **Arena Championship I1–I5** (I6 Head-to-Head is a separate focused want) · J2–J4

---



## Hard exclude (never port)

Parent artifacts that must not enter Fresh Start physics or retune feel:

- Code: `physics.ts`, `physicsConstants.ts`, `aero.ts`, `hingeStops.ts`, `solidSegments.ts`, parent terrain collision math, parent reward/capability physics formulas, `paraPilot` physics gates, `neat.ts`
- Docs/history: `DECISIONS.md`, `COMPLETED.md`, `OUTSTANDING.md`, `PROJECT_STATE.md`, sandbox/ideas development plans, all `FLIGHT_*.md`, goal/joint physics audits, calibration JSON, Ideas.txt physics-feel commentary, parent physics smoke/calibrate scripts

See `[docs/PHYSICS_FIREWALL.md](./docs/PHYSICS_FIREWALL.md)`.