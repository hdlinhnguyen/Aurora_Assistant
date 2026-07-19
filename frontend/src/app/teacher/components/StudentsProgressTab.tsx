"use client";

import React, { useEffect, useMemo, useState } from "react";

import { StudentProgress } from "../page";
import { apiFetch } from "@/lib/api";

interface Props {
  studentsProgress: StudentProgress[];
  selectedSubject: string;
  onInspectStudent: (progress: StudentProgress) => void;
}

interface InterventionGroup {
  nodeId: string;
  nodeName: string;
  students: Array<{ studentId: string; studentName: string }>;
}

type MainTab = "groups" | "students";
type SortBy = "score" | "name" | "active";

const CARD_SHADOW = "shadow-[0_1px_2px_rgba(20,20,40,.04)]";

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

function getIdleDays(p: StudentProgress): number {
  if (!p.lastActiveAt) return 999;
  const date = new Date(p.lastActiveAt);
  if (isNaN(date.getTime())) return 999;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

function activeLabel(days: number): string {
  if (days >= 999) return "Chưa hoạt động";
  if (days === 0) return "Hôm nay";
  if (days === 1) return "1 ngày trước";
  if (days > 14) return "Hơn 2 tuần";
  return `${days} ngày trước`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[parts.length - 2]?.[0] || "";
  const b = parts[parts.length - 1]?.[0] || "";
  return (a + b).toUpperCase();
}

// Composite "need help" score → tier colors (rose ≥65, amber ≥35, else emerald)
function scoreTier(score: number) {
  if (score >= 65) return { text: "text-rose-600", bar: "bg-rose-600", label: "Rất cần hỗ trợ" };
  if (score >= 35) return { text: "text-amber-600", bar: "bg-amber-600", label: "Cần theo dõi" };
  return { text: "text-emerald-600", bar: "bg-emerald-600", label: "Ổn định" };
}

// Raw accuracy % → tier colors (emerald ≥70, amber ≥40, else rose)
function accuracyTier(value: number) {
  if (value < 0) return { text: "text-muted-foreground", bar: "bg-slate-300" };
  if (value >= 70) return { text: "text-emerald-600", bar: "bg-emerald-600" };
  if (value >= 40) return { text: "text-amber-600", bar: "bg-amber-600" };
  return { text: "text-rose-600", bar: "bg-rose-600" };
}

// Gap-group severity by member count (≥5 rose, 3–4 amber, 1–2 emerald)
function severityFor(count: number) {
  if (count >= 5) return { dot: "bg-rose-600", badgeBg: "bg-rose-50", badgeText: "text-rose-700" };
  if (count >= 3) return { dot: "bg-amber-600", badgeBg: "bg-amber-50", badgeText: "text-amber-700" };
  return { dot: "bg-emerald-600", badgeBg: "bg-emerald-50", badgeText: "text-emerald-700" };
}

function gapBadgeClasses(count: number) {
  if (count === 0) return "bg-emerald-50 text-emerald-700";
  if (count >= 3) return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StudentsProgressTab({ studentsProgress, selectedSubject, onInspectStudent }: Props) {
  const [tab, setTab] = useState<MainTab>("groups");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("score");
  const [interventionGroups, setInterventionGroups] = useState<InterventionGroup[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function fetchInterventions() {
      try {
        const data = await apiFetch(`/teacher/classes/intervention-groups/${encodeURIComponent(selectedSubject)}`);
        if (!cancelled) setInterventionGroups(((data as any)?.groups ?? []) as InterventionGroup[]);
      } catch (err) {
        console.error("Failed to load class intervention groups:", err);
      }
    }
    if (selectedSubject) fetchInterventions();
    return () => {
      cancelled = true;
    };
  }, [selectedSubject]);

  // Filter by subject
  const subjectStudents = useMemo(
    () => studentsProgress.filter((p) => p.subject === selectedSubject),
    [studentsProgress, selectedSubject]
  );

  // studentId -> gap topic display names (from intervention-groups membership)
  const gapsByStudent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const group of interventionGroups) {
      for (const st of group.students) {
        const list = map.get(st.studentId) ?? [];
        list.push(group.nodeName);
        map.set(st.studentId, list);
      }
    }
    return map;
  }, [interventionGroups]);

  // Per-student "need help" score (see design handoff scoring algorithm)
  const scoredStudents = useMemo(() => {
    const withRaw = subjectStudents.map((p) => {
      const accuracy = getAccuracy(p);
      const idleDays = getIdleDays(p);
      const gaps = gapsByStudent.get(p.studentId) ?? [];
      const gapPenalty = gaps.length * 20;
      const accPenalty = accuracy < 0 ? 50 : (100 - accuracy) * 0.4;
      const idlePenalty = Math.min(idleDays, 10) * 3;
      return { p, accuracy, idleDays, gaps, rawScore: gapPenalty + accPenalty + idlePenalty };
    });
    const maxRaw = Math.max(1, ...withRaw.map((s) => s.rawScore));
    const scale = 90 / maxRaw;
    return withRaw.map((s) => ({ ...s, score: Math.min(100, Math.round(s.rawScore * scale)) }));
  }, [subjectStudents, gapsByStudent]);

  const ranked = useMemo(
    () => [...scoredStudents].sort((a, b) => b.score - a.score).slice(0, 6),
    [scoredStudents]
  );

  const gapGroupCards = useMemo(() => {
    return interventionGroups
      .map((group) => {
        const memberIds = new Set(group.students.map((s) => s.studentId));
        const members = scoredStudents.filter((s) => memberIds.has(s.p.studentId));
        const avgAcc = members.length
          ? Math.round(members.reduce((sum, m) => sum + Math.max(0, m.accuracy), 0) / members.length)
          : 0;
        return {
          nodeId: group.nodeId,
          name: group.nodeName,
          count: group.students.length,
          avgAcc,
          names: group.students.map((s) => s.studentName),
        };
      })
      .filter((g) => g.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [interventionGroups, scoredStudents]);

  const kpis = useMemo(
    () => ({
      total: subjectStudents.length,
      gapGroupsCount: gapGroupCards.length,
      urgentCount: scoredStudents.filter((s) => s.score >= 65).length,
      multiGapCount: scoredStudents.filter((s) => s.gaps.length >= 2).length,
    }),
    [subjectStudents, gapGroupCards, scoredStudents]
  );

  const lastUpdatedLabel = useMemo(() => {
    if (subjectStudents.length === 0) return null;
    const latest = subjectStudents.reduce((max, p) => {
      const t = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
      return t > max ? t : max;
    }, 0);
    return latest > 0 ? timeAgo(new Date(latest).toISOString()) : null;
  }, [subjectStudents]);

  const tableStudents = useMemo(() => {
    let list = scoredStudents;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) => s.p.studentName.toLowerCase().includes(q) || s.p.studentEmail.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === "name") return a.p.studentName.localeCompare(b.p.studentName, "vi");
      if (sortBy === "active") return a.idleDays - b.idleDays;
      return b.score - a.score;
    });
    return sorted;
  }, [scoredStudents, search, sortBy]);

  return (
    <div className="flex-1 flex flex-col gap-5 overflow-hidden">
      {/* ── Header row ────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap shrink-0">
        <div>
          <div className="font-[var(--font-display)] font-extrabold text-2xl text-foreground tracking-tight whitespace-nowrap">
            Báo cáo tiến độ học sinh
          </div>
          <div className="text-[13px] font-semibold text-muted-foreground mt-1.5">
            {selectedSubject}
            {lastUpdatedLabel && ` · Cập nhật ${lastUpdatedLabel}`}
          </div>
        </div>
        <div className={`flex items-center gap-2.5 px-3.5 py-2 bg-card border border-border rounded-2xl ${CARD_SHADOW}`}>
          <span className="h-2 w-2 rounded-full bg-indigo-600 shrink-0" />
          <span className="text-xs font-bold text-foreground/80 whitespace-nowrap">{selectedSubject}</span>
        </div>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3.5 shrink-0">
        <div className={`bg-card border border-border rounded-[20px] px-5 py-4 ${CARD_SHADOW} flex flex-col gap-2.5`}>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shrink-0" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Tổng học sinh</span>
          </div>
          <div className="font-[var(--font-display)] font-extrabold text-[28px] leading-none text-foreground">{kpis.total}</div>
          <div className="text-[11px] font-medium text-slate-400 leading-snug">trong lớp {selectedSubject}</div>
        </div>

        <div className={`bg-card border border-border rounded-[20px] px-5 py-4 ${CARD_SHADOW} flex flex-col gap-2.5`}>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-600 shrink-0" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Nhóm lỗ hổng</span>
          </div>
          <div className="font-[var(--font-display)] font-extrabold text-[28px] leading-none text-foreground">{kpis.gapGroupsCount}</div>
          <div className="text-[11px] font-medium text-slate-400 leading-snug">chủ đề đang bị hổng</div>
        </div>

        <div className={`bg-card border border-border rounded-[20px] px-5 py-4 ${CARD_SHADOW} flex flex-col gap-2.5`}>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-600 shrink-0" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Cần hỗ trợ gấp</span>
          </div>
          <div className="font-[var(--font-display)] font-extrabold text-[28px] leading-none text-rose-600">{kpis.urgentCount}</div>
          <div className="text-[11px] font-medium text-slate-400 leading-snug">điểm ưu tiên ≥ 65</div>
        </div>

        <div className={`bg-card border border-border rounded-[20px] px-5 py-4 ${CARD_SHADOW} flex flex-col gap-2.5`}>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-600 shrink-0" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Đa lỗ hổng</span>
          </div>
          <div className="font-[var(--font-display)] font-extrabold text-[28px] leading-none text-foreground">{kpis.multiGapCount}</div>
          <div className="text-[11px] font-medium text-slate-400 leading-snug">hổng từ 2 chủ đề trở lên</div>
        </div>
      </div>

      {/* ── Tab switcher ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 bg-muted p-1.5 rounded-2xl w-fit shrink-0">
        <button
          onClick={() => setTab("groups")}
          className={`px-5 py-2.5 rounded-xl text-[13px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
            tab === "groups"
              ? "bg-foreground text-background shadow-[0_4px_10px_-4px_rgba(28,30,41,.4)]"
              : "bg-transparent text-muted-foreground"
          }`}
        >
          Theo nhóm lỗ hổng
        </button>
        <button
          onClick={() => setTab("students")}
          className={`px-5 py-2.5 rounded-xl text-[13px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
            tab === "students"
              ? "bg-foreground text-background shadow-[0_4px_10px_-4px_rgba(28,30,41,.4)]"
              : "bg-transparent text-muted-foreground"
          }`}
        >
          Theo học sinh
        </button>
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-6 pr-1">
        {tab === "groups" ? (
          <>
            {/* Ai cần giúp nhất */}
            <div data-tour="inspect-drawer" className={`bg-card border border-border rounded-3xl p-6 ${CARD_SHADOW} shrink-0`}>
              <div className="flex items-baseline justify-between mb-3.5">
                <div className="font-[var(--font-display)] font-extrabold text-base text-foreground whitespace-nowrap shrink-0">
                  Ai cần giúp nhất
                </div>
                <div className="text-[11px] font-semibold text-slate-400 whitespace-nowrap ml-3.5">
                  Xếp hạng theo mức độ cần hỗ trợ
                </div>
              </div>

              {ranked.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {ranked.map((s, i) => {
                    const tier = scoreTier(s.score);
                    return (
                      <div
                        key={s.p.studentId}
                        onClick={() => onInspectStudent(s.p)}
                        className={`grid grid-cols-[32px_44px_1.4fr_1.6fr_130px_90px] items-center gap-4 py-3 px-3.5 rounded-2xl cursor-pointer transition-colors hover:bg-slate-100 ${
                          i % 2 === 0 ? "bg-slate-50/70" : "bg-transparent"
                        }`}
                      >
                        <div className="font-[var(--font-display)] font-extrabold text-[15px] text-slate-400">{i + 1}</div>
                        <div
                          className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-extrabold text-[13px] shrink-0 ${
                            i === 0 ? "bg-rose-600" : i < 3 ? "bg-amber-600" : "bg-indigo-500"
                          }`}
                        >
                          {initialsOf(s.p.studentName)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-extrabold text-[13px] text-foreground truncate">{s.p.studentName}</div>
                          <div className="text-[11px] font-medium text-slate-400 mt-0.5 truncate">
                            {activeLabel(s.idleDays)} · {s.accuracy < 0 ? "Chưa làm" : `${s.accuracy}%`} đúng
                          </div>
                        </div>
                        <div className="flex flex-nowrap gap-1.5 overflow-hidden">
                          {s.gaps.slice(0, 1).map((g) => (
                            <span
                              key={g}
                              className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold whitespace-nowrap shrink-0"
                            >
                              {g}
                            </span>
                          ))}
                          {s.gaps.length > 1 && (
                            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold whitespace-nowrap shrink-0">
                              +{s.gaps.length - 1}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full rounded-full ${tier.bar}`} style={{ width: `${s.score}%` }} />
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 mt-1 whitespace-nowrap">{tier.label}</div>
                        </div>
                        <div className={`font-[var(--font-display)] font-extrabold text-[13px] text-right ${tier.text}`}>
                          {s.score}/100
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-10 text-center">
                  <p className="text-[12px] font-bold text-foreground">Chưa có học sinh nào trong lớp này.</p>
                </div>
              )}
            </div>

            {/* Nhóm theo lỗ hổng kiến thức */}
            <div className="shrink-0">
              <div className="font-[var(--font-display)] font-extrabold text-base text-foreground mb-3.5">
                Nhóm theo lỗ hổng kiến thức
              </div>
              {gapGroupCards.length > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {gapGroupCards.map((g) => {
                    const sev = severityFor(g.count);
                    const shown = g.names.slice(0, 5);
                    const overflow = g.names.length - 5;
                    return (
                      <div
                        key={g.nodeId}
                        className={`bg-card border border-border rounded-[22px] p-5 ${CARD_SHADOW} flex flex-col gap-3`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${sev.dot}`} />
                            <span className="font-extrabold text-sm text-foreground truncate">{g.name}</span>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold whitespace-nowrap shrink-0 ${sev.badgeBg} ${sev.badgeText}`}
                          >
                            {g.count} HS
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-400">
                          Độ chính xác trung bình: {g.avgAcc}%
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {shown.map((n) => (
                            <span key={n} className="px-2.5 py-1 rounded-[10px] bg-slate-100 text-slate-700 text-[11px] font-bold">
                              {n}
                            </span>
                          ))}
                          {overflow > 0 && (
                            <span className="px-2.5 py-1 rounded-[10px] bg-slate-100 text-slate-400 text-[11px] font-bold">
                              +{overflow} khác
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={`bg-card border border-border rounded-[22px] p-10 ${CARD_SHADOW} text-center`}>
                  <p className="text-[12px] font-black text-foreground">Cả lớp đạt chuẩn tốt!</p>
                  <p className="text-[11px] text-slate-400 mt-1">Chưa phát hiện nhóm học sinh bị hổng kiến thức.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={`bg-card border border-border rounded-3xl p-5 ${CARD_SHADOW} flex flex-col gap-4`}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên học sinh..."
                className="flex-1 max-w-[280px] px-3.5 py-[9px] border border-border rounded-xl text-xs font-semibold text-foreground placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => setSortBy("score")}
                  className={`px-3.5 py-2 rounded-[10px] text-[11px] font-bold cursor-pointer transition-colors ${
                    sortBy === "score" ? "bg-indigo-50 text-indigo-600" : "bg-transparent text-muted-foreground"
                  }`}
                >
                  Cần hỗ trợ
                </button>
                <button
                  onClick={() => setSortBy("name")}
                  className={`px-3.5 py-2 rounded-[10px] text-[11px] font-bold cursor-pointer transition-colors ${
                    sortBy === "name" ? "bg-indigo-50 text-indigo-600" : "bg-transparent text-muted-foreground"
                  }`}
                >
                  Tên
                </button>
                <button
                  onClick={() => setSortBy("active")}
                  className={`px-3.5 py-2 rounded-[10px] text-[11px] font-bold cursor-pointer transition-colors ${
                    sortBy === "active" ? "bg-indigo-50 text-indigo-600" : "bg-transparent text-muted-foreground"
                  }`}
                >
                  Hoạt động
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 px-2.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Học sinh</th>
                    <th className="py-2 px-2.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Level hiện tại</th>
                    <th className="py-2 px-2.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Lỗ hổng</th>
                    <th className="py-2 px-2.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Tỷ lệ đúng</th>
                    <th className="py-2 px-2.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Hoạt động gần nhất</th>
                  </tr>
                </thead>
                <tbody>
                  {tableStudents.map((s) => {
                    const acc = accuracyTier(s.accuracy);
                    const gapTitle = s.gaps.length ? s.gaps.join(", ") : "Không có lỗ hổng";
                    return (
                      <tr key={s.p.studentId} className="border-b border-border/60">
                        <td className="py-2.5 px-2.5">
                          <div className="font-extrabold text-[12px] text-foreground">{s.p.studentName}</div>
                          <div className="text-[10px] font-medium text-slate-400 mt-0.5">{s.p.studentEmail}</div>
                        </td>
                        <td className="py-2.5 px-2.5 text-[11px] font-semibold text-slate-600">
                          {s.p.currentNode || "Chưa bắt đầu"}
                        </td>
                        <td className="py-2.5 px-2.5">
                          <span
                            title={gapTitle}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${gapBadgeClasses(s.gaps.length)}`}
                          >
                            {s.gaps.length}
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 min-w-[130px]">
                          {s.accuracy < 0 ? (
                            <span className="text-[10px] font-semibold text-slate-400 italic">Chưa làm</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="w-[70px] h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className={`h-full rounded-full ${acc.bar}`} style={{ width: `${s.accuracy}%` }} />
                              </div>
                              <span className={`text-[10px] font-extrabold ${acc.text}`}>{s.accuracy}%</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-[11px] font-bold text-muted-foreground whitespace-nowrap">
                          {activeLabel(s.idleDays)}
                        </td>
                      </tr>
                    );
                  })}
                  {tableStudents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-14">
                        <p className="text-sm font-bold text-foreground">
                          {search ? "Không tìm thấy học sinh" : "Chưa có dữ liệu học tập"}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {search
                            ? `Không có kết quả cho "${search}". Thử từ khóa khác.`
                            : "Hãy chia sẻ link môn học để học sinh bắt đầu học!"}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
