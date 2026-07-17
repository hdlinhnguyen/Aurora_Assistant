"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
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
  Loader2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  Check,
  RefreshCw,
  Database,
  TrendingUp,
  BarChart2
} from "lucide-react";

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

interface StudentProgress {
  studentId: string;
  studentName: string;
  studentEmail: string;
  subject: string;
  initialNodeId: string;
  initialNode: string;
  currentNodeId: string;
  currentNode: string;
  updatedAt: string;
}

interface StudentDetailProgress {
  state: {
    initialLevelNodeId: string;
    currentLevelNodeId: string;
  };
  logs: Array<{
    id: string;
    nodeId: string;
    nodeName: string;
    action: string;
    detail: string;
    createdAt: string;
  }>;
  nodeStatus: Record<string, "mastered" | "struggle">;
}

interface Question {
  id: string;
  nodeId: string;
  content: string;
  optionsJson: string;
  correctOption: number;
  difficulty: string;
}

type ActiveTab = "students" | "graph-designer" | "learning-path" | "question-bank" | "monitoring";

export default function TeacherDashboard() {
  const router = useRouter();
  const [userName, setUserName] = useState("Giáo viên");
  const [activeTab, setActiveTab] = useState<ActiveTab>("students");
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
  const [qbSearchText, setQbSearchText] = useState("");
  const [qbFilterNodeId, setQbFilterNodeId] = useState("");
  const [qbFilterDifficulty, setQbFilterDifficulty] = useState("");
  const [monitoringStats, setMonitoringStats] = useState<any[]>([]);
  const [loadingMonitoring, setLoadingMonitoring] = useState(false);
  const [studentNodeStatus, setStudentNodeStatus] = useState<Record<string, "mastered" | "struggle" | "learning" | "locked" | "initial">>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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

    loadSubjects();
    loadStudentsProgress();
  }, [router]);

  const loadSubjectQuestions = async () => {
    if (!selectedSubject) return;
    try {
      const data = await apiFetch(`/subjects/${encodeURIComponent(selectedSubject)}/questions`);
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

  const loadMonitoringData = async () => {
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

  useEffect(() => {
    if (selectedSubject) {
      loadTreeData();
      if (selectedStudent) {
        loadStudentDetailProgress(selectedStudent.studentId);
      }
      loadSubjectQuestions();
      loadMonitoringData();
    }
  }, [selectedSubject]);

  useEffect(() => {
    if (activeTab === "question-bank" && selectedSubject) {
      loadSubjectQuestions();
    }
    if (activeTab === "monitoring" && selectedSubject) {
      loadMonitoringData();
    }
  }, [activeTab, selectedSubject]);

  const loadSubjects = async (selectSubjectName?: string) => {
    try {
      const data = await apiFetch("/subjects");
      setSubjects(data || []);
      if (selectSubjectName && data && data.includes(selectSubjectName)) {
        setSelectedSubject(selectSubjectName);
      } else if (selectedSubject && data && data.includes(selectedSubject)) {
        // Keep currently selected
      } else if (data && data.length > 0) {
        setSelectedSubject(data[0]);
      } else {
        setSelectedSubject("");
      }
    } catch (err) {
      console.error("Failed to load subjects:", err);
    }
  };

  const handleCreateSubject = async () => {
    const name = window.prompt("Nhập tên môn học mới:");
    if (!name) return;
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

  const handleRenameSubjectFor = async (subjectName: string) => {
    const newName = window.prompt(`Nhập tên mới cho môn "${subjectName}":`, subjectName);
    if (!newName) return;
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

  const handleDeleteSubjectFor = async (subjectName: string) => {
    const confirm = window.confirm(
      `CẢNH BÁO: Bạn có chắc chắn muốn XÓA hoàn toàn môn học "${subjectName}"?\n\nHành động này sẽ xóa vĩnh viễn tất cả các Nút kiến thức, Liên kết, Câu hỏi, Tiến độ và Nhật ký hoạt động của học sinh thuộc môn học này!`
    );
    if (!confirm) return;

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

  const handleRenameSubject = () => {
    if (selectedSubject) handleRenameSubjectFor(selectedSubject);
  };

  const handleDeleteSubject = () => {
    if (selectedSubject) handleDeleteSubjectFor(selectedSubject);
  };

  const loadTreeData = async () => {
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
    try {
      const data = await apiFetch("/teacher/students-progress");
      setStudentsProgress(data || []);
    } catch (err) {
      console.error("Failed to load students progress:", err);
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
    if (confirm(`Bạn có chắc chắn muốn yêu cầu học sinh "${selectedStudent.studentName}" thực hiện chẩn đoán lại năng lực cho môn "${selectedStudent.subject}"?\n\nHành động này sẽ xóa nhật ký làm bài trước đó của học sinh đối với môn này để đánh giá lại từ đầu.`)) {
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
    }
  };

  const handleNodeClick = (node: NodeItem) => {
    setEditingNode(node);
    setTheoryText(node.theory || "");
    setUploadFile(null);
    setNodeEditorTab("theory");
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

    const confirmParse = confirm(
      `Bạn có chắc chắn muốn tự động dựng cây kiến thức cho môn "${selectedSubject}" từ tài liệu "${file.name}"?\n\nHành động này sẽ XÓA các nút và liên kết cũ của môn này để vẽ lại sơ đồ mới.`
    );
    if (!confirmParse) return;

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
      e.target.value = "";
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

    // 4. Save tree layout and default questions
    setLoadingMessage("Đang tính toán bố cục phân tầng và lưu sơ đồ cây kiến thức...");
    await apiFetch(`/subjects/${encodeURIComponent(selectedSubject)}/save-tree`, {
      method: "POST",
      body: JSON.stringify(finalGraph),
      signal: ctrl.signal,
    });

    toast.success("Dựng cây kiến thức thành công!");
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
  };

  const handleStartEditQuestion = (q: Question) => {
    setEditingQuestion(q);
    setQContent(q.content);
    let opts: string[] = ["", "", "", ""];
    try {
      opts = JSON.parse(q.optionsJson);
    } catch (e) {}
    setQOptions(opts);
    setQCorrect(q.correctOption);
    setQDifficulty(q.difficulty);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNode || !editingQuestion) return;

    if (!qContent.trim()) {
      toast.warning("Nội dung câu hỏi không được để trống!");
      return;
    }

    const payload = {
      content: qContent.trim(),
      optionsJson: JSON.stringify(qOptions),
      correctOption: qCorrect,
      difficulty: qDifficulty,
    };

    setLoading(true);
    try {
      if (editingQuestion.id) {
        await apiFetch(`/questions/${editingQuestion.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/nodes/${editingNode.id}/questions`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
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
    if (!confirm("Bạn có chắc chắn muốn xóa câu hỏi này?")) return;
    setLoading(true);
    try {
      await apiFetch(`/questions/${qId}`, {
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
      <aside className={`border-r border-border bg-card flex flex-col z-10 shadow-sm transition-all duration-300 ${
        isSidebarCollapsed ? "w-0 overflow-hidden opacity-0 border-r-0" : "w-80"
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
        {selectedSubject && (
          <div className="p-5 border-b border-border bg-muted/40 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest">Môn Học</label>
              <button
                onClick={() => setSelectedSubject("")}
                title="Quay lại bảng chọn môn học"
                className="text-[10px] font-black text-[var(--mint)] hover:underline flex items-center gap-1 cursor-pointer font-bold"
              >
                <GraduationCap size={13} /> Bảng môn học
              </button>
            </div>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full rounded-xl bg-card border border-border px-3 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--mint)] font-bold text-foreground shadow-sm"
            >
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
          {selectedSubject ? (
            <>
              <button
                onClick={() => {
                  setActiveTab("students");
                  setSelectedStudent(null);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${
                  activeTab === "students"
                    ? "bg-foreground border-foreground text-background shadow-md"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Users size={16} /> Báo cáo Tiến độ Học sinh
              </button>
              <button
                onClick={() => {
                  setActiveTab("graph-designer");
                  setSelectedStudent(null);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${
                  activeTab === "graph-designer"
                    ? "bg-foreground border-foreground text-background shadow-md"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <GitBranch size={16} /> Thiết kế Cây Kiến thức
              </button>
              <button
                onClick={() => {
                  setActiveTab("learning-path");
                  setSelectedStudent(null);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${
                  activeTab === "learning-path"
                    ? "bg-foreground border-foreground text-background shadow-md"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <ListTodo size={16} /> Lập lộ trình cá nhân
              </button>
              <button
                onClick={() => {
                  setActiveTab("question-bank");
                  setSelectedStudent(null);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${
                  activeTab === "question-bank"
                    ? "bg-foreground border-foreground text-background shadow-md"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Database size={16} /> Ngân hàng Câu hỏi
              </button>
              <button
                onClick={() => {
                  setActiveTab("monitoring");
                  setSelectedStudent(null);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all border ${
                  activeTab === "monitoring"
                    ? "bg-foreground border-foreground text-background shadow-md"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <TrendingUp size={16} /> Giám sát Lớp học
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
        {!selectedSubject ? (
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

              {/* Path Legend */}
              <div className="flex gap-2.5 bg-card px-3 py-1.5 border border-border rounded-xl text-[9px] font-black tracking-wide text-muted-foreground shadow-sm">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Bắt đầu</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> Vị trí hiện tại</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Đã vượt qua</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Lỗ hổng (Sai/Không làm được)</span>
              </div>
            </div>

            {/* Split layout: Tree + Activity logs */}
            <div className="flex-1 flex gap-5 overflow-hidden">
              {/* SVG Tree Monitor */}
              <div className="flex-1 relative rounded-3xl overflow-hidden bg-card shadow-sm border border-border">
                {nodes.length > 0 ? (
                  <KnowledgeTree
                    subject={selectedStudent.subject}
                    nodes={nodes}
                    edges={edges}
                    mode="view-only"
                    studentNodeStatus={studentNodeStatus}
                    initialNodeId={studentDetail?.state?.initialLevelNodeId}
                    currentNodeId={studentDetail?.state?.currentLevelNodeId}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Đang tải sơ đồ...
                  </div>
                )}
              </div>

              {/* Student Logs */}
              <div className="w-[380px] bg-card border border-border rounded-3xl p-5 flex flex-col overflow-hidden shadow-sm">
                <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-3.5">Log Chi Tiết Hoạt Động</h3>
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {studentDetail && studentDetail.logs && studentDetail.logs.length > 0 ? (
                    studentDetail.logs.map((log) => {
                      const isCorrect = log.action === "answer_correct";
                      const isIncorrect = log.action === "answer_incorrect";
                      const isCantDo = log.action === "click_cant_do";

                      return (
                        <div key={log.id} className="p-3 bg-muted border border-border rounded-2xl text-[11px] leading-relaxed space-y-1 shadow-sm">
                          <div className="flex justify-between items-start">
                            <span className="font-black text-foreground">{log.nodeName}</span>
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                              isCorrect
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                : isIncorrect || isCantDo
                                ? "bg-rose-50 text-rose-600 border border-rose-200"
                                : "bg-blue-50 text-blue-600 border border-blue-200"
                            }`}>
                              {log.action}
                            </span>
                          </div>
                          <p className="text-muted-foreground font-medium">{log.detail}</p>
                          <div className="text-[9px] text-muted-foreground font-semibold">{new Date(log.createdAt).toLocaleString("vi-VN")}</div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-muted-foreground text-xs font-bold border border-dashed border-border rounded-2xl">
                      Chưa ghi nhận hoạt động nào của học sinh.
                    </div>
                  )}
                </div>
              </div>
            </div>
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
                    {activeTab === "students" 
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
                    {activeTab === "students"
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
                    <label className="px-4 py-2 bg-[var(--mint)] hover:brightness-95 active:scale-95 text-foreground rounded-xl text-xs font-black transition-all shadow-[var(--shadow-card)] flex items-center gap-1.5 cursor-pointer">
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
              </div>
            </div>

            {/* Split logic between Teacher tabs */}
            {activeTab === "students" ? (
              // Tab 1: Students progress table list
              <div className="flex-1 bg-card border border-border rounded-3xl p-6 shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground font-black uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-4">Học sinh</th>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Môn Học</th>
                        <th className="py-3 px-4">Level Ban Đầu</th>
                        <th className="py-3 px-4">Level Thực Tế</th>
                        <th className="py-3 px-4">Cập nhật cuối</th>
                        <th className="py-3 px-4 text-center">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-medium text-foreground/80">
                      {studentsProgress.filter(p => p.subject === selectedSubject).map((progress, idx) => (
                        <tr 
                          key={idx} 
                          onClick={() => handleInspectStudent(progress)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer group active:bg-slate-100"
                        >
                          <td className="py-4 px-4 font-black text-slate-900 flex items-center gap-2">
                            <span className="h-6 w-6 rounded-full bg-slate-100 group-hover:bg-indigo-50 flex items-center justify-center text-[10px] text-slate-500 group-hover:text-indigo-600 transition-colors"><User size={12} /></span>
                            {progress.studentName}
                          </td>
                          <td className="py-4 px-4 text-slate-500 font-semibold">{progress.studentEmail}</td>
                          <td className="py-4 px-4"><span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg font-bold border border-slate-200">{progress.subject}</span></td>
                          <td className="py-4 px-4 text-[var(--mint)] font-bold">{progress.initialNode || "Chưa bắt đầu"}</td>
                          <td className="py-4 px-4 text-emerald-600 font-bold">{progress.currentNode || "Chưa bắt đầu"}</td>
                          <td className="py-4 px-4 text-slate-500 font-semibold">{new Date(progress.updatedAt).toLocaleString("vi-VN")}</td>
                          <td className="py-4 px-4 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInspectStudent(progress);
                              }}
                              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black tracking-wide uppercase transition-all shadow-sm cursor-pointer flex items-center gap-1 mx-auto"
                            >
                              <Eye size={12} /> Xem hành trình
                            </button>
                          </td>
                        </tr>
                      ))}
                      {studentsProgress.filter(p => p.subject === selectedSubject).length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-12 text-muted-foreground font-semibold">
                            Chưa có dữ liệu học tập nào của học sinh trong môn học này.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : activeTab === "graph-designer" ? (
              // Tab 2: Graph Tree Designer Canvas (Teacher Editor)
              <div className="flex-1 flex gap-5 overflow-hidden">
                {/* SVG canvas Editor */}
                <div className="flex-1 relative rounded-3xl overflow-hidden bg-card shadow-sm border border-border">
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
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      Đang tải sơ đồ...
                    </div>
                  )}
                </div>

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
                        className={`py-3 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all border-b-2 ${
                          nodeEditorTab === "theory"
                            ? "border-[var(--mint)] text-[var(--mint)] bg-[var(--mint)]/10"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <BookOpen size={14} /> Lý thuyết
                      </button>
                      <button
                        onClick={() => setNodeEditorTab("questions")}
                        className={`py-3 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all border-b-2 ${
                          nodeEditorTab === "questions"
                            ? "border-[var(--mint)] text-[var(--mint)] bg-[var(--mint)]/10"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <HelpCircle size={14} /> Câu hỏi
                      </button>
                      <button
                        onClick={() => setNodeEditorTab("history")}
                        className={`py-3 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all border-b-2 ${
                          nodeEditorTab === "history"
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
                                    <option value="easy">Dễ (Easy)</option>
                                    <option value="medium">Trung bình (Medium)</option>
                                    <option value="hard">Khó (Hard)</option>
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
                                          : q.difficulty === "hard"
                                          ? "bg-rose-50 border-rose-200 text-rose-600"
                                          : "bg-amber-50 border-amber-200 text-amber-600"
                                      }`}>
                                        {q.difficulty}
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
                                  <span className={`absolute -left-[23px] top-1 h-3.5 w-3.5 rounded-full border-2 bg-card flex items-center justify-center transition-all ${
                                    item.id === focusedNodeId 
                                      ? "border-[var(--purple)] scale-110 shadow-sm" 
                                      : "border-border"
                                  }`}>
                                    {item.id === focusedNodeId && <span className="h-1.5 w-1.5 rounded-full bg-[var(--purple)] animate-pulse" />}
                                  </span>
                                  
                                  <div className="space-y-1">
                                    <button
                                      onClick={() => handlePivotCenter(item.id)}
                                      className={`text-left text-sm font-bold hover:text-[var(--purple)] transition-colors cursor-pointer ${
                                        item.id === focusedNodeId ? "text-[var(--purple)] font-black" : "text-foreground"
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
            ) : activeTab === "learning-path" ? (
              // Tab 3: Learning Path & Class Insights Dashboard
              <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 pb-6">
                
                {/* Step 1: Select Target Topics */}
                <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4">
                  <div>
                    <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide">
                      1. Chọn chủ đề kiểm tra mục tiêu
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Chọn các bài học bạn muốn chẩn đoán và lập lộ trình học phụ đạo cho lớp</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[160px] overflow-y-auto p-1">
                    {nodes.map((node) => {
                      const isChecked = selectedTargetTopics.includes(node.id);
                      return (
                        <button
                          key={node.id}
                          onClick={() => {
                            if (isChecked) {
                              setSelectedTargetTopics(prev => prev.filter(id => id !== node.id));
                            } else {
                              setSelectedTargetTopics(prev => [...prev, node.id]);
                            }
                          }}
                          className={`flex items-center gap-3 p-3 rounded-2xl border text-left text-xs font-bold transition-all shadow-sm cursor-pointer ${
                            isChecked
                              ? "bg-foreground border-foreground text-background"
                              : "bg-white border-border text-foreground hover:bg-muted"
                          }`}
                        >
                          <span className={`h-4 w-4 rounded-md border flex items-center justify-center font-bold text-[9px] ${
                            isChecked ? "bg-background border-background text-foreground" : "border-border bg-white"
                          }`}>
                            {isChecked && "✓"}
                          </span>
                          <span className="truncate">{node.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  
                  <div className="flex pt-2 justify-end">
                    <button
                      onClick={handleGenerateLearningPath}
                      disabled={generatingPath || selectedTargetTopics.length === 0}
                      className="px-6 py-3 bg-[var(--mint)] hover:brightness-95 active:scale-95 disabled:opacity-50 text-foreground font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 font-bold"
                    >
                      {generatingPath ? (
                        <>
                          <span className="animate-spin select-none">🔄</span>
                          Đang tính toán...
                        </>
                      ) : (
                        <>
                          <span>⚡</span>
                          Lập lộ trình & Phân tích lớp học
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Calculation Error Detail */}
                {pathErrorDetail && (
                  <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-3xl flex items-start gap-3 shadow-sm animate-[fadeIn_0.2s_ease-out]">
                    <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={16} />
                    <div className="space-y-1">
                      <span className="font-extrabold text-xs">LỖI THIẾT LẬP LỘ TRÌNH</span>
                      <p className="text-[10px] text-rose-700 font-mono leading-relaxed select-text">
                        {pathErrorDetail}
                      </p>
                      <span className="text-[9px] text-rose-500 font-semibold block pt-1">
                        Khuyến nghị: Vui lòng kiểm tra lại cấu trúc cây kiến thức hoặc dữ liệu nộp bài của học sinh.
                      </span>
                    </div>
                  </div>
                )}

                {/* Step 2: Display Results if available */}
                {insights && (
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start animate-[fadeIn_0.3s_ease-out]">
                    
                    {/* Left: Class Insights (Gaps, Intervention Groups, Priority List) */}
                    <div className="xl:col-span-2 space-y-6">
                      
                      {/* Class-wide Gaps */}
                      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4">
                        <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide flex items-center gap-2">
                          📢 Lỗ hổng kiến thức cả lớp ({insights.class_wide_gaps?.length || 0})
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {insights.class_wide_gaps && insights.class_wide_gaps.map((gap: any) => {
                            const gapNode = nodes.find(n => n.id === gap.topic_id);
                            const topicName = gapNode ? gapNode.name : gap.topic_id;
                            return (
                              <div key={gap.topic_id} className="p-4 bg-muted/30 border border-border rounded-2xl space-y-2">
                                <div className="flex justify-between items-start">
                                  <span className="font-extrabold text-xs text-foreground max-w-[70%] truncate" title={topicName}>{topicName}</span>
                                  <span className="text-[10px] font-black uppercase text-red-500 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100">
                                    Hổng {(gap.confirmed_gap_rate * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground flex justify-between font-bold pt-1.5 border-t border-border/40">
                                  <span>Hình thức: {gap.recommended_intervention === 'reteach_class' ? 'Dạy lại cả lớp' : gap.recommended_intervention === 'small_group' ? 'Phụ đạo nhóm nhỏ' : 'Hỗ trợ cá nhân'}</span>
                                  <span>Học sinh hổng: {gap.gap_student_ids?.length}/{gap.denominator}</span>
                                </div>
                              </div>
                            );
                          })}
                          {(!insights.class_wide_gaps || insights.class_wide_gaps.length === 0) && (
                            <div className="col-span-2 text-center py-6 text-xs text-muted-foreground font-bold">
                              Không phát hiện lỗ hổng nghiêm trọng nào trong lớp!
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Intervention Groups */}
                      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4">
                        <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide flex items-center gap-2">
                          👥 Nhóm can thiệp phụ đạo ({insights.intervention_groups?.length || 0})
                        </h3>
                        
                        <div className="space-y-3">
                          {insights.intervention_groups && insights.intervention_groups.map((group: any, idx: number) => {
                            const rootNode = nodes.find(n => n.id === group.root_cause_topic_id);
                            const rootName = rootNode ? rootNode.name : group.root_cause_topic_id;
                            
                            const names = group.student_ids.map((sid: string) => {
                              const p = studentsProgress.find(sp => sp.studentId === sid);
                              return p ? p.studentName : sid;
                            }).join(", ");

                            return (
                              <div key={idx} className="p-4 bg-muted/30 border border-border rounded-2xl flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
                                <div className="space-y-1.5 max-w-[70%]">
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-xs text-foreground">
                                      Nhóm hổng gốc: {rootName}
                                    </span>
                                    <span className="text-[9px] font-black uppercase text-amber-500 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                                      Band {group.mastery_band}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground font-semibold">
                                    <strong className="text-foreground">Thành viên:</strong> {names || "Không có"}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                                    {group.recommended_intervention === 'reteach_class' ? 'Dạy lại cả lớp' : group.recommended_intervention === 'small_group' ? 'Phụ đạo nhóm' : 'Hỗ trợ cá nhân'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {(!insights.intervention_groups || insights.intervention_groups.length === 0) && (
                            <div className="text-center py-6 text-xs text-muted-foreground font-bold">
                              Không cần can thiệp nhóm.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Prioritized Help List */}
                      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4">
                        <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide flex items-center gap-2">
                          🚨 Ưu tiên hỗ trợ học sinh ({insights.prioritized_students?.length || 0})
                        </h3>
                        
                        <div className="space-y-2.5">
                          {insights.prioritized_students && insights.prioritized_students.map((student: any) => {
                            const p = studentsProgress.find(sp => sp.studentId === student.student_id);
                            const name = p ? p.studentName : student.student_id;
                            const email = p ? p.studentEmail : "";
                            
                            return (
                              <div key={student.student_id} className="p-3.5 bg-rose-50/20 border border-rose-100 rounded-2xl flex items-center justify-between gap-4">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-xs text-slate-900">{name}</span>
                                    <span className="text-[9px] text-slate-400 font-bold">{email}</span>
                                  </div>
                                  <p className="text-[10px] text-rose-700 font-semibold">{student.reason}</p>
                                </div>
                                <span className="text-[10px] font-black uppercase text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-100 font-mono">
                                  Độ khẩn: {student.help_priority.toFixed(1)}
                                </span>
                              </div>
                            );
                          })}
                          {(!insights.prioritized_students || insights.prioritized_students.length === 0) && (
                            <div className="text-center py-6 text-xs text-muted-foreground font-bold">
                              Không có học sinh nào bị tụt lại cần hỗ trợ khẩn cấp.
                            </div>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Right: Path Approval list (Active / Draft paths per student) */}
                    <div className="space-y-6">
                      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide">
                            📝 Phê duyệt lộ trình
                          </h3>
                          <button
                            onClick={handleApproveLearningPath}
                            disabled={approvingPath}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-black text-[10px] uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1 font-bold"
                          >
                            {approvingPath ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                            Duyệt lộ trình cả lớp
                          </button>
                        </div>
                        
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                          {draftPaths && Object.keys(draftPaths).map((sid) => {
                            const studentPath = draftPaths[sid];
                            const p = studentsProgress.find(sp => sp.studentId === sid);
                            const name = p ? p.studentName : sid;
                            
                            return (
                              <div key={sid} className="p-4 bg-muted/20 border border-border rounded-2xl space-y-3">
                                <div className="flex justify-between items-center border-b border-border/40 pb-2">
                                  <span className="font-extrabold text-xs text-foreground">{name}</span>
                                  <span className="text-[9px] font-black uppercase text-amber-500 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                                    Dự thảo (Draft)
                                  </span>
                                </div>
                                
                                <div className="space-y-2">
                                  {studentPath.ordered_steps && studentPath.ordered_steps.map((step: any, idx: number) => {
                                    const stepNode = nodes.find(n => n.id === step.topic_id);
                                    const topicName = stepNode ? stepNode.name : step.topic_id;
                                    return (
                                      <div key={step.topic_id} className="p-2.5 bg-white border border-border rounded-xl text-[10px] space-y-1 shadow-sm animate-[fadeIn_0.2s_ease-out]">
                                        <div className="flex justify-between font-bold text-foreground">
                                          <span className="flex items-center gap-1 font-bold text-slate-800">
                                            <span>{step.order}. {topicName}</span>
                                          </span>
                                          <div className="flex items-center gap-1.5 select-none">
                                            <button
                                              onClick={() => handleMoveStep(sid, idx, "up")}
                                              disabled={idx === 0}
                                              className="text-[9px] hover:scale-115 active:scale-95 disabled:opacity-30 cursor-pointer"
                                              title="Di chuyển lên"
                                            >
                                              ⬆️
                                            </button>
                                            <button
                                              onClick={() => handleMoveStep(sid, idx, "down")}
                                              disabled={idx === studentPath.ordered_steps.length - 1}
                                              className="text-[9px] hover:scale-115 active:scale-95 disabled:opacity-30 cursor-pointer"
                                              title="Di chuyển xuống"
                                            >
                                              ⬇️
                                            </button>
                                            <button
                                              onClick={() => handleDeleteStep(sid, idx)}
                                              className="text-[9px] hover:scale-115 active:scale-95 text-rose-500 cursor-pointer ml-1"
                                              title="Xóa bước"
                                            >
                                              ❌
                                            </button>
                                          </div>
                                        </div>
                                        <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold font-mono">
                                          <span>Tiến trình: {(step.current_mastery * 100).toFixed(0)}% &rarr; {(step.target_mastery * 100).toFixed(0)}%</span>
                                          <span>⏱️ {step.estimated_minutes}m</span>
                                        </div>
                                        <p className="text-[9px] text-slate-500 leading-relaxed pt-1.5 border-t border-slate-100">{step.inclusion_reason}</p>
                                      </div>
                                    );
                                  })}
                                  {(!studentPath.ordered_steps || studentPath.ordered_steps.length === 0) && (
                                    <div className="text-center py-4 text-[10px] text-muted-foreground font-bold">
                                      Không cần lộ trình bổ trợ (đã thành thạo!).
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                  </div>
                )}
                
                {!insights && (
                  <div className="bg-card border border-border rounded-3xl p-12 text-center text-muted-foreground text-xs font-bold border-dashed flex flex-col items-center justify-center gap-2">
                    <ListTodo size={28} className="text-muted-foreground/30 animate-pulse mb-1" />
                    Chưa có kết quả phân tích. Hãy chọn chủ đề mục tiêu ở trên và bấm "Lập lộ trình & Phân tích lớp học".
                  </div>
                )}

              </div>
            ) : activeTab === "question-bank" ? (
              // Tab 4: Question Bank Management Panel
              <div className="flex-1 flex flex-col gap-5 overflow-hidden animate-[fadeIn_0.3s_ease-out]">
                {/* Search & Filters & Import excel row */}
                <div className="bg-card border border-border rounded-3xl p-5 shadow-sm flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex flex-wrap gap-3 items-center flex-1">
                    <input
                      type="text"
                      placeholder="Tìm kiếm câu hỏi..."
                      value={qbSearchText}
                      onChange={(e) => setQbSearchText(e.target.value)}
                      className="px-4 py-2 border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[var(--mint)] w-full max-w-[240px] font-semibold bg-white"
                    />
                    
                    <select
                      value={qbFilterNodeId}
                      onChange={(e) => setQbFilterNodeId(e.target.value)}
                      className="px-4 py-2 border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[var(--mint)] font-bold text-foreground bg-white"
                    >
                      <option value="">Tất cả chủ đề</option>
                      {nodes.map(n => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>

                    <select
                      value={qbFilterDifficulty}
                      onChange={(e) => setQbFilterDifficulty(e.target.value)}
                      className="px-4 py-2 border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[var(--mint)] font-bold text-foreground bg-white"
                    >
                      <option value="">Tất cả độ khó</option>
                      <option value="easy">Dễ</option>
                      <option value="medium">Trung bình</option>
                      <option value="hard">Khó</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDownloadTemplate}
                      className="px-4 py-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                    >
                      Tải file mẫu Excel
                    </button>
                    
                    <label className="px-4 py-2 bg-[var(--mint)] hover:brightness-95 active:scale-95 text-foreground rounded-xl text-xs font-black transition-all shadow-[var(--shadow-card)] flex items-center gap-1.5 cursor-pointer">
                      <Upload size={14} /> Nhập từ Excel
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleExcelImport}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Question List Area */}
                <div className="flex-1 bg-card border border-border rounded-3xl p-6 shadow-sm overflow-y-auto space-y-4">
                  {(() => {
                    const filtered = subjectQuestions.filter(q => {
                      const matchSearch = qbSearchText ? q.content.toLowerCase().includes(qbSearchText.toLowerCase()) : true;
                      const matchNode = qbFilterNodeId ? q.nodeId === qbFilterNodeId : true;
                      const matchDiff = qbFilterDifficulty ? q.difficulty.toLowerCase() === qbFilterDifficulty.toLowerCase() : true;
                      return matchSearch && matchNode && matchDiff;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-12 text-muted-foreground font-semibold">
                          Không tìm thấy câu hỏi nào phù hợp với bộ lọc.
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filtered.map(q => {
                          const matchedNode = nodes.find(n => n.id === q.nodeId);
                          let opts = ["", "", "", ""];
                          try {
                            opts = JSON.parse(q.optionsJson);
                          } catch (e) {}

                          return (
                            <div key={q.id} className="p-4 border border-border rounded-2xl bg-white hover:shadow-md transition-shadow flex flex-col justify-between gap-3 shadow-sm">
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-[10px] text-slate-500 font-extrabold uppercase max-w-[180px] truncate" title={matchedNode ? matchedNode.name : "Chủ đề ẩn"}>
                                    {matchedNode ? matchedNode.name : "Chủ đề ẩn"}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border ${
                                    q.difficulty === "easy"
                                      ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                      : q.difficulty === "hard"
                                      ? "bg-rose-50 text-rose-600 border-rose-100"
                                      : "bg-amber-50 text-amber-600 border-amber-100"
                                  }`}>
                                    {q.difficulty === "easy" ? "Dễ" : q.difficulty === "hard" ? "Khó" : "T.Bình"}
                                  </span>
                                </div>
                                <p className="text-xs font-bold text-slate-800 leading-relaxed line-clamp-3" title={q.content}>
                                  {q.content}
                                </p>
                                <div className="space-y-1">
                                  {opts.map((opt, oIdx) => (
                                    <div
                                      key={oIdx}
                                      className={`p-2 rounded-xl text-[10px] font-semibold border ${
                                        oIdx === q.correctOption
                                          ? "bg-emerald-50/50 border-emerald-200 text-emerald-800 font-bold"
                                          : "bg-slate-50 border-slate-100 text-slate-600"
                                      }`}
                                    >
                                      <span className="font-extrabold mr-1.5">{String.fromCharCode(65 + oIdx)}.</span>
                                      {opt}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button
                                  onClick={() => {
                                    setEditingNode(matchedNode || null);
                                    handleStartEditQuestion(q);
                                  }}
                                  className="p-1.5 rounded-lg border border-border hover:bg-muted text-slate-500 hover:text-slate-900 transition-all cursor-pointer"
                                  title="Chỉnh sửa câu hỏi"
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingNode(matchedNode || null);
                                    handleDeleteQuestion(q.id);
                                  }}
                                  className="p-1.5 rounded-lg border border-rose-100 hover:bg-rose-50 text-rose-500 hover:text-rose-700 transition-all cursor-pointer"
                                  title="Xóa câu hỏi"
                                >
                                  <Trash size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              // Tab 5: Classroom Monitoring Dashboards (Telemetry & Charts)
              <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 pb-6 animate-[fadeIn_0.3s_ease-out]">
                {/* Outliers Alert Bar */}
                {(() => {
                  const outliers = monitoringStats.filter(s => s.isOutlier);
                  if (outliers.length === 0) return null;
                  return (
                    <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-3xl flex items-start gap-3 shadow-sm animate-pulse">
                      <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                      <div className="space-y-1">
                        <span className="font-extrabold text-xs">CẢNH BÁO OUTLIERS: Gom nhóm học sinh chệch hướng</span>
                        <p className="text-[10px] text-amber-700 font-semibold leading-relaxed">
                          Phát hiện <span className="font-black text-amber-900">{outliers.length} học sinh</span> có dấu hiệu hổng kiến thức nghiêm trọng, tỷ lệ chính xác làm bài dưới 40% mặc dù đã có nhiều lượt nộp bài. Khuyến nghị lập lộ trình bổ trợ cá nhân ngay lập tức!
                        </p>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Mastery distribution Pie chart */}
                  <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4 flex flex-col">
                    <div>
                      <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide">
                        Phân bố độ thông thạo lớp học (Sơ đồ quạt)
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Tỷ lệ học sinh trong các nhóm năng lực Yếu, Trung bình, Khá/Giỏi</p>
                    </div>
                    
                    <div className="h-[260px] w-full flex items-center justify-center">
                      {monitoringStats.length === 0 ? (
                        <span className="text-xs text-muted-foreground font-semibold animate-pulse">Đang tính toán dữ liệu lớp học...</span>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={(() => {
                                const thap = monitoringStats.filter(s => s.totalAnswers > 0 && s.masteryRate < 30).length;
                                const vua = monitoringStats.filter(s => s.totalAnswers > 0 && s.masteryRate >= 30 && s.masteryRate < 70).length;
                                const cao = monitoringStats.filter(s => s.totalAnswers > 0 && s.masteryRate >= 70).length;
                                const thieu = monitoringStats.filter(s => s.totalAnswers === 0).length;

                                return [
                                  { name: "Yếu / Cần hỗ trợ (<30%)", value: thap, color: "#ef4444" },
                                  { name: "Trung bình (30% - 70%)", value: vua, color: "#f59e0b" },
                                  { name: "Khá / Giỏi (>70%)", value: cao, color: "#10b981" },
                                  { name: "Chưa bắt đầu / Thiếu dữ liệu", value: thieu, color: "#94a3b8" }
                                ].filter(d => d.value > 0);
                              })()}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={90}
                              paddingAngle={4}
                              dataKey="value"
                              label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                            >
                              {
                                [
                                  { name: "Yếu / Cần hỗ trợ (<30%)", color: "#ef4444" },
                                  { name: "Trung bình (30% - 70%)", color: "#f59e0b" },
                                  { name: "Khá / Giỏi (>70%)", color: "#10b981" },
                                  { name: "Chưa bắt đầu / Thiếu dữ liệu", color: "#94a3b8" }
                                ].map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))
                              }
                            </Pie>
                            <Tooltip formatter={(value) => [`${value} học sinh`, 'Số lượng']} />
                            <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* Scatter plot chart of outlier deviation */}
                  <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4 flex flex-col">
                    <div>
                      <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide">
                        Biểu đồ phân tán & Học sinh lệch hướng (Outliers)
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">So sánh độ thông thạo cá nhân với đường trung bình tập thể lớp</p>
                    </div>

                    <div className="h-[260px] w-full">
                      {monitoringStats.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-semibold animate-pulse">Đang tải biểu đồ phân tán...</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              type="number"
                              dataKey="totalAnswers"
                              name="Tổng lượt trả lời"
                              unit=" câu"
                              label={{ value: 'Tổng số câu trả lời', position: 'insideBottom', offset: -10, fontSize: 9, fontWeight: 700 }}
                            />
                            <YAxis
                              type="number"
                              dataKey="masteryRate"
                              name="Tỷ lệ đúng"
                              unit="%"
                              domain={[0, 100]}
                              label={{ value: 'Tỷ lệ đúng (%)', angle: -90, position: 'insideLeft', fontSize: 9, fontWeight: 700 }}
                            />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value, name) => [value, name]} />
                            <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                            
                            {/* Target mastery reference line (outlier boundary) */}
                            <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Ranh giới hổng kiến thức', fill: '#f59e0b', fontSize: 9, fontWeight: 700, position: 'top' }} />

                            {/* Collective Average Line */}
                            <ReferenceLine
                              y={(() => {
                                const activeStudents = monitoringStats.filter(s => s.totalAnswers > 0);
                                if (activeStudents.length === 0) return 50;
                                return activeStudents.reduce((acc, curr) => acc + curr.masteryRate, 0) / activeStudents.length;
                              })()}
                              stroke="#6366f1"
                              strokeWidth={1.5}
                              label={{ value: 'Đường trung bình lớp', fill: '#6366f1', fontSize: 9, fontWeight: 700, position: 'bottom' }}
                            />

                            {/* Active learning students */}
                            <Scatter
                              name="Học sinh bình thường"
                              data={monitoringStats.filter(s => !s.isOutlier && s.totalAnswers > 0)}
                              fill="#6366f1"
                            />

                            {/* Outliers */}
                            <Scatter
                              name="Học sinh đi lệch / Cần hỗ trợ"
                              data={monitoringStats.filter(s => s.isOutlier)}
                              fill="#ef4444"
                            />
                          </ScatterChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>

                {/* Outliers list detail table */}
                <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex-1 overflow-hidden flex flex-col">
                  <div>
                    <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide mb-3">
                      Danh sách học sinh cần hỗ trợ & Can thiệp phụ đạo
                    </h3>
                  </div>
                  
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground font-black uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-4">Học sinh</th>
                          <th className="py-3 px-4">Tổng số câu làm</th>
                          <th className="py-3 px-4">Số câu trả lời đúng</th>
                          <th className="py-3 px-4">Tỷ lệ đúng thực tế</th>
                          <th className="py-3 px-4">Trạng thái chệch hướng</th>
                          <th className="py-3 px-4 text-center">Khuyến nghị giáo viên</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-medium text-foreground/80">
                        {monitoringStats.map((stat, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3.5 px-4 font-black text-slate-900">{stat.studentName}</td>
                            <td className="py-3.5 px-4 font-semibold text-slate-500">{stat.totalAnswers} câu</td>
                            <td className="py-3.5 px-4 font-semibold text-slate-500">{stat.correctAnswers} câu</td>
                            <td className="py-3.5 px-4 font-extrabold text-slate-700">{stat.masteryRate.toFixed(1)}%</td>
                            <td className="py-3.5 px-4 font-bold">
                              {stat.isOutlier ? (
                                <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-600 font-extrabold uppercase text-[9px] border border-rose-100">
                                  Outlier (Yếu)
                                </span>
                              ) : stat.totalAnswers === 0 ? (
                                <span className="px-2 py-0.5 rounded bg-slate-50 text-slate-400 font-bold uppercase text-[9px] border border-slate-100">
                                  Chưa có dữ liệu
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 font-extrabold uppercase text-[9px] border border-emerald-100">
                                  Ổn định
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {stat.isOutlier ? (
                                <button
                                  onClick={() => {
                                    setActiveTab("learning-path");
                                    setSelectedTargetTopics(nodes.map(n => n.id));
                                    toast.info(`Đã chọn tất cả chủ đề để phân tích lộ trình phụ đạo cho ${stat.studentName}.`);
                                  }}
                                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black uppercase tracking-wider rounded-lg transition-all active:scale-95 cursor-pointer shadow-sm"
                                >
                                  Lập lộ trình phụ đạo
                                </button>
                              ) : (
                                <span className="text-[10px] text-muted-foreground font-semibold">Tự động giám sát...</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
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
                className="flex-1 bg-foreground hover:opacity-90 text-background font-black text-xs py-3.5 rounded-xl shadow-[var(--shadow-card)] transition-all cursor-pointer text-center"
              >
                🔄 Thử lại đoạn {failedChunkIndex + 1}
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
    </div>
  );
}
