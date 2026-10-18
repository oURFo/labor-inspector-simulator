import {
  ActionId,
   computeInitialMonthlyKpi,
  DIVISIONS,
  DivisionId,
  EventChoiceEffect,
  ExamKind,
  GameEvent,
  GameState,
  getDivisionDef,
  getRankDef,
  RankId,
} from './GameState';
import { createRng, Rng } from './rng';
import eventsData from '../data/events.json';
import endingsData from '../data/endings.json';
import vignettesData from '../data/vignettes.json';

export const EVENTS = eventsData as GameEvent[];
export const ENDINGS = endingsData as {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  description: string;
}[];

export function formatTimeLabel(state: GameState): string {
  const rocYear = 115 + state.time.year;
  const slotStr = state.time.slot === 'AM' ? '上午' : '下午';
  return `民國${rocYear}年${state.time.month}月第${state.time.week}週 ${slotStr}`;
}

export function addLog(
  state: GameState,
  text: string,
  tone: 'info' | 'good' | 'warn' | 'bad' = 'info'
) {
  state.logs.unshift({
    timeLabel: formatTimeLabel(state),
    text,
    tone,
  });
  if (state.logs.length > 80) {
    state.logs.length = 80;
  }
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function isStressPenaltyActive(state: GameState): boolean {
  return state.player.stress >= 70;
}

export function addStress(state: GameState, delta: number): void {
  state.player.stress = clamp(state.player.stress + delta, 0, 100);
  if (state.player.stress >= 100 && !state.endingId) {
    state.endingId = 'burnout';
    addLog(
      state,
      '【身心崩潰】你的情緒負壓達到 100 臨界點，在工地圍籬外昏厥送醫……',
      'bad'
    );
  }
}

/**
 * Needs national exam?
 * - 'contract' (約聘) must take 高考三級 (July W1) and 地方特考 (Dec W1).
 * - 'assistant' (技佐, 委任) must take 高考三級 / 地特三等 / 薦任升官等考試 to reach 技士 (薦任).
 * - Once 'specialist' (技士) or above, or if already passed an exam awaiting training completion to specialist, no exam needed.
 */
export function needsExamForSpecialist(state: GameState): boolean {
  const level = getRankDef(state.player.rankId).level;
  if (level >= 2) return false;
  if (state.player.targetRankAfterTraining === 'specialist') return false;
  if (
    state.pendingExam &&
    state.pendingExam.passed &&
    state.pendingExam.targetRank === 'specialist'
  ) {
    return false;
  }
  return true;
}

/**
 * Base pass rate rule confirmed by user:
 * - Step-by-step (逐階): 10%
 *   - contract -> local_4 (四等): 10%
 *   - assistant (四等技佐) -> high_3 / local_3 / promo_jianren (三等/薦任): 10%
 * - Cross-tier (跨階): 5%
 *   - contract -> high_3 / local_3 (直接考三等): 5%
 * Total pass rate = min(60, base + examBonus)
 */
export function getExamPassRatePercent(state: GameState, kind: ExamKind): number {
  let base = 10;
  if (state.player.rankId === 'contract' && (kind === 'high_3' || kind === 'local_3')) {
    base = 5;
  }
  return clamp(base + state.player.examBonus, 5, 60);
}

/**
 * Qualitative study readiness hint for UI (since exact % is hidden)
 */
export function getStudyReadinessHint(state: GameState): string {
  const b = state.player.examBonus;
  if (!needsExamForSpecialist(state)) return '已具薦任資格（免試）';
  if (b >= 45) return '胸有成竹（法條滾瓜爛熟）';
  if (b >= 30) return '漸入佳境（歷屆試題得心應手）';
  if (b >= 15) return '略有所成（基本爭點已有概念）';
  if (b >= 5) return '剛翻幾頁（法典還很新）';
  return '毫無頭緒（裸考狀態）';
}

export function getRemainingSlotsInMonth(state: GameState): number {
  const weeksLeftAfterThis = 4 - state.time.week;
  const slotsInThisWeek = state.time.slot === 'AM' ? 2 : 1;
  return weeksLeftAfterThis * 2 + slotsInThisWeek;
}

export function getEffectiveActionOutput(
  state: GameState,
  basePerAction: number,
  eventMultiplier = 1
): number {
  const rank = getRankDef(state.player.rankId);
  let raw = Math.round(basePerAction * rank.kpiMultiplier * eventMultiplier);
  if (isStressPenaltyActive(state)) {
    raw = Math.max(1, Math.floor(raw * 0.5));
  }
  return raw;
}

export function estimateSlotsNeededForMonth(state: GameState): number {
  if (state.kpi.isTrainingMonth) return 0;
  const div = getDivisionDef(state.player.divisionId);
  const pOut = getEffectiveActionOutput(state, div.primaryKpi.perAction);
  const sOut = getEffectiveActionOutput(state, div.secondaryKpi.perAction);
  const pRem = Math.max(0, state.kpi.primaryTarget - state.kpi.primaryProgress);
  const sRem = Math.max(0, state.kpi.secondaryTarget - state.kpi.secondaryProgress);
  return Math.ceil(pRem / Math.max(1, pOut)) + Math.ceil(sRem / Math.max(1, sOut));
}

export function applyOfficialLeaveKpiReduction(state: GameState, slots: number): void {
  if (state.kpi.isTrainingMonth || slots <= 0) return;
  const div = getDivisionDef(state.player.divisionId);
  const rank = getRankDef(state.player.rankId);
  state.kpi.officialLeaveSlots = clamp(state.kpi.officialLeaveSlots + slots, 0, 8);
  const ratio = (8 - state.kpi.officialLeaveSlots) / 8;
  state.kpi.primaryTarget = Math.max(
    0,
    Math.floor(div.primaryKpi.monthlyTarget * rank.kpiMultiplier * ratio)
  );
  state.kpi.secondaryTarget = Math.max(
    0,
    Math.floor(div.secondaryKpi.monthlyTarget * rank.kpiMultiplier * ratio)
  );
}

export function isCurrentMonthKpiPassed(state: GameState): boolean {
  if (state.kpi.isTrainingMonth) return true;
  return (
    state.kpi.primaryProgress >= state.kpi.primaryTarget &&
    state.kpi.secondaryProgress >= state.kpi.secondaryTarget
  );
}

function rollRandomEvent(state: GameState, rng: Rng): GameEvent | null {
  if (state.kpi.isTrainingMonth) return null;
  // Base 18% chance per slot (lowered to 18% per user request)
  if (rng.next() >= 0.18) return null;

  const rankLevel = getRankDef(state.player.rankId).level;
  const eligible = EVENTS.filter((ev) => {
    if (rankLevel < ev.minRankLevel || rankLevel > ev.maxRankLevel) return false;
    if (
      !ev.divisions.includes('all') &&
      !ev.divisions.includes(state.player.divisionId)
    ) {
      return false;
    }
    if (ev.months && !ev.months.includes(state.time.month)) {
      return false;
    }
    return true;
  });

  if (eligible.length === 0) return null;
  const totalWeight = eligible.reduce((acc, e) => acc + e.weight, 0);
  let r = rng.next() * totalWeight;
  for (const ev of eligible) {
    r -= ev.weight;
    if (r <= 0) return ev;
  }
  return eligible[eligible.length - 1];
}

export function executeActionEffect(
  state: GameState,
  actionId: ActionId,
  rng: Rng,
  effectOverride?: EventChoiceEffect
): void {
  const div = getDivisionDef(state.player.divisionId);
  const mult = effectOverride?.outputMultiplier ?? 1;
  const tLabel = formatTimeLabel(state);

  if (effectOverride?.cancelCurrentSlot) {
    // Slot was consumed by interrupting event
    state.lastFeedback = {
      timeLabel: tLabel,
      actionTitle: '🚨 原定行程遭突發事件打斷',
      detail: effectOverride.log ?? '本時段因處理緊急突發事件，原定工作無法執行。',
      impactSummary: `本時段無常規進度產出｜目前情緒負壓 ${state.player.stress}/100`,
      tone: 'warn',
    };
    return;
  }

  if (!state.kpi.highlightCases) {
    state.kpi.highlightCases = [];
  }

  switch (actionId) {
    case 'primary_work': {
      const beforeVal = state.kpi.primaryProgress;
      const stressBefore = state.player.stress;
      const gain =
        effectOverride?.overridePrimaryGain !== undefined
          ? effectOverride.overridePrimaryGain
          : getEffectiveActionOutput(state, div.primaryKpi.perAction, mult);
      state.kpi.primaryProgress += gain;
      const afterVal = state.kpi.primaryProgress;
      const targetVal = Math.max(1, state.kpi.primaryTarget || div.primaryKpi.monthlyTarget);
      addStress(state, 5);

      const pool = vignettesData.primaryWork[state.player.divisionId];
      const v = rng.pick(pool);
      state.kpi.highlightCases.push(`【${v.site}】${v.finding}（+${gain}${div.primaryKpi.unit}）`);
      state.lastFeedback = {
        timeLabel: tLabel,
        actionTitle: `👷 ${div.primaryKpi.actionLabel}`,
        site: `受檢單位：${v.site}`,
        detail: v.detail,
        finding: `📋 稽查處置：${v.finding}`,
        impactSummary: `${div.primaryKpi.label} +${gain} ${div.primaryKpi.unit}（本月累計 ${afterVal}/${state.kpi.primaryTarget}）｜情緒負壓 +5`,
        tone: 'info',
        progressAnim: {
          kind: 'work_primary',
          label: `📊 本月「${div.primaryKpi.label}」完成進度`,
          positiveBanner: `🎯 本次完成 +${gain} ${div.primaryKpi.unit}！進度由 ${beforeVal} 推進至 ${afterVal} / ${state.kpi.primaryTarget} ${div.primaryKpi.unit}`,
          fromValue: beforeVal,
          toValue: afterVal,
          maxValue: targetVal,
          unit: div.primaryKpi.unit,
          deltaText: `+${gain} ${div.primaryKpi.unit}（${beforeVal} ➔ ${afterVal}）`,
          barTheme: 'kpi',
          secondaryStressFrom: stressBefore,
          secondaryStressTo: state.player.stress,
        },
      };
      addLog(
        state,
        `【${v.site}】${div.primaryKpi.label} +${gain}${div.primaryKpi.unit}（${beforeVal}➔${afterVal}/${state.kpi.primaryTarget}），負壓 +5`,
        'info'
      );
      break;
    }
    case 'secondary_work': {
      const beforeVal = state.kpi.secondaryProgress;
      const stressBefore = state.player.stress;
      const gain = getEffectiveActionOutput(state, div.secondaryKpi.perAction, mult);
      state.kpi.secondaryProgress += gain;
      const afterVal = state.kpi.secondaryProgress;
      const targetVal = Math.max(1, state.kpi.secondaryTarget || div.secondaryKpi.monthlyTarget);
      addStress(state, 6);

      const pool = vignettesData.secondaryWork[state.player.divisionId];
      const story = rng.pick(pool);
      state.kpi.highlightCases.push(`【${div.secondaryKpi.label}】${story}`);
      state.lastFeedback = {
        timeLabel: tLabel,
        actionTitle: `📁 ${div.secondaryKpi.actionLabel}`,
        site: `承辦業務：${div.secondaryKpi.label}`,
        detail: story,
        impactSummary: `${div.secondaryKpi.label} +${gain} ${div.secondaryKpi.unit}（本月累計 ${afterVal}/${state.kpi.secondaryTarget}）｜情緒負壓 +6`,
        tone: 'info',
        progressAnim: {
          kind: 'work_secondary',
          label: `📊 本月「${div.secondaryKpi.label}」完成進度`,
          positiveBanner: `🎯 本次完成 +${gain} ${div.secondaryKpi.unit}！進度由 ${beforeVal} 推進至 ${afterVal} / ${state.kpi.secondaryTarget} ${div.secondaryKpi.unit}`,
          fromValue: beforeVal,
          toValue: afterVal,
          maxValue: targetVal,
          unit: div.secondaryKpi.unit,
          deltaText: `+${gain} ${div.secondaryKpi.unit}（${beforeVal} ➔ ${afterVal}）`,
          barTheme: 'kpi',
          secondaryStressFrom: stressBefore,
          secondaryStressTo: state.player.stress,
        },
      };
      addLog(
        state,
        `【${div.secondaryKpi.actionLabel}】+${gain}${div.secondaryKpi.unit}（${beforeVal}➔${afterVal}/${state.kpi.secondaryTarget}），負壓 +6`,
        'info'
      );
      break;
    }
    case 'slack_study': {
      const beforeBonus = state.player.examBonus;
      const bonus = rng.nextInt(1, 3);
      state.player.examBonus = clamp(state.player.examBonus + bonus, 0, 55);
      const afterBonus = state.player.examBonus;
      const fromRate = Math.min(60, 10 + beforeBonus);
      const toRate = Math.min(60, 10 + afterBonus);

      const studyEncouragePool = [
        `✨ 知識吸收大有斬獲！艱澀的法條爭點瞬間融會貫通，國考實力 +${bonus}%！`,
        `📚 苦讀沒有白費！考古題解題速度明顯提升，累計知識加成達 +${afterBonus}%！`,
        `💡 腦中法學架構越來越清晰！離金榜題名轉任正式公務員又近了一大步（+${bonus}%）！`,
      ];
      const posBanner =
        afterBonus >= 50
          ? `🏆 知識儲備已達巔峰！國考上榜把握度已達最高上限 60%（累計加成 +${afterBonus}%）！`
          : rng.pick(studyEncouragePool);

      const story = rng.pick(vignettesData.slackStudy);
      state.lastFeedback = {
        timeLabel: tLabel,
        actionTitle: '📖 偷閒苦讀國考科目',
        detail: story,
        finding: `📈 知識累積報告：本次實力 +${bonus}%｜累計讀書加成 +${beforeBonus}% ➔ +${afterBonus}%（逐階上榜把握度 ${fromRate}% ➔ ${toRate}% / 最高60%）`,
        impactSummary: `國考知識累積 +${bonus}%（${getStudyReadinessHint(state)}）｜本時段無業務產出｜情緒負壓不變`,
        tone: 'good',
        progressAnim: {
          kind: 'study',
          label: '📚 國考知識累積與上榜把握度（上限 60%）',
          positiveBanner: posBanner,
          fromValue: fromRate,
          toValue: toRate,
          maxValue: 60,
          unit: '%',
          deltaText: `知識 +${bonus}%（${fromRate}% ➔ ${toRate}%）`,
          barTheme: 'study',
        },
      };
      addLog(
        state,
        `【偷閒看書】知識累積 +${bonus}%（上榜把握度 ${fromRate}%➔${toRate}%）`,
        'good'
      );
      break;
    }
    case 'relax_idle': {
      const stressBefore = state.player.stress;
      addStress(state, -10);
      const stressAfter = state.player.stress;
      const dropped = stressBefore - stressAfter;
      const story = rng.pick(vignettesData.relaxIdle);
      const restEncouragePool = [
        `✨ 身心獲得充分喘息！緊繃的神經終於鬆開，情緒負壓成功減少 ${dropped} 點！`,
        `🌿 休息是為了走更長遠的路！肩膀不再僵硬，心情明顯開朗許多（負壓 -${dropped}）！`,
        `☕ 片刻寧靜洗去一身疲憊，工地與公文的鳥氣瞬間煙消雲散（負壓 ${stressBefore} ➔ ${stressAfter}）！`,
      ];
      state.lastFeedback = {
        timeLabel: tLabel,
        actionTitle: '☕ 茶水間摸魚放空',
        detail: story,
        finding: `💚 正向舒壓回饋：情緒負壓由 ${stressBefore} 降至 ${stressAfter}（釋放 -${dropped} 點壓力，精神恢復飽滿！）`,
        impactSummary: `情緒負壓 -${dropped}（${stressBefore} ➔ ${stressAfter}/100）｜本時段無業務產出`,
        tone: 'good',
        progressAnim: {
          kind: 'rest',
          label: '🌿 情緒負壓釋放動態（數值越低越輕鬆）',
          positiveBanner: rng.pick(restEncouragePool),
          fromValue: stressBefore,
          toValue: stressAfter,
          maxValue: 100,
          unit: '點',
          deltaText: `負壓 -${dropped} 點（${stressBefore} ➔ ${stressAfter}）`,
          barTheme: 'relief',
        },
      };
      addLog(state, `【摸魚喘息】情緒負壓 -${dropped}（${stressBefore}➔${stressAfter}）`, 'good');
      break;
    }
    case 'take_leave': {
      if (state.player.annualLeaveLeft > 0) {
        const stressBefore = state.player.stress;
        state.player.annualLeaveLeft -= 1;
        addStress(state, -25);
        const stressAfter = state.player.stress;
        const dropped = stressBefore - stressAfter;
        state.lastFeedback = {
          timeLabel: tLabel,
          actionTitle: '🌴 請休半天特休假',
          detail: '你關掉公務機群組通知，徹底遠離工地噪音與刁民申訴電話，睡到自然醒後去吃了頓大餐。',
          finding: `💚 深度休假充電完成：情緒負壓由 ${stressBefore} 大幅降至 ${stressAfter}（釋放 -${dropped} 點壓力，身心煥然一新！）`,
          impactSummary: `情緒負壓 -${dropped}（剩餘特休 ${state.player.annualLeaveLeft} 格，注意：本月 KPI 目標不變）`,
          tone: 'good',
          progressAnim: {
            kind: 'rest',
            label: '🌴 特休深度減壓動態（數值越低越輕鬆）',
            positiveBanner: `☀️ 休假充電大成功！負壓由 ${stressBefore} 大幅退散至 ${stressAfter}（釋放 ${dropped} 點壓力）！`,
            fromValue: stressBefore,
            toValue: stressAfter,
            maxValue: 100,
            unit: '點',
            deltaText: `負壓 -${dropped} 點（${stressBefore} ➔ ${stressAfter}）`,
            barTheme: 'relief',
          },
        };
        addLog(
          state,
          `【請休特休假】情緒負壓 -${dropped}（${stressBefore}➔${stressAfter}，剩餘特休 ${state.player.annualLeaveLeft} 格）`,
          'good'
        );
      }
      break;
    }
    case 'mgmt_supervise': {
      const beforeVal = state.kpi.primaryProgress;
      const stressBefore = state.player.stress;
      const gain = getEffectiveActionOutput(state, div.primaryKpi.perAction, mult * 1.25);
      state.kpi.primaryProgress += gain;
      const afterVal = state.kpi.primaryProgress;
      const targetVal = Math.max(1, state.kpi.primaryTarget || div.primaryKpi.monthlyTarget);
      state.player.bossFavor = clamp(state.player.bossFavor + 2, 0, 100);
      addStress(state, 5);
      const story = rng.pick(vignettesData.mgmtSupervise);
      state.kpi.highlightCases.push(`【督導稽查】${story}（+${gain}${div.primaryKpi.unit}）`);
      state.lastFeedback = {
        timeLabel: tLabel,
        actionTitle: '📋 督導科室專案稽查',
        detail: story,
        impactSummary: `科室主KPI +${gain} ${div.primaryKpi.unit}（累計 ${afterVal}/${state.kpi.primaryTarget}）｜長官好感 +2｜情緒負壓 +5`,
        tone: 'info',
        progressAnim: {
          kind: 'work_primary',
          label: `📊 科室「${div.primaryKpi.label}」完成進度`,
          positiveBanner: `🎯 督導專案完成 +${gain} ${div.primaryKpi.unit}！進度由 ${beforeVal} 推進至 ${afterVal} / ${state.kpi.primaryTarget} ${div.primaryKpi.unit}`,
          fromValue: beforeVal,
          toValue: afterVal,
          maxValue: targetVal,
          unit: div.primaryKpi.unit,
          deltaText: `+${gain} ${div.primaryKpi.unit}（${beforeVal} ➔ ${afterVal}）`,
          barTheme: 'kpi',
          secondaryStressFrom: stressBefore,
          secondaryStressTo: state.player.stress,
        },
      };
      addLog(
        state,
        `【督導稽查】+${gain}${div.primaryKpi.unit}（${beforeVal}➔${afterVal}/${state.kpi.primaryTarget}），好感 +2，負壓 +5`,
        'info'
      );
      break;
    }
    case 'mgmt_coord': {
      const beforeVal = state.kpi.secondaryProgress;
      const stressBefore = state.player.stress;
      const gain = getEffectiveActionOutput(state, div.secondaryKpi.perAction, mult);
      state.kpi.secondaryProgress += gain;
      const afterVal = state.kpi.secondaryProgress;
      const targetVal = Math.max(1, state.kpi.secondaryTarget || div.secondaryKpi.monthlyTarget);
      state.player.reputation = clamp(state.player.reputation + 2, 0, 100);
      addStress(state, 5);
      const story = rng.pick(vignettesData.mgmtCoord);
      state.kpi.highlightCases.push(`【跨局處協調】${story}（+${gain}${div.secondaryKpi.unit}）`);
      state.lastFeedback = {
        timeLabel: tLabel,
        actionTitle: '🏛️ 主持跨局處與專案協調會',
        detail: story,
        impactSummary: `次要KPI +${gain} ${div.secondaryKpi.unit}（累計 ${afterVal}/${state.kpi.secondaryTarget}）｜社會聲望 +2｜情緒負壓 +5`,
        tone: 'info',
        progressAnim: {
          kind: 'work_secondary',
          label: `📊 科室「${div.secondaryKpi.label}」完成進度`,
          positiveBanner: `🎯 跨局處協調完成 +${gain} ${div.secondaryKpi.unit}！進度由 ${beforeVal} 推進至 ${afterVal} / ${state.kpi.secondaryTarget} ${div.secondaryKpi.unit}`,
          fromValue: beforeVal,
          toValue: afterVal,
          maxValue: targetVal,
          unit: div.secondaryKpi.unit,
          deltaText: `+${gain} ${div.secondaryKpi.unit}（${beforeVal} ➔ ${afterVal}）`,
          barTheme: 'kpi',
          secondaryStressFrom: stressBefore,
          secondaryStressTo: state.player.stress,
        },
      };
      addLog(
        state,
        `【主持專案協調】+${gain}${div.secondaryKpi.unit}（${beforeVal}➔${afterVal}/${state.kpi.secondaryTarget}），聲望 +2，負壓 +5`,
        'info'
      );
      break;
    }
  }
}

export function applyEventChoiceEffects(
  state: GameState,
  effects: EventChoiceEffect
): void {
  const div = getDivisionDef(state.player.divisionId);
  const rank = getRankDef(state.player.rankId);

  if (effects.officialLeaveSlots) {
    applyOfficialLeaveKpiReduction(state, effects.officialLeaveSlots);
  }
  if (effects.blockNextSlots) {
    state.player.blockedSlots += effects.blockNextSlots;
    state.player.blockedReason = '重大職災後續調查與復工審查';
  }
  if (effects.extraPrimaryTargetActions) {
    const add = Math.round(
      div.primaryKpi.perAction * rank.kpiMultiplier * effects.extraPrimaryTargetActions
    );
    state.kpi.primaryTarget += add;
  }
  if (effects.extraPrimaryTargetRaw) {
    state.kpi.primaryTarget += effects.extraPrimaryTargetRaw;
  }
  if (effects.extraSecondaryTargetActions) {
    const add = Math.round(
      div.secondaryKpi.perAction * rank.kpiMultiplier * effects.extraSecondaryTargetActions
    );
    state.kpi.secondaryTarget += add;
  }
  if (effects.bonusPrimaryRaw) {
    state.kpi.primaryProgress += effects.bonusPrimaryRaw;
  }
  if (effects.bossFavor) {
    state.player.bossFavor = clamp(state.player.bossFavor + effects.bossFavor, 0, 100);
  }
  if (effects.reputation) {
    state.player.reputation = clamp(state.player.reputation + effects.reputation, -100, 100);
  }
  if (effects.colleagueRelation) {
    state.player.colleagueRelation = clamp(
      state.player.colleagueRelation + effects.colleagueRelation,
      0,
      100
    );
  }
  if (effects.corruption) {
    state.player.corruption = clamp(state.player.corruption + effects.corruption, 0, 100);
  }
  if (effects.examBonus) {
    state.player.examBonus = clamp(state.player.examBonus + effects.examBonus, 0, 55);
  }
  if (effects.stress) {
    addStress(state, effects.stress);
  }
  if (effects.log) {
    addLog(
      state,
      `【突發事件】${effects.log}`,
      (effects.stress ?? 0) > 5 ? 'warn' : 'info'
    );
  }
}

/**
 * Triggers mandatory exam during week 1 AM of July, November (odd ROC years for assistant), or December.
 * Returns true if the slot was consumed by an exam or modal opened.
 */
function checkMandatoryExamWeek(state: GameState, rng: Rng): boolean {
  if (state.time.week !== 1 || state.time.slot !== 'AM') return false;
  if (!needsExamForSpecialist(state)) return false;

  const rocYear = 115 + state.time.year;
  // July Week 1: 高考三級
  if (state.time.month === 7) {
    conductExam(state, 'high_3', rng);
    return true;
  }
  // November Week 1 (odd ROC years 117, 119): 薦任升官等考試 for 技佐
  if (
    state.time.month === 11 &&
    rocYear % 2 === 1 &&
    state.player.rankId === 'assistant'
  ) {
    conductExam(state, 'promo_jianren', rng);
    return true;
  }
  // December Week 1: 地方特考
  if (state.time.month === 12) {
    if (state.player.rankId === 'contract') {
      // Let contract player choose 三等 (5% base -> 技士) or 四等 (10% base -> 技佐)
      state.activeModal = {
        type: 'exam_choice',
        title: `民國${rocYear}年地方政府特考應試等別選擇`,
        body: '本週為地方特考週（給予公假 2 格並按比例調降本月 KPI）。請選擇本次應考等別：\n• 報考【三等考試】：跨階應考難度較高，但錄取訓練期滿直接敘任「薦任技士」。\n• 報考【四等考試】：逐階應考把握度較高，錄取後敘任「委任技佐」，日後仍須通過三等考試或升官等考試方可升任技士。',
      };
      return true;
    } else {
      conductExam(state, 'local_3', rng);
      return true;
    }
  }
  return false;
}

export function conductExam(state: GameState, kind: ExamKind, rng: Rng): void {
  const passRate = getExamPassRatePercent(state, kind);
  const roll = rng.next() * 100;
  const passed = roll < passRate;

  // Exam occupies both AM and PM of Week 1 (1 current slot + 1 blocked next slot) and grants 2 official leave slots
  applyOfficialLeaveKpiReduction(state, 2);
  state.player.blockedSlots += 1;
  state.player.blockedReason = '參加國家考試（下午場次）';

  let announceYear = state.time.year;
  let announceMonth = 9;
  let announceWeek = 4;
  let targetRank: RankId = 'specialist';
  let examName = '公務人員高等考試三級考試';

  if (kind === 'high_3') {
    announceMonth = 9;
    announceWeek = 4;
    targetRank = 'specialist';
    examName = '公務人員高考三級（勞工行政／工業安全）';
  } else if (kind === 'local_3') {
    announceYear = state.time.year + 1;
    announceMonth = 2;
    announceWeek = 1;
    targetRank = 'specialist';
    examName = '地方政府特考三等考試';
  } else if (kind === 'local_4') {
    announceYear = state.time.year + 1;
    announceMonth = 2;
    announceWeek = 1;
    targetRank = 'assistant';
    examName = '地方政府特考四等考試';
  } else if (kind === 'promo_jianren') {
    announceYear = state.time.year + 1;
    announceMonth = 1;
    announceWeek = 2;
    targetRank = 'specialist';
    examName = '公務人員薦任升官等考試';
  }

  state.pendingExam = {
    kind,
    passed,
    announceYear,
    announceMonth,
    announceWeek,
    targetRank,
  };

  state.lastFeedback = {
    timeLabel: formatTimeLabel(state),
    actionTitle: `✍️ 應試：${examName}`,
    detail: `你帶著准考證與文具進入國家考場振筆疾書（本週核給公假 2 格，本月 KPI 已按比例調降為 ${state.kpi.primaryTarget} / ${state.kpi.secondaryTarget}）。`,
    finding: `📅 預計放榜時間：${announceMonth}月第${announceWeek}週`,
    impactSummary: `上榜把握度：${passRate}%｜下午場次將繼續應試`,
    tone: 'info',
  };

  addLog(
    state,
    `【國家考試】參加「${examName}」（公假 2 格，${announceMonth}月第${announceWeek}週放榜）`,
    'info'
  );
}

function checkExamAnnouncement(state: GameState): void {
  const pending = state.pendingExam;
  if (!pending) return;
  if (
    state.time.year === pending.announceYear &&
    state.time.month === pending.announceMonth &&
    state.time.week === pending.announceWeek &&
    state.time.slot === 'AM'
  ) {
    state.pendingExam = null;
    if (pending.passed) {
      // Reset examBonus ONLY when passing!
      state.player.examBonus = 0;
      addStress(state, -30);

      if (pending.kind === 'promo_jianren') {
        // Immediate promotion from 技佐 to 技士
        state.player.rankId = 'specialist';
        state.player.monthsInRank = 0;
        addLog(
          state,
          `🎉【金榜題名】薦任升官等考試放榜錄取！你正式晉升為「薦任技士」，情緒負壓大幅降低 30 點！`,
          'good'
        );
      } else {
        state.player.practicalTrainingMonths = 4;
        state.player.targetRankAfterTraining = pending.targetRank;
        const targetTitle = getRankDef(pending.targetRank).title;
        addLog(
          state,
          `🎉【金榜題名】國家考試放榜錄取！情緒負壓 -30！即日起展開為期 4 個月的實務訓練，期滿將正式派代「${targetTitle}」（累積讀書加成已重置）。`,
          'good'
        );
      }
    } else {
      // Failed: keep examBonus!
      addStress(state, 10);
      addLog(
        state,
        `【國考落榜】考選部放榜結果未錄取，情緒負壓 +10。但先前的讀書記憶仍在，繼續努力下次更有把握！`,
        'warn'
      );
    }
  }
}

function buildSupervisorFeedback(
  state: GameState,
  passed: boolean,
  isTrainingMonth: boolean,
  rng: Rng
): { supervisorTitle: string; supervisorComment: string } {
  const rank = state.player.rankId;
  const div = getDivisionDef(state.player.divisionId);

  let supervisorTitle = `${div.name} 科長`;
  if (rank === 'chief') {
    supervisorTitle = '北辰市勞動檢查處 副處長';
  } else if (rank === 'deputy_director') {
    supervisorTitle = '北辰市勞動檢查處 處長';
  } else if (rank === 'director') {
    supervisorTitle = '北辰市政府 勞動局局長';
  }

  if (isTrainingMonth) {
    return {
      supervisorTitle,
      supervisorComment: `「${state.player.name}，這個月的新人職前法規與實務訓練表現很穩定。從下個月（2月）開始就要正式揹負科室的稽查場次與申訴案KPI了，去現場遇到慣老闆態度硬一點，但也別忘了注意自身安全！」`,
    };
  }

  if (passed) {
    const passComments = [
      `「${state.player.name}，這個月的檢查場次跟專案結案數都如期達標，處分書寫得也很紮實，沒被法制室退件。繼續保持這個節奏，年底考績我會替你爭取！」`,
      `「幹得好！這個月轄區幾件棘手的案子你都處理得很俐落，連主任秘書在處務會議上都特別點名表揚我們${div.name}，辛苦了！」`,
      `「看你的差勤跟稽查紀錄，每週進度都抓得很穩。公家機關就是這樣，先把長官要的KPI數字交出來，剩下的時間你要看書進修或喘口氣，我絕對不會干涉你。」`,
    ];
    return {
      supervisorTitle,
      supervisorComment: rng.pick(passComments),
    };
  } else {
    const fails = state.halfYearFailedMonths;
    const failComments = [
      `「${state.player.name}！你看看這個月的統計報表，檢查場次跟結案數雙雙落後！上面催辦單已經壓下來了，你這半年已經累計 ${fails} 個月沒達標，滿 3 個月連我也保不住你！」`,
      `「怎麼回事？這個月外出稽查的場次明顯不夠，積案都堆在辦公桌上了！我知道現場突發狀況多，但績效數字是死規定，下個月務必給我補上來！」`,
      `「人事室剛剛把月度管考紅單送到我桌上。你這半年已經有 ${fails}/3 個月未達標，再這樣下去半年考評會直接被送考績會汰除，自己繃緊神經！」`,
    ];
    return {
      supervisorTitle,
      supervisorComment: rng.pick(failComments),
    };
  }
}

function processEndOfMonth(state: GameState, rng: Rng): void {
  const rocYear = 115 + state.time.year;
  const monthEnded = state.time.month;
  const div = getDivisionDef(state.player.divisionId);
  const wasTrainingMonth = state.kpi.isTrainingMonth;
  const pProg = state.kpi.primaryProgress;
  const pTarg = state.kpi.primaryTarget;
  const sProg = state.kpi.secondaryProgress;
  const sTarg = state.kpi.secondaryTarget;
  const cases = [...(state.kpi.highlightCases ?? [])];

  // 1. Evaluate monthly KPI
  let passed = true;
  if (wasTrainingMonth) {
    state.halfYearMonthResults.push({
      month: monthEnded,
      passed: true,
      exempt: true,
    });
    addLog(
      state,
      `1月份新進人員職前專業訓練圓滿結束！下個月起正式開始計算每月勞動檢查績效目標。`,
      'info'
    );
  } else {
    passed = isCurrentMonthKpiPassed(state);
    state.halfYearMonthResults.push({
      month: monthEnded,
      passed,
    });
    if (passed) {
      addStress(state, -3);
      state.player.bossFavor = clamp(state.player.bossFavor + 2, 0, 100);
      addLog(
        state,
        `【${monthEnded}月績效結算：達標】主次要 KPI 皆達成 100%，情緒負壓 -3，長官好感 +2。`,
        'good'
      );
    } else {
      state.halfYearFailedMonths += 1;
      addStress(state, 8);
      state.player.bossFavor = clamp(state.player.bossFavor - 4, 0, 100);
      addLog(
        state,
        `【${monthEnded}月績效結算：未達標】檢查進度落後（本半年累計未達標 ${state.halfYearFailedMonths}/3 個月），情緒負壓 +8！`,
        'bad'
      );
    }
  }

  const { supervisorTitle, supervisorComment } = buildSupervisorFeedback(
    state,
    passed,
    wasTrainingMonth,
    rng
  );
  const halfYearFailedSnapshot = state.halfYearFailedMonths;

  // 2. Corruption investigation check (monthly chance = corruption / 2 %)
  if (!state.endingId && state.player.corruption > 0) {
    const chance = state.player.corruption * 0.5;
    if (rng.next() * 100 < chance) {
      state.endingId = 'corruption_jailed';
      addLog(
        state,
        `【廉政風暴】政風處與廉政署掌握你收賄放水事證，持搜索票發動突擊搜索！`,
        'bad'
      );
      return;
    }
  }

  // 3. Advance tenure and practical training
  state.player.monthsInRank += 1;
  if (state.player.practicalTrainingMonths > 0) {
    state.player.practicalTrainingMonths -= 1;
    if (
      state.player.practicalTrainingMonths === 0 &&
      state.player.targetRankAfterTraining
    ) {
      const newRank = state.player.targetRankAfterTraining;
      state.player.rankId = newRank;
      state.player.targetRankAfterTraining = null;
      state.player.monthsInRank = 0;
      const rankTitle = getRankDef(newRank).title;
      addLog(
        state,
        `📜【合格實授】4 個月實務訓練期滿成績及格，正式銓敘審定為「${rankTitle}」！`,
        'good'
      );
    }
  }

  // 4. Half-year review at end of June (month 6) and December (month 12)
  let halfYearSummary: string | undefined;
  if (!state.endingId && (monthEnded === 6 || monthEnded === 12)) {
    halfYearSummary = processHalfYearReview(state, rng);
  }

  // 5. Create monthly settlement report modal (if game hasn't ended)
  if (!state.endingId) {
    state.activeModal = {
      type: 'monthly_report',
      title: `📋 民國${rocYear}年${monthEnded}月份 業務績效結算考評表`,
      body: supervisorComment,
      monthlyReport: {
        rocYear,
        month: monthEnded,
        divisionName: div.name,
        isTrainingMonth: wasTrainingMonth,
        passed,
        primaryLabel: div.primaryKpi.label,
        primaryProgress: pProg,
        primaryTarget: pTarg,
        primaryUnit: div.primaryKpi.unit,
        secondaryLabel: div.secondaryKpi.label,
        secondaryProgress: sProg,
        secondaryTarget: sTarg,
        secondaryUnit: div.secondaryKpi.unit,
        highlightCases: cases.slice(-6),
        supervisorTitle,
        supervisorComment,
        halfYearFailedMonths: halfYearFailedSnapshot,
        halfYearSummary,
      },
    };
  }
}

function assignRandomDivisionOnPromotion(state: GameState, rng: Rng): DivisionId {
  const others = DIVISIONS.map((d) => d.id).filter(
    (id) => id !== state.player.divisionId
  );
  return rng.pick(others);
}

function processHalfYearReview(state: GameState, rng: Rng): string | undefined {
  const rocYear = 115 + state.time.year;
  const halfLabel = state.time.month === 6 ? '上半年' : '下半年';
  const periodLabel = `民國${rocYear}年${halfLabel}`;
  const fails = state.halfYearFailedMonths;

  if (fails >= 3) {
    state.reviews.push({
      periodLabel,
      failedMonths: fails,
      grade: '考評汰除',
      rankAtReview: state.player.rankId,
    });
    state.endingId = 'dismissed_kpi';
    addLog(
      state,
      `【${periodLabel}考評：汰除】半年內累計 ${fails} 個月績效未達標（達半數以上），移送考績會決議不予續任／免職！`,
      'bad'
    );
    return undefined;
  }

  const grade: '優' | '甲' | '乙' = fails === 0 ? '優' : fails === 1 ? '甲' : '乙';
  state.reviews.push({
    periodLabel,
    failedMonths: fails,
    grade,
    rankAtReview: state.player.rankId,
  });

  let summary = '';
  if (grade === '優') {
    state.player.totalExcellentGrades += 1;
    addStress(state, -10);
    summary = `🏅【${periodLabel}半年度考評：優等】6個月全數達標！獲處長公開嘉獎，情緒負壓 -10。`;
    addLog(state, summary, 'good');
  } else if (grade === '甲') {
    summary = `✅【${periodLabel}半年度考評：甲等】半年內僅 1 個月未達標，考評甲等，符合升遷採計資格。`;
    addLog(state, summary, 'info');
  } else {
    // 乙等 (2 months failed): Option B -> no promotion + boss interview (+15 stress)
    state.player.chiefGoodReviews = 0;
    addStress(state, 15);
    summary = `⚠️【${periodLabel}半年度考評：乙等】半年內有 2 個月未達標，遭科長與主任秘書嚴厲約談（情緒負壓 +15），本季不得升遷！`;
    addLog(state, summary, 'warn');
  }

  if (state.endingId) return summary;

  // Check promotion eligibility if grade is 優 or 甲
  const rankBefore = state.player.rankId;
  if (grade === '優' || grade === '甲') {
    tryPromotePlayer(state, rng);
  }
  if (state.player.rankId !== rankBefore) {
    const newRankDef = getRankDef(state.player.rankId);
    const newDivDef = getDivisionDef(state.player.divisionId);
    summary += `\n🎊【人事升遷派令】恭賀榮升「${newRankDef.title}（${newRankDef.grade}）」，並輪調至【${newDivDef.name}】！`;
  }

  // Reset half-year counters
  state.halfYearFailedMonths = 0;
  state.halfYearMonthResults = [];
  return summary;
}

function tryPromotePlayer(state: GameState, rng: Rng): void {
  const rank = state.player.rankId;
  // Minimum 5 months in rank allows same-half-year promotion when newly appointed in Feb/Oct
  if (state.player.monthsInRank < 5) return;

  if (rank === 'specialist') {
    promoteTo(state, 'inspector', rng);
  } else if (rank === 'inspector') {
    promoteTo(state, 'senior_tech', rng);
  } else if (rank === 'senior_tech') {
    // Vacancy check for Chief (科長)
    const vacancyChance = clamp(0.65 + (state.player.bossFavor - 50) * 0.007, 0.4, 1.0);
    if (rng.next() < vacancyChance) {
      promoteTo(state, 'chief', rng);
    } else {
      addLog(
        state,
        `【升遷審查】你已具備升任科長資歷，但本次恰逢無科室主管出缺，待下次考核優先拔擢。`,
        'info'
      );
    }
  } else if (rank === 'chief') {
    state.player.chiefGoodReviews += 1;
    // Per GDD: Chief needs 2 consecutive 甲/優 reviews (12 months) to qualify for 簡任訓練
    if (!state.player.completedJianrenTraining && state.player.chiefGoodReviews >= 2) {
      const passChance = clamp(
        0.6 + state.player.totalExcellentGrades * 0.08,
        0.6,
        1.0
      );
      if (rng.next() < passChance) {
        state.player.completedJianrenTraining = true;
        promoteTo(state, 'deputy_director', rng);
      } else {
        addLog(
          state,
          `【簡任官等訓練】參加保訓會晉升簡任官等訓練評量未通過，半年後可再次參訓。`,
          'warn'
        );
      }
    } else if (state.player.completedJianrenTraining) {
      promoteTo(state, 'deputy_director', rng);
    } else {
      addLog(
        state,
        `【簡任資歷累積】科長任內考績優良（已累計 ${state.player.chiefGoodReviews}/2 次），再1次甲等以上即可參訓晉升簡任副處長！`,
        'info'
      );
    }
  } else if (rank === 'deputy_director') {
    const directorChance = clamp(0.7 + (state.player.bossFavor - 50) * 0.006, 0.5, 1.0);
    if (rng.next() < directorChance) {
      promoteTo(state, 'director', rng);
    } else {
      addLog(
        state,
        `【處長遴選】處長尚未屆齡退休出缺，你繼續以副處長身分襄助處務。`,
        'info'
      );
    }
  }
}

function promoteTo(state: GameState, nextRank: RankId, rng: Rng): void {
  const newDiv = assignRandomDivisionOnPromotion(state, rng);
  state.player.rankId = nextRank;
  state.player.divisionId = newDiv;
  state.player.monthsInRank = 0;
  addStress(state, -10);

  const rankDef = getRankDef(nextRank);
  const divDef = getDivisionDef(newDiv);
  addLog(
    state,
    `🎊【人事派令：榮升${rankDef.title}】經考績會審查通過，你晉升為「${rankDef.title}（${rankDef.grade}）」，並輪調至【${divDef.name}】！情緒負壓 -10。`,
    'good'
  );
}

/**
 * Advances clock by 1 slot (AM -> PM -> next week -> next month -> next year).
 */
export function advanceClockOneSlot(state: GameState, rng: Rng): void {
  state.time.totalSlotsElapsed += 1;

  if (state.time.slot === 'AM') {
    state.time.slot = 'PM';
    return;
  }

  // End of week (PM -> next week AM): natural stress recovery -1
  state.time.slot = 'AM';
  if (state.player.stress > 0 && !state.endingId) {
    addStress(state, -1);
  }

  if (state.time.week < 4) {
    state.time.week += 1;
    checkExamAnnouncement(state);
    return;
  }

  // End of month (Week 4 PM just finished)
  processEndOfMonth(state, rng);
  if (state.endingId) return;

  state.time.week = 1;
  if (state.time.month < 12) {
    state.time.month += 1;
  } else {
    // End of year
    if (state.time.year >= 5) {
      // 5 years completed! Determine final ending
      state.activeModal = null;
      resolveFiveYearEnding(state);
      return;
    }
    state.time.year += 1;
    state.time.month = 1;
    state.player.annualLeaveLeft = 4;
    addStress(state, -10);
    addLog(
      state,
      `🎆 邁入民國 ${115 + state.time.year} 年！年度特休假重置為 4 格，跨年休息讓情緒負壓 -10。`,
      'good'
    );
  }

  // Setup new month KPI
  state.kpi = computeInitialMonthlyKpi(
    state.player.divisionId,
    state.player.rankId,
    false
  );
  checkExamAnnouncement(state);
}

export function resolveFiveYearEnding(state: GameState): void {
  if (state.endingId) return;
  const rank = state.player.rankId;
  if (rank === 'director') {
    state.endingId = 'true_director';
  } else if (rank === 'deputy_director') {
    state.endingId = 'normal_deputy_director';
  } else if (rank === 'chief') {
    state.endingId = 'normal_chief';
  } else if (rank === 'senior_tech' || rank === 'inspector') {
    state.endingId = 'normal_senior_inspector';
  } else if (
    rank === 'specialist' ||
    rank === 'assistant' ||
    state.player.targetRankAfterTraining !== null
  ) {
    state.endingId = 'normal_official_entry';
  } else {
    state.endingId = 'eternal_contract';
  }
}

/**
 * Main entry point when the player clicks an action button for the current slot.
 */
function clearMonthlyReportIfAuto(state: GameState, autoResolveEvents: boolean): void {
  if (autoResolveEvents && state.activeModal?.type === 'monthly_report') {
    state.activeModal = null;
  }
}

export function performSlotAction(
  state: GameState,
  actionId: ActionId,
  autoResolveEvents = false
): void {
  if (state.endingId || state.activeModal) return;
  const rng = createRng(state.rngState);

  // 1. Check if current slot is blocked (e.g., exam PM or disaster investigation day 2)
  if (state.player.blockedSlots > 0) {
    state.player.blockedSlots -= 1;
    state.lastFeedback = {
      timeLabel: formatTimeLabel(state),
      actionTitle: `⏳ 執行鎖定行程：${state.player.blockedReason}`,
      detail: `本時段持續辦理「${state.player.blockedReason}」，無法排定其他常規業務。`,
      impactSummary: `剩餘鎖定時段：${state.player.blockedSlots} 格｜目前負壓 ${state.player.stress}/100`,
      tone: 'info',
    };
    addLog(
      state,
      `【行程鎖定】辦理「${state.player.blockedReason}」`,
      'info'
    );
    advanceClockOneSlot(state, rng);
    clearMonthlyReportIfAuto(state, autoResolveEvents);
    state.rngState = rng.getState();
    return;
  }

  // 2. Check mandatory national exam week
  if (checkMandatoryExamWeek(state, rng)) {
    state.rngState = rng.getState();
    if (state.activeModal && autoResolveEvents) {
      // Simulation auto-chooses local_3
      state.activeModal = null;
      conductExam(state, 'local_3', rng);
      advanceClockOneSlot(state, rng);
      clearMonthlyReportIfAuto(state, autoResolveEvents);
      state.rngState = rng.getState();
    } else if (!state.activeModal) {
      // Exam conducted immediately (e.g., July High Exam) -> advance this slot
      advanceClockOneSlot(state, rng);
      clearMonthlyReportIfAuto(state, autoResolveEvents);
      state.rngState = rng.getState();
    }
    return;
  }

  // 3. Roll random event ONLY if action is NOT relax_idle (摸魚) and NOT take_leave (請假)
  const isStressReliefAction = actionId === 'relax_idle' || actionId === 'take_leave';
  const ev = isStressReliefAction ? null : rollRandomEvent(state, rng);
  if (ev) {
    if (autoResolveEvents) {
      const choice = ev.choices[0];
      applyEventChoiceEffects(state, choice.effects);
      if (!state.endingId) {
        executeActionEffect(state, actionId, rng, choice.effects);
      }
      if (!state.endingId) {
        advanceClockOneSlot(state, rng);
      }
      clearMonthlyReportIfAuto(state, autoResolveEvents);
      state.rngState = rng.getState();
      return;
    } else {
      state.activeModal = {
        type: 'event',
        title: ev.title,
        body: ev.text,
        event: ev,
        pendingActionId: actionId,
      };
      state.rngState = rng.getState();
      return;
    }
  }

  // 4. Normal action execution
  executeActionEffect(state, actionId, rng);
  if (!state.endingId) {
    advanceClockOneSlot(state, rng);
  }
  clearMonthlyReportIfAuto(state, autoResolveEvents);
  state.rngState = rng.getState();
}

export function resolveActiveModalChoice(state: GameState, choiceIndex: number): void {
  const modal = state.activeModal;
  if (!modal) return;
  const rng = createRng(state.rngState);

  if (modal.type === 'monthly_report') {
    state.activeModal = null;
    return;
  }

  if (modal.type === 'exam_choice') {
    state.activeModal = null;
    const kind: ExamKind = choiceIndex === 0 ? 'local_3' : 'local_4';
    conductExam(state, kind, rng);
    advanceClockOneSlot(state, rng);
    state.rngState = rng.getState();
    return;
  }

  if (modal.type === 'event' && modal.event) {
    const choice = modal.event.choices[choiceIndex] ?? modal.event.choices[0];
    const pendingAction = modal.pendingActionId ?? 'primary_work';
    state.activeModal = null;

    applyEventChoiceEffects(state, choice.effects);
    if (!state.endingId) {
      executeActionEffect(state, pendingAction, rng, choice.effects);
    }
    if (!state.endingId) {
      advanceClockOneSlot(state, rng);
    }
    state.rngState = rng.getState();
    return;
  }

  state.activeModal = null;
}
