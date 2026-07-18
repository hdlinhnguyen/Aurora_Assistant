"use client";

import { AlertTriangle, Check, Circle, Lightbulb, LockKeyhole, Play, Target } from "lucide-react";
import type { LearningPathProgressSummary, LearningPathStepStatus } from "../hub/api";

export type { LearningPathProgressSummary } from "../hub/api";

interface Props {
  progress: LearningPathProgressSummary;
  nodeNames: Record<string, string>;
  onStart: (topicId: string) => void;
  startingTopicId?: string | null;
}

const statusLabel: Record<LearningPathStepStatus, string> = {
  pending: "Chờ mở khóa",
  in_progress: "Đang học",
  completed: "Hoàn thành",
  blocked: "Đang bị kẹt",
};

const blockedCopy: Record<string, string> = {
  low_accuracy: "Độ chính xác đang dưới 50% sau 3 lần làm.",
  cant_do: "Em đã đánh dấu chưa thể tự làm bước này.",
  adaptive_downgrade: "Hệ thống đã chuyển về kiến thức nền để củng cố.",
};

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export default function LearningPathProgress({ progress, nodeNames, onStart, startingTopicId }: Props) {
  const next = progress.nextStep;

  return (
    <section className="space-y-3" aria-label="Tiến độ lộ trình">
      <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_58%,#ecfeff_100%)] p-4 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-500">Tiến độ lộ trình</p>
            <p className="mt-1 text-xs font-extrabold text-slate-800">
              {progress.completedSteps}/{progress.totalSteps} bước đã hoàn thành
            </p>
          </div>
          <strong className="font-[var(--font-display)] text-2xl font-black tabular-nums text-indigo-700">
            {progress.completionPercent}%
          </strong>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white ring-1 ring-indigo-100">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#4f46e5,#06b6d4)] transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${Math.max(0, Math.min(100, progress.completionPercent))}%` }}
          />
        </div>
      </div>

      {next && (
        <div className={`rounded-2xl border p-4 shadow-sm ${next.status === "blocked" ? "border-amber-200 bg-amber-50/70" : "border-indigo-200 bg-indigo-50/60"}`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 rounded-xl p-2 ${next.status === "blocked" ? "bg-amber-500 text-white" : "bg-indigo-600 text-white"}`}>
              {next.status === "blocked" ? <AlertTriangle size={15} /> : <Target size={15} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Việc cần làm tiếp theo</p>
              <h4 className="mt-1 truncate text-xs font-black text-slate-900">{nodeNames[next.topicId] ?? "Bài học tiếp theo"}</h4>
              {next.blockedReason && (
                <p className="mt-1.5 text-[10px] font-semibold leading-relaxed text-amber-800">
                  {blockedCopy[next.blockedReason] ?? "Bước này cần thêm hỗ trợ trước khi tiếp tục."}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-bold text-slate-600">
                <span className="rounded-full bg-white/80 px-2 py-1">{next.attempts} lần làm</span>
                <span className="rounded-full bg-white/80 px-2 py-1">{next.correctAnswers} câu đúng</span>
                <span className="rounded-full bg-white/80 px-2 py-1">{next.hintCount} gợi ý</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onStart(next.topicId)}
            disabled={startingTopicId === next.topicId}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-[10px] font-black text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            <Play size={12} fill="currentColor" />
            {startingTopicId === next.topicId ? "Đang mở bài..." : "Học tiếp bước này"}
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <p className="px-1 pb-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Đường ray học tập</p>
        <div className="space-y-0">
          {progress.steps.map((step, index) => {
            const isLast = index === progress.steps.length - 1;
            return (
              <div key={`${step.learningPathId}-${step.topicId}`} className="relative flex gap-3 pb-3 last:pb-0">
                {!isLast && <span className="absolute left-[10px] top-5 h-full w-px bg-slate-200" aria-hidden="true" />}
                <span className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  step.status === "completed" ? "border-emerald-500 bg-emerald-500 text-white" :
                  step.status === "in_progress" ? "border-indigo-500 bg-indigo-50 text-indigo-600" :
                  step.status === "blocked" ? "border-amber-500 bg-amber-50 text-amber-700" :
                  "border-slate-200 bg-white text-slate-400"
                }`}>
                  {step.status === "completed" ? <Check size={11} strokeWidth={3} /> :
                    step.status === "blocked" ? <AlertTriangle size={10} /> :
                    step.status === "pending" ? <LockKeyhole size={9} /> : <Circle size={7} fill="currentColor" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-[10px] font-black text-slate-800">{nodeNames[step.topicId] ?? step.topicId}</span>
                    <span className="shrink-0 text-[8px] font-black uppercase tracking-wide text-slate-400">{statusLabel[step.status]}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[8px] font-bold text-slate-400">
                    <span>Mastery {percent(step.masteryBefore)} → {percent(step.masteryAfter)}</span>
                    <span className="flex items-center gap-1"><Lightbulb size={8} /> {step.hintCount}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
