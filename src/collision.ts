// Beam-object collision detection

import type { BeamState, Source, Satellite, Point, Groundhog } from './types.ts';

// Helper: Check if a point is inside a triangle using barycentric coordinates
function pointInTriangle(p: Point, v1: Point, v2: Point, v3: Point): boolean {
  const sign = (p1: Point, p2: Point, p3: Point): number => {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  };

  const d1 = sign(p, v1, v2);
  const d2 = sign(p, v2, v3);
  const d3 = sign(p, v3, v1);

  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);

  return !(hasNeg && hasPos);
}

// Check if a circle (source/satellite) overlaps with the beam triangle
function circleIntersectsTriangle(
  center: Point,
  radius: number,
  origin: Point,
  left: Point,
  right: Point
): boolean {
  // First check if center is inside triangle
  if (pointInTriangle(center, origin, left, right)) {
    return true;
  }

  // Check distance to each edge of the triangle
  const edges: [Point, Point][] = [
    [origin, left],
    [left, right],
    [right, origin],
  ];

  for (const [p1, p2] of edges) {
    const dist = pointToSegmentDistance(center, p1, p2);
    if (dist < radius) {
      return true;
    }
  }

  return false;
}

// Distance from point to line segment
function pointToSegmentDistance(p: Point, v: Point, w: Point): number {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2);

  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));

  const projX = v.x + t * (w.x - v.x);
  const projY = v.y + t * (w.y - v.y);

  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}

// Check if beam triangle overlaps with a source
export function beamIntersectsSource(beam: BeamState, source: Source): boolean {
  const { origin, left, right } = beam.triangle;
  return circleIntersectsTriangle(
    { x: source.x, y: source.y },
    source.size,
    origin,
    left,
    right
  );
}

// Check if beam triangle overlaps with a satellite
export function beamIntersectsSatellite(beam: BeamState, satellite: Satellite): boolean {
  const { origin, left, right } = beam.triangle;
  const satelliteRadius = satellite.size * 0.8;
  return circleIntersectsTriangle(
    { x: satellite.x, y: satellite.y },
    satelliteRadius,
    origin,
    left,
    right
  );
}

// Check if beam triangle overlaps with a groundhog
export function beamIntersectsGroundhog(beam: BeamState, groundhog: Groundhog): boolean {
  const { origin, left, right } = beam.triangle;
  const groundhogRadius = 15;
  return circleIntersectsTriangle(
    { x: groundhog.x, y: groundhog.y },
    groundhogRadius,
    origin,
    left,
    right
  );
}

// Check groundhog collision with GBT
// Returns: 'stomp' if GBT lands on groundhog, 'hit' if groundhog hits GBT wheels, 'none' if no collision
export function checkGroundhogCollision(
  groundhog: Groundhog,
  gbtBounds: { x: number; y: number; width: number; height: number },
  gbtGroundY: number,
  gbtCurrentY: number,
  gbtVelocityY: number
): 'stomp' | 'hit' | 'none' {
  const groundhogRadius = 15;
  const groundhogLeft = groundhog.x - groundhogRadius;
  const groundhogRight = groundhog.x + groundhogRadius;

  // Check horizontal overlap first
  const horizontalOverlap = groundhogRight > gbtBounds.x && groundhogLeft < gbtBounds.x + gbtBounds.width;
  if (!horizontalOverlap) {
    return 'none';
  }

  // If GBT is in the air and coming down, it's a stomp
  if (gbtCurrentY < gbtGroundY - 5 && gbtVelocityY >= 0) {
    return 'stomp';
  }

  // If GBT is on the ground, groundhog hits the wheels
  if (gbtCurrentY >= gbtGroundY - 5) {
    return 'hit';
  }

  return 'none';
}

// Process all collisions and return observation results
export interface CollisionResult {
  observedSources: { source: Source; deltaObservation: number }[];
  hitSatellites: Satellite[];
  completedSources: Source[];
  satellitesInBeam: Satellite[];  // Satellites currently in beam (for continuous penalty)
  newSatellitesInBeam: Satellite[];  // Satellites that just entered beam this frame
}

export function processCollisions(
  beam: BeamState,
  sources: Source[],
  satellites: Satellite[],
  deltaTime: number,
  isBeamBlanked: boolean = false
): CollisionResult {
  const result: CollisionResult = {
    observedSources: [],
    hitSatellites: [],
    completedSources: [],
    satellitesInBeam: [],
    newSatellitesInBeam: [],
  };

  // Check sources - only accumulate time if beam is not blanked
  for (const source of sources) {
    if (source.isComplete) continue;

    if (beamIntersectsSource(beam, source)) {
      if (!isBeamBlanked) {
        // Accumulate observation time only when not blanked
        source.observedTime += deltaTime;

        result.observedSources.push({
          source,
          deltaObservation: deltaTime,
        });

        // Check if observation is complete
        if (source.observedTime >= source.observationTime) {
          source.isComplete = true;
          result.completedSources.push(source);
        }
      }
    }
  }

  // Check satellites - track all in beam for continuous penalty
  for (const satellite of satellites) {
    const inBeam = beamIntersectsSatellite(beam, satellite);

    if (inBeam) {
      result.satellitesInBeam.push(satellite);

      // Track satellites that just entered beam (transition from outside to inside)
      if (!satellite.wasHit) {
        satellite.wasHit = true;
        result.hitSatellites.push(satellite);
        result.newSatellitesInBeam.push(satellite);
      }
    } else {
      // Reset wasHit when satellite leaves beam, so it can trigger again on re-entry
      satellite.wasHit = false;
    }
  }

  return result;
}
