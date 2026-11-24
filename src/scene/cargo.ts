import * as THREE from 'three';
import { ProceduralTextureSet } from './materials';
import {
  BEACH_PLAYABLE_RADIUS,
  ObstacleCollider,
  groundHeightAt,
  groundNormalAt,
  shorelineZAt,
} from './terrain';

export type CargoKind = 'resin' | 'bridges';

export const MAX_CARRY_CARGOS = 6;

export interface CargoItem {
  id: number;
  kind: CargoKind;
  label: string;
  weightKg: number;
  mesh: THREE.Group;
  beacon: THREE.Mesh;
  x: number;
  z: number;
  state: 'world' | 'carried' | 'delivered';
}

export interface MinimapCargoBlip {
  id: number;
  x: number;
  z: number;
  kind: CargoKind;
  weightKg: number;
}

export interface CargoMissionStatus {
  total: number;
  carried: number;
  maxCarry: number;
  delivered: number;
  carriedWeightKg: number;
  nearbyCargoLabel: string | null;
  nearbyCargoWeightKg: number | null;
  backpackFull: boolean;
  nearDeliveryPost: boolean;
  deliveryPostPos: { x: number; z: number };
  worldCargos: MinimapCargoBlip[];
}

export interface CargoSystem {
  group: THREE.Group;
  deliveryPostPos: THREE.Vector3;
  getStatus: (playerPos: THREE.Vector3) => CargoMissionStatus;
  interact: (playerPos: THREE.Vector3) => 'collected' | 'delivered' | 'none';
  resetMission: (colliders: ObstacleCollider[]) => void;
  update: (elapsed: number, scanRadius: number, scanStrength: number, scanOrigin: THREE.Vector3) => void;
  dispose: () => void;
}

const _up = new THREE.Vector3(0, 1, 0);
const _norm = new THREE.Vector3();

function buildCargoMesh(
  kind: CargoKind,
  resinMat: THREE.Material,
  bridgesMat: THREE.Material,
  metalMat: THREE.Material,
  rubberMat: THREE.Material,
  ledMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();

  if (kind === 'resin') {
    // Yellow Pelican-style Resin Case (0.76 x 0.24 x 0.52m, bottom-center pivot y=0)
    const bodyGeo = new THREE.BoxGeometry(0.76, 0.2, 0.5);
    const body = new THREE.Mesh(bodyGeo, resinMat);
    body.position.y = 0.12;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const rimGeo = new THREE.BoxGeometry(0.79, 0.04, 0.53);
    const rim = new THREE.Mesh(rimGeo, resinMat);
    rim.position.y = 0.11;
    g.add(rim);

    // 6 cylindrical black rubber bumpers on top edges
    const bumpGeo = new THREE.CylinderGeometry(0.022, 0.025, 0.04, 8);
    const bx = [-0.31, -0.08, 0.08, 0.31];
    for (const x of bx) {
      for (const z of [-0.21, 0.21]) {
        if (Math.abs(x) < 0.15 && z > 0) continue;
        const b = new THREE.Mesh(bumpGeo, rubberMat);
        b.position.set(x, 0.23, z);
        g.add(b);
      }
    }

    // Metallic carry handle on front edge
    const handleBarGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8);
    handleBarGeo.rotateZ(Math.PI / 2);
    const handleBar = new THREE.Mesh(handleBarGeo, metalMat);
    handleBar.position.set(0, 0.12, 0.3);
    g.add(handleBar);

    const bracketGeo = new THREE.BoxGeometry(0.025, 0.03, 0.06);
    const brL = new THREE.Mesh(bracketGeo, metalMat);
    brL.position.set(-0.095, 0.12, 0.27);
    const brR = new THREE.Mesh(bracketGeo, metalMat);
    brR.position.set(0.095, 0.12, 0.27);
    g.add(brL, brR);

    // Twin glowing status LEDs
    const ledGeo = new THREE.BoxGeometry(0.05, 0.012, 0.018);
    const ledL = new THREE.Mesh(ledGeo, ledMat);
    ledL.position.set(-0.24, 0.224, 0.0);
    const ledR = new THREE.Mesh(ledGeo, ledMat);
    ledR.position.set(0.24, 0.224, 0.0);
    g.add(ledL, ledR);
  } else {
    // Dark Charcoal Bridges Briefcase Cargo (0.68 x 0.22 x 0.48m)
    const bodyGeo = new THREE.BoxGeometry(0.68, 0.22, 0.48);
    const body = new THREE.Mesh(bodyGeo, bridgesMat);
    body.position.y = 0.13;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Top carry handle
    const handleTopGeo = new THREE.BoxGeometry(0.2, 0.03, 0.04);
    const handleTop = new THREE.Mesh(handleTopGeo, rubberMat);
    handleTop.position.set(0, 0.15, 0.28);
    g.add(handleTop);

    const postGeo = new THREE.BoxGeometry(0.03, 0.03, 0.05);
    const pL = new THREE.Mesh(postGeo, rubberMat);
    pL.position.set(-0.085, 0.14, 0.25);
    const pR = new THREE.Mesh(postGeo, rubberMat);
    pR.position.set(0.085, 0.14, 0.25);
    g.add(pL, pR);

    // 4 rubber corner feet
    const footGeo = new THREE.BoxGeometry(0.06, 0.025, 0.06);
    for (const fx of [-0.28, 0.28]) {
      for (const fz of [-0.19, 0.19]) {
        const ft = new THREE.Mesh(footGeo, rubberMat);
        ft.position.set(fx, 0.012, fz);
        g.add(ft);
      }
    }

    // Small status LED
    const ledGeo = new THREE.BoxGeometry(0.045, 0.012, 0.015);
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0.22, 0.242, -0.14);
    g.add(led);
  }

  return g;
}

function createWoodenDeliveryPost(
  woodMat: THREE.Material,
  darkWoodMat: THREE.Material,
  lanternGlowMat: THREE.Material,
  x: number,
  z: number
): THREE.Group {
  const post = new THREE.Group();
  const baseY = groundHeightAt(x, z);
  post.position.set(x, baseY, z);

  // Timber deck platform (4.2m x 3.4m raised 0.45m off sand)
  const deckGeo = new THREE.BoxGeometry(4.2, 0.18, 3.4);
  const deck = new THREE.Mesh(deckGeo, woodMat);
  deck.position.y = 0.45;
  deck.castShadow = true;
  deck.receiveShadow = true;
  post.add(deck);

  // 6 Pilings reaching deep into sand/hill
  const pilingGeo = new THREE.CylinderGeometry(0.14, 0.16, 1.5, 8);
  for (const px of [-1.85, 0, 1.85]) {
    for (const pz of [-1.45, 1.45]) {
      const piling = new THREE.Mesh(pilingGeo, darkWoodMat);
      piling.position.set(px, -0.1, pz);
      piling.castShadow = true;
      post.add(piling);
    }
  }

  // Wooden entry ramp facing the beach (-Z)
  const rampGeo = new THREE.BoxGeometry(1.7, 0.14, 1.6);
  const ramp = new THREE.Mesh(rampGeo, woodMat);
  ramp.position.set(0, 0.22, -2.35);
  ramp.rotation.x = 0.28;
  ramp.receiveShadow = true;
  post.add(ramp);

  // 4 Vertical shelter support beams
  const beamGeo = new THREE.BoxGeometry(0.18, 2.5, 0.18);
  for (const bx of [-1.85, 1.85]) {
    for (const bz of [-1.45, 1.45]) {
      const beam = new THREE.Mesh(beamGeo, darkWoodMat);
      beam.position.set(bx, 1.75, bz);
      beam.castShadow = true;
      post.add(beam);
    }
  }

  // Sloped weathered timber roof canopy
  const roofGeo = new THREE.BoxGeometry(4.7, 0.14, 3.9);
  const roof = new THREE.Mesh(roofGeo, woodMat);
  roof.position.set(0, 3.05, 0);
  roof.rotation.x = -0.1;
  roof.castShadow = true;
  roof.receiveShadow = true;
  post.add(roof);

  // Wooden Delivery Receiving Table / Pallet on the deck
  const palletGeo = new THREE.BoxGeometry(1.85, 0.22, 1.25);
  const pallet = new THREE.Mesh(palletGeo, darkWoodMat);
  pallet.position.set(0, 0.65, 0.35);
  pallet.castShadow = true;
  pallet.receiveShadow = true;
  post.add(pallet);

  // Hanging Amber Lantern at front corner post
  const hookGeo = new THREE.BoxGeometry(0.08, 0.08, 0.45);
  const hook = new THREE.Mesh(hookGeo, darkWoodMat);
  hook.position.set(1.85, 2.65, -1.65);
  post.add(hook);

  const lanternGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.26, 8);
  const lantern = new THREE.Mesh(lanternGeo, lanternGlowMat);
  lantern.position.set(1.85, 2.42, -1.82);
  post.add(lantern);

  // Subtle drop-off zone ring around the wooden post
  const ringGeo = new THREE.RingGeometry(2.85, 3.05, 36);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xe6a838,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(0, 0.14, -0.4);
  post.add(ring);

  return post;
}

export function createCargoSystem(
  scene: THREE.Scene,
  characterBackpackMount: THREE.Group,
  textures: ProceduralTextureSet,
  colliders: ObstacleCollider[]
): CargoSystem {
  const group = new THREE.Group();
  scene.add(group);

  const resinMat = new THREE.MeshStandardMaterial({
    map: textures.cargoResinMap,
    roughness: 0.42,
    metalness: 0.12,
  });
  const bridgesMat = new THREE.MeshStandardMaterial({
    map: textures.cargoBridgesMap,
    roughness: 0.38,
    metalness: 0.28,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xa2acb8,
    roughness: 0.25,
    metalness: 0.85,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x181a1e,
    roughness: 0.82,
    metalness: 0.05,
  });
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0xdff6ff,
    emissive: 0x7bd8ff,
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.woodAlbedo,
    roughness: 0.88,
    metalness: 0.03,
  });
  const darkWoodMat = new THREE.MeshStandardMaterial({
    map: textures.woodAlbedo,
    color: 0x8f8377,
    roughness: 0.92,
    metalness: 0.02,
  });
  const lanternGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffc766,
    emissive: 0xf59e24,
    emissiveIntensity: 1.9,
    roughness: 0.3,
  });
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0x6dd4ff,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const beaconGeo = new THREE.CylinderGeometry(0.04, 0.26, 2.8, 12, 1, true);

  // Place Wooden Delivery Post overlooking the shore near the grassy rise
  const postX = 14;
  const postZ = 36;
  const deliveryPostPos = new THREE.Vector3(postX, groundHeightAt(postX, postZ), postZ);
  const deliveryPost = createWoodenDeliveryPost(
    woodMat,
    darkWoodMat,
    lanternGlowMat,
    postX,
    postZ
  );
  group.add(deliveryPost);

  // Collider for the wooden delivery pallet/posts center so player walks up onto deck smoothly
  colliders.push({ x: postX - 1.85, z: postZ - 1.45, radius: 0.35 });
  colliders.push({ x: postX + 1.85, z: postZ - 1.45, radius: 0.35 });
  colliders.push({ x: postX - 1.85, z: postZ + 1.45, radius: 0.35 });
  colliders.push({ x: postX + 1.85, z: postZ + 1.45, radius: 0.35 });

  // Group mounted on the wooden pallet for delivered stack
  const deliveredRack = new THREE.Group();
  deliveredRack.position.set(postX, deliveryPostPos.y + 0.76, postZ + 0.35);
  group.add(deliveredRack);

  const items: CargoItem[] = [];
  const totalCargos = 8;

  const isSpotClear = (x: number, z: number): boolean => {
    if (Math.hypot(x - postX, z - postZ) < 12) return false;
    if (Math.hypot(x, z - 18) < 10) return false;
    if (z < shorelineZAt(x) + 1.5) return false;
    for (const c of colliders) {
      if (Math.hypot(x - c.x, z - c.z) < c.radius + 2.2) return false;
    }
    return true;
  };

  const spawnMission = () => {
    for (const item of items) {
      item.mesh.parent?.remove(item.mesh);
      item.beacon.parent?.remove(item.beacon);
    }
    items.length = 0;

    for (let i = 0; i < totalCargos; i++) {
      const kind: CargoKind = i % 2 === 0 ? 'resin' : 'bridges';
      const label = kind === 'resin' ? 'Resin Container' : 'Bridges Security Case';
      const rawWeight = kind === 'resin' ? 8.0 + Math.random() * 9.5 : 6.0 + Math.random() * 8.5;
      const weightKg = Math.round(rawWeight * 2) / 2;
      const mesh = buildCargoMesh(kind, resinMat, bridgesMat, metalMat, rubberMat, ledMat);
      const beacon = new THREE.Mesh(beaconGeo, beaconMat.clone());

      // Pick randomized valid location across beach, lower hollows & hills
      let cx = 0;
      let cz = 0;
      for (let attempt = 0; attempt < 45; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 26 + Math.random() * (BEACH_PLAYABLE_RADIUS - 48);
        const tx = Math.cos(angle) * dist;
        const tz = Math.sin(angle) * dist * 0.72 + 24;
        if (Math.hypot(tx, tz) < BEACH_PLAYABLE_RADIUS - 18 && isSpotClear(tx, tz)) {
          cx = tx;
          cz = tz;
          break;
        }
      }

      const cy = groundHeightAt(cx, cz);
      groundNormalAt(cx, cz, _norm);
      mesh.position.set(cx, cy + 0.01, cz);
      mesh.quaternion.setFromUnitVectors(_up, _norm);
      mesh.rotateY(Math.random() * Math.PI * 2);

      beacon.position.set(cx, cy + 1.45, cz);

      group.add(mesh);
      group.add(beacon);

      items.push({
        id: i,
        kind,
        label,
        weightKg,
        mesh,
        beacon,
        x: cx,
        z: cz,
        state: 'world',
      });
    }
  };

  spawnMission();

  const layoutCarriedStack = () => {
    let slot = 0;
    for (const item of items) {
      if (item.state !== 'carried') continue;
      characterBackpackMount.add(item.mesh);
      // Stack vertically above each other inside the rear tubular cargo holder frame (max 6)
      item.mesh.position.set(0, 0.015 + slot * 0.165, 0);
      item.mesh.rotation.set(0, Math.PI, 0);
      item.mesh.scale.set(0.56, 0.72, 0.48);
      slot++;
    }
  };

  const layoutDeliveredStack = () => {
    let slot = 0;
    for (const item of items) {
      if (item.state !== 'delivered') continue;
      deliveredRack.add(item.mesh);
      const col = slot % 2;
      const row = Math.floor(slot / 2);
      item.mesh.position.set((col - 0.5) * 0.82, row * 0.23, 0);
      item.mesh.rotation.set(0, (slot % 2) * 0.14 - 0.07, 0);
      item.mesh.scale.setScalar(0.92);
      slot++;
    }
  };

  const findNearestWorldCargo = (playerPos: THREE.Vector3): CargoItem | null => {
    let best: CargoItem | null = null;
    let bestDist = 2.6;
    for (const item of items) {
      if (item.state !== 'world') continue;
      const d = Math.hypot(playerPos.x - item.x, playerPos.z - item.z);
      if (d < bestDist) {
        bestDist = d;
        best = item;
      }
    }
    return best;
  };

  const getStatus = (playerPos: THREE.Vector3): CargoMissionStatus => {
    let carried = 0;
    let delivered = 0;
    let carriedWeightKg = 0;
    const worldCargos: MinimapCargoBlip[] = [];

    for (const item of items) {
      if (item.state === 'carried') {
        carried++;
        carriedWeightKg += item.weightKg;
      } else if (item.state === 'delivered') {
        delivered++;
      } else {
        worldCargos.push({
          id: item.id,
          x: item.x,
          z: item.z,
          kind: item.kind,
          weightKg: item.weightKg,
        });
      }
    }

    const nearby = findNearestWorldCargo(playerPos);
    const distPost = Math.hypot(playerPos.x - postX, playerPos.z - postZ);

    return {
      total: totalCargos,
      carried,
      maxCarry: MAX_CARRY_CARGOS,
      delivered,
      carriedWeightKg: Math.round(carriedWeightKg * 10) / 10,
      nearbyCargoLabel: nearby ? nearby.label : null,
      nearbyCargoWeightKg: nearby ? nearby.weightKg : null,
      backpackFull: carried >= MAX_CARRY_CARGOS,
      nearDeliveryPost: distPost < 4.2,
      deliveryPostPos: { x: postX, z: postZ },
      worldCargos,
    };
  };

  const interact = (playerPos: THREE.Vector3): 'collected' | 'delivered' | 'none' => {
    let carriedCount = 0;
    for (const item of items) {
      if (item.state === 'carried') carriedCount++;
    }

    const nearby = findNearestWorldCargo(playerPos);
    if (nearby && carriedCount < MAX_CARRY_CARGOS) {
      nearby.state = 'carried';
      nearby.beacon.visible = false;
      layoutCarriedStack();
      return 'collected';
    }

    const distPost = Math.hypot(playerPos.x - postX, playerPos.z - postZ);
    if (distPost < 4.2) {
      let movedAny = false;
      for (const item of items) {
        if (item.state === 'carried') {
          item.state = 'delivered';
          movedAny = true;
        }
      }
      if (movedAny) {
        layoutDeliveredStack();
        return 'delivered';
      }
    }

    return 'none';
  };

  const update = (
    elapsed: number,
    scanRadius: number,
    scanStrength: number,
    scanOrigin: THREE.Vector3
  ) => {
    for (const item of items) {
      if (item.state !== 'world') continue;
      const pulse = 0.22 + Math.sin(elapsed * 2.5 + item.id) * 0.08;
      const mat = item.beacon.material as THREE.MeshBasicMaterial;

      // Boost beacon visibility brightly when Odradek scan wave sweeps over it
      let scanBoost = 0;
      if (scanStrength > 0.01) {
        const d = Math.hypot(item.x - scanOrigin.x, item.z - scanOrigin.z);
        if (d < scanRadius && d > scanRadius - 14) {
          scanBoost = 0.5 * scanStrength;
        }
      }
      mat.opacity = pulse + scanBoost;
      item.beacon.rotation.y = elapsed * 0.8;
    }
  };

  const dispose = () => {
    scene.remove(group);
    resinMat.dispose();
    bridgesMat.dispose();
    metalMat.dispose();
    rubberMat.dispose();
    ledMat.dispose();
    woodMat.dispose();
    darkWoodMat.dispose();
    lanternGlowMat.dispose();
    beaconMat.dispose();
    beaconGeo.dispose();
  };

  return {
    group,
    deliveryPostPos,
    getStatus,
    interact,
    resetMission: () => spawnMission(),
    update,
    dispose,
  };
}
