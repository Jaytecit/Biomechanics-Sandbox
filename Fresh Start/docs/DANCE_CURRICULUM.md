# H7 — Disco multi-track dance curriculum

Disco-only learning path. Free evolve, Edit, World, and Head-to-Head stay unchanged.

## Obs pack version

`DANCE_OBS_PACK_VERSION = 2`

- Pose: 12 (same as locomotion `OBS_COUNT`)
- Audio bands: 6 (bass, lowMid, highMid, treble, onset, energy)
- Lookahead: 6 (energy/onset at +0.1s, +0.2s, +0.4s from offline analysis)

Locomotion evolve always uses `OBS_COUNT = 12` only.

## Pipeline

1. **Playlist** — user loads local audio files in Disco.
2. **Analyze** — offline PCM → band envelopes, onset, beat period/phase, lookahead (`src/audio/trackAnalysis.ts`).
3. **Record** — reactive disco teacher drives while sampling dance obs (+ lookahead).
4. **Learn playlist** — warm-start SGD imitation across merged multi-track dataset.
5. **Refine freestyle** — Disco-local seeded GA on dance fitness (upright, motion energy, beat sync, light imitation prior). Does **not** call Free `startLiveEvolve`.
6. **Save / load** — `task: 'dance'` models store `danceMeta` (obs pack version, stage, playlist fingerprint). Models Hub loads them into Disco freestyle.

## Feature flags

- `discoDanceLearn` — H6 single-track Record → Learn → Freestyle
- `discoDanceCurriculum` — H7 playlist curriculum UI + refine

## Physics isolation

Disco puppet muscle options apply while `discoArenaFeel` is set (reactive + freestyle). Cleared on leave-disco. Evolve/Edit never receive disco muscle multipliers.
