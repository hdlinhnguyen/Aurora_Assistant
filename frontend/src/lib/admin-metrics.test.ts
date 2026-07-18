import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./api";
import {
  fetchTelemetryDashboard,
  formatDelta,
  formatMetricValue,
  formatPercent,
} from "./admin-metrics";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

describe("admin telemetry metrics client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requests the selected range", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ range: "7d" });

    await fetchTelemetryDashboard("7d");

    expect(apiFetch).toHaveBeenCalledWith("/admin/telemetry-dashboard?range=7d");
  });

  it("formats null, percentages and deltas safely", () => {
    expect(formatMetricValue(null, "seconds")).toBe("—");
    expect(formatPercent(0.734)).toBe("73,4%");
    expect(formatDelta(null)).toBe("—");
    expect(formatDelta(-6.77)).toBe("-6,8%");
  });

  it("formats counts and durations using Vietnamese locale", () => {
    expect(formatMetricValue(1240, "count")).toBe("1.240");
    expect(formatMetricValue(48.24, "seconds")).toBe("48,2 giây");
    expect(formatMetricValue(420, "milliseconds")).toBe("420 ms");
  });
});
