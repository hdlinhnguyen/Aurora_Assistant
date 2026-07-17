"use client";

import React from "react";
import { AlertTriangle, Target, TrendingUp } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  ScatterChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ReferenceLine,
  Scatter
} from "recharts";

import { NodeItem } from "../page";

interface StudentStat {
  studentId: string;
  studentName: string;
  studentEmail: string;
  totalAnswers: number;
  correctAnswers: number;
  actualMastery: number;
  expectedMastery: number;
  isOutlier: boolean;
}

interface MonitoringTabProps {
  nodes: NodeItem[];
  monitoringStats: StudentStat[];
  setActiveTab: (tab: any) => void;
  setSelectedTargetTopics: (topics: string[]) => void;
  handleTriggerRemediation: (sid: string) => void;
}

export default function MonitoringTab({
  nodes,
  monitoringStats,
  setActiveTab,
  setSelectedTargetTopics,
  handleTriggerRemediation,
}: MonitoringTabProps) {
  // 1. Calculate pie chart values dynamically based on current student actual mastery levels
  const pieData = (() => {
    let weak = 0;      // <30%
    let medium = 0;    // 30% - 70%
    let strong = 0;    // >70%
    let notStarted = 0;

    monitoringStats.forEach(s => {
      if (s.totalAnswers === 0) {
        notStarted++;
      } else {
        const rate = s.actualMastery;
        if (rate < 30) weak++;
        else if (rate <= 70) medium++;
        else strong++;
      }
    });

    return [
      { name: "Yếu / Cần hỗ trợ (<30%)", value: weak },
      { name: "Trung bình (30% - 70%)", value: medium },
      { name: "Khá / Giỏi (>70%)", value: strong },
      { name: "Chưa bắt đầu / Thiếu dữ liệu", value: notStarted }
    ].filter(item => item.value > 0);
  })();

  const outliers = monitoringStats.filter(s => s.isOutlier);

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 pb-6 animate-[fadeIn_0.3s_ease-out]">
      {/* Outliers Alert Bar */}
      {outliers.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-3xl flex items-start gap-3 shadow-sm animate-pulse">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
          <div className="space-y-1">
            <span className="font-extrabold text-xs">CẢNH BÁO OUTLIERS: Gom nhóm học sinh chệch hướng</span>
            <p className="text-[10px] text-amber-700 font-semibold leading-relaxed">
              Phát hiện <span className="font-black text-amber-900">{outliers.length} học sinh</span> có dấu hiệu hổng kiến thức nghiêm trọng, tỷ lệ chính xác làm bài dưới 40% mặc dù đã có nhiều lượt nộp bài. Khuyến nghị lập lộ trình bổ trợ cá nhân ngay lập tức!
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mastery distribution Pie chart */}
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4 flex flex-col">
          <div>
            <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide">
              Phân bố độ thông thạo lớp học
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Tỷ lệ học sinh trong các nhóm năng lực Yếu, Trung bình, Khá/Giỏi</p>
          </div>
          
          <div className="h-[260px] w-full flex items-center justify-center">
            {monitoringStats.length === 0 ? (
              <span className="text-xs text-muted-foreground font-semibold animate-pulse">Đang tính toán dữ liệu lớp học...</span>
            ) : pieData.length === 0 ? (
              <span className="text-xs text-muted-foreground font-semibold">Chưa có học sinh nào làm bài kiểm tra.</span>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {
                      [
                        { name: "Yếu / Cần hỗ trợ (<30%)", color: "#ef4444" },
                        { name: "Trung bình (30% - 70%)", color: "#f59e0b" },
                        { name: "Khá / Giỏi (>70%)", color: "#10b981" },
                        { name: "Chưa bắt đầu / Thiếu dữ liệu", color: "#94a3b8" }
                      ].map((entry, index) => {
                        const actualItem = pieData.find(pd => pd.name === entry.name);
                        if (!actualItem) return null;
                        return <Cell key={`cell-${index}`} fill={entry.color} />;
                      })
                    }
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} học sinh`, 'Số lượng']} />
                  <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Scatter plot chart of outlier deviation */}
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4 flex flex-col">
          <div>
            <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide">
              Biểu đồ phân tán & Học sinh lệch hướng (Outliers)
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">So sánh độ thông thạo cá nhân với đường trung bình tập thể lớp</p>
          </div>

          <div className="h-[260px] w-full">
            {monitoringStats.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-semibold animate-pulse">Đang tải biểu đồ phân tán...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 25, right: 25, bottom: 55, left: 45 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="expectedMastery"
                    name="Kỳ vọng"
                    unit="%"
                    domain={[50, 100]}
                    label={{ value: 'Độ thông thạo Kỳ vọng (%)', position: 'insideBottom', offset: -12, fontSize: 9, fontWeight: 700 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="actualMastery"
                    name="Thực tế"
                    unit="%"
                    domain={[0, 100]}
                    label={{ value: 'Độ thông thạo Thực tế (%)', angle: -90, position: 'insideLeft', fontSize: 9, fontWeight: 700, dx: -10, dy: 45 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-lg text-[10px] font-bold space-y-1">
                            <p className="text-slate-900 font-black text-xs border-b border-slate-100 pb-1 mb-1">{data.studentName}</p>
                            <p className="text-indigo-600 flex items-center gap-1">
                              <Target size={11} />
                              <span>Kỳ vọng: {data.expectedMastery?.toFixed(1)}%</span>
                            </p>
                            <p className={`${data.isOutlier ? "text-rose-600" : "text-emerald-600"} flex items-center gap-1`}>
                              <TrendingUp size={11} />
                              <span>Thực tế: {data.actualMastery?.toFixed(1)}%</span>
                            </p>
                            <p className="text-slate-500 font-semibold font-mono text-[9px]">Tổng lượt làm: {data.totalAnswers} câu</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700, paddingTop: 10 }} />

                  {/* Target mastery reference line (outlier boundary) */}
                  <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Ranh giới hổng kiến thức (40%)', fill: '#f59e0b', fontSize: 8, fontWeight: 700, position: 'top', offset: 5 }} />

                  {/* Collective Average Line */}
                  <ReferenceLine
                    y={(() => {
                      const activeStudents = monitoringStats.filter(s => s.totalAnswers > 0);
                      if (activeStudents.length === 0) return 50;
                      return activeStudents.reduce((acc, curr) => acc + curr.actualMastery, 0) / activeStudents.length;
                    })()}
                    stroke="#6366f1"
                    strokeWidth={1.5}
                    label={{ value: 'Đường trung bình lớp', fill: '#6366f1', fontSize: 8, fontWeight: 700, position: 'top', offset: 5 }}
                  />

                  {/* Active learning students */}
                  <Scatter
                    name="Học sinh bình thường"
                    data={monitoringStats.filter(s => !s.isOutlier && s.totalAnswers > 0)}
                    fill="#6366f1"
                  />

                  {/* Outliers */}
                  <Scatter
                    name="Học sinh đi lệch / Cần hỗ trợ"
                    data={monitoringStats.filter(s => s.isOutlier)}
                    fill="#ef4444"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
          
          {/* Custom Guide Block for Reference Lines */}
          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px] text-muted-foreground font-semibold">
            <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
              <div className="w-8 h-1 bg-[#6366f1] shrink-0 rounded-full mt-1.5" />
              <div className="space-y-0.5">
                <span className="font-black text-indigo-700 block text-xs">Đường trung bình lớp</span>
                <span className="leading-relaxed">Thể hiện mức độ thông thạo trung bình thực tế hiện tại của cả lớp học.</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
              <div className="w-8 h-1 border-t border-dashed border-[#f59e0b] shrink-0 mt-1.5" />
              <div className="space-y-0.5">
                <span className="font-black text-amber-700 block text-xs">Ranh giới hổng kiến thức (40%)</span>
                <span className="leading-relaxed">Ngưỡng cảnh báo tối thiểu. Học sinh có kết quả dưới mức này cần can thiệp sớm.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Intervention list */}
      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col gap-4 flex-1">
        <div>
          <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide">
            Danh sách học sinh cần hỗ trợ & Can thiệp phụ đạo
          </h3>
        </div>
        
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-black uppercase tracking-wider text-[10px]">
                <th className="pb-3">Học sinh</th>
                <th className="pb-3">Lượt trả lời</th>
                <th className="pb-3">Tỉ lệ đúng</th>
                <th className="pb-3">Kỳ vọng</th>
                <th className="pb-3">Chênh lệch</th>
                <th className="pb-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-medium text-foreground/80">
              {monitoringStats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground font-bold">
                    Không có dữ liệu giám sát
                  </td>
                </tr>
              ) : (
                monitoringStats.map((s, idx) => {
                  const diff = s.expectedMastery - s.actualMastery;
                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-foreground flex items-center gap-1.5">
                            {s.studentName}
                            {s.isOutlier && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[8px] border border-rose-100 font-extrabold uppercase animate-pulse">
                                Outlier
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-semibold">{s.studentEmail}</span>
                        </div>
                      </td>
                      <td className="py-3 font-mono font-bold">{s.totalAnswers} câu</td>
                      <td className="py-3 font-bold">
                        <span className={s.totalAnswers > 0 && s.actualMastery < 40 ? "text-rose-600 font-black" : "text-foreground"}>
                          {s.totalAnswers === 0 ? "Chưa có" : `${s.actualMastery.toFixed(0)}%`}
                        </span>
                      </td>
                      <td className="py-3 font-mono font-bold text-slate-500">{s.expectedMastery.toFixed(0)}%</td>
                      <td className="py-3 font-mono font-bold">
                        {s.totalAnswers === 0 ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <span className={diff > 35 ? "text-rose-600 font-black" : "text-slate-600"}>
                            {diff > 0 ? `-${diff.toFixed(0)}%` : `+${Math.abs(diff).toFixed(0)}%`}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {s.isOutlier ? (
                          <button
                            onClick={() => handleTriggerRemediation(s.studentId)}
                            className="px-3 py-1.5 bg-rose-900 hover:bg-rose-800 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                          >
                            Lập lộ trình phụ đạo
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground font-semibold">Tự động giám sát...</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
