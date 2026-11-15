/**
 * Minimal LLM client, no SDKs. Pick ONE provider with ONE environment variable:
 *   GROQ_API_KEY       → Groq (free tier), model qwen/qwen3.6-27b (reads images)
 *   GEMINI_API_KEY     → Google Gemini (free tier), model gemini-2.5-flash-lite
 *   ANTHROPIC_API_KEY  → Claude
 *   OPENAI_API_KEY     → OpenAI, or any OpenAI-compatible API via OPENAI_BASE_URL
 * Optional override: AI_MODEL (or the older ANTHROPIC_MODEL / OPENAI_MODEL).
 * Calls return null on failure so the app falls back gracefully; lastError keeps the reason for /api/ai-check.
 */

type Provider = "groq" | "gemini" | "anthropic" | "openai";

const env = (k: string) => (process.env[k] || "").trim().replace(/^["']|["']$/g, "");

export function llmProvider(): Provider | null {
  if (env("GROQ_API_KEY")) return "groq";
  if (env("GEMINI_API_KEY")) return "gemini";
  if (env("ANTHROPIC_API_KEY")) return "anthropic";
  if (env("OPENAI_API_KEY")) return /groq\.com/.test(env("OPENAI_BASE_URL")) ? "groq" : /googleapis\.com/.test(env("OPENAI_BASE_URL")) ? "gemini" : "openai";
  return null;
}

interface OpenAIConfig {
  url: string;
  key: string;
  model: string;
  /** Extra body params tried first; dropped automatically if the API rejects them. */
  extra: Record<string, unknown>;
}

function openaiConfig(p: Exclude<Provider, "anthropic">): OpenAIConfig {
  const override = env("AI_MODEL") || env("OPENAI_MODEL");
  if (p === "groq") {
    const model = override || "qwen/qwen3.6-27b";
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: env("GROQ_API_KEY") || env("OPENAI_API_KEY"),
      model,
      // Qwen on Groq is a reasoning model: turn thinking off and never return reasoning text in the answer.
      extra: /qwen/i.test(model) ? { reasoning_effort: "none", reasoning_format: "hidden" } : {},
    };
  }
  if (p === "gemini") {
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: env("GEMINI_API_KEY") || env("OPENAI_API_KEY"),
      model: override || "gemini-2.5-flash-lite",
      extra: {},
    };
  }
  return {
    url: `${(env("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`,
    key: env("OPENAI_API_KEY"),
    model: override || "gpt-4o-mini",
    extra: {},
  };
}

export function llmInfo() {
  const p = llmProvider();
  if (!p) return { provider: null, model: null };
  return { provider: p, model: p === "anthropic" ? env("AI_MODEL") || env("ANTHROPIC_MODEL") || "claude-haiku-5-5" : openaiConfig(p).model };
}

export let lastError: string | null = null;

type Content = string | ({ type: "text"; text: string } | { type: "image"; mediaType: string; data: string })[];

async function chat(opts: { system?: string; content: Content; maxTokens: number; json: boolean; timeoutMs: number }): Promise<string | null> {
  const provider = llmProvider();
  if (!provider) return null;
  lastError = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    if (provider === "anthropic") {
      const content =
        typeof opts.content === "string"
          ? opts.content
          : opts.content.map((c) =>
              c.type === "text" ? c : { type: "image", source: { type: "base64", media_type: c.mediaType, data: c.data } },
            );
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: llmInfo().model,
          max_tokens: opts.maxTokens,
          ...(opts.system ? { system: opts.system } : {}),
          messages: [{ role: "user", content }],
        }),
      });
      if (!res.ok) {
        lastError = `Anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`;
        console.error(lastError);
        return null;
      }
      const data = await res.json();
      return (data.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("") || null;
    }

    const cfg = openaiConfig(provider);
    const userContent =
      typeof opts.content === "string"
        ? opts.content
        : opts.content.map((c) => (c.type === "text" ? c : { type: "image_url", image_url: { url: `data:${c.mediaType};base64,${c.data}` } }));
    const messages = [...(opts.system ? [{ role: "system", content: opts.system }] : []), { role: "user", content: userContent }];
    // Try the full request first; if the API rejects a parameter (400), retry with fewer extras.
    const attempts: Record<string, unknown>[] = [
      { ...cfg.extra, ...(opts.json ? { response_format: { type: "json_object" } } : {}) },
      opts.json ? { response_format: { type: "json_object" } } : {},
      {},
    ];
    const seen = new Set<string>();
    for (const extra of attempts) {
      const sig = JSON.stringify(extra);
      if (seen.has(sig)) continue;
      seen.add(sig);
      const res = await fetch(cfg.url, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
        // OpenAI's newer models (GPT-5 family and later) want max_completion_tokens and reject a custom temperature.
        body: JSON.stringify({
          model: cfg.model,
          ...(provider === "openai" ? { max_completion_tokens: opts.maxTokens } : { max_tokens: opts.maxTokens, temperature: 0.1 }),
          ...(provider === "openai" && /gpt-4/i.test(cfg.model) ? { temperature: 0.1 } : {}),
          messages,
          ...extra,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text: string | null = data.choices?.[0]?.message?.content ?? null;
        return text ? text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() : null;
      }
      lastError = `${provider} ${res.status}: ${(await res.text()).slice(0, 400)}`;
      console.error(lastError);
      if (res.status !== 400 && res.status !== 422) return null; // bad key, rate limit, server error: retrying won't help
    }
    return null;
  } catch (e) {
    lastError = (e as Error).name === "AbortError" ? "Timed out waiting for the AI provider" : String(e);
    console.error("LLM call failed", lastError);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function callLLM(opts: { system: string; user: string; maxTokens?: number; json?: boolean; timeoutMs?: number }) {
  return chat({ system: opts.system, content: opts.user, maxTokens: opts.maxTokens ?? 1500, json: Boolean(opts.json), timeoutMs: opts.timeoutMs ?? 25000 });
}

/** Vision call: send one image (base64) with an instruction. Returns the model's text or null. */
export function callVision(opts: {
  prompt: string;
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  maxTokens?: number;
  timeoutMs?: number;
}) {
  return chat({
    content: [
      { type: "text", text: opts.prompt },
      { type: "image", mediaType: opts.mediaType, data: opts.imageBase64 },
    ],
    maxTokens: opts.maxTokens ?? 1200,
    json: true,
    timeoutMs: opts.timeoutMs ?? 45000,
  });
}

/** Extract the first JSON object from a model reply (handles ```json fences and stray reasoning). */
export function parseJsonObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}
