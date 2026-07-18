import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchTelemetryDashboard,
  type TelemetryDashboard as DashboardData,
  type TelemetryRange,
  type TelemetrySummary,
} from "@/lib/admin-metrics";
import TelemetryDashboard from "./TelemetryDashboard";

vi.mock("@/lib/admin-metrics", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/admin-metrics")>();
  return { ...original, fetchTelemetryDashboard: vi.fn() };
});

const summary: TelemetrySummary = {
  activeLearningMinutes: 1240.5,
  sessions: 385,
  questionsAnswered: 924,
  accuracyRate: 0.734,
  avgSolveTimeSeconds: 48.2,
  hintsPerQuestion: 0.64,
  completionRate: 0.91,
  abandonmentRate: 0.08,
  masteryTransitions: 74,
  apiRequests: 3600,
  apiErrorRate: 0.012,
  apiP95LatencyMs: 420,
};

function fixture(range: TelemetryRange = "30d", hasData = true): DashboardData {
  const comparison = Object.fromEntries(
    Object.entries(summary).map(([key, value]) => [
      key,
      { current: value, previous: typeof value === "number" ? value * 0.9 : null, deltaPercent: 11.1 },
    ]),
  ) as DashboardData["comparison"];
  return {
    range,
    generatedAt: "2026-07-18T10:00:00Z",
    hasData,
    summary,
    comparison,
    trends: hasData ? [{ date: "2026-07-18", ...summary }] : [],
    eda: {
      missingPresented: 3,
      missingGrade: 5,
      invalidDuration: 1,
      outlierAttemptCount: 7,
      outlierThresholdSeconds: 300,
      p50SolveTimeSeconds: 35,
      p95SolveTimeSeconds: 180,
      solveTimeDistribution: [{ bucket: "30-60s", count: 42 }],
      hintDistribution: [{ bucket: "0", count: 70 }],
      topicBreakdown: [
        { topicId: "topic-1", topicName: "Phân số", attempts: 42, accuracyRate: 0.68, avgSolveTimeSeconds: 57, hintsPerQuestion: 0.8 },
      ],
      sourceBreakdown: [{ source: "frontend", events: 1200 }],
      masteryTransitionBreakdown: [{ from: "learning", to: "mastered", count: 21 }],
      qualityFlags: [{ flag: "missing_grade", count: 5 }],
    },
  };
}

describe("TelemetryDashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads 30 days by default and changes range", async () => {
    vi.mocked(fetchTelemetryDashboard).mockImplementation(async (range) => fixture(range));
    const user = userEvent.setup();

    render(<TelemetryDashboard />);

    await waitFor(() => expect(fetchTelemetryDashboard).toHaveBeenCalledWith("30d"));
    await user.click(screen.getByRole("button", { name: "7 ngày" }));
    await waitFor(() => expect(fetchTelemetryDashboard).toHaveBeenLastCalledWith("7d"));
  });

  it("shows an explicit empty state without charts", async () => {
    vi.mocked(fetchTelemetryDashboard).mockResolvedValue(fixture("30d", false));

    render(<TelemetryDashboard />);

    expect(await screen.findByText(/Chưa đủ dữ liệu trong khoảng thời gian này/i)).toBeInTheDocument();
    expect(screen.queryByTestId("telemetry-trend-chart")).not.toBeInTheDocument();
  });

  it("offers retry after an API error", async () => {
    vi.mocked(fetchTelemetryDashboard)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(fixture());
    const user = userEvent.setup();

    render(<TelemetryDashboard />);

    await user.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Phân số")).toBeInTheDocument();
  });

  it("renders KPI and EDA sections from aggregate data", async () => {
    vi.mocked(fetchTelemetryDashboard).mockResolvedValue(fixture());

    render(<TelemetryDashboard />);

    expect(await screen.findByText("73,4%")).toBeInTheDocument();
    expect(screen.getByText("Chất lượng dữ liệu")).toBeInTheDocument();
    expect(screen.getByText("Phân số")).toBeInTheDocument();
    expect(screen.getByText("learning → mastered")).toBeInTheDocument();
  });
});
