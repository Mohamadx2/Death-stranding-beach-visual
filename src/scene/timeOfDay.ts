import * as THREE from 'three';

export type TimeOfDayMode = 'auto' | 'day' | 'dusk' | 'night';

export interface TimeOfDaySnapshot {
  mode: TimeOfDayMode;
  hour: number;
  formattedTime: string;
  phaseLabel: 'Dawn' | 'Daylight' | 'Dusk' | 'Night';
  daylight: number; // 0 (night) .. 1 (bright day)
  twilight: number; // 0 .. 1 peak at sunrise/sunset
  nightWeight: number; // 0 (day) .. 1 (night)
  sunAltitude: number; // -1 .. 1
  celestialDir: THREE.Vector3;
}

export interface TimeOfDaySystem {
  setMode: (mode: TimeOfDayMode) => void;
  setHour: (hour: number) => void;
  getSnapshot: () => TimeOfDaySnapshot;
  update: (delta: number) => TimeOfDaySnapshot;
}

const TARGET_HOURS: Record<Exclude<TimeOfDayMode, 'auto'>, number> = {
  day: 12.5,
  dusk: 18.25,
  night: 23.0,
};

// Full 24h cycle in ~165 real seconds (~0.145 game hours/sec)
const AUTO_HOURS_PER_SEC = 0.145;

function normalizeHour(h: number): number {
  const mod = h % 24;
  return mod < 0 ? mod + 24 : mod;
}

function formatClock(hour: number): string {
  const hNorm = normalizeHour(hour);
  const hh = Math.floor(hNorm) % 24;
  const mm = Math.floor((hNorm - Math.floor(hNorm)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function createTimeOfDaySystem(initialHour = 11.2): TimeOfDaySystem {
  let mode: TimeOfDayMode = 'auto';
  let hour = normalizeHour(initialHour);
  const celestialDir = new THREE.Vector3(-0.35, 0.65, -0.65).normalize();

  const buildSnapshot = (): TimeOfDaySnapshot => {
    // 06:00 sunrise (0), 12:00 zenith (+PI/2), 18:00 sunset (PI), 00:00 nadir (-PI/2)
    const solarPhase = ((hour - 6) / 24) * Math.PI * 2;
    const sunSin = Math.sin(solarPhase);
    const sunCos = Math.cos(solarPhase);

    const daylight = THREE.MathUtils.smoothstep(sunSin, -0.18, 0.28);
    const dawnDuskBand =
      THREE.MathUtils.smoothstep(sunSin, -0.34, -0.02) *
      (1.0 - THREE.MathUtils.smoothstep(sunSin, -0.02, 0.34));
    const twilight = THREE.MathUtils.clamp(dawnDuskBand * 1.18, 0, 1);
    const nightWeight = THREE.MathUtils.clamp(1.0 - daylight, 0, 1);

    let phaseLabel: TimeOfDaySnapshot['phaseLabel'] = 'Daylight';
    if (daylight < 0.25) {
      phaseLabel = twilight > 0.38 ? (hour < 12 ? 'Dawn' : 'Dusk') : 'Night';
    } else if (daylight < 0.72) {
      phaseLabel = hour < 12 ? 'Dawn' : 'Dusk';
    }

    // Active directional light tracks the sun by day and high moon arc by night
    if (daylight >= 0.12) {
      celestialDir.set(
        sunCos * 0.68 - 0.18,
        Math.max(0.22, sunSin * 0.85 + 0.14),
        -0.68
      ).normalize();
    } else {
      const lunarPhase = ((hour + 6) / 24) * Math.PI * 2;
      celestialDir.set(
        Math.cos(lunarPhase) * 0.48 - 0.15,
        Math.max(0.38, Math.sin(lunarPhase) * 0.62 + 0.32),
        -0.62
      ).normalize();
    }

    return {
      mode,
      hour,
      formattedTime: formatClock(hour),
      phaseLabel,
      daylight,
      twilight,
      nightWeight,
      sunAltitude: sunSin,
      celestialDir: celestialDir.clone(),
    };
  };

  const setMode = (nextMode: TimeOfDayMode) => {
    mode = nextMode;
    if (nextMode !== 'auto') {
      hour = TARGET_HOURS[nextMode];
    }
  };

  const setHour = (nextHour: number) => {
    hour = normalizeHour(nextHour);
  };

  const update = (delta: number): TimeOfDaySnapshot => {
    const dt = Math.min(delta, 0.05);
    if (mode === 'auto') {
      hour = normalizeHour(hour + dt * AUTO_HOURS_PER_SEC);
    }
    return buildSnapshot();
  };

  return {
    setMode,
    setHour,
    getSnapshot: buildSnapshot,
    update,
  };
}
