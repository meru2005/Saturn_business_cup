"use client";

import { useRef, useState } from "react";
import type { PaystubData } from "@/lib/paystub";
import { SAMPLES } from "@/lib/samples";
import { fileToDataUrl, urlToDataUrl } from "@/lib/store";
import { Redactor } from "./Redactor";

const BLANK: PaystubData = {
  payFrequency: "biweekly",
  grossPay: 0,
  overtimePay: 0,
  overtimeMultiplier: 1.5,
  tips: 0,
  preTaxDeductions: 0,
  federalTaxableWages: 0,
  federalWithheld: 0,
};

/** Step 1: get a paystub (photo → AI, sample, or manual). Calls onRead with the numbers to confirm. */
export function PaystubPicker({
  onRead,
  sampleIds,
}: {
  onRead: (d: PaystubData, source: "ai" | "sample-values" | "manual", sample?: string, notice?: string) => void;
  sampleIds: string[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function read(image: string, sample?: string) {
    setError(null);
    const res = await fetch("/api/paystub", { method: "POST", body: JSON.stringify({ image, sample }) });
    const data = await res.json();
    if (!res.ok && (data.code === "ai_off" || data.code === "unreadable")) {
      // Never dead-end: fall back to the 1-minute manual form.
      onRead({ ...BLANK }, "manual", undefined, data.error);
      return;
    }
    if (!res.ok) throw new Error(data.error || "Could not read the paystub");
    onRead(data.data, data.source, sample);
  }

  async function onFile(f: File) {
    setError(null);
    setBusy(f.type === "application/pdf" || /\.pdf$/i.test(f.name) ? "Opening your PDF…" : "Opening your photo…");
    try {
      setPreview(await fileToDataUrl(f)); // show the "hide private info" step first
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onRedacted(img: string) {
    setPreview(null);
    setBusy("Reading your paystub with AI…");
    try {
      await read(img);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onSample(id: string) {
    setBusy("Reading the sample paystub with AI…");
    try {
      await read(await urlToDataUrl(SAMPLES[id].image), id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (busy)
    return (
      <div className="loading card">
        <div className="spinner" />
        <h3>{busy}</h3>
        <p className="hint">Finding gross pay, overtime, tips and federal tax withheld. About 5–10 seconds.</p>
      </div>
    );

  if (preview) return <Redactor src={preview} onDone={onRedacted} onCancel={() => setPreview(null)} />;

  return (
    <div>
      <div className="upload" onClick={() => fileRef.current?.click()}>
        <h3 style={{ marginBottom: 6 }}>Upload your paystub (earnings statement)</h3>
        <p className="hint" style={{ margin: 0 }}>PDF, JPG or PNG, or a screenshot from your payroll app. Next you can black out your SSN or anything private. Never stored.</p>
        <button className="btn btn-primary" style={{ marginTop: 14 }}>Choose file</button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      <h3 style={{ marginTop: 26 }}>No paystub handy? Try a sample</h3>
      <div className="samples">
        {sampleIds.map((id) => (
          <button key={id} className="sample" onClick={() => onSample(id)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SAMPLES[id].image} alt={`Sample paystub: ${SAMPLES[id].label}`} />
            <strong>{SAMPLES[id].label}</strong>
            <div className="hint">{SAMPLES[id].who}</div>
          </button>
        ))}
      </div>
      <p style={{ marginTop: 18 }}>
        <button className="btn btn-ghost" style={{ padding: 0 }} onClick={() => onRead({ ...BLANK }, "manual")}>
          Or type the numbers from your paystub →
        </button>
      </p>
    </div>
  );
}

/** Step 2: confirm or edit what we read. */
export function PaystubForm({ value, onChange }: { value: PaystubData; onChange: (d: PaystubData) => void }) {
  const n = (k: keyof PaystubData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value === "" ? 0 : Math.max(0, parseFloat(e.target.value) || 0) });
  return (
    <div className="form-grid">
      <div className="field">
        <label>How often are you paid?</label>
        <select value={value.payFrequency} onChange={(e) => onChange({ ...value, payFrequency: e.target.value as PaystubData["payFrequency"] })}>
          <option value="weekly">Every week</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="semimonthly">Twice a month</option>
          <option value="monthly">Monthly</option>
        </select>
        <span className="hint">We multiply by {({ weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 } as const)[value.payFrequency]} paychecks a year{value.payDate ? `. Pay date read: ${value.payDate}` : ""}</span>
      </div>
      <div className="field">
        <label>Gross pay for this one paycheck ($)</label>
        <input type="number" inputMode="decimal" value={value.grossPay || ""} onChange={(e) => {
          const g = Math.max(0, parseFloat(e.target.value) || 0);
          onChange({ ...value, grossPay: g, federalTaxableWages: Math.max(0, Math.round((g - value.preTaxDeductions) * 100) / 100) });
        }} />
        <span className="hint">Before taxes, this period only. Not the year-to-date (YTD) column</span>
      </div>
      <div className="field">
        <label>Pre-tax deductions ($)</label>
        <input type="number" inputMode="decimal" value={value.preTaxDeductions || ""} onChange={(e) => {
          const p = Math.max(0, parseFloat(e.target.value) || 0);
          onChange({ ...value, preTaxDeductions: p, federalTaxableWages: Math.max(0, Math.round((value.grossPay - p) * 100) / 100) });
        }} />
        <span className="hint">401(k)/403(b), health insurance, HSA</span>
      </div>
      <div className="field">
        <label>Federal taxable wages ($)</label>
        <input type="number" inputMode="decimal" value={value.federalTaxableWages || ""} onChange={n("federalTaxableWages")} />
        <span className="hint">Gross minus pre-tax deductions</span>
      </div>
      <div className="field">
        <label>Overtime pay this period ($)</label>
        <input type="number" inputMode="decimal" value={value.overtimePay || ""} onChange={n("overtimePay")} />
        <span className="hint">The full overtime line on your paystub</span>
      </div>
      <div className="field">
        <label>Overtime rate</label>
        <select value={value.overtimeMultiplier} onChange={(e) => onChange({ ...value, overtimeMultiplier: e.target.value === "2" ? 2 : 1.5 })}>
          <option value="1.5">Time-and-a-half (1.5×)</option>
          <option value="2">Double time (2×)</option>
        </select>
      </div>
      <div className="field">
        <label>Tips reported this period ($)</label>
        <input type="number" inputMode="decimal" value={value.tips || ""} onChange={n("tips")} />
        <span className="hint">Charged + reported cash tips</span>
      </div>
      <div className="field">
        <label>Federal income tax withheld this paycheck ($)</label>
        <input type="number" inputMode="decimal" value={value.federalWithheld || ""} onChange={n("federalWithheld")} />
        <span className="hint">&quot;Federal income tax&quot; or &quot;FIT&quot;, not Social Security/Medicare</span>
      </div>
    </div>
  );
}
