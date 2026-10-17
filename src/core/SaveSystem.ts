import { GameState } from './GameState';

const AUTO_SAVE_KEY = 'lis_autosave_v1';
const SLOT_PREFIX = 'lis_slot_v1_';

export function saveAuto(state: GameState): void {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

export function loadAuto(): GameState | null {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

export function saveToSlot(slotIndex: number, state: GameState): void {
  try {
    localStorage.setItem(`${SLOT_PREFIX}${slotIndex}`, JSON.stringify(state));
  } catch {
    // Ignore
  }
}

export function loadFromSlot(slotIndex: number): GameState | null {
  try {
    const raw = localStorage.getItem(`${SLOT_PREFIX}${slotIndex}`);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}
