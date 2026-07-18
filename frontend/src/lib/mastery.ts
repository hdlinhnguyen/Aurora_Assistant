export type MasteryStatus = "unknown" | "uncertain" | "learning" | "confirmed_gap" | "mastered";

export interface TopicMastery {
  studentId: string;
  topicId: string;
  masteryProbability: number;
  confidenceScore: number;
  consistency: number;
  evidenceCount: number;
  effectiveEvidence: number;
  masteryStatus: MasteryStatus;
  evidenceSummary: Record<string, number>;
  sourceBreakdown: Record<string, number>;
  version: number;
  lastEvidenceAt: string | null;
  calculatedAt: string;
}

export interface MasteryHistoryPoint extends TopicMastery {
  recordedAt: string;
  triggerEvidenceId?: string;
}

export type MasteryHistoryRange = "30d" | "90d" | "all";

export const masteryPercent = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 100);

export const masteryStatusLabel: Record<MasteryStatus, string> = {
  unknown: "Chưa có dữ liệu",
  uncertain: "Cần thêm dữ liệu",
  learning: "Đang học",
  confirmed_gap: "Cần hỗ trợ",
  mastered: "Đã thành thạo",
};

export const masteryStatusClass: Record<MasteryStatus, string> = {
  unknown: "bg-slate-100 text-slate-500 border-slate-200",
  uncertain: "bg-amber-50 text-amber-700 border-amber-200",
  learning: "bg-blue-50 text-blue-700 border-blue-200",
  confirmed_gap: "bg-rose-50 text-rose-700 border-rose-200",
  mastered: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
