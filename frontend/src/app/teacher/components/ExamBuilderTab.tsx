"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, API_BASE_URL } from "@/lib/api";
import { BookOpen, CheckCircle2, ChevronRight, Clock3, FileDown, FilePenLine, GripVertical, Library, Loader2, Plus, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";

type Exam = { id: string; title: string; subject: string; gradeLevel: string; durationMinutes: number; totalPoints: string; status: string; version: number; questions?: any[] };
const statusCopy: Record<string, string> = { drafting: "Bản nháp", preparing_exam: "Sẵn sàng chấm", done: "Hoàn tất" };

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
    try { setDetail(await apiFetch(`/teacher/exams/${id}`)); setSelectedQuestionId(""); }
    finally { setBusy(""); }
  };
  useEffect(() => { loadExams().catch((e) => setNotice(e.message)); }, []);
  useEffect(() => {
    const subject = detail?.subject || form.subject;
    if (subject) apiFetch(`/teacher/exam-bank/questions?subject=${encodeURIComponent(subject)}`).then(setBank).catch(() => setBank([]));
  }, [detail?.subject, form.subject]);
  useEffect(() => { if (!form.subject && subjects[0]) setForm((v) => ({ ...v, subject: subjects[0] })); }, [subjects, form.subject]);

  const filteredBank = useMemo(() => bank.filter((q) => q.content?.toLowerCase().includes(search.toLowerCase())), [bank, search]);
  const pointsUsed = (detail?.questions || []).reduce((sum, q) => sum + Number(q.points || 0), 0);
  const selectedQuestion = detail?.questions?.find((q) => q.id === selectedQuestionId);

  const mutate = async (label: string, request: () => Promise<any>, success: string) => {
    setBusy(label); setNotice("");
    try { const next = await request(); if (next?.questions || next?.status) setDetail(next); await loadExams(); setNotice(success); return next; }
    catch (e: any) { setNotice(e.message); }
    finally { setBusy(""); }
  };

  const createExam = () => mutate("create", () => apiFetch("/teacher/exams", { method: "POST", body: JSON.stringify(form) }), "Đã tạo đề nháp.").then((exam) => { if (exam) { setCreating(false); selectExam(exam.id); } });
  const addBank = (questionId: string) => detail && mutate("bank", () => apiFetch(`/teacher/exams/${detail.id}/questions/from-bank`, { method: "POST", body: JSON.stringify({ questionId, points: "1.00", expectedVersion: detail.version }) }), "Đã thêm câu hỏi từ ngân hàng.");
  const addManual = () => detail && mutate("manual", () => apiFetch(`/teacher/exams/${detail.id}/questions/manual`, { method: "POST", body: JSON.stringify({ questionType: manual.type, content: manual.content, points: manual.points, topicNodeIds: bank[0]?.nodeId ? [bank[0].nodeId] : [], choices: manual.type === "single_choice" ? manual.choices.map((content, i) => ({ choiceId: String.fromCharCode(97 + i), content })) : [], correctChoiceId: manual.type === "single_choice" ? "a" : null, expectedVersion: detail.version }) }), "Đã thêm câu hỏi thủ công.").then(() => setManual((v) => ({ ...v, content: "", choices: ["", "", "", ""] })));
  const removeQuestion = (id: string) => detail && mutate("delete", () => apiFetch(`/teacher/exams/${detail.id}/questions/${id}?expectedVersion=${detail.version}`, { method: "DELETE" }), "Đã xóa câu hỏi.");
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

  return <div data-testid="exam-workspace" className="flex-1 min-h-0 grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_320px] animate-[fadeIn_0.3s_ease-out]">
    <aside className="min-h-0 rounded-3xl border border-border bg-card shadow-sm flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border bg-gradient-to-br from-emerald-50 to-white"><div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[.2em] text-emerald-600">Kho đề</p><h2 className="font-black">Đề kiểm tra</h2></div><button onClick={() => { setCreating(true); setDetail(null); }} className="h-9 w-9 rounded-xl bg-foreground text-background grid place-items-center"><Plus size={16}/></button></div></div>
      <div className="p-3 space-y-2 overflow-auto">{exams.map((exam) => <button key={exam.id} onClick={() => selectExam(exam.id)} className={`w-full p-3 rounded-2xl border text-left transition-all ${detail?.id === exam.id ? "border-emerald-300 bg-emerald-50 shadow-sm" : "border-transparent hover:border-border hover:bg-muted/60"}`}><div className="flex justify-between gap-2"><b className="text-xs line-clamp-2">{exam.title}</b><ChevronRight size={14}/></div><div className="mt-2 flex items-center justify-between text-[9px] font-bold text-muted-foreground"><span>{exam.subject}</span><span className="rounded-full bg-white px-2 py-1 border">{statusCopy[exam.status] || exam.status}</span></div></button>)}</div>
    </aside>

    <main className="min-h-0 rounded-3xl border border-border bg-card shadow-sm overflow-auto">
      {creating || !detail ? <div className="p-6"><div className="max-w-2xl mx-auto"><div className="mb-6 flex items-center gap-3"><div className="p-3 rounded-2xl bg-[var(--mint)]/20"><FilePenLine/></div><div><p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Khởi tạo</p><h2 className="text-xl font-black">Tạo một đề rõ ràng, vừa sức</h2></div></div><div className="grid sm:grid-cols-2 gap-4">{[["Tên đề","title"],["Khối lớp","gradeLevel"],["Thời lượng (phút)","durationMinutes"],["Tổng điểm","totalPoints"]].map(([label,key]) => <label key={key} className="space-y-1.5 text-xs font-bold"><span>{label}</span><input value={(form as any)[key]} type={key === "durationMinutes" ? "number" : "text"} onChange={(e) => setForm({ ...form, [key]: key === "durationMinutes" ? Number(e.target.value) : e.target.value })} className="w-full rounded-xl border bg-background px-3 py-3"/></label>)}<label className="sm:col-span-2 space-y-1.5 text-xs font-bold"><span>Môn học</span><select value={form.subject} onChange={(e) => setForm({...form,subject:e.target.value})} className="w-full rounded-xl border bg-background px-3 py-3">{subjects.map(s=><option key={s}>{s}</option>)}</select></label></div><button onClick={createExam} disabled={!form.title || busy === "create"} className="mt-6 rounded-xl bg-foreground text-background px-5 py-3 text-xs font-black flex items-center gap-2">{busy === "create" ? <Loader2 className="animate-spin" size={15}/> : <Sparkles size={15}/>}Tạo đề nháp</button></div></div> : <>
        <div className="sticky top-0 z-10 p-5 border-b bg-card/95 backdrop-blur flex flex-wrap gap-4 justify-between"><div><div className="flex items-center gap-2"><span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-[9px] font-black uppercase">{statusCopy[detail.status]}</span><span className="text-[10px] text-muted-foreground">Phiên bản {detail.version}</span></div><h2 className="mt-2 text-xl font-black">{detail.title}</h2><p className="text-xs text-muted-foreground">{detail.subject} · {detail.gradeLevel} · {detail.durationMinutes} phút</p></div><div className="flex gap-2 items-center">{detail.status === "drafting" && <><button onClick={() => transition("validate","Đề hợp lệ.")} className="rounded-xl border px-3 py-2 text-xs font-black">Kiểm tra</button><button onClick={() => transition("prepare","Đề đã sẵn sàng chấm.")} className="rounded-xl bg-foreground text-background px-3 py-2 text-xs font-black">Chuẩn bị đề</button></>}{detail.status === "preparing_exam" && <button onClick={() => transition("return-to-draft","Đã đưa đề về bản nháp.")} className="rounded-xl border px-3 py-2 text-xs font-black flex gap-1"><RotateCcw size={14}/>Sửa lại</button>}<button onClick={exportDocx} className="rounded-xl bg-[var(--mint)] px-3 py-2 text-xs font-black flex gap-1"><FileDown size={14}/>DOCX</button></div></div>
        <div className="p-5"><div className="mb-5 rounded-2xl bg-slate-950 text-white p-4 flex items-center justify-between"><div><p className="text-[9px] uppercase tracking-[.2em] text-emerald-300 font-black">Tiến trình đề</p><p className="mt-1 text-sm font-bold">{detail.questions?.length || 0} câu hỏi · {pointsUsed.toFixed(2)}/{detail.totalPoints} điểm</p></div><div className="w-40 h-2 rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-[var(--mint)]" style={{width:`${Math.min(100, pointsUsed/Number(detail.totalPoints)*100)}%`}}/></div></div>
          <div className="space-y-3">{detail.questions?.map((q,index) => <article key={q.id} onClick={() => setSelectedQuestionId(q.id)} className={`group rounded-2xl border p-4 cursor-pointer transition-all ${selectedQuestionId === q.id ? "border-indigo-300 bg-indigo-50/40" : "hover:shadow-md"}`}><div className="flex gap-3"><GripVertical className="text-muted-foreground" size={17}/><div className="flex-1"><div className="flex justify-between gap-3"><div><span className="text-[9px] font-black text-muted-foreground uppercase">Câu {index+1} · {q.questionType === "essay" ? "Tự luận" : "Trắc nghiệm"}</span><p className="mt-1 text-sm font-bold leading-relaxed">{q.content}</p></div><span className="text-sm font-black">{q.points}đ</span></div>{q.questionType === "essay" && <p className="mt-2 text-[10px] text-indigo-700 font-bold">{q.rubricItems?.length || 0} ý barem</p>}</div><button onClick={(e)=>{e.stopPropagation();removeQuestion(q.id)}} className="opacity-0 group-hover:opacity-100 text-destructive"><Trash2 size={15}/></button></div></article>)}{!detail.questions?.length && <div className="py-16 text-center border border-dashed rounded-3xl"><BookOpen className="mx-auto text-muted-foreground"/><p className="mt-3 text-sm font-black">Đề chưa có câu hỏi</p><p className="text-xs text-muted-foreground">Chọn từ ngân hàng hoặc tạo câu hỏi ở panel bên phải.</p></div>}</div>
        </div></>}
    </main>

    <aside className="min-h-0 rounded-3xl border border-border bg-card shadow-sm overflow-auto p-4 space-y-5">
      {detail ? <><div><div className="flex items-center gap-2"><Library size={16} className="text-[var(--purple)]"/><h3 className="text-sm font-black">Ngân hàng câu hỏi</h3></div><div className="mt-3 relative"><Search size={14} className="absolute left-3 top-3 text-muted-foreground"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Tìm câu hỏi..." className="w-full rounded-xl border bg-background pl-9 pr-3 py-2.5 text-xs"/></div><div className="mt-3 max-h-64 overflow-auto space-y-2">{filteredBank.slice(0,12).map(q=><button key={q.id} onClick={()=>addBank(q.id)} disabled={detail.status !== "drafting"} className="w-full rounded-xl border p-3 text-left hover:border-emerald-300 hover:bg-emerald-50/50 disabled:opacity-50"><p className="text-xs font-bold line-clamp-2">{q.content}</p><span className="mt-2 inline-flex text-[9px] font-black text-emerald-700"><Plus size={11}/> Thêm vào đề</span></button>)}</div></div>
        <div className="border-t pt-4"><h3 className="text-sm font-black">Soạn câu hỏi nhanh</h3><div className="mt-3 space-y-2"><select value={manual.type} onChange={e=>setManual({...manual,type:e.target.value})} className="w-full rounded-xl border bg-background p-2.5 text-xs"><option value="single_choice">Trắc nghiệm</option><option value="essay">Tự luận</option></select><textarea value={manual.content} onChange={e=>setManual({...manual,content:e.target.value})} placeholder="Nội dung câu hỏi" className="w-full rounded-xl border bg-background p-3 text-xs min-h-20"/><input value={manual.points} onChange={e=>setManual({...manual,points:e.target.value})} placeholder="Điểm" className="w-full rounded-xl border bg-background p-2.5 text-xs"/>{manual.type === "single_choice" && manual.choices.map((c,i)=><input key={i} value={c} onChange={e=>{const choices=[...manual.choices];choices[i]=e.target.value;setManual({...manual,choices})}} placeholder={`Phương án ${String.fromCharCode(65+i)}`} className="w-full rounded-xl border bg-background p-2.5 text-xs"/>)}<button onClick={addManual} disabled={!manual.content || detail.status !== "drafting"} className="w-full rounded-xl bg-foreground text-background py-2.5 text-xs font-black">Thêm câu hỏi</button></div></div>
        {selectedQuestion?.questionType === "essay" && <div className="border-t pt-4"><h3 className="text-sm font-black">Barem câu tự luận</h3><div className="mt-2 space-y-2">{selectedQuestion.rubricItems?.map((r:any)=><div key={r.id} className="rounded-xl bg-indigo-50 p-3 text-xs"><b>{r.content || r.description}</b><span className="float-right font-black">{r.points}đ</span></div>)}<textarea value={rubric.description} onChange={e=>setRubric({...rubric,description:e.target.value})} placeholder="Mô tả ý chấm" className="w-full rounded-xl border p-2.5 text-xs"/><input value={rubric.points} onChange={e=>setRubric({...rubric,points:e.target.value})} className="w-full rounded-xl border p-2.5 text-xs"/><button onClick={addRubric} className="w-full rounded-xl bg-indigo-600 text-white py-2.5 text-xs font-black">Thêm ý barem</button></div></div>}
      </> : <div className="h-full grid place-items-center text-center py-16"><div><Clock3 className="mx-auto text-muted-foreground"/><p className="mt-3 text-sm font-black">Chọn hoặc tạo một đề</p><p className="text-xs text-muted-foreground">Công cụ biên soạn sẽ xuất hiện tại đây.</p></div></div>}
      {notice && <div className="rounded-xl border bg-muted p-3 text-xs font-bold flex gap-2"><CheckCircle2 size={15}/>{notice}</div>}
    </aside>
  </div>;
}
