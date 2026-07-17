import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type Part,
  type FunctionDeclaration,
} from "@google/genai";
import { z } from "zod";
import { ollamaAnswer, ollamaChatStream, ollamaExtractJSON } from "./ollama";

/**
 * Central Gemini wrapper for the hackathon kit.
 * Every product feature should call one of the helpers below instead of
 * talking to the SDK directly — so models, keys and error handling live in ONE place.
 */

const apiKey = process.env.GEMINI_API_KEY;

/** LLM backend: "gemini" (cloud, default) or "ollama" (offline/on-prem). */
const PROVIDER = (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();

// Lazy client: don't construct at import time, so `next build` works without a key set.
let _ai: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY chưa được đặt. Thêm vào file .env.local (xem .env.example). " +
        "Lấy key tại https://aistudio.google.com/apikey"
    );
  }
  if (!_ai) _ai = new GoogleGenAI({ apiKey });
  return _ai;
}

/**
 * Model routing — retune the WHOLE app by editing here.
 * (Mid-2026 IDs. `gemini-2.5-flash` shuts down 2026-10-16; `gemini-3.5-flash` replaces it.)
 */
export const MODELS = {
  fast: "gemini-3.5-flash", // default workhorse: chat, extract, most features
  cheap: "gemini-3.1-flash-lite", // high-volume: classify, route, tag
  smart: "gemini-2.5-pro", // hard reasoning: agents, planning
  embedding: "gemini-embedding-001", // semantic retrieval (768-dim via outputDimensionality)
} as const;

export type ChatMsg = { role: "user" | "model"; text: string };

/**
 * How hard the model should think. Gemini 3.5+ uses `thinkingLevel`
 * (the older numeric `thinkingBudget` ERRORS on 3.5 models). Exposed as our own
 * string union so callers never import @google/genai (project rule #1).
 * Lower = faster + cheaper, at the cost of reasoning depth.
 */
export type ThinkLevel = "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
const THINK_LEVELS: Record<ThinkLevel, ThinkingLevel> = {
  MINIMAL: ThinkingLevel.MINIMAL,
  LOW: ThinkingLevel.LOW,
  MEDIUM: ThinkingLevel.MEDIUM,
  HIGH: ThinkingLevel.HIGH,
};

type CommonOpts = { model?: string; system?: string; think?: ThinkLevel; temperature?: number };

function toContents(messages: ChatMsg[]) {
  return messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
}

/** Gemini rejects the JSON-Schema meta keys that Zod emits — strip them. */
function toGeminiJsonSchema(schema: z.ZodType) {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

/** 1) Stream a chat reply. Yields text chunks as they arrive (for a live-typing UI). */
export async function* chatStream(messages: ChatMsg[], opts: CommonOpts = {}) {
  if (PROVIDER === "ollama") {
    yield* ollamaChatStream(messages, opts.system);
    return;
  }
  const stream = await client().models.generateContentStream({
    model: opts.model ?? MODELS.fast,
    contents: toContents(messages),
    config: opts.system ? { systemInstruction: opts.system } : {},
  });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}

/** 2) Get schema-validated JSON out of Gemini (never returns malformed data). */
export async function extractJSON<T>(
  schema: z.ZodType<T>,
  input: string,
  opts: CommonOpts = {}
): Promise<T> {
  const jsonSchema = toGeminiJsonSchema(schema);

  if (PROVIDER === "ollama") {
    // Local models are laxer about JSON — try twice, then let parse throw.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await ollamaExtractJSON(jsonSchema, input, opts.system);
      try {
        return schema.parse(JSON.parse(raw));
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  const res = await client().models.generateContent({
    model: opts.model ?? MODELS.fast,
    contents: input,
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
      ...(opts.think ? { thinkingConfig: { thinkingLevel: THINK_LEVELS[opts.think] } } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    },
  });
  return schema.parse(JSON.parse(res.text ?? "{}"));
}

/** 3) Read an image or PDF natively — no separate OCR / PDF parser needed. */
export async function analyzeFile(
  file: { mimeType: string; data: string }, // data = base64, without the "data:" prefix
  prompt: string,
  opts: CommonOpts = {}
): Promise<string> {
  if (PROVIDER === "ollama") {
    throw new Error(
      "analyzeFile (đọc PDF/ảnh) chưa hỗ trợ offline. Đặt LLM_PROVIDER=gemini cho bước bóc tách file, " +
        "hoặc tách adapter trích text PDF riêng trước khi gọi LLM."
    );
  }
  const res = await client().models.generateContent({
    model: opts.model ?? MODELS.fast,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: file.mimeType, data: file.data } },
          { text: prompt },
        ],
      },
    ],
    config: opts.system ? { systemInstruction: opts.system } : {},
  });
  return res.text ?? "";
}

/** 4) "RAG" by stuffing a bounded doc set into context (no vector DB for a hackathon). */
export async function answerOverDocs(
  question: string,
  docs: string,
  opts: CommonOpts = {}
): Promise<string> {
  const system =
    (opts.system ? opts.system + "\n\n" : "") +
    "Chỉ trả lời dựa trên các tài liệu tham chiếu bên dưới, và trích dẫn phần liên quan. " +
    "Nếu câu trả lời không có trong tài liệu, hãy nói là bạn không biết.\n\n" +
    `<documents>\n${docs}\n</documents>`;

  if (PROVIDER === "ollama") return ollamaAnswer(system, question);

  const res = await client().models.generateContent({
    model: opts.model ?? MODELS.fast,
    contents: question,
    config: { systemInstruction: system },
  });
  return res.text ?? "";
}

/** Normalize to unit length so dot product = cosine. Exported for headless tests. */
export function l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
}

/**
 * 6) Embed texts for semantic retrieval. Returns UNIT-LENGTH vectors — the
 * API does NOT normalize truncated (≠3072-dim) embeddings, so we do it here;
 * after that, dot product = cosine similarity.
 */
export async function embed(
  texts: string[],
  opts: { taskType?: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"; model?: string } = {}
): Promise<number[][]> {
  if (PROVIDER === "ollama") {
    throw new Error(
      "embed (vector retrieval) chưa hỗ trợ offline trong kit này. Dùng strategy 'bm25' khi LLM_PROVIDER=ollama."
    );
  }
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await client().models.embedContent({
      model: opts.model ?? MODELS.embedding,
      contents: batch,
      config: {
        taskType: opts.taskType ?? "RETRIEVAL_DOCUMENT",
        outputDimensionality: 768,
      },
    });
    const vecs = res.embeddings ?? [];
    if (vecs.length !== batch.length) {
      throw new Error(`embed: expected ${batch.length} vectors, got ${vecs.length}`);
    }
    for (const e of vecs) out.push(l2Normalize(e.values ?? []));
  }
  return out;
}

export type ToolDef = {
  name: string;
  description: string;
  /** JSON schema (object) describing the tool's parameters. */
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown;
};

/** 5) Function-calling loop: Gemini picks tools, we execute them and feed results back until it answers. */
export async function runTools(
  question: string,
  tools: ToolDef[],
  opts: CommonOpts & { maxSteps?: number } = {}
): Promise<string> {
  if (PROVIDER === "ollama") {
    throw new Error(
      "runTools (function-calling) chưa hỗ trợ offline trong kit này. Đặt LLM_PROVIDER=gemini cho bước agent."
    );
  }
  const functionDeclarations: FunctionDeclaration[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: t.parameters,
  }));

  const contents: Content[] = [{ role: "user", parts: [{ text: question }] }];
  const maxSteps = opts.maxSteps ?? 6;

  for (let step = 0; step < maxSteps; step++) {
    const res = await client().models.generateContent({
      model: opts.model ?? MODELS.fast,
      contents,
      config: {
        systemInstruction: opts.system,
        tools: [{ functionDeclarations }],
      },
    });

    const calls = res.functionCalls ?? [];
    if (calls.length === 0) return res.text ?? "";

    // Preserve the model's EXACT turn — its parts carry thoughtSignature, which
    // Gemini 3 requires to be echoed back or tool calls fail with INVALID_ARGUMENT.
    const modelContent = res.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);

    const resultParts: Part[] = [];
    for (const call of calls) {
      const tool = tools.find((t) => t.name === call.name);
      const result = tool
        ? await tool.run((call.args ?? {}) as Record<string, unknown>)
        : { error: `Unknown tool: ${call.name}` };
      resultParts.push({
        functionResponse: { name: call.name ?? "", response: { result } },
      });
    }
    contents.push({ role: "user", parts: resultParts });
  }

  return "Đã đạt giới hạn số bước gọi công cụ.";
}
