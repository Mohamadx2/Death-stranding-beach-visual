import * as THREE from 'three';

export const SEA_LEVEL = 0.0;
export const BEACH_PLAYABLE_RADIUS = 300;

export const MUSIC_TRIGGER_POINT = {
  x: -34,
  z: 62,
  radius: 13.5,
  title: 'Bones of the Tide',
  subtitle: 'Coastal Overlook · 01:45',
};

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
 * +z rises into black volcanic dunes, grassy hollows, and desert-rock mountains
 */
export function shorelineZAt(x: number): number {
  return (
    Math.sin(x * 0.018) * 9.5 +
    Math.cos(x * 0.045 + 1.1) * 4.2 +
    Math.sin(x * 0.008 - 0.5) * 13.0
  );
}

/**
 * Smoothly stepped ramp for climbable desert cliff terraces.
 */
function steppedCliff(value: number, stepHeight: number, sharpness: number): number {
  const scaled = value / stepHeight;
  const idx = Math.floor(scaled);
  const frac = scaled - idx;
  const smoothFrac = 0.5 + 0.5 * Math.tanh((frac - 0.5) * sharpness) / Math.tanh(0.5 * sharpness);
  return (idx + smoothFrac) * stepHeight;
}

/**
 * Analytical terrain heightfield with coastal dunes, grassy hollows,
 * stepped desert-rock foothills, and steep climbable mountain escarpments.
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
    // Tidal berm transitioning into rolling dunes, lower hollows, and coastal hills
    const berm = Math.tanh(distFromShore * 0.042) * 1.5;
    const upperRise = Math.max(0, distFromShore - 30) * 0.055;

    // Multi-octave hills, ridges, and sunken gullies inland
    const inlandMask = THREE.MathUtils.smoothstep(distFromShore, 8, 38);
    const hills =
      Math.sin(x * 0.024 + 0.4) * Math.cos(z * 0.026 - 0.3) * 4.0 +
      Math.sin(x * 0.055 - z * 0.044) * 1.85 +
      Math.cos(x * 0.105 + z * 0.092) * 0.68 +
      Math.sin(x * 0.17 - z * 0.15) * 0.25;

    // Sheltered lower basins/hollows carved smoothly into the topography
    const basin =
      -Math.max(0, Math.sin(x * 0.032 - 1.2) * Math.sin(z * 0.035 + 0.7)) * 2.2;

    // Elevated scenic overlook ridge around the music trigger point (-34, 62)
    const ridgeDist = Math.hypot(x - MUSIC_TRIGGER_POINT.x, z - MUSIC_TRIGGER_POINT.z);
    const overlookMound = Math.exp(-(ridgeDist * ridgeDist) / 480) * 2.8;

    // Stepped desert-rock foothills & steep climbable mountain escarpments (inland z > 80m)
    const mountainMask = THREE.MathUtils.smoothstep(distFromShore, 75, 130);
    const baseSlope =
      Math.max(0, distFromShore - 75) * 0.155 +
      Math.sin(x * 0.022 - 0.7) * 4.2 +
      Math.cos(x * 0.045 + z * 0.015) * 2.2;
    const terracedEscarpment = steppedCliff(Math.max(0, baseSlope), 3.6, 11.5);
    const canyonCarve =
      Math.sin(x * 0.034 + Math.sin(z * 0.02) * 1.2) * 1.9 +
      Math.cos(x * 0.072 - z * 0.048) * 0.75;

    h =
      berm +
      upperRise +
      (hills + basin) * inlandMask +
      overlookMound +
      mountainMask * (terracedEscarpment + canyonCarve);
  }

  // Dramatic craggy mountain amphitheater near outer 300m playable perimeter
  const radial = Math.hypot(x, z * 0.86);
  if (radial > 248) {
    const rimT = THREE.MathUtils.smoothstep(radial, 248, 390);
    const crag =
      Math.sin(x * 0.06) * Math.cos(z * 0.06) * 3.8 +
      Math.sin(x * 0.15 + z * 0.13) * 1.25;
    const landMask = THREE.MathUtils.smoothstep(z - shoreZ, -18, 30);
    h += rimT * landMask * (26.0 + crag);
  }

  // Subtle wet-sand tide channels near shore
  const tideChannel =
    Math.sin(x * 0.12 + Math.sin(z * 0.08) * 1.5) *
    0.11 *
    Math.exp(-Math.pow((distFromShore - 2.5) / 8.0, 2));

  return h + tideChannel;
}

/**
 * Evaluates moss/grass coverage (0 = pure black volcanic sand, 1 = rich mossy hill turf).
 * Expanded across coastal hills, sheltered hollows, and lower cliff shelves before arid desert rock.
 */
export function mossCoverageAt(x: number, z: number, height: number): number {
  const distFromShore = z - shorelineZAt(x);
  if (distFromShore < 7) return 0;

  const inlandFactor = THREE.MathUtils.smoothstep(distFromShore, 8, 28);
  const aridFade = 1.0 - THREE.MathUtils.smoothstep(distFromShore, 130, 205);
  const elevFactor = THREE.MathUtils.smoothstep(height, 0.75, 2.5);
  const patch =
    Math.sin(x * 0.042 + z * 0.036) * 0.35 +
    Math.cos(x * 0.085 - z * 0.068) * 0.28 +
    0.68;
  return THREE.MathUtils.clamp(inlandFactor * aridFade * (0.4 * elevFactor + 0.6 * patch), 0, 1);
}

/**
 * Evaluates desert rock coverage (0 = coastal volcanic beach/grass, 1 = arid sandstone/canyon mountains).
 */
export function desertRockCoverageAt(x: number, z: number, height: number): number {
  const distFromShore = z - shorelineZAt(x);
  const distBlend = THREE.MathUtils.smoothstep(distFromShore, 108, 192);
  const elevBlend = THREE.MathUtils.smoothstep(height, 9.5, 17.5);
  return THREE.MathUtils.clamp(Math.max(distBlend, elevBlend * 0.85), 0, 1);
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
