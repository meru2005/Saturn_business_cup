import { NextResponse } from "next/server";
import { llmInfo } from "@/lib/llm";

export const dynamic = "force-dynamic";

/** Tells the UI which integrations are switched on (never exposes keys). */
export async function GET() {
  const { provider, model } = llmInfo();
  return NextResponse.json({ stripe: Boolean(process.env.STRIPE_SECRET_KEY?.trim()), ai: provider, model });
}
