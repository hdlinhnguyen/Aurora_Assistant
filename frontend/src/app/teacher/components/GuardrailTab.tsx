"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Shield, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

interface GuardrailEvent {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  sessionId: string | null;
  source: string;
  category: string;
  message: string;
  severity: string;
  handled: boolean;
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  self_harm: "Tự làm hại",
  abuse: "Xúc phạm",
  sexual: "Nội dung nhạy cảm",
  violence: "Bạo lực",
  profanity: "Ngôn từ tục",
  jailbreak: "Lách luật AI",
  personal_info: "Lộ thông tin cá nhân",
};

const SOURCE_LABELS: Record<string, string> = {
  chat_input: "Chat Socratic",
  chat_output: "Phản hồi AI",
  theory_chat: "Chat lý thuyết",
};

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

const SEVERITY_LABELS: Record<string, string> = {
  high: "Nghiêm trọng",
  medium: "Trung bình",
  low: "Nhẹ",
};

// self_harm luôn nổi lên đầu bất kể thời gian — giáo viên cần thấy trước tiên.
function sortEvents(events: GuardrailEvent[]): GuardrailEvent[] {
  return [...events].sort((a, b) => {
    const aCritical = a.category === "self_harm" && !a.handled ? 0 : 1;
    const bCritical = b.category === "self_harm" && !b.handled ? 0 : 1;
    if (aCritical !== bCritical) return aCritical - bCritical;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export default function GuardrailTab() {
  const [events, setEvents] = useState<GuardrailEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [showHandled, setShowHandled] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const qs = severityFilter ? `?severity=${severityFilter}` : "";
      const data = await apiFetch(`/teacher/guardrail-events${qs}`);
      setEvents(sortEvents(Array.isArray(data) ? data : []));
    } catch {
      toast.error("Không thể tải danh sách cảnh báo an toàn");
    } finally {
      setLoading(false);
    }
  }, [severityFilter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  async function markHandled(eventId: string) {
    try {
      await apiFetch(`/teacher/guardrail-events/${eventId}/handled`, { method: "PUT" });
      setEvents((prev) =>
        sortEvents(prev.map((e) => (e.id === eventId ? { ...e, handled: true } : e))),
      );
      toast.success("Đã đánh dấu xử lý");
    } catch {
      toast.error("Không thể cập nhật sự kiện");
    }
  }

  const visible = events.filter((e) => showHandled || !e.handled);
  const unhandled = events.filter((e) => !e.handled);
  const criticalCount = unhandled.filter((e) => e.category === "self_harm").length;
  const countByCategory = unhandled.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center">
            <Shield size={18} className="text-emerald-700" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">An toàn học sinh</h2>
            <p className="text-xs text-slate-500 font-bold">
              Tin nhắn bị lớp kiểm duyệt 2 tầng chặn (regex tiếng Việt chống lách + AI tự gắn cờ)
            </p>
          </div>
        </div>
        <button
          onClick={loadEvents}
          className="flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-xl text-xs font-black transition-all active:scale-95"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Làm mới
        </button>
      </div>

      {/* Cảnh báo tự làm hại — ưu tiên cao nhất */}
      {criticalCount > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <ShieldAlert size={20} className="text-red-600 shrink-0" />
          <div className="text-sm font-bold text-red-800">
            Có {criticalCount} cảnh báo <span className="font-black">Tự làm hại</span> chưa xử lý —
            hãy liên hệ học sinh hoặc phụ huynh ngay.
          </div>
        </div>
      )}

      {/* Thẻ đếm theo category */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <div
            key={key}
            className={`px-3 py-2 rounded-xl border text-xs font-black ${
              (countByCategory[key] || 0) > 0
                ? key === "self_harm"
                  ? "bg-red-100 text-red-700 border-red-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-slate-50 text-slate-400 border-slate-200"
            }`}
          >
            {label}: {countByCategory[key] || 0}
          </div>
        ))}
      </div>

      {/* Bộ lọc */}
      <div className="flex items-center gap-2">
        {["", "high", "medium", "low"].map((sev) => (
          <button
            key={sev || "all"}
            onClick={() => setSeverityFilter(sev)}
            className={`px-3 py-1.5 rounded-full text-xs font-black border transition-all ${
              severityFilter === sev
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {sev === "" ? "Tất cả" : SEVERITY_LABELS[sev]}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showHandled}
            onChange={(e) => setShowHandled(e.target.checked)}
            className="accent-slate-900"
          />
          Hiện cả sự kiện đã xử lý
        </label>
      </div>

      {/* Danh sách sự kiện */}
      {loading ? (
        <div className="text-center py-12 text-sm font-bold text-slate-400">Đang tải...</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl">
          <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-2" />
          <div className="text-sm font-black text-slate-700">Không có cảnh báo nào</div>
          <div className="text-xs text-slate-500 font-bold mt-1">
            Mọi hội thoại của học sinh đều an toàn 🎉
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((event) => (
            <div
              key={event.id}
              className={`border rounded-2xl p-4 transition-all ${
                event.handled
                  ? "bg-slate-50 border-slate-200 opacity-70"
                  : event.category === "self_harm"
                    ? "bg-red-50/60 border-red-200"
                    : "bg-white border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wide ${SEVERITY_STYLES[event.severity] || SEVERITY_STYLES.low}`}>
                      {SEVERITY_LABELS[event.severity] || event.severity}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 text-[10px] font-black">
                      {CATEGORY_LABELS[event.category] || event.category}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">
                      {SOURCE_LABELS[event.source] || event.source} ·{" "}
                      {new Date(event.createdAt).toLocaleString("vi-VN")}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-black text-slate-800">
                    {event.studentName}
                    <span className="ml-2 text-[11px] text-slate-400 font-bold">{event.studentEmail}</span>
                  </div>
                  {event.message && (
                    <div className="mt-1.5 text-xs text-slate-600 font-medium bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 break-words">
                      &ldquo;{event.message}&rdquo;
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {event.handled ? (
                    <span className="flex items-center gap-1 text-xs font-black text-emerald-600">
                      <CheckCircle2 size={14} /> Đã xử lý
                    </span>
                  ) : (
                    <button
                      onClick={() => markHandled(event.id)}
                      className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-700 text-white px-3 py-2 rounded-xl text-xs font-black transition-all active:scale-95"
                    >
                      <AlertTriangle size={13} />
                      Đã xử lý
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
