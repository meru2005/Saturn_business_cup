"use client";

import { useEffect, useState } from "react";
import { setPlus, type Plan } from "@/lib/store";

export const PRICES: Record<Plan, { price: string; per: string; note: string }> = {
  annual: { price: "$79", per: "/year", note: "$6.58/mo · save 34%" },
  monthly: { price: "$9.99", per: "/month", note: "cancel anytime" },
};

export function useStripeConfig() {
  const [stripe, setStripe] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((c) => setStripe(Boolean(c.stripe))).catch(() => setStripe(false));
  }, []);
  return stripe;
}

/** Start Saturn Plus. With Stripe configured → hosted Stripe Checkout (test mode). Without → demo unlock. */
export async function startPlus(plan: Plan, from: "result" | "guard" | "pricing", stripe: boolean | null): Promise<"unlocked" | "redirect"> {
  if (!stripe) {
    setPlus(plan);
    return "unlocked";
  }
  const res = await fetch("/api/checkout", { method: "POST", body: JSON.stringify({ plan, from }) });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "Checkout failed");
  window.location.href = d.url;
  return "redirect";
}

export function PlanToggle({ plan, onChange }: { plan: Plan; onChange: (p: Plan) => void }) {
  return (
    <div className="plan-toggle" role="radiogroup" aria-label="Billing">
      {(["annual", "monthly"] as Plan[]).map((p) => (
        <button key={p} type="button" role="radio" aria-checked={plan === p} className={plan === p ? "on" : ""} onClick={() => onChange(p)}>
          {p === "annual" ? "Yearly" : "Monthly"}
          {p === "annual" && <span className="save">−34%</span>}
        </button>
      ))}
    </div>
  );
}

export function PlusPaywall({
  title,
  subtitle,
  from,
  raisePerPaycheck = 0,
  onUnlocked,
}: {
  title: string;
  subtitle: string;
  from: "result" | "guard";
  raisePerPaycheck?: number;
  onUnlocked: () => void;
}) {
  const stripe = useStripeConfig();
  const [plan, setPlan] = useState<Plan>("annual");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const p = PRICES[plan];
  const monthlyCost = plan === "annual" ? 79 / 12 : 9.99;
  async function go() {
    setErr(null);
    setBusy(true);
    try {
      if ((await startPlus(plan, from, stripe)) === "unlocked") onUnlocked();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="card paywall" style={{ textAlign: "center", maxWidth: 360 }}>
      <h3>{title}</h3>
      <p className="hint">{subtitle}</p>
      <PlanToggle plan={plan} onChange={setPlan} />
      <div className="price" style={{ fontSize: "2.2rem" }}>
        {p.price}
        <small>{p.per}</small>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        {p.note}
        {raisePerPaycheck > 0 ? ` · you keep ~${Math.max(1, Math.round(raisePerPaycheck / monthlyCost))}× what it costs` : ""}
      </p>
      <button className="btn btn-primary" style={{ width: "100%" }} onClick={go} disabled={busy || stripe === null}>
        {busy ? "Opening checkout…" : stripe === false ? "Start free trial (demo)" : "Start 7-day free trial"}
      </button>
      <p className="hint" style={{ margin: "8px 0 0" }}>7 days free, then {p.price}{p.per}. Cancel anytime.</p>
      {stripe && <div className="testcard">Demo checkout: card 4242 4242 4242 4242, any future date, any CVC.</div>}
      {stripe === false && <div className="testcard">Payments are off on this deployment, so this unlocks in demo mode.</div>}
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}
