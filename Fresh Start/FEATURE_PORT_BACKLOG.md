# Fresh Start — Feature Port Backlog

Derived from [`FEATURE_PORT_CHECKLIST.md`](./FEATURE_PORT_CHECKLIST.md) after prune + clarifications.

**Last refreshed:** 2026-08-05  
**Legend:** `[x]` want/done · `[ ]` later · `[O]` pruned (gone)

---

## Already done

A1.2/A4 googly · A2 body parts · B1–B3 shell · Wave 4 Section B UI (B4–B14, B16, B18) · E6.2/3/5/6/8 tasks · F1/F3 library · H1–H3 disco · J1 smokes · G6/G9 minimal · G10 structural aero · climb course · Wave 1 (A5–A7, C5, D4) · Wave 2 (C1.1/1.2/1.8/1.9, D1/D5/D7, E1/E2) · Wave 3a (E5/H4 secrets+confetti scaffold, F4/C2.7/C2.8 env scaffold) · Wave 3b (G1/C2.1 static obstacles) · Wave 3c (G3/C2.3 terrain heightfield) · Wave 3d (C2.4 launch tower) · Wave 3e (E6.8 rough terrain) · Wave 3f (G10 aero parts) · Wave 3g (C2.9 score regions) · **Wave 5** (B19 Solemn Sandbox · C2.10 markers · E6 sprint/speed/stay/hang/longjump · E5×100 · H2/H5 multi-disco · B20/I6 Head-to-Head) · **H6/H7** dance imitation + multi-track curriculum

---

## Next implementation waves

### Wave 4 — Section B UI polish — **Done**

| ID | Feature | Status |
|---|---|---|
| B4 | Goal info card | **Done** |
| B5 | Trainable goal picker | **Done** |
| B6 | Stats panel | **Done** |
| B7 | Control panel (deepen D1) | **Done** |
| B8 | Capability panel (FS morphology/traits) | **Done** |
| B9 | Performance diagnostics panel | **Done** |
| B10 | Rewards breakdown panel | **Done** |
| B11 | Discovery / secret trophies UI | **Done** (light; deepen with E5.5) |
| B12 | Model picker / models hub | **Done** |
| B13 | Creature library panel (richer) | **Done** |
| B14 | Custom environments panel | **Done** |
| B16 | Immersive fullscreen mode | **Done** |
| B18 | Brand theme tokens / custom fonts | **Done** |

### Wave 5 — Course markers, goals, secrets, H2H, disco, brand — **Done**

| ID | Feature | Status |
|---|---|---|
| B19 | Solemn Sandbox branding (header + tagline) | **Done** |
| C2.10 | Start / finish / checkpoint markers (timed courses) | **Done** |
| E6.* | Richer goal catalog (sprint/speed/stay/hang/longjump + existing) | **Done** (core set; more parent mirrors can deepen later) |
| E5.1 / E5.5 | Full **100** discoverable secrets + cabinet scale | **Done** |
| B20 / I6 | Head-to-Head tab — two models, gauntlet challenge | **Done** |
| H2 / H5 | Disco muscle/group reactivity + up to **6** dancers | **Done** |
| H6 | Dance imitation / freestyle brain (record → SGD → freestyle) | **Done** |
| H7 | Multi-track dance curriculum (playlist, offline analysis, refine) | **Done** |

### Wave 6 — Training experimentation (D9–D15) — **Core shipped**

Plan: [`docs/TRAINING_EXPERIMENTATION_PLAN.md`](./docs/TRAINING_EXPERIMENTATION_PLAN.md)

| ID | Feature | Phase | Status |
|---|---|---|---|
| D9 | Train dock IA + plain labels | 0 | **Done** |
| D10 | Population / batch / mutation recipes | 1 | **Done** |
| D11 | Start-from + selection Advanced | 2 | **Done** |
| D12 | Annealing / adaptive try length / crossover | 3 | **Done** |
| D13 | Goal priorities + stage trainer | 4 | **Done** (Stay→Run→Sprint · Gauntlet course stages + start-line timer) |
| D14 | New experiences pack | 5 | **Partial** (Race your record; messy bodies UI stub) |
| D15 | Shareable recipes / experiment packs | 6 | **Done** (named recipes + pack export) |
| D16 | Training telemetry log (50-gen window) | 6 | **Done** (Train toggle + JSON insights) |
| D17 | Soft morphology evolution (P0–P2) | 6 | **Done** (messy bodies + morph genes + per-member) |

**Open decisions (locked for Wave 6):**

1. Mid-run knob changes → **lock until Stop** (apply on next Evolve)
2. Serious search → batch &lt; pop by default
3. Mix goals → temporary reward recipe on active goal (not a new goal ID)
4. Experiment packs → Train / Saved brains area

### Deferred

| ID | Feature | Status |
|---|---|---|
| B17 | Reduced-motion / a11y polish | Defer |
| D3 | Progressive limits | Defer |
| D6 | Multi-brain phase handoff | Defer (not required for G10) |

### Pruned from Section B / Arena

| ID | Feature | Why |
|---|---|---|
| B15 | Arena modifiers panel | Full Arena Championship (I1–I5) pruned — not relevant |
| I1–I5 | Arena Championship | Replaced by focused **I6 Head-to-Head** only |

---

## Clarification outcomes (short)

- **A8** gait fingerprints → pruned  
- **C1.1** feet → yes, for scoring  
- **D3** progressive limits → defer  
- **D6** multi-brain → defer; G10 = structural parts + single MLP  
- **G10** → Wing (pair/flap) / Glider (rigid pitch sail) / Parachute (jointed inflation drag); no deploy multi-brain  
- **D7** observations → contact/terrain only  
- **Section B** → want B4–B14, B16, B18–B20; defer B17 a11y; dump B15 arena modifiers  
- **E6 expand** → realistic parent skills only; skip objects/sports/ice/gimmicks/Para Ramp  
- **E5** → target **100** secrets  
- **Brand** → **Solemn Sandbox** / *A serious environment to carry out silly experiments.*  
- **I6** → two-model gauntlet only (not full Arena)  
- **H5** → up to 6 disco dancers with muscle/group audio reactivity  
- **D9–D15** → training experimentation; ship Phase 0→1→2 first  
