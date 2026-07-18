import { apiFetch } from "./api";

export type TelemetryRange = "7d" | "30d" | "90d";
export type NullableMetric = number | null;

export type TelemetrySummary = {
  activeLearningMinutes: number;
  sessions: number;
  questionsAnswered: number;
  accuracyRate: NullableMetric;
  avgSolveTimeSeconds: NullableMetric;
  hintsPerQuestion: NullableMetric;
  completionRate: NullableMetric;
  abandonmentRate: NullableMetric;
  masteryTransitions: number;
  apiRequests: number;
  apiErrorRate: NullableMetric;
  apiP95LatencyMs: NullableMetric;
};

export type MetricComparison = {
  current: NullableMetric;
  previous: NullableMetric;
  deltaPercent: NullableMetric;
};

export type TelemetryTrendPoint = TelemetrySummary & { date: string };

export type DistributionPoint = { bucket: string; count: number };
export type TopicMetric = {
  topicId: string;
  topicName: string;
  attempts: number;
  accuracyRate: NullableMetric;
  avgSolveTimeSeconds: NullableMetric;
  hintsPerQuestion: NullableMetric;
};
export type SourceMetric = { source: string; events: number };
export type MasteryTransitionMetric = { from: string; to: string; count: number };
export type QualityFlag = { flag: string; count: number };

export type TelemetryEDA = {
  missingPresented: number;
  missingGrade: number;
  invalidDuration: number;
  outlierAttemptCount: number;
  outlierThresholdSeconds: number;
  p50SolveTimeSeconds: NullableMetric;
  p95SolveTimeSeconds: NullableMetric;
  solveTimeDistribution: DistributionPoint[];
  hintDistribution: DistributionPoint[];
  topicBreakdown: TopicMetric[];
  sourceBreakdown: SourceMetric[];
  masteryTransitionBreakdown: MasteryTransitionMetric[];
  qualityFlags: QualityFlag[];
};

export type TelemetryDashboard = {
  range: TelemetryRange;
  generatedAt: string;
  hasData: boolean;
  summary: TelemetrySummary;
  comparison: Record<keyof TelemetrySummary, MetricComparison>;
  trends: TelemetryTrendPoint[];
  eda: TelemetryEDA;
};

export async function fetchTelemetryDashboard(range: TelemetryRange): Promise<TelemetryDashboard> {
  return (await apiFetch(`/admin/telemetry-dashboard?range=${range}`)) as TelemetryDashboard;
}

export type MetricFormat = "count" | "decimal" | "minutes" | "seconds" | "milliseconds";

const oneDecimal = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export function formatMetricValue(value: NullableMetric, format: MetricFormat): string {
  if (value === null || !Number.isFinite(value)) return "—";
  switch (format) {
    case "count":
      return integer.format(value);
    case "minutes":
      return `${oneDecimal.format(value)} phút`;
    case "seconds":
      return `${oneDecimal.format(value)} giây`;
    case "milliseconds":
      return `${integer.format(value)} ms`;
    default:
      return oneDecimal.format(value);
  }
}

export function formatPercent(value: NullableMetric): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${oneDecimal.format(value * 100)}%`;
}

export function formatDelta(value: NullableMetric): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${oneDecimal.format(value)}%`;
}
