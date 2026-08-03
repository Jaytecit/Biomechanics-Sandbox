# Fresh Start — Feature Port Backlog

Derived from [`FEATURE_PORT_CHECKLIST.md`](./FEATURE_PORT_CHECKLIST.md) after prune + clarifications.

**Last refreshed:** 2026-08-03  
**Legend:** `[x]` want/done · `[ ]` later · `[O]` pruned (gone)

---

## Already done

A1.2/A4 googly · A2 body parts · B1 zones · E6.2/3/5/6 tasks · F1/F3 library · H1–H3 disco · J1 smokes · G6/G9 minimal · climb course · Wave 1 (A5–A7, C5, D4) · Wave 2 (C1.1/1.2/1.8/1.9, D1/D5/D7, E1/E2) · Wave 3a (E5/H4 secrets+confetti, F4/C2.7/C2.8 env scaffold)

---

## Next implementation waves

### Wave 1 — low physics risk

| ID | Feature | Status |
|---|---|---|
| A5 | Visual pose interpolation | **Done** |
| A6 | Sim axis rulers | **Done** |
| A7 | MLP network visualizer | **Done** |
| C5 | JSON import/export | **Done** |
| D4 | Best Ever ledger | **Done** |
| H4 | Confetti (with E5) | **Done** (Wave 3a) |

### Wave 2 — editor / learning product

| ID | Feature | Status |
|---|---|---|
| C1.1 | Mark feet | **Done** |
| C1.2 | Drive groups | **Done** |
| C1.9 | Wheel authoring UI | **Done** |
| C1.8 | Aero surface authoring UI | **Done** |
| D1 | Training speed controls | **Done** |
| D5 | Continue-training / transfer | **Done** |
| D7 | Contact/terrain observations | **Done** |
| E1 | Goal catalog framework | **Done** |
| E2 | Zone framework (no eligibility) | **Done** |

### Wave 3 — world + secrets + para

| ID | Feature | Status |
|---|---|---|
| E5.* / H4 | Secret goals + confetti | **Done (Wave 3a)** |
| F4 / C2.7–C2.8 | Environments repo + themes + undo/export | **Done (scaffold, Wave 3a)** |
| G1 / C2.1 | Static obstacles + authoring | Next (physics) |
| G3 / C2.3 | Terrain heightfield | Next (physics) |
| C2.4 | Tower / launch | Next (physics) |
| E6.8 | Rough terrain goal | Next (needs G3) |
| G10 / D6 | Para deployables + multi-brain phases | Later (high risk) |
| D3 | Progressive limits | Defer |

### Deferred with feature (Section B)

B2/B3 shipped as hybrid shell (left exclusive tabs + sim bottom dock + camera inset).  
B4–B18 — design layout when the owning feature lands (B4/B11 with E5 done light; B14 env panel scaffolded with F4).

---

## Clarification outcomes (short)

- **A8** gait fingerprints → pruned  
- **C1.1** feet → yes, for scoring  
- **D3** progressive limits → defer  
- **D6** multi-brain → yes, with G10  
- **D7** observations → contact/terrain only  
