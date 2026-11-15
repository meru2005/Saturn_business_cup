/* Tax engine tests with hand-checked worked examples (tax year 2026). Run: npm test */
import assert from "node:assert/strict";
import { normalizePaystub } from "../lib/paystub";
import { SAMPLES } from "../lib/samples";
import { analyzePaycheck, bracketTax, guardCheck, qualifiedOvertimeFromPay, type PaycheckInput } from "../lib/tax";

const near = (a: number, b: number, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

// 1) Bracket math. Single, $50,000 taxable: 10% of 12,400 + 12% of 37,600 = 1,240 + 4,512 = 5,752
near(bracketTax(50_000, "single").tax, 5_752);
// Joint, $120,000 taxable: 2,480 + 12% × 76,000 (9,120) + 22% × 19,200 (4,224) = 15,824
near(bracketTax(120_000, "mfj").tax, 15_824);

// 2) Only the premium counts: $15,000 of time-and-a-half OT -> $5,000 deductible; double time $20,000 -> $5,000
near(qualifiedOvertimeFromPay(15_000, 1.5), 5_000);
near(qualifiedOvertimeFromPay(20_000, 2), 5_000);

// 3) Maria (sample): biweekly, taxable $3,154, OT $684, withholding $395
const toInput = (d: (typeof SAMPLES)["maria"]["data"], extra: Partial<PaycheckInput> = {}): PaycheckInput => ({
  filingStatus: "single",
  payFrequency: d.payFrequency,
  children: 0,
  otherDependents: 0,
  taxableWagesPerPeriod: d.federalTaxableWages,
  overtimePayPerPeriod: d.overtimePay,
  overtimeMultiplier: d.overtimeMultiplier,
  tipsPerPeriod: d.tips,
  federalWithheldPerPeriod: d.federalWithheld,
  ...extra,
});
const maria = analyzePaycheck(toInput(SAMPLES.maria.data));
// AGI 82,004; OT pay 17,784 -> qualified 5,928; taxable 82,004 - 16,100 - 5,928 = 59,976
near(maria.withNewDeductions.taxableIncome, 59_976);
// tax = 1,240 + 4,560 + 22% × 9,576 (2,106.72) = 7,906.72
near(maria.withNewDeductions.liability, 7_906.72);
// without deduction: taxable 65,904 -> 5,800 + 22% × 15,504 = 9,210.88
near(maria.withoutNewDeductions.liability, 9_210.88);
near(maria.newDeductionSavings, 1_304.16);
// withholding 395 × 26 = 10,270 -> overpay 2,363 -> raise (minus $300 buffer) 2,063/yr -> $79/paycheck
near(maria.overpayment, 2_363.28);
assert.equal(maria.raisePerYear, 2_063);
assert.equal(maria.raisePerPaycheck, 79);
assert.equal(maria.w4.step4b, 5_928);
assert.equal(maria.status, "overpaying");

// 4) James (sample): tips $1,600 × 26 = 41,600 -> capped at 25,000
const james = analyzePaycheck(toInput(SAMPLES.james.data));
assert.equal(james.w4.step4b, 25_000);
// AGI 45,476.60 - 16,100 - 25,000 = 4,376.60 taxable -> 437.66 tax
near(james.withNewDeductions.liability, 437.66);
assert.ok(james.raisePerPaycheck > 100);

// 5) Children: Maria with 2 kids -> $4,400 credit, Step 3 = 4,400
const mariaKids = analyzePaycheck(toInput(SAMPLES.maria.data, { children: 2 }));
assert.equal(mariaKids.w4.step3, 4_400);
near(mariaKids.withNewDeductions.liability, 7_906.72 - 4_400);

// 6) Phase-out: single, $180,000 AGI, $15,000 qualified OT -> cap 12,500 - 3,000 = 9,500 (example from Clockspot)
const high = analyzePaycheck({
  filingStatus: "single", payFrequency: "monthly", children: 0, otherDependents: 0,
  taxableWagesPerPeriod: 15_000, overtimePayPerPeriod: 3_750, overtimeMultiplier: 1.5, tipsPerPeriod: 0, federalWithheldPerPeriod: 3_000,
});
assert.equal(high.withNewDeductions.overtimeDeduction, 9_500);

// 7) Paycheck Guard: Maria's next stub (no OT, new W-4 applied) -> heading to owe
const g = guardCheck(toInput(SAMPLES.maria.data), toInput(SAMPLES["maria-next"].data));
assert.equal(g.level, "act");
assert.ok(g.analysis.owesInApril > 400 && g.analysis.owesInApril < 900, `owes ${g.analysis.owesInApril}`);
assert.ok(g.analysis.w4.step4cAmount && g.analysis.w4.step4cAmount > 0);

// 8) Normalizer fills gaps: taxable wages from gross - pre-tax, OT pay from hours × rate, double time detection
const n = normalizePaystub({ grossPay: "2,000", preTaxDeductions: 100, overtimeHours: 5, overtimeRate: 40, regularRate: 20, federalWithheld: 150 });
assert.ok(n);
assert.equal(n!.federalTaxableWages, 1_900);
assert.equal(n!.overtimePay, 200);
assert.equal(n!.overtimeMultiplier, 2);
assert.equal(normalizePaystub({ grossPay: 0 }), null);

console.log(`Maria: +$${maria.raisePerPaycheck}/paycheck ($${maria.raisePerYear}/yr), Step 4(b) $${maria.w4.step4b}`);
console.log(`James: +$${james.raisePerPaycheck}/paycheck ($${james.raisePerYear}/yr), Step 4(b) $${james.w4.step4b}`);
console.log(`Guard: ${g.headline} → ${g.analysis.w4.step4cAdvice}`);
console.log("\nAll tax engine tests passed.");
