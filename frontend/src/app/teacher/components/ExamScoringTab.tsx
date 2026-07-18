"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function ExamScoringTab() {
  const [batches, setBatches] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [examId, setExamId] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch("/teacher/grading-batches"),
      apiFetch("/teacher/scoring/students"),
      apiFetch("/teacher/exams?status=preparing_exam"),
    ])
      .then(([batchData, studentData, examData]) => {
        setBatches(Array.isArray(batchData) ? batchData : batchData?.items || []);
        setStudents(Array.isArray(studentData) ? studentData : studentData?.items || []);
        setExams(Array.isArray(examData) ? examData : examData?.items || []);
      })
      .catch((error) => setMessage(error.message));
  }, []);

  const createBatch = async () => {
    const exam = exams.find((item) => item.id === examId);
    if (!exam || studentIds.length === 0) {
      setMessage("Chọn một đề đã prepare và ít nhất một học sinh.");
      return;
    }
    setBusy(true);
    try {
      const batch = await apiFetch("/teacher/grading-batches", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          examId,
          studentIds,
          expectedExamVersion: exam.version,
        }),
      });
      setBatches((current) => [batch, ...current]);
      setMessage("Đã tạo batch chấm bài.");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto space-y-5">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-black">Chấm bài kiểm tra</h2>
        <p className="mt-1 text-xs text-muted-foreground">Chọn một batch đã tạo để mở submission và chấm thủ công. Điểm luôn được tính ở backend.</p>
        {message && <p className="mt-3 text-xs font-bold text-destructive">{message}</p>}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-muted p-4">
            <h3 className="text-xs font-black uppercase">Batch chấm bài</h3>
            <div className="mt-3 space-y-2">{batches.map((batch) => <div key={batch.id} className="rounded-xl border border-border bg-card p-3 text-xs"><b>{batch.examTitle || batch.examId}</b><span className="ml-2 text-muted-foreground">{batch.status} · {batch.approvedSubmissions ?? 0}/{batch.totalSubmissions ?? 0}</span></div>)}{!batches.length && <p className="text-xs text-muted-foreground">Chưa có batch.</p>}</div>
          </div>
          <div className="rounded-2xl bg-muted p-4">
            <h3 className="text-xs font-black uppercase">Tạo batch</h3>
            <select value={examId} onChange={(event) => setExamId(event.target.value)} className="mt-3 w-full rounded-xl border border-border bg-card p-3 text-xs">
              <option value="">Chọn đề đã prepare</option>
              {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
            </select>
            <div className="mt-3 max-h-52 space-y-2 overflow-auto">{students.map((student) => <label key={student.id} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-xs"><input type="checkbox" checked={studentIds.includes(student.id)} onChange={() => setStudentIds((current) => current.includes(student.id) ? current.filter((id) => id !== student.id) : [...current, student.id])} />{student.name || student.email}</label>)}{!students.length && <p className="text-xs text-muted-foreground">Chưa tải được danh sách.</p>}</div>
          </div>
        </div>
        <button disabled={busy} onClick={createBatch} className="mt-5 rounded-xl bg-foreground px-4 py-2 text-xs font-black text-background">Tạo batch chấm bài</button>
      </section>
    </div>
  );
}
