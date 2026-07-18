"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import MasteryTopicPanel from "../../components/MasteryTopicPanel";
import { apiFetch } from "@/lib/api";
import { MasteryHistoryPoint, MasteryHistoryRange, TopicMastery } from "@/lib/mastery";

interface StudentMasteryDashboardProps {
  subject: string;
  selectedTopic: { id: string; name: string };
  masteryByTopic: Record<string, TopicMastery>;
  onProfileChange: (topics: Record<string, TopicMastery>) => void;
}

export default function StudentMasteryDashboard({
  subject,
  selectedTopic,
  masteryByTopic,
  onProfileChange,
}: StudentMasteryDashboardProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<MasteryHistoryRange>("90d");
  const [history, setHistory] = useState<MasteryHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/student/mastery?subject=${encodeURIComponent(subject)}`)
      .then((profile) => onProfileChange(profile?.topics || {}))
      .catch(() => onProfileChange({}));
  }, [onProfileChange, subject]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    apiFetch(`/student/mastery/${selectedTopic.id}/history?range=${range}`)
      .then((response) => setHistory(response?.history || []))
      .catch((requestError) => {
        setHistory([]);
        setError(requestError.message || "Không thể tải lịch sử năng lực.");
      })
      .finally(() => setLoading(false));
  }, [open, range, selectedTopic.id]);

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:bg-white transition-colors"
      >
        <span className="flex items-center gap-2 text-[11px] font-black text-slate-700">
          <TrendingUp size={15} className="text-[var(--purple)]" />
          Xem biến động năng lực BKT
        </span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && (
        <div className="mt-3">
          <MasteryTopicPanel
            topicName={selectedTopic.name}
            state={masteryByTopic[selectedTopic.id]}
            history={history}
            range={range}
            loading={loading}
            error={error}
            onRangeChange={setRange}
          />
          <p className="mt-2 px-2 text-[10px] leading-relaxed text-slate-500">
            Mastery là ước lượng từ các bài em đã làm; confidence cho biết hệ thống có đủ minh chứng để tin vào ước lượng đó hay chưa.
          </p>
        </div>
      )}
    </div>
  );
}
