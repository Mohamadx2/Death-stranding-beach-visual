/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlOverlay, MenuMode } from './components/ControlOverlay';
import {
  BeachExperience,
  CameraMode,
  SceneTelemetry,
} from './scene/BeachExperience';
import {
  CraftableEquipmentId,
  GearServiceMode,
  GearSlot,
} from './scene/equipment';
import { AtmospherePresetId } from './scene/materials';
import {
  SaveSlotSummary,
  deleteSaveSlot,
  getSavedPlayerName,
  listSaveSlots,
  loadGameFromSlot,
  saveGameToSlot,
} from './scene/saveSystem';
import { TimeOfDayMode } from './scene/timeOfDay';
import { WeatherMode } from './scene/weather';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const experienceRef = useRef<BeachExperience | null>(null);

  const [preset, setPreset] = useState<AtmospherePresetId>('ash');
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('auto');
  const [timeMode, setTimeMode] = useState<TimeOfDayMode>('auto');
  const [cameraMode, setCameraMode] = useState<CameraMode>('shoulder');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [menuMode, setMenuMode] = useState<MenuMode>('closed');
  const [saveSlots, setSaveSlots] = useState<SaveSlotSummary[]>(() => listSaveSlots());
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [telemetry, setTelemetry] = useState<SceneTelemetry>(() => ({
    x: 0,
    z: 18,
    elevation: 0.9,
    headingDeg: 180,
    speed: 0,
    isWading: false,
    isClimbing: false,
    isSlipping: false,
    climbSlopeDeg: 0,
    health: 100,
    maxHealth: 100,
    playerName: getSavedPlayerName(),
    stamina: 100,
    staminaExhausted: false,
    staminaCooldownRemaining: 0,
    cold: 14,
    bootsDurability: 100,
    suitDurability: 100,
    lastFallDamage: null,
    rescueNotice: null,
    insideBuilding: false,
    buildingName: null,
    nearbyUmbrellaStation: null,
    wormsInPouch: 0,
    maxWormsInPouch: 5,
    nearbyWorm: false,
    refugeHutPos: { x: -20, z: 128 },
    playableRadius: 420,
    boundaryHit: false,
    weather: {
      mode: 'auto',
      active: 'clear',
      target: 'clear',
      transitioning: false,
    },
    timeOfDay: {
      mode: 'auto',
      hour: 11.2,
      formattedTime: '11:12',
      phaseLabel: 'Daylight',
      daylight: 1,
    },
    music: {
      triggered: false,
      bannerVisible: false,
      title: 'Bones of the Tide',
      subtitle: 'Coastal Overlook · 01:45',
      triggerPos: { x: -34, z: 62 },
      customTrackName: null,
      customPlaying: false,
    },
    cargo: {
      total: 12,
      carried: 0,
      packCarried: 0,
      cartCarried: 0,
      maxCarry: 6,
      maxCartCarry: 0,
      delivered: 0,
      carriedWeightKg: 0,
      cartWeightKg: 0,
      effectiveWeightKg: 0,
      nearbyCargoLabel: null,
      nearbyCargoWeightKg: null,
      backpackFull: false,
      nearDeliveryPost: false,
      deliveryPostPos: { x: 14, z: 36 },
      worldCargos: [],
    },
    nearbyCrystalYield: null,
    equipment: {
      crystals: 0,
      laddersInPack: 1,
      anchorsInPack: 0,
      deployedLadders: 0,
      deployedAnchors: 0,
      hasCart: false,
      cartAttached: false,
      nearAnchorAssist: false,
      onLadder: false,
    },
  }));

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const exp = new BeachExperience({
      container,
      onTelemetry: (next) => setTelemetry(next),
      onContextLost: (lost) => setContextLost(lost),
    });
    experienceRef.current = exp;

    return () => {
      exp.dispose();
      experienceRef.current = null;
    };
  }, []);

  useEffect(() => {
    experienceRef.current?.setPaused(menuMode !== 'closed');
  }, [menuMode]);

  useEffect(() => {
    if (!saveNotice) return;
    const timer = window.setTimeout(() => setSaveNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        setSaveSlots(listSaveSlots());
        setMenuMode((prev) => {
          if (prev === 'closed') return 'pause';
          if (prev === 'pause') return 'closed';
          return prev;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSelectPreset = useCallback((next: AtmospherePresetId) => {
    setPreset(next);
    experienceRef.current?.setAtmosphere(next);
  }, []);

  const handleSelectWeather = useCallback((next: WeatherMode) => {
    setWeatherMode(next);
    experienceRef.current?.setWeatherMode(next);
  }, []);

  const handleSelectTimeMode = useCallback((next: TimeOfDayMode) => {
    setTimeMode(next);
    experienceRef.current?.setTimeMode(next);
  }, []);

  const handleSelectCamera = useCallback((mode: CameraMode) => {
    setCameraMode(mode);
    experienceRef.current?.setCameraMode(mode);
  }, []);

  const handleTriggerScan = useCallback(() => {
    experienceRef.current?.triggerScan();
  }, []);

  const handleToggleAudio = useCallback(() => {
    if (!experienceRef.current) return;
    const enabled = experienceRef.current.toggleAudio();
    setAudioEnabled(enabled);
  }, []);

  const handleInteractCargo = useCallback(() => {
    experienceRef.current?.interactCargo();
  }, []);

  const handleEatWorm = useCallback(() => {
    experienceRef.current?.eatWorm();
  }, []);

  const handleResetCargoRun = useCallback(() => {
    experienceRef.current?.resetCargoRun();
  }, []);

  const handleCraftEquipment = useCallback((id: CraftableEquipmentId) => {
    experienceRef.current?.craftEquipment(id);
  }, []);

  const handleDeployLadder = useCallback(() => {
    experienceRef.current?.deployLadder();
  }, []);

  const handleDeployAnchor = useCallback(() => {
    experienceRef.current?.deployAnchor();
  }, []);

  const handleToggleCart = useCallback(() => {
    experienceRef.current?.toggleCartHitch();
  }, []);

  const handleShiftToCart = useCallback(() => {
    experienceRef.current?.shiftCargoToCart();
  }, []);

  const handleServiceGear = useCallback((slot: GearSlot, mode: GearServiceMode) => {
    experienceRef.current?.serviceGearAtStation(slot, mode);
  }, []);

  const handleUploadMusic = useCallback((file: File) => {
    void experienceRef.current?.setCustomMusicFile(file);
  }, []);

  const handleToggleCustomMusic = useCallback(() => {
    experienceRef.current?.toggleCustomMusicPlayback();
  }, []);

  const handleClearCustomMusic = useCallback(() => {
    experienceRef.current?.clearCustomMusic();
  }, []);

  const handleTouchMove = useCallback((x: number, y: number) => {
    experienceRef.current?.setTouchJoystick(x, y);
  }, []);

  const handleJump = useCallback(() => {
    experienceRef.current?.triggerJump();
  }, []);

  const handleOpenMenu = useCallback(() => {
    setSaveSlots(listSaveSlots());
    setMenuMode('pause');
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMenuMode('closed');
  }, []);

  const handleExitToTitle = useCallback(() => {
    setSaveSlots(listSaveSlots());
    setMenuMode('title');
  }, []);

  const handleNewGame = useCallback(() => {
    if (!experienceRef.current) return;
    experienceRef.current.startNewGame();
    experienceRef.current.setAtmosphere('ash');
    experienceRef.current.setWeatherMode('auto');
    setPreset('ash');
    setWeatherMode('auto');
    setTimeMode('auto');
    setMenuMode('closed');
    setSaveNotice('Started new expedition');
  }, []);

  const handleSaveSlot = useCallback((slotId: string, label: string) => {
    if (!experienceRef.current) return;
    const data = experienceRef.current.exportSaveData(label);
    const ok = saveGameToSlot(slotId, data);
    setSaveSlots(listSaveSlots());
    setSaveNotice(ok ? `Saved to ${label}` : 'Save failed (storage unavailable)');
  }, []);

  const handleLoadSlot = useCallback((slotId: string) => {
    const data = loadGameFromSlot(slotId);
    if (!data || !experienceRef.current) return;
    const loaded = experienceRef.current.loadSaveData(data);
    setPreset(loaded.preset);
    setWeatherMode(loaded.weatherMode);
    setTimeMode(loaded.timeMode);
    setSaveSlots(listSaveSlots());
    setMenuMode('closed');
    setSaveNotice(`Loaded ${data.slotLabel}`);
  }, []);

  const handleDeleteSlot = useCallback((slotId: string) => {
    deleteSaveSlot(slotId);
    setSaveSlots(listSaveSlots());
    setSaveNotice('Save slot cleared');
  }, []);

  const handleChangePlayerName = useCallback((name: string) => {
    experienceRef.current?.setPlayerName(name);
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#14181d]">
      <div ref={mountRef} className="fixed inset-0 cursor-grab active:cursor-grabbing" />
      <ControlOverlay
        telemetry={telemetry}
        preset={preset}
        weatherMode={weatherMode}
        timeMode={timeMode}
        cameraMode={cameraMode}
        audioEnabled={audioEnabled}
        contextLost={contextLost}
        menuMode={menuMode}
        saveSlots={saveSlots}
        saveNotice={saveNotice}
        onSelectPreset={handleSelectPreset}
        onSelectWeather={handleSelectWeather}
        onSelectTimeMode={handleSelectTimeMode}
        onSelectCamera={handleSelectCamera}
        onTriggerScan={handleTriggerScan}
        onToggleAudio={handleToggleAudio}
        onUploadMusic={handleUploadMusic}
        onToggleCustomMusic={handleToggleCustomMusic}
        onClearCustomMusic={handleClearCustomMusic}
        onInteractCargo={handleInteractCargo}
        onEatWorm={handleEatWorm}
        onResetCargoRun={handleResetCargoRun}
        onCraftEquipment={handleCraftEquipment}
        onDeployLadder={handleDeployLadder}
        onDeployAnchor={handleDeployAnchor}
        onToggleCart={handleToggleCart}
        onShiftToCart={handleShiftToCart}
        onServiceGear={handleServiceGear}
        onTouchMove={handleTouchMove}
        onJump={handleJump}
        onOpenMenu={handleOpenMenu}
        onCloseMenu={handleCloseMenu}
        onExitToTitle={handleExitToTitle}
        onNewGame={handleNewGame}
        onSaveSlot={handleSaveSlot}
        onLoadSlot={handleLoadSlot}
        onDeleteSlot={handleDeleteSlot}
        onChangePlayerName={handleChangePlayerName}
      />
    </main>
  );
}

