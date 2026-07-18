"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Exam = {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  totalPoints: string;
  status: string;
  version: number;
};

export default function ExamBuilderTab({ subjects }: { subjects: string[] }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selected, setSelected] = useState<Exam | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(subjects[0] || "");
  const [gradeLevel, setGradeLevel] = useState("Lớp 5");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [totalPoints, setTotalPoints] = useState("10.00");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    const data = await apiFetch("/teacher/exams");
    setExams(Array.isArray(data) ? data : data?.items || []);
  };

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!subject && subjects[0]) setSubject(subjects[0]);
  }, [subjects, subject]);

  const createExam = async () => {
    setBusy(true);
    setMessage("");
    try {
      const exam = await apiFetch("/teacher/exams", {
        method: "POST",
        body: JSON.stringify({ title, subject, gradeLevel, durationMinutes, totalPoints }),
      });
      setSelected(exam);
      setTitle("");
      await load();
      setMessage("Đã tạo đề nháp.");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const transition = async (action: "validate" | "prepare") => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await apiFetch(`/teacher/exams/${selected.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: selected.version }),
      });
      setSelected(result);
      await load();
      setMessage(action === "prepare" ? "Đề đã sẵn sàng để chấm." : "Đã kiểm tra đề.");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto space-y-5">
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-black uppercase tracking-wide text-sm">Đề kiểm tra</h2>
            <button onClick={() => setSelected(null)} className="text-xs font-black text-[var(--mint)]">+ Mới</button>
          </div>
          <div className="space-y-2">
            {exams.map((exam) => (
              <button key={exam.id} onClick={() => setSelected(exam)} className={`w-full rounded-xl border p-3 text-left ${selected?.id === exam.id ? "border-[var(--mint)] bg-muted" : "border-border"}`}>
                <div className="truncate text-xs font-black">{exam.title}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">{exam.subject} · {exam.status}</div>
              </button>
            ))}
            {!exams.length && <p className="text-xs text-muted-foreground">Chưa có đề.</p>}
          </div>
        </section>
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div><h2 className="text-lg font-black">{selected.title}</h2><p className="text-xs text-muted-foreground">v{selected.version} · {selected.status}</p></div>
                <div className="flex gap-2">
                  <button onClick={() => transition("validate")} disabled={busy} className="rounded-xl border border-border px-3 py-2 text-xs font-black">Kiểm tra</button>
                  <button onClick={() => transition("prepare")} disabled={busy} className="rounded-xl bg-foreground px-3 py-2 text-xs font-black text-background">Chuẩn bị</button>
                </div>
              </div>
              <p className="rounded-xl bg-muted p-4 text-xs text-muted-foreground">Dùng ngân hàng câu hỏi và các route authoring để bổ sung nội dung đề. Bản tối thiểu đã hỗ trợ tạo, xem, validate và prepare.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-lg font-black">Tạo đề kiểm tra</h2>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tên đề" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              <div className="grid gap-3 sm:grid-cols-3">
                <select value={subject} onChange={(e) => setSubject(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">{subjects.map((item) => <option key={item}>{item}</option>)}</select>
                <input value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} placeholder="Khối lớp" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <input value={totalPoints} onChange={(e) => setTotalPoints(e.target.value)} placeholder="Tổng điểm" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              <button onClick={createExam} disabled={busy || !title.trim()} className="rounded-xl bg-[var(--mint)] px-4 py-2 text-xs font-black">Tạo đề nháp</button>
            </div>
          )}
          {message && <p className="mt-4 text-xs font-bold text-muted-foreground">{message}</p>}
        </section>
      </div>
    </div>
  );
}
