"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toPaycheckInput } from "@/lib/build";
import { isPlus, loadCheck, usd, type SavedCheck } from "@/lib/store";
import { analyzePaycheck, SAFETY_BUFFER, TAX_YEAR } from "@/lib/tax";
import { PlusPaywall } from "@/components/PlusPaywall";
import { ShareRaise } from "@/components/ShareRaise";
import { downloadW4, w4Values } from "@/lib/w4pdf";
import { downloadIcs, paydayIcs } from "@/lib/ics";

function useCountUp(target: number, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export default function Result() {
  const [check, setCheck] = useState<SavedCheck | null | undefined>(undefined);
  const [unlocked, setUnlockedState] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [calAdded, setCalAdded] = useState(false);
  const [email, setEmail] = useState<{ subject: string; body: string; ai: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setCheck(loadCheck());
    setUnlockedState(isPlus());
  }, []);

  const a = useMemo(() => (check ? analyzePaycheck(toPaycheckInput(check.paystub, check.household)) : null), [check]);
  const shown = useCountUp(a?.raisePerPaycheck ?? 0);

  if (check === undefined) return null;
  if (!check || !a)
    return (
      <div className="card" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
        <h2>No check yet</h2>
        <p>Upload a paystub to see how much you&apos;re overpaying.</p>
        <Link className="btn btn-primary" href="/check">Check my paystub</Link>
      </div>
    );

  const reason = check.paystub.tips > 0 ? "tips" : check.paystub.overtimePay > 0 ? "overtime" : "other";

  async function getW4() {
    setErr(null);
    setPdfBusy(true);
    try {
      await downloadW4(w4Values(a!, check!.household, check!.household.children, check!.household.otherDependents));
    } catch {
      setErr("Could not build the PDF. Use the numbers above on a blank W-4 instead.");
    } finally {
      setPdfBusy(false);
    }
  }

  function addCalendar() {
    downloadIcs(paydayIcs({ payDate: check!.paystub.payDate, freq: check!.paystub.payFrequency, url: `${window.location.origin}/guard`, raisePerPaycheck: a!.raisePerPaycheck }));
    setCalAdded(true);
  }

  async function writeEmail() {
    setCopied(false);
    const res = await fetch("/api/email", {
      method: "POST",
      body: JSON.stringify({
        name: check!.household.name,
        employer: check!.paystub.employer ? `${check!.paystub.employer.replace(/\s*\(sample\)/i, "")} Payroll` : undefined,
        step3: a!.w4.step3,
        step4b: a!.w4.step4b,
        step4c: a!.w4.step4cAmount,
        reason,
      }),
    });
    setEmail(await res.json());
  }

  const w4Rows: [string, string, string][] = [
    ["Step 1(c)", a.w4.step1c, "Your filing status"],
    ...(a.w4.step2 ? ([["Step 2", a.w4.step2, "Multiple jobs / spouse works"]] as [string, string, string][]) : []),
    ["Step 3", a.w4.step3 ? usd(a.w4.step3) : "$0 (leave blank)", a.w4.step3 ? `Children × $2,200 + other dependents × $500` : "No dependents"],
    ["Step 4(a)", "Leave blank", "No other income to add"],
    [
      "Step 4(b)",
      a.w4.step4b ? usd(a.w4.step4b) : "Leave blank",
      a.w4.step4b
        ? `Deductions worksheet: qualified ${reason === "tips" ? "tips (line 1a)" : "overtime (line 1b)"}. This is what lowers your withholding.`
        : "No overtime or tips deduction",
    ],
    ["Step 4(c)", a.w4.step4cAmount ? `${usd(a.w4.step4cAmount)} per paycheck` : "Leave blank", a.w4.step4cAdvice],
  ];

  return (
    <>
      <section className="result-hero">
        {a.status === "overpaying" && (
          <>
            <span className="eyebrow">You&apos;re overpaying federal tax</span>
            <div className="amount">+{usd(shown)}</div>
            <p style={{ fontSize: "1.2rem", color: "var(--ink-2)" }}>
              more in <strong>every paycheck</strong>, about <strong>{usd(a.raisePerYear)}</strong> a year, if you update your W-4.
            </p>
            <ShareRaise amount={a.raisePerPaycheck} />
          </>
        )}
        {a.status === "on_track" && (
          <>
            <span className="eyebrow">Good news</span>
            <div className="amount" style={{ fontSize: "3.4rem" }}>You&apos;re on track</div>
            <p style={{ fontSize: "1.15rem", color: "var(--ink-2)" }}>Your withholding is close to right. You&apos;re heading for a small refund of about {usd(Math.max(0, a.overpayment))}.</p>
          </>
        )}
        {a.status === "under_withheld" && (
          <>
            <span className="eyebrow" style={{ background: "var(--red-soft)", color: "var(--red)" }}>Heads up</span>
            <div className="amount" style={{ color: "var(--red)" }}>−{usd(a.owesInApril)}</div>
            <p style={{ fontSize: "1.15rem", color: "var(--ink-2)" }}>At this pace you&apos;d <strong>owe</strong> about {usd(a.owesInApril)} in April. A small W-4 change prevents that.</p>
          </>
        )}
      </section>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Where it comes from</h2>
          <div className="breakdown-row"><span>Federal taxable wages / year</span><span>{usd(a.annualWages)}</span></div>
          {a.annualOvertimePay > 0 && (
            <>
              <div className="breakdown-row"><span>Overtime pay / year</span><span>{usd(a.annualOvertimePay)}</span></div>
              <div className="breakdown-row">
                <span>Deductible part (premium only: {check.paystub.overtimeMultiplier === 2 ? "¼" : "⅓"} of OT pay{a.withNewDeductions.overtimeDeduction < a.qualifiedOvertime ? ", after cap/phase-out" : ""})</span>
                <span>{usd(a.withNewDeductions.overtimeDeduction)}</span>
              </div>
            </>
          )}
          {a.annualTips > 0 && (
            <div className="breakdown-row"><span>Tips deduction (max $25,000)</span><span>{usd(a.withNewDeductions.tipsDeduction)}</span></div>
          )}
          <div className="breakdown-row"><span>Your {TAX_YEAR} federal tax (with new deductions)</span><span>{usd(a.withNewDeductions.liability)}</span></div>
          {a.newDeductionSavings > 0 && (
            <div className="breakdown-row"><span>Tax saved by the new {reason} deduction</span><span>{usd(a.newDeductionSavings)}</span></div>
          )}
          <div className="breakdown-row"><span>Withheld from your paychecks / year</span><span>{usd(a.annualWithholding)}</span></div>
          <div className="breakdown-row"><span>{a.overpayment >= 0 ? "Overpaid" : "Underpaid"}</span><span>{usd(Math.abs(a.overpayment))}</span></div>
          {a.overpayment > 0 && <div className="breakdown-row"><span>Safety buffer we keep (small refund)</span><span>−{usd(SAFETY_BUFFER)}</span></div>}
          <p className="hint" style={{ marginTop: 12 }}>
            Based on {a.periods} paychecks a year like this one. {TAX_YEAR} brackets, standard deduction {usd(a.withNewDeductions.standardDeduction)}, marginal rate {Math.round(a.withNewDeductions.marginalRate * 100)}%.
          </p>
        </div>

        <div className="card">
          <h2>Your W-4 fix</h2>
          {!unlocked ? (
            <div className="locked">
              <div className="blur">
                <table className="w4"><tbody>
                  {w4Rows.map(([s, v]) => <tr key={s}><td>{s}</td><td className="val">{v}</td></tr>)}
                </tbody></table>
                <p>Pre-filled official W-4 (PDF) · email to HR · payday checks</p>
              </div>
              <div className="unlock">
                <PlusPaywall
                  title="Get your W-4 fix with Saturn Plus"
                  subtitle="Exact W-4 numbers, the official W-4 pre-filled, the HR email, and a payday check every paycheck."
                  from="result"
                  raisePerPaycheck={a.raisePerPaycheck}
                  onUnlocked={() => setUnlockedState(true)}
                />
              </div>
            </div>
          ) : (
            <>
              <p className="hint">Enter these on the 2026 Form W-4 (or your payroll portal&apos;s W-4 screen). Changes usually show up within 1–2 paychecks.</p>
              <table className="w4"><tbody>
                {w4Rows.map(([s, v, why]) => (
                  <tr key={s}><td>{s}</td><td><div className="val" style={{ fontWeight: 800, color: s === "Step 4(b)" || s === "Step 4(c)" && a.w4.step4cAmount ? "var(--green-dark)" : "var(--ink)" }}>{v}</div><div className="hint">{why}</div></td></tr>
                ))}
              </tbody></table>
              <div className="download-box no-print">
                <h3>1. Your official 2026 W-4, already filled in</h3>
                <p className="hint" style={{ margin: 0 }}>
                  The real IRS form with your numbers in place (Steps {a.w4.step3 ? "1(c), 3, 4(b)" : "1(c), 4(b)"}{a.w4.step4cAmount ? ", 4(c)" : ""} and the page 4 worksheet).
                  Made on your device. <strong>Your SSN, address and signature are left blank on purpose</strong>: you write those by hand.
                </p>
                <div className="btn-row">
                  <button className="btn btn-primary btn-small" onClick={getW4} disabled={pdfBusy}>{pdfBusy ? "Preparing…" : "Download my pre-filled W-4 (PDF)"}</button>
                </div>
                <h3 style={{ marginTop: 16 }}>2. Send it (pick one)</h3>
                <ol className="submit-steps">
                  <li><strong>Payroll app</strong> (ADP, Workday, Paylocity, Gusto, UKG, Paycom): open <em>Pay → Tax withholding</em> or <em>W-4</em>, and type the numbers above. Takes 3 minutes.</li>
                  <li><strong>No app:</strong> print the PDF, add your SSN and address, sign and date Step 5, and give it to HR or your manager. Or email a scan with the message below.</li>
                </ol>
                <div className="btn-row">
                  <button className="btn btn-secondary btn-small" onClick={writeEmail}>Write my email to HR</button>
                  <button className="btn btn-secondary btn-small" onClick={() => window.print()}>Print this page</button>
                </div>
                <h3 style={{ marginTop: 16 }}>3. Stay right every payday</h3>
                <p className="hint" style={{ margin: 0 }}>A repeating reminder on each payday in your own calendar. Upload that day&apos;s paystub and Saturn tells you in 30 seconds if you&apos;re still on track.</p>
                <div className="btn-row">
                  <button className="btn btn-secondary btn-small" onClick={addCalendar}>{calAdded ? "Added ✓ (open the downloaded file)" : "Add payday reminders to my calendar"}</button>
                  <Link className="btn btn-ghost btn-small" href="/guard">Open payday check →</Link>
                </div>
                {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
              </div>
              {email && (
                <div style={{ marginTop: 14 }}>
                  <p><strong>Subject:</strong> {email.subject}{email.ai ? <span className="hint"> · polished by AI</span> : null}</p>
                  <div className="letter">{email.body}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }} className="no-print">
                    <button className="btn btn-secondary btn-small" onClick={() => { navigator.clipboard?.writeText(`Subject: ${email.subject}\n\n${email.body}`); setCopied(true); }}>{copied ? "Copied!" : "Copy"}</button>
                    <a className="btn btn-secondary btn-small" href={`mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}>Open in email app</a>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="note timing" style={{ marginTop: 18 }}>
        <strong>When it pays:</strong> what you&apos;ve already overpaid in {TAX_YEAR} comes back as your refund in April. Update your W-4 now and
        every paycheck from here on is bigger, including every paycheck of 2027 (your W-4 stays in effect until you change it).
        These numbers use {TAX_YEAR} rules; 2027 brackets rise about 3%, so Saturn Plus rechecks your W-4 in January.
      </div>

      {a.warnings.length > 0 && (
        <div className="section" style={{ paddingBottom: 0 }}>
          {a.warnings.map((w) => <div className="note" key={w} style={{ marginBottom: 10 }}>{w}</div>)}
        </div>
      )}

      <section className="section no-print">
        <div className="card" style={{ display: "flex", gap: 20, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ maxWidth: 620 }}>
            <h2 style={{ marginBottom: 6 }}>Hours change. Your W-4 shouldn&apos;t surprise you.</h2>
            <p className="hint" style={{ margin: 0 }}>
              The payday check compares every new paystub with your plan. If your overtime drops and you&apos;re heading to owe in April, you get the fix right away. Your first check is free.
            </p>
          </div>
          <Link href="/guard" className="btn btn-primary">Try a payday check</Link>
        </div>
      </section>
    </>
  );
}
