import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CloudRain,
  Compass,
  Package,
  Radio,
  RotateCcw,
  Snowflake,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { CameraMode, SceneTelemetry } from '../scene/BeachExperience';
import { ATMOSPHERE_PRESETS, AtmospherePresetId } from '../scene/materials';
import { shorelineZAt } from '../scene/terrain';
import { WeatherMode } from '../scene/weather';

interface ControlOverlayProps {
  telemetry: SceneTelemetry;
  preset: AtmospherePresetId;
  weatherMode: WeatherMode;
  cameraMode: CameraMode;
  audioEnabled: boolean;
  contextLost: boolean;
  onSelectPreset: (preset: AtmospherePresetId) => void;
  onSelectWeather: (mode: WeatherMode) => void;
  onSelectCamera: (mode: CameraMode) => void;
  onTriggerScan: () => void;
  onToggleAudio: () => void;
  onInteractCargo: () => void;
  onResetCargoRun: () => void;
  onTouchMove: (x: number, y: number) => void;
  onJump: () => void;
}

const MAP_SIZE = 148;
const MAP_CENTER = MAP_SIZE / 2;
const MAP_WORLD_SPAN = 216;
const MAP_RADIUS_PX = 64;

function worldToMap(wx: number, wz: number): [number, number] {
  const scale = MAP_RADIUS_PX / MAP_WORLD_SPAN;
  return [MAP_CENTER + wx * scale, MAP_CENTER + wz * scale];
}

export const ControlOverlay: React.FC<ControlOverlayProps> = ({
  telemetry,
  preset,
  weatherMode,
  cameraMode,
  audioEnabled,
  contextLost,
  onSelectPreset,
  onSelectWeather,
  onSelectCamera,
  onTriggerScan,
  onToggleAudio,
  onInteractCargo,
  onResetCargoRun,
  onTouchMove,
  onJump,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') {
        setCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const oceanPolygonPoints = useMemo(() => {
    const pts: string[] = [];
    for (let wx = -MAP_WORLD_SPAN; wx <= MAP_WORLD_SPAN; wx += 12) {
      const wz = shorelineZAt(wx);
      const [mx, my] = worldToMap(wx, wz);
      pts.push(`${mx.toFixed(1)},${my.toFixed(1)}`);
    }
    pts.push(`${MAP_SIZE},0`, `0,0`);
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

  const { cargo } = telemetry;
  const distToPost = Math.round(
    Math.hypot(
      telemetry.x - cargo.deliveryPostPos.x,
      telemetry.z - cargo.deliveryPostPos.z
    )
  );
  const allDelivered = cargo.delivered >= cargo.total;

  // Player & Post coordinates on tactical minimap
  const [px, py] = worldToMap(telemetry.x, telemetry.z);
  const [postX, postY] = worldToMap(
    cargo.deliveryPostPos.x,
    cargo.deliveryPostPos.z
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
  const staminaPct = Math.round(telemetry.stamina);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
      {/* Top Row: Left Telemetry/Stamina/Weight & Right Tactical Minimap */}
      <div className="flex w-full items-start justify-between gap-3">
        <header className="inline-flex w-fit max-w-[330px] flex-col gap-1.5 rounded-lg border border-white/12 bg-[#0e1217]/86 px-3.5 py-2.5 shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-sm font-semibold tracking-tight text-slate-100">
              The Seam
            </h1>
            <span className="font-mono-tabular text-xs text-amber-300">
              {cargo.delivered}/{cargo.total} Delivered
            </span>
          </div>

          {/* Carry Frame Load & Stack Slots */}
          <div className="font-mono-tabular flex items-center justify-between gap-3 text-xs text-slate-200">
            <span>
              Pack {cargo.carried}/{cargo.maxCarry} Slots
            </span>
            <span className="text-slate-300">
              {cargo.carriedWeightKg.toFixed(1)} kg
            </span>
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

      {/* Subtle Bottom Action Prompts (Cargo Pickup / Delivery / Invisible Wall) */}
      <div className="pointer-events-none flex flex-col items-center gap-2">
        {telemetry.boundaryHit && (
          <div className="rounded-md border border-sky-400/40 bg-[#0e1217]/90 px-3.5 py-1.5 text-xs font-medium text-sky-200">
            Perimeter Boundary Reached
          </div>
        )}

        {cargo.nearbyCargoLabel && cargo.backpackFull && (
          <div className="rounded-lg border border-amber-400/40 bg-[#12161c]/92 px-4 py-2 text-xs font-medium text-amber-200 shadow-lg">
            Holder Full ({cargo.maxCarry}/{cargo.maxCarry}) — Deliver at Wooden Post
          </div>
        )}

        {cargo.nearbyCargoLabel && !cargo.backpackFull && (
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

        {!cargo.nearbyCargoLabel && cargo.nearDeliveryPost && cargo.carried > 0 && (
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
          className={`pointer-events-auto w-full max-w-[980px] transition-all duration-200 ${
            collapsed
              ? 'pointer-events-none translate-y-24 opacity-0'
              : 'translate-y-0 opacity-100'
          }`}
        >
          <div className="flex flex-col gap-2.5 rounded-xl border border-white/12 bg-[#0e1217]/88 px-4 py-3 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
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

              {/* Action Controls: Terrain Scan & Coastal Audio */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onTriggerScan}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/25"
                >
                  <Radio className="h-3.5 w-3.5" />
                  <span>Scan Terrain</span>
                </button>

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
              <span>WASD Move · Shift Sprint · Space Jump · E Collect/Deliver · Drag Orbit</span>
              <span>F Scan · H Toggle Controls</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
