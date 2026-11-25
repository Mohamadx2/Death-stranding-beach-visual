import * as THREE from 'three';

export type AtmospherePresetId = 'ash' | 'storm' | 'dawn';

export interface AtmospherePreset {
  id: AtmospherePresetId;
  label: string;
  skyTop: number;
  skyHorizon: number;
  fogColor: number;
  fogDensity: number;
  keyColor: number;
  keyIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  waterDeep: number;
  waterShallow: number;
  exposure: number;
  rainbowStrength: number;
}

export const ATMOSPHERE_PRESETS: Record<AtmospherePresetId, AtmospherePreset> = {
  ash: {
    id: 'ash',
    label: 'Overcast Clouds',
    skyTop: 0x9aa4ae,
    skyHorizon: 0xd8dee4,
    fogColor: 0xc8cfd6,
    fogDensity: 0.0046,
    keyColor: 0xf2f6fa,
    keyIntensity: 2.35,
    hemiSky: 0xdce3ea,
    hemiGround: 0x1b1f24,
    hemiIntensity: 1.45,
    waterDeep: 0x1a2026,
    waterShallow: 0x2b343c,
    exposure: 1.15,
    rainbowStrength: 0.14,
  },
  storm: {
    id: 'storm',
    label: 'Coastal Squall',
    skyTop: 0x5c6670,
    skyHorizon: 0x96a0aa,
    fogColor: 0x89939d,
    fogDensity: 0.0072,
    keyColor: 0xdce4ec,
    keyIntensity: 1.85,
    hemiSky: 0xaab4bf,
    hemiGround: 0x14171c,
    hemiIntensity: 1.2,
    waterDeep: 0x12171c,
    waterShallow: 0x202931,
    exposure: 1.08,
    rainbowStrength: 0.35,
  },
  dawn: {
    id: 'dawn',
    label: 'Bright Mist',
    skyTop: 0xb0bac4,
    skyHorizon: 0xe6eaee,
    fogColor: 0xd9dfe4,
    fogDensity: 0.0042,
    keyColor: 0xfff8ee,
    keyIntensity: 2.5,
    hemiSky: 0xe8edf2,
    hemiGround: 0x22262b,
    hemiIntensity: 1.55,
    waterDeep: 0x222930,
    waterShallow: 0x37414a,
    exposure: 1.18,
    rainbowStrength: 0.08,
  },
};

export function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface ProceduralTextureSet {
  sandAlbedo: THREE.CanvasTexture;
  sandNormal: THREE.CanvasTexture;
  mossAlbedo: THREE.CanvasTexture;
  mossNormal: THREE.CanvasTexture;
  cobbleAlbedo: THREE.CanvasTexture;
  cobbleNormal: THREE.CanvasTexture;
  desertRockAlbedo: THREE.CanvasTexture;
  desertRockNormal: THREE.CanvasTexture;
  rockAlbedo: THREE.CanvasTexture;
  rockNormal: THREE.CanvasTexture;
  dirtRoadAlbedo: THREE.CanvasTexture;
  woodAlbedo: THREE.CanvasTexture;
  cargoResinMap: THREE.CanvasTexture;
  cargoBridgesMap: THREE.CanvasTexture;
  fabricMap: THREE.CanvasTexture;
  footprintMap: THREE.CanvasTexture;
  particleMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const rand = seededRand(4207);

  // 1. Volcanic Black Sand Albedo + Height/Normal
  const sandSize = 512;
  const sandCanvas = document.createElement('canvas');
  sandCanvas.width = sandSize;
  sandCanvas.height = sandSize;
  const sCtx = sandCanvas.getContext('2d')!;

  sCtx.fillStyle = '#1d2024';
  sCtx.fillRect(0, 0, sandSize, sandSize);

  // Subtle ripple bands
  for (let y = 0; y < sandSize; y += 2) {
    const wave = Math.sin((y / sandSize) * Math.PI * 12) * 6;
    sCtx.fillStyle = `rgba(38, 42, 48, ${0.06 + 0.04 * Math.sin(y * 0.2)})`;
    sCtx.fillRect(0, y + wave * 0.2, sandSize, 1.5);
  }

  // Basalt mineral grains + occasional obsidian/quartz flecks
  const imgData = sCtx.getImageData(0, 0, sandSize, sandSize);
  const data = imgData.data;
  const heightField = new Float32Array(sandSize * sandSize);

  for (let i = 0; i < sandSize * sandSize; i++) {
    const n = rand();
    const x = i % sandSize;
    const y = Math.floor(i / sandSize);
    const ripple = Math.sin(y * 0.14 + Math.sin(x * 0.04) * 2.2) * 0.5 + 0.5;
    const grain = (n - 0.5) * 24;
    const sparkle = n > 0.992 ? 32 : 0;
    const base = 26 + ripple * 8 + grain + sparkle;

    const idx = i * 4;
    data[idx] = THREE.MathUtils.clamp(base, 8, 90);
    data[idx + 1] = THREE.MathUtils.clamp(base + 1, 9, 92);
    data[idx + 2] = THREE.MathUtils.clamp(base + 4, 11, 98);
    data[idx + 3] = 255;

    heightField[i] = ripple * 0.45 + n * 0.55;
  }
  sCtx.putImageData(imgData, 0, 0);

  const sandAlbedo = new THREE.CanvasTexture(sandCanvas);
  sandAlbedo.colorSpace = THREE.SRGBColorSpace;
  sandAlbedo.wrapS = THREE.RepeatWrapping;
  sandAlbedo.wrapT = THREE.RepeatWrapping;
  sandAlbedo.repeat.set(36, 36);
  sandAlbedo.anisotropy = maxAnisotropy;

  // Sand Normal Map from heightField
  const sandNormCanvas = document.createElement('canvas');
  sandNormCanvas.width = sandSize;
  sandNormCanvas.height = sandSize;
  const snCtx = sandNormCanvas.getContext('2d')!;
  const snImg = snCtx.createImageData(sandSize, sandSize);
  const snData = snImg.data;
  const strength = 2.6;
  for (let y = 0; y < sandSize; y++) {
    for (let x = 0; x < sandSize; x++) {
      const xl = (x - 1 + sandSize) % sandSize;
      const xr = (x + 1) % sandSize;
      const yu = (y - 1 + sandSize) % sandSize;
      const yd = (y + 1) % sandSize;
      const dx = (heightField[y * sandSize + xr] - heightField[y * sandSize + xl]) * strength;
      const dy = (heightField[yd * sandSize + x] - heightField[yu * sandSize + x]) * strength;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, nz);
      const idx = (y * sandSize + x) * 4;
      snData[idx] = ((-dx * invLen) * 0.5 + 0.5) * 255;
      snData[idx + 1] = ((-dy * invLen) * 0.5 + 0.5) * 255;
      snData[idx + 2] = ((nz * invLen) * 0.5 + 0.5) * 255;
      snData[idx + 3] = 255;
    }
  }
  snCtx.putImageData(snImg, 0, 0);

  const sandNormal = new THREE.CanvasTexture(sandNormCanvas);
  sandNormal.wrapS = THREE.RepeatWrapping;
  sandNormal.wrapT = THREE.RepeatWrapping;
  sandNormal.repeat.set(36, 36);
  sandNormal.anisotropy = maxAnisotropy;

  // 2. Fractured Dark Basalt Cliff Rock Albedo + Normal (512x512, matching Reference Image 1)
  const rockSize = 512;
  const rockCanvas = document.createElement('canvas');
  rockCanvas.width = rockSize;
  rockCanvas.height = rockSize;
  const rCtx = rockCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(rockSize, rockSize);
  const rockHeights = new Float32Array(rockSize * rockSize);

  for (let y = 0; y < rockSize; y++) {
    for (let x = 0; x < rockSize; x++) {
      const i = y * rockSize + x;
      const n = rand();
      const warp = Math.sin(x * 0.035 + y * 0.025) * 3.5 + Math.cos(x * 0.07 - y * 0.05) * 1.8;
      const strata =
        Math.sin(y * 0.11 + warp) * 0.38 +
        Math.cos(x * 0.065 + y * 0.045) * 0.28 +
        Math.sin((x + y) * 0.15) * 0.14;
      const crack =
        Math.abs(Math.sin(y * 0.08 + warp * 0.7)) < 0.08 ||
        Math.abs(Math.sin(x * 0.09 - y * 0.06 + warp * 0.5)) < 0.055
          ? -0.45
          : 0;
      const grit = (n - 0.5) * 0.28;
      const hVal = 0.5 + strata * 0.34 + crack + grit;
      rockHeights[i] = hVal;

      // Craggy charcoal-slate basalt with pale weathered mineral edges & tiny moss crevices
      const mossCrevice = crack < -0.2 && n > 0.65 ? 1 : 0;
      const shade = THREE.MathUtils.clamp(52 + strata * 26 + grit * 28 + crack * 38, 16, 118);
      const idx = i * 4;
      rImg.data[idx] = mossCrevice ? shade * 0.85 : shade;
      rImg.data[idx + 1] = mossCrevice ? shade * 1.18 : shade + 2;
      rImg.data[idx + 2] = mossCrevice ? shade * 0.65 : shade + 5;
      rImg.data[idx + 3] = 255;
    }
  }
  rCtx.putImageData(rImg, 0, 0);
  const rockAlbedo = new THREE.CanvasTexture(rockCanvas);
  rockAlbedo.colorSpace = THREE.SRGBColorSpace;
  rockAlbedo.wrapS = THREE.RepeatWrapping;
  rockAlbedo.wrapT = THREE.RepeatWrapping;
  rockAlbedo.repeat.set(2, 2);
  rockAlbedo.anisotropy = maxAnisotropy;

  const rockNormCanvas = document.createElement('canvas');
  rockNormCanvas.width = rockSize;
  rockNormCanvas.height = rockSize;
  const rnCtx = rockNormCanvas.getContext('2d')!;
  const rnImg = rnCtx.createImageData(rockSize, rockSize);
  for (let y = 0; y < rockSize; y++) {
    for (let x = 0; x < rockSize; x++) {
      const xl = (x - 1 + rockSize) % rockSize;
      const xr = (x + 1) % rockSize;
      const yu = (y - 1 + rockSize) % rockSize;
      const yd = (y + 1) % rockSize;
      const dx = (rockHeights[y * rockSize + xr] - rockHeights[y * rockSize + xl]) * 4.4;
      const dy = (rockHeights[yd * rockSize + x] - rockHeights[yu * rockSize + x]) * 4.4;
      const invLen = 1 / Math.hypot(dx, dy, 1.0);
      const idx = (y * rockSize + x) * 4;
      rnImg.data[idx] = ((-dx * invLen) * 0.5 + 0.5) * 255;
      rnImg.data[idx + 1] = ((-dy * invLen) * 0.5 + 0.5) * 255;
      rnImg.data[idx + 2] = (invLen * 0.5 + 0.5) * 255;
      rnImg.data[idx + 3] = 255;
    }
  }
  rnCtx.putImageData(rnImg, 0, 0);
  const rockNormal = new THREE.CanvasTexture(rockNormCanvas);
  rockNormal.wrapS = THREE.RepeatWrapping;
  rockNormal.wrapT = THREE.RepeatWrapping;
  rockNormal.repeat.set(2, 2);
  rockNormal.anisotropy = maxAnisotropy;

  // 3. Technical Ripstop Fabric Texture for Jacket
  const fabCanvas = document.createElement('canvas');
  fabCanvas.width = 128;
  fabCanvas.height = 128;
  const fCtx = fabCanvas.getContext('2d')!;
  fCtx.fillStyle = '#243442';
  fCtx.fillRect(0, 0, 128, 128);
  fCtx.strokeStyle = 'rgba(255,255,255,0.06)';
  fCtx.lineWidth = 1;
  for (let i = 0; i < 128; i += 8) {
    fCtx.beginPath();
    fCtx.moveTo(i, 0);
    fCtx.lineTo(i, 128);
    fCtx.stroke();
    fCtx.beginPath();
    fCtx.moveTo(0, i);
    fCtx.lineTo(128, i);
    fCtx.stroke();
  }
  const fabricMap = new THREE.CanvasTexture(fabCanvas);
  fabricMap.colorSpace = THREE.SRGBColorSpace;
  fabricMap.wrapS = THREE.RepeatWrapping;
  fabricMap.wrapT = THREE.RepeatWrapping;
  fabricMap.repeat.set(4, 4);

  // 4. Boot Footprint Impression Texture (transparent PNG-like canvas)
  const fpCanvas = document.createElement('canvas');
  fpCanvas.width = 128;
  fpCanvas.height = 256;
  const fpCtx = fpCanvas.getContext('2d')!;
  fpCtx.clearRect(0, 0, 128, 256);

  // Outer rim slightly darker wet ring, depressed sole core
  const drawSole = (cx: number, cy: number, rx: number, ry: number) => {
    const grad = fpCtx.createRadialGradient(cx, cy, 4, cx, cy, Math.max(rx, ry));
    grad.addColorStop(0, 'rgba(5, 7, 9, 0.85)');
    grad.addColorStop(0.75, 'rgba(8, 10, 13, 0.6)');
    grad.addColorStop(1, 'rgba(10, 12, 16, 0.0)');
    fpCtx.fillStyle = grad;
    fpCtx.beginPath();
    fpCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    fpCtx.fill();
  };
  drawSole(64, 82, 34, 58); // Forefoot
  drawSole(64, 188, 28, 36); // Heel

  // Boot tread ribs
  fpCtx.fillStyle = 'rgba(2, 3, 5, 0.5)';
  for (let y = 42; y <= 122; y += 16) {
    fpCtx.fillRect(36, y, 56, 5);
  }
  const footprintMap = new THREE.CanvasTexture(fpCanvas);
  footprintMap.colorSpace = THREE.SRGBColorSpace;

  // 5. Soft Ash / Mist Particle Sprite
  const pCanvas = document.createElement('canvas');
  pCanvas.width = 64;
  pCanvas.height = 64;
  const pCtx = pCanvas.getContext('2d')!;
  const pGrad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  pGrad.addColorStop(0, 'rgba(235, 240, 245, 0.95)');
  pGrad.addColorStop(0.45, 'rgba(200, 210, 220, 0.45)');
  pGrad.addColorStop(1, 'rgba(180, 190, 200, 0)');
  pCtx.fillStyle = pGrad;
  pCtx.fillRect(0, 0, 64, 64);
  const particleMap = new THREE.CanvasTexture(pCanvas);
  particleMap.colorSpace = THREE.SRGBColorSpace;

  // 6. Lush Highland Moss, Grass Turf & Lichen Soil Texture + Normal (512x512, matching Reference Images 1 & 2)
  const mossSize = 512;
  const mossCanvas = document.createElement('canvas');
  mossCanvas.width = mossSize;
  mossCanvas.height = mossSize;
  const mCtx = mossCanvas.getContext('2d')!;
  const mImg = mCtx.createImageData(mossSize, mossSize);
  const mossHeights = new Float32Array(mossSize * mossSize);

  for (let y = 0; y < mossSize; y++) {
    for (let x = 0; x < mossSize; x++) {
      const i = y * mossSize + x;
      const n = rand();
      const pillow =
        Math.sin(x * 0.055 + Math.cos(y * 0.04) * 1.6) *
          Math.cos(y * 0.055 + Math.sin(x * 0.04) * 1.6) *
          0.5 +
        0.5;
      const clump = Math.sin(x * 0.16 + y * 0.13) * Math.cos(x * 0.12 - y * 0.18) * 0.5 + 0.5;
      const tuft = n > 0.78 ? 0.35 : n < 0.16 ? -0.3 : (n - 0.5) * 0.42;
      mossHeights[i] = pillow * 0.45 + clump * 0.3 + tuft * 0.25;

      // Rich olive-moss & emerald-fern canopy with subtle golden-ochre lichen specks
      const isGoldenSpeck = n > 0.988;
      const isDarkPeat = pillow < 0.24 && n < 0.38;

      let r = 56 + pillow * 34 + clump * 16 + tuft * 26;
      let g = 74 + pillow * 44 + clump * 22 + tuft * 34;
      let b = 29 + pillow * 16 + clump * 8 + tuft * 14;

      if (isGoldenSpeck) {
        r = 158;
        g = 152;
        b = 64;
      } else if (isDarkPeat) {
        r *= 0.68;
        g *= 0.65;
        b *= 0.72;
      }

      const idx = i * 4;
      mImg.data[idx] = THREE.MathUtils.clamp(r, 24, 178);
      mImg.data[idx + 1] = THREE.MathUtils.clamp(g, 32, 190);
      mImg.data[idx + 2] = THREE.MathUtils.clamp(b, 16, 110);
      mImg.data[idx + 3] = 255;
    }
  }
  mCtx.putImageData(mImg, 0, 0);
  const mossAlbedo = new THREE.CanvasTexture(mossCanvas);
  mossAlbedo.colorSpace = THREE.SRGBColorSpace;
  mossAlbedo.wrapS = THREE.RepeatWrapping;
  mossAlbedo.wrapT = THREE.RepeatWrapping;
  mossAlbedo.repeat.set(36, 36);
  mossAlbedo.anisotropy = maxAnisotropy;

  const mossNormCanvas = document.createElement('canvas');
  mossNormCanvas.width = mossSize;
  mossNormCanvas.height = mossSize;
  const mnCtx = mossNormCanvas.getContext('2d')!;
  const mnImg = mnCtx.createImageData(mossSize, mossSize);
  for (let y = 0; y < mossSize; y++) {
    for (let x = 0; x < mossSize; x++) {
      const xl = (x - 1 + mossSize) % mossSize;
      const xr = (x + 1) % mossSize;
      const yu = (y - 1 + mossSize) % mossSize;
      const yd = (y + 1) % mossSize;
      const dx = (mossHeights[y * mossSize + xr] - mossHeights[y * mossSize + xl]) * 3.8;
      const dy = (mossHeights[yd * mossSize + x] - mossHeights[yu * mossSize + x]) * 3.8;
      const invLen = 1 / Math.hypot(dx, dy, 1.0);
      const idx = (y * mossSize + x) * 4;
      mnImg.data[idx] = ((-dx * invLen) * 0.5 + 0.5) * 255;
      mnImg.data[idx + 1] = ((-dy * invLen) * 0.5 + 0.5) * 255;
      mnImg.data[idx + 2] = (invLen * 0.5 + 0.5) * 255;
      mnImg.data[idx + 3] = 255;
    }
  }
  mnCtx.putImageData(mnImg, 0, 0);
  const mossNormal = new THREE.CanvasTexture(mossNormCanvas);
  mossNormal.wrapS = THREE.RepeatWrapping;
  mossNormal.wrapT = THREE.RepeatWrapping;
  mossNormal.repeat.set(36, 36);
  mossNormal.anisotropy = maxAnisotropy;

  // 6b. Wet River Cobbles, Crevice Moss & Fallen Leaf Litter (512x512, matching Reference Image 3)
  const cobSize = 512;
  const cobCanvas = document.createElement('canvas');
  cobCanvas.width = cobSize;
  cobCanvas.height = cobSize;
  const cCtx = cobCanvas.getContext('2d')!;
  const cobHeight = new Float32Array(cobSize * cobSize);

  // Damp sandy-mossy earth mortar base
  cCtx.fillStyle = '#3b4229';
  cCtx.fillRect(0, 0, cobSize, cobSize);

  // Generate tileable Worley-cell stones for authentic packed wet stones
  const stoneSites: { x: number; y: number; r: number; g: number; b: number; size: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const tone = rand();
    let r = 86;
    let g = 88;
    let b = 85;
    if (tone < 0.3) {
      // Dark wet basalt slate
      r = 46 + rand() * 20;
      g = 52 + rand() * 20;
      b = 58 + rand() * 22;
    } else if (tone < 0.68) {
      // Pale weathered river granite
      r = 112 + rand() * 28;
      g = 110 + rand() * 24;
      b = 102 + rand() * 22;
    } else {
      // Warm sandstone-ochre cobble
      r = 118 + rand() * 26;
      g = 102 + rand() * 20;
      b = 80 + rand() * 18;
    }
    stoneSites.push({
      x: rand() * cobSize,
      y: rand() * cobSize,
      r,
      g,
      b,
      size: 0.85 + rand() * 0.45,
    });
  }

  const cobImg = cCtx.getImageData(0, 0, cobSize, cobSize);
  const cData = cobImg.data;
  for (let y = 0; y < cobSize; y++) {
    for (let x = 0; x < cobSize; x++) {
      let minD1 = 1e9;
      let minD2 = 1e9;
      let bestSite = stoneSites[0];

      for (let s = 0; s < stoneSites.length; s++) {
        const site = stoneSites[s];
        let dx = Math.abs(x - site.x);
        let dy = Math.abs(y - site.y);
        if (dx > cobSize * 0.5) dx = cobSize - dx;
        if (dy > cobSize * 0.5) dy = cobSize - dy;
        const d = Math.hypot(dx, dy) / site.size;
        if (d < minD1) {
          minD2 = minD1;
          minD1 = d;
          bestSite = site;
        } else if (d < minD2) {
          minD2 = d;
        }
      }

      const borderDist = minD2 - minD1;
      const stoneMask = THREE.MathUtils.smoothstep(borderDist, 2.2, 11.5);
      const n = rand();
      const speckle = (n - 0.5) * 20;
      const dome = Math.sqrt(Math.max(0, 1 - Math.min(1, minD1 / 48) ** 2));

      const i = y * cobSize + x;
      cobHeight[i] = stoneMask * (0.45 + dome * 0.55) + (n - 0.5) * 0.08;

      // Smoothly blend vibrant moss/leaf sprigs & russet leaf litter in stone crevices
      const creviceGreen = 1.0 - stoneMask;
      const leafWave =
        Math.sin(x * 0.12 + y * 0.08 + Math.cos(x * 0.05) * 1.4) *
        Math.cos(x * 0.07 - y * 0.13);
      const greenShootT =
        THREE.MathUtils.smoothstep(creviceGreen, 0.28, 0.72) *
        THREE.MathUtils.smoothstep(-0.05, 0.42, leafWave);
      const russetLeafT =
        THREE.MathUtils.smoothstep(creviceGreen, 0.35, 0.80) *
        THREE.MathUtils.smoothstep(-0.28, -0.68, leafWave);

      let r = bestSite.r * (0.76 + dome * 0.34) + speckle * 0.7;
      let g = bestSite.g * (0.76 + dome * 0.34) + speckle * 0.7;
      let b = bestSite.b * (0.76 + dome * 0.34) + speckle * 0.7;

      const mortarT = THREE.MathUtils.smoothstep(creviceGreen, 0.15, 0.75);
      r = THREE.MathUtils.lerp(r, 54 + speckle * 0.5, mortarT * 0.8);
      g = THREE.MathUtils.lerp(g, 68 + speckle * 0.5, mortarT * 0.8);
      b = THREE.MathUtils.lerp(b, 36 + speckle * 0.5, mortarT * 0.8);

      r = THREE.MathUtils.lerp(r, 74 + n * 24, greenShootT * 0.88);
      g = THREE.MathUtils.lerp(g, 114 + n * 32, greenShootT * 0.88);
      b = THREE.MathUtils.lerp(b, 34 + n * 14, greenShootT * 0.88);

      r = THREE.MathUtils.lerp(r, 112 + n * 20, russetLeafT * 0.75);
      g = THREE.MathUtils.lerp(g, 60 + n * 14, russetLeafT * 0.75);
      b = THREE.MathUtils.lerp(b, 40 + n * 10, russetLeafT * 0.75);

      const idx = i * 4;
      cData[idx] = THREE.MathUtils.clamp(r, 18, 210);
      cData[idx + 1] = THREE.MathUtils.clamp(g, 20, 210);
      cData[idx + 2] = THREE.MathUtils.clamp(b, 16, 195);
      cData[idx + 3] = 255;
    }
  }
  cCtx.putImageData(cobImg, 0, 0);

  const cobbleAlbedo = new THREE.CanvasTexture(cobCanvas);
  cobbleAlbedo.colorSpace = THREE.SRGBColorSpace;
  cobbleAlbedo.wrapS = THREE.RepeatWrapping;
  cobbleAlbedo.wrapT = THREE.RepeatWrapping;
  cobbleAlbedo.repeat.set(2, 2);
  cobbleAlbedo.anisotropy = maxAnisotropy;

  const cobNormCanvas = document.createElement('canvas');
  cobNormCanvas.width = cobSize;
  cobNormCanvas.height = cobSize;
  const cnCtx = cobNormCanvas.getContext('2d')!;
  const cnImg = cnCtx.createImageData(cobSize, cobSize);
  for (let y = 0; y < cobSize; y++) {
    for (let x = 0; x < cobSize; x++) {
      const xl = (x - 1 + cobSize) % cobSize;
      const xr = (x + 1) % cobSize;
      const yu = (y - 1 + cobSize) % cobSize;
      const yd = (y + 1) % cobSize;
      const dx = (cobHeight[y * cobSize + xr] - cobHeight[y * cobSize + xl]) * 4.2;
      const dy = (cobHeight[yd * cobSize + x] - cobHeight[yu * cobSize + x]) * 4.2;
      const invLen = 1 / Math.hypot(dx, dy, 1.0);
      const idx = (y * cobSize + x) * 4;
      cnImg.data[idx] = ((-dx * invLen) * 0.5 + 0.5) * 255;
      cnImg.data[idx + 1] = ((-dy * invLen) * 0.5 + 0.5) * 255;
      cnImg.data[idx + 2] = (invLen * 0.5 + 0.5) * 255;
      cnImg.data[idx + 3] = 255;
    }
  }
  cnCtx.putImageData(cnImg, 0, 0);
  const cobbleNormal = new THREE.CanvasTexture(cobNormCanvas);
  cobbleNormal.wrapS = THREE.RepeatWrapping;
  cobbleNormal.wrapT = THREE.RepeatWrapping;
  cobbleNormal.repeat.set(2, 2);
  cobbleNormal.anisotropy = maxAnisotropy;

  // 7. Weathered Coastal Timber Plank Texture (for Wooden Delivery Post)
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 256;
  woodCanvas.height = 256;
  const wCtx = woodCanvas.getContext('2d')!;
  wCtx.fillStyle = '#5c4b3b';
  wCtx.fillRect(0, 0, 256, 256);
  for (let plank = 0; plank < 4; plank++) {
    const py = plank * 64;
    const shade = 78 + (plank % 2) * 10;
    wCtx.fillStyle = `rgb(${shade + 14}, ${shade}, ${shade - 16})`;
    wCtx.fillRect(0, py + 2, 256, 60);
    wCtx.fillStyle = 'rgba(20, 15, 10, 0.55)';
    wCtx.fillRect(0, py, 256, 2);
    for (let g = 0; g < 14; g++) {
      wCtx.fillStyle = `rgba(38, 28, 18, ${0.12 + rand() * 0.16})`;
      wCtx.fillRect(0, py + 4 + rand() * 54, 256, 1.5);
    }
  }
  const woodAlbedo = new THREE.CanvasTexture(woodCanvas);
  woodAlbedo.colorSpace = THREE.SRGBColorSpace;
  woodAlbedo.wrapS = THREE.RepeatWrapping;
  woodAlbedo.wrapT = THREE.RepeatWrapping;
  woodAlbedo.anisotropy = maxAnisotropy;

  // Helper to paint chiral handprint & "VOID IF TAMPERED" tape onto cargo textures
  const drawHandprint = (ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, rot: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(12, 13, 15, 0.78)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 16, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    const fingers = [
      { x: -18, y: -4, r: -0.45, l: 18 },
      { x: -10, y: -18, r: -0.18, l: 24 },
      { x: 0, y: -21, r: 0, l: 26 },
      { x: 10, y: -17, r: 0.18, l: 23 },
      { x: 18, y: -10, r: 0.42, l: 17 },
    ];
    for (const f of fingers) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.r);
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.6, f.l * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  const drawTapeStrip = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vertical: boolean) => {
    ctx.save();
    ctx.fillStyle = '#d7df22';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#181a14';
    ctx.font = 'bold 18px monospace';
    if (vertical) {
      ctx.translate(x + w * 0.65, y + 18);
      ctx.rotate(Math.PI / 2);
      ctx.fillText('VOID IF TAMPERED', 0, 0);
      for (let b = 0; b < 24; b += 4) {
        ctx.fillRect(190 + b, -14, b % 8 === 0 ? 2 : 1, 18);
      }
    } else {
      ctx.fillText('VOID IF TAMPERED', x + 18, y + h * 0.68);
      for (let b = 0; b < 32; b += 4) {
        ctx.fillRect(x + 215 + b, y + 6, b % 8 === 0 ? 2 : 1, h - 12);
      }
    }
    ctx.restore();
  };

  // 8. Yellow RESIN Cargo Case Texture (from Reference Image 1)
  const resinCanvas = document.createElement('canvas');
  resinCanvas.width = 512;
  resinCanvas.height = 512;
  const rc = resinCanvas.getContext('2d')!;
  rc.fillStyle = '#eab826';
  rc.fillRect(0, 0, 512, 512);
  // Subtle panel lines & dirt grit
  rc.strokeStyle = 'rgba(65, 48, 8, 0.35)';
  rc.lineWidth = 4;
  rc.strokeRect(24, 24, 464, 464);
  rc.strokeRect(120, 70, 272, 372);
  for (let i = 0; i < 420; i++) {
    rc.fillStyle = `rgba(38, 30, 12, ${0.08 + rand() * 0.25})`;
    rc.fillRect(rand() * 512, rand() * 512, 2 + rand() * 6, 2 + rand() * 5);
  }
  rc.fillStyle = 'rgba(248, 250, 252, 0.72)';
  rc.font = 'bold 34px sans-serif';
  rc.fillText('RESIN', 185, 225);
  // Barcode
  for (let b = 0; b < 72; b += 5) {
    rc.fillRect(92 + b, 194, b % 10 === 0 ? 3 : 1.5, 32);
  }
  drawTapeStrip(rc, 338, 0, 52, 512, true);
  drawHandprint(rc, 145, 330, 1.35, -0.3);
  drawHandprint(rc, 220, 145, 1.25, 0.25);

  const cargoResinMap = new THREE.CanvasTexture(resinCanvas);
  cargoResinMap.colorSpace = THREE.SRGBColorSpace;
  cargoResinMap.anisotropy = maxAnisotropy;

  // 9. Dark Charcoal BRIDGES Cargo Case Texture (from Reference Images 2 & 3)
  const brCanvas = document.createElement('canvas');
  brCanvas.width = 512;
  brCanvas.height = 512;
  const bc = brCanvas.getContext('2d')!;
  bc.fillStyle = '#1b222c';
  bc.fillRect(0, 0, 512, 512);
  // Vertical ribbed grooves
  for (let rx = 48; rx < 480; rx += 110) {
    bc.fillStyle = 'rgba(8, 11, 16, 0.55)';
    bc.fillRect(rx, 0, 28, 512);
    bc.fillStyle = 'rgba(90, 105, 125, 0.14)';
    bc.fillRect(rx + 28, 0, 6, 512);
  }
  bc.fillStyle = 'rgba(220, 226, 234, 0.62)';
  bc.font = 'bold 46px serif';
  bc.fillText('BRIDGES', 140, 252);
  drawTapeStrip(bc, 0, 326, 512, 46, false);
  drawTapeStrip(bc, 334, 0, 48, 512, true);
  drawHandprint(bc, 260, 150, 1.45, 0.18);
  drawHandprint(bc, 105, 190, 1.15, -0.45);
  drawHandprint(bc, 390, 395, 1.25, 0.55);

  const cargoBridgesMap = new THREE.CanvasTexture(brCanvas);
  cargoBridgesMap.colorSpace = THREE.SRGBColorSpace;
  cargoBridgesMap.anisotropy = maxAnisotropy;

  // 10. Arid Desert Sandstone / Canyon Rock Albedo + Normal (for inland mountain transition)
  const dSize = 256;
  const dCanvas = document.createElement('canvas');
  dCanvas.width = dSize;
  dCanvas.height = dSize;
  const dCtx = dCanvas.getContext('2d')!;
  const dImg = dCtx.createImageData(dSize, dSize);
  const dHeights = new Float32Array(dSize * dSize);

  for (let y = 0; y < dSize; y++) {
    for (let x = 0; x < dSize; x++) {
      const i = y * dSize + x;
      const n = rand();
      const strata =
        Math.sin(y * 0.22 + Math.sin(x * 0.045) * 3.2) * 0.45 +
        Math.cos(y * 0.09 - x * 0.03) * 0.3;
      const crack = Math.abs(Math.sin(x * 0.075 + y * 0.05 + strata * 1.4)) < 0.08 ? -0.32 : 0;
      const grit = (n - 0.5) * 0.28;
      const hVal = 0.5 + strata * 0.35 + crack + grit;
      dHeights[i] = hVal;

      // Sun-baked ochre / dusty sandstone / weathered umber rock palette
      const warmShift = Math.sin(y * 0.14 + x * 0.02) * 0.5 + 0.5;
      const baseR = 132 + strata * 26 + warmShift * 18 + grit * 34 + crack * 48;
      const baseG = 104 + strata * 20 + warmShift * 10 + grit * 28 + crack * 40;
      const baseB = 79 + strata * 14 + grit * 22 + crack * 32;

      const idx = i * 4;
      dImg.data[idx] = THREE.MathUtils.clamp(baseR, 42, 196);
      dImg.data[idx + 1] = THREE.MathUtils.clamp(baseG, 34, 162);
      dImg.data[idx + 2] = THREE.MathUtils.clamp(baseB, 26, 130);
      dImg.data[idx + 3] = 255;
    }
  }
  dCtx.putImageData(dImg, 0, 0);
  const desertRockAlbedo = new THREE.CanvasTexture(dCanvas);
  desertRockAlbedo.colorSpace = THREE.SRGBColorSpace;
  desertRockAlbedo.wrapS = THREE.RepeatWrapping;
  desertRockAlbedo.wrapT = THREE.RepeatWrapping;
  desertRockAlbedo.repeat.set(2, 2);
  desertRockAlbedo.anisotropy = maxAnisotropy;

  const dNormCanvas = document.createElement('canvas');
  dNormCanvas.width = dSize;
  dNormCanvas.height = dSize;
  const dnCtx = dNormCanvas.getContext('2d')!;
  const dnImg = dnCtx.createImageData(dSize, dSize);
  for (let y = 0; y < dSize; y++) {
    for (let x = 0; x < dSize; x++) {
      const xl = (x - 1 + dSize) % dSize;
      const xr = (x + 1) % dSize;
      const yu = (y - 1 + dSize) % dSize;
      const yd = (y + 1) % dSize;
      const dx = (dHeights[y * dSize + xr] - dHeights[y * dSize + xl]) * 3.8;
      const dy = (dHeights[yd * dSize + x] - dHeights[yu * dSize + x]) * 3.8;
      const invLen = 1 / Math.hypot(dx, dy, 1.0);
      const idx = (y * dSize + x) * 4;
      dnImg.data[idx] = ((-dx * invLen) * 0.5 + 0.5) * 255;
      dnImg.data[idx + 1] = ((-dy * invLen) * 0.5 + 0.5) * 255;
      dnImg.data[idx + 2] = (invLen * 0.5 + 0.5) * 255;
      dnImg.data[idx + 3] = 255;
    }
  }
  dnCtx.putImageData(dnImg, 0, 0);
  const desertRockNormal = new THREE.CanvasTexture(dNormCanvas);
  desertRockNormal.wrapS = THREE.RepeatWrapping;
  desertRockNormal.wrapT = THREE.RepeatWrapping;
  desertRockNormal.repeat.set(2, 2);
  desertRockNormal.anisotropy = maxAnisotropy;

  // 11. Compacted Ochre-Umber Mountain Dirt Road Gravel Texture
  const roadSize = 256;
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = roadSize;
  roadCanvas.height = roadSize;
  const rdCtx = roadCanvas.getContext('2d')!;
  const rdImg = rdCtx.createImageData(roadSize, roadSize);
  for (let y = 0; y < roadSize; y++) {
    for (let x = 0; x < roadSize; x++) {
      const i = (y * roadSize + x) * 4;
      const n = rand();
      const gravel = (n - 0.5) * 28;
      const pebble = n > 0.96 ? 26 : n < 0.04 ? -22 : 0;
      const streak = Math.sin(y * 0.09 + Math.sin(x * 0.05) * 2.0) * 6;
      rdImg.data[i] = THREE.MathUtils.clamp(118 + gravel + pebble + streak, 48, 178);
      rdImg.data[i + 1] = THREE.MathUtils.clamp(94 + gravel * 0.85 + pebble + streak * 0.8, 38, 152);
      rdImg.data[i + 2] = THREE.MathUtils.clamp(68 + gravel * 0.65 + pebble + streak * 0.6, 28, 122);
      rdImg.data[i + 3] = 255;
    }
  }
  rdCtx.putImageData(rdImg, 0, 0);
  const dirtRoadAlbedo = new THREE.CanvasTexture(roadCanvas);
  dirtRoadAlbedo.colorSpace = THREE.SRGBColorSpace;
  dirtRoadAlbedo.wrapS = THREE.RepeatWrapping;
  dirtRoadAlbedo.wrapT = THREE.RepeatWrapping;
  dirtRoadAlbedo.anisotropy = maxAnisotropy;

  return {
    sandAlbedo,
    sandNormal,
    mossAlbedo,
    mossNormal,
    cobbleAlbedo,
    cobbleNormal,
    desertRockAlbedo,
    desertRockNormal,
    rockAlbedo,
    rockNormal,
    dirtRoadAlbedo,
    woodAlbedo,
    cargoResinMap,
    cargoBridgesMap,
    fabricMap,
    footprintMap,
    particleMap,
    dispose: () => {
      sandAlbedo.dispose();
      sandNormal.dispose();
      mossAlbedo.dispose();
      mossNormal.dispose();
      cobbleAlbedo.dispose();
      cobbleNormal.dispose();
      desertRockAlbedo.dispose();
      desertRockNormal.dispose();
      rockAlbedo.dispose();
      rockNormal.dispose();
      dirtRoadAlbedo.dispose();
      woodAlbedo.dispose();
      cargoResinMap.dispose();
      cargoBridgesMap.dispose();
      fabricMap.dispose();
      footprintMap.dispose();
      particleMap.dispose();
    },
  };
}
