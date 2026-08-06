import { useState } from 'react';
import { countBrainActuatorChannels, normalizeDriveGroup } from '../brain/driveGroups';
import type { CreatureDesign } from '../creature/types';
import {
  computeFlightMetrics,
  FLIGHT_REF_SPEED,
} from '../editor/flightMetrics';
import { morphologyTraits } from '../secrets/eligibility';
import { CollapsiblePanel } from './CollapsiblePanel';

interface Props {
  design: CreatureDesign;
}

/** B8 — Fresh Start morphology / traits summary (not parent capability physics). */
export function CapabilityPanel({ design }: Props) {
  const [open, setOpen] = useState(false);
  const traits = morphologyTraits(design);
  const flight = computeFlightMetrics(design);
  let wings = 0;
  let gliders = 0;
  let chutes = 0;
  for (const b of design.bones) {
    if ((b.aeroArea ?? 0) <= 0) continue;
    if (b.aeroType === 'wing') wings++;
    else if (b.aeroType === 'parachute') chutes++;
    else gliders++;
  }
  const groupIds = new Set<number>();
  let ungrouped = 0;
  for (const m of design.muscles) {
    const g = normalizeDriveGroup(m.driveGroup);
    if (g === undefined) ungrouped++;
    else groupIds.add(g);
  }
  const channels = countBrainActuatorChannels(design.muscles);

  return (
    <CollapsiblePanel
      title="Capabilities"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      className="capability-panel"
    >
      <ul className="stats">
        <li>Joints: {design.joints.length}</li>
        <li>Bones: {design.bones.length}</li>
        <li>Muscles: {design.muscles.length}</li>
        <li>Brain channels: {channels}</li>
        <li>Total mass: {flight.totalMass.toFixed(2)}</li>
        <li>Feet: {traits.footCount}</li>
        <li>Heads: {traits.headCount}</li>
        <li>Wheels: {traits.wheelCount}</li>
        <li>
          Aero: {traits.hasAero ? 'yes' : 'no'}
          {traits.hasAero ? ` · area ${traits.totalAeroArea.toFixed(2)}` : ''}
        </li>
        {(wings > 0 || gliders > 0 || chutes > 0) && (
          <li>
            Aero parts: {wings} wing · {gliders} glider · {chutes} chute
          </li>
        )}
        <li>
          Drive groups: {groupIds.size}
          {ungrouped > 0 ? ` · ${ungrouped} solo` : ''}
        </li>
      </ul>
      {flight.totalAeroArea > 0 && (
        <>
          <h3 className="subhead">Flight readiness</h3>
          <ul className="stats">
            <li>
              Area / mass: {flight.areaPerMass.toFixed(2)}
              <span className="hint muted"> · higher helps</span>
            </li>
            {(flight.gliderArea > 0 || flight.wingArea > 0) && (
              <li
                title={`Ideal orientation, ${FLIGHT_REF_SPEED} m/s — approximate`}
              >
                Lift vs weight @{FLIGHT_REF_SPEED}m/s:{' '}
                {flight.liftOverWeight.toFixed(2)}×
                {flight.liftOverWeight >= 1
                  ? ' · can lift'
                  : ' · needs more area/speed'}
              </li>
            )}
            {flight.chuteArea > 0 && (
              <li title={`At ${FLIGHT_REF_SPEED} m/s descent — approximate`}>
                Chute drag vs weight @{FLIGHT_REF_SPEED}m/s:{' '}
                {flight.chuteDragOverWeight.toFixed(2)}×
              </li>
            )}
          </ul>
          <p className="hint muted">
            Wings lift on the downstroke (flap). Gliders need forward speed +
            pitch. Raise Aero area or lighten the body; Oscillate/Brain must
            actually flap or dive for airspeed.
          </p>
        </>
      )}
    </CollapsiblePanel>
  );
}
