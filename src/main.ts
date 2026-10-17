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
              <div class="gov-subtitle">公職生存 × 績效精算 × 國考轉正 × 官場升遷五年傳奇</div>
            </div>
          </div>
          <button class="btn-small" id="btn-theme">${darkMode ? '☀️ 淺色公文' : '🌙 深色模式'}</button>
        </div>

        <p style="margin-bottom: 14px;">
          你剛錄取成為<strong>北辰市勞動檢查處</strong>的「約聘檢查員」。在接下來的<strong>五年（民國116年至120年，共 480 個上下午時段）</strong>裡，你必須在繁重的工地與工廠稽查指標、層出不窮的重大職災與甩鍋事件、瀕臨崩潰的情緒負壓之間，偷偷擠出時間苦讀法條通過國家考試，一路從基層約聘邁向<strong>簡任第十一職等處長</strong>之巔！
        </p>

        <div class="panel-box" style="margin-bottom: 16px; background: var(--bg-paper-alt);">
          <div class="panel-heading">📌 核心生存守則</div>
          <ul style="padding-left: 20px; font-size: 0.9rem; display: flex; flex-direction: column; gap: 6px;">
            <li><strong>時間換算</strong>：每天分為上午、下午 2 格（1 天 ＝ 1 週，每月 4 週共 8 格）。</li>
            <li><strong>績效底線</strong>：每月主、次要 KPI 必須 100% 達標。<strong>半年內累計 3 個月未達標即送考評汰除！</strong>累計 2 個月未達標列乙等（不得升遷並遭主管約談）。</li>
            <li><strong>國考轉正</strong>：偷懶看書不會被抓，但會壓縮跑檢查的格數。逐階應考與跨階應考難度不同，<strong>唯有考上才會重置累積讀書加成</strong>。</li>
            <li><strong>情緒負壓</strong>：負壓達 <strong>70</strong> 時工作產出全面減半；達 <strong>100</strong> 立即過勞倒下結束遊戲。</li>
          </ul>
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

  let calcTone = 'safe';
  let calcText = `本月剩餘 ${slotsLeft} 個時段，預估還需 ${slotsNeeded} 個工作時段即可達標（尚有 ${Math.max(0, slotsLeft - slotsNeeded)} 格裕度可讀書或調適）。`;
  if (state.kpi.isTrainingMonth) {
    calcTone = 'safe';
    calcText = '本月為新進人員職前專業訓練月（免計績效目標），可放心全力讀書準備國考！';
  } else if (slotsNeeded > slotsLeft) {
    calcTone = 'danger';
    calcText = `⚠️ 警報：本月剩餘 ${slotsLeft} 格，但預估需要 ${slotsNeeded} 格才能完成 KPI，本月極可能未達標！`;
  } else if (slotsNeeded === slotsLeft && slotsNeeded > 0) {
    calcTone = 'tight';
    calcText = `⚡ 緊繃：本月剩餘 ${slotsLeft} 格剛好等於所需工作格數 ${slotsNeeded} 格，一旦再偷懶或遭遇職災打斷就會未達標！`;
  }

  const nextExamText = !canStudy
    ? '已取得薦任官資格（無須再考）'
    : state.time.month < 7
    ? '7月第1週 高考三級'
    : state.time.month === 11 &&
      (115 + state.time.year) % 2 === 1 &&
      state.player.rankId === 'assistant'
    ? '本月第1週 薦任升官等考試'
    : '12月第1週 地方政府特考';

  const perPrimaryGain = getEffectiveActionOutput(state, divDef.primaryKpi.perAction);
  const perSecondaryGain = getEffectiveActionOutput(state, divDef.secondaryKpi.perAction);

  const rankLadderHtml = RANKS.map((r) => {
    const isCurrent = r.id === state.player.rankId;
    return `<span style="padding:2px 7px; border-radius:4px; font-size:0.75rem; border:1px solid var(--border-doc); ${
      isCurrent ? 'background:var(--seal-red); color:#fff; font-weight:700;' : 'opacity:0.7;'
    }">${r.title}</span>`;
  }).join(' → ');

  appEl.innerHTML = `
    <div class="app-shell">
      <div class="doc-sheet">
        <!-- Top Official Header -->
        <div class="gov-header">
          <div class="gov-title-group">
            <div class="official-seal">北辰<br/>勞檢</div>
            <div class="gov-title">
              <h1>北辰市勞動檢查處・公文與差勤系統</h1>
              <div class="gov-subtitle">${state.player.name}｜${rankDef.title}（${rankDef.grade}）｜派駐【${divDef.name}】</div>
            </div>
          </div>
          <div class="header-controls">
            <span class="badge-time">${formatTimeLabel(state)}（第 ${state.time.year}/5 年）</span>
            <button class="btn-small" id="btn-save-1">💾 存檔1</button>
            <button class="btn-small" id="btn-load-1">📂 讀檔1</button>
            <button class="btn-small" id="btn-theme">${darkMode ? '☀️' : '🌙'}</button>
            <button class="btn-small" id="btn-title">🏠 標題</button>
          </div>
        </div>

        <!-- Career Ladder Strip -->
        <div style="margin-bottom: 14px; padding: 8px 12px; background: var(--bg-paper-alt); border: 1px solid var(--border-doc); border-radius: 4px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
            <strong style="font-size:0.8rem; margin-right:4px;">職級階梯：</strong>${rankLadderHtml}
          </div>
          <div style="font-size:0.8rem; color:var(--ink-secondary);">
            ${
              state.player.practicalTrainingMonths > 0
                ? `🌱 國考實務訓練中（剩餘 ${state.player.practicalTrainingMonths} 個月轉正）`
                : `本職級年資：${state.player.monthsInRank} 個月`
            }
          </div>
        </div>

        <!-- Main Two-Column Dashboard -->
        <div class="dashboard-grid">
          <!-- Left: Monthly KPI & Half-Year Assessment -->
          <div class="panel-box">
            <div class="panel-heading">
              <span>📊 ${state.time.month}月份科室績效目標（${divDef.name}）</span>
              <span style="font-size:0.78rem; color:var(--ink-secondary);">
                ${
                  state.kpi.officialLeaveSlots > 0
                    ? `公假調降 (${state.kpi.officialLeaveSlots}格)`
                    : '標準全月指標'
                }
              </span>
            </div>

            <div class="meter-group">
              <div class="meter-top">
                <span>主要KPI：${divDef.primaryKpi.label}（每格 +${perPrimaryGain} ${divDef.primaryKpi.unit}）</span>
                <strong>${state.kpi.primaryProgress} / ${state.kpi.primaryTarget} ${divDef.primaryKpi.unit}</strong>
              </div>
              <div class="meter-track">
                <div class="meter-fill ${
                  state.kpi.primaryProgress >= state.kpi.primaryTarget ? 'kpi-done' : 'kpi'
                }" style="width: ${pPct}%"></div>
              </div>
            </div>

            <div class="meter-group">
              <div class="meter-top">
                <span>次要KPI：${divDef.secondaryKpi.label}（每格 +${perSecondaryGain} ${divDef.secondaryKpi.unit}）</span>
                <strong>${state.kpi.secondaryProgress} / ${state.kpi.secondaryTarget} ${divDef.secondaryKpi.unit}</strong>
              </div>
              <div class="meter-track">
                <div class="meter-fill ${
                  state.kpi.secondaryProgress >= state.kpi.secondaryTarget ? 'kpi-done' : 'kpi'
                }" style="width: ${sPct}%"></div>
              </div>
            </div>

            <div class="calc-banner ${calcTone}">
              <span>${calcText}</span>
            </div>

            <div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--border-doc);">
              <div style="display:flex; justify-content:space-between; font-size:0.84rem;">
                <span><strong>半年度考評追蹤</strong>（6月、12月底結算，未達標達 3 個月即汰除）：</span>
                <strong style="color:${
                  state.halfYearFailedMonths >= 2 ? 'var(--seal-red)' : 'var(--ink-primary)'
                }">已未達標 ${state.halfYearFailedMonths} / 3 個月</strong>
              </div>
              <div class="halfyear-pills">
                ${
                  state.halfYearMonthResults.length === 0
                    ? '<span style="font-size:0.8rem; color:var(--ink-muted);">本半年尚無已結算月份</span>'
                    : state.halfYearMonthResults
                        .map(
                          (m) =>
                            `<span class="month-pill ${m.passed ? 'pass' : 'fail'}">${m.month}月：${
                              m.exempt ? '訓練免計' : m.passed ? '達標' : '未達標'
                            }</span>`
                        )
                        .join('')
                }
              </div>
            </div>
          </div>

          <!-- Right: Emotional Stress, Exam & Calendar -->
          <div class="panel-box">
            <div class="panel-heading">
              <span>🧠 身心狀態與國考進度</span>
              <span style="font-size:0.78rem; color:${
                penaltyActive ? 'var(--seal-red)' : 'var(--ink-secondary)'
              }; font-weight:700;">
                ${penaltyActive ? '⚠️ 負壓過高：工作產出減半！' : '工作效率正常 (100%)'}
              </span>
            </div>

            <div class="meter-group">
              <div class="meter-top">
                <span>情緒負壓（≥70 效率減半，100 過勞崩潰）</span>
                <strong style="color:${
                  state.player.stress >= 70 ? 'var(--seal-red)' : 'inherit'
                }">${state.player.stress} / 100</strong>
              </div>
              <div class="meter-track">
                <div class="meter-fill ${stressClass}" style="width: ${state.player.stress}%"></div>
              </div>
            </div>

            <div class="officer-strip" style="margin-bottom: 10px; padding: 10px;">
              <div class="officer-cell">
                <span class="officer-label">國考準備把握度</span>
                <span class="officer-value" style="font-size:0.88rem;">${getStudyReadinessHint(state)}</span>
              </div>
              <div class="officer-cell">
                <span class="officer-label">下次應試期程</span>
                <span class="officer-value" style="font-size:0.88rem;">${
                  state.pendingExam
                    ? `等待放榜（${state.pendingExam.announceMonth}月第${state.pendingExam.announceWeek}週）`
                    : nextExamText
                }</span>
              </div>
              <div class="officer-cell">
                <span class="officer-label">長官好感 / 社會聲望</span>
                <span class="officer-value" style="font-size:0.88rem;">${state.player.bossFavor} / ${state.player.reputation}</span>
              </div>
              <div class="officer-cell">
                <span class="officer-label">年度特休假剩餘</span>
                <span class="officer-value" style="font-size:0.88rem;">${state.player.annualLeaveLeft} 格（不調降KPI）</span>
              </div>
            </div>

            <div style="font-size:0.8rem; color:var(--ink-secondary); margin-bottom:4px;">
              📅 本月四週時段進度（每週＝上午＋下午 2 格）：
            </div>
            <div class="slot-dots">
              ${[1, 2, 3, 4]
                .map(
                  (w) => `
                <div class="week-box ${state.time.week === w ? 'active' : ''}">
                  第${w}週<br/>
                  ${
                    state.time.week === w
                      ? state.time.slot === 'AM'
                        ? '▶ 上午'
                        : '▶ 下午'
                      : state.time.week > w
                      ? '✓ 已結束'
                      : '待執行'
                  }
                </div>`
                )
                .join('')}
            </div>
          </div>
        </div>

        <!-- Action Selection Panel -->
        <div class="panel-box" style="margin-bottom: 18px;">
          <div class="panel-heading">
            <span>⚡ 選擇本時段行動（${formatTimeLabel(state)}）</span>
            <span style="font-size:0.8rem; color:var(--ink-secondary);">
              ${
                state.player.blockedSlots > 0
                  ? `🔒 本時段已被「${state.player.blockedReason}」鎖定`
                  : '點擊下方行動卡推進半天（1格）行程'
              }
            </span>
          </div>

          <div class="actions-grid">
            ${
              state.player.blockedSlots > 0
                ? `<button class="action-card" data-action="primary_work">
                    <div class="action-title">
                      <span>⏳ 執行鎖定行程：${state.player.blockedReason}</span>
                      <span class="action-tag">必選</span>
                    </div>
                    <div class="action-desc">因重大職災後續調查或國家考試下午場次，本時段無法排定其他業務。</div>
                  </button>`
                : rankDef.isManagement
                ? `
                  <button class="action-card" data-action="mgmt_supervise">
                    <div class="action-title">
                      <span>📋 督導科室專案稽查</span>
                      <span class="action-tag">主KPI +${getEffectiveActionOutput(
                        state,
                        divDef.primaryKpi.perAction,
                        1.25
                      )} ${divDef.primaryKpi.unit}</span>
                    </div>
                    <div class="action-desc">督導並核閱下屬檢查報告、帶隊聯合稽查（負壓 +2，長官好感 +2）</div>
                  </button>
                  <button class="action-card" data-action="mgmt_coord">
                    <div class="action-title">
                      <span>🏛️ 主持跨局處與專案協調</span>
                      <span class="action-tag">次KPI +${perSecondaryGain} ${divDef.secondaryKpi.unit}</span>
                    </div>
                    <div class="action-desc">主持重大勞資、工安專案會議與府級報告（負壓 +1，聲望 +2）</div>
                  </button>
                `
                : `
                  <button class="action-card" data-action="primary_work">
                    <div class="action-title">
                      <span>ヘルメット ${divDef.primaryKpi.actionLabel}</span>
                      <span class="action-tag">主KPI +${perPrimaryGain} ${divDef.primaryKpi.unit}</span>
                    </div>
                    <div class="action-desc">${divDef.primaryKpi.actionDesc}</div>
                  </button>
                  <button class="action-card" data-action="secondary_work">
                    <div class="action-title">
                      <span>📁 ${divDef.secondaryKpi.actionLabel}</span>
                      <span class="action-tag">次KPI +${perSecondaryGain} ${divDef.secondaryKpi.unit}</span>
                    </div>
                    <div class="action-desc">${divDef.secondaryKpi.actionDesc}</div>
                  </button>
                `
            }

            ${
              state.player.blockedSlots === 0 && canStudy
                ? `
                <button class="action-card study" data-action="slack_study">
                  <div class="action-title">
                    <span>📖 偷懶看書（備戰國考）</span>
                    <span class="action-tag">負壓 -3 / 提升上榜率</span>
                  </div>
                  <div class="action-desc">不會被主管抓包，但本時段無任何業務產出。秘密提升國考上榜率（考上才重置）。</div>
                </button>`
                : ''
            }

            ${
              state.player.blockedSlots === 0
                ? `
                <button class="action-card" data-action="relax_idle">
                  <div class="action-title">
                    <span>☕ 茶水間摸魚喘息</span>
                    <span class="action-tag">負壓 -8</span>
                  </div>
                  <div class="action-desc">暫時放下公文與法條放空喘口氣，快速緩解情緒負壓，但無業務產出。</div>
                </button>
                <button class="action-card" data-action="take_leave" ${
                  state.player.annualLeaveLeft <= 0 ? 'disabled' : ''
                }>
                  <div class="action-title">
                    <span>🌴 請休半天特休假（剩 ${state.player.annualLeaveLeft} 格）</span>
                    <span class="action-tag">負壓 -15</span>
                  </div>
                  <div class="action-desc">大幅降低情緒負壓 15 點，但注意：請休特休假<strong>不會調降本月績效目標</strong>！</div>
                </button>`
                : ''
            }
          </div>
        </div>

        <!-- Official Work Log -->
        <div class="panel-box">
          <div class="panel-heading">
            <span>📜 職務差勤與事件紀錄簿</span>
            <span style="font-size:0.78rem; color:var(--ink-muted);">最新紀錄置頂</span>
          </div>
          <div class="log-list">
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
        </div>
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

  if (modal.type === 'event' && modal.event) {
    return `
      <div class="modal-backdrop">
        <div class="modal-doc">
          <div class="modal-stamp">突發狀況通報</div>
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
