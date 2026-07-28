import { Obstacle } from './types';
import { GROUND_Y } from './physicsConstants';

export type Point2 = Readonly<{ x: number; y: number }>;
export type CanonicalCollisionShape =
  | Readonly<{ kind: 'aabb'; left: number; top: number; right: number; bottom: number; source: Obstacle }>
  | Readonly<{ kind: 'segment'; a: Point2; b: Point2; radius: number; oneWay: boolean; source: Obstacle }>
  | Readonly<{ kind: 'polygon'; points: readonly Point2[]; source: Obstacle }>
  | Readonly<{ kind: 'pit'; left: number; right: number; floorY: number; depth: number; source: Obstacle }>;

export function obstacleCollisionShapes(obstacle: Obstacle): CanonicalCollisionShape[] {
  switch (obstacle.type) {
    case 'box':
      return [{ kind: 'aabb', left: obstacle.x, top: obstacle.y, right: obstacle.x + obstacle.width, bottom: obstacle.y + obstacle.height, source: obstacle }];
    case 'stair':
      return [
        { kind: 'segment', a: { x: obstacle.x, y: obstacle.y }, b: { x: obstacle.x + obstacle.width, y: obstacle.y }, radius: 0, oneWay: true, source: obstacle },
        { kind: 'segment', a: { x: obstacle.x, y: obstacle.y }, b: { x: obstacle.x, y: Math.min(GROUND_Y, obstacle.y + obstacle.height) }, radius: 0, oneWay: false, source: obstacle },
      ];
    case 'ramp':
      return [{ kind: 'polygon', points: [
        { x: obstacle.x, y: obstacle.y + obstacle.height },
        { x: obstacle.x + obstacle.width, y: obstacle.y },
        { x: obstacle.x + obstacle.width, y: obstacle.y + obstacle.height },
      ], source: obstacle }];
    case 'bar':
      return [{ kind: 'aabb', left: obstacle.x - obstacle.width / 2, top: obstacle.y, right: obstacle.x + obstacle.width / 2, bottom: obstacle.y + Math.max(2, obstacle.height), source: obstacle }];
    case 'pit':
      return [{ kind: 'pit', left: obstacle.x, right: obstacle.x + obstacle.width, floorY: obstacle.y, depth: obstacle.height, source: obstacle }];
    case 'terrain':
      return [{ kind: 'segment', a: { x: obstacle.x, y: obstacle.y }, b: { x: obstacle.x2 ?? obstacle.x + obstacle.width, y: obstacle.y2 ?? obstacle.y }, radius: 0, oneWay: true, source: obstacle }];
    default:
      return [];
  }
}

export function canonicalizeObstacles(obstacles: readonly Obstacle[]): CanonicalCollisionShape[] {
  return obstacles.flatMap(obstacleCollisionShapes);
}

export function closestPointOnSegment(point: Point2, a: Point2, b: Point2): Point2 & { t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return { x: a.x + dx * t, y: a.y + dy * t, t };
}
