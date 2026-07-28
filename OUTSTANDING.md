# OUTSTANDING.md — Soft-body Sandbox next work

**Updated:** 2026-07-28  
**Authority for shipped truth:** `COMPLETED.md` + `DECISIONS.md`

Ask the creative director only when progress is genuinely blocked. Ordinary
technical ambiguity is resolved by defaults, tests, and reversible decisions.

---

## Next gate (do this first)

### C1 — Object-relative sensor

One change at a time. Start with the audited object-relative sensor only.

1. Define a bounded observation contract and a behavioural criterion.
2. Advance soft-body physics compatibility; migrate packages.
3. Keep stale controllers and failed seeds visible.
4. Prove object feedback under held-out layouts.

**Do not combine** with a gripper, contact pad, reward rewrite, or other
physics-bearing component in the same change.

---

## Deferred (do not mix with C1)

### Flight Height learning feel

Stay Aloft elites can fly under Flight Height, but the D110 gated product
plateaus. Candidate repair: capped early duration bridge + three-seed Height
gate. Re-probe after D143 symmetry bias before rewriting the Height formula
again. Retain `smoke-flight-height`, `smoke-flight-single-bout`, and
`prove-flight-learn` when touching this.

Diagnostic scripts (optional, not a gate): `scripts/diagnose-flight-height-vs-aloft.ts`,
`scripts/probe-flight-height-*.ts`.

---

## Standing rules while working

- Soft-body physics version bumps invalidate old controllers; leave them visible
  but stale.
- Evaluation ≠ training; renderer never alters physics or actions.
- Prefer simplest option that proves learning; record reversible decisions in
  `DECISIONS.md`.
- After meaningful changes: run relevant smokes, inspect logs, update
  `COMPLETED.md` / this file, and keep `PROJECT_STATE.md` as the short index.

---

## Explicitly out of scope right now

- Resuming joint angle locks (removed D135; solids replace that need).
- Reopening Flight Recovery as an implementation program (closed D082).
- New physics-bearing components before C1 sensor contract is proven.
- Observatory Ant/Humanoid capability freeze work (separate track; not in this
  sandbox tree).
