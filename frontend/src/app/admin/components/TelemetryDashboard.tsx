"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  Clock3,
  Gauge,
  Lightbulb,
  RefreshCw,
  Route,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  fetchTelemetryDashboard,
  formatDelta,
  formatMetricValue,
  formatPercent,
  type MetricFormat,
  type TelemetryDashboard as DashboardData,
  type TelemetryRange,
  type TelemetrySummary,
  type TopicMetric,
} from "@/lib/admin-metrics";

type TrendMetricKey =
  | "activeLearningMinutes"
  | "accuracyRate"
  | "avgSolveTimeSeconds"
  | "hintsPerQuestion"
  | "apiErrorRate"
  | "apiP95LatencyMs";

type TopicSortKey = "attempts" | "accuracyRate" | "avgSolveTimeSeconds" | "hintsPerQuestion";

const ranges: Array<{ value: TelemetryRange; label: string }> = [
  { value: "7d", label: "7 ngày" },
  { value: "30d", label: "30 ngày" },
  { value: "90d", label: "90 ngày" },
];

const trendMetrics: Record<TrendMetricKey, { label: string; color: string; format: MetricFormat | "percent" }> = {
  activeLearningMinutes: { label: "Phút học chủ động", color: "#7c5ce7", format: "minutes" },
  accuracyRate: { label: "Độ chính xác", color: "#15a27a", format: "percent" },
  avgSolveTimeSeconds: { label: "Thời gian giải", color: "#e17b32", format: "seconds" },
  hintsPerQuestion: { label: "Gợi ý mỗi câu", color: "#2979c9", format: "decimal" },
  apiErrorRate: { label: "Tỷ lệ lỗi API", color: "#d24d57", format: "percent" },
  apiP95LatencyMs: { label: "P95 API", color: "#6d7785", format: "milliseconds" },
};

export default function TelemetryDashboard() {
  const [range, setRange] = useState<TelemetryRange>("30d");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [trendMetric, setTrendMetric] = useState<TrendMetricKey>("activeLearningMinutes");
  const [topicSort, setTopicSort] = useState<TopicSortKey>("attempts");
  const requestID = useRef(0);

  useEffect(() => {
    const id = ++requestID.current;
    setLoading(true);
    setError(false);
    void fetchTelemetryDashboard(range)
      .then((response) => {
        if (requestID.current === id) setData(response);
      })
      .catch(() => {
        if (requestID.current === id) setError(true);
      })
      .finally(() => {
        if (requestID.current === id) setLoading(false);
      });
  }, [range, reloadKey]);

  const sortedTopics = useMemo(() => {
    if (!data) return [];
    return [...data.eda.topicBreakdown].sort((left, right) => {
      const leftValue = left[topicSort] ?? -1;
      const rightValue = right[topicSort] ?? -1;
      if (rightValue !== leftValue) return rightValue - leftValue;
      return left.topicName.localeCompare(right.topicName, "vi");
    });
  }, [data, topicSort]);

  if (loading && !data) return <DashboardSkeleton />;

  if (error && !data) {
    return (
      <section className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-8 text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-rose-500" />
        <h2 className="mt-3 text-xl font-bold">Không tải được dữ liệu phân tích</h2>
        <p className="mt-2 text-sm text-muted-foreground">Kiểm tra kết nối tới máy chủ rồi thử tải lại.</p>
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          className="mt-5 rounded-xl bg-foreground px-5 py-2.5 text-sm font-bold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Thử lại
        </button>
      </section>
    );
  }

  if (!data) return null;

  return (
    <section className={`space-y-6 transition-opacity ${loading ? "opacity-55" : "opacity-100"}`} aria-busy={loading}>
      <header className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)] md:p-8">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--purple),var(--mint),#f59e0b)]" />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--purple)]/20 bg-[var(--purple)]/8 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--purple)]">
              <Activity className="h-3.5 w-3.5" /> Tín hiệu học tập trực tiếp
            </div>
            <h2 className="font-[var(--font-display)] text-3xl font-extrabold tracking-tight">Metrics & EDA</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Theo dõi hành vi học tập, chất lượng dữ liệu và sức khỏe API trên cùng một nhịp thời gian.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-border bg-muted p-1" aria-label="Khoảng thời gian">
              {ranges.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={range === item.value}
                  onClick={() => setRange(item.value)}
                  className="rounded-lg px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm text-muted-foreground"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="Làm mới dữ liệu"
              onClick={() => setReloadKey((value) => value + 1)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">Cập nhật lúc {formatGeneratedAt(data.generatedAt)}</p>
      </header>

      {error ? (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm">
          <span>Dữ liệu mới chưa tải được; dashboard đang giữ lần cập nhật gần nhất.</span>
          <button type="button" className="font-bold" onClick={() => setReloadKey((value) => value + 1)}>Thử lại</button>
        </div>
      ) : null}

      {!data.hasData ? (
        <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <h3 className="mt-4 text-xl font-bold">Chưa đủ dữ liệu trong khoảng thời gian này</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Hệ thống sẽ hiển thị KPI và EDA khi nhận được sự kiện học tập hoặc API đầu tiên.</p>
        </div>
      ) : (
        <>
          <KPIGrid data={data} />
          <TrendPanel data={data} metric={trendMetric} onMetricChange={setTrendMetric} />
          <EDAOverview data={data} />
          <DistributionGrid data={data} />
          <TopicTable topics={sortedTopics} sort={topicSort} onSortChange={setTopicSort} />
        </>
      )}
    </section>
  );
}

function KPIGrid({ data }: { data: DashboardData }) {
  const cards: Array<{ key: keyof TelemetrySummary; label: string; value: string; icon: typeof Clock3; goodWhenHigher: boolean }> = [
    { key: "activeLearningMinutes", label: "Học chủ động", value: formatMetricValue(data.summary.activeLearningMinutes, "minutes"), icon: Clock3, goodWhenHigher: true },
    { key: "sessions", label: "Phiên học", value: formatMetricValue(data.summary.sessions, "count"), icon: Route, goodWhenHigher: true },
    { key: "questionsAnswered", label: "Câu đã trả lời", value: formatMetricValue(data.summary.questionsAnswered, "count"), icon: BookOpenCheck, goodWhenHigher: true },
    { key: "accuracyRate", label: "Độ chính xác", value: formatPercent(data.summary.accuracyRate), icon: BrainCircuit, goodWhenHigher: true },
    { key: "avgSolveTimeSeconds", label: "Thời gian giải TB", value: formatMetricValue(data.summary.avgSolveTimeSeconds, "seconds"), icon: TimerReset, goodWhenHigher: false },
    { key: "hintsPerQuestion", label: "Gợi ý / câu", value: formatMetricValue(data.summary.hintsPerQuestion, "decimal"), icon: Lightbulb, goodWhenHigher: false },
    { key: "completionRate", label: "Hoàn thành", value: formatPercent(data.summary.completionRate), icon: ShieldCheck, goodWhenHigher: true },
    { key: "apiP95LatencyMs", label: "API P95", value: formatMetricValue(data.summary.apiP95LatencyMs, "milliseconds"), icon: Gauge, goodWhenHigher: false },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const delta = data.comparison[card.key]?.deltaPercent ?? null;
        const positive = delta !== null && (card.goodWhenHigher ? delta >= 0 : delta <= 0);
        return (
          <article key={card.key} className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{card.label}</p><p className="mt-3 text-2xl font-extrabold tracking-tight">{card.value}</p></div>
              <div className="rounded-2xl bg-muted p-2.5"><Icon className="h-5 w-5 text-[var(--purple)]" /></div>
            </div>
            <p className={`mt-4 text-xs font-bold ${delta === null ? "text-muted-foreground" : positive ? "text-emerald-600" : "text-rose-500"}`}>{formatDelta(delta)} so với kỳ trước</p>
          </article>
        );
      })}
    </div>
  );
}

function TrendPanel({ data, metric, onMetricChange }: { data: DashboardData; metric: TrendMetricKey; onMetricChange: (metric: TrendMetricKey) => void }) {
  const definition = trendMetrics[metric];
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)] md:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Xu hướng theo ngày</p><h3 className="mt-1 text-xl font-bold">Giá trị trung bình thay đổi theo thời gian</h3></div>
        <select aria-label="Chọn metric biểu đồ" value={metric} onChange={(event) => onMetricChange(event.target.value as TrendMetricKey)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {Object.entries(trendMetrics).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
      </div>
      <ChartContainer data-testid="telemetry-trend-chart" config={{ [metric]: { label: definition.label, color: definition.color } }} className="mt-6 h-[320px] w-full min-w-[620px] aspect-auto">
        <LineChart data={data.trends} margin={{ left: 8, right: 18, top: 10, bottom: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 6" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={(value) => String(value).slice(5)} />
          <YAxis tickLine={false} axisLine={false} width={48} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatTrendValue(Number(value), definition.format)} />} />
          <Line type="monotone" dataKey={metric} stroke={`var(--color-${metric})`} strokeWidth={3} dot={false} connectNulls={false} />
        </LineChart>
      </ChartContainer>
    </article>
  );
}

function EDAOverview({ data }: { data: DashboardData }) {
  const cards = [
    { label: "P50 thời gian giải", value: formatMetricValue(data.eda.p50SolveTimeSeconds, "seconds") },
    { label: "P95 thời gian giải", value: formatMetricValue(data.eda.p95SolveTimeSeconds, "seconds") },
    { label: `Ngoại lệ > ${data.eda.outlierThresholdSeconds}s`, value: formatMetricValue(data.eda.outlierAttemptCount, "count") },
    { label: "Mastery chuyển trạng thái", value: formatMetricValue(data.summary.masteryTransitions, "count") },
  ];
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)] md:p-7">
      <div className="flex items-center gap-3"><div className="rounded-2xl bg-amber-500/10 p-2.5"><AlertTriangle className="h-5 w-5 text-amber-600" /></div><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">EDA tự phục vụ</p><h3 className="text-xl font-bold">Chất lượng dữ liệu</h3></div></div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map((card) => <div key={card.label} className="rounded-2xl border border-border bg-muted/40 p-4"><p className="text-xs text-muted-foreground">{card.label}</p><p className="mt-2 text-xl font-extrabold">{card.value}</p></div>)}</div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <QualityCount label="Thiếu sự kiện trình bày" count={data.eda.missingPresented} />
        <QualityCount label="Thiếu kết quả chấm" count={data.eda.missingGrade} />
        <QualityCount label="Duration API không hợp lệ" count={data.eda.invalidDuration} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">{data.eda.qualityFlags.length ? data.eda.qualityFlags.map((flag) => <span key={flag.flag} className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold">{humanizeFlag(flag.flag)} · {flag.count}</span>) : <p className="text-sm text-muted-foreground">Không phát hiện cờ chất lượng dữ liệu.</p>}</div>
    </article>
  );
}

function DistributionGrid({ data }: { data: DashboardData }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <DistributionPanel title="Phân phối thời gian giải" values={data.eda.solveTimeDistribution} />
      <DistributionPanel title="Phân phối số gợi ý" values={data.eda.hintDistribution} />
      <ListPanel title="Nguồn sự kiện" empty="Chưa có source telemetry." rows={data.eda.sourceBreakdown.map((item) => ({ label: item.source, value: item.events }))} />
      <ListPanel title="Chuyển trạng thái mastery" empty="Chưa có mastery transition." rows={data.eda.masteryTransitionBreakdown.map((item) => ({ label: `${item.from} → ${item.to}`, value: item.count }))} />
    </div>
  );
}

function TopicTable({ topics, sort, onSortChange }: { topics: TopicMetric[]; sort: TopicSortKey; onSortChange: (sort: TopicSortKey) => void }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-3 border-b border-border p-5 md:flex-row md:items-center md:justify-between md:px-7">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Topic breakdown</p><h3 className="mt-1 text-xl font-bold">Chủ đề cần quan sát</h3></div>
        <select aria-label="Sắp xếp topic" value={sort} onChange={(event) => onSortChange(event.target.value as TopicSortKey)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold"><option value="attempts">Nhiều lượt làm nhất</option><option value="accuracyRate">Độ chính xác</option><option value="avgSolveTimeSeconds">Thời gian giải</option><option value="hintsPerQuestion">Số gợi ý</option></select>
      </div>
      {topics.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-7 py-3">Topic</th><th className="px-4 py-3">Lượt làm</th><th className="px-4 py-3">Chính xác</th><th className="px-4 py-3">Thời gian TB</th><th className="px-4 py-3">Gợi ý / câu</th></tr></thead><tbody>{topics.map((topic) => <tr key={topic.topicId} className="border-t border-border"><td className="px-7 py-4 font-bold">{topic.topicName || topic.topicId}</td><td className="px-4 py-4">{formatMetricValue(topic.attempts, "count")}</td><td className="px-4 py-4">{formatPercent(topic.accuracyRate)}</td><td className="px-4 py-4">{formatMetricValue(topic.avgSolveTimeSeconds, "seconds")}</td><td className="px-4 py-4">{formatMetricValue(topic.hintsPerQuestion, "decimal")}</td></tr>)}</tbody></table></div> : <p className="p-7 text-sm text-muted-foreground">Chưa có dữ liệu theo topic.</p>}
    </article>
  );
}

function DashboardSkeleton() { return <section className="space-y-5 animate-pulse" aria-label="Đang tải metrics"><div className="h-44 rounded-3xl border border-border bg-card" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-32 rounded-3xl border border-border bg-card" />)}</div><div className="h-96 rounded-3xl border border-border bg-card" /></section>; }
function QualityCount({ label, count }: { label: string; count: number }) { return <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"><span className="text-sm text-muted-foreground">{label}</span><strong>{formatMetricValue(count, "count")}</strong></div>; }
function DistributionPanel({ title, values }: { title: string; values: Array<{ bucket: string; count: number }> }) { const maximum = Math.max(...values.map((item) => item.count), 1); return <article className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"><h3 className="font-bold">{title}</h3><div className="mt-5 space-y-3">{values.length ? values.map((item) => <div key={item.bucket} className="grid grid-cols-[72px_1fr_42px] items-center gap-3 text-sm"><span className="text-muted-foreground">{item.bucket}</span><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--mint)]" style={{ width: `${(item.count / maximum) * 100}%` }} /></div><strong className="text-right">{item.count}</strong></div>) : <p className="text-sm text-muted-foreground">Chưa đủ dữ liệu phân phối.</p>}</div></article>; }
function ListPanel({ title, rows, empty }: { title: string; rows: Array<{ label: string; value: number }>; empty: string }) { return <article className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"><h3 className="font-bold">{title}</h3><div className="mt-4 divide-y divide-border">{rows.length ? rows.map((row) => <div key={row.label} className="flex items-center justify-between gap-4 py-3 text-sm"><span className="font-medium">{row.label}</span><strong>{formatMetricValue(row.value, "count")}</strong></div>) : <p className="py-3 text-sm text-muted-foreground">{empty}</p>}</div></article>; }
function formatTrendValue(value: number, format: MetricFormat | "percent") { return format === "percent" ? formatPercent(value) : formatMetricValue(value, format); }
function formatGeneratedAt(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }); }
function humanizeFlag(value: string) { return value.replaceAll("_", " "); }
