"use client";
import type { Analysis } from "./tax";
import type { Household } from "./store";

/**
 * Fill the official IRS 2026 Form W-4 (public/forms/fw4-2026.pdf, unmodified from irs.gov) in the browser.
 * Nothing leaves the device. We fill only what Saturn computed: name (if given), filing status,
 * Step 2(c), Step 3, Step 4(b) and its worksheet (page 4), Step 4(c).
 * SSN, address, signature and the employer section are left blank on purpose: the worker writes them by hand.
 */
const P1 = "topmostSubform[0].Page1[0].";
const P4 = "topmostSubform[0].Page4[0].";
export const W4_FIELDS = {
  firstName: P1 + "Step1a[0].f1_01[0]",
  lastName: P1 + "Step1a[0].f1_02[0]",
  single: P1 + "c1_1[0]",
  mfj: P1 + "c1_1[1]",
  step2c: P1 + "c1_2[0]",
  step3a: P1 + "Step3_ReadOrder[0].f1_06[0]",
  step3b: P1 + "Step3_ReadOrder[0].f1_07[0]",
  step3: P1 + "f1_08[0]",
  step4b: P1 + "f1_10[0]",
  step4c: P1 + "f1_11[0]",
  ws1a: P4 + "f4_01[0]", // qualified tips
  ws1b: P4 + "f4_02[0]", // qualified overtime
  ws2: P4 + "f4_04[0]", // 1a + 1b + 1c
  ws15: P4 + "f4_23[0]", // total → Step 4(b)
} as const;

const money = (n: number) => Math.round(n).toLocaleString("en-US");

export interface W4Values {
  firstName: string;
  lastName: string;
  filingStatus: "single" | "mfj";
  step2c: boolean;
  step3a: number;
  step3b: number;
  tips: number;
  overtime: number;
  step4b: number;
  step4c: number | null;
}

export function w4Values(a: Analysis, household: Household, children: number, otherDependents: number): W4Values {
  const parts = household.name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] || "",
    lastName: parts.length > 1 ? parts[parts.length - 1] : "",
    filingStatus: household.filingStatus,
    step2c: Boolean(a.w4.step2),
    step3a: a.w4.step3 > 0 ? children * 2200 : 0,
    step3b: a.w4.step3 > 0 ? otherDependents * 500 : 0,
    tips: Math.min(a.w4.step4b, Math.round(a.withNewDeductions.tipsDeduction)),
    overtime: a.w4.step4b - Math.min(a.w4.step4b, Math.round(a.withNewDeductions.tipsDeduction)),
    step4b: a.w4.step4b,
    step4c: a.w4.step4cAmount,
  };
}

export async function buildW4Pdf(v: W4Values): Promise<Uint8Array> {
  const { PDFDocument, PDFName } = await import("pdf-lib");
  const bytes = await (await fetch("/forms/fw4-2026.pdf")).arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  // The IRS file is a hybrid XFA form; drop XFA so every PDF viewer shows the AcroForm values we set.
  form.deleteXFA();
  const text = (name: string, value: string) => value && form.getTextField(name).setText(value);
  // Tick a box using the form's own IRS check appearance (pdf-lib's regenerated one renders blank in some viewers).
  const tick = (name: string) => {
    const field = form.getCheckBox(name).acroField;
    const on = field.getWidgets()[0].getOnValue();
    if (!on) return;
    field.dict.set(PDFName.of("V"), on);
    field.getWidgets().forEach((w) => w.setAppearanceState(on));
  };

  text(W4_FIELDS.firstName, v.firstName);
  text(W4_FIELDS.lastName, v.lastName);
  tick(v.filingStatus === "mfj" ? W4_FIELDS.mfj : W4_FIELDS.single);
  if (v.step2c) tick(W4_FIELDS.step2c);
  if (v.step3a + v.step3b > 0) {
    if (v.step3a) text(W4_FIELDS.step3a, money(v.step3a));
    if (v.step3b) text(W4_FIELDS.step3b, money(v.step3b));
    text(W4_FIELDS.step3, money(v.step3a + v.step3b));
  }
  if (v.step4b > 0) {
    text(W4_FIELDS.step4b, money(v.step4b));
    if (v.tips) text(W4_FIELDS.ws1a, money(v.tips));
    if (v.overtime) text(W4_FIELDS.ws1b, money(v.overtime));
    text(W4_FIELDS.ws2, money(v.tips + v.overtime));
    text(W4_FIELDS.ws15, money(v.step4b));
  }
  if (v.step4c) text(W4_FIELDS.step4c, money(v.step4c));

  doc.setTitle("2026 Form W-4, pre-filled by Saturn");
  return doc.save({ updateFieldAppearances: true });
}

export async function downloadW4(v: W4Values) {
  const bytes = await buildW4Pdf(v);
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "W-4-2026-prefilled.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
