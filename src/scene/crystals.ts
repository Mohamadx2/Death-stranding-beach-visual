import * as THREE from 'three';
import {
  BEACH_PLAYABLE_RADIUS,
  MUSIC_TRIGGER_POINT,
  ObstacleCollider,
  UMBRELLA_STATIONS,
  dirtRoadMaskAt,
  groundHeightAt,
  groundNormalAt,
  riverInfoAt,
  shorelineZAt,
} from './terrain';

export interface ChiralCrystalNode {
  id: number;
  x: number;
  z: number;
  yieldCg: number;
  collected: boolean;
  group: THREE.Group;
  shimmerScale: number;
}

export interface SavedCrystalNode {
  x: number;
  z: number;
  yieldCg: number;
  collected: boolean;
  scale: number;
}

export interface CrystalSystem {
  group: THREE.Group;
  getNearbyCrystal: (playerPos: THREE.Vector3) => ChiralCrystalNode | null;
  collectNearby: (playerPos: THREE.Vector3) => number;
  exportState: () => SavedCrystalNode[];
  importState: (saved: SavedCrystalNode[]) => void;
  resetCrystals: (colliders: ObstacleCollider[]) => void;
  update: (
    elapsed: number,
    delta: number,
    scanRadius: number,
    scanStrength: number,
    scanOrigin: THREE.Vector3
  ) => void;
  dispose: () => void;
}

const _up = new THREE.Vector3(0, 1, 0);
const _norm = new THREE.Vector3();

function createCrystalHandMesh(
  crystalMat: THREE.Material,
  tarMat: THREE.Material,
  seed: number
): THREE.Group {
  const hand = new THREE.Group();

  // Compact dark-gold chiral tar puddle base so crystals stay subtle and tucked into ground
  const puddleGeo = new THREE.CylinderGeometry(0.38, 0.46, 0.035, 9);
  puddleGeo.scale(1.12, 1.0, 0.92);
  const puddle = new THREE.Mesh(puddleGeo, tarMat);
  puddle.position.y = 0.015;
  puddle.rotation.y = seed * 0.7;
  puddle.receiveShadow = true;
  hand.add(puddle);

  const moundGeo = new THREE.DodecahedronGeometry(0.22, 1);
  moundGeo.scale(1.2, 0.42, 1.0);
  const mound = new THREE.Mesh(moundGeo, tarMat);
  mound.position.y = 0.055;
  hand.add(mound);

  // Faceted golden palm core
  const palmGeo = new THREE.DodecahedronGeometry(0.24, 0);
  palmGeo.scale(1.1, 1.15, 0.65);
  const palm = new THREE.Mesh(palmGeo, crystalMat);
  palm.position.set(0, 0.3, 0);
  palm.castShadow = true;
  hand.add(palm);

  // 5 Splayed Multi-Jointed Crystal Fingers + Tip Prisms
  const fingerSpecs = [
    { x: -0.21, z: 0.04, tiltZ: 0.68, tiltX: 0.14, len: 0.44, r: 0.068 }, // Thumb
    { x: -0.11, z: 0.01, tiltZ: 0.28, tiltX: -0.06, len: 0.58, r: 0.072 }, // Index
    { x: 0.0, z: -0.02, tiltZ: 0.02, tiltX: -0.1, len: 0.66, r: 0.076 }, // Middle
    { x: 0.12, z: 0.0, tiltZ: -0.26, tiltX: -0.05, len: 0.56, r: 0.07 }, // Ring
    { x: 0.22, z: 0.05, tiltZ: -0.58, tiltX: 0.12, len: 0.43, r: 0.062 }, // Pinky
  ];

  const segGeo = new THREE.CylinderGeometry(0.75, 1.0, 1.0, 5);
  const tipGeo = new THREE.ConeGeometry(0.75, 0.65, 5);

  for (let i = 0; i < fingerSpecs.length; i++) {
    const f = fingerSpecs[i];
    const fingerRoot = new THREE.Group();
    fingerRoot.position.set(f.x, 0.28, f.z);
    fingerRoot.rotation.set(f.tiltX, ((seed + i) % 5) * 0.12, f.tiltZ);

    const lowerLen = f.len * 0.56;
    const lower = new THREE.Mesh(segGeo, crystalMat);
    lower.scale.set(f.r, lowerLen, f.r);
    lower.position.y = lowerLen * 0.5;
    lower.castShadow = true;
    fingerRoot.add(lower);

    const upperPivot = new THREE.Group();
    upperPivot.position.y = lowerLen * 0.92;
    upperPivot.rotation.set(0.18, 0.1, f.tiltZ * 0.25);
    fingerRoot.add(upperPivot);

    const upperLen = f.len * 0.48;
    const upper = new THREE.Mesh(segGeo, crystalMat);
    upper.scale.set(f.r * 0.82, upperLen, f.r * 0.82);
    upper.position.y = upperLen * 0.5;
    upper.castShadow = true;
    upperPivot.add(upper);

    const tip = new THREE.Mesh(tipGeo, crystalMat);
    tip.scale.set(f.r * 0.82, f.r * 2.4, f.r * 0.82);
    tip.position.y = upperLen + f.r * 0.65;
    upperPivot.add(tip);

    hand.add(fingerRoot);
  }

  // Smaller basal crystal spurs around the wrist
  const spurGeo = new THREE.ConeGeometry(0.055, 0.24, 5);
  for (let s = 0; s < 4; s++) {
    const ang = (s / 4) * Math.PI * 2 + seed;
    const spur = new THREE.Mesh(spurGeo, crystalMat);
    spur.position.set(Math.cos(ang) * 0.22, 0.16, Math.sin(ang) * 0.22);
    spur.rotation.set(Math.sin(ang) * 0.5, ang, -Math.cos(ang) * 0.5);
    hand.add(spur);
  }

  return hand;
}

export function createChiralCrystalSystem(
  scene: THREE.Scene,
  colliders: ObstacleCollider[],
  isSoftwareGl: boolean
): CrystalSystem {
  const group = new THREE.Group();
  scene.add(group);
  const disposables: { dispose: () => void }[] = [];

  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xc9a944,
    emissive: 0x261d04,
    emissiveIntensity: 0.16,
    roughness: 0.24,
    metalness: 0.88,
    flatShading: true,
  });

  const tarMat = new THREE.MeshStandardMaterial({
    color: 0x2c2610,
    roughness: 0.18,
    metalness: 0.82,
  });

  disposables.push(crystalMat, tarMat);

  const nodes: ChiralCrystalNode[] = [];
  const totalClusters = 36;

  const isSpotClear = (x: number, z: number): boolean => {
    if (Math.hypot(x, z - 18) < 10.5) return false;
    if (Math.hypot(x - 14, z - 36) < 10.5) return false;
    if (Math.hypot(x - MUSIC_TRIGGER_POINT.x, z - MUSIC_TRIGGER_POINT.z) < 7.5) return false;
    if (z < shorelineZAt(x) + 3.0) return false;
    if (riverInfoAt(x, z).bankMask > 0.15) return false;
    if (dirtRoadMaskAt(x, z) > 0.2) return false;
    for (const s of UMBRELLA_STATIONS) {
      if (Math.hypot(x - s.x, z - s.z) < 5.5) return false;
    }
    if (groundNormalAt(x, z, _norm).y < 0.72) return false;
    for (const c of colliders) {
      if (Math.hypot(x - c.x, z - c.z) < c.radius + 1.05) return false;
    }
    for (const n of nodes) {
      if (Math.hypot(x - n.x, z - n.z) < 9.5) return false;
    }
    return true;
  };

  const spawnCrystals = () => {
    for (const n of nodes) {
      n.group.parent?.remove(n.group);
    }
    nodes.length = 0;

    for (let i = 0; i < totalClusters; i++) {
      let cx = 0;
      let cz = 0;
      let placed = false;
      for (let attempt = 0; attempt < 55; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 16 + Math.random() * (BEACH_PLAYABLE_RADIUS - 42);
        const tx = Math.cos(angle) * dist;
        const tz = Math.sin(angle) * dist * 0.76 + 44;
        if (Math.hypot(tx, tz) < BEACH_PLAYABLE_RADIUS - 18 && isSpotClear(tx, tz)) {
          cx = tx;
          cz = tz;
          placed = true;
          break;
        }
      }
      if (!placed) continue;

      const scale = 0.34 + Math.random() * 0.22;
      const yieldCg = Math.round((20 + scale * 32) / 5) * 5;
      const handMesh = createCrystalHandMesh(crystalMat, tarMat, i + 1);
      if (isSoftwareGl) {
        handMesh.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) obj.castShadow = false;
        });
      }

      const cy = groundHeightAt(cx, cz);
      groundNormalAt(cx, cz, _norm);
      handMesh.position.set(cx, cy - 0.055, cz);
      handMesh.quaternion.setFromUnitVectors(_up, _norm);
      handMesh.rotateY(Math.random() * Math.PI * 2);
      handMesh.scale.setScalar(scale);

      group.add(handMesh);
      nodes.push({
        id: i,
        x: cx,
        z: cz,
        yieldCg,
        collected: false,
        group: handMesh,
        shimmerScale: scale,
      });
    }
  };

  spawnCrystals();

  const getNearbyCrystal = (playerPos: THREE.Vector3): ChiralCrystalNode | null => {
    let best: ChiralCrystalNode | null = null;
    let bestDist = 2.35;
    for (const n of nodes) {
      if (n.collected) continue;
      const d = Math.hypot(playerPos.x - n.x, playerPos.z - n.z);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  };

  const collectNearby = (playerPos: THREE.Vector3): number => {
    const node = getNearbyCrystal(playerPos);
    if (!node) return 0;
    node.collected = true;
    node.group.visible = false;
    return node.yieldCg;
  };

  const update = (
    elapsed: number,
    _delta: number,
    _scanRadius: number,
    _scanStrength: number,
    _scanOrigin: THREE.Vector3
  ) => {
    for (const n of nodes) {
      if (n.collected) continue;
      // Subtle chiral hand breathing sway without scan highlights or map indicators
      const breath = 1.0 + Math.sin(elapsed * 2.1 + n.id) * 0.02;
      n.group.scale.set(
        n.shimmerScale,
        n.shimmerScale * breath,
        n.shimmerScale
      );
    }
    crystalMat.emissiveIntensity = 0.16;
  };

  const exportState = (): SavedCrystalNode[] =>
    nodes.map((n) => ({
      x: n.x,
      z: n.z,
      yieldCg: n.yieldCg,
      collected: n.collected,
      scale: n.shimmerScale,
    }));

  const importState = (saved: SavedCrystalNode[]) => {
    for (const n of nodes) {
      n.group.parent?.remove(n.group);
    }
    nodes.length = 0;

    saved.forEach((s, i) => {
      const handMesh = createCrystalHandMesh(crystalMat, tarMat, i + 1);
      if (isSoftwareGl) {
        handMesh.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) obj.castShadow = false;
        });
      }
      const cy = groundHeightAt(s.x, s.z);
      groundNormalAt(s.x, s.z, _norm);
      handMesh.position.set(s.x, cy - 0.055, s.z);
      handMesh.quaternion.setFromUnitVectors(_up, _norm);
      handMesh.rotateY((i * 1.37) % (Math.PI * 2));
      handMesh.scale.setScalar(s.scale);
      handMesh.visible = !s.collected;
      group.add(handMesh);

      nodes.push({
        id: i,
        x: s.x,
        z: s.z,
        yieldCg: s.yieldCg,
        collected: s.collected,
        group: handMesh,
        shimmerScale: s.scale,
      });
    });
  };

  const dispose = () => {
    scene.remove(group);
    disposables.forEach((d) => d.dispose());
  };

  return {
    group,
    getNearbyCrystal,
    collectNearby,
    exportState,
    importState,
    resetCrystals: () => spawnCrystals(),
    update,
    dispose,
  };
}
