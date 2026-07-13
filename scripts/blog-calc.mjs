// simple-fire-plan/src/lib/simulate.ts をそのまま移植（型のみ削除）。
// 記事用の数値を実エンジンと同一ロジック・同一シードで計算する。

const TRIALS = 10_000;
const MAX_AGE = 100;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGaussian(rand) {
  let spare = null;
  return () => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    while (u === 0) u = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    const theta = 2 * Math.PI * rand();
    spare = r * Math.sin(theta);
    return r * Math.cos(theta);
  };
}

function contributionAt(input, monthIndex) {
  const age = input.currentAge + monthIndex / 12;
  for (const phase of input.phases) {
    if (age < phase.untilAge) return phase.monthlyAmount;
  }
  return 0;
}

function withdrawalAt(input, monthIndex) {
  const age = input.startAge + monthIndex / 12;
  for (const phase of input.phases) {
    if (age < phase.untilAge) return phase.monthlyAmount;
  }
  return input.phases.length > 0 ? input.phases[input.phases.length - 1].monthlyAmount : 0;
}

function simulate(input, trials = TRIALS) {
  const mu = input.annualReturnPct / 100;
  const sigma = input.annualRiskPct / 100;
  const inflation = (input.inflationPct ?? 0) / 100;
  const realMu = inflation !== 0 ? (1 + mu) / (1 + inflation) - 1 : mu;
  const sigmaM = sigma / Math.sqrt(12);
  const logMean = Math.log(1 + realMu) / 12 - (sigmaM * sigmaM) / 2;
  const totalMonths = Math.max(1, Math.round((MAX_AGE - input.currentAge) * 12));
  const rand = mulberry32(20260709);
  const gaussian = makeGaussian(rand);

  const assets = new Float64Array(trials).fill(input.currentAssets);
  const reachedMonth = new Int32Array(trials).fill(-1);
  if (input.currentAssets >= input.goalAssets) reachedMonth.fill(0);

  let deterministic = input.currentAssets;
  let deterministicReachMonth = null;
  const detMonthlyRate = Math.pow(1 + realMu, 1 / 12) - 1;
  const reachProbByMonth = new Float64Array(totalMonths);

  for (let m = 0; m < totalMonths; m++) {
    const contribution = contributionAt(input, m);
    let reachedCount = 0;
    for (let i = 0; i < trials; i++) {
      const r = Math.exp(logMean + sigmaM * gaussian()) - 1;
      assets[i] = assets[i] * (1 + r) + contribution;
      if (reachedMonth[i] >= 0) reachedCount++;
      else if (assets[i] >= input.goalAssets) {
        reachedMonth[i] = m + 1;
        reachedCount++;
      }
    }
    reachProbByMonth[m] = reachedCount / trials;
    deterministic = deterministic * (1 + detMonthlyRate) + contribution;
    if (deterministicReachMonth === null && deterministic >= input.goalAssets)
      deterministicReachMonth = m + 1;
  }

  const reachedSorted = Array.from(reachedMonth).filter((m) => m >= 0).sort((a, b) => a - b);
  const q = (p) => {
    const idx = Math.floor(p * trials);
    return idx < reachedSorted.length ? reachedSorted[idx] : null;
  };
  return {
    q25: q(0.25), q50: q(0.5), q90: q(0.9),
    notReachedRatio: (trials - reachedSorted.length) / trials,
    deterministicReachMonth,
    probAtMonth: (m) => (m >= 1 && m <= totalMonths ? reachProbByMonth[m - 1] : null),
  };
}

function simulateWithdrawal(input, trials = TRIALS) {
  const mu = input.annualReturnPct / 100;
  const sigma = input.annualRiskPct / 100;
  const inflation = (input.inflationPct ?? 0) / 100;
  const realMu = inflation !== 0 ? (1 + mu) / (1 + inflation) - 1 : mu;
  const sigmaM = sigma / Math.sqrt(12);
  const logMean = Math.log(1 + realMu) / 12 - (sigmaM * sigmaM) / 2;
  const totalMonths = Math.max(1, Math.round((MAX_AGE - input.startAge) * 12));
  const rand = mulberry32(20260709);
  const gaussian = makeGaussian(rand);

  const assets = new Float64Array(trials).fill(input.startAssets);
  const depletedMonth = new Int32Array(trials).fill(-1);

  for (let m = 0; m < totalMonths; m++) {
    const withdrawal = withdrawalAt(input, m);
    for (let i = 0; i < trials; i++) {
      if (depletedMonth[i] >= 0) continue;
      const r = Math.exp(logMean + sigmaM * gaussian()) - 1;
      const next = assets[i] * (1 + r) - withdrawal;
      if (next <= 0) {
        assets[i] = 0;
        depletedMonth[i] = m + 1;
      } else {
        assets[i] = next;
      }
    }
  }

  const depletedSorted = Array.from(depletedMonth).filter((m) => m >= 0).sort((a, b) => a - b);
  const q = (p) => {
    const idx = Math.floor(p * trials);
    return idx < depletedSorted.length ? depletedSorted[idx] : null;
  };
  return {
    survivalRatio: (trials - depletedSorted.length) / trials,
    q10: q(0.1), q25: q(0.25), q50: q(0.5),
  };
}

const pct = (x) => (x * 100).toFixed(1) + '%';
const ym = (startAge, month) =>
  month === null ? '未到達' : `${(startAge + month / 12).toFixed(1)}歳（${(month / 12).toFixed(1)}年後）`;

// ============ 記事B: 積立はいつ届く？（平均計算 vs 確率） ============
console.log('=== 記事B: 35歳・資産1000万・目標5000万・リターン5%リスク18% ===');
for (const monthly of [5, 10, 15]) {
  const r = simulate({
    currentAge: 35, currentAssets: 1000, goalAssets: 5000,
    phases: [{ untilAge: 100, monthlyAmount: monthly }],
    annualReturnPct: 5, annualRiskPct: 18, inflationPct: 0,
  });
  console.log(`-- 月${monthly}万円積立 --`);
  console.log(`  固定利回り計算での到達: ${ym(35, r.deterministicReachMonth)}`);
  if (r.deterministicReachMonth) {
    console.log(`  その時点で実際に届いている確率: ${pct(r.probAtMonth(r.deterministicReachMonth))}`);
  }
  console.log(`  q25(上振れ25%): ${ym(35, r.q25)} / q50(中央): ${ym(35, r.q50)} / q90(慎重): ${ym(35, r.q90)}`);
  console.log(`  100歳まで未到達: ${pct(r.notReachedRatio)}`);
}

// ============ 記事A: サイドFIRE ============
console.log('\n=== 記事A: 40歳リタイア・5000万・生活費16.7万(4%)・リターン5%リスク18% ===');
const full = simulateWithdrawal({
  startAge: 40, startAssets: 5000,
  phases: [{ untilAge: 100, monthlyAmount: 16.7 }],
  annualReturnPct: 5, annualRiskPct: 18, inflationPct: 0,
});
console.log(`完全リタイア: 成功率 ${pct(full.survivalRatio)} / 10%が尽きる年齢 ${ym(40, full.q10)}`);

for (const [income, until] of [[5, 60], [10, 60], [5, 65], [10, 65], [15, 60]]) {
  const r = simulateWithdrawal({
    startAge: 40, startAssets: 5000,
    phases: [
      { untilAge: until, monthlyAmount: 16.7 - income },
      { untilAge: 100, monthlyAmount: 16.7 },
    ],
    annualReturnPct: 5, annualRiskPct: 18, inflationPct: 0,
  });
  console.log(`月${income}万円の収入を${until}歳まで: 成功率 ${pct(r.survivalRatio)}`);
}

// 等価資産の探索: 完全リタイアで「月5万収入を60歳まで」と同じ成功率になる開始資産
function successForAssets(assets) {
  return simulateWithdrawal({
    startAge: 40, startAssets: assets,
    phases: [{ untilAge: 100, monthlyAmount: 16.7 }],
    annualReturnPct: 5, annualRiskPct: 18, inflationPct: 0,
  }).survivalRatio;
}
const target5 = simulateWithdrawal({
  startAge: 40, startAssets: 5000,
  phases: [{ untilAge: 60, monthlyAmount: 11.7 }, { untilAge: 100, monthlyAmount: 16.7 }],
  annualReturnPct: 5, annualRiskPct: 18, inflationPct: 0,
}).survivalRatio;
let lo = 5000, hi = 9000;
for (let it = 0; it < 24; it++) {
  const mid = (lo + hi) / 2;
  if (successForAssets(mid) < target5) lo = mid; else hi = mid;
}
console.log(`「月5万×60歳まで」と同成功率(${pct(target5)})に必要な完全リタイア資産: 約${Math.round((lo + hi) / 2 / 10) * 10}万円`);

// ============ 記事C: 年金 ============
console.log('\n=== 記事C: 40歳リタイア・5000万・生活費16.7万・65歳から年金 ===');
for (const pension of [7, 10, 13]) {
  const r = simulateWithdrawal({
    startAge: 40, startAssets: 5000,
    phases: [
      { untilAge: 65, monthlyAmount: 16.7 },
      { untilAge: 100, monthlyAmount: Math.round((16.7 - pension) * 10) / 10 },
    ],
    annualReturnPct: 5, annualRiskPct: 18, inflationPct: 0,
  });
  console.log(`65歳から年金 月${pension}万円: 成功率 ${pct(r.survivalRatio)}`);
}
// 50歳リタイア版
const base50 = simulateWithdrawal({
  startAge: 50, startAssets: 5000,
  phases: [{ untilAge: 100, monthlyAmount: 16.7 }],
  annualReturnPct: 5, annualRiskPct: 18, inflationPct: 0,
});
console.log(`(参考) 50歳リタイア・年金なし: ${pct(base50.survivalRatio)}`);
const p50 = simulateWithdrawal({
  startAge: 50, startAssets: 5000,
  phases: [{ untilAge: 65, monthlyAmount: 16.7 }, { untilAge: 100, monthlyAmount: 6.7 }],
  annualReturnPct: 5, annualRiskPct: 18, inflationPct: 0,
});
console.log(`(参考) 50歳リタイア・65歳から年金10万: ${pct(p50.survivalRatio)}`);
// 年金なし41%との対比用に40歳・年金10万で「4%より高い取り崩し率だとどうか」
for (const wd of [20, 25]) {
  const r = simulateWithdrawal({
    startAge: 40, startAssets: 5000,
    phases: [{ untilAge: 65, monthlyAmount: wd }, { untilAge: 100, monthlyAmount: wd - 10 }],
    annualReturnPct: 5, annualRiskPct: 18, inflationPct: 0,
  });
  console.log(`生活費 月${wd}万円(年${(wd * 12 / 5000 * 100).toFixed(1)}%)・65歳から年金10万: ${pct(r.survivalRatio)}`);
}
