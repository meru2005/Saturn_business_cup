import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/ratelimit";

/**
 * Stripe Checkout (test mode), no SDK. One product, two billing options:
 *  plan "annual"  → Saturn Plus $79/year (default, saves 34%)
 *  plan "monthly" → Saturn Plus $9.99/month
 * Both start with a 7-day free trial. Card details are entered on Stripe's page, never on ours.
 */
const PLANS = {
  annual: { amount: "7900", interval: "year", label: "Saturn Plus (annual)" },
  monthly: { amount: "999", interval: "month", label: "Saturn Plus (monthly)" },
} as const;

export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  if (rateLimited(req, 10)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  let plan: keyof typeof PLANS = "annual";
  let from = "result";
  try {
    const b = await req.json();
    if (b?.plan === "monthly") plan = "monthly";
    if (b?.from === "guard" || b?.from === "pricing") from = b.from;
  } catch {
    /* defaults */
  }
  const p = PLANS[plan];
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": p.amount,
    "line_items[0][price_data][recurring][interval]": p.interval,
    "line_items[0][price_data][product_data][name]": p.label,
    "line_items[0][price_data][product_data][description]":
      "Exact W-4 numbers, pre-filled official W-4, HR email, payday checks every paycheck, alerts before April, January refresh.",
    "subscription_data[trial_period_days]": "7",
    success_url: `${origin}/success?plan=${plan}&from=${from}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/${from}`,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: data.error?.message || "Stripe error" }, { status: 502 });
  return NextResponse.json({ url: data.url });
}
