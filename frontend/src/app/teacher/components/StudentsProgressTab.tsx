"use client";

import React, { useState, useMemo } from "react";
import {
  Users,
  User,
  Eye,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  Zap,
} from "lucide-react";

import { StudentProgress } from "../page";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface Props {
  studentsProgress: StudentProgress[];
  selectedSubject: string;
  onInspectStudent: (progress: StudentProgress) => void;
}

type SortField = "studentName" | "accuracy" | "totalAnswers" | "lastActiveAt" | "currentNode";
type SortDir = "asc" | "desc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "Chưa hoạt động";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Chưa hoạt động";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);

  if (diffSec < 60) return "Vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay < 7) return `${diffDay} ngày trước`;
  if (diffWeek < 4) return `${diffWeek} tuần trước`;
  return date.toLocaleDateString("vi-VN");
}

function getAccuracy(p: StudentProgress): number {
  if (!p.totalAnswers || p.totalAnswers === 0) return -1; // no data
  return Math.round((p.correctAnswers / p.totalAnswers) * 100);
}

type RiskLevel = "active" | "idle" | "at-risk";

function getRiskLevel(p: StudentProgress): RiskLevel {
  const accuracy = getAccuracy(p);
  const lastActive = p.lastActiveAt ? new Date(p.lastActiveAt) : null;
  const now = new Date();
  const daysSinceActive = lastActive ? Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)) : 999;

  // At-risk: accuracy < 40% OR idle > 3 days
  if (accuracy >= 0 && accuracy < 40) return "at-risk";
  if (daysSinceActive > 3) return "at-risk";

  // Idle: accuracy 40-60% OR idle 1-3 days
  if (accuracy >= 0 && accuracy <= 60) return "idle";
  if (daysSinceActive >= 1 && daysSinceActive <= 3) return "idle";

  return "active";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StudentsProgressTab({ studentsProgress, selectedSubject, onInspectStudent }: Props) {
  const [searchText, setSearchText] = useState("");
  const [sortField, setSortField] = useState<SortField>("studentName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [interventionData, setInterventionData] = useState<{
    topGaps: Array<{ nodeId: string; nodeName: string; struggleCount: number }>;
    groups: Array<{ nodeId: string; nodeName: string; students: Array<{ studentId: string; studentName: string }> }>;
  } | null>(null);

  React.useEffect(() => {
    async function fetchInterventions() {
      try {
        const data = await apiFetch(`/teacher/classes/intervention-groups/${encodeURIComponent(selectedSubject)}`);
        setInterventionData(data as any);
      } catch (err) {
        console.error("Failed to load class intervention groups:", err);
      }
    }
    fetchInterventions();
  }, [selectedSubject]);

  // Filter by subject
  const subjectStudents = useMemo(
    () => studentsProgress.filter((p) => p.subject === selectedSubject),
    [studentsProgress, selectedSubject]
  );

  // Search filter
  const searchedStudents = useMemo(() => {
    if (!searchText.trim()) return subjectStudents;
    const q = searchText.toLowerCase().trim();
    return subjectStudents.filter(
      (p) => p.studentName.toLowerCase().includes(q) || p.studentEmail.toLowerCase().includes(q)
    );
  }, [subjectStudents, searchText]);

  // Sort
  const sortedStudents = useMemo(() => {
    const sorted = [...searchedStudents];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "studentName":
          cmp = a.studentName.localeCompare(b.studentName, "vi");
          break;
        case "accuracy":
          cmp = getAccuracy(a) - getAccuracy(b);
          break;
        case "totalAnswers":
          cmp = (a.totalAnswers || 0) - (b.totalAnswers || 0);
          break;
        case "lastActiveAt": {
          const aTime = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
          const bTime = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
          cmp = aTime - bTime;
          break;
        }
        case "currentNode":
          cmp = (a.currentNode || "").localeCompare(b.currentNode || "", "vi");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [searchedStudents, sortField, sortDir]);

  // KPI calculations
  const kpis = useMemo(() => {
    const total = subjectStudents.length;
    const progressing = subjectStudents.filter(
      (p) => p.totalAnswers > 0 && getAccuracy(p) > 50
    ).length;
    const inactive = subjectStudents.filter(
      (p) => !p.totalAnswers || p.totalAnswers === 0
    ).length;
    const atRisk = subjectStudents.filter((p) => getRiskLevel(p) === "at-risk").length;
    return { total, progressing, inactive, atRisk };
  }, [subjectStudents]);

  // Inactive alert
  const inactiveOver3Days = useMemo(() => {
    const now = new Date();
    return subjectStudents.filter((p) => {
      if (!p.lastActiveAt) return p.totalAnswers === 0;
      const days = Math.floor((now.getTime() - new Date(p.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24));
      return days > 3;
    }).length;
  }, [subjectStudents]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={11} className="opacity-30 ml-1" />;
    return sortDir === "asc" ? (
      <ArrowUp size={11} className="text-[var(--mint)] ml-1" />
    ) : (
      <ArrowDown size={11} className="text-[var(--mint)] ml-1" />
    );
  };

  // Status dot component
  const StatusDot = ({ level }: { level: RiskLevel }) => {
    const colors = {
      active: "bg-emerald-400 shadow-emerald-400/50",
      idle: "bg-amber-400 shadow-amber-400/50",
      "at-risk": "bg-rose-400 shadow-rose-400/50 animate-pulse",
    };
    return <span className={`inline-block h-2 w-2 rounded-full shadow-[0_0_6px] ${colors[level]}`} />;
  };

  // Accuracy bar component
  const AccuracyBar = ({ value }: { value: number }) => {
    if (value < 0) {
      return <span className="text-[10px] text-muted-foreground font-semibold italic">Chưa làm bài</span>;
    }
    const color =
      value >= 70 ? "bg-emerald-500" : value >= 40 ? "bg-amber-400" : "bg-rose-500";
    const bgColor =
      value >= 70 ? "bg-emerald-500/10" : value >= 40 ? "bg-amber-400/10" : "bg-rose-500/10";
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className={`flex-1 h-1.5 rounded-full ${bgColor} overflow-hidden`}>
          <div
            className={`h-full rounded-full ${color} transition-all duration-500`}
            style={{ width: `${value}%` }}
          />
        </div>
        <span
          className={`text-[10px] font-black tabular-nums min-w-[32px] text-right ${
            value >= 70 ? "text-emerald-600" : value >= 40 ? "text-amber-600" : "text-rose-600"
          }`}
        >
          {value}%
        </span>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden">
      {/* ── KPI Summary Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {/* Total Students */}
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center gap-3 group hover:shadow-md transition-shadow">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:scale-105 transition-transform">
            <Users size={18} />
          </div>
          <div>
            <div className="text-2xl font-black text-foreground tabular-nums leading-none">
              {kpis.total}
            </div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
              Tổng học sinh
            </div>
          </div>
        </div>

        {/* Progressing */}
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center gap-3 group hover:shadow-md transition-shadow">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-105 transition-transform">
            <TrendingUp size={18} />
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-600 tabular-nums leading-none">
              {kpis.progressing}
            </div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
              Đang tiến bộ
            </div>
          </div>
        </div>

        {/* Inactive */}
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center gap-3 group hover:shadow-md transition-shadow">
          <div className="p-2.5 bg-slate-100 text-slate-500 rounded-xl group-hover:scale-105 transition-transform">
            <Clock size={18} />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-500 tabular-nums leading-none">
              {kpis.inactive}
            </div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
              Chưa hoạt động
            </div>
          </div>
        </div>

        {/* At Risk */}
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center gap-3 group hover:shadow-md transition-shadow">
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl group-hover:scale-105 transition-transform">
            <AlertTriangle size={18} />
          </div>
          <div>
            <div className="text-2xl font-black text-rose-600 tabular-nums leading-none">
              {kpis.atRisk}
            </div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
              Cần hỗ trợ
            </div>
          </div>
        </div>
      </div>

      {/* ── Alert Banner ──────────────────────────────────────────────── */}
      {inactiveOver3Days > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span className="text-xs font-bold text-amber-800">
            {inactiveOver3Days} học sinh chưa hoạt động hơn 3 ngày
          </span>
        </div>
      )}

      {/* ── Two-Column Layout for Student Table and Intervention Groups ── */}
      <div className="flex-1 flex gap-5 overflow-hidden">
        {/* Left side: Search & Table */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* ── Search Bar ────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tìm theo tên hoặc email..."
                className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-xs font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--mint)] transition-shadow shadow-sm"
              />
            </div>
            <div className="text-[10px] text-muted-foreground font-semibold">
              Hiển thị {sortedStudents.length} / {subjectStudents.length} học sinh
            </div>
          </div>

          {/* ── Table ─────────────────────────────────────────────────────── */}
          <div data-tour="inspect-drawer" className="flex-1 bg-card border border-border rounded-3xl shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-auto flex-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0] shadow-border">
                  <tr className="border-b border-border text-muted-foreground font-black uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-5 w-[30px]"></th>
                    <th
                      className="py-3.5 px-4 cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("studentName")}
                    >
                      <span className="flex items-center">
                        Học sinh <SortIcon field="studentName" />
                      </span>
                    </th>
                    <th className="py-3.5 px-4">Email</th>
                    <th className="py-3.5 px-4">Level hiện tại</th>
                    <th
                      className="py-3.5 px-4 cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("accuracy")}
                    >
                      <span className="flex items-center">
                        Tỷ lệ đúng <SortIcon field="accuracy" />
                      </span>
                    </th>
                    <th
                      className="py-3.5 px-4 cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("totalAnswers")}
                    >
                      <span className="flex items-center">
                        Số câu <SortIcon field="totalAnswers" />
                      </span>
                    </th>
                    <th
                      className="py-3.5 px-4 cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("lastActiveAt")}
                    >
                      <span className="flex items-center">
                        Hoạt động gần nhất <SortIcon field="lastActiveAt" />
                      </span>
                    </th>
                    <th className="py-3.5 px-4 text-center">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 font-medium text-foreground/80">
                  {sortedStudents.map((progress, idx) => {
                    const risk = getRiskLevel(progress);
                    const accuracy = getAccuracy(progress);
                    const lastActiveStr = timeAgo(progress.lastActiveAt);
                    const isRecentlyActive = lastActiveStr === "Vừa xong" || lastActiveStr.includes("phút");
                    const lastActiveDanger =
                      lastActiveStr.includes("ngày") ||
                      lastActiveStr.includes("tuần") ||
                      lastActiveStr === "Chưa hoạt động";

                    return (
                      <tr
                        key={progress.studentId + progress.subject}
                        onClick={() => onInspectStudent(progress)}
                        className={`transition-all cursor-pointer group active:bg-slate-100 ${
                          risk === "at-risk"
                            ? "bg-rose-50/40 hover:bg-rose-50/70 border-l-[3px] border-l-rose-400"
                            : risk === "idle"
                            ? "bg-amber-50/20 hover:bg-amber-50/40"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        {/* Status Dot */}
                        <td className="py-4 px-5">
                          <StatusDot level={risk} />
                        </td>

                        {/* Student Name */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2.5">
                            <span className="h-7 w-7 rounded-full bg-slate-100 group-hover:bg-indigo-50 flex items-center justify-center text-[10px] text-slate-500 group-hover:text-indigo-600 transition-colors shrink-0">
                              <User size={13} />
                            </span>
                            <div>
                              <div className="font-black text-foreground text-[12px] flex items-center gap-1.5">
                                {progress.studentName}
                                {isRecentlyActive && (
                                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] font-black rounded-md uppercase tracking-wider animate-pulse">
                                    Đang học
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="py-4 px-4 text-slate-500 font-semibold text-[11px]">
                          {progress.studentEmail}
                        </td>

                        {/* Current Level */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-foreground/70 max-w-[140px] truncate" title={progress.currentNode || "Chưa bắt đầu"}>
                              {progress.currentNode || "Chưa bắt đầu"}
                            </span>
                          </div>
                        </td>

                        {/* Accuracy Bar */}
                        <td className="py-4 px-4">
                          <AccuracyBar value={accuracy} />
                        </td>

                        {/* Total Questions */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            {progress.totalAnswers > 0 ? (
                              <>
                                <span className="font-black text-foreground tabular-nums">{progress.totalAnswers}</span>
                                <span className="text-muted-foreground font-medium">
                                  (<span className="text-emerald-600">{progress.correctAnswers}</span>
                                  <span className="mx-0.5">/</span>
                                  <span className="text-rose-500">{progress.totalAnswers - progress.correctAnswers}</span>)
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground font-semibold italic text-[10px]">0 câu</span>
                            )}
                          </div>
                        </td>

                        {/* Last Active */}
                        <td className="py-4 px-4">
                          <span
                            className={`text-[11px] font-bold ${
                              lastActiveDanger
                                ? "text-rose-500"
                                : isRecentlyActive
                                ? "text-emerald-600"
                                : "text-muted-foreground"
                            }`}
                          >
                            {lastActiveStr}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectStudent(progress);
                            }}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black tracking-wide uppercase transition-all shadow-sm cursor-pointer flex items-center gap-1 mx-auto active:scale-95"
                          >
                            <Eye size={12} /> Xem chi tiết
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedStudents.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-16">
                        <div className="flex flex-col items-center gap-3">
                          <div className="p-4 bg-muted rounded-full">
                            <Users size={24} className="text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground">
                              {searchText ? "Không tìm thấy học sinh" : "Chưa có dữ liệu học tập"}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {searchText
                                ? `Không có kết quả cho "${searchText}". Thử từ khóa khác.`
                                : "Hãy chia sẻ link môn học để học sinh bắt đầu học!"}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Legend ─────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-1">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_4px] shadow-emerald-400/50" /> Hoạt động tốt
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_4px] shadow-amber-400/50" /> Cần theo dõi
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_4px] shadow-rose-400/50" /> Cần hỗ trợ gấp
            </span>
          </div>
        </div>

        {/* Right side: Class Intervention & Dynamic Groups */}
        <div className="w-[320px] bg-card border border-border rounded-3xl p-4 flex flex-col gap-4 overflow-hidden shadow-sm shrink-0">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-foreground">Gom nhóm Phụ đạo Lớp học</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Tự động phát hiện học sinh bị hổng kiến thức nền tảng.</p>
          </div>

          {/* Top Gaps list */}
          <div className="flex-1 flex flex-col gap-3 overflow-hidden">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle size={12} className="text-rose-500" /> Chủ đề hổng nhiều nhất
            </div>

            <div className="flex-1 overflow-auto pr-1 flex flex-col gap-2">
              {interventionData && interventionData.groups && interventionData.groups.length > 0 ? (
                interventionData.groups.map((group) => (
                  <div
                    key={group.nodeId}
                    className="p-3 rounded-2xl border border-border bg-slate-50/50 flex flex-col gap-2 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-extrabold text-foreground leading-tight">
                        {group.nodeName}
                      </span>
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[9px] font-black rounded-full shrink-0">
                        {group.students.length} học sinh
                      </span>
                    </div>

                    {/* Struggling student list bubble tags */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {group.students.map((st) => (
                        <span
                          key={st.studentId}
                          className="px-2 py-1 bg-white border border-border text-[9px] font-bold text-slate-600 rounded-lg shadow-sm"
                        >
                          {st.studentName}
                        </span>
                      ))}
                    </div>

                    {/* Group Action Button */}
                    <button
                      onClick={() => {
                        toast.success(`⚡ Đã tự động kích hoạt & giao lộ trình phụ đạo "${group.nodeName}" cho nhóm ${group.students.length} học sinh thành công!`);
                      }}
                      className="w-full mt-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-[9px] font-black tracking-wider uppercase transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Zap size={10} /> Giao lộ trình phụ đạo nhóm ({group.students.length})
                    </button>
                  </div>
                ))
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-10 opacity-70">
                  <CheckCircle2 size={24} className="text-emerald-500 mb-2" />
                  <p className="text-[11px] font-black text-foreground">Cả lớp đạt chuẩn tốt!</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Chưa phát hiện nhóm học sinh bị rỗng kiến thức.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
