"use client";

import React from "react";
import { Upload, FileJson, Pencil, Tags, Trash } from "lucide-react";

import { NodeItem, Question } from "../page";

interface QuestionBankTabProps {
  selectedSubject: string;
  nodes: NodeItem[];
  subjectQuestions: Question[];
  qbSearchText: string;
  setQbSearchText: (v: string) => void;
  qbFilterNodeId: string;
  setQbFilterNodeId: (v: string) => void;
  qbFilterDifficulty: string;
  setQbFilterDifficulty: (v: string) => void;
  handleStartAddQuestion: () => void;
  handleDownloadTemplate: () => void;
  handleExcelImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleMasterBankImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleStartEditQuestion: (q: Question) => void;
  handleDeleteQuestion: (qId: string) => void;
  handleTagQuestion: (q: Question) => void;
  setEditingNode: (node: NodeItem | null) => void;
  formatDate: (dateStr?: string) => string;
}

export default function QuestionBankTab({
  selectedSubject,
  nodes,
  subjectQuestions,
  qbSearchText,
  setQbSearchText,
  qbFilterNodeId,
  setQbFilterNodeId,
  qbFilterDifficulty,
  setQbFilterDifficulty,
  handleStartAddQuestion,
  handleDownloadTemplate,
  handleExcelImport,
  handleMasterBankImport,
  handleStartEditQuestion,
  handleDeleteQuestion,
  handleTagQuestion,
  setEditingNode,
  formatDate,
}: QuestionBankTabProps) {
  const [questionTypeFilter, setQuestionTypeFilter] = React.useState("");
  const filtered = subjectQuestions.filter(q => {
    const matchSearch = qbSearchText ? q.content.toLowerCase().includes(qbSearchText.toLowerCase()) : true;
    const matchNode = qbFilterNodeId ? q.nodeId === qbFilterNodeId : true;
    const matchDiff = qbFilterDifficulty ? q.difficulty.toLowerCase() === qbFilterDifficulty.toLowerCase() : true;
    const matchType = questionTypeFilter
      ? (q.questionType || "multiple_choice") === questionTypeFilter
      : true;
    return matchSearch && matchNode && matchDiff && matchType;
  });

  const formatMarkdown = (text: string): string => {
    if (!text) return "";
    let html = text;

    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

    const renderMathExpr = (expr: string) => {
      let m = expr;
      m = m.replace(/\\d?frac\{([^}]+)\}\{([^}]+)\}/g, (_match, num, den) => {
        return `<span class="inline-flex flex-col items-center align-middle mx-1 font-semibold text-[12px] leading-tight font-sans">
          <span class="border-b border-indigo-700 px-1 text-center pb-0.5">${num}</span>
          <span class="px-1 text-center pt-0.5">${den}</span>
        </span>`;
      });
      m = m.replace(/\\cdot/g, "·");
      m = m.replace(/\\neq/g, "≠");
      m = m.replace(/\\Rightarrow|\\implies/g, "⇒");
      m = m.replace(/\\le|\\leq/g, "≤");
      m = m.replace(/\\ge|\\geq/g, "≥");
      m = m.replace(/\\times/g, "×");
      m = m.replace(/\\div/g, "÷");

      return `<span class="font-mono bg-indigo-50/70 text-indigo-900 px-1.5 py-0.5 rounded text-[11px] font-bold border border-indigo-200/60 mx-0.5 inline-flex items-center">${m}</span>`;
    };

    html = html.replace(/\$(.*?)\$/g, (_match, p1) => {
      return renderMathExpr(p1);
    });

    html = html.replace(/\n/g, "<br />");
    return html;
  };

  return (
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
            <option value="easy">Nhận biết</option>
            <option value="medium">Thông hiểu</option>
            <option value="hard">Vận dụng</option>
            <option value="very_hard">Vận dụng cao</option>
          </select>

          <select
            value={questionTypeFilter}
            onChange={(e) => setQuestionTypeFilter(e.target.value)}
            className="px-4 py-2 border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[var(--mint)] font-bold text-foreground bg-white"
          >
            <option value="">Tất cả loại câu</option>
            <option value="multiple_choice">Trắc nghiệm</option>
            <option value="essay">Tự luận</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleStartAddQuestion}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            ➕ Thêm câu hỏi
          </button>

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

          <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-black transition-all shadow-md flex items-center gap-1.5 cursor-pointer">
            <FileJson size={14} /> Import Master Bank
            <input
              type="file"
              accept=".json"
              onChange={handleMasterBankImport}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Question List Area */}
      <div className="flex-1 bg-card border border-border rounded-3xl p-6 shadow-sm overflow-y-auto space-y-4">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground font-semibold">
            Không tìm thấy câu hỏi nào phù hợp với bộ lọc.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(q => {
              const matchedNode = nodes.find(n => n.id === q.nodeId);
              let opts = ["", "", "", ""];
              try {
                opts = JSON.parse(q.optionsJson);
              } catch (e) {}

              return (
                <div key={q.id} className="p-4 border border-border rounded-2xl bg-white hover:shadow-md transition-shadow flex flex-col justify-between gap-3 shadow-sm">
                  <div className="space-y-2.5">
                    {/* Row 1: Badges & metadata */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-100 text-[9px] text-slate-500 font-extrabold">
                          {selectedSubject}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-[9px] text-slate-600 font-black uppercase select-text" title={matchedNode ? matchedNode.name : "Chủ đề ẩn"}>
                          {matchedNode ? matchedNode.name : "Chủ đề ẩn"}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border shrink-0 ${
                        q.difficulty === "easy"
                          ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                          : q.difficulty === "medium"
                          ? "bg-amber-50 text-amber-600 border-amber-100"
                          : q.difficulty === "hard"
                          ? "bg-orange-50 text-orange-600 border-orange-100"
                          : "bg-rose-50 text-rose-600 border-rose-100"
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

                    {/* Content */}
                    <div 
                      className="text-xs font-bold text-slate-800 leading-relaxed" 
                      title={q.content}
                      dangerouslySetInnerHTML={{ __html: formatMarkdown(q.content) }}
                    />

                    {/* Options */}
                    {(q.questionType || "multiple_choice") === "essay" ? (
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[10px] font-bold text-indigo-800">
                        {q.rubricItems?.length || 0} ý trong barem
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5">
                        {opts.map((opt, oIdx) => (
                          <div
                            key={oIdx}
                            className={`p-2 rounded-xl text-[10px] font-semibold border truncate ${oIdx === q.correctOption
                                ? "bg-emerald-50/50 border-emerald-200 text-emerald-800 font-bold"
                                : "bg-slate-50 border-slate-100 text-slate-600"
                              }`}
                            title={opt}
                          >
                            <span className="font-extrabold mr-1">{String.fromCharCode(65 + oIdx)}.</span>
                            <span dangerouslySetInnerHTML={{ __html: formatMarkdown(opt) }} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Bottom meta & actions */}
                  <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                    <span className="text-[8px] text-slate-400 font-bold">
                      Cập nhật: {formatDate((q as any).updatedAt || (q as any).createdAt)}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTagQuestion(q)}
                        className="p-1.5 rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all cursor-pointer"
                        title="Gắn topic thủ công"
                      >
                        <Tags size={12} />
                      </button>
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
