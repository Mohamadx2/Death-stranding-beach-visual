import * as THREE from 'three';
import { FootstepSurface } from './audio';
import { ProceduralTextureSet } from './materials';
import {
  BoundaryImpact,
  ObstacleCollider,
  SEA_LEVEL,
  desertRockCoverageAt,
  dirtRoadMaskAt,
  groundHeightAt,
  groundNormalAt,
  resolveCharacterCollisions,
  riverInfoAt,
} from './terrain';

export interface FootstepEvent {
  surface: FootstepSurface;
  heavyCargo: boolean;
  weightKg: number;
}

export interface FallImpactEvent {
  damage: number;
  impactSpeed: number;
  dropHeight: number;
}

export interface CharacterInputState {
  forward: number; // -1..1
  right: number; // -1..1
  sprint: boolean;
  jumpPressed: boolean;
  cameraYaw: number;
  anchorAssist?: boolean;
  rainWeight?: number;
  snowWeight?: number;
  nightWeight?: number;
  insideBuilding?: boolean;
  buildingName?: string | null;
  surfaceHeightResolver?: (x: number, z: number, terrainY: number) => number;
}

export interface CharacterController {
  group: THREE.Group;
  backpackMount: THREE.Group;
  position: THREE.Vector3;
  yaw: number;
  speed: number;
  isGrounded: boolean;
  isSprinting: boolean;
  isWading: boolean;
  isClimbing: boolean;
  isSlipping: boolean;
  climbSlopeDeg: number;
  health: number;
  maxHealth: number;
  playerName: string;
  stamina: number;
  staminaExhausted: boolean;
  staminaCooldownRemaining: number;
  cold: number;
  bootsDurability: number;
  suitDurability: number;
  insideBuilding: boolean;
  buildingName: string | null;
  carriedWeightKg: number;
  lastBoundaryImpact: BoundaryImpact;
  setCarriedWeight: (weightKg: number) => void;
  setPlayerName: (name: string) => void;
  damage: (amount: number) => void;
  applyWormFeeding: () => void;
  repairGear: (slot: 'boots' | 'suit', mode: 'repair' | 'craft') => void;
  restoreState: (state: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    health: number;
    stamina: number;
    staminaExhausted: boolean;
    cold: number;
    bootsDurability?: number;
    suitDurability?: number;
    playerName: string;
  }) => void;
  resetState: () => void;
  triggerScan: () => void;
  update: (
    delta: number,
    elapsed: number,
    input: CharacterInputState,
    colliders: ObstacleCollider[],
    onFootstep?: (event: FootstepEvent) => void,
    onFallImpact?: (event: FallImpactEvent) => void,
    onSlip?: () => void
  ) => void;
  dispose: () => void;
}

const _moveDir = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _surfNorm = new THREE.Vector3();
const _fpQuat = new THREE.Quaternion();
const _fpYawQuat = new THREE.Quaternion();

function shortestAngleDiff(current: number, target: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function createDrifterCharacter(
  scene: THREE.Scene,
  textures: ProceduralTextureSet
): CharacterController {
  const disposables: { dispose: () => void }[] = [];

  const root = new THREE.Group();
  const initialZ = 18;
  root.position.set(0, groundHeightAt(0, initialZ), initialZ);

  // Calibrated PBR Materials for Technical Expedition Outerwear (strictly faceless)
  const jacketMat = new THREE.MeshStandardMaterial({
    map: textures.fabricMap,
    color: 0x2a3b4b,
    roughness: 0.72,
    metalness: 0.08,
  });
  const jacketPanelMat = new THREE.MeshStandardMaterial({
    map: textures.fabricMap,
    color: 0x1e2833,
    roughness: 0.78,
    metalness: 0.06,
  });
  const hoodTrimMat = new THREE.MeshStandardMaterial({
    map: textures.fabricMap,
    color: 0x364758,
    roughness: 0.68,
    metalness: 0.08,
  });
  const facelessCowlMat = new THREE.MeshStandardMaterial({
    color: 0x11151a,
    roughness: 0.84,
    metalness: 0.04,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    map: textures.fabricMap,
    color: 0x1b2026,
    roughness: 0.84,
    metalness: 0.04,
  });
  const armorPadMat = new THREE.MeshStandardMaterial({
    color: 0x252b32,
    roughness: 0.42,
    metalness: 0.28,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x171a1f,
    roughness: 0.56,
    metalness: 0.12,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x121519,
    roughness: 0.46,
    metalness: 0.14,
  });
  const strapMat = new THREE.MeshStandardMaterial({
    color: 0x2e353d,
    roughness: 0.58,
    metalness: 0.24,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x95a0ad,
    roughness: 0.24,
    metalness: 0.88,
  });
  const packMat = new THREE.MeshStandardMaterial({
    color: 0x383e45,
    roughness: 0.55,
    metalness: 0.22,
  });
  const accentGoldMat = new THREE.MeshStandardMaterial({
    color: 0xc29342,
    roughness: 0.28,
    metalness: 0.82,
  });
  const podGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffaa3b,
    emissive: 0xd97714,
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0.1,
  });
  const scannerLightMat = new THREE.MeshStandardMaterial({
    color: 0x6dd4ff,
    emissive: 0x3ba8e6,
    emissiveIntensity: 1.4,
    roughness: 0.25,
    metalness: 0.2,
  });

  disposables.push(
    jacketMat,
    jacketPanelMat,
    hoodTrimMat,
    facelessCowlMat,
    pantsMat,
    armorPadMat,
    gloveMat,
    bootMat,
    strapMat,
    metalMat,
    packMat,
    accentGoldMat,
    podGlowMat,
    scannerLightMat
  );

  // Soft contact shadow directly under boots
  const shadowGeo = new THREE.CircleGeometry(0.46, 20);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x050709,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.025;
  root.add(contactShadow);
  disposables.push(shadowGeo, shadowMat);

  // Hierarchical Articulated Human Rig (total height ~1.80m, bottom-center pivot y=0)
  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.92, 0);
  root.add(pelvis);

  const pelvisMeshGeo = new THREE.CylinderGeometry(0.175, 0.165, 0.17, 12);
  pelvisMeshGeo.scale(1.12, 1.0, 0.78);
  const pelvisMesh = new THREE.Mesh(pelvisMeshGeo, pantsMat);
  pelvisMesh.castShadow = true;
  pelvis.add(pelvisMesh);

  // Tactical Utility Waist Belt & Buckle + Side Hip Gear Pouches
  const beltGeo = new THREE.CylinderGeometry(0.184, 0.184, 0.055, 14);
  beltGeo.scale(1.13, 1.0, 0.8);
  const belt = new THREE.Mesh(beltGeo, strapMat);
  belt.position.y = 0.045;
  pelvis.add(belt);

  const beltBuckleGeo = new THREE.BoxGeometry(0.07, 0.055, 0.03);
  const beltBuckle = new THREE.Mesh(beltBuckleGeo, metalMat);
  beltBuckle.position.set(0, 0.045, 0.15);
  pelvis.add(beltBuckle);

  const hipPouchGeo = new THREE.BoxGeometry(0.06, 0.11, 0.1);
  const hipPouchL = new THREE.Mesh(hipPouchGeo, armorPadMat);
  hipPouchL.position.set(0.21, 0.01, -0.01);
  const hipPouchR = new THREE.Mesh(hipPouchGeo, armorPadMat);
  hipPouchR.position.set(-0.21, 0.01, -0.01);
  pelvis.add(hipPouchL, hipPouchR);

  // Spine & Anatomical Parka Torso (sculpted LatheGeometry silhouette)
  const torso = new THREE.Group();
  torso.position.set(0, 0.08, 0);
  pelvis.add(torso);

  const torsoProfile: THREE.Vector2[] = [
    new THREE.Vector2(0.185, -0.04), // Parka lower hem skirt
    new THREE.Vector2(0.168, 0.09),  // Tapered waist
    new THREE.Vector2(0.182, 0.22),  // Ribcage
    new THREE.Vector2(0.212, 0.37),  // Broad upper chest
    new THREE.Vector2(0.198, 0.48),  // Shoulder slope
    new THREE.Vector2(0.125, 0.52),  // Collar base
  ];
  const chestGeo = new THREE.LatheGeometry(torsoProfile, 14);
  chestGeo.scale(1.18, 1.0, 0.74);
  const chestMesh = new THREE.Mesh(chestGeo, jacketMat);
  chestMesh.castShadow = true;
  chestMesh.receiveShadow = true;
  torso.add(chestMesh);

  // Reinforced Dark Shoulder Yoke & Front Storm-Flap Placket
  const yokeGeo = new THREE.CylinderGeometry(0.145, 0.215, 0.16, 12);
  yokeGeo.scale(1.18, 1.0, 0.74);
  const yokeMesh = new THREE.Mesh(yokeGeo, jacketPanelMat);
  yokeMesh.position.y = 0.43;
  yokeMesh.castShadow = true;
  torso.add(yokeMesh);

  const placketGeo = new THREE.BoxGeometry(0.065, 0.5, 0.032);
  const placket = new THREE.Mesh(placketGeo, jacketPanelMat);
  placket.position.set(0, 0.24, 0.155);
  torso.add(placket);

  const pocketGeo = new THREE.BoxGeometry(0.1, 0.12, 0.03);
  const chestPocket = new THREE.Mesh(pocketGeo, armorPadMat);
  chestPocket.position.set(-0.1, 0.32, 0.145);
  torso.add(chestPocket);

  // High Insulated Storm Collar & Neck Gaiter Wrap
  const collarGeo = new THREE.CylinderGeometry(0.118, 0.135, 0.12, 14);
  const collarMesh = new THREE.Mesh(collarGeo, hoodTrimMat);
  collarMesh.position.set(0, 0.525, 0);
  torso.add(collarMesh);

  const collarRimGeo = new THREE.TorusGeometry(0.118, 0.036, 8, 16);
  collarRimGeo.rotateX(Math.PI / 2);
  const collarRim = new THREE.Mesh(collarRimGeo, jacketPanelMat);
  collarRim.position.set(0, 0.575, 0);
  torso.add(collarRim);

  // Tactical Harness Straps & Metallic Chest Clips
  const strapGeo = new THREE.BoxGeometry(0.052, 0.49, 0.31);
  const strapL = new THREE.Mesh(strapGeo, strapMat);
  strapL.position.set(0.115, 0.265, 0.005);
  const strapR = new THREE.Mesh(strapGeo, strapMat);
  strapR.position.set(-0.115, 0.265, 0.005);
  torso.add(strapL, strapR);

  const buckleGeo = new THREE.BoxGeometry(0.062, 0.042, 0.032);
  const buckleL = new THREE.Mesh(buckleGeo, metalMat);
  buckleL.position.set(0.115, 0.26, 0.165);
  const buckleR = new THREE.Mesh(buckleGeo, metalMat);
  buckleR.position.set(-0.115, 0.26, 0.165);
  torso.add(buckleL, buckleR);

  // Chest-mounted Amber Pod Capsule
  const podHousingGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.16, 12);
  const podHousing = new THREE.Mesh(podHousingGeo, podGlowMat);
  podHousing.position.set(0.045, 0.21, 0.18);
  podHousing.rotation.z = 0.14;
  torso.add(podHousing);

  const podCapGeo = new THREE.CylinderGeometry(0.072, 0.072, 0.03, 12);
  const podCapTop = new THREE.Mesh(podCapGeo, metalMat);
  podCapTop.position.set(0.035, 0.29, 0.18);
  podCapTop.rotation.z = 0.14;
  const podCapBot = new THREE.Mesh(podCapGeo, metalMat);
  podCapBot.position.set(0.055, 0.13, 0.18);
  podCapBot.rotation.z = 0.14;
  torso.add(podCapTop, podCapBot);

  // Rear Tubular Steel Backpack Cargo Holder Frame (inspired by Bridges Porter Frame)
  const frameSteelMat = new THREE.MeshStandardMaterial({
    color: 0x9aa4ae,
    roughness: 0.34,
    metalness: 0.84,
  });
  const pouchOliveMat = new THREE.MeshStandardMaterial({
    map: textures.fabricMap,
    color: 0x5c5b43,
    roughness: 0.82,
    metalness: 0.04,
  });
  const batteryYellowMat = new THREE.MeshStandardMaterial({
    color: 0xc99628,
    roughness: 0.44,
    metalness: 0.18,
  });
  const webbingBlackMat = new THREE.MeshStandardMaterial({
    color: 0x1a1d21,
    roughness: 0.72,
    metalness: 0.08,
  });
  disposables.push(frameSteelMat, pouchOliveMat, batteryYellowMat, webbingBlackMat);

  const holderGroup = new THREE.Group();
  holderGroup.position.set(0, 0.08, -0.18);
  torso.add(holderGroup);

  const backPadGeo = new THREE.BoxGeometry(0.34, 0.44, 0.05);
  const backPad = new THREE.Mesh(backPadGeo, packMat);
  backPad.position.set(0, 0.22, -0.02);
  backPad.castShadow = true;
  holderGroup.add(backPad);

  const sideRailGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.56, 8);
  const railL = new THREE.Mesh(sideRailGeo, frameSteelMat);
  railL.position.set(-0.22, 0.25, -0.05);
  railL.castShadow = true;
  const railR = new THREE.Mesh(sideRailGeo, frameSteelMat);
  railR.position.set(0.22, 0.25, -0.05);
  railR.castShadow = true;
  holderGroup.add(railL, railR);

  const outerRailGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.5, 8);
  const outerL = new THREE.Mesh(outerRailGeo, frameSteelMat);
  outerL.position.set(-0.22, 0.23, -0.25);
  outerL.castShadow = true;
  const outerR = new THREE.Mesh(outerRailGeo, frameSteelMat);
  outerR.position.set(0.22, 0.23, -0.25);
  outerR.castShadow = true;
  holderGroup.add(outerL, outerR);

  const crossBarGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.46, 8);
  crossBarGeo.rotateZ(Math.PI / 2);
  const crossTop = new THREE.Mesh(crossBarGeo, frameSteelMat);
  crossTop.position.set(0, 0.52, -0.05);
  const crossMid = new THREE.Mesh(crossBarGeo, frameSteelMat);
  crossMid.position.set(0, 0.3, -0.25);
  const crossBotBack = new THREE.Mesh(crossBarGeo, frameSteelMat);
  crossBotBack.position.set(0, -0.01, -0.25);
  const crossBotFront = new THREE.Mesh(crossBarGeo, frameSteelMat);
  crossBotFront.position.set(0, -0.01, -0.05);
  holderGroup.add(crossTop, crossMid, crossBotBack, crossBotFront);

  const trayArmGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.24, 8);
  trayArmGeo.rotateX(Math.PI / 2);
  const trayArmL = new THREE.Mesh(trayArmGeo, frameSteelMat);
  trayArmL.position.set(-0.22, -0.01, -0.15);
  const trayArmR = new THREE.Mesh(trayArmGeo, frameSteelMat);
  trayArmR.position.set(0.22, -0.01, -0.15);
  const trayPlateGeo = new THREE.BoxGeometry(0.42, 0.025, 0.24);
  const trayPlate = new THREE.Mesh(trayPlateGeo, packMat);
  trayPlate.position.set(0, 0.0, -0.15);
  trayPlate.castShadow = true;
  holderGroup.add(trayArmL, trayArmR, trayPlate);

  const cinchStrapGeo = new THREE.BoxGeometry(0.46, 0.04, 0.24);
  const cinchStrap = new THREE.Mesh(cinchStrapGeo, webbingBlackMat);
  cinchStrap.position.set(0, 0.18, -0.15);
  holderGroup.add(cinchStrap);

  const sideBuckleGeo = new THREE.BoxGeometry(0.03, 0.055, 0.055);
  const bklL = new THREE.Mesh(sideBuckleGeo, metalMat);
  bklL.position.set(-0.235, 0.18, -0.15);
  const bklR = new THREE.Mesh(sideBuckleGeo, metalMat);
  bklR.position.set(0.235, 0.18, -0.15);
  holderGroup.add(bklL, bklR);

  const sidePanelGeo = new THREE.BoxGeometry(0.025, 0.42, 0.22);
  const sidePanel = new THREE.Mesh(sidePanelGeo, pouchOliveMat);
  sidePanel.position.set(0.235, 0.22, -0.15);
  holderGroup.add(sidePanel);

  const batteryGeo = new THREE.BoxGeometry(0.075, 0.18, 0.1);
  const batteryUnit = new THREE.Mesh(batteryGeo, batteryYellowMat);
  batteryUnit.position.set(0.265, 0.29, -0.11);
  batteryUnit.castShadow = true;
  holderGroup.add(batteryUnit);

  const pouchGeo = new THREE.BoxGeometry(0.065, 0.075, 0.095);
  for (let pIdx = 0; pIdx < 4; pIdx++) {
    const pouch = new THREE.Mesh(pouchGeo, pouchOliveMat);
    pouch.position.set(0.265, 0.34 - pIdx * 0.088, -0.21);
    pouch.castShadow = true;
    holderGroup.add(pouch);
  }

  const lowerCanisterGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.18, 10);
  lowerCanisterGeo.rotateX(Math.PI / 2);
  const lowerCanister = new THREE.Mesh(lowerCanisterGeo, batteryYellowMat);
  lowerCanister.position.set(0.265, 0.03, -0.15);
  holderGroup.add(lowerCanister);

  disposables.push(
    backPadGeo,
    sideRailGeo,
    outerRailGeo,
    crossBarGeo,
    trayArmGeo,
    trayPlateGeo,
    cinchStrapGeo,
    sideBuckleGeo,
    sidePanelGeo,
    batteryGeo,
    pouchGeo,
    lowerCanisterGeo
  );

  // Mount point resting cleanly on the bottom L-tray shelf for stacking up to 6 cargos vertically
  const backpackMount = new THREE.Group();
  backpackMount.position.set(0, 0.015, -0.16);
  holderGroup.add(backpackMount);

  // Frame-Mounted Articulated Odradek Terrain Scanner Arm (left upper rail)
  const odradekBase = new THREE.Group();
  odradekBase.position.set(-0.23, 0.44, -0.15);
  holderGroup.add(odradekBase);

  const armLowerGeo = new THREE.CylinderGeometry(0.013, 0.016, 0.22, 6);
  const odradekArm = new THREE.Mesh(armLowerGeo, webbingBlackMat);
  odradekArm.position.set(0, 0.11, 0);
  odradekArm.rotation.z = 0.18;
  odradekBase.add(odradekArm);

  const armUpperGeo = new THREE.CylinderGeometry(0.011, 0.013, 0.18, 6);
  const odradekUpperArm = new THREE.Mesh(armUpperGeo, accentGoldMat);
  odradekUpperArm.position.set(-0.04, 0.27, 0.02);
  odradekUpperArm.rotation.z = -0.24;
  odradekBase.add(odradekUpperArm);
  disposables.push(armUpperGeo);

  const odradekHead = new THREE.Group();
  odradekHead.position.set(-0.02, 0.36, 0.03);
  odradekBase.add(odradekHead);

  const scannerCoreGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8);
  scannerCoreGeo.rotateX(Math.PI / 2);
  const scannerCore = new THREE.Mesh(scannerCoreGeo, scannerLightMat);
  odradekHead.add(scannerCore);

  const petalGeo = new THREE.BoxGeometry(0.022, 0.11, 0.014);
  const petals: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const petalPivot = new THREE.Group();
    petalPivot.rotation.z = (i * Math.PI) / 2 + Math.PI / 6;
    const petal = new THREE.Mesh(petalGeo, scannerLightMat);
    petal.position.y = 0.068;
    petalPivot.add(petal);
    odradekHead.add(petalPivot);
    petals.push(petal);
  }

  // Faceless Hooded Head & High-Collar Storm Hood (Strictly NO FACE)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.56, 0.01);
  torso.add(headGroup);

  const neckGaiterGeo = new THREE.CylinderGeometry(0.072, 0.088, 0.11, 12);
  const neckGaiter = new THREE.Mesh(neckGaiterGeo, facelessCowlMat);
  neckGaiter.position.y = 0.035;
  headGroup.add(neckGaiter);

  // Smooth featureless matte dark balaclava head silhouette (zero facial features)
  const cowlHeadGeo = new THREE.SphereGeometry(0.11, 16, 14);
  cowlHeadGeo.scale(0.84, 1.04, 0.94);
  const cowlHead = new THREE.Mesh(cowlHeadGeo, facelessCowlMat);
  cowlHead.position.set(0, 0.15, 0.008);
  cowlHead.castShadow = true;
  headGroup.add(cowlHead);

  // Raised Weatherproof Storm Hood Shell wrapping back/crown/cheeks
  const hoodOuterGeo = new THREE.SphereGeometry(
    0.132,
    16,
    14,
    -Math.PI * 0.68,
    Math.PI * 1.36,
    0,
    Math.PI * 0.72
  );
  hoodOuterGeo.scale(0.92, 1.06, 1.08);
  const hoodOuter = new THREE.Mesh(hoodOuterGeo, jacketMat);
  hoodOuter.position.set(0, 0.155, -0.022);
  hoodOuter.rotation.set(-0.18, Math.PI, 0);
  hoodOuter.castShadow = true;
  headGroup.add(hoodOuter);

  // Hood brow peak / rain visor overhang
  const hoodBrimGeo = new THREE.TorusGeometry(0.112, 0.024, 8, 18, Math.PI * 1.25);
  const hoodBrim = new THREE.Mesh(hoodBrimGeo, hoodTrimMat);
  hoodBrim.position.set(0, 0.155, 0.045);
  hoodBrim.rotation.set(0.32, 0, -Math.PI * 0.125);
  headGroup.add(hoodBrim);

  // Articulated Sleeved Arms with Shoulder Guards, Elbow Pads & Gloved Hands
  const shoulderPadGeo = new THREE.SphereGeometry(0.074, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58);
  shoulderPadGeo.scale(1.05, 0.85, 1.12);
  const upperArmGeo = new THREE.CylinderGeometry(0.058, 0.048, 0.28, 10);
  const elbowPadGeo = new THREE.BoxGeometry(0.068, 0.072, 0.055);
  const forearmGeo = new THREE.CylinderGeometry(0.048, 0.037, 0.25, 10);
  const glovePalmGeo = new THREE.BoxGeometry(0.052, 0.075, 0.064);
  const gloveFingerGeo = new THREE.BoxGeometry(0.048, 0.052, 0.045);

  const buildArm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.255, 0.44, 0);
    torso.add(shoulder);

    const shoulderPad = new THREE.Mesh(shoulderPadGeo, armorPadMat);
    shoulderPad.position.set(side * 0.008, 0.015, 0);
    shoulderPad.rotation.z = -side * 0.35;
    shoulderPad.castShadow = true;
    shoulder.add(shoulderPad);

    const upper = new THREE.Mesh(upperArmGeo, jacketMat);
    upper.position.y = -0.14;
    upper.castShadow = true;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.28, 0);
    shoulder.add(elbow);

    const elbowPad = new THREE.Mesh(elbowPadGeo, armorPadMat);
    elbowPad.position.set(0, 0.01, -0.022);
    elbow.add(elbowPad);

    const forearm = new THREE.Mesh(forearmGeo, jacketPanelMat);
    forearm.position.y = -0.125;
    forearm.castShadow = true;
    elbow.add(forearm);

    const cuffGeo = new THREE.CylinderGeometry(0.041, 0.04, 0.048, 10);
    const cuff = new THREE.Mesh(cuffGeo, strapMat);
    cuff.position.y = -0.235;
    elbow.add(cuff);
    disposables.push(cuffGeo);

    // Iconic glowing cufflink band on right wrist
    if (side < 0) {
      const linkGeo = new THREE.TorusGeometry(0.043, 0.006, 6, 14);
      linkGeo.rotateX(Math.PI / 2);
      const linkMat = new THREE.MeshStandardMaterial({
        color: 0xe6f8ff,
        emissive: 0x9be2ff,
        emissiveIntensity: 2.2,
        roughness: 0.2,
      });
      const cufflink = new THREE.Mesh(linkGeo, linkMat);
      cufflink.position.y = -0.242;
      elbow.add(cufflink);
      disposables.push(linkGeo, linkMat);
    }

    // Weatherproof Gloved Hand (zero bare skin)
    const handGroup = new THREE.Group();
    handGroup.position.set(0, -0.285, 0.005);
    const palm = new THREE.Mesh(glovePalmGeo, gloveMat);
    const fingers = new THREE.Mesh(gloveFingerGeo, gloveMat);
    fingers.position.set(0, -0.052, 0.01);
    fingers.rotation.x = 0.22;
    handGroup.add(palm, fingers);
    elbow.add(handGroup);

    return { shoulder, elbow };
  };

  const leftArm = buildArm(1);
  const rightArm = buildArm(-1);

  // Articulated Layered Trousers, Cargo Pockets, Knee Pads & Multi-Part All-Terrain Boots
  const thighGeo = new THREE.CylinderGeometry(0.084, 0.066, 0.42, 12);
  const cargoPocketGeo = new THREE.BoxGeometry(0.045, 0.14, 0.11);
  const kneePadGeo = new THREE.BoxGeometry(0.092, 0.095, 0.055);
  const shinGeo = new THREE.CylinderGeometry(0.064, 0.052, 0.4, 12);
  const legStripeGeo = new THREE.BoxGeometry(0.016, 0.36, 0.025);
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xa94228,
    roughness: 0.65,
    metalness: 0.05,
  });
  disposables.push(legStripeGeo, stripeMat);

  const bootShaftGeo = new THREE.CylinderGeometry(0.062, 0.058, 0.11, 10);
  const bootUpperGeo = new THREE.BoxGeometry(0.112, 0.088, 0.22);
  const bootToeGeo = new THREE.SphereGeometry(0.058, 10, 8);
  bootToeGeo.scale(0.95, 0.72, 1.15);
  const bootSoleGeo = new THREE.BoxGeometry(0.12, 0.036, 0.245);

  const buildLeg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.108, -0.02, 0);
    pelvis.add(hip);

    const thigh = new THREE.Mesh(thighGeo, pantsMat);
    thigh.position.y = -0.21;
    thigh.castShadow = true;
    hip.add(thigh);

    const cargoPocket = new THREE.Mesh(cargoPocketGeo, strapMat);
    cargoPocket.position.set(side * 0.068, -0.2, 0.01);
    hip.add(cargoPocket);

    const thighStripe = new THREE.Mesh(legStripeGeo, stripeMat);
    thighStripe.position.set(side * 0.075, -0.21, -0.02);
    hip.add(thighStripe);

    const knee = new THREE.Group();
    knee.position.set(0, -0.42, 0);
    hip.add(knee);

    const kneePad = new THREE.Mesh(kneePadGeo, armorPadMat);
    kneePad.position.set(0, 0.01, 0.052);
    kneePad.castShadow = true;
    knee.add(kneePad);

    const shin = new THREE.Mesh(shinGeo, pantsMat);
    shin.position.y = -0.2;
    shin.castShadow = true;
    knee.add(shin);

    const shinStripe = new THREE.Mesh(legStripeGeo, stripeMat);
    shinStripe.position.set(side * 0.057, -0.19, 0);
    knee.add(shinStripe);

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.4, 0);
    knee.add(ankle);

    const bootShaft = new THREE.Mesh(bootShaftGeo, bootMat);
    bootShaft.position.set(0, 0.015, 0);
    ankle.add(bootShaft);

    const boot = new THREE.Mesh(bootUpperGeo, bootMat);
    boot.position.set(0, -0.042, 0.04);
    boot.castShadow = true;
    ankle.add(boot);

    const toeCap = new THREE.Mesh(bootToeGeo, armorPadMat);
    toeCap.position.set(0, -0.05, 0.135);
    ankle.add(toeCap);

    const sole = new THREE.Mesh(bootSoleGeo, strapMat);
    sole.position.set(0, -0.09, 0.042);
    ankle.add(sole);

    return { hip, knee, ankle };
  };

  const leftLeg = buildLeg(1);
  const rightLeg = buildLeg(-1);

  disposables.push(
    pelvisMeshGeo,
    beltGeo,
    beltBuckleGeo,
    hipPouchGeo,
    chestGeo,
    yokeGeo,
    placketGeo,
    pocketGeo,
    collarGeo,
    collarRimGeo,
    strapGeo,
    buckleGeo,
    podHousingGeo,
    podCapGeo,
    armLowerGeo,
    scannerCoreGeo,
    petalGeo,
    neckGaiterGeo,
    cowlHeadGeo,
    hoodOuterGeo,
    hoodBrimGeo,
    shoulderPadGeo,
    upperArmGeo,
    elbowPadGeo,
    forearmGeo,
    glovePalmGeo,
    gloveFingerGeo,
    thighGeo,
    cargoPocketGeo,
    kneePadGeo,
    shinGeo,
    bootShaftGeo,
    bootUpperGeo,
    bootToeGeo,
    bootSoleGeo
  );

  // Floating 3D Nameplate Indicator Above Player Head
  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = 384;
  nameCanvas.height = 84;
  const nameTexture = new THREE.CanvasTexture(nameCanvas);
  nameTexture.colorSpace = THREE.SRGBColorSpace;
  nameTexture.minFilter = THREE.LinearFilter;
  nameTexture.magFilter = THREE.LinearFilter;

  const nameSpriteMat = new THREE.SpriteMaterial({
    map: nameTexture,
    transparent: true,
    depthWrite: false,
  });
  const nameSprite = new THREE.Sprite(nameSpriteMat);
  nameSprite.position.set(0, 2.22, 0);
  nameSprite.scale.set(1.22, 0.27, 1);
  root.add(nameSprite);
  disposables.push(nameTexture, nameSpriteMat);

  let playerName = 'Drifter';
  const drawNameBadge = (rawName: string) => {
    const clean = rawName.trim().slice(0, 20) || 'Drifter';
    playerName = clean;
    const ctx = nameCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, nameCanvas.width, nameCanvas.height);

    ctx.font = '600 28px "Inter", system-ui, -apple-system, sans-serif';
    const textW = Math.min(330, Math.ceil(ctx.measureText(clean).width));
    const pillW = Math.max(112, textW + 40);
    const pillH = 50;
    const rx = (nameCanvas.width - pillW) / 2;
    const ry = (nameCanvas.height - pillH) / 2;

    ctx.fillStyle = 'rgba(12, 16, 22, 0.78)';
    ctx.beginPath();
    ctx.roundRect(rx, ry, pillW, pillH, 10);
    ctx.fill();

    ctx.strokeStyle = 'rgba(245, 184, 61, 0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f1f5f9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(clean, nameCanvas.width / 2, nameCanvas.height / 2 + 1, 330);

    nameTexture.needsUpdate = true;
  };
  drawNameBadge(playerName);

  scene.add(root);

  // Footprint Decal Pool on Wet Sand
  const maxFootprints = 64;
  const fpGeo = new THREE.PlaneGeometry(0.24, 0.42);
  fpGeo.rotateX(-Math.PI / 2);
  const footprints: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number; active: boolean }[] = [];
  for (let i = 0; i < maxFootprints; i++) {
    const fpMat = new THREE.MeshBasicMaterial({
      map: textures.footprintMap,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const fpMesh = new THREE.Mesh(fpGeo, fpMat);
    fpMesh.visible = false;
    scene.add(fpMesh);
    footprints.push({ mesh: fpMesh, mat: fpMat, age: 0, active: false });
    disposables.push(fpMat);
  }
  disposables.push(fpGeo);

  let fpCursor = 0;
  const spawnFootprint = (worldX: number, worldZ: number, headingYaw: number, side: number) => {
    const h = groundHeightAt(worldX, worldZ);
    if (h < SEA_LEVEL - 0.12) return;

    const entry = footprints[fpCursor];
    fpCursor = (fpCursor + 1) % maxFootprints;

    const lateral = 0.11 * side;
    const fx = worldX + Math.cos(headingYaw) * lateral;
    const fz = worldZ - Math.sin(headingYaw) * lateral;
    const fy = groundHeightAt(fx, fz);

    groundNormalAt(fx, fz, _surfNorm);
    _fpQuat.setFromUnitVectors(_up, _surfNorm);
    _fpYawQuat.setFromAxisAngle(_up, headingYaw);
    _fpQuat.multiply(_fpYawQuat);

    entry.mesh.position.set(fx, fy + 0.025, fz);
    entry.mesh.quaternion.copy(_fpQuat);
    entry.mesh.scale.set(side < 0 ? -1 : 1, 1, 1);
    entry.mesh.visible = true;
    entry.age = 0;
    entry.active = true;
    entry.mat.opacity = h < 0.6 ? 0.72 : 0.52;
  };

  // Physics, Health, Weight, Stamina, Cold, Durability & Climbing State
  const velocity = new THREE.Vector3();
  let verticalVel = 0;
  let isGrounded = true;
  let airPeakY = root.position.y;
  let yaw = Math.PI;
  let stridePhase = 0;
  let lastStepHalf = 0;
  let isClimbing = false;
  let isSlipping = false;
  let slipBlend = 0;
  let lastSlipAudio = -10;
  let climbSlopeDeg = 0;
  let climbBlend = 0;
  let climbPhase = 0;
  let lastClimbStepHalf = 0;
  let climbWallDirX = 0;
  let climbWallDirZ = 1;
  let scanTimer = 0;
  let landCompression = 0;
  const maxHealth = 100;
  let health = 100;
  let stamina = 100;
  let staminaExhausted = false;
  let staminaCooldownRemaining = 0;
  let cold = 14;
  let bootsDurability = 100;
  let suitDurability = 100;
  let carriedWeightKg = 0;

  const syncGearMaterials = () => {
    bootMat.roughness = THREE.MathUtils.lerp(0.9, 0.46, bootsDurability / 100);
    jacketMat.roughness = THREE.MathUtils.lerp(0.95, 0.72, suitDurability / 100);
    jacketPanelMat.roughness = THREE.MathUtils.lerp(0.96, 0.78, suitDurability / 100);
  };

  const triggerScan = () => {
    scanTimer = 1.6;
  };

  const setCarriedWeight = (weightKg: number) => {
    carriedWeightKg = Math.max(0, weightKg);
    controller.carriedWeightKg = carriedWeightKg;
  };

  const setPlayerName = (name: string) => {
    drawNameBadge(name);
    controller.playerName = playerName;
  };

  const damage = (amount: number) => {
    health = Math.max(0, health - Math.max(0, amount));
    controller.health = health;
  };

  const applyWormFeeding = () => {
    health = Math.min(maxHealth, health + 18);
    stamina = Math.min(100, stamina + 38);
    staminaExhausted = false;
    staminaCooldownRemaining = 0;
    cold = Math.max(0, cold - 30);
    controller.health = health;
    controller.stamina = stamina;
    controller.staminaExhausted = false;
    controller.staminaCooldownRemaining = 0;
    controller.cold = cold;
  };

  const repairGear = (slot: 'boots' | 'suit', mode: 'repair' | 'craft') => {
    if (slot === 'boots') {
      bootsDurability = mode === 'craft' ? 100 : Math.min(100, bootsDurability + 55);
      controller.bootsDurability = bootsDurability;
    } else {
      suitDurability = mode === 'craft' ? 100 : Math.min(100, suitDurability + 55);
      controller.suitDurability = suitDurability;
    }
    syncGearMaterials();
  };

  const restoreState = (state: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    health: number;
    stamina: number;
    staminaExhausted: boolean;
    cold: number;
    bootsDurability?: number;
    suitDurability?: number;
    playerName: string;
  }) => {
    root.position.set(state.x, state.y, state.z);
    velocity.set(0, 0, 0);
    verticalVel = 0;
    isGrounded = true;
    airPeakY = state.y;
    isClimbing = false;
    isSlipping = false;
    slipBlend = 0;
    climbSlopeDeg = 0;
    climbBlend = 0;
    yaw = state.yaw;
    root.rotation.y = yaw;
    health = THREE.MathUtils.clamp(state.health, 0, maxHealth);
    stamina = THREE.MathUtils.clamp(state.stamina, 0, 100);
    staminaExhausted = state.staminaExhausted;
    staminaCooldownRemaining = state.staminaExhausted ? 1.5 : 0;
    cold = THREE.MathUtils.clamp(state.cold, 0, 100);
    bootsDurability = THREE.MathUtils.clamp(state.bootsDurability ?? 100, 0, 100);
    suitDurability = THREE.MathUtils.clamp(state.suitDurability ?? 100, 0, 100);
    syncGearMaterials();
    drawNameBadge(state.playerName);
    controller.yaw = yaw;
    controller.isClimbing = false;
    controller.isSlipping = false;
    controller.climbSlopeDeg = 0;
    controller.health = health;
    controller.stamina = stamina;
    controller.staminaExhausted = staminaExhausted;
    controller.staminaCooldownRemaining = staminaCooldownRemaining;
    controller.cold = cold;
    controller.bootsDurability = bootsDurability;
    controller.suitDurability = suitDurability;
    controller.playerName = playerName;
  };

  const resetState = () => {
    restoreState({
      x: 0,
      y: groundHeightAt(0, initialZ),
      z: initialZ,
      yaw: Math.PI,
      health: maxHealth,
      stamina: 100,
      staminaExhausted: false,
      cold: 14,
      bootsDurability: 100,
      suitDurability: 100,
      playerName,
    });
    setCarriedWeight(0);
  };

  const resolveFootstepSurface = (
    x: number,
    z: number,
    groundY: number,
    onBridgeLadder: boolean,
    insideBuilding: boolean
  ): FootstepSurface => {
    if (groundY < SEA_LEVEL + 0.08 || riverInfoAt(x, z).inRiver) return 'surf';
    if (onBridgeLadder || insideBuilding) return 'wood';
    if (dirtRoadMaskAt(x, z) > 0.35 || desertRockCoverageAt(x, z, groundY) > 0.45) {
      return 'rock';
    }
    return 'sand';
  };

  const controller: CharacterController = {
    group: root,
    backpackMount,
    position: root.position,
    yaw,
    speed: 0,
    isGrounded: true,
    isSprinting: false,
    isWading: false,
    isClimbing: false,
    isSlipping: false,
    climbSlopeDeg: 0,
    health,
    maxHealth,
    playerName,
    stamina,
    staminaExhausted,
    staminaCooldownRemaining,
    cold,
    bootsDurability,
    suitDurability,
    insideBuilding: false,
    buildingName: null,
    carriedWeightKg,
    lastBoundaryImpact: { hit: false, x: 0, z: 0, nx: 0, nz: 0 },
    setCarriedWeight,
    setPlayerName,
    damage,
    applyWormFeeding,
    repairGear,
    restoreState,
    resetState,
    triggerScan,
    update: (delta, elapsed, input, colliders, onFootstep, onFallImpact, onSlip) => {
      const dt = Math.min(delta, 0.05);

      // Camera-relative movement direction
      _camForward.set(-Math.sin(input.cameraYaw), 0, -Math.cos(input.cameraYaw));
      _camRight.set(Math.cos(input.cameraYaw), 0, -Math.sin(input.cameraYaw));

      _moveDir
        .set(0, 0, 0)
        .addScaledVector(_camForward, input.forward)
        .addScaledVector(_camRight, input.right);

      const hasInput = _moveDir.lengthSq() > 0.001;
      if (hasInput) _moveDir.normalize();

      const loadRatio = THREE.MathUtils.clamp(carriedWeightKg / 72, 0, 1.2);
      const coldPenalty = cold >= 70 ? 0.9 : 1.0;
      const bootsSpeedMult = bootsDurability <= 0 ? 0.82 : bootsDurability < 25 ? 0.92 : 1.0;
      const canSprint = !staminaExhausted && stamina > 1.5;
      const wantsSprint = input.sprint && hasInput && canSprint;

      const walkSpeed =
        (staminaExhausted ? 2.35 : 3.35 * (1 - loadRatio * 0.22)) *
        coldPenalty *
        bootsSpeedMult;
      const sprintSpeed = 6.7 * (1 - loadRatio * 0.25) * coldPenalty * bootsSpeedMult;
      const maxSpeed = wantsSprint ? sprintSpeed : walkSpeed;

      const targetVx = hasInput ? _moveDir.x * maxSpeed : 0;
      const targetVz = hasInput ? _moveDir.z * maxSpeed : 0;

      const accelLambda = hasInput ? 10.5 : 12.0;
      velocity.x = THREE.MathUtils.damp(velocity.x, targetVx, accelLambda, dt);
      velocity.z = THREE.MathUtils.damp(velocity.z, targetVz, accelLambda, dt);

      const horizSpeed = Math.hypot(velocity.x, velocity.z);
      controller.speed = horizSpeed;
      const actuallySprinting = wantsSprint && horizSpeed > walkSpeed + 0.5;
      controller.isSprinting = actuallySprinting;

      // Apply horizontal velocity, hand-climbing, hill slipping, and obstacle/wall collisions
      const prevX = root.position.x;
      const prevZ = root.position.z;
      const prevTerrainY = groundHeightAt(prevX, prevZ);

      let nextX = prevX + velocity.x * dt;
      let nextZ = prevZ + velocity.z * dt;
      const nextTerrainY = groundHeightAt(nextX, nextZ);
      const nextSurfaceY = input.surfaceHeightResolver
        ? input.surfaceHeightResolver(nextX, nextZ, nextTerrainY)
        : nextTerrainY;
      const onBridgeLadder = nextSurfaceY > nextTerrainY + 0.03;

      let activeClimbMove = false;
      let clingingOnSlope = false;
      const wasClimbing = isClimbing;
      isClimbing = false;
      isSlipping = false;
      climbSlopeDeg = 0;

      if (!onBridgeLadder) {
        groundNormalAt(nextX, nextZ, _surfNorm);
        const slopeDeg = Math.round(
          THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(_surfNorm.y, 0, 1)))
        );
        const rainW = input.rainWeight ?? 0;
        const snowW = input.snowWeight ?? 0;
        const roadMask = dirtRoadMaskAt(nextX, nextZ);
        const wornBootsFactor = 1 - bootsDurability / 100;

        // Very steep faces (> ~42 deg) or steep high-altitude ridges (> ~37 deg above 9m) engage hand-climbing
        const isSteepFace =
          _surfNorm.y < 0.74 || (_surfNorm.y < 0.8 && Math.max(prevTerrainY, nextTerrainY) > 9.0);
        // Wet weather, exhaustion, or worn boots lower traction so steep hills can trigger a downhill slip
        const slipThresholdY =
          0.77 +
          rainW * 0.05 +
          snowW * 0.04 +
          (staminaExhausted ? 0.04 : 0) +
          wornBootsFactor * 0.11 -
          roadMask * 0.055;

        const nx = _surfNorm.x;
        const nz = _surfNorm.z;
        const hLen = Math.hypot(nx, nz);

        if (hLen > 1e-4) {
          const downX = nx / hLen;
          const downZ = nz / hLen;
          const inputIntoSlope = hasInput ? _moveDir.x * downX + _moveDir.z * downZ : 0;
          const velIntoSlope = velocity.x * downX + velocity.z * downZ;
          const pushingUphill = inputIntoSlope < -0.05 || nextTerrainY > prevTerrainY + 0.01;
          const canGrip = !staminaExhausted && stamina > 1.2 && bootsDurability > 8;

          if (isSteepFace && canGrip && (pushingUphill || (wasClimbing && !hasInput))) {
            isClimbing = true;
            climbSlopeDeg = slopeDeg;
            climbWallDirX = -downX;
            climbWallDirZ = -downZ;

            if (hasInput && inputIntoSlope < 0.25) {
              activeClimbMove = true;
              const arcScale = THREE.MathUtils.clamp(_surfNorm.y, 0.24, 0.92);
              const climbEffortSpeed =
                2.45 * (1 - loadRatio * 0.24) * coldPenalty * (wantsSprint ? 1.18 : 1.0);
              velocity.x = THREE.MathUtils.damp(
                velocity.x,
                _moveDir.x * climbEffortSpeed * arcScale,
                10,
                dt
              );
              velocity.z = THREE.MathUtils.damp(
                velocity.z,
                _moveDir.z * climbEffortSpeed * arcScale,
                10,
                dt
              );
              nextX = prevX + velocity.x * dt;
              nextZ = prevZ + velocity.z * dt;
            } else {
              clingingOnSlope = true;
              velocity.x *= Math.exp(-14 * dt);
              velocity.z *= Math.exp(-14 * dt);
              nextX = prevX + velocity.x * dt;
              nextZ = prevZ + velocity.z * dt;
            }
          } else if (
            isGrounded &&
            !isClimbing &&
            _surfNorm.y < slipThresholdY &&
            (inputIntoSlope > -0.04 || !canGrip || bootsDurability < 25 || _surfNorm.y < 0.72)
          ) {
            // Downhill hill slip: boots lose purchase and player accelerates downslope
            isSlipping = true;
            const slideTarget =
              (4.9 + (1 - _surfNorm.y) * 11.2) *
              (1 + wornBootsFactor * 0.36) *
              (1 + rainW * 0.18);
            const steerX = hasInput ? _moveDir.x * 1.45 : 0;
            const steerZ = hasInput ? _moveDir.z * 1.45 : 0;
            velocity.x = THREE.MathUtils.damp(velocity.x, downX * slideTarget + steerX, 5.5, dt);
            velocity.z = THREE.MathUtils.damp(velocity.z, downZ * slideTarget + steerZ, 5.5, dt);
            nextX = prevX + velocity.x * dt;
            nextZ = prevZ + velocity.z * dt;

            if (elapsed - lastSlipAudio > 0.45) {
              lastSlipAudio = elapsed;
              onSlip?.();
            }

            const slideGroundY = groundHeightAt(nextX, nextZ);
            if (slideGroundY < prevTerrainY - 0.38 && Math.hypot(velocity.x, velocity.z) > 4.2) {
              isGrounded = false;
              verticalVel = -1.2;
              airPeakY = root.position.y;
            }
          } else if (isSteepFace && (velIntoSlope < 0 || !canGrip)) {
            if (velIntoSlope < 0) {
              velocity.x -= downX * velIntoSlope;
              velocity.z -= downZ * velIntoSlope;
            }
            nextX = prevX + velocity.x * dt;
            nextZ = prevZ + velocity.z * dt;
            if (!canGrip || _surfNorm.y < 0.64) {
              nextX += downX * (canGrip ? 0.65 : 2.15) * dt;
              nextZ += downZ * (canGrip ? 0.65 : 2.15) * dt;
            }
          }
        }
      }

      controller.isClimbing = isClimbing;
      controller.isSlipping = isSlipping;
      controller.climbSlopeDeg = climbSlopeDeg;

      root.position.x = nextX;
      root.position.z = nextZ;

      const impact = resolveCharacterCollisions(
        root.position,
        onBridgeLadder ? [] : colliders,
        0.45
      );
      controller.lastBoundaryImpact = impact;
      if (impact.hit) {
        const dot = velocity.x * impact.nx + velocity.z * impact.nz;
        if (dot < 0) {
          velocity.x -= impact.nx * dot;
          velocity.z -= impact.nz * dot;
        }
      }

      const groundY = input.surfaceHeightResolver
        ? input.surfaceHeightResolver(
            root.position.x,
            root.position.z,
            groundHeightAt(root.position.x, root.position.z)
          )
        : groundHeightAt(root.position.x, root.position.z);

      const anchorDrainMult = input.anchorAssist ? 0.45 : 1.0;
      const anchorRegenMult = input.anchorAssist ? 1.45 : 1.0;

      const jumpCost = (12 + carriedWeightKg * 0.14) * anchorDrainMult;
      if (input.jumpPressed && (isGrounded || isClimbing) && !staminaExhausted && stamina >= 8) {
        verticalVel = (isClimbing ? 4.9 : 5.4) - loadRatio * 0.45;
        isGrounded = false;
        airPeakY = root.position.y;
        isClimbing = false;
        isSlipping = false;
        controller.isClimbing = false;
        controller.isSlipping = false;
        stamina = Math.max(0, stamina - jumpCost);
      }

      // Stamina & Exhaustion Cooldown (accounts for hand-climbing exertion)
      const coldRegenMult = cold >= 70 ? 0.72 : 1.0;
      if (activeClimbMove) {
        const climbDrain = (9.8 + carriedWeightKg * 0.18) * anchorDrainMult;
        stamina = Math.max(0, stamina - climbDrain * dt);
      } else if (clingingOnSlope) {
        const holdDrain = (1.35 + carriedWeightKg * 0.04) * anchorDrainMult;
        stamina = Math.max(0, stamina - holdDrain * dt);
      } else if (actuallySprinting && !isClimbing) {
        const drainRate = (13.5 + carriedWeightKg * 0.26) * anchorDrainMult;
        stamina = Math.max(0, stamina - drainRate * dt);
      } else if (isGrounded) {
        const baseRegen = hasInput ? 11.5 : 22.0;
        const regenRate = Math.max(
          4.0,
          (baseRegen - loadRatio * 5.0) * anchorRegenMult * coldRegenMult
        );
        stamina = Math.min(100, stamina + regenRate * dt);
      }

      if (!staminaExhausted && stamina <= 0.05) {
        stamina = 0;
        staminaExhausted = true;
        staminaCooldownRemaining = 3.2;
      }

      if (staminaExhausted) {
        staminaCooldownRemaining = Math.max(0, staminaCooldownRemaining - dt);
        if (staminaCooldownRemaining <= 0 && stamina >= 30) {
          staminaExhausted = false;
        }
      }

      controller.stamina = stamina;
      controller.staminaExhausted = staminaExhausted;
      controller.staminaCooldownRemaining = staminaCooldownRemaining;

      const wading = groundY < SEA_LEVEL + 0.08 || riverInfoAt(root.position.x, root.position.z).inRiver;
      controller.isWading = wading;

      const insideBuilding = Boolean(input.insideBuilding);
      controller.insideBuilding = insideBuilding;
      controller.buildingName = input.buildingName ?? null;

      // Shoes (Boots) & Clothes (Suit) Durability Wear
      const stepDist =
        isGrounded || isClimbing
          ? Math.hypot(root.position.x - prevX, root.position.z - prevZ)
          : 0;
      const roadRelief = 1 - dirtRoadMaskAt(root.position.x, root.position.z) * 0.35;
      const rockRough =
        desertRockCoverageAt(root.position.x, root.position.z, groundY) > 0.45 || isClimbing
          ? 1.5
          : 1.0;
      const bootsWear =
        stepDist *
        0.048 *
        rockRough *
        roadRelief *
        (1 + loadRatio * 0.45) *
        (actuallySprinting ? 1.3 : 1.0) *
        (isSlipping ? 1.8 : 1.0);
      bootsDurability = Math.max(0, bootsDurability - bootsWear);

      const suitAbrasion = !insideBuilding
        ? ((input.rainWeight ?? 0) * 0.14 +
            (input.snowWeight ?? 0) * 0.18 +
            (wading ? 0.22 : 0) +
            (activeClimbMove ? 0.24 : 0) +
            (isSlipping ? 0.45 : 0)) *
          dt
        : 0;
      suitDurability = Math.max(0, suitDurability - suitAbrasion);
      controller.bootsDurability = bootsDurability;
      controller.suitDurability = suitDurability;
      syncGearMaterials();

      // Cold Feeling / Thermal Exposure Update (worn clothes reduce insulation)
      if (insideBuilding) {
        cold = Math.max(0, cold - 18.0 * dt);
        if (cold < 45 && health < maxHealth) {
          health = Math.min(maxHealth, health + 2.2 * dt);
        }
      } else {
        const suitColdMult = 1 + (1 - suitDurability / 100) * 0.85;
        const snowChill = (input.snowWeight ?? 0) * 2.45;
        const rainChill = (input.rainWeight ?? 0) * 1.15;
        const nightChill = (input.nightWeight ?? 0) * 0.34;
        const surfChill = wading ? 3.4 : 0;
        const altitudeChill = root.position.y > 5 ? Math.min(1.65, (root.position.y - 5) * 0.11) : 0;
        const exertionWarmth = (actuallySprinting || activeClimbMove) && !wading ? -0.58 : 0;
        const coldRate =
          0.22 +
          (snowChill + rainChill + nightChill + surfChill + altitudeChill) * suitColdMult +
          exertionWarmth;
        cold = THREE.MathUtils.clamp(cold + coldRate * dt, 0, 100);
        if (cold >= 98) {
          health = Math.max(5, health - 0.8 * dt);
        }
      }
      controller.cold = cold;
      controller.health = health;

      // Step off steep drop if not gripping/climbing
      if (isGrounded && !isClimbing && root.position.y - groundY > 0.72) {
        isGrounded = false;
        verticalVel = Math.min(verticalVel, -0.8);
        airPeakY = root.position.y;
      }

      if (!isGrounded) {
        verticalVel -= 15.5 * dt;
        root.position.y += verticalVel * dt;
        airPeakY = Math.max(airPeakY, root.position.y);
        if (root.position.y <= groundY) {
          const impactSpeed = Math.abs(verticalVel);
          const dropHeight = Math.max(0, airPeakY - groundY);
          root.position.y = groundY;
          verticalVel = 0;
          isGrounded = true;

          if (!onBridgeLadder && (impactSpeed > 8.6 || dropHeight > 2.8)) {
            const dmg = Math.min(
              82,
              Math.round(
                Math.max(impactSpeed - 8.1, 0) * 5.6 + Math.max(dropHeight - 2.6, 0) * 3.9
              )
            );
            if (dmg > 0) {
              damage(dmg);
              landCompression = 0.28;
              bootsDurability = Math.max(0, bootsDurability - (3.5 + dmg * 0.14));
              suitDurability = Math.max(0, suitDurability - (2.0 + dmg * 0.11));
              controller.bootsDurability = bootsDurability;
              controller.suitDurability = suitDurability;
              syncGearMaterials();
              onFallImpact?.({ damage: dmg, impactSpeed, dropHeight });
            } else {
              landCompression = 0.14;
            }
          } else {
            landCompression = 0.14;
          }
          airPeakY = groundY;

          spawnFootprint(root.position.x, root.position.z, yaw, 1);
          spawnFootprint(root.position.x, root.position.z, yaw, -1);
          onFootstep?.({
            surface: resolveFootstepSurface(
              root.position.x,
              root.position.z,
              groundY,
              onBridgeLadder,
              insideBuilding
            ),
            heavyCargo: carriedWeightKg >= 12,
            weightKg: carriedWeightKg,
          });
        }
      } else {
        root.position.y = THREE.MathUtils.damp(
          root.position.y,
          groundY,
          isClimbing ? 28 : 20,
          dt
        );
        airPeakY = root.position.y;
      }

      controller.isGrounded = isGrounded;

      // Smooth character yaw: face into the rock wall while climbing, otherwise face movement direction
      if (isClimbing) {
        const wallYaw = Math.atan2(climbWallDirX, climbWallDirZ);
        const diff = shortestAngleDiff(yaw, wallYaw);
        yaw += diff * (1 - Math.exp(-12 * dt));
      } else if (horizSpeed > 0.2) {
        const targetYaw = Math.atan2(velocity.x, velocity.z);
        const diff = shortestAngleDiff(yaw, targetYaw);
        yaw += diff * (1 - Math.exp(-11 * dt));
      }
      controller.yaw = yaw;
      root.rotation.y = yaw;

      // Procedural Gait, Hand-Climbing, Slipping & Articulated Joint Kinematics
      const moveWeight = THREE.MathUtils.clamp(horizSpeed / 3.2, 0, 1);
      const sprintBlend = THREE.MathUtils.clamp((horizSpeed - 3.2) / 3.4, 0, 1);
      climbBlend = THREE.MathUtils.damp(climbBlend, isClimbing ? 1 : 0, 11, dt);
      slipBlend = THREE.MathUtils.damp(slipBlend, isSlipping ? 1 : 0, 12, dt);

      if (isClimbing) {
        const climbTravelSpeed = Math.hypot(
          (root.position.x - prevX) / Math.max(dt, 1e-4),
          (root.position.z - prevZ) / Math.max(dt, 1e-4),
          Math.max(0, groundY - prevTerrainY) / Math.max(dt, 1e-4)
        );
        if (activeClimbMove && climbTravelSpeed > 0.2) {
          climbPhase += dt * (4.6 + climbTravelSpeed * 1.45);
          const climbHalf = Math.floor(climbPhase / Math.PI);
          if (climbHalf !== lastClimbStepHalf) {
            lastClimbStepHalf = climbHalf;
            onFootstep?.({
              surface: 'rock',
              heavyCargo: carriedWeightKg >= 12,
              weightKg: carriedWeightKg,
            });
          }
        }
      } else if (horizSpeed > 0.15 && isGrounded && !isSlipping) {
        const freq = THREE.MathUtils.lerp(5.8, 9.6, sprintBlend);
        stridePhase += dt * freq;

        const currentHalf = Math.floor(stridePhase / Math.PI);
        if (currentHalf !== lastStepHalf) {
          lastStepHalf = currentHalf;
          const side = currentHalf % 2 === 0 ? 1 : -1;
          spawnFootprint(root.position.x, root.position.z, yaw, side);
          onFootstep?.({
            surface: resolveFootstepSurface(
              root.position.x,
              root.position.z,
              groundY,
              onBridgeLadder,
              insideBuilding
            ),
            heavyCargo: carriedWeightKg >= 12,
            weightKg: carriedWeightKg,
          });
        }
      }

      landCompression = THREE.MathUtils.damp(landCompression, 0, 12, dt);

      const swing = Math.sin(stridePhase);
      const swingCos = Math.cos(stridePhase);
      const legAmp = THREE.MathUtils.lerp(0.55, 0.88, sprintBlend) * moveWeight * (1 - slipBlend * 0.75);
      const armAmp = THREE.MathUtils.lerp(0.45, 0.78, sprintBlend) * moveWeight * (1 - slipBlend * 0.75);

      const breatheSpeed = staminaExhausted ? 4.4 : isClimbing ? 3.2 : 2.1;
      const breatheAmp = staminaExhausted ? 0.032 : 0.015;
      const breathe = Math.sin(elapsed * breatheSpeed) * breatheAmp;
      const shiver = cold >= 70 && !insideBuilding ? Math.sin(elapsed * 26) * 0.008 * (1 - moveWeight) : 0;
      const idleSway = Math.sin(elapsed * 0.9) * 0.02 * (1 - moveWeight) + shiver;

      const strideBob = Math.abs(swingCos) * 0.045 * moveWeight * (1 - slipBlend);
      const jumpTuck = !isGrounded ? 0.06 : 0;
      const walkPelvisY = 0.92 - strideBob - landCompression + jumpTuck - slipBlend * 0.09;
      const climbBob = Math.abs(Math.cos(climbPhase)) * 0.035 * (activeClimbMove ? 1 : 0);
      pelvis.position.y = THREE.MathUtils.lerp(walkPelvisY, 0.88 + climbBob, climbBlend);
      pelvis.position.z = THREE.MathUtils.lerp(0, -0.09, climbBlend);
      pelvis.rotation.y = THREE.MathUtils.lerp(
        swing * 0.1 * moveWeight,
        Math.sin(climbPhase) * 0.08,
        climbBlend
      );
      pelvis.rotation.z = idleSway * (1 - climbBlend) + Math.sin(elapsed * 16) * 0.05 * slipBlend;

      const weightLean = loadRatio * 0.13 + (staminaExhausted ? 0.08 : 0);
      const walkTorsoX =
        THREE.MathUtils.lerp(0.05, 0.22, sprintBlend) * moveWeight * (1 - slipBlend) +
        weightLean +
        breathe +
        landCompression * 0.8 -
        slipBlend * 0.28;
      const climbTorsoX = 0.34 + breathe * 1.2;
      torso.rotation.x = THREE.MathUtils.lerp(walkTorsoX, climbTorsoX, climbBlend);
      torso.rotation.y = THREE.MathUtils.lerp(
        -swing * 0.12 * moveWeight,
        -Math.sin(climbPhase) * 0.16,
        climbBlend
      );

      headGroup.rotation.x = THREE.MathUtils.lerp(
        -torso.rotation.x * 0.55 + breathe * 0.5,
        -0.36,
        climbBlend
      );
      headGroup.rotation.y =
        (Math.sin(elapsed * 0.55) * 0.06 * (1 - moveWeight) + shiver * 1.4) * (1 - climbBlend);

      const leftHipAngle = swing * legAmp;
      const rightHipAngle = -swing * legAmp;
      const leftKneeBend =
        Math.max(0, -swingCos) * (0.65 + sprintBlend * 0.45) * moveWeight + (!isGrounded ? 0.4 : 0);
      const rightKneeBend =
        Math.max(0, swingCos) * (0.65 + sprintBlend * 0.45) * moveWeight + (!isGrounded ? 0.25 : 0);

      // Climbing leg footholds alternate in opposition to overhead hand reaches
      const reachL = Math.sin(climbPhase);
      const reachR = -reachL;
      const climbHipL = -0.58 - reachR * 0.38;
      const climbHipR = -0.58 - reachL * 0.38;
      const climbKneeL = 0.92 + Math.max(0, reachR) * 0.48;
      const climbKneeR = 0.92 + Math.max(0, reachL) * 0.48;

      leftLeg.hip.rotation.x = THREE.MathUtils.lerp(
        leftHipAngle - landCompression * 1.4,
        climbHipL,
        climbBlend
      );
      rightLeg.hip.rotation.x = THREE.MathUtils.lerp(
        rightHipAngle - landCompression * 1.4,
        climbHipR,
        climbBlend
      );
      leftLeg.knee.rotation.x = THREE.MathUtils.lerp(
        leftKneeBend + landCompression * 2.4,
        climbKneeL,
        climbBlend
      );
      rightLeg.knee.rotation.x = THREE.MathUtils.lerp(
        rightKneeBend + landCompression * 2.4,
        climbKneeR,
        climbBlend
      );
      leftLeg.ankle.rotation.x = THREE.MathUtils.lerp(
        -leftHipAngle * 0.3 - leftKneeBend * 0.35,
        -0.28,
        climbBlend
      );
      rightLeg.ankle.rotation.x = THREE.MathUtils.lerp(
        -rightHipAngle * 0.3 - rightKneeBend * 0.35,
        -0.28,
        climbBlend
      );

      // Hand-over-hand rock gripping reaches (-X rotates hanging arm forward & overhead onto rock face)
      const climbArmL = -1.72 - reachL * 0.62;
      const climbArmR = -1.72 - reachR * 0.62;
      const climbElbowL = -0.78 + reachL * 0.36;
      const climbElbowR = -0.78 + reachR * 0.36;

      leftArm.shoulder.rotation.x = THREE.MathUtils.lerp(
        -swing * armAmp - slipBlend * 0.45,
        climbArmL,
        climbBlend
      );
      rightArm.shoulder.rotation.x = THREE.MathUtils.lerp(
        swing * armAmp - slipBlend * 0.45,
        climbArmR,
        climbBlend
      );
      leftArm.shoulder.rotation.z = THREE.MathUtils.lerp(
        0.1 + breathe * 0.6 + slipBlend * (0.48 + Math.sin(elapsed * 18) * 0.14),
        0.22 + reachL * 0.08,
        climbBlend
      );
      rightArm.shoulder.rotation.z = THREE.MathUtils.lerp(
        -0.1 - breathe * 0.6 - slipBlend * (0.48 - Math.sin(elapsed * 18) * 0.14),
        -0.22 - reachR * 0.08,
        climbBlend
      );
      leftArm.elbow.rotation.x = THREE.MathUtils.lerp(
        -0.25 - Math.max(0, swing) * 0.45 * moveWeight - slipBlend * 0.3,
        climbElbowL,
        climbBlend
      );
      rightArm.elbow.rotation.x = THREE.MathUtils.lerp(
        -0.25 - Math.max(0, -swing) * 0.45 * moveWeight - slipBlend * 0.3,
        climbElbowR,
        climbBlend
      );

      // Odradek Shoulder Scanner Unfold & Spin
      if (scanTimer > 0) {
        scanTimer = Math.max(0, scanTimer - dt);
        const activeT = Math.sin((scanTimer / 1.6) * Math.PI);
        odradekBase.rotation.z = THREE.MathUtils.damp(odradekBase.rotation.z, 0.38, 10, dt);
        odradekHead.rotation.z += dt * 7.5;
        scannerLightMat.emissiveIntensity = 1.4 + activeT * 2.2;
        for (let i = 0; i < petals.length; i++) {
          petals[i].position.y = 0.06 + activeT * 0.04;
        }
      } else {
        odradekBase.rotation.z = THREE.MathUtils.damp(
          odradekBase.rotation.z,
          0.08 + Math.sin(elapsed * 1.6) * 0.04,
          6,
          dt
        );
        odradekHead.rotation.z = THREE.MathUtils.damp(odradekHead.rotation.z, 0, 6, dt);
        scannerLightMat.emissiveIntensity = 1.1 + Math.sin(elapsed * 2.4) * 0.3;
        for (let i = 0; i < petals.length; i++) {
          petals[i].position.y = THREE.MathUtils.damp(petals[i].position.y, 0.06, 8, dt);
        }
      }

      // Fade footprints gradually
      for (let i = 0; i < footprints.length; i++) {
        const fp = footprints[i];
        if (!fp.active) continue;
        fp.age += dt;
        const life = 16.0;
        if (fp.age >= life) {
          fp.active = false;
          fp.mesh.visible = false;
        } else if (fp.age > 8.0) {
          fp.mat.opacity = (1 - (fp.age - 8.0) / (life - 8.0)) * 0.62;
        }
      }
    },
    dispose: () => {
      scene.remove(root);
      for (const fp of footprints) scene.remove(fp.mesh);
      disposables.forEach((d) => d.dispose());
    },
  };

  return controller;
}
