import * as THREE from 'three';
import { groundHeightAt, groundNormalAt } from './terrain';

export interface WormNode {
  id: number;
  x: number;
  z: number;
  collected: boolean;
  group: THREE.Group;
  segments: THREE.Mesh[];
  phase: number;
}

export interface WormSystem {
  group: THREE.Group;
  getNearbyWorm: (playerPos: THREE.Vector3) => WormNode | null;
  collectNearby: (playerPos: THREE.Vector3) => boolean;
  exportState: () => number[];
  importState: (collectedIds: number[]) => void;
  resetWorms: () => void;
  update: (elapsed: number) => void;
  dispose: () => void;
}

const _up = new THREE.Vector3(0, 1, 0);
const _norm = new THREE.Vector3();

export function createWormSystem(
  scene: THREE.Scene,
  bushSpots: { x: number; z: number }[],
  isSoftwareGl: boolean
): WormSystem {
  const group = new THREE.Group();
  scene.add(group);
  const disposables: { dispose: () => void }[] = [];

  // Organic warm pale-rose/amber grub material
  const wormBodyMat = new THREE.MeshStandardMaterial({
    color: 0xd9a88f,
    emissive: 0x26140c,
    emissiveIntensity: 0.25,
    roughness: 0.42,
    metalness: 0.04,
  });
  const wormHeadMat = new THREE.MeshStandardMaterial({
    color: 0xb87f68,
    roughness: 0.36,
    metalness: 0.05,
  });
  const segGeo = new THREE.SphereGeometry(0.032, 7, 6);
  segGeo.scale(1.0, 0.82, 1.35);

  disposables.push(wormBodyMat, wormHeadMat, segGeo);

  const nodes: WormNode[] = [];

  const createWormMesh = (seed: number): { wormGroup: THREE.Group; segments: THREE.Mesh[] } => {
    const wormGroup = new THREE.Group();
    const segments: THREE.Mesh[] = [];
    const segCount = 6;
    const radii = [0.68, 0.92, 1.05, 1.0, 0.85, 0.62];

    for (let s = 0; s < segCount; s++) {
      const mat = s === 0 ? wormHeadMat : wormBodyMat;
      const seg = new THREE.Mesh(segGeo, mat);
      const r = radii[s];
      seg.scale.set(r, r, r);
      seg.position.set(0, 0.025, (s - 2.5) * 0.044);
      seg.castShadow = !isSoftwareGl;
      wormGroup.add(seg);
      segments.push(seg);
    }

    wormGroup.rotation.y = seed * 1.13;
    return { wormGroup, segments };
  };

  const spawnWorms = () => {
    for (const n of nodes) {
      n.group.parent?.remove(n.group);
    }
    nodes.length = 0;

    if (bushSpots.length === 0) return;

    const totalWorms = Math.min(96, bushSpots.length);
    const step = Math.max(1, Math.floor(bushSpots.length / totalWorms));

    for (let i = 0; i < totalWorms; i++) {
      const spotIdx = (i * step + ((i * 7) % step)) % bushSpots.length;
      const spot = bushSpots[spotIdx];
      // Place worm nestled right beside a coastal bush / grass clump
      const ang = i * 2.17 + 0.6;
      const offsetDist = 0.48 + (i % 4) * 0.19;
      const wx = spot.x + Math.cos(ang) * offsetDist;
      const wz = spot.z + Math.sin(ang) * offsetDist;
      const wy = groundHeightAt(wx, wz);

      groundNormalAt(wx, wz, _norm);
      const { wormGroup, segments } = createWormMesh(i + 1);
      wormGroup.position.set(wx, wy + 0.008, wz);
      wormGroup.quaternion.setFromUnitVectors(_up, _norm);
      wormGroup.rotateY(ang + 1.2);
      wormGroup.scale.setScalar(1.08 + (i % 3) * 0.14);

      group.add(wormGroup);
      nodes.push({
        id: i,
        x: wx,
        z: wz,
        collected: false,
        group: wormGroup,
        segments,
        phase: i * 1.4,
      });
    }
  };

  spawnWorms();

  const getNearbyWorm = (playerPos: THREE.Vector3): WormNode | null => {
    let best: WormNode | null = null;
    let bestDist = 2.25;
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

  const collectNearby = (playerPos: THREE.Vector3): boolean => {
    const node = getNearbyWorm(playerPos);
    if (!node) return false;
    node.collected = true;
    node.group.visible = false;
    return true;
  };

  const exportState = (): number[] => {
    const collected: number[] = [];
    for (const n of nodes) {
      if (n.collected) collected.push(n.id);
    }
    return collected;
  };

  const importState = (collectedIds: number[]) => {
    const set = new Set(collectedIds);
    for (const n of nodes) {
      const isCol = set.has(n.id);
      n.collected = isCol;
      n.group.visible = !isCol;
    }
  };

  const update = (elapsed: number) => {
    for (const n of nodes) {
      if (n.collected) continue;
      const t = elapsed * 4.8 + n.phase;
      for (let s = 0; s < n.segments.length; s++) {
        const seg = n.segments[s];
        const wave = Math.sin(t - s * 0.72);
        seg.position.x = wave * 0.022;
        seg.position.y = 0.024 + Math.max(0, Math.cos(t - s * 0.72)) * 0.012;
      }
    }
  };

  const dispose = () => {
    scene.remove(group);
    disposables.forEach((d) => d.dispose());
  };

  return {
    group,
    getNearbyWorm,
    collectNearby,
    exportState,
    importState,
    resetWorms: () => spawnWorms(),
    update,
    dispose,
  };
}
