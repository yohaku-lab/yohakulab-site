// 記事「FIREに踏み切る判断」用の計算。
// エンジンは blog-calc.mjs と同一（simple-fire-plan/src/lib/simulate.ts の移植・シード固定）。

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

function withdrawalAt(input, monthIndex) {
  const age = input.startAge + monthIndex / 12;
  for (const phase of input.phases) {
    if (age < phase.untilAge) return phase.monthlyAmount;
  }
  return input.phases.length > 0 ? input.phases[input.phases.length - 1].monthlyAmount : 0;
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
const ageOf = (startAge, month) =>
  month === null ? 'なし' : `${(startAge + month / 12).toFixed(1)}歳`;

// 共通条件: 40歳リタイア・生活費 月16.7万円（年200万円）・実質リターン5%・リスク18%
const LIVING = 16.7;
function successAt(assets, startAge = 40) {
  return simulateWithdrawal({
    startAge, startAssets: assets,
    phases: [{ untilAge: 100, monthlyAmount: LIVING }],
    annualReturnPct: 5, annualRiskPct: 18, inflationPct: 0,
  });
}

// ============ Part A: 成功率と必要資産 ============
console.log('=== A: 開始資産ごとの成功率（40歳・月16.7万円取り崩し）===');
for (const assets of [5000, 6000, 7000, 8000, 9000, 10000, 12000]) {
  const r = successAt(assets);
  const rate = ((LIVING * 12) / assets) * 100;
  console.log(`資産${assets}万円（取り崩し率${rate.toFixed(1)}%/年）: 成功率 ${pct(r.survivalRatio)}`);
}

console.log('\n=== A2: 目標成功率に必要な資産（二分探索）===');
for (const target of [0.5, 0.7, 0.8, 0.9, 0.95, 0.99]) {
  let lo = 4000, hi = 30000;
  for (let it = 0; it < 30; it++) {
    const mid = (lo + hi) / 2;
    if (successAt(mid).survivalRatio < target) lo = mid; else hi = mid;
  }
  const need = Math.round((lo + hi) / 2 / 10) * 10;
  const rate = ((LIVING * 12) / need) * 100;
  console.log(`成功率${(target * 100).toFixed(0)}%: 約${need}万円（取り崩し率${rate.toFixed(2)}%/年）`);
}

// ============ Part B: あと1年働くとどうなるか ============
// 40歳・5,000万円時点。働く1年ごとに 資産×1.05 + 月15万円積立(年180万円)、リタイア年齢+1。
console.log('\n=== B: あと1年働く価値（月15万円積立・実質5%成長を仮定）===');
let assets = 5000;
for (let extra = 0; extra <= 5; extra++) {
  const startAge = 40 + extra;
  const r = successAt(Math.round(assets), startAge);
  console.log(`+${extra}年（${startAge}歳・資産${Math.round(assets)}万円）: 成功率 ${pct(r.survivalRatio)} / 10%が尽きる年齢 ${ageOf(startAge, r.q10)}`);
  assets = assets * 1.05 + 15 * 12;
}

// 積立なし（運用成長のみ）版
console.log('\n--- 参考: 積立を足さず運用成長のみの場合 ---');
assets = 5000;
for (let extra = 0; extra <= 3; extra++) {
  const startAge = 40 + extra;
  const r = successAt(Math.round(assets), startAge);
  console.log(`+${extra}年（${startAge}歳・資産${Math.round(assets)}万円）: 成功率 ${pct(r.survivalRatio)}`);
  assets = assets * 1.05;
}

// ============ Part C: 失敗はいつ起きるか ============
console.log('\n=== C: ベースケース（40歳・5000万円・41%）の失敗タイミング ===');
const base = successAt(5000);
console.log(`成功率 ${pct(base.survivalRatio)}`);
console.log(`最悪10%のシナリオが尽きる年齢: ${ageOf(40, base.q10)}`);
console.log(`最悪25%のシナリオが尽きる年齢: ${ageOf(40, base.q25)}`);
console.log(`失敗シナリオの中央値が尽きる年齢: ${ageOf(40, base.q50)}`);

// ============ D: 確実性の値段 ============
console.log('\n=== D0: 99%の必要資産（上限を上げて再探索）===');
for (const a of [20000, 30000, 40000, 60000]) {
  console.log(`資産${a}万円: ${pct(successAt(a).survivalRatio)}`);
}
{
  let lo = 20000, hi = 80000;
  for (let it = 0; it < 30; it++) {
    const mid = (lo + hi) / 2;
    if (successAt(mid).survivalRatio < 0.99) lo = mid; else hi = mid;
  }
  console.log(`成功率99%: 約${Math.round((lo + hi) / 2 / 100) * 100}万円`);
}

console.log('\n=== D: 必要資産の差を「働く年数」に換算（月15万円積立・実質5%成長）===');
function yearsToReach(from, to) {
  let a = from, y = 0;
  while (a < to && y < 200) { a = a * 1.05 + 180; y++; }
  return y;
}
for (const [label, to] of [
  ['50%（5760万円）', 5760], ['70%（8060万円）', 8060], ['80%（10200万円）', 10200],
  ['90%（14220万円）', 14220], ['95%（18620万円）', 18620],
]) {
  console.log(`5000万円から ${label} まで: 約${yearsToReach(5000, to)}年`);
}
console.log(`80%（10200万円）→90%（14220万円）: 追加約${yearsToReach(10200, 14220)}年`);
console.log(`90%（14220万円）→95%（18620万円）: 追加約${yearsToReach(14220, 18620)}年`);
