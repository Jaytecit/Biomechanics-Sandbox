export interface Camera {
  x: number;
  y: number;
  zoom: number;
  /**
   * Screen pixels reserved at the bottom (e.g. train dock).
   * Shifts the optical center upward so world framing stays above chrome.
   */
  insetBottom?: number;
}

export function createCamera(): Camera {
  return { x: 0, y: 2.2, zoom: 48, insetBottom: 0 };
}

function framingHeight(canvasH: number, insetBottom: number | undefined): number {
  const inset = Math.max(0, insetBottom ?? 0);
  return Math.max(1, canvasH - inset);
}

export function worldToScreen(
  cam: Camera,
  canvasW: number,
  canvasH: number,
  wx: number,
  wy: number,
): { x: number; y: number } {
  const h = framingHeight(canvasH, cam.insetBottom);
  return {
    x: canvasW / 2 + (wx - cam.x) * cam.zoom,
    y: h / 2 - (wy - cam.y) * cam.zoom,
  };
}

export function screenToWorld(
  cam: Camera,
  canvasW: number,
  canvasH: number,
  sx: number,
  sy: number,
): { x: number; y: number } {
  const h = framingHeight(canvasH, cam.insetBottom);
  return {
    x: cam.x + (sx - canvasW / 2) / cam.zoom,
    y: cam.y - (sy - h / 2) / cam.zoom,
  };
}
