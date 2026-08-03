# Fresh Start — Feature Port Checklist

**Source of truth for what to port from the parent Biomechanics Sandbox.**

Implementation is Fresh Start–native (rewrite). Parent physics code, tuning, notes, and history must **never** be copied or used as physics guidance.

## How to mark

| Mark | Meaning |
|---|---|
| `- [x]` | Want / port (or already implemented) |
| `- [ ]` | Keep for later — stays on the checklist |
| `- [O]` | Ignore forever — removed on prune |

1. Edit marks as above.
2. Optionally note constraints under an item.
3. Tell the agent to refresh [`FEATURE_PORT_BACKLOG.md`](./FEATURE_PORT_BACKLOG.md) and/or **prune `[O]` items**.
4. Only `[x]` items enter the implementation backlog.

**Decisions locked in**

- Physics: Rapier-native extensions when needed; never port parent soft-body solver/tuning.
- Learning: keep Fresh Start MLP + GA; do **not** port parent NEAT.
- Section B layout: defer UI chrome until the feature that needs it lands (see B note).

**Updated:** 2026-08-02 — pruned `[O]`, clarified former `[?]` items, normalized marks.

### Clarifications resolved

| ID | Question | Answer | Mark |
|---|---|---|---|
| **A8** Gait fingerprints | What is this? | Parent debug viz: a scrolling “barcode” of which contacts were planted over time (gait timeline). Not required for training. | Removed (`[O]`) |
| **C1.1** Mark feet | Only if goals benefit? | Yes — Fresh Start run/jump already treat all joints as feet; explicit foot marks improve lift/landing scoring. | `[x]` |
| **D3** Progressive limits | What is this? | After a clear, auto-raise course difficulty (taller tower, wider gap, rougher terrain). Useful later for climb / E6.8. | `[ ]` defer |
| **D6** Multi-brain phase handoff | What is this? | Sequence brains by stage (e.g. run-up → deploy → glide) for parachute/para goals. Pairs with **G10**. | `[x]` |
| **D7** Expanded observations | Needed? | Object sensors skipped (world objects omitted). Keep **contact / terrain-relative** packs for climb & rough terrain. | `[x]` (contact/terrain only) |

---

## A. Rendering and cosmetics

- [x] **A1.2 / A4 Eye / googly-eye primitives** — done
- [x] **A2 Sprite body-part library** — done (animal / modular / monster + tint/mirror/pivot + preload)
- [x] **A5 Visual pose interpolation** (render lerp between fixed physics ticks) — *only if relevant: yes, keeps 60 Hz feel when frames hitch*
- [x] **A6 Sim axis rulers** (height / horizontal overlays)
- [x] **A7 Network visualizer** (MLP graph; Fresh Start network, not NEAT)

## B. UI / UX shell

> **Note:** Layout is designed **with** each feature. **B1–B3** shipped (zone tabs + hybrid shell). Remaining B items land with their owning features.

- [x] **B1 Zone tabs** — done
- [x] **B2 Collapsible section pattern** — done (hybrid shell)
- [x] **B3 Sandbox menu shell** — done (left exclusive tabs + sim bottom dock)
- [ ] **B4 Goal info card** — with E1/E5
- [ ] **B5 Trainable goal picker** — with E1
- [ ] **B6 Stats panel**
- [ ] **B7 Control panel** — with D1
- [ ] **B8 Capability panel**
- [ ] **B9 Performance diagnostics panel**
- [ ] **B10 Rewards breakdown panel**
- [ ] **B11 Discovery / secret trophies UI** — with E5
- [ ] **B12 Model picker / models hub** — with D5
- [ ] **B13 Creature library panel** — F1 exists; richer panel later
- [ ] **B14 Custom environments panel** — with F4 / C2
- [ ] **B15 Arena modifiers panel**
- [ ] **B16 Immersive fullscreen mode**
- [ ] **B17 Reduced-motion / a11y polish**
- [ ] **B18 Brand theme tokens / custom fonts**

## C. Editor / tools

- [ ] **C1 Studio-depth creature editor upgrades**
  - [x] **C1.1 Mark feet** — benefits run/jump scoring
  - [x] **C1.2 Drive groups** (shared brain channel across muscles)
  - [x] **C1.8 Aero surface authoring** (wing / paraglider / parachute) — needs G9/G10
  - [x] **C1.9 Wheel / motor-wheel authoring** — needs G6 (minimal torque exists; editor next)
- [ ] **C2 Environment Studio** (partial vs parent)
  - [x] **C2.1 Obstacle authoring** (box / ramp / stair / pit / loop) — partial set only
  - [x] **C2.3 Terrain heightfield authoring**
  - [x] **C2.4 Tower / launch structure**
  - [x] **C2.7 Theme selection**
  - [x] **C2.8 Undo/redo + export/import**
- [x] **C5 JSON import/export** (creatures / models / environments with validation)

## D. Learning product (MLP/GA stays; no NEAT port)

- [x] **D1 Richer training controls UI** (speed presets, observe vs train speed)
- [ ] **D3 Progressive limits / escalation** — defer; revisit with climb / E6.8
- [x] **D4 Best Ever ledger** (per-goal all-time best + recipe fingerprint)
- [x] **D5 Continue-training / transfer into saved models**
- [x] **D6 Multi-brain phase handoff** — for G10 para staging (Fresh Start gates only)
- [x] **D7 Expanded observation packs** — contact / terrain only (no object sensors)
- [x] **D8 Additional trainable tasks** — jump/climb/motor/flight done; more with E1/E6.8

## E. Goals / challenges / zones

- [x] **E1 Goal catalog framework**
- [x] **E2 Zone framework** — *eligibility gating not required for any zone*
- [x] **E5 Secret/hidden goal system** — all required
  - [x] E5.1 Secret goal definitions + flavor text
  - [x] E5.2 Eligibility gating by morphology/traits
  - [x] E5.3 Evaluation hooks on Fresh Start state
  - [x] E5.4 Discovery ledger + confetti reveal overlay
- [x] **E6 Goal families** (Rapier-native formulas)
  - [x] E6.1 Locomotion — built-in run task
  - [x] E6.2 Jump — done
  - [x] E6.3 Climb — done
  - [x] E6.5 Motor / wheeled — done (minimal)
  - [x] E6.6 Flight / glide / para — done (minimal aero); para deepen with G10
  - [x] E6.8 Rough terrain

## F. Persistence / library

- [x] **F1 Creature packages repository** — done
- [x] **F3 Default / bundled models library** — done
- [x] **F4 Environments repository**

## G. World / materials / interactions (Rapier)

- [x] **G1 Static obstacle set**
- [x] **G3 Procedural / authored terrain heightfield**
- [x] **G6 Wheels / motor wheels** — minimal done; deepen with C1.9
- [x] **G9 Aero-like forces** — minimal done; deepen with C1.8
- [x] **G10 Parachute / paraglider deployables**

## H. Audio / effects

- [x] **H1 Web Audio analysis** — done
- [x] **H2 Disco mode** — done
- [x] **H3 Bundled disco dancer preset(s)** — done
- [x] **H4 Confetti / reveal effects for discoveries** — with E5.4

## J. Dev tooling

- [x] **J1 Broader headless smoke suite** — done (`smoke:tasks`); extend as features land

---

## Pruned (ignored — removed from active list)

A1.1/A1.3–A1.6 primitives & skinning · A3 biological presets · A8 gait fingerprints · A9 range preview · A10 skeleton/cosmetics modes · C1.3–C1.7/C1.10 · C2.2 ice · C2.5 world objects · C2.6 spawn/camera/bounds · C3 random morph · C4 share codes · D2 elite replay · E3 challenges · E4 custom goals · E6.4 object interaction · E6.7 sports · F2 finished models shelf · F5 challenge progress · F6 templates · F7 schema migrations/fingerprinting · G2 ice · G4 world objects · G5 wind modifiers · G7 joint limits · G8 rigid plates · G11 pistons · **entire Arena Championship (I1–I5)** · J2–J4

---

## Hard exclude (never port)

Parent artifacts that must not enter Fresh Start physics or retune feel:

- Code: `physics.ts`, `physicsConstants.ts`, `aero.ts`, `hingeStops.ts`, `solidSegments.ts`, parent terrain collision math, parent reward/capability physics formulas, `paraPilot` physics gates, `neat.ts`
- Docs/history: `DECISIONS.md`, `COMPLETED.md`, `OUTSTANDING.md`, `PROJECT_STATE.md`, sandbox/ideas development plans, all `FLIGHT_*.md`, goal/joint physics audits, calibration JSON, Ideas.txt physics-feel commentary, parent physics smoke/calibrate scripts

See [`docs/PHYSICS_FIREWALL.md`](./docs/PHYSICS_FIREWALL.md).
