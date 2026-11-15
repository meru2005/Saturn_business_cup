import { NextResponse } from "next/server";
import { callLLM, llmProvider } from "@/lib/llm";
import { rateLimited } from "@/lib/ratelimit";

/** Writes the short email to HR/payroll that goes with the updated W-4. Template first, AI polish when available. */
export async function POST(req: Request) {
  if (rateLimited(req, 15)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  let b: { name?: string; employer?: string; step3?: number; step4b?: number; step4c?: number | null; reason?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const name = (b.name || "[Your name]").slice(0, 60);
  const employer = (b.employer || "Payroll team").slice(0, 80);
  const fmt = (n: number) => n.toLocaleString("en-US");
  const lines = [
    b.step3 ? `- Step 3 (dependents): $${fmt(b.step3)}` : null,
    b.step4b ? `- Step 4(b) (deductions): $${fmt(b.step4b)}` : null,
    b.step4c ? `- Step 4(c) (extra withholding): $${b.step4c} per pay period` : null,
  ].filter(Boolean);
  const subject = "Updated 2026 Form W-4";
  const template = `Hello ${employer},

Please update my federal tax withholding using the attached 2026 Form W-4, starting with the next payroll you can process.

The changes are:
${lines.length ? lines.join("\n") : "- Updated filing information"}

${b.reason === "overtime" || b.reason === "tips" ? `Step 4(b) reflects my expected qualified ${b.reason === "tips" ? "tips" : "overtime"} deduction under the One Big Beautiful Bill Act, as the 2026 W-4 instructions allow.\n\n` : ""}Could you confirm when the change takes effect? Thank you!

Best regards,
${name}`;

  if (!llmProvider()) return NextResponse.json({ subject, body: template, ai: false });
  const reply = await callLLM({
    system: "You polish short workplace emails. Keep every number and line item exactly as given. Plain text, under 130 words, friendly and professional. Return only the email body.",
    user: template,
    maxTokens: 500,
  });
  return NextResponse.json({ subject, body: reply?.trim() || template, ai: Boolean(reply) });
}
