import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BeachAudioEngine } from './audio';
import { CargoMissionStatus, CargoSystem, createCargoSystem } from './cargo';
import { CharacterController, createDrifterCharacter } from './character';
import { CrystalSystem, createChiralCrystalSystem } from './crystals';
import {
  BeachEnvironment,
  NearbyUmbrellaStation,
  REFUGE_HUT_POS,
  createBeachEnvironment,
} from './environment';
import {
  CraftableEquipmentId,
  EquipmentSnapshot,
  EquipmentSystem,
  GEAR_SERVICE_COSTS,
  GearServiceMode,
  GearSlot,
  createEquipmentSystem,
} from './equipment';
import {
  ATMOSPHERE_PRESETS,
  AtmospherePresetId,
  createProceduralTextures,
  detectSoftwareGl,
} from './materials';
import {
  BEACH_PLAYABLE_RADIUS,
  MUSIC_TRIGGER_POINT,
  UMBRELLA_STATIONS,
  groundHeightAt,
  shorelineZAt,
} from './terrain';
import {
  WeatherKind,
  WeatherMode,
  WeatherSnapshot,
  WeatherSystem,
  createWeatherSystem,
} from './weather';
import {
  TimeOfDayMode,
  TimeOfDaySnapshot,
  TimeOfDaySystem,
  createTimeOfDaySystem,
} from './timeOfDay';
import {
  GameSaveData,
  getSavedPlayerName,
  setSavedPlayerName,
} from './saveSystem';
import { WormSystem, createWormSystem } from './worms';
import { LowPolyTreeSystem, createLowPolyTrees } from './trees';

export type CameraMode = 'shoulder' | 'vista';

export interface WeatherTelemetry {
  mode: WeatherMode;
  active: WeatherKind;
  target: WeatherKind;
  transitioning: boolean;
}

export interface TimeOfDayTelemetry {
  mode: TimeOfDayMode;
  hour: number;
  formattedTime: string;
  phaseLabel: string;
  daylight: number;
}

export interface MusicTriggerTelemetry {
  triggered: boolean;
  bannerVisible: boolean;
  title: string;
  subtitle: string;
  triggerPos: { x: number; z: number };
  customTrackName: string | null;
  customPlaying: boolean;
}

export interface SceneTelemetry {
  x: number;
  z: number;
  elevation: number;
  headingDeg: number;
  speed: number;
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
  lastFallDamage: number | null;
  rescueNotice: string | null;
  insideBuilding: boolean;
  buildingName: string | null;
  nearbyUmbrellaStation: NearbyUmbrellaStation | null;
  wormsInPouch: number;
  maxWormsInPouch: number;
  nearbyWorm: boolean;
  refugeHutPos: { x: number; z: number };
  playableRadius: number;
  boundaryHit: boolean;
  weather: WeatherTelemetry;
  timeOfDay: TimeOfDayTelemetry;
  music: MusicTriggerTelemetry;
  cargo: CargoMissionStatus;
  nearbyCrystalYield: number | null;
  equipment: EquipmentSnapshot;
}

export interface BeachExperienceOptions {
  container: HTMLElement;
  onTelemetry?: (t: SceneTelemetry) => void;
  onContextLost?: (lost: boolean) => void;
}

const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _tmpFogColor = new THREE.Color();
const _rainFogColor = new THREE.Color(0x7c8691);
const _snowFogColor = new THREE.Color(0xd7dfe7);
const _duskFogColor = new THREE.Color(0x7a5b53);
const _nightFogColor = new THREE.Color(0x1b232e);
const _nightSnowFogColor = new THREE.Color(0x283344);
const _tmpKeyColor = new THREE.Color();
const _duskKeyColor = new THREE.Color(0xffa76c);
const _nightKeyColor = new THREE.Color(0x9db7de);
const _tmpHemiSky = new THREE.Color();
const _duskHemiSky = new THREE.Color(0x937481);
const _nightHemiSky = new THREE.Color(0x3b4d68);
const _tmpHemiGround = new THREE.Color();
const _nightHemiGround = new THREE.Color(0x0d1219);
const _dayRimColor = new THREE.Color(0x88a4be);
const _nightRimColor = new THREE.Color(0x4f6d94);

export class BeachExperience {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private environment: BeachEnvironment;
  private trees: LowPolyTreeSystem;
  private weather: WeatherSystem;
  private timeOfDay: TimeOfDaySystem;
  private character: CharacterController;
  private equipment: EquipmentSystem;
  private crystals: CrystalSystem;
  private worms: WormSystem;
  private cargo: CargoSystem;
  private audio: BeachAudioEngine;
  private textures: ReturnType<typeof createProceduralTextures>;
  private envMapTexture: THREE.Texture;
  private wormsInPouch = 0;
  private readonly maxWormsInPouch = 5;
  private paused = false;

  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private fog: THREE.FogExp2;
  private currentPresetId: AtmospherePresetId = 'ash';
  private lastWeatherSnapshot: WeatherSnapshot;
  private lastTimeSnapshot: TimeOfDaySnapshot;

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

  // Callbacks, Boundary, Fall & Music Trigger Feedback
  private onTelemetry?: (t: SceneTelemetry) => void;
  private onContextLost?: (lost: boolean) => void;
  private lastTelemetryTime = 0;
  private boundaryNoticeTimer = 0;
  private lastBoundaryAudioTime = -10;
  private fallDamageBannerTimer = 0;
  private lastFallDamageAmount = 0;
  private rescueNoticeTimer = 0;
  private rescueNoticeText = '';
  private musicTriggered = false;
  private musicBannerTimer = 0;
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

    this.camera = new THREE.PerspectiveCamera(52, width / height, 0.15, 1400);

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

    this.trees = createLowPolyTrees(this.environment.colliders, this.isSoftwareGl);
    this.scene.add(this.trees.group);

    this.weather = createWeatherSystem(this.textures, this.isSoftwareGl);
    this.scene.add(this.weather.group);
    this.lastWeatherSnapshot = this.weather.getSnapshot();

    this.timeOfDay = createTimeOfDaySystem(11.2);
    this.lastTimeSnapshot = this.timeOfDay.getSnapshot();
    this.environment.applyTimeOfDay(this.lastTimeSnapshot);

    this.character = createDrifterCharacter(this.scene, this.textures);
    this.character.setPlayerName(getSavedPlayerName());
    this.equipment = createEquipmentSystem(this.scene, this.isSoftwareGl);
    this.crystals = createChiralCrystalSystem(
      this.scene,
      this.environment.colliders,
      this.isSoftwareGl
    );
    this.worms = createWormSystem(
      this.scene,
      this.environment.bushSpots,
      this.isSoftwareGl
    );
    this.cargo = createCargoSystem(
      this.scene,
      this.character.backpackMount,
      this.equipment.cartCargoMount,
      this.textures,
      this.environment.colliders
    );
    this.audio = new BeachAudioEngine();
    this.audio.setOnMusicStateChange(() => this.pushTelemetryNow());

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
    this.currentPresetId = presetId;
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

  public setWeatherMode(mode: WeatherMode): void {
    this.weather.setMode(mode);
    this.lastWeatherSnapshot = this.weather.getSnapshot();
    this.pushTelemetryNow();
  }

  public setTimeMode(mode: TimeOfDayMode): void {
    this.timeOfDay.setMode(mode);
    this.lastTimeSnapshot = this.timeOfDay.getSnapshot();
    this.environment.applyTimeOfDay(this.lastTimeSnapshot);
    this.pushTelemetryNow();
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

  public interactCargo(): void {
    const p = this.character.position;
    const preStatus = this.cargo.getStatus(p);
    const nearCrystal = this.crystals.getNearbyCrystal(p);
    const nearWorm = this.worms.getNearbyWorm(p);

    if (nearCrystal && (!preStatus.nearbyCargoLabel || preStatus.backpackFull)) {
      const yieldCg = this.crystals.collectNearby(p);
      if (yieldCg > 0) {
        this.equipment.addCrystals(yieldCg);
        this.audio.playCrystalCollect();
        this.pushTelemetryNow();
        return;
      }
    }

    if (
      nearWorm &&
      (!preStatus.nearbyCargoLabel || preStatus.backpackFull) &&
      !(preStatus.nearDeliveryPost && preStatus.carried > 0)
    ) {
      if (this.worms.collectNearby(p)) {
        if (this.wormsInPouch < this.maxWormsInPouch) {
          this.wormsInPouch++;
          this.audio.playCargoPickup();
        } else {
          this.character.applyWormFeeding();
          this.audio.playWormEat();
        }
        this.pushTelemetryNow();
        return;
      }
    }

    const result = this.cargo.interact(p);
    if (result === 'collected') {
      this.audio.playCargoPickup();
    } else if (result === 'delivered') {
      this.audio.playCargoDeliver();
    }
    const status = this.cargo.getStatus(p);
    this.character.setCarriedWeight(status.effectiveWeightKg);
    this.pushTelemetryNow();
  }

  public eatWorm(): void {
    if (this.wormsInPouch <= 0) return;
    this.wormsInPouch--;
    this.character.applyWormFeeding();
    this.audio.playWormEat();
    this.pushTelemetryNow();
  }

  public craftEquipment(id: CraftableEquipmentId): void {
    if (this.equipment.craft(id)) {
      this.audio.playCraftEquip();
      const snap = this.equipment.getSnapshot();
      this.cargo.setCartAvailable(snap.hasCart && snap.cartAttached);
      const status = this.cargo.getStatus(this.character.position);
      this.character.setCarriedWeight(status.effectiveWeightKg);
      this.pushTelemetryNow();
    }
  }

  public deployLadder(): void {
    if (this.equipment.deployLadder(this.character.position, this.character.yaw)) {
      this.audio.playCraftEquip();
      this.pushTelemetryNow();
    }
  }

  public deployAnchor(): void {
    if (this.equipment.deployAnchor(this.character.position, this.character.yaw)) {
      this.audio.playCraftEquip();
      this.pushTelemetryNow();
    }
  }

  public toggleCartHitch(): void {
    if (this.equipment.toggleCartAttached()) {
      this.audio.playCraftEquip();
      const snap = this.equipment.getSnapshot();
      this.cargo.setCartAvailable(snap.hasCart && snap.cartAttached);
      const status = this.cargo.getStatus(this.character.position);
      this.character.setCarriedWeight(status.effectiveWeightKg);
      this.pushTelemetryNow();
    }
  }

  public shiftCargoToCart(): void {
    if (this.cargo.shiftPackToCart()) {
      this.audio.playCargoPickup();
      const status = this.cargo.getStatus(this.character.position);
      this.character.setCarriedWeight(status.effectiveWeightKg);
      this.pushTelemetryNow();
    }
  }

  public serviceGearAtStation(slot: GearSlot, mode: GearServiceMode): boolean {
    const station = this.environment.getNearbyUmbrellaStation(
      this.character.position.x,
      this.character.position.z
    );
    if (!station) return false;

    if (mode === 'repair') {
      if (slot === 'boots' && this.character.bootsDurability >= 99.5) return false;
      if (slot === 'suit' && this.character.suitDurability >= 99.5) return false;
    }

    const cost =
      slot === 'boots'
        ? mode === 'craft'
          ? GEAR_SERVICE_COSTS.craftBoots
          : GEAR_SERVICE_COSTS.repairBoots
        : mode === 'craft'
          ? GEAR_SERVICE_COSTS.craftSuit
          : GEAR_SERVICE_COSTS.repairSuit;

    if (!this.equipment.spendCrystals(cost)) return false;

    this.character.repairGear(slot, mode);
    this.audio.playStationRepair();
    this.pushTelemetryNow();
    return true;
  }

  public async setCustomMusicFile(file: File): Promise<void> {
    await this.audio.setCustomMusicFile(file);
    this.pushTelemetryNow();
  }

  public clearCustomMusic(): void {
    this.audio.clearCustomMusic();
    this.pushTelemetryNow();
  }

  public toggleCustomMusicPlayback(): void {
    const playing = this.audio.toggleCustomPlayback();
    if (playing) {
      this.musicBannerTimer = 5.5;
    }
    this.pushTelemetryNow();
  }

  public setPaused(next: boolean): void {
    this.paused = next;
    if (next) {
      this.keys = {};
      this.jumpQueued = false;
      this.isDragging = false;
    }
  }

  public setPlayerName(name: string): void {
    const clean = setSavedPlayerName(name);
    this.character.setPlayerName(clean);
    this.pushTelemetryNow();
  }

  public exportSaveData(slotLabel: string): GameSaveData {
    const p = this.character.position;
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      slotLabel,
      playerName: this.character.playerName,
      playerPos: { x: p.x, y: p.y, z: p.z },
      yaw: this.character.yaw,
      health: this.character.health,
      stamina: this.character.stamina,
      staminaExhausted: this.character.staminaExhausted,
      cold: this.character.cold,
      bootsDurability: this.character.bootsDurability,
      suitDurability: this.character.suitDurability,
      wormsInPouch: this.wormsInPouch,
      preset: this.currentPresetId,
      weatherMode: this.lastWeatherSnapshot.mode,
      timeMode: this.lastTimeSnapshot.mode,
      timeHour: this.lastTimeSnapshot.hour,
      musicTriggered: this.musicTriggered,
      cargo: this.cargo.exportState(),
      crystals: this.crystals.exportState(),
      collectedWorms: this.worms.exportState(),
      equipment: this.equipment.exportState(),
    };
  }

  public loadSaveData(data: GameSaveData): {
    preset: AtmospherePresetId;
    weatherMode: WeatherMode;
    timeMode: TimeOfDayMode;
    playerName: string;
  } {
    this.setAtmosphere(data.preset);
    this.setWeatherMode(data.weatherMode);
    const restoredTimeMode = data.timeMode ?? 'auto';
    this.timeOfDay.setMode(restoredTimeMode);
    if (typeof data.timeHour === 'number') {
      this.timeOfDay.setHour(data.timeHour);
    }
    this.lastTimeSnapshot = this.timeOfDay.getSnapshot();
    this.environment.applyTimeOfDay(this.lastTimeSnapshot);
    this.equipment.importState(data.equipment);
    const eqSnap = this.equipment.getSnapshot();
    this.cargo.setCartAvailable(eqSnap.hasCart && eqSnap.cartAttached);
    this.cargo.importState(data.cargo);
    this.crystals.importState(data.crystals);
    this.worms.importState(data.collectedWorms);
    this.wormsInPouch = THREE.MathUtils.clamp(data.wormsInPouch ?? 0, 0, this.maxWormsInPouch);
    this.musicTriggered = Boolean(data.musicTriggered);
    this.musicBannerTimer = 0;

    const cleanName = setSavedPlayerName(data.playerName || 'Drifter');
    this.character.restoreState({
      x: data.playerPos.x,
      y: data.playerPos.y,
      z: data.playerPos.z,
      yaw: data.yaw,
      health: data.health ?? 100,
      stamina: data.stamina ?? 100,
      staminaExhausted: Boolean(data.staminaExhausted),
      cold: data.cold ?? 14,
      bootsDurability: data.bootsDurability ?? 100,
      suitDurability: data.suitDurability ?? 100,
      playerName: cleanName,
    });
    const cargoStatus = this.cargo.getStatus(this.character.position);
    this.character.setCarriedWeight(cargoStatus.effectiveWeightKg);
    this.syncCameraImmediate();
    this.pushTelemetryNow();

    return {
      preset: data.preset,
      weatherMode: data.weatherMode,
      timeMode: restoredTimeMode,
      playerName: cleanName,
    };
  }

  public startNewGame(): void {
    this.equipment.resetEquipment();
    this.cargo.setCartAvailable(false);
    this.cargo.resetMission(this.environment.colliders);
    this.crystals.resetCrystals(this.environment.colliders);
    this.worms.resetWorms();
    this.wormsInPouch = 0;
    this.musicTriggered = false;
    this.musicBannerTimer = 0;
    this.timeOfDay.setMode('auto');
    this.timeOfDay.setHour(11.2);
    this.lastTimeSnapshot = this.timeOfDay.getSnapshot();
    this.environment.applyTimeOfDay(this.lastTimeSnapshot);
    this.character.resetState();
    this.syncCameraImmediate();
    this.pushTelemetryNow();
  }

  public resetCargoRun(): void {
    this.cargo.resetMission(this.environment.colliders);
    this.crystals.resetCrystals(this.environment.colliders);
    this.worms.resetWorms();
    this.character.setCarriedWeight(0);
    this.pushTelemetryNow();
  }

  private pushTelemetryNow(): void {
    if (!this.onTelemetry) return;
    const p = this.character.position;
    let deg = Math.round(THREE.MathUtils.radToDeg(this.character.yaw)) % 360;
    if (deg < 0) deg += 360;
    const cargoStatus = this.cargo.getStatus(p);
    const nearCrystal = this.crystals.getNearbyCrystal(p);
    const nearWorm = this.worms.getNearbyWorm(p);
    const customInfo = this.audio.getCustomTrackInfo();
    const nearbyStation = this.environment.getNearbyUmbrellaStation(p.x, p.z);
    this.onTelemetry({
      x: p.x,
      z: p.z,
      elevation: p.y,
      headingDeg: deg,
      speed: this.character.speed,
      isWading: this.character.isWading,
      isClimbing: this.character.isClimbing,
      isSlipping: this.character.isSlipping,
      climbSlopeDeg: this.character.climbSlopeDeg,
      health: this.character.health,
      maxHealth: this.character.maxHealth,
      playerName: this.character.playerName,
      stamina: this.character.stamina,
      staminaExhausted: this.character.staminaExhausted,
      staminaCooldownRemaining: this.character.staminaCooldownRemaining,
      cold: this.character.cold,
      bootsDurability: this.character.bootsDurability,
      suitDurability: this.character.suitDurability,
      lastFallDamage: this.fallDamageBannerTimer > 0 ? this.lastFallDamageAmount : null,
      rescueNotice: this.rescueNoticeTimer > 0 ? this.rescueNoticeText : null,
      insideBuilding: this.character.insideBuilding,
      buildingName: this.character.buildingName,
      nearbyUmbrellaStation: nearbyStation,
      wormsInPouch: this.wormsInPouch,
      maxWormsInPouch: this.maxWormsInPouch,
      nearbyWorm: nearWorm !== null,
      refugeHutPos: REFUGE_HUT_POS,
      playableRadius: BEACH_PLAYABLE_RADIUS,
      boundaryHit: this.boundaryNoticeTimer > 0,
      weather: {
        mode: this.lastWeatherSnapshot.mode,
        active: this.lastWeatherSnapshot.active,
        target: this.lastWeatherSnapshot.target,
        transitioning: this.lastWeatherSnapshot.transitioning,
      },
      timeOfDay: {
        mode: this.lastTimeSnapshot.mode,
        hour: this.lastTimeSnapshot.hour,
        formattedTime: this.lastTimeSnapshot.formattedTime,
        phaseLabel: this.lastTimeSnapshot.phaseLabel,
        daylight: this.lastTimeSnapshot.daylight,
      },
      music: {
        triggered: this.musicTriggered,
        bannerVisible: this.musicBannerTimer > 0,
        title: customInfo ? customInfo.title : MUSIC_TRIGGER_POINT.title,
        subtitle: customInfo ? customInfo.subtitle : MUSIC_TRIGGER_POINT.subtitle,
        triggerPos: { x: MUSIC_TRIGGER_POINT.x, z: MUSIC_TRIGGER_POINT.z },
        customTrackName: customInfo ? customInfo.title : null,
        customPlaying: customInfo ? customInfo.isPlaying : false,
      },
      cargo: cargoStatus,
      nearbyCrystalYield: nearCrystal ? nearCrystal.yieldCg : null,
      equipment: this.equipment.getSnapshot(),
    });
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }
    if (this.paused) return;

    this.keys[e.code] = true;
    if (e.code === 'Space') {
      this.jumpQueued = true;
    }
    if (e.code === 'KeyF') {
      this.triggerScan();
    }
    if (e.code === 'KeyE') {
      this.interactCargo();
    }
    if (e.code === 'KeyQ') {
      this.eatWorm();
    }
    if (e.code === 'Digit1') {
      this.deployLadder();
    }
    if (e.code === 'Digit2') {
      this.deployAnchor();
    }
    if (e.code === 'Digit3') {
      this.toggleCartHitch();
    }
    if (e.code === 'KeyT') {
      this.shiftCargoToCart();
    }
    if (e.code === 'KeyU') {
      const slot: GearSlot =
        this.character.bootsDurability <= this.character.suitDurability ? 'boots' : 'suit';
      this.serviceGearAtStation(slot, 'repair');
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

      // Gather directional input (frozen while menu/title screen is open)
      const forward = this.paused
        ? 0
        : (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) -
          (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0) +
          this.touchMove.y;
      const right = this.paused
        ? 0
        : (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) -
          (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0) +
          this.touchMove.x;
      const sprint = !this.paused && Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
      const jumpPressed = !this.paused && this.jumpQueued;
      this.jumpQueued = false;

      const anchorAssist = this.equipment.isNearAnchor(this.character.position);
      const shelter = this.environment.isInsideBuilding(
        this.character.position.x,
        this.character.position.z
      );

      if (!this.paused) {
        if (this.fallDamageBannerTimer > 0) {
          this.fallDamageBannerTimer = Math.max(0, this.fallDamageBannerTimer - delta);
        }
        if (this.rescueNoticeTimer > 0) {
          this.rescueNoticeTimer = Math.max(0, this.rescueNoticeTimer - delta);
        }

        this.character.update(
          delta,
          elapsed,
          {
            forward: THREE.MathUtils.clamp(forward, -1, 1),
            right: THREE.MathUtils.clamp(right, -1, 1),
            sprint,
            jumpPressed,
            cameraYaw: this.cameraYaw,
            anchorAssist,
            rainWeight: this.lastWeatherSnapshot.rainWeight,
            snowWeight: this.lastWeatherSnapshot.snowWeight,
            nightWeight: this.lastTimeSnapshot.nightWeight,
            insideBuilding: shelter.inside,
            buildingName: shelter.buildingName,
            surfaceHeightResolver: (x, z, terrainY) =>
              this.equipment.getSurfaceHeightAt(x, z, terrainY).y,
          },
          this.environment.colliders,
          (event) => {
            this.audio.playFootstep(event.surface, event.heavyCargo, event.weightKg);
          },
          (fallEvent) => {
            this.audio.playFallImpact(Math.min(1, fallEvent.damage / 50));
            this.lastFallDamageAmount = fallEvent.damage;
            this.fallDamageBannerTimer = 2.6;

            if (this.character.health <= 0) {
              const px = this.character.position.x;
              const pz = this.character.position.z;
              let nearest = UMBRELLA_STATIONS[0];
              let bestDist = Infinity;
              for (let i = 0; i < UMBRELLA_STATIONS.length; i++) {
                const st = UMBRELLA_STATIONS[i];
                const d = Math.hypot(px - st.x, pz - st.z);
                if (d < bestDist) {
                  bestDist = d;
                  nearest = st;
                }
              }
              this.character.restoreState({
                x: nearest.x,
                y: groundHeightAt(nearest.x, nearest.z),
                z: nearest.z + 1.4,
                yaw: Math.PI,
                health: 65,
                stamina: 85,
                staminaExhausted: false,
                cold: 22,
                bootsDurability: Math.max(25, this.character.bootsDurability),
                suitDurability: Math.max(25, this.character.suitDurability),
                playerName: this.character.playerName,
              });
              this.syncCameraImmediate();
              this.rescueNoticeText = `Recovered at ${nearest.name}`;
              this.rescueNoticeTimer = 3.8;
            }
            this.pushTelemetryNow();
          },
          () => {
            this.audio.playSlipScrape();
          }
        );
      } else {
        this.cameraYaw += delta * 0.08;
      }

      // Update environment, time of day, volumetric weather, cargo beacons & particles
      this.environment.update(elapsed, delta, this.character.position);
      const timeSnap = this.paused
        ? this.timeOfDay.getSnapshot()
        : this.timeOfDay.update(delta);
      this.lastTimeSnapshot = timeSnap;
      this.environment.applyTimeOfDay(timeSnap);

      const weatherSnap = this.weather.update(
        delta,
        elapsed,
        this.character.position,
        this.camera.position
      );
      this.lastWeatherSnapshot = weatherSnap;
      this.environment.applyWeather(weatherSnap);

      // Blend atmospheric fog & lighting smoothly with weather + daylight/night cycle
      const basePreset = ATMOSPHERE_PRESETS[this.currentPresetId];
      _tmpFogColor.setHex(basePreset.fogColor);
      _tmpFogColor
        .lerp(_rainFogColor, weatherSnap.rainWeight * 0.72)
        .lerp(_snowFogColor, weatherSnap.snowWeight * 0.65)
        .lerp(_duskFogColor, timeSnap.twilight * 0.34)
        .lerp(_nightFogColor, timeSnap.nightWeight * 0.84)
        .lerp(_nightSnowFogColor, timeSnap.nightWeight * weatherSnap.snowWeight * 0.48);
      this.fog.color.copy(_tmpFogColor);
      if (this.scene.background instanceof THREE.Color) {
        this.scene.background.copy(_tmpFogColor);
      }
      this.fog.density =
        basePreset.fogDensity *
        weatherSnap.fogMultiplier *
        (1 + timeSnap.nightWeight * 0.12);

      const weatherKeyFactor =
        weatherSnap.clearWeight * 1.06 +
        weatherSnap.rainWeight * 0.68 +
        weatherSnap.snowWeight * 0.92;
      _tmpKeyColor
        .setHex(basePreset.keyColor)
        .lerp(_duskKeyColor, timeSnap.twilight * 0.62)
        .lerp(_nightKeyColor, timeSnap.nightWeight * 0.88);
      this.keyLight.color.copy(_tmpKeyColor);
      this.keyLight.intensity =
        basePreset.keyIntensity *
        weatherKeyFactor *
        (1 - timeSnap.nightWeight * 0.56);

      const weatherHemiFactor =
        weatherSnap.clearWeight * 1.0 +
        weatherSnap.rainWeight * 0.85 +
        weatherSnap.snowWeight * 1.12;
      _tmpHemiSky
        .setHex(basePreset.hemiSky)
        .lerp(_duskHemiSky, timeSnap.twilight * 0.45)
        .lerp(_nightHemiSky, timeSnap.nightWeight * 0.82);
      _tmpHemiGround
        .setHex(basePreset.hemiGround)
        .lerp(_nightHemiGround, timeSnap.nightWeight * 0.72);
      this.hemiLight.color.copy(_tmpHemiSky);
      this.hemiLight.groundColor.copy(_tmpHemiGround);
      this.hemiLight.intensity =
        basePreset.hemiIntensity *
        weatherHemiFactor *
        (1 - timeSnap.nightWeight * 0.54);

      this.rimLight.color.copy(_dayRimColor).lerp(_nightRimColor, timeSnap.nightWeight);
      this.rimLight.intensity = 0.75 * (1 - timeSnap.nightWeight * 0.36);
      this.scene.environmentIntensity =
        1.0 - timeSnap.twilight * 0.18 - timeSnap.nightWeight * 0.72;
      this.renderer.toneMappingExposure =
        basePreset.exposure * (1 - timeSnap.nightWeight * 0.24);

      this.cargo.update(
        elapsed,
        this.environment.scanUniforms.uScanRadius.value,
        this.environment.scanUniforms.uScanStrength.value,
        this.environment.scanUniforms.uScanOrigin.value
      );
      this.crystals.update(
        elapsed,
        delta,
        this.environment.scanUniforms.uScanRadius.value,
        this.environment.scanUniforms.uScanStrength.value,
        this.environment.scanUniforms.uScanOrigin.value
      );
      this.worms.update(elapsed);
      this.equipment.update(
        delta,
        elapsed,
        this.character.position,
        this.character.yaw
      );

      // Invisible Wall Boundary Impact Feedback
      if (this.character.lastBoundaryImpact.hit) {
        const imp = this.character.lastBoundaryImpact;
        this.environment.triggerBoundaryImpact(imp.x, imp.z, imp.nx, imp.nz);
        this.boundaryNoticeTimer = 1.4;
        if (elapsed - this.lastBoundaryAudioTime > 0.65) {
          this.lastBoundaryAudioTime = elapsed;
          this.audio.playBoundaryThud();
        }
      } else if (this.boundaryNoticeTimer > 0) {
        this.boundaryNoticeTimer = Math.max(0, this.boundaryNoticeTimer - delta);
      }

      // Update Odradek terrain pulse wave
      if (this.scanActive) {
        this.scanProgress += delta;
        const duration = 2.6;
        if (this.scanProgress >= duration) {
          this.scanActive = false;
          this.environment.scanUniforms.uScanStrength.value = 0;
        } else {
          const t = this.scanProgress / duration;
          this.environment.scanUniforms.uScanRadius.value = t * 85;
          this.environment.scanUniforms.uScanStrength.value = Math.sin(t * Math.PI);
        }
      }

      // Keep directional sun/moon shadow frustum centered around the player
      const p = this.character.position;
      const celestial = timeSnap.celestialDir;
      this.keyLight.position.set(
        p.x + celestial.x * 44,
        p.y + celestial.y * 44,
        p.z + celestial.z * 44
      );
      this.keyLight.target.position.copy(p);
      this.keyLight.target.updateMatrixWorld();

      // One-Shot Coastal Overlook Music Trigger (plays once for 1m45s + 6s title card)
      if (!this.musicTriggered) {
        const distToMusic = Math.hypot(
          p.x - MUSIC_TRIGGER_POINT.x,
          p.z - MUSIC_TRIGGER_POINT.z
        );
        if (distToMusic <= MUSIC_TRIGGER_POINT.radius) {
          this.musicTriggered = true;
          this.musicBannerTimer = 6.0;
          this.audio.playCoastalTrackOnce(105);
          this.pushTelemetryNow();
        }
      } else if (this.musicBannerTimer > 0) {
        this.musicBannerTimer = Math.max(0, this.musicBannerTimer - delta);
        if (this.musicBannerTimer === 0) {
          this.pushTelemetryNow();
        }
      }

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

      // Update ocean surf, wind & rain audio proximity
      const distToWater = Math.max(0, p.z - shorelineZAt(p.x));
      this.audio.update(
        dt,
        distToWater,
        this.lastWeatherSnapshot.rainWeight,
        this.lastWeatherSnapshot.windStrength
      );

      // Throttled telemetry update (~8Hz)
      if (this.onTelemetry && elapsed - this.lastTelemetryTime > 0.12) {
        this.lastTelemetryTime = elapsed;
        this.pushTelemetryNow();
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

    this.cargo.dispose();
    this.worms.dispose();
    this.crystals.dispose();
    this.equipment.dispose();
    this.character.dispose();
    this.weather.dispose();
    this.trees.dispose();
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
