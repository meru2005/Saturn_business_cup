"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadCheck, setPlus } from "@/lib/store";

export default function Success() {
  const [from, setFrom] = useState("result");
  const [hasCheck, setHasCheck] = useState(true);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setPlus(q.get("plan") === "monthly" ? "monthly" : "annual");
    setFrom(q.get("from") || "result");
    setHasCheck(Boolean(loadCheck()));
  }, []);
  const href = !hasCheck ? "/check" : from === "guard" ? "/guard" : "/result";
  return (
    <div className="card" style={{ maxWidth: 560, margin: "50px auto", textAlign: "center" }}>
      <span className="eyebrow">Saturn Plus is on</span>
      <h1>Your 7-day free trial has started.</h1>
      <p>
        Your exact W-4 numbers, the pre-filled official W-4 and the email to HR are unlocked, and every payday check is included.
        Most payroll systems apply a new W-4 within 1–2 paychecks.
      </p>
      <Link href={href} className="btn btn-primary">
        {!hasCheck ? "Check my paystub" : from === "guard" ? "Run a payday check" : "Get my W-4"}
      </Link>
    </div>
  );
}
