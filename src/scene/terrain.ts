import * as THREE from 'three';

export const SEA_LEVEL = 0.0;
export const BEACH_PLAYABLE_RADIUS = 210;

export interface ObstacleCollider {
  x: number;
  z: number;
  radius: number;
}

export interface BoundaryImpact {
  hit: boolean;
  x: number;
  z: number;
  nx: number;
  nz: number;
}

/**
 * Deterministic shoreline curve:
 * -z goes toward the open dark ocean
 * +z rises into black volcanic dunes, grassy hollows, and mossy small hills
 */
export function shorelineZAt(x: number): number {
  return (
    Math.sin(x * 0.018) * 9.5 +
    Math.cos(x * 0.045 + 1.1) * 4.2 +
    Math.sin(x * 0.008 - 0.5) * 13.0
  );
}

/**
 * Analytical terrain heightfield for the expanded volcanic & mossy coastal topography.
 */
export function groundHeightAt(x: number, z: number): number {
  const shoreZ = shorelineZAt(x);
  const distFromShore = z - shoreZ;

  let h = 0;
  if (distFromShore < 0) {
    // Gradual shallow shelf into deeper dark ocean
    const shallow = Math.tanh(distFromShore * 0.05) * 1.9;
    const shelfRipple =
      Math.sin(x * 0.14 + z * 0.18) * 0.08 +
      Math.cos(x * 0.07 - z * 0.11) * 0.12;
    h = shallow + shelfRipple * Math.min(1, Math.abs(distFromShore) * 0.05);
  } else {
    // Tidal berm transitioning into rolling dunes, lower hollows, and small mossy hills
    const berm = Math.tanh(distFromShore * 0.042) * 1.5;
    const upperRise = Math.max(0, distFromShore - 32) * 0.055;

    // Small hills and lower ground depressions inland
    const inlandMask = THREE.MathUtils.smoothstep(distFromShore, 8, 42);
    const hills =
      Math.sin(x * 0.024 + 0.4) * Math.cos(z * 0.026 - 0.3) * 3.4 +
      Math.sin(x * 0.052 - z * 0.041) * 1.45 +
      Math.cos(x * 0.095 + z * 0.085) * 0.45;

    // Sheltered lower basins/hollows carved smoothly into the topography
    const basin =
      -Math.max(0, Math.sin(x * 0.032 - 1.2) * Math.sin(z * 0.035 + 0.7)) * 1.65;

    h = berm + upperRise + (hills + basin) * inlandMask;
  }

  // Natural cove headlands near outer boundary
  const radial = Math.hypot(x, z * 0.85);
  if (radial > 165) {
    const rimT = THREE.MathUtils.smoothstep(radial, 165, 290);
    const crag =
      Math.sin(x * 0.07) * Math.cos(z * 0.07) * 2.4 +
      Math.sin(x * 0.18 + z * 0.14) * 0.8;
    const landMask = THREE.MathUtils.smoothstep(z - shoreZ, -20, 28);
    h += rimT * landMask * (14.5 + crag);
  }

  // Subtle wet-sand tide channels near shore
  const tideChannel =
    Math.sin(x * 0.12 + Math.sin(z * 0.08) * 1.5) *
    0.09 *
    Math.exp(-Math.pow((distFromShore - 2.5) / 8.0, 2));

  return h + tideChannel;
}

/**
 * Evaluates moss/grass coverage (0 = pure black volcanic sand, 1 = rich mossy hill turf).
 */
export function mossCoverageAt(x: number, z: number, height: number): number {
  const distFromShore = z - shorelineZAt(x);
  if (distFromShore < 10) return 0;

  const inlandFactor = THREE.MathUtils.smoothstep(distFromShore, 12, 38);
  const elevFactor = THREE.MathUtils.smoothstep(height, 1.05, 3.1);
  const patch =
    Math.sin(x * 0.045 + z * 0.038) * 0.5 +
    Math.cos(x * 0.09 - z * 0.07) * 0.35 +
    0.45;
  return THREE.MathUtils.clamp(inlandFactor * (0.45 * elevFactor + 0.55 * patch), 0, 1);
}

const _nTmp = new THREE.Vector3();

/**
 * Finite-difference surface normal at (x, z). Writes into `out` to avoid GC.
 */
export function groundNormalAt(
  x: number,
  z: number,
  out: THREE.Vector3 = _nTmp
): THREE.Vector3 {
  const eps = 0.35;
  const hL = groundHeightAt(x - eps, z);
  const hR = groundHeightAt(x + eps, z);
  const hD = groundHeightAt(x, z - eps);
  const hU = groundHeightAt(x, z + eps);
  out.set(hL - hR, 2 * eps, hD - hU).normalize();
  return out;
}

/**
 * Resolves horizontal position against circular rock/leviathan colliders and invisible perimeter wall.
 * Returns boundary impact details when player hits the edge of the playable map.
 */
export function resolveCharacterCollisions(
  pos: THREE.Vector3,
  colliders: ObstacleCollider[],
  charRadius = 0.45
): BoundaryImpact {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const minDist = c.radius + charRadius;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist && distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      const push = (minDist - dist) / dist;
      pos.x += dx * push;
      pos.z += dz * push;
    }
  }

  let hit = false;
  let impactX = pos.x;
  let impactZ = pos.z;
  let nx = 0;
  let nz = 0;

  // Ocean deep-water invisible barrier
  const shoreZ = shorelineZAt(pos.x);
  const minZ = shoreZ - 15.0;
  if (pos.z <= minZ) {
    pos.z = minZ;
    hit = true;
    impactX = pos.x;
    impactZ = minZ;
    nx = 0;
    nz = 1;
  }

  // Outer perimeter invisible wall
  const maxR = BEACH_PLAYABLE_RADIUS;
  const r = Math.hypot(pos.x, pos.z);
  if (r >= maxR) {
    const scale = maxR / r;
    pos.x *= scale;
    pos.z *= scale;
    hit = true;
    impactX = pos.x;
    impactZ = pos.z;
    nx = -pos.x / maxR;
    nz = -pos.z / maxR;
  }

  return { hit, x: impactX, z: impactZ, nx, nz };
}
