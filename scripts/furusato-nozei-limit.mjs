// 記事「ふるさと納税は本当にお得なのか」用の検証スクリプト。
// 税率・控除額の定数は simple-tedori/src/lib/rates.ts と同一のものを複製している
// （基準年度: 令和8年度2026年度、確認日2026-07-20。年度が変わったら両方更新する）。
// 限度額の計算式（総務省・各ふるさと納税サイトが示す一般的な近似式）:
//   特例控除の上限 = 住民税所得割額 × 20%
//   特例控除額 = (寄付額 - 2,000円) × (90% - 所得税率 × 1.021)
//   → 寄付額の上限 = 住民税所得割額 × 20% ÷ (90% - 所得税率 × 1.021) + 2,000円

// --- 給与所得控除 ---
function salaryIncomeDeduction(grossIncome) {
  if (grossIncome <= 1_900_000) return Math.min(grossIncome, 740_000);
  if (grossIncome <= 3_600_000) return grossIncome * 0.3 + 80_000;
  if (grossIncome <= 6_600_000) return grossIncome * 0.2 + 440_000;
  if (grossIncome <= 8_500_000) return grossIncome * 0.1 + 1_100_000;
  return 1_950_000;
}

// --- 基礎控除 ---
function basicDeductionIncomeTax(totalIncome) {
  if (totalIncome <= 4_890_000) return 1_040_000;
  if (totalIncome <= 6_550_000) return 670_000;
  if (totalIncome <= 23_500_000) return 620_000;
  if (totalIncome <= 24_000_000) return 410_000;
  if (totalIncome <= 24_500_000) return 270_000;
  if (totalIncome <= 25_000_000) return 130_000;
  return 0;
}
function basicDeductionResidentTax(totalIncome) {
  if (totalIncome <= 24_000_000) return 430_000;
  if (totalIncome <= 24_500_000) return 290_000;
  if (totalIncome <= 25_000_000) return 150_000;
  return 0;
}

const DEPENDENT_DEDUCTION_INCOME_TAX = 380_000;
const DEPENDENT_DEDUCTION_RESIDENT_TAX = 330_000;
const SPOUSE_DEDUCTION_INCOME_TAX = 380_000;
const SPOUSE_DEDUCTION_RESIDENT_TAX = 330_000;

// --- 社会保険料（概算。標準報酬月額の等級表は使わず月給そのものを使用） ---
const HEALTH_INSURANCE_RATE = 0.099;
const PENSION_RATE = 0.183;
const EMPLOYMENT_INSURANCE_RATE = 0.005;
const CHILDCARE_SUPPORT_RATE = 0.0023;
const EMPLOYEE_SHARE = 0.5;
const HEALTH_MONTHLY_CAP = 1_390_000;
const PENSION_MONTHLY_CAP = 650_000;

function calcSocialInsurance(grossIncome) {
  const monthlySalary = grossIncome / 12;
  const healthBase = Math.min(monthlySalary, HEALTH_MONTHLY_CAP) * 12;
  const health = Math.floor(healthBase * HEALTH_INSURANCE_RATE * EMPLOYEE_SHARE);
  const childcare = Math.floor(healthBase * CHILDCARE_SUPPORT_RATE * EMPLOYEE_SHARE);
  const pensionBase = Math.min(monthlySalary, PENSION_MONTHLY_CAP) * 12;
  const pension = Math.floor(pensionBase * PENSION_RATE * EMPLOYEE_SHARE);
  const employment = Math.floor(grossIncome * EMPLOYMENT_INSURANCE_RATE);
  return health + childcare + pension + employment;
}

// --- 所得税 ---
const INCOME_TAX_BRACKETS = [
  { threshold: 1_949_000, rate: 0.05, deduction: 0 },
  { threshold: 3_299_000, rate: 0.1, deduction: 97_500 },
  { threshold: 6_949_000, rate: 0.2, deduction: 427_500 },
  { threshold: 8_999_000, rate: 0.23, deduction: 636_000 },
  { threshold: 17_999_000, rate: 0.33, deduction: 1_536_000 },
  { threshold: 39_999_000, rate: 0.4, deduction: 2_796_000 },
  { threshold: Infinity, rate: 0.45, deduction: 4_796_000 },
];
const RECONSTRUCTION_SURTAX_RATE = 0.021;

function marginalIncomeTaxRate(taxableIncome) {
  const base = Math.floor(Math.max(0, taxableIncome) / 1000) * 1000;
  const bracket = INCOME_TAX_BRACKETS.find((b) => base <= b.threshold);
  return bracket ? bracket.rate : 0;
}

// --- 住民税 ---
const RESIDENT_TAX_INCOME_RATE = 0.1;
const ADJUSTMENT_DIFF_BASIC = 50_000;
const ADJUSTMENT_DIFF_DEPENDENT = 50_000;
const ADJUSTMENT_DIFF_SPOUSE = 50_000;

function calcAdjustmentCredit(taxableIncome, hasSpouse, dependents) {
  const diffTotal = ADJUSTMENT_DIFF_BASIC + (hasSpouse ? ADJUSTMENT_DIFF_SPOUSE : 0) + ADJUSTMENT_DIFF_DEPENDENT * dependents;
  if (taxableIncome <= 2_000_000) {
    return Math.floor(Math.min(diffTotal, Math.max(0, taxableIncome)) * 0.05);
  }
  const reduced = diffTotal - (taxableIncome - 2_000_000);
  return Math.floor(Math.max(reduced, 50_000) * 0.05);
}

/** 年収・世帯構成から「住民税所得割額」と「所得税の限界税率」を求める */
function calcTaxBase({ grossIncome, hasSpouse, dependents }) {
  const social = calcSocialInsurance(grossIncome);
  const salaryIncome = Math.max(0, grossIncome - salaryIncomeDeduction(grossIncome));
  const totalIncome = salaryIncome;

  const deductionsIncomeTax =
    social +
    basicDeductionIncomeTax(totalIncome) +
    (hasSpouse ? SPOUSE_DEDUCTION_INCOME_TAX : 0) +
    DEPENDENT_DEDUCTION_INCOME_TAX * dependents;
  const taxableIncomeTax = Math.max(0, salaryIncome - deductionsIncomeTax);
  const marginalRate = marginalIncomeTaxRate(taxableIncomeTax);

  const deductionsResidentTax =
    social +
    basicDeductionResidentTax(totalIncome) +
    (hasSpouse ? SPOUSE_DEDUCTION_RESIDENT_TAX : 0) +
    DEPENDENT_DEDUCTION_RESIDENT_TAX * dependents;
  const residentTaxable = Math.floor(Math.max(0, salaryIncome - deductionsResidentTax) / 1000) * 1000;
  const residentIncomeLevy = residentTaxable * RESIDENT_TAX_INCOME_RATE;
  const adjustment = calcAdjustmentCredit(residentTaxable, hasSpouse, dependents);
  const residentIncomeLevyAfterAdjustment = Math.floor(Math.max(0, residentIncomeLevy - adjustment));

  return { residentIncomeLevyAfterAdjustment, marginalRate, salaryIncome };
}

/** ふるさと納税の実質2,000円で収まる寄付額の上限（概算式） */
function donationLimit({ grossIncome, hasSpouse, dependents }) {
  const { residentIncomeLevyAfterAdjustment, marginalRate } = calcTaxBase({ grossIncome, hasSpouse, dependents });
  const denom = 0.9 - marginalRate * (1 + RECONSTRUCTION_SURTAX_RATE);
  const limit = (residentIncomeLevyAfterAdjustment * 0.2) / denom + 2000;
  return { limit: Math.floor(limit / 1000) * 1000, marginalRate, residentIncomeLevyAfterAdjustment };
}

// ---------------------------------------------------------------------------
// 年収×世帯構成パターンで限度額を一覧化
// ---------------------------------------------------------------------------
const incomes = [4_000_000, 5_000_000, 6_000_000, 7_000_000, 8_000_000, 10_000_000];
const households = [
  { label: '独身/共働き（配偶者控除なし・扶養なし）', hasSpouse: false, dependents: 0 },
  { label: '夫婦（配偶者控除あり・扶養なし）', hasSpouse: true, dependents: 0 },
  { label: '夫婦+子1人（配偶者控除あり・扶養1人）', hasSpouse: true, dependents: 1 },
];

console.log('=== ふるさと納税 寄付限度額（実質2,000円で収まる上限の概算） ===');
console.log('年収 | ' + households.map((h) => h.label).join(' | '));
for (const income of incomes) {
  const cells = households.map((h) => {
    const { limit, marginalRate } = donationLimit({ grossIncome: income, ...h });
    return `${limit.toLocaleString()}円(所得税率${(marginalRate * 100).toFixed(0)}%)`;
  });
  console.log(`${(income / 10000).toLocaleString()}万円 | ${cells.join(' | ')}`);
}

// ---------------------------------------------------------------------------
// 「実質お得」の期待値：返礼割合は総務省告示で寄付額の30%以下と定められている。
// 上限（30%）で試算した場合の期待利益 = 返礼品評価額(0.3×寄付額) − 自己負担2,000円
// ---------------------------------------------------------------------------
console.log('\n=== 返礼割合30%（総務省上限）で試算した場合の実質利益 ===');
const giftRatio = 0.3;
for (const income of incomes) {
  const { limit } = donationLimit({ grossIncome: income, hasSpouse: false, dependents: 0 });
  const giftValue = Math.floor(limit * giftRatio);
  const netGain = giftValue - 2000;
  console.log(
    `年収${(income / 10000).toLocaleString()}万円（独身）: 限度額${limit.toLocaleString()}円 → 返礼品評価額${giftValue.toLocaleString()}円 − 自己負担2,000円 = 実質利益${netGain.toLocaleString()}円`,
  );
}

// ---------------------------------------------------------------------------
// 限度額を1万円超えるとどうなるか（自己負担が2,000円だけで済まなくなる例）
// ---------------------------------------------------------------------------
console.log('\n=== 限度額オーバーの影響（年収500万円・独身の例） ===');
const example = donationLimit({ grossIncome: 5_000_000, hasSpouse: false, dependents: 0 });
console.log(`限度額: ${example.limit.toLocaleString()}円（所得税率${(example.marginalRate * 100).toFixed(0)}%）`);
const overAmount = 20_000;
const donated = example.limit + overAmount;
// 限度額超過分は、特例控除の対象外になり「（寄付額-2000円)×10%」の住民税基本控除＋所得税控除のみが効く
// （ここでは簡略化のため所得税控除分のみ加味し、超過分の自己負担がどれだけ増えるかを示す）
const excessSelfBurden = overAmount * (1 - example.marginalRate * (1 + RECONSTRUCTION_SURTAX_RATE));
console.log(
  `限度額を${overAmount.toLocaleString()}円超えて${donated.toLocaleString()}円寄付した場合、超過分のうち自己負担が増える金額の概算: 約${Math.floor(excessSelfBurden).toLocaleString()}円`,
);
