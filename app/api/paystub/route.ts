import { NextResponse } from "next/server";
import { callVision, llmProvider, parseJsonObject } from "@/lib/llm";
import { EXTRACTION_PROMPT, normalizePaystub } from "@/lib/paystub";
import { rateLimited } from "@/lib/ratelimit";
import { SAMPLES } from "@/lib/samples";

export const maxDuration = 60;

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type MediaType = (typeof TYPES)[number];

/**
 * POST { image: "data:image/jpeg;base64,...", sample?: "maria" | "james" }
 * Reads a paystub image with a vision model and returns normalized numbers.
 * The image is processed in memory and never stored.
 */
export async function POST(req: Request) {
  if (rateLimited(req, 12)) return NextResponse.json({ error: "Too many requests, try again in a minute." }, { status: 429 });
  let body: { image?: string; sample?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const sample = body.sample && SAMPLES[body.sample] ? SAMPLES[body.sample] : null;

  if (!llmProvider()) {
    if (sample) return NextResponse.json({ data: sample.data, source: "sample-values", ai: false });
    return NextResponse.json(
      { error: "Automatic reading isn't available right now. Type the 8 numbers from your paystub below (about a minute).", code: "ai_off" },
      { status: 503 }
    );
  }

  const m = (body.image || "").match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m || !TYPES.includes(m[1] as MediaType)) {
    return NextResponse.json({ error: "Please upload a PDF, JPG or PNG of your paystub." }, { status: 400 });
  }
  if (m[2].length > 7_000_000) return NextResponse.json({ error: "Image is too large (max ~5 MB)." }, { status: 413 });

  const reply = await callVision({ prompt: EXTRACTION_PROMPT, imageBase64: m[2], mediaType: m[1] as MediaType });
  const parsed = parseJsonObject(reply);
  if (parsed?.error === "not_a_paystub") {
    return NextResponse.json({ error: "That doesn't look like a paystub. Try a clearer photo, or enter the numbers manually." }, { status: 422 });
  }
  const data = parsed ? normalizePaystub(parsed) : null;
  if (!data) {
    if (sample) return NextResponse.json({ data: sample.data, source: "sample-values", ai: false });
    return NextResponse.json(
      { error: "We couldn't read every number from that file. Please type them below (about a minute).", code: "unreadable" },
      { status: 422 }
    );
  }
  return NextResponse.json({ data, source: "ai", ai: true });
}
