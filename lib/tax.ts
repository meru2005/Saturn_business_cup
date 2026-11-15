/**
 * Saturn tax engine — deterministic federal income tax math for W-2 employees, tax year 2026.
 *
 * Sources (IRS / Rev. Proc. 2025-32 as reported, OBBBA §§ 224-225):
 *  - 2026 brackets: single 10% ≤ $12,400 · 12% ≤ $50,400 · 22% ≤ $105,700 · 24% ≤ $201,775 · 32% ≤ $256,225 · 35% ≤ $640,600 · 37% above
 *                   joint  10% ≤ $24,800 · 12% ≤ $100,800 · 22% ≤ $211,400 · 24% ≤ $403,550 · 32% ≤ $512,450 · 35% ≤ $768,700 · 37% above
 *  - 2026 standard deduction: $16,100 single, $32,200 married filing jointly
 *  - Child tax credit: $2,200 per qualifying child; $500 per other dependent (phase-out $200k / $400k)
 *  - Qualified overtime deduction: only the FLSA premium ("half" of time-and-a-half = 1/3 of OT pay; 1/4 of double-time pay),
 *    capped at $12,500 ($25,000 joint), reduced $100 per $1,000 of MAGI over $150,000 ($300,000 joint)
 *  - Qualified tips deduction: up to $25,000, same phase-out
 * Scope: federal income tax only (no state tax, FICA, self-employment, itemizing, or refundable-credit refunds).
 */

export type FilingStatus = "single" | "mfj";
export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

export const PERIODS: Record<PayFrequency, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

export const TAX_YEAR = 2026;

const BRACKETS: Record<FilingStatus, [number, number][]> = {
  single: [
    [12_400, 0.1],
    [50_400, 0.12],
    [105_700, 0.22],
    [201_775, 0.24],
    [256_225, 0.32],
    [640_600, 0.35],
    [Infinity, 0.37],
  ],
  mfj: [
    [24_800, 0.1],
    [100_800, 0.12],
    [211_400, 0.22],
    [403_550, 0.24],
    [512_450, 0.32],
    [768_700, 0.35],
    [Infinity, 0.37],
  ],
};

export const STANDARD_DEDUCTION: Record<FilingStatus, number> = { single: 16_100, mfj: 32_200 };
const CTC_PER_CHILD = 2_200;
const CREDIT_OTHER_DEPENDENT = 500;
const CTC_PHASEOUT: Record<FilingStatus, number> = { single: 200_000, mfj: 400_000 };
const OT_CAP: Record<FilingStatus, number> = { single: 12_500, mfj: 25_000 };
const TIPS_CAP = 25_000;
const OBBBA_PHASEOUT: Record<FilingStatus, number> = { single: 150_000, mfj: 300_000 };

/** Target refund we aim for instead of $0, so a small change in hours doesn't create a bill in April. */
export const SAFETY_BUFFER = 300;

export interface PaycheckInput {
  filingStatus: FilingStatus;
  payFrequency: PayFrequency;
  children: number; // under 17
  otherDependents: number;
  /** Federal taxable wages for ONE pay period (gross minus pre-tax 401k/health/HSA). Includes overtime and reported tips. */
  taxableWagesPerPeriod: number;
  /** Total overtime pay for ONE period (the full time-and-a-half amount as shown on the paystub). */
  overtimePayPerPeriod: number;
  /** 1.5 for time-and-a-half, 2 for double time. */
  overtimeMultiplier: 1.5 | 2;
  /** Tips reported through payroll for ONE period (customarily tipped occupations). */
  tipsPerPeriod: number;
  /** Federal income tax withheld for ONE period. */
  federalWithheldPerPeriod: number;
  /** Optional: spouse's annual wages and federal withholding (married filing jointly). */
  spouseAnnualWages?: number;
  spouseAnnualWithholding?: number;
}

export interface TaxBreakdown {
  agi: number;
  standardDeduction: number;
  overtimeDeduction: number;
  tipsDeduction: number;
  taxableIncome: number;
  taxBeforeCredits: number;
  credits: number;
  liability: number;
  marginalRate: number;
}

export interface W4Plan {
  step1c: string;
  step2: string | null;
  step3: number; // dependents amount
  step4a: number;
  step4b: number; // deductions beyond the standard deduction
  step4cAdvice: string;
  step4cAmount: number | null; // only set when the user must ADD withholding
}

export interface Analysis {
  periods: number;
  annualWages: number;
  annualOvertimePay: number;
  annualTips: number;
  qualifiedOvertime: number; // before cap/phase-out
  withNewDeductions: TaxBreakdown;
  withoutNewDeductions: TaxBreakdown;
  newDeductionSavings: number; // tax saved by the OT/tips deductions
  annualWithholding: number;
  overpayment: number; // withholding - liability (negative = heading to owe)
  raisePerYear: number; // overpayment minus safety buffer (>= 0)
  raisePerPaycheck: number;
  owesInApril: number; // > 0 when under-withheld
  status: "overpaying" | "on_track" | "under_withheld";
  w4: W4Plan;
  warnings: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function bracketTax(taxable: number, status: FilingStatus): { tax: number; marginal: number } {
  let tax = 0;
  let lower = 0;
  let marginal = 0.1;
  for (const [upper, rate] of BRACKETS[status]) {
    if (taxable <= lower) break;
    const slice = Math.min(taxable, upper) - lower;
    tax += slice * rate;
    marginal = rate;
    lower = upper;
  }
  return { tax: r2(tax), marginal };
}

function phaseOut(max: number, magi: number, threshold: number): number {
  if (magi <= threshold) return max;
  const reduction = Math.ceil((magi - threshold) / 1000) * 100;
  return Math.max(0, max - reduction);
}

/** Only the premium portion of FLSA overtime counts: 1/3 of time-and-a-half pay, 1/4 of double-time pay. */
export function qualifiedOvertimeFromPay(overtimePay: number, multiplier: 1.5 | 2): number {
  return r2(multiplier === 2 ? overtimePay / 4 : overtimePay / 3);
}

export function computeLiability(opts: {
  status: FilingStatus;
  agi: number;
  qualifiedOvertime: number;
  tips: number;
  children: number;
  otherDependents: number;
  applyNewDeductions: boolean;
}): TaxBreakdown {
  const { status, agi } = opts;
  const otDeduction = opts.applyNewDeductions
    ? phaseOut(Math.min(opts.qualifiedOvertime, OT_CAP[status]), agi, OBBBA_PHASEOUT[status])
    : 0;
  const tipsDeduction = opts.applyNewDeductions
    ? phaseOut(Math.min(opts.tips, TIPS_CAP), agi, OBBBA_PHASEOUT[status])
    : 0;
  const std = STANDARD_DEDUCTION[status];
  const taxableIncome = Math.max(0, agi - std - otDeduction - tipsDeduction);
  const { tax, marginal } = bracketTax(taxableIncome, status);
  const rawCredits = opts.children * CTC_PER_CHILD + opts.otherDependents * CREDIT_OTHER_DEPENDENT;
  const credits = Math.max(0, rawCredits - Math.ceil(Math.max(0, agi - CTC_PHASEOUT[status]) / 1000) * 50);
  // Credits treated as non-refundable here (conservative for withholding: never promises a refundable payout).
  const liability = Math.max(0, r2(tax - credits));
  return {
    agi: r2(agi),
    standardDeduction: std,
    overtimeDeduction: r2(otDeduction),
    tipsDeduction: r2(tipsDeduction),
    taxableIncome: r2(taxableIncome),
    taxBeforeCredits: tax,
    credits: Math.min(credits, tax),
    liability,
    marginalRate: marginal,
  };
}

export function validateInput(i: PaycheckInput): string[] {
  const errs: string[] = [];
  if (!(i.taxableWagesPerPeriod > 0)) errs.push("Enter your taxable wages for one pay period.");
  if (i.overtimePayPerPeriod < 0 || i.tipsPerPeriod < 0 || i.federalWithheldPerPeriod < 0) errs.push("Amounts can't be negative.");
  if (i.overtimePayPerPeriod + i.tipsPerPeriod > i.taxableWagesPerPeriod * 1.5)
    errs.push("Overtime + tips look larger than your taxable wages. Please check the numbers.");
  if (i.children < 0 || i.otherDependents < 0) errs.push("Dependents can't be negative.");
  if (i.taxableWagesPerPeriod > 100_000) errs.push("That pay amount looks too high for one pay period.");
  return errs;
}

/** The full analysis: what you owe, what you're withholding, and the W-4 numbers to fix it. */
export function analyzePaycheck(i: PaycheckInput): Analysis {
  const periods = PERIODS[i.payFrequency];
  const annualWages = r2(i.taxableWagesPerPeriod * periods);
  const annualOvertimePay = r2(i.overtimePayPerPeriod * periods);
  const annualTips = r2(i.tipsPerPeriod * periods);
  const spouseWages = i.filingStatus === "mfj" ? i.spouseAnnualWages ?? 0 : 0;
  const spouseWithholding = i.filingStatus === "mfj" ? i.spouseAnnualWithholding ?? 0 : 0;
  const agi = annualWages + spouseWages;
  const qualifiedOvertime = qualifiedOvertimeFromPay(annualOvertimePay, i.overtimeMultiplier);

  const base = {
    status: i.filingStatus,
    agi,
    qualifiedOvertime,
    tips: annualTips,
    children: i.children,
    otherDependents: i.otherDependents,
  };
  const withNew = computeLiability({ ...base, applyNewDeductions: true });
  const withoutNew = computeLiability({ ...base, applyNewDeductions: false });

  const annualWithholding = r2(i.federalWithheldPerPeriod * periods + spouseWithholding);
  const overpayment = r2(annualWithholding - withNew.liability);
  const raisePerYear = Math.max(0, Math.round(overpayment - SAFETY_BUFFER));
  const raisePerPaycheck = Math.floor(raisePerYear / periods);
  const owesInApril = overpayment < 0 ? Math.round(-overpayment) : 0;
  const status: Analysis["status"] =
    overpayment < 0 ? "under_withheld" : raisePerPaycheck >= 10 ? "overpaying" : "on_track";

  const step3 = i.children * CTC_PER_CHILD + i.otherDependents * CREDIT_OTHER_DEPENDENT;
  const step4b = Math.round(withNew.overtimeDeduction + withNew.tipsDeduction);
  // Approximate effect of the Step 4(b) entry on withholding (employer formula ≈ deduction × marginal rate).
  const remaining = overpayment - SAFETY_BUFFER - step4b * withNew.marginalRate;
  let step4cAdvice = "Leave Step 4(c) blank.";
  let step4cAmount: number | null = null;
  if (status === "under_withheld") {
    step4cAmount = Math.ceil((owesInApril + SAFETY_BUFFER) / periods);
    step4cAdvice = `Enter $${step4cAmount} in Step 4(c) so about $${step4cAmount} extra is withheld each paycheck. Otherwise you're heading to owe about $${owesInApril} in April.`;
  } else if (remaining > periods * 10) {
    step4cAdvice = `Even after Step 4(b) you'd still over-withhold about $${Math.floor(remaining / periods)} per paycheck. Make sure Step 3 includes your dependents and remove any extra amount you entered in Step 4(c) before.`;
  }

  const warnings: string[] = [];
  if (i.filingStatus === "mfj" && spouseWages > 0)
    warnings.push("Both spouses work: fill in Steps 3 and 4(b) on only ONE W-4 (the higher-paying job), and check Step 2 on both if your pay is similar.");
  if (withNew.agi > OBBBA_PHASEOUT[i.filingStatus])
    warnings.push("Your income is above the phase-out threshold, so the overtime/tips deduction is reduced.");
  if (annualTips > 0)
    warnings.push("The tips deduction only applies to occupations the IRS lists as customarily tipped (servers, bartenders, hair stylists and similar).");
  if (annualOvertimePay > 0)
    warnings.push("Only FLSA-required overtime counts (hours over 40/week for non-exempt employees). From 2026 your employer reports it on your W-2 (box 12, code TT).");

  return {
    periods,
    annualWages,
    annualOvertimePay,
    annualTips,
    qualifiedOvertime,
    withNewDeductions: withNew,
    withoutNewDeductions: withoutNew,
    newDeductionSavings: r2(withoutNew.liability - withNew.liability),
    annualWithholding,
    overpayment,
    raisePerYear,
    raisePerPaycheck,
    owesInApril,
    status,
    w4: {
      step1c: i.filingStatus === "mfj" ? "Married filing jointly" : "Single or married filing separately",
      step2: i.filingStatus === "mfj" && spouseWages > 0 ? "Check the box if you and your spouse earn similar amounts" : null,
      step3,
      step4a: 0,
      step4b,
      step4cAdvice,
      step4cAmount,
    },
    warnings,
  };
}

/** Paycheck Guard: compare a new paystub against the plan and project the year. */
export function guardCheck(planInput: PaycheckInput, newInput: PaycheckInput) {
  const a = analyzePaycheck(newInput);
  const plan = analyzePaycheck(planInput);
  const hoursChanged = Math.abs(newInput.overtimePayPerPeriod - planInput.overtimePayPerPeriod) > 50;
  let headline: string;
  let level: "good" | "watch" | "act";
  if (a.status === "under_withheld") {
    level = "act";
    headline = `Heads up: at this pace you'd owe about $${a.owesInApril} in April.`;
  } else if (a.raisePerPaycheck >= 10) {
    level = "watch";
    headline = `You're still overpaying about $${a.raisePerPaycheck} per paycheck.`;
  } else {
    level = "good";
    headline = `On track: you're heading for a small refund of about $${Math.max(0, Math.round(a.overpayment))}.`;
  }
  return { analysis: a, plan, level, headline, hoursChanged };
}
