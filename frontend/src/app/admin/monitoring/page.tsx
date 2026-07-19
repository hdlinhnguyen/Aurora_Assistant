"use client";

import { useState } from "react";
import {
  Users,
  GraduationCap,
  Activity,
  Gauge,
  Server,
  AlertTriangle,
  RefreshCw,
  FileText,
  TrendingUp,
  Layers,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";

/**
 * PROTOTYPE — dữ liệu trên trang này là mock tĩnh, chưa nối API thật.
 * Xem frontend/src/app/admin/monitoring/README.md để biết phạm vi và việc cần làm tiếp.
 */

type TimeRange = "realtime" | "1h" | "24h" | "30d";

const RANGE_LABEL: Record<TimeRange, string> = {
  realtime: "Real-time",
  "1h": "1h",
  "24h": "24h",
  "30d": "30d",
};

function RangePicker({ value, onChange }: { value: TimeRange; onChange: (r: TimeRange) => void }) {
  return (
    <div className="flex rounded-xl border border-border bg-muted p-1" aria-label="Khoảng thời gian">
      {(Object.keys(RANGE_LABEL) as TimeRange[]).map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          className="rounded-lg px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm text-muted-foreground"
        >
          {RANGE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

function TierHeader({
  icon: Icon,
  tier,
  title,
  subtitle,
  action,
}: {
  icon: typeof Users;
  tier: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-[var(--purple)]/10 p-2.5 text-[var(--purple)]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{tier}</p>
          <h2 className="text-xl font-bold font-[var(--font-display)]">
            {title} <span className="font-normal text-muted-foreground text-sm">({subtitle})</span>
          </h2>
        </div>
      </div>
      {action}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  fields,
}: {
  icon: typeof Users;
  label: string;
  fields: Array<{ label: string; value: string; highlight?: boolean }>;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="rounded-xl bg-[var(--mint)]/15 p-2 text-[var(--mint)]">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-sm font-bold">{label}</p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {fields.map((f) => (
          <div key={f.label}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{f.label}</p>
            <p className={`text-lg font-extrabold tracking-tight ${f.highlight ? "text-emerald-600" : ""}`}>{f.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Mock data (static, no API calls) ----
const HAU_24H = [12, 14, 11, 9, 8, 7, 10, 22, 41, 58, 64, 61, 55, 60, 68, 72, 79, 84, 76, 65, 48, 33, 21, 15];

const LANGGRAPH_NODES = [
  { name: "diagnose_node", ms: 420 },
  { name: "socratic_hint_node", ms: 680 },
  { name: "grade_node", ms: 310 },
  { name: "bridge_agent_node", ms: 890 },
];
const LANGGRAPH_MAX_MS = Math.max(...LANGGRAPH_NODES.map((n) => n.ms));

const HTTP_STATUS = [
  { bucket: "2xx", count: 15482, pct: 98.2, color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
  { bucket: "4xx", count: 224, pct: 1.4, color: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
  { bucket: "5xx", count: 64, pct: 0.4, color: "text-rose-600 bg-rose-500/10 border-rose-500/20" },
];

const COST_BURN = {
  usd: 12.4,
  vnd: 310000,
  quotaRemainingPct: 74.2,
};

export default function AdminMonitoringPage() {
  const [tier1Range, setTier1Range] = useState<TimeRange>("realtime");
  const [hauRange, setHauRange] = useState<TimeRange>("24h");

  const gaugePct = 100 - COST_BURN.quotaRemainingPct; // burn rate arc
  const maxHau = Math.max(...HAU_24H);

  return (
    <div className="space-y-8">
      {/* Prototype banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm">
        <FlaskConical className="h-5 w-5 shrink-0 text-amber-600" />
        <p>
          <span className="font-bold text-amber-700 dark:text-amber-400">Prototype:</span>{" "}
          <span className="text-muted-foreground">
            Toàn bộ số liệu trên trang này là dữ liệu minh hoạ tĩnh, chưa nối API thật. Xem{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">README.md</code> trong thư mục này để biết việc cần làm tiếp.
          </span>
        </p>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-[var(--font-display)] font-extrabold tracking-tight">
            Admin Matrix Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Giám sát người dùng, hạ tầng LangGraph và chi phí AI trên cùng một màn hình.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/8 px-4 py-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Hệ thống: online</span>
        </div>
      </div>

      {/* ===== TẦNG 1: User Metrics Overview ===== */}
      <section className="space-y-5">
        <TierHeader
          icon={Users}
          tier="Tầng 1"
          title="Thống kê Tài khoản & Mức độ Hoạt động"
          subtitle="User Metrics Overview"
          action={<RangePicker value={tier1Range} onChange={setTier1Range} />}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <MetricCard
            icon={Users}
            label="Student Count"
            fields={[
              { label: "Total", value: "1,240" },
              { label: "Online hôm nay", value: "187", highlight: true },
              { label: "Tăng trưởng tuần", value: "+6.4%", highlight: true },
            ]}
          />
          <MetricCard
            icon={GraduationCap}
            label="Teacher Count"
            fields={[
              { label: "Active total", value: "42" },
              { label: "Lớp quản lý", value: "58" },
            ]}
          />
          <MetricCard
            icon={Activity}
            label="Session Metrics"
            fields={[
              { label: "Tổng phiên online", value: "312" },
              { label: "Peak concurrent", value: "89" },
            ]}
          />
          <MetricCard
            icon={Layers}
            label="Adaptive Strategy Metrics"
            fields={[
              { label: "remediation_group_count", value: "14" },
              { label: "advanced_group_count", value: "5" },
            ]}
          />
        </div>

        {/* HAU chart */}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <p className="text-sm font-bold">Hourly Active Users (HAU) — Last 24 hours</p>
            <RangePicker value={hauRange} onChange={setHauRange} />
          </div>
          <div className="flex items-end gap-1.5 h-40">
            {HAU_24H.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-[var(--mint)] to-[var(--purple)] transition-all group-hover:opacity-80"
                  style={{ height: `${(v / maxHau) * 100}%` }}
                  title={`${i}:00 — ${v} người dùng`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground font-medium">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </div>
      </section>

      {/* ===== TẦNG 2: Infrastructure Performance ===== */}
      <section className="space-y-5">
        <TierHeader
          icon={Server}
          tier="Tầng 2"
          title="Giám sát FastAPI & LangGraph"
          subtitle="Infrastructure Performance"
          action={
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mr-1">Telemetry Pipe</p>
              <button
                type="button"
                disabled
                title="Sẽ khả dụng khi nối API thật"
                className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground cursor-not-allowed opacity-60"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Clear Cache & Force Sync
              </button>
              <button
                type="button"
                disabled
                title="Sẽ khả dụng khi nối API thật"
                className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground cursor-not-allowed opacity-60"
              >
                <FileText className="h-3.5 w-3.5" /> System Logs
              </button>
            </div>
          }
        />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* LangGraph Node Latency */}
          <div className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <p className="text-sm font-bold mb-5">LangGraph Node Latency</p>
            <div className="space-y-4">
              {LANGGRAPH_NODES.map((n) => (
                <div key={n.name}>
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span className="font-mono text-muted-foreground">{n.name}</span>
                    <span className="font-bold">{n.ms} ms</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--purple)] to-indigo-500"
                      style={{ width: `${(n.ms / LANGGRAPH_MAX_MS) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* HTTP Status Tracker */}
          <div className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <p className="text-sm font-bold mb-5">HTTP Status Tracker</p>
            <div className="space-y-3">
              {HTTP_STATUS.map((s) => (
                <div key={s.bucket} className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${s.color}`}>
                  <span className="font-mono font-extrabold text-sm">{s.bucket}</span>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-bold">{s.count.toLocaleString("vi-VN")} req</span>
                    <span className="font-bold">{s.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== TẦNG 3: AI Cost Control ===== */}
      <section className="space-y-5">
        <TierHeader
          icon={Gauge}
          tier="Tầng 3"
          title="Kiểm soát Token & Chi phí Google Gemini API"
          subtitle="AI Cost Control"
        />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Cost burn gauge */}
          <div className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Model Version</p>
            <p className="text-sm font-bold font-mono mb-5">gemini-2.5-flash</p>

            <div className="flex items-center gap-6">
              <div
                className="relative h-28 w-28 rounded-full shrink-0"
                style={{
                  background: `conic-gradient(var(--purple) ${gaugePct * 3.6}deg, var(--muted) 0deg)`,
                }}
              >
                <div className="absolute inset-2 rounded-full bg-card flex flex-col items-center justify-center">
                  <span className="text-lg font-extrabold">{COST_BURN.quotaRemainingPct}%</span>
                  <span className="text-[9px] text-muted-foreground font-semibold text-center leading-tight">
                    quota
                    <br />
                    còn lại
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Estimated Cost Burn Rate</p>
                <p className="text-2xl font-extrabold tracking-tight">${COST_BURN.usd.toFixed(2)}</p>
                <p className="text-sm font-bold text-muted-foreground">{COST_BURN.vnd.toLocaleString("vi-VN")} ₫</p>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {/* Quota */}
            <div className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)] flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">Current Quota</p>
                <p className="text-xs text-muted-foreground mt-0.5">Bật/tắt giới hạn gọi API tự động</p>
              </div>
              <span className="inline-flex h-6 w-11 items-center rounded-full bg-emerald-500 px-0.5">
                <span className="h-5 w-5 rounded-full bg-white translate-x-5 transition-transform" />
              </span>
            </div>

            {/* Billing circuit breaker */}
            <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/5 p-5 shadow-[var(--shadow-card)] flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-emerald-500 shrink-0" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Billing Circuit Breaker</p>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Đang hoạt động bình thường</p>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-muted/40 p-5 text-xs text-muted-foreground flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <p>
                Circuit breaker sẽ tự ngắt gọi API Gemini khi chi phí vượt ngưỡng cấu hình, tránh phát sinh chi phí ngoài kiểm soát. Ngưỡng cụ thể sẽ cấu hình khi nối dữ liệu thật.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer status */}
      <div className="flex items-center justify-center gap-2 pt-4 pb-2 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="font-semibold">online</span>
        <span className="mx-1">·</span>
        <TrendingUp className="h-3.5 w-3.5" />
        <span>Aurora Assistant Admin Matrix Dashboard — Prototype v0.1</span>
      </div>
    </div>
  );
}
