"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  History,
  Loader2,
  RotateCcw,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";

const results = [
  { value: "correct", label: "Đúng", icon: Check },
  { value: "incorrect", label: "Sai", icon: X },
  { value: "unanswered", label: "Không làm", icon: RotateCcw },
];

interface Exam {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  durationMinutes: number;
  totalPoints: string;
  status: string;
  version: number;
}

interface Student {
  id: string;
  name: string;
  email: string;
}

interface GradingBatch {
  id: string;
  examId: string;
  examTitle: string;
  teacherId: string;
  status: string;
  createdAt: string;
}

interface QuestionResponse {
  id: string;
  reviewed: boolean;
  status: string;
  points: string;
  content: string;
  questionType?: string;
  rubricItems?: any[];
}

interface RubricResponse {
  id: string;
  reviewed: boolean;
  status: string;
  points: string;
  content?: string;
  description?: string;
}

interface Submission {
  id: string;
  batchId: string;
  studentId: string;
  studentName: string;
  status: string;
  totalScore: string;
  version: number;
  questions?: QuestionResponse[];
  rubrics?: RubricResponse[];
  gradedAt?: string;
  awardedPoints?: string | number;
}

interface Session {
  batch: GradingBatch;
  submission: Submission | null;
}

export default function ExamScoringTab({ selectedSubject }: { selectedSubject: string }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [exam, setExam] = useState<Exam | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!selectedSubject) {
      setExams([]);
      setExam(null);
      return;
    }
    setExam(null);
    setStudent(null);
    setSubmission(null);
    Promise.all([
      apiFetch(`/teacher/exams?status=preparing_exam&subject=${encodeURIComponent(selectedSubject)}`),
      apiFetch("/teacher/scoring/students"),
      apiFetch("/teacher/grading-batches"),
    ])
      .then(([examRows, studentRows, sessionRows]) => {
        setExams(examRows);
        setStudents(studentRows);
        setSessions(sessionRows.map((batch: GradingBatch) => ({ batch, submission: null })));
      })
      .catch((error) => setNotice(error.message));
  }, [selectedSubject]);

  const selectExam = async (nextExam: Exam) => {
    setExam(nextExam);
    setStudent(null);
    setSubmission(null);
    setHistory([]);
    setBusy("exam");
    try {
      const related = (await apiFetch("/teacher/grading-batches")).filter(
        (batch: GradingBatch) => batch.examId === nextExam.id,
      );
      const hydrated = await Promise.all(
        related.map(async (batch: GradingBatch) => ({
          batch,
          submission: (await apiFetch(`/teacher/grading-batches/${batch.id}`)).submissions?.[0],
        })),
      );
      setSessions(hydrated);
    } catch (error: any) {
      setNotice(error.message);
    } finally {
      setBusy("");
    }
  };

  const filteredStudents = useMemo(
    () =>
      students.filter((item) =>
        `${item.name} ${item.email}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [students, search],
  );
  const sessionFor = (studentId: string) =>
    sessions.find((item) => item.submission?.studentId === studentId);
  const selectStudent = async (nextStudent: Student) => {
    if (!exam) return;
    setStudent(nextStudent);
    setBusy("student");
    setNotice("");
    try {
      let session = sessionFor(nextStudent.id);
      if (!session) {
        const batch = await apiFetch("/teacher/grading-batches", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            examId: exam.id,
            studentIds: [nextStudent.id],
            expectedExamVersion: exam.version,
          }),
        });
        const detail = await apiFetch(`/teacher/grading-batches/${batch.id}`);
        session = { batch: detail, submission: detail.submissions[0] };
        setSessions((current) => [...current, session!]);
      }
      setSubmission(await apiFetch(`/teacher/scoring-submissions/${session.submission!.id}`));
    } catch (error: any) {
      setNotice(error.message);
      setStudent(null);
    } finally {
      setBusy("");
    }
  };

  const saveResult = async (kind: "questions" | "rubrics", id: string, status: string) => {
    if (!submission) return;
    setBusy(id);
    try {
      setSubmission(
        await apiFetch(`/teacher/scoring-submissions/${submission.id}/${kind}/${id}`, {
          method: "PUT",
          body: JSON.stringify({ status, expectedVersion: submission.version }),
        }),
      );
      setNotice("Đã lưu kết quả.");
    } catch (error: any) {
      setNotice(error.message);
      setSubmission(await apiFetch(`/teacher/scoring-submissions/${submission.id}`));
    } finally {
      setBusy("");
    }
  };
  const approve = async () => {
    if (!submission) return;
    setBusy("approve");
    try {
      setSubmission(
        await apiFetch(`/teacher/scoring-submissions/${submission.id}/approve`, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ expectedVersion: submission.version }),
        }),
      );
      setNotice("Đã duyệt phiếu chấm.");
    } catch (error: any) {
      setNotice(error.message);
    } finally {
      setBusy("");
    }
  };
  const revision = async () => {
    if (!submission) return;
    setBusy("revision");
    try {
      setSubmission(
        await apiFetch(`/teacher/scoring-submissions/${submission.id}/revisions`, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ expectedVersion: submission.version }),
        }),
      );
      setNotice("Đã mở phiên chỉnh sửa.");
    } catch (error: any) {
      setNotice(error.message);
    } finally {
      setBusy("");
    }
  };
  const loadHistory = async () => {
    if (submission)
      setHistory(await apiFetch(`/teacher/scoring-submissions/${submission.id}/history`));
  };
  const reviewed = submission
    ? [...(submission.questions || []), ...(submission.rubrics || [])].filter((row) => row.reviewed)
        .length
    : 0;
  const total = submission
    ? (submission.questions?.length || 0) + (submission.rubrics?.length || 0)
    : 0;

  if (!exam) {
    return (
      <div data-testid="scoring-workspace" className="flex-1 min-h-0 flex justify-center animate-[fadeIn_0.3s_ease-out]">
        <aside
          data-testid="scoring-exam-step"
          className="w-full max-w-xl rounded-3xl border bg-card shadow-sm min-h-0 overflow-hidden flex flex-col"
        >
          <div className="p-5 border-b bg-gradient-to-br from-violet-50 to-white">
            <p className="text-[9px] uppercase tracking-[.2em] text-violet-700 font-black">Bước 1</p>
            <h2 className="mt-1 text-lg font-black">Chọn đề kiểm tra</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Chỉ hiển thị đề đã sẵn sàng chấm.
            </p>
          </div>
          <div className="p-3 space-y-2 overflow-auto flex-1">
            {exams.map((item) => (
              <button
                key={item.id}
                onClick={() => selectExam(item)}
                className="w-full rounded-2xl border border-border p-4 text-left transition-all hover:border-violet-300 hover:bg-violet-50/20 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <b className="text-sm font-bold line-clamp-2">{item.title}</b>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </div>
                <p className="mt-2 text-[10px] font-bold text-muted-foreground">
                  {item.subject} · {item.totalPoints} điểm
                </p>
              </button>
            ))}
            {!exams.length && (
              <p className="p-6 text-center text-xs text-muted-foreground">Chưa có đề sẵn sàng.</p>
            )}
          </div>
        </aside>
      </div>
    );
  }

  return (
    <div
      data-testid="scoring-workspace"
      className="flex-1 min-h-0 grid gap-4 xl:grid-cols-[310px_minmax(0,1fr)] animate-[fadeIn_0.3s_ease-out]"
    >
      <aside
        data-testid="scoring-student-step"
        aria-disabled={!exam}
        className={`rounded-3xl border bg-card shadow-sm min-h-0 overflow-hidden flex flex-col ${!exam ? "opacity-55" : ""}`}
      >
        <div className="p-5 border-b flex items-start gap-3">
          <button
            onClick={() => {
              setExam(null);
              setStudent(null);
              setSubmission(null);
            }}
            className="mt-1 h-8 px-2.5 rounded-xl border border-border bg-background hover:bg-muted text-foreground flex items-center gap-1 text-[10px] font-black shadow-sm transition-all cursor-pointer active:scale-95 shrink-0"
            title="Quay lại danh sách đề kiểm tra"
          >
            <ChevronLeft size={13} />
            Quay lại
          </button>
          <div>
            <p className="text-[9px] uppercase tracking-[.2em] font-black text-emerald-600">Bước 2</p>
            <h2 className="mt-1 text-lg font-black leading-none">Chọn học sinh</h2>
            <p className="mt-1 text-[10px] text-muted-foreground leading-normal">
              Mỗi lần chỉ mở một phiếu cá nhân.
            </p>
          </div>
        </div>
        {exam ? (
          <>
            <div className="p-3 relative">
              <Search size={14} className="absolute left-6 top-5 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm tên hoặc email"
                className="w-full rounded-xl border bg-background pl-9 p-2.5 text-xs"
              />
            </div>
            <div className="px-3 pb-3 overflow-auto space-y-2">
              {filteredStudents.map((item) => {
                const session = sessionFor(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => selectStudent(item)}
                    className={`w-full rounded-2xl border p-3 text-left ${student?.id === item.id ? "border-emerald-300 bg-emerald-50" : "hover:bg-muted"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-slate-950 text-white grid place-items-center text-xs font-black">
                        {item.name?.[0] || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <b className="block text-xs truncate">{item.name}</b>
                        <span className="block text-[10px] text-muted-foreground truncate">
                          {item.email}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] font-black rounded-full px-2 py-1 ${session?.submission?.status === "approved" ? "bg-emerald-100 text-emerald-700" : session ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {session?.submission?.status === "approved"
                          ? "Đã duyệt"
                          : session
                            ? "Đang chấm"
                            : "Chưa chấm"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex-1 grid place-items-center p-6 text-center">
            <Users className="mx-auto text-muted-foreground" />
            <p className="mt-3 text-xs font-black">Hãy chọn đề trước</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Danh sách học sinh sẽ xuất hiện sau khi chọn đề.
            </p>
          </div>
        )}
      </aside>

      <main
        data-testid="scoring-grading-step"
        aria-disabled={!submission}
        className={`rounded-3xl border bg-card shadow-sm min-h-0 overflow-auto ${!submission ? "opacity-70" : ""}`}
      >
        {submission ? (
          <>
            <div className="sticky top-0 z-10 p-5 border-b bg-card/95 backdrop-blur">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <div className="flex gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[9px] font-black ${submission.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                    >
                      {submission.status === "approved" ? "Đã duyệt" : "Đang chấm"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Phiên bản {submission.version}
                    </span>
                  </div>
                  <h2 className="mt-2 text-lg font-black">Phiếu chấm · {student?.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    Đã xem {reviewed}/{total} mục · {submission.awardedPoints} điểm
                  </p>
                </div>
                <div className="flex gap-2">
                  {submission.status === "approved" ? (
                    <>
                      <button
                        onClick={revision}
                        className="rounded-xl border px-3 py-2 text-xs font-black flex gap-1"
                      >
                        <RotateCcw size={14} />
                        Chỉnh sửa lại
                      </button>
                      <button
                        onClick={loadHistory}
                        className="rounded-xl bg-muted px-3 py-2 text-xs font-black flex gap-1"
                      >
                        <History size={14} />
                        Lịch sử
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={approve}
                      disabled={reviewed < total || busy === "approve"}
                      className="rounded-xl bg-foreground text-background px-4 py-2 text-xs font-black disabled:opacity-40 flex gap-1"
                    >
                      <CheckCircle2 size={14} />
                      Duyệt phiếu
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--mint)] transition-all"
                  style={{ width: `${total ? (reviewed / total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="p-5 space-y-4">
              {(submission.questions || []).map((row: any, index: number) => (
                <ResultCard
                  key={row.examQuestionId}
                  title={`Câu ${index + 1}`}
                  subtitle={row.examQuestionId.slice(0, 8)}
                  result={row}
                  disabled={submission.status === "approved"}
                  busy={busy === row.examQuestionId}
                  onChange={(status) => saveResult("questions", row.examQuestionId, status)}
                />
              ))}
              {(submission.rubrics || []).map((row: any, index: number) => (
                <ResultCard
                  key={row.examRubricItemId}
                  title={`Ý barem ${index + 1}`}
                  subtitle={row.examRubricItemId.slice(0, 8)}
                  result={row}
                  disabled={submission.status === "approved"}
                  busy={busy === row.examRubricItemId}
                  onChange={(status) => saveResult("rubrics", row.examRubricItemId, status)}
                />
              ))}
              {history.length > 0 && (
                <div className="rounded-2xl border bg-slate-950 text-white p-4">
                  <h3 className="text-xs font-black">Lịch sử duyệt</h3>
                  {history.map((item) => (
                    <div key={item.id} className="mt-2 flex justify-between text-xs text-white/70">
                      <span>Phiên bản {item.approvalVersion}</span>
                      <b>{item.totalPoints} điểm</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="h-full grid place-items-center p-8 text-center">
            <ClipboardCheck size={40} className="mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm font-black">Chọn đề và học sinh để bắt đầu</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              Phiếu chấm sẽ mở tại đây sau khi bạn chọn một học sinh.
            </p>
          </div>
        )}
        {notice && (
          <div className="fixed bottom-6 right-6 max-w-sm rounded-2xl bg-slate-950 text-white px-4 py-3 text-xs font-bold shadow-xl">
            {notice}
          </div>
        )}
      </main>
    </div>
  );
}

function ResultCard({
  title,
  subtitle,
  result,
  disabled,
  busy,
  onChange,
}: {
  title: string;
  subtitle: string;
  result: any;
  disabled: boolean;
  busy: boolean;
  onChange: (status: string) => void;
}) {
  return (
    <article
      className={`rounded-2xl border p-4 ${result.reviewed ? "border-emerald-200 bg-emerald-50/30" : "border-border"}`}
    >
      <div className="flex justify-between">
        <div>
          <h3 className="text-sm font-black">{title}</h3>
          <p className="text-[10px] text-muted-foreground">Mã {subtitle}</p>
        </div>
        <div className="text-right">
          <b className="text-sm">{result.awardedPoints}đ</b>
          <p className="text-[9px] text-muted-foreground">
            {result.reviewed ? "Đã xem" : "Chưa xem"}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {results.map((option) => {
          const Icon = option.icon;
          const active = result.status === option.value && result.reviewed;
          return (
            <button
              key={option.value}
              disabled={disabled || busy}
              onClick={() => onChange(option.value)}
              className={`rounded-xl border px-3 py-2.5 text-xs font-black flex justify-center gap-1.5 transition-all ${active ? (option.value === "correct" ? "bg-emerald-500 border-emerald-500 text-white" : option.value === "incorrect" ? "bg-rose-500 border-rose-500 text-white" : "bg-slate-700 border-slate-700 text-white") : "hover:bg-muted"}`}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}{" "}
              {option.label}
            </button>
          );
        })}
      </div>
    </article>
  );
}
