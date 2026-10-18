import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../src/core/GameState';
import {
  addStress,
  advanceClockOneSlot,
  applyOfficialLeaveKpiReduction,
  conductExam,
  executeActionEffect,
  getEffectiveActionOutput,
  getExamPassRatePercent,
  isCurrentMonthKpiPassed,
  performSlotAction,
} from '../src/core/GameEngine';
import { createRng } from '../src/core/rng';

describe('Labor Inspector Simulator Core Engine', () => {
  it('advances 480 slots across 5 years accurately', () => {
    const state = createInitialGameState('測試員', 'labor_conditions', 42);
    const rng = createRng(42);

    // Prevent KPI dismissal while testing pure clock progression
    for (let i = 0; i < 480; i++) {
      state.kpi.primaryProgress = 999;
      state.kpi.secondaryProgress = 999;
      state.player.stress = 10;
      advanceClockOneSlot(state, rng);
    }

    expect(state.time.totalSlotsElapsed).toBe(480);
    expect(state.endingId).toBe('eternal_contract');
  });

  it('evaluates monthly KPI strictly with 5/8 slots target (16/16 primary + 1/1 secondary = 5 slots)', () => {
    const state = createInitialGameState('測試員', 'labor_conditions', 100);
    const rng = createRng(100);
    // Advance past Month 1 (training month) into Month 2 so normal 5/8 KPI targets are initialized
    for (let i = 0; i < 8; i++) {
      advanceClockOneSlot(state, rng);
    }
    expect(state.kpi.isTrainingMonth).toBe(false);
    // Default labor_conditions target is now 16 (4 slots * 4 cases) + 1 secondary (1 slot) = 5/8 slots
    expect(state.kpi.primaryTarget).toBe(16);
    expect(state.kpi.secondaryTarget).toBe(1);

    state.kpi.primaryProgress = 12;
    state.kpi.secondaryProgress = 1;
    expect(isCurrentMonthKpiPassed(state)).toBe(false);

    state.kpi.primaryProgress = 16;
    expect(isCurrentMonthKpiPassed(state)).toBe(true);

    // Verify take_leave reduces stress by 25
    state.player.stress = 60;
    executeActionEffect(state, 'take_leave', rng);
    expect(state.player.stress).toBe(35);
  });

  it('applies proportional KPI reduction only for official leave slots', () => {
    const state = createInitialGameState('測試員', 'labor_conditions', 100);
    state.kpi.isTrainingMonth = false;
    state.kpi.primaryTarget = 16;
    state.kpi.secondaryTarget = 1;

    applyOfficialLeaveKpiReduction(state, 2);
    // 6/8 of 16 = 12
    expect(state.kpi.primaryTarget).toBe(12);
  });

  it('halves work output when stress >= 70 and triggers burnout at 100', () => {
    const state = createInitialGameState('測試員', 'labor_conditions', 100);
    state.player.stress = 69;
    expect(getEffectiveActionOutput(state, 4)).toBe(4);

    state.player.stress = 70;
    expect(getEffectiveActionOutput(state, 4)).toBe(2);

    addStress(state, 30);
    expect(state.player.stress).toBe(100);
    expect(state.endingId).toBe('burnout');
  });

  it('implements step-by-step (10%) vs cross-tier (5%) exam base rates, 60% cap, and reset only on pass', () => {
    const state = createInitialGameState('測試員', 'labor_conditions', 100);
    const rng = createRng(100);

    // Contract taking High Exam (cross-tier) -> 5% base
    expect(getExamPassRatePercent(state, 'high_3')).toBe(5);
    // Contract taking Local 4 (step-by-step) -> 10% base
    expect(getExamPassRatePercent(state, 'local_4')).toBe(10);

    // Slack study increases examBonus by 1~3%
    executeActionEffect(state, 'slack_study', rng);
    expect(state.player.examBonus).toBeGreaterThanOrEqual(1);
    expect(state.player.examBonus).toBeLessThanOrEqual(3);

    // Cap at 60%
    state.player.examBonus = 99;
    expect(getExamPassRatePercent(state, 'high_3')).toBe(60);

    // Assistant taking High Exam (step-by-step) -> 10% base
    state.player.rankId = 'assistant';
    state.player.examBonus = 0;
    expect(getExamPassRatePercent(state, 'high_3')).toBe(10);
  });

  it('triggers KPI dismissal ending when failing 3 months in a half-year', () => {
    const state = createInitialGameState('測試員', 'labor_conditions', 777);
    // Fast-forward through Year 1 Half 1 by idling every slot
    while (!state.endingId && state.time.totalSlotsElapsed < 60) {
      performSlotAction(state, 'relax_idle', true);
    }
    expect(state.endingId).toBe('dismissed_kpi');
  });

  it('can reach Director (處長) within 5 years on the optimal path', () => {
    const state = createInitialGameState('林處長', 'labor_conditions', 1);
    const rng = createRng(1);

    // Simulate passing Year 1 July High Exam with 100% certainty
    state.player.examBonus = 55;
    state.player.bossFavor = 100;

    for (let slot = 0; slot < 480 && !state.endingId; slot++) {
      // Force pass when exam is triggered
      if (
        state.time.year === 1 &&
        state.time.month === 7 &&
        state.time.week === 1 &&
        state.time.slot === 'AM'
      ) {
        conductExam(state, 'high_3', rng);
        state.pendingExam!.passed = true;
        advanceClockOneSlot(state, rng);
        continue;
      }

      // Ensure KPI is always met and stress is low
      state.kpi.primaryProgress = state.kpi.primaryTarget + 10;
      state.kpi.secondaryProgress = state.kpi.secondaryTarget + 5;
      state.player.stress = 15;
      advanceClockOneSlot(state, rng);
    }

    expect(state.player.rankId).toBe('director');
    expect(state.endingId).toBe('true_director');
  });

  it('never triggers random events on relax_idle or take_leave and shows monthly report modal at month end', () => {
    const state = createInitialGameState('測試員', 'labor_conditions', 2026);
    state.kpi.isTrainingMonth = false;

    for (let i = 0; i < 8; i++) {
      const action = i < 2 ? 'take_leave' : 'relax_idle';
      performSlotAction(state, action, false);
      if (i < 7) {
        // Should never open an 'event' modal during relax_idle or take_leave
        expect(state.activeModal).toBeNull();
      } else {
        // After 8th slot (end of month), monthly_report modal must appear with supervisor comment
        expect(state.activeModal?.type).toBe('monthly_report');
        expect(state.activeModal?.monthlyReport?.supervisorComment.length).toBeGreaterThan(10);
      }
    }
  });

  it('populates dynamic progressAnim data for work (10->14), rest (stress reduction), and study (knowledge gain)', () => {
    const state = createInitialGameState('測試員', 'labor_conditions', 2026);
    const rng = createRng(2026);
    state.kpi.isTrainingMonth = false;
    state.kpi.primaryTarget = 20;
    state.kpi.primaryProgress = 10;

    // 1. Primary work: 10 -> 14
    executeActionEffect(state, 'primary_work', rng);
    expect(state.lastFeedback?.progressAnim?.kind).toBe('work_primary');
    expect(state.lastFeedback?.progressAnim?.fromValue).toBe(10);
    expect(state.lastFeedback?.progressAnim?.toValue).toBe(14);

    // 2. Rest: stress decreases with positive banner
    state.player.stress = 50;
    executeActionEffect(state, 'relax_idle', rng);
    expect(state.lastFeedback?.progressAnim?.kind).toBe('rest');
    expect(state.lastFeedback?.progressAnim?.fromValue).toBe(50);
    expect(state.lastFeedback?.progressAnim?.toValue).toBe(40);
    expect(state.lastFeedback?.progressAnim?.positiveBanner.length).toBeGreaterThan(5);

    // 3. Study: knowledge increases with positive banner
    state.player.examBonus = 10;
    executeActionEffect(state, 'slack_study', rng);
    expect(state.lastFeedback?.progressAnim?.kind).toBe('study');
    expect(state.lastFeedback?.progressAnim?.fromValue).toBe(20);
    expect(state.lastFeedback?.progressAnim?.toValue).toBeGreaterThan(20);
    expect(state.lastFeedback?.progressAnim?.positiveBanner.length).toBeGreaterThan(5);
  });
});
