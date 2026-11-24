import * as THREE from 'three';
import {
  ATMOSPHERE_PRESETS,
  AtmospherePresetId,
  ProceduralTextureSet,
} from './materials';
import {
  MUSIC_TRIGGER_POINT,
  ObstacleCollider,
  SEA_LEVEL,
  groundHeightAt,
  groundNormalAt,
  shorelineZAt,
} from './terrain';
import { TimeOfDaySnapshot } from './timeOfDay';
import { WeatherSnapshot } from './weather';

export const WOODEN_POST_POS = { x: 14, z: 36 };
export const REFUGE_HUT_POS = { x: -20, z: 128 };

export interface BuildingShelterInfo {
  inside: boolean;
  buildingName: string | null;
}

export interface BeachEnvironment {
  group: THREE.Group;
  colliders: ObstacleCollider[];
  bushSpots: { x: number; z: number }[];
  skyUniforms: {
    uTopColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
    uTime: { value: number };
    uRainbowStrength: { value: number };
    uCloudCoverage: { value: number };
    uStormDarkness: { value: number };
    uClearShafts: { value: number };
    uDaylight: { value: number };
    uTwilight: { value: number };
    uSunDir: { value: THREE.Vector3 };
  };
  weatherUniforms: {
    uRainWetness: { value: number };
    uSnowAccumulation: { value: number };
  };
  scanUniforms: {
    uScanOrigin: { value: THREE.Vector3 };
    uScanRadius: { value: number };
    uScanStrength: { value: number };
  };
  waterMaterial: THREE.MeshPhysicalMaterial;
  isInsideBuilding: (x: number, z: number) => BuildingShelterInfo;
  triggerBoundaryImpact: (x: number, z: number, nx: number, nz: number) => void;
  applyPreset: (presetId: AtmospherePresetId) => void;
  applyWeather: (weather: WeatherSnapshot) => void;
  applyTimeOfDay: (time: TimeOfDaySnapshot) => void;
  update: (elapsed: number, delta: number, playerPos: THREE.Vector3) => void;
  dispose: () => void;
}

function createStrandedWhale(
  rockMat: THREE.Material,
  skinMat: THREE.Material,
  scale: number
): THREE.Group {
  const whale = new THREE.Group();

  // Primary body silhouette using tapered LatheGeometry
  const pts: THREE.Vector2[] = [];
  const segs = 18;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; // 0 = nose, 1 = tail base
    const y = (t - 0.5) * 14.0;
    const radius =
      t < 0.28
        ? Math.sin((t / 0.28) * (Math.PI * 0.5)) * 1.65
        : Math.pow(1 - (t - 0.28) / 0.72, 1.35) * 1.65 + 0.14;
    pts.push(new THREE.Vector2(Math.max(0.05, radius), y));
  }
  const bodyGeo = new THREE.LatheGeometry(pts, 18);
  bodyGeo.rotateX(Math.PI / 2);
  bodyGeo.scale(1.0, 0.78, 1.0);
  const body = new THREE.Mesh(bodyGeo, skinMat);
  body.position.y = 0.65;
  body.castShadow = true;
  body.receiveShadow = true;
  whale.add(body);

  // Ventral throat pleats / ridge keel
  const keelGeo = new THREE.CapsuleGeometry(0.65, 6.5, 6, 12);
  keelGeo.rotateX(Math.PI / 2);
  const keel = new THREE.Mesh(keelGeo, rockMat);
  keel.position.set(0, 0.28, 1.6);
  keel.scale.set(1.2, 0.55, 1.0);
  whale.add(keel);

  // Dorsal ridge & fin
  const dorsalGeo = new THREE.ConeGeometry(0.45, 1.4, 5);
  dorsalGeo.scale(0.35, 1.0, 1.3);
  const dorsal = new THREE.Mesh(dorsalGeo, skinMat);
  dorsal.position.set(0, 1.75, -1.5);
  dorsal.rotation.x = -0.35;
  dorsal.castShadow = true;
  whale.add(dorsal);

  // Left & Right Pectoral Fins
  const finGeo = new THREE.ConeGeometry(0.55, 3.2, 6);
  finGeo.scale(0.22, 1.0, 0.75);
  const leftFin = new THREE.Mesh(finGeo, skinMat);
  leftFin.position.set(1.75, 0.35, 1.4);
  leftFin.rotation.set(0.2, -0.3, -1.25);
  leftFin.castShadow = true;
  whale.add(leftFin);

  const rightFin = new THREE.Mesh(finGeo, skinMat);
  rightFin.position.set(-1.75, 0.25, 1.4);
  rightFin.rotation.set(0.2, 0.3, 1.35);
  rightFin.castShadow = true;
  whale.add(rightFin);

  // Tail Flukes (2-part splayed blades)
  const flukeGeo = new THREE.ConeGeometry(0.95, 2.4, 5);
  flukeGeo.scale(0.18, 1.0, 0.9);
  const flukeL = new THREE.Mesh(flukeGeo, skinMat);
  flukeL.position.set(0.85, 0.55, -7.2);
  flukeL.rotation.set(0.1, 0.25, -1.35);
  whale.add(flukeL);

  const flukeR = new THREE.Mesh(flukeGeo, skinMat);
  flukeR.position.set(-0.85, 0.55, -7.2);
  flukeR.rotation.set(0.1, -0.25, 1.35);
  whale.add(flukeR);

  // Barnacle / tar crust accent ridges
  const crustGeo = new THREE.DodecahedronGeometry(0.55, 0);
  for (let i = 0; i < 4; i++) {
    const crust = new THREE.Mesh(crustGeo, rockMat);
    crust.position.set(
      (i % 2 === 0 ? 1 : -1) * (0.65 + i * 0.12),
      0.85 + (i % 2) * 0.3,
      2.5 - i * 1.8
    );
    crust.scale.set(0.9, 0.45, 1.2);
    whale.add(crust);
  }

  whale.scale.setScalar(scale);
  return whale;
}

function createBasaltStack(
  mat: THREE.Material,
  seed: number,
  heightScale: number
): THREE.Group {
  const stack = new THREE.Group();
  const cols = 5 + (seed % 3);
  for (let i = 0; i < cols; i++) {
    const angle = (i / cols) * Math.PI * 2 + seed * 0.7;
    const dist = i === 0 ? 0 : 0.9 + ((seed * (i + 3)) % 10) * 0.16;
    const h = (i === 0 ? 1.0 : 0.45 + ((seed * (i + 7)) % 10) * 0.06) * heightScale;
    const r = (i === 0 ? 1.55 : 0.75 + ((seed * (i + 2)) % 6) * 0.14) * (0.85 + heightScale * 0.04);

    // 6-sided hexagonal volcanic basalt column
    const geo = new THREE.CylinderGeometry(r * 0.82, r * 1.12, h, 6, 1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.cos(angle) * dist, h * 0.48, Math.sin(angle) * dist);
    mesh.rotation.set(
      (((seed + i) % 5) - 2) * 0.04,
      (seed + i) * 0.5,
      (((seed * 2 + i) % 5) - 2) * 0.04
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    stack.add(mesh);
  }
  return stack;
}

export function createBeachEnvironment(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): BeachEnvironment {
  const group = new THREE.Group();
  const colliders: ObstacleCollider[] = [];
  const disposables: { dispose: () => void }[] = [];

  const initialPreset = ATMOSPHERE_PRESETS.ash;

  // Shared scan wave uniforms
  const scanUniforms = {
    uScanOrigin: { value: new THREE.Vector3(0, 0, 0) },
    uScanRadius: { value: -10 },
    uScanStrength: { value: 0 },
  };

  // Shared weather surface uniforms
  const weatherUniforms = {
    uRainWetness: { value: 0 },
    uSnowAccumulation: { value: 0 },
  };

  // 1. Overcast Atmospheric Sky Dome with Procedural Volumetric Clouds, Day/Night & Stars
  const skyUniforms = {
    uTopColor: { value: new THREE.Color(initialPreset.skyTop) },
    uHorizonColor: { value: new THREE.Color(initialPreset.skyHorizon) },
    uTime: { value: 0 },
    uRainbowStrength: { value: initialPreset.rainbowStrength },
    uCloudCoverage: { value: 0.42 },
    uStormDarkness: { value: 0.0 },
    uClearShafts: { value: 1.0 },
    uDaylight: { value: 1.0 },
    uTwilight: { value: 0.0 },
    uSunDir: { value: new THREE.Vector3(-0.35, 0.36, -0.86).normalize() },
  };

  const skyGeo = new THREE.SphereGeometry(780, 32, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: skyUniforms,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform float uTime;
      uniform float uRainbowStrength;
      uniform float uCloudCoverage;
      uniform float uStormDarkness;
      uniform float uClearShafts;
      uniform float uDaylight;
      uniform float uTwilight;
      uniform vec3 uSunDir;
      varying vec3 vWorldDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float fbm(vec2 p) {
        float val = 0.0;
        float amp = 0.5;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 5; i++) {
          val += amp * noise(p);
          p = rot * p * 2.03;
          amp *= 0.5;
        }
        return val;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);
        float horizonBlend = pow(1.0 - h, 1.65);
        vec3 baseSky = mix(uTopColor, uHorizonColor, horizonBlend);

        // Two-layer parallax volumetric cloud deck with directional sun/moon self-shadowing
        vec2 cloudUv = dir.xz / (h + 0.14) * 1.15;
        float drift = uTime * (0.009 + uStormDarkness * 0.014);
        vec3 sunDir = normalize(uSunDir);

        float n1 = fbm(cloudUv * 1.1 + vec2(drift, drift * 0.45));
        float n2 = fbm(cloudUv * 2.65 - vec2(drift * 0.65, 0.0) + n1 * 0.65);
        float sunSample = fbm((cloudUv - sunDir.xz * 0.12) * 1.1 + vec2(drift, drift * 0.45));

        float rawDensity = n1 * 0.62 + n2 * 0.48;
        float coverageLow = mix(0.44, 0.16, uCloudCoverage);
        float coverageHigh = mix(0.88, 0.62, uCloudCoverage);
        float cloudAlpha = smoothstep(coverageLow, coverageHigh, rawDensity);

        float selfShadow = clamp((sunSample - n1) * 2.4 + 0.52, 0.15, 1.0);
        vec3 cloudBelly = uTopColor * mix(0.76, 0.46, uStormDarkness);
        vec3 cloudCrest = min(vec3(0.97), uHorizonColor * mix(1.14, 0.88, uStormDarkness));
        cloudCrest = mix(cloudCrest, vec3(0.94, 0.64, 0.46), uTwilight * 0.38);
        vec3 cloudCol = mix(cloudBelly, cloudCrest, selfShadow);

        // Diffused sun glow & clear-weather volumetric crepuscular rays
        float sunAlign = max(0.0, dot(dir, sunDir));
        float sunGlow = pow(sunAlign, 4.0);
        float rayPattern = 0.5 + 0.5 * sin(atan(dir.x - sunDir.x, dir.y - sunDir.y + 0.25) * 7.0 + uTime * 0.06);
        float sunShafts = pow(sunAlign, 3.2) * rayPattern * (1.0 - cloudAlpha * 0.72) * uClearShafts * uDaylight * 0.08;
        vec3 glowTint = mix(vec3(0.14, 0.15, 0.16), vec3(0.32, 0.18, 0.10), uTwilight);
        cloudCol += glowTint * sunGlow * (1.0 - uStormDarkness * 0.55) * (0.25 + 0.75 * uDaylight);

        float cloudMask = smoothstep(0.01, 0.22, h);
        vec3 skyWithClouds = mix(baseSky, cloudCol, cloudAlpha * cloudMask);
        vec3 col = mix(uHorizonColor, skyWithClouds, smoothstep(0.0, 0.18, h));
        col += vec3(0.88, 0.91, 0.94) * sunShafts * cloudMask;

        // Subtle pinpoint stars & pale moon halo during night breaks
        float nightMask = 1.0 - smoothstep(0.08, 0.55, uDaylight);
        if (nightMask > 0.01) {
          vec2 starUv = dir.xz / (h + 0.34) * 58.0;
          float starRand = hash(floor(starUv));
          float starPoint = step(0.9935, starRand) * smoothstep(0.42, 0.05, length(fract(starUv) - 0.5));
          float twinkle = 0.68 + 0.32 * sin(uTime * 2.1 + starRand * 42.0);
          float starVis = nightMask * (1.0 - cloudAlpha * 0.92) * smoothstep(0.08, 0.34, h) * (1.0 - uStormDarkness * 0.85);
          col += vec3(0.82, 0.88, 0.98) * starPoint * twinkle * starVis * 0.85;

          float moonDisc = smoothstep(0.9984, 0.9994, sunAlign) * (1.0 - cloudAlpha * 0.78);
          float moonHalo = pow(sunAlign, 18.0) * (1.0 - cloudAlpha * 0.55);
          col += (vec3(0.84, 0.90, 0.98) * moonDisc * 0.68 + vec3(0.36, 0.46, 0.62) * moonHalo * 0.26) * nightMask * cloudMask;
        }

        // Subtle inverted rainbow in upper cloud mist (daytime clear/rain breaks)
        vec3 arcCenter = normalize(vec3(0.18, 0.62, -0.95));
        float ang = acos(clamp(dot(dir, arcCenter), -1.0, 1.0));
        float band = smoothstep(0.46, 0.50, ang) * (1.0 - smoothstep(0.50, 0.55, ang));
        float arcMask = smoothstep(0.06, 0.30, h) * (1.0 - smoothstep(0.48, 0.65, h)) * step(dir.z, -0.1);
        float t = clamp((ang - 0.46) / 0.09, 0.0, 1.0);
        vec3 rainbow = mix(
          vec3(0.48, 0.64, 0.78),
          mix(vec3(0.70, 0.74, 0.56), vec3(0.78, 0.56, 0.46), smoothstep(0.4, 1.0, t)),
          smoothstep(0.0, 0.6, t)
        );
        col += rainbow * band * arcMask * uRainbowStrength * uDaylight * 0.26;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyMesh);
  disposables.push(skyGeo, skyMat);

  // 2. Expanded Volcanic Sand, Coastal Turf & Desert-Rock Mountain Terrain (920m x 920m)
  const segCount = isSoftwareGl ? 200 : 300;
  const terrainGeo = new THREE.PlaneGeometry(920, 920, segCount, segCount);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, groundHeightAt(x, z));
  }
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.sandAlbedo,
    normalMap: textures.sandNormal,
    normalScale: new THREE.Vector2(0.88, 0.88),
    roughness: 0.86,
    metalness: 0.08,
  });

  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uScanOrigin = scanUniforms.uScanOrigin;
    shader.uniforms.uScanRadius = scanUniforms.uScanRadius;
    shader.uniforms.uScanStrength = scanUniforms.uScanStrength;
    shader.uniforms.uTime = skyUniforms.uTime;
    shader.uniforms.uMossMap = { value: textures.mossAlbedo };
    shader.uniforms.uMossNormalMap = { value: textures.mossNormal };
    shader.uniforms.uCobbleMap = { value: textures.cobbleAlbedo };
    shader.uniforms.uRockMap = { value: textures.rockAlbedo };
    shader.uniforms.uDesertRockMap = { value: textures.desertRockAlbedo };
    shader.uniforms.uRainWetness = weatherUniforms.uRainWetness;
    shader.uniforms.uSnowAccumulation = weatherUniforms.uSnowAccumulation;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;
        uniform vec3 uScanOrigin;
        uniform float uScanRadius;
        uniform float uScanStrength;
        uniform float uTime;
        uniform sampler2D uMossMap;
        uniform sampler2D uMossNormalMap;
        uniform sampler2D uCobbleMap;
        uniform sampler2D uRockMap;
        uniform sampler2D uDesertRockMap;
        uniform float uRainWetness;
        uniform float uSnowAccumulation;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Wet volcanic sand near sea level becomes mirror-smooth, cobble hollows stay damp, and rain wets ground
        float tideSwash = sin(uTime * 0.95 + vTerrainWorldPos.x * 0.06) * 0.16;
        float wetMask = 1.0 - smoothstep(0.05, 0.82 + tideSwash, vTerrainWorldPos.y);
        float puddleNoise = sin(vTerrainWorldPos.x * 0.18 + vTerrainWorldPos.z * 0.14) * 0.5 + 0.5;
        float rainGloss = uRainWetness * (0.45 + 0.55 * smoothstep(0.45, 0.85, puddleNoise));
        float estShoreR = sin(vTerrainWorldPos.x * 0.018) * 9.5 +
                          cos(vTerrainWorldPos.x * 0.045 + 1.1) * 4.2 +
                          sin(vTerrainWorldPos.x * 0.008 - 0.5) * 13.0;
        float rInland = vTerrainWorldPos.z - estShoreR;
        float hollowDamp = smoothstep(7.0, 22.0, rInland) * (1.0 - smoothstep(1.2, 3.0, vTerrainWorldPos.y));
        float aridMask = smoothstep(108.0, 192.0, rInland);
        roughnessFactor = mix(roughnessFactor, 0.93, aridMask * 0.85);
        roughnessFactor = mix(roughnessFactor, 0.42, hollowDamp * 0.55);
        roughnessFactor = mix(roughnessFactor, 0.13, max(wetMask, rainGloss * 0.85));
        roughnessFactor = mix(roughnessFactor, 0.68, uSnowAccumulation * 0.55);`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wetTint = 1.0 - smoothstep(0.05, 0.85, vTerrainWorldPos.y);
        diffuseColor.rgb *= mix(0.88, 0.42, wetTint);

        float estShoreZ = sin(vTerrainWorldPos.x * 0.018) * 9.5 +
                          cos(vTerrainWorldPos.x * 0.045 + 1.1) * 4.2 +
                          sin(vTerrainWorldPos.x * 0.008 - 0.5) * 13.0;
        float inlandDist = vTerrainWorldPos.z - estShoreZ;
        float inlandMask = smoothstep(6.0, 24.0, inlandDist);
        float desertDistMask = smoothstep(108.0, 192.0, inlandDist);
        float desertElevMask = smoothstep(9.5, 17.5, vTerrainWorldPos.y);
        float desertMask = clamp(max(desertDistMask, desertElevMask * 0.85), 0.0, 1.0);

        // Slope & cliff separation (Reference Image 1: steep fractured basalt cliffs vs plush mossy turf tops)
        float slopeMask = smoothstep(0.66, 0.87, vTerrainWorldNormal.y);
        float mossLipMask = smoothstep(0.60, 0.78, vTerrainWorldNormal.y);

        // Wet river cobbles & crevice greens in coastal transitions and damp hollows (Reference Image 3)
        float shoreBand = smoothstep(5.0, 14.0, inlandDist) * (1.0 - smoothstep(18.0, 36.0, inlandDist));
        float lowHollow = smoothstep(8.0, 24.0, inlandDist) * (1.0 - smoothstep(1.3, 3.3, vTerrainWorldPos.y));
        float cobblePatch = smoothstep(0.44, 0.76, sin(vTerrainWorldPos.x * 0.072 + vTerrainWorldPos.z * 0.064) * 0.5 + 0.5);
        float cobbleMask = clamp((shoreBand * 0.72 + lowHollow * 0.82) * (0.40 + 0.60 * cobblePatch) * (1.0 - desertDistMask * 0.9) * slopeMask, 0.0, 0.82);
        vec3 cobbleCol = texture2D(uCobbleMap, vTerrainWorldPos.xz * 0.48).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, cobbleCol, cobbleMask);

        // Expanded lush highland moss & grassy meadow turf (Reference Images 1 & 2)
        float patchNoise = sin(vTerrainWorldPos.x * 0.042 + vTerrainWorldPos.z * 0.036) * 0.28 +
                           cos(vTerrainWorldPos.x * 0.095 - vTerrainWorldPos.z * 0.082) * 0.22 +
                           sin(vTerrainWorldPos.x * 0.22 + vTerrainWorldPos.z * 0.19) * 0.12 + 0.68;
        float greenMask = clamp(inlandMask * (1.0 - desertDistMask * 0.84) * mossLipMask * patchNoise * (1.0 - cobbleMask * 0.68), 0.0, 0.96);

        vec3 mossColA = texture2D(uMossMap, vTerrainWorldPos.xz * 0.095).rgb;
        vec3 mossColB = texture2D(uMossMap, vTerrainWorldPos.xz * 0.034 + vec2(0.37, 0.61)).rgb;
        vec3 mossNormSample = texture2D(uMossNormalMap, vTerrainWorldPos.xz * 0.11).rgb * 2.0 - 1.0;
        float microShade = clamp(0.84 + mossNormSample.x * 0.18 + mossNormSample.y * 0.18, 0.65, 1.18);
        float meadowTone = sin(vTerrainWorldPos.x * 0.028 - vTerrainWorldPos.z * 0.031) * 0.5 + 0.5;
        vec3 richGreen = mix(mossColA, mossColB * vec3(0.92, 1.06, 0.82), meadowTone) * microShade;
        diffuseColor.rgb = mix(diffuseColor.rgb, richGreen, greenMask);

        // Steep dark fractured basalt cliffs on steep walls & ridges (Reference Image 1)
        float cliffMask = clamp(inlandMask * (1.0 - desertMask) * (1.0 - slopeMask) * 1.35, 0.0, 0.94);
        vec3 cliffTex = texture2D(
          uRockMap,
          vec2((vTerrainWorldPos.x + vTerrainWorldPos.z) * 0.11, vTerrainWorldPos.y * 0.23)
        ).rgb;
        // Subtle moss streaks clinging into vertical basalt cliff crevices
        float cliffMossStreak = smoothstep(0.62, 0.88, sin(vTerrainWorldPos.x * 0.24 + vTerrainWorldPos.z * 0.19) * 0.5 + 0.5) * 0.35;
        vec3 cliffCol = mix(cliffTex * 0.95, richGreen * 0.78, cliffMossStreak);
        diffuseColor.rgb = mix(diffuseColor.rgb, cliffCol, cliffMask);

        // Transition toward warm arid desert sandstone & stratified canyon cliff rock near far mountains
        vec3 desertFlat = texture2D(uDesertRockMap, vTerrainWorldPos.xz * 0.085).rgb;
        vec3 desertCliff = texture2D(
          uDesertRockMap,
          vec2((vTerrainWorldPos.x + vTerrainWorldPos.z) * 0.075, vTerrainWorldPos.y * 0.22)
        ).rgb;
        float strataBand = 0.88 + 0.14 * sin(vTerrainWorldPos.y * 4.5 + sin(vTerrainWorldPos.x * 0.08) * 1.8);
        vec3 desertCol = mix(desertCliff * strataBand * 0.92, desertFlat * 1.04, slopeMask);
        float dustNoise = sin(vTerrainWorldPos.x * 0.06 - vTerrainWorldPos.z * 0.05) * 0.5 + 0.5;
        desertCol = mix(desertCol, vec3(0.58, 0.46, 0.35), slopeMask * dustNoise * 0.32);
        diffuseColor.rgb = mix(diffuseColor.rgb, desertCol, desertMask);

        // Dynamic rain darkening on wet ground
        diffuseColor.rgb *= mix(1.0, 0.68, uRainWetness * (1.0 - wetTint * 0.6));

        // Dynamic snow dusting on upward slopes & inland ridges (keeps wet tidal swash dark)
        float snowDrift = sin(vTerrainWorldPos.x * 0.09 + vTerrainWorldPos.z * 0.07) * 0.18 +
                          cos(vTerrainWorldPos.x * 0.22 - vTerrainWorldPos.z * 0.19) * 0.12;
        float snowHeightMask = smoothstep(0.45, 2.2, vTerrainWorldPos.y);
        float snowSlopeMask = smoothstep(0.55, 0.88, vTerrainWorldNormal.y + snowDrift);
        float snowMask = clamp(uSnowAccumulation * snowHeightMask * snowSlopeMask * 1.15, 0.0, 0.88);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.88, 0.92), snowMask);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uScanStrength > 0.001) {
          float dist = length(vTerrainWorldPos.xz - uScanOrigin.xz);
          float ring = smoothstep(uScanRadius - 1.6, uScanRadius - 0.15, dist) *
                       (1.0 - smoothstep(uScanRadius - 0.15, uScanRadius + 1.1, dist));
          float contour = smoothstep(0.92, 0.98, abs(sin(vTerrainWorldPos.y * 6.5))) *
                          smoothstep(uScanRadius + 1.0, uScanRadius - 12.0, dist) *
                          step(dist, uScanRadius);
          vec3 scanCol = mix(vec3(0.24, 0.72, 0.95), vec3(0.96, 0.68, 0.22), ring);
          totalEmissiveRadiance += scanCol * (ring * 1.45 + contour * 0.25) * uScanStrength;
        }`
      );
  };

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);
  disposables.push(terrainGeo, terrainMat);

  // 3. Rolling Dark Ocean with Shoreline Surf Foam
  const waterGeo = new THREE.PlaneGeometry(1100, 520, isSoftwareGl ? 100 : 180, isSoftwareGl ? 70 : 110);
  waterGeo.rotateX(-Math.PI / 2);

  const waterMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(initialPreset.waterDeep),
    roughness: 0.085,
    metalness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.55,
    transparent: true,
    opacity: 0.94,
  });

  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = skyUniforms.uTime;
    shader.uniforms.uWaterShallow = { value: new THREE.Color(initialPreset.waterShallow) };
    waterMat.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        varying vec3 vWaterWorldPos;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wPos0 = modelMatrix * vec4(transformed, 1.0);
        float swell1 = sin(wPos0.z * 0.16 + uTime * 1.25 + sin(wPos0.x * 0.05) * 1.5) * 0.17;
        float swell2 = cos(wPos0.x * 0.11 - wPos0.z * 0.13 + uTime * 0.85) * 0.09;
        float chop = sin(wPos0.x * 0.45 + wPos0.z * 0.55 - uTime * 2.1) * 0.03;
        transformed.y += swell1 + swell2 + chop;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vWaterWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uWaterShallow;
        varying vec3 vWaterWorldPos;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Estimate shoreline proximity using analytical curve
        float estShoreZ = sin(vWaterWorldPos.x * 0.018) * 9.5 +
                          cos(vWaterWorldPos.x * 0.045 + 1.1) * 4.2 +
                          sin(vWaterWorldPos.x * 0.008 - 0.5) * 13.0;
        float distToShore = estShoreZ - vWaterWorldPos.z;
        float shallowFactor = 1.0 - smoothstep(0.0, 22.0, distToShore);
        diffuseColor.rgb = mix(diffuseColor.rgb, uWaterShallow, shallowFactor * 0.72);

        // Rolling surf foam lines near shoreline
        float waveBand = sin(distToShore * 1.15 - uTime * 1.65 + sin(vWaterWorldPos.x * 0.09) * 2.0);
        float foamBreak = smoothstep(0.58, 0.95, waveBand) * smoothstep(24.0, 1.0, distToShore) * smoothstep(-2.0, 0.8, distToShore);
        float edgeFoam = smoothstep(2.8, -0.3, distToShore) * (0.5 + 0.5 * sin(vWaterWorldPos.x * 0.35 + uTime * 1.4));
        float totalFoam = clamp(foamBreak * 0.72 + edgeFoam * 0.68, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.92), totalFoam);
        diffuseColor.a = mix(0.94, 0.70, smoothstep(4.5, 0.0, distToShore));`
      );
  };

  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(0, SEA_LEVEL + 0.04, -225);
  waterMesh.receiveShadow = true;
  group.add(waterMesh);
  disposables.push(waterGeo, waterMat);

  // 4. Basalt Rock Material, Moss-Capped Boulder Material & Stranded Whale Material
  const rockMat = new THREE.MeshStandardMaterial({
    map: textures.rockAlbedo,
    normalMap: textures.rockNormal,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: 0.78,
    metalness: 0.08,
    color: 0x454b52,
  });
  rockMat.onBeforeCompile = (shader) => {
    shader.uniforms.uRainWetness = weatherUniforms.uRainWetness;
    shader.uniforms.uSnowAccumulation = weatherUniforms.uSnowAccumulation;
    shader.uniforms.uMossMap = { value: textures.mossAlbedo };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vRockWorldNorm;\nvarying vec3 vRockWorldPos;'
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvRockWorldNorm = normalize(mat3(modelMatrix) * objectNormal);\nvRockWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vRockWorldNorm;\nvarying vec3 vRockWorldPos;\nuniform sampler2D uMossMap;\nuniform float uRainWetness;\nuniform float uSnowAccumulation;'
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.18, uRainWetness * 0.78);'
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Top ledges of inland basalt outcrops collect green moss cushions (Reference Images 1 & 2)
        float inlandRock = smoothstep(0.6, 2.2, vRockWorldPos.y);
        float topMoss = smoothstep(0.46, 0.80, vRockWorldNorm.y) * inlandRock;
        vec3 rockMossCol = texture2D(uMossMap, vRockWorldPos.xz * 0.25).rgb * 1.08;
        diffuseColor.rgb = mix(diffuseColor.rgb, rockMossCol, topMoss * 0.82);
        diffuseColor.rgb *= mix(1.0, 0.72, uRainWetness);
        float topSnow = smoothstep(0.45, 0.85, vRockWorldNorm.y) * uSnowAccumulation;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.90, 0.94), topSnow * 0.85);`
      );
  };

  const desertRockMat = new THREE.MeshStandardMaterial({
    map: textures.desertRockAlbedo,
    normalMap: textures.desertRockNormal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughness: 0.88,
    metalness: 0.04,
    color: 0xd6c3ad,
  });
  desertRockMat.onBeforeCompile = (shader) => {
    shader.uniforms.uRainWetness = weatherUniforms.uRainWetness;
    shader.uniforms.uSnowAccumulation = weatherUniforms.uSnowAccumulation;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDesertRockNorm;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvDesertRockNorm = normalize(mat3(modelMatrix) * objectNormal);'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vDesertRockNorm;\nuniform float uRainWetness;\nuniform float uSnowAccumulation;'
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.24, uRainWetness * 0.72);'
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(1.0, 0.72, uRainWetness);
        float topSnow = smoothstep(0.45, 0.85, vDesertRockNorm.y) * uSnowAccumulation;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.90, 0.94), topSnow * 0.82);`
      );
  };

  const whaleSkinMat = new THREE.MeshStandardMaterial({
    color: 0x16191e,
    roughness: 0.32, // Wet dark leviathan skin
    metalness: 0.12,
    normalMap: textures.rockNormal,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
  disposables.push(rockMat, desertRockMat, whaleSkinMat);

  // 5. Jagged Basalt Sea Stacks & Inland Desert-Mountain Rock Spires
  const stackConfigs = [
    { x: -46, z: -8, h: 12, seed: 3, radius: 3.4 },
    { x: -84, z: 22, h: 17, seed: 7, radius: 4.2 },
    { x: -115, z: -20, h: 22, seed: 11, radius: 4.8 },
    { x: 52, z: -12, h: 13, seed: 5, radius: 3.5 },
    { x: 92, z: 24, h: 19, seed: 9, radius: 4.4 },
    { x: 124, z: -24, h: 24, seed: 13, radius: 4.8 },
    { x: -24, z: 46, h: 7.5, seed: 2, radius: 2.3 },
    { x: 38, z: 68, h: 8.5, seed: 4, radius: 2.5 },
    { x: -58, z: 96, h: 11.5, seed: 6, radius: 3.1 },
    { x: 76, z: 112, h: 13.0, seed: 8, radius: 3.4 },
    { x: 148, z: 72, h: 26, seed: 17, radius: 5.5 },
    { x: -148, z: 68, h: 24, seed: 19, radius: 5.2 },
    { x: -94, z: 178, h: 20, seed: 23, radius: 4.8 },
    { x: 18, z: 212, h: 24, seed: 29, radius: 5.1 },
    { x: 116, z: 192, h: 22, seed: 31, radius: 5.0 },
    { x: -175, z: 155, h: 27, seed: 37, radius: 5.6 },
    { x: 178, z: 158, h: 28, seed: 41, radius: 5.8 },
  ];

  for (const cfg of stackConfigs) {
    const isDesertZone = cfg.z - shorelineZAt(cfg.x) > 95;
    const stack = createBasaltStack(isDesertZone ? desertRockMat : rockMat, cfg.seed, cfg.h);
    const gy = groundHeightAt(cfg.x, cfg.z);
    stack.position.set(cfg.x, gy - 0.6, cfg.z);
    group.add(stack);
    colliders.push({ x: cfg.x, z: cfg.z, radius: cfg.radius });
  }

  // 6. Stranded Whales / Leviathans along the Tidal Edge
  const whale1 = createStrandedWhale(rockMat, whaleSkinMat, 1.05);
  const w1x = -26;
  const w1z = shorelineZAt(w1x) + 3.4;
  whale1.position.set(w1x, groundHeightAt(w1x, w1z) - 0.25, w1z);
  whale1.rotation.set(0.06, 0.72, -0.18);
  group.add(whale1);
  colliders.push({ x: w1x, z: w1z, radius: 3.2 });

  const whale2 = createStrandedWhale(rockMat, whaleSkinMat, 0.8);
  const w2x = 34;
  const w2z = shorelineZAt(w2x) - 1.5;
  whale2.position.set(w2x, groundHeightAt(w2x, w2z) - 0.22, w2z);
  whale2.rotation.set(-0.04, -1.05, 0.14);
  group.add(whale2);
  colliders.push({ x: w2x, z: w2z, radius: 2.4 });

  const whale3 = createStrandedWhale(rockMat, whaleSkinMat, 1.45);
  const w3x = -88;
  const w3z = shorelineZAt(w3x) - 7.5;
  whale3.position.set(w3x, groundHeightAt(w3x, w3z) - 0.35, w3z);
  whale3.rotation.set(0.02, 1.35, -0.1);
  group.add(whale3);
  colliders.push({ x: w3x, z: w3z, radius: 4.0 });

  // 6b. Random Basalt Boulder Outcrops & Fallen Driftwood Tree Log Obstacles
  const driftwoodMat = new THREE.MeshStandardMaterial({
    map: textures.woodAlbedo,
    color: 0x877b6f,
    roughness: 0.92,
    metalness: 0.02,
  });
  const boulderGeo = new THREE.DodecahedronGeometry(1.0, 1);
  const logTrunkGeo = new THREE.CylinderGeometry(0.28, 0.38, 1.0, 9);
  logTrunkGeo.rotateZ(Math.PI / 2);
  const logBranchGeo = new THREE.CylinderGeometry(0.08, 0.14, 0.9, 6);
  disposables.push(driftwoodMat, boulderGeo, logTrunkGeo, logBranchGeo);

  const isObstacleSpotClear = (ox: number, oz: number, minPad = 6.5): boolean => {
    if (Math.hypot(ox, oz - 18) < 9.5) return false; // Player spawn
    if (Math.hypot(ox - WOODEN_POST_POS.x, oz - WOODEN_POST_POS.z) < 9.0) return false; // Wooden Delivery Post
    if (Math.hypot(ox - REFUGE_HUT_POS.x, oz - REFUGE_HUT_POS.z) < 8.5) return false; // Mountain Refuge Hut
    if (Math.hypot(ox - MUSIC_TRIGGER_POINT.x, oz - MUSIC_TRIGGER_POINT.z) < 9.0) return false;
    if (oz < shorelineZAt(ox) - 1.0) return false;
    for (const c of colliders) {
      if (Math.hypot(ox - c.x, oz - c.z) < c.radius + minPad) return false;
    }
    return true;
  };

  // 28 Random Basalt Rock Obstacles across the beach, hollows & hills
  let boulderSeed = 1337;
  const nextRand = () => {
    boulderSeed = (boulderSeed * 16807) % 2147483647;
    return (boulderSeed - 1) / 2147483646;
  };

  const boulderSpots: { x: number; y: number; z: number; scale: number; useDesert: boolean }[] = [];

  for (let i = 0; i < 48; i++) {
    let bx = 0;
    let bz = 0;
    let placed = false;
    for (let attempt = 0; attempt < 25; attempt++) {
      const ang = nextRand() * Math.PI * 2;
      const dist = 16 + nextRand() * 255;
      const tx = Math.cos(ang) * dist;
      const tz = Math.sin(ang) * dist * 0.72 + 45;
      if (isObstacleSpotClear(tx, tz, 4.5)) {
        bx = tx;
        bz = tz;
        placed = true;
        break;
      }
    }
    if (!placed) continue;

    const scale = 0.85 + nextRand() * 1.55;
    const by = groundHeightAt(bx, bz);
    const useDesert = bz - shorelineZAt(bx) > 125 || by > 11.5;
    const boulderMat = useDesert ? desertRockMat : rockMat;
    const boulder = new THREE.Mesh(boulderGeo, boulderMat);
    const sy = scale * (0.68 + nextRand() * 0.45);
    boulder.position.set(bx, by + scale * 0.25, bz);
    boulder.rotation.set(nextRand() * 2, nextRand() * 6, nextRand() * 2);
    boulder.scale.set(scale * 1.15, sy, scale);
    boulder.castShadow = !isSoftwareGl;
    boulder.receiveShadow = true;
    group.add(boulder);

    boulderSpots.push({ x: bx, y: by + sy * 0.72, z: bz, scale, useDesert });

    // Occasional smaller companion stone next to primary boulder
    if (i % 2 === 0) {
      const sideAng = nextRand() * Math.PI * 2;
      const sideScale = scale * 0.55;
      const sx = bx + Math.cos(sideAng) * scale * 0.95;
      const sz = bz + Math.sin(sideAng) * scale * 0.95;
      const sideStone = new THREE.Mesh(boulderGeo, boulderMat);
      sideStone.position.set(sx, groundHeightAt(sx, sz) + sideScale * 0.2, sz);
      sideStone.rotation.set(nextRand() * 3, nextRand() * 6, 0);
      sideStone.scale.set(sideScale * 1.2, sideScale * 0.72, sideScale);
      sideStone.castShadow = !isSoftwareGl;
      sideStone.receiveShadow = true;
      group.add(sideStone);
    }

    colliders.push({ x: bx, z: bz, radius: scale * 0.98 });
  }

  // 14 Fallen Weathered Driftwood Tree Logs with solid multi-circle trunk colliders
  const upVec = new THREE.Vector3(0, 1, 0);
  const surfNorm = new THREE.Vector3();

  for (let i = 0; i < 14; i++) {
    let lx = 0;
    let lz = 0;
    let placed = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const ang = nextRand() * Math.PI * 2;
      const dist = 18 + nextRand() * 225;
      const tx = Math.cos(ang) * dist;
      const tz = Math.sin(ang) * dist * 0.65 + 32;
      if (isObstacleSpotClear(tx, tz, 6.2)) {
        lx = tx;
        lz = tz;
        placed = true;
        break;
      }
    }
    if (!placed) continue;

    const length = 4.0 + nextRand() * 2.6;
    const thickness = 0.88 + nextRand() * 0.48;
    const rotY = nextRand() * Math.PI * 2;
    const ly = groundHeightAt(lx, lz);
    groundNormalAt(lx, lz, surfNorm);

    const logGroup = new THREE.Group();
    logGroup.position.set(lx, ly + 0.2 * thickness, lz);
    logGroup.quaternion.setFromUnitVectors(upVec, surfNorm);
    logGroup.rotateY(rotY);

    const trunk = new THREE.Mesh(logTrunkGeo, driftwoodMat);
    trunk.scale.set(length, thickness, thickness);
    trunk.castShadow = !isSoftwareGl;
    trunk.receiveShadow = true;
    logGroup.add(trunk);

    // Two broken weathered branch stubs
    for (let b = 0; b < 2; b++) {
      const stub = new THREE.Mesh(logBranchGeo, driftwoodMat);
      const bxOff = (b === 0 ? -0.26 : 0.22) * length;
      stub.position.set(bxOff, 0.34 * thickness, (b === 0 ? 1 : -1) * 0.22);
      stub.rotation.set((b === 0 ? 0.55 : -0.48), 0, (b === 0 ? -0.45 : 0.38));
      stub.scale.setScalar(thickness * 0.85);
      stub.castShadow = !isSoftwareGl;
      logGroup.add(stub);
    }

    group.add(logGroup);

    // Register 4 overlapping circular colliders along the trunk axis in world XZ
    const dirX = Math.cos(rotY);
    const dirZ = -Math.sin(rotY);
    for (let s = -1.5; s <= 1.5; s += 1.0) {
      const segOffset = (s / 2.0) * (length * 0.72);
      colliders.push({
        x: lx + dirX * segOffset,
        z: lz + dirZ * segOffset,
        radius: 0.42 * thickness,
      });
    }
  }

  // 6c. Scenic Overlook Cairn Landmark at Music Trigger Point
  const cairnGroup = new THREE.Group();
  const cairnY = groundHeightAt(MUSIC_TRIGGER_POINT.x, MUSIC_TRIGGER_POINT.z);
  cairnGroup.position.set(MUSIC_TRIGGER_POINT.x, cairnY, MUSIC_TRIGGER_POINT.z);
  const cairnRadii = [0.75, 0.54, 0.38, 0.24];
  let cairnH = 0.28;
  for (let i = 0; i < cairnRadii.length; i++) {
    const r = cairnRadii[i];
    const stone = new THREE.Mesh(boulderGeo, rockMat);
    stone.position.set((i % 2 === 0 ? 0.04 : -0.04), cairnH, 0);
    stone.scale.set(r * 1.15, r * 0.65, r);
    stone.rotation.y = i * 1.1;
    stone.castShadow = !isSoftwareGl;
    cairnGroup.add(stone);
    cairnH += r * 0.92;
  }
  const cairnGlowMat = new THREE.MeshBasicMaterial({
    color: 0xf7b94d,
    transparent: true,
    opacity: 0.82,
  });
  const cairnOrbGeo = new THREE.OctahedronGeometry(0.16, 0);
  const cairnOrb = new THREE.Mesh(cairnOrbGeo, cairnGlowMat);
  cairnOrb.position.set(0, cairnH + 0.22, 0);
  cairnGroup.add(cairnOrb);
  group.add(cairnGroup);
  colliders.push({ x: MUSIC_TRIGGER_POINT.x, z: MUSIC_TRIGGER_POINT.z, radius: 1.0 });
  disposables.push(cairnGlowMat, cairnOrbGeo);

  // 7. InstancedMesh Basalt & Sandstone Pebbles Scattered Across Expanded Beach & Mountains
  const pebbleGeo = new THREE.DodecahedronGeometry(0.45, 0);
  const pebbleMat = new THREE.MeshStandardMaterial({
    map: textures.rockAlbedo,
    roughness: 0.78,
    metalness: 0.08,
    color: 0xffffff,
  });
  const pebbleCount = 460;
  const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbleCount);
  pebbles.castShadow = !isSoftwareGl;
  pebbles.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < pebbleCount; i++) {
    const angle = (i * 2.39996) % (Math.PI * 2);
    const radius = 10 + Math.sqrt(i / pebbleCount) * 265;
    const px = Math.cos(angle) * radius;
    const pz = Math.sin(angle) * radius * 0.76 + 44;
    const py = groundHeightAt(px, pz);
    const s = 0.45 + ((i * 17) % 100) * 0.014;
    dummy.position.set(px, py + s * 0.14, pz);
    dummy.rotation.set((i * 1.1) % 3, (i * 2.3) % 6, (i * 0.7) % 3);
    dummy.scale.set(s * 1.3, s * 0.62, s);
    dummy.updateMatrix();
    pebbles.setMatrixAt(i, dummy.matrix);

    const desertTint = THREE.MathUtils.smoothstep(pz - shorelineZAt(px), 68, 145);
    const shade = 0.22 + ((i * 31) % 20) * 0.012;
    const rTint = THREE.MathUtils.lerp(shade, 0.54 + (shade - 0.22) * 1.4, desertTint);
    const gTint = THREE.MathUtils.lerp(shade * 1.03, 0.42 + (shade - 0.22) * 1.1, desertTint);
    const bTint = THREE.MathUtils.lerp(shade * 1.08, 0.31 + (shade - 0.22) * 0.8, desertTint);
    tint.setRGB(rTint, gTint, bTint);
    pebbles.setColorAt(i, tint);
  }
  pebbles.instanceMatrix.needsUpdate = true;
  if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
  pebbles.computeBoundingSphere();
  group.add(pebbles);
  disposables.push(pebbleGeo, pebbleMat);

  // 7b. InstancedMesh 3D Coastal Grass Tuft Groups (expanded across coastal hills, hollows & cliff shelves)
  const buildGrassTuftGeo = (): THREE.BufferGeometry => {
    const positions: number[] = [];
    const normals: number[] = [];
    const blades = 9;
    for (let b = 0; b < blades; b++) {
      const ang = (b / blades) * Math.PI * 2 + (b % 3) * 0.21;
      const lean = 0.14 + (b % 3) * 0.09;
      const h = 0.36 + (b % 4) * 0.11;
      const w = 0.036;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const px = -sin * w;
      const pz = cos * w;
      const ox = cos * (0.03 + (b % 2) * 0.035);
      const oz = sin * (0.03 + (b % 2) * 0.035);
      const midX = ox + cos * lean * 0.38;
      const midZ = oz + sin * lean * 0.38;
      const midY = h * 0.56;
      const tipX = ox + cos * lean;
      const tipZ = oz + sin * lean;

      // Two-segment gently arched grass blade
      positions.push(
        ox - px, 0, oz - pz,
        ox + px, 0, oz + pz,
        midX + px * 0.45, midY, midZ + pz * 0.45,

        ox - px, 0, oz - pz,
        midX + px * 0.45, midY, midZ + pz * 0.45,
        midX - px * 0.45, midY, midZ - pz * 0.45,

        midX - px * 0.45, midY, midZ - pz * 0.45,
        midX + px * 0.45, midY, midZ + pz * 0.45,
        tipX, h, tipZ
      );
      for (let k = 0; k < 9; k++) {
        normals.push(cos * 0.4, 0.82, sin * 0.4);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geo;
  };

  const grassGeo = buildGrassTuftGeo();
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = skyUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 instPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 1.9 + instPos.x * 0.35 + instPos.z * 0.28) * 0.095 * position.y;
        transformed.x += sway;
        transformed.z += sway * 0.55;`
      );
  };

  const candidateGrassSpots: { x: number; z: number }[] = [];
  const totalCandidates = 1350;
  for (let c = 0; c < totalCandidates; c++) {
    const ang = (c * 2.39996) % (Math.PI * 2);
    const rad = 14 + Math.sqrt(c / totalCandidates) * 182;
    const cx = Math.cos(ang) * rad;
    const cz = Math.sin(ang) * rad * 0.62 + 78;
    const shore = shorelineZAt(cx);
    const inlandDist = cz - shore;
    if (inlandDist < 8 || inlandDist > 188) continue;
    if (Math.hypot(cx - WOODEN_POST_POS.x, cz - WOODEN_POST_POS.z) < 4.5) continue;
    if (Math.hypot(cx - REFUGE_HUT_POS.x, cz - REFUGE_HUT_POS.z) < 4.2) continue;

    groundNormalAt(cx, cz, surfNorm);
    if (surfNorm.y < 0.70) continue; // Keep grass on walkable slopes & cliff caps, not vertical cliff faces
    candidateGrassSpots.push({ x: cx, z: cz });
  }

  const clusterCount = Math.min(920, candidateGrassSpots.length);
  const tuftsPerCluster = 5;
  const totalTufts = clusterCount * tuftsPerCluster;
  const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, totalTufts);
  grassMesh.receiveShadow = true;

  const bushSpots: { x: number; z: number }[] = [];
  let tuftIdx = 0;
  for (let c = 0; c < clusterCount; c++) {
    const spot = candidateGrassSpots[c];
    const cx = spot.x;
    const useZ = spot.z;
    bushSpots.push({ x: cx, z: useZ });

    for (let t = 0; t < tuftsPerCluster; t++) {
      const subAng = (t / tuftsPerCluster) * Math.PI * 2 + c * 0.7;
      const subRad = 0.22 + ((c + t * 3) % 5) * 0.34;
      const gx = cx + Math.cos(subAng) * subRad;
      const gz = useZ + Math.sin(subAng) * subRad;
      const gy = groundHeightAt(gx, gz);

      const scale = 0.78 + ((c * 13 + t * 7) % 10) * 0.08;
      dummy.position.set(gx, gy - 0.03, gz);
      dummy.rotation.set(0, (c + t) * 1.4, 0);
      dummy.scale.set(scale, scale * (0.9 + (t % 3) * 0.16), scale);
      dummy.updateMatrix();
      grassMesh.setMatrixAt(tuftIdx, dummy.matrix);

      // Rich realistic moss-olive, meadow-fern, and sunlit sage greens (Reference Images 1-3)
      const variant = (c + t) % 4;
      if (variant === 0) {
        tint.setHex(0x556934);
      } else if (variant === 1) {
        tint.setHex(0x6d7d3d);
      } else if (variant === 2) {
        tint.setHex(0x42572b);
      } else {
        tint.setHex(0x7c8647);
      }
      grassMesh.setColorAt(tuftIdx, tint);
      tuftIdx++;
    }
  }
  grassMesh.instanceMatrix.needsUpdate = true;
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  grassMesh.computeBoundingSphere();
  group.add(grassMesh);
  disposables.push(grassGeo, grassMat);

  // 7c. Pillowy Moss Mounds & Low Coastal Bushes (Reference Images 2 & 3)
  const buildBushGeo = (): THREE.BufferGeometry => {
    const positions: number[] = [];
    const normals: number[] = [];
    const subGeo = new THREE.DodecahedronGeometry(0.27, 1);
    const subPos = subGeo.attributes.position as THREE.BufferAttribute;
    const subNorm = subGeo.attributes.normal as THREE.BufferAttribute;
    const subIdx = subGeo.index;

    const offsets = [
      { x: 0, y: 0.18, z: 0, sx: 1.25, sy: 0.78, sz: 1.2 },
      { x: -0.22, y: 0.13, z: 0.12, sx: 0.94, sy: 0.68, sz: 0.9 },
      { x: 0.22, y: 0.14, z: -0.1, sx: 0.9, sy: 0.7, sz: 0.95 },
      { x: 0.08, y: 0.12, z: 0.22, sx: 0.85, sy: 0.62, sz: 0.82 },
      { x: -0.1, y: 0.24, z: -0.14, sx: 0.78, sy: 0.66, sz: 0.8 },
    ];

    const pushVertex = (vIdx: number, off: (typeof offsets)[number]) => {
      positions.push(
        subPos.getX(vIdx) * off.sx + off.x,
        subPos.getY(vIdx) * off.sy + off.y,
        subPos.getZ(vIdx) * off.sz + off.z
      );
      normals.push(subNorm.getX(vIdx), subNorm.getY(vIdx), subNorm.getZ(vIdx));
    };

    for (const off of offsets) {
      if (subIdx) {
        for (let i = 0; i < subIdx.count; i++) {
          pushVertex(subIdx.getX(i), off);
        }
      } else {
        for (let i = 0; i < subPos.count; i++) {
          pushVertex(i, off);
        }
      }
    }
    subGeo.dispose();

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geo;
  };

  const bushGeo = buildBushGeo();
  const bushMat = new THREE.MeshStandardMaterial({
    map: textures.mossAlbedo,
    normalMap: textures.mossNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    color: 0xffffff,
    roughness: 0.90,
    metalness: 0.02,
  });
  const greenBoulders = boulderSpots.filter((b) => !b.useDesert);
  const groundBushCount = Math.min(420, bushSpots.length);
  const boulderMossCount = greenBoulders.length * 2;
  const totalBushCount = groundBushCount + boulderMossCount;
  const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, totalBushCount);
  bushMesh.castShadow = !isSoftwareGl;
  bushMesh.receiveShadow = true;

  let bIdx = 0;
  for (let i = 0; i < groundBushCount; i++) {
    const spot = bushSpots[Math.floor((i * bushSpots.length) / groundBushCount)];
    const bx = spot.x + Math.cos(i * 1.9) * 0.55;
    const bz = spot.z + Math.sin(i * 2.3) * 0.55;
    const by = groundHeightAt(bx, bz);
    const s = 0.68 + ((i * 19) % 10) * 0.072;
    dummy.position.set(bx, by - 0.04, bz);
    dummy.rotation.set(0, i * 1.37, 0);
    dummy.scale.set(s * 1.18, s * 0.82, s);
    dummy.updateMatrix();
    bushMesh.setMatrixAt(bIdx, dummy.matrix);

    const tone = i % 4;
    if (tone === 0) tint.setHex(0x6c873c);
    else if (tone === 1) tint.setHex(0x557031);
    else if (tone === 2) tint.setHex(0x7e9644);
    else tint.setHex(0x465b2b);
    bushMesh.setColorAt(bIdx, tint);
    bIdx++;
  }

  // Tufted pillowy moss caps perched atop coastal boulders (Reference Image 2)
  for (let i = 0; i < greenBoulders.length; i++) {
    const b = greenBoulders[i];
    for (let m = 0; m < 2; m++) {
      const ox = (m === 0 ? -0.22 : 0.25) * b.scale;
      const oz = (m === 0 ? 0.15 : -0.18) * b.scale;
      const s = b.scale * (0.92 + m * 0.22);
      dummy.position.set(b.x + ox, b.y - 0.08 * b.scale, b.z + oz);
      dummy.rotation.set(0.08 * (m === 0 ? 1 : -1), i * 1.7 + m, 0.06);
      dummy.scale.set(s * 1.25, s * 0.72, s * 1.15);
      dummy.updateMatrix();
      bushMesh.setMatrixAt(bIdx, dummy.matrix);
      tint.setHex(m === 0 ? 0x6f9339 : 0x5c7f30);
      bushMesh.setColorAt(bIdx, tint);
      bIdx++;
    }
  }
  bushMesh.instanceMatrix.needsUpdate = true;
  if (bushMesh.instanceColor) bushMesh.instanceColor.needsUpdate = true;
  bushMesh.computeBoundingSphere();
  group.add(bushMesh);
  disposables.push(bushGeo, bushMat);

  // 7c-2. Small Leafy Broadleaf Bushes & Stone-Crevice Shoots (Reference Image 3)
  const buildLeafyBushGeo = (): THREE.BufferGeometry => {
    const positions: number[] = [];
    const normals: number[] = [];
    const stems = 10;
    for (let s = 0; s < stems; s++) {
      const ang = (s / stems) * Math.PI * 2 + (s % 2) * 0.28;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const len = 0.24 + (s % 3) * 0.08;
      const h = 0.14 + (s % 4) * 0.055;
      const w = 0.085;
      const px = -sin * w;
      const pz = cos * w;

      const baseX = cos * 0.04;
      const baseZ = sin * 0.04;
      const midX = cos * len * 0.55;
      const midZ = sin * len * 0.55;
      const midY = h * 0.85;
      const tipX = cos * len;
      const tipZ = sin * len;
      const tipY = h * 0.65;

      // Two triangles forming an outward-arched oval leaf blade
      positions.push(
        baseX, 0.01, baseZ,
        midX - px, midY, midZ - pz,
        midX + px, midY, midZ + pz,

        midX - px, midY, midZ - pz,
        tipX, tipY, tipZ,
        midX + px, midY, midZ + pz
      );
      for (let k = 0; k < 6; k++) {
        normals.push(cos * 0.25, 0.92, sin * 0.25);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geo;
  };

  const leafyGeo = buildLeafyBushGeo();
  const leafyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const leafyCount = Math.min(380, bushSpots.length);
  const leafyBushMesh = new THREE.InstancedMesh(leafyGeo, leafyMat, leafyCount);
  leafyBushMesh.receiveShadow = true;

  for (let i = 0; i < leafyCount; i++) {
    const spot = bushSpots[Math.floor((i * bushSpots.length) / leafyCount)];
    const lx = spot.x + Math.sin(i * 2.7) * 0.85;
    const lz = spot.z + Math.cos(i * 1.8) * 0.85;
    const ly = groundHeightAt(lx, lz);
    const s = 0.72 + ((i * 23) % 10) * 0.085;
    dummy.position.set(lx, ly - 0.01, lz);
    dummy.rotation.set(0, i * 2.1, 0);
    dummy.scale.set(s, s * (0.85 + (i % 3) * 0.18), s);
    dummy.updateMatrix();
    leafyBushMesh.setMatrixAt(i, dummy.matrix);

    const tone = i % 5;
    if (tone === 0) tint.setHex(0x7fb43b); // fresh spring shoot green (Ref Image 3)
    else if (tone === 1) tint.setHex(0x639832); // vibrant moss leaf
    else if (tone === 2) tint.setHex(0x94bd3c); // bright chartreuse leaf
    else if (tone === 3) tint.setHex(0x4e792a); // deep fern green
    else tint.setHex(0x8c563c); // occasional fallen russet leaf cluster (Ref Image 3)
    leafyBushMesh.setColorAt(i, tint);
  }
  leafyBushMesh.instanceMatrix.needsUpdate = true;
  if (leafyBushMesh.instanceColor) leafyBushMesh.instanceColor.needsUpdate = true;
  leafyBushMesh.computeBoundingSphere();
  group.add(leafyBushMesh);
  disposables.push(leafyGeo, leafyMat);

  // 7d. Inland Mountain Refuge Shelter Hut (warms the player & drops Cold exposure)
  const hutGroup = new THREE.Group();
  const hx = REFUGE_HUT_POS.x;
  const hz = REFUGE_HUT_POS.z;
  const hy = groundHeightAt(hx, hz);
  hutGroup.position.set(hx, hy, hz);

  const hutWoodMat = new THREE.MeshStandardMaterial({
    map: textures.woodAlbedo,
    color: 0x9b8e80,
    roughness: 0.9,
    metalness: 0.04,
  });
  const hutRoofMat = new THREE.MeshStandardMaterial({
    color: 0x3b4249,
    roughness: 0.62,
    metalness: 0.42,
  });
  const stoveMetalMat = new THREE.MeshStandardMaterial({
    color: 0x22262b,
    roughness: 0.5,
    metalness: 0.72,
  });
  const emberGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffaa44,
    emissive: 0xff6d1c,
    emissiveIntensity: 2.2,
    roughness: 0.35,
  });
  disposables.push(hutWoodMat, hutRoofMat, stoveMetalMat, emberGlowMat);

  // Foundation plinth & timber floor (walkable deck)
  const hutFloorGeo = new THREE.BoxGeometry(4.0, 0.28, 3.6);
  const hutFloor = new THREE.Mesh(hutFloorGeo, hutWoodMat);
  hutFloor.position.y = 0.08;
  hutFloor.receiveShadow = true;
  hutGroup.add(hutFloor);

  // Back wall (+Z) and side walls (-X, +X), leaving front (-Z) open doorway
  const backWallGeo = new THREE.BoxGeometry(3.9, 2.45, 0.18);
  const backWall = new THREE.Mesh(backWallGeo, hutWoodMat);
  backWall.position.set(0, 1.35, 1.72);
  backWall.castShadow = !isSoftwareGl;
  backWall.receiveShadow = true;
  hutGroup.add(backWall);

  const sideWallGeo = new THREE.BoxGeometry(0.18, 2.45, 3.5);
  const wallLeft = new THREE.Mesh(sideWallGeo, hutWoodMat);
  wallLeft.position.set(-1.92, 1.35, 0);
  wallLeft.castShadow = !isSoftwareGl;
  wallLeft.receiveShadow = true;
  const wallRight = new THREE.Mesh(sideWallGeo, hutWoodMat);
  wallRight.position.set(1.92, 1.35, 0);
  wallRight.castShadow = !isSoftwareGl;
  wallRight.receiveShadow = true;
  hutGroup.add(wallLeft, wallRight);

  // Front doorway lintel & side pilasters
  const pilasterGeo = new THREE.BoxGeometry(0.85, 2.45, 0.18);
  const pilL = new THREE.Mesh(pilasterGeo, hutWoodMat);
  pilL.position.set(-1.52, 1.35, -1.72);
  const pilR = new THREE.Mesh(pilasterGeo, hutWoodMat);
  pilR.position.set(1.52, 1.35, -1.72);
  const lintelGeo = new THREE.BoxGeometry(2.3, 0.45, 0.18);
  const lintel = new THREE.Mesh(lintelGeo, hutWoodMat);
  lintel.position.set(0, 2.35, -1.72);
  hutGroup.add(pilL, pilR, lintel);

  // Sloped corrugated metal roof canopy
  const hutRoofGeo = new THREE.BoxGeometry(4.5, 0.14, 4.15);
  const hutRoof = new THREE.Mesh(hutRoofGeo, hutRoofMat);
  hutRoof.position.set(0, 2.7, 0);
  hutRoof.rotation.x = -0.11;
  hutRoof.castShadow = !isSoftwareGl;
  hutRoof.receiveShadow = true;
  hutGroup.add(hutRoof);

  // Warm iron heater stove & glowing embers in back corner inside refuge
  const stoveGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.72, 10);
  const stove = new THREE.Mesh(stoveGeo, stoveMetalMat);
  stove.position.set(-1.18, 0.56, 1.08);
  const emberGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.22, 8);
  const ember = new THREE.Mesh(emberGeo, emberGlowMat);
  ember.position.set(-1.18, 0.58, 0.92);
  const flueGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.9, 8);
  const flue = new THREE.Mesh(flueGeo, stoveMetalMat);
  flue.position.set(-1.18, 1.85, 1.08);
  hutGroup.add(stove, ember, flue);

  const hutWarmLight = new THREE.PointLight(0xff9d3b, 2.6, 10, 1.6);
  hutWarmLight.position.set(-0.6, 1.45, 0.4);
  hutGroup.add(hutWarmLight);

  group.add(hutGroup);
  disposables.push(hutFloorGeo, backWallGeo, sideWallGeo, pilasterGeo, lintelGeo, hutRoofGeo, stoveGeo, emberGeo, flueGeo);

  // Register wall colliders around refuge hut perimeter while leaving front doorway (-Z center) open
  colliders.push(
    { x: hx - 1.92, z: hz - 1.2, radius: 0.42 },
    { x: hx - 1.92, z: hz, radius: 0.42 },
    { x: hx - 1.92, z: hz + 1.2, radius: 0.42 },
    { x: hx + 1.92, z: hz - 1.2, radius: 0.42 },
    { x: hx + 1.92, z: hz, radius: 0.42 },
    { x: hx + 1.92, z: hz + 1.2, radius: 0.42 },
    { x: hx - 1.2, z: hz + 1.72, radius: 0.45 },
    { x: hx, z: hz + 1.72, radius: 0.45 },
    { x: hx + 1.2, z: hz + 1.72, radius: 0.45 },
    { x: hx - 1.55, z: hz - 1.72, radius: 0.42 },
    { x: hx + 1.55, z: hz - 1.72, radius: 0.42 },
    { x: hx - 1.18, z: hz + 1.08, radius: 0.36 }
  );

  // 8. Distant Misty Volcanic Headlands, Jagged Sea Island & Glacial Drift
  const headlandMat = new THREE.MeshStandardMaterial({
    color: 0x394048,
    roughness: 0.92,
    metalness: 0.04,
  });
  const iceDriftMat = new THREE.MeshStandardMaterial({
    color: 0xd0d8df,
    roughness: 0.45,
    metalness: 0.05,
  });
  disposables.push(headlandMat, iceDriftMat);

  // Left sloping headland ridge across the bay
  const leftRidgeGroup = new THREE.Group();
  const leftPeakGeo = new THREE.ConeGeometry(48, 34, 7);
  leftPeakGeo.scale(1.8, 1.0, 1.1);
  const leftPeak = new THREE.Mesh(leftPeakGeo, headlandMat);
  leftPeak.position.set(-135, 11, -185);
  leftRidgeGroup.add(leftPeak);

  const leftSlopeGeo = new THREE.ConeGeometry(42, 18, 6);
  leftSlopeGeo.scale(2.1, 0.9, 1.0);
  const leftSlope = new THREE.Mesh(leftSlopeGeo, headlandMat);
  leftSlope.position.set(-85, 5, -172);
  leftRidgeGroup.add(leftSlope);
  group.add(leftRidgeGroup);
  disposables.push(leftPeakGeo, leftSlopeGeo);

  // Right jagged sea stack island silhouette
  const rightIslandGroup = new THREE.Group();
  const rPeak1Geo = new THREE.ConeGeometry(28, 32, 6);
  rPeak1Geo.scale(1.4, 1.1, 0.9);
  const rPeak1 = new THREE.Mesh(rPeak1Geo, headlandMat);
  rPeak1.position.set(105, 11, -175);
  rPeak1.rotation.z = -0.22;
  rightIslandGroup.add(rPeak1);

  const rPeak2Geo = new THREE.ConeGeometry(22, 20, 5);
  rPeak2Geo.scale(1.8, 0.9, 1.0);
  const rPeak2 = new THREE.Mesh(rPeak2Geo, headlandMat);
  rPeak2.position.set(132, 6, -182);
  rightIslandGroup.add(rPeak2);
  group.add(rightIslandGroup);
  disposables.push(rPeak1Geo, rPeak2Geo);

  // Inland Desert Sandstone Mountain Peaks Framing the Southern Horizon
  const desertMountainGroup = new THREE.Group();
  const mtnPeakGeo = new THREE.ConeGeometry(62, 68, 7);
  disposables.push(mtnPeakGeo);
  const desertPeaks = [
    { x: -245, z: 325, sx: 1.8, sy: 1.05, sz: 1.2 },
    { x: -115, z: 365, sx: 2.1, sy: 1.28, sz: 1.4 },
    { x: 15, z: 382, sx: 2.3, sy: 1.35, sz: 1.3 },
    { x: 145, z: 358, sx: 1.9, sy: 1.18, sz: 1.2 },
    { x: 265, z: 315, sx: 1.7, sy: 0.98, sz: 1.3 },
  ];
  for (const mp of desertPeaks) {
    const peak = new THREE.Mesh(mtnPeakGeo, desertRockMat);
    peak.position.set(mp.x, groundHeightAt(mp.x, mp.z) + 12, mp.z);
    peak.scale.set(mp.sx, mp.sy, mp.sz);
    peak.rotation.y = mp.x * 0.05;
    desertMountainGroup.add(peak);
  }
  group.add(desertMountainGroup);

  // Pale glacial ice chunks / sea-mist outcrops along the distant bay
  const iceGeo = new THREE.DodecahedronGeometry(3.2, 0);
  disposables.push(iceGeo);
  const iceSpots = [
    { x: -72, z: -138, sx: 2.2, sy: 0.7 },
    { x: -16, z: -145, sx: 1.8, sy: 0.65 },
    { x: 18, z: -135, sx: 2.6, sy: 0.9 },
    { x: 64, z: -148, sx: 2.9, sy: 0.85 },
    { x: 142, z: -152, sx: 2.4, sy: 0.75 },
  ];
  for (const ice of iceSpots) {
    const chunk = new THREE.Mesh(iceGeo, iceDriftMat);
    chunk.position.set(ice.x, SEA_LEVEL + 0.35, ice.z);
    chunk.scale.set(ice.sx, ice.sy, 1.3);
    chunk.rotation.y = ice.x * 0.2;
    group.add(chunk);
  }

  // 9. Five Distant Hovering Stranded Figures (EEs) Over the Ocean Horizon
  const eeGroup = new THREE.Group();
  const eeMat = new THREE.MeshBasicMaterial({
    color: 0x1a2026,
    transparent: true,
    opacity: 0.65,
  });
  const strandMat = new THREE.MeshBasicMaterial({
    color: 0x2a313a,
    transparent: true,
    opacity: 0.28,
  });
  const eeBodyGeo = new THREE.CapsuleGeometry(0.42, 1.5, 4, 8);
  const eeHeadGeo = new THREE.SphereGeometry(0.28, 8, 8);
  const eeStrandGeo = new THREE.CylinderGeometry(0.03, 0.06, 95, 5);
  disposables.push(eeMat, strandMat, eeBodyGeo, eeHeadGeo, eeStrandGeo);

  const eeFigures: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) {
    const fig = new THREE.Group();
    const body = new THREE.Mesh(eeBodyGeo, eeMat);
    const head = new THREE.Mesh(eeHeadGeo, eeMat);
    head.position.y = 1.25;
    const strand = new THREE.Mesh(eeStrandGeo, strandMat);
    strand.position.y = 48;

    fig.add(body, head, strand);
    const spread = (i - 2) * 20;
    const dist = -145 - Math.abs(i - 2) * 8;
    fig.position.set(spread, 17 + (i % 2) * 2.5, dist);
    fig.scale.setScalar(1.35);
    eeGroup.add(fig);
    eeFigures.push(fig);
  }
  group.add(eeGroup);

  // 9. Floating Chiral Ash & Sea Mist Particles
  const particleCount = isSoftwareGl ? 240 : 520;
  const pPositions = new Float32Array(particleCount * 3);
  const pSpeeds = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    pPositions[i * 3] = (Math.random() - 0.5) * 70;
    pPositions[i * 3 + 1] = Math.random() * 16;
    pPositions[i * 3 + 2] = (Math.random() - 0.5) * 70;
    pSpeeds[i] = 0.4 + Math.random() * 0.9;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  const pMat = new THREE.PointsMaterial({
    map: textures.particleMap,
    size: 0.22,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    color: 0xc8d2dc,
  });
  const particles = new THREE.Points(pGeo, pMat);
  particles.frustumCulled = false;
  group.add(particles);
  disposables.push(pGeo, pMat);

  // 10. Invisible Boundary Wall Impact Shimmer Shield (hidden until player impacts edge)
  const shieldUniforms = {
    uImpactStrength: { value: 0 },
    uTime: skyUniforms.uTime,
  };
  const shieldGeo = new THREE.PlaneGeometry(9, 4.2);
  const shieldMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: shieldUniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uImpactStrength;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        if (uImpactStrength < 0.01) discard;
        float distEdge = length((vUv - 0.5) * vec2(1.0, 1.25));
        float radialFade = 1.0 - smoothstep(0.1, 0.55, distEdge);
        float gridX = smoothstep(0.90, 0.98, abs(sin(vUv.x * 48.0)));
        float gridY = smoothstep(0.90, 0.98, abs(sin(vUv.y * 24.0)));
        float ripple = 0.5 + 0.5 * sin(distEdge * 28.0 - uTime * 12.0);
        float alpha = radialFade * (0.28 + (gridX + gridY) * 0.45 + ripple * 0.2) * uImpactStrength;
        gl_FragColor = vec4(0.45, 0.82, 0.98, alpha);
      }
    `,
  });
  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.visible = false;
  group.add(shieldMesh);
  disposables.push(shieldGeo, shieldMat);

  const triggerBoundaryImpact = (x: number, z: number, nx: number, nz: number) => {
    shieldUniforms.uImpactStrength.value = 1.0;
    shieldMesh.visible = true;
    const gy = groundHeightAt(x, z);
    shieldMesh.position.set(x, gy + 1.5, z);
    shieldMesh.lookAt(x + nx, gy + 1.5, z + nz);
  };

  let currentBasePreset: AtmospherePresetId = 'ash';
  let latestWeather: WeatherSnapshot | null = null;
  let latestTime: TimeOfDaySnapshot | null = null;

  const syncSkyAndRefuge = () => {
    const p = ATMOSPHERE_PRESETS[currentBasePreset];
    const w = latestWeather;
    const t = latestTime;

    const rainW = w ? w.rainWeight : 0;
    const snowW = w ? w.snowWeight : 0;
    const clearW = w ? w.clearWeight : 1;

    const daylight = t ? t.daylight : 1;
    const twilight = t ? t.twilight : 0;
    const nightW = t ? t.nightWeight : 0;

    if (t) {
      skyUniforms.uDaylight.value = daylight;
      skyUniforms.uTwilight.value = twilight;
      skyUniforms.uSunDir.value.copy(t.celestialDir);
    }

    const baseTop = new THREE.Color(p.skyTop);
    const baseHorizon = new THREE.Color(p.skyHorizon);
    const rainTop = new THREE.Color(0x4b5560);
    const rainHorizon = new THREE.Color(0x838d97);
    const snowTop = new THREE.Color(0xa6b2be);
    const snowHorizon = new THREE.Color(0xdde4ec);

    baseTop
      .lerp(rainTop, rainW * 0.78)
      .lerp(snowTop, snowW * 0.62);
    baseHorizon
      .lerp(rainHorizon, rainW * 0.76)
      .lerp(snowHorizon, snowW * 0.68);

    // Dusk/Dawn warm tint & Night slate darkening
    const twilightTop = new THREE.Color(0x3a4056);
    const twilightHorizon = new THREE.Color(0x9b664f);
    const nightTop = new THREE.Color(0x101826);
    const nightHorizon = new THREE.Color(snowW > 0.35 ? 0x2b3648 : 0x1d2736);

    baseTop
      .lerp(twilightTop, twilight * 0.55)
      .lerp(nightTop, nightW * 0.86);
    baseHorizon
      .lerp(twilightHorizon, twilight * 0.48)
      .lerp(nightHorizon, nightW * 0.84);

    skyUniforms.uTopColor.value.copy(baseTop);
    skyUniforms.uHorizonColor.value.copy(baseHorizon);
    skyUniforms.uRainbowStrength.value =
      p.rainbowStrength * (1.0 - snowW * 0.85) * daylight;

    // Water reflects darker midnight tone at night
    const waterDeepCol = new THREE.Color(p.waterDeep).lerp(new THREE.Color(0x0c121b), nightW * 0.65);
    const waterShallowCol = new THREE.Color(p.waterShallow).lerp(new THREE.Color(0x16202e), nightW * 0.6);
    waterMat.color.copy(waterDeepCol);
    if (waterMat.userData.shader) {
      waterMat.userData.shader.uniforms.uWaterShallow.value.copy(waterShallowCol);
    }

    // Subtle ash particles & warm refuge cabin stove glow brighter at night
    pMat.opacity = 0.42 * (0.35 + clearW * 0.65) * (0.5 + 0.5 * daylight);
    hutWarmLight.intensity = 2.6 + nightW * 2.3;
    emberGlowMat.emissiveIntensity = 2.2 + nightW * 1.4;
  };

  const applyPreset = (presetId: AtmospherePresetId) => {
    currentBasePreset = presetId;
    syncSkyAndRefuge();
  };

  const applyWeather = (weather: WeatherSnapshot) => {
    latestWeather = weather;
    weatherUniforms.uRainWetness.value = weather.rainWetness;
    weatherUniforms.uSnowAccumulation.value = weather.snowAccumulation;
    skyUniforms.uCloudCoverage.value = weather.cloudCoverage;
    skyUniforms.uStormDarkness.value = weather.rainWeight * 0.85 + weather.snowWeight * 0.18;
    skyUniforms.uClearShafts.value = weather.clearWeight;
    syncSkyAndRefuge();
  };

  const applyTimeOfDay = (time: TimeOfDaySnapshot) => {
    latestTime = time;
    syncSkyAndRefuge();
  };

  const update = (elapsed: number, delta: number, playerPos: THREE.Vector3) => {
    skyUniforms.uTime.value = elapsed;

    if (shieldUniforms.uImpactStrength.value > 0) {
      shieldUniforms.uImpactStrength.value = Math.max(
        0,
        shieldUniforms.uImpactStrength.value - delta * 2.2
      );
      if (shieldUniforms.uImpactStrength.value <= 0.01) {
        shieldMesh.visible = false;
      }
    }

    // Gentle hover on distant EE figures
    for (let i = 0; i < eeFigures.length; i++) {
      const fig = eeFigures[i];
      fig.position.y = 16 + (i % 2) * 2.5 + Math.sin(elapsed * 0.55 + i * 1.4) * 0.8;
      fig.rotation.z = Math.sin(elapsed * 0.4 + i) * 0.04;
    }

    // Wrap ash particles smoothly around player position
    const posArr = pGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      posArr[idx] += Math.sin(elapsed * 0.4 + i) * 0.25 * delta + 0.35 * delta;
      posArr[idx + 1] -= pSpeeds[i] * 0.45 * delta;
      posArr[idx + 2] += 0.2 * delta;

      if (posArr[idx + 1] < 0.1) posArr[idx + 1] = 15.5;
      if (posArr[idx] - playerPos.x > 35) posArr[idx] -= 70;
      if (posArr[idx] - playerPos.x < -35) posArr[idx] += 70;
      if (posArr[idx + 2] - playerPos.z > 35) posArr[idx + 2] -= 70;
      if (posArr[idx + 2] - playerPos.z < -35) posArr[idx + 2] += 70;
    }
    pGeo.attributes.position.needsUpdate = true;
  };

  const isInsideBuilding = (x: number, z: number): BuildingShelterInfo => {
    if (
      Math.abs(x - WOODEN_POST_POS.x) <= 2.35 &&
      Math.abs(z - WOODEN_POST_POS.z) <= 1.95
    ) {
      return { inside: true, buildingName: 'Wooden Outpost' };
    }
    if (
      Math.abs(x - REFUGE_HUT_POS.x) <= 2.05 &&
      Math.abs(z - REFUGE_HUT_POS.z) <= 1.85
    ) {
      return { inside: true, buildingName: 'Mountain Refuge' };
    }
    return { inside: false, buildingName: null };
  };

  const dispose = () => {
    disposables.forEach((d) => d.dispose());
  };

  return {
    group,
    colliders,
    bushSpots,
    skyUniforms,
    weatherUniforms,
    scanUniforms,
    waterMaterial: waterMat,
    isInsideBuilding,
    triggerBoundaryImpact,
    applyPreset,
    applyWeather,
    applyTimeOfDay,
    update,
    dispose,
  };
}
