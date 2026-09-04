// 記事「取り崩しの出口戦略をモンテカルロで見る」用の検証スクリプト。
// エンジンはブラウザ版シンプルFIRE計画(simple-fire-plan/src/lib/simulate.ts)の
// simulateWithdrawal と同一ロジック（対数正規リターン・シード20260709固定）。
// このスクリプトはtrial-outerループで書いており、アプリのUI表示値とは
// 乱数消費順が異なるため数値は一致しない（が、手法・分布は同一）。

const TRIALS = 10_000;
const MAX_AGE = 100;
const SEED = 20260709;

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

function quantile(sortedArr, q) {
  const idx = Math.min(sortedArr.length - 1, Math.floor(q * sortedArr.length));
  return sortedArr[idx];
}

/**
 * 取り崩しシミュレーション本体（trial-outer）。
 * startAssets: 開始資産（万円） / annualWithdrawal: 年間取り崩し額（万円）
 * annualReturnPct / annualRiskPct: 年率期待リターン・標準偏差（%）
 * startAge: 開始年齢 / trials: 試行回数
 *
 * 戻り値には、各試行の「最初の60か月の平均月次リターン」も含める。
 * これは取り崩し結果に影響されない「入口のツキ」を表す指標として使う。
 */
function simulateWithdrawal({ startAssets, annualWithdrawal, annualReturnPct, annualRiskPct, startAge, trials = TRIALS }) {
  const mu = annualReturnPct / 100;
  const sigma = annualRiskPct / 100;
  const sigmaM = sigma / Math.sqrt(12);
  const logMean = Math.log(1 + mu) / 12 - (sigmaM * sigmaM) / 2;
  const monthlyWithdrawal = annualWithdrawal / 12;
  const totalMonths = Math.round((MAX_AGE - startAge) * 12);

  const rand = mulberry32(SEED);
  const gaussian = makeGaussian(rand);

  const depletedMonth = new Int32Array(trials).fill(-1);
  const first60AvgReturn = new Float64Array(trials);
  const endBalance = new Float64Array(trials);

  for (let i = 0; i < trials; i++) {
    let assets = startAssets;
    let sumFirst60 = 0;
    for (let m = 0; m < totalMonths; m++) {
      const r = Math.exp(logMean + sigmaM * gaussian()) - 1;
      if (m < 60) sumFirst60 += r;
      if (assets > 0) {
        assets = assets * (1 + r) - monthlyWithdrawal;
        if (assets <= 0) {
          assets = 0;
          depletedMonth[i] = m + 1;
        }
      }
    }
    first60AvgReturn[i] = sumFirst60 / 60;
    endBalance[i] = assets;
  }

  const depletedCount = Array.from(depletedMonth).filter((m) => m >= 0).length;
  const survivalRatio = (trials - depletedCount) / trials;

  // 「尽きたケースのみ」を対象にした分位点（尽きた集団の中でのp%点）。
  // 生存率が50%を超える場合、全体基準のq50は無意味になるため、尽きた集団内で計算する。
  const depletedSorted = Array.from(depletedMonth)
    .filter((m) => m >= 0)
    .sort((a, b) => a - b);
  const q = (p) => {
    if (depletedSorted.length === 0) return null;
    const idx = Math.min(depletedSorted.length - 1, Math.floor(p * depletedSorted.length));
    return depletedSorted[idx] / 12; // 年換算
  };

  return {
    survivalRatio,
    depletionYearQuantiles: { q10: q(0.1), q25: q(0.25), q50: q(0.5) },
    depletedMonth,
    first60AvgReturn,
    endBalance,
    totalMonths,
  };
}

/** 最初の5年（60か月）の平均リターンで4分位バケットに分け、バケットごとの生存率を出す */
function bucketBySequenceLuck(result, trials = TRIALS) {
  const idx = Array.from({ length: trials }, (_, i) => i);
  idx.sort((a, b) => result.first60AvgReturn[a] - result.first60AvgReturn[b]);

  const buckets = [
    { label: '最初の5年が不運（下位25%）', slice: idx.slice(0, trials / 4) },
    { label: 'やや不運（25〜50%）', slice: idx.slice(trials / 4, trials / 2) },
    { label: 'やや幸運（50〜75%）', slice: idx.slice(trials / 2, (trials * 3) / 4) },
    { label: '最初の5年が幸運（上位25%）', slice: idx.slice((trials * 3) / 4) },
  ];

  return buckets.map((b) => {
    const survived = b.slice.filter((i) => result.depletedMonth[i] === -1).length;
    const avgReturnPct =
      (b.slice.reduce((s, i) => s + result.first60AvgReturn[i], 0) / b.slice.length) * 12 * 100;
    return {
      label: b.label,
      survivalRatio: survived / b.slice.length,
      avgFirst5yAnnualReturnPct: avgReturnPct,
    };
  });
}

// ---------------------------------------------------------------------------
// ケース1: モンテカルロ本体
// 60歳リタイア・開始資産6,000万円・年間生活費240万円（月20万円、取り崩し率4%）
// 期待利回り年5%・リスク（標準偏差）18%、100歳まで
// ※ 前回記事(4-percent-rule-monte-carlo)の「60歳開始・4%・成功率54%」と
//   同じ前提を採用し、まず数値の整合を確認したうえで「順番」の効果を追加分析する。
// ---------------------------------------------------------------------------
const baseCase = {
  startAssets: 6000,
  annualWithdrawal: 240,
  annualReturnPct: 5,
  annualRiskPct: 18,
  startAge: 60,
};

const result = simulateWithdrawal(baseCase);

console.log('=== ケース1: 60歳・6,000万円・取り崩し率4%（年240万円）・期待利回り5%・リスク18% ===');
console.log(`生存率（100歳まで資産が尽きない割合）: ${(result.survivalRatio * 100).toFixed(1)}%`);
console.log(`資産が尽きた場合の年齢の分位点（尽きた${((1 - result.survivalRatio) * 100).toFixed(1)}%のケース内での分位点）:`);
console.log(`  下位10%（早く尽きた側）: ${(baseCase.startAge + result.depletionYearQuantiles.q10).toFixed(1)}歳`);
console.log(`  下位25%: ${(baseCase.startAge + result.depletionYearQuantiles.q25).toFixed(1)}歳`);
console.log(`  中央値 : ${(baseCase.startAge + result.depletionYearQuantiles.q50).toFixed(1)}歳`);

console.log('\n=== ケース1のバケット分析: 最初の5年の運と生存率 ===');
const buckets = bucketBySequenceLuck(result);
for (const b of buckets) {
  console.log(
    `${b.label}: 生存率 ${(b.survivalRatio * 100).toFixed(1)}%（最初の5年の平均年率リターン ${b.avgFirst5yAnnualReturnPct.toFixed(1)}%）`,
  );
}

// ---------------------------------------------------------------------------
// ケース2: 取り崩し率を下げた（3%）場合でも同じ傾向が出るか確認
// ---------------------------------------------------------------------------
const highWithdrawalCase = {
  startAssets: 6000,
  annualWithdrawal: 180, // 3%
  annualReturnPct: 5,
  annualRiskPct: 18,
  startAge: 60,
};
const result2 = simulateWithdrawal(highWithdrawalCase);
console.log('\n=== ケース2: 取り崩し率3%（年180万円）・その他同条件 ===');
console.log(`生存率: ${(result2.survivalRatio * 100).toFixed(1)}%`);
const buckets2 = bucketBySequenceLuck(result2);
for (const b of buckets2) {
  console.log(`${b.label}: 生存率 ${(b.survivalRatio * 100).toFixed(1)}%`);
}

// ---------------------------------------------------------------------------
// ケース3: 決定論的な最小例——同じ算術平均のリターン列でも「順番」で結果が変わることを示す
// 開始資産6,000万円・毎年240万円取り崩し（4%）・5年間の年次リターン列（同じ5つの数字を並べ替えるだけ）
// ---------------------------------------------------------------------------
function walkAnnual(startAssets, annualWithdrawal, returns) {
  let assets = startAssets;
  const path = [assets];
  for (const r of returns) {
    assets = Math.max(0, assets * (1 + r) - annualWithdrawal);
    path.push(assets);
  }
  return path;
}

const returnsCrashFirst = [-0.30, 0.12, 0.15, 0.10, 0.13]; // 平均4%
const returnsCrashLast = [0.12, 0.15, 0.10, 0.13, -0.30]; // 同じ5つを並べ替え、平均は同じ4%
const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;

console.log('\n=== ケース3: 決定論的な最小例（6,000万円・毎年240万円取り崩し・5年間） ===');
console.log(`算術平均リターン（両ケース共通）: ${(avg(returnsCrashFirst) * 100).toFixed(1)}%`);
const pathFirst = walkAnnual(6000, 240, returnsCrashFirst);
const pathLast = walkAnnual(6000, 240, returnsCrashLast);
console.log(`暴落が1年目に来た場合の5年後の資産: ${pathFirst[5].toFixed(0)}万円（推移: ${pathFirst.map((v) => v.toFixed(0)).join(' → ')}）`);
console.log(`暴落が5年目に来た場合の5年後の資産: ${pathLast[5].toFixed(0)}万円（推移: ${pathLast.map((v) => v.toFixed(0)).join(' → ')}）`);
