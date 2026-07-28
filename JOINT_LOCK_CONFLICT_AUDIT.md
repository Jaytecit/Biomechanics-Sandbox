# Joint Lock Conflict Audit (D131) — feature removed (D135)

**Date:** 2026-07-27 (audit) / 2026-07-28 (D132–D134) / 2026-07-28 (D135 remove) /
2026-07-28 (D136 solid segments supersede locks)  
**Physics:** soft-body `4.13.0` (compound solid plates; no angle locks)  
**Status:** Historical record only. Lock Joint and all repair patches were
**removed** under D135. Rigid structure is now provided by **D136 solid
segments** (shape-matched compound bodies with boundary-only soft hinges),
which do not use per-joint angle projection and therefore avoid the conflict
modes below.

The original audit confirmed that hard-only locks were stable while soft chords
across locked fans, multi-lock cascades, and closed chassis frames fought length
constraints. Those conflict modes no longer apply because angle locks are gone.

See **D135** and **D136** in `DECISIONS.md`.
