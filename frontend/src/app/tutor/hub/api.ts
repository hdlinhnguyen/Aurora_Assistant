/**
 * Lớp API cho Tutor Hub — bọc các endpoint học sinh thật của backend Go.
 * Base URL đã gồm /api (xem src/lib/api.ts), nên endpoint ở đây KHÔNG kèm /api.
 */
import { apiFetch } from "@/lib/api";

// ---------- Kiểu dữ liệu backend ----------
export interface HubNode {
  id: string;
  subject: string;
  name: string;
  theory: string;
  topicGroup: string;
  isRoot: boolean;
}
export interface HubEdge {
  id: string;
  sourceId: string;
  targetId: string;
}
export interface RawQuestion {
  id: string;
  nodeId: string;
  content: string;
  optionsJson: string; // chuỗi JSON: '["a","b",...]'
  correctOption: number;
  difficulty: string; // "easy" | "medium" | "hard"
}
export interface OrderedStep {
  order: number;
  topic_id: string;
  status: string; // "done" | "in_progress" | "not_started"
  current_mastery?: number;
  target_mastery?: number;
}
export interface MasteryTopic {
  masteryProbability: number; // 0..1
  confidenceScore: number;
  masteryStatus: string;
}
export interface MasteryProfile {
  topics: Record<string, MasteryTopic>;
}
export interface BadgeView {
  code: string;
  name: string;
  description: string;
  criteria: string;
  glyph: string;
  shape: string;
  colorFrom: string;
  colorTo: string;
  category: string;
  threshold: number;
  progress: number;
  pct: number;
  status: "earned" | "progress" | "locked";
  awardedAt: string | null;
}
export interface GameSummary {
  studentId: string;
  xp: number;
  stars: number;
  level: number;
  xpIntoLevel: number;
  xpForLevel: number;
  currentStreak: number;
  longestStreak: number;
  earnedCount: number;
  totalCount: number;
  badges: BadgeView[];
}

// ---------- Endpoint ----------
export const getSubjects = () => apiFetch("/subjects") as Promise<string[]>;

export const getTree = (subject: string) =>
  apiFetch(`/subjects/${encodeURIComponent(subject)}/tree`) as Promise<{
    nodes: HubNode[];
    edges: HubEdge[];
  }>;

export const getLearningPath = () =>
  apiFetch("/student/learning-path") as Promise<{ ordered_steps: OrderedStep[] }>;

export const getMastery = (subject: string) =>
  apiFetch(`/student/mastery?subject=${encodeURIComponent(subject)}`) as Promise<MasteryProfile>;

export const getQuestions = (nodeId: string) =>
  apiFetch(`/nodes/${nodeId}/questions`) as Promise<RawQuestion[]>;

export const submitAnswer = (nodeId: string, questionId: string, selectedOption: number) =>
  apiFetch(`/nodes/${nodeId}/answer`, {
    method: "POST",
    body: JSON.stringify({ questionId, selectedOption }),
  }) as Promise<{ isCorrect: boolean; question: RawQuestion }>;

export const chatTheory = (
  nodeId: string,
  message: string,
  history: { sender: string; content: string }[],
) =>
  apiFetch(`/nodes/${nodeId}/chat-theory`, {
    method: "POST",
    body: JSON.stringify({ message, history }),
  }) as Promise<{ reply: string }>;

export const requestHint = (topicId: string, pressCount: number) =>
  apiFetch("/student/hints", {
    method: "POST",
    body: JSON.stringify({ topicId, pressCount }),
  }) as Promise<{ content?: string }>;

export const getBadges = () => apiFetch("/student/badges") as Promise<GameSummary>;

// ---------- Mapper ----------
export type DiffTag = "Nhận biết" | "Thông hiểu" | "Vận dụng";
export interface HubQuestion {
  id: string;
  q: string;
  opts: string[];
  correct: number;
  tag: DiffTag;
}

const DIFF_MAP: Record<string, DiffTag> = {
  easy: "Nhận biết",
  medium: "Thông hiểu",
  hard: "Vận dụng",
};

export function mapQuestion(r: RawQuestion): HubQuestion {
  let opts: string[] = [];
  try {
    const parsed = JSON.parse(r.optionsJson || "[]");
    if (Array.isArray(parsed)) opts = parsed.map((x) => String(x));
  } catch {
    opts = [];
  }
  return {
    id: r.id,
    q: r.content,
    opts,
    correct: r.correctOption,
    tag: DIFF_MAP[(r.difficulty || "").toLowerCase()] ?? "Nhận biết",
  };
}

export interface RoadmapStep {
  id: string;
  name: string;
  status: "done" | "current" | "locked";
  mastery: number; // 0..1
}

const MASTERED_THRESHOLD = 0.8;

/**
 * Dựng lộ trình: ưu tiên learning-path đã duyệt; nếu rỗng thì suy từ cây + mastery.
 * Trả về danh sách bước theo thứ tự, mỗi bước có trạng thái done/current/locked.
 */
export function buildRoadmap(
  nodes: HubNode[],
  edges: HubEdge[],
  steps: OrderedStep[],
  mastery: MasteryProfile,
): RoadmapStep[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const masteredOf = (id: string) => {
    const t = mastery.topics?.[id];
    return !!t && (t.masteryStatus === "mastered" || t.masteryProbability >= MASTERED_THRESHOLD);
  };
  const masteryOf = (id: string) => mastery.topics?.[id]?.masteryProbability ?? 0;

  // 1) Có learning-path đã duyệt (bỏ qua nút gốc cấu trúc)
  if (steps && steps.length > 0) {
    const ordered = [...steps]
      .sort((a, b) => a.order - b.order)
      .filter((s) => !nodeById.get(s.topic_id)?.isRoot);
    let currentAssigned = false;
    const out: RoadmapStep[] = ordered.map((s) => {
      const node = nodeById.get(s.topic_id);
      const done = s.status === "done" || masteredOf(s.topic_id);
      let status: RoadmapStep["status"];
      if (done) status = "done";
      else if (s.status === "in_progress" || !currentAssigned) {
        status = "current";
        currentAssigned = true;
      } else status = "locked";
      return {
        id: s.topic_id,
        name: node?.name ?? "Bài học",
        status,
        mastery: s.current_mastery ?? masteryOf(s.topic_id),
      };
    });
    return out;
  }

  // 2) Fallback: sắp xếp topo từ edges, bỏ nút gốc, mark done theo mastery
  const rootIds = new Set(nodes.filter((n) => n.isRoot).map((n) => n.id));
  const ordered = topoSort(nodes, edges).filter((n) => !n.isRoot);
  const doneSet = new Set(ordered.filter((n) => masteredOf(n.id)).map((n) => n.id));
  const incoming = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!incoming.has(e.targetId)) incoming.set(e.targetId, []);
    incoming.get(e.targetId)!.push(e.sourceId);
  });
  let currentAssigned = false;
  return ordered.map((n) => {
    const done = doneSet.has(n.id);
    // prerequisite là nút gốc thì coi như đã thỏa (nút gốc chỉ là điểm khởi đầu cấu trúc)
    const prereqs = (incoming.get(n.id) ?? []).filter((p) => !rootIds.has(p));
    const prereqMet = prereqs.every((p) => doneSet.has(p));
    let status: RoadmapStep["status"];
    if (done) status = "done";
    else if (prereqMet && !currentAssigned) {
      status = "current";
      currentAssigned = true;
    } else status = "locked";
    return { id: n.id, name: n.name, status, mastery: masteryOf(n.id) };
  });
}

// Topological sort đơn giản (Kahn); fallback về thứ tự gốc nếu có chu trình.
function topoSort(nodes: HubNode[], edges: HubEdge[]): HubNode[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!nodeById.has(e.sourceId) || !nodeById.has(e.targetId)) return;
    indeg.set(e.targetId, (indeg.get(e.targetId) ?? 0) + 1);
    if (!adj.has(e.sourceId)) adj.set(e.sourceId, []);
    adj.get(e.sourceId)!.push(e.targetId);
  });
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const out: HubNode[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = nodeById.get(id);
    if (n) out.push(n);
    (adj.get(id) ?? []).forEach((t) => {
      indeg.set(t, (indeg.get(t) ?? 0) - 1);
      if ((indeg.get(t) ?? 0) <= 0) queue.push(t);
    });
  }
  // thêm node còn sót (chu trình)
  nodes.forEach((n) => {
    if (!seen.has(n.id)) out.push(n);
  });
  return out;
}
