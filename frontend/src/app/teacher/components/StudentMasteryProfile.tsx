"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import KnowledgeTree from "../../components/KnowledgeTree";
import MasteryTopicPanel from "../../components/MasteryTopicPanel";
import { apiFetch } from "@/lib/api";
import { MasteryHistoryPoint, MasteryHistoryRange, TopicMastery } from "@/lib/mastery";
import { computeMasteredChains } from "@/lib/masteredChains";

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
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<Array<{ nodeId: string; name: string; topicGroup: string; masteryPct: number; reason: string }>>([]);

  // "Điểm cần chú ý": struggle nodes first, then learning nodes
  const attentionItems = useMemo(() => {
    const order = { struggle: 0, learning: 1 } as const;
    return nodes
      .filter((n) => studentNodeStatus[n.id] === "struggle" || studentNodeStatus[n.id] === "learning")
      .sort((a, b) => order[studentNodeStatus[a.id] as "struggle" | "learning"] - order[studentNodeStatus[b.id] as "struggle" | "learning"])
      .map((n) => {
        const status = studentNodeStatus[n.id] as "struggle" | "learning";
        const acc = nodeAccuracy?.[n.id];
        const pct = acc && acc.total > 0 ? Math.round((acc.correct / acc.total) * 100) : null;
        return { node: n, status, metric: pct !== null ? `${pct}% đúng` : "Chưa có dữ liệu" };
      });
  }, [nodes, studentNodeStatus, nodeAccuracy]);

  const masteredChains = useMemo(
    () => computeMasteredChains(nodes, edges, (id) => studentNodeStatus[id] || "locked"),
    [nodes, edges, studentNodeStatus],
  );
  const collapsedChainMemberCount = masteredChains.reduce((sum, c) => sum + c.memberIds.length, 0);
  const chainHintText =
    masteredChains.length === 1
      ? `${masteredChains[0].memberIds.length} chủ đề nền tảng học sinh đã thành thạo được gộp gọn trên cây. Bấm vào ô "${masteredChains[0].memberIds.length} chủ đề đã hoàn thành" để xem lại chi tiết.`
      : `${collapsedChainMemberCount} chủ đề nền tảng học sinh đã thành thạo được gộp gọn trên cây thành ${masteredChains.length} nhóm. Bấm vào từng ô tóm tắt để xem lại chi tiết.`;

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
    apiFetch(`/teacher/students/${studentId}/review-path?subject=${encodeURIComponent(subject)}`)
      .then((r) => setReviewItems(r?.items || []))
      .catch(() => setReviewItems([]));
  }, [studentId, subject]);

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
          className="absolute right-4 top-4 z-30 flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/90 hover:bg-indigo-100/90 text-indigo-700 px-3.5 py-2 text-xs font-black shadow-sm backdrop-blur transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw size={13} className={recalculating ? "animate-spin text-indigo-600" : "text-indigo-600"} />
          <span>{recalculating ? "Đang tính toán..." : "Cập nhật BKT"}</span>
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
          focusedNodeId={focusedNodeId}
          onFocusedNodeChange={setFocusedNodeId}
          onClearFocus={() => setFocusedNodeId(null)}
          onNodeClick={(node) => {
            setSelectedNode(node);
            setSideView("mastery");
          }}
        />
      </div>

      <div className="w-[380px] flex flex-col gap-3 h-full overflow-y-auto pr-1.5">
        {attentionItems.length > 0 && (
          <div className="bg-card border border-border rounded-3xl p-4.5 shadow-sm shrink-0">
            <div className="font-[var(--font-display)] font-extrabold text-[15px] text-foreground">Điểm cần chú ý</div>
            <div className="text-[11px] font-semibold text-slate-400 mt-1">Ưu tiên xem trước — bấm để phóng vào cây</div>

            <div className="flex flex-col gap-2 mt-3.5">
              {attentionItems.map(({ node, status, metric }) => {
                const active = focusedNodeId === node.id;
                const dot = status === "struggle" ? "bg-rose-600" : "bg-orange-500";
                return (
                  <div
                    key={node.id}
                    onClick={() => {
                      setFocusedNodeId(node.id);
                      setSelectedNode(node);
                      setSideView("mastery");
                    }}
                    className={`cursor-pointer flex items-center gap-2.5 p-3 rounded-2xl border transition-colors ${
                      active ? "bg-indigo-50 border-indigo-200" : "bg-slate-50/70 border-border hover:bg-slate-100/70"
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold text-xs text-foreground truncate">{node.name}</div>
                      <div className="text-[10px] font-semibold text-slate-400 mt-0.5">{metric}</div>
                    </div>
                    <span className="text-sm font-bold text-slate-300 shrink-0">›</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {reviewItems.length > 0 && (
          <div className="bg-card border border-orange-200 rounded-3xl p-4.5 shadow-sm shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px]">🔄</span>
              <div className="font-[var(--font-display)] font-extrabold text-[15px] text-foreground">Đề xuất ôn tập</div>
            </div>
            <div className="text-[11px] font-semibold text-slate-400 mt-1">Xếp theo độ ưu tiên BKT — bấm để phóng vào cây</div>
            <div className="flex flex-col gap-2 mt-3.5">
              {reviewItems.slice(0, 5).map((it, idx) => {
                const active = focusedNodeId === it.nodeId;
                const bar = it.masteryPct >= 70 ? "bg-emerald-500" : it.masteryPct >= 40 ? "bg-orange-500" : "bg-rose-500";
                return (
                  <div
                    key={it.nodeId}
                    onClick={() => {
                      const node = nodes.find((n) => n.id === it.nodeId);
                      setFocusedNodeId(it.nodeId);
                      if (node) setSelectedNode(node as TreeNode);
                      setSideView("mastery");
                    }}
                    className={`cursor-pointer p-3 rounded-2xl border transition-colors ${active ? "bg-orange-50 border-orange-200" : "bg-slate-50/70 border-border hover:bg-orange-50/60"}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`h-5 w-5 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-black ${idx === 0 ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-600"}`}>{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-xs text-foreground truncate">{it.name}</div>
                        <div className="text-[10px] font-semibold text-orange-600 mt-0.5 truncate">{it.reason}</div>
                      </div>
                      <span className="text-[11px] font-black text-slate-500 shrink-0">{it.masteryPct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full mt-2">
                      <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${it.masteryPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {masteredChains.length > 0 && (
          <div className="bg-slate-100 border border-border rounded-2xl px-4 py-3.5 text-[11px] font-semibold text-muted-foreground leading-relaxed shrink-0">
            {chainHintText}
          </div>
        )}

        <div className="self-end flex items-center rounded-xl border border-border bg-card p-1 shadow-sm shrink-0">
          <button type="button" onClick={() => setSideView("mastery")} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-black ${sideView === "mastery" ? "bg-foreground text-background" : "text-muted-foreground"}`}>
            <TrendingUp size={12} /> Năng lực
          </button>
          <button type="button" onClick={() => setSideView("activity")} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-black ${sideView === "activity" ? "bg-foreground text-background" : "text-muted-foreground"}`}>
            <Activity size={12} /> Hoạt động
          </button>
        </div>

        {sideView === "activity" ? (
          <div className="min-h-[300px] flex-1 bg-card border border-border rounded-3xl p-5 overflow-y-auto shadow-sm">{activityContent}</div>
        ) : selectedNode ? (
          <div className="h-[380px] shrink-0 flex flex-col">
            <MasteryTopicPanel
              topicName={selectedNode.name}
              state={masteryByTopic[selectedNode.id]}
              history={history}
              range={range}
              loading={loadingHistory}
              error={historyError}
              onRangeChange={setRange}
            />
          </div>
        ) : (
          <div className="min-h-[140px] py-8 rounded-3xl border border-dashed border-border bg-card p-6 flex items-center justify-center text-center text-[11px] text-muted-foreground shadow-sm">
            Chọn một topic trên cây để xem mastery BKT và biến động theo thời gian.
          </div>
        )}
      </div>
    </div>
  );
}
