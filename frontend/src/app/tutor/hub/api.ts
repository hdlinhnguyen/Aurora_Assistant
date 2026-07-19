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

// Lộ trình LIVE: server tính lại theo mastery tươi của chính học sinh (không cần giáo viên duyệt).
export const getLearningPathLive = (subject: string) =>
  apiFetch(`/student/learning-path/live?subject=${encodeURIComponent(subject)}`) as Promise<{
    ordered_steps: OrderedStep[];
  }>;

export const getMastery = (subject: string) =>
  apiFetch(`/student/mastery?subject=${encodeURIComponent(subject)}`) as Promise<MasteryProfile>;

export interface ReviewItem {
  nodeId: string;
  name: string;
  topicGroup: string;
  masteryPct: number;
  confidencePct: number;
  status: string;
  reason: string;
  priority: number;
  daysSince: number;
}

// Lộ trình ôn tập cá nhân hoá: các chủ đề cần củng cố, xếp theo độ ưu tiên (dựa trên BKT).
export const getReviewPath = (subject: string) =>
  apiFetch(`/student/review-path?subject=${encodeURIComponent(subject)}`) as Promise<{
    subject: string;
    items: ReviewItem[];
  }>;

export const getQuestions = (nodeId: string) =>
  apiFetch(`/nodes/${nodeId}/questions`) as Promise<RawQuestion[]>;

// Câu hỏi xếp thích ứng theo mastery của học sinh (dễ→khó tùy trình độ).
export const getAdaptiveQuestions = (nodeId: string) =>
  apiFetch(`/nodes/${nodeId}/questions/adaptive`) as Promise<RawQuestion[]>;

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

export interface HintResult {
  content?: string;
  text?: string;
  level?: number;
  video_url?: string;
  scene_name?: string;
  exhausted?: boolean;
  escalation?: any;
}

export const requestHint = async (
  topicId: string,
  pressCount: number,
  topicName?: string,
  questionText?: string
): Promise<HintResult> => {
  // 1. Thử gọi Python Animation Microservice (/api/hint)
  try {
    const res = await fetch("/api/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic_id: topicId,
        topic_name: topicName,
        question_text: questionText,
        press_count: pressCount,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.text || data.content)) {
        return {
          content: data.text || data.content,
          text: data.text || data.content,
          level: data.level || pressCount,
          video_url: data.video_url,
          scene_name: data.scene_name,
          exhausted: data.exhausted,
          escalation: data.escalation,
        };
      }
    }
  } catch {
    /* Python server offline or fetch error */
  }

  // 2. Thử gọi Go Backend (/student/hints)
  try {
    const res = (await apiFetch("/student/hints", {
      method: "POST",
      body: JSON.stringify({ topicId, pressCount }),
    })) as any;
    if (res && (res.content || res.text)) {
      return {
        content: res.content || res.text,
        text: res.content || res.text,
        level: pressCount,
      };
    }
  } catch {
    /* Go backend offline */
  }

  // 3. FALLBACK CỤC BỘ TỨC THÌ (Local Dynamic Socratic Hint)
  const level = Math.min(pressCount, 3);
  let text = "";
  if (level === 1) {
    text = `Trước khi làm tiếp, em tự hỏi: với bài học này, bước đầu tiên cần kiểm tra điều gì? (Gợi mở Socratic Bậc 1)`;
  } else if (level === 2) {
    text = `Nhớ lại nguyên lý nền tảng của bài học: Xác định đúng định nghĩa, công thức gốc và điều kiện xác định. Từ nguyên lý đó, em suy ra bước làm tiếp theo xem! (Gợi mở Bậc 2 - First Principles)`;
  } else {
    text = `Làm thử ví dụ nhỏ nhất của bài học rồi áp dụng y hệt các bước đó vào bài đang làm. Gợi ý cụ thể: Viết lại biểu thức theo dạng tiêu chuẩn. (Gợi mở Bậc 3 - Bottom-out)`;
  }

  return {
    content: text,
    text: text,
    level: level,
    video_url: undefined,
    scene_name: undefined,
  };
};

export const getBadges = () => apiFetch("/student/badges") as Promise<GameSummary>;

// Sự kiện Feynman: học sinh giảng lại bài + điểm Clarity → nguồn cho "Chỉ số Feynman Clarity" ở dashboard GV.
export interface FeynmanEventPayload {
  nodeId: string;
  explanation: string;
  clarityScore: number;
  subScores: Record<string, number>;
  vagueSpots: string[];
}
export const postFeynmanEvent = (payload: FeynmanEventPayload) =>
  apiFetch("/events/feynman", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<{ ok: boolean }>;

export interface FeynmanScoreResult {
  topic: string;
  clarityScore: number;
  subScores: Record<string, number>;
  vagueSpots: string[];
  followUps: string[];
}

// Chấm Tập Vở Feynman bằng LLM; timeout ngắn để rơi về heuristic local khi offline.
export const scoreFeynman = (nodeId: string, explanation: string) =>
  apiFetch("/feynman/score", {
    method: "POST",
    body: JSON.stringify({ nodeId, explanation }),
    signal: AbortSignal.timeout(15000),
  }) as Promise<FeynmanScoreResult>;

export const getStudentState = (subject: string) =>
  apiFetch(`/subjects/${encodeURIComponent(subject)}/state`) as Promise<{
    id: string;
    studentId: string;
    subject: string;
    initialLevelNodeId: string;
    currentLevelNodeId: string;
    needsDiagnostic: boolean;
  }>;

export const getExams = (subject: string) =>
  apiFetch(`/student/exams?subject=${encodeURIComponent(subject)}`) as Promise<any[]>;

export const getExam = (examId: string) =>
  apiFetch(`/student/exams/${examId}`) as Promise<{
    exam: any;
    questions: any[];
  }>;

export const submitExam = (examId: string, answers: Record<string, string>) =>
  apiFetch(`/student/exams/${examId}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  }) as Promise<{ totalScore: string; maxScore: string }>;

export const submitAdaptiveAnswer = (examId: string, questionId: string, selectedChoiceId: string) =>
  apiFetch(`/student/exams/${examId}/adaptive/answer`, {
    method: "POST",
    body: JSON.stringify({ questionId, selectedChoiceId }),
  }) as Promise<{
    isFinished: boolean;
    isCorrect: boolean;
    nextQuestion?: any;
    summaries?: any[];
  }>;

export const submitCantDo = (nodeId: string) =>
  apiFetch(`/nodes/${nodeId}/cant-do`, {
    method: "POST",
  }) as Promise<{
    parents: Array<{ id: string; name: string }>;
    hasEasyQ: boolean;
  }>;

export const submitAdaptiveDowngrade = (nodeId: string) =>
  apiFetch(`/subjects/nodes/${nodeId}/adaptive-downgrade`, {
    method: "POST",
  }) as Promise<{
    hasParent: boolean;
    parentId: string;
    parentName: string;
  }>;

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
  const masteryOf = (id: string) => {
    const t = mastery.topics?.[id];
    if (!t || t.masteryStatus === "unknown") return 0;
    return t.masteryProbability;
  };

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
