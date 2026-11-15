"use client";

import { useState } from "react";
import Link from "next/link";
import { PlanToggle, PRICES, startPlus, useStripeConfig } from "@/components/PlusPaywall";
import type { Plan } from "@/lib/store";

export default function Pricing() {
  const stripe = useStripeConfig();
  const [plan, setPlan] = useState<Plan>("annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = PRICES[plan];

  async function checkout() {
    setError(null);
    setBusy(true);
    try {
      if ((await startPlus(plan, "pricing", stripe)) === "unlocked") window.location.href = `/success?plan=${plan}&demo=1`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <span className="eyebrow">Pricing</span>
        <h1>Free to check. One plan to keep it right.</h1>
        <p className="hint" style={{ fontSize: "1rem", maxWidth: 640, margin: "0 auto" }}>
          Maria, our sample nurse, keeps $79 more in every paycheck. Saturn Plus on the yearly plan costs $6.58 a month.
        </p>
      </div>
      <div className="plans" style={{ maxWidth: 780 }}>
        <div className="card plan">
          <h3>Free</h3>
          <div className="price">$0</div>
          <ul>
            <li>AI reads your paystub (sensitive areas blacked out first)</li>
            <li>Your exact overpayment per paycheck</li>
            <li>Overtime &amp; tips deduction math</li>
            <li>Under-withholding warning</li>
            <li>Your first payday check</li>
          </ul>
          <Link href="/check" className="btn btn-secondary" style={{ width: "100%" }}>Check my paystub</Link>
        </div>
        <div className="card plan featured">
          <h3>Saturn Plus</h3>
          <PlanToggle plan={plan} onChange={setPlan} />
          <div className="price">{p.price}<small>{p.per}</small></div>
          <p className="hint" style={{ marginTop: -6 }}>{p.note} · 7-day free trial</p>
          <ul>
            <li>Exact line-by-line W-4 values</li>
            <li>Official IRS W-4, pre-filled for you (PDF)</li>
            <li>Ready-to-send email to HR</li>
            <li>Payday check on every paystub + calendar reminders</li>
            <li>Alert before you&apos;d owe in April</li>
            <li>Recalculate when hours, job or family change</li>
            <li>January W-4 refresh for the new tax year</li>
          </ul>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={checkout} disabled={busy || stripe === null}>
            {busy ? "Opening checkout…" : "Start 7-day free trial"}
          </button>
        </div>
      </div>
      <div style={{ maxWidth: 700, margin: "18px auto 0", textAlign: "center" }}>
        {stripe && <div className="testcard">Demo checkout (Stripe test mode): card <strong>4242 4242 4242 4242</strong>, any future date, any CVC. No real money is charged.</div>}
        {stripe === false && <p className="hint">Payments are switched off on this deployment, so the button unlocks Plus in demo mode.</p>}
        <p className="hint">Card details are entered on Stripe&apos;s secure page. Saturn never sees or stores them.</p>
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      </div>
    </section>
  );
}
