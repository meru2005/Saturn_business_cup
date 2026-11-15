import type { PaystubData } from "./paystub";
import type { PaycheckInput } from "./tax";

export interface HouseholdLike {
  filingStatus: PaycheckInput["filingStatus"];
  children: number;
  otherDependents: number;
  spouseAnnualWages?: number;
  spouseAnnualWithholding?: number;
}

/** Turn a paystub + household answers into tax engine input. */
export function toPaycheckInput(p: PaystubData, h: HouseholdLike): PaycheckInput {
  return {
    filingStatus: h.filingStatus,
    payFrequency: p.payFrequency,
    children: h.children,
    otherDependents: h.otherDependents,
    taxableWagesPerPeriod: p.federalTaxableWages,
    overtimePayPerPeriod: p.overtimePay,
    overtimeMultiplier: p.overtimeMultiplier,
    tipsPerPeriod: p.tips,
    federalWithheldPerPeriod: p.federalWithheld,
    spouseAnnualWages: h.spouseAnnualWages,
    spouseAnnualWithholding: h.spouseAnnualWithholding,
  };
}
