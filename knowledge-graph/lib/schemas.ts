import { z } from "zod";

/**
 * Example structured-output schema used by /api/extract.
 * Swap these fields for whatever the hackathon problem needs
 * (e.g. shipping slip, medical form, QC defect list, procedure checklist).
 */
export const InvoiceSchema = z.object({
  vendor: z.string(),
  customer: z.string(),
  total: z.number(),
  currency: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      qty: z.number(),
      price: z.number(),
    })
  ),
});

export type Invoice = z.infer<typeof InvoiceSchema>;

/**
 * Content of an administrative Decision ("Quyết định cá biệt") to be rendered
 * as a Nghị định 30/2020/NĐ-CP-compliant .docx by lib/docx.ts.
 *
 * The LLM (Drafting Agent) fills ONLY the content fields; the .docx layout and
 * typography are enforced deterministically by the renderer — so "100% thể thức"
 * is an engineering guarantee, not a model promise.
 *
 * Kept flat (plain objects/arrays/strings/numbers) so Gemini `responseJsonSchema`
 * accepts it. Field names are English per the project rule (code in English);
 * they map to Vietnamese document blocks in the renderer.
 */
export const DecisionSchema = z.object({
  parentAgency: z.string().optional(), // cơ quan chủ quản (dòng trên, nếu có)
  issuingAgency: z.string(), // cơ quan ban hành, VD "ỦY BAN NHÂN DÂN TỈNH QUẢNG NAM"
  number: z.string(), // số/ký hiệu, VD "123/QĐ-UBND"
  location: z.string(), // địa danh, VD "Quảng Nam"
  day: z.number(), // ngày ban hành
  month: z.number(),
  year: z.number(),
  subject: z.string(), // trích yếu — nội dung sau "Về việc ..."
  issuingAuthority: z.string(), // thẩm quyền ban hành, VD "CHỦ TỊCH ỦY BAN NHÂN DÂN TỈNH QUẢNG NAM"
  legalBases: z.array(z.string()), // các "Căn cứ ..." (KHÔNG kèm chữ "Căn cứ"/dấu ";")
  preamble: z.string().optional(), // VD "Theo đề nghị của Giám đốc Sở Công Thương."
  articles: z.array(
    z.object({
      heading: z.string(), // VD "Điều 1." — hoặc để renderer tự đánh số
      body: z.string(),
    })
  ),
  recipients: z.array(z.string()), // "Nơi nhận" (KHÔNG kèm gạch đầu dòng); renderer tự thêm "- Lưu: VT."
  signerPosition: z.string(), // chức vụ người ký, VD "CHỦ TỊCH"
  signerName: z.string(), // họ tên người ký
});

export type Decision = z.infer<typeof DecisionSchema>;

/**
 * Data Agent output — figures extracted from one department report.
 * Note: we deliberately do NOT ask the LLM for "% hoàn thành"; the percentage
 * is recomputed in TS (actual/target) because LLM arithmetic is unreliable.
 * Flat shape for Gemini `responseJsonSchema`. English keys per project rule.
 */
export const MetricRowSchema = z.object({
  department: z.string(), // đơn vị báo cáo, VD "Sở Công Thương"
  indicator: z.string(), // chỉ tiêu, VD "Chỉ số sản xuất công nghiệp (IIP)"
  unit: z.string().optional(), // đơn vị tính: %, tỷ đồng, tấn…
  target: z.number(), // mục tiêu
  actual: z.number(), // thực tế
  period: z.string().optional(), // kỳ báo cáo, VD "6 tháng đầu năm 2026"
});
export const ReportExtractionSchema = z.object({
  source: z.string(), // tên/định danh tài liệu nguồn
  rows: z.array(MetricRowSchema),
});
export type MetricRow = z.infer<typeof MetricRowSchema>;
export type ReportExtraction = z.infer<typeof ReportExtractionSchema>;

/**
 * Legal Agent output — conflict/overlap review over retrieved regulation chunks.
 * `quote` MUST be a verbatim substring of the cited source chunk; a TS check
 * enforces this after extraction, turning "0% ảo giác điều luật" into a code
 * guarantee rather than a prompt. Enum VALUES stay Vietnamese (domain terms).
 */
export const CitationSchema = z.object({
  document: z.string(), // văn bản, VD "Nghị định 30/2020/NĐ-CP"
  article: z.string(), // điều, VD "Điều 13"
  clause: z.string().optional(), // khoản
  quote: z.string(), // trích dẫn nguyên văn (phải là substring của nguồn)
  sourceId: z.string(), // id chunk nguồn đã truy xuất
});
export const ConflictFindingSchema = z.object({
  conflictType: z.enum(["thamQuyen", "chongCheo", "mauThuan", "khong"]),
  severity: z.enum(["cao", "trungBinh", "thap"]),
  citations: z.array(CitationSchema),
  explanation: z.string(), // giải thích
  recommendation: z.string().optional(), // khuyến nghị
});
export const LegalReviewSchema = z.object({
  conclusion: z.string(), // kết luận tổng thể
  findings: z.array(ConflictFindingSchema),
});
export type Citation = z.infer<typeof CitationSchema>;
export type ConflictFinding = z.infer<typeof ConflictFindingSchema>;
export type LegalReview = z.infer<typeof LegalReviewSchema>;

/**
 * Drafting Agent split: the LLM writes ONLY these content fields. Org identity,
 * số/ký hiệu, date and signer are supplied by the caller (DecisionMeta) so the
 * model never invents administrative metadata. Merge = a full `Decision`.
 */
export const DecisionDraftSchema = z.object({
  subject: z.string(), // trích yếu (không kèm "Về việc")
  legalBases: z.array(z.string()), // căn cứ (không kèm chữ "Căn cứ"/dấu)
  preamble: z.string().optional(),
  articles: z.array(z.object({ heading: z.string(), body: z.string() })),
  recipients: z.array(z.string()),
});
export type DecisionDraft = z.infer<typeof DecisionDraftSchema>;

/** Letterhead + signing metadata the LLM must NOT invent. */
export type DecisionMeta = Omit<Decision, keyof DecisionDraft>;

/* ========================================================================
 * "Chắc Gốc" — adaptive tutor domain schemas (see docs/SPEC.md).
 * Legacy schemas above are kept untouched: other kit modules import them.
 * Data field names are Vietnamese on purpose — they surface verbatim in the
 * Vietnamese UI and in demo data files that humans review.
 * ====================================================================== */

/**
 * One node of the knowledge graph. `yccd` holds VERBATIM "yêu cầu cần đạt"
 * bullets extracted from the official 2018 curriculum tables (provenance:
 * Thông tư 32/2018/TT-BGDĐT) — never rewritten by an LLM.
 * `tienQuyet` = ids of prerequisite nodes (edge direction: prereq -> node).
 * `mo` = dim node: rendered on the map for the cross-level story, but has
 * no questions and no explanations (per MVP cut).
 * Coordinates are hardcoded (no auto-layout, per MVP cut).
 */
export const KnowledgeNodeSchema = z.object({
  id: z.string(),
  ten: z.string(), // display name (short, Vietnamese)
  lop: z.number().int().min(1).max(12),
  cap: z.enum(["TH", "THCS", "THPT"]),
  mach: z.string(), // strand, e.g. "Số và Đại số"
  chuDe: z.string(), // topic (column 1 of the curriculum table)
  chuDeCon: z.string(), // sub-topic label, verbatim from the table
  yccd: z.array(z.string()), // verbatim requirement bullets
  tienQuyet: z.array(z.string()),
  mo: z.boolean(),
  x: z.number(),
  y: z.number(),
});
export type KnowledgeNode = z.infer<typeof KnowledgeNodeSchema>;

export const KnowledgeGraphSchema = z.object({
  nguon: z.string(), // provenance note for judges
  nodes: z.array(KnowledgeNodeSchema),
});
export type KnowledgeGraph = z.infer<typeof KnowledgeGraphSchema>;

/**
 * A prerequisite-edge suggestion (LLM-proposed, human-reviewed).
 * `canCu` must quote the YCCĐ text that justifies the edge so the reviewer
 * can check it against the source in seconds.
 */
export const EdgeSchema = z.object({
  tienQuyet: z.string(), // prerequisite node id
  node: z.string(), // dependent node id
  canCu: z.string(), // YCCĐ quote justifying the edge
  lyDo: z.string(), // one-line pedagogical reason
});
export type Edge = z.infer<typeof EdgeSchema>;

/**
 * One multiple-choice question. `dapAnGiaTri` is a normalized machine-checkable
 * answer value (e.g. "-7/12") recomputed by the deterministic verifier in
 * scripts/gen-questions.ts — schema-valid JSON does NOT mean the math is right.
 * `loSai` maps each wrong option to the misconception it diagnoses
 * ("" at the correct index) — this is what makes wrong answers informative.
 */
export const QuestionSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  deBai: z.string(),
  luaChon: z.array(z.string()).length(4),
  dapAn: z.number().int().min(0).max(3),
  dapAnGiaTri: z.string(), // "" when not machine-checkable
  giaiThich: z.string(),
  loSai: z.array(z.string()).length(4),
});
export type Question = z.infer<typeof QuestionSchema>;

export const QuestionBankSchema = z.object({
  questions: z.array(QuestionSchema),
});
export type QuestionBank = z.infer<typeof QuestionBankSchema>;

/** Seeded student: mastery per node id in [0,1] (no per-answer history, per MVP cut). */
export const StudentSchema = z.object({
  id: z.string(),
  ten: z.string(),
  mastery: z.record(z.string(), z.number().min(0).max(1)),
});
export type Student = z.infer<typeof StudentSchema>;

export const StudentsFileSchema = z.object({
  lopHoc: z.string(), // e.g. "7A"
  students: z.array(StudentSchema),
});
export type StudentsFile = z.infer<typeof StudentsFileSchema>;

/** Mutable demo state, persisted as data/state.json via lib/store.ts (atomic writes). */
export const StateSchema = z.object({
  assignment: z
    .object({ id: z.string(), nodeId: z.string(), ten: z.string(), taoLuc: z.string() })
    .nullable(),
  traLoi: z.array(
    z.object({
      hocSinhId: z.string(),
      cauHoiId: z.string(),
      nodeId: z.string(),
      chon: z.number().int(),
      dung: z.boolean(),
      luc: z.string(),
    })
  ),
});
export type State = z.infer<typeof StateSchema>;
