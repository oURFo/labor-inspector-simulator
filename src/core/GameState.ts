import divisionsData from '../data/divisions.json';
import ranksData from '../data/ranks.json';

export type SlotType = 'AM' | 'PM';
export type RankId =
  | 'contract'
  | 'assistant'
  | 'specialist'
  | 'inspector'
  | 'senior_tech'
  | 'chief'
  | 'deputy_director'
  | 'director';

export type DivisionId =
  | 'labor_conditions'
  | 'general_industry'
  | 'civil_eng'
  | 'building_eng'
  | 'machinery'
  | 'occ_health';

export type ExamKind = 'high_3' | 'local_3' | 'local_4' | 'promo_jianren';

export interface TimeState {
  /** 1..5 corresponds to 民國 116..120 年 */
  year: number;
  /** 1..12 */
  month: number;
  /** 1..4 */
  week: number;
  slot: SlotType;
  totalSlotsElapsed: number;
}

export interface MonthlyKpiState {
  primaryTarget: number;
  primaryProgress: number;
  secondaryTarget: number;
  secondaryProgress: number;
  /** Official leave slots this month (exams, typhoons, training) that reduce KPI proportionally */
  officialLeaveSlots: number;
  /** Whether this month is exempt from KPI (Year 1 Month 1 new-hire training) */
  isTrainingMonth: boolean;
  /** Highlight cases handled this month for the end-of-month settlement report */
  highlightCases?: string[];
}

export interface PendingExamResult {
  kind: ExamKind;
  passed: boolean;
  announceYear: number;
  announceMonth: number;
  announceWeek: number;
  targetRank: RankId;
}

export interface EventChoiceEffect {
  cancelCurrentSlot?: boolean;
  blockNextSlots?: number;
  officialLeaveSlots?: number;
  outputMultiplier?: number;
  overridePrimaryGain?: number;
  extraPrimaryTargetActions?: number;
  extraPrimaryTargetRaw?: number;
  extraSecondaryTargetActions?: number;
  bonusPrimaryRaw?: number;
  stress?: number;
  bossFavor?: number;
  reputation?: number;
  colleagueRelation?: number;
  corruption?: number;
  examBonus?: number;
  log?: string;
}

export interface GameEventChoice {
  label: string;
  effects: EventChoiceEffect;
}

export interface GameEvent {
  id: string;
  title: string;
  divisions: string[];
  minRankLevel: number;
  maxRankLevel: number;
  months?: number[];
  weight: number;
  text: string;
  choices: GameEventChoice[];
}

export interface MonthlyReportData {
  rocYear: number;
  month: number;
  divisionName: string;
  isTrainingMonth: boolean;
  passed: boolean;
  primaryLabel: string;
  primaryProgress: number;
  primaryTarget: number;
  primaryUnit: string;
  secondaryLabel: string;
  secondaryProgress: number;
  secondaryTarget: number;
  secondaryUnit: string;
  highlightCases: string[];
  supervisorTitle: string;
  supervisorComment: string;
  halfYearFailedMonths: number;
  halfYearSummary?: string;
}

export interface ActiveModal {
  type: 'onboarding' | 'event' | 'exam_choice' | 'monthly_report' | 'review' | 'promotion' | 'notice';
  title: string;
  body: string;
  event?: GameEvent;
  monthlyReport?: MonthlyReportData;
  /** Pending action ID that was interrupted or triggered before/with event */
  pendingActionId?: ActionId;
}

export type ActionId =
  | 'primary_work'
  | 'secondary_work'
  | 'slack_study'
  | 'relax_idle'
  | 'take_leave'
  | 'mgmt_supervise'
  | 'mgmt_coord';

export interface LogEntry {
  timeLabel: string;
  text: string;
  tone?: 'info' | 'good' | 'warn' | 'bad';
}

export interface HalfYearRecord {
  periodLabel: string;
  failedMonths: number;
  grade: '優' | '甲' | '乙' | '考評汰除';
  rankAtReview: RankId;
}

export interface AnimatedProgressFeedback {
  kind: 'work_primary' | 'work_secondary' | 'rest' | 'study';
  label: string;
  positiveBanner: string;
  fromValue: number;
  toValue: number;
  maxValue: number;
  unit: string;
  deltaText: string;
  barTheme: 'kpi' | 'relief' | 'study';
  secondaryStressFrom?: number;
  secondaryStressTo?: number;
}

export interface LatestFeedback {
  timeLabel: string;
  actionTitle: string;
  site?: string;
  detail: string;
  finding?: string;
  impactSummary: string;
  tone: 'info' | 'good' | 'warn' | 'bad';
  progressAnim?: AnimatedProgressFeedback;
}

export interface GameState {
  version: number;
  rngState: number;
  started: boolean;
  time: TimeState;
  player: {
    name: string;
    rankId: RankId;
    divisionId: DivisionId;
    /** Months served in current rank */
    monthsInRank: number;
    /** Remaining practical training months after passing exam (4 months) */
    practicalTrainingMonths: number;
    targetRankAfterTraining: RankId | null;
    /** Remaining slots blocked by multi-slot disaster or training */
    blockedSlots: number;
    blockedReason: string;
    /** Whether player has completed 晉升簡任官等訓練 */
    completedJianrenTraining: boolean;
    /** Consecutive 甲/優 grades while serving as Chief (科長) */
    chiefGoodReviews: number;
    /** Total 優 grades earned (increases 簡任訓練 pass rate) */
    totalExcellentGrades: number;
    /** Emotional stress 0..100 */
    stress: number;
    /** Hidden cumulative exam bonus % from slacking (0..55) */
    examBonus: number;
    bossFavor: number;
    reputation: number;
    colleagueRelation: number;
    /** Hidden corruption score 0..100 */
    corruption: number;
    /** Remaining annual leave slots (4 per year) */
    annualLeaveLeft: number;
  };
  kpi: MonthlyKpiState;
  halfYearFailedMonths: number;
  halfYearMonthResults: { month: number; passed: boolean; exempt?: boolean }[];
  reviews: HalfYearRecord[];
  pendingExam: PendingExamResult | null;
  activeModal: ActiveModal | null;
  lastFeedback?: LatestFeedback | null;
  logs: LogEntry[];
  endingId: string | null;
}

export const RANKS = ranksData as {
  id: RankId;
  level: number;
  title: string;
  grade: string;
  isManagement: boolean;
  kpiMultiplier: number;
  nextRank: RankId | null;
}[];

export const DIVISIONS = divisionsData as {
  id: DivisionId;
  name: string;
  category: string;
  description: string;
  primaryKpi: {
    id: string;
    label: string;
    unit: string;
    perAction: number;
    monthlyTarget: number;
    actionLabel: string;
    actionDesc: string;
  };
  secondaryKpi: {
    id: string;
    label: string;
    unit: string;
    perAction: number;
    monthlyTarget: number;
    actionLabel: string;
    actionDesc: string;
  };
}[];

export function getRankDef(id: RankId) {
  const found = RANKS.find((r) => r.id === id);
  if (!found) throw new Error(`Unknown rank: ${id}`);
  return found;
}

export function getDivisionDef(id: DivisionId) {
  const found = DIVISIONS.find((d) => d.id === id);
  if (!found) throw new Error(`Unknown division: ${id}`);
  return found;
}

export function computeInitialMonthlyKpi(
  divisionId: DivisionId,
  rankId: RankId,
  isTrainingMonth: boolean
): MonthlyKpiState {
  const div = getDivisionDef(divisionId);
  const rank = getRankDef(rankId);
  const mult = rank.kpiMultiplier;
  return {
    primaryTarget: isTrainingMonth ? 0 : Math.round(div.primaryKpi.monthlyTarget * mult),
    primaryProgress: 0,
    secondaryTarget: isTrainingMonth ? 0 : Math.round(div.secondaryKpi.monthlyTarget * mult),
    secondaryProgress: 0,
    officialLeaveSlots: 0,
    isTrainingMonth,
    highlightCases: [],
  };
}

export function createInitialGameState(
  name = '林敬言',
  divisionId: DivisionId = 'labor_conditions',
  seed = Date.now()
): GameState {
  const state: GameState = {
    version: 1,
    rngState: seed >>> 0 || 123456789,
    started: true,
    time: {
      year: 1,
      month: 1,
      week: 1,
      slot: 'AM',
      totalSlotsElapsed: 0,
    },
    player: {
      name,
      rankId: 'contract',
      divisionId,
      monthsInRank: 0,
      practicalTrainingMonths: 0,
      targetRankAfterTraining: null,
      blockedSlots: 0,
      blockedReason: '',
      completedJianrenTraining: false,
      chiefGoodReviews: 0,
      totalExcellentGrades: 0,
      stress: 20,
      examBonus: 0,
      bossFavor: 50,
      reputation: 50,
      colleagueRelation: 50,
      corruption: 0,
      annualLeaveLeft: 4,
    },
    kpi: computeInitialMonthlyKpi(divisionId, 'contract', true),
    halfYearFailedMonths: 0,
    halfYearMonthResults: [],
    reviews: [],
    pendingExam: null,
    activeModal: null,
    lastFeedback: {
      timeLabel: '民國116年1月第1週 上午',
      actionTitle: '新進人員報到與職前訓練啟動',
      site: `北辰市勞動檢查處・${getDivisionDef(divisionId).name}`,
      detail: '人事室發下勞動檢查證與法規彙編，1月份為職前專業訓練月（免計KPI），請點擊下方行動按鈕開始推進每個上下午時段！',
      impactSummary: '提示：1月份可全力點選「偷懶看書」衝刺7月高考把握度',
      tone: 'info',
    },
    logs: [
      {
        timeLabel: '民國116年1月第1週 上午',
        text: `歡迎報到北辰市勞動檢查處！經人事室分發，你以「約聘檢查員」身分派任【${getDivisionDef(divisionId).name}】。1月份為新進人員職前專業訓練月（免計績效目標），請把握時間熟悉業務或準備國考！`,
        tone: 'info',
      },
    ],
    endingId: null,
  };
  return state;
}
