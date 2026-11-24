import { SavedCargoItem } from './cargo';
import { SavedCrystalNode } from './crystals';
import { SavedEquipmentState } from './equipment';
import { AtmospherePresetId } from './materials';
import { TimeOfDayMode } from './timeOfDay';
import { WeatherMode } from './weather';

export interface GameSaveData {
  version: number;
  savedAt: string;
  slotLabel: string;
  playerName: string;
  playerPos: { x: number; y: number; z: number };
  yaw: number;
  health: number;
  stamina: number;
  staminaExhausted: boolean;
  cold: number;
  wormsInPouch: number;
  preset: AtmospherePresetId;
  weatherMode: WeatherMode;
  timeMode?: TimeOfDayMode;
  timeHour?: number;
  musicTriggered: boolean;
  cargo: SavedCargoItem[];
  crystals: SavedCrystalNode[];
  collectedWorms: number[];
  equipment: SavedEquipmentState;
}

export interface SaveSlotSummary {
  slotId: string;
  label: string;
  exists: boolean;
  data: GameSaveData | null;
}

export const SAVE_SLOTS: { id: string; label: string }[] = [
  { id: 'slot-1', label: 'Expedition Slot 1' },
  { id: 'slot-2', label: 'Expedition Slot 2' },
  { id: 'slot-3', label: 'Expedition Slot 3' },
];

const SLOT_KEY_PREFIX = 'the-seam-save-v1:';
const PLAYER_NAME_KEY = 'the-seam-player-name-v1';

export function getSavedPlayerName(): string {
  try {
    const raw = window.localStorage.getItem(PLAYER_NAME_KEY);
    if (raw && raw.trim().length > 0) return raw.trim().slice(0, 20);
  } catch {
    // Ignore storage errors
  }
  return 'Drifter';
}

export function setSavedPlayerName(name: string): string {
  const clean = name.trim().slice(0, 20) || 'Drifter';
  try {
    window.localStorage.setItem(PLAYER_NAME_KEY, clean);
  } catch {
    // Ignore storage errors
  }
  return clean;
}

export function saveGameToSlot(slotId: string, data: GameSaveData): boolean {
  try {
    window.localStorage.setItem(`${SLOT_KEY_PREFIX}${slotId}`, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGameFromSlot(slotId: string): GameSaveData | null {
  try {
    const raw = window.localStorage.getItem(`${SLOT_KEY_PREFIX}${slotId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameSaveData;
    if (!parsed || typeof parsed.version !== 'number' || !parsed.playerPos) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function deleteSaveSlot(slotId: string): void {
  try {
    window.localStorage.removeItem(`${SLOT_KEY_PREFIX}${slotId}`);
  } catch {
    // Ignore storage errors
  }
}

export function listSaveSlots(): SaveSlotSummary[] {
  return SAVE_SLOTS.map((s) => {
    const data = loadGameFromSlot(s.id);
    return {
      slotId: s.id,
      label: s.label,
      exists: data !== null,
      data,
    };
  });
}
