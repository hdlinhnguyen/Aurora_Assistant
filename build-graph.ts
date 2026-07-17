/**
 * build-graph.ts — deterministic knowledge-graph builder (NO LLM).
 *
 * Parses the verbatim "yêu cầu cần đạt" (YCCĐ) markdown tables extracted from
 * Thông tư 32/2018/TT-BGDĐT (folder ../knowledge_base, one README per grade),
 * selects a curated whitelist of nodes on the "Số và Đại số" strand
 * (grades 4–7 = real nodes, 8–10 = dim nodes), attaches hand-authored
 * prerequisite edges (the demo chain L7→L6→L5→L4 is hand-authored BY DESIGN —
 * never accepted from an LLM), merges human-approved extra edges from
 * data/edges-approved.json if present, validates, and writes data/graph.json.
 *
 * Run: npx --yes tsx scripts/build-graph.ts
 * Env: KNOWLEDGE_BASE_DIR (default: ../knowledge_base relative to app/)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { KnowledgeGraphSchema, EdgeSchema, type KnowledgeNode } from "../lib/schemas";
import { z } from "zod";

const KB_DIR =
  process.env.KNOWLEDGE_BASE_DIR ?? path.resolve(process.cwd(), "..", "knowledge_base");
const OUT_FILE = path.resolve(process.cwd(), "data", "graph.json");
const APPROVED_EDGES_FILE = path.resolve(process.cwd(), "data", "edges-approved.json");

/** Curriculum table section headers. Only the first three are in-strand for us. */
const NUMBER_ALGEBRA_SECTIONS = [
  "SỐ VÀ PHÉP TÍNH", // tiểu học
  "SỐ VÀ ĐẠI SỐ", // THCS
  "ĐẠI SỐ VÀ MỘT SỐ YẾU TỐ GIẢI TÍCH", // lớp 10–11
  "MỘT SỐ YẾU TỐ GIẢI TÍCH", // lớp 12
];
const ALL_SECTIONS = [
  ...NUMBER_ALGEBRA_SECTIONS,
  "HÌNH HỌC VÀ ĐO LƯỜNG",
  "MỘT SỐ YẾU TỐ THỐNG KÊ VÀ XÁC SUẤT",
  "THỐNG KÊ VÀ XÁC SUẤT",
  "HOẠT ĐỘNG THỰC HÀNH VÀ TRẢI NGHIỆM",
];

/** Strip escapes (`\-` `\=` `\+` `\.`), markdown emphasis, image refs; collapse spaces. */
function clean(raw: string): string {
  return raw
    .replace(/!\[\]\[image\d+\]/g, " ") // lost-formula placeholders
    .replace(/\\(.)/g, "$1") // un-escape any backslash-escaped char
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function norm(raw: string): string {
  return clean(raw).toLowerCase();
}

type Row = { lop: number; chuDe: string; chuDeCon: string; yccd: string[] };

/** Parse one grade README table -> rows of the number/algebra strand only. */
function parseGrade(lop: number): Row[] {
  const file = path.join(KB_DIR, `lop-${lop}`, "toan", "README.md");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const rows: Row[] = [];
  let inStrand = false;
  let chuDe = "";

  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // cells[0] is empty (before the first pipe); columns are 1..3
    const c1 = cells[1] ?? "";
    const c2 = cells[2] ?? "";
    const c3 = cells[3] ?? "";
    if (/^[-:\s]+$/.test(c1) && c2 === "") continue; // separator row
    if (norm(c1) === "nội dung") continue; // header row

    const section = ALL_SECTIONS.find((s) => norm(c1) === norm(s));
    if (section) {
      inStrand = NUMBER_ALGEBRA_SECTIONS.includes(section);
      continue;
    }
    if (!inStrand) continue;
    if (c3 === "") continue; // sub-strand rows (***Số***), practice rows — no YCCĐ cell

    if (clean(c1) !== "") chuDe = clean(c1); // rowspan carry: col1 empty = same topic
    // Bullets are separated by literal `\-` in the source; split BEFORE unescaping
    // so genuine minus signs (e.g. "-3/4") survive.
    const yccd = c3
      .split("\\-")
      .map(clean)
      .filter((s) => s !== "")
      .filter((s) => !(s.endsWith(":") && s.length < 60)); // drop preamble fragments
    if (yccd.length === 0) continue;
    rows.push({ lop, chuDe, chuDeCon: clean(c2), yccd });
  }
  return rows;
}

/**
 * Curated node whitelist. `key` = normalized PREFIX of the sub-topic label in
 * the source table (matched with startsWith; 0 or >1 matches = hard error, so
 * parser drift is caught loudly). Coordinates: column per grade, hardcoded.
 * `tienQuyet` here = HAND-AUTHORED edges (demo chain + uncontroversial spine).
 */
const X: Record<number, number> = { 4: 70, 5: 200, 6: 330, 7: 460, 8: 590, 9: 720, 10: 850, 11: 980, 12: 1110 };
type Spec = {
  id: string;
  lop: number;
  key: string;
  ten: string;
  mo: boolean;
  row: number; // vertical slot within the grade column
  tienQuyet: string[];
};
const WHITELIST: Spec[] = [
  // ---- Lớp 4 (TH) — gốc của mạch phân số ----
  { id: "l4-khai-niem-phan-so", lop: 4, key: "khái niệm ban đầu về phân số", ten: "Khái niệm phân số", mo: false, row: 0, tienQuyet: [] },
  { id: "l4-tinh-chat-phan-so", lop: 4, key: "tính chất cơ bản của phân số", ten: "Tính chất phân số — rút gọn, quy đồng", mo: false, row: 1, tienQuyet: ["l4-khai-niem-phan-so"] },
  { id: "l4-so-sanh-phan-so", lop: 4, key: "so sánh phân số", ten: "So sánh phân số", mo: false, row: 2, tienQuyet: ["l4-tinh-chat-phan-so"] },
  { id: "l4-phep-tinh-phan-so", lop: 4, key: "các phép tính cộng, trừ, nhân, chia với phân số", ten: "Cộng, trừ, nhân, chia phân số", mo: false, row: 3, tienQuyet: ["l4-tinh-chat-phan-so"] },
  // ---- Lớp 5 (TH) — node gốc rễ của kịch bản demo ----
  { id: "l5-quy-dong-phan-so", lop: 5, key: "ôn tập về phân số và các phép tính với phân số", ten: "Quy đồng mẫu số & phép tính phân số khác mẫu", mo: false, row: 0, tienQuyet: ["l4-phep-tinh-phan-so", "l4-so-sanh-phan-so"] },
  { id: "l5-so-thap-phan", lop: 5, key: "số thập phân", ten: "Số thập phân", mo: false, row: 1, tienQuyet: ["l5-quy-dong-phan-so"] },
  { id: "l5-phep-tinh-so-thap-phan", lop: 5, key: "các phép tính cộng, trừ, nhân, chia với số thập phân", ten: "Phép tính với số thập phân", mo: false, row: 2, tienQuyet: ["l5-so-thap-phan"] },
  { id: "l5-ti-so-phan-tram", lop: 5, key: "tỉ số. tỉ số phần trăm", ten: "Tỉ số & tỉ số phần trăm", mo: false, row: 3, tienQuyet: ["l5-quy-dong-phan-so"] },
  // ---- Lớp 6 (THCS) ----
  { id: "l6-phep-tinh-so-nguyen", lop: 6, key: "các phép tính với số nguyên", ten: "Phép tính với số nguyên", mo: false, row: 0, tienQuyet: [] },
  { id: "l6-phan-so-tinh-chat", lop: 6, key: "phân số. tính chất cơ bản của phân số", ten: "Phân số tử/mẫu nguyên & so sánh", mo: false, row: 1, tienQuyet: ["l5-quy-dong-phan-so", "l6-phep-tinh-so-nguyen"] },
  { id: "l6-phep-tinh-phan-so", lop: 6, key: "các phép tính với phân số", ten: "Phép tính với phân số (mở rộng)", mo: false, row: 2, tienQuyet: ["l6-phan-so-tinh-chat"] },
  // ---- Lớp 7 (THCS) — node đích của bài chẩn đoán demo ----
  { id: "l7-so-huu-ti-khai-niem", lop: 7, key: "số hữu tỉ và tập hợp các số hữu tỉ", ten: "Số hữu tỉ — khái niệm & thứ tự", mo: false, row: 0, tienQuyet: ["l6-phan-so-tinh-chat", "l6-phep-tinh-so-nguyen"] },
  { id: "l7-phep-tinh-so-huu-ti", lop: 7, key: "các phép tính với số hữu tỉ", ten: "Phép tính với số hữu tỉ", mo: false, row: 1, tienQuyet: ["l7-so-huu-ti-khai-niem", "l6-phep-tinh-phan-so"] },
  { id: "l7-ti-le-thuc", lop: 7, key: "tỉ lệ thức và dãy tỉ số bằng nhau", ten: "Tỉ lệ thức & dãy tỉ số bằng nhau", mo: false, row: 2, tienQuyet: ["l7-phep-tinh-so-huu-ti", "l5-ti-so-phan-tram"] },
  // ---- Lớp 8–10 — node MỜ: kể chuyện xuyên cấp + cảnh báo chiều xuôi ----
  { id: "l8-phuong-trinh-bac-nhat", lop: 8, key: "phương trình bậc nhất", ten: "Phương trình bậc nhất", mo: true, row: 0, tienQuyet: ["l7-phep-tinh-so-huu-ti"] },
  { id: "l8-ham-so-bac-nhat", lop: 8, key: "hàm số bậc nhất y", ten: "Hàm số bậc nhất", mo: true, row: 1, tienQuyet: ["l8-phuong-trinh-bac-nhat", "l7-ti-le-thuc"] },
  { id: "l9-he-phuong-trinh", lop: 9, key: "phương trình và hệ phương trình bậc nhất hai ẩn", ten: "Hệ phương trình bậc nhất hai ẩn", mo: true, row: 0, tienQuyet: ["l8-phuong-trinh-bac-nhat"] },
  { id: "l9-phuong-trinh-bac-hai", lop: 9, key: "phương trình bậc hai một ẩn", ten: "Phương trình bậc hai", mo: true, row: 1, tienQuyet: ["l8-phuong-trinh-bac-nhat"] },
  { id: "l10-ham-so", lop: 10, key: "khái niệm cơ bản về hàm số và đồ thị", ten: "Hàm số & đồ thị", mo: true, row: 0, tienQuyet: ["l8-ham-so-bac-nhat"] },
  { id: "l10-ham-so-bac-hai", lop: 10, key: "hàm số bậc hai", ten: "Hàm số bậc hai", mo: true, row: 1, tienQuyet: ["l10-ham-so", "l9-phuong-trinh-bac-hai"] },
  { id: "l11-ham-so-mu-log", lop: 11, key: "hàm số mũ. hàm số lôgarit", ten: "Hàm số mũ & lôgarit", mo: true, row: 0, tienQuyet: ["l10-ham-so"] },
  { id: "l11-dao-ham", lop: 11, key: "khái niệm đạo hàm", ten: "Đạo hàm", mo: true, row: 1, tienQuyet: ["l10-ham-so", "l10-ham-so-bac-hai"] },
  { id: "l12-khao-sat-ham-so", lop: 12, key: "tính đơn điệu của hàm số", ten: "Khảo sát hàm số", mo: true, row: 0, tienQuyet: ["l11-dao-ham"] },
  { id: "l12-tich-phan", lop: 12, key: "tích phân. ứng dụng hình học của tích phân", ten: "Tích phân", mo: true, row: 1, tienQuyet: ["l11-dao-ham"] },
];

function cap(lop: number): "TH" | "THCS" | "THPT" {
  return lop <= 5 ? "TH" : lop <= 9 ? "THCS" : "THPT";
}

/** Kahn topological check; returns ids stuck in a cycle ([] = acyclic). */
function findCycle(nodes: KnowledgeNode[]): string[] {
  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const n of nodes) indeg.set(n.id, n.tienQuyet.length);
  for (const n of nodes)
    for (const p of n.tienQuyet) out.set(p, [...(out.get(p) ?? []), n.id]);
  const queue = nodes.filter((n) => n.tienQuyet.length === 0).map((n) => n.id);
  let seen = 0;
  while (queue.length) {
    const id = queue.shift()!;
    seen++;
    for (const next of out.get(id) ?? []) {
      indeg.set(next, indeg.get(next)! - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }
  return seen === nodes.length ? [] : nodes.filter((n) => (indeg.get(n.id) ?? 0) > 0).map((n) => n.id);
}

function main() {
  const grades = [...new Set(WHITELIST.map((w) => w.lop))].sort((a, b) => a - b);
  const rowsByGrade = new Map<number, Row[]>();
  for (const g of grades) rowsByGrade.set(g, parseGrade(g));

  const nodes: KnowledgeNode[] = WHITELIST.map((spec) => {
    const candidates = (rowsByGrade.get(spec.lop) ?? []).filter((r) =>
      norm(r.chuDeCon).startsWith(spec.key)
    );
    if (candidates.length !== 1) {
      throw new Error(
        `Whitelist key "${spec.key}" (lop ${spec.lop}) matched ${candidates.length} rows — expected exactly 1. Parser drift?`
      );
    }
    const row = candidates[0];
    return {
      id: spec.id,
      ten: spec.ten,
      lop: spec.lop,
      cap: cap(spec.lop),
      mach: "Số và Đại số",
      chuDe: row.chuDe,
      chuDeCon: row.chuDeCon,
      yccd: row.yccd,
      tienQuyet: [...spec.tienQuyet],
      mo: spec.mo,
      x: X[spec.lop],
      y: 60 + spec.row * 90,
    };
  });

  // Merge human-approved extra edges (output of scripts/suggest-edges.ts review).
  if (fs.existsSync(APPROVED_EDGES_FILE)) {
    const approved = z
      .array(EdgeSchema)
      .parse(JSON.parse(fs.readFileSync(APPROVED_EDGES_FILE, "utf8")));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let added = 0;
    for (const e of approved) {
      const from = byId.get(e.tienQuyet);
      const to = byId.get(e.node);
      if (!from || !to) throw new Error(`edges-approved: unknown node in ${e.tienQuyet} -> ${e.node}`);
      if (from.lop > to.lop) throw new Error(`edges-approved: ${e.tienQuyet} -> ${e.node} goes from higher grade to lower`);
      if (e.tienQuyet === e.node) throw new Error(`edges-approved: self-loop on ${e.node}`);
      if (!to.tienQuyet.includes(e.tienQuyet)) {
        to.tienQuyet.push(e.tienQuyet);
        added++;
      }
    }
    console.log(`Merged ${added} human-approved edge(s) from data/edges-approved.json`);
  }

  const cycle = findCycle(nodes);
  if (cycle.length) throw new Error(`Graph has a cycle involving: ${cycle.join(", ")}`);

  const graph = KnowledgeGraphSchema.parse({
    nguon:
      "Yêu cầu cần đạt trích nguyên văn từ Chương trình GDPT môn Toán 2018 (Thông tư 32/2018/TT-BGDĐT); mạch Số và Đại số, lớp 4–10.",
    nodes,
  });

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(graph, null, 2), "utf8");

  const real = nodes.filter((n) => !n.mo).length;
  const edges = nodes.reduce((s, n) => s + n.tienQuyet.length, 0);
  console.log(
    `OK: wrote data/graph.json — ${nodes.length} nodes (${real} real, ${nodes.length - real} dim), ${edges} edges, grades ${grades[0]}–${grades[grades.length - 1]}`
  );
}

try {
  main();
} catch (err) {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
