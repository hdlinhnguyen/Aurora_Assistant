"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, API_BASE_URL } from "@/lib/api";
import { BookOpen, CheckCircle2, ChevronRight, Clock3, FileDown, FilePenLine, GripVertical, Library, Loader2, Plus, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";

type Exam = { id: string; title: string; subject: string; gradeLevel: string; durationMinutes: number; totalPoints: string; status: string; version: number; questions?: any[] };
const statusCopy: Record<string, string> = { drafting: "Bản nháp", preparing_exam: "Sẵn sàng chấm", done: "Hoàn tất" };

const formatMarkdown = (text: string): string => {
  if (!text) return "";
  let html = text;

  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  const renderMathExpr = (expr: string) => {
    let m = expr;
    // Strip left/right modifiers
    m = m.replace(/\\left/g, "").replace(/\\right/g, "");
    
    // Replace latex spaces with normal space
    m = m.replace(/\\,/g, " ")
         .replace(/\\ /g, " ")
         .replace(/\\;/g, " ")
         .replace(/\\:/g, " ")
         .replace(/\\!/g, "");

    m = m.replace(/\\d?frac\{([^}]+)\}\{([^}]+)\}/g, (_match, num, den) => {
      return `<span class="inline-flex flex-col items-center align-middle mx-1 font-semibold text-[12px] leading-tight font-sans">
        <span class="border-b border-violet-700 px-1 text-center pb-0.5">${num}</span>
        <span class="px-1 text-center pt-0.5">${den}</span>
      </span>`;
    });
    m = m.replace(/\\cdot/g, "·");
    m = m.replace(/\\neq/g, "≠");
    m = m.replace(/\\Rightarrow|\\implies/g, "⇒");
    m = m.replace(/\\le|\\leq/g, "≤");
    m = m.replace(/\\ge|\\geq/g, "≥");
    m = m.replace(/\\times/g, "×");
    m = m.replace(/\\div/g, "÷");

    // Replace exponents (superscripts)
    m = m.replace(/\^\{(.*?)\}/g, "<sup>$1</sup>");
    m = m.replace(/\^([a-zA-Z0-9\-+])/g, "<sup>$1</sup>");

    // Replace subscripts
    m = m.replace(/_\{(.*?)\}/g, "<sub>$1</sub>");
    m = m.replace(/_([a-zA-Z0-9\-+])/g, "<sub>$1</sub>");

    return `<span class="font-serif italic text-slate-800 mx-0.5 inline-flex items-center align-middle">${m}</span>`;
  };

  html = html.replace(/\$(.*?)\$/g, (_match, p1) => {
    return renderMathExpr(p1);
  });

  html = html.replace(/\n/g, "<br />");
  return html;
};

export default function ExamBuilderTab({ subjects }: { subjects: string[] }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [detail, setDetail] = useState<Exam | null>(null);
  const [bank, setBank] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", subject: subjects[0] || "", gradeLevel: "Lớp 5", durationMinutes: 45, totalPoints: "10.00" });
  const [manual, setManual] = useState({ type: "single_choice", content: "", points: "1.00", choices: ["", "", "", ""] });
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [rubric, setRubric] = useState({ description: "", points: "1.00" });

  const loadExams = async () => setExams(await apiFetch("/teacher/exams"));
  const selectExam = async (id: string) => {
    setBusy("detail");
    setCreating(false);
    try { setDetail(await apiFetch(`/teacher/exams/${id}`)); setSelectedQuestionId(""); }
    finally { setBusy(""); }
  };
  useEffect(() => { loadExams().catch((e) => setNotice(e.message)); }, []);
  useEffect(() => {
    const subject = detail?.subject || form.subject;
    if (subject) apiFetch(`/teacher/exam-bank/questions?subject=${encodeURIComponent(subject)}`).then(setBank).catch(() => setBank([]));
  }, [detail?.subject, form.subject]);
  useEffect(() => { if (!form.subject && subjects[0]) setForm((v) => ({ ...v, subject: subjects[0] })); }, [subjects, form.subject]);

  const filteredBank = useMemo(() => {
    return bank
      .filter((q) => q.content?.toLowerCase().includes(search.toLowerCase()))
      .filter((q) => !detail?.questions?.some((eq) => eq.sourceQuestionId === q.id));
  }, [bank, search, detail?.questions]);
  const pointsUsed = (detail?.questions || []).reduce((sum, q) => sum + Number(q.points || 0), 0);
  const selectedQuestion = detail?.questions?.find((q) => q.id === selectedQuestionId);

  const validationErrors = useMemo(() => {
    if (!detail) return [];
    const errs: string[] = [];
    const total = Number(detail.totalPoints || 0);
    const currentPoints = (detail.questions || []).reduce((sum, q) => sum + Number(q.points || 0), 0);

    if (currentPoints > total) {
      errs.push(`Tổng điểm các câu hỏi (${currentPoints.toFixed(2)}đ) đang vượt quá tổng điểm đề ra (${total.toFixed(2)}đ).`);
    } else if (currentPoints < total) {
      errs.push(`Tổng điểm các câu hỏi (${currentPoints.toFixed(2)}đ) chưa bằng tổng điểm đề ra (${total.toFixed(2)}đ).`);
    }

    if (!detail.questions || detail.questions.length === 0) {
      errs.push("Đề thi phải có ít nhất 1 câu hỏi.");
    }

    // Check essay rubrics total points
    detail.questions?.forEach((q, idx) => {
      if (q.questionType === "essay") {
        const rubricTotal = (q.rubricItems || []).reduce((sum: number, r: any) => sum + Number(r.points || 0), 0);
        const qPoints = Number(q.points || 0);
        if (rubricTotal !== qPoints) {
          errs.push(`Câu ${idx + 1} (Tự luận): Tổng điểm barem (${rubricTotal.toFixed(2)}đ) chưa bằng điểm của câu (${qPoints.toFixed(2)}đ).`);
        }
      }
    });

    return errs;
  }, [detail]);

  const mutate = async (label: string, request: () => Promise<any>, success: string) => {
    setBusy(label); setNotice("");
    try { const next = await request(); if (next?.questions || next?.status) setDetail(next); await loadExams(); setNotice(success); return next; }
    catch (e: any) { setNotice(e.message); }
    finally { setBusy(""); }
  };

  const createExam = () => mutate("create", () => apiFetch("/teacher/exams", { method: "POST", body: JSON.stringify(form) }), "Đã tạo đề nháp.").then((exam) => { if (exam) { setCreating(false); selectExam(exam.id); } });
  const addBank = (questionId: string) => {
    if (!detail) return;
    const pointsToAdd = 1.00;
    if (pointsUsed + pointsToAdd > Number(detail.totalPoints)) {
      setNotice(`Không thể thêm: Điểm câu hỏi sẽ vượt quá tổng điểm đề ra (${detail.totalPoints}đ).`);
      return;
    }
    mutate("bank", () => apiFetch(`/teacher/exams/${detail.id}/questions/from-bank`, { method: "POST", body: JSON.stringify({ questionId, points: "1.00", expectedVersion: detail.version }) }), "Đã thêm câu hỏi từ ngân hàng.");
  };

  const addManual = () => {
    if (!detail) return;
    const pointsToAdd = Number(manual.points || 0);
    if (isNaN(pointsToAdd) || pointsToAdd <= 0) {
      setNotice("Điểm câu hỏi phải là một số lớn hơn 0.");
      return;
    }
    if (pointsUsed + pointsToAdd > Number(detail.totalPoints)) {
      setNotice(`Không thể thêm: Điểm câu hỏi sẽ vượt quá tổng điểm đề ra (${detail.totalPoints}đ).`);
      return;
    }
    mutate("manual", () => apiFetch(`/teacher/exams/${detail.id}/questions/manual`, { method: "POST", body: JSON.stringify({ questionType: manual.type, content: manual.content, points: manual.points, topicNodeIds: bank[0]?.nodeId ? [bank[0].nodeId] : [], choices: manual.type === "single_choice" ? manual.choices.map((content, i) => ({ choiceId: String.fromCharCode(97 + i), content })) : [], correctChoiceId: manual.type === "single_choice" ? "a" : null, expectedVersion: detail.version }) }), "Đã thêm câu hỏi thủ công.").then(() => setManual((v) => ({ ...v, content: "", choices: ["", "", "", ""] })));
  };
  const removeQuestion = (id: string) => detail && mutate("delete", () => apiFetch(`/teacher/exams/${detail.id}/questions/${id}?expectedVersion=${detail.version}`, { method: "DELETE" }), "Đã xóa câu hỏi.");

  const clearAllMCQs = async () => {
    if (!detail || !detail.questions) return;
    const mcqs = detail.questions.filter((q) => q.questionType === "single_choice");
    if (mcqs.length === 0) return;
    if (!confirm(`Bạn có chắc chắn muốn xóa nhanh toàn bộ ${mcqs.length} câu trắc nghiệm?`)) return;

    setBusy("delete-all");
    setNotice("");
    try {
      let currentVersion = detail.version;
      for (const q of mcqs) {
        await apiFetch(`/teacher/exams/${detail.id}/questions/${q.id}?expectedVersion=${currentVersion}`, { method: "DELETE" });
        const next = await apiFetch(`/teacher/exams/${detail.id}`);
        currentVersion = next.version;
      }
      await loadExams();
      const finalDetail = await apiFetch(`/teacher/exams/${detail.id}`);
      setDetail(finalDetail);
      setNotice("Đã xóa nhanh toàn bộ câu trắc nghiệm.");
    } catch (e: any) {
      setNotice(e.message || "Có lỗi xảy ra khi xóa câu hỏi.");
    } finally {
      setBusy("");
    }
  };

  const deleteExam = async (id: string, version: number) => {
    if (!confirm("Bạn có chắc chắn muốn xóa đề thi này? Hành động này không thể hoàn tác.")) return;
    setBusy("delete-exam");
    setNotice("");
    try {
      await apiFetch(`/teacher/exams/${id}?expectedVersion=${version}`, { method: "DELETE" });
      if (detail?.id === id) {
        setDetail(null);
      }
      await loadExams();
      setNotice("Đã xóa đề thi thành công.");
    } catch (e: any) {
      setNotice(e.message || "Không thể xóa đề thi.");
    } finally {
      setBusy("");
    }
  };
  const addRubric = () => detail && selectedQuestion && mutate("rubric", () => apiFetch(`/teacher/exams/${detail.id}/questions/${selectedQuestion.id}/rubric-items`, { method: "POST", body: JSON.stringify({ description: rubric.description, points: rubric.points, topicNodeIds: selectedQuestion.topicNodeIds || [], expectedVersion: detail.version }) }), "Đã thêm ý barem.");
  const transition = (action: string, copy: string) => detail && mutate(action, () => apiFetch(`/teacher/exams/${detail.id}/${action}`, { method: "POST", body: JSON.stringify({ expectedVersion: detail.version }) }), copy);
  const exportDocx = async () => {
    if (!detail) return;
    const record = await mutate("export", () => apiFetch(`/teacher/exams/${detail.id}/exports/docx`, { method: "POST", body: JSON.stringify({ expectedVersion: detail.version, style: "standard" }) }), "Đã tạo file DOCX.");
    if (!record?.id) return;
    const token = localStorage.getItem("aurora_token");
    const response = await fetch(`${API_BASE_URL}/teacher/exams/${detail.id}/exports/${record.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = record.fileName || `${detail.title}.docx`; link.click(); URL.revokeObjectURL(url);
  };

  if ((exams.length === 0 && !detail) || (creating && !detail)) {
    return <div data-testid="exam-workspace" className="flex-1 min-h-0 flex items-start justify-center animate-[fadeIn_0.3s_ease-out] overflow-auto">
      <div className="w-full max-w-xl py-10 px-4">
        <div className="bg-card border border-border rounded-3xl shadow-sm p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[var(--mint)]/20"><FilePenLine/></div>
            <div><p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Khởi tạo</p><h2 className="text-xl font-black">Tạo một đề rõ ràng, vừa sức</h2></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[["Tên đề","title"],["Khối lớp","gradeLevel"],["Thời lượng (phút)","durationMinutes"],["Tổng điểm","totalPoints"]].map(([label,key]) => <label key={key} className="space-y-1.5 text-xs font-bold"><span>{label}</span><input value={(form as any)[key]} type={key === "durationMinutes" ? "number" : "text"} onChange={(e) => setForm({ ...form, [key]: key === "durationMinutes" ? Number(e.target.value) : e.target.value })} className="w-full rounded-xl border bg-background px-3 py-3"/></label>)}
            <label className="sm:col-span-2 space-y-1.5 text-xs font-bold"><span>Môn học</span><select value={form.subject} onChange={(e) => setForm({...form,subject:e.target.value})} className="w-full rounded-xl border bg-background px-3 py-3">{subjects.map(s=><option key={s}>{s}</option>)}</select></label>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <button onClick={createExam} disabled={!form.title || busy === "create"} className="rounded-xl bg-foreground text-background px-5 py-3 text-xs font-black flex items-center gap-2 cursor-pointer hover:opacity-90 active:scale-95 transition-all">{busy === "create" ? <Loader2 className="animate-spin" size={15}/> : <Sparkles size={15}/>}Tạo đề nháp</button>
            {exams.length > 0 && (
              <button onClick={() => setCreating(false)} className="rounded-xl border border-border bg-background px-5 py-3 text-xs font-black cursor-pointer hover:bg-muted active:scale-95 transition-all">Quay lại</button>
            )}
          </div>
        </div>
        {notice && <div className="mt-4 rounded-xl border bg-muted p-3 text-xs font-bold flex gap-2"><CheckCircle2 size={15}/>{notice}</div>}
      </div>
    </div>;
  }

  return <div data-testid="exam-workspace" className="flex-1 min-h-0 grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_320px] animate-[fadeIn_0.3s_ease-out]">
    <aside className="min-h-0 rounded-3xl border border-border bg-card shadow-sm flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border bg-gradient-to-br from-emerald-50 to-white"><div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[.2em] text-emerald-600">Kho đề</p><h2 className="font-black">Đề kiểm tra</h2></div><button onClick={() => { setCreating(true); setDetail(null); }} className="h-9 w-9 rounded-xl bg-foreground text-background grid place-items-center cursor-pointer hover:opacity-90 active:scale-95 transition-all"><Plus size={16}/></button></div></div>
      <div className="p-3 space-y-2 overflow-auto">
        {exams.map((exam) => (
          <div
            key={exam.id}
            onClick={() => selectExam(exam.id)}
            className={`group/exam w-full p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
              detail?.id === exam.id
                ? "border-emerald-300 bg-emerald-50 shadow-sm"
                : "border-transparent hover:border-border hover:bg-muted/60"
            }`}
          >
            <div className="flex justify-between items-start gap-2">
              <b className="text-xs line-clamp-2 flex-1 leading-normal font-bold text-foreground">{exam.title}</b>
              <div className="flex items-center gap-1 shrink-0">
                {exam.status === "drafting" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteExam(exam.id, exam.version);
                    }}
                    className="p-1 rounded-lg text-rose-500 hover:bg-rose-100 opacity-0 group-hover/exam:opacity-100 transition-all cursor-pointer"
                    title="Xóa nhanh đề thi"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
                <ChevronRight size={14} className="text-muted-foreground" />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[9px] font-bold text-muted-foreground">
              <span>{exam.subject}</span>
              <span className="rounded-full bg-white px-2 py-1 border">{statusCopy[exam.status] || exam.status}</span>
            </div>
          </div>
        ))}
      </div>
    </aside>

    <main className="min-h-0 rounded-3xl border border-border bg-card shadow-sm overflow-auto">
      {creating ? <div className="p-6"><div className="max-w-2xl mx-auto"><div className="mb-6 flex items-center gap-3"><div className="p-3 rounded-2xl bg-[var(--mint)]/20"><FilePenLine/></div><div><p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Khởi tạo</p><h2 className="text-xl font-black">Tạo một đề rõ ràng, vừa sức</h2></div></div><div className="grid sm:grid-cols-2 gap-4">{[["Tên đề","title"],["Khối lớp","gradeLevel"],["Thời lượng (phút)","durationMinutes"],["Tổng điểm","totalPoints"]].map(([label,key]) => <label key={key} className="space-y-1.5 text-xs font-bold"><span>{label}</span><input value={(form as any)[key]} type={key === "durationMinutes" ? "number" : "text"} onChange={(e) => setForm({ ...form, [key]: key === "durationMinutes" ? Number(e.target.value) : e.target.value })} className="w-full rounded-xl border bg-background px-3 py-3"/></label>)}<label className="sm:col-span-2 space-y-1.5 text-xs font-bold"><span>Môn học</span><select value={form.subject} onChange={(e) => setForm({...form,subject:e.target.value})} className="w-full rounded-xl border bg-background px-3 py-3">{subjects.map(s=><option key={s}>{s}</option>)}</select></label></div><div className="mt-6 flex items-center gap-3">
            <button onClick={createExam} disabled={!form.title || busy === "create"} className="rounded-xl bg-foreground text-background px-5 py-3 text-xs font-black flex items-center gap-2 cursor-pointer hover:opacity-90 active:scale-95 transition-all">{busy === "create" ? <Loader2 className="animate-spin" size={15}/> : <Sparkles size={15}/>}Tạo đề nháp</button>
            <button onClick={() => setCreating(false)} className="rounded-xl border border-border bg-background px-5 py-3 text-xs font-black cursor-pointer hover:bg-muted active:scale-95 transition-all">Quay lại</button>
          </div></div></div>
      : !detail ? <div className="h-full grid place-items-center text-center py-16"><div><Clock3 className="mx-auto text-muted-foreground"/><p className="mt-3 text-sm font-black">Chọn một đề từ danh sách bên trái</p><p className="text-xs text-muted-foreground">Hoặc bấm nút + để tạo đề mới.</p></div></div>
      : <>
        <div className="sticky top-0 z-10 p-5 border-b bg-card/95 backdrop-blur flex flex-wrap gap-4 justify-between"><div><div className="flex items-center gap-2"><span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-[9px] font-black uppercase">{statusCopy[detail.status]}</span><span className="text-[10px] text-muted-foreground">Phiên bản {detail.version}</span></div><h2 className="mt-2 text-xl font-black">{detail.title}</h2><p className="text-xs text-muted-foreground">{detail.subject} · {detail.gradeLevel} · {detail.durationMinutes} phút</p></div><div className="flex gap-2 items-center">{detail.status === "drafting" && <><button onClick={() => deleteExam(detail.id, detail.version)} className="rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 px-3 py-2 text-xs font-black cursor-pointer transition-all" title="Xóa đề thi">Xóa đề</button><button onClick={() => transition("prepare","Đã lưu và hoàn tất đề thi.")} disabled={validationErrors.length > 0} className="rounded-xl bg-foreground text-background px-3 py-2 text-xs font-black cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all" title={validationErrors.length > 0 ? "Vui lòng sửa các lỗi cấu trúc trước khi lưu đề" : "Lưu đề thi"}>Lưu đề</button></>}{detail.status === "preparing_exam" && <button onClick={() => transition("return-to-draft","Đã đưa đề về bản nháp.")} className="rounded-xl border px-3 py-2 text-xs font-black flex gap-1 cursor-pointer hover:bg-muted transition-all"><RotateCcw size={14}/>Sửa lại</button>}<button onClick={exportDocx} className="rounded-xl bg-[var(--mint)] px-3 py-2 text-xs font-black flex gap-1 cursor-pointer hover:brightness-95 active:scale-95 transition-all"><FileDown size={14}/>DOCX</button></div></div>
        <div className="p-5"><div className="mb-5 rounded-2xl bg-slate-950 text-white p-4 flex items-center justify-between"><div><p className="text-[9px] uppercase tracking-[.2em] text-emerald-300 font-black">Tiến trình đề</p><p className="mt-1 text-sm font-bold">{detail.questions?.length || 0} câu hỏi · {pointsUsed.toFixed(2)}/{detail.totalPoints} điểm</p></div><div className="w-40 h-2 rounded-full bg-white/15 overflow-hidden"><div className={`h-full ${pointsUsed > Number(detail.totalPoints) ? "bg-rose-500 animate-pulse" : "bg-[var(--mint)]"}`} style={{width:`${Math.min(100, pointsUsed/Number(detail.totalPoints)*100)}%`}}/></div></div>
          {validationErrors.length > 0 && (
            <div className="mb-5 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1 animate-[fadeIn_0.2s_ease-out]">
              <div className="font-bold flex items-center gap-1.5 text-amber-800">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                Lưu ý cấu trúc đề thi:
              </div>
              <ul className="list-disc pl-4 space-y-0.5 font-medium">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          {detail.status === "drafting" && detail.questions?.some((q) => q.questionType === "single_choice") && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={clearAllMCQs}
                disabled={busy === "delete-all"}
                className="text-[10px] font-black text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                {busy === "delete-all" ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
                Xóa nhanh câu trắc nghiệm
              </button>
            </div>
          )}
          <div className="space-y-3">
            {detail.questions?.map((q, index) => (
              <article
                key={q.id}
                onClick={() => setSelectedQuestionId(q.id)}
                className={`group rounded-2xl border p-4 cursor-pointer transition-all ${
                  selectedQuestionId === q.id
                    ? "border-[var(--purple)] bg-violet-50/30"
                    : "hover:shadow-md border-border"
                }`}
              >
                <div className="flex gap-3">
                  <GripVertical className="text-muted-foreground" size={17} />
                  <div className="flex-1">
                    <div className="flex justify-between gap-3">
                      <div>
                        <span className="text-[9px] font-black text-muted-foreground uppercase">
                          Câu {index + 1} · {q.questionType === "essay" ? "Tự luận" : "Trắc nghiệm"}
                        </span>
                        <p
                          className="mt-1 text-sm font-bold leading-relaxed text-slate-800"
                          dangerouslySetInnerHTML={{ __html: formatMarkdown(q.content) }}
                        />
                      </div>
                      <span className="text-sm font-black shrink-0">{q.points}đ</span>
                    </div>
                    {q.questionType === "essay" && (
                      <p className="mt-2 text-[10px] text-violet-700 font-bold">
                        {q.rubricItems?.length || 0} ý barem
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeQuestion(q.id);
                    }}
                    disabled={detail.status !== "drafting"}
                    className="text-rose-600 hover:bg-rose-50 p-2 rounded-xl border border-rose-100 hover:border-rose-300 disabled:opacity-50 transition-all self-center cursor-pointer shrink-0"
                    title="Xóa câu hỏi"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
            {!detail.questions?.length && (
              <div className="py-16 text-center border border-dashed rounded-3xl border-border">
                <BookOpen className="mx-auto text-muted-foreground" />
                <p className="mt-3 text-sm font-black">Đề chưa có câu hỏi</p>
                <p className="text-xs text-muted-foreground">Chọn từ ngân hàng hoặc tạo câu hỏi ở panel bên phải.</p>
              </div>
            )}
          </div>
        </div></>}
    </main>

    <aside className="min-h-0 rounded-3xl border border-border bg-card shadow-sm overflow-auto p-4 space-y-5">
      {detail ? <><div><div className="flex items-center gap-2"><Library size={16} className="text-[var(--purple)]"/><h3 className="text-sm font-black">Ngân hàng câu hỏi</h3></div><div className="mt-3 relative"><Search size={14} className="absolute left-3 top-3 text-muted-foreground"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Tìm câu hỏi..." className="w-full rounded-xl border bg-background pl-9 pr-3 py-2.5 text-xs"/></div><div className="mt-3 max-h-64 overflow-auto space-y-2">{filteredBank.slice(0,12).map(q=><button key={q.id} onClick={()=>addBank(q.id)} disabled={detail.status !== "drafting"} className="w-full rounded-xl border border-border p-3 text-left hover:border-violet-300 hover:bg-violet-50/30 disabled:opacity-50 cursor-pointer transition-all"><p className="text-xs font-bold line-clamp-2 text-slate-800" dangerouslySetInnerHTML={{ __html: formatMarkdown(q.content) }} /><span className="mt-2 inline-flex text-[9px] font-black text-violet-700 items-center gap-1"><Plus size={11}/> Thêm vào đề</span></button>)}</div></div>
        <div className="border-t pt-4"><h3 className="text-sm font-black">Soạn câu hỏi nhanh</h3><div className="mt-3 space-y-2"><select value={manual.type} onChange={e=>setManual({...manual,type:e.target.value})} className="w-full rounded-xl border bg-background p-2.5 text-xs"><option value="single_choice">Trắc nghiệm</option><option value="essay">Tự luận</option></select><textarea value={manual.content} onChange={e=>setManual({...manual,content:e.target.value})} placeholder="Nội dung câu hỏi" className="w-full rounded-xl border bg-background p-3 text-xs min-h-20"/><input value={manual.points} onChange={e=>setManual({...manual,points:e.target.value})} placeholder="Điểm" className="w-full rounded-xl border bg-background p-2.5 text-xs"/>{manual.type === "single_choice" && manual.choices.map((c,i)=><input key={i} value={c} onChange={e=>{const choices=[...manual.choices];choices[i]=e.target.value;setManual({...manual,choices})}} placeholder={`Phương án ${String.fromCharCode(65+i)}`} className="w-full rounded-xl border bg-background p-2.5 text-xs"/>)}<button onClick={addManual} disabled={!manual.content || detail.status !== "drafting"} className="w-full rounded-xl bg-foreground text-background py-2.5 text-xs font-black cursor-pointer hover:opacity-90 active:scale-95 transition-all">Thêm câu hỏi</button></div></div>
        {selectedQuestion?.questionType === "essay" && <div className="border-t pt-4"><h3 className="text-sm font-black">Barem câu tự luận</h3><div className="mt-2 space-y-2">{selectedQuestion.rubricItems?.map((r:any)=><div key={r.id} className="rounded-xl bg-violet-50/60 p-3 text-xs border border-violet-100/60 text-slate-800"><b>{r.content || r.description}</b><span className="float-right font-black text-violet-700">{r.points}đ</span></div>)}<textarea value={rubric.description} onChange={e=>setRubric({...rubric,description:e.target.value})} placeholder="Mô tả ý chấm" className="w-full rounded-xl border border-border p-2.5 text-xs bg-background"/><input value={rubric.points} onChange={e=>setRubric({...rubric,points:e.target.value})} className="w-full rounded-xl border border-border p-2.5 text-xs bg-background"/><button onClick={addRubric} className="w-full rounded-xl bg-violet-600 text-white py-2.5 text-xs font-black cursor-pointer hover:bg-violet-750 active:scale-95 transition-all">Thêm ý barem</button></div></div>}
      </> : <div className="h-full grid place-items-center text-center py-16"><div><Clock3 className="mx-auto text-muted-foreground"/><p className="mt-3 text-sm font-black">Chọn một đề</p><p className="text-xs text-muted-foreground">Công cụ biên soạn sẽ xuất hiện tại đây.</p></div></div>}
      {notice && <div className="rounded-xl border bg-muted p-3 text-xs font-bold flex gap-2"><CheckCircle2 size={15}/>{notice}</div>}
    </aside>
  </div>;
}
