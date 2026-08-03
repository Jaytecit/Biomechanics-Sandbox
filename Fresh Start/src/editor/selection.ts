export type EditorSelection =
  | { kind: 'joint'; id: number }
  | { kind: 'bone'; id: number }
  | { kind: 'muscle'; id: number }
  | null;
