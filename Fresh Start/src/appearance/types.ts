/** Cosmetic appearance attached to a creature design (never affects Rapier). */

export interface GooglyEyeDef {
  /** Anchor joint id. */
  jointId: number;
  /** Dome radius in world units. */
  domeRadius?: number;
  /** Horizontal offset from joint center. */
  offsetX?: number;
  offsetY?: number;
}

export interface BodyPartAttachment {
  /** Catalog asset id (see bodyPartCatalog). */
  assetId: string;
  /** Prefer bone anchor when set. */
  boneId?: number;
  /** Joint anchor (when not bone-anchored). */
  jointId?: number;
  /** 0..1 along bone start→end (default 0.5). */
  along?: number;
  /** Lateral offset in design/world units from the anchor. */
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  /** Extra rotation in radians, added on top of bone angle (if any). */
  rotation?: number;
  mirror?: boolean;
  tint?: string;
}

export interface AppearanceRig {
  version: 1;
  hideSkeleton?: boolean;
  googlyEyes: GooglyEyeDef[];
  bodyParts: BodyPartAttachment[];
}

export function emptyAppearance(): AppearanceRig {
  return { version: 1, googlyEyes: [], bodyParts: [] };
}

export function cloneAppearance(a?: AppearanceRig | null): AppearanceRig | undefined {
  if (!a) return undefined;
  return {
    version: 1,
    hideSkeleton: a.hideSkeleton,
    googlyEyes: a.googlyEyes.map((e) => ({ ...e })),
    bodyParts: a.bodyParts.map((p) => ({ ...p })),
  };
}
