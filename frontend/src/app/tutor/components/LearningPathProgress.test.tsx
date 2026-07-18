import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LearningPathProgress, { type LearningPathProgressSummary } from "./LearningPathProgress";

const progress: LearningPathProgressSummary = {
  completedSteps: 2,
  totalSteps: 5,
  completionPercent: 40,
  nextStep: {
    learningPathId: "path-1",
    topicId: "topic-2",
    stepOrder: 2,
    status: "blocked",
    attempts: 3,
    correctAnswers: 1,
    hintCount: 2,
    masteryBefore: 0.32,
    masteryAfter: 0.48,
    confidenceBefore: 0.2,
    confidenceAfter: 0.41,
    blockedReason: "low_accuracy",
  },
  blockedSteps: [],
  steps: [
    {
      learningPathId: "path-1",
      topicId: "topic-1",
      stepOrder: 1,
      status: "completed",
      attempts: 4,
      correctAnswers: 4,
      hintCount: 0,
      masteryBefore: 0.5,
      masteryAfter: 0.84,
      confidenceBefore: 0.4,
      confidenceAfter: 0.7,
      blockedReason: null,
    },
  ],
};

describe("LearningPathProgress", () => {
  it("shows completion, next work, evidence and blocked reason", () => {
    render(
      <LearningPathProgress
        progress={progress}
        nodeNames={{ "topic-1": "Phân số", "topic-2": "So sánh phân số" }}
        onStart={() => undefined}
      />,
    );

    expect(screen.getByText("40%")) .toBeInTheDocument();
    expect(screen.getByText("Việc cần làm tiếp theo")).toBeInTheDocument();
    expect(screen.getByText("So sánh phân số")).toBeInTheDocument();
    expect(screen.getByText("Độ chính xác đang dưới 50% sau 3 lần làm.")).toBeInTheDocument();
    expect(screen.getByText("3 lần làm")).toBeInTheDocument();
    expect(screen.getByText("1 câu đúng")).toBeInTheDocument();
    expect(screen.getByText("2 gợi ý")).toBeInTheDocument();
  });

  it("starts or continues the next step", () => {
    const onStart = vi.fn();
    render(
      <LearningPathProgress
        progress={progress}
        nodeNames={{ "topic-2": "So sánh phân số" }}
        onStart={onStart}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Học tiếp bước này" }));
    expect(onStart).toHaveBeenCalledWith("topic-2");
  });
});
