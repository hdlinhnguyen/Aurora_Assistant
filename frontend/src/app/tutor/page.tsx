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

  // New Promax Socratic Workspace States
  const [activeMainTab, setActiveMainTab] = useState<"graph" | "workspace">("graph");
  const [questionChat, setQuestionChat] = useState<Record<string, Array<{sender: "student" | "ai", content: string}>>>({});
  const [questionChatInput, setQuestionChatInput] = useState("");
  const [questionChatLoading, setQuestionChatLoading] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showAutoRouteModal, setShowAutoRouteModal] = useState(false);
  const [nextRecommendedNode, setNextRecommendedNode] = useState<NodeItem | null>(null);

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

    // Load drawer for selected node and switch workspace
    setSelectedNode(node);
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

  const getBktScoreForNode = (nodeId: string) => {
    if (nodeStatus[nodeId] === "mastered") return { mastery: 0.94, confidence: 0.88 };
    if (learningPath && learningPath.ordered_steps) {
      const step = learningPath.ordered_steps.find((s: any) => s.topic_id === nodeId);
      if (step) {
        return {
          mastery: step.current_mastery || 0.15,
          confidence: step.target_mastery ? Math.min(step.target_mastery * 0.9, 0.85) : 0.65
        };
      }
    }
    if (nodeStatus[nodeId] === "struggle") return { mastery: 0.28, confidence: 0.72 };
    if (nodeStatus[nodeId] === "learning") return { mastery: 0.45, confidence: 0.68 };
    return { mastery: 0.15, confidence: 0.50 };
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
              <div className="h-16 w-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 shadow-md animate-bounce">
                <Sparkles className="w-8 h-8 text-emerald-600" />
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

        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-black text-slate-950 flex items-center gap-2">
                Cây kiến thức: <span className="text-indigo-600 font-black">{selectedSubject}</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Chọn một bài học trên cây để mở Không gian Học tập Socratic của riêng em.</p>
            </div>
            
            <div className="flex gap-1.5 bg-slate-200/60 p-1 rounded-2xl border border-slate-200 ml-4 shadow-inner">
              <button
                onClick={() => setActiveMainTab("graph")}
                className={`px-4 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                  activeMainTab === "graph"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-350/40"
                }`}
              >
                🌐 Sơ đồ Cây
              </button>
              <button
                onClick={() => {
                  if (selectedNode) {
                    setActiveMainTab("workspace");
                  } else {
                    alert("Vui lòng click chọn một bài học trên Sơ đồ Cây trước!");
                  }
                }}
                className={`px-4 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeMainTab === "workspace"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-350/40"
                }`}
              >
                ✨ Không gian Học tập
                {selectedNode && (
                  <span className="bg-indigo-500 text-white px-1.5 py-0.5 rounded-lg text-[9px] animate-pulse font-mono font-bold">
                    {selectedNode.name}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Legend */}
          {activeMainTab === "graph" && (
            <div className="flex gap-3 bg-white px-4 py-2 border border-slate-200 rounded-2xl text-[10px] font-bold text-slate-500 shadow-sm animate-[fadeIn_0.2s_ease-out]">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Bắt đầu</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" /> Đang học</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Đã thông</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Lỗ hổng</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Khóa 🔒</span>
            </div>
          )}
        </div>

        {/* Dynamic Main Workspace Tabs Render */}
        {activeMainTab === "graph" ? (
          <div className="flex-1 relative rounded-3xl overflow-hidden shadow-sm border border-slate-200">
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
        ) : (
          /* Promax Socratic Learning Hub Split View */
          selectedNode ? (
            <div className="flex-1 flex gap-6 overflow-hidden animate-[fadeIn_0.3s_ease-out]">
              
              {/* Left Column: Socratic RAG Theory Chat */}
              <div className="w-[45%] bg-white border border-slate-200 rounded-3xl p-5 flex flex-col shadow-sm">
                <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
                  <div className="space-y-0.5">
                    <span className="text-[9px] bg-indigo-100 text-indigo-800 font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                      {selectedNode.isRoot ? "Nút Gốc môn học" : "Chủ đề học tập"}
                    </span>
                    <h2 className="text-base font-black text-slate-900 leading-tight truncate max-w-[280px]">
                      {selectedNode.name}
                    </h2>
                  </div>
                  <button
                    onClick={() => setActiveMainTab("graph")}
                    className="text-[10px] font-black text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-xl hover:bg-indigo-50 active:scale-95 transition-all shadow-sm cursor-pointer font-bold"
                  >
                    &larr; Sơ đồ cây
                  </button>
                </div>

                {/* Extracted Theory Block */}
                <div className="space-y-2 mb-4 bg-slate-50 border border-slate-200/50 p-4 rounded-2xl shadow-inner">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Tóm tắt nội dung chính</h3>
                  <div className="text-xs text-slate-700 leading-relaxed font-bold max-h-[120px] overflow-y-auto pr-2">
                    {selectedNode.theory || "Nội dung lý thuyết đang được cập nhật..."}
                  </div>
                </div>

                {/* Socratic RAG Chatbot */}
                <div className="flex-1 border-t border-slate-100 pt-4 flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-6 w-6 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600"><MessageSquare size={12} /></span>
                    <h4 className="text-xs font-black text-slate-800">Trợ lý Socratic giải thích (RAG Chat)</h4>
                  </div>

                  <div className="flex-1 overflow-y-auto border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-3 mb-4 text-xs font-semibold">
                    {theoryChat.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.sender === "student" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border ${
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

                  <form onSubmit={handleSendChat} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Hỏi thầy Socratic về bài học này..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 rounded-xl bg-slate-50 border border-slate-200 text-xs px-4 py-3 text-zinc-950 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-semibold"
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

              {/* Right Column: BKT Gauge, Questions & Socratic Inline Helper */}
              <div className="flex-1 bg-white border border-slate-200 rounded-3xl p-5 flex flex-col shadow-sm overflow-y-auto">
                
                {/* 1. BKT Circular Progress Gauge */}
                {(() => {
                  const bkt = getBktScoreForNode(selectedNode.id);
                  const masteryPercent = Math.round(bkt.mastery * 100);
                  const confidencePercent = Math.round(bkt.confidence * 100);
                  return (
                    <div className="flex gap-6 items-center justify-around bg-slate-950 text-white p-5 rounded-3xl shadow-xl shadow-slate-950/15 relative overflow-hidden mb-6">
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none" />

                      {/* Circle 1: Mastery */}
                      <div className="flex flex-col items-center gap-2 relative">
                        <svg className="w-20 h-20 transform -rotate-90">
                          <circle cx="40" cy="40" r="32" className="stroke-slate-800" strokeWidth="6" fill="transparent" />
                          <circle
                            cx="40"
                            cy="40"
                            r="32"
                            className="stroke-indigo-400 transition-all duration-500 ease-out"
                            strokeWidth="6"
                            fill="transparent"
                            strokeDasharray="201"
                            strokeDashoffset={201 - (201 * bkt.mastery)}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute top-[22px] text-center w-full">
                          <span className="text-sm font-black text-indigo-300">{masteryPercent}%</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Độ thông thạo</span>
                      </div>

                      {/* Circle 2: Confidence */}
                      <div className="flex flex-col items-center gap-2 relative">
                        <svg className="w-20 h-20 transform -rotate-90">
                          <circle cx="40" cy="40" r="32" className="stroke-slate-800" strokeWidth="6" fill="transparent" />
                          <circle
                            cx="40"
                            cy="40"
                            r="32"
                            className="stroke-emerald-400 transition-all duration-500 ease-out"
                            strokeWidth="6"
                            fill="transparent"
                            strokeDasharray="201"
                            strokeDashoffset={201 - (201 * bkt.confidence)}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute top-[22px] text-center w-full">
                          <span className="text-sm font-black text-emerald-300">{confidencePercent}%</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Độ tự tin (BKT)</span>
                      </div>
                    </div>
                  );
                })()}

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
                        {/* Difficulty labels */}
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${
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
                              className="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-wide cursor-pointer font-mono"
                            >
                              Đặt lại độ khó gốc
                            </button>
                          )}
                        </div>

                        {/* Question Box */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 font-black text-xs text-slate-800 leading-relaxed shadow-inner">
                          {currentQ.content}
                        </div>

                        {/* Options Buttons */}
                        <div className="grid grid-cols-1 gap-2.5">
                          {options.map((opt, idx) => {
                            const isSelected = selectedOption === idx;
                            return (
                              <button
                                key={idx}
                                onClick={() => setSelectedOption(idx)}
                                className={`w-full text-left p-4 rounded-2xl border text-xs leading-relaxed transition-all shadow-sm cursor-pointer font-bold ${
                                  isSelected
                                    ? "bg-slate-900 border-slate-950 text-white font-bold shadow-md scale-[1.01]"
                                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                                }`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>

                        {/* Feedback Banner */}
                        {answerFeedback && (
                          <div className={`p-4 rounded-2xl text-center text-xs font-bold border shadow-sm ${
                            answerFeedback.isCorrect
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                              : "bg-rose-50 border-rose-200 text-rose-800"
                          }`}>
                            {answerFeedback.message}
                          </div>
                        )}

                        {/* Hint Display */}
                        {activeHint && (
                          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-2 animate-[fadeIn_0.3s_ease-out]">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                                ✨ Gợi ý Bậc {hintPressCount}: {hintPressCount === 1 ? "Socratic Nudge" : hintPressCount === 2 ? "First-principles" : "Bottom-out (Ví dụ)"}
                              </span>
                              <span className="text-[9px] text-slate-400 font-semibold font-mono">(Trọng số BKT đã giảm)</span>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed font-bold">{activeHint}</p>
                          </div>
                        )}

                        {/* Control buttons */}
                        <div className="flex gap-2.5 pt-3 border-t border-slate-100">
                          <button
                            onClick={handleSubmitAnswer}
                            disabled={selectedOption === null || submitting}
                            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50 font-bold text-xs py-3.5 rounded-2xl shadow-md transition-all cursor-pointer text-center"
                          >
                            {submitting ? "Đang xử lý..." : "Gửi đáp án"}
                          </button>

                          <button
                            onClick={handleRequestHint}
                            disabled={hintLoading || submitting}
                            className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-600 disabled:opacity-50 font-black text-xs px-4 py-3.5 rounded-2xl transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            {hintPressCount === 0 ? "Xem gợi ý" : hintPressCount === 1 ? "Gợi ý 2" : hintPressCount === 2 ? "Gợi ý 3" : "Hết gợi ý"}
                          </button>

                          <button
                            onClick={handleCantDo}
                            disabled={submitting}
                            className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 disabled:opacity-50 font-bold text-xs px-4.5 py-3.5 rounded-2xl transition-all cursor-pointer"
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
                                  👉 Làm câu hỏi cấp độ dễ hơn (giảm độ khó)
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
                        <div className="pt-6 border-t border-slate-200 space-y-3 bg-indigo-50/20 p-4 rounded-3xl border border-indigo-100/60 shadow-inner mt-4">
                          <div className="flex items-center gap-2">
                            <span className="h-6 w-6 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-inner">
                              <MessageSquare size={11} />
                            </span>
                            <h4 className="text-xs font-black text-slate-800">Cần trợ giúp? Trò chuyện Socratic về câu hỏi này</h4>
                          </div>

                          {/* Question Chat logs */}
                          <div className="max-h-[220px] overflow-y-auto border border-slate-100 rounded-2xl p-3 bg-white space-y-2 text-[11px] font-semibold">
                            {qChat.length === 0 ? (
                              <div className="text-center py-4 text-slate-400 font-semibold">
                                Chưa có hội thoại. Nhập câu hỏi bên dưới để bắt đầu thảo luận Socratic với AI về bài tập này nhé!
                              </div>
                            ) : (
                              qChat.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.sender === "student" ? "justify-end" : "justify-start"}`}>
                                  <div className={`max-w-[90%] rounded-2xl px-3 py-2 border shadow-sm ${
                                    msg.sender === "student"
                                      ? "bg-slate-900 border-slate-950 text-white rounded-br-none"
                                      : "bg-indigo-50 border-indigo-100 text-indigo-950 rounded-bl-none"
                                  }`}>
                                    {msg.content}
                                  </div>
                                </div>
                              ))
                            )}
                            {questionChatLoading && (
                              <div className="flex justify-start animate-pulse">
                                <div className="bg-indigo-50 border border-indigo-100 text-indigo-400 rounded-2xl rounded-bl-none px-3.5 py-1.5 flex items-center gap-1">
                                  <span className="h-1 w-1 bg-indigo-400 rounded-full animate-bounce" />
                                  <span className="h-1 w-1 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Question Chat Input form */}
                          <form onSubmit={(e) => handleSendQuestionChat(e, currentQ.id)} className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Hỏi AI về câu hỏi này..."
                              value={questionChatInput}
                              onChange={(e) => setQuestionChatInput(e.target.value)}
                              className="flex-1 rounded-xl bg-white border border-slate-200 text-xs px-3.5 py-2.5 text-zinc-950 focus:outline-none focus:border-indigo-500 transition-all font-semibold shadow-sm"
                            />
                            <button
                              type="submit"
                              disabled={questionChatLoading || !questionChatInput.trim()}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 font-bold px-4 rounded-xl shadow-md transition-all flex items-center justify-center cursor-pointer"
                            >
                              <Send size={12} />
                            </button>
                          </form>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-16 text-slate-400 text-xs font-bold border border-dashed border-slate-200 rounded-2xl flex flex-col items-center gap-2">
                    <Sparkles size={24} className="text-indigo-400" />
                    Chưa có câu hỏi trắc nghiệm nào cho bài học này.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-3 p-10 bg-white border border-slate-200 rounded-3xl shadow-sm">
              <Sparkles size={40} className="text-indigo-400 animate-pulse" />
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
      </main>
    </div>
  );
}
