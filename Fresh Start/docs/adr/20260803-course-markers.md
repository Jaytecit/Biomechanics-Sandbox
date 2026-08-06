# Capability ADR — Course markers (start / finish / checkpoint)

## Status

Accepted / Implemented

## Checklist IDs

C2.10 (supports Sprint Finish and ordered-course goals)

## Goal

Author start, checkpoint, and finish markers in Environment Studio so timed courses and completion rewards can score without new Rapier geometry.

## Design (Fresh Start only — non-Rapier)

- Schema: `EnvironmentDesign.markers: EnvCourseMarker[]` (`start` | `checkpoint` | `finish`)
- Geometry: thin vertical AABB (trigger volume) centered at `(x, y)` with size `w×h`
- **Start:** arm the course when any joint overlaps (required before finish credit if a start exists); records `startTime` and starts the race clock
- **Checkpoint:** ordered by `order` (0-based); must hit in sequence while armed
- **Finish:** grants completion when armed and all prior checkpoints hit; records `finishTime` as **race elapsed** (`simTime − startTime`), not absolute episode time
- Live HUD / Stats show READY until start, then a running race timer
- Scoring: course-aware tasks (e.g. Sprint) use **peak** forward progress + checkpoint progress + finish-time bonus; fall keeps a progress floor so mid-episode climbs are not wiped by later tumbles; other tasks ignore markers
- Course curriculum (D13 deepen, `courseCurriculum` flag): progressive finish windows on Gauntlet keep full geometry while moving spawn/finish
- No Rapier bodies, sensors, or collision-group changes
- Visual overlays only (editor + sim snapshot)
- Gated by `featureFlags.courseMarkers`

## Explicit non-goals

- Rapier sensors / solid finish-line colliders
- Parent soft-body course builders or reward formulas
- Auto-generated marker layouts from obstacles
- Replacing C2.9 score regions (markers are orthogonal)

## Smoke gate

- File: `scripts/smoke-tasks.mts` — `assertCourseMarkers`
- npm script: `npm run smoke:tasks` / `smoke:all`
- Pass criteria: ordered checkpoints gate finish; finish time recorded; import validates kinds; flag off ignores markers

## Rollback

`featureFlags.courseMarkers = false` (authoring UI tools hidden; eval ignores `markers`).
