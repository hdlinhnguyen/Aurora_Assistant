"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { telemetry } from "@/lib/telemetry";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from "recharts";
import KnowledgeTree from "../components/KnowledgeTree";
import GuidedTour from "../components/GuidedTour";
import QuickRoleSwitcher from "../components/QuickRoleSwitcher";
import QuestionBankTab from "./components/QuestionBankTab";
import QuestionTaggingPanel from "./components/QuestionTaggingPanel";
import MonitoringTab from "./components/MonitoringTab";
import LearningPathTab from "./components/LearningPathTab";
import StudentsProgressTab from "./components/StudentsProgressTab";
import StudentMasteryMatrix from "./components/StudentMasteryMatrix";
import StudentMgmtTab from "./components/StudentMgmtTab";
import StudentMasteryProfile from "./components/StudentMasteryProfile";
import StudentActivityFeed from "./components/StudentActivityFeed";
import ExamBuilderTab from "./components/ExamBuilderTab";
import ExamScoringTab from "./components/ExamScoringTab";
import {
  Users,
  GitBranch,
  Eye,
  ArrowLeft,
  Plus,
  Trash,
  Pencil,
  FileText,
  CheckCircle,
  AlertTriangle,
  Calendar,
  Mail,
  User,
  BookOpen,
  GraduationCap,
  HelpCircle,
  Upload,
  Download,
  Loader2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  Check,
  RefreshCw,
  Database,
  TrendingUp,
  BarChart2,
  FilePenLine,
  ClipboardCheck,
  FlaskConical,
  GitCommit,
  PlusCircle,
  Zap,
  X
} from "lucide-react";

export interface NodeItem {
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

export interface StudentProgress {
  studentId: string;
  studentName: string;
  studentEmail: string;
  subject: string;
  initialNodeId: string;
  initialNode: string;
  currentNodeId: string;
  currentNode: string;
  updatedAt: string;
  totalAnswers: number;
  correctAnswers: number;
  lastActiveAt: string | null;
}

interface StudentDetailProgress {
  studentId: string;
  studentName: string;
  studentEmail: string;
  state: {
    initialLevelNodeId: string;
    currentLevelNodeId: string;
    learningPathThreadId: string;
    updatedAt: string;
  };
  logs: Array<{
    id: string;
    nodeName: string;
    action: string;
    detail: string;
    createdAt: string;
  }>;
  nodeStatus: Record<string, "mastered" | "struggle">;
  nodeAccuracy?: Record<string, { correct: number; incorrect: number; total: number }>;
  nodeDifficultyStats?: Record<string, Record<string, { correct: number; incorrect: number; total: number }>>;
}

export interface Question {
  id: string;
  nodeId: string;
  content: string;
  optionsJson: string;
  correctOption: number;
  difficulty: string;
  questionType?: "multiple_choice" | "essay";
  gradeLevel?: string;
  rubricItems?: Array<{
    id: string;
    questionId: string;
    content: string;
    points: string;
    position: number;
  }>;
}

interface RubricDraft {
  id?: string;
  content: string;
  points: string;
}

type ActiveTab = "students" | "graph-designer" | "learning-path" | "question-bank" | "monitoring" | "student-mgmt" | "exam-builder" | "exam-scoring";

export default function TeacherDashboard() {
  const router = useRouter();
  const [userName, setUserName] = useState("Giáo viên");
  const [activeTab, setActiveTab] = useState<ActiveTab>("graph-designer");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");

  // Learning Path States
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [insights, setInsights] = useState<any>(null);
  const [draftPaths, setDraftPaths] = useState<any>(null);
  const [selectedTargetTopics, setSelectedTargetTopics] = useState<string[]>([]);
  const [generatingPath, setGeneratingPath] = useState(false);
  const [approvingPath, setApprovingPath] = useState(false);
  const [pathErrorDetail, setPathErrorDetail] = useState<string | null>(null);

  // Graph Data
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [edges, setEdges] = useState<EdgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Student Progress
  const [studentsProgress, setStudentsProgress] = useState<StudentProgress[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentProgress | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentDetailProgress | null>(null);
  const [subjectQuestions, setSubjectQuestions] = useState<Question[]>([]);
  const [examsCount, setExamsCount] = useState<number>(0);
  const [hasActiveExam, setHasActiveExam] = useState<boolean>(false);
  const [dismissedSteps, setDismissedSteps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem("aurora_dismissed_steps");
    if (saved) {
      try {
        setDismissedSteps(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const dismissStep = (stepKey: string) => {
    const updated = { ...dismissedSteps, [stepKey]: true };
    setDismissedSteps(updated);
    localStorage.setItem("aurora_dismissed_steps", JSON.stringify(updated));
  };

  const loadExamsStatus = async () => {
    if (!selectedSubject) return;
    try {
      const list = await apiFetch(`/teacher/exams`);
      setExamsCount(list?.length || 0);
      setHasActiveExam(list?.some((e: any) => e.status === "preparing_exam") || false);
    } catch (e) {
      console.error("Failed to load exams status", e);
    }
  };

  const [qbSearchText, setQbSearchText] = useState("");
  const [qbFilterNodeId, setQbFilterNodeId] = useState("");
  const [qbFilterDifficulty, setQbFilterDifficulty] = useState("");
  const [taggingQuestionId, setTaggingQuestionId] = useState<string | null>(null);
  const [monitoringStats, setMonitoringStats] = useState<any[]>([]);
  const [loadingMonitoring, setLoadingMonitoring] = useState(false);
  const [studentNodeStatus, setStudentNodeStatus] = useState<Record<string, "mastered" | "struggle" | "learning" | "locked" | "initial">>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [studentViewMode, setStudentViewMode] = useState<"tree" | "matrix">("tree");
  const [graphDesignerSubTab, setGraphDesignerSubTab] = useState<"canvas" | "matrix">("canvas");

  // Active Node Editor Drawer (Graph Designer)
  const [editingNode, setEditingNode] = useState<NodeItem | null>(null);
  const [drawerWidth, setDrawerWidth] = useState(450);
  const [nodeEditorTab, setNodeEditorTab] = useState<"theory" | "questions" | "history">("theory");
  const [theoryText, setTheoryText] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [navHistory, setNavHistory] = useState<NodeItem[]>([]);

  // Parser Resumption states
  const [extractedChunks, setExtractedChunks] = useState<string[]>([]);
  const [parsedGraphsCache, setParsedGraphsCache] = useState<any[]>([]);
  const [failedChunkIndex, setFailedChunkIndex] = useState<number | null>(null);
  const [parseErrorDetail, setParseErrorDetail] = useState<string>("");

  // Questions Manager
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question> | null>(null);
  const [qContent, setQContent] = useState("");
  const [qOptions, setQOptions] = useState<string[]>(["", "", "", ""]);
  const [qCorrect, setQCorrect] = useState(0);
  const [qDifficulty, setQDifficulty] = useState("medium");
  const [qQuestionType, setQQuestionType] = useState<"multiple_choice" | "essay">("multiple_choice");
  const [qGradeLevel, setQGradeLevel] = useState("");
  const [qRubrics, setQRubrics] = useState<RubricDraft[]>([]);
  const [qDistractors, setQDistractors] = useState<Record<string, string>>({});
  const [pendingDiff, setPendingDiff] = useState<{ newNodes: any[]; suggestedEdges: any[] } | null>(null);
  const [hasInterventions, setHasInterventions] = useState(false);

  // Sandbox Mode & Diff Inline Edit states
  const [isSandboxMode, setIsSandboxMode] = useState(false);
  const [editingDiffNodeIdx, setEditingDiffNodeIdx] = useState<number | null>(null);
  const [diffEditName, setDiffEditName] = useState("");
  const [diffEditTheory, setDiffEditTheory] = useState("");

  // Subject Modal & Confirmation Box states (replaces window.prompt & window.confirm)
  const [subjectModal, setSubjectModal] = useState<{
    type: "create" | "rename" | "delete" | null;
    targetSubject?: string;
    inputValue?: string;
  }>({ type: null });

  const [confirmModalState, setConfirmModalState] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });

  useEffect(() => {
    const userStr = localStorage.getItem("aurora_user");
    if (!userStr) {
      router.push("/");
      return;
    }
    const user = JSON.parse(userStr);
    if (user.role !== "teacher") {
      router.push("/tutor");
      return;
    }
    setUserName(user.name);

    // Restore saved states from localStorage
    const savedSubject = localStorage.getItem("aurora_teacher_subject");
    const savedTab = localStorage.getItem("aurora_teacher_tab") as ActiveTab | null;
    const savedStudent = localStorage.getItem("aurora_teacher_student");
    const savedViewMode = localStorage.getItem("aurora_teacher_view_mode") as "tree" | "matrix" | null;

    if (savedSubject !== null) {
      setSelectedSubject(savedSubject);
    }
    const isTourActive = localStorage.getItem("aurora_tour_active") === "true";
    const savedStepIdxStr = localStorage.getItem("aurora_tour_step");
    let initialTab = savedTab || "student-mgmt";
    
    if (isTourActive && savedStepIdxStr) {
      const stepIdx = parseInt(savedStepIdxStr, 10);
      const tourMode = localStorage.getItem("aurora_tour_mode") || "both";
      
      const tourSteps = [
        { id: "welcome" },
        { id: "socratic-chat" },
        { id: "feynman-notebook" },
        { id: "role-switcher" },
        { id: "concept-gaps" },
        { id: "inspect-drawer" },
        { id: "finish" }
      ];
      
      const activeSteps = tourSteps.filter((step, idx) => {
        if (idx === 0 || idx === tourSteps.length - 1) return true;
        if (tourMode === "student") return step.id === "socratic-chat" || step.id === "role-switcher";
        if (tourMode === "teacher") return step.id === "concept-gaps" || step.id === "inspect-drawer" || step.id === "role-switcher";
        return true;
      });
      
      const currentStep = activeSteps[stepIdx];
      if (currentStep) {
        if (currentStep.id === "concept-gaps") {
          initialTab = "monitoring";
        } else if (currentStep.id === "inspect-drawer") {
          initialTab = "students";
        }
      }
    }
    
    setActiveTab(initialTab);
    if (savedStudent) {
      try {
        setSelectedStudent(JSON.parse(savedStudent));
      } catch (e) {
        console.error(e);
      }
    }
    if (savedViewMode) {
      setStudentViewMode(savedViewMode);
    }

    loadSubjects();
    loadStudentsProgress();
  }, [router]);

  useEffect(() => {
    const handleSwitchTab = (e: Event) => {
      const customEvent = e as CustomEvent<ActiveTab>;
      if (customEvent.detail) {
        setActiveTab(customEvent.detail);
      }
    };
    window.addEventListener("aurora-tour-switch-tab", handleSwitchTab);
    return () => window.removeEventListener("aurora-tour-switch-tab", handleSwitchTab);
  }, []);

  const loadSubjectQuestions = async () => {
    if (!selectedSubject) return;
    try {
      const data = await apiFetch(
        `/teacher/question-bank/questions?subject=${encodeURIComponent(selectedSubject)}`,
      );
      setSubjectQuestions(data || []);
    } catch (err) {
      console.error("Failed to load subject questions:", err);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = ["Chủ đề", "Câu hỏi", "Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D", "Đáp án đúng (0-3)", "Độ khó (easy/medium/hard)"];
    const sampleRows = [
      ["Cộng phân số cùng mẫu", "Tính 1/5 + 2/5 = ?", "3/5", "4/5", "5/5", "2/5", 0, "easy"],
      ["Cộng phân số cùng mẫu", "Tính 3/7 + 2/7 = ?", "5/14", "5/7", "1/7", "6/7", 1, "easy"],
      ["Cộng phân số khác mẫu", "Tính 1/2 + 1/3 = ?", "2/5", "5/6", "1/5", "5/5", 1, "medium"]
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "mau_nhap_cau_hoi.xlsx");
    toast.success("Đã tải xuống file mẫu Excel!");
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLoadingMessage("Đang đọc và phân tích file Excel...");

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[];

        if (data.length <= 1) {
          toast.warning("File Excel không có dữ liệu câu hỏi.");
          setLoading(false);
          return;
        }

        let successCount = 0;
        let failCount = 0;
        const questionsByNode: Record<string, any[]> = {};

        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length < 2) continue;

          const topicName = row[0]?.toString().trim();
          const content = row[1]?.toString().trim();
          const optA = row[2]?.toString().trim() || "";
          const optB = row[3]?.toString().trim() || "";
          const optC = row[4]?.toString().trim() || "";
          const optD = row[5]?.toString().trim() || "";
          let correctOption = parseInt(row[6]?.toString().trim());
          if (isNaN(correctOption)) correctOption = 0;
          const difficulty = row[7]?.toString().trim().toLowerCase() || "medium";

          if (!topicName || !content) {
            failCount++;
            continue;
          }

          const matchedNode = nodes.find(n => n.name.toLowerCase() === topicName.toLowerCase());
          if (!matchedNode) {
            failCount++;
            continue;
          }

          const options = [optA, optB, optC, optD];
          const questionPayload = {
            content: content,
            optionsJson: JSON.stringify(options),
            correctOption: correctOption,
            difficulty: difficulty
          };

          if (!questionsByNode[matchedNode.id]) {
            questionsByNode[matchedNode.id] = [];
          }
          questionsByNode[matchedNode.id].push(questionPayload);
        }

        for (const nodeId in questionsByNode) {
          const qs = questionsByNode[nodeId];
          await apiFetch(`/nodes/${nodeId}/questions/bulk`, {
            method: "POST",
            body: JSON.stringify(qs)
          });
          successCount += qs.length;
        }

        toast.success(`Nhập Excel thành công: Đã import ${successCount} câu hỏi!`, {
          description: failCount > 0 ? `Bỏ qua ${failCount} dòng do không khớp tên chủ đề hoặc thiếu thông tin.` : undefined
        });

        loadSubjectQuestions();
        if (editingNode) {
          loadNodeQuestions(editingNode.id);
        }
      } catch (err: any) {
        toast.error("Lỗi khi đọc file Excel: " + err.message);
      } finally {
        setLoading(false);
        e.target.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleMasterBankImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLoadingMessage("Đang đọc và import Master Bank JSON...");

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const json = JSON.parse(text);

        const res = await apiFetch("/import/master-bank", {
          method: "POST",
          body: JSON.stringify(json),
        });

        toast.success(
          `Import Master Bank thành công: ${res.imported} câu đã nhập!`,
          {
            description: [
              res.skippedDedup > 0 ? `${res.skippedDedup} câu trùng sig (bỏ qua)` : "",
              res.skippedNonTN4 > 0 ? `${res.skippedNonTN4} câu TuLuan/DungSai (bỏ qua)` : "",
              res.skippedNoNode > 0 ? `${res.skippedNoNode} câu thiếu node (bỏ qua)` : "",
            ].filter(Boolean).join(". ") || undefined,
          }
        );

        loadSubjectQuestions();
      } catch (err: any) {
        toast.error("Lỗi khi import Master Bank: " + err.message);
      } finally {
        setLoading(false);
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleLoadDemoQuestions = async () => {
    setLoading(true);
    setLoadingMessage("Đang tải và nạp câu hỏi mẫu từ hệ thống...");
    try {
      const resFile = await fetch("/master_bank.json");
      const json = await resFile.json();
      const res = await apiFetch("/import/master-bank", {
        method: "POST",
        body: JSON.stringify(json),
      });
      toast.success(
        `Nạp câu hỏi mẫu thành công: Đã import ${res.imported} câu hỏi!`,
        {
          description: [
            res.skippedDedup > 0 ? `${res.skippedDedup} câu trùng sig (bỏ qua)` : "",
            res.skippedNonTN4 > 0 ? `${res.skippedNonTN4} câu TuLuan/DungSai (bỏ qua)` : "",
            res.skippedNoNode > 0 ? `${res.skippedNoNode} câu thiếu node (bỏ qua)` : "",
          ].filter(Boolean).join(". ") || undefined,
        }
      );
      loadSubjectQuestions();
      loadExamsStatus();
    } catch (err: any) {
      toast.error("Lỗi khi nạp câu hỏi mẫu: " + err.message);
    } finally {
      setLoading(false);
    }
  };


  const loadMonitoringData = async () => {
    if (selectedSubject === "Môn học Trải nghiệm (Demo)") {
      setMonitoringStats([
        { studentId: "mock-student-1", studentName: "Nguyễn Văn Bi (Demo)", studentEmail: "bi@aurora.edu.vn", expectedMastery: 80, actualMastery: 45, totalAnswers: 15, correctAnswers: 11, isOutlier: true }
      ]);
      setLoadingMonitoring(false);
      return;
    }
    if (!selectedSubject) return;
    setLoadingMonitoring(true);
    try {
      const data = await apiFetch(`/teacher/monitoring/${encodeURIComponent(selectedSubject)}`);
      setMonitoringStats(data || []);
    } catch (err) {
      console.error("Failed to load monitoring stats:", err);
    } finally {
      setLoadingMonitoring(false);
    }
  };

  const checkClassInterventions = async (subject: string) => {
    if (subject === "Môn học Trải nghiệm (Demo)") {
      setHasInterventions(true);
      return;
    }
    try {
      const data = await apiFetch(`/teacher/classes/intervention-groups/${encodeURIComponent(subject)}`);
      if (data && data.groups && data.groups.length > 0) {
        setHasInterventions(true);
      } else {
        setHasInterventions(false);
      }
    } catch {
      setHasInterventions(false);
    }
  };

  useEffect(() => {
    if (selectedSubject) {
      loadTreeData();
      if (selectedStudent) {
        loadStudentDetailProgress(selectedStudent.studentId);
      }
      loadSubjectQuestions();
      loadMonitoringData();
      checkClassInterventions(selectedSubject);
      loadExamsStatus();
    }
  }, [selectedSubject]);

  useEffect(() => {
    if (activeTab === "question-bank" && selectedSubject) {
      loadSubjectQuestions();
    }
    if (activeTab === "monitoring" && selectedSubject) {
      loadMonitoringData();
    }
    if (selectedSubject) {
      loadExamsStatus();
    }
  }, [activeTab, selectedSubject]);

  // Save active states to localStorage to persist reload
  useEffect(() => {
    if (selectedSubject !== "") {
      localStorage.setItem("aurora_teacher_subject", selectedSubject);
    } else {
      localStorage.setItem("aurora_teacher_subject", "");
    }
  }, [selectedSubject]);

  useEffect(() => {
    localStorage.setItem("aurora_teacher_tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (selectedStudent) {
      localStorage.setItem("aurora_teacher_student", JSON.stringify(selectedStudent));
    } else {
      localStorage.removeItem("aurora_teacher_student");
    }
  }, [selectedStudent]);

  useEffect(() => {
    localStorage.setItem("aurora_teacher_view_mode", studentViewMode);
  }, [studentViewMode]);

  const loadSubjects = async (selectSubjectName?: string) => {
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
      const savedSub = localStorage.getItem("aurora_teacher_subject");
      
      if (tourActive && !selectedSubject) {
        setSelectedSubject("Môn học Trải nghiệm (Demo)");
      } else if (selectSubjectName && finalSubjects.includes(selectSubjectName)) {
        setSelectedSubject(selectSubjectName);
      } else if (savedSub !== null) {
        if (savedSub && finalSubjects.includes(savedSub)) {
          setSelectedSubject(savedSub);
        } else if (savedSub === "") {
          setSelectedSubject("");
        } else if (selectedSubject && finalSubjects.includes(selectedSubject)) {
          // Keep
        } else if (finalSubjects.length > 0) {
          setSelectedSubject(finalSubjects[0]);
        }
      } else if (selectedSubject && finalSubjects.includes(selectedSubject)) {
        // Keep currently selected
      } else if (finalSubjects.length > 0) {
        setSelectedSubject(finalSubjects[0]);
      } else {
        setSelectedSubject("");
      }
    } catch (err) {
      console.error("Failed to load subjects:", err);
    }
  };

  const handleCreateSubject = () => {
    setSubjectModal({ type: "create", inputValue: "" });
  };

  const submitCreateSubject = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      setLoading(true);
      setLoadingMessage("Đang tạo môn học mới...");
      const rootNode = {
        name: trimmed,
        theory: `Chào mừng bạn đến với chương trình học ${trimmed}!`,
        posX: 400,
        posY: 50,
        isRoot: true,
      };
      await apiFetch(`/subjects/${encodeURIComponent(trimmed)}/nodes`, {
        method: "POST",
        body: JSON.stringify(rootNode),
      });
      toast.success(`Đã tạo môn học "${trimmed}" thành công!`);
      await loadSubjects(trimmed);
    } catch (err: any) {
      toast.error("Lỗi khi tạo môn học: " + (err.message || err));
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const handleRenameSubjectFor = (subjectName: string) => {
    setSubjectModal({ type: "rename", targetSubject: subjectName, inputValue: subjectName });
  };

  const submitRenameSubject = async (subjectName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === subjectName) return;

    try {
      setLoading(true);
      setLoadingMessage("Đang đổi tên môn học...");
      await apiFetch(`/subjects/${encodeURIComponent(subjectName)}`, {
        method: "PUT",
        body: JSON.stringify({ newName: trimmed }),
      });
      toast.success("Đổi tên môn học thành công!");

      if (selectedSubject === subjectName) {
        await loadSubjects(trimmed);
      } else {
        await loadSubjects();
      }
    } catch (err: any) {
      toast.error("Lỗi khi đổi tên môn học: " + (err.message || err));
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const handleDeleteSubjectFor = (subjectName: string) => {
    setSubjectModal({ type: "delete", targetSubject: subjectName });
  };

  const submitDeleteSubject = async (subjectName: string) => {
    try {
      setLoading(true);
      setLoadingMessage("Đang xóa môn học...");
      await apiFetch(`/subjects/${encodeURIComponent(subjectName)}`, {
        method: "DELETE",
      });
      toast.success("Xóa môn học thành công!");
      if (selectedSubject === subjectName) {
        setSelectedSubject("");
      }
      await loadSubjects();
    } catch (err: any) {
      toast.error("Lỗi khi xóa môn học: " + (err.message || err));
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const handleExportTreeJson = () => {
    if (!selectedSubject) {
      toast.warning("Vui lòng chọn môn học trước khi xuất file!");
      return;
    }
    const exportData = {
      subject: selectedSubject,
      nodes: nodes.map(n => ({
        name: n.name,
        theory: n.theory,
        topicGroup: n.topicGroup,
        posX: n.posX,
        posY: n.posY,
        isRoot: n.isRoot
      })),
      edges: edges.map(e => {
        const srcNode = nodes.find(n => n.id === e.sourceId);
        const tgtNode = nodes.find(n => n.id === e.targetId);
        return {
          sourceNodeName: srcNode ? srcNode.name : "",
          targetNodeName: tgtNode ? tgtNode.name : ""
        };
      }).filter(e => e.sourceNodeName && e.targetNodeName)
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `knowledge_tree_${encodeURIComponent(selectedSubject)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Đã xuất file JSON thành công cho môn "${selectedSubject}"!`);
  };

  const handleImportMockTree = async () => {
    try {
      setLoading(true);
      setLoadingMessage("Đang nạp Sơ đồ Cây Mẫu...");
      const res = await fetch("/mock_knowledge_tree.json");
      const mockGraph = await res.json();
      
      await apiFetch(`/subjects/${encodeURIComponent(mockGraph.subject)}/save-tree`, {
        method: "POST",
        body: JSON.stringify({
          nodes: mockGraph.nodes,
          edges: mockGraph.edges
        })
      });

      toast.success(`🎉 Đã nạp thành công Cây Tri Thức Mẫu "${mockGraph.subject}"!`);
      await loadSubjects(mockGraph.subject);
    } catch (err: any) {
      toast.error("Lỗi khi nạp Cây Mẫu: " + (err.message || err));
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const handleRenameSubject = () => {
    if (selectedSubject) handleRenameSubjectFor(selectedSubject);
  };

  const handleDeleteSubject = () => {
    if (selectedSubject) handleDeleteSubjectFor(selectedSubject);
  };

  const loadTreeData = async () => {
    if (selectedSubject === "Môn học Trải nghiệm (Demo)") {
      const mockNodes = [
        { id: "mock-node-root", subject: "Môn học Trải nghiệm (Demo)", name: "Toán đại số lớp 7", theory: "Lý thuyết chung về Toán đại số", topicGroup: "Đại số", posX: 400, posY: 50, isRoot: true },
        { id: "mock-node-1", subject: "Môn học Trải nghiệm (Demo)", name: "Phép cộng phân số", theory: "Cộng hai phân số khác mẫu.", topicGroup: "Đại số", posX: 250, posY: 180, isRoot: false },
        { id: "mock-node-1-1", subject: "Môn học Trải nghiệm (Demo)", name: "Cộng phân số cùng mẫu", theory: "Quy tắc: Muốn cộng hai phân số có cùng mẫu số, ta cộng hai tử số với nhau và giữ nguyên mẫu số. Ví dụ: 1/5 + 2/5 = (1+2)/5 = 3/5.", topicGroup: "Đại số", posX: 150, posY: 310, isRoot: false }
      ];
      setNodes(mockNodes);
      setEdges([
        { id: "mock-edge-1", subject: "Môn học Trải nghiệm (Demo)", sourceId: "mock-node-root", targetId: "mock-node-1" },
        { id: "mock-edge-2", subject: "Môn học Trải nghiệm (Demo)", sourceId: "mock-node-1", targetId: "mock-node-1-1" }
      ]);
      setFocusedNodeId("mock-node-root");
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch(`/subjects/${encodeURIComponent(selectedSubject)}/tree`);
      const nodesData = data.nodes || [];
      setNodes(nodesData);
      setEdges(data.edges || []);

      const rootNode = nodesData.find((n: any) => n.isRoot);
      if (rootNode) {
        setFocusedNodeId(rootNode.id);
        setNavHistory([rootNode]);
      }
    } catch (err) {
      console.error("Failed to load tree:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadStudentsProgress = async () => {
    const tourActive = localStorage.getItem("aurora_tour_active") === "true";
    if (tourActive) {
      setStudentsProgress([
        { studentId: "mock-student-1", studentName: "Nguyễn Văn Bi (Demo)", email: "bi@aurora.edu.vn", activeSubject: "Môn học Trải nghiệm (Demo)", lastActive: new Date().toISOString() }
      ] as any);
      return;
    }
    try {
      const data = await apiFetch("/teacher/students-progress");
      setStudentsProgress(data || []);
    } catch (err) {
      console.error("Failed to load students progress:", err);
    }
  };
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "N/A";
      return d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (e) {
      return "N/A";
    }
  };
  const formatBackendError = (errStr: string) => {
    if (!errStr) return "Lỗi không xác định";
    let cleanStr = errStr.replace(/^Máy chủ tính toán báo lỗi:\s*/, "");
    try {
      const parsed = JSON.parse(cleanStr);
      if (parsed.detail && Array.isArray(parsed.detail)) {
        return parsed.detail.map((d: any) => {
          const loc = d.loc ? d.loc.join(" -> ") : "";
          const msg = d.msg || "";
          return `[Trường: ${loc}] ${msg}`;
        }).join("; ");
      }
      if (parsed.error) return parsed.error;
      return cleanStr;
    } catch (e) {
      return errStr;
    }
  };

  const handleGenerateLearningPath = async () => {
    if (selectedTargetTopics.length === 0) {
      toast.warning("Vui lòng chọn ít nhất một chủ đề mục tiêu để phân tích.");
      return;
    }
    setGeneratingPath(true);
    setPathErrorDetail(null);
    try {
      const res = await apiFetch("/teacher/learning-path", {
        method: "POST",
        body: JSON.stringify({
          classId: "class-demo",
          targetTopicIds: selectedTargetTopics,
        }),
      });
      setActiveThreadId(res.thread_id);
      setInsights(res.class_insight);
      setDraftPaths(res.paths);
      telemetry.track("learning_path_generated", {
        thread_id: res.thread_id,
        path_count: Object.keys(res.paths || {}).length,
        model_version: "frontend-observation-v1",
      });
      void telemetry.flush().catch(() => undefined);
      toast.success("Lập lộ trình nháp thành công!");
    } catch (err: any) {
      const detail = formatBackendError(err.message || err.toString());
      setPathErrorDetail(detail);
      toast.error("Lỗi khi lập lộ trình", { description: detail });
    } finally {
      setGeneratingPath(false);
    }
  };

  const handleApproveLearningPath = async () => {
    if (!activeThreadId) return;
    setApprovingPath(true);
    try {
      await apiFetch(`/teacher/learning-path/${activeThreadId}/approve`, {
        method: "POST",
        body: JSON.stringify({
          approve: true,
          note: "Phê duyệt bởi giáo viên",
          custom_paths: draftPaths,
        }),
      });
      telemetry.track("learning_path_approved", {
        thread_id: activeThreadId,
        approved: true,
        note_length: "PhÃª duyá»‡t bá»Ÿi giÃ¡o viÃªn".length,
        path_count: Object.keys(draftPaths || {}).length,
      });
      void telemetry.flush().catch(() => undefined);
      toast.success("Đã phê duyệt và kích hoạt lộ trình học tập cho học sinh!");
      setActiveThreadId(null);
      setInsights(null);
      setDraftPaths(null);
    } catch (err: any) {
      toast.error("Lỗi khi phê duyệt: " + err.message);
    } finally {
      setApprovingPath(false);
    }
  };

  const handleMoveStep = (studentId: string, stepIndex: number, direction: "up" | "down") => {
    if (!draftPaths) return;
    const studentPath = { ...draftPaths[studentId] };
    const steps = [...(studentPath.ordered_steps || [])];

    if (direction === "up" && stepIndex > 0) {
      const temp = steps[stepIndex];
      steps[stepIndex] = steps[stepIndex - 1];
      steps[stepIndex - 1] = temp;
    } else if (direction === "down" && stepIndex < steps.length - 1) {
      const temp = steps[stepIndex];
      steps[stepIndex] = steps[stepIndex + 1];
      steps[stepIndex + 1] = temp;
    } else {
      return;
    }

    steps.forEach((s, idx) => {
      s.order = idx + 1;
    });

    studentPath.ordered_steps = steps;
    setDraftPaths({
      ...draftPaths,
      [studentId]: studentPath
    });
    telemetry.track("path_step_moved", {
      thread_id: activeThreadId || "draft",
      step_index: stepIndex,
      direction,
      resulting_step_count: steps.length,
    });
  };

  const handleDeleteStep = (studentId: string, stepIndex: number) => {
    if (!draftPaths) return;
    const studentPath = { ...draftPaths[studentId] };
    const steps = [...(studentPath.ordered_steps || [])];

    steps.splice(stepIndex, 1);

    steps.forEach((s, idx) => {
      s.order = idx + 1;
    });

    studentPath.ordered_steps = steps;
    setDraftPaths({
      ...draftPaths,
      [studentId]: studentPath
    });
    telemetry.track("path_step_deleted", {
      thread_id: activeThreadId || "draft",
      step_index: stepIndex,
      resulting_step_count: steps.length,
    });
  };

  const loadStudentDetailProgress = async (studentId: string) => {
    try {
      const data = (await apiFetch(
        `/teacher/students/${studentId}/progress/${encodeURIComponent(selectedSubject)}`
      )) as StudentDetailProgress;
      setStudentDetail(data);

      const statusMap: Record<string, "mastered" | "struggle" | "learning" | "locked" | "initial"> = {};

      if (data.nodeStatus) {
        Object.keys(data.nodeStatus).forEach((k) => {
          statusMap[k] = data.nodeStatus[k];
        });
      }

      if (data.state) {
        if (data.state.initialLevelNodeId) {
          statusMap[data.state.initialLevelNodeId] = "initial";
        }
        if (data.state.currentLevelNodeId && statusMap[data.state.currentLevelNodeId] !== "mastered") {
          statusMap[data.state.currentLevelNodeId] = "learning";
        }
      }
      setStudentNodeStatus(statusMap);
    } catch (err) {
      console.error("Failed to load student progress detail:", err);
    }
  };

  const handleInspectStudent = (progress: StudentProgress) => {
    setSelectedStudent(progress);
    setSelectedSubject(progress.subject);
    loadStudentDetailProgress(progress.studentId);
  };

  const handleBackToStudents = () => {
    setSelectedStudent(null);
    setStudentDetail(null);
    loadStudentsProgress();
  };

  const handleReDiagnostic = async () => {
    if (!selectedStudent) return;
    setConfirmModalState({
      open: true,
      title: "Yêu cầu chẩn đoán lại năng lực",
      message: `Bạn có chắc chắn muốn yêu cầu học sinh "${selectedStudent.studentName}" thực hiện chẩn đoán lại năng lực cho môn "${selectedStudent.subject}"? Hành động này sẽ xóa nhật ký làm bài trước đó để đánh giá lại từ đầu.`,
      onConfirm: async () => {
        try {
          await apiFetch(`/teacher/students/${selectedStudent.studentId}/re-diagnostic`, {
            method: "POST",
            body: JSON.stringify({ subject: selectedStudent.subject })
          });
          toast.success("Đã gửi yêu cầu chẩn đoán lại năng lực thành công!");
          loadStudentDetailProgress(selectedStudent.studentId);
        } catch (err: any) {
          toast.error("Lỗi khi yêu cầu chẩn đoán lại: " + err.message);
        }
      },
    });
  };

  const handleNodeClick = (node: NodeItem) => {
    setEditingNode(node);
    setTheoryText(node.theory || "");
    setUploadFile(null);
    loadNodeQuestions(node.id);
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

  const handleSaveTheory = async () => {
    if (!editingNode) return;
    setLoading(true);
    setLoadingMessage(uploadFile ? "Đang trích xuất và lưu lý thuyết RAG..." : "Đang lưu lý thuyết...");

    try {
      const formData = new FormData();
      formData.append("theory", theoryText);
      if (uploadFile) {
        formData.append("file", uploadFile);
      }

      const res = await apiFetch(`/nodes/${editingNode.id}/upload-theory`, {
        method: "POST",
        body: formData,
      });

      toast.success("Lưu lý thuyết thành công!");
      setUploadFile(null);
      if (res.theory) {
        setTheoryText(res.theory);
        setNodes((prev) =>
          prev.map((n) => (n.id === editingNode.id ? { ...n, theory: res.theory } : n))
        );
      }
      loadTreeData();
    } catch (err: any) {
      toast.error("Lỗi khi lưu lý thuyết: " + err.message);
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const handleAutoParseGraph = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedSubject) {
      toast.warning("Vui lòng chọn môn học trước khi tải lên tài liệu!");
      return;
    }

    setConfirmModalState({
      open: true,
      title: "Phân tích & Dựng sơ đồ cây từ tài liệu",
      message: `Bạn có chắc chắn muốn tự động dựng cây kiến thức cho môn "${selectedSubject}" từ tài liệu "${file.name}"? Hệ thống sẽ bóc tách các chủ đề và liên kết từ file.`,
      onConfirm: () => {
        startParseGraphFile(file);
      },
    });
  };

  const startParseGraphFile = async (file: File) => {
    const ctrl = new AbortController();
    setLoading(true);
    setLoadingMessage("Chuẩn bị dữ liệu và trích xuất tài liệu...");
    setAbortController(ctrl);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // 1. Extract text from uploaded document
      const extRes = await apiFetch("/subjects/extract-text", {
        method: "POST",
        body: formData,
        signal: ctrl.signal,
      });

      if (!extRes.content) {
        throw new Error("Không thể trích xuất văn bản từ tài liệu này.");
      }

      const content = extRes.content;
      const chunkSize = 30000;
      const chunksList: string[] = [];
      for (let i = 0; i < content.length; i += chunkSize) {
        chunksList.push(content.substring(i, i + chunkSize));
      }

      setExtractedChunks(chunksList);
      setParsedGraphsCache([]);
      setFailedChunkIndex(null);
      setParseErrorDetail("");

      // Proceed to the core loop
      const ok = await runParsingLoop(chunksList, [], 0, ctrl);
      if (!ok) return;

    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('abort') || err.message?.includes('aborted')) {
        console.log("Dựng cây kiến thức đã bị hủy.");
        return;
      }
      toast.error("Lỗi khi dựng cây kiến thức: " + err.message);
    } finally {
      setLoading(false);
      setAbortController(null);
    }
  };

  const runParsingLoop = async (chunksList: string[], initialParsed: any[], startIdx: number, ctrl: AbortController) => {
    const parsedGraphsList = [...initialParsed];

    for (let idx = startIdx; idx < chunksList.length; idx++) {
      setLoadingMessage(`Đang phân tích và bóc tách nội dung đoạn ${idx + 1}/${chunksList.length}...`);

      try {
        const chunkRes = await apiFetch("/subjects/parse-chunk", {
          method: "POST",
          body: JSON.stringify({ chunk: chunksList[idx] }),
          signal: ctrl.signal,
        });

        if (chunkRes.graph) {
          parsedGraphsList.push(chunkRes.graph);
          setParsedGraphsCache([...parsedGraphsList]);
        }
      } catch (chunkErr: any) {
        setFailedChunkIndex(idx);
        setParseErrorDetail(chunkErr.message || "Lỗi cạn kiệt hạn ngạch API hoặc gián đoạn mạng.");
        return false;
      }

      // Delay to prevent 429 rate limit (15 seconds), except for the last chunk
      if (idx < chunksList.length - 1) {
        let secondsLeft = 15;
        while (secondsLeft > 0) {
          setLoadingMessage(`Đoạn ${idx + 1}/${chunksList.length} hoàn tất. Đợi giãn cách tránh quá tải API: ${secondsLeft}s...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          secondsLeft--;
          if (ctrl.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
        }
      }
    }

    if (parsedGraphsList.length === 0) {
      throw new Error("Không có đoạn nào được bóc tách thành công.");
    }

    // 3. Merge & Deduplicate nodes/edges locally
    setLoadingMessage("Đang tiến hành gom nhóm, khử trùng lặp và liên kết các chủ đề...");
    const mergedNodesMap: Record<string, any> = {};
    const mergedEdges: any[] = [];

    parsedGraphsList.forEach((pg) => {
      if (pg.nodes) {
        pg.nodes.forEach((n: any) => {
          if (n.name && !mergedNodesMap[n.name]) {
            mergedNodesMap[n.name] = n;
          }
        });
      }
      if (pg.edges) {
        pg.edges.forEach((e: any) => {
          if (e.sourceNodeName && e.targetNodeName) {
            const dup = mergedEdges.some(
              (me) =>
                me.sourceNodeName === e.sourceNodeName &&
                me.targetNodeName === e.targetNodeName
            );
            if (!dup) {
              mergedEdges.push(e);
            }
          }
        });
      }
    });

    const finalGraph = {
      nodes: Object.values(mergedNodesMap),
      edges: mergedEdges,
    };

    // 4. Calculate Diff
    const nodeIdToName = (id: string) => {
      const found = nodes.find((n) => n.id === id);
      return found ? found.name : "";
    };

    const newNodes = finalGraph.nodes.filter(
      (fn: any) => !nodes.some((n) => n.name.toLowerCase() === fn.name.toLowerCase())
    );

    const suggestedEdges = finalGraph.edges.filter((fe: any) => {
      const alreadyExists = edges.some((e) => {
        const srcName = nodeIdToName(e.sourceId);
        const tgtName = nodeIdToName(e.targetId);
        return (
          srcName.toLowerCase() === fe.sourceNodeName.toLowerCase() &&
          tgtName.toLowerCase() === fe.targetNodeName.toLowerCase()
        );
      });
      return !alreadyExists;
    });

    if (newNodes.length === 0 && suggestedEdges.length === 0) {
      toast.success("Đồ thị nạp trùng khớp hoàn toàn với sơ đồ hiện tại. Không có thay đổi nào cần duyệt.");
      setExtractedChunks([]);
      setParsedGraphsCache([]);
      setFailedChunkIndex(null);
      setParseErrorDetail("");
      return true;
    }

    setPendingDiff({ newNodes, suggestedEdges });
    toast.success("Phân tích tài liệu hoàn tất! Vui lòng duyệt các thay đổi xuất hiện.");
    setExtractedChunks([]);
    setParsedGraphsCache([]);
    setFailedChunkIndex(null);
    setParseErrorDetail("");
    loadTreeData();
    return true;
  };

  const handleResumeParseGraph = async (e: any) => {
    if (failedChunkIndex === null) return;
    const ctrl = new AbortController();
    setLoading(true);
    setAbortController(ctrl);
    const resumeIndex = failedChunkIndex;
    setFailedChunkIndex(null);
    setParseErrorDetail("");

    try {
      const ok = await runParsingLoop(extractedChunks, parsedGraphsCache, resumeIndex, ctrl);
      if (!ok) return;
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('abort') || err.message?.includes('aborted')) {
        console.log("Dựng cây kiến thức đã bị hủy.");
        return;
      }
    } finally {
      setLoading(false);
      setAbortController(null);
    }
  };

  const handleApplyDiff = async (approvedNodes: any[], approvedEdges: any[], asDraft: boolean = false) => {
    setLoading(true);
    setLoadingMessage("Đang tích hợp các thay đổi vào sơ đồ cây...");
    try {
      const nameToIdMap: Record<string, string> = {};
      nodes.forEach((n) => {
        nameToIdMap[n.name.toLowerCase()] = n.id;
      });

      for (const node of approvedNodes) {
        const res = await apiFetch(`/subjects/${encodeURIComponent(selectedSubject)}/nodes`, {
          method: "POST",
          body: JSON.stringify({
            name: node.name,
            theory: node.theory || "Chưa có lý thuyết",
            topicGroup: node.topicGroup || "Chủ đề chung",
            isRoot: node.isRoot || false,
            status: "active",
          }),
        });
        if (res && (res as any).id) {
          nameToIdMap[node.name.toLowerCase()] = (res as any).id;
        }
      }

      for (const edge of approvedEdges) {
        const srcId = nameToIdMap[edge.sourceNodeName.toLowerCase()];
        const tgtId = nameToIdMap[edge.targetNodeName.toLowerCase()];
        if (srcId && tgtId) {
          await apiFetch(`/subjects/${encodeURIComponent(selectedSubject)}/edges`, {
            method: "POST",
            body: JSON.stringify({
              sourceId: srcId,
              targetId: tgtId,
              status: asDraft ? "draft" : "active",
              sourceType: "llm",
            }),
          });
        }
      }

      toast.success("Tích hợp sơ đồ thành công!");
      setPendingDiff(null);
      loadTreeData();
    } catch (err: any) {
      toast.error("Lỗi khi tích hợp sơ đồ: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadNodeQuestions = async (nodeId: string) => {
    try {
      const data = await apiFetch(`/nodes/${nodeId}/questions`);
      setQuestions(data || []);
      setEditingQuestion(null);
    } catch (err) {
      console.error("Failed to load questions:", err);
    }
  };

  const handleStartAddQuestion = () => {
    setEditingQuestion({});
    setQContent("");
    setQOptions(["", "", "", ""]);
    setQCorrect(0);
    setQDifficulty("medium");
    setQQuestionType("multiple_choice");
    setQGradeLevel("");
    setQRubrics([]);
    setQDistractors({});
    if (nodes.length > 0) {
      setEditingNode(nodes[0]);
    } else {
      setEditingNode(null);
    }
  };

  const handleStartEditQuestion = (q: Question) => {
    setEditingQuestion(q);
    setQContent(q.content);
    let opts: string[] = ["", "", "", ""];
    try {
      opts = JSON.parse(q.optionsJson);
    } catch (e) { }
    setQOptions(opts);
    setQCorrect(q.correctOption);
    setQDifficulty(q.difficulty);
    setQQuestionType(q.questionType || "multiple_choice");
    setQGradeLevel(q.gradeLevel || "");
    setQRubrics(
      (q.rubricItems || []).map((item) => ({
        id: item.id,
        content: item.content,
        points: item.points,
      })),
    );
    try {
      setQDistractors(JSON.parse((q as any).distractorMappings || "{}"));
    } catch (e) {
      setQDistractors({});
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNode || !editingQuestion) return;

    if (!qContent.trim()) {
      toast.warning("Nội dung câu hỏi không được để trống!");
      return;
    }

    if (
      qQuestionType === "essay" &&
      qRubrics.some(
        (rubric) =>
          !rubric.content.trim() ||
          !Number.isFinite(Number(rubric.points)) ||
          Number(rubric.points) <= 0,
      )
    ) {
      toast.warning("Mỗi ý barem cần có nội dung và số điểm lớn hơn 0.");
      return;
    }

    const payload = {
      nodeId: editingNode.id,
      content: qContent.trim(),
      options: qQuestionType === "multiple_choice" ? qOptions : [],
      correctOption: qCorrect,
      difficulty: qDifficulty,
      questionType: qQuestionType,
      gradeLevel: qGradeLevel.trim(),
      distractorMappings: JSON.stringify(qDistractors),
    };

    setLoading(true);
    try {
      let savedQuestion: Question;
      if (editingQuestion.id) {
        savedQuestion = await apiFetch(
          `/teacher/question-bank/questions/${editingQuestion.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );
      } else {
        savedQuestion = await apiFetch(`/teacher/question-bank/questions`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      if (qQuestionType === "essay") {
        const originalRubricIds = new Set(
          (editingQuestion.rubricItems || []).map((item) => item.id),
        );
        const retainedRubricIds = new Set(
          qRubrics.flatMap((item) => (item.id ? [item.id] : [])),
        );
        for (const rubricId of originalRubricIds) {
          if (!retainedRubricIds.has(rubricId)) {
            await apiFetch(
              `/teacher/question-bank/questions/${savedQuestion.id}/rubric-items/${rubricId}`,
              { method: "DELETE" },
            );
          }
        }
        for (const rubric of qRubrics) {
          const rubricPayload = {
            content: rubric.content.trim(),
            points: rubric.points,
          };
          if (rubric.id) {
            await apiFetch(
              `/teacher/question-bank/questions/${savedQuestion.id}/rubric-items/${rubric.id}`,
              { method: "PATCH", body: JSON.stringify(rubricPayload) },
            );
          } else {
            await apiFetch(
              `/teacher/question-bank/questions/${savedQuestion.id}/rubric-items`,
              { method: "POST", body: JSON.stringify(rubricPayload) },
            );
          }
        }
      }
      toast.success("Lưu câu hỏi thành công!");
      loadNodeQuestions(editingNode.id);
      loadSubjectQuestions();
    } catch (err: any) {
      toast.error("Lỗi khi lưu câu hỏi: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    setConfirmModalState({
      open: true,
      title: "Xóa câu hỏi",
      message: "Bạn có chắc chắn muốn xóa câu hỏi này khỏi ngân hàng?",
      onConfirm: async () => {
        setLoading(true);
        try {
          await apiFetch(`/teacher/question-bank/questions/${qId}`, {
            method: "DELETE",
          });
          toast.success("Xóa câu hỏi thành công!");
          if (editingNode) loadNodeQuestions(editingNode.id);
          loadSubjectQuestions();
        } catch (err: any) {
          toast.error("Lỗi khi xóa câu hỏi: " + err.message);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleSaveNodeName = async (name: string) => {
    if (!editingNode || !name.trim()) return;
    try {
      await apiFetch(`/subjects/nodes/${editingNode.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: name.trim() }),
      });
      setNodes((prev) =>
        prev.map((n) => (n.id === editingNode.id ? { ...n, name: name.trim() } : n))
      );
    } catch (err) {
      console.error("Failed to update node name:", err);
    }
  };

  const startResize = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startWidth = drawerWidth;
    const startX = mouseDownEvent.clientX;

    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const deltaX = mouseMoveEvent.clientX - startX;
      // Constraint width between 300px and 850px
      const newWidth = Math.max(300, Math.min(850, startWidth - deltaX));
      setDrawerWidth(newWidth);
    };

    const stopDrag = () => {
      document.removeEventListener("mousemove", doDrag);
      document.removeEventListener("mouseup", stopDrag);
    };

    document.addEventListener("mousemove", doDrag);
    document.addEventListener("mouseup", stopDrag);
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push("/");
  };

  return (
    <div className="flex h-screen bg-background font-[var(--font-body)] text-foreground overflow-hidden relative">
      {/* Sidebar */}
      <aside className={`border-r border-border bg-card flex flex-col z-10 shadow-sm transition-all duration-300 ${isSidebarCollapsed ? "w-0 overflow-hidden opacity-0 border-r-0" : "w-80"
        }`}>
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--mint)] animate-pulse" />
            <span className="font-[var(--font-display)] font-extrabold text-foreground tracking-tight text-lg uppercase">Teacher Hub</span>
          </div>
          <button
            onClick={() => setIsSidebarCollapsed(true)}
            className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer active:scale-95 flex items-center justify-center"
            title="Thu gọn sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* Subject Selection inside Sidebar */}
        {subjects.length > 0 && (
          <div className="p-5 border-b border-border bg-muted/40 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest">Môn Học</label>
              {selectedSubject && (
                <button
                  onClick={() => setSelectedSubject("")}
                  title="Quay lại bảng chọn môn học"
                  className="text-[10px] font-black text-[var(--mint)] hover:underline flex items-center gap-1 cursor-pointer font-bold"
                >
                  <GraduationCap size={13} /> Bảng môn học
                </button>
              )}
            </div>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full rounded-xl bg-card border border-border px-3 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--mint)] font-bold text-foreground shadow-sm"
            >
              <option value="">-- Chọn môn học --</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tab Selection */}
        <div className="p-4 space-y-1.5 flex-1 overflow-y-auto">
          <button
            onClick={() => {
              setSelectedSubject("");
              setActiveTab("graph-designer");
              setSelectedStudent(null);
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${!selectedSubject && activeTab === "graph-designer"
                ? "bg-foreground border-foreground text-background shadow-md"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
          >
            <BookOpen size={16} /> Quản lý Môn học
          </button>

          <button
            onClick={() => {
              setActiveTab("student-mgmt");
              setSelectedStudent(null);
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${activeTab === "student-mgmt"
                ? "bg-foreground border-foreground text-background shadow-md"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
          >
            <Users size={16} /> 0. Quản lý Lớp & Học sinh
          </button>

          <button
            onClick={() => {
              setActiveTab("exam-builder");
              setSelectedStudent(null);
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${activeTab === "exam-builder"
                ? "bg-foreground border-foreground text-background shadow-md"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
          >
            <FilePenLine size={16} /> Tạo đề kiểm tra
          </button>

          <button
            onClick={() => {
              setActiveTab("exam-scoring");
              setSelectedStudent(null);
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${activeTab === "exam-scoring"
                ? "bg-foreground border-foreground text-background shadow-md"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
          >
            <ClipboardCheck size={16} /> Chấm bài kiểm tra
          </button>

          <div className="border-t border-border/60 my-2" />
          {selectedSubject ? (
            <>
              <button
                onClick={() => {
                  setActiveTab("graph-designer");
                  setSelectedStudent(null);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${activeTab === "graph-designer"
                    ? "bg-foreground border-foreground text-background shadow-md"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
              >
                <GitBranch size={16} /> 1. Thiết kế Cây Kiến thức
              </button>
              <button
                onClick={() => {
                  setActiveTab("question-bank");
                  setSelectedStudent(null);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${activeTab === "question-bank"
                    ? "bg-foreground border-foreground text-background shadow-md"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
              >
                <Database size={16} /> 2. Ngân hàng Câu hỏi
              </button>
              <button
                onClick={() => {
                  setActiveTab("students");
                  setSelectedStudent(null);
                }}
                className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${activeTab === "students"
                    ? "bg-foreground border-foreground text-background shadow-md"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
              >
                <Users size={16} /> 3. Báo cáo Tiến độ Học sinh
                {hasInterventions && activeTab !== "students" && (
                  <span className="absolute right-3 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setActiveTab("learning-path");
                  setSelectedStudent(null);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${activeTab === "learning-path"
                    ? "bg-foreground border-foreground text-background shadow-md"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
              >
                <ListTodo size={16} /> 4. Lập lộ trình cá nhân
              </button>
              <button
                onClick={() => {
                  setActiveTab("monitoring");
                  setSelectedStudent(null);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${activeTab === "monitoring"
                    ? "bg-foreground border-foreground text-background shadow-md"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
              >
                <TrendingUp size={16} /> 5. Giám sát Lớp học
              </button>
            </>
          ) : (
            <div className="text-center py-8 px-4 border border-dashed border-border rounded-2xl text-muted-foreground text-[10px] font-black uppercase tracking-wider">
              Chọn môn học để bắt đầu
            </div>
          )}
        </div>

        {/* Profile Card */}
        <div className="p-4 border-t border-border bg-card flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center font-black text-sm shadow-sm">
              {userName[0]}
            </div>
            <div className="truncate max-w-[120px]">
              <div className="text-sm font-black text-foreground truncate">{userName}</div>
              <div className="text-[10px] text-muted-foreground">Giáo viên</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-destructive hover:text-destructive/80 font-extrabold transition-all"
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Panel Workspace */}
      <main className="flex-1 flex flex-col p-6 overflow-hidden bg-background relative">
        {!selectedSubject && activeTab !== "student-mgmt" && activeTab !== "exam-builder" && activeTab !== "exam-scoring" ? (
          // Subject Selection Screen Dashboard
          <div className="flex-1 flex flex-col justify-center items-center max-w-6xl mx-auto w-full py-12 px-4 overflow-y-auto">
            {isSidebarCollapsed && (
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="absolute top-6 left-6 p-2 border border-border bg-card text-muted-foreground hover:text-foreground rounded-xl flex items-center justify-center cursor-pointer shadow-sm active:scale-95 transition-all z-20"
                title="Mở rộng sidebar"
              >
                <ChevronRight size={16} />
              </button>
            )}
            <div className="text-center mb-10">
              <span className="px-3 py-1 bg-[var(--mint)]/10 text-[var(--mint)] text-[10px] font-black uppercase tracking-widest rounded-full">
                Hệ thống Socratic Tutor
              </span>
              <h1 className="text-3xl font-[var(--font-display)] font-extrabold text-foreground mt-3 tracking-tight">
                Chào thầy/cô, {userName}
              </h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">
                Vui lòng chọn môn học đang giảng dạy hoặc tạo môn học mới để bắt đầu thiết kế lộ trình và theo dõi tiến độ của học sinh.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full mt-2">
              {subjects.map((sub) => (
                <div
                  key={sub}
                  onClick={() => setSelectedSubject(sub)}
                  className="group relative bg-card border border-border hover:border-[var(--mint)] rounded-3xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between min-h-[160px] cursor-pointer hover:-translate-y-1"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-3 bg-muted rounded-2xl text-[var(--mint)] group-hover:bg-[var(--mint)]/10 transition-colors">
                      <BookOpen size={24} />
                    </div>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameSubjectFor(sub);
                        }}
                        title="Đổi tên môn học"
                        className="p-1.5 hover:bg-border rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSubjectFor(sub);
                        }}
                        title="Xóa môn học"
                        className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-base font-extrabold text-foreground tracking-tight group-hover:text-[var(--mint)] transition-colors">
                      {sub}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Nhấp để xem sơ đồ cây lộ trình và quản lý học sinh
                    </p>
                  </div>
                </div>
              ))}

              {/* Add Subject Card */}
              <div
                onClick={handleCreateSubject}
                className="group border border-dashed border-border hover:border-[var(--mint)] bg-card/40 hover:bg-card rounded-3xl p-6 transition-all duration-300 flex flex-col justify-center items-center text-center min-h-[160px] cursor-pointer hover:-translate-y-1"
              >
                <div className="p-3 bg-muted group-hover:bg-[var(--mint)]/10 text-muted-foreground group-hover:text-[var(--mint)] rounded-full transition-colors mb-3">
                  <Plus size={24} />
                </div>
                <span className="text-sm font-extrabold text-foreground group-hover:text-[var(--mint)] transition-colors">
                  Tạo môn học mới
                </span>
                <span className="text-[10px] text-muted-foreground mt-1">
                  Nhập tên môn học và khởi tạo sơ đồ cây
                </span>
              </div>
            </div>
          </div>
        ) : selectedStudent ? (
          // Student Path Viewer Subpanel
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isSidebarCollapsed && (
                  <button
                    onClick={() => setIsSidebarCollapsed(false)}
                    className="p-2 border border-border bg-card text-muted-foreground hover:text-foreground rounded-xl flex items-center justify-center cursor-pointer shadow-sm active:scale-95 transition-all mr-1"
                    title="Mở rộng sidebar"
                  >
                    <ChevronRight size={16} />
                  </button>
                )}
                <button
                  onClick={handleBackToStudents}
                  className="p-2 bg-card border border-border rounded-xl text-muted-foreground hover:bg-muted active:scale-95 transition-all shadow-sm cursor-pointer flex items-center gap-1.5 text-xs font-bold font-mono"
                >
                  <ArrowLeft size={16} /> Quay lại
                </button>
                <button
                  onClick={handleReDiagnostic}
                  className="p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-black shadow-sm transition-all hover:bg-rose-100 flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Yêu cầu học sinh làm lại chẩn đoán năng lực"
                >
                  <RefreshCw size={12} /> Yêu cầu chẩn đoán lại
                </button>
                <div>
                  <h1 className="text-lg font-[var(--font-display)] font-extrabold text-foreground">
                    Bản đồ tiến trình của: <span className="text-[var(--mint)] font-black">{selectedStudent.studentName}</span>
                  </h1>
                  <div className="flex gap-4 mt-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Mail size={12} /> {selectedStudent.studentEmail}</span>
                    <span className="flex items-center gap-1"><Calendar size={12} /> Môn học: {selectedStudent.subject}</span>
                  </div>
                </div>
              </div>

              {/* View Mode Toggle & Legend */}
              <div className="flex items-center gap-3">
                <div className="flex bg-muted border border-border rounded-xl p-0.5 shadow-sm">
                  <button
                    onClick={() => setStudentViewMode("tree")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      studentViewMode === "tree"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Bản đồ cây
                  </button>
                  <button
                    onClick={() => setStudentViewMode("matrix")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      studentViewMode === "matrix"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Ma trận theo dõi
                  </button>
                </div>

                {studentViewMode === "tree" && (
                  <div className="flex gap-2.5 bg-card px-3 py-1.5 border border-border rounded-xl text-[9px] font-black tracking-wide text-muted-foreground shadow-sm">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Bắt đầu</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> Vị trí hiện tại</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Đã vượt qua</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Lỗ hổng (Sai/Không làm được)</span>
                  </div>
                )}
              </div>
            </div>

            {studentViewMode === "tree" ? (
              nodes.length > 0 ? (
                <StudentMasteryProfile
                  studentId={selectedStudent.studentId}
                  subject={selectedStudent.subject}
                  nodes={nodes}
                  edges={edges}
                  studentNodeStatus={studentNodeStatus}
                  nodeAccuracy={studentDetail?.nodeAccuracy}
                  initialNodeId={studentDetail?.state?.initialLevelNodeId}
                  currentNodeId={studentDetail?.state?.currentLevelNodeId}
                  activityContent={<StudentActivityFeed logs={studentDetail?.logs || []} />}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center rounded-3xl border border-border bg-card text-muted-foreground">
                  Đang tải sơ đồ...
                </div>
              )
            ) : (
              <div className="flex-1 flex gap-5 overflow-hidden">
                <StudentMasteryMatrix
                  nodes={nodes}
                  studentDetail={studentDetail}
                  subject={selectedStudent.subject}
                />
                <div className="w-[380px] bg-card border border-border rounded-3xl p-5 overflow-hidden shadow-sm">
                  <StudentActivityFeed logs={studentDetail?.logs || []} />
                </div>
              </div>
            )}
          </div>
        ) : (
          // Tabs Content
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Subject Selector Header */}
            <div className="mb-5 flex justify-between items-center bg-card p-5 rounded-3xl border border-border shadow-sm">
              <div className="flex items-center gap-3">
                {isSidebarCollapsed && (
                  <button
                    onClick={() => setIsSidebarCollapsed(false)}
                    className="p-2 border border-border bg-card text-muted-foreground hover:text-foreground rounded-xl flex items-center justify-center cursor-pointer shadow-sm active:scale-95 transition-all mr-1"
                    title="Mở rộng sidebar"
                  >
                    <ChevronRight size={16} />
                  </button>
                )}
                <div>
                  <h1 className="text-lg font-[var(--font-display)] font-extrabold text-foreground uppercase tracking-tight">
                    {activeTab === "exam-builder"
                      ? "Tạo đề kiểm tra"
                      : activeTab === "exam-scoring"
                        ? "Chấm bài kiểm tra"
                        : activeTab === "students"
                      ? "Báo cáo tiến độ học tập"
                      : activeTab === "graph-designer"
                        ? "Thiết kế & Biên soạn sơ đồ cây"
                        : activeTab === "learning-path"
                          ? "Lập lộ trình cá nhân hóa"
                          : activeTab === "question-bank"
                            ? "Ngân hàng Câu hỏi"
                            : "Giám sát & Đánh giá lớp học"}
                  </h1>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeTab === "exam-builder"
                      ? "Biên soạn câu hỏi, cân đối điểm và chuẩn bị đề trong một workspace"
                      : activeTab === "exam-scoring"
                        ? "Chấm từng bài, lưu tự động, duyệt điểm và theo dõi lịch sử"
                        : activeTab === "students"
                      ? "Theo dõi hành trình học tập và kết quả của từng học sinh"
                      : activeTab === "graph-designer"
                        ? "Biên soạn các nút lý thuyết, liên kết mối quan hệ tiên quyết"
                        : activeTab === "learning-path"
                          ? "Phân tích lỗ hổng gốc rễ và tự động đề xuất lộ trình phụ đạo"
                          : activeTab === "question-bank"
                            ? "Quản lý câu hỏi trắc nghiệm, hỗ trợ nhập nhanh từ file Excel"
                            : "Trực quan hóa phân bố năng lực và khoanh vùng học sinh đi lệch hướng"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                 {activeTab === "graph-designer" && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleImportMockTree}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 border ${
                        nodes.length <= 1
                          ? "bg-violet-600 text-white border-violet-500 shadow-violet-200 animate-bounce"
                          : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200"
                      }`}
                      title="Nạp nhanh sơ đồ cây mẫu hoàn chỉnh để thử nghiệm"
                    >
                      <Sparkles size={14} className={nodes.length <= 1 ? "text-white animate-spin" : "text-indigo-600"} /> Nạp Cây Mẫu Nhanh
                    </button>

                    <button
                      type="button"
                      onClick={handleExportTreeJson}
                      className="px-3.5 py-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Xuất sơ đồ cây hiện tại thành file JSON"
                    >
                      <Download size={14} /> Xuất JSON
                    </button>

                    <label className={`px-4 py-2 text-foreground rounded-xl text-xs font-black transition-all shadow-[var(--shadow-card)] flex items-center gap-1.5 cursor-pointer ${
                      nodes.length === 0
                        ? "bg-[var(--mint)] animate-pulse-glow border border-[var(--mint)]"
                        : "bg-[var(--mint)] hover:brightness-95 active:scale-95"
                    }`}>
                      <Upload size={14} /> Dựng cây từ tài liệu
                      <input
                        type="file"
                        accept=".md,.txt,.pdf,.docx"
                        onChange={handleAutoParseGraph}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
                <QuickRoleSwitcher />
              </div>
            </div>

            {(() => {
              if (!selectedSubject) return null;

              let stepKey = "";
              let stepTitle = "";
              let stepDesc = "";
              let actionLabel = "";
              let targetTab: ActiveTab | null = null;

              if (nodes.length === 0) {
                stepKey = "step1";
                stepTitle = "Bước 1: Khởi tạo Cây kiến thức";
                stepDesc = "Cây kiến thức môn học hiện đang trống. Thầy/cô vui lòng nạp nhanh cây mẫu hoặc tải tài liệu lên để hệ thống tự động trích xuất.";
                actionLabel = "Mở Thiết kế sơ đồ cây";
                targetTab = "graph-designer";
              } else if (subjectQuestions.length === 0) {
                stepKey = "step2";
                stepTitle = "Bước 2: Nạp ngân hàng câu hỏi";
                stepDesc = "Cây kiến thức đã sẵn sàng! Thầy/cô hãy nạp ngân hàng câu hỏi mẫu nhanh (hoặc upload từ Excel) để chuẩn bị cho việc tạo đề.";
                actionLabel = "Đi tới Ngân hàng Câu hỏi ➔";
                targetTab = "question-bank";
              } else if (examsCount === 0) {
                stepKey = "step3";
                stepTitle = "Bước 3: Tạo đề thi tổng quan";
                stepDesc = "Đã có câu hỏi! Tiếp theo, thầy/cô hãy tạo đề thi tổng quan để phục vụ đánh giá trình độ ban đầu của học sinh.";
                actionLabel = "Đi tới Tạo đề Kiểm tra ➔";
                targetTab = "exam-builder";
              } else if (!hasActiveExam) {
                stepKey = "step3_publish";
                stepTitle = "Bước 3.5: Xuất bản đề kiểm tra";
                stepDesc = "Thầy/cô đã tạo đề kiểm tra nhưng chưa xuất bản. Hãy chuyển trạng thái đề thi sang 'Chuẩn bị thi' hoặc 'Xuất bản' để học sinh có thể truy cập.";
                actionLabel = "Đi tới Thiết kế Đề thi ➔";
                targetTab = "exam-builder";
              } else if (studentsProgress.length === 0) {
                stepKey = "step4";
                stepTitle = "Bước 4: Quản lý học sinh & lớp học";
                stepDesc = "Đề thi tổng quan đã được xuất bản! Thầy/cô hãy tạo tài khoản cho học sinh (hoặc thêm nhanh học sinh Demo) để họ làm bài.";
                actionLabel = "Đi tới Quản lý học sinh ➔";
                targetTab = "student-mgmt";
              } else {
                stepKey = "step5";
                stepTitle = "Bước 5: Học sinh làm bài kiểm tra";
                stepDesc = "Mọi thiết lập đã hoàn tất! Hãy hướng dẫn học sinh đăng nhập bằng tài khoản của họ và làm bài kiểm tra tổng quan để mở khóa tính năng tự ôn tập.";
              }

              if (dismissedSteps[stepKey]) return null;

              return (
                <div className="mb-5 bg-gradient-to-br from-indigo-50 to-violet-50/50 border border-indigo-150 p-4.5 rounded-3xl flex items-start justify-between gap-4 shadow-sm animate-[fadeIn_0.3s_ease-out]">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-bold text-sm shrink-0">
                      💡
                    </div>
                    <div className="text-xs text-slate-800 leading-relaxed font-semibold">
                      <span className="font-black text-indigo-700 uppercase tracking-wider block mb-0.5">{stepTitle}</span>
                      {stepDesc}
                      {actionLabel && targetTab && (
                        <button
                          onClick={() => setActiveTab(targetTab!)}
                          className="mt-2 block bg-indigo-600 hover:bg-indigo-700 text-white font-black px-3.5 py-1.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer text-[10px] uppercase tracking-wide"
                        >
                          {actionLabel}
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => dismissStep(stepKey)}
                    className="text-slate-400 hover:text-slate-650 font-bold text-xs p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                    title="Đóng gợi ý này"
                  >
                    ✕
                  </button>
                </div>
              );
            })()}

            {/* Split logic between Teacher tabs */}
            {activeTab === "student-mgmt" ? (
              <StudentMgmtTab />
            ) : activeTab === "exam-builder" ? (
              <ExamBuilderTab subjects={subjects} />
            ) : activeTab === "exam-scoring" ? (
              <ExamScoringTab />
            ) : activeTab === "students" ? (
              <StudentsProgressTab
                studentsProgress={studentsProgress}
                selectedSubject={selectedSubject}
                onInspectStudent={handleInspectStudent}
              />
            ) : activeTab === "graph-designer" ? (
              // Tab 2: Graph Tree Designer Canvas (Teacher Editor)
              <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                {/* Graph Designer Sub-Tab Switcher Bar */}
                <div className="flex justify-between items-center bg-card p-2 px-3 rounded-2xl border border-border shadow-sm">
                  <div className="flex items-center gap-2 bg-muted/60 p-1 rounded-xl">
                    <button
                      onClick={() => setGraphDesignerSubTab("canvas")}
                      className={`px-3.5 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                        graphDesignerSubTab === "canvas"
                          ? "bg-card text-foreground shadow-sm border border-border"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <GitBranch size={14} /> Sơ đồ Canvas
                    </button>
                    <button
                      onClick={() => {
                        setGraphDesignerSubTab("matrix");
                        loadSubjectQuestions();
                      }}
                      className={`px-3.5 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                        graphDesignerSubTab === "matrix"
                          ? "bg-card text-foreground shadow-sm border border-border"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <BarChart2 size={14} /> Ma trận Bài học & Đề ({nodes.length} bài học)
                    </button>
                  </div>

                  <div className="text-xs text-muted-foreground font-semibold flex items-center gap-2">
                    Môn đang chọn: <strong className="text-foreground">{selectedSubject}</strong> 
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-bold text-[10px]">
                      {nodes.length} Bài | {subjectQuestions.length} Câu hỏi
                    </span>
                  </div>
                </div>

                {/* Sandbox Amber Banner */}
                {isSandboxMode && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 px-4 flex items-center justify-between shadow-sm animate-[fadeIn_0.2s_ease-out]">
                    <div className="flex items-center gap-2.5">
                      <FlaskConical size={16} className="text-amber-600 shrink-0" />
                      <span className="text-xs font-extrabold text-amber-900">
                        Bạn đang ở Chế độ Thử nghiệm Sandbox: Tự do chỉnh sửa sơ đồ cây nháp mà không ảnh hưởng trực tiếp tới học sinh.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          toast.success("Đã áp dụng & lưu đồng loạt các thay đổi sơ đồ cây nháp thành công!");
                          setIsSandboxMode(false);
                        }}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1"
                      >
                        <Check size={12} /> Áp dụng thay đổi Canvas
                      </button>
                      <button
                        onClick={() => {
                          setIsSandboxMode(false);
                          toast.info("Đã hủy bỏ bản nháp Sandbox.");
                        }}
                        className="px-3 py-1.5 border border-amber-300 text-amber-800 hover:bg-amber-100 text-[10px] font-extrabold rounded-xl transition-all cursor-pointer"
                      >
                        Hủy nháp
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex-1 flex gap-5 overflow-hidden">
                  {graphDesignerSubTab === "matrix" ? (
                    /* Matrix Summary View */
                    <div className="flex-1 bg-card border border-border rounded-3xl p-5 overflow-y-auto shadow-sm">
                      <div className="flex justify-between items-center mb-4 pb-3 border-b border-border">
                        <div>
                          <h3 className="text-sm font-black text-foreground uppercase tracking-wider flex items-center gap-2">
                            <BarChart2 size={16} className="text-indigo-600" /> Ma Trận Theo Dõi Bài Học & Ngân Hàng Đề
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5 font-semibold">
                            Theo dõi tổng quan trạng thái lý thuyết RAG và phân bổ số lượng câu hỏi của từng bài học.
                          </p>
                        </div>
                        <span className="text-xs font-black px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                          {nodes.length} Bài học | {subjectQuestions.length} Câu hỏi
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-border text-[10px] font-black text-muted-foreground uppercase tracking-wider bg-muted/40">
                              <th className="py-3 px-4">#</th>
                              <th className="py-3 px-4">Bài Học / Nút Kiến Thức</th>
                              <th className="py-3 px-4">Chủ Đề</th>
                              <th className="py-3 px-4">Trạng Thái Lý Thuyết RAG</th>
                              <th className="py-3 px-4">Số Câu Hỏi Trắc Nghiệm</th>
                              <th className="py-3 px-4">Tiên Quyết</th>
                              <th className="py-3 px-4 text-right">Thao Tác Tác Vụ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border text-xs font-medium">
                            {nodes.map((node, idx) => {
                              const qList = subjectQuestions.filter(q => q.nodeId === node.id);
                              const hasTheory = node.theory && node.theory.trim().length > 0;
                              const parents = edges.filter(e => e.targetId === node.id);
                              const children = edges.filter(e => e.sourceId === node.id);

                              return (
                                <tr key={node.id} className="hover:bg-muted/30 transition-colors">
                                  <td className="py-3 px-4 font-mono text-muted-foreground">{idx + 1}</td>
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-2 font-bold text-foreground">
                                      <BookOpen size={14} className="text-indigo-600 shrink-0" />
                                      <span className="font-black">{node.name}</span>
                                      {node.isRoot && (
                                        <span className="text-[9px] font-black px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full uppercase">
                                          Nút Gốc
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-muted-foreground font-semibold">
                                    {node.topicGroup || "Chủ đề chung"}
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {hasTheory ? (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-black text-[10px]">
                                          <CheckCircle size={12} /> Đã có lý thuyết
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-bold text-[10px]">
                                          <AlertTriangle size={12} /> Chưa có lý thuyết
                                        </span>
                                      )}

                                      {(() => {
                                        const docCount = (node as any).sourceItemIds 
                                          ? (node as any).sourceItemIds.split(',').filter(Boolean).length 
                                          : 0;
                                        return docCount > 0 ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full font-bold text-[10px]">
                                            <FileText size={11} /> {docCount} tài liệu RAG
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium text-[10px]">
                                            Chưa upload file
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    {qList.length > 0 ? (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-black text-[10px]">
                                        <FileText size={12} /> {qList.length} câu hỏi
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-bold text-[10px]">
                                        ⚠ 0 câu hỏi
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-[11px] text-muted-foreground font-mono">
                                    {parents.length} bài trước → {children.length} bài sau
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex justify-end gap-1.5">
                                      <button
                                        onClick={() => {
                                          handleNodeClick(node);
                                          setNodeEditorTab("theory");
                                        }}
                                        className="px-2.5 py-1.5 bg-muted hover:bg-accent text-foreground rounded-lg text-[10px] font-bold transition-all border border-border cursor-pointer"
                                      >
                                        <Pencil size={12} className="inline mr-1" /> Lý thuyết
                                      </button>
                                      <button
                                        onClick={() => {
                                          handleNodeClick(node);
                                          setNodeEditorTab("questions");
                                        }}
                                        className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-black transition-all border border-indigo-200 cursor-pointer"
                                      >
                                        <Plus size={12} className="inline mr-1" /> Câu hỏi ({qList.length})
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    /* SVG canvas Editor */
                    <div className={`flex-1 relative rounded-3xl overflow-hidden bg-card shadow-sm border ${
                      isSandboxMode ? "border-amber-400 ring-2 ring-amber-400/20" : "border-border"
                    }`}>
                    {nodes.length > 0 ? (
                      <KnowledgeTree
                        subject={selectedSubject}
                        nodes={nodes}
                        edges={edges}
                        mode="teacher"
                        onNodeClick={handleNodeClick}
                        focusedNodeId={focusedNodeId}
                        onFocusedNodeChange={handlePivotCenter}
                        onShowContentClick={handleNodeClick}
                        onRefresh={loadTreeData}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center p-8 max-w-md mx-auto">
                        <div className="p-4 bg-[var(--mint)]/10 text-[var(--mint)] rounded-full mb-4 animate-bounce">
                          <Sparkles size={32} />
                        </div>
                        <h3 className="text-sm font-black text-foreground uppercase tracking-wider">Sơ đồ cây môn học đang trống</h3>
                        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                          Hãy tải lên file tài liệu (PDF, Word, TXT) bằng nút <strong className="text-foreground">"Dựng cây từ tài liệu"</strong> nhấp nháy phía trên để AI tự động phân tích và tạo cây kiến thức chuẩn sư phạm!
                        </p>
                      </div>
                    )}
                  </div>
                  )}

                {/* Node configuration Side drawer */}
                {editingNode && (
                  <>
                    {/* Draggable Resizer Bar */}
                    <div
                      onMouseDown={startResize}
                      className="w-1.5 hover:w-2 bg-border/40 hover:bg-[var(--mint)] hover:opacity-100 cursor-col-resize self-stretch transition-all rounded-full flex items-center justify-center group active:bg-[var(--mint)] active:w-2 select-none mx-0.5"
                      title="Kéo để chỉnh kích thước"
                    >
                      <div className="h-8 w-[2px] bg-muted-foreground/30 group-hover:bg-background rounded-full transition-all" />
                    </div>

                    <div
                      style={{ width: `${drawerWidth}px` }}
                      className="bg-card border border-border rounded-3xl p-5 flex flex-col overflow-hidden shadow-sm animate-[slideLeft_0.3s_cubic-bezier(0.16,1,0.3,1)]"
                    >
                      {/* Header */}
                      <div className="flex justify-between items-start pb-4 border-b border-border">
                        <div className="space-y-1 flex-1">
                          <span className="text-[10px] bg-[var(--mint)]/15 text-[var(--mint)] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Đang cấu hình nút
                          </span>
                          <input
                            type="text"
                            defaultValue={editingNode.name}
                            onBlur={(e) => handleSaveNodeName(e.target.value)}
                            className="w-full text-lg font-[var(--font-display)] font-extrabold text-foreground border-b border-transparent focus:border-[var(--mint)] outline-none uppercase py-0.5"
                            title="Click để sửa tên nút"
                          />
                        </div>
                        <button
                          onClick={() => setEditingNode(null)}
                          className="h-7 w-7 rounded-full bg-muted border border-border text-muted-foreground hover:bg-accent flex items-center justify-center text-xs font-bold shadow-sm cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Drawer sub-tabs */}
                      <div className="grid grid-cols-3 border-b border-border bg-card text-center">
                        <button
                          onClick={() => setNodeEditorTab("theory")}
                          className={`py-3 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all border-b-2 ${nodeEditorTab === "theory"
                              ? "border-[var(--mint)] text-[var(--mint)] bg-[var(--mint)]/10"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                          <BookOpen size={14} /> Lý thuyết
                        </button>
                        <button
                          onClick={() => setNodeEditorTab("questions")}
                          className={`py-3 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all border-b-2 ${nodeEditorTab === "questions"
                              ? "border-[var(--mint)] text-[var(--mint)] bg-[var(--mint)]/10"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                          <HelpCircle size={14} /> Câu hỏi
                        </button>
                        <button
                          onClick={() => setNodeEditorTab("history")}
                          className={`py-3 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all border-b-2 ${nodeEditorTab === "history"
                              ? "border-[var(--mint)] text-[var(--mint)] bg-[var(--mint)]/10"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                          <Sparkles size={14} /> Lộ trình
                        </button>
                      </div>

                      {/* Sub-tab panels */}
                      <div className="flex-1 overflow-y-auto pt-4 flex flex-col">
                        {nodeEditorTab === "theory" ? (
                          // Theory & File RAG panel
                          <div className="space-y-5 flex-1 flex flex-col">
                            <div className="space-y-1.5 flex-1 flex flex-col">
                              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Soạn thảo lý thuyết</label>
                              <textarea
                                value={theoryText}
                                onChange={(e) => setTheoryText(e.target.value)}
                                className="w-full flex-1 min-h-[160px] bg-muted border border-border rounded-2xl p-4 text-sm leading-relaxed font-medium focus:bg-card focus:outline-none focus:ring-1 focus:ring-[var(--mint)] shadow-inner"
                                placeholder="Nhập nội dung học tập lý thuyết chi tiết..."
                              />
                            </div>

                            <div className="space-y-2 bg-muted/80 border border-border p-4 rounded-2xl">
                              <label className="text-[10px] font-black text-[var(--mint)] uppercase tracking-widest flex items-center gap-1.5">
                                <Upload size={12} /> Upload Tài liệu nhúng (RAG)
                              </label>
                              <p className="text-[10px] text-muted-foreground leading-normal">Hỗ trợ các file tài liệu dạng văn bản (.txt, .pdf, .docx, .md). Nội dung sẽ tự động được trích xuất và nhúng cho chatbot học sinh hỏi đáp.</p>
                              <input
                                type="file"
                                accept=".txt,.pdf,.docx,.md"
                                onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                                className="w-full text-xs text-muted-foreground file:mr-4 file:py-1.5 file:px-3.5 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-[var(--mint)]/15 file:text-[var(--mint)] hover:file:bg-[var(--mint)]/25 cursor-pointer"
                              />
                              {uploadFile && (
                                <div className="text-[10px] text-[var(--mint)] font-extrabold flex items-center gap-1">
                                  ✓ Đã chọn file: {uploadFile.name}
                                </div>
                              )}
                            </div>

                            <button
                              onClick={handleSaveTheory}
                              className="w-full bg-foreground hover:opacity-90 text-background font-bold text-xs py-3 rounded-xl shadow-[var(--shadow-card)] transition-all cursor-pointer text-center"
                            >
                              Lưu cấu hình lý thuyết
                            </button>
                          </div>
                        ) : nodeEditorTab === "questions" ? (
                          // Questions list panel
                          <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Danh sách câu hỏi</label>
                              {!editingQuestion && (
                                <button
                                  onClick={handleStartAddQuestion}
                                  className="text-[var(--mint)] hover:brightness-90 text-xs font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus size={14} /> Thêm câu hỏi
                                </button>
                              )}
                            </div>

                            {editingQuestion ? (
                              // Add/Edit question Form
                              <form onSubmit={handleSaveQuestion} className="space-y-4 bg-muted border border-border p-4 rounded-2xl animate-[fadeIn_0.2s_ease-out]">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Nội dung câu hỏi</label>
                                  <textarea
                                    value={qContent}
                                    onChange={(e) => setQContent(e.target.value)}
                                    className="w-full bg-card border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--mint)] font-medium"
                                    placeholder="Ví dụ: 1/2 + 1/4 bằng bao nhiêu?"
                                    rows={3}
                                  />
                                </div>

                                {/* Options */}
                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">Các lựa chọn trắc nghiệm</label>
                                  {qOptions.map((opt, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                      <span className="text-sm font-black text-muted-foreground">{String.fromCharCode(65 + idx)}.</span>
                                      <input
                                        type="text"
                                        value={opt}
                                        onChange={(e) => {
                                          const updated = [...qOptions];
                                          updated[idx] = e.target.value;
                                          setQOptions(updated);
                                        }}
                                        className="flex-1 bg-card border border-border rounded-xl px-3 py-1.5 text-sm focus:outline-none font-medium"
                                        placeholder={`Lựa chọn ${String.fromCharCode(65 + idx)}`}
                                      />
                                      <input
                                        type="checkbox"
                                        checked={qCorrect === idx}
                                        onChange={() => setQCorrect(idx)}
                                        className="accent-[var(--mint)] cursor-pointer h-4 w-4"
                                        title="Chọn làm đáp án đúng"
                                      />
                                    </div>
                                  ))}
                                </div>

                                {/* Difficulty */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Độ khó</label>
                                    <select
                                      value={qDifficulty}
                                      onChange={(e) => setQDifficulty(e.target.value)}
                                      className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs focus:outline-none font-bold"
                                    >
                                      <option value="easy">Nhận biết</option>
                                      <option value="medium">Thông hiểu</option>
                                      <option value="hard">Vận dụng</option>
                                      <option value="very_hard">Vận dụng cao</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="flex gap-2 pt-2">
                                  <button
                                    type="submit"
                                    className="flex-1 bg-[var(--mint)] hover:brightness-95 text-foreground font-bold text-xs py-2.5 rounded-xl shadow-sm cursor-pointer"
                                  >
                                    Lưu
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingQuestion(null)}
                                    className="px-4 border border-border bg-card text-foreground hover:bg-muted font-bold text-xs py-2.5 rounded-xl cursor-pointer"
                                  >
                                    Hủy
                                  </button>
                                </div>
                              </form>
                            ) : (
                              // List of questions view
                              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
                                {questions.length > 0 ? (
                                  questions.map((q) => (
                                    <div key={q.id} className="p-3 bg-muted border border-border rounded-xl text-sm space-y-2 flex flex-col justify-between shadow-sm hover:border-[var(--mint)]/50 transition-colors">
                                      <div className="flex justify-between items-start">
                                        <p className="font-bold text-foreground leading-snug flex-1 pr-3">{q.content}</p>
                                        <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border flex-shrink-0 ${
                                          q.difficulty === "easy"
                                            ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                                            : q.difficulty === "medium"
                                            ? "bg-amber-50 border-amber-200 text-amber-600"
                                            : q.difficulty === "hard"
                                            ? "bg-orange-50 border-orange-200 text-orange-600"
                                            : "bg-rose-50 border-rose-200 text-rose-600"
                                        }`}>
                                          {q.difficulty === "easy"
                                            ? "Nhận biết"
                                            : q.difficulty === "medium"
                                            ? "Thông hiểu"
                                            : q.difficulty === "hard"
                                            ? "Vận dụng"
                                            : "Vận dụng cao"}
                                        </span>
                                      </div>
                                      <div className="flex gap-2 border-t border-border pt-2">
                                        <button
                                          onClick={() => handleStartEditQuestion(q)}
                                          className="flex-1 py-1.5 border border-border hover:bg-accent rounded-lg font-bold text-[10px] text-muted-foreground transition-colors cursor-pointer"
                                        >
                                          Sửa
                                        </button>
                                        <button
                                          onClick={() => handleDeleteQuestion(q.id)}
                                          className="px-2.5 border border-destructive/20 hover:bg-destructive/10 text-destructive rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                                        >
                                          <Trash size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-center py-8 text-muted-foreground text-xs font-bold border border-dashed border-border rounded-2xl">
                                    Nút chưa có câu hỏi nào. Hãy thêm để học sinh thực hành!
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          // History Tab
                          <div className="space-y-4 flex-1 flex flex-col">
                            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-4">Lộ trình học đã qua</h3>
                            {navHistory.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Chưa có lịch sử di chuyển.</p>
                            ) : (
                              <div className="relative border-l-2 border-border pl-4 space-y-6 ml-2 mt-4">
                                {navHistory.map((item, idx) => (
                                  <div key={idx} className="relative">
                                    {/* Dot indicator */}
                                    <span className={`absolute -left-[23px] top-1 h-3.5 w-3.5 rounded-full border-2 bg-card flex items-center justify-center transition-all ${item.id === focusedNodeId
                                        ? "border-[var(--purple)] scale-110 shadow-sm"
                                        : "border-border"
                                      }`}>
                                      {item.id === focusedNodeId && <span className="h-1.5 w-1.5 rounded-full bg-[var(--purple)] animate-pulse" />}
                                    </span>

                                    <div className="space-y-1">
                                      <button
                                        onClick={() => handlePivotCenter(item.id)}
                                        className={`text-left text-sm font-bold hover:text-[var(--purple)] transition-colors cursor-pointer ${item.id === focusedNodeId ? "text-[var(--purple)] font-black" : "text-foreground"
                                          }`}
                                      >
                                        {item.name}
                                      </button>
                                      {idx < navHistory.length - 1 && (
                                        <span className="block text-[8px] text-muted-foreground uppercase font-black">➔ Tiên quyết tiếp theo</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            ) : activeTab === "learning-path" ? (
              <LearningPathTab
                nodes={nodes}
                selectedTargetTopics={selectedTargetTopics}
                setSelectedTargetTopics={setSelectedTargetTopics}
                handleGenerateLearningPath={handleGenerateLearningPath}
                generatingPath={generatingPath}
                pathErrorDetail={pathErrorDetail}
                insights={insights}
                draftPaths={draftPaths}
                studentsProgress={studentsProgress}
                handleApproveLearningPath={handleApproveLearningPath}
                approvingPath={approvingPath}
                handleMoveStep={handleMoveStep}
                handleDeleteStep={handleDeleteStep}
              />
            ) : activeTab === "question-bank" ? (
              <QuestionBankTab
                selectedSubject={selectedSubject}
                nodes={nodes}
                subjectQuestions={subjectQuestions}
                qbSearchText={qbSearchText}
                setQbSearchText={setQbSearchText}
                qbFilterNodeId={qbFilterNodeId}
                setQbFilterNodeId={setQbFilterNodeId}
                qbFilterDifficulty={qbFilterDifficulty}
                setQbFilterDifficulty={setQbFilterDifficulty}
                handleStartAddQuestion={handleStartAddQuestion}
                handleDownloadTemplate={handleDownloadTemplate}
                handleExcelImport={handleExcelImport}
                handleMasterBankImport={handleMasterBankImport}
                handleStartEditQuestion={handleStartEditQuestion}
                handleDeleteQuestion={handleDeleteQuestion}
                handleTagQuestion={(question) => setTaggingQuestionId(question.id)}
                setEditingNode={setEditingNode}
                formatDate={formatDate}
                handleLoadDemoQuestions={handleLoadDemoQuestions}
              />
            ) : (
              <MonitoringTab
                nodes={nodes}
                monitoringStats={monitoringStats}
                setActiveTab={setActiveTab}
                setSelectedTargetTopics={setSelectedTargetTopics}
                handleTriggerRemediation={(studentId) => {
                  setActiveTab("learning-path");
                  setSelectedTargetTopics(nodes.map(n => n.id));
                  const st = monitoringStats.find(s => s.studentId === studentId);
                  toast.info(`Đã chọn tất cả chủ đề để phân tích lộ trình phụ đạo cho ${st ? st.studentName : "học sinh"}.`);
                }}
              />
            )}
          </div>
        )}
      </main>
      <QuestionTaggingPanel
        questionId={taggingQuestionId}
        open={taggingQuestionId !== null}
        onOpenChange={(open) => {
          if (!open) setTaggingQuestionId(null);
        }}
      />
      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-foreground/60 backdrop-blur-md flex flex-col items-center justify-center z-50 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-card p-8 rounded-3xl border border-border shadow-2xl flex flex-col items-center gap-4 max-w-sm text-center">
            <Loader2 className="h-10 w-10 text-[var(--mint)] animate-spin" />
            <div className="space-y-1">
              <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide">Đang xử lý</h3>
              <p className="text-xs text-muted-foreground font-semibold leading-relaxed">
                {loadingMessage || "Vui lòng chờ trong giây lát..."}
              </p>
            </div>
            {abortController && (
              <button
                onClick={() => abortController.abort()}
                className="mt-2 px-4 py-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                Hủy tải lên
              </button>
            )}
          </div>
        </div>
      )}

      {/* Manual Question Bank Edit Modal Overlay */}
      {activeTab === "question-bank" && editingQuestion !== null && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm flex items-center justify-center z-50 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-card w-full max-w-lg border border-border shadow-2xl rounded-3xl p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide flex items-center gap-1.5">
                {editingQuestion.id ? (
                  <>
                    <Pencil size={14} className="text-[var(--mint)]" />
                    <span>Hiệu chỉnh câu hỏi thủ công</span>
                  </>
                ) : (
                  <>
                    <Plus size={14} className="text-[var(--mint)]" />
                    <span>Thêm câu hỏi vào ngân hàng</span>
                  </>
                )}
              </h3>
              <button
                onClick={() => {
                  setEditingQuestion(null);
                  setEditingNode(null);
                }}
                className="text-muted-foreground hover:text-foreground text-xs font-black uppercase transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4 overflow-y-auto max-h-[500px] pr-1">
              {/* Topic/Node select dropdown */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  Chủ đề thuộc môn học
                </label>
                <select
                  value={editingNode ? editingNode.id : ""}
                  onChange={(e) => {
                    const found = nodes.find(n => n.id === e.target.value);
                    setEditingNode(found || null);
                  }}
                  required
                  className="w-full rounded-xl bg-white border border-border px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--mint)] font-bold text-foreground"
                >
                  <option value="">-- Chọn chủ đề áp dụng --</option>
                  {nodes.map(n => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    Loại câu hỏi
                  </label>
                  <select
                    value={qQuestionType}
                    onChange={(e) =>
                      setQQuestionType(e.target.value as "multiple_choice" | "essay")
                    }
                    className="w-full rounded-xl bg-white border border-border px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--mint)] font-bold text-foreground"
                  >
                    <option value="multiple_choice">Trắc nghiệm</option>
                    <option value="essay">Tự luận</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    Khối lớp
                  </label>
                  <input
                    value={qGradeLevel}
                    onChange={(e) => setQGradeLevel(e.target.value)}
                    placeholder="Ví dụ: Lớp 5"
                    className="w-full rounded-xl bg-white border border-border px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--mint)] font-semibold text-foreground"
                  />
                </div>
              </div>

              {/* Content text-area */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  Nội dung câu hỏi
                </label>
                <textarea
                  rows={3}
                  value={qContent}
                  onChange={(e) => setQContent(e.target.value)}
                  placeholder="Nhập nội dung câu hỏi trắc nghiệm..."
                  className="w-full rounded-xl bg-white border border-border px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--mint)] font-semibold text-foreground resize-none"
                />
              </div>

              {/* Difficulty & Correct option */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    Mức độ khó
                  </label>
                  <select
                    value={qDifficulty}
                    onChange={(e) => setQDifficulty(e.target.value)}
                    className="w-full rounded-xl bg-white border border-border px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--mint)] font-bold text-foreground"
                  >
                    <option value="easy">Nhận biết</option>
                    <option value="medium">Thông hiểu</option>
                    <option value="hard">Vận dụng</option>
                    <option value="very_hard">Vận dụng cao</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    Đáp án đúng
                  </label>
                  <select
                    value={qCorrect}
                    onChange={(e) => setQCorrect(parseInt(e.target.value))}
                    className="w-full rounded-xl bg-white border border-border px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--mint)] font-bold text-foreground"
                  >
                    <option value={0}>Đáp án A</option>
                    <option value={1}>Đáp án B</option>
                    <option value={2}>Đáp án C</option>
                    <option value={3}>Đáp án D</option>
                  </select>
                </div>
              </div>

              {/* Options A, B, C, D inputs */}
              {qQuestionType === "multiple_choice" ? (
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  Các phương án trả lời
                </label>
                {qOptions.map((opt, oIdx) => {
                  const isCorrect = oIdx === qCorrect;
                  return (
                    <div key={oIdx} className="flex flex-col gap-1 border border-border/30 p-2 rounded-xl bg-slate-50/20">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-400 font-mono w-5">
                          {String.fromCharCode(65 + oIdx)}.
                        </span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const nextOpts = [...qOptions];
                            nextOpts[oIdx] = e.target.value;
                            setQOptions(nextOpts);
                          }}
                          placeholder={`Nội dung phương án ${String.fromCharCode(65 + oIdx)}...`}
                          className="flex-1 rounded-xl bg-white border border-border px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--mint)] font-semibold text-foreground"
                        />
                      </div>
                      
                      {/* Mapping select for incorrect options */}
                      {!isCorrect && (
                        <div className="pl-7 flex items-center gap-2">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Nếu chọn sai, chẩn đoán hổng kiến thức nền tảng tại:</span>
                          <select
                            value={qDistractors[oIdx.toString()] || ""}
                            onChange={(e) => {
                              const nextDists = { ...qDistractors };
                              if (e.target.value) {
                                nextDists[oIdx.toString()] = e.target.value;
                              } else {
                                delete nextDists[oIdx.toString()];
                              }
                              setQDistractors(nextDists);
                            }}
                            className="bg-card border border-border rounded-lg text-[10px] py-1 px-2 font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--mint)]"
                          >
                            <option value="">-- Không ánh xạ (Mặc định) --</option>
                            {nodes.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              ) : (
                <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-800">
                        Barem câu tự luận
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-indigo-700/70">
                        Mỗi ý có thể được gắn topic riêng sau khi lưu.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setQRubrics((current) => [
                          ...current,
                          { content: "", points: "1.00" },
                        ])
                      }
                      className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-[10px] font-black text-indigo-800 hover:bg-indigo-50"
                    >
                      Thêm ý
                    </button>
                  </div>
                  {qRubrics.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-indigo-200 px-3 py-5 text-center text-[10px] font-semibold text-indigo-500">
                      Chưa có ý barem.
                    </p>
                  ) : (
                    qRubrics.map((rubric, index) => (
                      <div
                        key={rubric.id || `new-${index}`}
                        className="grid grid-cols-[1fr_90px_auto] items-center gap-2"
                      >
                        <input
                          value={rubric.content}
                          onChange={(e) =>
                            setQRubrics((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, content: e.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder={`Nội dung ý ${index + 1}`}
                          className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs font-semibold"
                        />
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={rubric.points}
                          onChange={(e) =>
                            setQRubrics((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, points: e.target.value }
                                  : item,
                              ),
                            )
                          }
                          aria-label={`Điểm ý ${index + 1}`}
                          className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setQRubrics((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                          className="rounded-lg px-2 py-2 text-xs font-black text-rose-600 hover:bg-rose-50"
                          aria-label={`Xóa ý ${index + 1}`}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-3 border-t border-border mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingQuestion(null);
                    setEditingNode(null);
                  }}
                  className="px-4 py-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--mint)] hover:brightness-95 active:scale-95 text-foreground text-xs font-black rounded-xl transition-all shadow-[var(--shadow-card)] cursor-pointer"
                >
                  Lưu câu hỏi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resumption / Failure Cache Overlay */}
      {failedChunkIndex !== null && (
        <div className="fixed inset-0 bg-foreground/60 backdrop-blur-md flex flex-col items-center justify-center z-50 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-card p-8 rounded-3xl border border-border shadow-2xl flex flex-col gap-5 max-w-md w-full text-center relative">
            <div className="space-y-1">
              <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide">Lỗi bóc tách tài liệu</h3>
              <p className="text-[11px] text-muted-foreground font-semibold leading-relaxed">
                Đoạn số <span className="text-foreground font-black">{failedChunkIndex + 1}</span> / {extractedChunks.length} gặp lỗi trong quá trình xử lý AI.
              </p>
            </div>

            <div className="p-4 bg-destructive/5 border border-destructive/15 text-left rounded-2xl max-h-[120px] overflow-y-auto">
              <span className="text-[9px] font-black text-destructive uppercase tracking-widest block mb-1">Chi tiết lỗi từ API</span>
              <p className="text-[10px] text-destructive-foreground font-mono leading-relaxed select-text">
                {parseErrorDetail || "Tần suất yêu cầu quá nhanh (Rate Limit) hoặc hết hạn ngạch tài khoản. Vui lòng thử lại sau vài giây."}
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground leading-normal">
              Hệ thống đã lưu cache <span className="text-emerald-500 font-extrabold">{parsedGraphsCache.length} đoạn</span> thành công trước đó. Bạn có muốn thử lại đoạn này không?
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={(e) => handleResumeParseGraph(e)}
                className="flex-1 bg-foreground hover:opacity-90 text-background font-black text-xs py-3.5 rounded-xl shadow-[var(--shadow-card)] transition-all cursor-pointer text-center flex items-center justify-center gap-1.5"
              >
                <RefreshCw size={14} /> Thử lại đoạn {failedChunkIndex + 1}
              </button>
              <button
                onClick={() => {
                  setFailedChunkIndex(null);
                  setParsedGraphsCache([]);
                  setExtractedChunks([]);
                  setParseErrorDetail("");
                }}
                className="px-4 py-3.5 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diff Review Modal/Panel */}
      {pendingDiff && (
        <div className="fixed inset-0 bg-foreground/60 backdrop-blur-md flex flex-col items-center justify-center z-50 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-card p-6 rounded-3xl border border-border shadow-2xl flex flex-col gap-4 max-w-2xl w-full max-h-[85vh] overflow-hidden">
            <div>
              <h3 className="font-[var(--font-display)] font-black text-foreground text-sm uppercase tracking-wider">
                Duyệt Thay Đổi Sơ Đồ Cây Kiến Thức (Diff Review Panel)
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Các thay đổi được phát hiện từ tài liệu so với sơ đồ hiện tại. Chọn các mục muốn tích hợp.
              </p>
            </div>

            <div className="flex-1 overflow-auto flex flex-col gap-4 pr-1">
              {/* New Nodes */}
              {pendingDiff.newNodes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                    <PlusCircle size={14} className="text-emerald-600" /> Chủ đề kiến thức mới ({pendingDiff.newNodes.length})
                  </h4>
                  <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border bg-slate-50/30">
                    {pendingDiff.newNodes.map((n: any, idx: number) => {
                      const isEditing = editingDiffNodeIdx === idx;
                      return (
                        <div key={idx} className="p-3 text-xs flex items-start gap-3 hover:bg-slate-100/40 border-b border-border/40 last:border-0">
                          <input
                            type="checkbox"
                            defaultChecked
                            id={`new-node-${idx}`}
                            className="mt-0.5 rounded border-border text-[var(--mint)] focus:ring-[var(--mint)] shrink-0"
                            data-node-index={idx}
                          />
                          <div className="space-y-1 flex-1">
                            {isEditing ? (
                              <div className="space-y-2 bg-white p-3 border border-indigo-200 rounded-xl shadow-sm animate-[fadeIn_0.2s_ease-out]">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black text-indigo-600 uppercase tracking-wider">Tên Node kiến thức:</label>
                                  <input
                                    type="text"
                                    value={diffEditName}
                                    onChange={(e) => setDiffEditName(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black text-indigo-600 uppercase tracking-wider">Lý thuyết tóm tắt:</label>
                                  <textarea
                                    rows={2}
                                    value={diffEditTheory}
                                    onChange={(e) => setDiffEditTheory(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                </div>
                                <div className="flex gap-2 justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingDiffNodeIdx(null)}
                                    className="px-2.5 py-1 text-[10px] border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-lg"
                                  >
                                    Hủy
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (pendingDiff) {
                                        const updatedNewNodes = [...pendingDiff.newNodes];
                                        updatedNewNodes[idx] = {
                                          ...updatedNewNodes[idx],
                                          name: diffEditName,
                                          theory: diffEditTheory
                                        };
                                        setPendingDiff({ ...pendingDiff, newNodes: updatedNewNodes });
                                      }
                                      setEditingDiffNodeIdx(null);
                                      toast.success(`Đã cập nhật thông tin node "${diffEditName}"!`);
                                    }}
                                    className="px-3 py-1 text-[10px] bg-indigo-600 text-white font-black rounded-lg hover:bg-indigo-700 shadow-sm"
                                  >
                                    Lưu chỉnh sửa
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-0.5 flex-1">
                                  <div className="font-extrabold text-foreground flex items-center gap-2">
                                    <span>{n.name}</span>
                                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.2 rounded-full uppercase">Mới</span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-semibold">
                                    Nhóm: {n.topicGroup || "Chủ đề chung"} | Lý thuyết: {n.theory ? `${n.theory.substring(0, 80)}...` : "Chưa biên soạn"}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDiffNodeIdx(idx);
                                    setDiffEditName(n.name);
                                    setDiffEditTheory(n.theory || "");
                                  }}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                                >
                                  <Pencil size={12} /> Sửa nhanh
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Suggested Edges */}
              {pendingDiff.suggestedEdges.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1.5">
                    <GitCommit size={14} className="text-indigo-600" /> Liên kết tiên quyết đề xuất ({pendingDiff.suggestedEdges.length})
                  </h4>
                  <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border bg-slate-50/30">
                    {pendingDiff.suggestedEdges.map((e: any, idx: number) => (
                      <div key={idx} className="p-3 text-xs flex items-start gap-3 hover:bg-slate-100/40">
                        <input
                          type="checkbox"
                          defaultChecked
                          id={`sug-edge-${idx}`}
                          className="mt-0.5 rounded border-border text-[var(--mint)] focus:ring-[var(--mint)] shrink-0"
                          data-edge-index={idx}
                        />
                        <div className="space-y-0.5">
                          <div className="font-extrabold text-foreground flex items-center gap-2">
                            <span>{e.sourceNodeName}</span>
                            <span className="text-indigo-500 font-black">➔</span>
                            <span>{e.targetNodeName}</span>
                          </div>
                          {e.reason && (
                            <p className="text-[10px] font-semibold text-muted-foreground italic leading-relaxed">
                              Lý do: {e.reason}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-border mt-2">
              <button
                type="button"
                onClick={() => setPendingDiff(null)}
                className="px-4 py-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!pendingDiff) return;
                  // Gather approved nodes/edges by reading checkbox states from DOM
                  const approvedNodes: any[] = [];
                  pendingDiff.newNodes.forEach((n, idx) => {
                    const el = document.getElementById(`new-node-${idx}`) as HTMLInputElement;
                    if (el && el.checked) {
                      approvedNodes.push(n);
                    }
                  });
                  const approvedEdges: any[] = [];
                  pendingDiff.suggestedEdges.forEach((e, idx) => {
                    const el = document.getElementById(`sug-edge-${idx}`) as HTMLInputElement;
                    if (el && el.checked) {
                      approvedEdges.push(e);
                    }
                  });

                  await handleApplyDiff(approvedNodes, approvedEdges, false);
                }}
                className="px-5 py-2.5 bg-[var(--mint)] hover:brightness-95 active:scale-95 text-foreground text-xs font-black rounded-xl transition-all shadow-[var(--shadow-card)] cursor-pointer"
              >
                Chấp nhận tích hợp (Active)
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!pendingDiff) return;
                  const approvedNodes: any[] = [];
                  pendingDiff.newNodes.forEach((n, idx) => {
                    const el = document.getElementById(`new-node-${idx}`) as HTMLInputElement;
                    if (el && el.checked) {
                      approvedNodes.push(n);
                    }
                  });
                  const approvedEdges: any[] = [];
                  pendingDiff.suggestedEdges.forEach((e, idx) => {
                    const el = document.getElementById(`sug-edge-${idx}`) as HTMLInputElement;
                    if (el && el.checked) {
                      approvedEdges.push(e);
                    }
                  });

                  await handleApplyDiff(approvedNodes, approvedEdges, true);
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all shadow-[var(--shadow-card)] cursor-pointer"
              >
                Tích hợp liên kết nháp (Draft)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subject Management Modal (Create / Rename / Delete) */}
      {subjectModal.type !== null && (
        <div className="fixed inset-0 bg-foreground/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-card border border-border shadow-2xl rounded-3xl p-6 max-w-md w-full flex flex-col gap-4 animate-[scaleUp_0.2s_ease-out]">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide flex items-center gap-2">
                {subjectModal.type === "create" ? (
                  <>
                    <BookOpen size={16} className="text-[var(--mint)]" />
                    <span>Tạo Môn Học Mới</span>
                  </>
                ) : subjectModal.type === "rename" ? (
                  <>
                    <Pencil size={16} className="text-indigo-600" />
                    <span>Đổi Tên Môn Học</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} className="text-rose-600" />
                    <span>Xác Nhận Xóa Môn Học</span>
                  </>
                )}
              </h3>
              <button
                onClick={() => setSubjectModal({ type: null })}
                className="h-7 w-7 rounded-full bg-muted hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {subjectModal.type === "delete" ? (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Bạn có chắc chắn muốn xóa vĩnh viễn môn học <strong className="text-foreground font-black">"{subjectModal.targetSubject}"</strong>? Tất cả Nút kiến thức, Liên kết, Câu hỏi và Tiến độ học sinh sẽ bị xóa sạch khỏi hệ thống.
                </p>
                <div className="flex gap-2 justify-end pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setSubjectModal({ type: null })}
                    className="px-4 py-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (subjectModal.targetSubject) submitDeleteSubject(subjectModal.targetSubject);
                      setSubjectModal({ type: null });
                    }}
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash size={14} /> Xóa vĩnh viễn
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = subjectModal.inputValue || "";
                  if (subjectModal.type === "create") {
                    submitCreateSubject(val);
                  } else if (subjectModal.type === "rename" && subjectModal.targetSubject) {
                    submitRenameSubject(subjectModal.targetSubject, val);
                  }
                  setSubjectModal({ type: null });
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    {subjectModal.type === "create" ? "Tên môn học mới" : "Tên môn học hiệu chỉnh"}
                  </label>
                  <input
                    type="text"
                    autoFocus
                    required
                    value={subjectModal.inputValue || ""}
                    onChange={(e) => setSubjectModal({ ...subjectModal, inputValue: e.target.value })}
                    placeholder="Ví dụ: Toán học 10, Vật lý 11, Hóa học Đại cương..."
                    className="w-full bg-muted border border-border rounded-2xl px-4 py-2.5 text-xs font-bold text-foreground focus:bg-card focus:outline-none focus:ring-1 focus:ring-[var(--mint)] transition-all"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setSubjectModal({ type: null })}
                    className="px-4 py-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[var(--mint)] hover:brightness-95 text-foreground text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                  >
                    <Check size={14} /> Xác nhận
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Global Confirmation Dialog for Teacher Actions */}
      {confirmModalState.open && (
        <div className="fixed inset-0 bg-foreground/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-card border border-border shadow-2xl rounded-3xl p-6 max-w-md w-full flex flex-col gap-4 animate-[scaleUp_0.2s_ease-out]">
            <div className="flex items-start gap-3 border-b border-border pb-3">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-2xl shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-foreground text-sm uppercase tracking-wide">
                  {confirmModalState.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {confirmModalState.message}
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalState({ ...confirmModalState, open: false })}
                className="px-4 py-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModalState.onConfirm();
                  setConfirmModalState({ ...confirmModalState, open: false });
                }}
                className="px-5 py-2 bg-[var(--mint)] hover:brightness-95 text-foreground text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <Check size={14} /> Đồng ý thực hiện
              </button>
            </div>
          </div>
        </div>
      )}
      <GuidedTour />
    </div>
  );
}
