"use client";

import React from "react";
import { ListTodo, GitFork, AlertCircle, ArrowUp, ArrowDown, Trash, ShieldAlert, Target, AlertTriangle, Users, Flame, FileText } from "lucide-react";

import { NodeItem, StudentProgress } from "../page";

interface LearningPathTabProps {
  nodes: NodeItem[];
  selectedTargetTopics: string[];
  setSelectedTargetTopics: React.Dispatch<React.SetStateAction<string[]>>;
  handleGenerateLearningPath: () => void;
  generatingPath: boolean;
  pathErrorDetail: string | null;
  insights: any;
  draftPaths: any;
  studentsProgress: StudentProgress[];
  handleApproveLearningPath: () => void;
  approvingPath: boolean;
  handleMoveStep: (sid: string, idx: number, dir: "up" | "down") => void;
  handleDeleteStep: (sid: string, idx: number) => void;
}

export default function LearningPathTab({
  nodes,
  selectedTargetTopics,
  setSelectedTargetTopics,
  handleGenerateLearningPath,
  generatingPath,
  pathErrorDetail,
  insights,
  draftPaths,
  studentsProgress,
  handleApproveLearningPath,
  approvingPath,
  handleMoveStep,
  handleDeleteStep,
}: LearningPathTabProps) {
  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 pb-6 animate-[fadeIn_0.3s_ease-out]">
      {/* Step 1: Select Target Topics */}
      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4">
        <div>
          <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide flex items-center gap-2">
            <Target size={16} className="text-[var(--mint)] animate-pulse" />
            <span>Bước 1: Chọn bài học mục tiêu chẩn đoán</span>
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-semibold">Chọn các bài học bạn muốn chẩn đoán và lập lộ trình học phụ đạo cho lớp</p>
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
                className={`flex items-center gap-3 p-3 rounded-2xl border text-left text-xs font-bold transition-all shadow-sm cursor-pointer ${isChecked
                    ? "bg-foreground border-foreground text-background"
                    : "bg-white border-border text-foreground hover:bg-muted"
                  }`}
              >
                <span className={`h-4 w-4 rounded-md border flex items-center justify-center font-bold text-[9px] ${isChecked ? "bg-background border-background text-foreground" : "border-border bg-white"
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
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer uppercase tracking-wider"
          >
            {generatingPath ? "Đang tính toán..." : "Lập lộ trình & Phân tích lớp học"}
          </button>
        </div>
      </div>

      {/* API detailed error display (Monospace styled box) */}
      {pathErrorDetail && (
        <div className="bg-rose-50 border border-rose-200 p-5 rounded-3xl space-y-3">
          <div className="flex items-center gap-2 text-rose-800">
            <ShieldAlert size={18} />
            <span className="font-extrabold text-xs uppercase tracking-wider">LỖI THIẾT LẬP LỘ TRÌNH</span>
          </div>
          <p className="text-[11px] text-rose-700 font-semibold leading-relaxed">
            Không thể kết nối đến máy chủ tính toán lộ trình hoặc dữ liệu học sinh không hợp lệ. Vui lòng kiểm tra lại cấu trúc cây kiến thức hoặc dữ liệu nộp bài của học sinh.
          </p>
          <div className="p-3 bg-rose-900 text-rose-50 text-[10px] font-mono rounded-xl max-h-[150px] overflow-y-auto whitespace-pre-wrap leading-normal border border-rose-950">
            {pathErrorDetail}
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
                <AlertTriangle size={15} className="text-amber-500" />
                <span>Lỗ hổng kiến thức chung toàn lớp</span>
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.class_wide_gaps && insights.class_wide_gaps.map((gap: any) => {
                  const gapNode = nodes.find(n => n.id === gap.topic_id);
                  return (
                    <div key={gap.topic_id} className="p-4 bg-amber-50/20 border border-amber-100 rounded-2xl space-y-1.5 shadow-sm">
                      <span className="font-black text-amber-900 text-xs block truncate" title={gapNode ? gapNode.name : gap.topic_id}>
                        {gapNode ? gapNode.name : gap.topic_id}
                      </span>
                      <div className="flex justify-between text-[10px] font-bold text-amber-700">
                        <span>Tỷ lệ hổng:</span>
                        <span className="font-black text-amber-900">{(gap.gap_ratio * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
                {(!insights.class_wide_gaps || insights.class_wide_gaps.length === 0) && (
                  <p className="text-xs text-muted-foreground font-semibold col-span-2 py-4 text-center">Không phát hiện lỗ hổng kiến thức nghiêm trọng nào chung.</p>
                )}
              </div>
            </div>

            {/* Intervention Groups */}
            <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide flex items-center gap-2">
                <Users size={15} className="text-indigo-500" />
                <span>Nhóm can thiệp phụ đạo ({insights.intervention_groups?.length || 0})</span>
              </h3>
              
              <div className="space-y-3">
                {insights.intervention_groups && insights.intervention_groups.map((group: any, idx: number) => {
                  const rootNode = nodes.find(n => n.id === group.root_cause_topic_id);
                  
                  const names = group.student_ids.map((sid: string) => {
                    const p = studentsProgress.find(sp => sp.studentId === sid);
                    return p ? p.studentName : sid;
                  });

                  return (
                    <div key={idx} className="p-4 bg-muted/40 border border-border rounded-2xl space-y-2.5 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded uppercase tracking-wider">
                            Nguyên nhân gốc rễ (Root Cause)
                          </span>
                          <h4 className="font-black text-slate-800 text-xs mt-1" title={rootNode ? rootNode.name : group.root_cause_topic_id}>
                            {rootNode ? rootNode.name : group.root_cause_topic_id}
                          </h4>
                        </div>
                        <span className="px-2.5 py-1 bg-slate-900 text-white rounded-xl text-[10px] font-black shrink-0">
                          {group.student_ids.length} Học sinh
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-600 leading-relaxed font-semibold bg-white p-3 rounded-xl border border-slate-100">
                        <span className="font-black text-slate-500 block mb-1">Học sinh thuộc nhóm:</span>
                        {names.join(", ")}
                      </div>
                    </div>
                  );
                })}
                {(!insights.intervention_groups || insights.intervention_groups.length === 0) && (
                  <p className="text-xs text-muted-foreground font-semibold py-4 text-center">Không có nhóm can thiệp cần phân loại.</p>
                )}
              </div>
            </div>

            {/* Support Priority List */}
            <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide flex items-center gap-2">
                <Flame size={15} className="text-rose-500 animate-bounce" />
                <span>Ưu tiên hỗ trợ học sinh ({insights.prioritized_students?.length || 0})</span>
              </h3>
              
              <div className="space-y-2.5">
                {insights.prioritized_students && insights.prioritized_students.map((student: any) => {
                  const p = studentsProgress.find(sp => sp.studentId === student.student_id);
                  const name = p ? p.studentName : student.student_id;
                  const email = p ? p.studentEmail : "";
                  
                  return (
                    <div key={student.student_id} className="p-3.5 bg-rose-50/20 border border-rose-100 rounded-2xl flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <span className="text-xs font-black text-slate-800">{name}</span>
                        <span className="block text-[10px] text-muted-foreground font-semibold">{email}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] font-black text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 uppercase tracking-wider block">
                            Độ khẩn cấp: {student.urgency_score.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(!insights.prioritized_students || insights.prioritized_students.length === 0) && (
                  <p className="text-xs text-muted-foreground font-semibold py-4 text-center">Tất cả học sinh đều đang có tiến độ tốt.</p>
                )}
              </div>
            </div>

          </div>

          {/* Right: Draft Paths & Approval */}
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4 flex flex-col max-h-[700px]">
              <div>
                <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide flex items-center gap-2">
                  <FileText size={15} className="text-emerald-500" />
                  <span>Lộ trình dự thảo của lớp ({draftPaths ? Object.keys(draftPaths).length : 0})</span>
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold">Nhấn duyệt để áp dụng chính thức các lộ trình này xuống tài khoản học sinh</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleApproveLearningPath}
                  disabled={approvingPath || !draftPaths || Object.keys(draftPaths).length === 0}
                  className="w-full py-3 bg-[var(--mint)] hover:brightness-95 active:scale-95 text-foreground font-black text-xs rounded-xl shadow-[var(--shadow-card)] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-center uppercase tracking-wider"
                >
                  {approvingPath ? "Đang duyệt..." : "Duyệt lộ trình cả lớp"}
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
                        <span className="text-xs font-black text-slate-800">{name}</span>
                        <span className="text-[8px] bg-slate-900 text-white font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                          Dự thảo (Draft)
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        {studentPath.ordered_steps && studentPath.ordered_steps.map((step: any, idx: number) => {
                          const stepNode = nodes.find(n => n.id === step.topic_id);
                          return (
                            <div key={idx} className="flex items-center justify-between gap-3 p-2 bg-white border border-slate-100 rounded-xl shadow-sm">
                              <div className="flex items-center gap-2 truncate">
                                <span className="text-[10px] font-black text-slate-400 font-mono w-4 shrink-0">
                                  #{idx + 1}
                                </span>
                                <span className="text-[10px] font-bold text-slate-700 truncate" title={stepNode ? stepNode.name : step.topic_id}>
                                  {stepNode ? stepNode.name : step.topic_id}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleMoveStep(sid, idx, "up")}
                                  disabled={idx === 0}
                                  className="p-1 hover:bg-slate-100 text-slate-500 rounded disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowUp size={11} />
                                </button>
                                <button
                                  onClick={() => handleMoveStep(sid, idx, "down")}
                                  disabled={idx === studentPath.ordered_steps.length - 1}
                                  className="p-1 hover:bg-slate-100 text-slate-500 rounded disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowDown size={11} />
                                </button>
                                <button
                                  onClick={() => handleDeleteStep(sid, idx)}
                                  className="p-1 hover:bg-rose-50 text-rose-500 rounded cursor-pointer"
                                >
                                  <Trash size={11} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {(!studentPath.ordered_steps || studentPath.ordered_steps.length === 0) && (
                          <p className="text-[10px] text-muted-foreground font-semibold text-center py-2">Đã học hết hoặc không cần phụ đạo.</p>
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
  );
}
