"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PaystubForm, PaystubPicker } from "@/components/PaystubInput";
import { toPaycheckInput } from "@/lib/build";
import type { PaystubData } from "@/lib/paystub";
import { isPlus, loadCheck, loadGuard, saveGuard, usd, type SavedCheck } from "@/lib/store";
import { analyzePaycheck, guardCheck, PERIODS } from "@/lib/tax";
import { PlusPaywall } from "@/components/PlusPaywall";
import { downloadIcs, paydayIcs } from "@/lib/ics";

export default function Guard() {
  const [check, setCheck] = useState<SavedCheck | null | undefined>(undefined);
  const [stub, setStub] = useState<PaystubData | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [history, setHistory] = useState<{ paystub: PaystubData; checkedAt: string }[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  useEffect(() => {
    setCheck(loadCheck());
    setHistory(loadGuard());
    setSubscribed(isPlus());
  }, []);

  if (check === undefined) return null;
  if (!check)
    return (
      <div className="card" style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
        <span className="eyebrow">Payday check</span>
        <h2>First, run your free check</h2>
        <p>The payday check compares each new paystub with your plan, so it needs your first check.</p>
        <Link className="btn btn-primary" href="/check">Check my paystub</Link>
      </div>
    );

  const plan = analyzePaycheck(toPaycheckInput(check.paystub, check.household));
  const periods = PERIODS[check.paystub.payFrequency];
  const checked = Math.min(history.length, periods);
  const kept = checked * plan.raisePerPaycheck;
  const needsPlus = !subscribed && history.length >= 1;
  const result = stub && confirmed ? guardCheck(toPaycheckInput(check.paystub, check.household), toPaycheckInput(stub, check.household)) : null;

  function confirm() {
    setConfirmed(true);
    const h = [{ paystub: stub!, checkedAt: new Date().toISOString() }, ...history].slice(0, 12);
    setHistory(h);
    saveGuard(h);
  }

  return (
    <section className="section" style={{ maxWidth: 860, margin: "0 auto" }}>
      <span className="eyebrow">Payday check {subscribed ? "· Saturn Plus" : "· first check free"}</span>
      <h1 style={{ fontSize: "2.2rem" }}>Payday check</h1>
      <p className="hint" style={{ fontSize: "1rem" }}>
        Upload your newest paystub. We compare it with your plan (from your {check.paystub.payDate || "first"} paystub) and project your whole year,
        so you know <em>today</em> if you&apos;re heading to owe in April.
      </p>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
          <div>
            <h3 style={{ marginBottom: 2 }}>Your paycheck year</h3>
            <p className="hint" style={{ margin: 0 }}>{checked} of {periods} paychecks checked</p>
          </div>
          {plan.raisePerPaycheck > 0 && (
            <div style={{ textAlign: "right" }}>
              <div className="tracker-total">+{usd(kept)}</div>
              <div className="hint">kept so far ({checked} × {usd(plan.raisePerPaycheck)}, estimated)</div>
            </div>
          )}
        </div>
        <div className={`tracker${periods === 12 || periods === 24 ? " n12" : ""}`} aria-label={`${checked} of ${periods} paychecks checked`}>
          {Array.from({ length: periods }, (_, i) => (
            <span key={i} className={`dot${i < checked ? " on" : i === checked ? " next" : ""}`} />
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: 6 }}>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => downloadIcs(paydayIcs({ payDate: check.paystub.payDate, freq: check.paystub.payFrequency, url: `${window.location.origin}/guard`, raisePerPaycheck: plan.raisePerPaycheck }))}
          >
            Add payday reminders to my calendar
          </button>
        </div>
      </div>

      {!stub && needsPlus && (
        <div style={{ display: "grid", placeItems: "center", margin: "10px 0 18px" }}>
          <PlusPaywall
            title="Keep checking every payday"
            subtitle="Your first payday check was free. Saturn Plus checks every paystub, warns you before April, and refreshes your W-4 each January."
            from="guard"
            raisePerPaycheck={plan.raisePerPaycheck}
            onUnlocked={() => setSubscribed(true)}
          />
        </div>
      )}

      {!stub && !needsPlus && (
        <PaystubPicker
          sampleIds={check.sample === "maria" ? ["maria-next"] : ["maria-next", "james"]}
          onRead={(d, _s, _id, note) => {
            setNotice(note);
            setStub(d);
            setConfirmed(false);
          }}
        />
      )}

      {stub && !confirmed && (
        <div className="card">
          <h3>Check the new paystub</h3>
          {notice && <p className="hint">{notice}</p>}
          <PaystubForm value={stub} onChange={setStub} />
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={confirm}>Run payday check</button>
            <button className="btn btn-secondary" onClick={() => setStub(null)}>Different paystub</button>
          </div>
        </div>
      )}

      {result && (
        <div className="card">
          <span className={`badge ${result.level}`}>{result.level === "good" ? "On track" : result.level === "watch" ? "Still overpaying" : "Action needed"}</span>
          <h2 style={{ marginTop: 10 }}>{result.headline}</h2>
          {result.hoursChanged && (
            <p>
              Your overtime changed: {usd(stub!.overtimePay, true)} this paycheck vs {usd(check.paystub.overtimePay, true)} in your plan.
              {stub!.overtimePay < check.paystub.overtimePay ? " Less overtime means a smaller deduction, so your new W-4 may now withhold too little." : ""}
            </p>
          )}
          <div className="breakdown-row"><span>Projected {result.analysis.periods} paychecks of federal tax withheld</span><span>{usd(result.analysis.annualWithholding)}</span></div>
          <div className="breakdown-row"><span>Projected tax for the year</span><span>{usd(result.analysis.withNewDeductions.liability)}</span></div>
          <div className="breakdown-row"><span>{result.analysis.overpayment >= 0 ? "Projected refund" : "Projected bill in April"}</span><span>{usd(Math.abs(result.analysis.overpayment))}</span></div>
          <div className="note" style={{ marginTop: 14 }}>
            <strong>What to do:</strong>{" "}
            {result.level === "act"
              ? `${result.analysis.w4.step4cAdvice} Or, if this was a one-off slow period, check again next payday before changing anything.`
              : result.level === "watch"
              ? `You can raise your Step 4(b) entry to ${usd(result.analysis.w4.step4b)} to get about ${usd(result.analysis.raisePerPaycheck)} more per paycheck.`
              : "Nothing. Your W-4 is working. We'll check again next payday."}
          </div>
          <p className="hint" style={{ marginTop: 10 }}>Projection assumes the rest of the year looks like this paycheck. Each new paystub makes it more accurate.</p>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-small" onClick={() => setStub(null)}>Check another paystub</button>
            {!subscribed && <Link className="btn btn-primary btn-small" href="/pricing">Check every payday with Saturn Plus</Link>}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h3>Paystubs checked</h3>
          {history.map((h) => (
            <div className="sub-row" key={h.checkedAt}>
              <div>
                <strong>{h.paystub.payDate || new Date(h.checkedAt).toLocaleDateString("en-US")}</strong>
                <div className="hint">Gross {usd(h.paystub.grossPay, true)} · overtime {usd(h.paystub.overtimePay, true)} · federal tax {usd(h.paystub.federalWithheld, true)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
