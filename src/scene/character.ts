import * as THREE from 'three';
import { ProceduralTextureSet } from './materials';
import {
  BoundaryImpact,
  ObstacleCollider,
  SEA_LEVEL,
  groundHeightAt,
  groundNormalAt,
  resolveCharacterCollisions,
} from './terrain';

export interface CharacterInputState {
  forward: number; // -1..1
  right: number; // -1..1
  sprint: boolean;
  jumpPressed: boolean;
  cameraYaw: number;
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
  stamina: number;
  staminaExhausted: boolean;
  staminaCooldownRemaining: number;
  carriedWeightKg: number;
  lastBoundaryImpact: BoundaryImpact;
  setCarriedWeight: (weightKg: number) => void;
  triggerScan: () => void;
  update: (
    delta: number,
    elapsed: number,
    input: CharacterInputState,
    colliders: ObstacleCollider[],
    onFootstep?: (wading: boolean) => void
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

  // Calibrated PBR Materials (varied roughness & metalness across adjacent parts)
  const jacketMat = new THREE.MeshStandardMaterial({
    map: textures.fabricMap,
    color: 0x263848,
    roughness: 0.72,
    metalness: 0.06,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x191d22,
    roughness: 0.85,
    metalness: 0.04,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x101215,
    roughness: 0.45,
    metalness: 0.14,
  });
  const strapMat = new THREE.MeshStandardMaterial({
    color: 0x2f353d,
    roughness: 0.58,
    metalness: 0.25,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x8e99a6,
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
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xc9a38b,
    roughness: 0.68,
    metalness: 0.02,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x1e1916,
    roughness: 0.82,
    metalness: 0.04,
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
    pantsMat,
    bootMat,
    strapMat,
    metalMat,
    packMat,
    accentGoldMat,
    skinMat,
    hairMat,
    podGlowMat,
    scannerLightMat
  );

  // Soft contact shadow directly under boots
  const shadowGeo = new THREE.CircleGeometry(0.45, 20);
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

  // Hierarchical Articulated Human Rig (total height ~1.78m, bottom-center pivot y=0)
  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.92, 0);
  root.add(pelvis);

  const pelvisMeshGeo = new THREE.BoxGeometry(0.32, 0.14, 0.22);
  const pelvisMesh = new THREE.Mesh(pelvisMeshGeo, pantsMat);
  pelvisMesh.castShadow = true;
  pelvis.add(pelvisMesh);

  // Spine & Torso
  const torso = new THREE.Group();
  torso.position.set(0, 0.08, 0);
  pelvis.add(torso);

  const chestGeo = new THREE.CylinderGeometry(0.21, 0.17, 0.48, 10);
  chestGeo.scale(1.12, 1.0, 0.72);
  const chestMesh = new THREE.Mesh(chestGeo, jacketMat);
  chestMesh.position.y = 0.25;
  chestMesh.castShadow = true;
  chestMesh.receiveShadow = true;
  torso.add(chestMesh);

  // Weatherproof Jacket Collar / Folded Hood
  const collarGeo = new THREE.TorusGeometry(0.14, 0.055, 8, 16);
  collarGeo.rotateX(Math.PI / 2);
  const collarMesh = new THREE.Mesh(collarGeo, jacketMat);
  collarMesh.position.set(0, 0.49, -0.02);
  torso.add(collarMesh);

  const hoodGeo = new THREE.BoxGeometry(0.24, 0.14, 0.16);
  const hoodMesh = new THREE.Mesh(hoodGeo, jacketMat);
  hoodMesh.position.set(0, 0.45, -0.14);
  hoodMesh.rotation.x = 0.35;
  torso.add(hoodMesh);

  // Tactical Harness Straps & Metallic Chest Clips
  const strapGeo = new THREE.BoxGeometry(0.05, 0.48, 0.28);
  const strapL = new THREE.Mesh(strapGeo, strapMat);
  strapL.position.set(0.11, 0.26, 0.01);
  const strapR = new THREE.Mesh(strapGeo, strapMat);
  strapR.position.set(-0.11, 0.26, 0.01);
  torso.add(strapL, strapR);

  const buckleGeo = new THREE.BoxGeometry(0.06, 0.04, 0.03);
  const buckleL = new THREE.Mesh(buckleGeo, metalMat);
  buckleL.position.set(0.11, 0.26, 0.155);
  const buckleR = new THREE.Mesh(buckleGeo, metalMat);
  buckleR.position.set(-0.11, 0.26, 0.155);
  torso.add(buckleL, buckleR);

  // Chest-mounted Amber Pod Capsule
  const podHousingGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.16, 12);
  const podHousing = new THREE.Mesh(podHousingGeo, podGlowMat);
  podHousing.position.set(0.04, 0.2, 0.17);
  podHousing.rotation.z = 0.14;
  torso.add(podHousing);

  const podCapGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12);
  const podCapTop = new THREE.Mesh(podCapGeo, metalMat);
  podCapTop.position.set(0.03, 0.28, 0.17);
  podCapTop.rotation.z = 0.14;
  const podCapBot = new THREE.Mesh(podCapGeo, metalMat);
  podCapBot.position.set(0.05, 0.12, 0.17);
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
  holderGroup.position.set(0, 0.08, -0.17);
  torso.add(holderGroup);

  // Backplate spine pad resting against the jacket
  const backPadGeo = new THREE.BoxGeometry(0.34, 0.44, 0.05);
  const backPad = new THREE.Mesh(backPadGeo, packMat);
  backPad.position.set(0, 0.22, -0.02);
  backPad.castShadow = true;
  holderGroup.add(backPad);

  // Vertical galvanized tubular side rails
  const sideRailGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.56, 8);
  const railL = new THREE.Mesh(sideRailGeo, frameSteelMat);
  railL.position.set(-0.22, 0.25, -0.05);
  railL.castShadow = true;
  const railR = new THREE.Mesh(sideRailGeo, frameSteelMat);
  railR.position.set(0.22, 0.25, -0.05);
  railR.castShadow = true;
  holderGroup.add(railL, railR);

  // Rear outer support uprights (creating the cargo cradle cage)
  const outerRailGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.5, 8);
  const outerL = new THREE.Mesh(outerRailGeo, frameSteelMat);
  outerL.position.set(-0.22, 0.23, -0.25);
  outerL.castShadow = true;
  const outerR = new THREE.Mesh(outerRailGeo, frameSteelMat);
  outerR.position.set(0.22, 0.23, -0.25);
  outerR.castShadow = true;
  holderGroup.add(outerL, outerR);

  // Horizontal tubular crossbars (top, mid, bottom tray)
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

  // Bottom L-ledge tray side arms & solid fold-out platform plate
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

  // Tension straps & buckles securing cargo inside the holder
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

  // Side Olive Utility Panel + Yellow Auxiliary Battery & Pouches (right side of frame)
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

  // Head & Neck
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.54, 0.01);
  torso.add(headGroup);

  const neckGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.1, 8);
  const neck = new THREE.Mesh(neckGeo, skinMat);
  neck.position.y = 0.03;
  headGroup.add(neck);

  const craniumGeo = new THREE.SphereGeometry(0.115, 14, 12);
  craniumGeo.scale(0.88, 1.06, 0.96);
  const cranium = new THREE.Mesh(craniumGeo, skinMat);
  cranium.position.y = 0.15;
  cranium.castShadow = true;
  headGroup.add(cranium);

  const hairCapGeo = new THREE.SphereGeometry(0.122, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
  hairCapGeo.scale(0.9, 1.05, 1.02);
  const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
  hairCap.position.set(0, 0.165, -0.015);
  hairCap.rotation.x = -0.22;
  headGroup.add(hairCap);

  const hairBackGeo = new THREE.BoxGeometry(0.15, 0.12, 0.08);
  const hairBack = new THREE.Mesh(hairBackGeo, hairMat);
  hairBack.position.set(0, 0.1, -0.09);
  headGroup.add(hairBack);

  // Articulated Arms
  const upperArmGeo = new THREE.CylinderGeometry(0.052, 0.044, 0.28, 8);
  const forearmGeo = new THREE.CylinderGeometry(0.042, 0.034, 0.26, 8);
  const handGeo = new THREE.SphereGeometry(0.036, 8, 8);

  const buildArm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.245, 0.44, 0);
    torso.add(shoulder);

    const upper = new THREE.Mesh(upperArmGeo, jacketMat);
    upper.position.y = -0.14;
    upper.castShadow = true;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.28, 0);
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(forearmGeo, jacketMat);
    forearm.position.y = -0.13;
    forearm.castShadow = true;
    elbow.add(forearm);

    const cuffGeo = new THREE.CylinderGeometry(0.037, 0.037, 0.04, 8);
    const cuff = new THREE.Mesh(cuffGeo, strapMat);
    cuff.position.y = -0.24;
    elbow.add(cuff);
    disposables.push(cuffGeo);

    // Subtle glowing cufflink band on right wrist (matching Death Stranding Porter silhouette)
    if (side < 0) {
      const linkGeo = new THREE.TorusGeometry(0.039, 0.006, 6, 14);
      linkGeo.rotateX(Math.PI / 2);
      const linkMat = new THREE.MeshStandardMaterial({
        color: 0xe6f8ff,
        emissive: 0x9be2ff,
        emissiveIntensity: 2.2,
        roughness: 0.2,
      });
      const cufflink = new THREE.Mesh(linkGeo, linkMat);
      cufflink.position.y = -0.245;
      elbow.add(cufflink);
      disposables.push(linkGeo, linkMat);
    }

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.y = -0.28;
    elbow.add(hand);

    return { shoulder, elbow };
  };

  const leftArm = buildArm(1);
  const rightArm = buildArm(-1);

  // Articulated Legs & Heavy All-Terrain Boots
  const thighGeo = new THREE.CylinderGeometry(0.075, 0.06, 0.42, 10);
  const shinGeo = new THREE.CylinderGeometry(0.058, 0.048, 0.4, 10);
  const legStripeGeo = new THREE.BoxGeometry(0.016, 0.36, 0.025);
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xa94228,
    roughness: 0.65,
    metalness: 0.05,
  });
  disposables.push(legStripeGeo, stripeMat);
  const bootUpperGeo = new THREE.BoxGeometry(0.11, 0.1, 0.22);
  const bootSoleGeo = new THREE.BoxGeometry(0.118, 0.035, 0.24);

  const buildLeg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.105, -0.02, 0);
    pelvis.add(hip);

    const thigh = new THREE.Mesh(thighGeo, pantsMat);
    thigh.position.y = -0.21;
    thigh.castShadow = true;
    hip.add(thigh);

    const thighStripe = new THREE.Mesh(legStripeGeo, stripeMat);
    thighStripe.position.set(side * 0.066, -0.21, 0);
    hip.add(thighStripe);

    const knee = new THREE.Group();
    knee.position.set(0, -0.42, 0);
    hip.add(knee);

    const shin = new THREE.Mesh(shinGeo, pantsMat);
    shin.position.y = -0.2;
    shin.castShadow = true;
    knee.add(shin);

    const shinStripe = new THREE.Mesh(legStripeGeo, stripeMat);
    shinStripe.position.set(side * 0.052, -0.19, 0);
    knee.add(shinStripe);

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.4, 0);
    knee.add(ankle);

    const boot = new THREE.Mesh(bootUpperGeo, bootMat);
    boot.position.set(0, -0.04, 0.04);
    boot.castShadow = true;
    ankle.add(boot);

    const sole = new THREE.Mesh(bootSoleGeo, strapMat);
    sole.position.set(0, -0.09, 0.04);
    ankle.add(sole);

    return { hip, knee, ankle };
  };

  const leftLeg = buildLeg(1);
  const rightLeg = buildLeg(-1);

  disposables.push(
    pelvisMeshGeo,
    chestGeo,
    collarGeo,
    hoodGeo,
    strapGeo,
    buckleGeo,
    podHousingGeo,
    podCapGeo,
    armLowerGeo,
    scannerCoreGeo,
    petalGeo,
    neckGeo,
    craniumGeo,
    hairCapGeo,
    hairBackGeo,
    upperArmGeo,
    forearmGeo,
    handGeo,
    thighGeo,
    shinGeo,
    bootUpperGeo,
    bootSoleGeo
  );

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
    // Don't leave prints in deep water
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

  // Physics, Weight, Stamina & Cooldown State
  const velocity = new THREE.Vector3();
  let verticalVel = 0;
  let isGrounded = true;
  let yaw = Math.PI; // Facing toward the ocean initially
  let stridePhase = 0;
  let lastStepHalf = 0;
  let scanTimer = 0;
  let landCompression = 0;
  let stamina = 100;
  let staminaExhausted = false;
  let staminaCooldownRemaining = 0;
  let carriedWeightKg = 0;

  const triggerScan = () => {
    scanTimer = 1.6;
  };

  const setCarriedWeight = (weightKg: number) => {
    carriedWeightKg = Math.max(0, weightKg);
    controller.carriedWeightKg = carriedWeightKg;
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
    stamina,
    staminaExhausted,
    staminaCooldownRemaining,
    carriedWeightKg,
    lastBoundaryImpact: { hit: false, x: 0, z: 0, nx: 0, nz: 0 },
    setCarriedWeight,
    triggerScan,
    update: (delta, elapsed, input, colliders, onFootstep) => {
      const dt = Math.min(delta, 0.05);

      // Compute camera-relative movement direction
      _camForward.set(-Math.sin(input.cameraYaw), 0, -Math.cos(input.cameraYaw));
      _camRight.set(Math.cos(input.cameraYaw), 0, -Math.sin(input.cameraYaw));

      _moveDir
        .set(0, 0, 0)
        .addScaledVector(_camForward, input.forward)
        .addScaledVector(_camRight, input.right);

      const hasInput = _moveDir.lengthSq() > 0.001;
      if (hasInput) _moveDir.normalize();

      // Carried weight factor (0..1.2) affects agility & stamina drain
      const loadRatio = THREE.MathUtils.clamp(carriedWeightKg / 72, 0, 1.2);
      const canSprint = !staminaExhausted && stamina > 1.5;
      const wantsSprint = input.sprint && hasInput && canSprint;

      const walkSpeed = staminaExhausted
        ? 2.35
        : 3.35 * (1 - loadRatio * 0.22);
      const sprintSpeed = 6.7 * (1 - loadRatio * 0.25);
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

      // Apply horizontal velocity and resolve obstacles & invisible perimeter wall
      root.position.x += velocity.x * dt;
      root.position.z += velocity.z * dt;
      const impact = resolveCharacterCollisions(root.position, colliders, 0.45);
      controller.lastBoundaryImpact = impact;
      if (impact.hit) {
        const dot = velocity.x * impact.nx + velocity.z * impact.nz;
        if (dot < 0) {
          velocity.x -= impact.nx * dot;
          velocity.z -= impact.nz * dot;
        }
      }

      // Ground height & vertical jump physics (jump costs stamina, blocked during exhaustion cooldown)
      const groundY = groundHeightAt(root.position.x, root.position.z);
      const jumpCost = 12 + carriedWeightKg * 0.14;
      if (input.jumpPressed && isGrounded && !staminaExhausted && stamina >= 8) {
        verticalVel = 5.4 - loadRatio * 0.45;
        isGrounded = false;
        stamina = Math.max(0, stamina - jumpCost);
      }

      // Update Stamina & Exhaustion Cooldown System
      if (actuallySprinting) {
        const drainRate = 13.5 + carriedWeightKg * 0.26;
        stamina = Math.max(0, stamina - drainRate * dt);
      } else if (isGrounded) {
        const baseRegen = hasInput ? 11.5 : 22.0;
        const regenRate = Math.max(4.5, baseRegen - loadRatio * 5.0);
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

      if (!isGrounded) {
        verticalVel -= 15.5 * dt;
        root.position.y += verticalVel * dt;
        if (root.position.y <= groundY) {
          root.position.y = groundY;
          verticalVel = 0;
          isGrounded = true;
          landCompression = 0.14;
          spawnFootprint(root.position.x, root.position.z, yaw, 1);
          spawnFootprint(root.position.x, root.position.z, yaw, -1);
          onFootstep?.(groundY < SEA_LEVEL + 0.08);
        }
      } else {
        root.position.y = THREE.MathUtils.damp(root.position.y, groundY, 20, dt);
      }

      controller.isGrounded = isGrounded;
      const wading = groundY < SEA_LEVEL + 0.08;
      controller.isWading = wading;

      // Smooth character yaw toward movement direction
      if (horizSpeed > 0.2) {
        const targetYaw = Math.atan2(velocity.x, velocity.z);
        const diff = shortestAngleDiff(yaw, targetYaw);
        yaw += diff * (1 - Math.exp(-11 * dt));
      }
      controller.yaw = yaw;
      root.rotation.y = yaw;

      // Procedural Gait & Articulated Joint Kinematics
      const moveWeight = THREE.MathUtils.clamp(horizSpeed / 3.2, 0, 1);
      const sprintBlend = THREE.MathUtils.clamp((horizSpeed - 3.2) / 3.4, 0, 1);

      if (horizSpeed > 0.15 && isGrounded) {
        const freq = THREE.MathUtils.lerp(5.8, 9.6, sprintBlend);
        stridePhase += dt * freq;

        const currentHalf = Math.floor(stridePhase / Math.PI);
        if (currentHalf !== lastStepHalf) {
          lastStepHalf = currentHalf;
          const side = currentHalf % 2 === 0 ? 1 : -1;
          spawnFootprint(root.position.x, root.position.z, yaw, side);
          onFootstep?.(wading);
        }
      }

      landCompression = THREE.MathUtils.damp(landCompression, 0, 12, dt);

      const swing = Math.sin(stridePhase);
      const swingCos = Math.cos(stridePhase);
      const legAmp = THREE.MathUtils.lerp(0.55, 0.88, sprintBlend) * moveWeight;
      const armAmp = THREE.MathUtils.lerp(0.45, 0.78, sprintBlend) * moveWeight;

      // Idle breathing (faster heave when exhausted)
      const breatheSpeed = staminaExhausted ? 4.4 : 2.1;
      const breatheAmp = staminaExhausted ? 0.032 : 0.015;
      const breathe = Math.sin(elapsed * breatheSpeed) * breatheAmp;
      const idleSway = Math.sin(elapsed * 0.9) * 0.02 * (1 - moveWeight);

      // Pelvis height bob & twist
      const strideBob = Math.abs(swingCos) * 0.045 * moveWeight;
      const jumpTuck = !isGrounded ? 0.06 : 0;
      pelvis.position.y = 0.92 - strideBob - landCompression + jumpTuck;
      pelvis.rotation.y = swing * 0.1 * moveWeight;
      pelvis.rotation.z = idleSway;

      // Torso forward lean & counter-twist (compensates for heavy cargo weight)
      const weightLean = loadRatio * 0.13 + (staminaExhausted ? 0.08 : 0);
      torso.rotation.x =
        THREE.MathUtils.lerp(0.05, 0.22, sprintBlend) * moveWeight +
        weightLean +
        breathe +
        landCompression * 0.8;
      torso.rotation.y = -swing * 0.12 * moveWeight;

      // Head stabilization & subtle look into breeze
      headGroup.rotation.x = -torso.rotation.x * 0.55 + breathe * 0.5;
      headGroup.rotation.y = Math.sin(elapsed * 0.55) * 0.06 * (1 - moveWeight);

      // Legs & Knees
      const leftHipAngle = swing * legAmp;
      const rightHipAngle = -swing * legAmp;
      const leftKneeBend = Math.max(0, -swingCos) * (0.65 + sprintBlend * 0.45) * moveWeight + (!isGrounded ? 0.4 : 0);
      const rightKneeBend = Math.max(0, swingCos) * (0.65 + sprintBlend * 0.45) * moveWeight + (!isGrounded ? 0.25 : 0);

      leftLeg.hip.rotation.x = leftHipAngle - landCompression * 1.4;
      rightLeg.hip.rotation.x = rightHipAngle - landCompression * 1.4;
      leftLeg.knee.rotation.x = leftKneeBend + landCompression * 2.4;
      rightLeg.knee.rotation.x = rightKneeBend + landCompression * 2.4;
      leftLeg.ankle.rotation.x = -leftHipAngle * 0.3 - leftKneeBend * 0.35;
      rightLeg.ankle.rotation.x = -rightHipAngle * 0.3 - rightKneeBend * 0.35;

      // Arms (opposite to legs)
      leftArm.shoulder.rotation.x = -swing * armAmp;
      rightArm.shoulder.rotation.x = swing * armAmp;
      leftArm.shoulder.rotation.z = 0.1 + breathe * 0.6;
      rightArm.shoulder.rotation.z = -0.1 - breathe * 0.6;
      leftArm.elbow.rotation.x = -0.25 - Math.max(0, swing) * 0.45 * moveWeight;
      rightArm.elbow.rotation.x = -0.25 - Math.max(0, -swing) * 0.45 * moveWeight;

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
        odradekBase.rotation.z = THREE.MathUtils.damp(odradekBase.rotation.z, 0.08 + Math.sin(elapsed * 1.6) * 0.04, 6, dt);
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
