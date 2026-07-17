import type { ChatMsg } from "./llm";

/**
 * Offline provider adapter — talks to a local Ollama server so no data leaves
 * the machine (the on-prem/Nghị định 13/2023 requirement). Only the PORTABLE
 * subset of lib/llm.ts is implemented here: chat, answer-over-docs, and
 * structured JSON. PDF/vision (analyzeFile) and function-calling (runTools)
 * stay on the cloud provider — see the guards in lib/llm.ts.
 *
 * Internal to lib/llm.ts (consumers still import only from lib/llm.ts, so the
 * "LLM chỉ qua lib/llm.ts" rule holds). Uses Ollama's native /api/chat.
 *
 * NOTE: runtime-verified once a local Ollama is running (the bước-8 prove-it);
 * here it is only typechecked. Configure via OLLAMA_BASE_URL / OLLAMA_MODEL.
 */

const BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";

type OllamaRole = "system" | "user" | "assistant";
type OllamaMsg = { role: OllamaRole; content: string };

function toOllamaMsgs(messages: ChatMsg[], system?: string): OllamaMsg[] {
  const out: OllamaMsg[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    out.push({ role: m.role === "model" ? "assistant" : "user", content: m.text });
  }
  return out;
}

async function post(body: unknown): Promise<Response> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Ollama lỗi ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }
  return res;
}

/** Stream a chat reply (NDJSON: one JSON object per line, message.content is the delta). */
export async function* ollamaChatStream(messages: ChatMsg[], system?: string) {
  const res = await post({ model: MODEL, stream: true, messages: toOllamaMsgs(messages, system) });
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const chunk = JSON.parse(line) as { message?: { content?: string } };
      if (chunk.message?.content) yield chunk.message.content;
    }
  }
}

/** Single-shot chat completion (used by answerOverDocs). */
export async function ollamaAnswer(system: string, question: string): Promise<string> {
  const res = await post({
    model: MODEL,
    stream: false,
    messages: [
      { role: "system", content: system },
      { role: "user", content: question },
    ],
  });
  const json = (await res.json()) as { message?: { content?: string } };
  return json.message?.content ?? "";
}

/**
 * Structured JSON via Ollama's `format` (accepts a JSON Schema — reuse the same
 * schema lib/llm.ts feeds Gemini). Returns raw text; the caller does schema.parse
 * (and one retry) so validation stays in one place.
 */
export async function ollamaExtractJSON(
  jsonSchema: Record<string, unknown>,
  input: string,
  system?: string
): Promise<string> {
  const messages: OllamaMsg[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: input });
  const res = await post({ model: MODEL, stream: false, format: jsonSchema, messages });
  const json = (await res.json()) as { message?: { content?: string } };
  return json.message?.content ?? "{}";
}
