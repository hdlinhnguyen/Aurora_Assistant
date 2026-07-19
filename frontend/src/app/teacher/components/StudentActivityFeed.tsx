"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, Clock3, HelpCircle, Lightbulb, MousePointerClick, X, XCircle } from "lucide-react";
import { SafeHtml } from "@/components/ui/safe-html";
import { apiFetch } from "@/lib/api";

interface ActivityLog {
  id: string;
  nodeName: string;
  action: string;
  detail: string;
  createdAt: string;
}

interface QuestionDetail {
  id: string;
  content: string;
  optionsJson: string;
  correctOption: number;
  questionType?: string;
  difficulty?: string;
  nodeName?: string;
  rubricItems?: Array<{ id: string; content?: string; description?: string; points?: string }>;
}

const ACTION_META: Record<string, { label: string; tone: string; icon: any; hint: string }> = {
  answer_correct: {
    label: "Trả lời đúng",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
    hint: "Đã nắm được câu này",
  },
  answer_incorrect: {
    label: "Trả lời sai",
    tone: "bg-rose-50 text-rose-700 border-rose-200",
    icon: XCircle,
    hint: "Cần xem lại cách hiểu",
  },
  click_cant_do: {
    label: "Không làm được",
    tone: "bg-amber-50 text-amber-800 border-amber-200",
    icon: HelpCircle,
    hint: "Học sinh tự báo gặp khó",
  },
  request_hint: {
    label: "Xin gợi ý",
    tone: "bg-violet-50 text-violet-700 border-violet-200",
    icon: Lightbulb,
    hint: "Cần trợ giúp từng bước",
  },
  warning_gap: {
    label: "Cảnh báo hổng",
    tone: "bg-orange-50 text-orange-700 border-orange-200",
    icon: AlertTriangle,
    hint: "Có dấu hiệu hổng nền tảng",
  },
  click_node: {
    label: "Mở bài học",
    tone: "bg-sky-50 text-sky-700 border-sky-200",
    icon: MousePointerClick,
    hint: "Điều hướng học tập",
  },
};

function actionMeta(action: string) {
  return ACTION_META[action] ?? {
    label: action.replaceAll("_", " "),
    tone: "bg-slate-50 text-slate-700 border-slate-200",
    icon: MousePointerClick,
    hint: "Hoạt động khác",
  };
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Không rõ thời gian";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function shortId(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 12 ? `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}` : trimmed;
}

function parseLogDetail(detail: string) {
  const text = (detail || "").trim();
  const uuidMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const selectedMatch = text.match(/(?:Phương án chọn|phuong an chon|chọn|chon)\D*([a-eA-E]|\d+)/i);
  const correctMatch = text.match(/(?:Đáp án đúng|dap an dung)\D*([a-eA-E]|\d+)/i);
  const embeddedQuestion = text.match(/['"]([^'"]{8,})['"]/)?.[1] ?? "";

  return {
    questionId: uuidMatch?.[0] ?? "",
    selectedRaw: selectedMatch?.[1] ?? "",
    correctRaw: correctMatch?.[1] ?? "",
    embeddedQuestion,
  };
}

function parseOptions(question?: QuestionDetail | null) {
  if (!question?.optionsJson) return [];
  try {
    const parsed = JSON.parse(question.optionsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => (typeof item === "object" && item !== null && "content" in item ? String(item.content) : String(item)));
  } catch {
    return [];
  }
}

function optionMatches(raw: string, index: number) {
  const token = raw.trim().toLowerCase();
  if (!token) return false;
  return token === String(index) || token === String.fromCharCode(97 + index);
}

function detailRows(log: ActivityLog) {
  const detail = (log.detail || "").trim();
  const parsed = parseLogDetail(detail);
  const rows: Array<{ label: string; value: string; muted?: boolean }> = [];

  if (parsed.questionId) {
    rows.push({ label: "Câu hỏi", value: shortId(parsed.questionId), muted: true });
  }
  if (parsed.selectedRaw) {
    rows.push({ label: "Đáp án đã chọn", value: parsed.selectedRaw });
  }
  if (log.action === "click_cant_do") {
    rows.push({ label: "Tín hiệu", value: "Bấm Không làm được tại bài này" });
  }

  if (rows.length === 0 && detail) {
    rows.push({ label: "Chi tiết", value: detail });
  }
  return rows;
}

export default function StudentActivityFeed({ logs }: { logs: ActivityLog[] }) {
  const [selectedLog, setSelectedLog] = React.useState<ActivityLog | null>(null);
  const [selectedQuestion, setSelectedQuestion] = React.useState<QuestionDetail | null>(null);
  const [questionLoading, setQuestionLoading] = React.useState(false);
  const [questionError, setQuestionError] = React.useState("");
  const correctCount = logs.filter((log) => log.action === "answer_correct").length;
  const incorrectCount = logs.filter((log) => log.action === "answer_incorrect").length;
  const cantDoCount = logs.filter((log) => log.action === "click_cant_do").length;
  const supportCount = incorrectCount + cantDoCount;

  async function openLog(log: ActivityLog) {
    const parsed = parseLogDetail(log.detail);
    setSelectedLog(log);
    setSelectedQuestion(null);
    setQuestionError("");
    if (!parsed.questionId) return;

    setQuestionLoading(true);
    try {
      const question = await apiFetch(`/teacher/question-bank/questions/${parsed.questionId}`);
      setSelectedQuestion(question);
    } catch (err: any) {
      setQuestionError(err?.message || "Không tải được nội dung câu hỏi.");
    } finally {
      setQuestionLoading(false);
    }
  }

  const parsedSelectedLog = selectedLog ? parseLogDetail(selectedLog.detail) : null;
  const options = parseOptions(selectedQuestion);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest">Log chi tiết hoạt động</h3>
          <p className="mt-1 text-[10px] font-semibold text-muted-foreground">Tín hiệu gần nhất để giáo viên can thiệp đúng lúc.</p>
        </div>
        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-black text-foreground">
          {logs.length} lượt
        </span>
      </div>

      {logs.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Đúng</div>
            <div className="mt-0.5 text-lg font-black text-emerald-800">{correctCount}</div>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-rose-50/60 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-wider text-rose-700">Sai</div>
            <div className="mt-0.5 text-lg font-black text-rose-800">{incorrectCount}</div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-wider text-amber-700">Cần hỗ trợ</div>
            <div className="mt-0.5 text-lg font-black text-amber-900">{supportCount}</div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {logs.length > 0 ? logs.map((log) => {
          const meta = actionMeta(log.action);
          const Icon = meta.icon;
          const rows = detailRows(log);
          const parsed = parseLogDetail(log.detail);
          return (
            <button
              key={log.id}
              type="button"
              onClick={() => openLog(log)}
              className="group w-full p-3.5 bg-card border border-border rounded-2xl text-left text-[11px] leading-relaxed space-y-2 shadow-sm hover:border-slate-300 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <span className="font-black text-foreground block truncate" title={log.nodeName || "Chưa rõ bài học"}>
                    {log.nodeName || "Chưa rõ bài học"}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-semibold text-muted-foreground">{meta.hint}</span>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[8.5px] font-black uppercase tracking-wider ${meta.tone}`}>
                  <Icon size={11} />
                  {meta.label}
                </span>
              </div>

              {rows.length > 0 && (
                <div className="rounded-xl bg-muted/55 border border-border/70 px-3 py-2 space-y-1.5">
                  {rows.map((row) => (
                    <div key={`${log.id}-${row.label}`} className="flex items-start justify-between gap-3">
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-muted-foreground">{row.label}</span>
                      <span className={`text-right font-bold ${row.muted ? "font-mono text-[10px] text-slate-500" : "text-slate-700"}`} title={row.value}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-semibold">
                  <Clock3 size={10} />
                  {formatTime(log.createdAt)}
                </div>
                <span className="text-[9px] font-black text-violet-700 opacity-0 group-hover:opacity-100 transition-opacity">
                  {parsed.questionId || parsed.embeddedQuestion ? "Xem câu hỏi" : "Xem chi tiết"}
                </span>
              </div>
            </button>
          );
        }) : (
          <div className="text-center py-12 text-muted-foreground text-xs font-bold border border-dashed border-border rounded-2xl">
            Chưa ghi nhận hoạt động nào của học sinh.
          </div>
        )}
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border bg-muted/40 px-5 py-4">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Chi tiết hoạt động</div>
                <h4 className="mt-1 truncate text-sm font-black text-foreground">{selectedLog.nodeName || "Chưa rõ bài học"}</h4>
                <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{formatTime(selectedLog.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-full border border-border bg-white p-2 text-muted-foreground hover:bg-slate-50 hover:text-foreground"
                title="Đóng"
              >
                <X size={14} />
              </button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto p-5">
              {questionLoading ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs font-bold text-muted-foreground">
                  Đang tải nội dung câu hỏi...
                </div>
              ) : selectedQuestion ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-white p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase text-slate-600">
                        {selectedQuestion.difficulty || "question"}
                      </span>
                      {selectedQuestion.nodeName && (
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[9px] font-black uppercase text-violet-700">
                          {selectedQuestion.nodeName}
                        </span>
                      )}
                    </div>
                    <SafeHtml text={selectedQuestion.content} className="text-sm font-bold leading-relaxed text-slate-900" />
                  </div>

                  {options.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {options.map((option, index) => {
                        const isCorrect = index === selectedQuestion.correctOption;
                        const isSelected = optionMatches(parsedSelectedLog?.selectedRaw || "", index);
                        return (
                          <div
                            key={index}
                            className={`rounded-2xl border p-3 text-xs font-semibold ${
                              isCorrect
                                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                : isSelected
                                  ? "border-rose-200 bg-rose-50 text-rose-900"
                                  : "border-border bg-white text-slate-700"
                            }`}
                          >
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <span className="font-black">{String.fromCharCode(65 + index)}.</span>
                              <div className="flex gap-1.5">
                                {isSelected && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black text-rose-700">HS chọn</span>}
                                {isCorrect && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">Đáp án đúng</span>}
                              </div>
                            </div>
                            <SafeHtml as="span" text={option} />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4 text-xs font-semibold text-violet-900">
                      Câu tự luận hoặc câu chưa có danh sách phương án.
                    </div>
                  )}

                  {selectedQuestion.rubricItems && selectedQuestion.rubricItems.length > 0 && (
                    <div className="rounded-2xl border border-border bg-muted/40 p-4">
                      <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Barem / ý chấm</div>
                      <div className="space-y-2">
                        {selectedQuestion.rubricItems.map((rubric) => (
                          <div key={rubric.id} className="rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                            {rubric.content || rubric.description}
                            {rubric.points && <span className="float-right font-black text-violet-700">{rubric.points}đ</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {parsedSelectedLog?.embeddedQuestion ? (
                    <div className="rounded-2xl border border-border bg-white p-4">
                      <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Câu hỏi từ log</div>
                      <SafeHtml text={parsedSelectedLog.embeddedQuestion} className="text-sm font-bold leading-relaxed text-slate-900" />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs font-bold text-muted-foreground">
                      Log này chưa có mã hoặc nội dung câu hỏi để hiển thị.
                    </div>
                  )}
                  {questionError && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                      {questionError}
                    </div>
                  )}
                  <div className="rounded-2xl border border-border bg-muted/50 p-4 text-xs font-semibold text-slate-700">
                    {selectedLog.detail || "Không có chi tiết bổ sung."}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
