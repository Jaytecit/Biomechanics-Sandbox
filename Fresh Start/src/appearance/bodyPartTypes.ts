export type BodyPartPack = 'animal' | 'modular' | 'monster' | 'other';
export type BodyPartCategory =
  | 'leg'
  | 'arm'
  | 'body'
  | 'face'
  | 'eye'
  | 'mouth'
  | 'nose'
  | 'shoe'
  | 'other';

export interface BodyPartDef {
  id: string;
  label: string;
  category: BodyPartCategory;
  pack: BodyPartPack;
  url: string;
  pivotX: number;
  pivotY: number;
  defaultScale: number;
  mirrorAllowed: boolean;
}
