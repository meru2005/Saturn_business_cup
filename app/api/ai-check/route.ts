import { NextResponse } from "next/server";
import { callVision, lastError, llmInfo, parseJsonObject } from "@/lib/llm";
import { EXTRACTION_PROMPT, normalizePaystub } from "@/lib/paystub";
import { rateLimited } from "@/lib/ratelimit";
import { SAMPLES } from "@/lib/samples";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Open /api/ai-check in a browser to prove the AI really reads paystubs on this deployment.
 * It sends the fictional sample paystub (Maria) to the configured vision model and compares
 * what it read with the true values. Never shows API keys.
 */
export async function GET(req: Request) {
  const info = llmInfo();
  if (!info.provider) {
    return NextResponse.json({
      ok: false,
      provider: null,
      problem: "No AI key found. Add GROQ_API_KEY in Vercel → your project → Settings → Environment Variables, then Redeploy.",
    });
  }
  if (rateLimited(req, 5)) return NextResponse.json({ ok: false, problem: "Too many checks, wait a minute." }, { status: 429 });

  const sample = SAMPLES.maria;
  const origin = new URL(req.url).origin;
  let imageBase64: string;
  try {
    const img = await fetch(`${origin}${sample.image}`);
    if (!img.ok) throw new Error(`HTTP ${img.status}`);
    imageBase64 = Buffer.from(await img.arrayBuffer()).toString("base64");
  } catch (e) {
    return NextResponse.json({ ok: false, ...info, problem: `Could not load the sample image: ${String(e)}` });
  }

  const t0 = Date.now();
  const reply = await callVision({ prompt: EXTRACTION_PROMPT, imageBase64, mediaType: "image/png" });
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  if (!reply) return NextResponse.json({ ok: false, ...info, seconds, problem: "The AI provider returned an error.", providerError: lastError });

  const parsed = parseJsonObject(reply);
  const data = parsed ? normalizePaystub(parsed) : null;
  if (!data) return NextResponse.json({ ok: false, ...info, seconds, problem: "The AI answered, but not with readable paystub numbers.", reply: reply.slice(0, 500) });

  const fields = ["grossPay", "overtimePay", "federalWithheld", "payFrequency"] as const;
  const read = Object.fromEntries(fields.map((f) => [f, data[f]]));
  const expected = Object.fromEntries(fields.map((f) => [f, sample.data[f]]));
  const correct = fields.filter((f) => (typeof data[f] === "number" ? Math.abs((data[f] as number) - (sample.data[f] as number)) < 1 : data[f] === sample.data[f]));
  return NextResponse.json({
    ok: correct.length >= 3,
    ...info,
    seconds,
    message: correct.length === fields.length ? "AI is live and read the sample paystub correctly." : `AI is live; ${correct.length} of ${fields.length} key numbers matched.`,
    read,
    expected,
  });
}
