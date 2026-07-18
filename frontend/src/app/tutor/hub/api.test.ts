import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import { submitAdaptiveDowngrade } from "./api";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

describe("submitAdaptiveDowngrade", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("uses the backend adaptive-downgrade route", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      hasParent: true,
      parentId: "parent-1",
      parentName: "Parent",
    });

    await submitAdaptiveDowngrade("node-123");

    expect(apiFetch).toHaveBeenCalledWith("/nodes/node-123/adaptive-downgrade", {
      method: "POST",
    });
  });
});
