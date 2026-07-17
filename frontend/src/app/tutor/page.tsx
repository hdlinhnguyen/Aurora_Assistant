"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import KnowledgeTree from "../components/KnowledgeTree";
import { BookOpen, HelpCircle, MessageSquare, Award, ArrowLeft, RefreshCw, Sparkles, Send, Play, ListTodo } from "lucide-react";

interface NodeItem {
  id: string;
  subject: string;
  name: string;
  theory: string;
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

  useEffect(() => {
    const userStr = localStorage.getItem("aurora_user");
    if (!userStr) {
      router.push("/");
      return;
    }
    const user = JSON.parse(userStr);
    setUserName(user.name);

    loadSubjects();
  }, [router]);

  // Load Tree when subject changes
  useEffect(() => {
    if (selectedSubject) {
      loadTreeData();
      loadStudentState();
      loadLearningPath();
      setSelectedNode(null);
    }
  }, [selectedSubject]);

  // Scroll chat bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [theoryChat]);

  const loadSubjects = async () => {
    try {
      const data = await apiFetch("/subjects");
      setSubjects(data || []);
      if (data && data.length > 0) {
        setSelectedSubject(data[0]);
      }
    } catch (err) {
      console.error("Failed to load subjects:", err);
    }
  };

  const loadTreeData = async () => {
    try {
      const data = await apiFetch(`/subjects/${encodeURIComponent(selectedSubject)}/tree`);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch (err) {
      console.error("Failed to load tree:", err);
    }
  };

  const loadStudentState = async () => {
    try {
      const state = await apiFetch(`/subjects/${encodeURIComponent(selectedSubject)}/state`);
      setStudentState(state);
      
      // Load logs
      const progress = await apiFetch(`/teacher/students/${JSON.parse(localStorage.getItem("aurora_user")!).id}/progress/${encodeURIComponent(selectedSubject)}`);
      setActivityLogs(progress.logs || []);
      
      // Compute status dictionary
      // Status: mastered, struggle, learning, locked, initial
      const statusMap: Record<string, "mastered" | "struggle" | "learning" | "locked" | "initial"> = {};
      if (progress.nodeStatus) {
        Object.keys(progress.nodeStatus).forEach((k) => {
          statusMap[k] = progress.nodeStatus[k];
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
      const res = await apiFetch("/student/hints", {
        method: "POST",
        body: JSON.stringify({
          topicId: selectedNode.id,
          pressCount: nextPressCount
        })
      });
      setHintPressCount(nextPressCount);
      setActiveHint(res.content || "Chưa có gợi ý nào cho cấp độ này.");
    } catch (err: any) {
      alert("Không thể tải gợi ý: " + err.message);
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
      alert("Lỗi khi bắt đầu học: " + err.message);
    }
  };

  const handleNodeClick = (node: NodeItem) => {
    // If student state is nil and node is not root, they must click root or select first
    if (!studentState && !node.isRoot) {
      alert("Vui lòng chọn nút Gốc (Tên môn học) để bắt đầu lộ trình học!");
      return;
    }

    if (!studentState) {
      // Prompt start node
      if (confirm(`Bạn có muốn chọn "${node.name}" làm điểm xuất phát (Level ban đầu) không?`)) {
        handleStartNode(node);
      }
      return;
    }

    // Load drawer for selected node
    setSelectedNode(node);
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

  const loadQuestions = async (nodeId: string) => {
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

  // Submit Answer trắc nghiệm
  const handleSubmitAnswer = async () => {
    if (selectedOption === null || !selectedNode || submitting) return;
    
    const currentQ = filteredQuestions[currentQIndex];
    if (!currentQ) return;

    setSubmitting(true);
    setAnswerFeedback(null);

    try {
      const res = await apiFetch(`/nodes/${selectedNode.id}/answer`, {
        method: "POST",
        body: JSON.stringify({
          questionId: currentQ.id,
          selectedOption,
        }),
      });

      if (res.isCorrect) {
        setAnswerFeedback({ isCorrect: true, message: "🎉 Tuyệt vời! Câu trả lời của em hoàn toàn chính xác." });
        // Update states
        loadStudentState();
        loadTreeData();
        loadLearningPath();
      } else {
        setAnswerFeedback({ isCorrect: false, message: "❌ Rất tiếc, câu trả lời chưa chính xác. Em thử lại nhé!" });
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } catch (err: any) {
      alert("Lỗi khi nộp bài: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // "Không làm được" button logic
  const handleCantDo = async () => {
    if (!selectedNode || submitting) return;
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
      alert("Lỗi xử lý: " + err.message);
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

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-zinc-950 overflow-hidden relative">
      
      {/* Sidebar - Course & Logs */}
      <aside className="w-80 border-r border-slate-200 bg-white flex flex-col z-10 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 animate-pulse" />
            <span className="font-black text-slate-900 tracking-tight text-lg uppercase">Aurora Tutor</span>
          </div>
        </div>

        {/* Subject selection */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 space-y-2">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Chọn Môn Học</label>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="w-full rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
          >
            {subjects.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
              </option>
            ))}
          </select>
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
            <ListTodo size={14} />
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
            <BookOpen size={14} />
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
                          <span>⏱️ {step.estimated_minutes}m</span>
                          <span>🎯 {(step.current_mastery * 100).toFixed(0)}% → {(step.target_mastery * 100).toFixed(0)}%</span>
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
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-950 flex items-center gap-2">
              Sơ đồ cây kiến thức: <span className="text-indigo-600 font-black">{selectedSubject}</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">Chọn một chủ đề học tập để mở tài liệu lý thuyết và làm bài tập trắc nghiệm.</p>
          </div>

          {/* Legend */}
          <div className="flex gap-3 bg-white px-4 py-2 border border-slate-200 rounded-2xl text-[10px] font-bold text-slate-500 shadow-sm">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Bắt đầu</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" /> Đang học</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Đã thông</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Lỗ hổng</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Chưa mở</span>
          </div>
        </div>

        {/* Tree Canvas */}
        <div className="flex-1 relative rounded-3xl overflow-hidden shadow-sm">
          {nodes.length > 0 ? (
            <KnowledgeTree
              subject={selectedSubject}
              nodes={nodes}
              edges={edges}
              mode="student"
              studentNodeStatus={nodeStatus}
              initialNodeId={studentState?.initialLevelNodeId}
              currentNodeId={studentState?.currentLevelNodeId}
              onNodeClick={handleNodeClick}
              onRefresh={() => {
                loadTreeData();
                loadStudentState();
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm font-semibold">
              Đang tải sơ đồ cây kiến thức...
            </div>
          )}
        </div>
      </main>

      {/* Slide-out Learning Drawer */}
      {selectedNode && (
        <div className="w-[450px] border-l border-slate-200 bg-white shadow-2xl flex flex-col h-full z-20 animate-[slideLeft_0.3s_cubic-bezier(0.16,1,0.3,1)]">
          {/* Header */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 backdrop-blur-sm">
            <div className="space-y-1">
              <span className="text-[9px] bg-indigo-100 text-indigo-800 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                {selectedNode.isRoot ? "Nút Gốc môn học" : "Chủ đề học tập"}
              </span>
              <h2 className="text-base font-black text-slate-900 leading-tight truncate max-w-[280px]">
                {selectedNode.name}
              </h2>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 active:scale-90 transition-all shadow-sm cursor-pointer"
            >
              &rarr;
            </button>
          </div>

          {/* Drawer Tabs */}
          <div className="grid grid-cols-2 border-b border-slate-100 bg-white">
            <button
              onClick={() => setDrawerTab("theory")}
              className={`py-3.5 text-xs font-black flex items-center justify-center gap-1.5 border-b-2 cursor-pointer transition-all ${
                drawerTab === "theory"
                  ? "border-indigo-600 text-indigo-600 bg-indigo-50/30"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <BookOpen size={16} /> 📚 Lý Thuyết (RAG)
            </button>
            <button
              onClick={() => setDrawerTab("practice")}
              className={`py-3.5 text-xs font-black flex items-center justify-center gap-1.5 border-b-2 cursor-pointer transition-all ${
                drawerTab === "practice"
                  ? "border-indigo-600 text-indigo-600 bg-indigo-50/30"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <HelpCircle size={16} /> ✍️ Làm Bài Tập
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 overflow-hidden flex flex-col bg-white">
            {drawerTab === "theory" ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-6 flex flex-col justify-between h-full">
                {/* Extracted Theory Section */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Nội dung bài học</h3>
                  <div className="p-4 bg-slate-50 border border-slate-200/50 rounded-2xl text-xs text-slate-700 leading-relaxed shadow-inner max-h-[160px] overflow-y-auto">
                    {selectedNode.theory || "Nội dung lý thuyết đang được cập nhật..."}
                  </div>
                </div>

                {/* Socratic RAG Chat Widget */}
                <div className="flex-1 border-t border-slate-100 pt-5 flex flex-col min-h-[220px] max-h-[480px]">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-6 w-6 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600"><MessageSquare size={12} /></span>
                    <h4 className="text-xs font-black text-slate-800">Trợ lý Socratic giải thích (RAG Chat)</h4>
                  </div>

                  {/* Chat logs */}
                  <div className="flex-1 overflow-y-auto border border-slate-100 rounded-2xl p-3 bg-slate-50/50 space-y-3 mb-3 text-xs min-h-[150px] max-h-[300px]">
                    {theoryChat.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.sender === "student" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm border ${
                          msg.sender === "student"
                            ? "bg-slate-900 border-slate-950 text-white rounded-br-none"
                            : "bg-white border-slate-200 text-slate-800 rounded-bl-none"
                        }`}>
                          {msg.content}
                        </div>
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

                  {/* Chat input form */}
                  <form onSubmit={handleSendChat} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Hỏi AI về bài học này..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 rounded-xl bg-slate-50 border border-slate-200 text-xs px-3.5 py-2.5 text-zinc-950 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-medium"
                    />
                    <button
                      type="submit"
                      disabled={chatLoading}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 font-bold px-4 rounded-xl shadow-md transition-all flex items-center justify-center cursor-pointer"
                    >
                      <Send size={14} />
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              // Practice Tab
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {filteredQuestions.length > 0 ? (
                  (() => {
                    const currentQ = filteredQuestions[currentQIndex];
                    if (!currentQ) return null;
                    
                    let options: string[] = [];
                    try {
                      options = JSON.parse(currentQ.optionsJson);
                    } catch (e) {}

                    return (
                      <div className={`space-y-5 transition-all ${shake ? "animate-shake" : ""}`}>
                        {/* Difficulty label & filter state */}
                        <div className="flex justify-between items-center">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                            currentQ.difficulty === "easy"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : currentQ.difficulty === "hard"
                              ? "bg-rose-50 border-rose-200 text-rose-700"
                              : "bg-amber-50 border-amber-200 text-amber-700"
                          }`}>
                            Độ khó: {currentQ.difficulty}
                          </span>
                          
                          {difficultyFilter && (
                            <button
                              onClick={() => {
                                setDifficultyFilter(null);
                                setCantDoOptions(null);
                                setCurrentQIndex(0);
                                setSelectedOption(null);
                              }}
                              className="text-[9px] font-black text-indigo-600 hover:underline uppercase tracking-wide cursor-pointer"
                            >
                              Đặt lại độ khó gốc
                            </button>
                          )}
                        </div>

                        {/* Question Content */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 font-bold text-xs text-slate-800 leading-relaxed shadow-inner">
                          {currentQ.content}
                        </div>

                        {/* Options */}
                        <div className="space-y-2.5">
                          {options.map((opt, idx) => {
                            const isSelected = selectedOption === idx;
                            return (
                              <button
                                key={idx}
                                onClick={() => setSelectedOption(idx)}
                                className={`w-full text-left p-3.5 rounded-xl border text-xs leading-relaxed transition-all shadow-sm cursor-pointer ${
                                  isSelected
                                    ? "bg-slate-900 border-slate-950 text-white font-semibold shadow-md"
                                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                                }`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>

                        {/* Feedback & Actions */}
                        {answerFeedback && (
                          <div className={`p-3.5 rounded-xl text-center text-xs font-bold border shadow-sm ${
                            answerFeedback.isCorrect
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                              : "bg-rose-50 border-rose-200 text-rose-800"
                          }`}>
                            {answerFeedback.message}
                          </div>
                        )}

                        {/* Hint Display */}
                        {activeHint && (
                          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2 animate-[fadeIn_0.3s_ease-out]">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1.5">
                                ✨ Gợi ý Bậc {hintPressCount}: {hintPressCount === 1 ? "Socratic Nudge" : hintPressCount === 2 ? "First-principles" : "Bottom-out (Ví dụ)"}
                              </span>
                              <span className="text-[9px] text-slate-400 font-semibold">(Đã giảm nhẹ trọng số BKT)</span>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed font-semibold">{activeHint}</p>
                          </div>
                        )}

                        <div className="flex gap-2.5 pt-3 border-t border-slate-100">
                          {/* Answer validation button */}
                          <button
                            onClick={handleSubmitAnswer}
                            disabled={selectedOption === null || submitting}
                            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50 font-bold text-xs py-3 rounded-xl shadow-md transition-all cursor-pointer text-center"
                          >
                            {submitting ? "Đang xử lý..." : "Gửi đáp án"}
                          </button>

                          {/* Request Hint button */}
                          <button
                            onClick={handleRequestHint}
                            disabled={hintLoading || submitting}
                            className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-600 disabled:opacity-50 font-bold text-xs px-3.5 py-3 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                            title="Yêu cầu gợi ý thích ứng"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            {hintPressCount === 0 ? "Xem gợi ý" : hintPressCount === 1 ? "Gợi ý 2" : hintPressCount === 2 ? "Gợi ý 3" : "Hết gợi ý"}
                          </button>

                          {/* "Can't Do" button */}
                          <button
                            onClick={handleCantDo}
                            disabled={submitting}
                            className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 disabled:opacity-50 font-bold text-xs px-3 py-3 rounded-xl transition-all cursor-pointer"
                            title="Không làm được câu này"
                          >
                            Bỏ qua
                          </button>
                        </div>

                        {/* Cant Do Options Adaptive Menu */}
                        {cantDoOptions && (
                          <div className="pt-5 border-t-2 border-dashed border-slate-100 space-y-4 bg-rose-50/20 p-4 rounded-2xl animate-[fadeIn_0.3s_ease-out]">
                            <h4 className="text-[10px] font-black text-rose-600 uppercase tracking-widest text-center">Gợi ý lộ trình thích ứng (Adaptive Learning)</h4>
                            <p className="text-[11px] text-slate-500 leading-relaxed text-center">
                              Không sao cả! Việc thừa nhận không làm được là bước đầu tiên để học thực chất. Em muốn rẽ sang hướng nào?
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              {cantDoOptions.hasEasyQ && (
                                <button
                                  onClick={handleChooseEasier}
                                  className="w-full bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 p-3 rounded-xl text-xs font-black shadow-sm transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  👉 Làm câu dễ hơn tại nút này
                                </button>
                              )}
                              
                              {cantDoOptions.parents.length > 0 ? (
                                cantDoOptions.parents.map((parent) => (
                                  <button
                                    key={parent.id}
                                    onClick={() => handleChooseFoundational(parent.id, parent.name)}
                                    className="w-full bg-white border border-slate-200 hover:border-orange-400 hover:text-orange-600 p-3 rounded-xl text-xs font-black shadow-sm transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    👉 Quay lại học kiến thức nền: "{parent.name}"
                                  </button>
                                ))
                              ) : (
                                <div className="text-[10px] text-slate-400 text-center font-bold">
                                  (Đây đã là bài học nền tảng cơ sở nhất)
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Paginate Questions */}
                        {filteredQuestions.length > 1 && (
                          <div className="flex justify-between items-center pt-2">
                            <span className="text-[10px] text-slate-400 font-bold">
                              Câu {currentQIndex + 1} / {filteredQuestions.length}
                            </span>
                            <div className="flex gap-1">
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
                                className="px-2.5 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 font-bold disabled:opacity-40 cursor-pointer"
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
                                className="px-2.5 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 font-bold disabled:opacity-40 cursor-pointer"
                              >
                                Tiếp
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-16 text-slate-400 text-xs font-bold border border-dashed border-slate-200 rounded-2xl flex flex-col items-center gap-2">
                    <Sparkles size={24} className="text-slate-300" />
                    Chưa có câu hỏi trắc nghiệm nào cho bài học này.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
