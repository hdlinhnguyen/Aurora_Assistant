"use client";

import React from "react";
import { CheckCircle2, AlertCircle, HelpCircle, Activity, Award, Check, BookOpen } from "lucide-react";
import { NodeItem } from "../page";

interface Props {
  nodes: NodeItem[];
  studentDetail: any;
  subject: string;
}

export default function StudentMasteryMatrix({ nodes, studentDetail, subject }: Props) {
  const stats = studentDetail?.nodeDifficultyStats || {};

  const difficulties = [
    { key: "easy", label: "Nhận biết", color: "text-blue-600 bg-blue-50 border-blue-200" },
    { key: "medium", label: "Thông hiểu", color: "text-orange-600 bg-orange-50 border-orange-200" },
    { key: "hard", label: "Vận dụng", color: "text-amber-600 bg-amber-50 border-amber-200" },
    { key: "very_hard", label: "Vận dụng cao", color: "text-rose-600 bg-rose-50 border-rose-200" },
  ];

  // Calculate total answered & correct across all difficulties
  const totalStats = React.useMemo(() => {
    let totalQuestions = 0;
    let correctQuestions = 0;
    let masteredTiers = 0;
    let totalTiers = nodes.length * difficulties.length;

    nodes.forEach((node) => {
      const nodeStats = stats[node.id] || {};
      difficulties.forEach((diff) => {
        const diffStats = nodeStats[diff.key] || { correct: 0, incorrect: 0, total: 0 };
        totalQuestions += diffStats.total;
        correctQuestions += diffStats.correct;
        if (diffStats.total > 0 && (diffStats.correct / diffStats.total) >= 0.8) {
          masteredTiers++;
        }
      });
    });

    const overallAccuracy = totalQuestions > 0 ? Math.round((correctQuestions / totalQuestions) * 100) : 0;
    const progressPercent = totalTiers > 0 ? Math.round((masteredTiers / totalTiers) * 100) : 0;

    return { totalQuestions, correctQuestions, overallAccuracy, masteredTiers, totalTiers, progressPercent };
  }, [nodes, stats]);

  return (
    <div className="flex-1 bg-card border border-border rounded-3xl p-6 shadow-sm overflow-hidden flex flex-col gap-5">
      {/* Overview Stats */}
      <div className="grid grid-cols-3 gap-4 bg-muted/30 p-4 border border-border rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <Award size={18} />
          </div>
          <div>
            <div className="text-xl font-black text-foreground tabular-nums">
              {totalStats.masteredTiers} / {totalStats.totalTiers}
            </div>
            <div className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">
              Mục tiêu đã Master (&ge;80%)
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Activity size={18} />
          </div>
          <div>
            <div className="text-xl font-black text-foreground tabular-nums">
              {totalStats.progressPercent}%
            </div>
            <div className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">
              Độ phủ tiến độ
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="text-xl font-black text-foreground tabular-nums">
              {totalStats.overallAccuracy}%
            </div>
            <div className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">
              Tỷ lệ chính xác chung
            </div>
          </div>
        </div>
      </div>

      {/* Grid Matrix Table */}
      <div className="flex-1 overflow-auto border border-border rounded-2xl shadow-inner bg-card">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0] shadow-border">
            <tr className="border-b border-border text-muted-foreground font-black uppercase tracking-wider text-[9px]">
              <th className="py-4 px-5 bg-card min-w-[220px]">Chủ đề (Nút kiến thức)</th>
              {difficulties.map((diff) => (
                <th key={diff.key} className="py-4 px-4 text-center bg-card min-w-[120px]">
                  <span className={`px-2 py-1 rounded-md border font-bold text-[9px] ${diff.color}`}>
                    {diff.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 font-medium">
            {nodes.map((node) => {
              const nodeStats = stats[node.id] || {};

              return (
                <tr key={node.id} className="hover:bg-slate-50/50 transition-colors">
                  {/* Topic name */}
                  <td className="py-4 px-5">
                    <div className="flex items-start gap-2 max-w-[280px]">
                      <span className="p-1.5 bg-muted rounded-lg text-muted-foreground shrink-0 mt-0.5">
                        <BookOpen size={12} />
                      </span>
                      <div>
                        <div className="font-bold text-foreground text-[11px] leading-tight">
                          {node.name}
                        </div>
                        {node.topicGroup && (
                          <div className="text-[8px] font-black text-[var(--mint)] uppercase tracking-wider mt-0.5">
                            {node.topicGroup}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Difficulty matrix cells */}
                  {difficulties.map((diff) => {
                    const diffStats = nodeStats[diff.key] || { correct: 0, incorrect: 0, total: 0 };
                    const accuracy = diffStats.total > 0 ? Math.round((diffStats.correct / diffStats.total) * 100) : -1;
                    const isAttempted = diffStats.total > 0;
                    const isMastered = accuracy >= 80;

                    let bgStyle = "bg-transparent";
                    let textStyle = "text-muted-foreground/60";
                    let borderStyle = "border-transparent";

                    if (isAttempted) {
                      if (accuracy >= 80) {
                        bgStyle = "bg-emerald-500/10 hover:bg-emerald-500/25";
                        textStyle = "text-emerald-700 font-extrabold";
                        borderStyle = "border-emerald-200";
                      } else if (accuracy >= 50) {
                        bgStyle = "bg-amber-400/10 hover:bg-amber-400/25";
                        textStyle = "text-amber-700 font-extrabold";
                        borderStyle = "border-amber-200";
                      } else {
                        bgStyle = "bg-rose-500/10 hover:bg-rose-500/25";
                        textStyle = "text-rose-700 font-extrabold";
                        borderStyle = "border-rose-200";
                      }
                    } else {
                      bgStyle = "bg-slate-50/40 hover:bg-slate-50/80 border-dashed border-slate-200";
                    }

                    return (
                      <td
                        key={diff.key}
                        className={`p-3 text-center border-l border-border/40 transition-all ${bgStyle}`}
                        style={{ cursor: "default" }}
                      >
                        <div className="flex flex-col items-center justify-center gap-1.5 min-h-[38px]">
                          {isAttempted ? (
                            <>
                              <div className="flex items-center gap-1">
                                {isMastered ? (
                                  <span className="h-4 w-4 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[8px] font-black shrink-0">
                                    ✓
                                  </span>
                                ) : (
                                  <span className="h-4 w-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8px] font-black shrink-0">
                                    !
                                  </span>
                                )}
                                <span className={`text-[11px] font-extrabold tabular-nums ${textStyle}`}>
                                  {diffStats.correct}/{diffStats.total}
                                </span>
                              </div>
                              <span className={`text-[9px] font-bold opacity-80 ${textStyle}`}>
                                {accuracy}% đúng
                              </span>
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/40 font-semibold italic">
                              Chưa làm
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer legend */}
      <div className="flex items-center gap-5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-1">
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[8px] font-black">✓</span> Đạt chuẩn (&ge;80% đúng)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8px] font-black">!</span> Cần cải thiện (&lt;80% đúng)
        </span>
      </div>
    </div>
  );
}
