"use client";

import { X, TrendingUp, Database, ShieldCheck, Clock3 } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  MasteryHistoryPoint,
  MasteryHistoryRange,
  TopicMastery,
  masteryPercent,
  masteryStatusClass,
  masteryStatusLabel,
} from "@/lib/mastery";

interface MasteryTopicPanelProps {
  topicName: string;
  state?: TopicMastery | null;
  history: MasteryHistoryPoint[];
  range: MasteryHistoryRange;
  loading?: boolean;
  error?: string | null;
  onRangeChange: (range: MasteryHistoryRange) => void;
  onClose?: () => void;
}

export default function MasteryTopicPanel({
  topicName,
  state,
  history,
  range,
  loading = false,
  error = null,
  onRangeChange,
  onClose,
}: MasteryTopicPanelProps) {
  const chartData = history.map((point) => ({
    ...point,
    label: new Date(point.recordedAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
    mastery: masteryPercent(point.masteryProbability),
    confidence: masteryPercent(point.confidenceScore),
  }));

  return (
    <aside className="w-full max-w-[380px] bg-card border border-border rounded-3xl shadow-[var(--shadow-card)] overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-border bg-[var(--mint)]/10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.18em] font-black text-[var(--purple)] flex items-center gap-1.5">
            <TrendingUp size={12} /> Hồ sơ năng lực
          </div>
          <h3 className="mt-1 text-sm font-black text-foreground truncate">{topicName}</h3>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Đóng chi tiết" className="p-1.5 rounded-lg hover:bg-white/70 text-muted-foreground">
            <X size={15} />
          </button>
        )}
      </div>

      <div className="p-5 space-y-4 overflow-y-auto">
        {state ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-border bg-white p-3">
                <div className="text-3xl font-black tabular-nums">{masteryPercent(state.masteryProbability)}%</div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground">Mastery BKT</div>
              </div>
              <div className="rounded-2xl border border-border bg-white p-3">
                <div className="text-3xl font-black tabular-nums">{masteryPercent(state.confidenceScore)}%</div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground">Độ tin cậy</div>
              </div>
            </div>

            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black ${masteryStatusClass[state.masteryStatus]}`}>
              <ShieldCheck size={12} /> {masteryStatusLabel[state.masteryStatus]}
            </span>

            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div className="flex items-center gap-2 text-muted-foreground"><Database size={14} /><span><b className="text-foreground">{state.evidenceCount}</b> minh chứng</span></div>
              <div className="flex items-center gap-2 text-muted-foreground"><Clock3 size={14} /><span>{new Date(state.calculatedAt).toLocaleDateString("vi-VN")}</span></div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Biến động mastery</div>
              <div className="flex items-center gap-1 rounded-xl border border-border bg-white p-1">
                {(["30d", "90d", "all"] as MasteryHistoryRange[]).map((item) => (
                  <button key={item} type="button" onClick={() => onRangeChange(item)} className={`px-2 py-1 rounded-lg text-[9px] font-black ${range === item ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}>
                    {item === "all" ? "Tất cả" : item}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="h-40 rounded-2xl bg-muted/40 animate-pulse" />
            ) : error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[11px] text-rose-700">{error}</div>
            ) : chartData.length > 0 ? (
              <div className="h-44 rounded-2xl border border-border bg-white p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value, name) => [`${value}%`, name === "mastery" ? "Mastery" : "Tin cậy"]} />
                    <Line type="monotone" dataKey="mastery" stroke="var(--purple)" strokeWidth={3} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="confidence" stroke="var(--mint)" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center text-[11px] text-muted-foreground">Chưa có đủ lịch sử để vẽ biến động.</div>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center text-[11px] text-muted-foreground">Chưa có dữ liệu BKT cho topic này.</div>
        )}
      </div>
    </aside>
  );
}
