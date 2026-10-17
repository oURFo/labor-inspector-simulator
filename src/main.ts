import './styles/main.css';
import {
  ActionId,
  createInitialGameState,
  DIVISIONS,
  GameState,
  getDivisionDef,
  getRankDef,
  RANKS,
} from './core/GameState';
import {
  ENDINGS,
  estimateSlotsNeededForMonth,
  formatTimeLabel,
  getEffectiveActionOutput,
  getRemainingSlotsInMonth,
  getStudyReadinessHint,
  isStressPenaltyActive,
  needsExamForSpecialist,
  performSlotAction,
  resolveActiveModalChoice,
} from './core/GameEngine';
import { createRng } from './core/rng';
import { loadAuto, loadFromSlot, saveAuto, saveToSlot } from './core/SaveSystem';

const appEl = document.getElementById('app')!;

let currentState: GameState | null = loadAuto();
let darkMode = false;

function setTheme(dark: boolean) {
  darkMode = dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

function getRecommendedAction(state: GameState): {
  actionId: ActionId;
  reason: string;
  urgency: 'normal' | 'warn' | 'danger';
} {
  const rankDef = getRankDef(state.player.rankId);
  const divDef = getDivisionDef(state.player.divisionId);
  const slotsLeft = getRemainingSlotsInMonth(state);
  const slotsNeeded = estimateSlotsNeededForMonth(state);
  const canStudy = needsExamForSpecialist(state);

  if (state.player.blockedSlots > 0) {
    return {
      actionId: 'primary_work',
      reason: `本時段因「${state.player.blockedReason}」鎖定，請點擊下方按鈕推進時段。`,
      urgency: 'warn',
    };
  }

  // 1. Critical stress warning (>= 65)
  if (state.player.stress >= 68) {
    if (state.player.annualLeaveLeft > 0 && slotsLeft > slotsNeeded) {
      return {
        actionId: 'take_leave',
        reason: `⚠️ 情緒負壓已高達 ${state.player.stress}/100（滿 70 產出減半、滿 100 過勞结局）！建議立即【請休特休假】降壓！`,
        urgency: 'danger',
      };
    }
    return {
      actionId: 'relax_idle',
      reason: `⚠️ 情緒負壓已高達 ${state.player.stress}/100（滿 70 產出減半）！建議先點選【茶水間摸魚喘息】降壓！`,
      urgency: 'danger',
    };
  }

  // 2. Training month (Year 1 Month 1)
  if (state.kpi.isTrainingMonth) {
    return {
      actionId: 'slack_study',
      reason: '💡 1月份為職前訓練月（免算 KPI），強烈建議連續點選【偷懶看書】衝高 7 月高考上榜率！',
      urgency: 'normal',
    };
  }

  // 3. Monthly KPI not yet met
  if (state.kpi.secondaryProgress < state.kpi.secondaryTarget) {
    return {
      actionId: rankDef.isManagement ? 'mgmt_coord' : 'secondary_work',
      reason: `📌 本月「${divDef.secondaryKpi.label}」尚未完成（${state.kpi.secondaryProgress}/${state.kpi.secondaryTarget}），建議優先點選完成！`,
      urgency: slotsNeeded >= slotsLeft ? 'danger' : 'normal',
    };
  }

  if (state.kpi.primaryProgress < state.kpi.primaryTarget) {
    const rem = state.kpi.primaryTarget - state.kpi.primaryProgress;
    return {
      actionId: rankDef.isManagement ? 'mgmt_supervise' : 'primary_work',
      reason: `📌 本月「${divDef.primaryKpi.label}」還差 ${rem} ${divDef.primaryKpi.unit}（剩餘 ${slotsLeft} 格時段，需工作 ${slotsNeeded} 格），建議先跑完檢查確保達標！`,
      urgency: slotsNeeded >= slotsLeft ? 'warn' : 'normal',
    };
  }

  // 4. Monthly KPI already 100% completed!
  if (canStudy) {
    return {
      actionId: 'slack_study',
      reason: `✅ 本月兩項 KPI 已 100% 達標！剩餘 ${slotsLeft} 個時段可安心點選【偷懶看書】衝刺國考！`,
      urgency: 'normal',
    };
  }

  if (state.player.stress >= 40) {
    return {
      actionId: 'relax_idle',
      reason: `✅ 本月 KPI 已全數達標！建議點選【摸魚喘息】調降情緒負壓（目前 ${state.player.stress}/100）。`,
      urgency: 'normal',
    };
  }

  return {
    actionId: rankDef.isManagement ? 'mgmt_supervise' : 'primary_work',
    reason: '✅ 本月 KPI 已達標且身心狀況良好，可繼續執行業務累積長官好感與聲望。',
    urgency: 'normal',
  };
}

function startNewGame(playerName: string) {
  const rng = createRng(Date.now());
  const randomDiv = rng.pick(DIVISIONS);
  currentState = createInitialGameState(playerName.trim() || '林敬言', randomDiv.id);
  currentState.activeModal = {
    type: 'onboarding',
    title: '【北辰市勞動檢查處 人事派令】',
    body: `受文者：${currentState.player.name} 君\n\n主旨：台端錄取本處「約聘檢查員」，自民國116年1月第1週起派任【${randomDiv.name}】（${randomDiv.category}），請查照。\n\n說明：\n一、${randomDiv.description}\n二、1月份為新進人員職前專業訓練月（免計績效目標），自2月份起按月考核主次要KPI。\n三、每半年（6月、12月底）結算一次考評，半年內若有 3 個月未達標即移送考績會汰除；未具正式薦任公務員資格前，每年7月第1週（高考三級）與12月第1週（地方特考）須強制應試。`,
  };
  saveAuto(currentState);
  render();
}

function renderTitleScreen() {
  const savedAuto = loadAuto();
  appEl.innerHTML = `
    <div class="app-shell">
      <div class="doc-sheet hero-card">
        <div class="gov-header">
          <div class="gov-title-group">
            <div class="official-seal">北辰<br/>勞檢</div>
            <div class="gov-title">
              <h1>北辰市勞動檢查處・勞動檢查員模擬器</h1>
              <div class="gov-subtitle">公職生存 × 現場稽查實錄 × 國考轉正 × 處長升遷傳奇</div>
            </div>
          </div>
          <button class="btn-small" id="btn-theme">${darkMode ? '☀️ 淺色公文' : '🌙 深色模式'}</button>
        </div>

        <p style="margin-bottom: 14px;">
          你剛錄取成為<strong>北辰市勞動檢查處</strong>的「約聘檢查員」。在接下來的<strong>五年（民國116年至120年）</strong>裡，你每個上下午時段都要做出抉擇：究竟要先跑完每月的工地與工廠稽查指標、在茶水間摸魚緩解高壓，還是趁空檔偷偷苦讀法條拼上國家考試，一路升上<strong>簡任第十一職等處長</strong>？
        </p>

        <div class="panel-box" style="margin-bottom: 16px; background: var(--bg-paper-alt);">
          <div class="panel-heading">📌 4 句話看懂怎麼玩</div>
          <ol style="padding-left: 20px; font-size: 0.92rem; display: flex; flex-direction: column; gap: 6px;">
            <li><strong>先看每月進度條</strong>：每個月有 8 個時段（4 週 × 上下午），通常做 <strong>6 次工作</strong>就能把本月兩項 KPI 填滿達標。</li>
            <li><strong>有多餘時段再偷看書</strong>：偷看書不會被抓，但會少做工作；<strong>半年內只要有 3 個月沒達標就會被開除！</strong></li>
            <li><strong>注意情緒負壓</strong>：每次外出稽查與辦案都會累積負壓（+5～+6），<strong>偷看書不會降壓</strong>，負壓快到 70 時記得按「摸魚」或「休假」喘口氣。</li>
            <li><strong>小心突發事件</strong>：目前每格有 <strong>36% 高機率</strong>遇到工安意外、前輩甩鍋、議員關說或塞紅包，隨時可能打亂你的排程！</li>
          </ol>
        </div>

        <div class="form-row">
          <label for="input-name" style="font-weight: 700;">新進檢查員姓名：</label>
          <input id="input-name" class="text-input" type="text" value="林敬言" maxlength="12" />
        </div>

        <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 18px;">
          <button class="primary-cta" id="btn-start-new">📜 宣誓報到（抽籤分發科室）</button>
          ${
            savedAuto
              ? `<button class="btn-small" id="btn-continue" style="font-weight:700; padding: 12px 18px;">📂 繼續上次進度（${savedAuto.player.name}・${formatTimeLabel(savedAuto)}）</button>`
              : ''
          }
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-theme')?.addEventListener('click', () => {
    setTheme(!darkMode);
    render();
  });

  document.getElementById('btn-start-new')?.addEventListener('click', () => {
    const input = document.getElementById('input-name') as HTMLInputElement;
    startNewGame(input?.value || '林敬言');
  });

  document.getElementById('btn-continue')?.addEventListener('click', () => {
    currentState = savedAuto;
    render();
  });
}

function renderEndingScreen(state: GameState) {
  const ending =
    ENDINGS.find((e) => e.id === state.endingId) ?? ENDINGS[ENDINGS.length - 1];
  const rankDef = getRankDef(state.player.rankId);
  const divDef = getDivisionDef(state.player.divisionId);
  const isGood = ending.type.includes('TRUE') || ending.type.includes('GOOD');

  appEl.innerHTML = `
    <div class="app-shell">
      <div class="doc-sheet hero-card">
        <div class="gov-header">
          <div class="gov-title-group">
            <div class="official-seal">北辰<br/>考銓</div>
            <div class="gov-title">
              <h1>北辰市勞動檢查處・服務生涯最終檔案</h1>
              <div class="gov-subtitle">結算時間：${formatTimeLabel(state)}</div>
            </div>
          </div>
          <button class="btn-small" id="btn-theme">${darkMode ? '☀️ 淺色' : '🌙 深色'}</button>
        </div>

        <span class="ending-badge ${isGood ? 'good' : ''}">${ending.type}</span>
        <h2 style="font-family: 'Noto Serif TC', serif; font-size: 1.65rem; margin-bottom: 6px;">${ending.title}</h2>
        <p style="color: var(--ink-secondary); font-weight: 600; margin-bottom: 16px;">${ending.subtitle}</p>

        <div class="panel-box" style="background: var(--bg-paper-alt); margin-bottom: 18px;">
          <p style="font-size: 0.98rem; line-height: 1.75;">${ending.description}</p>
        </div>

        <div class="officer-strip" style="margin-bottom: 18px;">
          <div class="officer-cell">
            <span class="officer-label">最終職稱與官職等</span>
            <span class="officer-value">${rankDef.title}（${rankDef.grade}）</span>
          </div>
          <div class="officer-cell">
            <span class="officer-label">最後服務科室</span>
            <span class="officer-value">${divDef.name}</span>
          </div>
          <div class="officer-cell">
            <span class="officer-label">累計半年度優等次數</span>
            <span class="officer-value">${state.player.totalExcellentGrades} 次</span>
          </div>
          <div class="officer-cell">
            <span class="officer-label">最終情緒負壓</span>
            <span class="officer-value">${state.player.stress} / 100</span>
          </div>
        </div>

        <button class="primary-cta" id="btn-restart">🔄 重新展開新一輪公職生涯</button>
      </div>
    </div>
  `;

  document.getElementById('btn-theme')?.addEventListener('click', () => {
    setTheme(!darkMode);
    render();
  });

  document.getElementById('btn-restart')?.addEventListener('click', () => {
    currentState = null;
    render();
  });
}

function renderMainGame(state: GameState) {
  const rankDef = getRankDef(state.player.rankId);
  const divDef = getDivisionDef(state.player.divisionId);
  const slotsLeft = getRemainingSlotsInMonth(state);
  const slotsNeeded = estimateSlotsNeededForMonth(state);
  const penaltyActive = isStressPenaltyActive(state);
  const canStudy = needsExamForSpecialist(state);
  const rec = getRecommendedAction(state);

  const pDone = state.kpi.primaryProgress >= state.kpi.primaryTarget;
  const sDone = state.kpi.secondaryProgress >= state.kpi.secondaryTarget;

  const pPct =
    state.kpi.primaryTarget > 0
      ? Math.min(100, Math.round((state.kpi.primaryProgress / state.kpi.primaryTarget) * 100))
      : 100;
  const sPct =
    state.kpi.secondaryTarget > 0
      ? Math.min(
          100,
          Math.round((state.kpi.secondaryProgress / state.kpi.secondaryTarget) * 100)
        )
      : 100;

  const stressClass =
    state.player.stress >= 70
      ? 'stress-danger'
      : state.player.stress >= 50
      ? 'stress-warn'
      : 'stress-ok';

  const perPrimaryGain = getEffectiveActionOutput(state, divDef.primaryKpi.perAction);
  const perSecondaryGain = getEffectiveActionOutput(state, divDef.secondaryKpi.perAction);

  const nextExamText = !canStudy
    ? '已具薦任資格（免考）'
    : state.pendingExam
    ? `等待放榜（${state.pendingExam.announceMonth}月第${state.pendingExam.announceWeek}週）`
    : state.time.month < 7
    ? '7月第1週 高考三級'
    : state.time.month === 11 &&
      (115 + state.time.year) % 2 === 1 &&
      state.player.rankId === 'assistant'
    ? '本月第1週 薦任升官等'
    : '12月第1週 地方特考';

  const fb = state.lastFeedback;

  appEl.innerHTML = `
    <div class="app-shell">
      <div class="doc-sheet">
        <!-- 1. Simplified Top Bar -->
        <div class="gov-header">
          <div class="gov-title-group">
            <div class="official-seal">北辰<br/>勞檢</div>
            <div class="gov-title">
              <h1>${state.player.name}｜${rankDef.title}（${divDef.name}）</h1>
              <div class="gov-subtitle">
                目標：5年內從約聘升任處長（目前第 ${state.time.year}/5 年・${
    state.player.practicalTrainingMonths > 0
      ? `🌱 實務訓練剩 ${state.player.practicalTrainingMonths} 個月轉正`
      : `本職級年資 ${state.player.monthsInRank} 個月`
  }）
              </div>
            </div>
          </div>
          <div class="header-controls">
            <span class="badge-time">${formatTimeLabel(state)}</span>
            <button class="btn-small" id="btn-save-1">💾 存檔</button>
            <button class="btn-small" id="btn-load-1">📂 讀檔</button>
            <button class="btn-small" id="btn-theme">${darkMode ? '☀️' : '🌙'}</button>
            <button class="btn-small" id="btn-title">🏠</button>
          </div>
        </div>

        <!-- 2. Clear Step-by-Step Guidance Banner ("What should I click right now?") -->
        <div class="guidance-banner ${rec.urgency}">
          <div class="guidance-step">👉 下一步行動指引（本月還剩 <strong>${slotsLeft}</strong> 個時段，完成KPI還需 <strong>${slotsNeeded}</strong> 格）</div>
          <div class="guidance-reason">${rec.reason}</div>
        </div>

        <!-- 3. Action Buttons RIGHT AT THE TOP where the player interacts -->
        <div class="panel-box action-stage">
          <div class="panel-heading">
            <span>⚡ 請點選本時段（${state.time.slot === 'AM' ? '上午' : '下午'}）要執行的工作</span>
            <span style="font-size:0.8rem; color:var(--ink-secondary);">帶有「★ 推薦」標記為系統建議</span>
          </div>

          <div class="actions-grid">
            ${
              state.player.blockedSlots > 0
                ? `<button class="action-card recommended" data-action="primary_work">
                    <div class="action-title">
                      <span>⏳ 執行鎖定行程：${state.player.blockedReason}</span>
                      <span class="action-tag rec-badge">★ 必點推進</span>
                    </div>
                    <div class="action-desc">因重大職災後續調查或國家考試下午場次，點擊此處推進本時段。</div>
                  </button>`
                : rankDef.isManagement
                ? `
                  <button class="action-card ${
                    rec.actionId === 'mgmt_supervise' ? 'recommended' : ''
                  }" data-action="mgmt_supervise">
                    <div class="action-title">
                      <span>📋 督導科室專案稽查</span>
                      <span class="action-tag ${pDone ? 'done-tag' : ''}">
                        ${rec.actionId === 'mgmt_supervise' ? '★ 推薦｜' : ''}主KPI +${getEffectiveActionOutput(
                    state,
                    divDef.primaryKpi.perAction,
                    1.25
                  )} ${divDef.primaryKpi.unit}
                      </span>
                    </div>
                    <div class="action-desc">核閱下屬報告並帶隊稽查（目前 ${state.kpi.primaryProgress}/${state.kpi.primaryTarget}｜負壓 +5）</div>
                  </button>
                  <button class="action-card ${
                    rec.actionId === 'mgmt_coord' ? 'recommended' : ''
                  }" data-action="mgmt_coord">
                    <div class="action-title">
                      <span>🏛️ 主持跨局處協調會</span>
                      <span class="action-tag ${sDone ? 'done-tag' : ''}">
                        ${rec.actionId === 'mgmt_coord' ? '★ 推薦｜' : ''}次KPI +${perSecondaryGain} ${divDef.secondaryKpi.unit}
                      </span>
                    </div>
                    <div class="action-desc">主持重大勞資工安專案會議（目前 ${state.kpi.secondaryProgress}/${state.kpi.secondaryTarget}｜負壓 +5）</div>
                  </button>
                `
                : `
                  <button class="action-card ${
                    rec.actionId === 'primary_work' ? 'recommended' : ''
                  }" data-action="primary_work">
                    <div class="action-title">
                      <span>ヘルメット ${divDef.primaryKpi.actionLabel}</span>
                      <span class="action-tag ${pDone ? 'done-tag' : ''}">
                        ${rec.actionId === 'primary_work' ? '★ 推薦｜' : ''}主KPI +${perPrimaryGain} ${divDef.primaryKpi.unit}
                      </span>
                    </div>
                    <div class="action-desc">${divDef.primaryKpi.actionDesc}</div>
                  </button>
                  <button class="action-card ${
                    rec.actionId === 'secondary_work' ? 'recommended' : ''
                  }" data-action="secondary_work">
                    <div class="action-title">
                      <span>📁 ${divDef.secondaryKpi.actionLabel}</span>
                      <span class="action-tag ${sDone ? 'done-tag' : ''}">
                        ${rec.actionId === 'secondary_work' ? '★ 推薦｜' : ''}次KPI +${perSecondaryGain} ${divDef.secondaryKpi.unit}
                      </span>
                    </div>
                    <div class="action-desc">${divDef.secondaryKpi.actionDesc}</div>
                  </button>
                `
            }

            ${
              state.player.blockedSlots === 0 && canStudy
                ? `
                <button class="action-card study ${
                  rec.actionId === 'slack_study' ? 'recommended' : ''
                }" data-action="slack_study">
                  <div class="action-title">
                    <span>📖 偷懶看書（準備國考）</span>
                    <span class="action-tag">
                      ${rec.actionId === 'slack_study' ? '★ 推薦｜' : ''}提升上榜率（不降壓）
                    </span>
                  </div>
                  <div class="action-desc">不會被抓，秘密提升國考上榜率（考上才重置），但本時段無 KPI 產出且不消除負壓。</div>
                </button>`
                : ''
            }

            ${
              state.player.blockedSlots === 0
                ? `
                <button class="action-card ${
                  rec.actionId === 'relax_idle' ? 'recommended' : ''
                }" data-action="relax_idle">
                  <div class="action-title">
                    <span>☕ 茶水間摸魚喘息</span>
                    <span class="action-tag">
                      ${rec.actionId === 'relax_idle' ? '★ 推薦｜' : ''}負壓 -10（免突發事件）
                    </span>
                  </div>
                  <div class="action-desc">泡咖啡滑手機放空，快速消除 10 點情緒負壓（<strong>保證不會觸發突發事件</strong>，但無 KPI 產出）。</div>
                </button>
                <button class="action-card ${
                  rec.actionId === 'take_leave' ? 'recommended' : ''
                }" data-action="take_leave" ${
                    state.player.annualLeaveLeft <= 0 ? 'disabled' : ''
                  }>
                  <div class="action-title">
                    <span>🌴 請休特休假（剩 ${state.player.annualLeaveLeft} 格）</span>
                    <span class="action-tag">
                      ${rec.actionId === 'take_leave' ? '★ 推薦｜' : ''}負壓 -18（免突發事件）
                    </span>
                  </div>
                  <div class="action-desc">大幅消除 18 點負壓且<strong>保證不被突發事件打斷</strong>（注意：不會調降本月 KPI 目標）。</div>
                </button>`
                : ''
            }
          </div>
        </div>

        <!-- 4. Live Field Inspection / Action Feedback Card (Immediate Narrative Reward!) -->
        ${
          fb
            ? `
          <div class="feedback-showcase ${fb.tone}">
            <div class="feedback-header">
              <span class="feedback-badge">📢 最新現場稽查與行動回報（${fb.timeLabel}）</span>
              <strong>${fb.actionTitle}</strong>
            </div>
            ${fb.site ? `<div class="feedback-site">📍 ${fb.site}</div>` : ''}
            <div class="feedback-detail">${fb.detail}</div>
            ${fb.finding ? `<div class="feedback-finding">${fb.finding}</div>` : ''}
            <div class="feedback-impact">📊 結算影響：${fb.impactSummary}</div>
          </div>`
            : ''
        }

        <!-- 5. Clean Progress Dashboard (KPI + Stress + Exam) -->
        <div class="dashboard-grid">
          <!-- Left: Monthly KPI Progress -->
          <div class="panel-box">
            <div class="panel-heading">
              <span>📊 本月（${state.time.month}月）績效目標進度</span>
              <span style="font-size:0.78rem; color:var(--ink-secondary);">
                ${
                  state.kpi.isTrainingMonth
                    ? '職前訓練月免計KPI'
                    : `本月剩 ${slotsLeft} 格時段`
                }
              </span>
            </div>

            <div class="meter-group">
              <div class="meter-top">
                <span>1. ${divDef.primaryKpi.label} ${pDone ? '✅ 已達標' : ''}</span>
                <strong>${state.kpi.primaryProgress} / ${state.kpi.primaryTarget} ${divDef.primaryKpi.unit}</strong>
              </div>
              <div class="meter-track">
                <div class="meter-fill ${pDone ? 'kpi-done' : 'kpi'}" style="width: ${pPct}%"></div>
              </div>
            </div>

            <div class="meter-group">
              <div class="meter-top">
                <span>2. ${divDef.secondaryKpi.label} ${sDone ? '✅ 已達標' : ''}</span>
                <strong>${state.kpi.secondaryProgress} / ${state.kpi.secondaryTarget} ${divDef.secondaryKpi.unit}</strong>
              </div>
              <div class="meter-track">
                <div class="meter-fill ${sDone ? 'kpi-done' : 'kpi'}" style="width: ${sPct}%"></div>
              </div>
            </div>

            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border-doc); font-size:0.84rem;">
              <div style="display:flex; justify-content:space-between;">
                <span>半年度考評容錯（累計 3 個月未達標即開除）：</span>
                <strong style="color:${
                  state.halfYearFailedMonths >= 2 ? 'var(--seal-red)' : 'var(--ink-primary)'
                }">已未達標 ${state.halfYearFailedMonths} / 3 個月</strong>
              </div>
              <div class="halfyear-pills">
                ${
                  state.halfYearMonthResults.length === 0
                    ? '<span style="font-size:0.78rem; color:var(--ink-muted);">本半年尚無已結算月份</span>'
                    : state.halfYearMonthResults
                        .map(
                          (m) =>
                            `<span class="month-pill ${m.passed ? 'pass' : 'fail'}">${m.month}月${
                              m.exempt ? '免計' : m.passed ? '✓達標' : '✗未達標'
                            }</span>`
                        )
                        .join('')
                }
              </div>
            </div>
          </div>

          <!-- Right: Stress & National Exam -->
          <div class="panel-box">
            <div class="panel-heading">
              <span>🧠 情緒負壓與國考進度</span>
              <span style="font-size:0.78rem; color:${
                penaltyActive ? 'var(--seal-red)' : 'var(--ink-secondary)'
              }; font-weight:700;">
                ${penaltyActive ? '⚠️ 負壓≥70：工作產出減半！' : '每週自然恢復 -1'}
              </span>
            </div>

            <div class="meter-group">
              <div class="meter-top">
                <span>情緒負壓（每次工作 +5～+6｜滿 70 減半｜滿 100 過勞結局）</span>
                <strong style="color:${
                  state.player.stress >= 70 ? 'var(--seal-red)' : 'inherit'
                }">${state.player.stress} / 100</strong>
              </div>
              <div class="meter-track">
                <div class="meter-fill ${stressClass}" style="width: ${state.player.stress}%"></div>
              </div>
            </div>

            <div class="officer-strip" style="margin-bottom: 0; padding: 10px;">
              <div class="officer-cell">
                <span class="officer-label">國考讀書把握度</span>
                <span class="officer-value" style="font-size:0.86rem;">${getStudyReadinessHint(state)}</span>
              </div>
              <div class="officer-cell">
                <span class="officer-label">下次強制國考</span>
                <span class="officer-value" style="font-size:0.86rem;">${nextExamText}</span>
              </div>
              <div class="officer-cell">
                <span class="officer-label">目前職級進度</span>
                <span class="officer-value" style="font-size:0.86rem;">${rankDef.title} (Lv.${rankDef.level + 1}/8)</span>
              </div>
              <div class="officer-cell">
                <span class="officer-label">長官好感 / 聲望</span>
                <span class="officer-value" style="font-size:0.86rem;">${state.player.bossFavor} / ${state.player.reputation}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 6. Collapsible History Log & Career Ladder -->
        <details class="panel-box" style="margin-top: 10px;">
          <summary style="cursor:pointer; font-weight:700; font-family:'Noto Serif TC', serif;">
            📜 展開歷史差勤紀錄簿（共 ${state.logs.length} 筆）與完整職級階梯
          </summary>
          <div style="margin: 10px 0; padding: 8px; background: var(--bg-paper-alt); border-radius: 4px; font-size: 0.8rem;">
            <strong>升遷階梯：</strong>
            ${RANKS.map((r) =>
              r.id === state.player.rankId
                ? `<strong style="color:var(--seal-red);">【${r.title}】</strong>`
                : r.title
            ).join(' → ')}
          </div>
          <div class="log-list" style="margin-top: 10px;">
            ${state.logs
              .map(
                (item) => `
              <div class="log-item ${item.tone ?? 'info'}">
                <span class="log-time">[${item.timeLabel}]</span>
                <span>${item.text}</span>
              </div>`
              )
              .join('')}
          </div>
        </details>
      </div>

      ${renderActiveModalHtml(state)}
    </div>
  `;

  // Bind top controls
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    setTheme(!darkMode);
    render();
  });

  document.getElementById('btn-title')?.addEventListener('click', () => {
    saveAuto(state);
    currentState = null;
    render();
  });

  document.getElementById('btn-save-1')?.addEventListener('click', () => {
    saveToSlot(1, state);
    alert('已儲存至【存檔槽 1】！');
  });

  document.getElementById('btn-load-1')?.addEventListener('click', () => {
    const loaded = loadFromSlot(1);
    if (!loaded) {
      alert('【存檔槽 1】尚無紀錄！');
      return;
    }
    currentState = loaded;
    saveAuto(currentState);
    render();
  });

  // Bind action buttons
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const actionId = btn.getAttribute('data-action') as ActionId;
      performSlotAction(state, actionId, false);
      saveAuto(state);
      render();
    });
  });

  // Bind modal choice buttons
  document.querySelectorAll<HTMLButtonElement>('[data-modal-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-modal-choice') ?? '0');
      resolveActiveModalChoice(state, idx);
      saveAuto(state);
      render();
    });
  });
}

function renderActiveModalHtml(state: GameState): string {
  const modal = state.activeModal;
  if (!modal) return '';

  if (modal.type === 'onboarding') {
    return `
      <div class="modal-backdrop">
        <div class="modal-doc">
          <div class="modal-stamp">最速件・人事派令</div>
          <h3 class="modal-title">${modal.title}</h3>
          <div class="modal-body">${modal.body}</div>
          <div class="choice-stack">
            <button class="choice-btn" data-modal-choice="0">✍️ 簽收派令，開始1月份新進職前訓練</button>
          </div>
        </div>
      </div>
    `;
  }

  if (modal.type === 'exam_choice') {
    return `
      <div class="modal-backdrop">
        <div class="modal-doc">
          <div class="modal-stamp">考選部試務通知</div>
          <h3 class="modal-title">${modal.title}</h3>
          <div class="modal-body">${modal.body}</div>
          <div class="choice-stack">
            <button class="choice-btn" data-modal-choice="0">🎯 報考【地方特考三等】（跨階應考：錄取後直升薦任技士，一步到位）</button>
            <button class="choice-btn" data-modal-choice="1">📘 報考【地方特考四等】（逐階應考：基礎把握度較高，錄取後任委任技佐）</button>
          </div>
        </div>
      </div>
    `;
  }

  if (modal.type === 'monthly_report' && modal.monthlyReport) {
    const r = modal.monthlyReport;
    const statusText = r.isTrainingMonth
      ? '📘 職前訓練月（免計考評）'
      : r.passed
      ? '✅ 本月績效【達標】（負壓 -3，長官好感 +2）'
      : `❌ 本月績效【未達標】（負壓 +8，本半年已未達標 ${r.halfYearFailedMonths}/3 個月）`;

    const casesHtml =
      r.highlightCases.length === 0
        ? '<li style="color:var(--ink-muted);">本月無外勤稽查或專案結案紀錄（皆用於進修或休假調適）</li>'
        : r.highlightCases.map((c) => `<li>${c}</li>`).join('');

    return `
      <div class="modal-backdrop">
        <div class="modal-doc" style="max-width: 680px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span class="modal-stamp">${r.passed ? '月度管考・合格准予備查' : '月度管考・進度落後警告'}</span>
            <span style="font-size:0.82rem; font-weight:700; color:var(--ink-secondary);">${r.divisionName}</span>
          </div>

          <h3 class="modal-title">${modal.title}</h3>

          <div style="padding: 10px 14px; border-radius: 5px; margin-bottom: 12px; font-weight: 700; background: ${
            r.passed ? 'var(--jade-light)' : 'var(--seal-red-light)'
          }; color: ${r.passed ? 'var(--jade-good)' : 'var(--seal-red)'}; border: 1.5px solid ${
            r.passed ? 'var(--jade-good)' : 'var(--seal-red)'
          };">
            ${statusText}
          </div>

          <div class="officer-strip" style="margin-bottom: 12px; padding: 10px 12px;">
            <div class="officer-cell">
              <span class="officer-label">主要 KPI：${r.primaryLabel}</span>
              <span class="officer-value">${
                r.isTrainingMonth
                  ? '免計'
                  : `${r.primaryProgress} / ${r.primaryTarget} ${r.primaryUnit} ${
                      r.primaryProgress >= r.primaryTarget ? '✓' : '✗'
                    }`
              }</span>
            </div>
            <div class="officer-cell">
              <span class="officer-label">次要 KPI：${r.secondaryLabel}</span>
              <span class="officer-value">${
                r.isTrainingMonth
                  ? '免計'
                  : `${r.secondaryProgress} / ${r.secondaryTarget} ${r.secondaryUnit} ${
                      r.secondaryProgress >= r.secondaryTarget ? '✓' : '✗'
                    }`
              }</span>
            </div>
          </div>

          <div style="margin-bottom: 12px;">
            <div style="font-weight:700; font-size:0.9rem; margin-bottom:4px;">📂 本月承辦之具體案件與稽查紀錄：</div>
            <ul style="padding-left: 20px; font-size: 0.84rem; max-height: 150px; overflow-y: auto; background: var(--bg-paper-alt); padding-top:8px; padding-bottom:8px; border-radius:4px; border:1px solid var(--border-doc); display:flex; flex-direction:column; gap:4px;">
              ${casesHtml}
            </ul>
          </div>

          <div style="padding: 12px 14px; background: var(--gov-navy-light); border-left: 4px solid var(--gov-navy); border-radius: 4px; margin-bottom: 14px;">
            <div style="font-weight: 700; font-size: 0.86rem; color: var(--gov-navy); margin-bottom: 4px;">
              🖋️ 直屬上級主管批示（${r.supervisorTitle}）：
            </div>
            <div style="font-size: 0.92rem; line-height: 1.6;">${r.supervisorComment}</div>
          </div>

          ${
            r.halfYearSummary
              ? `<div style="padding: 10px 14px; background: var(--amber-light); border-left: 4px solid var(--amber-warn); border-radius: 4px; margin-bottom: 14px; font-weight:700; font-size:0.9rem; white-space:pre-line;">${r.halfYearSummary}</div>`
              : ''
          }

          <div class="choice-stack">
            <button class="choice-btn" data-modal-choice="0" style="text-align:center; background:var(--gov-navy); color:#fff;">
              ✍️ 閱畢歸檔，進入下個月（${state.time.month}月份）排程
            </button>
          </div>
        </div>
      </div>
    `;
  }

  if (modal.type === 'event' && modal.event) {
    return `
      <div class="modal-backdrop">
        <div class="modal-doc">
          <div class="modal-stamp">🚨 突發狀況通報</div>
          <h3 class="modal-title">${modal.event.title}</h3>
          <div class="modal-body">${modal.event.text}</div>
          <div class="choice-stack">
            ${modal.event.choices
              .map(
                (c, i) => `
              <button class="choice-btn" data-modal-choice="${i}">▶ ${c.label}</button>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  return '';
}

function render() {
  if (!currentState) {
    renderTitleScreen();
    return;
  }
  if (currentState.endingId) {
    renderEndingScreen(currentState);
    return;
  }
  renderMainGame(currentState);
}

render();
