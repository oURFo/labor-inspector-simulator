import { createInitialGameState, DIVISIONS, GameState, RANKS } from './GameState';

const AUTO_SAVE_KEY = 'lis_autosave_v1';
const SLOT_PREFIX = 'lis_slot_v1_';

function migrateState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<GameState>;
  if (!s.player || !s.time || !s.kpi) return null;

  // Verify rankId and divisionId exist
  const validRank = RANKS.some((r) => r.id === s.player?.rankId);
  const validDiv = DIVISIONS.some((d) => d.id === s.player?.divisionId);
  if (!validRank || !validDiv) return null;

  const fallback = createInitialGameState(
    s.player.name || '林敬言',
    s.player.divisionId,
    s.rngState || Date.now()
  );

  const divObj = DIVISIONS.find((d) => d.id === s.player?.divisionId);
  const rankObj = RANKS.find((r) => r.id === s.player?.rankId);
  const baseMaxPrimary =
    divObj && rankObj
      ? Math.round(divObj.primaryKpi.monthlyTarget * rankObj.kpiMultiplier)
      : fallback.kpi.primaryTarget;

  return {
    ...fallback,
    ...s,
    time: {
      ...fallback.time,
      ...s.time,
    },
    player: {
      ...fallback.player,
      ...s.player,
    },
    kpi: {
      ...fallback.kpi,
      ...s.kpi,
      primaryTarget:
        typeof s.kpi.primaryTarget === 'number' && !s.kpi.isTrainingMonth
          ? Math.min(s.kpi.primaryTarget, baseMaxPrimary)
          : (s.kpi.primaryTarget ?? fallback.kpi.primaryTarget),
      highlightCases: Array.isArray(s.kpi.highlightCases) ? s.kpi.highlightCases : [],
    },
    halfYearFailedMonths:
      typeof s.halfYearFailedMonths === 'number' ? s.halfYearFailedMonths : 0,
    halfYearMonthResults: Array.isArray(s.halfYearMonthResults)
      ? s.halfYearMonthResults
      : [],
    reviews: Array.isArray(s.reviews) ? s.reviews : [],
    logs: Array.isArray(s.logs) ? s.logs : fallback.logs,
    lastFeedback: s.lastFeedback !== undefined ? s.lastFeedback : fallback.lastFeedback,
    activeModal: s.activeModal ?? null,
    pendingExam: s.pendingExam ?? null,
    endingId: s.endingId ?? null,
  };
}

export function saveAuto(state: GameState): void {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

export function clearAuto(): void {
  try {
    localStorage.removeItem(AUTO_SAVE_KEY);
  } catch {
    // Ignore
  }
}

export function loadAuto(): GameState | null {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_KEY);
    if (!raw) return null;
    return migrateState(JSON.parse(raw));
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
    return migrateState(JSON.parse(raw));
  } catch {
    return null;
  }
}
