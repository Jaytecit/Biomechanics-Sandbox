import { useMemo, useState } from 'react';
import {
  BODY_PART_CATALOG,
  bodyPartsByCategory,
} from '../appearance/bodyPartCatalog';
import type { BodyPartCategory, BodyPartPack } from '../appearance/bodyPartTypes';

const PACKS: { id: BodyPartPack | 'all'; label: string }[] = [
  { id: 'all', label: 'All packs' },
  { id: 'animal', label: 'Animal' },
  { id: 'modular', label: 'Modular' },
  { id: 'monster', label: 'Monster' },
];

const CATEGORIES: { id: BodyPartCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'body', label: 'Body' },
  { id: 'face', label: 'Face' },
  { id: 'eye', label: 'Eyes' },
  { id: 'mouth', label: 'Mouth' },
  { id: 'nose', label: 'Nose' },
  { id: 'arm', label: 'Arms' },
  { id: 'leg', label: 'Legs' },
  { id: 'shoe', label: 'Shoes' },
  { id: 'other', label: 'Other' },
];

interface Props {
  disabled?: boolean;
  onPick: (assetId: string) => void;
}

/** Kenney sprite catalog — pick to attach to the selected bone. */
export function BodyPartCatalogPicker({ disabled, onPick }: Props) {
  const [pack, setPack] = useState<BodyPartPack | 'all'>('all');
  const [category, setCategory] = useState<BodyPartCategory | 'all'>('all');

  const items = useMemo(() => {
    const base =
      category === 'all' ? BODY_PART_CATALOG : bodyPartsByCategory(category);
    return pack === 'all' ? base : base.filter((d) => d.pack === pack);
  }, [pack, category]);

  return (
    <div className="body-part-catalog">
      <div className="button-row wrap">
        <select
          disabled={disabled}
          value={pack}
          aria-label="Body part pack"
          onChange={(e) => setPack(e.target.value as BodyPartPack | 'all')}
        >
          {PACKS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          disabled={disabled}
          value={category}
          aria-label="Body part category"
          onChange={(e) =>
            setCategory(e.target.value as BodyPartCategory | 'all')
          }
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <p className="hint muted">
        {items.length} sprites · click to attach · drag/resize on canvas.
      </p>
      <div className="body-part-grid" role="list">
        {items.map((def) => (
          <button
            key={def.id}
            type="button"
            className="body-part-thumb"
            disabled={disabled}
            title={`${def.label} (${def.pack})`}
            aria-label={`Add ${def.label}`}
            onClick={() => onPick(def.id)}
          >
            <img src={def.url} alt="" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );
}
