import type { PayFrequency } from "./tax";

/** What we read from a paystub (one pay period, plus year-to-date when shown). */
export interface PaystubData {
  employer?: string;
  employeeName?: string;
  payDate?: string;
  payFrequency: PayFrequency;
  grossPay: number;
  regularPay?: number;
  regularHours?: number;
  regularRate?: number;
  overtimeHours?: number;
  overtimeRate?: number;
  overtimePay: number;
  overtimeMultiplier: 1.5 | 2;
  tips: number;
  preTaxDeductions: number; // 401(k), health, HSA, FSA (reduce federal taxable wages)
  federalTaxableWages: number;
  federalWithheld: number;
  grossYTD?: number;
  federalWithheldYTD?: number;
  confidence?: "high" | "medium" | "low";
  notes?: string;
}

const FREQS: PayFrequency[] = ["weekly", "biweekly", "semimonthly", "monthly"];
const num = (v: unknown): number | undefined => {
  if (typeof v === "number" && isFinite(v)) return Math.round(v * 100) / 100;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[$,\s]/g, ""));
    return isFinite(n) ? Math.round(n * 100) / 100 : undefined;
  }
  return undefined;
};

/** Validate and fill gaps in AI output so the tax engine always gets consistent numbers. */
export function normalizePaystub(raw: Record<string, unknown>): PaystubData | null {
  const gross = num(raw.grossPay);
  if (!gross || gross <= 0) return null;
  const freq = FREQS.includes(raw.payFrequency as PayFrequency) ? (raw.payFrequency as PayFrequency) : "biweekly";
  const otHours = num(raw.overtimeHours);
  const otRate = num(raw.overtimeRate);
  let otPay = num(raw.overtimePay) ?? (otHours && otRate ? Math.round(otHours * otRate * 100) / 100 : 0);
  if (otPay < 0) otPay = 0;
  const regRate = num(raw.regularRate);
  const mult: 1.5 | 2 = otRate && regRate && otRate / regRate > 1.75 ? 2 : 1.5;
  const tips = Math.max(0, num(raw.tips) ?? 0);
  const preTax = Math.max(0, num(raw.preTaxDeductions) ?? 0);
  let taxable = num(raw.federalTaxableWages);
  if (!taxable || taxable <= 0 || taxable > gross) taxable = Math.max(0, Math.round((gross - preTax) * 100) / 100);
  const fed = Math.max(0, num(raw.federalWithheld) ?? 0);
  return {
    employer: typeof raw.employer === "string" ? raw.employer.slice(0, 80) : undefined,
    employeeName: typeof raw.employeeName === "string" ? raw.employeeName.slice(0, 60) : undefined,
    payDate: typeof raw.payDate === "string" ? raw.payDate.slice(0, 20) : undefined,
    payFrequency: freq,
    grossPay: gross,
    regularPay: num(raw.regularPay),
    regularHours: num(raw.regularHours),
    regularRate: regRate,
    overtimeHours: otHours,
    overtimeRate: otRate,
    overtimePay: otPay,
    overtimeMultiplier: mult,
    tips,
    preTaxDeductions: preTax,
    federalTaxableWages: taxable,
    federalWithheld: fed,
    grossYTD: num(raw.grossYTD),
    federalWithheldYTD: num(raw.federalWithheldYTD),
    confidence: ["high", "medium", "low"].includes(raw.confidence as string) ? (raw.confidence as PaystubData["confidence"]) : "medium",
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 300) : undefined,
  };
}

export const EXTRACTION_PROMPT = `You read US paystubs. Extract the CURRENT pay period values (not year-to-date unless the field says YTD).
Return JSON only with these keys (numbers without $ or commas; omit a key if not shown):
{
 "employer": string, "employeeName": string, "payDate": "YYYY-MM-DD",
 "payFrequency": "weekly" | "biweekly" | "semimonthly" | "monthly" (infer from the pay period dates if not printed),
 "grossPay": number, "regularPay": number, "regularHours": number, "regularRate": number,
 "overtimeHours": number, "overtimeRate": number, "overtimePay": number,
 "tips": number (all tips reported through payroll this period: charged/credit card tips + reported cash tips),
 "preTaxDeductions": number (sum of pre-tax 401(k)/403(b), health/dental/vision insurance, HSA, FSA this period),
 "federalTaxableWages": number (if printed), "federalWithheld": number (Federal income tax / FIT / Fed Withholding this period; NOT Social Security or Medicare),
 "grossYTD": number, "federalWithheldYTD": number,
 "confidence": "high" | "medium" | "low", "notes": string (anything unclear, max 1 sentence)
}
Privacy: NEVER output Social Security numbers, bank account or routing numbers, addresses or employee IDs, even if visible. Some areas may be blacked out on purpose; ignore them.
If the image is not a paystub, return {"error": "not_a_paystub"}.`;
