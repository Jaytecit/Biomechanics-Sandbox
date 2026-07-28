# Phase 21 Goal Semantics Matrix

**Authority:** D081
**Executable source:** `src/goalSemantics.ts`
**Verification:** `scripts/smoke-goal-semantics.ts`,
`scripts/smoke-obstacle-climb.ts`

> **2026-07-25 audit note:** This matrix records physical intent; it does not
> by itself prove reward weighting or resistance to farming. The code-level
> follow-up for the original 44 goals plus D109 G1 is
> `GOAL_REWARD_AND_COMPONENT_AUDIT.md` (D098/D109).

Every shipped catalog entry is a strict side-on 2D task. The executable matrix
records geometry, equipment requirements, success, failure, shortcut audit, and
2D rationale for 44 active goals plus one retired legacy goal. This summary
records the disposition decision.
Legacy enum identifiers remain stable for saved-data compatibility.

| Goal | Decision | Physical event / rationale |
|---|---|---|
| Run Right | Keep | Supported rightward displacement |
| Run Left | Keep | Supported leftward displacement |
| Max Speed | Keep | Peak speed plus real displacement |
| Sprint Finish | Keep | Ordered supported checkpoints, then finish |
| Rough Terrain Traverse | Keep | Ordered supported checkpoints across seeded rolling terrain, then supported finish |
| Stay Tall | Keep | Sustained supported tall posture |
| High Jump | Keep | Supported takeoff and peak clearance |
| Clear Bar | Reshape | Entire physical node hull clears the bar |
| Jump & Land | Keep | One hop and supported upright return near takeoff |
| Jump Right | Keep | Supported takeoff and airborne right travel |
| Hang Time | Keep | Continuous non-flight airborne streak |
| Jump Left | Keep | Supported takeoff and airborne left travel |
| Jump Speed | Keep | Peak speed during a supported jump |
| Jump Acrobatics | Keep | Clearance-gated airborne rotation |
| Stair Climb | Keep | Supported contact on successively higher treads |
| Climb Obstacles | Keep | Supported tops on a seeded deterministic course |
| Balance Beam | Keep | Supported travel on the beam; pit fall fails |
| Carry Ball | Keep | Rightward lifted transport during a continuous creature-ball collision chain |
| Push Box | Keep | Private crate displacement with contact proximity |
| Motor Drive | Keep | Powered-wheel supported displacement |
| Motor Ramp | Keep | Powered-wheel ascent on swept ramp surface |
| Motor Ice Run | Keep | Powered-wheel travel across low-friction zones |
| Clear the Gap | Reshape | Entire hull beyond far lip without pit fall |
| Launch & Land | Keep | Gap clear then both motor wheels supported on LAND pad |
| Hamster Hoop | Keep | Grounded hoop roll on seeded terrain |
| Jump Hurdles | Reshape | Entire physical hull clears each solid hurdle |
| Landspeed | Keep | Peak speed while physically supported |
| Bridge Crossing | Retire | Static supported traversal duplicates flat-ground driving in strict 2D; legacy score path only |
| Motor Technical Course | Rename + reshape | Replaces depth-weaving slalom with inclines, drops, pads, riser, checkpoints |
| Parking Zone | Reshape | Entire body in bay, supported, slow, upright |
| Hit Targets | Keep | Private ball physically contacts target |
| Score a Goal | Keep | Private ball physically enters goal mouth |
| Bowling | Keep | Private pins displaced from supported starts |
| Hazard Dash | Keep | Ordered static-hazard traversal followed by a supported finish |
| Stay Aloft | Keep | Sustained fully-airborne streak with aero work |
| Flight Height | Keep | Best sustained aero-climb bout |
| Fly Right | Keep | Sustained airborne right travel |
| Fly Left | Keep | Sustained airborne left travel |
| Flight Airspeed | Keep | Peak speed while fully airborne |
| Flight Land | Keep | Climb, controlled descent, supported soft upright landing |
| Flight Acrobatics | Keep | Clearance-gated airborne rotation |
| Glide Range | Keep | Corridor glide distance with controlled sink |
| Aerial Crossing | Reshape | Full-hull pit clear followed by far-side support |
| Para Ramp | Keep | Run-up, ramp departure, deploy, glide, supported landing |
| Custom Goal | Reshape | Validated physical metrics only; free text never executes or grants reward |

No goal was removed. Two misleading names were replaced in the presentation
layer while their enum values remain migration-safe.
