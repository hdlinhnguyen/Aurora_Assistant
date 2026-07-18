"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { SafeHtml } from "@/components/ui/safe-html";
import { toast } from "sonner";
import { BookOpen, History, Map, Sparkles, ArrowLeft, MessageSquare, Send, Check, CornerDownRight, ChevronLeft, ChevronRight, Compass, HelpCircle, Award, ListTodo, AlertCircle, PlayCircle, Key, Lock, X, Zap, Target, Clock, RefreshCw } from "lucide-react";
import KnowledgeTree from "../components/KnowledgeTree";
import GuidedTour from "../components/GuidedTour";
import QuickRoleSwitcher from "../components/QuickRoleSwitcher";
import StudentMasteryDashboard from "./components/StudentMasteryDashboard";
import { TopicMastery } from "@/lib/mastery";
import {
  buildQuestionAttemptProperties,
  QuestionTimer,
  telemetry,
} from "@/lib/telemetry";


interface NodeItem {
  id: string;
  subject: string;
  name: string;
  theory: string;
  topicGroup?: string;
  posX: number;
  posY: number;
  isRoot: boolean;
}

interface EdgeItem {
  id: string;
  subject: string;
  sourceId: string;
  targetId: string;
}

interface Question {
  id: string;
  nodeId: string;
  content: string;
  optionsJson: string;
  correctOption: number;
  difficulty: string;
}

interface StudentState {
  initialLevelNodeId: string;
  currentLevelNodeId: string;
  needsDiagnostic: boolean;
}

interface LogItem {
  id: string;
  nodeName: string;
  action: string;
  detail: string;
  createdAt: string;
}

export default function StudentTutorPage() {
  const router = useRouter();
  const [userName, setUserName] = useState("Học sinh");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");

    // Tree Data
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [edges, setEdges] = useState<EdgeItem[]>([]);
  const [studentState, setStudentState] = useState<StudentState | null>(null);
  const [nodeStatus, setNodeStatus] = useState<Record<string, "mastered" | "struggle" | "learning" | "locked" | "initial">>({});
  const [masteryByTopic, setMasteryByTopic] = useState<Record<string, TopicMastery>>({});

  // Active Node Drawer
  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null);
  const [drawerTab, setDrawerTab] = useState<"theory" | "practice">("theory");

  // Node Socratic Theory RAG Chat
  const [theoryChat, setTheoryChat] = useState<Array<{ sender: "student" | "ai"; content: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Practice Mode States
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // "Cant Do" Adaptive Branching options
  const [cantDoOptions, setCantDoOptions] = useState<{
    parents: Array<{ id: string; name: string }>;
    hasEasyQ: boolean;
  } | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<string | null>(null);

  // Student Logs
  const [activityLogs, setActivityLogs] = useState<LogItem[]>([]);

  // Learning Path & Hints States
  const [learningPath, setLearningPath] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"logs" | "path">("path");
  const [hintPressCount, setHintPressCount] = useState<number>(0);
  const [activeHint, setActiveHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState<boolean>(false);

  // New Promax Socratic Workspace States
  const [quizMode, setQuizMode] = useState<"diagnostic" | "practice" | null>(null);
  const [showPurposeModal, setShowPurposeModal] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [nodeForPurpose, setNodeForPurpose] = useState<NodeItem | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<"graph" | "workspace">("graph");
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [navHistory, setNavHistory] = useState<NodeItem[]>([]);
  const [leftWidth, setLeftWidth] = useState<number>(45);
  const [questionChat, setQuestionChat] = useState<Record<string, Array<{sender: "student" | "ai", content: string}>>>({});
  const [questionChatInput, setQuestionChatInput] = useState("");
  const [questionChatLoading, setQuestionChatLoading] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showAutoRouteModal, setShowAutoRouteModal] = useState(false);
  const [nextRecommendedNode, setNextRecommendedNode] = useState<NodeItem | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const learningSessionIdRef = useRef("");
  const questionTimerRef = useRef(new QuestionTimer());
  const attemptSubmittedRef = useRef(false);
  const previousSelectedOptionRef = useRef<number | null>(null);

  // General Exam Player States
  const [examsList, setExamsList] = useState<any[]>([]);
  const [activeExam, setActiveExam] = useState<any | null>(null);
  const [examQuestions, setExamQuestions] = useState<any[]>([]);
  const [examAnswers, setExamAnswers] = useState<Record<string, string>>({}); // questionId -> choiceId
  const [examTimeRemaining, setExamTimeRemaining] = useState<number>(0);
  const [examTimerActive, setExamTimerActive] = useState<boolean>(false);
  const [examFinishedScore, setExamFinishedScore] = useState<{ totalScore: string; maxScore: string } | null>(null);
  const [loadingExam, setLoadingExam] = useState<boolean>(false);
  const [submittingExam, setSubmittingExam] = useState<boolean>(false);
  const [customExamCode, setCustomExamCode] = useState<string>("");
  const [examQIndex, setExamQIndex] = useState<number>(0);

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (examTimerActive && examTimeRemaining > 0) {
      interval = setInterval(() => {
        setExamTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            // Auto submit
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


  const handleJoinClassByCode = (codeToJoin?: string) => {
    const code = (codeToJoin || joinCodeInput).trim().toUpperCase();
    if (!code) {
      toast.error("Vui lòng nhập mã lớp học!");
      return;
    }
    let targetSubj = "Toán học 10";
    if (code.includes("PHY") || code.includes("LY")) targetSubj = "Vật lý 10";
    if (code.includes("CHEM") || code.includes("HOA")) targetSubj = "Hóa học 10";

    if (!subjects.includes(targetSubj)) {
      setSubjects((prev) => [...prev, targetSubj]);
    }
    setSelectedSubject(targetSubj);
    setShowJoinModal(false);
    setJoinCodeInput("");
    toast.success(`🎉 Đã kết nối thành công vào lớp môn ${targetSubj} (Mã: ${code})! Sơ đồ cây kiến thức đã được tải.`);
  };

  const loadStudentExams = async (subj: string) => {
    if (!subj || subj === "Môn học Trải nghiệm (Demo)") return;
    try {
      const list = await apiFetch(`/student/exams?subject=${encodeURIComponent(subj)}`);
      setExamsList(list || []);
    } catch (e) {
      console.error("Failed to load student exams", e);
    }
  };

  const handleStartExam = async (examId: string) => {
    if (!examId.trim()) {
      toast.error("Vui lòng nhập mã đề thi hợp lệ.");
      return;
    }
    setLoadingExam(true);
    try {
      const data = await apiFetch(`/student/exams/${examId.trim()}`);
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
  };

  const handleSubmitExam = async (force: boolean = false) => {
    if (!activeExam) return;
    if (!force && !confirm("Bạn có chắc chắn muốn nộp bài thi không?")) {
      return;
    }
    setSubmittingExam(true);
    setExamTimerActive(false);
    try {
      const res = await apiFetch(`/student/exams/${activeExam.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ answers: examAnswers })
      });
      setExamFinishedScore({
        totalScore: res.totalScore,
        maxScore: res.maxScore
      });
      toast.success("Nộp bài thi thành công!");
    } catch (err: any) {
      toast.error("Lỗi khi nộp bài thi: " + (err.message || err));
      setExamTimerActive(true);
    } finally {
      setSubmittingExam(false);
    }
  };

  const handleAutoSubmitExam = () => {
    toast.warning("Hết giờ làm bài! Hệ thống tự động nộp bài của bạn.");
    handleSubmitExam(true);
  };


  const handleImportMockTree = async () => {
    if (!selectedSubject) {
      toast.warning("Vui lòng chọn môn học trước khi nạp cây mẫu!");
      return;
    }
    try {
      const res = await fetch("/mock_knowledge_tree.json");
      const mockGraph = await res.json();
      
      await apiFetch(`/subjects/${encodeURIComponent(selectedSubject)}/save-tree`, {
        method: "POST",
        body: JSON.stringify({
          nodes: mockGraph.nodes,
          edges: mockGraph.edges
        })
      });

      toast.success(`🎉 Đã nạp thành công Sơ Đồ Cây Mẫu vào môn "${selectedSubject}"!`);
      if (!subjects.includes(selectedSubject)) {
        setSubjects((prev) => [...prev, selectedSubject]);
      }
      setSelectedSubject(selectedSubject);
      localStorage.setItem("aurora_student_subject", selectedSubject);
      setActiveMainTab("graph");
      await loadTreeData();
    } catch (err: any) {
      toast.error("Lỗi khi nạp Cây Mẫu: " + (err.message || err));
    }
  };

  useEffect(() => {
    const userStr = localStorage.getItem("aurora_user");
    if (!userStr) {
      router.push("/");
      return;
    }
    const user = JSON.parse(userStr);
    setUserName(user.name);

    // Restore saved states
    const savedDrawerTab = localStorage.getItem("aurora_student_drawer_tab") as "theory" | "practice" | null;
    const savedActiveMainTab = localStorage.getItem("aurora_student_active_main_tab") as "graph" | "workspace" | null;

    if (savedDrawerTab) {
      setDrawerTab(savedDrawerTab);
    }
    if (savedActiveMainTab) {
      setActiveMainTab(savedActiveMainTab);
    }

    loadSubjects();
  }, [router]);

  // Load Tree when subject changes
  useEffect(() => {
    if (selectedSubject) {
      loadTreeData();
      loadStudentState();
      loadLearningPath();
      loadStudentExams(selectedSubject);
      apiFetch(`/student/mastery?subject=${encodeURIComponent(selectedSubject)}`)
        .then((profile) => setMasteryByTopic(profile?.topics || {}))
        .catch(() => setMasteryByTopic({}));
      
      const savedNodeStr = localStorage.getItem("aurora_student_selected_node");
      if (selectedSubject === "Môn học Trải nghiệm (Demo)") {
        const mockNode = { id: "mock-node-1-1", subject: "Môn học Trải nghiệm (Demo)", name: "Cộng phân số cùng mẫu", theory: "Quy tắc: Muốn cộng hai phân số có cùng mẫu số, ta cộng hai tử số với nhau và giữ nguyên mẫu số. Ví dụ: 1/5 + 2/5 = (1+2)/5 = 3/5.", topicGroup: "Đại số", posX: 150, posY: 310, isRoot: false };
        setSelectedNode(mockNode);
        setActiveMainTab("workspace");
        loadQuestions("mock-node-1-1");
        setTheoryChat([
          { sender: "ai", content: "Chào Bi! Thầy có câu hỏi nhé: Muốn cộng hai phân số cùng mẫu số ta làm thế nào?" },
          { sender: "student", content: "Dạ ta cộng tử với tử, giữ nguyên mẫu ạ." },
          { sender: "ai", content: "Chính xác! Vậy thử áp dụng tính $1/5 + 2/5$ xem bằng bao nhiêu nhé?" }
        ]);
      } else if (savedNodeStr) {
        try {
          const parsedNode = JSON.parse(savedNodeStr);
          if (parsedNode.subject === selectedSubject) {
            setSelectedNode(parsedNode);
          } else {
            setSelectedNode(null);
          }
        } catch (e) {
          setSelectedNode(null);
        }
      } else {
        setSelectedNode(null);
      }
    }
  }, [selectedSubject]);

  // Scroll chat bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [theoryChat]);

  // Save active states to localStorage to persist reload
  useEffect(() => {
    if (selectedSubject) {
      localStorage.setItem("aurora_student_subject", selectedSubject);
    }
  }, [selectedSubject]);

  useEffect(() => {
    if (selectedNode) {
      localStorage.setItem("aurora_student_selected_node", JSON.stringify(selectedNode));
    } else {
      localStorage.removeItem("aurora_student_selected_node");
    }
  }, [selectedNode]);

  useEffect(() => {
    localStorage.setItem("aurora_student_drawer_tab", drawerTab);
  }, [drawerTab]);

  useEffect(() => {
    localStorage.setItem("aurora_student_active_main_tab", activeMainTab);
  }, [activeMainTab]);

  const loadSubjects = async () => {
    try {
      const data = await apiFetch("/subjects");
      let finalSubjects = data || [];
      const tourActive = localStorage.getItem("aurora_tour_active") === "true";
      if (tourActive) {
        if (!finalSubjects.includes("Môn học Trải nghiệm (Demo)")) {
          finalSubjects = ["Môn học Trải nghiệm (Demo)", ...finalSubjects];
        }
      }
      setSubjects(finalSubjects);
      const savedSub = localStorage.getItem("aurora_student_subject");
      if (tourActive && !selectedSubject) {
        setSelectedSubject("Môn học Trải nghiệm (Demo)");
      } else if (savedSub && finalSubjects.includes(savedSub)) {
        setSelectedSubject(savedSub);
      } else if (finalSubjects.length > 0) {
        setSelectedSubject(finalSubjects[0]);
      }
    } catch (err) {
      console.error("Failed to load subjects:", err);
    }
  };

  const loadTreeData = async () => {
    if (selectedSubject === "Môn học Trải nghiệm (Demo)") {
      setNodes([
        { id: "mock-node-root", subject: "Môn học Trải nghiệm (Demo)", name: "Toán đại số lớp 7", theory: "Lý thuyết chung về Toán đại số", topicGroup: "Đại số", posX: 400, posY: 50, isRoot: true },
        { id: "mock-node-1", subject: "Môn học Trải nghiệm (Demo)", name: "Phép cộng phân số", theory: "Cộng hai phân số khác mẫu.", topicGroup: "Đại số", posX: 250, posY: 180, isRoot: false },
        { id: "mock-node-1-1", subject: "Môn học Trải nghiệm (Demo)", name: "Cộng phân số cùng mẫu", theory: "Quy tắc: Muốn cộng hai phân số có cùng mẫu số, ta cộng hai tử số với nhau và giữ nguyên mẫu số. Ví dụ: 1/5 + 2/5 = (1+2)/5 = 3/5.", topicGroup: "Đại số", posX: 150, posY: 310, isRoot: false }
      ]);
      setEdges([
        { id: "mock-edge-1", subject: "Môn học Trải nghiệm (Demo)", sourceId: "mock-node-root", targetId: "mock-node-1" },
        { id: "mock-edge-2", subject: "Môn học Trải nghiệm (Demo)", sourceId: "mock-node-1", targetId: "mock-node-1-1" }
      ]);
      return;
    }
    try {
      const data = await apiFetch(`/subjects/${encodeURIComponent(selectedSubject)}/tree`);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch (err) {
      console.error("Failed to load tree:", err);
    }
  };

  const loadStudentState = async () => {
    if (selectedSubject === "Môn học Trải nghiệm (Demo)") {
      setStudentState({
        id: "mock-state-id",
        studentId: "mock-student-id",
        subject: "Môn học Trải nghiệm (Demo)",
        currentLevelNodeId: "mock-node-1-1",
        needsDiagnostic: false
      } as any);
      setActivityLogs([
        { id: "mock-log-1", studentId: "1", subject: "Môn học Trải nghiệm (Demo)", nodeId: "mock-node-1-1", action: "click_node", detail: "Chọn node Cộng phân số cùng mẫu", createdAt: new Date().toISOString() }
      ] as any);
      setNodeStatus({
        "mock-node-root": "mastered",
        "mock-node-1": "learning",
        "mock-node-1-1": "initial"
      });
      return;
    }
    try {
      const state = await apiFetch(`/subjects/${encodeURIComponent(selectedSubject)}/state`);
      setStudentState(state);
      
      // Load logs safely
      let progressData: any = null;
      try {
        progressData = await apiFetch(`/teacher/students/${JSON.parse(localStorage.getItem("aurora_user")!).id}/progress/${encodeURIComponent(selectedSubject)}`);
        setActivityLogs(progressData?.logs || []);
      } catch (e) {
        console.warn("Could not load student progress logs:", e);
        setActivityLogs([]);
      }
      
      // Compute status dictionary
      // Status: mastered, struggle, learning, locked, initial
      const statusMap: Record<string, "mastered" | "struggle" | "learning" | "locked" | "initial"> = {};
      if (progressData && progressData.nodeStatus) {
        Object.keys(progressData.nodeStatus).forEach((k) => {
          statusMap[k] = progressData.nodeStatus[k];
        });
      }
      
      // Mark initial and current nodes
      if (state) {
        if (state.initialLevelNodeId) {
          statusMap[state.initialLevelNodeId] = "initial";
        }
        if (state.currentLevelNodeId && statusMap[state.currentLevelNodeId] !== "mastered") {
          statusMap[state.currentLevelNodeId] = "learning";
        }
      }
      
      setNodeStatus(statusMap);
    } catch (err) {
      console.error("Failed to load state/progress:", err);
    }
  };

  const loadLearningPath = async () => {
    try {
      const data = await apiFetch("/student/learning-path");
      if (data && data.ordered_steps) {
        setLearningPath(data);
      } else {
        setLearningPath(null);
      }
    } catch (err) {
      console.error("Failed to load learning path:", err);
    }
  };

  const handleRequestHint = async () => {
    if (!selectedNode || hintLoading) return;
    setHintLoading(true);
    try {
      const nextPressCount = hintPressCount + 1;
      const timing = questionTimerRef.current.snapshot();
      telemetry.track(
        "hint_requested",
        { hint_level: nextPressCount },
        {
          session_id: learningSessionIdRef.current || undefined,
          attempt_id: timing.attemptId || undefined,
          topic_id: selectedNode.id,
        },
      );
      const res = await apiFetch("/student/hints", {
        method: "POST",
        body: JSON.stringify({
          topicId: selectedNode.id,
          pressCount: nextPressCount
        })
      });
      setHintPressCount(nextPressCount);
      questionTimerRef.current.markHintViewed();
      telemetry.track(
        "hint_rendered",
        { hint_level: nextPressCount },
        {
          session_id: learningSessionIdRef.current || undefined,
          attempt_id: timing.attemptId || undefined,
          topic_id: selectedNode.id,
        },
      );
      void telemetry.flush().catch(() => undefined);
      setActiveHint(res.content || "Chưa có gợi ý nào cho cấp độ này.");
    } catch (err: any) {
      toast.error("Không thể tải gợi ý: " + err.message);
    } finally {
      setHintLoading(false);
    }
  };

  const handleStartNode = async (node: NodeItem) => {
    try {
      await apiFetch(`/subjects/${encodeURIComponent(selectedSubject)}/start`, {
        method: "POST",
        body: JSON.stringify({ nodeId: node.id }),
      });
      await loadStudentState();
      // Auto open node drawer
      setSelectedNode(node);
      setDrawerTab("theory");
    } catch (err: any) {
      toast.error("Lỗi khi bắt đầu học: " + err.message);
    }
  };

  const handlePivotCenter = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    setFocusedNodeId(nodeId);
    setNavHistory(prev => {
      const idx = prev.findIndex(item => item.id === nodeId);
      if (idx !== -1) {
        return prev.slice(0, idx + 1);
      } else {
        return [...prev, node];
      }
    });
  };

  const handleShowContent = (node: NodeItem) => {
    setSelectedNode(node);
    handlePivotCenter(node.id);
    setActiveMainTab("workspace");
    setDrawerTab("theory");
    setTheoryChat([
      {
        sender: "ai",
        content: `Chào em! Thầy là Socratic Tutor. Em có thắc mắc gì về bài học "${node.name}" không? Hãy hỏi thầy nhé, thầy sẽ gợi mở giúp em tự thấu hiểu bản chất!`,
      },
    ]);

    // Reset practice states
    setQuestions([]);
    setCurrentQIndex(0);
    setSelectedOption(null);
    setAnswerFeedback(null);
    setCantDoOptions(null);
    setDifficultyFilter(null);
    setHintPressCount(0);
    setActiveHint(null);
    loadQuestions(node.id);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const container = e.currentTarget.parentElement;
      if (!container) return;
      const containerWidth = container.getBoundingClientRect().width;
      const deltaX = moveEvent.clientX - startX;
      const deltaPercent = (deltaX / containerWidth) * 100;
      const newWidth = Math.max(25, Math.min(75, startWidth + deltaPercent));
      setLeftWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleNodeClick = (node: NodeItem) => {
    console.log("[DEBUG] tutor/page.tsx handleNodeClick called with:", node.name);
    setSelectedNode(node);
    handlePivotCenter(node.id);

    // If student state is nil and node is not root, they must click root or select first
    if (!studentState && !node.isRoot) {
      toast.warning("Vui lòng chọn nút Gốc (Tên môn học) để bắt đầu lộ trình học!");
      return;
    }

    if (!studentState) {
      handleStartNode(node);
      return;
    }

    setNodeForPurpose(node);
    setShowPurposeModal(true);
    console.log("[DEBUG] tutor/page.tsx showPurposeModal set to true");
  };

  const handleStartNodeMode = (node: NodeItem | null, selectedMode: "theory" | "practice" | "diagnostic") => {
    const targetNode = node || selectedNode || nodes.find(n => n.id === focusedNodeId) || nodes[0];
    if (!targetNode) {
      toast.warning("Chưa chọn bài học nào!");
      return;
    }
    setShowPurposeModal(false);
    setSelectedNode(targetNode);
    handlePivotCenter(targetNode.id);
    setActiveMainTab("workspace");

    if (selectedMode === "theory") {
      setDrawerTab("theory");
      setTheoryChat([
        {
          sender: "ai",
          content: `Chào em! Thầy là Socratic Tutor. Em có thắc mắc gì về bài học "${targetNode.name}" không? Hãy hỏi thầy nhé, thầy sẽ gợi mở giúp em tự thấu suốt bản chất!`,
        },
      ]);
    } else {
      setDrawerTab("practice");
      setQuizMode(selectedMode === "diagnostic" ? "diagnostic" : "practice");
      // Reset practice states
      setQuestions([]);
      setCurrentQIndex(0);
      setSelectedOption(null);
      setAnswerFeedback(null);
      setCantDoOptions(null);
      setDifficultyFilter(null);
      setHintPressCount(0);
      setActiveHint(null);
      loadQuestions(targetNode.id);
    }
  };

  const getBktScoreForNode = (nodeId: string) => {
    const state = masteryByTopic[nodeId];
    return {
      mastery: state?.masteryProbability ?? 0,
      confidence: state?.confidenceScore ?? 0,
    };
  };

  const loadQuestions = async (nodeId: string) => {
    if (selectedSubject === "Môn học Trải nghiệm (Demo)") {
      setQuestions([
        {
          id: "mock-q-1",
          nodeId: "mock-node-1-1",
          content: "Tính phép cộng phân số sau: 2/7 + 3/7 = ?",
          optionsJson: JSON.stringify(["5/7", "5/14", "6/7", "1/7"]),
          correctOption: 0,
          difficulty: "easy"
        }
      ]);
      return;
    }
    try {
      const data = await apiFetch(`/nodes/${nodeId}/questions`);
      setQuestions(data || []);
    } catch (err) {
      console.error("Failed to load questions:", err);
    }
  };

  // Socratic theory chat
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedNode || chatLoading) return;

    const message = chatInput.trim();
    setChatInput("");
    
    const newChat = [...theoryChat, { sender: "student" as const, content: message }];
    setTheoryChat(newChat);
    setChatLoading(true);

    try {
      const res = await apiFetch(`/nodes/${selectedNode.id}/chat-theory`, {
        method: "POST",
        body: JSON.stringify({ message, history: newChat }),
      });
      setTheoryChat([...newChat, { sender: "ai", content: res.reply }]);
    } catch (err: any) {
      setTheoryChat([...newChat, { sender: "ai", content: "Lỗi kết nối: " + err.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSendQuestionChat = async (e: React.FormEvent, questionId: string) => {
    e.preventDefault();
    if (!questionChatInput.trim() || questionChatLoading || !selectedNode) return;

    const message = questionChatInput.trim();
    setQuestionChatInput("");

    const currentQChat = questionChat[questionId] || [];
    const newChat = [...currentQChat, { sender: "student" as const, content: message }];
    setQuestionChat(prev => ({ ...prev, [questionId]: newChat }));
    setQuestionChatLoading(true);

    try {
      const currentQ = filteredQuestions[currentQIndex];
      let options: string[] = [];
      try {
        options = JSON.parse(currentQ.optionsJson);
      } catch (err) {}
      
      const contextualMessage = `[Hỏi về câu hỏi này]: ${message}\n(Ngữ cảnh câu hỏi: "${currentQ.content}", Các lựa chọn đáp án: ${JSON.stringify(options)}, Phương án em chọn: "${selectedOption !== null ? options[selectedOption] : "Chưa chọn"}")`;

      const res = await apiFetch(`/nodes/${selectedNode.id}/chat-theory`, {
        method: "POST",
        body: JSON.stringify({ message: contextualMessage, history: newChat }),
      });
      setQuestionChat(prev => ({
        ...prev,
        [questionId]: [...newChat, { sender: "ai", content: res.reply }]
      }));
    } catch (err: any) {
      setQuestionChat(prev => ({
        ...prev,
        [questionId]: [...newChat, { sender: "ai", content: "Lỗi kết nối: " + err.message }]
      }));
    } finally {
      setQuestionChatLoading(false);
    }
  };

  const handleAdaptiveDowngrade = async (nodeId: string) => {
    try {
      const res = await apiFetch(`/subjects/nodes/${nodeId}/adaptive-downgrade`, {
        method: "POST"
      });
      if (res.hasParent) {
        toast.warning("HẠ CẤP THÍCH ỨNG", {
          description: `⚠️ NHẬN DIỆN HỔNG KIẾN THỨC NỀN: Phần này có vẻ hơi khó với em. Hãy cùng ôn tập bài học nền tảng "${res.parentName}" trước nhé!`
        });
        const parentNode = nodes.find(n => n.id === res.parentId);
        if (parentNode) {
          handleStartNodeMode(parentNode, "practice");
        }
      } else {
        toast.warning("HỔNG KIẾN THỨC", {
          description: "⚠️ Em đã dùng hết gợi ý nhưng chưa vượt qua được thử thách này. Hãy đọc lại lý thuyết nhé!"
        });
        setDrawerTab("theory");
      }
      loadStudentState();
      loadTreeData();
    } catch (err: any) {
      console.error("Lỗi hạ cấp thích ứng:", err);
    }
  };

  // Submit Answer trắc nghiệm
  const handleSubmitAnswer = async () => {
    if (selectedOption === null || !selectedNode || submitting) return;
    
    const currentQ = filteredQuestions[currentQIndex];
    if (!currentQ) return;

    setSubmitting(true);
    setAnswerFeedback(null);

    try {
      const timing = questionTimerRef.current.snapshot();
      telemetry.track(
        "question_answer_submitted",
        buildQuestionAttemptProperties(currentQ.id, selectedOption, timing),
        {
          session_id: learningSessionIdRef.current || undefined,
          attempt_id: timing.attemptId || undefined,
          topic_id: selectedNode.id,
        },
      );
      const res = await apiFetch(`/nodes/${selectedNode.id}/answer`, {
        method: "POST",
        body: JSON.stringify({
          questionId: currentQ.id,
          selectedOption,
        }),
      });
      attemptSubmittedRef.current = true;
      telemetry.track(
        "question_graded",
        { question_id: currentQ.id, is_correct: Boolean(res.isCorrect) },
        {
          session_id: learningSessionIdRef.current || undefined,
          attempt_id: timing.attemptId || undefined,
          topic_id: selectedNode.id,
        },
      );
      void telemetry.flush().catch(() => undefined);

      if (res.isCorrect) {
        setAnswerFeedback({ isCorrect: true, message: "🎉 Tuyệt vời! Câu trả lời của em hoàn toàn chính xác." });
        loadStudentState();
        loadTreeData();
        loadLearningPath();

        // Trigger promax confetti animation
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);

        // Check learning path for next step auto-routing
        if (learningPath && learningPath.ordered_steps) {
          const currentStepIndex = learningPath.ordered_steps.findIndex((s: any) => s.topic_id === selectedNode.id);
          if (currentStepIndex !== -1 && currentStepIndex < learningPath.ordered_steps.length - 1) {
            const nextStep = learningPath.ordered_steps[currentStepIndex + 1];
            const nextNode = nodes.find(n => n.id === nextStep.topic_id);
            if (nextNode) {
              setNextRecommendedNode(nextNode);
              setTimeout(() => {
                setShowAutoRouteModal(true);
              }, 1500);
            }
          }
        }
      } else {
        setAnswerFeedback({ isCorrect: false, message: "❌ Rất tiếc, câu trả lời chưa chính xác. Em thử lại nhé!" });
        setShake(true);
        setTimeout(() => setShake(false), 500);

        // If they have pressed hints 3 times or more and failed, trigger downgrade!
        if (hintPressCount >= 3) {
          setTimeout(() => {
            handleAdaptiveDowngrade(selectedNode.id);
          }, 1200);
        }
      }
    } catch (err: any) {
      toast.error("Lỗi khi nộp bài: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // "Không làm được" button logic
  const handleCantDo = async () => {
    if (!selectedNode || submitting) return;

    if (hintPressCount >= 3) {
      await handleAdaptiveDowngrade(selectedNode.id);
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`/nodes/${selectedNode.id}/cant-do`, {
        method: "POST",
      });
      setCantDoOptions(res);
      setAnswerFeedback(null);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      loadStudentState(); // reload logs
    } catch (err: any) {
      toast.error("Lỗi xử lý: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Apply adaptive filters
  const handleChooseEasier = () => {
    setDifficultyFilter("easy");
    setCantDoOptions(null);
    setCurrentQIndex(0);
    setSelectedOption(null);
  };

  const handleChooseFoundational = (parentId: string, parentName: string) => {
    const parentNode = nodes.find((n) => n.id === parentId);
    if (parentNode) {
      handleNodeClick(parentNode);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push("/");
  };

  const filteredQuestions = questions.filter(
    (q) => !difficultyFilter || q.difficulty === difficultyFilter
  );
  const telemetryQuestion = filteredQuestions[currentQIndex];

  useEffect(() => {
    const sessionId = window.crypto.randomUUID();
    learningSessionIdRef.current = sessionId;
    telemetry.track(
      "learning_session_started",
      { session_id: sessionId },
      { session_id: sessionId },
    );
    void telemetry.flush().catch(() => undefined);

    const handleFocus = () => questionTimerRef.current.setFocused(true);
    const handleBlur = () => questionTimerRef.current.setFocused(false);
    const handleVisibility = () => questionTimerRef.current.setVisible(!document.hidden);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      telemetry.track(
        "learning_session_ended",
        { session_id: sessionId },
        { session_id: sessionId },
      );
      void telemetry.flush().catch(() => undefined);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!telemetryQuestion || !selectedNode) return;
    const attemptId = window.crypto.randomUUID();
    questionTimerRef.current.present(attemptId);
    attemptSubmittedRef.current = false;
    previousSelectedOptionRef.current = null;
    telemetry.track(
      "question_presented",
      { question_id: telemetryQuestion.id, difficulty: telemetryQuestion.difficulty },
      {
        session_id: learningSessionIdRef.current || undefined,
        attempt_id: attemptId,
        topic_id: selectedNode.id,
      },
    );
    void telemetry.flush().catch(() => undefined);

    return () => {
      if (attemptSubmittedRef.current) return;
      const timing = questionTimerRef.current.snapshot();
      telemetry.track(
        "question_abandoned",
        {
          question_id: telemetryQuestion.id,
          elapsed_time_ms: timing.elapsedTimeMs,
          active_time_ms: timing.activeTimeMs,
          hint_count: timing.hintCount,
        },
        {
          session_id: learningSessionIdRef.current || undefined,
          attempt_id: attemptId,
          topic_id: selectedNode.id,
        },
      );
    };
  }, [telemetryQuestion?.id, selectedNode?.id]);

  useEffect(() => {
    if (selectedOption === null) {
      previousSelectedOptionRef.current = null;
    } else if (
      previousSelectedOptionRef.current !== null &&
      previousSelectedOptionRef.current !== selectedOption
    ) {
      questionTimerRef.current.recordAnswerChange();
    }
    previousSelectedOptionRef.current = selectedOption;
  }, [selectedOption]);

  // Render the student tutor workspace interface
  return (
    <div className="flex h-screen bg-slate-50 text-zinc-950 overflow-hidden relative">
      
      {/* Sidebar - Course & Logs */}
      <aside className={`border-r border-slate-200 bg-white flex flex-col z-10 shadow-sm transition-all duration-300 ${
        sidebarCollapsed ? "w-0 overflow-hidden opacity-0 border-r-0 pointer-events-none" : "w-80"
      }`}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 animate-pulse" />
            <span className="font-black text-slate-900 tracking-tight text-lg uppercase">Aurora Tutor</span>
          </div>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-650 transition-colors cursor-pointer"
            title="Thu gọn sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* Active Subject Badge inside Sidebar */}
        <div className="p-4 border-b border-slate-100 bg-indigo-50/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-sm shrink-0">
              <BookOpen size={16} />
            </div>
            <div className="truncate">
              <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block">Môn đang học</span>
              <span className="text-xs font-black text-slate-900 truncate block">{selectedSubject || "Chưa chọn môn"}</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs inside Sidebar */}
        <div className="flex border-b border-slate-100 p-2 gap-1 bg-slate-50/50">
          <button
            onClick={() => setActiveTab("path")}
            className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "path"
                ? "bg-white text-indigo-600 shadow-sm border border-slate-100"
                : "text-slate-500 hover:bg-white/40"
            }`}
          >
            <ListTodo size={14} className={activeTab === "path" ? "text-indigo-600" : "text-slate-400"} />
            Lộ trình học
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "logs"
                ? "bg-white text-indigo-600 shadow-sm border border-slate-100"
                : "text-slate-500 hover:bg-white/40"
            }`}
          >
            <History size={14} className={activeTab === "logs" ? "text-indigo-600" : "text-slate-400"} />
            Lịch sử
          </button>
        </div>

        {/* Content Panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeTab === "logs" ? (
            <>
              <h3 className="text-[10px] font-black text-slate-400 px-2 uppercase tracking-widest">Lịch sử hoạt động của em</h3>
              {activityLogs.length > 0 ? (
                <div className="space-y-2">
                  {activityLogs.slice(0, 20).map((log) => (
                    <div key={log.id} className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl text-[11px] leading-relaxed space-y-1">
                      <div className="flex justify-between font-bold text-slate-700">
                        <span className="text-indigo-600 font-black">{log.nodeName || "Bài học"}</span>
                        <span className="text-[9px] text-slate-400">{new Date(log.createdAt).toLocaleTimeString("vi-VN")}</span>
                      </div>
                      <p className="text-slate-500">{log.detail}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-slate-400 font-semibold border border-dashed border-slate-200 rounded-xl">
                  Chưa có nhật ký học tập nào.
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="text-[10px] font-black text-slate-400 px-2 uppercase tracking-widest">Lộ trình của em</h3>
              {learningPath && learningPath.ordered_steps && learningPath.ordered_steps.length > 0 ? (
                <div className="space-y-2">
                  {learningPath.ordered_steps.map((step: any) => {
                    const stepNode = nodes.find(n => n.id === step.topic_id);
                    const topicName = stepNode ? stepNode.name : step.topic_id;
                    return (
                      <div
                        key={step.topic_id}
                        onClick={() => {
                          if (stepNode) handleNodeClick(stepNode);
                        }}
                        className={`p-3.5 border transition-all cursor-pointer rounded-2xl text-[11px] leading-relaxed space-y-1.5 shadow-sm hover:scale-[1.01] ${
                          step.status === "done"
                            ? "bg-emerald-50/30 border-emerald-100 hover:bg-emerald-50/50"
                            : step.status === "in_progress"
                            ? "bg-indigo-50/40 border-indigo-200 hover:bg-indigo-50/60"
                            : "bg-white border-slate-100 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex justify-between items-center font-bold">
                          <span className={`${step.status === "in_progress" ? "text-indigo-700" : "text-slate-800"} font-black`}>
                            {step.order}. {topicName}
                          </span>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            step.status === "done"
                              ? "bg-emerald-100 text-emerald-800"
                              : step.status === "in_progress"
                              ? "bg-indigo-100 text-indigo-800 animate-pulse"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {step.status === "done" ? "Xong" : step.status === "in_progress" ? "Đang học" : "Chờ học"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal">{step.inclusion_reason}</p>
                        <div className="flex gap-2.5 text-[9px] text-slate-400 font-bold border-t border-slate-50 pt-1.5 font-mono">
                          <span className="flex items-center gap-1"><Clock size={10} /> {step.estimated_minutes}m</span>
                          <span className="flex items-center gap-1"><Target size={10} /> {(step.current_mastery * 100).toFixed(0)}% → {(step.target_mastery * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-slate-400 font-semibold border border-dashed border-slate-200 rounded-xl">
                  Chưa có lộ trình nào được duyệt.
                </div>
              )}
            </>
          )}
        </div>

        {/* Switch Subject Action Button at Bottom of Sidebar */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={() => {
              setSelectedSubject("");
              localStorage.removeItem("aurora_student_subject");
              setActiveMainTab("graph");
            }}
            className="w-full py-2 px-3 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200 shadow-sm active:scale-95"
          >
            <RefreshCw size={14} className="text-indigo-600" /> Đổi môn học
          </button>
        </div>

        {/* Profile Card */}
        <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-md shadow-indigo-200">
              {userName[0]}
            </div>
            <div className="truncate max-w-[120px]">
              <div className="text-sm font-black text-slate-900 truncate">{userName}</div>
              <div className="text-[10px] text-slate-400">Học sinh</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-red-500 hover:text-red-700 font-extrabold transition-all"
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Canvas Workspace */}
      <main className="flex-1 flex flex-col bg-slate-50/50 p-6 overflow-hidden relative">
        {/* Style block for animations */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes confetti-fall {
            0% { transform: translateY(-50px) rotate(0deg); opacity: 1; }
            100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
          }
          .animate-confetti {
            animation: confetti-fall 3.5s linear infinite;
          }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-6px); }
            40%, 80% { transform: translateX(6px); }
          }
          .animate-shake {
            animation: shake 0.4s ease-in-out;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes scaleUp {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
        `}} />

        {/* Confetti Animation Overlay */}
        {showConfetti && (
          <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden flex items-center justify-center">
            {Array.from({ length: 45 }).map((_, i) => {
              const left = Math.random() * 100;
              const delay = Math.random() * 1.5;
              const color = ["#818cf8", "#34d399", "#fb7185", "#fbbf24", "#38bdf8"][i % 5];
              return (
                <span
                  key={i}
                  className="absolute w-2 h-4 rounded-sm animate-confetti"
                  style={{
                    left: `${left}%`,
                    backgroundColor: color,
                    animationDelay: `${delay}s`,
                    transform: `rotate(${Math.random() * 360}deg)`,
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Auto Route Recommendation Modal */}
        {showAutoRouteModal && nextRecommendedNode && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white p-6 rounded-3xl shadow-2xl max-w-md w-full border border-slate-100 flex flex-col items-center text-center space-y-5 animate-[scaleUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
              <div className="h-16 w-16 bg-emerald-50 rounded-full flex items-center justify-center text-2xl shadow-md animate-bounce select-none">
                🎉
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-black text-slate-950 uppercase tracking-tight">Chúc mừng em thông thạo bài học!</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Em đã hoàn thành xuất sắc các câu hỏi của bài học và đạt độ thành thạo cao. Em có muốn tiếp tục lộ trình đến bài học tiếp theo không?
                </p>
              </div>
              
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl w-full text-center font-bold">
                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block mb-0.5 font-mono">Bài học kế tiếp</span>
                <span className="text-xs font-black text-slate-900">{nextRecommendedNode.name}</span>
              </div>

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowAutoRouteModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-3 rounded-xl transition-all cursor-pointer"
                >
                  Luyện tập thêm
                </button>
                <button
                  onClick={() => {
                    setShowAutoRouteModal(false);
                    handleNodeClick(nextRecommendedNode);
                  }}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl shadow-md shadow-indigo-200 transition-all cursor-pointer"
                >
                  Học tiếp ngay
                </button>
              </div>
            </div>
          </div>
        )}

        {/* U1 Socratic Purpose Selection Modal */}
        {showPurposeModal && nodeForPurpose && (
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-50 animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white p-9 rounded-[32px] shadow-2xl max-w-xl w-full border border-slate-100 flex flex-col space-y-6 animate-[scaleUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
              <div className="flex justify-between items-start">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <span className="text-[9px] bg-indigo-50 text-indigo-650 font-black uppercase tracking-widest px-3 py-1 rounded-full font-mono">
                    Không gian học tập
                  </span>
                  <h3 className="text-base md:text-lg font-black text-slate-900 leading-snug uppercase pt-1 tracking-tight truncate max-w-[420px]">
                    {nodeForPurpose.name}
                  </h3>
                </div>
                <button
                  onClick={() => setShowPurposeModal(false)}
                  className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-650 flex items-center justify-center text-xs font-bold transition-all duration-200 active:scale-90 cursor-pointer shrink-0 ml-2"
                >
                  <X size={14} />
                </button>
              </div>

              {studentState?.needsDiagnostic && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 shadow-sm animate-pulse">
                  <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-600" />
                  <div className="text-xs font-semibold leading-relaxed">
                    <span className="font-black uppercase block mb-0.5 tracking-wide text-rose-700">Yêu cầu chẩn đoán bắt buộc</span>
                    Thầy/cô giáo đã gửi yêu cầu đánh giá chẩn đoán năng lực. Em vui lòng thực hiện bài kiểm tra chẩn đoán dưới đây để xác định trình độ thực tế trên cây.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                {/* Mode 1: Theory Socratic Chat */}
                <button
                  onClick={() => handleStartNodeMode(nodeForPurpose, "theory")}
                  disabled={studentState?.needsDiagnostic}
                  className={`flex items-center gap-5 p-6 rounded-3xl border-2 text-left transition-all duration-250 ${
                    studentState?.needsDiagnostic
                      ? "bg-slate-50 border-slate-100 opacity-40 cursor-not-allowed"
                      : "bg-white border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/15 cursor-pointer hover:scale-[1.02] hover:shadow-md hover:ring-4 hover:ring-indigo-50/50"
                  }`}
                >
                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${
                    studentState?.needsDiagnostic ? "bg-slate-100 text-slate-400" : "bg-indigo-50 text-indigo-600"
                  }`}>
                    <BookOpen size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm md:text-base font-black text-slate-900 flex items-center gap-1.5">
                      Học lý thuyết & Thảo luận
                    </h4>
                    <p className="text-xs text-slate-500 font-semibold mt-1 leading-relaxed">
                      Tìm hiểu lý thuyết và trao đổi trực tiếp với Trợ lý Socratic RAG để tự thấu suốt bản chất kiến thức.
                    </p>
                  </div>
                </button>

                {/* Mode 2: Practice Free Mode */}
                <button
                  onClick={() => handleStartNodeMode(nodeForPurpose, "practice")}
                  disabled={studentState?.needsDiagnostic}
                  className={`flex items-center gap-5 p-6 rounded-3xl border-2 text-left transition-all duration-250 ${
                    studentState?.needsDiagnostic
                      ? "bg-slate-50 border-slate-100 opacity-40 cursor-not-allowed"
                      : "bg-white border-slate-200 hover:border-orange-500 hover:bg-orange-50/15 cursor-pointer hover:scale-[1.02] hover:shadow-md hover:ring-4 hover:ring-orange-50/50"
                  }`}
                >
                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${
                    studentState?.needsDiagnostic ? "bg-slate-100 text-slate-400" : "bg-orange-50 text-orange-600"
                  }`}>
                    <PlayCircle size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm md:text-base font-black text-slate-900 flex items-center gap-1.5">
                      Luyện tập tự do
                    </h4>
                    <p className="text-xs text-slate-500 font-semibold mt-1 leading-relaxed">
                      Thực hành làm các bài toán trắc nghiệm chia theo từng cấp độ nhận thức tại bài học này.
                    </p>
                  </div>
                </button>

                {/* Mode 3: Diagnostic Assessment */}
                <button
                  onClick={() => handleStartNodeMode(nodeForPurpose, "diagnostic")}
                  className={`flex items-center gap-5 p-6 rounded-3xl border-2 text-left transition-all duration-250 ${
                    studentState?.needsDiagnostic
                      ? "bg-rose-50/30 border-rose-350 hover:border-rose-500 hover:bg-rose-50/15 hover:scale-[1.02] hover:shadow-md hover:ring-4 hover:ring-rose-50/50"
                      : "bg-white border-slate-200 hover:border-blue-500 hover:bg-blue-50/15 hover:scale-[1.02] hover:shadow-md hover:ring-4 hover:ring-blue-50/50"
                  } cursor-pointer`}
                >
                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${
                    studentState?.needsDiagnostic ? "bg-rose-100/60 text-rose-600" : "bg-blue-50 text-blue-600"
                  }`}>
                    <Compass size={24} className={studentState?.needsDiagnostic ? "animate-pulse" : ""} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm md:text-base font-black text-slate-900 flex items-center gap-1.5">
                      Đánh giá năng lực chẩn đoán {studentState?.needsDiagnostic && "(Bắt buộc)"}
                    </h4>
                    <p className="text-xs text-slate-500 font-semibold mt-1 leading-relaxed">
                      Kiểm tra thực lực thích ứng. Hệ thống tự động hạ mức khi gặp khó khăn để dò tìm chính xác lỗ hổng nền tảng.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedSubject && studentState && studentState.needsDiagnostic ? (
          /* General Exam Landing & Player Overlay */
          (() => {
            if (examFinishedScore) {
              return (
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white border border-slate-200 rounded-3xl shadow-sm text-center space-y-6 max-w-2xl mx-auto my-12 animate-[fadeIn_0.3s_ease-out]">
                  <div className="h-20 w-20 bg-emerald-50 rounded-full flex items-center justify-center text-3xl shadow-md border border-emerald-100 animate-bounce">
                    🎉
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Hoàn thành Đánh giá Tổng quan!</h2>
                    <p className="text-sm text-slate-550 font-semibold max-w-md mx-auto leading-relaxed">
                      Cảm ơn em đã hoàn thành bài thi. Dựa trên kết quả này, hệ thống đã thiết lập ma trận năng lực và lộ trình học tập cá nhân hóa cho em.
                    </p>
                  </div>

                  <div className="p-6 bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-3xl w-full max-w-sm mx-auto shadow-inner flex flex-col items-center justify-center gap-1.5">
                    <span className="text-[10px] font-black text-indigo-650 uppercase tracking-widest block font-mono">Điểm số đạt được</span>
                    <div className="text-4xl font-black text-slate-900 tabular-nums">
                      {examFinishedScore.totalScore} <span className="text-base text-slate-400 font-bold">/ {examFinishedScore.maxScore}</span>
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      setExamFinishedScore(null);
                      setActiveExam(null);
                      setExamQuestions([]);
                      setExamAnswers({});
                      await loadStudentState();
                      await loadTreeData();
                    }}
                    className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-755 text-white font-black text-sm rounded-2xl shadow-md shadow-indigo-150 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                  >
                    Bắt đầu học ngay ➔
                  </button>
                </div>
              );
            }

            if (activeExam) {
              const currentQuestion = examQuestions[examQIndex];
              let options: string[] = [];
              if (currentQuestion && currentQuestion.choicesJson) {
                try {
                  const parsedChoices = JSON.parse(currentQuestion.choicesJson);
                  options = parsedChoices.map((c: any) => c.content);
                } catch (e) {
                  console.error(e);
                }
              }

              const minutes = Math.floor(examTimeRemaining / 60);
              const seconds = examTimeRemaining % 60;
              const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

              return (
                <div className="flex-1 flex gap-6 overflow-hidden max-w-6xl w-full my-6 animate-[fadeIn_0.3s_ease-out]">
                  {/* Left panel */}
                  <div className="w-64 bg-white border border-slate-200 rounded-3xl p-5 flex flex-col shadow-sm shrink-0">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-3 mb-4 font-mono">Danh sách câu hỏi</h3>
                    <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-2.5 max-h-[350px] pr-1">
                      {examQuestions.map((q, idx) => {
                        const isSelected = examQIndex === idx;
                        const isAnswered = !!examAnswers[q.id];
                        return (
                          <button
                            key={q.id}
                            onClick={() => setExamQIndex(idx)}
                            className={`h-9 w-9 rounded-xl flex items-center justify-center font-bold text-xs transition-all cursor-pointer ${
                              isSelected
                                ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                                : isAnswered
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-250"
                                : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                    <div className="border-t border-slate-100 pt-4 mt-4 space-y-2">
                      <div className="flex justify-between text-[10px] font-bold text-slate-550 uppercase tracking-wide">
                        <span>Đã làm:</span>
                        <span>{Object.keys(examAnswers).length} / {examQuestions.length}</span>
                      </div>
                      <button
                        onClick={() => handleSubmitExam(false)}
                        disabled={submittingExam}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 cursor-pointer uppercase tracking-wider"
                      >
                        {submittingExam ? "Đang gửi..." : "Nộp bài thi"}
                      </button>
                    </div>
                  </div>

                  {/* Right panel */}
                  <div className="flex-1 bg-white border border-slate-200 rounded-3xl p-6 flex flex-col shadow-sm overflow-hidden">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-5 shrink-0">
                      <div>
                        <span className="text-[9px] bg-indigo-50 text-indigo-700 font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full font-mono">
                          Đang làm bài: {activeExam.title}
                        </span>
                        <h2 className="text-base font-black text-slate-900 leading-tight mt-1">
                          Câu hỏi {examQIndex + 1}
                        </h2>
                      </div>
                      {examTimerActive && (
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black font-mono shadow-sm shrink-0 ${
                          examTimeRemaining < 60 ? "bg-rose-50 border-rose-200 text-rose-700 animate-pulse" : "bg-indigo-50 border-indigo-150 text-indigo-700"
                        }`}>
                          <Clock size={14} className={examTimeRemaining < 60 ? "text-rose-600 animate-spin" : "text-indigo-600"} />
                          {formattedTime}
                        </div>
                      )}
                    </div>

                    {currentQuestion ? (
                      <div className="flex-1 flex flex-col overflow-y-auto space-y-5 pr-1">
                        <SafeHtml
                          text={currentQuestion.content}
                          className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-sm text-slate-800 leading-relaxed font-semibold shadow-inner"
                        />

                        <div className="grid grid-cols-1 gap-2.5">
                          {options.map((opt, idx) => {
                            const letters = ["A", "B", "C", "D"];
                            const choices = JSON.parse(currentQuestion.choicesJson);
                            const choiceId = choices[idx]?.choiceId;
                            const isSelected = examAnswers[currentQuestion.id] === choiceId;

                            return (
                              <button
                                key={idx}
                                onClick={() => {
                                  setExamAnswers(prev => ({
                                    ...prev,
                                    [currentQuestion.id]: choiceId
                                  }));
                                }}
                                className={`w-full text-left p-3.5 rounded-2xl border text-xs leading-relaxed transition-all duration-200 hover:scale-[1.005] flex items-center gap-3.5 cursor-pointer font-bold ${
                                  isSelected
                                    ? "bg-indigo-50/50 border-indigo-600 text-indigo-950 font-extrabold ring-4 ring-indigo-100 shadow-sm"
                                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50/50"
                                }`}
                              >
                                <span className={`h-7 w-7 rounded-xl flex items-center justify-center font-black text-xs transition-all shadow-sm ${
                                  isSelected
                                    ? "bg-indigo-600 text-white"
                                    : "bg-slate-100 text-slate-400"
                                }`}>
                                  {letters[idx] || (idx + 1)}
                                </span>
                                <SafeHtml as="span" text={opt} className="flex-1 font-extrabold" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
                        Không thể tải câu hỏi này
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-4 border-t border-slate-100 mt-5 shrink-0">
                      <button
                        onClick={() => setExamQIndex(prev => Math.max(prev - 1, 0))}
                        disabled={examQIndex === 0}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-650 disabled:opacity-40 text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        Câu trước
                      </button>
                      <span className="text-[10px] text-slate-400 font-bold font-mono">
                        Câu {examQIndex + 1} / {examQuestions.length}
                      </span>
                      <button
                        onClick={() => setExamQIndex(prev => Math.min(prev + 1, examQuestions.length - 1))}
                        disabled={examQIndex === examQuestions.length - 1}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-650 disabled:opacity-40 text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        Câu tiếp
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div className="flex-1 flex flex-col justify-center items-center max-w-6xl mx-auto w-full py-12 px-4 overflow-y-auto animate-[fadeIn_0.2s_ease-out]">
                <div className="text-center mb-8 max-w-xl space-y-4">
                  <div className="inline-flex p-4 bg-rose-50 text-rose-600 rounded-full border border-rose-100 shadow-sm animate-pulse">
                    <Lock size={36} />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Yêu cầu Đánh giá Tổng quan</h2>
                    <p className="text-sm text-slate-500 font-semibold leading-relaxed">
                      Môn học <strong className="text-indigo-650">{selectedSubject}</strong> yêu cầu em phải thực hiện một bài đánh giá tổng quan ban đầu. Kết quả này sẽ giúp giáo viên và hệ thống AI xác định đúng level và vẽ ma trận các nội dung yếu của em.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <span className="text-[9px] bg-slate-100 text-slate-500 font-black uppercase tracking-wider px-2 py-0.5 rounded-full font-mono">Cách 1</span>
                      <h3 className="text-base font-black text-slate-900 uppercase">Nhập mã đề thi</h3>
                      <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                        Nhập mã đề thi (Exam ID) do thầy/cô cung cấp trực tiếp cho em để mở đề thi.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Nhập mã đề thi (Ví dụ: UUID)..."
                        value={customExamCode}
                        onChange={(e) => setCustomExamCode(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                      />
                      <button
                        onClick={() => handleStartExam(customExamCode)}
                        disabled={loadingExam}
                        className="w-full py-3.5 bg-slate-900 hover:opacity-90 disabled:opacity-50 text-white text-xs font-black rounded-2xl shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5 font-bold"
                      >
                        {loadingExam ? "Đang tải..." : "Bắt đầu thi"}
                      </button>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <span className="text-[9px] bg-indigo-50 text-indigo-700 font-black uppercase tracking-wider px-2 py-0.5 rounded-full font-mono">Cách 2</span>
                      <h3 className="text-base font-black text-slate-900 uppercase">Chọn đề chỉ định</h3>
                      <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                        Các đề thi tổng quan do thầy/cô xuất bản sẵn cho lớp môn học {selectedSubject}.
                      </p>
                    </div>
                    
                    <div className="flex-1 min-h-[140px] max-h-[180px] overflow-y-auto space-y-2.5 pr-1">
                      {examsList.length === 0 ? (
                        <div className="text-center py-8 text-xs text-slate-400 font-semibold italic border border-dashed border-slate-200 rounded-2xl">
                          Chưa có đề thi được giao cho môn học này.
                        </div>
                      ) : (
                        examsList.map((ex) => (
                          <div key={ex.id} className="p-3.5 border border-slate-100 bg-slate-50/50 hover:bg-slate-50 rounded-2xl flex items-center justify-between transition-all">
                            <div className="min-w-0 flex-1 pr-2">
                              <span className="text-xs font-black text-slate-900 block truncate">{ex.title}</span>
                              <span className="text-[9px] text-slate-400 font-mono block mt-0.5">Thời gian: {ex.durationMinutes} phút</span>
                            </div>
                            <button
                              onClick={() => handleStartExam(ex.id)}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer shrink-0"
                            >
                              Vào thi
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedSubject("");
                    localStorage.removeItem("aurora_student_subject");
                  }}
                  className="mt-8 text-xs font-bold text-slate-500 hover:text-indigo-650 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft size={14} /> Quay lại màn hình chọn môn học
                </button>
              </div>
            );
          })()
        ) : (
          /* normal student view */
          !selectedSubject ? (
            /* Landing Page: Course Selection View */
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-y-auto animate-[fadeIn_0.2s_ease-out]">
            <div className="max-w-2xl w-full text-center space-y-6">
              <div className="inline-flex p-4 bg-indigo-50 text-indigo-600 rounded-full shadow-inner">
                <Compass size={40} className="animate-pulse" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Chào mừng em đến với Aurora Tutor</h2>
                <p className="text-sm text-slate-500 font-semibold max-w-lg mx-auto leading-relaxed">
                  Hãy chọn một môn học dưới đây để làm bài đánh giá tổng quan và kích hoạt lộ trình ôn tập thích ứng.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 max-w-lg mx-auto">
                {subjects.map((subj) => (
                  <button
                    key={subj}
                    onClick={() => {
                      setSelectedSubject(subj);
                      localStorage.setItem("aurora_student_subject", subj);
                      setActiveMainTab("graph");
                    }}
                    className="p-5 bg-gradient-to-br from-slate-50 to-indigo-50/30 hover:from-indigo-50 hover:to-indigo-100/50 border border-slate-200 hover:border-indigo-300 rounded-2xl text-left transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between gap-4 group active:scale-95 w-full"
                  >
                    <div className="flex justify-between items-start">
                      <div className="p-2.5 bg-white border border-slate-100 text-indigo-600 rounded-xl shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <BookOpen size={22} />
                      </div>
                      <span className="text-[10px] font-black uppercase px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full">
                        Cây Tri Thức
                      </span>
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-base group-hover:text-indigo-600 transition-colors">{subj}</h3>
                      <p className="text-xs text-slate-400 font-semibold mt-0.5">Bấm để làm bài đánh giá tổng quan và mở khóa sơ đồ cây ➔</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {sidebarCollapsed && (
                  <button
                    onClick={() => setSidebarCollapsed(false)}
                    className="p-2 border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 rounded-xl flex items-center justify-center cursor-pointer shadow-sm active:scale-95 transition-all mr-1 hover:border-indigo-200 hover:bg-indigo-50/20"
                    title="Mở rộng sidebar"
                  >
                    <ChevronRight size={16} />
                  </button>
                )}
                <div>
                  <h1 className="text-xl font-black text-slate-950 flex items-center gap-2">
                    Cây kiến thức: <span className="text-indigo-600 font-black">{selectedSubject}</span>
                  </h1>
                  <p className="text-xs text-slate-400 mt-0.5">Chọn một bài học trên cây để mở Không gian Học tập Socratic của riêng em.</p>
                </div>
                
                <div className="flex items-center gap-2 bg-slate-100 border border-slate-200/80 p-1 rounded-2xl ml-4 shadow-sm">
                  <button
                    onClick={() => setActiveMainTab("graph")}
                    className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 duration-200 ${
                      activeMainTab === "graph"
                        ? "bg-white text-indigo-600 shadow-sm border border-slate-100"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/30"
                    }`}
                  >
                    <Map size={14} className={activeMainTab === "graph" ? "text-indigo-600" : "text-slate-500"} />
                    Sơ đồ Cây
                  </button>
                  <button
                    onClick={() => {
                      const targetNode = selectedNode || nodes.find(n => n.id === focusedNodeId) || nodes.find(n => n.isRoot) || nodes[0];
                      if (targetNode) {
                        handleShowContent(targetNode);
                      } else {
                        toast.warning("Môn học này chưa có bài học nào trên Sơ đồ Cây!");
                      }
                    }}
                    className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 duration-200 ${
                      activeMainTab === "workspace"
                        ? "bg-white text-indigo-600 shadow-sm border border-slate-100"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/30"
                    }`}
                  >
                    <Sparkles size={14} className={activeMainTab === "workspace" ? "text-indigo-600" : "text-slate-500"} />
                    Không gian Học tập
                  </button>
                </div>
                <QuickRoleSwitcher />
              </div>

              {/* Legend */}
              {activeMainTab === "graph" && (
                <div className="flex gap-3 bg-white px-4 py-2 border border-slate-200 rounded-2xl text-[10px] font-bold text-slate-500 shadow-sm animate-[fadeIn_0.2s_ease-out]">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Bắt đầu</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" /> Đang học</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Đã thông</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Lỗ hổng</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Khóa <Lock size={12} /></span>
                </div>
              )}
            </div>

            {/* Navigation Breadcrumbs History */}
            {navHistory.length > 0 && activeMainTab === "graph" && (
              <div className="mb-4 bg-white/80 border border-slate-200/50 px-4 py-2.5 rounded-2xl flex items-center gap-2 overflow-x-auto text-[11px] font-bold text-slate-650 shadow-sm animate-[fadeIn_0.2s_ease-out]">
                <span className="text-[9px] uppercase tracking-wider text-slate-400 font-black font-mono shrink-0">Hành trình đã đi:</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  {navHistory.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handlePivotCenter(item.id)}
                        className={`hover:text-indigo-600 hover:underline cursor-pointer transition-all ${
                          item.id === focusedNodeId ? "text-indigo-650 font-extrabold" : "text-slate-500"
                        }`}
                      >
                        {item.name}
                      </button>
                      {idx < navHistory.length - 1 && <span className="text-slate-300">/</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dynamic Main Workspace Tabs Render */}
            {activeMainTab === "graph" ? (
              <div className="flex-1 relative rounded-3xl overflow-hidden shadow-sm border border-slate-200">
                {nodes.length > 0 ? (
                  <KnowledgeTree
                    subject={selectedSubject}
                    nodes={nodes}
                    edges={edges}
                    masteryByTopic={masteryByTopic}
                    mode="student"
                    studentNodeStatus={nodeStatus}
                    initialNodeId={studentState?.initialLevelNodeId}
                    currentNodeId={studentState?.currentLevelNodeId}
                    focusedNodeId={focusedNodeId}
                    onFocusedNodeChange={handlePivotCenter}
                    onShowContentClick={handleNodeClick}
                    onNodeClick={handleNodeClick}
                    onRefresh={() => {
                      loadTreeData();
                      loadStudentState();
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 max-w-md mx-auto bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4">
                    <div className="p-4 bg-amber-50 text-amber-600 rounded-full">
                      <Compass size={32} className="animate-bounce" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-black text-slate-900 uppercase tracking-wide">Môn {selectedSubject} chưa có bài học</h3>
                      <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                        Sơ đồ cây tri thức môn học này chưa có nội dung. Em hãy bấm <strong>"Đổi môn học"</strong> ở góc dưới menu để chọn môn khác hoặc tham gia lớp mới bằng mã code nhé!
                      </p>
                    </div>
                    <div className="flex gap-2 justify-center pt-2">
                      <button
                        onClick={() => {
                          setSelectedSubject("");
                          localStorage.removeItem("aurora_student_subject");
                        }}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                      >
                        <RefreshCw size={14} /> Đổi môn học
                      </button>
                      <button
                        onClick={() => setShowJoinModal(true)}
                        className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Key size={14} /> Nhập mã lớp
                      </button>
                    </div>
                  </div>
                )}
              </div>
        ) : (
          /* Promax Socratic Learning Hub Split View */
          selectedNode ? (
            <div className="flex-1 flex gap-6 overflow-hidden animate-[fadeIn_0.3s_ease-out]">
              
              {/* Left Column: Socratic RAG Theory Chat */}
              <div style={{ width: `${leftWidth}%` }} className="bg-white border border-slate-200/80 rounded-[28px] p-5 flex flex-col shadow-sm shrink-0">
                <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <span className="text-[9px] bg-[var(--mint)]/15 text-[var(--mint)] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono flex items-center gap-1.5 w-fit">
                      {selectedNode.isRoot ? <Compass size={10} /> : <BookOpen size={10} />}
                      {selectedNode.isRoot ? "Nút Gốc môn học" : "Chủ đề học tập"}
                    </span>
                    <h2 className="text-base font-black text-slate-900 leading-tight truncate max-w-[280px]">
                      {selectedNode.name}
                    </h2>
                    {navHistory.length > 1 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1.5 overflow-x-auto whitespace-nowrap scrollbar-thin select-none max-w-full">
                        {navHistory.map((item, idx) => (
                          <div key={item.id} className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleShowContent(item)}
                              className={`hover:text-indigo-650 hover:underline cursor-pointer transition-all ${
                                item.id === selectedNode.id ? "text-indigo-600 font-extrabold" : "text-slate-450"
                              }`}
                            >
                              {item.name}
                            </button>
                            {idx < navHistory.length - 1 && <span className="text-slate-300">/</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setActiveMainTab("graph")}
                    className="text-[10px] font-black text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-xl hover:bg-indigo-50/50 active:scale-95 transition-all shadow-sm cursor-pointer flex items-center gap-1 shrink-0 ml-2"
                  >
                    <ArrowLeft size={10} /> Bản đồ cây
                  </button>
                </div>

                {/* Extracted Theory Block */}
                <div className="space-y-2 mb-4 bg-slate-50/60 border border-slate-200/40 p-4 rounded-2xl shadow-inner border-l-4 border-l-[var(--mint)]">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Tóm tắt nội dung chính</h3>
                  <div className="text-sm text-slate-800 leading-relaxed font-bold max-h-[180px] overflow-y-auto pr-2">
                    {selectedNode.theory || "Nội dung lý thuyết đang được cập nhật..."}
                  </div>
                </div>

                {/* Socratic RAG Chatbot */}
                <div data-tour="socratic-chat" className="flex-1 border-t border-slate-100 pt-4 flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare size={13} className="text-indigo-600" />
                    <h4 className="text-xs font-black text-slate-800">Trợ lý Socratic giải thích (RAG Chat)</h4>
                  </div>

                  <div className="flex-1 overflow-y-auto border border-slate-100 rounded-2xl p-4 bg-slate-50/30 space-y-3 mb-4 text-sm font-medium">
                    {theoryChat.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.sender === "student" ? "justify-end" : "justify-start"}`}>
                        <SafeHtml
                          text={msg.content}
                          variant="tutor"
                          className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border transition-all text-xs md:text-sm leading-relaxed ${
                            msg.sender === "student"
                              ? "bg-slate-900 border-slate-950 text-white rounded-br-none"
                              : "bg-white border-slate-200 text-slate-800 rounded-bl-none font-bold"
                          }`}
                        />
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-4 py-2 text-slate-400 flex items-center gap-1.5 animate-pulse">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" />
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]" />
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={handleSendChat} className="relative flex items-center border border-slate-250/70 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-50 bg-slate-50 focus-within:bg-white rounded-2xl transition-all duration-200 p-1.5 shadow-sm">
                    <input
                      type="text"
                      placeholder="Hỏi thầy Socratic về bài học này..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 bg-transparent text-sm px-2.5 py-2 text-zinc-950 focus:outline-none font-semibold"
                    />
                    <button
                      type="submit"
                      disabled={chatLoading}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 h-8 w-8 rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center cursor-pointer font-bold"
                    >
                      <Send size={12} />
                    </button>
                  </form>
                </div>
              </div>

              {/* Horizontal Resizer Slider Handle */}
              <div
                onMouseDown={handleMouseDown}
                className="w-1.5 hover:w-2 bg-slate-200/50 hover:bg-indigo-400/80 cursor-col-resize self-stretch transition-all duration-150 rounded-full flex items-center justify-center relative group select-none shrink-0 mx-0.5"
                title="Kéo giãn chiều rộng không gian"
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1.5 pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">
                  <span className="h-1 w-1 bg-slate-500 rounded-full" />
                  <span className="h-1 w-1 bg-slate-500 rounded-full" />
                  <span className="h-1 w-1 bg-slate-500 rounded-full" />
                </div>
              </div>

              {/* Right Column: BKT Gauge, Questions & Socratic Inline Helper */}
              <div data-tour="feynman-notebook" className="flex-1 bg-white border border-slate-200/80 rounded-[28px] p-5 flex flex-col shadow-sm overflow-y-auto">
                
                {/* 1. Conditional Progress Header: Gauge for Practice, Test Card for Diagnostic */}
                {quizMode === "diagnostic" ? (
                  <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-violet-900 rounded-[24px] p-6 text-white shadow-lg border border-indigo-600/30 flex items-center justify-between mb-6 animate-[fadeIn_0.2s_ease-out] relative overflow-hidden">
                    {/* Glowing background circles for visual depth */}
                    <div className="absolute -right-10 -top-10 w-36 h-36 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute -left-10 -bottom-10 w-36 h-36 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
                    
                    <div className="space-y-2 flex-1 pr-4 relative z-10">
                      <span className="inline-flex items-center gap-1.5 text-[9px] bg-white/15 text-indigo-100 font-black uppercase tracking-widest px-3 py-1 rounded-full font-mono border border-white/10">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                        Chế độ Chẩn đoán Năng lực
                      </span>
                      <h3 className="text-base font-black uppercase tracking-tight leading-tight">
                        Bài đánh giá năng lực thích ứng
                      </h3>
                      <p className="text-[11px] text-indigo-100/90 font-medium leading-relaxed max-w-md">
                        Làm bài hết sức mình. Hệ thống sẽ tự động đo đạc, phân tích lỗ hổng kiến thức và xếp lớp chính xác nhất cho em.
                      </p>
                    </div>
                    
                    <div className="h-16 w-16 bg-white/10 backdrop-blur-md rounded-full border border-white/20 flex flex-col items-center justify-center shadow-inner shrink-0 relative z-10 hover:scale-105 transition-transform duration-200">
                      <span className="text-xl font-black leading-none text-white font-mono">{currentQIndex + 1}</span>
                      <span className="text-[8px] text-indigo-200 font-black uppercase tracking-widest mt-0.5 font-mono">Câu hỏi</span>
                    </div>
                  </div>
                ) : (
                  (() => {
                    const bkt = getBktScoreForNode(selectedNode.id);
                    const masteryPercent = Math.round(bkt.mastery * 100);
                    const confidencePercent = Math.round(bkt.confidence * 100);
                    return (
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        {/* Card 1: Mastery */}
                        <div className="bg-white border border-slate-200/60 rounded-3xl p-4 flex flex-col items-center justify-center relative group shadow-sm hover:shadow-md transition-all duration-300">
                          {/* Tooltip - below card */}
                          <div className="absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-52 p-3 bg-slate-900/95 text-white text-[10px] leading-relaxed rounded-2xl shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 transform -translate-y-1 group-hover:translate-y-0">
                            <div className="font-extrabold mb-1 text-[var(--mint)] flex items-center gap-1">
                              <Compass size={11} /> Độ thông thạo
                            </div>
                            Được tính từ tỷ lệ trả lời đúng và mức độ hiểu sâu kiến thức. Khi đạt trên 85%, em đã thông suốt chủ đề này!
                          </div>

                          <div className="relative w-24 h-14 flex justify-center mb-1">
                            <svg className="w-24 h-14" viewBox="0 0 80 40">
                              <path
                                d="M 10 40 A 30 30 0 0 1 70 40"
                                fill="transparent"
                                className="stroke-slate-100"
                                strokeWidth="5.5"
                                strokeLinecap="round"
                              />
                              <path
                                d="M 10 40 A 30 30 0 0 1 70 40"
                                fill="transparent"
                                className="stroke-[var(--mint)] transition-all duration-500 ease-out"
                                strokeWidth="5.5"
                                strokeLinecap="round"
                                strokeDasharray="94.2"
                                strokeDashoffset={94.2 - (94.2 * bkt.mastery)}
                              />
                            </svg>
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
                              <span className="text-sm font-black text-slate-800">{masteryPercent}%</span>
                            </div>
                          </div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 font-mono flex items-center gap-1">
                            Độ thông thạo <HelpCircle size={10} className="text-slate-355" />
                          </span>
                        </div>

                        {/* Card 2: Confidence */}
                        <div className="bg-white border border-slate-200/60 rounded-3xl p-4 flex flex-col items-center justify-center relative group shadow-sm hover:shadow-md transition-all duration-300">
                          {/* Tooltip - below card */}
                          <div className="absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-52 p-3 bg-slate-900/95 text-white text-[10px] leading-relaxed rounded-2xl shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 transform -translate-y-1 group-hover:translate-y-0">
                            <div className="font-extrabold mb-1 text-[var(--purple)] flex items-center gap-1">
                              <Award size={11} /> Độ tự tin (BKT)
                            </div>
                            Chỉ số ước lượng bằng thuật toán Bayesian Knowledge Tracing. Đánh giá xác suất em thực sự nắm vững kiến thức, loại bỏ yếu tố may rủi.
                          </div>

                          <div className="relative w-24 h-14 flex justify-center mb-1">
                            <svg className="w-24 h-14" viewBox="0 0 80 40">
                              <path
                                d="M 10 40 A 30 30 0 0 1 70 40"
                                fill="transparent"
                                className="stroke-slate-100"
                                strokeWidth="5.5"
                                strokeLinecap="round"
                              />
                              <path
                                d="M 10 40 A 30 30 0 0 1 70 40"
                                fill="transparent"
                                className="stroke-[var(--purple)] transition-all duration-500 ease-out"
                                strokeWidth="5.5"
                                strokeLinecap="round"
                                strokeDasharray="94.2"
                                strokeDashoffset={94.2 - (94.2 * bkt.confidence)}
                              />
                            </svg>
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
                              <span className="text-sm font-black text-slate-800">{confidencePercent}%</span>
                            </div>
                          </div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 font-mono flex items-center gap-1">
                            Độ tự tin <HelpCircle size={10} className="text-slate-355" />
                          </span>
                        </div>
                      </div>
                    );
                  })()
                )}

                {quizMode !== "diagnostic" && selectedNode && (
                  <StudentMasteryDashboard
                    subject={selectedSubject}
                    selectedTopic={selectedNode}
                    masteryByTopic={masteryByTopic}
                    onProfileChange={setMasteryByTopic}
                  />
                )}

                {/* 2. Practice Questions & Actions */}
                {filteredQuestions.length > 0 ? (
                  (() => {
                    const currentQ = filteredQuestions[currentQIndex];
                    if (!currentQ) return null;
                    
                    let options: string[] = [];
                    try {
                      options = JSON.parse(currentQ.optionsJson);
                    } catch (e) {}

                    const qChat = questionChat[currentQ.id] || [];

                    return (
                      <div className={`space-y-6 transition-all ${shake ? "animate-shake" : ""}`}>
                        {/* Difficulty labels - Vietnamese taxonomy */}
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${
                            currentQ.difficulty === "easy"
                              ? "bg-sky-50 border-sky-200 text-sky-700"
                              : currentQ.difficulty === "medium"
                              ? "bg-amber-50 border-amber-200 text-amber-700"
                              : currentQ.difficulty === "hard"
                              ? "bg-orange-50 border-orange-200 text-orange-700"
                              : "bg-rose-50 border-rose-200 text-rose-700"
                          }`}>
                            {{ easy: "Nhận biết", medium: "Thông hiểu", hard: "Vận dụng", very_hard: "Vận dụng cao" }[currentQ.difficulty] || currentQ.difficulty}
                          </span>
                          
                          {difficultyFilter && (
                            <button
                              onClick={() => {
                                setDifficultyFilter(null);
                                setCantDoOptions(null);
                                setCurrentQIndex(0);
                                setSelectedOption(null);
                              }}
                              className="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-wide cursor-pointer font-mono"
                            >
                              Đặt lại độ khó gốc
                            </button>
                          )}
                        </div>

                        {/* Question Box */}
                        <SafeHtml
                          text={currentQ.content}
                          className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 text-sm text-slate-800 leading-relaxed shadow-inner font-extrabold"
                        />

                        {/* Options Buttons */}
                        <div className="grid grid-cols-1 gap-2.5">
                          {options.map((opt, idx) => {
                            const isSelected = selectedOption === idx;
                            const letters = ["A", "B", "C", "D"];
                            return (
                              <button
                                key={idx}
                                onClick={() => setSelectedOption(idx)}
                                className={`w-full text-left p-3.5 rounded-2xl border text-xs leading-relaxed transition-all duration-250 hover:scale-[1.005] flex items-center gap-3.5 cursor-pointer font-bold ${
                                  isSelected
                                    ? "bg-indigo-50/50 border-indigo-600 text-indigo-950 font-extrabold ring-4 ring-indigo-100 shadow-sm"
                                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50/50 hover:border-slate-350"
                                }`}
                              >
                                <span className={`h-7 w-7 rounded-xl flex items-center justify-center font-black text-xs transition-all shadow-sm ${
                                  isSelected
                                    ? "bg-indigo-600 text-white"
                                    : "bg-slate-100 text-slate-400"
                                }`}>
                                  {letters[idx] || (idx + 1)}
                                </span>
                                <SafeHtml as="span" text={opt} className="flex-1 font-extrabold" />
                              </button>
                            );
                          })}
                        </div>

                        {/* Feedback Banner */}
                        {answerFeedback && (
                          <div className={`p-4 rounded-2xl text-center text-xs font-bold border shadow-sm animate-[fadeIn_0.2s_ease-out] ${
                            answerFeedback.isCorrect
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                              : "bg-rose-50 border-rose-200 text-rose-800"
                          }`}>
                            {answerFeedback.message}
                          </div>
                        )}

                        {/* Hint Display */}
                        {activeHint && (
                          <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-2 animate-[fadeIn_0.3s_ease-out]">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                                ✨ Gợi ý Bậc {hintPressCount}: {hintPressCount === 1 ? "Socratic Nudge" : hintPressCount === 2 ? "First-principles" : "Bottom-out (Ví dụ)"}
                              </span>
                              <span className="text-[9px] text-slate-400 font-semibold font-mono">(Trọng số BKT đã giảm)</span>
                            </div>
                            <SafeHtml 
                              as="p"
                              text={activeHint}
                              variant="tutor"
                              className="text-xs text-slate-750 leading-relaxed font-extrabold"
                            />
                          </div>
                        )}

                        {/* Control buttons */}
                        <div className="flex gap-2.5 pt-3 border-t border-slate-100">
                          <button
                            onClick={handleSubmitAnswer}
                            disabled={selectedOption === null || submitting}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-100 disabled:text-slate-400 font-extrabold text-xs py-4 rounded-2xl shadow-md active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 border border-indigo-700 disabled:border-slate-200"
                          >
                            <Check size={14} className={selectedOption === null ? "text-slate-400" : "text-white"} />
                            {submitting ? "Đang gửi..." : "Gửi đáp án"}
                          </button>

                          {quizMode === "practice" && (
                            <button
                              onClick={handleRequestHint}
                              disabled={hintLoading || submitting}
                              className="bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 disabled:opacity-50 font-black text-xs px-5 py-4 rounded-2xl transition-all hover:shadow-sm cursor-pointer flex items-center gap-1.5 duration-200"
                            >
                              <Sparkles size={13} className="text-indigo-650" />
                              {hintPressCount === 0 ? "Xem gợi ý" : hintPressCount === 1 ? "Gợi ý 2" : hintPressCount === 2 ? "Gợi ý 3" : "Hết gợi ý"}
                            </button>
                          )}

                          <button
                            onClick={handleCantDo}
                            disabled={submitting}
                            className="bg-white border border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-600 disabled:opacity-50 font-extrabold text-xs px-6 py-4 rounded-2xl transition-all hover:shadow-sm cursor-pointer duration-200 active:scale-95 shadow-sm"
                          >
                            Bỏ qua
                          </button>
                        </div>

                        {/* Adaptive "Cant Do" Choices */}
                        {cantDoOptions && (
                          <div className="pt-5 border-t border-dashed border-slate-200 space-y-4 bg-rose-50/20 p-4 rounded-2xl animate-[fadeIn_0.3s_ease-out]">
                            <h4 className="text-[10px] font-black text-rose-600 uppercase tracking-widest text-center font-mono">Giao điểm thích ứng (Adaptive Route)</h4>
                            <p className="text-[11px] text-slate-500 leading-relaxed text-center font-semibold">
                              Không sao đâu! Việc thừa nhận chưa làm được là bước đầu tiên để ôn tập gốc rễ. Em muốn chọn hướng nào?
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              {cantDoOptions.hasEasyQ && (
                                <button
                                  onClick={handleChooseEasier}
                                  className="w-full bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 p-3.5 rounded-xl text-xs font-black shadow-sm transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer animate-[fadeIn_0.2s_ease-out]"
                                >
                                  👉 Chuyển sang câu hỏi cấp Nhận biết (dễ hơn)
                                </button>
                              )}
                              
                              {cantDoOptions.parents.length > 0 ? (
                                cantDoOptions.parents.map((parent) => (
                                  <button
                                    key={parent.id}
                                    onClick={() => handleChooseFoundational(parent.id, parent.name)}
                                    className="w-full bg-white border border-slate-200 hover:border-orange-400 hover:text-orange-600 p-3.5 rounded-xl text-xs font-black shadow-sm transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer animate-[fadeIn_0.2s_ease-out]"
                                  >
                                    👉 Quay lại học bài tiên quyết: "{parent.name}"
                                  </button>
                                ))
                              ) : (
                                <div className="text-[10px] text-slate-400 text-center font-bold">
                                  (Đây đã là gốc rễ kiến thức của phân môn)
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Paginate indicator */}
                        {filteredQuestions.length > 1 && (
                          <div className="flex justify-between items-center pt-2">
                            <span className="text-[10px] text-slate-400 font-bold font-mono">
                              Câu {currentQIndex + 1} / {filteredQuestions.length}
                            </span>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => {
                                  setCurrentQIndex((prev) => Math.max(prev - 1, 0));
                                  setSelectedOption(null);
                                  setAnswerFeedback(null);
                                  setCantDoOptions(null);
                                  setHintPressCount(0);
                                  setActiveHint(null);
                                }}
                                disabled={currentQIndex === 0}
                                className="px-3 py-1.5 text-[10px] bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 font-bold disabled:opacity-40 cursor-pointer"
                              >
                                Trước
                              </button>
                              <button
                                onClick={() => {
                                  setCurrentQIndex((prev) => Math.min(prev + 1, filteredQuestions.length - 1));
                                  setSelectedOption(null);
                                  setAnswerFeedback(null);
                                  setCantDoOptions(null);
                                  setHintPressCount(0);
                                  setActiveHint(null);
                                }}
                                disabled={currentQIndex === filteredQuestions.length - 1}
                                className="px-3 py-1.5 text-[10px] bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 font-bold disabled:opacity-40 cursor-pointer"
                              >
                                Tiếp
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 3. Inline Socratic Question RAG Chatbot Helper */}
                        {quizMode === "practice" && (
                          <div className="pt-6 border-t border-slate-200 space-y-3 bg-indigo-50/20 p-4 rounded-[24px] border border-indigo-100/60 shadow-inner mt-4">
                            <div className="flex items-center gap-2">
                              <MessageSquare size={13} className="text-indigo-650" />
                              <h4 className="text-xs font-black text-slate-855">Cần trợ giúp? Trò chuyện Socratic về câu hỏi này</h4>
                            </div>

                            {/* Question Chat logs */}
                            <div className="max-h-[220px] overflow-y-auto border border-slate-100/80 rounded-2xl p-3 bg-white space-y-2 text-[11px] font-semibold">
                              {qChat.length === 0 ? (
                                <div className="text-center py-4 text-slate-400 font-semibold">
                                  Chưa có hội thoại. Nhập câu hỏi bên dưới để bắt đầu thảo luận Socratic với AI về bài tập này nhé!
                                </div>
                              ) : (
                                qChat.map((msg, idx) => (
                                  <div key={idx} className={`flex ${msg.sender === "student" ? "justify-end" : "justify-start"}`}>
                                    <SafeHtml
                                      text={msg.content}
                                      variant="tutor"
                                      className={`max-w-[90%] rounded-2xl px-3 py-2 border shadow-sm transition-all text-[11px] leading-relaxed ${
                                        msg.sender === "student"
                                          ? "bg-slate-900 border-slate-950 text-white rounded-br-none"
                                          : "bg-indigo-50/70 border-indigo-100 text-indigo-950 rounded-bl-none font-bold"
                                      }`}
                                    />
                                  </div>
                                ))
                              )}
                              {questionChatLoading && (
                                <div className="flex justify-start animate-pulse">
                                  <div className="bg-indigo-50/70 border border-indigo-100 text-indigo-400 rounded-2xl rounded-bl-none px-3.5 py-1.5 flex items-center gap-1">
                                    <span className="h-1 w-1 bg-indigo-450 rounded-full animate-bounce" />
                                    <span className="h-1 w-1 bg-indigo-450 rounded-full animate-bounce [animation-delay:0.2s]" />
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Question Chat Input form */}
                            <form onSubmit={(e) => handleSendQuestionChat(e, currentQ.id)} className="relative flex items-center border border-slate-250/70 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-50 bg-white rounded-2xl transition-all duration-200 p-1.5 shadow-sm">
                              <input
                                type="text"
                                placeholder="Hỏi AI về câu hỏi này..."
                                value={questionChatInput}
                                onChange={(e) => setQuestionChatInput(e.target.value)}
                                className="flex-1 bg-transparent text-xs px-2.5 py-2 text-zinc-955 focus:outline-none font-semibold"
                              />
                              <button
                                type="submit"
                                disabled={questionChatLoading || !questionChatInput.trim()}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 h-8 w-8 rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center cursor-pointer font-bold"
                              >
                                <Send size={12} />
                              </button>
                            </form>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-16 text-slate-400 text-xs font-bold border border-dashed border-slate-200 rounded-2xl flex flex-col items-center gap-2">
                    <HelpCircle size={24} className="text-indigo-400" />
                    Chưa có câu hỏi trắc nghiệm nào cho bài học này.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-3 p-10 bg-white border border-slate-200 rounded-3xl shadow-sm">
              <Compass size={40} className="text-indigo-500 animate-pulse mb-1" />
              <p className="text-sm font-bold text-slate-700">Chưa có bài học nào được chọn</p>
              <p className="text-xs text-slate-400 max-w-sm text-center leading-relaxed">
                Em hãy quay lại tab <strong>🌐 Sơ đồ Cây</strong> và bấm chọn một chủ đề học tập để bắt đầu không gian học tập Socratic nhé!
              </p>
              <button
                onClick={() => setActiveMainTab("graph")}
                className="bg-indigo-600 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-md hover:bg-indigo-700 active:scale-95 transition-all mt-2 cursor-pointer font-bold"
              >
                Mở Sơ đồ Cây
              </button>
            </div>
          )
        )}
        </>
        )
        )}
      </main>

      {/* Join Class by Code Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 animate-[fadeIn_0.2s_ease-out] p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 max-w-md w-full flex flex-col gap-4 relative animate-[scaleUp_0.2s_ease-out]">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="space-y-1">
                <h3 className="font-black text-slate-900 text-base uppercase tracking-tight flex items-center gap-2">
                  <span>🔑 Tham Gia Lớp Học Mới</span>
                </h3>
                <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                  Nhập mã lớp được giáo viên cấp (ví dụ: MATH-101) để tự động thêm môn học vào tài khoản.
                </p>
              </div>
              <button
                onClick={() => setShowJoinModal(false)}
                className="h-7 w-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Mã Lớp Học (Class Code)
                </label>
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  placeholder="Ví dụ: MATH-101, PHY-202..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-black text-slate-800 uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoinClassByCode();
                  }}
                />
              </div>

              {/* Quick Preset Badges */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Mã gợi ý trải nghiệm nhanh:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleJoinClassByCode("MATH-101")}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Math 10 (MATH-101)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleJoinClassByCode("PHY-202")}
                    className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Vật lý 10 (PHY-202)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleJoinClassByCode("CHEM-303")}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Hóa học 10 (CHEM-303)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100 mt-2">
              <button
                type="button"
                onClick={() => setShowJoinModal(false)}
                className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleJoinClassByCode()}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-black rounded-xl transition-all shadow-md cursor-pointer"
              >
                Xác nhận kết nối
              </button>
            </div>
          </div>
        </div>
      )}
      <GuidedTour />
    </div>
  );
}
