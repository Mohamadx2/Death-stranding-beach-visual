import * as THREE from 'three';
import { groundHeightAt, groundNormalAt } from './terrain';

export type CraftableEquipmentId = 'ladder' | 'anchor' | 'cart';
export type GearSlot = 'boots' | 'suit';
export type GearServiceMode = 'repair' | 'craft';

export const EQUIPMENT_COSTS: Record<CraftableEquipmentId, number> = {
  ladder: 35,
  anchor: 45,
  cart: 70,
};

export const GEAR_SERVICE_COSTS = {
  repairBoots: 10,
  craftBoots: 25,
  repairSuit: 15,
  craftSuit: 35,
} as const;

export interface DeployedLadder {
  startX: number;
  startZ: number;
  startY: number;
  endX: number;
  endZ: number;
  endY: number;
  length: number;
  mesh: THREE.Group;
}

export interface DeployedAnchor {
  x: number;
  z: number;
  y: number;
  radius: number;
  ropeDirX: number;
  ropeDirZ: number;
  mesh: THREE.Group;
}

export interface EquipmentSnapshot {
  crystals: number;
  laddersInPack: number;
  anchorsInPack: number;
  deployedLadders: number;
  deployedAnchors: number;
  hasCart: boolean;
  cartAttached: boolean;
  nearAnchorAssist: boolean;
  onLadder: boolean;
}

export interface SavedEquipmentState {
  crystals: number;
  laddersInPack: number;
  anchorsInPack: number;
  hasCart: boolean;
  cartAttached: boolean;
  ladders: {
    startX: number;
    startZ: number;
    startY: number;
    endX: number;
    endZ: number;
    endY: number;
    length: number;
  }[];
  anchors: {
    x: number;
    z: number;
    y: number;
    ropeDirX: number;
    ropeDirZ: number;
  }[];
}

export interface EquipmentSystem {
  group: THREE.Group;
  cartCargoMount: THREE.Group;
  getSnapshot: () => EquipmentSnapshot;
  addCrystals: (amount: number) => void;
  spendCrystals: (amount: number) => boolean;
  craft: (id: CraftableEquipmentId) => boolean;
  deployLadder: (playerPos: THREE.Vector3, playerYaw: number) => boolean;
  deployAnchor: (playerPos: THREE.Vector3, playerYaw: number) => boolean;
  toggleCartAttached: () => boolean;
  getSurfaceHeightAt: (x: number, z: number, terrainY: number) => { y: number; onLadder: boolean };
  isNearAnchor: (playerPos: THREE.Vector3) => boolean;
  exportState: () => SavedEquipmentState;
  importState: (saved: SavedEquipmentState) => void;
  resetEquipment: () => void;
  update: (
    delta: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    playerYaw: number
  ) => void;
  dispose: () => void;
}

const _up = new THREE.Vector3(0, 1, 0);
const _norm = new THREE.Vector3();

function buildLadderMesh(
  length: number,
  metalMat: THREE.Material,
  accentMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  const width = 0.72;

  const railGeo = new THREE.BoxGeometry(0.055, 0.08, length);
  const railL = new THREE.Mesh(railGeo, metalMat);
  railL.position.set(-width * 0.5, 0.04, length * 0.5);
  railL.castShadow = true;
  railL.receiveShadow = true;

  const railR = new THREE.Mesh(railGeo, metalMat);
  railR.position.set(width * 0.5, 0.04, length * 0.5);
  railR.castShadow = true;
  railR.receiveShadow = true;
  g.add(railL, railR);

  const rungCount = 12;
  const rungGeo = new THREE.CylinderGeometry(0.022, 0.022, width, 6);
  rungGeo.rotateZ(Math.PI / 2);
  for (let i = 0; i < rungCount; i++) {
    const t = (i + 0.5) / rungCount;
    const rung = new THREE.Mesh(rungGeo, i === 0 || i === rungCount - 1 ? accentMat : metalMat);
    rung.position.set(0, 0.045, t * length);
    rung.castShadow = true;
    g.add(rung);
  }

  return g;
}

function buildAnchorMesh(
  metalMat: THREE.Material,
  accentMat: THREE.Material,
  ledMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();

  // Central steel piton post
  const postGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.62, 8);
  const post = new THREE.Mesh(postGeo, metalMat);
  post.position.y = 0.31;
  post.castShadow = true;
  g.add(post);

  // 3 Tripod support struts
  const legGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.52, 6);
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(legGeo, accentMat);
    leg.position.set(Math.cos(ang) * 0.16, 0.18, Math.sin(ang) * 0.16);
    leg.rotation.set(Math.sin(ang) * 0.55, 0, -Math.cos(ang) * 0.55);
    leg.castShadow = true;
    g.add(leg);
  }

  // Glowing top beacon cap
  const capGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.06, 10);
  const cap = new THREE.Mesh(capGeo, ledMat);
  cap.position.y = 0.64;
  g.add(cap);

  return g;
}

function buildTowedCartMesh(
  metalMat: THREE.Material,
  darkMat: THREE.Material,
  accentMat: THREE.Material,
  glowMat: THREE.Material
): { cartGroup: THREE.Group; cartCargoMount: THREE.Group; wheels: THREE.Mesh[] } {
  const cartGroup = new THREE.Group();
  const wheels: THREE.Mesh[] = [];

  // Flatbed chassis deck
  const bedGeo = new THREE.BoxGeometry(0.86, 0.07, 1.18);
  const bed = new THREE.Mesh(bedGeo, darkMat);
  bed.position.y = 0.28;
  bed.castShadow = true;
  bed.receiveShadow = true;
  cartGroup.add(bed);

  // Brushed tubular side guard rails
  const sideRailGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.16, 8);
  sideRailGeo.rotateX(Math.PI / 2);
  const railL = new THREE.Mesh(sideRailGeo, metalMat);
  railL.position.set(-0.42, 0.42, 0);
  const railR = new THREE.Mesh(sideRailGeo, metalMat);
  railR.position.set(0.42, 0.42, 0);
  cartGroup.add(railL, railR);

  const cornerPostGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6);
  for (const cx of [-0.42, 0.42]) {
    for (const cz of [-0.54, 0.54]) {
      const p = new THREE.Mesh(cornerPostGeo, metalMat);
      p.position.set(cx, 0.35, cz);
      cartGroup.add(p);
    }
  }

  // Front tow hitch tongue & amber LED strip
  const hitchGeo = new THREE.BoxGeometry(0.14, 0.045, 0.24);
  const hitch = new THREE.Mesh(hitchGeo, accentMat);
  hitch.position.set(0, 0.29, 0.68);
  cartGroup.add(hitch);

  const stripGeo = new THREE.BoxGeometry(0.56, 0.03, 0.03);
  const tailStrip = new THREE.Mesh(stripGeo, glowMat);
  tailStrip.position.set(0, 0.31, -0.59);
  cartGroup.add(tailStrip);

  // 4 Rugged all-terrain wheels
  const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.11, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.125, 10);
  hubGeo.rotateZ(Math.PI / 2);

  for (const wx of [-0.46, 0.46]) {
    for (const wz of [-0.38, 0.38]) {
      const wheel = new THREE.Mesh(wheelGeo, darkMat);
      wheel.position.set(wx, 0.18, wz);
      wheel.castShadow = true;
      const hub = new THREE.Mesh(hubGeo, accentMat);
      wheel.add(hub);
      cartGroup.add(wheel);
      wheels.push(wheel);
    }
  }

  const cartCargoMount = new THREE.Group();
  cartCargoMount.position.set(0, 0.32, 0);
  cartGroup.add(cartCargoMount);

  return { cartGroup, cartCargoMount, wheels };
}

export function createEquipmentSystem(
  scene: THREE.Scene,
  isSoftwareGl: boolean
): EquipmentSystem {
  const group = new THREE.Group();
  scene.add(group);
  const disposables: { dispose: () => void }[] = [];

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xa2adb8,
    roughness: 0.28,
    metalness: 0.85,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1e2228,
    roughness: 0.65,
    metalness: 0.24,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xd49b34,
    roughness: 0.38,
    metalness: 0.48,
  });
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x7bd8ff,
    emissive: 0x3ba8e6,
    emissiveIntensity: 1.7,
    roughness: 0.2,
  });
  const ropeMat = new THREE.LineBasicMaterial({
    color: 0xd9a84e,
  });
  disposables.push(metalMat, darkMat, accentMat, ledMat, ropeMat);

  let crystals = 0;
  let laddersInPack = 1;
  let anchorsInPack = 0;
  let hasCart = false;
  let cartAttached = false;
  let nearAnchorAssist = false;
  let onLadderFlag = false;

  const ladders: DeployedLadder[] = [];
  const anchors: DeployedAnchor[] = [];

  // Towed Cart + Dynamic Catenary Rope Line
  const { cartGroup, cartCargoMount, wheels } = buildTowedCartMesh(
    metalMat,
    darkMat,
    accentMat,
    ledMat
  );
  if (isSoftwareGl) {
    cartGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = false;
    });
  }
  cartGroup.visible = false;
  group.add(cartGroup);

  const cartPos = new THREE.Vector3(0, groundHeightAt(0, 20), 20);
  let cartYaw = Math.PI;

  const towSegs = 10;
  const towPts = new Float32Array((towSegs + 1) * 3);
  const towGeo = new THREE.BufferGeometry();
  towGeo.setAttribute('position', new THREE.BufferAttribute(towPts, 3));
  const towRope = new THREE.Line(towGeo, ropeMat);
  towRope.frustumCulled = false;
  towRope.visible = false;
  group.add(towRope);
  disposables.push(towGeo);

  const addCrystals = (amount: number) => {
    crystals += Math.max(0, amount);
  };

  const spendCrystals = (amount: number): boolean => {
    const cost = Math.max(0, amount);
    if (crystals < cost) return false;
    crystals -= cost;
    return true;
  };

  const craft = (id: CraftableEquipmentId): boolean => {
    const cost = EQUIPMENT_COSTS[id];
    if (crystals < cost) return false;
    if (id === 'cart' && hasCart) return false;

    crystals -= cost;
    if (id === 'ladder') {
      laddersInPack += 1;
    } else if (id === 'anchor') {
      anchorsInPack += 1;
    } else if (id === 'cart') {
      hasCart = true;
      cartAttached = true;
    }
    return true;
  };

  const deployLadder = (playerPos: THREE.Vector3, playerYaw: number): boolean => {
    if (laddersInPack <= 0) return false;
    laddersInPack -= 1;

    const length = 6.4;
    const dirX = Math.sin(playerYaw);
    const dirZ = Math.cos(playerYaw);

    const startX = playerPos.x + dirX * 0.55;
    const startZ = playerPos.z + dirZ * 0.55;
    const endX = startX + dirX * length;
    const endZ = startZ + dirZ * length;

    const startY = groundHeightAt(startX, startZ) + 0.14;
    const endY = groundHeightAt(endX, endZ) + 0.16;

    const mesh = buildLadderMesh(length, metalMat, accentMat);
    mesh.position.set(startX, startY, startZ);
    mesh.lookAt(endX, endY, endZ);
    group.add(mesh);

    ladders.push({
      startX,
      startZ,
      startY,
      endX,
      endZ,
      endY,
      length,
      mesh,
    });
    return true;
  };

  const deployAnchor = (playerPos: THREE.Vector3, playerYaw: number): boolean => {
    if (anchorsInPack <= 0) return false;
    anchorsInPack -= 1;

    const ax = playerPos.x;
    const az = playerPos.z;
    const ay = groundHeightAt(ax, az);

    const anchorGroup = new THREE.Group();
    const stake = buildAnchorMesh(metalMat, accentMat, ledMat);
    anchorGroup.add(stake);

    // Unspool a 14m terrain-hugging rappel rope trailing behind the player
    const ropeDirX = -Math.sin(playerYaw);
    const ropeDirZ = -Math.cos(playerYaw);
    const ropePts: number[] = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const dist = (i / steps) * 14.0;
      const rx = ropeDirX * dist;
      const rz = ropeDirZ * dist;
      const ry = groundHeightAt(ax + rx, az + rz) - ay + (i === 0 ? 0.45 : 0.04);
      ropePts.push(rx, ry, rz);
    }
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.Float32BufferAttribute(ropePts, 3));
    const rLine = new THREE.Line(rGeo, ropeMat);
    anchorGroup.add(rLine);
    disposables.push(rGeo);

    anchorGroup.position.set(ax, ay, az);
    group.add(anchorGroup);

    anchors.push({
      x: ax,
      z: az,
      y: ay,
      radius: 14.5,
      ropeDirX,
      ropeDirZ,
      mesh: anchorGroup,
    });
    return true;
  };

  const toggleCartAttached = (): boolean => {
    if (!hasCart) return false;
    cartAttached = !cartAttached;
    return true;
  };

  const getSurfaceHeightAt = (
    x: number,
    z: number,
    terrainY: number
  ): { y: number; onLadder: boolean } => {
    let bestY = terrainY;
    let onLadder = false;

    for (let i = 0; i < ladders.length; i++) {
      const l = ladders[i];
      const dx = l.endX - l.startX;
      const dz = l.endZ - l.startZ;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 0.01) continue;
      const t = ((x - l.startX) * dx + (z - l.startZ) * dz) / lenSq;
      if (t < -0.08 || t > 1.08) continue;

      const projX = l.startX + dx * t;
      const projZ = l.startZ + dz * t;
      const perpDist = Math.hypot(x - projX, z - projZ);
      if (perpDist <= 0.72) {
        const clampedT = THREE.MathUtils.clamp(t, 0, 1);
        const deckY = THREE.MathUtils.lerp(l.startY, l.endY, clampedT) + 0.08;
        if (deckY > bestY) {
          bestY = deckY;
          onLadder = true;
        }
      }
    }

    onLadderFlag = onLadder;
    return { y: bestY, onLadder };
  };

  const isNearAnchor = (playerPos: THREE.Vector3): boolean => {
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      if (Math.hypot(playerPos.x - a.x, playerPos.z - a.z) <= a.radius) {
        nearAnchorAssist = true;
        return true;
      }
    }
    nearAnchorAssist = false;
    return false;
  };

  const update = (
    delta: number,
    _elapsed: number,
    playerPos: THREE.Vector3,
    playerYaw: number
  ) => {
    const dt = Math.min(delta, 0.05);

    if (hasCart && cartAttached) {
      if (!cartGroup.visible) {
        // Initialize just behind the player when first crafted/re-hitched
        cartPos.set(
          playerPos.x - Math.sin(playerYaw) * 2.1,
          groundHeightAt(playerPos.x, playerPos.z),
          playerPos.z - Math.cos(playerYaw) * 2.1
        );
        cartYaw = playerYaw;
      }
      cartGroup.visible = true;
      towRope.visible = true;

      // Rope constraint: pull cart smoothly behind player keeping ~2.1m trailing slack
      const dx = playerPos.x - cartPos.x;
      const dz = playerPos.z - cartPos.z;
      const dist = Math.hypot(dx, dz);
      const ropeLength = 2.15;
      let moveDist = 0;

      if (dist > ropeLength && dist > 0.001) {
        const pull = dist - ropeLength;
        const nx = dx / dist;
        const nz = dz / dist;
        const step = Math.min(pull, pull * Math.min(1, dt * 11.5));
        cartPos.x += nx * step;
        cartPos.z += nz * step;
        moveDist = step;

        const targetYaw = Math.atan2(dx, dz);
        let diff = ((targetYaw - cartYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (diff < -Math.PI) diff += Math.PI * 2;
        cartYaw += diff * (1 - Math.exp(-9 * dt));
      }

      const groundY = groundHeightAt(cartPos.x, cartPos.z);
      cartPos.y = THREE.MathUtils.damp(cartPos.y, groundY, 16, dt);
      groundNormalAt(cartPos.x, cartPos.z, _norm);

      cartGroup.position.copy(cartPos);
      cartGroup.quaternion.setFromUnitVectors(_up, _norm);
      cartGroup.rotateY(cartYaw);

      // Spin 4 wheels proportionally to distance rolled
      const wheelSpin = moveDist / 0.18;
      for (let w = 0; w < wheels.length; w++) {
        wheels[w].rotation.x += wheelSpin;
      }

      // Update sagging catenary tow rope between player's waist belt & cart hitch
      const pBeltX = playerPos.x - Math.sin(playerYaw) * 0.25;
      const pBeltY = playerPos.y + 0.96;
      const pBeltZ = playerPos.z - Math.cos(playerYaw) * 0.25;

      const hitchX = cartPos.x + Math.sin(cartYaw) * 0.72;
      const hitchY = cartPos.y + 0.31;
      const hitchZ = cartPos.z + Math.cos(cartYaw) * 0.72;

      const slack = Math.max(0.06, (ropeLength - Math.min(dist, ropeLength)) * 0.35 + 0.14);
      const arr = towGeo.attributes.position.array as Float32Array;
      for (let s = 0; s <= towSegs; s++) {
        const t = s / towSegs;
        const sag = Math.sin(t * Math.PI) * slack;
        arr[s * 3] = THREE.MathUtils.lerp(pBeltX, hitchX, t);
        arr[s * 3 + 1] = THREE.MathUtils.lerp(pBeltY, hitchY, t) - sag;
        arr[s * 3 + 2] = THREE.MathUtils.lerp(pBeltZ, hitchZ, t);
      }
      towGeo.attributes.position.needsUpdate = true;
    } else if (hasCart && !cartAttached) {
      cartGroup.visible = true;
      towRope.visible = false;
    } else {
      cartGroup.visible = false;
      towRope.visible = false;
    }
  };

  const getSnapshot = (): EquipmentSnapshot => ({
    crystals,
    laddersInPack,
    anchorsInPack,
    deployedLadders: ladders.length,
    deployedAnchors: anchors.length,
    hasCart,
    cartAttached,
    nearAnchorAssist,
    onLadder: onLadderFlag,
  });

  const clearDeployed = () => {
    for (const l of ladders) {
      l.mesh.parent?.remove(l.mesh);
    }
    ladders.length = 0;
    for (const a of anchors) {
      a.mesh.parent?.remove(a.mesh);
    }
    anchors.length = 0;
  };

  const exportState = (): SavedEquipmentState => ({
    crystals,
    laddersInPack,
    anchorsInPack,
    hasCart,
    cartAttached,
    ladders: ladders.map((l) => ({
      startX: l.startX,
      startZ: l.startZ,
      startY: l.startY,
      endX: l.endX,
      endZ: l.endZ,
      endY: l.endY,
      length: l.length,
    })),
    anchors: anchors.map((a) => ({
      x: a.x,
      z: a.z,
      y: a.y,
      ropeDirX: a.ropeDirX,
      ropeDirZ: a.ropeDirZ,
    })),
  });

  const importState = (saved: SavedEquipmentState) => {
    clearDeployed();
    crystals = saved.crystals;
    laddersInPack = saved.laddersInPack;
    anchorsInPack = saved.anchorsInPack;
    hasCart = saved.hasCart;
    cartAttached = saved.cartAttached;

    for (const l of saved.ladders) {
      const mesh = buildLadderMesh(l.length, metalMat, accentMat);
      mesh.position.set(l.startX, l.startY, l.startZ);
      mesh.lookAt(l.endX, l.endY, l.endZ);
      group.add(mesh);
      ladders.push({ ...l, mesh });
    }

    for (const a of saved.anchors) {
      const anchorGroup = new THREE.Group();
      const stake = buildAnchorMesh(metalMat, accentMat, ledMat);
      anchorGroup.add(stake);

      const ropePts: number[] = [];
      const steps = 18;
      for (let i = 0; i <= steps; i++) {
        const dist = (i / steps) * 14.0;
        const rx = a.ropeDirX * dist;
        const rz = a.ropeDirZ * dist;
        const ry = groundHeightAt(a.x + rx, a.z + rz) - a.y + (i === 0 ? 0.45 : 0.04);
        ropePts.push(rx, ry, rz);
      }
      const rGeo = new THREE.BufferGeometry();
      rGeo.setAttribute('position', new THREE.Float32BufferAttribute(ropePts, 3));
      const rLine = new THREE.Line(rGeo, ropeMat);
      anchorGroup.add(rLine);
      disposables.push(rGeo);

      anchorGroup.position.set(a.x, a.y, a.z);
      group.add(anchorGroup);
      anchors.push({
        x: a.x,
        z: a.z,
        y: a.y,
        radius: 14.5,
        ropeDirX: a.ropeDirX,
        ropeDirZ: a.ropeDirZ,
        mesh: anchorGroup,
      });
    }
  };

  const resetEquipment = () => {
    clearDeployed();
    crystals = 0;
    laddersInPack = 1;
    anchorsInPack = 0;
    hasCart = false;
    cartAttached = false;
    cartGroup.visible = false;
    towRope.visible = false;
  };

  const dispose = () => {
    scene.remove(group);
    disposables.forEach((d) => d.dispose());
  };

  return {
    group,
    cartCargoMount,
    getSnapshot,
    addCrystals,
    spendCrystals,
    craft,
    deployLadder,
    deployAnchor,
    toggleCartAttached,
    getSurfaceHeightAt,
    isNearAnchor,
    exportState,
    importState,
    resetEquipment,
    update,
    dispose,
  };
}
