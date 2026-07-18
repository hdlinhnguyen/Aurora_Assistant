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
  submitExam,
  submitAdaptiveAnswer,
  submitCantDo,
  submitAdaptiveDowngrade,
  type GameSummary,
  type HubNode,
  type HubQuestion,
  type MasteryProfile,
  type RoadmapStep,
} from "./hub/api";
import MascotCompanion, { type MascotState } from "@/app/components/MascotCompanion";
import { SafeHtml } from "@/components/ui/safe-html";
import KnowledgeTree from "../components/KnowledgeTree";

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
  const [edges, setEdges] = useState<any[]>([]);
  const [mastery, setMastery] = useState<MasteryProfile>({ topics: {} });
  const [roadmap, setRoadmap] = useState<RoadmapStep[]>([]);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const router = useRouter();
  const [studentName, setStudentName] = useState("bạn");
  const [currentStepId, setCurrentStepId] = useState("");
  const [questions, setQuestions] = useState<HubQuestion[]>([]);
  const [qLoading, setQLoading] = useState(false);

  // ---- quiz / ui ----
  const [screen, setScreen] = useState<"lesson" | "complete">("lesson");
  const [activeTab, setActiveTab] = useState<"theory" | "practice" | "chat" | "exams" | "graph">("graph");
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
      setRoadmap(rm);
      setSummary(summaryRes);
      setStudentState(stateRes);
      setExamsList(examsRes);
      const isDiag = stateRes === null || stateRes?.needsDiagnostic;
      if (isDiag) {
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

  async function loadQuestions(nodeId: string) {
    setQLoading(true);
    try {
      const raw = await getQuestions(nodeId);
      const mapped = (raw ?? []).map(mapQuestion);
      if (mapped.length === 0) {
        const targetNode = nodes.find((n) => n.id === nodeId);
        const nodeName = targetNode?.name || "Khái niệm Phân số";
        setQuestions([
          {
            id: `demo-${nodeId}`,
            q: `[Luyện tập & Thử nghiệm Socratic AI] Chọn khẳng định đúng khi tìm hiểu về: "${nodeName}"?`,
            opts: [
              `Nắm vững bản chất định nghĩa và nguyên lý nền tảng của ${nodeName}`,
              "Thực hiện biến đổi ngẫu nhiên không qua các bước cơ bản",
              "Bỏ qua quy đồng hoặc rút gọn khi làm bài",
              "Không áp dụng được cho bài toán thực tế",
            ],
            correct: 0,
            tag: "Thông hiểu",
          },
        ]);
      } else {
        setQuestions(mapped);
      }
    } catch {
      const targetNode = nodes.find((n) => n.id === nodeId);
      const nodeName = targetNode?.name || "Khái niệm Phân số";
      setQuestions([
        {
          id: `demo-${nodeId}`,
          q: `[Luyện tập & Thử nghiệm Socratic AI] Chọn khẳng định đúng khi tìm hiểu về: "${nodeName}"?`,
          opts: [
            `Nắm vững bản chất định nghĩa và nguyên lý nền tảng của ${nodeName}`,
            "Thực hiện biến đổi ngẫu nhiên không qua các bước cơ bản",
            "Bỏ qua quy đồng hoặc rút gọn khi làm bài",
            "Không áp dụng được cho bài toán thực tế",
          ],
          correct: 0,
          tag: "Thông hiểu",
        },
      ]);
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
        setActiveTab("theory");
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
        text: `Chào ${studentName}! Có gì chưa rõ ở bài "${lessonName || "này"}" cứ hỏi ${COMPANION.name} nhé — ${COMPANION.name} sẽ gợi mở để em tự nghĩ ra! ${COMPANION.mascot}`,
      },
    ]);
    setChatMascotState("waving");
    setChatMascotSpeech(`Chào ${studentName}! Có thắc mắc ở bài "${lessonName || "này"}", cứ nhắn cho Nova nhé! 👋`);
  }

  // ---- derived ----
  const needsDiagnostic = studentState === null || studentState?.needsDiagnostic;
  const currentNode = nodes.find((n) => n.id === currentStepId);
  const filteredQuestions = difficultyFilter
    ? questions.filter((item) => item.tag === "Nhận biết")
    : questions;
  const q = filteredQuestions[qIndex];
  const qTotal = filteredQuestions.length;
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
    setActiveTab("practice");
    resetChat(step.name);
    loadQuestions(step.id);
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
    setActiveTab("theory");
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
      const res = await chatTheory(currentStepId, val, history);
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
  const tabOn: CSSProperties = { ...tabBase, background: "#16161F", color: "#fff" };
  const tabOff: CSSProperties = { ...tabBase, background: "#fff", color: "#5b6072", border: "1px solid #eef1f4" };
  const isLastAnswered = answered && qIndex >= qTotal - 1;

  // ---- loading / error ----
  if (loading) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#F4FBF9" }}>
        <div style={{ textAlign: "center", color: "#5b6072" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🦊</div>
          <div style={{ ...POPPINS, fontWeight: 700 }}>Đang tải không gian học…</div>
        </div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#F4FBF9", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>😅</div>
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
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ============ ROADMAP RAIL ============ */}
        <aside
          style={{
            width: 290,
            background: "#fff",
            borderRight: "1px solid #eef1f4",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #f2f4f7" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16 }}>
              <img
                src="/icon.png"
                alt="Aurora"
                style={{
                  height: 38,
                  width: 38,
                  borderRadius: 12,
                  objectFit: "cover",
                }}
              />
              <div>
                <div style={{ ...POPPINS, fontWeight: 800, fontSize: 16, lineHeight: 1 }}>Aurora</div>
                <div style={{ fontSize: 11, color: "#9aa1b0", marginTop: 2 }}>Học thật, hiểu thật</div>
              </div>
            </div>
            <div
              style={{
                background: "#f4f6f9",
                border: "1px solid #eef1f4",
                borderRadius: 13,
                padding: "10px 13px",
                fontSize: 13.5,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span>📐</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subject}</span>
              </span>
            </div>
          </div>

          <div style={{ padding: "16px 12px", overflowY: "auto", flex: 1 }}>
            <div
              style={{
                ...POPPINS,
                fontSize: 10.5,
                fontWeight: 800,
                color: "#9aa1b0",
                textTransform: "uppercase",
                letterSpacing: ".07em",
                padding: "0 8px 4px",
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chapterName}</span>
              <span style={{ color: "#0FB9A6", flexShrink: 0 }}>
                {doneCount}/{totalSteps}
              </span>
            </div>
            <div style={{ padding: "0 8px 12px" }}>
              <div style={{ height: 6, background: "#eef1f4", borderRadius: 6 }}>
                <div
                  style={{
                    height: 6,
                    background: "linear-gradient(90deg,#14D9C0,#0FB9A6)",
                    borderRadius: 6,
                    width: `${chapterPct}%`,
                  }}
                />
              </div>
            </div>

            {roadmap.map((st, i) => {
              const gated = needsDiagnostic;
              const active = st.id === currentStepId && !gated;
              const done = st.status === "done" && !gated;
              const locked = (st.status === "locked" && !active) || gated;
              const rowStyle: CSSProperties = {
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "11px 12px",
                borderRadius: 14,
                marginBottom: 5,
                transition: "all .15s",
                ...(active
                  ? {
                      background: "linear-gradient(135deg,#EFE9FD,#f6f1ff)",
                      boxShadow: "inset 0 0 0 2px #7C46E8",
                      cursor: "pointer",
                    }
                  : done
                    ? { background: "#F3FBF9", cursor: "pointer" }
                    : locked
                      ? { cursor: "pointer", opacity: 0.95 }
                      : { cursor: "pointer" }),
              };
              const badgeStyle: CSSProperties = {
                height: 26,
                width: 26,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontSize: 12,
                fontWeight: 800,
                flexShrink: 0,
                ...(active
                  ? { background: "#7C46E8", color: "#fff" }
                  : done
                    ? { background: "#14D9C0", color: "#fff" }
                    : { background: "#eef1f4", color: "#b3b9c4" }),
              };
              const nameStyle: CSSProperties = {
                fontSize: 12.5,
                fontWeight: active ? 800 : 600,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: active ? "#5b2fc0" : done ? "#16161F" : "#a2a8b4",
              };
              const tag = active ? "đang học" : locked ? "🔒" : "";
              const tagStyle: CSSProperties = {
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
                flexShrink: 0,
                ...(active ? { background: "#fff", color: "#7C46E8" } : { color: "#c2c8d2" }),
              };
              return (
                <div key={st.id} onClick={() => selectStep(st)} style={rowStyle} title={st.name}>
                  <span style={badgeStyle}>{done ? "✓" : String(i + 1)}</span>
                  <span style={nameStyle}>{st.name}</span>
                  <span style={tagStyle}>{tag}</span>
                </div>
              );
            })}
          </div>

          <div style={{ padding: 14, borderTop: "1px solid #f2f4f7" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
              <div
                style={{
                  ...POPPINS,
                  height: 38,
                  width: 38,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#ffd76f,#ff9f43)",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 800,
                  color: "#7a4b00",
                }}
              >
                {studentName.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {studentName}
                </div>
                <div style={{ fontSize: 11, color: "#9aa1b0" }}>
                  🔥 {streak} ngày · ⭐ {stars}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                localStorage.clear();
                router.push("/");
              }}
              style={{
                ...POPPINS,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "9px 14px",
                border: "1px solid #f8d3da",
                borderRadius: 12,
                background: "#fef3f5",
                color: "#c23a54",
                fontSize: 12.5,
                fontWeight: 800,
                cursor: "pointer",
                transition: "all .15s",
              }}
            >
              🚪 Đăng xuất
            </button>
          </div>
        </aside>

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
                <div onClick={() => setActiveTab("graph")} style={activeTab === "graph" ? tabOn : tabOff}>
                  📊 Sơ đồ năng lực
                </div>
                <div onClick={() => setActiveTab("theory")} style={activeTab === "theory" ? tabOn : tabOff}>
                  📖 Học lý thuyết
                </div>
                <div onClick={() => setActiveTab("practice")} style={activeTab === "practice" ? tabOn : tabOff}>
                  ✏️ Luyện tập{" "}
                  <span
                    style={{
                      background: activeTab === "practice" ? "rgba(255,255,255,.22)" : "#EFE9FD",
                      color: activeTab === "practice" ? "#fff" : "#7C46E8",
                      fontSize: 11,
                      padding: "1px 8px",
                      borderRadius: 999,
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {qTotal}
                  </span>
                </div>
                <div onClick={() => setActiveTab("chat")} style={activeTab === "chat" ? tabOn : tabOff}>
                  💬 Hỏi thầy AI
                </div>
              </>
            ) : (
              <div style={{ ...POPPINS, fontSize: 13, fontWeight: 800, color: "#c23a54", background: "#fef3f5", border: "1px solid #f8d3da", padding: "10px 16px", borderRadius: 14, display: "flex", alignItems: "center", gap: 6 }}>
                🔒 Khóa lộ trình: Yêu cầu Đánh giá Chẩn đoán bắt buộc
              </div>
            )}
            <div onClick={() => setActiveTab("exams")} style={activeTab === "exams" ? tabOn : tabOff}>
              ✍️ Đề thi & Kiểm tra
            </div>
          </div>

          {/* ===== GRAPH (KNOWLEDGE TREE) PANEL ===== */}
          {activeTab === "graph" && (
            <div className="ah-panel" style={{ height: 600, position: "relative", border: "1px solid #eef1f4", borderRadius: 22, overflow: "hidden", background: "#fff", boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)" }}>
              {nodes.length > 0 ? (
                <KnowledgeTree
                  subject={subject}
                  nodes={nodes}
                  edges={edges}
                  masteryByTopic={mastery.topics as any}
                  mode="student"
                  studentNodeStatus={(() => {
                    const statusMap: Record<string, "mastered" | "struggle" | "learning" | "locked" | "initial"> = {};
                    roadmap.forEach((st) => {
                      if (st.status === "done") {
                        statusMap[st.id] = "mastered";
                      } else if (st.status === "current") {
                        statusMap[st.id] = "learning";
                      } else {
                        statusMap[st.id] = "locked";
                      }
                    });
                    if (studentState?.initialLevelNodeId) {
                      statusMap[studentState.initialLevelNodeId] = "initial";
                    }
                    return statusMap;
                  })()}
                  initialNodeId={studentState?.initialLevelNodeId}
                  currentNodeId={studentState?.currentLevelNodeId || currentStepId}
                  focusedNodeId={currentStepId}
                  onFocusedNodeChange={(id) => {
                    const step = roadmap.find((st) => st.id === id);
                    if (step) {
                      setCurrentStepId(id);
                      resetChat(step.name);
                      loadQuestions(id);
                    }
                  }}
                  onShowContentClick={(node: any) => {
                    const step = roadmap.find((st) => st.id === node.id);
                    if (step) {
                      selectStep(step);
                    }
                  }}
                  onNodeClick={(node: any) => {
                    const step = roadmap.find((st) => st.id === node.id);
                    if (step) {
                      selectStep(step);
                    }
                  }}
                  onRefresh={() => loadAll()}
                />
              ) : (
                <div style={{ padding: 40, textAlign: "center", color: "#9aa1b0" }}>
                  Đang tải sơ đồ học tập...
                </div>
              )}
            </div>
          )}

          {/* ===== THEORY PANEL ===== */}
          {activeTab === "theory" && (
            <div className="ah-panel" style={{ display: "flex", gap: 20, alignItems: "stretch" }}>
              <div style={{ flex: 1.2, background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: 24, boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)" }}>
                <div style={{ ...POPPINS, fontWeight: 700, fontSize: 17, marginBottom: 12 }}>Ý tưởng chính 🍰</div>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.75, color: "#4b5060", textWrap: "pretty", whiteSpace: "pre-wrap" }}>
                  {currentNode?.theory?.trim() || "Nội dung lý thuyết cho bài này đang được cập nhật. Em có thể sang tab Luyện tập hoặc hỏi thầy AI nhé!"}
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <div
                    onClick={() => setActiveTab("practice")}
                    style={{
                      ...POPPINS,
                      flex: 1,
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
                    Mình hiểu rồi → Luyện tập
                  </div>
                  <div
                    onClick={() => setActiveTab("chat")}
                    style={{ background: "#fff", border: "1px solid #eef1f4", color: "#5b6072", borderRadius: 14, padding: "14px 18px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                  >
                    💬
                  </div>
                </div>
              </div>

              <div style={{ width: 264, background: "linear-gradient(160deg,#faf7ff,#f2eefb)", border: "1px solid #ece5fb", borderRadius: 22, padding: 20, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
                  <div style={{ height: 44, width: 44, borderRadius: "50%", background: "linear-gradient(135deg,#FFE7A3,#FFC24D)", display: "grid", placeItems: "center", overflow: "hidden" }}>
                    <img src={COMPANION.mascot} alt={COMPANION.name} style={{ width: 36, height: 36, objectFit: "contain" }} />
                  </div>
                  <div>
                    <div style={{ ...POPPINS, fontWeight: 700, fontSize: 14 }}>{COMPANION.name}</div>
                    <div style={{ fontSize: 11, color: "#7C46E8", fontWeight: 600 }}>● đang lắng nghe</div>
                  </div>
                </div>
                <div style={{ background: "#fff", border: "1px solid #f0eafc", borderRadius: 15, borderTopLeftRadius: 5, padding: 13, fontSize: 13, color: "#4b5060", lineHeight: 1.6 }}>
                  Có chỗ nào trong bài "{currentNode?.name ?? "này"}" chưa rõ không? Hỏi mình, mình sẽ gợi ý từng bước nhé! 🤔
                </div>
                <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9, paddingTop: 16 }}>
                  <div
                    onClick={() => {
                      setActiveTab("chat");
                      sendMessage("Em chưa hiểu chỗ này ạ");
                    }}
                    style={{ background: "#fff", border: "1px solid #ece5fb", borderRadius: 12, padding: "10px 13px", fontSize: 12.5, fontWeight: 600, color: "#5b2fc0", cursor: "pointer" }}
                  >
                    Em chưa hiểu chỗ này
                  </div>
                  <div
                    onClick={() => {
                      setActiveTab("chat");
                      sendMessage("Cho em một ví dụ khác");
                    }}
                    style={{ background: "#fff", border: "1px solid #ece5fb", borderRadius: 12, padding: "10px 13px", fontSize: 12.5, fontWeight: 600, color: "#5b2fc0", cursor: "pointer" }}
                  >
                    Cho em một ví dụ khác
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== PRACTICE PANEL ===== */}
          {activeTab === "practice" && (
            <div
              className="ah-panel"
              style={{ background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: "24px 26px", boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)", maxWidth: 820 }}
            >
              {qLoading ? (
                <div style={{ textAlign: "center", color: "#9aa1b0", padding: "40px 0", ...POPPINS, fontWeight: 700 }}>Đang tải câu hỏi…</div>
              ) : !q ? (
                <div style={{ textAlign: "center", color: "#9aa1b0", padding: "40px 0" }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>📭</div>
                  <div style={{ ...POPPINS, fontWeight: 700 }}>Bài này chưa có câu hỏi luyện tập.</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Em thử học lý thuyết hoặc hỏi thầy AI nhé!</div>
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
                        <span style={{ fontSize: 16 }}>📍</span>
                        <span>Đang lùi Cây Tri thức về Nút Cha tiên quyết: <strong style={{ color: "#fbbf24" }}>"{currentNode?.name}"</strong></span>
                      </div>
                      <button
                        onClick={() => {
                          const orig = traversalStack[0];
                          if (orig) {
                            setCurrentStepId(orig.id);
                            setTraversalStack([]);
                            setBridgeText(null);
                            loadQuestions(orig.id);
                          }
                        }}
                        style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#cbd5e1", borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}
                      >
                        Về bài gốc ({traversalStack[0]?.name}) ↩
                      </button>
                    </div>
                  )}

                  <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.5, marginBottom: 18 }}>{q.q}</div>

                  {q.opts.map((text, i) => {
                    const letter = ["A", "B", "C", "D", "E", "F"][i] ?? "?";
                    const isSel = selected === i;
                    let optStyle: CSSProperties = {
                      display: "flex",
                      alignItems: "center",
                      gap: 13,
                      borderRadius: 14,
                      padding: "13px 15px",
                      fontSize: 14,
                      fontWeight: 600,
                      marginBottom: 10,
                      cursor: answered ? "default" : "pointer",
                      transition: "all .15s",
                    };
                    let badgeStyle: CSSProperties = { height: 28, width: 28, borderRadius: 9, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 };
                    let mark = "";
                    if (answered) {
                      if (i === q.correct) {
                        optStyle = { ...optStyle, border: "2px solid #14D9C0", background: "#F0FCF8", color: "#0d7a6c", fontWeight: 800 };
                        badgeStyle = { ...badgeStyle, background: "#14D9C0", color: "#fff" };
                        mark = "✅";
                      } else if (isSel) {
                        optStyle = { ...optStyle, border: "2px solid #F43F5E", background: "#FEF2F4", color: "#9f1239", fontWeight: 800 };
                        badgeStyle = { ...badgeStyle, background: "#F43F5E", color: "#fff" };
                        mark = "❌";
                      } else {
                        optStyle = { ...optStyle, opacity: 0.6, border: "1px solid #eef1f4" };
                        badgeStyle = { ...badgeStyle, background: "#f4f6f9", color: "#b3b9c4" };
                      }
                    } else if (isSel) {
                      optStyle = { ...optStyle, border: "2px solid #7C46E8", background: "#faf7ff", color: "#5b2fc0", fontWeight: 800, boxShadow: "0 0 0 4px #EFE9FD" };
                      badgeStyle = { ...badgeStyle, background: "#7C46E8", color: "#fff" };
                    } else {
                      optStyle = { ...optStyle, border: "1px solid #eef1f4", color: "#4b5060", background: "#fff" };
                      badgeStyle = { ...badgeStyle, background: "#f4f6f9", color: "#9aa1b0" };
                    }
                    return (
                      <div key={i} onClick={() => selectOpt(i)} style={optStyle}>
                        <span style={badgeStyle}>{letter}</span>
                        <span style={{ flex: 1 }}>{text}</span>
                        <span style={{ fontSize: 16 }}>{mark}</span>
                      </div>
                    );
                  })}

                  {showHint && hintText && (
                    <div style={{ marginTop: 14, background: "#F3FBF9", border: "1px solid #cfeee6", borderRadius: 16, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 18 }}>💡</span>
                        <div style={{ fontSize: 13, color: "#0d7a6c", lineHeight: 1.55, fontWeight: 600, flex: 1 }}>{hintText}</div>
                      </div>


                    </div>
                  )}

                  {answered && (
                    <div
                      style={{
                        marginTop: 16,
                        borderRadius: 14,
                        padding: "14px 16px",
                        fontSize: 14,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        ...(isCorrect
                          ? { background: "#F0FCF8", border: "1px solid #b8ede0", color: "#0d7a6c" }
                          : { background: "#fef3f5", border: "1px solid #f8d3da", color: "#c23a54" }),
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{isCorrect ? "🎉" : "🤗"}</span>
                      <span>{isCorrect ? "Tuyệt vời! Em trả lời chính xác rồi." : "Chưa đúng rồi, nhưng không sao! Xem gợi ý và thử lại nhé."}</span>
                    </div>
                  )}

                  {bridgeText && (
                    <div style={{ marginTop: 16, background: "linear-gradient(135deg, #065f46, #047857)", borderRadius: 16, padding: "16px 20px", border: "1px solid #10b981", color: "#fff", boxShadow: "0 10px 25px -5px rgba(16,185,129,0.4)" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#6ee7b7", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                        <span>✨ Cầu nối Tư duy Socratic (LLM Bridge Agent)</span>
                      </div>
                      <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 14px", color: "#ecfdf5", fontWeight: 600 }}>
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
                            toast.success(`🚀 Đã chuyển tới Bài toán ban đầu "${orig.name}"!`);
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
                        🚀 Quay trở lại thử sức Bài toán gốc "{traversalStack[0]?.name}"
                      </button>
                    </div>
                  )}

                  {cantDoOptions && (
                    <div style={{ marginTop: 14, background: "#faf7ff", border: "1px solid #ece5fb", borderRadius: 16, padding: "16px 18px" }}>
                      <div style={{ ...POPPINS, fontSize: 13, fontWeight: 800, color: "#5b2fc0", marginBottom: 8 }}>
                        💡 Đề xuất từ {COMPANION.name}:
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
                            🟢 Làm câu nhận biết (Dễ hơn)
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
                            📖 Ôn tập bài nền tảng: {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                    {!answered ? (
                      <div
                        onClick={submit}
                        style={{
                          ...POPPINS,
                          flex: 1,
                          borderRadius: 14,
                          padding: 14,
                          textAlign: "center",
                          fontWeight: 800,
                          fontSize: 15,
                          cursor: selected === null || submitting ? "not-allowed" : "pointer",
                          transition: "all .15s",
                          ...(selected === null || submitting
                            ? { background: "#eef1f4", color: "#b3b9c4" }
                            : { background: "linear-gradient(135deg,#8B5CF6,#7C46E8)", color: "#fff", boxShadow: "0 12px 22px -8px rgba(124,70,232,.5)" }),
                        }}
                      >
                        {submitting ? "Đang chấm…" : "Trả lời"}
                      </div>
                    ) : (
                      <div
                        onClick={next}
                        style={{
                          ...POPPINS,
                          flex: 1,
                          borderRadius: 14,
                          padding: 14,
                          textAlign: "center",
                          fontWeight: 800,
                          fontSize: 15,
                          cursor: "pointer",
                          transition: "all .15s",
                          background: "linear-gradient(135deg,#14D9C0,#0FB9A6)",
                          color: "#fff",
                          boxShadow: "0 12px 22px -8px rgba(15,185,166,.55)",
                        }}
                      >
                        {isLastAnswered ? "🎉 Hoàn thành bài học" : "Câu tiếp theo →"}
                      </div>
                    )}
                    {!answered && (
                      <>
                        <div
                          onClick={doHint}
                          style={{ ...POPPINS, background: "#faf7ff", border: "1px solid #ece5fb", color: "#7C46E8", borderRadius: 14, padding: "14px 20px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
                        >
                          {hintLoading ? "…" : "💡 Gợi ý"}
                        </div>
                        <div
                          onClick={handleCantDo}
                          style={{ ...POPPINS, background: "#fff8ec", border: "1px solid #ffe6bd", color: "#b7811f", borderRadius: 14, padding: "14px 20px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
                        >
                          🤷 Không làm được
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ===== CHAT PANEL ===== */}
          {activeTab === "chat" && (
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", width: "100%" }}>
              <div
                className="ah-panel"
                style={{ background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)", flex: "1 1 480px", maxWidth: 760, minWidth: 320, display: "flex", flexDirection: "column", height: 560, overflow: "hidden" }}
              >
                <div style={{ padding: "15px 20px", borderBottom: "1px solid #f2f4f7", display: "flex", alignItems: "center", gap: 11 }}>
                  <div style={{ height: 38, width: 38, borderRadius: "50%", background: "linear-gradient(135deg,#FFE7A3,#FFC24D)", display: "grid", placeItems: "center", overflow: "hidden" }}>
                    <img src={COMPANION.mascot} alt={COMPANION.name} style={{ width: 30, height: 30, objectFit: "contain" }} />
                  </div>
                  <div>
                    <div style={{ ...POPPINS, fontWeight: 700, fontSize: 14.5 }}>{COMPANION.name}</div>
                    <div style={{ fontSize: 11, color: "#0FB9A6", fontWeight: 600 }}>● gợi mở, không cho đáp án sẵn</div>
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                  {chat.map((m, i) =>
                    m.sender === "ai" ? (
                      <div key={i} style={{ display: "flex", maxWidth: "82%" }}>
                        <div style={{ background: "#f7f9fb", border: "1px solid #eef1f4", borderRadius: 16, borderBottomLeftRadius: 5, padding: "12px 15px", fontSize: 13.5, color: "#3a3f4d", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                          {m.text}
                        </div>
                      </div>
                    ) : (
                      <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                        <div style={{ background: "#16161F", color: "#fff", borderRadius: 16, borderBottomRightRadius: 5, padding: "11px 15px", fontSize: 13.5, lineHeight: 1.55, maxWidth: "78%" }}>
                          {m.text}
                        </div>
                      </div>
                    ),
                  )}
                  {chatSending && (
                    <div style={{ display: "flex", maxWidth: "82%" }}>
                      <div style={{ background: "#f7f9fb", border: "1px solid #eef1f4", borderRadius: 16, borderBottomLeftRadius: 5, padding: "12px 15px", fontSize: 13.5, color: "#9aa1b0" }}>
                        {COMPANION.name} đang soạn… ✍️
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ padding: "12px 18px 16px", borderTop: "1px solid #f2f4f7" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <div
                      onClick={() => {
                        setChatMascotState("encourage");
                        setChatMascotSpeech("Cố lên em! Nova ở đây giúp em từng bước nè 💪✨");
                        sendMessage("Em chưa hiểu chỗ này ạ");
                      }}
                      style={{ background: "#faf7ff", border: "1px solid #ece5fb", borderRadius: 999, padding: "7px 13px", fontSize: 12, fontWeight: 600, color: "#5b2fc0", cursor: "pointer" }}
                    >
                      🤔 Em chưa hiểu
                    </div>
                    <div
                      onClick={() => {
                        setChatMascotState("review");
                        setChatMascotSpeech("Nova sẽ đưa ví dụ minh họa để em dễ hình dung nhé! 📖💡");
                        sendMessage("Cho em một ví dụ khác");
                      }}
                      style={{ background: "#F3FBF9", border: "1px solid #e2f3ef", borderRadius: 999, padding: "7px 13px", fontSize: 12, fontWeight: 600, color: "#0FB9A6", cursor: "pointer" }}
                    >
                      💡 Cho em ví dụ
                    </div>
                  </div>
                  <form onSubmit={onSubmitChat} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f7f9fb", border: "1px solid #eef1f4", borderRadius: 16, padding: "7px 7px 7px 16px" }}>
                    <input
                      ref={inputRef}
                      placeholder={`Nhắn cho ${COMPANION.name}...`}
                      style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 14, fontFamily: "'Inter', sans-serif", color: "#16161F" }}
                    />
                    <button
                      type="submit"
                      disabled={chatSending}
                      style={{ height: 40, width: 44, border: "none", borderRadius: 12, background: "linear-gradient(135deg,#14D9C0,#0FB9A6)", color: "#fff", fontSize: 16, cursor: "pointer", boxShadow: "0 8px 16px -6px rgba(15,185,166,.6)", opacity: chatSending ? 0.6 : 1 }}
                    >
                      ➤
                    </button>
                  </form>
                </div>
              </div>

              {/* Mascot Companion Animated GIF outside Chat Frame */}
              <div style={{ flexShrink: 0, marginTop: 4 }}>
                <MascotCompanion
                  state={chatMascotState}
                  name={COMPANION.name}
                  speechBubble={chatMascotSpeech}
                />
              </div>
            </div>
          )}

          {/* ===== EXAMS PANEL ===== */}
          {activeTab === "exams" && !needsDiagnostic && (
            <div className="ah-panel" style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 960 }}>
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
                              ⏱️ {formattedTime}
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
                                  <div
                                    key={oIdx}
                                    onClick={() => setExamAnswers((prev) => ({ ...prev, [currentQuestion.id]: String(oIdx) }))}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 12,
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
                                  </div>
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
                <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
                  {/* Cột 1: Nhập mã đề thi */}
                  <div style={{ flex: 1, background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: 22, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14, boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)" }}>
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
                  <div style={{ flex: 1.2, background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: 22, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)" }}>
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
              <div
                onClick={restart}
                style={{ ...POPPINS, flex: 1, background: "linear-gradient(135deg,#14D9C0,#0FB9A6)", color: "#fff", borderRadius: 15, padding: 15, fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 12px 24px -8px rgba(15,185,166,.55)" }}
              >
                Học tiếp →
              </div>
              <div
                onClick={restart}
                style={{ background: "#fff", border: "1px solid #eef1f4", color: "#5b6072", borderRadius: 15, padding: "15px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                Đóng
              </div>
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
            padding: 24,
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
                          ⏱️ {formattedTime}
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
                              <div
                                key={oIdx}
                                onClick={() => setExamAnswers((prev) => ({ ...prev, [currentQuestion.id]: String(oIdx) }))}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 12,
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
                              </div>
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
                        🚪 Hủy/Thoát thi
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
                  <div style={{ fontSize: 60, marginBottom: 12 }}>📊</div>
                  <div style={{ ...BALOO, fontWeight: 800, fontSize: 25, marginBottom: 6 }}>Kết quả Chẩn đoán năng lực sơ bộ</div>
                  <p style={{ fontSize: 13.5, color: "#5b6072", lineHeight: 1.6, marginBottom: 20 }}>
                    Hệ thống đã phân tích câu trả lời của em qua 25 câu hỏi chẩn đoán để xác định mức độ hiểu biết đối với từng chủ đề kiến thức.
                  </p>

                  <div style={{ display: "flex", gap: 16, textAlign: "left", marginBottom: 24 }}>
                    {/* Strengths */}
                    <div style={{ flex: 1, background: "#F3FBF9", border: "1px solid #d4f2ea", borderRadius: 20, padding: 16 }}>
                      <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#0FB9A6", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
                        🟢 Kỹ năng vững vàng ({masteredNodes.length})
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
                        🔴 Cần cải thiện ({weakNodes.length})
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
                padding: "40px 36px 32px",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
                textAlign: "center",
                animation: "ah-pop .45s cubic-bezier(.16,1,.3,1)",
              }}
            >
              <div style={{ fontSize: 56, marginBottom: 12, animation: "ah-float 3s ease-in-out infinite" }}>📐</div>
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
                    <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#7C46E8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
                      Đề thi được giao cho em:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 180, overflowY: "auto", paddingRight: 4 }}>
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
                    Hoặc nhập mã đề thi (Exam ID) khác:
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      type="text"
                      placeholder="Nhập mã đề thi (UUID)..."
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
                        background: "#16161F",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {loadingExam ? "Tải..." : "Bắt đầu"}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 32, borderTop: "1px solid #f2f4f7", paddingTop: 20 }}>
                <button
                  onClick={() => {
                    localStorage.clear();
                    router.push("/");
                  }}
                  style={{
                    ...POPPINS,
                    border: "1px solid #f8d3da",
                    borderRadius: 14,
                    padding: "11px 24px",
                    background: "#fef3f5",
                    color: "#c23a54",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  🚪 Đăng xuất tài khoản
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
    </div>
  );
}
