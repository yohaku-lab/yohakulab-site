// ファンチャート試作用: 基準ケース（40歳・5,000万円・月16.7万円取り崩し）の
// 資産推移パーセンタイル（年次）を出力する。エンジン・シードは既存記事と同一。

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
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0;
    while (u === 0) u = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    const theta = 2 * Math.PI * rand();
    spare = r * Math.sin(theta);
    return r * Math.cos(theta);
  };
}

function run({ startAge, startAssets, monthly, returnPct, riskPct }) {
  const sigmaM = riskPct / 100 / Math.sqrt(12);
  const logMean = Math.log(1 + returnPct / 100) / 12 - (sigmaM * sigmaM) / 2;
  const totalMonths = (MAX_AGE - startAge) * 12;
  const rand = mulberry32(20260709);
  const gaussian = makeGaussian(rand);
  const assets = new Float64Array(TRIALS).fill(startAssets);
  const dead = new Uint8Array(TRIALS);

  const yearly = []; // 各年齢時点のパーセンタイル
  const snap = (age) => {
    const sorted = Array.from(assets).sort((a, b) => a - b);
    const q = (p) => Math.round(sorted[Math.min(TRIALS - 1, Math.floor(p * TRIALS))]);
    const alive = dead.reduce((s, d) => s + (1 - d), 0);
    yearly.push({ age, p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), survival: alive / TRIALS });
  };
  snap(startAge);

  for (let m = 0; m < totalMonths; m++) {
    for (let i = 0; i < TRIALS; i++) {
      if (dead[i]) continue;
      const r = Math.exp(logMean + sigmaM * gaussian()) - 1;
      const next = assets[i] * (1 + r) - monthly;
      if (next <= 0) { assets[i] = 0; dead[i] = 1; } else { assets[i] = next; }
    }
    const ageNow = startAge + (m + 1) / 12;
    if ((m + 1) % 12 === 0 && ageNow % 2 === 0) snap(ageNow);
  }
  return yearly;
}

const base = run({ startAge: 40, startAssets: 5000, monthly: 16.7, returnPct: 5, riskPct: 18 });
console.log(JSON.stringify(base));
