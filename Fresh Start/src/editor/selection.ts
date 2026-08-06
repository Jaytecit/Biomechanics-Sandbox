export type EditorSelection =
  | { kind: 'joints'; ids: number[] }
  | { kind: 'bone'; id: number }
  | { kind: 'muscle'; id: number }
  | { kind: 'bodyPart'; index: number }
  | null;

/** Normalize joint ids (unique, sorted). Empty → null. */
export function jointsSelection(ids: number[]): EditorSelection {
  const unique = [...new Set(ids)].filter((id) => Number.isFinite(id)).sort((a, b) => a - b);
  if (unique.length === 0) return null;
  return { kind: 'joints', ids: unique };
}

export function selectedJointIds(sel: EditorSelection): number[] {
  return sel?.kind === 'joints' ? sel.ids : [];
}

export function isJointSelected(sel: EditorSelection, jointId: number): boolean {
  return sel?.kind === 'joints' && sel.ids.includes(jointId);
}
