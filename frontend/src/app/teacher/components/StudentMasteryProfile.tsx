"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import KnowledgeTree from "../../components/KnowledgeTree";
import MasteryTopicPanel from "../../components/MasteryTopicPanel";
import { apiFetch } from "@/lib/api";
import { MasteryHistoryPoint, MasteryHistoryRange, TopicMastery } from "@/lib/mastery";

interface TreeNode {
  id: string;
  subject: string;
  name: string;
  theory: string;
  topicGroup?: string;
  posX: number;
  posY: number;
  isRoot: boolean;
}

interface TreeEdge {
  id: string;
  subject: string;
  sourceId: string;
  targetId: string;
}

interface StudentMasteryProfileProps {
  studentId: string;
  subject: string;
  nodes: TreeNode[];
  edges: TreeEdge[];
  studentNodeStatus: Record<string, "mastered" | "struggle" | "learning" | "locked" | "initial">;
  nodeAccuracy?: Record<string, { correct: number; incorrect: number; total: number }>;
  initialNodeId?: string;
  currentNodeId?: string;
  activityContent: ReactNode;
}

export default function StudentMasteryProfile({
  studentId,
  subject,
  nodes,
  edges,
  studentNodeStatus,
  nodeAccuracy,
  initialNodeId,
  currentNodeId,
  activityContent,
}: StudentMasteryProfileProps) {
  const [masteryByTopic, setMasteryByTopic] = useState<Record<string, TopicMastery>>({});
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [history, setHistory] = useState<MasteryHistoryPoint[]>([]);
  const [range, setRange] = useState<MasteryHistoryRange>("90d");
  const [sideView, setSideView] = useState<"mastery" | "activity">("mastery");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  const loadProfile = useCallback(async () => {
    const profile = await apiFetch(
      `/teacher/students/${studentId}/mastery?subject=${encodeURIComponent(subject)}`,
    );
    setMasteryByTopic(profile?.topics || {});
  }, [studentId, subject]);

  useEffect(() => {
    loadProfile().catch(() => setMasteryByTopic({}));
  }, [loadProfile]);

  useEffect(() => {
    if (!selectedNode || sideView !== "mastery") return;
    setLoadingHistory(true);
    setHistoryError(null);
    apiFetch(`/teacher/students/${studentId}/mastery/${selectedNode.id}/history?range=${range}`)
      .then((response) => setHistory(response?.history || []))
      .catch((error) => {
        setHistory([]);
        setHistoryError(error.message || "Không thể tải lịch sử năng lực.");
      })
      .finally(() => setLoadingHistory(false));
  }, [range, selectedNode, sideView, studentId]);

  const recalculate = async () => {
    setRecalculating(true);
    try {
      const profile = await apiFetch(`/teacher/students/${studentId}/mastery/recalculate`, {
        method: "POST",
        body: JSON.stringify({ subject }),
      });
      setMasteryByTopic(profile?.topics || {});
      toast.success("Đã cập nhật hồ sơ BKT từ dữ liệu học tập mới nhất.");
    } catch (error: any) {
      toast.error(error.message || "Không thể cập nhật hồ sơ BKT.");
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="flex-1 flex gap-5 overflow-hidden">
      <div className="flex-1 relative bg-card shadow-sm border border-border rounded-3xl overflow-hidden">
        <button
          type="button"
          onClick={recalculate}
          disabled={recalculating}
          className="absolute right-4 top-4 z-30 flex items-center gap-2 rounded-xl border border-border bg-white/95 px-3 py-2 text-[10px] font-black shadow-sm backdrop-blur hover:bg-white disabled:opacity-60"
        >
          <RefreshCw size={13} className={recalculating ? "animate-spin" : ""} />
          {recalculating ? "Đang tính BKT" : "Cập nhật BKT"}
        </button>
        <KnowledgeTree
          subject={subject}
          nodes={nodes}
          edges={edges}
          mode="view-only"
          studentNodeStatus={studentNodeStatus}
          nodeAccuracy={nodeAccuracy}
          masteryByTopic={masteryByTopic}
          initialNodeId={initialNodeId}
          currentNodeId={currentNodeId}
          onNodeClick={(node) => {
            setSelectedNode(node);
            setSideView("mastery");
          }}
        />
      </div>

      <div className="w-[380px] flex flex-col gap-2 overflow-hidden">
        <div className="self-end flex items-center rounded-xl border border-border bg-card p-1 shadow-sm">
          <button type="button" onClick={() => setSideView("mastery")} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-black ${sideView === "mastery" ? "bg-foreground text-background" : "text-muted-foreground"}`}>
            <TrendingUp size={12} /> Năng lực
          </button>
          <button type="button" onClick={() => setSideView("activity")} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-black ${sideView === "activity" ? "bg-foreground text-background" : "text-muted-foreground"}`}>
            <Activity size={12} /> Hoạt động
          </button>
        </div>

        {sideView === "activity" ? (
          <div className="flex-1 bg-card border border-border rounded-3xl p-5 overflow-y-auto shadow-sm">{activityContent}</div>
        ) : selectedNode ? (
          <MasteryTopicPanel
            topicName={selectedNode.name}
            state={masteryByTopic[selectedNode.id]}
            history={history}
            range={range}
            loading={loadingHistory}
            error={historyError}
            onRangeChange={setRange}
          />
        ) : (
          <div className="flex-1 rounded-3xl border border-dashed border-border bg-card p-6 flex items-center justify-center text-center text-[11px] text-muted-foreground">
            Chọn một topic trên cây để xem mastery BKT và biến động theo thời gian.
          </div>
        )}
      </div>
    </div>
  );
}
