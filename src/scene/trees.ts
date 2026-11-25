import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  BEACH_PLAYABLE_RADIUS,
  MUSIC_TRIGGER_POINT,
  ObstacleCollider,
  RUIN_SITES,
  UMBRELLA_STATIONS,
  desertRockCoverageAt,
  dirtRoadMaskAt,
  groundHeightAt,
  groundNormalAt,
  mossCoverageAt,
  riverInfoAt,
  shorelineZAt,
} from './terrain';

export interface TreePlacement {
  x: number;
  y: number;
  z: number;
  variantIndex: number;
  height: number;
  rotY: number;
  tiltX: number;
  tiltZ: number;
  tintSeed: number;
}

export interface LowPolyTreeSystem {
  group: THREE.Group;
  placements: TreePlacement[];
  dispose: () => void;
}

interface SubMeshPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  isTrunk: boolean;
}

const WOODEN_POST_POS = { x: 14, z: 36 };
const REFUGE_HUT_POS = { x: -20, z: 128 };
const MODEL_URL = '/models/low_poly_tree_set.glb';

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function generateTreePlacements(
  colliders: ObstacleCollider[],
  targetCount = 130
): TreePlacement[] {
  const rand = seededRandom(742913);
  const placements: TreePlacement[] = [];
  const normal = new THREE.Vector3();

  let attempts = 0;
  const maxAttempts = targetCount * 36;

  while (placements.length < targetCount && attempts < maxAttempts) {
    attempts++;

    // Sample across inland coastal hills, grassy hollows, and lower foothills
    const angle = rand() * Math.PI * 2;
    const radius = 18 + Math.sqrt(rand()) * (BEACH_PLAYABLE_RADIUS - 40);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const distFromShore = z - shorelineZAt(x);
    if (distFromShore < 14 || distFromShore > 245) continue;

    const y = groundHeightAt(x, z);
    if (y < 1.05 || y > 26.5) continue;

    // Never plant trees in tiny rivers, on dirt roads, or inside ruins/umbrella stations
    if (riverInfoAt(x, z).bankMask > 0.06) continue;
    if (dirtRoadMaskAt(x, z) > 0.06) continue;

    // Grow naturally in green mossy turf zones, tapering off before arid desert cliffs
    const moss = mossCoverageAt(x, z, y);
    const desert = desertRockCoverageAt(x, z, y);
    if (moss < 0.22 || desert > 0.65) continue;
    if (rand() > 0.48 + moss * 0.52) continue;

    // Avoid sheer cliff walls so trunks sit upright on walkable hills
    groundNormalAt(x, z, normal);
    if (normal.y < 0.78) continue;

    // Clear spawn, Outpost, Refuge Hut, Umbrella Stations, Ruins & Overlook viewpoint
    if (Math.hypot(x, z - 18) < 9.5) continue;
    if (Math.hypot(x - WOODEN_POST_POS.x, z - WOODEN_POST_POS.z) < 10.5) continue;
    if (Math.hypot(x - REFUGE_HUT_POS.x, z - REFUGE_HUT_POS.z) < 8.8) continue;
    if (Math.hypot(x - MUSIC_TRIGGER_POINT.x, z - MUSIC_TRIGGER_POINT.z) < 8.5) continue;
    let nearLandmark = false;
    for (let u = 0; u < UMBRELLA_STATIONS.length; u++) {
      if (Math.hypot(x - UMBRELLA_STATIONS[u].x, z - UMBRELLA_STATIONS[u].z) < 7.5) {
        nearLandmark = true;
        break;
      }
    }
    for (let r = 0; !nearLandmark && r < RUIN_SITES.length; r++) {
      if (Math.hypot(x - RUIN_SITES[r].x, z - RUIN_SITES[r].z) < 8.2) {
        nearLandmark = true;
        break;
      }
    }
    if (nearLandmark) continue;

    // Clear existing rock/log/leviathan colliders
    let blocked = false;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const dx = x - c.x;
      const dz = z - c.z;
      const minD = c.radius + 2.15;
      if (dx * dx + dz * dz < minD * minD) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    // Keep natural spacing between neighboring trees
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz < 6.6 * 6.6) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const variantIndex = Math.floor(rand() * 15);
    const height = 4.1 + rand() * 3.4;
    const rotY = rand() * Math.PI * 2;
    const tiltX = (rand() - 0.5) * 0.065;
    const tiltZ = (rand() - 0.5) * 0.065;
    const tintSeed = rand();

    placements.push({
      x,
      y,
      z,
      variantIndex,
      height,
      rotY,
      tiltX,
      tiltZ,
      tintSeed,
    });

    // Register trunk collider synchronously so character, crystals, and cargo respect trees immediately
    colliders.push({
      x,
      z,
      radius: THREE.MathUtils.clamp(height * 0.082, 0.42, 0.68),
    });
  }

  return placements;
}

function extractTreeVariants(root: THREE.Object3D): SubMeshPart[][] {
  root.updateMatrixWorld(true);

  // Locate the 15 Lowpoly_Tree_XX node groups inside RootNode
  const treeNodes: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (/^Lowpoly_Tree_\d+$/i.test(obj.name)) {
      treeNodes.push(obj);
    }
  });

  // Fallback if node naming differs
  if (treeNodes.length === 0) {
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        treeNodes.push(obj);
      }
    });
  }

  const materialCache = new Map<THREE.Material, THREE.Material>();
  const getNormalizedMaterial = (src: THREE.Material): THREE.Material => {
    const cached = materialCache.get(src);
    if (cached) return cached;

    const cloned = src.clone();
    if (cloned instanceof THREE.MeshStandardMaterial) {
      cloned.envMapIntensity = 0.45;
      cloned.roughness = Math.max(cloned.roughness, 0.8);
      cloned.metalness = Math.min(cloned.metalness, 0.04);
    }
    materialCache.set(src, cloned);
    return cloned;
  };

  const variants: SubMeshPart[][] = [];
  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();

  for (const node of treeNodes) {
    const rawParts: {
      geometry: THREE.BufferGeometry;
      material: THREE.Material;
      isTrunk: boolean;
    }[] = [];

    box.makeEmpty();

    node.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;

      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      geo.computeBoundingBox();
      if (geo.boundingBox) {
        meshBox.copy(geo.boundingBox);
        box.union(meshBox);
      }

      const srcMat = Array.isArray(mesh.material)
        ? mesh.material[0]
        : mesh.material;
      const mat = getNormalizedMaterial(srcMat);
      const isTrunk =
        srcMat.name === 'Material' || /trunk|bark/i.test(mesh.name);

      rawParts.push({ geometry: geo, material: mat, isTrunk });
    });

    if (rawParts.length === 0 || box.isEmpty()) continue;

    // Recenter each tree variant to bottom-center (0, 0, 0) and unit height (1.0m)
    const centerX = (box.min.x + box.max.x) * 0.5;
    const centerZ = (box.min.z + box.max.z) * 0.5;
    const baseY = box.min.y;
    const totalHeight = Math.max(0.1, box.max.y - box.min.y);
    const invH = 1.0 / totalHeight;

    for (const part of rawParts) {
      part.geometry.translate(-centerX, -baseY, -centerZ);
      part.geometry.scale(invH, invH, invH);
      part.geometry.computeBoundingSphere();
    }

    variants.push(rawParts);
  }

  return variants;
}

export function createLowPolyTrees(
  colliders: ObstacleCollider[],
  isSoftwareGl: boolean
): LowPolyTreeSystem {
  const group = new THREE.Group();
  group.name = 'LowPolyTrees';
  const disposables: { dispose: () => void }[] = [];
  let disposed = false;

  const placements = generateTreePlacements(colliders, 200);

  const loader = new GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf) => {
      if (disposed) {
        gltf.scene.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.isMesh) {
            m.geometry?.dispose();
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mat) => mat?.dispose());
          }
        });
        return;
      }

      const variants = extractTreeVariants(gltf.scene);
      if (variants.length === 0) return;

      // Group placements by variant index for InstancedMesh rendering
      const buckets: TreePlacement[][] = variants.map(() => []);
      for (let i = 0; i < placements.length; i++) {
        const p = placements[i];
        buckets[p.variantIndex % variants.length].push(p);
      }

      const dummy = new THREE.Object3D();
      const tint = new THREE.Color();

      for (let v = 0; v < variants.length; v++) {
        const parts = variants[v];
        for (const part of parts) {
          disposables.push(part.geometry, part.material);
        }

        const bucket = buckets[v];
        if (bucket.length === 0) continue;

        for (const part of parts) {
          const instMesh = new THREE.InstancedMesh(
            part.geometry,
            part.material,
            bucket.length
          );
          instMesh.castShadow = !isSoftwareGl;
          instMesh.receiveShadow = true;

          for (let i = 0; i < bucket.length; i++) {
            const p = bucket[i];
            // Embed trunk base slightly into hillside slopes so roots never float
            dummy.position.set(p.x, p.y - 0.22, p.z);
            dummy.rotation.set(p.tiltX, p.rotY, p.tiltZ);
            const xzScale = p.height * (0.94 + (p.tintSeed * 7 % 1) * 0.14);
            dummy.scale.set(xzScale, p.height, xzScale);
            dummy.updateMatrix();
            instMesh.setMatrixAt(i, dummy.matrix);

            if (part.isTrunk) {
              const b = 0.88 + p.tintSeed * 0.18;
              tint.setRGB(b, b * 0.98, b * 0.94);
            } else {
              const gBoost = 0.92 + p.tintSeed * 0.16;
              tint.setRGB(
                0.90 + ((p.tintSeed * 13) % 1) * 0.16,
                gBoost,
                0.88 + ((p.tintSeed * 5) % 1) * 0.12
              );
            }
            instMesh.setColorAt(i, tint);
          }

          instMesh.instanceMatrix.needsUpdate = true;
          if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
          instMesh.computeBoundingSphere();
          group.add(instMesh);
        }
      }

      // Dispose original un-normalized GLTF resources
      gltf.scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => mat?.dispose());
        }
      });
    },
    undefined,
    (err) => {
      console.warn('Unable to load low_poly_tree_set.glb:', err);
    }
  );

  const dispose = () => {
    disposed = true;
    const seen = new Set<{ dispose: () => void }>();
    for (const d of disposables) {
      if (!seen.has(d)) {
        seen.add(d);
        d.dispose();
      }
    }
  };

  return {
    group,
    placements,
    dispose,
  };
}
