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
});
