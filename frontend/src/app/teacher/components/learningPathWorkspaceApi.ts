import { apiFetch } from "@/lib/api";

export interface WeakTopicView {
  studentId: string;
  topicId: string;
  mastery: number;
  confidence: number;
}

export interface LearningPathDraft {
  status?: string;
  ordered_steps?: Array<{
    order: number;
    topic_id: string;
    current_mastery?: number;
    current_confidence?: number;
    target_mastery?: number;
    inclusion_reason?: string;
    estimated_minutes?: number;
  }>;
}

export interface AutomaticDraftResponse {
  analysisId: string;
  threadId: string;
  subject: string;
  analyzedAt: string;
  drafts: Record<string, LearningPathDraft>;
  recommendationsByStudent: Record<string, WeakTopicView[]>;
  insufficientEvidence: WeakTopicView[];
  summary: {
    reliableStudentCount: number;
    draftCount: number;
    insufficientEvidenceCount: number;
  };
}

export const loadAutomaticLearningPathDrafts = (subject: string, refresh = false) =>
  apiFetch("/teacher/learning-path/auto-drafts", {
    method: "POST",
    body: JSON.stringify({ subject, refresh }),
  }) as Promise<AutomaticDraftResponse>;

export const approveLearningPathDrafts = (
  threadId: string,
  studentIds: string[],
  paths: Record<string, LearningPathDraft>,
) => apiFetch(`/teacher/learning-path/${threadId}/approve`, {
  method: "POST",
  body: JSON.stringify({
    approve: true,
    note: "Phê duyệt bởi giáo viên",
    studentIds,
    custom_paths: paths,
  }),
});

export const skipLearningPathDrafts = (threadId: string, studentIds: string[]) =>
  apiFetch(`/teacher/learning-path/${threadId}/approve`, {
    method: "POST",
    body: JSON.stringify({
      approve: false,
      note: "Bỏ qua bởi giáo viên",
      studentIds,
      custom_paths: {},
    }),
  });

export const createManualLearningPathDraft = (subject: string, studentIds: string[], targetTopicIds: string[]) =>
  apiFetch("/teacher/learning-path", {
    method: "POST",
    body: JSON.stringify({ subject, studentIds, targetTopicIds }),
  });
