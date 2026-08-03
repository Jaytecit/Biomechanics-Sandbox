/** World-unit editor grid for joint placement. */
export const EDITOR_GRID = 0.5;

export function snapToGrid(x: number, y: number, enabled: boolean, grid = EDITOR_GRID): {
  x: number;
  y: number;
} {
  if (!enabled) return { x, y };
  return {
    x: Math.round(x / grid) * grid,
    y: Math.round(y / grid) * grid,
  };
}
