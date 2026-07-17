/**
 * suggest-edges.ts — LLM proposes ADDITIONAL prerequisite edges for human review.
 *
 * Guardrails (per SPEC "MVP chốt"):
 *  - Closed vocabulary: from/to are z.enum() of real node ids — the model
 *    CANNOT invent nodes.
 *  - Every suggestion must quote the YCCĐ text (`canCu`) justifying it.
 *  - Output goes to data/edges-suggested.json ONLY. A human reviews and copies
 *    approved entries into data/edges-approved.json, then re-runs
 *    scripts/build-graph.ts. Nothing enters the graph without review.
 *  - The demo chain is hand-authored in build-graph.ts and never touched here.
 *
 * Live-only script: requires GEMINI_API_KEY (read from .env.local if unset).
 * Missing key => SKIP (exit 0), per the project's check-script convention.
 *
 * Run: npx --yes tsx scripts/suggest-edges.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { KnowledgeGraphSchema } from "../lib/schemas";

/** tsx does not read .env.local (FIELD-NOTES trap #8) — load the key manually. */
function loadEnvLocal() {
  if (process.env.GEMINI_API_KEY) return;
  const envFile = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envFile)) return;
  const m = fs.readFileSync(envFile, "utf8").match(/^GEMINI_API_KEY=(.+)$/m);
  if (m) process.env.GEMINI_API_KEY = m[1].trim();
}

async function main() {
  loadEnvLocal();
  if (!process.env.GEMINI_API_KEY) {
    console.log("SKIP: GEMINI_API_KEY not set — live edge suggestion not run (not a failure).");
    return;
  }
  // Import AFTER the key is in place: lib/llm.ts reads env at module load.
  const { extractJSON, MODELS } = await import("../lib/llm");

  const graphFile = path.resolve(process.cwd(), "data", "graph.json");
  const graph = KnowledgeGraphSchema.parse(JSON.parse(fs.readFileSync(graphFile, "utf8")));
  const nodes = graph.nodes;
  const ids = nodes.map((n) => n.id) as [string, ...string[]];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const SuggestionSchema = z.object({
    edges: z.array(
      z.object({
        tienQuyet: z.enum(ids),
        node: z.enum(ids),
        canCu: z.string(),
        lyDo: z.string(),
      })
    ),
  });

  const nodeList = nodes
    .map((n) => `- ${n.id} (lớp ${n.lop}) "${n.ten}": ${n.yccd.slice(0, 3).join(" · ").slice(0, 300)}`)
    .join("\n");
  const existing = nodes
    .flatMap((n) => n.tienQuyet.map((p) => `${p} -> ${n.id}`))
    .join("\n");

  const input =
    `Dưới đây là các node kiến thức Toán (CT GDPT 2018, mạch Số và Đại số) kèm yêu cầu cần đạt, ` +
    `và danh sách cạnh tiên quyết ĐÃ CÓ.\n\nNODES:\n${nodeList}\n\nCẠNH ĐÃ CÓ (tienQuyet -> node):\n${existing}\n\n` +
    `Đề xuất tối đa 10 cạnh tiên quyết BỔ SUNG còn thiếu (kiến thức A phải vững trước khi học B). ` +
    `Chỉ đề xuất khi có căn cứ sư phạm rõ; canCu phải trích lại đúng cụm yêu-cầu-cần-đạt liên quan ở trên. ` +
    `Không lặp lại cạnh đã có, không tự tạo node mới, không đề xuất cạnh từ lớp cao xuống lớp thấp.`;

  const result = await extractJSON(SuggestionSchema, input, {
    model: MODELS.smart,
    system:
      "Bạn là chuyên gia sư phạm Toán phổ thông Việt Nam. Chỉ đề xuất quan hệ tiên quyết có căn cứ trong yêu cầu cần đạt được cung cấp.",
    temperature: 0,
  });

  // Deterministic filters — the model's output is a PROPOSAL, not truth.
  const existingSet = new Set(nodes.flatMap((n) => n.tienQuyet.map((p) => `${p}>${n.id}`)));
  const filtered = result.edges.filter((e) => {
    if (e.tienQuyet === e.node) return false;
    if (existingSet.has(`${e.tienQuyet}>${e.node}`)) return false;
    if (byId.get(e.tienQuyet)!.lop > byId.get(e.node)!.lop) return false;
    return true;
  });

  const outFile = path.resolve(process.cwd(), "data", "edges-suggested.json");
  fs.writeFileSync(outFile, JSON.stringify(filtered, null, 2), "utf8");
  console.log(`OK: ${result.edges.length} suggested, ${filtered.length} kept after deterministic filters.`);
  console.log(`Wrote ${path.relative(process.cwd(), outFile)}`);
  console.log(
    "NEXT (human step): review each edge; copy the APPROVED ones into data/edges-approved.json (same shape), then re-run: npx tsx scripts/build-graph.ts && npx tsx scripts/check-graph.ts"
  );
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
