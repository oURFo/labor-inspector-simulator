import './styles/main.css';
import {
  ActionId,
  createInitialGameState,
  DIVISIONS,
  GameState,
  getDivisionDef,
  getRankDef,
} from './core/GameState';
import {
  ENDINGS,
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
import { clearAuto, loadAuto, loadFromSlot, saveAuto, saveToSlot } from './core/SaveSystem';

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
            <li><strong>先看每月進度條</strong>：每個月有 8 個時段（4 週 × 上下午），通常做 <strong>5 次工作</strong>（4 主 + 1 次）就能把本月兩項 KPI 填滿達標。</li>
            <li><strong>有多餘時段再偷看書</strong>：偷看書不會被抓，但會少做工作；<strong>半年內只要有 3 個月沒達標就會被開除！</strong></li>
            <li><strong>注意情緒負壓</strong>：每次外出稽查與辦案都會累積負壓（+5～+6），<strong>偷看書不會降壓</strong>，負壓快到 70 時記得按「摸魚」或「休假（-25）」喘口氣。</li>
            <li><strong>小心突發事件</strong>：目前每格工作或看書有 <strong>26% 機率</strong>遇到工安意外、前輩甩鍋、議員關說或塞紅包（摸魚與休假不會觸發突發事件）！</li>
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

let shouldAnimateProgress = false;
let showStepResultPopup = false;

function animateNumber(
  el: HTMLElement | null,
  from: number,
  to: number,
  durationMs = 620
) {
  if (!el) return;
  if (from === to) {
    el.textContent = String(to);
    return;
  }
  const start = performance.now();
  function step(now: number) {
    const t = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = Math.round(from + (to - from) * eased);
    if (el) el.textContent = String(current);
    if (t < 1) {
      requestAnimationFrame(step);
    } else if (el) {
      el.textContent = String(to);
    }
  }
  requestAnimationFrame(step);
}

function renderMainGame(state: GameState) {
  const rankDef = getRankDef(state.player.rankId);
  const divDef = getDivisionDef(state.player.divisionId);
  const slotsLeft = getRemainingSlotsInMonth(state);
  const penaltyActive = isStressPenaltyActive(state);
  const canStudy = needsExamForSpecialist(state);

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

  const fb = state.lastFeedback;
  const anim = fb?.progressAnim;
  const doAnim = showStepResultPopup && shouldAnimateProgress && !!anim;

  const animToPct = anim
    ? Math.min(100, Math.max(0, Math.round((anim.toValue / Math.max(1, anim.maxValue)) * 100)))
    : 0;

  appEl.innerHTML = `
    <div class="app-shell">
      <div class="doc-sheet">
        <!-- 1. Compact Header -->
        <div class="gov-header">
          <div class="gov-title-group">
            <div class="official-seal">北辰<br/>勞檢</div>
            <div class="gov-title">
              <h1>${state.player.name}｜${rankDef.title}</h1>
              <div class="gov-subtitle">
                ${divDef.name}・第 ${state.time.year}/5 年${
    state.player.practicalTrainingMonths > 0
      ? `（實務訓練剩 ${state.player.practicalTrainingMonths} 月）`
      : ''
  }
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

        <!-- 2. Simplified Status & Progress Card -->
        <div class="panel-box" style="margin-bottom: 12px;">
          <div class="meter-group" style="margin-bottom: 10px;">
            <div class="meter-top">
              <span>👷 主KPI：${divDef.primaryKpi.label} ${pDone ? '✅' : ''}</span>
              <strong>${state.kpi.primaryProgress} / ${state.kpi.primaryTarget} ${divDef.primaryKpi.unit}</strong>
            </div>
            <div class="meter-track">
              <div class="meter-fill ${pDone ? 'kpi-done' : 'kpi'}" style="width: ${pPct}%"></div>
            </div>
          </div>

          <div class="meter-group" style="margin-bottom: 10px;">
            <div class="meter-top">
              <span>📁 次KPI：${divDef.secondaryKpi.label} ${sDone ? '✅' : ''}</span>
              <strong>${state.kpi.secondaryProgress} / ${state.kpi.secondaryTarget} ${divDef.secondaryKpi.unit}</strong>
            </div>
            <div class="meter-track">
              <div class="meter-fill ${sDone ? 'kpi-done' : 'kpi'}" style="width: ${sPct}%"></div>
            </div>
          </div>

          <div class="meter-group" style="margin-bottom: 8px;">
            <div class="meter-top">
              <span>🧠 情緒負壓 ${penaltyActive ? '⚠️(滿70產出減半!)' : '(滿70減半/100結局)'}</span>
              <strong style="color:${state.player.stress >= 70 ? 'var(--seal-red)' : 'inherit'}">${state.player.stress} / 100</strong>
            </div>
            <div class="meter-track">
              <div class="meter-fill ${stressClass}" style="width: ${state.player.stress}%"></div>
            </div>
          </div>

          <div class="compact-meta-row">
            <span>📖 國考準備：<strong>${getStudyReadinessHint(state)}</strong></span>
            <span>📅 本月剩 <strong>${slotsLeft}</strong> 時段｜半年未達標：<strong style="color:${
    state.halfYearFailedMonths >= 2 ? 'var(--seal-red)' : 'inherit'
  }">${state.halfYearFailedMonths}/3</strong> 月</span>
          </div>
        </div>

        <!-- 3. Action Buttons -->
        <div class="panel-box action-stage" style="margin-bottom: 12px;">
          <div class="panel-heading" style="margin-bottom: 8px; padding-bottom: 6px;">
            <span>⚡ 選擇本時段（${state.time.slot === 'AM' ? '上午' : '下午'}）行動</span>
          </div>

          <div class="actions-grid">
            ${
              state.player.blockedSlots > 0
                ? `<button class="action-card" data-action="primary_work">
                    <div class="action-title">
                      <span>⏳ 執行鎖定行程：${state.player.blockedReason}</span>
                      <span class="action-tag">點擊推進</span>
                    </div>
                  </button>`
                : rankDef.isManagement
                ? `
                  <button class="action-card" data-action="mgmt_supervise">
                    <div class="action-title">
                      <span>📋 督導科室專案稽查</span>
                      <span class="action-tag ${pDone ? 'done-tag' : ''}">
                        +${getEffectiveActionOutput(
                    state,
                    divDef.primaryKpi.perAction,
                    1.25
                  )}${divDef.primaryKpi.unit}
                      </span>
                    </div>
                  </button>
                  <button class="action-card" data-action="mgmt_coord">
                    <div class="action-title">
                      <span>🏛️ 主持跨局處協調會</span>
                      <span class="action-tag ${sDone ? 'done-tag' : ''}">
                        +${perSecondaryGain}${divDef.secondaryKpi.unit}
                      </span>
                    </div>
                  </button>
                `
                : `
                  <button class="action-card" data-action="primary_work">
                    <div class="action-title">
                      <span>👷 ${divDef.primaryKpi.actionLabel}</span>
                      <span class="action-tag ${pDone ? 'done-tag' : ''}">
                        主KPI +${perPrimaryGain}${divDef.primaryKpi.unit}
                      </span>
                    </div>
                  </button>
                  <button class="action-card" data-action="secondary_work">
                    <div class="action-title">
                      <span>📁 ${divDef.secondaryKpi.actionLabel}</span>
                      <span class="action-tag ${sDone ? 'done-tag' : ''}">
                        次KPI +${perSecondaryGain}${divDef.secondaryKpi.unit}
                      </span>
                    </div>
                  </button>
                `
            }

            ${
              state.player.blockedSlots === 0 && canStudy
                ? `
                <button class="action-card study" data-action="slack_study">
                  <div class="action-title">
                    <span>📖 偷懶看書（準備國考）</span>
                    <span class="action-tag">精進法學實力 📚</span>
                  </div>
                </button>`
                : ''
            }

            ${
              state.player.blockedSlots === 0
                ? `
                <button class="action-card" data-action="relax_idle">
                  <div class="action-title">
                    <span>☕ 茶水間摸魚喘息</span>
                    <span class="action-tag">負壓 -10 ✨</span>
                  </div>
                </button>
                <button class="action-card" data-action="take_leave" ${
                    state.player.annualLeaveLeft <= 0 ? 'disabled' : ''
                  }>
                  <div class="action-title">
                    <span>🌴 請休特休假（剩 ${state.player.annualLeaveLeft} 格）</span>
                    <span class="action-tag">負壓 -25 ☀️</span>
                  </div>
                </button>`
                : ''
            }
          </div>
        </div>

        <!-- 4. Simple Compact Log List (簡單的紀錄) -->
        <div class="panel-box">
          <div class="panel-heading" style="margin-bottom: 6px; padding-bottom: 4px; font-size: 0.9rem;">
            <span>📜 近期紀錄</span>
          </div>
          <div class="log-list" style="max-height: 135px;">
            ${state.logs
              .slice(0, 8)
              .map(
                (item) => `
              <div class="log-item ${item.tone ?? 'info'}">
                <span class="log-time">[${item.timeLabel.replace('民國', '')}]</span>
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

  // Trigger dynamic bar & number animations inside the Step Result Pop-up Modal!
  if (doAnim && anim) {
    shouldAnimateProgress = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const animBar = document.getElementById('anim-bar-fill');
        if (animBar) {
          animBar.style.width = `${animToPct}%`;
        }
        const ghostBar = document.getElementById('anim-bar-ghost');
        if (ghostBar) {
          ghostBar.style.opacity = '0.18';
        }
        animateNumber(
          document.getElementById('anim-counter-num'),
          anim.fromValue,
          anim.toValue,
          650
        );
      });
    });
  }

  // Bind top controls
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    setTheme(!darkMode);
    render();
  });

  document.getElementById('btn-title')?.addEventListener('click', () => {
    saveAuto(state);
    showStepResultPopup = false;
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
    showStepResultPopup = false;
    currentState = loaded;
    saveAuto(currentState);
    render();
  });

  // Bind action buttons -> Every step pops up the Step Result Modal (unless an event/exam modal opens first)
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const actionId = btn.getAttribute('data-action') as ActionId;
      performSlotAction(state, actionId, false);
      if (
        state.activeModal?.type === 'event' ||
        state.activeModal?.type === 'exam_choice'
      ) {
        showStepResultPopup = false;
      } else {
        showStepResultPopup = true;
        shouldAnimateProgress = true;
      }
      saveAuto(state);
      render();
    });
  });

  // Bind Step Result Pop-up confirm button
  document.getElementById('btn-step-confirm')?.addEventListener('click', () => {
    showStepResultPopup = false;
    render();
  });

  // Bind modal choice buttons
  document.querySelectorAll<HTMLButtonElement>('[data-modal-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-modal-choice') ?? '0');
      const prevType = state.activeModal?.type;
      resolveActiveModalChoice(state, idx);
      if (prevType === 'event' || prevType === 'exam_choice') {
        showStepResultPopup = true;
        shouldAnimateProgress = true;
      }
      saveAuto(state);
      render();
    });
  });
}

function renderActiveModalHtml(state: GameState): string {
  // 1. If an action just executed, pop up the Step Result Modal first!
  if (showStepResultPopup && state.lastFeedback) {
    const fb = state.lastFeedback;
    const anim = fb.progressAnim;
    const animFromPct = anim
      ? Math.min(100, Math.max(0, Math.round((anim.fromValue / Math.max(1, anim.maxValue)) * 100)))
      : 0;
    const animToPct = anim
      ? Math.min(100, Math.max(0, Math.round((anim.toValue / Math.max(1, anim.maxValue)) * 100)))
      : 0;
    const animInitialPct = shouldAnimateProgress ? animFromPct : animToPct;
    const animInitialVal = shouldAnimateProgress && anim ? anim.fromValue : anim?.toValue ?? 0;

    return `
      <div class="modal-backdrop">
        <div class="modal-doc">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
            <span class="modal-stamp">本時段行動結果</span>
            <span style="font-size:0.8rem; color:var(--ink-secondary); font-weight:700;">${fb.timeLabel}</span>
          </div>
          <h3 class="modal-title" style="font-size:1.18rem; margin-bottom:10px;">${fb.actionTitle}</h3>

          <div class="modal-body" style="margin-bottom:12px;">
            ${fb.site ? `<div style="font-weight:700; margin-bottom:4px;">📍 ${fb.site}</div>` : ''}
            <div style="line-height:1.6;">${fb.detail}</div>
            ${
              fb.finding
                ? `<div style="margin-top:6px; font-weight:700; color:var(--seal-red);">${fb.finding}</div>`
                : ''
            }
          </div>

          ${
            anim
              ? anim.kind === 'study'
                ? `
            <div class="anim-progress-card" style="margin-bottom:14px;">
              <div class="anim-positive-banner ${anim.barTheme}">
                <span>${anim.positiveBanner}</span>
              </div>
              <div class="anim-bar-header" style="margin-bottom: 0;">
                <span>${anim.label}</span>
                <span class="anim-delta-pill ${anim.barTheme}">${anim.deltaText}</span>
              </div>
            </div>`
                : `
            <div class="anim-progress-card" style="margin-bottom:14px;">
              <div class="anim-positive-banner ${anim.barTheme}">
                <span>${anim.positiveBanner}</span>
              </div>
              <div class="anim-bar-header">
                <span>${anim.label}</span>
                <span>
                  <strong id="anim-counter-num" style="font-size:1.05rem;">${animInitialVal}</strong> / ${anim.maxValue} ${anim.unit}
                  <span class="anim-delta-pill ${anim.barTheme}">${anim.deltaText}</span>
                </span>
              </div>
              <div class="anim-bar-track">
                ${
                  anim.kind === 'rest'
                    ? `<div class="anim-bar-ghost" id="anim-bar-ghost" style="width: ${animFromPct}%"></div>`
                    : ''
                }
                <div class="anim-bar-fill ${anim.barTheme}" id="anim-bar-fill" style="width: ${animInitialPct}%"></div>
              </div>
            </div>`
              : ''
          }

          <div class="choice-stack">
            <button class="choice-btn" id="btn-step-confirm" style="text-align:center; background:var(--gov-navy); color:#fff; font-weight:700;">
              ${
                state.activeModal?.type === 'monthly_report'
                  ? '📊 確認並查看本月績效結算單'
                  : '✅ 確認（繼續下一時段）'
              }
            </button>
          </div>
        </div>
      </div>
    `;
  }

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

          ${
            r.examResult
              ? `
          <div style="padding: 10px 14px; border-radius: 5px; margin-bottom: 12px; font-weight: 700; background: ${
            r.examResult.passed ? 'var(--jade-light)' : 'var(--amber-light)'
          }; color: ${
                  r.examResult.passed ? 'var(--jade-good)' : 'var(--amber-warn)'
                }; border: 1.5px solid ${
                  r.examResult.passed ? 'var(--jade-good)' : 'var(--amber-warn)'
                };">
            <div style="font-size: 0.85rem; margin-bottom: 2px;">🎓 考選部本月國家考試放榜結果（應試當下已決定）：</div>
            <div>${r.examResult.summary}</div>
          </div>`
              : ''
          }

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
  try {
    if (!currentState) {
      renderTitleScreen();
      return;
    }
    if (currentState.endingId) {
      renderEndingScreen(currentState);
      return;
    }
    renderMainGame(currentState);
  } catch (err) {
    console.error('Render error, resetting corrupted state to title screen:', err);
    clearAuto();
    currentState = null;
    renderTitleScreen();
  }
}

render();
