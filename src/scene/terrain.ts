import * as THREE from 'three';

export const SEA_LEVEL = 0.0;
export const BEACH_PLAYABLE_RADIUS = 420;

export const MUSIC_TRIGGER_POINT = {
  x: -34,
  z: 62,
  radius: 13.5,
  title: 'Bones of the Tide',
  subtitle: 'Coastal Overlook · 01:45',
};

export interface UmbrellaStationSpec {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
}

export const UMBRELLA_STATIONS: UmbrellaStationSpec[] = [
  { id: 'umb-coast', name: 'Coastal Trail Umbrella', x: -38, z: 42, radius: 4.5 },
  { id: 'umb-river', name: 'Riverbank Umbrella', x: 64, z: 112, radius: 4.5 },
  { id: 'umb-foothill', name: 'Foothill Switchback Umbrella', x: -12, z: 196, radius: 4.5 },
  { id: 'umb-summit', name: 'High Pass Umbrella', x: 54, z: 318, radius: 4.5 },
];

export interface RuinSiteSpec {
  id: string;
  name: string;
  x: number;
  z: number;
  rotY: number;
  scale: number;
}

export const RUIN_SITES: RuinSiteSpec[] = [
  { id: 'ruin-tide', name: 'Shattered Tide Watch', x: -74, z: 50, rotY: 0.42, scale: 1.05 },
  { id: 'ruin-mill', name: 'Collapsed River Shack', x: 42, z: 78, rotY: -0.65, scale: 0.96 },
  { id: 'ruin-depot', name: 'Ruined Relay Depot', x: -64, z: 164, rotY: 1.15, scale: 1.15 },
  { id: 'ruin-canyon', name: 'Crumbled Canyon Outpost', x: 112, z: 214, rotY: -0.35, scale: 1.1 },
  { id: 'ruin-ridge', name: 'Abandoned Summit Bunker', x: -58, z: 294, rotY: 0.88, scale: 1.2 },
];

export interface RiverSpec {
  id: string;
  name: string;
  width: number;
  points: [number, number][];
}

export const RIVER_PATHS: RiverSpec[] = [
  {
    id: 'east-stream',
    name: 'Basalt Valley Stream',
    width: 2.9,
    points: [
      [126, 316],
      [102, 256],
      [86, 202],
      [74, 152],
      [56, 108],
      [42, 68],
      [30, 32],
      [25, -14],
    ],
  },
  {
    id: 'west-brook',
    name: 'Moss Hollow Brook',
    width: 2.4,
    points: [
      [-142, 282],
      [-114, 226],
      [-94, 174],
      [-78, 126],
      [-64, 82],
      [-55, 42],
      [-49, -14],
    ],
  },
];

export const DIRT_ROAD_PATHS: [number, number][][] = [
  // Primary coastal-to-summit mountain track passing Refuge & Foothill/Summit Umbrellas
  [
    [14, 42],
    [4, 72],
    [-14, 106],
    [-18, 134],
    [-8, 168],
    [-12, 198],
    [16, 234],
    [46, 272],
    [54, 316],
    [22, 346],
    [-34, 336],
    [-58, 298],
  ],
  // Eastern valley spur connecting to Riverbank Umbrella & Canyon Ruins
  [
    [-8, 168],
    [28, 152],
    [62, 114],
    [88, 162],
    [110, 212],
  ],
];

export interface RiverSample {
  inRiver: boolean;
  mask: number; // 0..1 channel water core
  bankMask: number; // 0..1 wet cobblestone bank edge
  depth: number;
  flowX: number;
  flowZ: number;
  riverIndex: number;
}

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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function distPointToPolyline(
  x: number,
  z: number,
  pts: [number, number][]
): { dist: number; dirX: number; dirZ: number } {
  let minDistSq = Infinity;
  let bestDirX = 0;
  let bestDirZ = -1;

  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0];
    const az = pts[i][1];
    const bx = pts[i + 1][0];
    const bz = pts[i + 1][1];
    const abx = bx - ax;
    const abz = bz - az;
    const lenSq = abx * abx + abz * abz;
    if (lenSq < 1e-6) continue;
    const t = THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / lenSq, 0, 1);
    const px = ax + abx * t;
    const pz = az + abz * t;
    const dx = x - px;
    const dz = z - pz;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq) {
      minDistSq = dSq;
      const len = Math.sqrt(lenSq);
      bestDirX = abx / len;
      bestDirZ = abz / len;
    }
  }

  return { dist: Math.sqrt(minDistSq), dirX: bestDirX, dirZ: bestDirZ };
}

/**
 * Analytical distance & flow query for the tiny meandering mountain-to-sea rivers.
 */
export function riverInfoAt(x: number, z: number): RiverSample {
  let bestMask = 0;
  let bestBankMask = 0;
  let bestDepth = 0;
  let bestFlowX = 0;
  let bestFlowZ = -1;
  let bestIdx = -1;

  for (let r = 0; r < RIVER_PATHS.length; r++) {
    const river = RIVER_PATHS[r];
    const { dist, dirX, dirZ } = distPointToPolyline(x, z, river.points);
    // Add natural gentle meander wobble so streams don't look straight
    const wobble = Math.sin(z * 0.11 + x * 0.07 + r * 2.1) * 0.75;
    const d = Math.max(0, dist + wobble * 0.42);
    const halfW = river.width * 0.5;
    const channelMask = 1.0 - smoothstep(halfW * 0.48, halfW * 1.25, d);
    const bankMask = 1.0 - smoothstep(halfW * 0.9, halfW * 2.35, d);

    if (channelMask > bestMask || bankMask > bestBankMask) {
      if (channelMask > bestMask) {
        bestMask = channelMask;
        bestFlowX = dirX;
        bestFlowZ = dirZ;
        bestIdx = r;
        bestDepth = channelMask * 0.46;
      }
      if (bankMask > bestBankMask) {
        bestBankMask = bankMask;
      }
    }
  }

  return {
    inRiver: bestMask > 0.24,
    mask: bestMask,
    bankMask: bestBankMask,
    depth: bestDepth,
    flowX: bestFlowX,
    flowZ: bestFlowZ,
    riverIndex: bestIdx,
  };
}

/**
 * Analytical mask (0..1) for the packed dirt roads winding up into the high mountains.
 */
export function dirtRoadMaskAt(x: number, z: number): number {
  let best = 0;
  for (let p = 0; p < DIRT_ROAD_PATHS.length; p++) {
    const { dist } = distPointToPolyline(x, z, DIRT_ROAD_PATHS[p]);
    const roadW = p === 0 ? 1.85 : 1.55;
    const m = 1.0 - smoothstep(roadW * 0.7, roadW * 1.75, dist);
    if (m > best) best = m;
  }
  return best;
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
  const smoothFrac =
    0.5 +
    (0.5 * Math.tanh((frac - 0.5) * sharpness)) / Math.tanh(0.5 * sharpness);
  return (idx + smoothFrac) * stepHeight;
}

/**
 * Evaluates base land elevation prior to river channel carving & road grading.
 */
function baseLandHeightAt(x: number, z: number, shoreZ: number, roadFlatten: number): number {
  const distFromShore = z - shoreZ;
  if (distFromShore < 0) {
    const shallow = Math.tanh(distFromShore * 0.05) * 1.9;
    const shelfRipple =
      Math.sin(x * 0.14 + z * 0.18) * 0.08 +
      Math.cos(x * 0.07 - z * 0.11) * 0.12;
    return shallow + shelfRipple * Math.min(1, Math.abs(distFromShore) * 0.05);
  }

  const berm = Math.tanh(distFromShore * 0.042) * 1.5;
  const upperRise = Math.max(0, distFromShore - 28) * 0.074;

  // Multi-octave hills, ridges, and sunken gullies inland
  const inlandMask = smoothstep(8, 36, distFromShore);
  const hills =
    (Math.sin(x * 0.024 + 0.4) * Math.cos(z * 0.026 - 0.3) * 4.4 +
      Math.sin(x * 0.055 - z * 0.044) * 2.05 +
      Math.cos(x * 0.105 + z * 0.092) * 0.72 +
      Math.sin(x * 0.17 - z * 0.15) * 0.25) *
    (1 - roadFlatten * 0.52);

  // Sheltered lower basins/hollows carved smoothly into the topography
  const basin =
    -Math.max(0, Math.sin(x * 0.032 - 1.2) * Math.sin(z * 0.035 + 0.7)) *
    2.3 *
    (1 - roadFlatten * 0.45);

  // Elevated scenic overlook ridge around the music trigger point (-34, 62)
  const ridgeDist = Math.hypot(x - MUSIC_TRIGGER_POINT.x, z - MUSIC_TRIGGER_POINT.z);
  const overlookMound = Math.exp(-(ridgeDist * ridgeDist) / 480) * 3.1;

  // Keep spawn, Outpost, Refuge, Umbrella Stations & Ruins smoothly padded
  const postDist = Math.hypot(x - 14, z - 36);
  const refugeDist = Math.hypot(x + 20, z - 128);
  let padFlatten =
    (1.0 - Math.exp(-(postDist * postDist) / 190)) *
    (1.0 - Math.exp(-(refugeDist * refugeDist) / 95));

  for (let i = 0; i < UMBRELLA_STATIONS.length; i++) {
    const s = UMBRELLA_STATIONS[i];
    const sd = Math.hypot(x - s.x, z - s.z);
    padFlatten *= 1.0 - Math.exp(-(sd * sd) / 68) * 0.85;
  }
  for (let i = 0; i < RUIN_SITES.length; i++) {
    const r = RUIN_SITES[i];
    const rd = Math.hypot(x - r.x, z - r.z);
    padFlatten *= 1.0 - Math.exp(-(rd * rd) / 80) * 0.75;
  }
  padFlatten *= 1.0 - roadFlatten * 0.72;

  // Mid-coast steep basalt cliff terraces (climbable with hands or ladders)
  const coastalCliffMask = smoothstep(42, 68, distFromShore) * padFlatten;
  const coastalStepBase =
    Math.max(0, distFromShore - 42) * 0.15 + Math.sin(x * 0.036 + 0.8) * 2.6;
  const coastalEscarpment = steppedCliff(Math.max(0, coastalStepBase), 3.4, 15.0) * 0.58;

  // Stepped desert-rock foothills & higher steep climbable mountain escarpments
  const mountainMask =
    smoothstep(72, 126, distFromShore) * (0.35 + 0.65 * padFlatten);
  const baseSlope =
    Math.max(0, distFromShore - 72) * 0.21 +
    Math.sin(x * 0.022 - 0.7) * 4.8 * (1 - roadFlatten * 0.5) +
    Math.cos(x * 0.045 + z * 0.015) * 2.5 * (1 - roadFlatten * 0.5);
  const terracedEscarpment = steppedCliff(Math.max(0, baseSlope), 4.4, 16.5);
  const highPeakSurge =
    smoothstep(130, 315, distFromShore) *
    (14.5 +
      Math.sin(x * 0.028 + 1.1) * 4.6 * (1 - roadFlatten * 0.55) +
      Math.cos(z * 0.025) * 3.2 * (1 - roadFlatten * 0.55));
  const canyonCarve =
    (Math.sin(x * 0.034 + Math.sin(z * 0.02) * 1.2) * 2.2 +
      Math.cos(x * 0.072 - z * 0.048) * 0.85) *
    (1 - roadFlatten * 0.65);

  // Smooth graded mountain incline along dirt roads when climbing cliffs
  const roadRampBonus =
    roadFlatten *
    smoothstep(42, 340, distFromShore) *
    (Math.max(0, distFromShore - 42) * 0.115);

  let h =
    berm +
    upperRise +
    (hills + basin) * inlandMask +
    overlookMound +
    coastalCliffMask * coastalEscarpment +
    mountainMask * (terracedEscarpment + canyonCarve) +
    highPeakSurge +
    roadRampBonus;

  // Dramatic craggy mountain amphitheater near outer 420m playable perimeter
  const radial = Math.hypot(x, z * 0.88);
  if (radial > 368) {
    const rimT = smoothstep(368, 535, radial);
    const crag =
      Math.sin(x * 0.055) * Math.cos(z * 0.055) * 5.2 +
      Math.sin(x * 0.14 + z * 0.12) * 1.65;
    const landMask = smoothstep(-18, 30, z - shoreZ);
    h += rimT * landMask * (36.0 + crag);
  }

  return h;
}

/**
 * Analytical terrain heightfield with coastal dunes, grassy hollows,
 * tiny river beds, graded mountain dirt roads, and high desert-rock mountains.
 */
export function groundHeightAt(x: number, z: number): number {
  const shoreZ = shorelineZAt(x);
  const distFromShore = z - shoreZ;
  const roadMask = dirtRoadMaskAt(x, z);

  let h = baseLandHeightAt(x, z, shoreZ, roadMask);

  // Carve shallow, wadeable meandering river channels into coastal & highland valleys
  if (distFromShore > -6) {
    const river = riverInfoAt(x, z);
    if (river.bankMask > 0.001) {
      // Smooth local cross-section gently and carve shallow rocky streambed
      const shoreTaper = smoothstep(-4, 14, distFromShore);
      const bedDepth = (0.38 + shoreTaper * 0.34) * river.mask;
      const bankSoft = river.bankMask * 0.14 * shoreTaper;
      h -= bedDepth + bankSoft;
    }
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
 */
export function mossCoverageAt(x: number, z: number, height: number): number {
  const distFromShore = z - shorelineZAt(x);
  if (distFromShore < 7) return 0;

  const inlandFactor = smoothstep(8, 28, distFromShore);
  const aridFade = 1.0 - smoothstep(155, 250, distFromShore);
  const elevFactor = smoothstep(0.75, 2.5, height);
  const patch =
    Math.sin(x * 0.042 + z * 0.036) * 0.35 +
    Math.cos(x * 0.085 - z * 0.068) * 0.28 +
    0.68;
  const roadSuppression = 1.0 - dirtRoadMaskAt(x, z) * 0.92;
  return THREE.MathUtils.clamp(
    inlandFactor * aridFade * (0.4 * elevFactor + 0.6 * patch) * roadSuppression,
    0,
    1
  );
}

/**
 * Evaluates desert rock coverage (0 = coastal volcanic beach/grass, 1 = arid sandstone/canyon mountains).
 */
export function desertRockCoverageAt(x: number, z: number, height: number): number {
  const distFromShore = z - shorelineZAt(x);
  const distBlend = smoothstep(132, 238, distFromShore);
  const elevBlend = smoothstep(11.0, 21.5, height);
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
 * Resolves horizontal position against circular rock/ruin/tree colliders and invisible perimeter wall.
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
