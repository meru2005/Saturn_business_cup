"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaystubForm, PaystubPicker } from "@/components/PaystubInput";
import type { PaystubData } from "@/lib/paystub";
import { saveCheck, type Household } from "@/lib/store";
import { validateInput } from "@/lib/tax";

export default function Check() {
  const router = useRouter();
  const [stub, setStub] = useState<PaystubData | null>(null);
  const [source, setSource] = useState<"ai" | "sample-values" | "manual">("manual");
  const [sample, setSample] = useState<string | undefined>();
  const [hh, setHh] = useState<Household>({
    filingStatus: "single",
    children: 0,
    otherDependents: 0,
    spouseAnnualWages: 0,
    spouseAnnualWithholding: 0,
    name: "",
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | undefined>();

  function submit() {
    if (!stub) return;
    const errs = validateInput({
      filingStatus: hh.filingStatus,
      payFrequency: stub.payFrequency,
      children: hh.children,
      otherDependents: hh.otherDependents,
      taxableWagesPerPeriod: stub.federalTaxableWages,
      overtimePayPerPeriod: stub.overtimePay,
      overtimeMultiplier: stub.overtimeMultiplier,
      tipsPerPeriod: stub.tips,
      federalWithheldPerPeriod: stub.federalWithheld,
    });
    setErrors(errs);
    if (errs.length) return;
    saveCheck({ paystub: stub, household: hh, source, sample, savedAt: new Date().toISOString() });
    router.push("/result");
  }

  return (
    <section className="section" style={{ maxWidth: 820, margin: "0 auto" }}>
      <span className="eyebrow">Free paycheck check · {stub ? "step 2 of 2" : "step 1 of 2"}</span>
      <h1 style={{ fontSize: "2.2rem" }}>{stub ? "Check what we read" : "Let's look at your paystub"}</h1>

      {!stub && (
        <PaystubPicker
          sampleIds={["maria", "james"]}
          onRead={(d, s, sid, note) => {
            setNotice(note);
            setStub(d);
            setSource(s);
            setSample(sid);
          }}
        />
      )}

      {stub && (
        <>
          <div className="card">
            <p className="hint" style={{ marginTop: 0 }}>
              {source === "ai" && "Read by AI from your image. Please double-check every number."}
              {source === "sample-values" && "Sample values loaded (AI reading is off on this deployment)."}
              {source === "manual" && (notice || "Type the numbers from your most recent paystub (one pay period).")}
              {stub.employer ? ` · ${stub.employer}` : ""}
              {stub.payDate ? ` · pay date ${stub.payDate}` : ""}
            </p>
            <PaystubForm value={stub} onChange={setStub} />
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <h3>About your household</h3>
            <div className="form-grid">
              <div className="field">
                <label>Filing status</label>
                <select value={hh.filingStatus} onChange={(e) => setHh({ ...hh, filingStatus: e.target.value as Household["filingStatus"] })}>
                  <option value="single">Single</option>
                  <option value="mfj">Married filing jointly</option>
                </select>
              </div>
              <div className="field">
                <label>Children under 17</label>
                <input type="number" min={0} value={hh.children} onChange={(e) => setHh({ ...hh, children: Math.max(0, parseInt(e.target.value) || 0) })} />
              </div>
              <div className="field">
                <label>Other dependents</label>
                <input type="number" min={0} value={hh.otherDependents} onChange={(e) => setHh({ ...hh, otherDependents: Math.max(0, parseInt(e.target.value) || 0) })} />
              </div>
              <div className="field">
                <label>Your first name (for the HR email)</label>
                <input value={hh.name} onChange={(e) => setHh({ ...hh, name: e.target.value.slice(0, 40) })} placeholder="Optional" />
              </div>
              {hh.filingStatus === "mfj" && (
                <>
                  <div className="field">
                    <label>Spouse&apos;s yearly wages ($)</label>
                    <input type="number" min={0} value={hh.spouseAnnualWages || ""} onChange={(e) => setHh({ ...hh, spouseAnnualWages: Math.max(0, parseFloat(e.target.value) || 0) })} />
                  </div>
                  <div className="field">
                    <label>Spouse&apos;s yearly federal withholding ($)</label>
                    <input type="number" min={0} value={hh.spouseAnnualWithholding || ""} onChange={(e) => setHh({ ...hh, spouseAnnualWithholding: Math.max(0, parseFloat(e.target.value) || 0) })} />
                  </div>
                </>
              )}
            </div>
          </div>

          {errors.length > 0 && <div className="error" style={{ marginTop: 14 }}>{errors.join(" ")}</div>}
          <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={submit}>Show my result</button>
            <button className="btn btn-secondary" onClick={() => setStub(null)}>Use a different paystub</button>
          </div>
        </>
      )}
    </section>
  );
}
