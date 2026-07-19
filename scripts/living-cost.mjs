// 記事「コンパクト生活とFIRE」用の計算。
// エンジンは blog-calc.mjs / fire-decision.mjs と同一（シード20260709固定）。

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

function simulateWithdrawal(input, trials = TRIALS) {
  const mu = input.annualReturnPct / 100;
  const sigma = input.annualRiskPct / 100;
  const sigmaM = sigma / Math.sqrt(12);
  const logMean = Math.log(1 + mu) / 12 - (sigmaM * sigmaM) / 2;
  const totalMonths = Math.max(1, Math.round((MAX_AGE - input.startAge) * 12));
  const rand = mulberry32(20260709);
  const gaussian = makeGaussian(rand);

  const assets = new Float64Array(trials).fill(input.startAssets);
  const depleted = new Uint8Array(trials);
  let depletedCount = 0;

  for (let m = 0; m < totalMonths; m++) {
    for (let i = 0; i < trials; i++) {
      if (depleted[i]) continue;
      const r = Math.exp(logMean + sigmaM * gaussian()) - 1;
      const next = assets[i] * (1 + r) - input.monthlyAmount;
      if (next <= 0) {
        assets[i] = 0;
        depleted[i] = 1;
        depletedCount++;
      } else {
        assets[i] = next;
      }
    }
  }
  return (trials - depletedCount) / trials;
}

const pct = (x) => (x * 100).toFixed(1) + '%';
const success = (assets, monthly) =>
  simulateWithdrawal({ startAge: 40, startAssets: assets, monthlyAmount: monthly, annualReturnPct: 5, annualRiskPct: 18 });

// A: 生活費を月1万円ずつ下げると成功率はどう変わるか（40歳・5,000万円）
console.log('=== A: 生活費別の成功率（40歳・5,000万円）===');
for (const monthly of [16.7, 15.7, 14.7, 13.7, 12.7]) {
  console.log(`生活費 月${monthly}万円: 成功率 ${pct(success(5000, monthly))}`);
}

// B: 「月1万円の節約」は資産いくら分か（等価資産の逆算）
console.log('\n=== B: 等価資産の逆算（生活費16.7万円のままで同じ成功率にするには）===');
for (const monthly of [15.7, 14.7, 13.7]) {
  const target = success(5000, monthly);
  let lo = 5000, hi = 12000;
  for (let it = 0; it < 26; it++) {
    const mid = (lo + hi) / 2;
    if (success(mid, 16.7) < target) lo = mid; else hi = mid;
  }
  const eq = Math.round((lo + hi) / 2 / 10) * 10;
  const cut = Math.round((16.7 - monthly) * 10) / 10;
  console.log(`月${cut}万円の節約（生活費${monthly}万円・成功率${pct(target)}）＝ 資産${eq}万円と等価 → 差額 約${eq - 5000}万円`);
}

// C: 25倍則（4%ルールの単純換算）
console.log('\n=== C: 参考・25倍則の単純計算 ===');
for (const cut of [0.5, 1, 2, 3]) {
  console.log(`月${cut}万円の節約 → 年${cut * 12}万円 × 25 = 必要資産 ${cut * 12 * 25}万円分`);
}

// D: 到達側から見る——目標5000万 vs 生活費-1万円なら目標4700万でも同じ成功率?
// （目標額そのものを 25倍則で下げた場合の到達時期短縮は tsumitate 記事の領域なので簡易に）
