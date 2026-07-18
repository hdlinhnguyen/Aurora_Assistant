import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LearningPathTab from "./LearningPathTab";
import { loadAutomaticLearningPathDrafts } from "./learningPathWorkspaceApi";

vi.mock("./learningPathWorkspaceApi", async () => {
  const actual = await vi.importActual<typeof import("./learningPathWorkspaceApi")>("./learningPathWorkspaceApi");
  return { ...actual, loadAutomaticLearningPathDrafts: vi.fn() };
});

describe("LearningPathTab", () => {
  beforeEach(() => {
    vi.mocked(loadAutomaticLearningPathDrafts).mockResolvedValue({
      analysisId: "analysis-1",
      threadId: "thread-1",
      subject: "Toán",
      analyzedAt: new Date().toISOString(),
      drafts: {},
      recommendationsByStudent: {},
      insufficientEvidence: [],
      summary: { reliableStudentCount: 0, draftCount: 0, insufficientEvidenceCount: 0 },
    });
  });

  it("uses the current subject and automatically analyzes the class", async () => {
    render(<LearningPathTab selectedSubject="Toán" nodes={[]} studentsProgress={[]} />);

    expect(screen.getByText("Toán")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tự tạo lộ trình/i })).toBeInTheDocument();
    expect(screen.queryByText(/Chọn môn/i)).not.toBeInTheDocument();
    await waitFor(() => expect(loadAutomaticLearningPathDrafts).toHaveBeenCalledWith("Toán", false));
  });

  it("allows a teacher to edit an automatic draft before approval", async () => {
    vi.mocked(loadAutomaticLearningPathDrafts).mockResolvedValue({
      analysisId: "analysis-2", threadId: "thread-2", subject: "Toán", analyzedAt: new Date().toISOString(),
      drafts: { s1: { ordered_steps: [{ order: 1, topic_id: "t1", current_mastery: .2, target_mastery: .8 }] } },
      recommendationsByStudent: { s1: [{ studentId: "s1", topicId: "t1", mastery: .2, confidence: .8 }] },
      insufficientEvidence: [], summary: { reliableStudentCount: 1, draftCount: 1, insufficientEvidenceCount: 0 },
    });
    render(<LearningPathTab selectedSubject="Toán" nodes={[{ id: "t1", name: "Phân số", isRoot: false } as any]} studentsProgress={[{ studentId: "s1", studentName: "An", studentEmail: "an@test" } as any]} />);

    expect(await screen.findByRole("button", { name: /Chỉnh sửa/i })).toBeInTheDocument();
  });
});
