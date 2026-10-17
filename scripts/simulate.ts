import { createInitialGameState, DIVISIONS, getRankDef } from '../src/core/GameState';
import {
  estimateSlotsNeededForMonth,
  getRemainingSlotsInMonth,
  needsExamForSpecialist,
  performSlotAction,
} from '../src/core/GameEngine';
import { createRng } from '../src/core/rng';

const RUNS = 2000;
const counts: Record<string, number> = {};
let totalFinalRankLevel = 0;

for (let i = 0; i < RUNS; i++) {
  const rng = createRng(i + 1000);
  const div = rng.pick(DIVISIONS);
  const state = createInitialGameState('模擬員', div.id, i + 1000);

  while (!state.endingId && state.time.totalSlotsElapsed < 500) {
    const rankDef = getRankDef(state.player.rankId);
    const slotsLeft = getRemainingSlotsInMonth(state);
    const slotsNeeded = estimateSlotsNeededForMonth(state);

    // Smart AI player policy:
    // 1. If stress >= 68, relax or take leave to avoid >=70 half-output penalty
    // 2. If monthly KPI not yet complete, prioritize secondary then primary KPI
    // 3. Once monthly KPI is satisfied (or in training month), slack_study if exam needed, else work/relax
    let action: Parameters<typeof performSlotAction>[1] = 'primary_work';

    if (state.player.stress >= 68) {
      action = state.player.annualLeaveLeft > 0 && slotsLeft > slotsNeeded ? 'take_leave' : 'relax_idle';
    } else if (!state.kpi.isTrainingMonth && state.kpi.secondaryProgress < state.kpi.secondaryTarget) {
      action = rankDef.isManagement ? 'mgmt_coord' : 'secondary_work';
    } else if (!state.kpi.isTrainingMonth && state.kpi.primaryProgress < state.kpi.primaryTarget) {
      action = rankDef.isManagement ? 'mgmt_supervise' : 'primary_work';
    } else if (needsExamForSpecialist(state)) {
      action = 'slack_study';
    } else if (state.player.stress >= 35) {
      action = 'relax_idle';
    } else {
      action = rankDef.isManagement ? 'mgmt_supervise' : 'primary_work';
    }

    performSlotAction(state, action, true);
  }

  const end = state.endingId ?? 'unknown';
  counts[end] = (counts[end] ?? 0) + 1;
  totalFinalRankLevel += getRankDef(state.player.rankId).level;
}

console.log(`=== 5年完整生涯蒙地卡羅模擬結果 (${RUNS} 局，採取「先做完當月KPI再偷懶看書」策略) ===`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(24)}: ${v} 局 (${((v / RUNS) * 100).toFixed(1)}%)`);
}
console.log(`平均最終職級 Level: ${(totalFinalRankLevel / RUNS).toFixed(2)} / 7`);
