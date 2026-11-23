import * as THREE from 'three';

export const SEA_LEVEL = 0.0;
export const BEACH_PLAYABLE_RADIUS = 135;

export interface ObstacleCollider {
  x: number;
  z: number;
  radius: number;
}

/**
 * Deterministic shoreline curve:
 * -z goes toward the open dark ocean
 * +z rises gently into black volcanic dunes and basalt cliffs
 */
export function shorelineZAt(x: number): number {
  return (
    Math.sin(x * 0.022) * 7.5 +
    Math.cos(x * 0.058 + 1.1) * 3.2 +
    Math.sin(x * 0.009 - 0.5) * 11.0
  );
}

/**
 * Analytical terrain heightfield for the volcanic beach.
 * Ensures smooth, realistic shore slope, tidal sandbars, and rising basalt dunes.
 */
export function groundHeightAt(x: number, z: number): number {
  const shoreZ = shorelineZAt(x);
  const distFromShore = z - shoreZ;

  // Base slope from seabed (-z) up onto dry beach (+z)
  let h = 0;
  if (distFromShore < 0) {
    // Gradual shallow shelf into deeper dark ocean
    const shallow = Math.tanh(distFromShore * 0.055) * 1.8;
    const shelfRipple =
      Math.sin(x * 0.14 + z * 0.18) * 0.08 +
      Math.cos(x * 0.07 - z * 0.11) * 0.12;
    h = shallow + shelfRipple * Math.min(1, Math.abs(distFromShore) * 0.05);
  } else {
    // Smooth tidal berm then rolling black sand dunes
    const berm = Math.tanh(distFromShore * 0.045) * 1.45;
    const upperRise = Math.max(0, distFromShore - 28) * 0.085;
    const duneWave =
      (Math.sin(x * 0.036 + z * 0.028) * 0.65 +
        Math.cos(x * 0.082 - z * 0.064) * 0.28 +
        Math.sin(x * 0.17 + z * 0.13) * 0.08) *
      THREE.MathUtils.smoothstep(distFromShore, 4, 34);
    h = berm + upperRise + duneWave;
  }

  // Natural cove headlands framing left & right edges of the beach
  const radial = Math.hypot(x, z * 0.82);
  if (radial > 95) {
    const rimT = THREE.MathUtils.smoothstep(radial, 95, 195);
    const crag =
      Math.sin(x * 0.09) * Math.cos(z * 0.09) * 1.8 +
      Math.sin(x * 0.21 + z * 0.17) * 0.65;
    // Keep ocean side (-z) open to horizon
    const landMask = THREE.MathUtils.smoothstep(z - shoreZ, -18, 25);
    h += rimT * landMask * (11.5 + crag);
  }

  // Subtle wet-sand tide channels near shore
  const tideChannel =
    Math.sin(x * 0.12 + Math.sin(z * 0.08) * 1.5) *
    0.09 *
    Math.exp(-Math.pow((distFromShore - 2.5) / 8.0, 2));

  return h + tideChannel;
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
 * Resolves horizontal position against circular rock/leviathan colliders and cove perimeter.
 */
export function resolveCharacterCollisions(
  pos: THREE.Vector3,
  colliders: ObstacleCollider[],
  charRadius = 0.45
): void {
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

  // Softly keep player from wandering into deep abyssal ocean or past outer cliffs
  const shoreZ = shorelineZAt(pos.x);
  const minZ = shoreZ - 14.0; // Allow wading waist-deep into the surf
  if (pos.z < minZ) {
    pos.z = minZ;
  }

  const maxR = BEACH_PLAYABLE_RADIUS;
  const r = Math.hypot(pos.x, pos.z);
  if (r > maxR) {
    const scale = maxR / r;
    pos.x *= scale;
    pos.z *= scale;
  }
}
