// 追納・付加年金 vs オルカン運用の比較計算
// エンジンはsimple-fire-plan/src/lib/simulate.tsの移植（シード同一）
// 取り崩しシミュのフェーズに負の額を入れると「積立」として機能する
// （next = assets*(1+r) - withdrawal なので withdrawal<0 は加算）

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
function withdrawalAt(input, monthIndex) {
  const age = input.startAge + monthIndex / 12;
  for (const phase of input.phases) {
    if (age < phase.untilAge) return phase.monthlyAmount;
  }
  return input.phases.length > 0 ? input.phases[input.phases.length - 1].monthlyAmount : 0;
}

// snapshotAges: その年齢時点の資産分布(p10/p50/p90)を記録
function simulateWithdrawal(input, snapshotAges = []) {
  const mu = input.annualReturnPct / 100;
  const sigma = input.annualRiskPct / 100;
  const sigmaM = sigma / Math.sqrt(12);
  const logMean = Math.log(1 + mu) / 12 - (sigmaM * sigmaM) / 2;
  const totalMonths = Math.max(1, Math.round((MAX_AGE - input.startAge) * 12));
  const rand = mulberry32(20260709);
  const gaussian = makeGaussian(rand);

  const assets = new Float64Array(TRIALS).fill(input.startAssets);
  const depletedMonth = new Int32Array(TRIALS).fill(-1);
  const snapshots = {};
  const snapMonths = new Map(snapshotAges.map((a) => [Math.round((a - input.startAge) * 12), a]));

  for (let m = 0; m < totalMonths; m++) {
    const withdrawal = withdrawalAt(input, m);
    for (let i = 0; i < TRIALS; i++) {
      if (depletedMonth[i] >= 0) continue;
      const r = Math.exp(logMean + sigmaM * gaussian()) - 1;
      const next = assets[i] * (1 + r) - withdrawal;
      if (next <= 0) { assets[i] = 0; depletedMonth[i] = m + 1; }
      else assets[i] = next;
    }
    if (snapMonths.has(m + 1)) {
      const sorted = Float64Array.from(assets).sort();
      snapshots[snapMonths.get(m + 1)] = {
        p10: sorted[Math.floor(0.1 * TRIALS)],
        p50: sorted[Math.floor(0.5 * TRIALS)],
        p90: sorted[Math.floor(0.9 * TRIALS)],
      };
    }
  }
  const depletedSorted = Array.from(depletedMonth).filter((m) => m >= 0).sort((a, b) => a - b);
  const q = (p) => {
    const idx = Math.floor(p * TRIALS);
    return idx < depletedSorted.length ? depletedSorted[idx] : null;
  };
  return {
    survivalRatio: (TRIALS - depletedSorted.length) / TRIALS,
    q10: q(0.1), q25: q(0.25), q50: q(0.5),
    snapshots,
  };
}

const pct = (x) => (x * 100).toFixed(1) + '%';
const age = (start, m) => (m === null ? '尽きない' : `${(start + m / 12).toFixed(1)}歳`);
const man = (x) => x.toFixed(0) + '万円';

// ============ ケース1: 追納 vs オルカン ============
// 30歳・学生特例48ヶ月分の追納 約80万円、所得控除(税率20%)込みの実質負担 約64万円
// 追納リターン: 基礎年金 +70,608円×48/480 = +7,061円/月 = 月0.71万円(65歳から終身)
console.log('=== ケース1: 追納80万円(実質64万円) vs 同額オルカン一括 ===');
console.log('追納の単純回収: 64万 ÷ 8.47万/年 = ' + (64 / 8.47).toFixed(1) + '年 → ' + (65 + 64 / 8.47).toFixed(1) + '歳で回収');
for (const [label, assets0] of [['実質負担64万円', 64], ['額面80万円', 80]]) {
  const r = simulateWithdrawal(
    { startAge: 30, startAssets: assets0, annualReturnPct: 5, annualRiskPct: 18,
      phases: [{ untilAge: 65, monthlyAmount: 0 }, { untilAge: 100, monthlyAmount: 0.7061 }] },
    [65],
  );
  const s = r.snapshots[65];
  console.log(`-- ${label}を30歳で一括投資、65歳から月0.71万円取り崩し --`);
  console.log(`  65歳時点の資産: p10 ${man(s.p10)} / 中央値 ${man(s.p50)} / p90 ${man(s.p90)}`);
  console.log(`  100歳まで持つ確率: ${pct(r.survivalRatio)} / 尽きる10%点 ${age(30, r.q10)} / 25%点 ${age(30, r.q25)} / 中央 ${age(30, r.q50)}`);
}

// ============ ケース2: 付加年金 vs オルカン ============
// 35〜60歳の300ヶ月、月400円。リターン: +200円×300 = 6万円/年(65歳から終身・定額)
console.log('\n=== ケース2: 付加年金(月400円×25年=12万円) vs 同額オルカン積立 ===');
console.log('付加年金の単純回収: 12万 ÷ 6万/年 = 2.0年 → 67歳で回収');
const r2 = simulateWithdrawal(
  { startAge: 35, startAssets: 0, annualReturnPct: 5, annualRiskPct: 18,
    phases: [
      { untilAge: 60, monthlyAmount: -0.04 },  // 月400円を積立
      { untilAge: 65, monthlyAmount: 0 },
      { untilAge: 100, monthlyAmount: 0.5 },   // 月0.5万円(年6万)取り崩し
    ] },
  [65],
);
const s2 = r2.snapshots[65];
console.log(`-- 月400円を35〜60歳でオルカン積立、65歳から月0.5万円取り崩し --`);
console.log(`  65歳時点の資産: p10 ${man(s2.p10)} / 中央値 ${man(s2.p50)} / p90 ${man(s2.p90)}`);
console.log(`  100歳まで持つ確率: ${pct(r2.survivalRatio)} / 尽きる10%点 ${age(35, r2.q10)} / 25%点 ${age(35, r2.q25)} / 中央 ${age(35, r2.q50)}`);

// ============ 追納のIRR(実質・終身年金として) ============
// 30歳に実質64万円払い、65歳から年8.47万円をN歳まで受給した場合の内部収益率
function irr(cost, payAge, startRecv, annual, dieAge) {
  let lo = -0.02, hi = 0.15;
  const npv = (r) => {
    let v = -cost;
    for (let a = startRecv; a < dieAge; a++) v += annual / Math.pow(1 + r, a - payAge);
    return v;
  };
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
console.log('\n=== 追納を「終身の実質利回り」として見ると ===');
for (const die of [75, 80, 85, 90, 95, 100]) {
  console.log(`  ${die}歳まで受給: 実質IRR ${(irr(64, 30, 65, 8.47, die) * 100).toFixed(1)}%`);
}
console.log('\n=== 付加年金のIRR(名目・定額) ===');
// 月400円を35〜60歳(25年)、65歳から年6万をN歳まで
function irrPhased(monthlyCost, costFrom, costTo, startRecv, annual, dieAge) {
  let lo = -0.02, hi = 0.25;
  const npv = (r) => {
    let v = 0;
    for (let a = costFrom; a < costTo; a++) v -= (monthlyCost * 12) / Math.pow(1 + r, a - costFrom);
    for (let a = startRecv; a < dieAge; a++) v += annual / Math.pow(1 + r, a - costFrom);
    return v;
  };
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
for (const die of [75, 80, 85, 90, 100]) {
  console.log(`  ${die}歳まで受給: 名目IRR ${(irrPhased(0.04, 35, 60, 65, 6, die) * 100).toFixed(1)}%`);
}

// ============ ケース2再計算: 名目ベース(リターン7%=実質5%+インフレ2%) ============
// 付加年金は定額(物価スライドなし)なので、名目同士で比較するのが公平
console.log('\n=== ケース2(名目7%で再計算): 月400円オルカン積立 vs 付加年金 ===');
const r2n = simulateWithdrawal(
  { startAge: 35, startAssets: 0, annualReturnPct: 7, annualRiskPct: 18,
    phases: [
      { untilAge: 60, monthlyAmount: -0.04 },
      { untilAge: 65, monthlyAmount: 0 },
      { untilAge: 100, monthlyAmount: 0.5 },
    ] },
  [65],
);
const s2n = r2n.snapshots[65];
console.log(`  65歳時点の資産: p10 ${man(s2n.p10)} / 中央値 ${man(s2n.p50)} / p90 ${man(s2n.p90)}`);
console.log(`  100歳まで持つ確率: ${pct(r2n.survivalRatio)} / 尽きる10%点 ${age(35, r2n.q10)} / 25%点 ${age(35, r2n.q25)} / 中央 ${age(35, r2n.q50)}`);
