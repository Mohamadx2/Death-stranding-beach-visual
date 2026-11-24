import * as THREE from 'three';
import {
  ATMOSPHERE_PRESETS,
  AtmospherePresetId,
  ProceduralTextureSet,
} from './materials';
import {
  ObstacleCollider,
  SEA_LEVEL,
  groundHeightAt,
  shorelineZAt,
} from './terrain';
import { WeatherSnapshot } from './weather';

export interface BeachEnvironment {
  group: THREE.Group;
  colliders: ObstacleCollider[];
  skyUniforms: {
    uTopColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
    uTime: { value: number };
    uRainbowStrength: { value: number };
    uCloudCoverage: { value: number };
    uStormDarkness: { value: number };
    uClearShafts: { value: number };
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
  triggerBoundaryImpact: (x: number, z: number, nx: number, nz: number) => void;
  applyPreset: (presetId: AtmospherePresetId) => void;
  applyWeather: (weather: WeatherSnapshot) => void;
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

  // 1. Overcast Atmospheric Sky Dome with Procedural Volumetric Clouds & Sun Shafts
  const skyUniforms = {
    uTopColor: { value: new THREE.Color(initialPreset.skyTop) },
    uHorizonColor: { value: new THREE.Color(initialPreset.skyHorizon) },
    uTime: { value: 0 },
    uRainbowStrength: { value: initialPreset.rainbowStrength },
    uCloudCoverage: { value: 0.42 },
    uStormDarkness: { value: 0.0 },
    uClearShafts: { value: 1.0 },
  };

  const skyGeo = new THREE.SphereGeometry(540, 32, 24);
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

        // Two-layer parallax volumetric cloud deck with directional sun self-shadowing
        vec2 cloudUv = dir.xz / (h + 0.14) * 1.15;
        float drift = uTime * (0.009 + uStormDarkness * 0.014);
        vec3 sunDir = normalize(vec3(-0.35, 0.36, -0.86));

        float n1 = fbm(cloudUv * 1.1 + vec2(drift, drift * 0.45));
        float n2 = fbm(cloudUv * 2.65 - vec2(drift * 0.65, 0.0) + n1 * 0.65);
        // Sample density offset toward the sun to approximate volumetric cloud thickness
        float sunSample = fbm((cloudUv - sunDir.xz * 0.12) * 1.1 + vec2(drift, drift * 0.45));

        float rawDensity = n1 * 0.62 + n2 * 0.48;
        float coverageLow = mix(0.44, 0.16, uCloudCoverage);
        float coverageHigh = mix(0.88, 0.62, uCloudCoverage);
        float cloudAlpha = smoothstep(coverageLow, coverageHigh, rawDensity);

        float selfShadow = clamp((sunSample - n1) * 2.4 + 0.52, 0.15, 1.0);
        vec3 cloudBelly = uTopColor * mix(0.76, 0.46, uStormDarkness);
        vec3 cloudCrest = min(vec3(0.97), uHorizonColor * mix(1.14, 0.88, uStormDarkness));
        vec3 cloudCol = mix(cloudBelly, cloudCrest, selfShadow);

        // Diffused sun glow & clear-weather volumetric crepuscular rays
        float sunAlign = max(0.0, dot(dir, sunDir));
        float sunGlow = pow(sunAlign, 4.0);
        float rayPattern = 0.5 + 0.5 * sin(atan(dir.x - sunDir.x, dir.y - sunDir.y + 0.25) * 9.0 + uTime * 0.08);
        float sunShafts = pow(sunAlign, 2.2) * rayPattern * (1.0 - cloudAlpha * 0.65) * uClearShafts * 0.22;
        cloudCol += vec3(0.14, 0.15, 0.16) * sunGlow * (1.0 - uStormDarkness * 0.55);

        float cloudMask = smoothstep(0.01, 0.22, h);
        vec3 skyWithClouds = mix(baseSky, cloudCol, cloudAlpha * cloudMask);
        vec3 col = mix(uHorizonColor, skyWithClouds, smoothstep(0.0, 0.18, h));
        col += vec3(0.88, 0.91, 0.94) * sunShafts * cloudMask;

        // Subtle inverted rainbow in upper cloud mist (stronger during light clear/rain breaks)
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
        col += rainbow * band * arcMask * uRainbowStrength * 0.26;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyMesh);
  disposables.push(skyGeo, skyMat);

  // 2. Expanded Volcanic Sand & Green Mossy Topography Terrain
  const segCount = isSoftwareGl ? 170 : 240;
  const terrainGeo = new THREE.PlaneGeometry(660, 660, segCount, segCount);
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
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.86,
    metalness: 0.08,
  });

  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uScanOrigin = scanUniforms.uScanOrigin;
    shader.uniforms.uScanRadius = scanUniforms.uScanRadius;
    shader.uniforms.uScanStrength = scanUniforms.uScanStrength;
    shader.uniforms.uTime = skyUniforms.uTime;
    shader.uniforms.uMossMap = { value: textures.mossAlbedo };
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
        uniform float uRainWetness;
        uniform float uSnowAccumulation;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Wet volcanic sand near sea level becomes mirror-smooth, and rain wets inland ground
        float tideSwash = sin(uTime * 0.95 + vTerrainWorldPos.x * 0.06) * 0.16;
        float wetMask = 1.0 - smoothstep(0.05, 0.82 + tideSwash, vTerrainWorldPos.y);
        float puddleNoise = sin(vTerrainWorldPos.x * 0.18 + vTerrainWorldPos.z * 0.14) * 0.5 + 0.5;
        float rainGloss = uRainWetness * (0.45 + 0.55 * smoothstep(0.45, 0.85, puddleNoise));
        roughnessFactor = mix(roughnessFactor, 0.13, max(wetMask, rainGloss * 0.85));
        roughnessFactor = mix(roughnessFactor, 0.68, uSnowAccumulation * 0.55);`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wetTint = 1.0 - smoothstep(0.05, 0.85, vTerrainWorldPos.y);
        diffuseColor.rgb *= mix(0.88, 0.42, wetTint);

        // Realistic volcanic scree, weathered basalt silt & muted olive-peat soil (no flat neon green)
        float estShoreZ = sin(vTerrainWorldPos.x * 0.018) * 9.5 +
                          cos(vTerrainWorldPos.x * 0.045 + 1.1) * 4.2 +
                          sin(vTerrainWorldPos.x * 0.008 - 0.5) * 13.0;
        float inlandDist = vTerrainWorldPos.z - estShoreZ;
        float inlandMask = smoothstep(10.0, 34.0, inlandDist);
        float slopeMask = smoothstep(0.72, 0.92, vTerrainWorldNormal.y);
        float patchNoise = sin(vTerrainWorldPos.x * 0.048 + vTerrainWorldPos.z * 0.036) * 0.42 +
                           cos(vTerrainWorldPos.x * 0.11 - vTerrainWorldPos.z * 0.085) * 0.35 +
                           sin(vTerrainWorldPos.x * 0.24 + vTerrainWorldPos.z * 0.19) * 0.18 + 0.45;
        float earthMask = clamp(inlandMask * slopeMask * patchNoise, 0.0, 0.88);
        vec3 earthCol = texture2D(uMossMap, vTerrainWorldPos.xz * 0.08).rgb;
        // Subtle dusty volcanic gravel streaks on steep ridges & trails
        float screeMask = clamp(inlandMask * (1.0 - slopeMask) * 1.4, 0.0, 0.65);
        vec3 screeCol = vec3(0.34, 0.35, 0.36);
        diffuseColor.rgb = mix(diffuseColor.rgb, earthCol * 0.95, earthMask);
        diffuseColor.rgb = mix(diffuseColor.rgb, screeCol, screeMask);

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
  const waterGeo = new THREE.PlaneGeometry(840, 440, isSoftwareGl ? 100 : 180, isSoftwareGl ? 70 : 110);
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
  waterMesh.position.set(0, SEA_LEVEL + 0.04, -185);
  waterMesh.receiveShadow = true;
  group.add(waterMesh);
  disposables.push(waterGeo, waterMat);

  // 4. Basalt Rock Material & Stranded Whale Material (with snow cap & rain gloss)
  const rockMat = new THREE.MeshStandardMaterial({
    map: textures.rockAlbedo,
    normalMap: textures.rockNormal,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.78,
    metalness: 0.08,
    color: 0x3b4046,
  });
  rockMat.onBeforeCompile = (shader) => {
    shader.uniforms.uRainWetness = weatherUniforms.uRainWetness;
    shader.uniforms.uSnowAccumulation = weatherUniforms.uSnowAccumulation;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockWorldNorm;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvRockWorldNorm = normalize(mat3(modelMatrix) * objectNormal);'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vRockWorldNorm;\nuniform float uRainWetness;\nuniform float uSnowAccumulation;'
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.18, uRainWetness * 0.78);'
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(1.0, 0.72, uRainWetness);
        float topSnow = smoothstep(0.45, 0.85, vRockWorldNorm.y) * uSnowAccumulation;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.90, 0.94), topSnow * 0.85);`
      );
  };

  const whaleSkinMat = new THREE.MeshStandardMaterial({
    color: 0x16191e,
    roughness: 0.32, // Wet dark leviathan skin
    metalness: 0.12,
    normalMap: textures.rockNormal,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
  disposables.push(rockMat, whaleSkinMat);

  // 5. Jagged Basalt Sea Stacks Framing Cove & Mid-Beach Landmarks
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
  ];

  for (const cfg of stackConfigs) {
    const stack = createBasaltStack(rockMat, cfg.seed, cfg.h);
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

  // 7. InstancedMesh Basalt Rocks & Pebbles Scattered Across Expanded Beach & Hills
  const pebbleGeo = new THREE.DodecahedronGeometry(0.45, 0);
  const pebbleMat = new THREE.MeshStandardMaterial({
    map: textures.rockAlbedo,
    roughness: 0.72,
    metalness: 0.1,
    color: 0xffffff,
  });
  const pebbleCount = 320;
  const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbleCount);
  pebbles.castShadow = !isSoftwareGl;
  pebbles.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < pebbleCount; i++) {
    const angle = (i * 2.39996) % (Math.PI * 2);
    const radius = 10 + Math.sqrt(i / pebbleCount) * 185;
    const px = Math.cos(angle) * radius;
    const pz = Math.sin(angle) * radius * 0.72 + 28;
    const py = groundHeightAt(px, pz);
    const s = 0.45 + ((i * 17) % 100) * 0.014;
    dummy.position.set(px, py + s * 0.14, pz);
    dummy.rotation.set((i * 1.1) % 3, (i * 2.3) % 6, (i * 0.7) % 3);
    dummy.scale.set(s * 1.3, s * 0.62, s);
    dummy.updateMatrix();
    pebbles.setMatrixAt(i, dummy.matrix);

    const shade = 0.22 + ((i * 31) % 20) * 0.012;
    tint.setRGB(shade, shade * 1.03, shade * 1.08);
    pebbles.setColorAt(i, tint);
  }
  pebbles.instanceMatrix.needsUpdate = true;
  if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
  pebbles.computeBoundingSphere();
  group.add(pebbles);
  disposables.push(pebbleGeo, pebbleMat);

  // 7b. InstancedMesh 3D Coastal Grass Tuft Groups (clustered on hills, hollows & rocks)
  const buildGrassTuftGeo = (): THREE.BufferGeometry => {
    const positions: number[] = [];
    const normals: number[] = [];
    const blades = 7;
    for (let b = 0; b < blades; b++) {
      const ang = (b / blades) * Math.PI * 2 + (b % 2) * 0.25;
      const lean = 0.16 + (b % 3) * 0.08;
      const h = 0.42 + (b % 3) * 0.12;
      const w = 0.038;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const px = -sin * w;
      const pz = cos * w;
      const ox = cos * 0.05;
      const oz = sin * 0.05;
      const tipX = cos * lean + ox;
      const tipZ = sin * lean + oz;

      // Single tapered triangle blade
      positions.push(
        ox - px, 0, oz - pz,
        ox + px, 0, oz + pz,
        tipX, h, tipZ
      );
      normals.push(cos, 0.65, sin, cos, 0.65, sin, cos, 0.85, sin);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geo;
  };

  const grassGeo = buildGrassTuftGeo();
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
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
        float sway = sin(uTime * 1.9 + instPos.x * 0.35 + instPos.z * 0.28) * 0.09 * position.y;
        transformed.x += sway;
        transformed.z += sway * 0.55;`
      );
  };

  const clusterCount = 300;
  const tuftsPerCluster = 5;
  const totalTufts = clusterCount * tuftsPerCluster;
  const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, totalTufts);
  grassMesh.receiveShadow = true;

  let tuftIdx = 0;
  for (let c = 0; c < clusterCount; c++) {
    // Deterministic spiral distribution inland from the shoreline
    const ang = (c * 2.39996) % (Math.PI * 2);
    const rad = 16 + Math.sqrt(c / clusterCount) * 175;
    const cx = Math.cos(ang) * rad;
    const cz = Math.sin(ang) * rad * 0.65 + 62;
    const shore = shorelineZAt(cx);

    // Keep grass clusters above tidal wet sand
    const useZ = cz < shore + 12 ? shore + 14 + (c % 25) * 1.8 : cz;

    for (let t = 0; t < tuftsPerCluster; t++) {
      const subAng = (t / tuftsPerCluster) * Math.PI * 2 + c * 0.7;
      const subRad = 0.25 + ((c + t * 3) % 5) * 0.32;
      const gx = cx + Math.cos(subAng) * subRad;
      const gz = useZ + Math.sin(subAng) * subRad;
      const gy = groundHeightAt(gx, gz);

      const scale = 0.75 + ((c * 13 + t * 7) % 10) * 0.075;
      dummy.position.set(gx, gy - 0.03, gz);
      dummy.rotation.set(0, (c + t) * 1.4, 0);
      dummy.scale.set(scale, scale * (0.9 + (t % 3) * 0.14), scale);
      dummy.updateMatrix();
      grassMesh.setMatrixAt(tuftIdx, dummy.matrix);

      // Realistic muted coastal sedge / dry olive-ochre / sage tones (matching reference images)
      const variant = (c + t) % 3;
      if (variant === 0) {
        tint.setHex(0x636647);
      } else if (variant === 1) {
        tint.setHex(0x75714e);
      } else {
        tint.setHex(0x4e553d);
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

  const applyPreset = (presetId: AtmospherePresetId) => {
    currentBasePreset = presetId;
    const p = ATMOSPHERE_PRESETS[presetId];
    skyUniforms.uTopColor.value.setHex(p.skyTop);
    skyUniforms.uHorizonColor.value.setHex(p.skyHorizon);
    skyUniforms.uRainbowStrength.value = p.rainbowStrength;
    waterMat.color.setHex(p.waterDeep);
    if (waterMat.userData.shader) {
      waterMat.userData.shader.uniforms.uWaterShallow.value.setHex(p.waterShallow);
    }
  };

  const applyWeather = (weather: WeatherSnapshot) => {
    const p = ATMOSPHERE_PRESETS[currentBasePreset];
    weatherUniforms.uRainWetness.value = weather.rainWetness;
    weatherUniforms.uSnowAccumulation.value = weather.snowAccumulation;

    skyUniforms.uCloudCoverage.value = weather.cloudCoverage;
    skyUniforms.uStormDarkness.value = weather.rainWeight * 0.85 + weather.snowWeight * 0.18;
    skyUniforms.uClearShafts.value = weather.clearWeight;

    // Modulate base sky colors smoothly toward stormy slate (rain) or frosty pale mist (snow)
    const baseTop = new THREE.Color(p.skyTop);
    const baseHorizon = new THREE.Color(p.skyHorizon);
    const rainTop = new THREE.Color(0x4b5560);
    const rainHorizon = new THREE.Color(0x838d97);
    const snowTop = new THREE.Color(0xa6b2be);
    const snowHorizon = new THREE.Color(0xdde4ec);

    skyUniforms.uTopColor.value
      .copy(baseTop)
      .lerp(rainTop, weather.rainWeight * 0.78)
      .lerp(snowTop, weather.snowWeight * 0.62);
    skyUniforms.uHorizonColor.value
      .copy(baseHorizon)
      .lerp(rainHorizon, weather.rainWeight * 0.76)
      .lerp(snowHorizon, weather.snowWeight * 0.68);
    skyUniforms.uRainbowStrength.value =
      p.rainbowStrength * (1.0 - weather.snowWeight * 0.85);

    // Subtle ash particles thin out during heavy rain/snow
    pMat.opacity = 0.42 * (0.35 + weather.clearWeight * 0.65);
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

  const dispose = () => {
    disposables.forEach((d) => d.dispose());
  };

  return {
    group,
    colliders,
    skyUniforms,
    weatherUniforms,
    scanUniforms,
    waterMaterial: waterMat,
    triggerBoundaryImpact,
    applyPreset,
    applyWeather,
    update,
    dispose,
  };
}
