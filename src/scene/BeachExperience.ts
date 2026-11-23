import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BeachAudioEngine } from './audio';
import { CharacterController, createDrifterCharacter } from './character';
import { BeachEnvironment, createBeachEnvironment } from './environment';
import {
  ATMOSPHERE_PRESETS,
  AtmospherePresetId,
  createProceduralTextures,
  detectSoftwareGl,
} from './materials';
import { groundHeightAt, shorelineZAt } from './terrain';

export type CameraMode = 'shoulder' | 'vista';

export interface SceneTelemetry {
  x: number;
  z: number;
  elevation: number;
  headingDeg: number;
  speed: number;
  isWading: boolean;
}

export interface BeachExperienceOptions {
  container: HTMLElement;
  onTelemetry?: (t: SceneTelemetry) => void;
  onContextLost?: (lost: boolean) => void;
}

const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();

export class BeachExperience {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private environment: BeachEnvironment;
  private character: CharacterController;
  private audio: BeachAudioEngine;
  private textures: ReturnType<typeof createProceduralTextures>;
  private envMapTexture: THREE.Texture;

  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private fog: THREE.FogExp2;

  private isSoftwareGl: boolean;
  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();

  // Camera orbit state
  private cameraYaw = 0.08;
  private cameraPitch = 0.24;
  private cameraDist = 4.6;
  private targetCameraDist = 4.6;
  private cameraMode: CameraMode = 'shoulder';
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Input state
  private keys: Record<string, boolean> = {};
  private jumpQueued = false;
  private touchMove = { x: 0, y: 0 };

  // Scan wave animation
  private scanActive = false;
  private scanProgress = 0;

  // Callbacks
  private onTelemetry?: (t: SceneTelemetry) => void;
  private onContextLost?: (lost: boolean) => void;
  private lastTelemetryTime = 0;
  private container: HTMLElement;

  constructor(options: BeachExperienceOptions) {
    this.container = options.container;
    this.onTelemetry = options.onTelemetry;
    this.onContextLost = options.onContextLost;

    this.isSoftwareGl = detectSoftwareGl();

    const width = options.container.clientWidth || window.innerWidth;
    const height = options.container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = ATMOSPHERE_PRESETS.ash.exposure;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    options.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const initialPreset = ATMOSPHERE_PRESETS.ash;
    this.fog = new THREE.FogExp2(initialPreset.fogColor, initialPreset.fogDensity);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(initialPreset.fogColor);

    this.camera = new THREE.PerspectiveCamera(52, width / height, 0.15, 450);

    // Mandatory studio environment map for metallic & wet-surface PBR speculars
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envMapTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    this.scene.environment = this.envMapTexture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 3-Point Atmospheric Coastal Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(
      initialPreset.hemiSky,
      initialPreset.hemiGround,
      initialPreset.hemiIntensity
    );
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(
      initialPreset.keyColor,
      initialPreset.keyIntensity
    );
    this.keyLight.position.set(22, 32, -26);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    const d = 22;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 90;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight(0x88a4be, 0.75);
    this.rimLight.position.set(-18, 12, 24);
    this.scene.add(this.rimLight);

    // Procedural Textures, Environment, Character & Audio
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.environment = createBeachEnvironment(this.textures, this.isSoftwareGl);
    this.scene.add(this.environment.group);

    this.character = createDrifterCharacter(this.scene, this.textures);
    this.audio = new BeachAudioEngine();

    // Initialize camera behind character facing the ocean & stranded whales
    this.syncCameraImmediate();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.startLoop();
  }

  private syncCameraImmediate(): void {
    const p = this.character.position;
    const lookY = p.y + 1.38;
    const horizDist = Math.cos(this.cameraPitch) * this.cameraDist;
    const vertDist = Math.sin(this.cameraPitch) * this.cameraDist;

    this.camera.position.set(
      p.x + Math.sin(this.cameraYaw) * horizDist,
      lookY + vertDist,
      p.z + Math.cos(this.cameraYaw) * horizDist
    );
    this.camera.lookAt(p.x, lookY, p.z);
  }

  public setAtmosphere(presetId: AtmospherePresetId): void {
    const p = ATMOSPHERE_PRESETS[presetId];
    this.environment.applyPreset(presetId);
    this.fog.color.setHex(p.fogColor);
    this.fog.density = p.fogDensity;
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.setHex(p.fogColor);
    }
    this.keyLight.color.setHex(p.keyColor);
    this.keyLight.intensity = p.keyIntensity;
    this.hemiLight.color.setHex(p.hemiSky);
    this.hemiLight.groundColor.setHex(p.hemiGround);
    this.hemiLight.intensity = p.hemiIntensity;
    this.renderer.toneMappingExposure = p.exposure;
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    if (mode === 'shoulder') {
      this.targetCameraDist = 4.6;
      this.cameraPitch = 0.22;
    } else {
      this.targetCameraDist = 11.5;
      this.cameraPitch = 0.34;
    }
  }

  public triggerScan(): void {
    this.scanActive = true;
    this.scanProgress = 0;
    this.environment.scanUniforms.uScanOrigin.value.copy(this.character.position);
    this.environment.scanUniforms.uScanRadius.value = 0;
    this.environment.scanUniforms.uScanStrength.value = 1;
    this.character.triggerScan();
    this.audio.playScanChime();
  }

  public toggleAudio(): boolean {
    return this.audio.setEnabled(!this.audio.isEnabled());
  }

  public setTouchJoystick(x: number, y: number): void {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  public triggerJump(): void {
    this.jumpQueued = true;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (e.code === 'Space') {
      this.jumpQueued = true;
    }
    if (e.code === 'KeyF') {
      this.triggerScan();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    this.cameraYaw -= dx * 0.0055;
    this.cameraPitch = THREE.MathUtils.clamp(
      this.cameraPitch + dy * 0.0045,
      -0.08,
      0.88
    );
  };

  private handlePointerUp = () => {
    this.isDragging = false;
  };

  private handleWheel = (e: WheelEvent) => {
    this.targetCameraDist = THREE.MathUtils.clamp(
      this.targetCameraDist + e.deltaY * 0.004,
      2.6,
      16.5
    );
  };

  private handleResize = () => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.onContextLost?.(true);
  };

  private handleContextRestored = () => {
    this.onContextLost?.(false);
  };

  private bindEvents(): void {
    const canvas = this.renderer.domElement;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('resize', this.handleResize);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: true });
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;

      const delta = this.clock.getDelta();
      const elapsed = this.clock.getElapsedTime();

      // Gather directional input
      const forward =
        (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) -
        (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0) +
        this.touchMove.y;
      const right =
        (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) -
        (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0) +
        this.touchMove.x;
      const sprint = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
      const jumpPressed = this.jumpQueued;
      this.jumpQueued = false;

      this.character.update(
        delta,
        elapsed,
        {
          forward: THREE.MathUtils.clamp(forward, -1, 1),
          right: THREE.MathUtils.clamp(right, -1, 1),
          sprint,
          jumpPressed,
          cameraYaw: this.cameraYaw,
        },
        this.environment.colliders,
        (wading) => {
          this.audio.playFootstep(wading);
        }
      );

      // Update environment & particles
      this.environment.update(elapsed, delta, this.character.position);

      // Update Odradek terrain pulse wave
      if (this.scanActive) {
        this.scanProgress += delta;
        const duration = 2.6;
        if (this.scanProgress >= duration) {
          this.scanActive = false;
          this.environment.scanUniforms.uScanStrength.value = 0;
        } else {
          const t = this.scanProgress / duration;
          this.environment.scanUniforms.uScanRadius.value = t * 58;
          this.environment.scanUniforms.uScanStrength.value = Math.sin(t * Math.PI);
        }
      }

      // Keep directional shadow frustum centered around the player
      const p = this.character.position;
      this.keyLight.position.set(p.x + 22, p.y + 32, p.z - 26);
      this.keyLight.target.position.copy(p);
      this.keyLight.target.updateMatrixWorld();

      // Smooth damped third-person camera with shoulder offset & terrain clearance
      const dt = Math.min(delta, 0.05);
      this.cameraDist = THREE.MathUtils.damp(
        this.cameraDist,
        this.targetCameraDist,
        8,
        dt
      );

      const dynamicFov =
        this.cameraMode === 'shoulder'
          ? 52 + (this.character.isSprinting ? 4.5 : 0)
          : 58;
      const nextFov = THREE.MathUtils.damp(this.camera.fov, dynamicFov, 6, dt);
      if (Math.abs(nextFov - this.camera.fov) > 0.02) {
        this.camera.fov = nextFov;
        this.camera.updateProjectionMatrix();
      }

      const shoulderOffset = this.cameraMode === 'shoulder' ? 0.42 : 0;
      const rightX = Math.cos(this.cameraYaw) * shoulderOffset;
      const rightZ = -Math.sin(this.cameraYaw) * shoulderOffset;

      const lookY = p.y + (this.cameraMode === 'shoulder' ? 1.42 : 1.55);
      _camTarget.set(p.x + rightX * 0.5, lookY, p.z + rightZ * 0.5);

      const horizDist = Math.cos(this.cameraPitch) * this.cameraDist;
      const vertDist = Math.sin(this.cameraPitch) * this.cameraDist;

      _camDesired.set(
        p.x + rightX + Math.sin(this.cameraYaw) * horizDist,
        lookY + vertDist,
        p.z + rightZ + Math.cos(this.cameraYaw) * horizDist
      );

      // Prevent camera from clipping under volcanic dunes
      const camGround = groundHeightAt(_camDesired.x, _camDesired.z) + 0.55;
      if (_camDesired.y < camGround) _camDesired.y = camGround;

      this.camera.position.x = THREE.MathUtils.damp(
        this.camera.position.x,
        _camDesired.x,
        11,
        dt
      );
      this.camera.position.y = THREE.MathUtils.damp(
        this.camera.position.y,
        _camDesired.y,
        11,
        dt
      );
      this.camera.position.z = THREE.MathUtils.damp(
        this.camera.position.z,
        _camDesired.z,
        11,
        dt
      );
      this.camera.lookAt(_camTarget);

      // Update ocean surf audio proximity
      const distToWater = Math.max(0, p.z - shorelineZAt(p.x));
      this.audio.update(dt, distToWater);

      // Throttled telemetry update (~8Hz)
      if (this.onTelemetry && elapsed - this.lastTelemetryTime > 0.12) {
        this.lastTelemetryTime = elapsed;
        let deg = Math.round(THREE.MathUtils.radToDeg(this.character.yaw)) % 360;
        if (deg < 0) deg += 360;
        this.onTelemetry({
          x: p.x,
          z: p.z,
          elevation: p.y,
          headingDeg: deg,
          speed: this.character.speed,
          isWading: this.character.isWading,
        });
      }

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    tick();
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    const canvas = this.renderer.domElement;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('resize', this.handleResize);
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('wheel', this.handleWheel);
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.character.dispose();
    this.environment.dispose();
    this.textures.dispose();
    this.envMapTexture.dispose();
    this.audio.dispose();
    this.renderer.dispose();

    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
