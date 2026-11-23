import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Compass, Radio, Volume2, VolumeX } from 'lucide-react';
import { CameraMode, SceneTelemetry } from '../scene/BeachExperience';
import { ATMOSPHERE_PRESETS, AtmospherePresetId } from '../scene/materials';

interface ControlOverlayProps {
  telemetry: SceneTelemetry;
  preset: AtmospherePresetId;
  cameraMode: CameraMode;
  audioEnabled: boolean;
  contextLost: boolean;
  onSelectPreset: (preset: AtmospherePresetId) => void;
  onSelectCamera: (mode: CameraMode) => void;
  onTriggerScan: () => void;
  onToggleAudio: () => void;
  onTouchMove: (x: number, y: number) => void;
  onJump: () => void;
}

export const ControlOverlay: React.FC<ControlOverlayProps> = ({
  telemetry,
  preset,
  cameraMode,
  audioEnabled,
  contextLost,
  onSelectPreset,
  onSelectCamera,
  onTriggerScan,
  onToggleAudio,
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

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-5">
      {/* Top-Left Minimal Spatial Title & Tabular Telemetry */}
      <header className="inline-flex w-fit flex-col gap-0.5 rounded-lg border border-white/12 bg-[#0e1217]/75 px-3.5 py-2 shadow-lg">
        <h1 className="text-sm font-semibold tracking-tight text-slate-100">
          The Seam
        </h1>
        <div className="font-mono-tabular flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span>{telemetry.x.toFixed(1)}m E</span>
          <span aria-hidden="true">·</span>
          <span>{telemetry.z.toFixed(1)}m S</span>
          <span aria-hidden="true">·</span>
          <span>{telemetry.elevation.toFixed(1)}m Elev</span>
          <span aria-hidden="true">·</span>
          <span>{String(telemetry.headingDeg).padStart(3, '0')}°</span>
          {telemetry.isWading && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-sky-300">Tidal Shallows</span>
            </>
          )}
        </div>
      </header>

      {/* Context Lost Recovery Notice */}
      {contextLost && (
        <div className="pointer-events-auto mx-auto rounded-lg border border-white/15 bg-[#14181d]/95 px-4 py-3 text-sm text-slate-200">
          Graphics context paused. Restoring coastal viewport...
        </div>
      )}

      {/* Mobile Touch Movement Pad (shown only on coarse pointers / small screens) */}
      <div className="pointer-events-auto mb-2 flex items-end justify-between md:hidden">
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
      <div className="pointer-events-none flex flex-col items-center">
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="pointer-events-auto mb-2 flex items-center gap-1.5 rounded-md border border-white/15 bg-[#10141a]/90 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
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
          className={`pointer-events-auto w-full max-w-[880px] transition-all duration-200 ${
            collapsed
              ? 'pointer-events-none translate-y-24 opacity-0'
              : 'translate-y-0 opacity-100'
          }`}
        >
          <div className="flex flex-col gap-2.5 rounded-xl border border-white/12 bg-[#0e1217]/88 px-4 py-3 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                        className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
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
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
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
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
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
              <span>WASD / Arrows Move · Shift Sprint · Space Jump · Drag Mouse Orbit · Scroll Zoom</span>
              <span>F Scan · H Toggle Controls</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
