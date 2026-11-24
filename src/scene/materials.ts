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
  rockAlbedo: THREE.CanvasTexture;
  rockNormal: THREE.CanvasTexture;
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

  // 2. Basalt Rock Albedo + Normal
  const rockSize = 256;
  const rockCanvas = document.createElement('canvas');
  rockCanvas.width = rockSize;
  rockCanvas.height = rockSize;
  const rCtx = rockCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(rockSize, rockSize);
  const rockHeights = new Float32Array(rockSize * rockSize);

  for (let y = 0; y < rockSize; y++) {
    for (let x = 0; x < rockSize; x++) {
      const i = y * rockSize + x;
      const strata =
        Math.sin(y * 0.16 + Math.sin(x * 0.05) * 3.0) * 0.35 +
        Math.sin(x * 0.08 + y * 0.04) * 0.25;
      const pore = rand() > 0.9 ? -0.35 : (rand() - 0.5) * 0.3;
      const hVal = 0.5 + strata * 0.3 + pore;
      rockHeights[i] = hVal;
      const shade = THREE.MathUtils.clamp(38 + strata * 16 + pore * 22, 14, 78);
      const idx = i * 4;
      rImg.data[idx] = shade;
      rImg.data[idx + 1] = shade + 2;
      rImg.data[idx + 2] = shade + 5;
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
      const dx = (rockHeights[y * rockSize + xr] - rockHeights[y * rockSize + xl]) * 3.5;
      const dy = (rockHeights[yd * rockSize + x] - rockHeights[yu * rockSize + x]) * 3.5;
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

  // 6. Realistic Volcanic Gravel, Scree & Muted Olive-Peat Coastal Soil Texture
  const mossSize = 256;
  const mossCanvas = document.createElement('canvas');
  mossCanvas.width = mossSize;
  mossCanvas.height = mossSize;
  const mCtx = mossCanvas.getContext('2d')!;
  const mImg = mCtx.createImageData(mossSize, mossSize);
  for (let y = 0; y < mossSize; y++) {
    for (let x = 0; x < mossSize; x++) {
      const i = y * mossSize + x;
      const n = rand();
      const patch =
        Math.sin(x * 0.08 + y * 0.06) * Math.cos(x * 0.05 - y * 0.09) * 0.5 + 0.5;
      const pebble = n > 0.94 ? 22 : n < 0.08 ? -14 : (n - 0.5) * 16;
      // Muted earthy olive-gray & weathered volcanic silt (like Death Stranding highlands)
      const r = THREE.MathUtils.clamp(68 + patch * 22 + pebble, 34, 130);
      const g = THREE.MathUtils.clamp(73 + patch * 24 + pebble, 38, 136);
      const b = THREE.MathUtils.clamp(58 + patch * 16 + pebble, 30, 118);
      const idx = i * 4;
      mImg.data[idx] = r;
      mImg.data[idx + 1] = g;
      mImg.data[idx + 2] = b;
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

  return {
    sandAlbedo,
    sandNormal,
    mossAlbedo,
    rockAlbedo,
    rockNormal,
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
      rockAlbedo.dispose();
      rockNormal.dispose();
      woodAlbedo.dispose();
      cargoResinMap.dispose();
      cargoBridgesMap.dispose();
      fabricMap.dispose();
      footprintMap.dispose();
      particleMap.dispose();
    },
  };
}
