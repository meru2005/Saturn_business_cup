"use client";
import type { PaystubData } from "./paystub";
import type { FilingStatus } from "./tax";

export interface Household {
  filingStatus: FilingStatus;
  children: number;
  otherDependents: number;
  spouseAnnualWages: number;
  spouseAnnualWithholding: number;
  name: string;
}

export interface SavedCheck {
  paystub: PaystubData;
  household: Household;
  source: "ai" | "sample-values" | "manual";
  sample?: string;
  savedAt: string;
}

const CHECK = "raise_check_v1";
const UNLOCK = "raise_unlocked_v1";
const GUARD = "raise_guard_v1";
const QUIZ = "raise_quiz_v1";

const get = <T,>(k: string): T | null => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};
const set = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
};

export const saveCheck = (c: SavedCheck) => set(CHECK, c);
export const loadCheck = () => get<SavedCheck>(CHECK);
/** Saturn Plus ($9.99/mo or $79/yr) unlocks everything. Kept in this browser only, no account. */
export type Plan = "monthly" | "annual";
export const setPlus = (plan: Plan) => set(UNLOCK, { plus: true, plan, since: new Date().toISOString() });
export const isPlus = () => Boolean(get<{ plus?: boolean }>(UNLOCK)?.plus);
export const saveGuard = (g: { paystub: PaystubData; checkedAt: string }[]) => set(GUARD, g);
export const loadGuard = () => get<{ paystub: PaystubData; checkedAt: string }[]>(GUARD) || [];
export const saveQuiz = (q: Record<string, string>) => set(QUIZ, q);
export const loadQuiz = () => get<Record<string, string>>(QUIZ);

export const usd = (n: number, cents = false) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

/** Render page 1 of a PDF paystub to a JPEG in the browser (pdf.js), so it goes through the same reader as photos. */
async function pdfToDataUrl(file: File, maxSide = 1800): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, maxSide / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Downscale a photo in the browser before upload (keeps requests small and strips EXIF). PDFs are rendered first. */
export async function fileToDataUrl(file: File, maxSide = 1700): Promise<string> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    try {
      return await pdfToDataUrl(file);
    } catch {
      throw new Error("Could not open this PDF. Try a screenshot or photo of the paystub instead.");
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not open this image. Use a JPG or PNG photo."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function urlToDataUrl(src: string): Promise<string> {
  const blob = await (await fetch(src)).blob();
  return fileToDataUrl(new File([blob], "sample.png", { type: blob.type }));
}

/** Remove everything Saturn saved in this browser. */
export function clearAllData() {
  try {
    [CHECK, UNLOCK, GUARD, QUIZ].forEach((k) => localStorage.removeItem(k));
  } catch {
    /* nothing to clear */
  }
}
