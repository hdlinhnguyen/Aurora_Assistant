"use client";

/**
 * Aurora Tutor Hub — màn học sinh học bài (redesign "một chạm").
 * Đã nối API THẬT: subjects/tree/learning-path/mastery/questions/answer/chat-theory/hints/badges.
 * Gamification (sao, streak, huy hiệu) lấy từ GET /student/badges (dẫn xuất từ hoạt động thật).
 */

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  buildRoadmap,
  chatTheory,
  getBadges,
  getLearningPath,
  getMastery,
  getQuestions,
  getSubjects,
  getTree,
  mapQuestion,
  requestHint,
  submitAnswer,
  getStudentState,
  getExams,
  getExam,
  resetDiagnostic,
  submitExam,
  submitAdaptiveAnswer,
  submitCantDo,
  submitAdaptiveDowngrade,
  getReviewPath,
  type GameSummary,
  type HubNode,
  type HubEdge,
  type HubQuestion,
  type MasteryProfile,
  type RoadmapStep,
  type ReviewItem,
} from "./hub/api";
import MascotCompanion, { type MascotState } from "@/app/components/MascotCompanion";
import Character from "@/app/tutor/components/Character";
import GuidedTour from "@/app/components/GuidedTour";
import { computeTracePath } from "@/lib/rootCauseTrace";
import { SafeHtml } from "@/components/ui/safe-html";
import KnowledgeTree from "../components/KnowledgeTree";
import {
  BookOpen,
  PenTool,
  MessageSquare,
  FileText,
  LogOut,
  Clock,
  GraduationCap,
  Trophy,
  BarChart3,
  RefreshCw,
  Lock,
  TrendingUp,
  TrendingDown,
  ClipboardList,
  CornerDownLeft,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Rocket,
  Lightbulb,
  HelpCircle,
  AlertTriangle,
  Library,
  Key,
  ArrowRight,
  Check,
  Star,
  Flag,
  Map
} from "lucide-react";

const BALOO: CSSProperties = { fontFamily: "'Baloo 2', system-ui, sans-serif" };
const POPPINS: CSSProperties = { fontFamily: "'Poppins', system-ui, sans-serif" };
const COMPANION = { mascot: "/nova.png", name: "Nova" };

interface ChatMsg {
  sender: "ai" | "student";
  text: string;
}

const DIFF_STYLE: Record<string, CSSProperties> = {
  "Nhận biết": { background: "#e7f4fe", color: "#2a7cc0" },
  "Thông hiểu": { background: "#fff3dd", color: "#b7811f" },
  "Vận dụng": { background: "#ffeede", color: "#c26a1f" },
};

const CONFETTI_COLORS = ["#14D9C0", "#7C46E8", "#FFC24D", "#ff8fa3", "#5ac8fa"];
interface ConfettiPiece {
  left: number;
  color: string;
  dur: string;
  delay: string;
  rot: number;
}
function makeConfetti(n = 40): ConfettiPiece[] {
  return Array.from({ length: n }).map((_, i) => ({
    left: Math.round(Math.random() * 100),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    dur: (2 + Math.random() * 1.4).toFixed(2),
    delay: (Math.random() * 0.8).toFixed(2),
    rot: Math.round(Math.random() * 360),
  }));
}

function firstSentence(text: string, max = 120): string {
  const t = (text || "").trim();
  if (!t) return "";
  const end = t.search(/[.!?…]\s/);
  const s = end > 0 ? t.slice(0, end + 1) : t;
  return s.length > max ? s.slice(0, max).trim() + "…" : s;
}



export default function TutorHubPage() {
  // ---- data ----
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [nodes, setNodes] = useState<HubNode[]>([]);
  const [edges, setEdges] = useState<HubEdge[]>([]);
  const [mastery, setMastery] = useState<MasteryProfile>({ topics: {} });
  // Truy vết gốc rễ: đường đi [nút sai → ... → nút gốc] hiển thị trên cây tri thức
  const [traceModal, setTraceModal] = useState<{ path: string[]; rootId: string } | null>(null);
  // Lộ trình ôn tập cá nhân hoá (dựa trên BKT mastery)
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapStep[]>([]);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const router = useRouter();
  const [studentName, setStudentName] = useState("bạn");
  const [currentStepId, setCurrentStepId] = useState("");
  const [questions, setQuestions] = useState<HubQuestion[]>([]);
  const [qLoading, setQLoading] = useState(false);

  // ---- quiz / ui ----
  const [screen, setScreen] = useState<"lesson" | "complete">("lesson");
  const [activeTab, setActiveTab] = useState<"review" | "exams" | "roadmap">("roadmap");
  const [reviewLeftSubTab, setReviewLeftSubTab] = useState<"practice" | "theory">("practice");
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hintText, setHintText] = useState("");
  const [hintPress, setHintPress] = useState(0);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintLevel, setHintLevel] = useState<number | null>(null);
  const [hintVideoUrl, setHintVideoUrl] = useState<string | null>(null);
  const [hintSceneName, setHintSceneName] = useState<string | null>(null);
  const [correctSession, setCorrectSession] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [chatMascotState, setChatMascotState] = useState<MascotState>("waving");
  const [chatMascotSpeech, setChatMascotSpeech] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- diagnostic & exam states ----
  const [studentState, setStudentState] = useState<any | null>(null);
  const [skipDiagnostic, setSkipDiagnostic] = useState(false);
  const [examsList, setExamsList] = useState<any[]>([]);
  const [activeExam, setActiveExam] = useState<any | null>(null);
  const [examQuestions, setExamQuestions] = useState<any[]>([]);
  const [examAnswers, setExamAnswers] = useState<Record<string, string>>({}); // questionId -> choiceId
  const [examTimeRemaining, setExamTimeRemaining] = useState<number>(0);
  const [examTimerActive, setExamTimerActive] = useState<boolean>(false);
  const [examFinishedScore, setExamFinishedScore] = useState<{ totalScore: string; maxScore: string; summaries?: any[] } | null>(null);
  const [diagnosticMastery, setDiagnosticMastery] = useState<MasteryProfile | null>(null);
  const [loadingExam, setLoadingExam] = useState<boolean>(false);
  const [submittingExam, setSubmittingExam] = useState<boolean>(false);
  const [customExamCode, setCustomExamCode] = useState<string>("");
  const [examQIndex, setExamQIndex] = useState<number>(0);

  // ---- adaptive learning states ----
  const [cantDoOptions, setCantDoOptions] = useState<{ parents: Array<{ id: string; name: string }>; hasEasyQ: boolean } | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<string | null>(null);
  const [traversalStack, setTraversalStack] = useState<{ id: string; name: string; questionText?: string }[]>([]);
  const [bridgeText, setBridgeText] = useState<string | null>(null);

  // ---- load ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem("aurora_user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.name) setStudentName(u.name);
      }
    } catch {
      /* ignore */
    }
    const isDemoTour = localStorage.getItem("aurora_tour_demo_session") === "true";
    if (isDemoTour) {
      setSkipDiagnostic(true);
      setActiveTab("roadmap");
    }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    setLoadError(null);
    try {
      const subjects = await getSubjects();
      if (!subjects || subjects.length === 0) {
        setLoadError("Chưa có môn học nào. Hãy nhờ giáo viên tạo môn + cây kiến thức.");
        return;
      }
      // Chọn môn học sinh đang có dữ liệu học (nhiều mastery nhất); fallback môn đầu tiên.
      let subj = subjects[0];
      let masteryRes: MasteryProfile = { topics: {} };
      if (subjects.length > 1) {
        const masteries = await Promise.all(
          subjects.map((s) => getMastery(s).catch(() => ({ topics: {} }) as MasteryProfile)),
        );
        let best = -1;
        subjects.forEach((s, i) => {
          const count = Object.keys(masteries[i].topics ?? {}).length;
          if (count > best) {
            best = count;
            subj = s;
            masteryRes = masteries[i];
          }
        });
      } else {
        masteryRes = await getMastery(subj).catch(() => ({ topics: {} }) as MasteryProfile);
      }
      setSubject(subj);
      const [tree, pathRes, summaryRes, stateRes, examsRes] = await Promise.all([
        getTree(subj),
        getLearningPath().catch(() => ({ ordered_steps: [] })),
        getBadges().catch(() => null),
        getStudentState(subj).catch(() => null),
        getExams(subj).catch(() => []),
      ]);
      const rm = buildRoadmap(tree.nodes ?? [], tree.edges ?? [], pathRes.ordered_steps ?? [], masteryRes);
      setNodes(tree.nodes ?? []);
      setEdges(tree.edges ?? []);
      setMastery(masteryRes);
      getReviewPath(subj).then((r) => setReviewItems(r.items ?? [])).catch(() => setReviewItems([]));
      setRoadmap(rm);
      setSummary(summaryRes);
      setStudentState(stateRes);
      setExamsList(examsRes);
      const isDiag = stateRes === null || stateRes?.needsDiagnostic;
      if (isDiag && localStorage.getItem("aurora_tour_demo_session") !== "true") {
        setActiveTab("exams");
      }
      const cur = rm.find((s) => s.status === "current") ?? rm[0];
      const curId = cur?.id ?? "";
      setCurrentStepId(curId);
      resetChat(cur?.name ?? "");
      if (curId) await loadQuestions(curId);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Lỗi tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }

  function makeFallbackQuestions(nodeId: string, nodeName: string): any[] {
    const questionsList = [
      {
        q: `Chọn khẳng định đúng nhất khi tìm hiểu về khái niệm và bản chất của: **"${nodeName}"**?`,
        opts: [
          `Cần nắm vững định nghĩa cốt lõi và các tính chất nền tảng của "${nodeName}".`,
          `Có thể áp dụng máy móc các công thức tính toán mà không cần hiểu bản chất.`,
          `Có thể bỏ qua các bước biến đổi logic cơ bản khi làm bài tập tự luyện.`,
          `Định nghĩa lý thuyết hoàn toàn không có mối liên hệ thực tế nào cả.`,
        ],
        correct: 0,
        tag: "Nhận biết"
      },
      {
        q: `Khi giải các bài toán thuộc chuyên đề **"${nodeName}"**, hành vi nào dưới đây là chuẩn xác nhất?`,
        opts: [
          `Phân tích kỹ đề bài, đối chiếu với lý thuyết trước khi đặt bút biến đổi.`,
          `Thực hiện biến đổi ngẫu nhiên bỏ qua các điều kiện xác định.`,
          `Sử dụng máy tính cầm tay để ra kết quả luôn mà không cần hiểu các bước trung gian.`,
          `Không cần kiểm tra lại tính hợp lý của kết quả sau khi làm xong.`,
        ],
        correct: 0,
        tag: "Thông hiểu"
      },
      {
        q: `Mối quan hệ giữa chuyên đề **"${nodeName}"** và các kiến thức toán học khác được mô tả như thế nào?`,
        opts: [
          `Kiến thức này được thừa kế và liên kết chặt chẽ với các khái niệm nền tảng trước đó.`,
          `Đây là một chuyên đề hoàn toàn biệt lập, không có mối liên hệ với các bài học khác.`,
          `Học sinh không cần học các phép tính cơ bản vẫn có thể hiểu sâu sắc phần này.`,
          `Chỉ cần học thuộc lòng lý thuyết mà không cần thực hành giải toán là đủ.`,
        ],
        correct: 0,
        tag: "Vận dụng"
      }
    ];

    return questionsList.map((item, idx) => {
      const indexed = item.opts.map((opt, i) => ({ opt, isCorrect: i === item.correct }));
      const seed = nodeId.charCodeAt(0) + idx;
      const shuffled = [...indexed].sort((a, b) => {
        const valA = (a.opt.length + seed) % 7;
        const valB = (b.opt.length + seed) % 7;
        return valA - valB;
      });
      return {
        id: `demo-${nodeId}-${idx}`,
        nodeId,
        q: item.q,
        opts: shuffled.map(o => o.opt),
        correct: shuffled.findIndex(o => o.isCorrect),
        tag: item.tag,
      };
    });
  }

  async function loadQuestions(nodeId: string) {
    setQLoading(true);
    try {
      const raw = await getQuestions(nodeId);
      const mapped = (raw ?? []).map(mapQuestion);
      if (mapped.length === 0) {
        const targetNode = nodes.find((n) => n.id === nodeId);
        const nodeName = targetNode?.name || "Khái niệm Phân số";
        setQuestions(makeFallbackQuestions(nodeId, nodeName));
      } else {
        setQuestions(mapped);
      }
    } catch {
      const targetNode = nodes.find((n) => n.id === nodeId);
      const nodeName = targetNode?.name || "Khái niệm Phân số";
      setQuestions(makeFallbackQuestions(nodeId, nodeName));
    } finally {
      setQLoading(false);
      setQIndex(0);
      setSelected(null);
      setAnswered(false);
      setIsCorrect(false);
      setShowHint(false);
      setHintText("");
      setHintPress(0);
      setCorrectSession(0);
      setCantDoOptions(null);
      setDifficultyFilter(null);
    }
  }

  async function refreshProgress() {
    const [m, s] = await Promise.all([
      getMastery(subject).catch(() => null),
      getBadges().catch(() => null),
    ]);
    if (m) setMastery(m);
    if (s) setSummary(s);
    refreshReviewPath();
  }

  // ---- Exam & Adaptive Functions ----
  useEffect(() => {
    let interval: any;
    if (examTimerActive && examTimeRemaining > 0) {
      interval = setInterval(() => {
        setExamTimeRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setTimeout(() => {
              handleAutoSubmitExam();
            }, 100);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [examTimerActive, examTimeRemaining]);

  async function handleStartExam(examId: string) {
    const id = examId.trim();
    if (!id) {
      toast.error("Vui lòng nhập mã đề thi hợp lệ.");
      return;
    }
    setLoadingExam(true);
    try {
      const data = await getExam(id);
      if (data && data.exam) {
        setActiveExam(data.exam);
        setExamQuestions(data.questions || []);
        setExamAnswers({});
        setExamQIndex(0);
        setExamFinishedScore(null);
        if (data.exam.durationMinutes > 0) {
          setExamTimeRemaining(data.exam.durationMinutes * 60);
          setExamTimerActive(true);
        } else {
          setExamTimeRemaining(0);
          setExamTimerActive(false);
        }
        toast.success(`Bắt đầu làm bài thi: ${data.exam.title}`);
      } else {
        toast.error("Không tìm thấy thông tin đề thi.");
      }
    } catch (err: any) {
      toast.error("Lỗi khi tải đề thi: " + (err.message || err));
    } finally {
      setLoadingExam(false);
    }
  }

  async function handleResetDiagnostic() {
    const ok = window.confirm(
      "Bạn có chắc chắn muốn thi lại bài chẩn đoán không?\nToàn bộ dữ liệu BKT mastery cũ và lịch sử học tập của môn học này sẽ được đặt lại từ đầu để bắt đầu làm bài mới."
    );
    if (!ok) return;

    try {
      setLoading(true);
      const res = await resetDiagnostic(subject);
      if (res && res.success) {
        toast.success("Đã reset trạng thái chẩn đoán! Hãy tiến hành làm bài đánh giá mới.");
        await loadAll();
      } else {
        toast.error("Không thể reset trạng thái chẩn đoán.");
        setLoading(false);
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Đã xảy ra lỗi khi reset trạng thái chẩn đoán: " + (e?.message || e));
      setLoading(false);
    }
  }

  async function handleSubmitExam(force = false) {
    if (!activeExam) return;
    if (!force && !window.confirm("Bạn có chắc chắn muốn nộp bài thi không?")) {
      return;
    }
    setSubmittingExam(true);
    setExamTimerActive(false);
    try {
      const res = await submitExam(activeExam.id, examAnswers);
      setExamFinishedScore({
        totalScore: res.totalScore,
        maxScore: res.maxScore,
      });
      setActiveExam(null);
      toast.success("Nộp bài thi thành công!");
    } catch (err: any) {
      toast.error("Lỗi khi nộp bài thi: " + (err.message || err));
      setExamTimerActive(true);
    } finally {
      setSubmittingExam(false);
    }
  }

  async function handleAdaptiveAnswer() {
    const currentQuestion = examQuestions[examQIndex];
    if (!currentQuestion) return;
    const selectedAnswer = examAnswers[currentQuestion.id];
    if (!selectedAnswer) {
      toast.error("Vui lòng chọn phương án trả lời trước.");
      return;
    }
    setSubmittingExam(true);
    try {
      const res = await submitAdaptiveAnswer(activeExam.id, currentQuestion.id, selectedAnswer);
      if (res.isFinished) {
        toast.success("Hoàn thành bài đánh giá chẩn đoán!");
        setExamFinishedScore({ totalScore: "Hoàn thành", maxScore: "Chẩn đoán", summaries: res.summaries || [] });
        setActiveExam(null);
      } else if (res.nextQuestion) {
        setExamQuestions((prev) => [...prev, res.nextQuestion]);
        setExamQIndex((idx) => idx + 1);
      } else {
        toast.error("Không tìm thấy câu hỏi tiếp theo.");
      }
    } catch (err: any) {
      toast.error("Lỗi khi gửi câu trả lời: " + (err.message || err));
    } finally {
      setSubmittingExam(false);
    }
  }

  function handleAutoSubmitExam() {
    toast.warning("Hết giờ làm bài! Hệ thống tự động nộp bài của bạn.");
    handleSubmitExam(true);
  }

  async function handleCantDo() {
    if (!currentStepId || submitting) return;
    if (hintPress >= 3) {
      await handleAdaptiveDowngrade(currentStepId);
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitCantDo(currentStepId);
      setCantDoOptions(res);
      toast.info("Đã ghi nhận khó khăn. Xem đề xuất học tập nhé!");
    } catch (err: any) {
      toast.error("Lỗi xử lý: " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function triggerLLMSocraticBridge(origNode: { id: string; name: string; questionText?: string }, parentNode: { id: string; name: string }) {
    try {
      const bRes = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bridge",
          original_topic_name: origNode.name,
          original_question_text: origNode.questionText || "",
          remedial_topic_name: parentNode.name,
        }),
      }).then((r) => r.json());
      if (bRes.bridge_text) {
        setBridgeText(bRes.bridge_text);
      }
    } catch {
      setBridgeText(
        `Em đã xuất sắc làm chủ kiến thức nền tảng '${parentNode.name}'! Bây giờ hãy áp dụng nguyên lý vừa học để quay trở lại làm bài ban đầu '${origNode.name}' nhé!`
      );
    }
  }

  async function handleAdaptiveDowngrade(nodeId: string) {
    try {
      const res = await submitAdaptiveDowngrade(nodeId);
      if (res.hasParent) {
        toast.warning(`⚠️ NHẬN DIỆN HỔNG KIẾN THỨC NỀN: Cùng lùi về ôn tập Nút Cha tiên quyết "${res.parentName}" trước nhé!`);
        const origNode = nodes.find((n) => n.id === nodeId);
        const parentNode = nodes.find((n) => n.id === res.parentId);

        setTraversalStack([
          { id: nodeId, name: origNode?.name || "Bài ban đầu", questionText: q?.q || "" },
          { id: res.parentId, name: res.parentName },
        ]);

        // Truy vết gốc rễ: từ bài học sinh đầu tiên bị kẹt (đáy traversalStack)
        // đến nút cha vừa chẩn đoán — hiển thị animation lan màu trên cây tri thức.
        const originFailedId = traversalStack.length > 0 ? traversalStack[0].id : nodeId;
        const path = computeTracePath(originFailedId, res.parentId, edges);
        if (path.length >= 2) {
          setTraceModal({ path, rootId: res.parentId });
        }

        if (parentNode) {
          setCurrentStepId(parentNode.id);
          setQIndex(0);
          setSelected(null);
          setAnswered(false);
          setShowHint(false);
          setHintText("");
          setHintPress(0);
          setIsCorrect(false);
          setCorrectSession(0);
          resetChat(parentNode.name);
          loadQuestions(parentNode.id);
        }
      } else {
        toast.warning("⚠️ Em đã ở Nút gốc nền tảng của bài học. Hãy đọc lại lý thuyết nhé!");
        setReviewLeftSubTab("theory");
      }
    } catch (err: any) {
      console.error("Lỗi hạ cấp thích ứng:", err);
    }
  }

  function handleChooseEasier() {
    setDifficultyFilter("easy");
    setCantDoOptions(null);
    setQIndex(0);
    setSelected(null);
  }

  function resetChat(lessonName: string) {
    setChat([
      {
        sender: "ai",
        text: `Chào ${studentName}! Có gì chưa rõ ở bài "${lessonName || "này"}" cứ hỏi ${COMPANION.name} nhé, ${COMPANION.name} sẽ gợi mở để em tự nghĩ ra!`,
      },
    ]);
    setChatMascotState("waving");
    setChatMascotSpeech(`Chào ${studentName}! Có thắc mắc ở bài "${lessonName || "này"}", cứ nhắn cho Nova nhé! 👋`);
  }

  // ---- derived ----
  const needsDiagnostic = !skipDiagnostic && (studentState === null || studentState?.needsDiagnostic);

  useEffect(() => {
    const handleTourTab = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === "exams") setActiveTab("exams");
      else if (detail === "theory" || detail === "practice" || detail === "chat") {
        setActiveTab("review");
        if (detail === "theory" || detail === "practice") setReviewLeftSubTab(detail);
      } else if (detail === "graph") setActiveTab("roadmap");
    };
    window.addEventListener("aurora-tour-switch-student-tab", handleTourTab);
    return () => window.removeEventListener("aurora-tour-switch-student-tab", handleTourTab);
  }, []);
  const currentNode = nodes.find((n) => n.id === currentStepId);
  const filteredQuestions = difficultyFilter
    ? questions.filter((item) => item.tag === "Nhận biết")
    : questions;
  const q = filteredQuestions[qIndex];
  const qTotal = filteredQuestions.length;
  const questionTheoryNode = q?.nodeId ? nodes.find((n) => n.id === q.nodeId) : undefined;
  const reviewTheoryNode = questionTheoryNode ?? currentNode;
  const reviewTheoryText =
    reviewTheoryNode?.theory?.trim() ||
    "Nội dung lý thuyết cho câu này đang được cập nhật. Em có thể trò chuyện với Nova hoặc luyện tập trắc nghiệm nhé!";
  const reviewQuestionPreview = q?.q ? firstSentence(q.q.replace(/<[^>]*>/g, "").trim(), 150) : "";
  const doneCount = roadmap.filter((s) => s.status === "done").length;
  const totalSteps = roadmap.length || 1;
  const chapterPct = Math.round((doneCount / totalSteps) * 100);
  const lessonIndex = Math.max(0, roadmap.findIndex((s) => s.id === currentStepId));
  const chapterName = currentNode?.topicGroup || subject || "Kiến thức";
  const currentMastery = mastery.topics?.[currentStepId];
  const masteryPct = currentMastery && currentMastery.masteryStatus !== "unknown"
    ? Math.round(currentMastery.masteryProbability * 100)
    : 0;
  const stars = summary?.stars ?? 0;
  const streak = summary?.currentStreak ?? 0;
  const lessonBlurb =
    firstSentence(currentNode?.theory ?? "") || `Cùng khám phá bài học này với ${COMPANION.name} nhé!`;

  function fire(durationMs: number) {
    setConfetti(makeConfetti());
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), durationMs);
  }

  function selectStep(step: RoadmapStep) {
    if (step.id === currentStepId) return;
    setCurrentStepId(step.id);
    setActiveTab("review");
    setReviewLeftSubTab("practice");
    resetChat(step.name);
    loadQuestions(step.id);
  }

  function goToReviewNode(nodeId: string, name: string) {
    setCurrentStepId(nodeId);
    setActiveTab("review");
    setReviewLeftSubTab("practice");
    resetChat(name);
    loadQuestions(nodeId);
  }

  // Làm mới lộ trình ôn tập sau khi mastery đổi (trả lời đúng/sai xong).
  function refreshReviewPath() {
    if (!subject) return;
    getReviewPath(subject).then((r) => setReviewItems(r.items ?? [])).catch(() => {});
  }

  function selectOpt(i: number) {
    if (answered) return;
    setSelected(i);
  }

  async function submit() {
    if (selected === null || answered || submitting || !q) return;
    setSubmitting(true);
    try {
      const res = await submitAnswer(currentStepId, q.id, selected);
      setAnswered(true);
      setIsCorrect(res.isCorrect);
      if (res.isCorrect) {
        setCorrectSession((c) => c + 1);
        fire(2600);
        refreshProgress();

        if (traversalStack.length > 1) {
          triggerLLMSocraticBridge(traversalStack[0], traversalStack[1]);
        }
      }
    } catch {
      // vẫn chấm cục bộ nếu mạng lỗi, để không kẹt luồng học
      const ok = selected === q.correct;
      setAnswered(true);
      setIsCorrect(ok);
      if (ok) {
        setCorrectSession((c) => c + 1);
        fire(2600);

        if (traversalStack.length > 1) {
          triggerLLMSocraticBridge(traversalStack[0], traversalStack[1]);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (qIndex >= qTotal - 1) {
      setScreen("complete");
      fire(3200);
      refreshProgress();
      return;
    }
    setQIndex((i) => i + 1);
    setSelected(null);
    setAnswered(false);
    setShowHint(false);
    setHintText("");
    setHintPress(0);
    setIsCorrect(false);
  }

  function restart() {
    setScreen("lesson");
    setActiveTab("review");
    setReviewLeftSubTab("theory");
    setQIndex(0);
    setSelected(null);
    setAnswered(false);
    setShowHint(false);
    setHintText("");
    setHintPress(0);
    setHintLevel(null);
    setHintVideoUrl(null);
    setHintSceneName(null);
    setIsCorrect(false);
    setCorrectSession(0);
  }

  async function doHint() {
    if (hintLoading) return;
    setHintLoading(true);
    const topicName = currentNode?.name || subject || "Bài học";
    const questionText = q?.q || "";
    console.log("[HINT_BUTTON_CLICKED]", {
      stepId: currentStepId,
      topicName,
      questionText,
      pressCount: hintPress + 1,
    });
    toast.info(`[HINT LOG] Đang xin gợi ý Bậc ${hintPress + 1} cho bài "${topicName}"...`);

    try {
      const res = await requestHint(currentStepId, hintPress + 1, topicName, questionText);
      console.log("[HINT_API_RESPONSE]", res);
      setHintPress((p) => p + 1);
      setHintText(res.text || res.content?.trim() || `Em thử đọc kỹ lại bài "${topicName}" và nhớ lại lý thuyết nhé!`);
      setHintLevel(res.level ?? null);
      setHintVideoUrl(res.video_url ?? null);
      setHintSceneName(res.scene_name ?? null);
      toast.success(`[HINT LOG] Đã nhận gợi ý Bậc ${res.level || 1} cho bài "${topicName}"`);
    } catch (err: any) {
      console.error("[HINT_ERROR]", err);
      toast.error(`[HINT LOG Lỗi] ${err.message || "Không thể lấy gợi ý"}`);
      setHintText(`Gợi ý đang tạm nghỉ. Em thử suy nghĩ theo lý thuyết bài "${topicName}" ở tab 📖 nhé!`);
    } finally {
      setShowHint(true);
      setHintLoading(false);
    }
  }

  async function sendMessage(text: string) {
    const val = text.trim();
    if (!val || chatSending || !currentStepId) return;
    const history = chat.map((m) => ({ sender: m.sender, content: m.text }));
    setChat((c) => [...c, { sender: "student", text: val }]);
    setChatSending(true);
    setChatMascotState("thinking");
    setChatMascotSpeech("Nova đang suy nghĩ và phân tích câu hỏi của em nha... 🤔💭");
    try {
      const res = await chatTheory(currentStepId, val, history, q?.q);
      setChat((c) => [...c, { sender: "ai", text: res.reply }]);
      setChatMascotState("review");
      setChatMascotSpeech("Nova đã gợi ý xong! Em đọc kỹ và thử suy nghĩ xem sao nhé 💡");
    } catch {
      setChat((c) => [...c, { sender: "ai", text: "Mình đang bận chút xíu, em thử hỏi lại nhé! 😊" }]);
      setChatMascotState("failed");
      setChatMascotSpeech("Lỗi kết nối chút xíu, em thử nhắn lại câu hỏi giúp Nova nha 😅");
    } finally {
      setChatSending(false);
    }
  }

  async function triggerReviewSocraticHint() {
    if (answered || hintLoading || !currentStepId || !q) return;
    setHintLoading(true);
    const nextPress = hintPress + 1;
    setHintPress(nextPress);
    
    setChat((c) => [...c, { sender: "student", text: `Nova ơi, gợi ý cho mình Câu ${qIndex + 1} với! 💡` }]);
    setChatSending(true);
    setChatMascotState("thinking");
    setChatMascotSpeech("Nova đang xem qua câu hỏi và chuẩn bị gợi ý Socratic cho em nhé... 🤔");
    
    try {
      const res = await requestHint(currentStepId, nextPress, currentNode?.name, q.q);
      
      setChat((c) => [...c, { sender: "ai", text: res.text || "Em hãy nhớ lại lý thuyết bài học và thử suy nghĩ xem!" }]);
      setChatMascotState("review");
      setChatMascotSpeech("Nova đã gợi ý xong! Em xem gợi ý trong phần chat bên phải nhé! 💡");
      
      if (res.exhausted && res.escalation) {
        const cantDoRes = await submitCantDo(currentStepId);
        setCantDoOptions(cantDoRes);
      }
    } catch {
      setChat((c) => [...c, { sender: "ai", text: `Gợi ý đang tạm nghỉ. Em thử suy nghĩ theo lý thuyết bài "${currentNode?.name}" nhé!` }]);
      setChatMascotState("failed");
    } finally {
      setChatSending(false);
      setHintLoading(false);
    }
  }

  function onSubmitChat(e: FormEvent) {
    e.preventDefault();
    const el = inputRef.current;
    const val = el ? el.value.trim() : "";
    if (!val) return;
    if (el) el.value = "";
    sendMessage(val);
  }

  // ---- styles ----
  const tabBase: CSSProperties = {
    ...POPPINS,
    borderRadius: 14,
    padding: "11px 18px",
    fontSize: 14,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    transition: "all .15s",
  };
  const tabOn: CSSProperties = { ...tabBase, background: "#16161F", color: "#fff", border: "none" };
  const tabOff: CSSProperties = { ...tabBase, background: "#fff", color: "#5b6072", border: "1px solid #eef1f4" };
  const isLastAnswered = answered && qIndex >= qTotal - 1;

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#F4FBF9" }}>
        <div style={{ textAlign: "center", color: "#5b6072" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <RefreshCw className="animate-spin" size={36} style={{ color: "#0FB9A6" }} />
          </div>
          <div style={{ ...POPPINS, fontWeight: 700 }}>Đang tải không gian học…</div>
        </div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#F4FBF9", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <GraduationCap size={44} style={{ color: "#c23a54" }} />
          </div>
          <div style={{ ...POPPINS, fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Chưa tải được</div>
          <div style={{ color: "#5b6072", fontSize: 14, marginBottom: 18 }}>{loadError}</div>
          <button
            onClick={loadAll}
            style={{
              ...POPPINS,
              border: "none",
              background: "linear-gradient(135deg,#14D9C0,#0FB9A6)",
              color: "#fff",
              borderRadius: 12,
              padding: "12px 22px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        minHeight: 720,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#F4FBF9",
        fontFamily: "'Inter', sans-serif",
        color: "#16161F",
      }}
    >
      {/* ============ TOP NAVBAR ============ */}
      <header
        style={{
          height: 64,
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #eef1f4",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        {/* Left: Brand logo & Name + Subject info */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src="/icon.png"
              alt="Aurora"
              style={{
                height: 34,
                width: 34,
                borderRadius: 10,
                objectFit: "cover",
              }}
            />
            <div>
              <div style={{ ...POPPINS, fontWeight: 800, fontSize: 15, lineHeight: 1 }}>Aurora</div>
              <div style={{ fontSize: 10, color: "#9aa1b0", marginTop: 2 }}>Học thật, hiểu thật</div>
            </div>
          </div>
          <div style={{ width: 1, height: 24, background: "#eef1f4" }} />
          <div
            style={{
              background: "#f4f6f9",
              border: "1px solid #eef1f4",
              borderRadius: 10,
              padding: "6px 12px",
              fontSize: 12.5,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>📐</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
              {subject}
            </span>
          </div>
        </div>

        {/* Center: Chapter Progress Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              ...POPPINS,
              fontSize: 11,
              fontWeight: 800,
              color: "#9aa1b0",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180, display: "inline-block", verticalAlign: "middle" }}>
              {chapterName}
            </span>
            <span style={{ color: "#0FB9A6", marginLeft: 6 }}>
              {doneCount}/{totalSteps} bài
            </span>
          </div>
          <div style={{ width: 120, height: 6, background: "#eef1f4", borderRadius: 6, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                background: "linear-gradient(90deg,#14D9C0,#0FB9A6)",
                borderRadius: 6,
                width: `${chapterPct}%`,
              }}
            />
          </div>
        </div>

        {/* Right: Gamification Info & User profile & Logout */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Stats: Streak & Stars */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "#fafbfc",
              border: "1px solid #eef1f4",
              borderRadius: 12,
              padding: "6px 12px",
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            <span title="Chuỗi học tập" style={{ cursor: "default" }}>🔥 {streak}</span>
            <div style={{ width: 1, height: 14, background: "#eef1f4" }} />
            <span title="Sao tích lũy" style={{ cursor: "default" }}>⭐ {stars}</span>
          </div>

          {/* User profile */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                ...POPPINS,
                height: 30,
                width: 30,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#ffd76f,#ff9f43)",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
                color: "#7a4b00",
                fontSize: 12,
              }}
            >
              {studentName.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {studentName}
            </span>
          </div>

          <div style={{ width: 1, height: 20, background: "#eef1f4" }} />

          {/* Logout */}
          <button
            onClick={() => {
              localStorage.clear();
              router.push("/");
            }}
            title="Đăng xuất"
            style={{
              ...POPPINS,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 12px",
              border: "1px solid #f8d3da",
              borderRadius: 10,
              background: "#fef3f5",
              color: "#c23a54",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all .15s",
            }}
          >
            <LogOut size={13} />
            <span>Thoát</span>
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ============ WORKSPACE ============ */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 34px 40px",
            background:
              "radial-gradient(680px 320px at 100% -6%, rgba(124,70,232,.09), transparent 62%), radial-gradient(560px 300px at -5% 0%, rgba(20,217,192,.10), transparent 60%)",
          }}
        >
          {/* lesson hero */}
          <div
            style={{
              background: "linear-gradient(120deg,#14D9C0,#0FB9A6)",
              borderRadius: 24,
              padding: "24px 28px",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 24px 46px -26px rgba(15,185,166,.75)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", right: -34, top: -40, height: 170, width: 170, borderRadius: "50%", background: "rgba(255,255,255,.13)" }} />
            <div style={{ position: "absolute", right: 80, bottom: -60, height: 120, width: 120, borderRadius: "50%", background: "rgba(255,255,255,.1)" }} />
            <div style={{ position: "relative", zIndex: 1, maxWidth: "62%" }}>
              <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", opacity: 0.92 }}>
                Bài {lessonIndex + 1} · {chapterName}
              </div>
              <div style={{ ...BALOO, fontWeight: 800, fontSize: 28, margin: "5px 0 6px", lineHeight: 1.1 }}>
                {currentNode?.name ?? "Bài học"}
              </div>
              <div style={{ fontSize: 13.5, opacity: 0.93, lineHeight: 1.5 }}>{lessonBlurb}</div>
            </div>
            <div
              style={{
                position: "relative",
                zIndex: 1,
                textAlign: "center",
                background: "rgba(255,255,255,.18)",
                backdropFilter: "blur(5px)",
                borderRadius: 20,
                padding: "16px 22px",
                minWidth: 104,
              }}
            >
              <div style={{ ...POPPINS, fontWeight: 800, fontSize: 26 }}>{masteryPct}%</div>
              <div style={{ fontSize: 10.5, opacity: 0.92, marginBottom: 8 }}>đã hiểu</div>
              <div style={{ height: 6, width: 74, background: "rgba(255,255,255,.32)", borderRadius: 6, margin: "0 auto" }}>
                <div style={{ height: 6, background: "#fff", borderRadius: 6, width: `${masteryPct}%` }} />
              </div>
            </div>
          </div>

          {/* merged tabs */}
          <div style={{ display: "flex", gap: 9, margin: "22px 0 18px", alignItems: "center" }}>
            {!needsDiagnostic ? (
              <>
                <div onClick={() => setActiveTab("roadmap")} style={activeTab === "roadmap" ? tabOn : tabOff}>
                  <Map size={15} /> Lộ trình ôn tập
                  {reviewItems.length > 0 && (
                    <span
                      style={{
                        background: activeTab === "roadmap" ? "rgba(255,255,255,.22)" : "#ffe1c4",
                        color: activeTab === "roadmap" ? "#fff" : "#c2560f",
                        fontSize: 11,
                        padding: "1px 8px",
                        borderRadius: 999,
                        fontFamily: "'Inter', sans-serif",
                        marginLeft: 4,
                      }}
                    >
                      {reviewItems.length}
                    </span>
                  )}
                </div>
                <div onClick={() => {
                  setActiveTab("review");
                  setReviewLeftSubTab("practice");
                }} style={activeTab === "review" ? tabOn : tabOff}>
                  <PenTool size={15} /> Ôn tập chuyên đề{" "}
                  <span
                    style={{
                      background: activeTab === "review" ? "rgba(255,255,255,.22)" : "#EFE9FD",
                      color: activeTab === "review" ? "#fff" : "#7C46E8",
                      fontSize: 11,
                      padding: "1px 8px",
                      borderRadius: 999,
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {qTotal}
                  </span>
                </div>
              </>
            ) : (
              <div style={{ ...POPPINS, fontSize: 13, fontWeight: 800, color: "#c23a54", background: "#fef3f5", border: "1px solid #f8d3da", padding: "10px 16px", borderRadius: 14, display: "flex", alignItems: "center", gap: 6 }}>
                <Lock size={15} /> Khóa lộ trình: Yêu cầu Đánh giá Chẩn đoán bắt buộc
              </div>
            )}
            <div onClick={() => setActiveTab("exams")} style={activeTab === "exams" ? tabOn : tabOff}>
              <FileText size={15} /> Đề thi & Kiểm tra
            </div>
            {!needsDiagnostic && (
              <div
                onClick={() =>
                  router.push(
                    `/tutor/feynman?${new URLSearchParams({
                      node: currentStepId,
                      name: currentNode?.name ?? "",
                      subject,
                      group: currentNode?.topicGroup ?? "",
                    }).toString()}`,
                  )
                }
                title="Giảng lại bài cho bé Nấm để kiểm tra em đã hiểu bản chất chưa"
                style={{
                  ...POPPINS,
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 16px",
                  borderRadius: 14,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  color: "#0d7a6c",
                  background: "linear-gradient(135deg,#e7fbf6,#fff)",
                  border: "1px solid #b8ede0",
                  boxShadow: "0 6px 14px -8px rgba(15,185,166,.4)",
                }}
              >
                <BookOpen size={15} /> Tập Vở Feynman
              </div>
            )}
          </div>

          {/* ===== LỘ TRÌNH ÔN TẬP (ROADMAP bản đồ uốn lượn — port từ design handoff) ===== */}
          {activeTab === "roadmap" && (
            <div className="ah-panel" style={{ animation: "rr-fade .3s ease-out", border: "1px solid #eef1f4", borderRadius: 26, background: "linear-gradient(180deg,#fff7ef 0%,#fff 180px)", boxShadow: "0 20px 50px -28px rgba(194,86,15,.35)", padding: "26px 22px 34px", overflow: "hidden" }}>
              <div style={{ textAlign: "center", marginBottom: 6 }}>
                <div style={{ ...BALOO, fontWeight: 800, fontSize: 23, color: "#c2560f", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Map size={24} style={{ color: "#c2560f" }} /> Lộ trình ôn tập của em
                </div>
                <div style={{ fontSize: 13, color: "#5b6072", fontWeight: 600, marginTop: 4 }}>Ôn từ gốc lên — mỗi chặng là một trạm, chinh phục để mở đường lên đỉnh 🏔️</div>
              </div>

              {reviewItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0", color: "#0FB9A6" }}>
                  <div style={{ fontSize: 44, marginBottom: 8 }}>🎉</div>
                  <div style={{ ...POPPINS, fontWeight: 800, fontSize: 17, color: "#16161F" }}>Tuyệt vời! Chưa có chặng nào cần ôn lại.</div>
                  <div style={{ fontSize: 13, color: "#9aa1b0", fontWeight: 600, marginTop: 4 }}>Gốc của em đang rất vững — cứ tiến lên bài mới nhé!</div>
                </div>
              ) : (
                <>
                  {/* legend */}
                  <div style={{ display: "flex", justifyContent: "center", gap: 16, margin: "14px 0 6px", flexWrap: "wrap" }}>
                    {([["#e05a7a", "Cần củng cố"], ["#e0912a", "Đang tiến bộ"], ["#0FB9A6", "Gần vững"]] as const).map(([c, label]) => (
                      <span key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#7c8194" }}>
                        <span style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />
                        {label}
                      </span>
                    ))}
                  </div>

                  {/* winding map */}
                  {(() => {
                    const rowH = 158, topPad = 92, CX = 350, OFF = 96, nodeR = 58;
                    const ROADMAP_ICONS = [BarChart3, BookOpen, PenTool, Trophy, Sparkles, Rocket, Lightbulb, GraduationCap];
                    const colorOf = (p: number) => (p >= 70 ? "#0FB9A6" : p >= 40 ? "#e0912a" : "#e05a7a");
                    const pts = reviewItems.map((_, i) => ({ cx: CX + (i % 2 === 0 ? -OFF : OFF), cy: topPad + i * rowH }));
                    const lastCy = pts.length ? pts[pts.length - 1].cy : topPad;
                    const finishPt = { cx: CX, cy: lastCy + rowH * 0.82 };
                    const mapH = finishPt.cy + 90;
                    const smooth = (arr: { cx: number; cy: number }[]) => {
                      if (!arr.length) return "";
                      let d = `M ${arr[0].cx} ${arr[0].cy}`;
                      for (let i = 1; i < arr.length; i++) {
                        const a = arr[i - 1], b = arr[i], my = (a.cy + b.cy) / 2;
                        d += ` C ${a.cx} ${my} ${b.cx} ${my} ${b.cx} ${b.cy}`;
                      }
                      return d;
                    };
                    const trailPath = smooth([...pts, finishPt]);
                    const sp = pts[0] || { cx: CX, cy: topPad };
                    return (
                      <div style={{ overflowX: "auto" }}>
                        <div style={{ position: "relative", width: 700, maxWidth: "100%", margin: "12px auto 0", height: mapH }}>
                          <svg width={700} height={mapH} viewBox={`0 0 700 ${mapH}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
                            <defs>
                              <linearGradient id="rr-trail" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0" stopColor="#ffb877" />
                                <stop offset="1" stopColor="#14D9C0" />
                              </linearGradient>
                            </defs>
                            <path d={trailPath} fill="none" stroke="#f0e2d2" strokeWidth={16} strokeLinecap="round" />
                            <path d={trailPath} fill="none" stroke="url(#rr-trail)" strokeWidth={7} strokeLinecap="round" strokeDasharray="2 17" />
                          </svg>

                          {/* station cards */}
                          {reviewItems.map((it, i) => {
                            const p = pts[i];
                            const color = colorOf(it.masteryPct);
                            const isStart = it.isStart ?? i === 0;
                            const nodeLeft = i % 2 === 0;
                            const cardW = 322, gap = 78;
                            const cardLeft = nodeLeft ? p.cx + gap : p.cx - gap - cardW;
                            return (
                              <div
                                key={it.nodeId}
                                className="rr-card"
                                onClick={() => goToReviewNode(it.nodeId, it.name)}
                                style={{ position: "absolute", top: p.cy, left: cardLeft, width: cardW, transform: "translateY(-50%)", background: "#fff", border: isStart ? "2px solid #ffb877" : "1px solid #eef1f4", borderRadius: 18, padding: "15px 16px", cursor: "pointer", zIndex: 3, boxShadow: "0 14px 30px -18px rgba(0,0,0,.28)" }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                                  {(() => {
                                    const IconComp = ROADMAP_ICONS[i % ROADMAP_ICONS.length];
                                    return (
                                      <div style={{ display: "grid", placeItems: "center", background: `${color}15`, color, padding: 6, borderRadius: 10 }}>
                                        <IconComp size={18} strokeWidth={2.5} />
                                      </div>
                                    );
                                  })()}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <span style={{ ...POPPINS, fontWeight: 800, fontSize: 14.5, color: "#16161F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                                      {isStart && <span style={{ ...POPPINS, flexShrink: 0, background: "#c2560f", color: "#fff", borderRadius: 6, padding: "2px 7px", fontSize: 9, fontWeight: 800 }}>Bắt đầu</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#9aa1b0", fontWeight: 600, marginTop: 1 }}>{it.topicGroup}</div>
                                  </div>
                                  <span style={{ ...POPPINS, fontWeight: 800, fontSize: 15, color, flexShrink: 0 }}>{it.masteryPct}%</span>
                                </div>
                                <div style={{ height: 7, background: "#eef1f4", borderRadius: 7, marginBottom: 10, overflow: "hidden" }}>
                                  <div style={{ height: 7, borderRadius: 7, width: `${it.masteryPct}%`, background: color }} />
                                </div>
                                 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: "#c2560f", background: "#fff1e5", border: "1px solid #ffdcc0", borderRadius: 8, padding: "4px 9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.reason}</span>
                                  <span style={{ ...POPPINS, fontWeight: 800, fontSize: 12.5, color: "#fff", background: "linear-gradient(135deg,#8B5CF6,#7C46E8)", borderRadius: 10, padding: "7px 14px", flexShrink: 0, boxShadow: "0 8px 16px -8px rgba(124,70,232,.6)" }}>Ôn ngay →</span>
                                </div>
                              </div>
                            );
                          })}

                          {/* station medallions */}
                          {reviewItems.map((it, i) => {
                            const p = pts[i];
                            const color = colorOf(it.masteryPct);
                            const isStart = it.isStart ?? i === 0;
                            return (
                              <div key={it.nodeId} onClick={() => goToReviewNode(it.nodeId, it.name)} style={{ position: "absolute", left: p.cx, top: p.cy, width: nodeR, height: nodeR, transform: "translate(-50%,-50%)", cursor: "pointer", zIndex: 4 }}>
                                {isStart && <div style={{ position: "absolute", inset: -7, borderRadius: "50%", border: "3px solid #ff9d4d", animation: "rr-pulse 1.9s ease-out infinite" }} />}
                                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `conic-gradient(${color} ${it.masteryPct}%, #f0e2d2 0)`, boxShadow: "0 10px 20px -8px rgba(0,0,0,.28)", border: "3px solid #fff" }}>
                                  <div style={{ position: "absolute", inset: 5, borderRadius: "50%", background: "#fff", display: "grid", placeItems: "center", ...POPPINS, fontWeight: 800, fontSize: 21, color }}>{it.order ?? i + 1}</div>
                                </div>
                              </div>
                            );
                          })}

                          {/* start avatar */}
                          <div style={{ position: "absolute", left: sp.cx, top: sp.cy - 68, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 5, pointerEvents: "none", animation: "rr-bob 2.4s ease-in-out infinite" }}>
                            <div style={{ ...POPPINS, background: "#c2560f", color: "#fff", fontSize: 9.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", boxShadow: "0 6px 12px -6px rgba(194,86,15,.6)", animation: "rr-flag 2.6s ease-in-out infinite" }}>Bắt đầu từ đây</div>
                            <Star size={34} fill="#ffd254" stroke="#c2560f" strokeWidth={2.5} style={{ filter: "drop-shadow(0 4px 10px rgba(255,157,77,0.5))" }} />
                          </div>

                          {/* finish */}
                          <div style={{ position: "absolute", left: finishPt.cx, top: finishPt.cy, transform: "translate(-50%,-50%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 4 }}>
                            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#14D9C0,#0FB9A6)", display: "grid", placeItems: "center", color: "#fff", boxShadow: "0 14px 26px -10px rgba(15,185,166,.6)", border: "4px solid #fff" }}>
                              <Flag size={30} fill="#fff" stroke="#fff" />
                            </div>
                            <div style={{ ...POPPINS, fontWeight: 800, fontSize: 13.5, color: "#0FB9A6", textAlign: "center", marginTop: 8, maxWidth: 200 }}>Đích — vững gốc, sẵn sàng chinh phục bài mới!</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* ===== ÔN TẬP CHUYÊN ĐỀ (REVIEW STUDIO) PANEL ===== */}
          {activeTab === "review" && (
            <div
              className="ah-panel"
              style={{
                background: "#ffffff",
                border: "1px solid #eef1f4",
                borderRadius: 28,
                padding: "26px 28px",
                boxShadow: "0 20px 50px -25px rgba(124, 70, 232, 0.09)",
                display: "flex",
                gap: 24,
                alignItems: "stretch",
                flexWrap: "wrap",
                width: "100%",
                minHeight: 600
              }}
            >
              
              {/* Left Column (58% width) - Practice & Theory */}
              <div style={{ flex: "1.2 1 500px", minWidth: 320, display: "flex", flexDirection: "column", gap: 16 }}>
                
                {/* Sub-tabs to toggle between Quiz and Theory */}
                <div style={{ display: "flex", gap: 8, background: "#f4f6f9", padding: 6, borderRadius: 14, width: "fit-content", border: "1px solid #eef1f4" }}>
                  <button
                    onClick={() => setReviewLeftSubTab("practice")}
                    style={{
                      ...POPPINS,
                      border: "none",
                      borderRadius: 10,
                      padding: "8px 16px",
                      fontSize: 12.5,
                      fontWeight: 800,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      background: reviewLeftSubTab === "practice" ? "#fff" : "transparent",
                      color: reviewLeftSubTab === "practice" ? "#7C46E8" : "#5b6072",
                      boxShadow: reviewLeftSubTab === "practice" ? "0 4px 10px -4px rgba(124,70,232,0.2)" : "none",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <ClipboardList size={14} />
                      Luyện tập
                    </span>
                  </button>
                  <button
                    onClick={() => setReviewLeftSubTab("theory")}
                    style={{
                      ...POPPINS,
                      border: "none",
                      borderRadius: 10,
                      padding: "8px 16px",
                      fontSize: 12.5,
                      fontWeight: 800,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      background: reviewLeftSubTab === "theory" ? "#fff" : "transparent",
                      color: reviewLeftSubTab === "theory" ? "#7C46E8" : "#5b6072",
                      boxShadow: reviewLeftSubTab === "theory" ? "0 4px 10px -4px rgba(124,70,232,0.2)" : "none",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <BookOpen size={14} />
                      Tóm tắt lý thuyết
                    </span>
                  </button>
                </div>

                {/* Sub-tab Content */}
                {reviewLeftSubTab === "practice" ? (
                  <div
                    data-tour="lesson-practice"
                    className="ah-panel"
                    style={{ background: "#fff", border: "1px solid #f1f5f9", borderRadius: 22, padding: "24px 26px", flex: 1 }}
                  >
                    {qLoading ? (
                      <div style={{ textAlign: "center", color: "#9aa1b0", padding: "40px 0", ...POPPINS, fontWeight: 700 }}>Đang tải câu hỏi…</div>
                    ) : !q ? (
                      <div style={{ textAlign: "center", color: "#9aa1b0", padding: "40px 0" }}>
                        <div style={{ fontSize: 30, marginBottom: 8 }}>📭</div>
                        <div style={{ ...POPPINS, fontWeight: 700 }}>Bài này chưa có câu hỏi luyện tập.</div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>Em thử xem phần tóm tắt lý thuyết hoặc trò chuyện với trợ lý AI nhé!</div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ ...POPPINS, fontSize: 11, fontWeight: 800, padding: "5px 13px", borderRadius: 999, textTransform: "uppercase", letterSpacing: ".04em", ...DIFF_STYLE[q.tag] }}>
                              {q.tag}
                            </span>
                            {difficultyFilter && (
                              <button
                                onClick={() => setDifficultyFilter(null)}
                                style={{
                                  ...POPPINS,
                                  borderRadius: 99,
                                  padding: "4px 10px",
                                  fontSize: 10,
                                  fontWeight: 850,
                                  background: "#faf7ff",
                                  border: "1px solid #ece5fb",
                                  color: "#7C46E8",
                                  cursor: "pointer",
                                }}
                              >
                                Xem tất cả ✕
                              </button>
                            )}
                          </span>
                          <span style={{ fontSize: 12, color: "#9aa1b0", fontWeight: 700 }}>
                            Câu {qIndex + 1} / {qTotal}
                          </span>
                        </div>

                        {traversalStack.length > 1 && (
                          <div style={{ marginBottom: 16, background: "linear-gradient(135deg, #1e1b4b, #312e81)", borderRadius: 14, padding: "12px 16px", border: "1px solid #6366f1", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, color: "#a5b4fc" }}>
                              <CornerDownLeft size={16} style={{ color: "#f87171" }} />
                              <span>Đang lùi Cây Tri thức về Nút Cha tiên quyết: <strong style={{ color: "#fbbf24" }}>"{currentNode?.name}"</strong></span>
                            </div>
                            <button
                              onClick={() => {
                                const orig = traversalStack[0];
                                if (orig) {
                                  setCurrentStepId(orig.id);
                                  setTraversalStack([]);
                                  setBridgeText(null);
                                  setQIndex(0);
                                  setSelected(null);
                                  setAnswered(false);
                                  setShowHint(false);
                                  setHintText("");
                                  setHintPress(0);
                                  setIsCorrect(false);
                                  resetChat(orig.name);
                                  loadQuestions(orig.id);
                                  toast.success(`🚀 Quay lại Nút gốc "${orig.name}"!`);
                                }
                              }}
                              style={{
                                ...POPPINS,
                                border: "none",
                                borderRadius: 10,
                                padding: "6px 12px",
                                background: "#c7d2fe",
                                color: "#1e1b4b",
                                fontWeight: 800,
                                fontSize: 11,
                                cursor: "pointer",
                              }}
                            >
                              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <RotateCcw size={13} />
                                Về nút gốc
                              </span>
                            </button>
                          </div>
                        )}

                        <div style={{ ...BALOO, fontWeight: 800, fontSize: 16, color: "#16161F", lineHeight: 1.5, marginBottom: 16 }}>
                          <SafeHtml text={q.q} />
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                          {q.opts.map((opt, i) => {
                            const isSel = selected === i;
                            const isCorrOpt = i === q.correct;
                            let cardStyle: CSSProperties = {
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              borderRadius: 16,
                              padding: "13px 16px",
                              cursor: answered ? "not-allowed" : "pointer",
                              fontSize: 14.5,
                              fontWeight: 600,
                              transition: "all .15s",
                            };

                            if (answered) {
                              if (isCorrOpt) {
                                cardStyle = { ...cardStyle, border: "2px solid #14D9C0", background: "#F3FBF9", color: "#0d7a6c" };
                              } else if (isSel) {
                                cardStyle = { ...cardStyle, border: "2px solid #F87171", background: "#FEF2F2", color: "#991b1b" };
                              } else {
                                cardStyle = { ...cardStyle, border: "1px solid #eef1f4", background: "#fcfdfe", color: "#9aa1b0", opacity: 0.8 };
                              }
                            } else {
                              if (isSel) {
                                cardStyle = { ...cardStyle, border: "2px solid #7C46E8", background: "#faf7ff", color: "#5b2fc0", boxShadow: "0 6px 16px -8px rgba(124,70,232,0.15)" };
                              } else {
                                cardStyle = { ...cardStyle, border: "1px solid #eef1f4", background: "#fff", color: "#4b5060" };
                              }
                            }

                            return (
                              <div
                                key={i}
                                onClick={() => selectOpt(i)}
                                className={`ah-choice-card ${answered ? "disabled" : ""}`}
                                style={cardStyle}
                              >
                                <span
                                  style={{
                                    height: 28,
                                    width: 28,
                                    borderRadius: 9,
                                    display: "grid",
                                    placeItems: "center",
                                    fontSize: 12.5,
                                    fontWeight: 800,
                                    background: isSel ? "#7C46E8" : "#f4f6f9",
                                    color: isSel ? "#fff" : "#9aa1b0",
                                  }}
                                >
                                  {["A", "B", "C", "D", "E"][i] ?? i}
                                </span>
                                <SafeHtml as="span" text={opt} style={{ flex: 1 }} />
                              </div>
                            );
                          })}
                        </div>

                        {answered && (
                          <div style={{ marginTop: 18, padding: 14, borderRadius: 16, background: isCorrect ? "#F3FBF9" : "#FEF2F2", border: isCorrect ? "1px solid #d4f2ea" : "1px solid #fecaca", display: "flex", gap: 10, alignItems: "flex-start", animation: "ah-pop .3s ease" }}>
                            {isCorrect ? (
                              <CheckCircle2 size={20} style={{ color: "#10b981", marginTop: 2, flexShrink: 0 }} />
                            ) : (
                              <AlertCircle size={20} style={{ color: "#ef4444", marginTop: 2, flexShrink: 0 }} />
                            )}
                            <div>
                              <div style={{ ...POPPINS, fontWeight: 800, fontSize: 13.5, color: isCorrect ? "#0d7a6c" : "#991b1b" }}>
                                {isCorrect ? "Đúng rồi! Tuyệt vời quá!" : "Chưa chính xác rồi em ơi."}
                              </div>
                              <p style={{ fontSize: 12.5, color: isCorrect ? "#1e8474" : "#b91c1c", margin: "4px 0 0", lineHeight: 1.5 }}>
                                {isCorrect
                                  ? "Em đã nắm được cách giải quyết bài toán này. Hãy chuyển sang câu tiếp theo nhé!"
                                  : "Đừng nản lòng nhé! Em có thể xem gợi ý lý thuyết hoặc nhờ Nova hướng dẫn từng bước."}
                              </p>
                            </div>
                          </div>
                        )}

                        {bridgeText && (
                          <div style={{ marginTop: 14, background: "linear-gradient(135deg, #047857, #065f46)", border: "1px solid #10b981", borderRadius: 16, padding: "16px 18px", color: "#fff", boxShadow: "0 10px 25px -5px rgba(6,95,70,0.3)" }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: "#6ee7b7", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                              <Sparkles size={14} style={{ color: "#fbbf24" }} />
                              <span>Cầu nối Tư duy Socratic (First Principles Bridge)</span>
                            </div>
                            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: "0 0 14px", color: "#ecfdf5", fontWeight: 600 }}>
                              {bridgeText}
                            </p>
                            <button
                              onClick={() => {
                                const orig = traversalStack[0];
                                if (orig) {
                                  setCurrentStepId(orig.id);
                                  setTraversalStack([]);
                                  setBridgeText(null);
                                  setQIndex(0);
                                  setSelected(null);
                                  setAnswered(false);
                                  setShowHint(false);
                                  setHintText("");
                                  setHintPress(0);
                                  setIsCorrect(false);
                                  resetChat(orig.name);
                                  loadQuestions(orig.id);
                                  toast.success(`🚀 Quay lại Nút gốc "${orig.name}"!`);
                                }
                              }}
                              style={{
                                border: "none",
                                borderRadius: 12,
                                padding: "10px 18px",
                                background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
                                color: "#0f172a",
                                fontWeight: 850,
                                fontSize: 13,
                                cursor: "pointer",
                                boxShadow: "0 8px 16px -4px rgba(245,158,11,0.5)",
                              }}
                            >
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <Rocket size={15} />
                                Quay trở lại thử sức Bài toán gốc "{traversalStack[0]?.name}"
                              </span>
                            </button>
                          </div>
                        )}

                        {cantDoOptions && (
                          <div style={{ marginTop: 14, background: "#faf7ff", border: "1px solid #ece5fb", borderRadius: 16, padding: "16px 18px" }}>
                            <div style={{ ...POPPINS, fontSize: 13, fontWeight: 800, color: "#5b2fc0", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                              <Lightbulb size={16} style={{ color: "#fbbf24" }} />
                              <span>Đề xuất từ {COMPANION.name}:</span>
                            </div>
                            <p style={{ fontSize: 12.5, color: "#5b6072", lineHeight: 1.5, margin: "0 0 12px" }}>
                              Em gặp khó khăn ở phần này ư? Đừng lo nhé, em có thể chọn giải pháp dưới đây để củng cố thêm:
                            </p>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              {cantDoOptions.hasEasyQ && !difficultyFilter && (
                                <button
                                  onClick={handleChooseEasier}
                                  style={{
                                    ...POPPINS,
                                    border: "none",
                                    borderRadius: 10,
                                    padding: "8px 12px",
                                    background: "linear-gradient(135deg,#14D9C0,#0FB9A6)",
                                    color: "#fff",
                                    fontWeight: 800,
                                    fontSize: 11.5,
                                    cursor: "pointer",
                                    boxShadow: "0 6px 12px -4px rgba(15,185,166,.4)",
                                  }}
                                >
                                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <Sparkles size={13} />
                                    Làm câu nhận biết (Dễ hơn)
                                  </span>
                                </button>
                              )}
                              {cantDoOptions.parents && cantDoOptions.parents.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => {
                                    const parentNode = nodes.find((n) => n.id === p.id);
                                    if (parentNode) {
                                      setCurrentStepId(parentNode.id);
                                      setQIndex(0);
                                      setSelected(null);
                                      setAnswered(false);
                                      setShowHint(false);
                                      setHintText("");
                                      setHintPress(0);
                                      setIsCorrect(false);
                                      setCorrectSession(0);
                                      setCantDoOptions(null);
                                      setDifficultyFilter(null);
                                      resetChat(parentNode.name);
                                      loadQuestions(parentNode.id);
                                      setChat((c) => [...c, { sender: "student", text: "Mình muốn lùi về ôn bài nền tảng." }, { sender: "ai", text: `Đường rồi! Chúng mình cùng lùi về ôn tập kiến thức nền tảng: "${parentNode.name}". Cố lên nhé!` }]);
                                      toast.info(`Đang chuyển về bài học nền tảng: ${parentNode.name}`);
                                    }
                                  }}
                                  style={{
                                    ...POPPINS,
                                    border: "1px solid #ece5fb",
                                    borderRadius: 10,
                                    padding: "8px 12px",
                                    background: "#fff",
                                    color: "#7C46E8",
                                    fontWeight: 800,
                                    fontSize: 11.5,
                                    cursor: "pointer",
                                  }}
                                >
                                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <Library size={13} />
                                    Ôn bài nền tảng: {p.name}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, borderTop: "1px solid #f2f4f7", paddingTop: 16 }}>
                          <button
                            onClick={handleCantDo}
                            disabled={submitting || answered}
                            className="ah-btn-cantdo"
                            style={{
                              ...POPPINS,
                              border: "1px solid #fee2e2",
                              borderRadius: 12,
                              padding: "11px 20px",
                              background: "#fef2f2",
                              color: "#ef4444",
                              fontWeight: 800,
                              fontSize: 13,
                              cursor: (submitting || answered) ? "not-allowed" : "pointer",
                              opacity: (submitting || answered) ? 0.6 : 1,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <AlertTriangle size={15} />
                            Gặp khó khăn / Không biết làm
                          </button>

                          <div style={{ display: "flex", gap: 10 }}>
                            <button
                              onClick={triggerReviewSocraticHint}
                              disabled={answered || hintLoading}
                              className="ah-btn-socratic"
                              style={{
                                ...POPPINS,
                                border: "1px solid #ece5fb",
                                borderRadius: 12,
                                padding: "11px 20px",
                                background: "#faf7ff",
                                color: "#7C46E8",
                                fontWeight: 800,
                                fontSize: 13,
                                cursor: answered ? "not-allowed" : "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <Lightbulb size={15} style={{ color: "#fbbf24" }} />
                              Xem gợi ý ({Math.min(hintPress, 3)}/3)
                            </button>

                            {answered ? (
                              <button
                                onClick={next}
                                className="ah-btn-socratic"
                                style={{
                                  ...POPPINS,
                                  border: "none",
                                  borderRadius: 12,
                                  padding: "11px 24px",
                                  background: "linear-gradient(135deg,#7C46E8,#5b2fc0)",
                                  color: "#fff",
                                  fontWeight: 800,
                                  fontSize: 13,
                                  cursor: "pointer",
                                  boxShadow: "0 8px 16px -6px rgba(124,70,232,.5)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <span>Tiếp tục</span>
                                <ArrowRight size={15} />
                              </button>
                            ) : (
                              <button
                                onClick={submit}
                                disabled={selected === null || submitting}
                                className="ah-btn-submit"
                                style={{
                                  ...POPPINS,
                                  border: "none",
                                  borderRadius: 12,
                                  padding: "11px 24px",
                                  background: selected === null ? "#eef1f4" : "linear-gradient(135deg,#14D9C0,#0FB9A6)",
                                  color: selected === null ? "#9aa1b0" : "#fff",
                                  fontWeight: 800,
                                  fontSize: 13,
                                  cursor: selected === null ? "not-allowed" : "pointer",
                                  boxShadow: selected === null ? "none" : "0 8px 16px -6px rgba(15,185,166,.5)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <Check size={16} />
                                Kiểm tra
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div data-tour="lesson-theory" className="ah-panel" style={{ background: "#fff", border: "1px solid #f1f5f9", borderRadius: 22, padding: 24, flex: 1 }}>
                    <div style={{ ...POPPINS, fontWeight: 700, fontSize: 17, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                      <Key size={18} style={{ color: "#eab308" }} />
                      <span>Ý tưởng chính</span>
                    </div>
                    {q && (
                      <div style={{ marginBottom: 18, padding: "12px 14px", borderRadius: 16, background: "linear-gradient(180deg,#fbf8ff,#ffffff)", border: "1px solid #ece5fb", color: "#5b2fc0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                          <span style={{ ...POPPINS, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: ".04em", padding: "4px 8px", borderRadius: 999, background: "#f2ebff", color: "#6d37d8" }}>
                            Theo câu đang làm
                          </span>
                          <span style={{ ...POPPINS, fontSize: 12.5, fontWeight: 800, color: "#252033" }}>
                            {reviewTheoryNode?.name || currentNode?.name || "Bài học"}
                          </span>
                        </div>
                        {reviewQuestionPreview && (
                          <SafeHtml
                            text={reviewQuestionPreview}
                            variant="tutor"
                            style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "#4b5060" }}
                          />
                        )}
                      </div>
                    )}
                    <SafeHtml
                      text={reviewTheoryText}
                      variant="tutor"
                      style={{ margin: 0, fontSize: 14.5, lineHeight: 1.75, color: "#4b5060", textWrap: "pretty", whiteSpace: "pre-wrap" }}
                    />
                    <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                      <button
                        onClick={() => setReviewLeftSubTab("practice")}
                        style={{
                          ...POPPINS,
                          flex: 1,
                          border: "none",
                          background: "linear-gradient(135deg,#8B5CF6,#7C46E8)",
                          color: "#fff",
                          borderRadius: 14,
                          padding: 14,
                          textAlign: "center",
                          fontWeight: 800,
                          fontSize: 15,
                          cursor: "pointer",
                          boxShadow: "0 12px 22px -8px rgba(124,70,232,.5)",
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", width: "100%" }}>
                          Mình hiểu rồi
                          <ArrowRight size={16} />
                          Luyện tập
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column (42% width) - Socratic Companion & Mascot */}
              <div style={{ flex: "1.5 1 550px", display: "flex", flexDirection: "column", gap: 16 }}>
                
                {/* Socratic Chat Companion & Mascot Frame */}
                <div
                  data-tour="lesson-chat"
                  className="ah-panel"
                  style={{
                    background: "#fff",
                    border: "1px solid #f1f5f9",
                    borderRadius: 24,
                    display: "flex",
                    alignItems: "stretch",
                    height: 540,
                    overflow: "hidden"
                  }}
                >
                  {/* Left Side: Chat Feed (65% width) */}
                  <div style={{ flex: 1.4, display: "flex", flexDirection: "column", borderRight: "1px solid #f1f5f9" }}>
                    
                    {/* Chat Header */}
                    <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 11, background: "#f8fafc" }}>
                      <div style={{ height: 38, width: 38, borderRadius: "50%", background: "linear-gradient(135deg,#FFE7A3,#FFC24D)", display: "grid", placeItems: "center", overflow: "hidden" }}>
                        <img src={COMPANION.mascot} alt={COMPANION.name} style={{ width: 30, height: 30, objectFit: "contain" }} />
                      </div>
                      <div>
                        <div style={{ ...POPPINS, fontWeight: 700, fontSize: 14.5 }}>Gia sư Socratic: {COMPANION.name}</div>
                        <div style={{ fontSize: 11, color: "#0FB9A6", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#0FB9A6" }}></span>
                          gợi mở từng bước, giải thích tư duy gốc
                        </div>
                      </div>
                    </div>

                    {/* Chat Message Stream */}
                    <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14, background: "#fafbfc" }}>
                      {chat.map((m, i) =>
                        m.sender === "ai" ? (
                          <div key={i} style={{ display: "flex", maxWidth: "85%" }}>
                            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, borderBottomLeftRadius: 5, padding: "12px 15px", fontSize: 13.5, color: "#1e293b", lineHeight: 1.6, boxShadow: "0 2px 8px -2px rgba(0,0,0,0.04)" }}>
                              <SafeHtml text={m.text} variant="tutor" />
                            </div>
                          </div>
                        ) : (
                          <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                            <div style={{ background: "linear-gradient(135deg, #1e1b4b, #312e81)", color: "#fff", borderRadius: 16, borderBottomRightRadius: 5, padding: "11px 15px", fontSize: 13.5, lineHeight: 1.55, maxWidth: "80%", boxShadow: "0 6px 12px -4px rgba(30,27,75,0.25)" }}>
                              <SafeHtml text={m.text} variant="tutor" />
                            </div>
                          </div>
                        ),
                      )}
                      {chatSending && (
                        <div style={{ display: "flex", maxWidth: "85%" }}>
                          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, borderBottomLeftRadius: 5, padding: "12px 15px", fontSize: 13.5, color: "#94a3b8" }}>
                            {COMPANION.name} đang soạn… ✍️
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Socratic Chat Footer Form */}
                    <div style={{ padding: "14px 18px 16px", borderTop: "1px solid #f1f5f9", background: "#fff" }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                        <div
                          onClick={() => {
                            setChatMascotState("encourage");
                            setChatMascotSpeech("Cố lên em! Nova ở đây giúp em từng bước nè 💪✨");
                            sendMessage("Em chưa hiểu chỗ này ạ");
                          }}
                          style={{ background: "#faf7ff", border: "1px solid #ece5fb", borderRadius: 999, padding: "7px 13px", fontSize: 11.5, fontWeight: 650, color: "#5b2fc0", cursor: "pointer", transition: "all 0.2s" }}
                          className="ah-btn-socratic"
                        >
                          🤔 Em chưa hiểu
                        </div>
                        <div
                          onClick={() => {
                            setChatMascotState("review");
                            setChatMascotSpeech("Nova sẽ đưa ví dụ minh họa để em dễ hình dung nhé! 📖💡");
                            sendMessage("Cho em một ví dụ khác");
                          }}
                          style={{ background: "#F3FBF9", border: "1px solid #e2f3ef", borderRadius: 999, padding: "7px 13px", fontSize: 11.5, fontWeight: 650, color: "#0FB9A6", cursor: "pointer", transition: "all 0.2s" }}
                          className="ah-btn-submit"
                        >
                          💡 Cho em ví dụ
                        </div>
                      </div>
                      <form onSubmit={onSubmitChat} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: "6px 6px 6px 14px" }}>
                        <input
                          ref={inputRef}
                          placeholder={`Hỏi ${COMPANION.name} về lý thuyết hoặc câu hỏi...`}
                          style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13.5, fontFamily: "'Inter', sans-serif", color: "#1e293b" }}
                        />
                        <button
                          type="submit"
                          disabled={chatSending}
                          className="ah-btn-submit"
                          style={{ height: 36, width: 40, border: "none", borderRadius: 12, background: "linear-gradient(135deg,#14D9C0,#0FB9A6)", color: "#fff", fontSize: 14, cursor: "pointer", boxShadow: "0 8px 16px -6px rgba(15,185,166,.6)", opacity: chatSending ? 0.6 : 1 }}
                        >
                          ➤
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Right Side: Animated Mascot Column (35% width) */}
                  <div style={{ width: 220, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(185deg, #ffffff 0%, #f8fafc 100%)", padding: 12, borderTopRightRadius: 24, borderBottomRightRadius: 24 }}>
                    <MascotCompanion
                      state={chatMascotState}
                      name={COMPANION.name}
                      speechBubble={chatMascotSpeech}
                      compact={true}
                      borderless={true}
                    />
                  </div>

                </div>

              </div>

            </div>
          )}



          {/* ===== EXAMS PANEL ===== */}
          {activeTab === "exams" && !needsDiagnostic && (
            <div data-tour="lesson-exams" className="ah-panel" style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
              {/* Nếu học sinh đang làm bài thi */}
              {activeExam ? (
                (() => {
                  const currentQuestion = examQuestions[examQIndex];
                  const isAdaptive = activeExam && activeExam.title.includes("Đánh giá chẩn đoán thích ứng");
                  let options: string[] = [];
                  if (currentQuestion && currentQuestion.choicesJson) {
                    try {
                      const parsed = JSON.parse(currentQuestion.choicesJson);
                      options = parsed.map((c: any) => (typeof c === "object" && c !== null && "content" in c) ? c.content : String(c));
                    } catch (e) {
                      console.error(e);
                    }
                  }

                  const minutes = Math.floor(examTimeRemaining / 60);
                  const seconds = examTimeRemaining % 60;
                  const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

                  return (
                    <div style={{ display: "flex", gap: 22, alignItems: "stretch" }}>
                      {/* Left: list of questions */}
                      {!isAdaptive ? (
                        <div style={{ width: 220, background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: 20, display: "flex", flexDirection: "column", boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)", flexShrink: 0 }}>
                          <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#9aa1b0", textTransform: "uppercase", letterSpacing: ".06em", borderBottom: "1px solid #f2f4f7", paddingBottom: 10, marginBottom: 14 }}>
                            Danh sách câu hỏi
                          </div>
                          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, overflowY: "auto", maxHeight: 300, paddingRight: 4 }}>
                            {examQuestions.map((q, idx) => {
                              const isSelected = examQIndex === idx;
                              const isAnswered = !!examAnswers[q.id];
                              return (
                                <button
                                  key={q.id}
                                  onClick={() => setExamQIndex(idx)}
                                  style={{
                                    ...POPPINS,
                                    height: 38,
                                    border: "none",
                                    borderRadius: 12,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: 800,
                                    fontSize: 13,
                                    cursor: "pointer",
                                    transition: "all .15s",
                                    ...(isSelected
                                      ? { background: "#7C46E8", color: "#fff", boxShadow: "0 4px 10px rgba(124,70,232,.3)" }
                                      : isAnswered
                                        ? { background: "#F3FBF9", border: "1px solid #14D9C0", color: "#0d7a6c" }
                                        : { background: "#f4f6f9", color: "#5b6072" }),
                                  }}
                                >
                                  {idx + 1}
                                </button>
                              );
                            })}
                          </div>
                          <div style={{ borderTop: "1px solid #f2f4f7", paddingTop: 14, marginTop: 14 }}>
                            <button
                              onClick={() => handleSubmitExam(false)}
                              disabled={submittingExam}
                              style={{
                                ...POPPINS,
                                width: "100%",
                                border: "none",
                                borderRadius: 12,
                                padding: "12px 14px",
                                background: "linear-gradient(135deg,#7C46E8,#5b2fc0)",
                                color: "#fff",
                                fontWeight: 800,
                                fontSize: 13,
                                cursor: "pointer",
                                boxShadow: "0 8px 16px -6px rgba(124,70,232,.5)",
                              }}
                            >
                              {submittingExam ? "Đang nộp..." : "Nộp bài thi"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ width: 220, background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: 20, display: "flex", flexDirection: "column", boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)", flexShrink: 0 }}>
                          <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#7C46E8", textTransform: "uppercase", letterSpacing: ".06em", borderBottom: "1px solid #f2f4f7", paddingBottom: 10, marginBottom: 14 }}>
                            Chẩn đoán thích ứng
                          </div>
                          <div style={{ textAlign: "center", padding: "20px 10px" }}>
                            <div style={{ fontSize: 32, fontWeight: 850, color: "#16161F", ...POPPINS }}>
                              {examQuestions.length} <span style={{ fontSize: 14, color: "#9aa1b0", fontWeight: 700 }}>/ 25</span>
                            </div>
                            <div style={{ fontSize: 11, color: "#5b6072", marginTop: 4, fontWeight: 600 }}>câu hỏi đã làm</div>
                          </div>
                          <div style={{ height: 6, background: "#eef1f4", borderRadius: 6, width: "100%", marginTop: 10 }}>
                            <div style={{ height: 6, background: "#7C46E8", borderRadius: 6, width: `${Math.min(100, (examQuestions.length / 25) * 100)}%` }} />
                          </div>
                        </div>
                      )}

                      {/* Right: question content */}
                      <div style={{ flex: 1, background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: 24, display: "flex", flexDirection: "column", boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f2f4f7", paddingBottom: 14, marginBottom: 18 }}>
                          <div>
                            <span style={{ ...POPPINS, fontSize: 10.5, background: "#EFE9FD", color: "#7C46E8", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", padding: "4px 10px", borderRadius: 99 }}>
                              {activeExam.title}
                            </span>
                            <div style={{ ...BALOO, fontWeight: 800, fontSize: 20, marginTop: 5 }}>Câu hỏi {examQIndex + 1}</div>
                          </div>
                          {examTimerActive && (
                            <div
                              style={{
                                ...POPPINS,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "8px 14px",
                                borderRadius: 12,
                                fontSize: 13,
                                fontWeight: 800,
                                fontFamily: "monospace",
                                border: examTimeRemaining < 60 ? "1px solid #f8d3da" : "1px solid #ece5fb",
                                background: examTimeRemaining < 60 ? "#fef3f5" : "#faf7ff",
                                color: examTimeRemaining < 60 ? "#c23a54" : "#7C46E8",
                              }}
                            >
                              <Clock size={12} /> {formattedTime}
                            </div>
                          )}
                        </div>

                        {currentQuestion ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, background: "#f4f6f9", borderRadius: 16, padding: 18, color: "#16161F", border: "1px solid #eef1f4", lineHeight: 1.6 }}>
                              <SafeHtml text={currentQuestion.content} />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                              {options.map((opt, oIdx) => {
                                const isSel = examAnswers[currentQuestion.id] === String(oIdx);
                                return (
                                  <button
                                    key={oIdx}
                                    type="button"
                                    className="ah-focusable"
                                    onClick={() => setExamAnswers((prev) => ({ ...prev, [currentQuestion.id]: String(oIdx) }))}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 12,
                                      width: "100%",
                                      textAlign: "left",
                                      border: isSel ? "2px solid #7C46E8" : "1px solid #eef1f4",
                                      background: isSel ? "#faf7ff" : "#fff",
                                      color: isSel ? "#5b2fc0" : "#4b5060",
                                      borderRadius: 14,
                                      padding: "12px 14px",
                                      cursor: "pointer",
                                      fontSize: 14,
                                      fontWeight: 600,
                                    }}
                                  >
                                    <span
                                      style={{
                                        height: 26,
                                        width: 26,
                                        borderRadius: 8,
                                        display: "grid",
                                        placeItems: "center",
                                        fontSize: 12,
                                        fontWeight: 800,
                                        background: isSel ? "#7C46E8" : "#f4f6f9",
                                        color: isSel ? "#fff" : "#9aa1b0",
                                      }}
                                    >
                                      {["A", "B", "C", "D", "E"][oIdx] ?? oIdx}
                                    </span>
                                    <SafeHtml as="span" text={opt} style={{ flex: 1 }} />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div style={{ color: "#9aa1b0", textAlign: "center", padding: 20 }}>Không tìm thấy nội dung câu hỏi.</div>
                        )}

                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, borderTop: "1px solid #f2f4f7", paddingTop: 16 }}>
                          {!isAdaptive ? (
                            <>
                              <button
                                onClick={() => setExamQIndex((idx) => Math.max(0, idx - 1))}
                                disabled={examQIndex === 0}
                                style={{ ...POPPINS, border: "1px solid #eef1f4", background: "#fff", color: "#5b6072", borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: examQIndex === 0 ? "not-allowed" : "pointer", opacity: examQIndex === 0 ? 0.5 : 1 }}
                              >
                                Câu trước
                              </button>
                              <button
                                onClick={() => setExamQIndex((idx) => Math.min(examQuestions.length - 1, idx + 1))}
                                disabled={examQIndex === examQuestions.length - 1}
                                style={{ ...POPPINS, border: "1px solid #eef1f4", background: "#fff", color: "#5b6072", borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: examQIndex === examQuestions.length - 1 ? "not-allowed" : "pointer", opacity: examQIndex === examQuestions.length - 1 ? 0.5 : 1 }}
                              >
                                Câu tiếp
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={handleAdaptiveAnswer}
                              disabled={submittingExam}
                              style={{
                                ...POPPINS,
                                border: "none",
                                borderRadius: 12,
                                padding: "11px 24px",
                                background: "linear-gradient(135deg,#7C46E8,#5b2fc0)",
                                color: "#fff",
                                fontWeight: 800,
                                fontSize: 13,
                                cursor: "pointer",
                                marginLeft: "auto",
                                boxShadow: "0 8px 16px -6px rgba(124,70,232,.5)",
                              }}
                            >
                              {submittingExam ? "Đang gửi..." : "Gửi câu trả lời & Tiếp tục"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : examFinishedScore ? (
                /* Màn hình báo kết quả */
                <div className="ah-panel" style={{ background: "#fff", border: "1px solid #eef1f4", borderRadius: 24, padding: "34px 40px", textAlign: "center", boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)", maxWidth: 500, margin: "20px auto" }}>
                  <div style={{ fontSize: 60, marginBottom: 12 }}>🎉</div>
                  <div style={{ ...BALOO, fontWeight: 800, fontSize: 24, marginBottom: 8 }}>Hoàn thành bài kiểm tra!</div>
                  <p style={{ fontSize: 13.5, color: "#5b6072", lineHeight: 1.6, marginBottom: 20 }}>
                    Chúc mừng em đã hoàn thành bài làm. Kết quả chi tiết đã được gửi đến hệ thống để ghi nhận.
                  </p>
                  <div style={{ background: "#F3FBF9", border: "1px solid #e2f3ef", borderRadius: 18, padding: 18, width: 260, margin: "0 auto 24px" }}>
                    {examFinishedScore.maxScore === "Chẩn đoán" ? (
                      <>
                        <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#7C46E8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Trạng thái chẩn đoán</div>
                        <div style={{ ...POPPINS, fontWeight: 850, fontSize: 22, color: "#16161F" }}>
                          Đã ghi nhận năng lực 🎉
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#0FB9A6", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Điểm số đạt được</div>
                        <div style={{ ...POPPINS, fontWeight: 850, fontSize: 32, color: "#16161F" }}>
                          {examFinishedScore.totalScore} <span style={{ fontSize: 16, color: "#9aa1b0", fontWeight: 700 }}>/ {examFinishedScore.maxScore}</span>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      setExamFinishedScore(null);
                      setActiveExam(null);
                      setExamQuestions([]);
                      setExamAnswers({});
                      loadAll();
                    }}
                    style={{
                      ...POPPINS,
                      border: "none",
                      borderRadius: 14,
                      padding: "13px 28px",
                      background: "linear-gradient(135deg,#14D9C0,#0FB9A6)",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 14,
                      cursor: "pointer",
                      boxShadow: "0 8px 16px -6px rgba(15,185,166,.5)",
                    }}
                  >
                    Tiếp tục học tập
                  </button>
                </div>
              ) : (
                /* Màn hình danh sách đề thi */
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 24, alignItems: "stretch", width: "100%" }}>
                  {/* Cột 1: Nhập mã đề thi */}
                  <div style={{ minWidth: 0, background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: 22, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14, boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)" }}>
                    <div>
                      <span style={{ ...POPPINS, fontSize: 10, background: "#f4f6f9", color: "#5b6072", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", padding: "4px 10px", borderRadius: 99 }}>
                        Cách 1
                      </span>
                      <div style={{ ...BALOO, fontWeight: 800, fontSize: 18, marginTop: 8 }}>Nhập mã đề thi</div>
                      <p style={{ fontSize: 13, color: "#7c8194", lineHeight: 1.5, marginTop: 6 }}>
                        Nhập mã đề thi (Exam ID) do thầy/cô cung cấp trực tiếp cho em để mở đề thi.
                      </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                      <input
                        type="text"
                        placeholder="Nhập mã đề thi (Ví dụ: UUID)..."
                        value={customExamCode}
                        onChange={(e) => setCustomExamCode(e.target.value)}
                        style={{ width: "100%", background: "#f7f9fb", border: "1px solid #eef1f4", borderRadius: 14, padding: "12px 14px", fontSize: 13, fontWeight: 650, color: "#16161F", outline: "none" }}
                      />
                      <button
                        onClick={() => handleStartExam(customExamCode)}
                        disabled={loadingExam}
                        style={{
                          ...POPPINS,
                          width: "100%",
                          border: "none",
                          borderRadius: 14,
                          padding: "13px 14px",
                          background: "#16161F",
                          color: "#fff",
                          fontWeight: 800,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {loadingExam ? "Đang tải..." : "Bắt đầu thi"}
                      </button>
                    </div>
                  </div>

                  {/* Cột 2: Danh sách đề thi được giao */}
                  <div style={{ minWidth: 0, background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: 22, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)" }}>
                    <div>
                      <span style={{ ...POPPINS, fontSize: 10, background: "#EFE9FD", color: "#7C46E8", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", padding: "4px 10px", borderRadius: 99 }}>
                        Cách 2
                      </span>
                      <div style={{ ...BALOO, fontWeight: 800, fontSize: 18, marginTop: 8 }}>Đề thi được giao</div>
                      <p style={{ fontSize: 13, color: "#7c8194", lineHeight: 1.5, marginTop: 6 }}>
                        Các đề thi do thầy/cô xuất bản sẵn cho lớp môn học {subject}.
                      </p>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", maxHeight: 180, display: "flex", flexDirection: "column", gap: 8, paddingRight: 4 }}>
                      {examsList.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "30px 10px", fontSize: 12.5, color: "#9aa1b0", fontWeight: 600, border: "1px dashed #eef1f4", borderRadius: 14, background: "#fcfdfe", fontStyle: "italic" }}>
                          Chưa có đề thi được giao cho môn học này.
                        </div>
                      ) : (
                        examsList.map((ex) => (
                          <div
                            key={ex.id}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f7f9fb", border: "1px solid #eef1f4", borderRadius: 14, padding: "10px 14px", transition: "all .15s" }}
                          >
                            <div style={{ minWidth: 0, flex: 1, paddingRight: 10 }}>
                              <span style={{ fontSize: 13, fontWeight: 800, color: "#16161F", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.title}</span>
                              <span style={{ fontSize: 10.5, color: "#9aa1b0", fontWeight: 600, display: "block", marginTop: 2 }}>Thời gian: {ex.durationMinutes} phút</span>
                            </div>
                            <button
                              onClick={() => handleStartExam(ex.id)}
                              style={{
                                ...POPPINS,
                                border: "none",
                                borderRadius: 10,
                                padding: "8px 14px",
                                background: "linear-gradient(135deg,#7C46E8,#6D28D9)",
                                color: "#fff",
                                fontWeight: 800,
                                fontSize: 11,
                                cursor: "pointer",
                                boxShadow: "0 6px 12px -4px rgba(109,40,217,.4)",
                              }}
                            >
                              Vào thi
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Cột 3: Đánh giá chẩn đoán thích ứng */}
                  <div style={{ minWidth: 0, background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: 22, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14, boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)" }}>
                    <div>
                      <span style={{ ...POPPINS, fontSize: 10, background: "#F3FBF9", color: "#0FB9A6", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", padding: "4px 10px", borderRadius: 99 }}>
                        Chẩn đoán
                      </span>
                      <div style={{ ...BALOO, fontWeight: 800, fontSize: 18, marginTop: 8 }}>Đánh giá chẩn đoán</div>
                      <p style={{ fontSize: 13, color: "#7c8194", lineHeight: 1.5, marginTop: 6 }}>
                        Thi lại bài kiểm tra chẩn đoán 25 câu để làm mới toàn bộ lộ trình học tập và chỉ số thấu hiểu chủ đề.
                      </p>
                    </div>
                    <button
                      onClick={handleResetDiagnostic}
                      style={{
                        ...POPPINS,
                        width: "100%",
                        border: "none",
                        borderRadius: 14,
                        padding: "13px 14px",
                        background: "linear-gradient(135deg,#0FB9A6,#14D9C0)",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        boxShadow: "0 8px 16px -6px rgba(15,185,166,.4)",
                      }}
                    >
                      <RefreshCw size={14} className="animate-spin-hover" /> Thi lại chẩn đoán
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ===== CHAPTER COMPLETE SCREEN ===== */}
      {screen === "complete" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(20,30,45,.55)", backdropFilter: "blur(6px)", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 30, maxWidth: 576, width: "100%", padding: "38px 40px 32px", textAlign: "center", boxShadow: "0 40px 90px -30px rgba(0,0,0,.55)", animation: "ah-pop .45s cubic-bezier(.16,1,.3,1)" }}>
            <div style={{ position: "relative", width: 148, height: 148, margin: "0 auto 8px" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "conic-gradient(#FFD76F,#FF9F43,#FFE9B8,#ffb84d,#FFD76F)", boxShadow: "0 18px 36px -12px rgba(255,159,67,.65)" }} />
              <div style={{ position: "absolute", inset: 13, borderRadius: "50%", background: "linear-gradient(135deg,#FFF0CE,#FFC24D)", display: "grid", placeItems: "center", boxShadow: "inset 0 3px 9px rgba(255,255,255,.7),inset 0 -7px 12px rgba(180,110,20,.25)" }}>
                <span style={{ fontSize: 60, filter: "drop-shadow(0 3px 4px rgba(150,90,10,.3))" }}>🏆</span>
              </div>
              <div style={{ position: "absolute", top: -4, right: 2, fontSize: 26, animation: "ah-float 3s ease-in-out infinite" }}>✨</div>
              <div style={{ position: "absolute", bottom: 2, left: -2, fontSize: 20, animation: "ah-float 3.4s ease-in-out infinite" }}>⭐</div>
            </div>
            <div style={{ ...POPPINS, display: "inline-block", background: "#FFF7E8", border: "1px solid #ffe1a6", color: "#b7811f", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", padding: "5px 14px", borderRadius: 999, marginBottom: 11 }}>
              Hoàn thành bài học 🎉
            </div>
            <div style={{ ...BALOO, fontWeight: 800, fontSize: 27, lineHeight: 1.15, marginBottom: 8 }}>
              Giỏi lắm, {studentName}! 🎉
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, fontSize: 13.5, color: "#5b6072", marginBottom: 22, lineHeight: 1.4 }}>
              <img src={COMPANION.mascot} alt={COMPANION.name} style={{ width: 28, height: 28, objectFit: "contain" }} />
              <span>
                <b>{COMPANION.name}</b>: "Em vừa chinh phục xong bài {currentNode?.name ?? ""}!"
              </span>
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
              <div style={{ flex: 1, background: "#F3FBF9", border: "1px solid #e2f3ef", borderRadius: 16, padding: 14 }}>
                <div style={{ ...POPPINS, fontWeight: 800, fontSize: 22, color: "#0FB9A6" }}>
                  {correctSession}/{qTotal}
                </div>
                <div style={{ fontSize: 11, color: "#7c8194" }}>câu đúng</div>
              </div>
              <div style={{ flex: 1, background: "#fff8ec", border: "1px solid #ffe6bd", borderRadius: 16, padding: 14 }}>
                <div style={{ ...POPPINS, fontWeight: 800, fontSize: 22, color: "#e0912a" }}>⭐ {stars}</div>
                <div style={{ fontSize: 11, color: "#7c8194" }}>tổng sao</div>
              </div>
              <div style={{ flex: 1, background: "#faf7ff", border: "1px solid #ece5fb", borderRadius: 16, padding: 14 }}>
                <div style={{ ...POPPINS, fontWeight: 800, fontSize: 22, color: "#7C46E8" }}>
                  {qTotal > 0 ? Math.round((correctSession / qTotal) * 100) : 0}%
                </div>
                <div style={{ fontSize: 11, color: "#7c8194" }}>chính xác</div>
              </div>
            </div>
            <div style={{ ...POPPINS, textAlign: "left", fontSize: 11, fontWeight: 800, color: "#9aa1b0", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 13 }}>
              Bộ sưu tập huy hiệu
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 26 }}>
              {(summary?.badges ?? []).slice(0, 4).map((b) => {
                const earned = b.status === "earned";
                return (
                  <div key={b.code} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 80 }}>
                    <div
                      style={{
                        height: 60,
                        width: 60,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        fontSize: earned ? 28 : 26,
                        border: "2px solid #fff",
                        ...(earned
                          ? { background: `linear-gradient(135deg,${b.colorFrom},${b.colorTo})`, boxShadow: "0 10px 18px -8px rgba(255,159,67,.6),inset 0 2px 5px rgba(255,255,255,.6)" }
                          : { background: "#eef1f4", filter: "grayscale(1)", opacity: 0.5 }),
                      }}
                    >
                      {b.glyph}
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, textAlign: "center", lineHeight: 1.2, color: earned ? "#16161F" : "#a2a8b4" }}>{b.name}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 11 }}>
              <button
                type="button"
                className="ah-focusable"
                onClick={restart}
                style={{ ...POPPINS, flex: 1, border: "none", background: "linear-gradient(135deg,#14D9C0,#0FB9A6)", color: "#fff", borderRadius: 15, padding: 15, fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 12px 24px -8px rgba(15,185,166,.55)" }}
              >
                Học tiếp →
              </button>
              <button
                type="button"
                className="ah-focusable"
                onClick={restart}
                style={{ background: "#fff", border: "1px solid #eef1f4", color: "#5b6072", borderRadius: 15, padding: "15px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                Đóng
              </button>
          </div>
        </div>
      </div>
      )}
      {/* ===== ONBOARDING DIAGNOSTIC MODAL OVERLAY ===== */}
      {needsDiagnostic && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(10px)",
            padding: "clamp(12px, 3vw, 24px)",
            overflowY: "auto",
          }}
        >
          {activeExam ? (
            /* ================= Focus Exam Card ================= */
            (() => {
              const currentQuestion = examQuestions[examQIndex];
              const isAdaptive = activeExam && activeExam.title.includes("Đánh giá chẩn đoán thích ứng");
              let options: string[] = [];
              if (currentQuestion && currentQuestion.choicesJson) {
                try {
                  const parsed = JSON.parse(currentQuestion.choicesJson);
                  options = parsed.map((c: any) => (typeof c === "object" && c !== null && "content" in c) ? c.content : String(c));
                } catch (e) {
                  console.error(e);
                }
              }

              const minutes = Math.floor(examTimeRemaining / 60);
              const seconds = examTimeRemaining % 60;
              const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

              return (
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 28,
                    maxWidth: 820,
                    width: "100%",
                    padding: 32,
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
                    animation: "ah-pop .45s cubic-bezier(.16,1,.3,1)",
                    display: "flex",
                    gap: 24,
                    alignItems: "stretch",
                  }}
                >
                  {/* Left: Progress bar */}
                  <div style={{ width: 180, background: "#faf7ff", border: "1px solid #ece5fb", borderRadius: 20, padding: 18, display: "flex", flexDirection: "column", flexShrink: 0, justifyContent: "center" }}>
                    <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#7C46E8", textTransform: "uppercase", letterSpacing: ".06em", borderBottom: "1px solid #ece5fb", paddingBottom: 10, marginBottom: 14, textAlign: "center" }}>
                      Chẩn đoán thích ứng
                    </div>
                    <div style={{ textAlign: "center", padding: "10px 0" }}>
                      <div style={{ fontSize: 36, fontWeight: 850, color: "#16161F", ...POPPINS }}>
                        {examQuestions.length} <span style={{ fontSize: 15, color: "#9aa1b0", fontWeight: 700 }}>/ 25</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#5b6072", marginTop: 4, fontWeight: 600 }}>câu hỏi đã làm</div>
                    </div>
                    <div style={{ height: 6, background: "#eef1f4", borderRadius: 6, width: "100%", marginTop: 10 }}>
                      <div style={{ height: 6, background: "#7C46E8", borderRadius: 6, width: `${Math.min(100, (examQuestions.length / 25) * 100)}%` }} />
                    </div>
                  </div>

                  {/* Right: Question card */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f2f4f7", paddingBottom: 14, marginBottom: 18 }}>
                      <div>
                        <span style={{ ...POPPINS, fontSize: 10.5, background: "#EFE9FD", color: "#7C46E8", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", padding: "4px 10px", borderRadius: 99 }}>
                          {activeExam.title}
                        </span>
                        <div style={{ ...BALOO, fontWeight: 800, fontSize: 18, marginTop: 5 }}>Câu hỏi {examQIndex + 1}</div>
                      </div>
                      {examTimerActive && (
                        <div
                          style={{
                            ...POPPINS,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 12px",
                            borderRadius: 10,
                            fontSize: 12,
                            fontWeight: 800,
                            fontFamily: "monospace",
                            border: examTimeRemaining < 60 ? "1px solid #f8d3da" : "1px solid #ece5fb",
                            background: examTimeRemaining < 60 ? "#fef3f5" : "#faf7ff",
                            color: examTimeRemaining < 60 ? "#c23a54" : "#7C46E8",
                          }}
                        >
                          <Clock size={12} /> {formattedTime}
                        </div>
                      )}
                    </div>

                    {currentQuestion ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, background: "#f4f6f9", borderRadius: 16, padding: 18, color: "#16161F", border: "1px solid #eef1f4", lineHeight: 1.6 }}>
                          <SafeHtml text={currentQuestion.content} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                          {options.map((opt, oIdx) => {
                            const isSel = examAnswers[currentQuestion.id] === String(oIdx);
                            return (
                              <button
                                key={oIdx}
                                type="button"
                                className="ah-focusable"
                                onClick={() => setExamAnswers((prev) => ({ ...prev, [currentQuestion.id]: String(oIdx) }))}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 12,
                                  width: "100%",
                                  textAlign: "left",
                                  border: isSel ? "2px solid #7C46E8" : "1px solid #eef1f4",
                                  background: isSel ? "#faf7ff" : "#fff",
                                  color: isSel ? "#5b2fc0" : "#4b5060",
                                  borderRadius: 14,
                                  padding: "12px 14px",
                                  cursor: "pointer",
                                  fontSize: 14,
                                  fontWeight: 600,
                                }}
                              >
                                <span
                                  style={{
                                    height: 26,
                                    width: 26,
                                    borderRadius: 8,
                                    display: "grid",
                                    placeItems: "center",
                                    fontSize: 12,
                                    fontWeight: 800,
                                    background: isSel ? "#7C46E8" : "#f4f6f9",
                                    color: isSel ? "#fff" : "#9aa1b0",
                                  }}
                                >
                                  {["A", "B", "C", "D", "E"][oIdx] ?? oIdx}
                                </span>
                                <SafeHtml as="span" text={opt} style={{ flex: 1 }} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: "#9aa1b0", textAlign: "center", padding: 20 }}>Không tìm thấy nội dung câu hỏi.</div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, borderTop: "1px solid #f2f4f7", paddingTop: 16, alignItems: "center" }}>
                      <button
                        onClick={() => {
                          if (confirm("Em có chắc chắn muốn hủy bài thi chẩn đoán này không? Lần sau em vẫn sẽ phải làm lại để tiếp tục lộ trình.")) {
                            setActiveExam(null);
                            setExamQuestions([]);
                            setExamAnswers({});
                          }
                        }}
                        style={{
                          ...POPPINS,
                          background: "none",
                          border: "none",
                          color: "#9aa1b0",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <LogOut size={13} /> Hủy/Thoát thi
                      </button>

                      <button
                        onClick={handleAdaptiveAnswer}
                        disabled={submittingExam}
                        style={{
                          ...POPPINS,
                          border: "none",
                          borderRadius: 12,
                          padding: "11px 24px",
                          background: "linear-gradient(135deg,#7C46E8,#5b2fc0)",
                          color: "#fff",
                          fontWeight: 800,
                          fontSize: 13,
                          cursor: "pointer",
                          boxShadow: "0 8px 16px -6px rgba(124,70,232,.5)",
                        }}
                      >
                        {submittingExam ? "Đang gửi..." : "Gửi câu trả lời & Tiếp tục"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : examFinishedScore ? (
            /* ================= Onboarding Complete Card ================= */
            (() => {
              const summaries = examFinishedScore.summaries || [];
              const masteredNodes = summaries.filter((s: any) => s.status === "mastered");
              const weakNodes = summaries.filter((s: any) => s.status === "need_improvement");

              return (
                <div style={{ background: "#fff", borderRadius: 28, maxWidth: 640, width: "100%", padding: "34px 40px", textAlign: "center", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)", animation: "ah-pop .45s cubic-bezier(.16,1,.3,1)" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                    <BarChart3 size={56} style={{ color: "#7C46E8" }} />
                  </div>
                  <div style={{ ...BALOO, fontWeight: 800, fontSize: 25, marginBottom: 6 }}>Kết quả Chẩn đoán năng lực sơ bộ</div>
                  <p style={{ fontSize: 13.5, color: "#5b6072", lineHeight: 1.6, marginBottom: 20 }}>
                    Hệ thống đã phân tích câu trả lời của em qua 25 câu hỏi chẩn đoán để xác định mức độ hiểu biết đối với từng chủ đề kiến thức.
                  </p>

                  <div style={{ display: "flex", gap: 16, textAlign: "left", marginBottom: 24 }}>
                    {/* Strengths */}
                    <div style={{ flex: 1, background: "#F3FBF9", border: "1px solid #d4f2ea", borderRadius: 20, padding: 16 }}>
                      <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#0FB9A6", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
                        <TrendingUp size={14} /> Kỹ năng vững vàng ({masteredNodes.length})
                      </div>
                      {masteredNodes.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 150, overflowY: "auto" }}>
                          {masteredNodes.map((s: any, idx: number) => (
                            <div key={idx} style={{ fontSize: 12.5, fontWeight: 700, color: "#16161F", padding: "6px 10px", background: "#fff", borderRadius: 10, border: "1px solid #eef1f4" }}>
                              {s.nodeName}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "#7c8194", fontStyle: "italic", textAlign: "center", marginTop: 20 }}>Chưa ghi nhận kỹ năng đạt yêu cầu</div>
                      )}
                    </div>

                    {/* Weaknesses */}
                    <div style={{ flex: 1, background: "#fef3f5", border: "1px solid #f9dae0", borderRadius: 20, padding: 16 }}>
                      <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#c23a54", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
                        <TrendingDown size={14} /> Cần cải thiện ({weakNodes.length})
                      </div>
                      {weakNodes.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 150, overflowY: "auto" }}>
                          {weakNodes.map((s: any, idx: number) => (
                            <div key={idx} style={{ fontSize: 12.5, fontWeight: 700, color: "#16161F", padding: "6px 10px", background: "#fff", borderRadius: 10, border: "1px solid #eef1f4" }}>
                              {s.nodeName}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "#7c8194", fontStyle: "italic", textAlign: "center", marginTop: 20 }}>Không ghi nhận lỗ hổng kiến thức lớn</div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      setExamFinishedScore(null);
                      setActiveExam(null);
                      setExamQuestions([]);
                      setExamAnswers({});
                      loadAll();
                    }}
                    style={{
                      ...POPPINS,
                      border: "none",
                      borderRadius: 14,
                      padding: "13px 36px",
                      background: "linear-gradient(135deg,#7C46E8,#5b2fc0)",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 14,
                      cursor: "pointer",
                      boxShadow: "0 8px 16px -6px rgba(124,70,232,.5)",
                    }}
                  >
                    Vào giao diện chính & Học tập
                  </button>
                </div>
              );
            })()
          ) : (
            /* ================= Onboarding Select Exam Panel ================= */
            <div
              style={{
                background: "#fff",
                borderRadius: 28,
                maxWidth: 580,
                width: "100%",
                maxHeight: "calc(100dvh - 24px)",
                overflowY: "auto",
                padding: "clamp(24px, 4vh, 40px) clamp(18px, 4vw, 36px) clamp(20px, 3vh, 32px)",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
                textAlign: "center",
                animation: "ah-pop .45s cubic-bezier(.16,1,.3,1)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, animation: "ah-float 3s ease-in-out infinite" }}>
                <GraduationCap size={56} style={{ color: "#7C46E8" }} />
              </div>
              <div style={{ ...BALOO, fontWeight: 800, fontSize: 26, color: "#16161F", marginBottom: 10 }}>
                Yêu cầu đánh giá chẩn đoán!
              </div>
              <p style={{ fontSize: 14, color: "#4b5060", lineHeight: 1.6, marginBottom: 26 }}>
                Chào mừng em đến với <b>Aurora Socratic Tutor</b>. Lộ trình học tập của em tạm thời bị khóa. Em cần hoàn thành bài khảo sát/kiểm tra đầu vào để hệ thống chẩn đoán và xác định lỗ hổng kiến thức nền tảng của em.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
                {/* Cách 1: Đề thi được giao sẵn */}
                {examsList.length > 0 ? (
                  <div>
                    <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#7C46E8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
                      Đề thi được giao cho em
                    </div>
                    <div style={{ fontSize: 12, color: "#5b6072", marginBottom: 10, lineHeight: 1.5 }}>
                      Em chỉ cần hoàn thành <b>1 đề bất kỳ</b> trong danh sách dưới đây để mở khóa lộ trình học nhé!
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "min(320px, 32dvh)", overflowY: "auto", paddingRight: 4 }}>
                      {examsList.map((ex) => (
                        <div
                          key={ex.id}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f7f9fb", border: "1px solid #eef1f4", borderRadius: 16, padding: "12px 16px" }}
                        >
                          <div style={{ minWidth: 0, flex: 1, paddingRight: 10 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 800, color: "#16161F", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.title}</span>
                            <span style={{ fontSize: 11, color: "#9aa1b0", fontWeight: 600, display: "block", marginTop: 2 }}>Thời gian: {ex.durationMinutes} phút</span>
                          </div>
                          <button
                            onClick={() => handleStartExam(ex.id)}
                            style={{
                              ...POPPINS,
                              border: "none",
                              borderRadius: 12,
                              padding: "9px 16px",
                              background: "linear-gradient(135deg,#7C46E8,#6D28D9)",
                              color: "#fff",
                              fontWeight: 800,
                              fontSize: 12,
                              cursor: "pointer",
                              boxShadow: "0 6px 12px -4px rgba(109,40,217,.4)",
                            }}
                          >
                            Vào thi
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "16px 10px", fontSize: 12.5, color: "#9aa1b0", fontWeight: 600, border: "1px dashed #eef1f4", borderRadius: 16, background: "#fcfdfe", fontStyle: "italic", marginBottom: 6 }}>
                    Chưa có đề thi được giao sẵn cho lớp của em.
                  </div>
                )}

                {/* Cách 2: Nhập mã đề thi tự do */}
                <div style={{ borderTop: "1px solid #f2f4f7", paddingTop: 18, marginTop: 4 }}>
                  <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#9aa1b0", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
                    Hoặc nhập mã đề thi thầy/cô gửi riêng cho em:
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      type="text"
                      placeholder="Dán mã đề thi vào đây..."
                      value={customExamCode}
                      onChange={(e) => setCustomExamCode(e.target.value)}
                      style={{ flex: 1, background: "#f7f9fb", border: "1px solid #eef1f4", borderRadius: 14, padding: "12px 14px", fontSize: 13, fontWeight: 650, color: "#16161F", outline: "none" }}
                    />
                    <button
                      onClick={() => handleStartExam(customExamCode)}
                      disabled={loadingExam}
                      style={{
                        ...POPPINS,
                        border: "none",
                        borderRadius: 14,
                        padding: "12px 20px",
                        background: "linear-gradient(135deg,#7C46E8,#6D28D9)",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: "pointer",
                        boxShadow: "0 6px 12px -4px rgba(109,40,217,.4)",
                        opacity: loadingExam ? 0.6 : 1,
                      }}
                    >
                      {loadingExam ? "Đang tải..." : "Vào thi"}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "center", marginTop: 22, borderTop: "1px solid #f2f4f7", paddingTop: 16 }}>
                <div style={{ fontSize: 12, color: "#9aa1b0", marginBottom: 12, lineHeight: 1.5 }}>
                  Chưa sẵn sàng làm bài? Em có thể bỏ qua tạm thời và quay lại mục Đề thi sau nhé.
                </div>
                <button
                  type="button"
                  onClick={() => setSkipDiagnostic(true)}
                  style={{
                    ...POPPINS,
                    border: "none",
                    borderRadius: 14,
                    padding: "11px 24px",
                    marginRight: 8,
                    background: "#f1ecfd",
                    color: "#6D28D9",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Bỏ qua lúc này
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.clear();
                    router.push("/");
                  }}
                  style={{
                    ...POPPINS,
                    border: "1px solid #eef1f4",
                    borderRadius: 14,
                    padding: "11px 24px",
                    background: "#fff",
                    color: "#5b6072",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  🚪 Đăng xuất, làm sau
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* celebration confetti */}
      {celebrate && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 60 }}>
          {confetti.map((c, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                top: -20,
                left: `${c.left}%`,
                width: 9,
                height: 14,
                borderRadius: 3,
                background: c.color,
                transform: `rotate(${c.rot}deg)`,
                animation: `ah-fall ${c.dur}s linear ${c.delay}s forwards`,
              }}
            />
          ))}
        </div>
      )}

      {/* Lộ trình ôn tập giờ là một tab (activeTab === "roadmap"), không còn dùng modal. */}

      {/* ============ MODAL TRUY VẾT GỐC RỄ ============ */}
      {traceModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(15,23,42,.55)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            animation: "fadeIn .2s ease-out",
          }}
          onClick={() => setTraceModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(920px, 96vw)",
              height: "min(640px, 88vh)",
              background: "#fff",
              borderRadius: 24,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 30px 60px -20px rgba(0,0,0,.4)",
            }}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #eef1f4", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ ...BALOO, fontWeight: 800, fontSize: 18, color: "#dc2626" }}>🔍 Truy vết gốc rễ lỗ hổng</div>
                <div style={{ fontSize: 12, color: "#5b6072", fontWeight: 600 }}>
                  Aurora lần theo cây tri thức để tìm bài học nền tảng đang khiến em gặp khó
                </div>
              </div>
              <button
                onClick={() => setTraceModal(null)}
                style={{ background: "#f1f5f9", border: "none", borderRadius: 12, width: 34, height: 34, cursor: "pointer", fontWeight: 800, color: "#64748b" }}
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <KnowledgeTree
                subject={subject}
                nodes={nodes as any}
                edges={edges as any}
                mode="view-only"
                studentNodeStatus={Object.fromEntries(
                  nodes.map((n) => {
                    const t = mastery.topics?.[n.id];
                    const status = traceModal.path.includes(n.id)
                      ? n.id === traceModal.rootId
                        ? "struggle"
                        : "learning"
                      : t && (t.masteryStatus === "mastered" || t.masteryProbability >= 0.8)
                        ? "mastered"
                        : "locked";
                    return [n.id, status];
                  }),
                ) as Record<string, "mastered" | "struggle" | "learning" | "locked" | "initial">}
                traceHighlight={{ path: traceModal.path }}
                onTraceCta={(rootId) => {
                  const parentNode = nodes.find((n) => n.id === rootId);
                  setTraceModal(null);
                  if (parentNode) {
                    setActiveTab("review");
                    setReviewLeftSubTab("theory");
                    toast.info(`Cùng ôn lại "${parentNode.name}" nhé!`);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
      <GuidedTour />
    </div>
  );
}
