// 平衡模擬：每月 8 格，KPI 需 6 個工作單位
const N = 200000;
const SLOTS = 8, NEED = 6;
const P_LOSE1 = 0.07, P_LOSE2 = 0.02, P_HALF = 0.05, P_BONUS = 0.03;

function month(strategy) {
  // strategy: 'adaptive' (先做滿 KPI 再偷懶), 'slackN' (固定先偷懶 N 格), 'sacrifice' (整月偷懶)
  let units = 0, slack = 0, blocked = 0;
  for (let i = 0; i < SLOTS; i++) {
    if (blocked > 0) { blocked--; continue; }
    const r = Math.random();
    let lost = false, mult = 1;
    if (r < P_LOSE2) { lost = true; blocked = 1; }
    else if (r < P_LOSE2 + P_LOSE1) { lost = true; }
    else if (r < P_LOSE2 + P_LOSE1 + P_HALF) { mult = 0.5; }
    else if (r < P_LOSE2 + P_LOSE1 + P_HALF + P_BONUS) { mult = 1.5; }
    if (lost) continue;
    let work;
    if (strategy === 'sacrifice') work = false;
    else if (strategy === 'adaptive') work = units < NEED;
    else { const n = +strategy.replace('slack', ''); work = i >= n ? units < NEED : false; }
    if (work) units += mult; else slack++;
  }
  return { ok: units >= NEED, slack };
}

function half(strats) {
  let fails = 0, slack = 0;
  for (const s of strats) { const m = month(s); if (!m.ok) fails++; slack += m.slack; }
  let p = 0.10; for (let i = 0; i < slack; i++) p += (1 + Math.floor(Math.random() * 3)) / 100;
  return { fails, slack, p: Math.min(p, 1) };
}

const plans = {
  '全力工作(做完才偷懶)': Array(6).fill('adaptive'),
  '每月先偷懶1格': Array(6).fill('slack1'),
  '每月先偷懶2格': Array(6).fill('slack2'),
  '放棄1個月+其餘做完': ['sacrifice', ...Array(5).fill('adaptive')],
  '放棄2個月+其餘做完': ['sacrifice', 'sacrifice', ...Array(4).fill('adaptive')],
  '放棄3個月+其餘做完': ['sacrifice', 'sacrifice', 'sacrifice', ...Array(3).fill('adaptive')],
};

let m = 0, ok = 0; for (let i = 0; i < N; i++) { if (month('adaptive').ok) ok++; }
console.log('單月(全力)達標率', (ok / N * 100).toFixed(1) + '%');
for (const [name, s] of Object.entries(plans)) {
  let over = 0, slack = 0, p = 0, fails = 0;
  for (let i = 0; i < N; i++) { const h = half(s); if (h.fails >= (+process.argv[2] || 4)) over++; slack += h.slack; p += h.p; fails += h.fails; }
  console.log(name.padEnd(16), '平均未達標月', (fails / N).toFixed(2), '| 送考評率', (over / N * 100).toFixed(1) + '%',
    '| 半年偷懶格', (slack / N).toFixed(1), '| 考試通過率', (p / N * 100).toFixed(1) + '%');
}
