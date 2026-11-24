import * as THREE from 'three';
import { ProceduralTextureSet } from './materials';

export type WeatherKind = 'clear' | 'rainy' | 'snowy';
export type WeatherMode = 'auto' | WeatherKind;

export interface WeatherSnapshot {
  mode: WeatherMode;
  active: WeatherKind;
  target: WeatherKind;
  transitioning: boolean;
  clearWeight: number;
  rainWeight: number;
  snowWeight: number;
  rainWetness: number;
  snowAccumulation: number;
  cloudCoverage: number;
  fogMultiplier: number;
  windStrength: number;
}

export interface WeatherSystem {
  group: THREE.Group;
  setMode: (mode: WeatherMode) => void;
  getSnapshot: () => WeatherSnapshot;
  update: (
    delta: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    cameraPos: THREE.Vector3
  ) => WeatherSnapshot;
  dispose: () => void;
}

const AUTO_SEQUENCE: WeatherKind[] = ['clear', 'rainy', 'snowy'];
const AUTO_HOLD_SECONDS = 34;

export function createWeatherSystem(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): WeatherSystem {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  let mode: WeatherMode = 'auto';
  let activeWeather: WeatherKind = 'clear';
  let targetWeather: WeatherKind = 'clear';
  let autoIndex = 0;
  let autoTimer = 0;

  // Smoothly damped state weights (always normalized)
  let clearWeight = 1.0;
  let rainWeight = 0.0;
  let snowWeight = 0.0;

  // Persistent surface accumulation states (ramp up/down slower than precipitation)
  let rainWetness = 0.0;
  let snowAccumulation = 0.0;

  // 1. Procedural Volumetric Ground Fog / Cloud Mist Volumes
  const mistCount = isSoftwareGl ? 10 : 18;
  const mistGeo = new THREE.PlaneGeometry(34, 13);
  const mistUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0.14 },
    uMistColor: { value: new THREE.Color(0xcfd6de) },
    uLightColor: { value: new THREE.Color(0xf2f6fa) },
  };

  const mistMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: mistUniforms,
    vertexShader: `
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vUv = uv;
        #ifdef USE_INSTANCING
          vec4 instOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vSeed = fract(sin(dot(instOrigin.xz, vec2(12.9898, 78.233))) * 43758.5453);
          gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
        #else
          vSeed = 0.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #endif
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uMistColor;
      uniform vec3 uLightColor;
      varying vec2 vUv;
      varying float vSeed;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = p * 2.04 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 centered = (vUv - 0.5) * 2.0;
        float radial = 1.0 - smoothstep(0.25, 1.0, length(centered));
        float verticalSoft = smoothstep(0.0, 0.28, vUv.y) * (1.0 - smoothstep(0.65, 1.0, vUv.y));

        vec2 driftUv = vUv * vec2(2.6, 1.4) + vec2(uTime * 0.035 + vSeed * 10.0, vSeed * 4.0);
        float density = fbm(driftUv);
        float wisp = smoothstep(0.32, 0.82, density) * radial * verticalSoft;

        // Top-lit volumetric shading gradient
        vec3 col = mix(uMistColor * 0.82, uLightColor, vUv.y * 0.65 + density * 0.25);
        float alpha = wisp * uOpacity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const mistMesh = new THREE.InstancedMesh(mistGeo, mistMat, mistCount);
  mistMesh.frustumCulled = false;
  group.add(mistMesh);
  disposables.push(mistGeo, mistMat);

  const mistOffsets: { dx: number; dy: number; dz: number; scale: number; speed: number }[] = [];
  for (let i = 0; i < mistCount; i++) {
    const ang = (i / mistCount) * Math.PI * 2 + (i % 3) * 0.35;
    const rad = 14 + (i % 5) * 11;
    mistOffsets.push({
      dx: Math.cos(ang) * rad,
      dy: 2.2 + (i % 4) * 1.4,
      dz: Math.sin(ang) * rad,
      scale: 0.85 + (i % 4) * 0.28,
      speed: 0.6 + (i % 3) * 0.35,
    });
  }
  const mistDummy = new THREE.Object3D();

  // 2. Volumetric Rain Streaks (LineSegments with slanted wind shear)
  const rainCount = isSoftwareGl ? 420 : 1100;
  const rainSpan = 56;
  const rainHeight = 26;
  const rainPositions = new Float32Array(rainCount * 6);
  const rainFallSpeeds = new Float32Array(rainCount);
  const rainBaseXZ = new Float32Array(rainCount * 2);
  const rainBaseY = new Float32Array(rainCount);

  for (let i = 0; i < rainCount; i++) {
    const rx = (Math.random() - 0.5) * rainSpan;
    const ry = Math.random() * rainHeight;
    const rz = (Math.random() - 0.5) * rainSpan;
    rainBaseXZ[i * 2] = rx;
    rainBaseXZ[i * 2 + 1] = rz;
    rainBaseY[i] = ry;
    rainFallSpeeds[i] = 17.5 + Math.random() * 8.5;

    const idx = i * 6;
    rainPositions[idx] = rx;
    rainPositions[idx + 1] = ry;
    rainPositions[idx + 2] = rz;
    rainPositions[idx + 3] = rx + 0.14;
    rainPositions[idx + 4] = ry + 0.95;
    rainPositions[idx + 5] = rz + 0.08;
  }

  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMat = new THREE.LineBasicMaterial({
    color: 0xc2d0dc,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  rainLines.visible = false;
  group.add(rainLines);
  disposables.push(rainGeo, rainMat);

  // 3. Volumetric Swirling Snowflakes (Soft radial sprite Points)
  const snowCount = isSoftwareGl ? 360 : 920;
  const snowSpan = 58;
  const snowHeight = 24;
  const snowPositions = new Float32Array(snowCount * 3);
  const snowSpeeds = new Float32Array(snowCount);
  const snowPhases = new Float32Array(snowCount);

  for (let i = 0; i < snowCount; i++) {
    snowPositions[i * 3] = (Math.random() - 0.5) * snowSpan;
    snowPositions[i * 3 + 1] = Math.random() * snowHeight;
    snowPositions[i * 3 + 2] = (Math.random() - 0.5) * snowSpan;
    snowSpeeds[i] = 1.6 + Math.random() * 1.4;
    snowPhases[i] = Math.random() * Math.PI * 2;
  }

  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
  const snowMat = new THREE.PointsMaterial({
    map: textures.particleMap,
    color: 0xf4f8fc,
    size: 0.3,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const snowPoints = new THREE.Points(snowGeo, snowMat);
  snowPoints.frustumCulled = false;
  snowPoints.visible = false;
  group.add(snowPoints);
  disposables.push(snowGeo, snowMat);

  const setMode = (nextMode: WeatherMode) => {
    mode = nextMode;
    if (nextMode !== 'auto') {
      targetWeather = nextMode;
    } else {
      autoTimer = 0;
      autoIndex = AUTO_SEQUENCE.indexOf(targetWeather);
      if (autoIndex < 0) autoIndex = 0;
    }
  };

  const buildSnapshot = (): WeatherSnapshot => {
    const dominantWeight = Math.max(clearWeight, rainWeight, snowWeight);
    activeWeather =
      dominantWeight === rainWeight
        ? 'rainy'
        : dominantWeight === snowWeight
          ? 'snowy'
          : 'clear';

    const targetWeight =
      targetWeather === 'rainy'
        ? rainWeight
        : targetWeather === 'snowy'
          ? snowWeight
          : clearWeight;

    const cloudCoverage =
      clearWeight * 0.36 + rainWeight * 0.9 + snowWeight * 0.82;
    const fogMultiplier =
      clearWeight * 0.72 + rainWeight * 1.65 + snowWeight * 1.48;
    const windStrength =
      clearWeight * 0.35 + rainWeight * 1.0 + snowWeight * 0.68;

    return {
      mode,
      active: activeWeather,
      target: targetWeather,
      transitioning: targetWeight < 0.94,
      clearWeight,
      rainWeight,
      snowWeight,
      rainWetness,
      snowAccumulation,
      cloudCoverage,
      fogMultiplier,
      windStrength,
    };
  };

  const update = (
    delta: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    cameraPos: THREE.Vector3
  ): WeatherSnapshot => {
    const dt = Math.min(delta, 0.05);

    if (mode === 'auto') {
      autoTimer += dt;
      if (autoTimer >= AUTO_HOLD_SECONDS) {
        autoTimer = 0;
        autoIndex = (autoIndex + 1) % AUTO_SEQUENCE.length;
        targetWeather = AUTO_SEQUENCE[autoIndex];
      }
    }

    const tClear = targetWeather === 'clear' ? 1 : 0;
    const tRain = targetWeather === 'rainy' ? 1 : 0;
    const tSnow = targetWeather === 'snowy' ? 1 : 0;

    // Smooth ~6-second cross-fade between weather states
    const blendRate = 0.55;
    clearWeight = THREE.MathUtils.damp(clearWeight, tClear, blendRate, dt);
    rainWeight = THREE.MathUtils.damp(rainWeight, tRain, blendRate, dt);
    snowWeight = THREE.MathUtils.damp(snowWeight, tSnow, blendRate, dt);

    const sum = clearWeight + rainWeight + snowWeight || 1;
    clearWeight /= sum;
    rainWeight /= sum;
    snowWeight /= sum;

    // Surface wetness & snow accumulation lag smoothly behind weather transitions
    const wetnessTarget = rainWeight > 0.25 ? rainWeight : 0;
    rainWetness = THREE.MathUtils.damp(
      rainWetness,
      wetnessTarget,
      wetnessTarget > rainWetness ? 0.32 : 0.16,
      dt
    );

    const snowTarget = snowWeight > 0.25 ? snowWeight : 0;
    snowAccumulation = THREE.MathUtils.damp(
      snowAccumulation,
      snowTarget,
      snowTarget > snowAccumulation ? 0.22 : 0.14,
      dt
    );

    // Update Volumetric Ground Mist Volumes (billboarded softly toward camera)
    mistUniforms.uTime.value = elapsed;
    mistUniforms.uOpacity.value =
      clearWeight * 0.09 + rainWeight * 0.34 + snowWeight * 0.30;
    mistUniforms.uMistColor.value.setRGB(
      clearWeight * 0.78 + rainWeight * 0.56 + snowWeight * 0.84,
      clearWeight * 0.82 + rainWeight * 0.61 + snowWeight * 0.87,
      clearWeight * 0.86 + rainWeight * 0.66 + snowWeight * 0.91
    );

    const yawToCam = Math.atan2(
      cameraPos.x - playerPos.x,
      cameraPos.z - playerPos.z
    );

    for (let i = 0; i < mistCount; i++) {
      const m = mistOffsets[i];
      const driftX = ((elapsed * m.speed + i * 7.3) % 70) - 35;
      const wx = playerPos.x + m.dx * 0.65 + driftX * 0.35;
      const wz = playerPos.z + m.dz * 0.65;
      const wy = playerPos.y + m.dy + Math.sin(elapsed * 0.35 + i) * 0.45;
      mistDummy.position.set(wx, wy, wz);
      mistDummy.rotation.set(0, yawToCam + Math.sin(i) * 0.25, 0);
      const s = m.scale * (0.9 + rainWeight * 0.28 + snowWeight * 0.22);
      mistDummy.scale.set(s, s, 1);
      mistDummy.updateMatrix();
      mistMesh.setMatrixAt(i, mistDummy.matrix);
    }
    mistMesh.instanceMatrix.needsUpdate = true;

    // Update Rain Streaks
    if (rainWeight > 0.02) {
      rainLines.visible = true;
      rainMat.opacity = THREE.MathUtils.clamp(rainWeight * 0.44, 0, 0.48);

      const arr = rainGeo.attributes.position.array as Float32Array;
      const windX = 2.6 + Math.sin(elapsed * 0.7) * 0.9;
      const windZ = 1.4;
      const halfSpan = rainSpan * 0.5;

      for (let i = 0; i < rainCount; i++) {
        let bx = rainBaseXZ[i * 2] + windX * dt;
        let bz = rainBaseXZ[i * 2 + 1] + windZ * dt;
        let by = rainBaseY[i] - rainFallSpeeds[i] * dt;

        if (by < -1.0) by += rainHeight + 1.0;
        if (bx - playerPos.x > halfSpan) bx -= rainSpan;
        if (bx - playerPos.x < -halfSpan) bx += rainSpan;
        if (bz - playerPos.z > halfSpan) bz -= rainSpan;
        if (bz - playerPos.z < -halfSpan) bz += rainSpan;

        rainBaseXZ[i * 2] = bx;
        rainBaseXZ[i * 2 + 1] = bz;
        rainBaseY[i] = by;

        const wy = playerPos.y - 2.0 + by;
        const idx = i * 6;
        arr[idx] = bx;
        arr[idx + 1] = wy;
        arr[idx + 2] = bz;
        arr[idx + 3] = bx - windX * 0.048;
        arr[idx + 4] = wy + 1.05;
        arr[idx + 5] = bz - windZ * 0.048;
      }
      rainGeo.attributes.position.needsUpdate = true;
    } else {
      rainLines.visible = false;
    }

    // Update Snowflakes
    if (snowWeight > 0.02) {
      snowPoints.visible = true;
      snowMat.opacity = THREE.MathUtils.clamp(snowWeight * 0.78, 0, 0.82);

      const sArr = snowGeo.attributes.position.array as Float32Array;
      const halfSnow = snowSpan * 0.5;
      for (let i = 0; i < snowCount; i++) {
        const idx = i * 3;
        const ph = snowPhases[i];
        sArr[idx] += (Math.sin(elapsed * 1.15 + ph) * 1.4 + 1.1) * dt;
        sArr[idx + 1] -= snowSpeeds[i] * dt;
        sArr[idx + 2] += (Math.cos(elapsed * 0.95 + ph) * 1.1 + 0.65) * dt;

        if (sArr[idx + 1] < playerPos.y - 2.0) {
          sArr[idx + 1] = playerPos.y + snowHeight - 2.0;
        }
        if (sArr[idx] - playerPos.x > halfSnow) sArr[idx] -= snowSpan;
        if (sArr[idx] - playerPos.x < -halfSnow) sArr[idx] += snowSpan;
        if (sArr[idx + 2] - playerPos.z > halfSnow) sArr[idx + 2] -= snowSpan;
        if (sArr[idx + 2] - playerPos.z < -halfSnow) sArr[idx + 2] += snowSpan;
      }
      snowGeo.attributes.position.needsUpdate = true;
    } else {
      snowPoints.visible = false;
    }

    return buildSnapshot();
  };

  const dispose = () => {
    disposables.forEach((d) => d.dispose());
  };

  return {
    group,
    setMode,
    getSnapshot: buildSnapshot,
    update,
    dispose,
  };
}
