import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Anchor,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Compass,
  Flame,
  FolderOpen,
  Hammer,
  Heart,
  LogOut,
  Menu,
  Moon,
  Music,
  Package,
  Play,
  Radio,
  RotateCcw,
  Save,
  Snowflake,
  Sparkles,
  Square,
  Sun,
  Sunrise,
  ThermometerSnowflake,
  Trash2,
  Upload,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { CameraMode, SceneTelemetry } from '../scene/BeachExperience';
import { CraftableEquipmentId, EQUIPMENT_COSTS } from '../scene/equipment';
import { ATMOSPHERE_PRESETS, AtmospherePresetId } from '../scene/materials';
import { SaveSlotSummary } from '../scene/saveSystem';
import { shorelineZAt } from '../scene/terrain';
import { TimeOfDayMode } from '../scene/timeOfDay';
import { WeatherMode } from '../scene/weather';

export type MenuMode = 'closed' | 'pause' | 'title';

interface ControlOverlayProps {
  telemetry: SceneTelemetry;
  preset: AtmospherePresetId;
  weatherMode: WeatherMode;
  timeMode: TimeOfDayMode;
  cameraMode: CameraMode;
  audioEnabled: boolean;
  contextLost: boolean;
  menuMode: MenuMode;
  saveSlots: SaveSlotSummary[];
  saveNotice: string | null;
  onSelectPreset: (preset: AtmospherePresetId) => void;
  onSelectWeather: (mode: WeatherMode) => void;
  onSelectTimeMode: (mode: TimeOfDayMode) => void;
  onSelectCamera: (mode: CameraMode) => void;
  onTriggerScan: () => void;
  onToggleAudio: () => void;
  onUploadMusic: (file: File) => void;
  onToggleCustomMusic: () => void;
  onClearCustomMusic: () => void;
  onInteractCargo: () => void;
  onEatWorm: () => void;
  onResetCargoRun: () => void;
  onCraftEquipment: (id: CraftableEquipmentId) => void;
  onDeployLadder: () => void;
  onDeployAnchor: () => void;
  onToggleCart: () => void;
  onShiftToCart: () => void;
  onTouchMove: (x: number, y: number) => void;
  onJump: () => void;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onExitToTitle: () => void;
  onNewGame: () => void;
  onSaveSlot: (slotId: string, label: string) => void;
  onLoadSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
  onChangePlayerName: (name: string) => void;
}

const MAP_SIZE = 148;
const MAP_CENTER = MAP_SIZE / 2;
const MAP_WORLD_SPAN = 310;
const MAP_RADIUS_PX = 64;

function worldToMap(wx: number, wz: number): [number, number] {
  const scale = MAP_RADIUS_PX / MAP_WORLD_SPAN;
  return [MAP_CENTER + wx * scale, MAP_CENTER + wz * scale];
}

function formatSavedTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const ControlOverlay: React.FC<ControlOverlayProps> = ({
  telemetry,
  preset,
  weatherMode,
  timeMode,
  cameraMode,
  audioEnabled,
  contextLost,
  menuMode,
  saveSlots,
  saveNotice,
  onSelectPreset,
  onSelectWeather,
  onSelectTimeMode,
  onSelectCamera,
  onTriggerScan,
  onToggleAudio,
  onUploadMusic,
  onToggleCustomMusic,
  onClearCustomMusic,
  onInteractCargo,
  onEatWorm,
  onResetCargoRun,
  onCraftEquipment,
  onDeployLadder,
  onDeployAnchor,
  onToggleCart,
  onShiftToCart,
  onTouchMove,
  onJump,
  onOpenMenu,
  onCloseMenu,
  onExitToTitle,
  onNewGame,
  onSaveSlot,
  onLoadSlot,
  onDeleteSlot,
  onChangePlayerName,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [fabricateOpen, setFabricateOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(telemetry.playerName);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameDraft(telemetry.playerName);
  }, [telemetry.playerName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (menuMode !== 'closed') return;

      if (e.code === 'KeyH') {
        setCollapsed((prev) => !prev);
      }
      if (e.code === 'KeyB') {
        setFabricateOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuMode]);

  const oceanPolygonPoints = useMemo(() => {
    const pts: string[] = [];
    for (let wx = -MAP_WORLD_SPAN; wx <= MAP_WORLD_SPAN; wx += 14) {
      const wz = shorelineZAt(wx);
      const [mx, my] = worldToMap(wx, wz);
      pts.push(`${mx.toFixed(1)},${my.toFixed(1)}`);
    }
    pts.push(`${MAP_SIZE},0`, `0,0`);
    return pts.join(' ');
  }, []);

  const greenPolygonPoints = useMemo(() => {
    const pts: string[] = [];
    for (let wx = -MAP_WORLD_SPAN; wx <= MAP_WORLD_SPAN; wx += 14) {
      const wz = shorelineZAt(wx) + 12;
      const [mx, my] = worldToMap(wx, wz);
      pts.push(`${mx.toFixed(1)},${my.toFixed(1)}`);
    }
    pts.push(`${MAP_SIZE},${MAP_SIZE}`, `0,${MAP_SIZE}`);
    return pts.join(' ');
  }, []);

  const desertPolygonPoints = useMemo(() => {
    const pts: string[] = [];
    for (let wx = -MAP_WORLD_SPAN; wx <= MAP_WORLD_SPAN; wx += 14) {
      const wz = shorelineZAt(wx) + 135;
      const [mx, my] = worldToMap(wx, wz);
      pts.push(`${mx.toFixed(1)},${my.toFixed(1)}`);
    }
    pts.push(`${MAP_SIZE},${MAP_SIZE}`, `0,${MAP_SIZE}`);
    return pts.join(' ');
  }, []);

  const shorelinePathD = useMemo(() => {
    const segments: string[] = [];
    for (let wx = -MAP_WORLD_SPAN; wx <= MAP_WORLD_SPAN; wx += 12) {
      const wz = shorelineZAt(wx);
      const [mx, my] = worldToMap(wx, wz);
      segments.push(`${wx === -MAP_WORLD_SPAN ? 'M' : 'L'}${mx.toFixed(1)},${my.toFixed(1)}`);
    }
    return segments.join(' ');
  }, []);

  const { cargo, equipment } = telemetry;
  const showCrystalPrompt =
    telemetry.nearbyCrystalYield !== null &&
    (!cargo.nearbyCargoLabel || cargo.backpackFull);
  const showWormPrompt =
    !showCrystalPrompt &&
    telemetry.nearbyWorm &&
    (!cargo.nearbyCargoLabel || cargo.backpackFull) &&
    !(cargo.nearDeliveryPost && cargo.carried > 0);
  const distToPost = Math.round(
    Math.hypot(
      telemetry.x - cargo.deliveryPostPos.x,
      telemetry.z - cargo.deliveryPostPos.z
    )
  );
  const allDelivered = cargo.delivered >= cargo.total;

  // Player, Post, Refuge & Music Trigger coordinates on tactical minimap
  const [px, py] = worldToMap(telemetry.x, telemetry.z);
  const [postX, postY] = worldToMap(
    cargo.deliveryPostPos.x,
    cargo.deliveryPostPos.z
  );
  const [refugeX, refugeY] = worldToMap(
    telemetry.refugeHutPos.x,
    telemetry.refugeHutPos.z
  );
  const [musicX, musicY] = worldToMap(
    telemetry.music.triggerPos.x,
    telemetry.music.triggerPos.z
  );
  const yawRad = (telemetry.headingDeg * Math.PI) / 180;
  const dirX = Math.sin(yawRad);
  const dirY = Math.cos(yawRad);
  const coneLen = 14;
  const coneSpread = 0.48;
  const coneLeftX = px + Math.sin(yawRad - coneSpread) * coneLen;
  const coneLeftY = py + Math.cos(yawRad - coneSpread) * coneLen;
  const coneRightX = px + Math.sin(yawRad + coneSpread) * coneLen;
  const coneRightY = py + Math.cos(yawRad + coneSpread) * coneLen;

  const boundaryRadiusPx =
    (telemetry.playableRadius / MAP_WORLD_SPAN) * MAP_RADIUS_PX;
  const healthPct = Math.round(
    (telemetry.health / Math.max(1, telemetry.maxHealth)) * 100
  );
  const staminaPct = Math.round(telemetry.stamina);
  const coldPct = Math.round(telemetry.cold);

  return (
    <>
      {menuMode !== 'title' && (
        <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
          {/* Top Row: Left Telemetry/Health/Stamina/Weight & Right Tactical Minimap */}
          <div className="flex w-full items-start justify-between gap-3">
            <header className="inline-flex w-fit max-w-[345px] flex-col gap-1.5 rounded-lg border border-white/12 bg-[#0e1217]/86 px-3.5 py-2.5 shadow-lg">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-sm font-semibold tracking-tight text-slate-100 whitespace-nowrap">
                    The Seam
                  </h1>
                  <span className="truncate rounded bg-white/8 px-1.5 py-0.5 text-[11px] font-medium text-sky-200">
                    {telemetry.playerName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono-tabular text-xs text-amber-300 whitespace-nowrap">
                    {cargo.delivered}/{cargo.total} Delivered
                  </span>
                  <button
                    type="button"
                    onClick={onOpenMenu}
                    title="Open Expedition Menu [Esc]"
                    className="pointer-events-auto flex items-center gap-1 rounded border border-white/15 bg-white/8 px-2 py-0.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-white/30 hover:bg-white/15"
                  >
                    <Menu className="h-3 w-3" />
                    <span>Menu</span>
                  </button>
                </div>
              </div>

              {/* Carry Frame, Towed Cart & Chiral Crystals */}
              <div className="font-mono-tabular flex items-center justify-between gap-3 text-xs text-slate-200">
                <span>
                  Pack {cargo.packCarried}/{cargo.maxCarry}
                  {equipment.hasCart && equipment.cartAttached
                    ? ` · Cart ${cargo.cartCarried}/${cargo.maxCartCarry}`
                    : ''}
                </span>
                <span className="text-slate-300">
                  {cargo.effectiveWeightKg.toFixed(1)} kg
                  {cargo.cartWeightKg > 0
                    ? ` (${cargo.carriedWeightKg.toFixed(0)} raw)`
                    : ''}
                </span>
              </div>

              <div className="font-mono-tabular flex items-center justify-between gap-3 text-[11px]">
                <span className="flex items-center gap-1 font-medium text-amber-300">
                  <Sparkles className="h-3 w-3" />
                  {equipment.crystals} cg Crystals
                </span>
                <span className="text-rose-200">
                  Worms {telemetry.wormsInPouch}/{telemetry.maxWormsInPouch}
                </span>
              </div>

              {(equipment.nearAnchorAssist || equipment.onLadder || telemetry.isClimbing) && (
                <div className="font-mono-tabular text-[11px] text-sky-300">
                  {equipment.onLadder
                    ? 'Bridge Ladder'
                    : telemetry.isClimbing
                      ? `Hand Climbing ${telemetry.climbSlopeDeg}°${
                          equipment.nearAnchorAssist ? ' · Anchor Assist' : ''
                        }`
                      : 'Anchor Assist'}
                </div>
              )}

              {/* Health Bar */}
              <div className="flex flex-col gap-1 pt-0.5">
                <div className="font-mono-tabular flex items-center justify-between text-[11px]">
                  <span
                    className={`flex items-center gap-1 ${
                      healthPct < 30
                        ? 'font-medium text-rose-300'
                        : 'text-slate-300'
                    }`}
                  >
                    <Heart className="h-3 w-3 text-emerald-400" />
                    <span>Health</span>
                  </span>
                  <span className="text-slate-300">
                    {Math.round(telemetry.health)}/{telemetry.maxHealth}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-sm bg-white/12">
                  <div
                    className={`h-full transition-[width] duration-150 ${
                      healthPct < 25
                        ? 'bg-rose-500'
                        : healthPct < 55
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, healthPct))}%` }}
                  />
                </div>
              </div>

              {/* Stamina Bar & Exhaustion Cooldown */}
              <div className="flex flex-col gap-1 pt-0.5">
                <div className="font-mono-tabular flex items-center justify-between text-[11px]">
                  <span
                    className={
                      telemetry.staminaExhausted
                        ? 'font-medium text-amber-300'
                        : 'text-slate-300'
                    }
                  >
                    {telemetry.staminaExhausted
                      ? telemetry.staminaCooldownRemaining > 0
                        ? `Cooldown ${telemetry.staminaCooldownRemaining.toFixed(1)}s`
                        : 'Recovering'
                      : 'Stamina'}
                  </span>
                  <span className="text-slate-300">{staminaPct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-sm bg-white/12">
                  <div
                    className={`h-full transition-[width] duration-100 ${
                      telemetry.staminaExhausted
                        ? 'bg-amber-400'
                        : staminaPct < 28
                          ? 'bg-amber-300'
                          : 'bg-sky-400'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, staminaPct))}%` }}
                  />
                </div>
              </div>

          {/* Cold Feeling / Thermal Exposure Bar (decreases inside sheltered buildings) */}
          <div className="flex flex-col gap-1 pt-0.5">
            <div className="font-mono-tabular flex items-center justify-between text-[11px]">
              <span
                className={`flex items-center gap-1 ${
                  telemetry.insideBuilding
                    ? 'font-medium text-amber-300'
                    : coldPct >= 70
                      ? 'font-medium text-cyan-300'
                      : 'text-slate-300'
                }`}
              >
                {telemetry.insideBuilding ? (
                  <>
                    <Flame className="h-3 w-3" />
                    <span>Warming · {telemetry.buildingName}</span>
                  </>
                ) : (
                  <>
                    <ThermometerSnowflake className="h-3 w-3" />
                    <span>{coldPct >= 70 ? 'Freezing' : 'Cold'}</span>
                  </>
                )}
              </span>
              <span className="text-slate-300">{coldPct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-sm bg-white/12">
              <div
                className={`h-full transition-[width] duration-150 ${
                  telemetry.insideBuilding
                    ? 'bg-amber-400'
                    : coldPct >= 70
                      ? 'bg-cyan-300'
                      : 'bg-sky-300/80'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, coldPct))}%` }}
              />
            </div>
          </div>

          <div className="font-mono-tabular flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] text-slate-300">
            <span>{telemetry.x.toFixed(0)}E</span>
            <span aria-hidden="true">·</span>
            <span>{telemetry.z.toFixed(0)}S</span>
            <span aria-hidden="true">·</span>
            <span>{telemetry.elevation.toFixed(1)}m</span>
            <span aria-hidden="true">·</span>
            <span>{String(telemetry.headingDeg).padStart(3, '0')}°</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                telemetry.weather.active === 'rainy'
                  ? 'text-sky-300'
                  : telemetry.weather.active === 'snowy'
                    ? 'text-slate-100'
                    : 'text-amber-200'
              }
            >
              {telemetry.weather.active === 'clear'
                ? 'Clear'
                : telemetry.weather.active === 'rainy'
                  ? 'Rainy'
                  : 'Snowy'}
              {telemetry.weather.transitioning
                ? ` → ${
                    telemetry.weather.target === 'clear'
                      ? 'Clear'
                      : telemetry.weather.target === 'rainy'
                        ? 'Rainy'
                        : 'Snowy'
                  }`
                : ''}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={
                telemetry.timeOfDay.phaseLabel === 'Night'
                  ? 'text-indigo-200'
                  : telemetry.timeOfDay.phaseLabel === 'Daylight'
                    ? 'text-slate-200'
                    : 'text-amber-300'
              }
            >
              {telemetry.timeOfDay.formattedTime} · {telemetry.timeOfDay.phaseLabel}
            </span>
            {telemetry.isWading && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-sky-300">Shallows</span>
              </>
            )}
          </div>

          <div className="text-[11px] leading-snug text-slate-400">
            {allDelivered
              ? 'All lost cargo delivered to the Wooden Outpost.'
              : cargo.carried > 0
                ? `Deliver to Wooden Post (${distToPost}m away)`
                : 'Locate Resin & Bridges cargo on the shore and hills'}
          </div>
        </header>

        {/* Top-Right Compact Tactical Radar / Minimap */}
        <aside
          aria-label="Coastal sector map"
          className="flex flex-col items-center gap-1 rounded-lg border border-white/12 bg-[#0e1217]/86 p-2 shadow-lg"
        >
          <div className="relative">
            <svg
              width={MAP_SIZE}
              height={MAP_SIZE}
              viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
              className="block"
            >
              <defs>
                <clipPath id="sector-clip">
                  <circle
                    cx={MAP_CENTER}
                    cy={MAP_CENTER}
                    r={MAP_RADIUS_PX}
                  />
                </clipPath>
              </defs>

              <g clipPath="url(#sector-clip)">
                {/* Volcanic ground background */}
                <rect
                  x={0}
                  y={0}
                  width={MAP_SIZE}
                  height={MAP_SIZE}
                  fill="#171b20"
                />
                {/* Expanded mossy green coastal hills & grassy hollows */}
                <polygon
                  points={greenPolygonPoints}
                  fill="#233020"
                />
                {/* Inland desert-rock mountain foothills zone */}
                <polygon
                  points={desertPolygonPoints}
                  fill="#2c241d"
                />
                {/* Ocean water north of shoreline */}
                <polygon
                  points={oceanPolygonPoints}
                  fill="#1e3344"
                />
                {/* Shoreline foam contour */}
                <path
                  d={shorelinePathD}
                  fill="none"
                  stroke="#6b8ea6"
                  strokeWidth={1.2}
                  strokeOpacity={0.75}
                />
                {/* Inner range ring */}
                <circle
                  cx={MAP_CENTER}
                  cy={MAP_CENTER}
                  r={boundaryRadiusPx * 0.5}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity={0.12}
                  strokeDasharray="2 3"
                />
                {/* Outer 210m Playable Boundary Wall */}
                <circle
                  cx={MAP_CENTER}
                  cy={MAP_CENTER}
                  r={boundaryRadiusPx}
                  fill="none"
                  stroke={telemetry.boundaryHit ? '#6dd4ff' : '#94a3b8'}
                  strokeOpacity={telemetry.boundaryHit ? 0.95 : 0.35}
                  strokeWidth={telemetry.boundaryHit ? 1.8 : 1.1}
                />

                {/* Uncollected Cargo Blips */}
                {cargo.worldCargos.map((c) => {
                  const [cx, cy] = worldToMap(c.x, c.z);
                  return (
                    <rect
                      key={c.id}
                      x={cx - 2.3}
                      y={cy - 2.3}
                      width={4.6}
                      height={4.6}
                      rx={0.8}
                      fill={c.kind === 'resin' ? '#f5b83d' : '#6dd4ff'}
                    />
                  );
                })}

                {/* Uncollected Music Overlook Waypoint (hides once triggered) */}
                {!telemetry.music.triggered && (
                  <g transform={`translate(${musicX}, ${musicY})`}>
                    <circle
                      cx={0}
                      cy={0}
                      r={5}
                      fill="none"
                      stroke="#c4b5fd"
                      strokeWidth={1.1}
                      strokeOpacity={0.85}
                    />
                    <circle cx={0} cy={0} r={1.8} fill="#c4b5fd" />
                  </g>
                )}

                {/* Wooden Delivery Post Marker */}
                <g transform={`translate(${postX}, ${postY})`}>
                  <rect
                    x={-4.5}
                    y={-4.5}
                    width={9}
                    height={9}
                    rx={1.5}
                    fill="#14181d"
                    stroke="#f59e24"
                    strokeWidth={1.5}
                  />
                  <circle cx={0} cy={0} r={1.8} fill="#f59e24" />
                </g>

                {/* Inland Mountain Refuge Shelter Marker */}
                <g transform={`translate(${refugeX}, ${refugeY})`}>
                  <rect
                    x={-4}
                    y={-4}
                    width={8}
                    height={8}
                    rx={1.5}
                    fill="#14181d"
                    stroke="#fb923c"
                    strokeWidth={1.3}
                  />
                  <circle cx={0} cy={0} r={1.6} fill="#fb923c" />
                </g>

                {/* Player Heading Cone */}
                <polygon
                  points={`${px},${py} ${coneLeftX.toFixed(1)},${coneLeftY.toFixed(1)} ${coneRightX.toFixed(1)},${coneRightY.toFixed(1)}`}
                  fill="#ffffff"
                  fillOpacity={0.28}
                />
                {/* Player Position Dot */}
                <circle
                  cx={px}
                  cy={py}
                  r={3.2}
                  fill="#ffffff"
                  stroke="#0e1217"
                  strokeWidth={1.2}
                />
                <line
                  x1={px}
                  y1={py}
                  x2={px + dirX * 7}
                  y2={py + dirY * 7}
                  stroke="#ffffff"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                />
              </g>

              {/* Outer Compass Frame */}
              <circle
                cx={MAP_CENTER}
                cy={MAP_CENTER}
                r={MAP_RADIUS_PX}
                fill="none"
                stroke="#ffffff"
                strokeOpacity={0.18}
                strokeWidth={1}
              />
              <text
                x={MAP_CENTER}
                y={10}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
              >
                SEA
              </text>
            </svg>
          </div>

          <div className="font-mono-tabular flex w-full items-center justify-between px-1 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 bg-amber-400" />
              Post {distToPost}m
            </span>
            <span>{telemetry.playableRadius}m Zone</span>
          </div>
        </aside>
      </div>

      {/* Context Lost Recovery Notice */}
      {contextLost && (
        <div className="pointer-events-auto mx-auto rounded-lg border border-white/15 bg-[#14181d]/95 px-4 py-3 text-sm text-slate-200">
          Graphics context paused. Restoring coastal viewport...
        </div>
      )}

      {/* One-Shot Music Track Title Card (shows briefly when reaching the overlook, then vanishes) */}
      <div
        className={`pointer-events-none self-start transition-all duration-700 ${
          telemetry.music.bannerVisible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-3 opacity-0'
        }`}
      >
        {telemetry.music.bannerVisible && (
          <div className="flex items-center gap-3 rounded-lg border border-white/12 border-l-2 border-l-amber-300 bg-[#0e1217]/88 px-4 py-2.5 shadow-xl">
            <Music className="h-4 w-4 text-amber-300" />
            <div className="flex flex-col">
              <span className="font-mono-tabular text-[10px] tracking-widest text-slate-400 uppercase">
                Now Playing
              </span>
              <span className="text-sm font-semibold tracking-tight text-slate-100">
                {telemetry.music.title}
              </span>
              <span className="font-mono-tabular text-[11px] text-slate-400">
                {telemetry.music.subtitle}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Subtle Bottom Action Prompts (Cargo Pickup / Delivery / Invisible Wall) */}
      <div className="pointer-events-none flex flex-col items-center gap-2">
        {telemetry.boundaryHit && (
          <div className="rounded-md border border-sky-400/40 bg-[#0e1217]/90 px-3.5 py-1.5 text-xs font-medium text-sky-200">
            Perimeter Boundary Reached
          </div>
        )}

        {showCrystalPrompt && (
          <button
            type="button"
            onClick={onInteractCargo}
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-amber-300/60 bg-[#12161c]/94 px-4 py-2 text-xs font-medium text-amber-200 shadow-lg transition-colors hover:bg-amber-500/20"
          >
            <Sparkles className="h-4 w-4 text-amber-300" />
            <span>
              [E] Harvest Chiral Crystals (+{telemetry.nearbyCrystalYield} cg)
            </span>
          </button>
        )}

        {showWormPrompt && (
          <button
            type="button"
            onClick={onInteractCargo}
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-rose-300/55 bg-[#12161c]/94 px-4 py-2 text-xs font-medium text-rose-200 shadow-lg transition-colors hover:bg-rose-500/20"
          >
            <span>
              {telemetry.wormsInPouch < telemetry.maxWormsInPouch
                ? `[E] Catch Ground Worm (${telemetry.wormsInPouch}/${telemetry.maxWormsInPouch})`
                : '[E] Eat Ground Worm (+Health, +Stamina)'}
            </span>
          </button>
        )}

        {!showCrystalPrompt && !showWormPrompt && cargo.nearbyCargoLabel && cargo.backpackFull && (
          <div className="rounded-lg border border-amber-400/40 bg-[#12161c]/92 px-4 py-2 text-xs font-medium text-amber-200 shadow-lg">
            Load Full ({cargo.carried}/{cargo.maxCarry + cargo.maxCartCarry}) — Deliver at Wooden Post
          </div>
        )}

        {!showCrystalPrompt && !showWormPrompt && cargo.nearbyCargoLabel && !cargo.backpackFull && (
          <button
            type="button"
            onClick={onInteractCargo}
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-amber-400/50 bg-[#12161c]/92 px-4 py-2 text-xs font-medium text-amber-200 shadow-lg transition-colors hover:bg-amber-500/20"
          >
            <Package className="h-4 w-4" />
            <span>
              [E] Collect {cargo.nearbyCargoLabel}
              {cargo.nearbyCargoWeightKg !== null
                ? ` (${cargo.nearbyCargoWeightKg.toFixed(1)} kg)`
                : ''}
            </span>
          </button>
        )}

        {!showCrystalPrompt &&
          !showWormPrompt &&
          !cargo.nearbyCargoLabel &&
          cargo.nearDeliveryPost &&
          cargo.carried > 0 && (
            <button
              type="button"
              onClick={onInteractCargo}
              className="pointer-events-auto flex items-center gap-2 rounded-lg border border-emerald-400/50 bg-[#12161c]/92 px-4 py-2 text-xs font-medium text-emerald-200 shadow-lg transition-colors hover:bg-emerald-500/20"
            >
              <Package className="h-4 w-4" />
              <span>
                [E] Deliver {cargo.carried} Cargo ({cargo.carriedWeightKg.toFixed(1)} kg)
              </span>
            </button>
          )}

        {equipment.hasCart &&
          equipment.cartAttached &&
          cargo.packCarried > 0 &&
          cargo.cartCarried < cargo.maxCartCarry && (
            <button
              type="button"
              onClick={onShiftToCart}
              className="pointer-events-auto flex items-center gap-2 rounded-lg border border-sky-400/45 bg-[#12161c]/92 px-3.5 py-1.5 text-xs font-medium text-sky-200 shadow-lg transition-colors hover:bg-sky-500/20"
            >
              <span>[T] Shift Pack Cargo to Towed Cart (-75% Load)</span>
            </button>
          )}

        {allDelivered && (
          <button
            type="button"
            onClick={onResetCargoRun}
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/20 bg-[#12161c]/92 px-4 py-2 text-xs font-medium text-slate-100 shadow-lg transition-colors hover:bg-white/15"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>New Cargo Run</span>
          </button>
        )}

        {/* Chiral Equipment Fabrication Drawer (toggled via [B] or Fabricate button) */}
        {fabricateOpen && (
          <section
            aria-label="Field Equipment Fabrication"
            className="pointer-events-auto w-full max-w-[680px] rounded-xl border border-amber-400/30 bg-[#0e1217]/95 p-3.5 shadow-2xl"
          >
            <div className="mb-2.5 flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <Hammer className="h-4 w-4 text-amber-300" />
                <h2 className="text-xs font-semibold tracking-wide text-slate-100 uppercase">
                  Chiral Fabrication
                </h2>
              </div>
              <div className="font-mono-tabular flex items-center gap-3 text-xs">
                <span className="text-amber-300">{equipment.crystals} cg Available</span>
                <button
                  type="button"
                  onClick={() => setFabricateOpen(false)}
                  className="rounded px-2 py-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  Close [B]
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {/* Extendable Ladder */}
              <div className="flex flex-col justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <div>
                  <div className="flex items-center justify-between text-xs font-medium text-slate-100">
                    <span>Extendable Ladder</span>
                    <span className="font-mono-tabular text-amber-300">
                      {EQUIPMENT_COSTS.ladder} cg
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-400">
                    4.8m bridge over rocks, logs, and steep terrain.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={equipment.crystals < EQUIPMENT_COSTS.ladder}
                    onClick={() => onCraftEquipment('ladder')}
                    className="flex-1 rounded-md border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Fabricate
                  </button>
                  {equipment.laddersInPack > 0 && (
                    <button
                      type="button"
                      onClick={onDeployLadder}
                      className="rounded-md border border-sky-400/40 bg-sky-500/15 px-2.5 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/25"
                    >
                      [1] Place ({equipment.laddersInPack})
                    </button>
                  )}
                </div>
              </div>

              {/* Climbing Anchor */}
              <div className="flex flex-col justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <div>
                  <div className="flex items-center justify-between text-xs font-medium text-slate-100">
                    <span>Climbing Anchor</span>
                    <span className="font-mono-tabular text-amber-300">
                      {EQUIPMENT_COSTS.anchor} cg
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-400">
                    14.5m rope anchor: cuts stamina drain by 55%.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={equipment.crystals < EQUIPMENT_COSTS.anchor}
                    onClick={() => onCraftEquipment('anchor')}
                    className="flex-1 rounded-md border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Fabricate
                  </button>
                  {equipment.anchorsInPack > 0 && (
                    <button
                      type="button"
                      onClick={onDeployAnchor}
                      className="rounded-md border border-sky-400/40 bg-sky-500/15 px-2.5 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/25"
                    >
                      [2] Plant ({equipment.anchorsInPack})
                    </button>
                  )}
                </div>
              </div>

              {/* Small Towed Cargo Cart */}
              <div className="flex flex-col justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <div>
                  <div className="flex items-center justify-between text-xs font-medium text-slate-100">
                    <span>Towed Cargo Cart</span>
                    <span className="font-mono-tabular text-amber-300">
                      {equipment.hasCart ? 'Built' : `${EQUIPMENT_COSTS.cart} cg`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-400">
                    Rope-hitched carrier: +6 slots &amp; 75% weight relief.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {!equipment.hasCart ? (
                    <button
                      type="button"
                      disabled={equipment.crystals < EQUIPMENT_COSTS.cart}
                      onClick={() => onCraftEquipment('cart')}
                      className="flex-1 rounded-md border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Fabricate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onToggleCart}
                      className="flex-1 rounded-md border border-sky-400/40 bg-sky-500/15 px-2.5 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/25"
                    >
                      [3] {equipment.cartAttached ? 'Unhitch Cart' : 'Hitch Cart'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Mobile Touch Movement Pad */}
        <div className="pointer-events-auto mb-1 flex w-full items-end justify-between md:hidden">
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/15 bg-[#0f1318]/85 p-1.5">
            <div />
            <button
              type="button"
              aria-label="Move forward"
              onPointerDown={() => onTouchMove(0, 1)}
              onPointerUp={() => onTouchMove(0, 0)}
              onPointerLeave={() => onTouchMove(0, 0)}
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-xs font-medium text-slate-100 active:bg-white/25"
            >
              W
            </button>
            <div />
            <button
              type="button"
              aria-label="Move left"
              onPointerDown={() => onTouchMove(-1, 0)}
              onPointerUp={() => onTouchMove(0, 0)}
              onPointerLeave={() => onTouchMove(0, 0)}
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-xs font-medium text-slate-100 active:bg-white/25"
            >
              A
            </button>
            <button
              type="button"
              aria-label="Move backward"
              onPointerDown={() => onTouchMove(0, -1)}
              onPointerUp={() => onTouchMove(0, 0)}
              onPointerLeave={() => onTouchMove(0, 0)}
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-xs font-medium text-slate-100 active:bg-white/25"
            >
              S
            </button>
            <button
              type="button"
              aria-label="Move right"
              onPointerDown={() => onTouchMove(1, 0)}
              onPointerUp={() => onTouchMove(0, 0)}
              onPointerLeave={() => onTouchMove(0, 0)}
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-xs font-medium text-slate-100 active:bg-white/25"
            >
              D
            </button>
          </div>

          <button
            type="button"
            onClick={onJump}
            className="h-11 rounded-lg border border-white/15 bg-[#0f1318]/85 px-4 text-xs font-medium text-slate-100 active:bg-white/20"
          >
            Jump
          </button>
        </div>

        {/* Collapsible Bottom Control Dock */}
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-white/15 bg-[#10141a]/90 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          {collapsed ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              <span className="whitespace-nowrap">Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              <span className="whitespace-nowrap">Hide Controls</span>
            </>
          )}
        </button>

        <div
          className={`pointer-events-auto w-full max-w-[1120px] transition-all duration-200 ${
            collapsed
              ? 'pointer-events-none translate-y-24 opacity-0'
              : 'translate-y-0 opacity-100'
          }`}
        >
          <div className="flex flex-col gap-2.5 rounded-xl border border-white/12 bg-[#0e1217]/88 px-4 py-3 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* Time of Day Cycle Selector */}
              <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
                {(
                  [
                    { id: 'auto', label: 'Cycle' },
                    { id: 'day', label: 'Day' },
                    { id: 'dusk', label: 'Dusk' },
                    { id: 'night', label: 'Night' },
                  ] as const
                ).map((item) => {
                  const active = timeMode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectTimeMode(item.id)}
                      className={`flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? item.id === 'night'
                            ? 'bg-indigo-300 text-slate-950'
                            : 'bg-amber-200 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {item.id === 'day' && <Sun className="h-3.5 w-3.5" />}
                      {item.id === 'dusk' && <Sunrise className="h-3.5 w-3.5" />}
                      {item.id === 'night' && <Moon className="h-3.5 w-3.5" />}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Weather Selector */}
              <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
                {(
                  [
                    { id: 'auto', label: 'Auto' },
                    { id: 'clear', label: 'Clear' },
                    { id: 'rainy', label: 'Rain' },
                    { id: 'snowy', label: 'Snow' },
                  ] as const
                ).map((item) => {
                  const active = weatherMode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectWeather(item.id)}
                      className={`flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-sky-200 text-slate-900'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {item.id === 'clear' && <Sun className="h-3.5 w-3.5" />}
                      {item.id === 'rainy' && <CloudRain className="h-3.5 w-3.5" />}
                      {item.id === 'snowy' && <Snowflake className="h-3.5 w-3.5" />}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Atmosphere Selector */}
              <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
                {(Object.keys(ATMOSPHERE_PRESETS) as AtmospherePresetId[]).map(
                  (id) => {
                    const active = preset === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onSelectPreset(id)}
                        className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {ATMOSPHERE_PRESETS[id].label}
                      </button>
                    );
                  }
                )}
              </div>

              {/* Camera Framing Toggle */}
              <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => onSelectCamera('shoulder')}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    cameraMode === 'shoulder'
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Compass className="h-3.5 w-3.5" />
                  <span>Shoulder</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectCamera('vista')}
                  className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    cameraMode === 'vista'
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Wide Vista
                </button>
              </div>

              {/* Action Controls: Fabrication, Field Tools, Terrain Scan & Coastal Audio */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFabricateOpen((prev) => !prev)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    fabricateOpen
                      ? 'border-amber-300 bg-amber-400/25 text-amber-100'
                      : 'border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                  }`}
                >
                  <Hammer className="h-3.5 w-3.5" />
                  <span>Craft ({equipment.crystals} cg)</span>
                </button>

                {equipment.laddersInPack > 0 && (
                  <button
                    type="button"
                    onClick={onDeployLadder}
                    className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-sky-400/40 bg-sky-500/15 px-2.5 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/25"
                  >
                    <span>[1] Ladder ({equipment.laddersInPack})</span>
                  </button>
                )}

                {equipment.anchorsInPack > 0 && (
                  <button
                    type="button"
                    onClick={onDeployAnchor}
                    className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-sky-400/40 bg-sky-500/15 px-2.5 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/25"
                  >
                    <Anchor className="h-3 w-3" />
                    <span>[2] Anchor ({equipment.anchorsInPack})</span>
                  </button>
                )}

                {equipment.hasCart && (
                  <button
                    type="button"
                    onClick={onToggleCart}
                    className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-sky-400/40 bg-sky-500/15 px-2.5 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/25"
                  >
                    <span>[3] {equipment.cartAttached ? 'Cart On' : 'Cart Off'}</span>
                  </button>
                )}

                {telemetry.wormsInPouch > 0 && (
                  <button
                    type="button"
                    onClick={onEatWorm}
                    className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-rose-400/45 bg-rose-500/15 px-2.5 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25"
                  >
                    <span>[Q] Eat Worm ({telemetry.wormsInPouch})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onTriggerScan}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/25"
                >
                  <Radio className="h-3.5 w-3.5" />
                  <span>Scan</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,.wav,audio/mpeg,audio/wav,audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onUploadMusic(file);
                    }
                    e.target.value = '';
                  }}
                />

                {!telemetry.music.customTrackName ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload your own MP3 or WAV track for the beach"
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-amber-400/40 hover:text-amber-200"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Music (.mp3/.wav)</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1 rounded-lg border border-amber-400/35 bg-amber-500/10 px-2 py-1">
                    <button
                      type="button"
                      onClick={onToggleCustomMusic}
                      className="flex items-center gap-1 text-xs font-medium text-amber-200 hover:text-white"
                      title={telemetry.music.customPlaying ? 'Stop custom track' : 'Play custom track'}
                    >
                      {telemetry.music.customPlaying ? (
                        <Square className="h-3 w-3 fill-current" />
                      ) : (
                        <Play className="h-3 w-3 fill-current" />
                      )}
                      <span className="max-w-[110px] truncate">
                        {telemetry.music.customTrackName}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Change MP3/WAV track"
                      className="rounded p-0.5 text-slate-300 hover:bg-white/10 hover:text-white"
                    >
                      <Upload className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={onClearCustomMusic}
                      title="Revert to default track"
                      className="rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={onToggleAudio}
                  aria-label={audioEnabled ? 'Mute ocean audio' : 'Enable ocean audio'}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    audioEnabled
                      ? 'border-sky-400/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
                      : 'border-white/15 bg-white/5 text-slate-300 hover:text-white'
                  }`}
                >
                  {audioEnabled ? (
                    <Volume2 className="h-3.5 w-3.5" />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5" />
                  )}
                  <span>{audioEnabled ? 'Sound On' : 'Sound Off'}</span>
                </button>
              </div>
            </div>

            {/* Quiet Single-Line Control Legend */}
            <div className="hidden items-center justify-between border-t border-white/8 pt-2 text-[11px] text-slate-400 sm:flex">
              <span>WASD Move · Shift Sprint · E Collect/Catch · Q Eat Worm · B Craft · 1/2/3 Equip · T Load Cart</span>
              <span>F Scan · H Hide HUD · Esc Menu</span>
            </div>
          </div>
        </div>
      </div>
    </div>
      )}

      {/* Brief Save/Load Feedback Banner */}
      {saveNotice && (
        <div className="pointer-events-none fixed top-5 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-emerald-400/45 bg-[#0e1217]/95 px-4 py-2 text-xs font-medium text-emerald-200 shadow-xl">
          {saveNotice}
        </div>
      )}

      {/* Expedition Pause / Save / Load / Name / Title Menu */}
      {menuMode !== 'closed' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={menuMode === 'title' ? 'Expedition Title & Load Menu' : 'Expedition Pause Menu'}
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#070a0e]/74 p-4"
        >
          <div className="flex w-full max-w-[540px] flex-col gap-4 rounded-xl border border-white/15 bg-[#0e1217]/96 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <p className="font-mono-tabular text-[11px] tracking-widest text-amber-300/90 uppercase">
                  {menuMode === 'title' ? 'Coastal Porter Expedition' : 'Expedition Paused'}
                </p>
                <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-100">
                  The Seam
                </h2>
              </div>
              {menuMode === 'pause' && (
                <button
                  type="button"
                  onClick={onCloseMenu}
                  className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/15"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Resume [Esc]</span>
                </button>
              )}
            </div>

            {/* Player Name Editor (updates floating 3D indicator above character live) */}
            <div className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <label
                htmlFor="porter-name-input"
                className="flex items-center justify-between text-xs font-medium text-slate-200"
              >
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-sky-300" />
                  <span>Porter Callsign (Shown Above Player)</span>
                </span>
                <span className="font-mono-tabular text-[11px] text-slate-400">
                  {nameDraft.length}/20
                </span>
              </label>
              <input
                id="porter-name-input"
                type="text"
                maxLength={20}
                value={nameDraft}
                placeholder="Drifter"
                onChange={(e) => {
                  const val = e.target.value;
                  setNameDraft(val);
                  if (val.trim().length > 0) {
                    onChangePlayerName(val);
                  }
                }}
                onBlur={() => {
                  if (nameDraft.trim().length === 0) {
                    onChangePlayerName('Drifter');
                    setNameDraft('Drifter');
                  } else {
                    onChangePlayerName(nameDraft);
                  }
                }}
                className="w-full rounded-md border border-white/15 bg-[#141920] px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-400"
              />
            </div>

            {/* Save / Load Slots */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span className="flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5 text-amber-300" />
                  <span>{menuMode === 'title' ? 'Load Saved Expedition' : 'Save & Load Progress'}</span>
                </span>
                <span className="font-mono-tabular text-[11px] text-slate-400">
                  3 Local Slots
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {saveSlots.map((slot) => {
                  const saved = slot.data;
                  const deliveredCount = saved
                    ? saved.cargo.filter((c) => c.state === 'delivered').length
                    : 0;
                  return (
                    <div
                      key={slot.slotId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-100">
                            {slot.label}
                          </span>
                          {saved ? (
                            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-200">
                              {saved.playerName}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500">Empty</span>
                          )}
                        </div>
                        {saved && (
                          <div className="font-mono-tabular mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            <span>{deliveredCount}/{saved.cargo.length} Delivered</span>
                            <span>·</span>
                            <span>{saved.equipment.crystals} cg</span>
                            <span>·</span>
                            <span>HP {Math.round(saved.health ?? 100)}</span>
                            <span>·</span>
                            <span>{formatSavedTimestamp(saved.savedAt)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {menuMode === 'pause' && (
                          <button
                            type="button"
                            onClick={() => onSaveSlot(slot.slotId, slot.label)}
                            className="flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25"
                          >
                            <Save className="h-3 w-3" />
                            <span>{saved ? 'Overwrite' : 'Save'}</span>
                          </button>
                        )}
                        {saved && (
                          <>
                            <button
                              type="button"
                              onClick={() => onLoadSlot(slot.slotId)}
                              className="flex items-center gap-1 rounded-md border border-sky-400/40 bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-200 transition-colors hover:bg-sky-500/25"
                            >
                              <FolderOpen className="h-3 w-3" />
                              <span>Load</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteSlot(slot.slotId)}
                              title="Delete saved slot"
                              className="rounded-md border border-white/10 bg-white/5 p-1.5 text-slate-400 transition-colors hover:border-rose-400/40 hover:bg-rose-500/15 hover:text-rose-200"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              {menuMode === 'title' ? (
                <>
                  <button
                    type="button"
                    onClick={onNewGame}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-500/30"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>New Expedition</span>
                  </button>
                  <button
                    type="button"
                    onClick={onCloseMenu}
                    className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/8 px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/15"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Continue Beach</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onNewGame}
                      className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/6 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/15"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>New Expedition</span>
                    </button>
                    <button
                      type="button"
                      onClick={onExitToTitle}
                      className="flex items-center gap-1.5 rounded-lg border border-rose-400/35 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/25"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Exit to Menu</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onCloseMenu}
                    className="flex items-center gap-1.5 rounded-lg border border-sky-400/45 bg-sky-500/20 px-4 py-1.5 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-500/30"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Resume</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

