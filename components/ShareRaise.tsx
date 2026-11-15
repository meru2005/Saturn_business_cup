"use client";

import { useState } from "react";

/** Built-in referral loop: share the result (no personal numbers beyond the raise itself). */
export function ShareRaise({ amount }: { amount: number }) {
  const [copied, setCopied] = useState(false);
  if (amount <= 0) return null;
  async function share() {
    const url = window.location.origin;
    const text = `Saturn says I'm overpaying federal tax: +$${amount} back in every paycheck with a W-4 update. If you get overtime or tips, check yours free:`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Saturn", text, url });
        return;
      }
    } catch {
      return; // user closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <button className="btn btn-secondary btn-small no-print" style={{ marginTop: 6 }} onClick={share}>
      {copied ? "Link copied. Send it to a coworker" : "Share with a coworker who works overtime"}
    </button>
  );
}
