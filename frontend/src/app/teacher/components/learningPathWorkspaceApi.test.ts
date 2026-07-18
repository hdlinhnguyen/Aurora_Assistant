import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import {
  approveLearningPathDrafts,
  createManualLearningPathDraft,
  loadAutomaticLearningPathDrafts,
  skipLearningPathDrafts,
} from "./learningPathWorkspaceApi";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

describe("learningPathWorkspaceApi", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("loads automatic drafts for the current subject", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ drafts: {} });
    await loadAutomaticLearningPathDrafts("Toán", true);
    expect(apiFetch).toHaveBeenCalledWith("/teacher/learning-path/auto-drafts", {
      method: "POST",
      body: JSON.stringify({ subject: "Toán", refresh: true }),
    });
  });

  it("approves and skips only selected students", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ status: "partial" });
    await approveLearningPathDrafts("thread-1", ["s1"], { s1: { ordered_steps: [] } });
    expect(apiFetch).toHaveBeenCalledWith("/teacher/learning-path/thread-1/approve", expect.objectContaining({
      body: JSON.stringify({ approve: true, note: "Phê duyệt bởi giáo viên", studentIds: ["s1"], custom_paths: { s1: { ordered_steps: [] } } }),
    }));
    await skipLearningPathDrafts("thread-1", ["s2"]);
    expect(apiFetch).toHaveBeenLastCalledWith("/teacher/learning-path/thread-1/approve", expect.objectContaining({
      body: JSON.stringify({ approve: false, note: "Bỏ qua bởi giáo viên", studentIds: ["s2"], custom_paths: {} }),
    }));
  });

  it("creates manual drafts with the current subject", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ paths: {} });
    await createManualLearningPathDraft("Toán", ["s1"], ["t1"]);
    expect(apiFetch).toHaveBeenCalledWith("/teacher/learning-path", {
      method: "POST",
      body: JSON.stringify({ subject: "Toán", studentIds: ["s1"], targetTopicIds: ["t1"] }),
    });
  });
});
