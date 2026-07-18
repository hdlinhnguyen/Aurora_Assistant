"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, FilePlus2, Flame, Loader2, Pencil, RefreshCw, ShieldAlert, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import type { NodeItem, StudentProgress } from "../page";
import {
  approveLearningPathDrafts,
  createManualLearningPathDraft,
  type AutomaticDraftResponse,
  loadAutomaticLearningPathDrafts,
  skipLearningPathDrafts,
} from "./learningPathWorkspaceApi";

interface Props {
  selectedSubject: string;
  nodes: NodeItem[];
  studentsProgress: StudentProgress[];
}

type ManualQueue = { threadId: string; drafts: AutomaticDraftResponse["drafts"] } | null;

const pct = (value?: number) => `${Math.round((value ?? 0) * 100)}%`;

export default function LearningPathTab({ selectedSubject, nodes, studentsProgress }: Props) {
  const [workspace, setWorkspace] = useState<AutomaticDraftResponse | null>(null);
  const [manualQueue, setManualQueue] = useState<ManualQueue>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualStudents, setManualStudents] = useState<string[]>([]);
  const [manualTopics, setManualTopics] = useState<string[]>([]);
  const [manualSearch, setManualSearch] = useState("");
  const [workingStudent, setWorkingStudent] = useState<string | null>(null);
  const [editingStudent, setEditingStudent] = useState<string | null>(null);

  const topicById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const studentById = useMemo(() => new Map(studentsProgress.map((student) => [student.studentId, student])), [studentsProgress]);
  const topicNodes = useMemo(() => nodes.filter((node) => !node.isRoot), [nodes]);

  const reload = async (refresh = false) => {
    if (!selectedSubject) return;
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await loadAutomaticLearningPathDrafts(selectedSubject, refresh));
    } catch (err: any) {
      setError(err?.message || "Không thể phân tích lộ trình hiện tại");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setWorkspace(null);
    setManualQueue(null);
    void reload();
    // Reload intentionally follows the selected subject identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject]);

  const automaticDrafts = workspace ? Object.entries(workspace.drafts) : [];
  const manualDrafts = manualQueue ? Object.entries(manualQueue.drafts) : [];
  const allDrafts = [...automaticDrafts, ...manualDrafts];

  const updateAfterReview = (studentIds: string[]) => {
    setWorkspace((current) => {
      if (!current) return current;
      const drafts = { ...current.drafts };
      studentIds.forEach((id) => delete drafts[id]);
      return { ...current, drafts, summary: { ...current.summary, draftCount: Object.keys(drafts).length } };
    });
  };

  const approve = async (threadId: string, studentIds: string[], paths: AutomaticDraftResponse["drafts"]) => {
    setWorkingStudent(studentIds.length === 1 ? studentIds[0] : "all");
    try {
      await approveLearningPathDrafts(threadId, studentIds, paths);
      updateAfterReview(studentIds);
      if (manualQueue?.threadId === threadId) setManualQueue((queue) => queue ? { ...queue, drafts: Object.fromEntries(Object.entries(queue.drafts).filter(([id]) => !studentIds.includes(id))) } : queue);
      toast.success(studentIds.length > 1 ? "Đã duyệt các lộ trình được chọn" : "Đã duyệt lộ trình cho học sinh");
    } catch (err: any) {
      toast.error(`Không thể duyệt lộ trình: ${err?.message || "lỗi không xác định"}`);
    } finally {
      setWorkingStudent(null);
    }
  };

  const skip = async (threadId: string, studentId: string) => {
    setWorkingStudent(studentId);
    try {
      await skipLearningPathDrafts(threadId, [studentId]);
      updateAfterReview([studentId]);
      if (manualQueue?.threadId === threadId) setManualQueue((queue) => queue ? { ...queue, drafts: Object.fromEntries(Object.entries(queue.drafts).filter(([id]) => id !== studentId)) } : queue);
      toast.success("Đã bỏ qua bản đề xuất");
    } catch (err: any) {
      toast.error(`Không thể bỏ qua: ${err?.message || "lỗi không xác định"}`);
    } finally {
      setWorkingStudent(null);
    }
  };

  const createManual = async () => {
    if (!manualStudents.length || !manualTopics.length) {
      toast.warning("Chọn ít nhất một học sinh và một topic cần cải thiện");
      return;
    }
    try {
      const result: any = await createManualLearningPathDraft(selectedSubject, manualStudents, manualTopics);
      const paths = result.paths || {};
      setManualQueue({ threadId: result.thread_id || result.threadId, drafts: paths });
      setManualOpen(false);
      toast.success("Đã tạo bản nháp thủ công");
    } catch (err: any) {
      toast.error(`Không thể tạo bản nháp: ${err?.message || "lỗi không xác định"}`);
    }
  };

  const updateDraftSteps = (studentId: string, source: "automatic" | "manual", update: (steps: NonNullable<AutomaticDraftResponse["drafts"][string]["ordered_steps"]>) => NonNullable<AutomaticDraftResponse["drafts"][string]["ordered_steps"]>) => {
    const updateDraftMap = (drafts: AutomaticDraftResponse["drafts"]) => {
      const draft = drafts[studentId];
      if (!draft) return drafts;
      const steps = update([...(draft.ordered_steps || [])]).map((step, index) => ({ ...step, order: index + 1 }));
      return { ...drafts, [studentId]: { ...draft, ordered_steps: steps } };
    };
    if (source === "automatic") {
      setWorkspace((current) => current ? { ...current, drafts: updateDraftMap(current.drafts) } : current);
    } else {
      setManualQueue((current) => current ? { ...current, drafts: updateDraftMap(current.drafts) } : current);
    }
  };

  const moveStep = (studentId: string, source: "automatic" | "manual", index: number, direction: -1 | 1) => {
    updateDraftSteps(studentId, source, (steps) => {
      const destination = index + direction;
      if (destination < 0 || destination >= steps.length) return steps;
      [steps[index], steps[destination]] = [steps[destination], steps[index]];
      return steps;
    });
  };

  const renderDraft = (studentId: string, draft: AutomaticDraftResponse["drafts"][string], source: "automatic" | "manual", threadId: string) => {
    const student = studentById.get(studentId);
    const weakTopics = workspace?.recommendationsByStudent?.[studentId] || [];
    const firstWeak = weakTopics[0];
    const isWorking = workingStudent === studentId || workingStudent === "all";
    return (
      <article key={`${source}-${studentId}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white"><UserRound size={17} /></span>
            <div>
              <h4 className="font-black text-slate-900">{student?.studentName || studentId}</h4>
              <p className="text-[11px] text-slate-500">{student?.studentEmail || "Học sinh trong lớp hiện tại"}</p>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${source === "automatic" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
            {source === "automatic" ? "Hệ thống đề xuất" : "Giáo viên tạo"}
          </span>
        </div>
        {firstWeak && (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black text-rose-950">{topicById.get(firstWeak.topicId)?.name || firstWeak.topicId}</span>
              <span className="text-[10px] font-black text-rose-700">Mastery {pct(firstWeak.mastery)} · Confidence {pct(firstWeak.confidence)}</span>
            </div>
            <p className="mt-1 text-[10px] font-semibold text-rose-800">Mức mastery dưới 40% và đã đủ bằng chứng tin cậy để phụ đạo.</p>
          </div>
        )}
        <div className="mt-4 space-y-2">
          {(draft.ordered_steps || []).map((step, index) => (
            <div key={`${studentId}-${step.order}-${step.topic_id}`} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-[10px] font-black text-slate-400">{step.order}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">{topicById.get(step.topic_id)?.name || step.topic_id}</span>
              <span className="text-[10px] font-black text-slate-400">{pct(step.current_mastery)} → {pct(step.target_mastery)}</span>
              {editingStudent === studentId && <span className="flex items-center gap-1"><button onClick={() => moveStep(studentId, source, index, -1)} disabled={index === 0} aria-label="Đưa bước lên" className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30"><ArrowUp size={12} /></button><button onClick={() => moveStep(studentId, source, index, 1)} disabled={index === (draft.ordered_steps?.length || 0) - 1} aria-label="Đưa bước xuống" className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30"><ArrowDown size={12} /></button><button onClick={() => updateDraftSteps(studentId, source, (steps) => steps.filter((_, stepIndex) => stepIndex !== index))} aria-label="Xóa bước" className="rounded p-1 text-rose-500 hover:bg-rose-50"><Trash2 size={12} /></button></span>}
            </div>
          ))}
          {!draft.ordered_steps?.length && <p className="text-xs font-semibold text-slate-500">Không có bước khả dụng trong bản nháp.</p>}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => void approve(threadId, [studentId], { [studentId]: draft })} disabled={Boolean(workingStudent)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50"><Check size={14} /> Duyệt</button>
          <button onClick={() => setEditingStudent((current) => current === studentId ? null : studentId)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-600"><Pencil size={12} /> {editingStudent === studentId ? "Xong" : "Chỉnh sửa"}</button>
          <button onClick={() => void skip(threadId, studentId)} disabled={Boolean(workingStudent)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-600 disabled:opacity-50">Bỏ qua</button>
        </div>
        {isWorking && <p className="mt-2 text-center text-[10px] font-bold text-slate-400">Đang cập nhật…</p>}
      </article>
    );
  };

  if (!selectedSubject) return <div className="flex-1 rounded-3xl border border-dashed border-slate-300 p-12 text-center text-sm font-bold text-slate-500">Hãy chọn môn học ở thanh bên để bắt đầu.</div>;

  return (
    <div className="flex-1 space-y-5 overflow-y-auto pr-1 pb-8">
      <header className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-600">Teacher intervention queue</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Lập lộ trình cá nhân hóa</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Môn hiện tại: <span className="text-slate-900">{selectedSubject}</span></p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void reload(true)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Phân tích lại</button>
            <button onClick={() => setManualOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-slate-950"><FilePlus2 size={14} /> Tự tạo lộ trình</button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ["Học sinh cần hỗ trợ", workspace?.summary.reliableStudentCount || 0, "text-rose-600"],
          ["Bản nháp chờ duyệt", allDrafts.length, "text-amber-600"],
          ["Cần thêm dữ liệu", workspace?.summary.insufficientEvidenceCount || 0, "text-sky-600"],
          ["Topic trong môn", topicNodes.length, "text-emerald-600"],
        ].map(([label, value, color]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 text-2xl font-black ${color}`}>{value}</p></div>)}
      </div>

      {error && <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800"><ShieldAlert size={17} /><div><p className="font-black">Không thể tạo đề xuất</p><p className="mt-1">{error}</p><button onClick={() => void reload()} className="mt-2 font-black underline">Thử lại</button></div></div>}

      <section className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Sparkles size={16} className="text-amber-500" /><h3 className="text-sm font-black text-slate-950">Đề xuất cần giáo viên duyệt</h3></div><p className="mt-1 text-[11px] font-semibold text-slate-500">Tự động lọc mastery dưới 40% và confidence trên 60% trong môn hiện tại.</p></div>{automaticDrafts.length > 1 && workspace?.threadId && <button onClick={() => void approve(workspace.threadId, automaticDrafts.map(([id]) => id), Object.fromEntries(automaticDrafts))} disabled={Boolean(workingStudent)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Duyệt tất cả</button>}</div>
        {loading && !workspace ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-xs font-bold text-slate-500"><Loader2 size={16} className="animate-spin" /> Đang phân tích dữ liệu lớp…</div> : automaticDrafts.length ? <div className="grid gap-4 xl:grid-cols-2">{automaticDrafts.map(([id, draft]) => renderDraft(id, draft, "automatic", workspace!.threadId))}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Flame size={22} className="mx-auto text-slate-300" /><p className="mt-2 text-sm font-black text-slate-700">Chưa có bản nháp tự động</p><p className="mt-1 text-xs font-semibold text-slate-500">Không có học sinh nào đủ điều kiện hoặc giáo viên có thể tự tạo lộ trình.</p></div>}
      </section>

      {workspace?.insufficientEvidence?.length ? <section className="rounded-[2rem] border border-sky-200 bg-sky-50/60 p-5"><div className="flex items-center gap-2"><AlertTriangle size={16} className="text-sky-600" /><h3 className="text-sm font-black text-sky-950">Cần thêm dữ liệu trước khi đề xuất</h3></div><p className="mt-1 text-xs font-semibold text-sky-800">Các trường hợp này chưa đủ confidence, hệ thống không gắn nhãn yếu và không tự tạo lộ trình.</p><div className="mt-3 flex flex-wrap gap-2">{workspace.insufficientEvidence.map((item) => <span key={`${item.studentId}-${item.topicId}`} className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-[10px] font-black text-sky-800">{studentById.get(item.studentId)?.studentName || item.studentId} · {topicById.get(item.topicId)?.name || item.topicId} · {pct(item.confidence)} confidence</span>)}</div></section> : null}

      {manualDrafts.length ? <section className="rounded-[2rem] border border-sky-200 bg-white p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-black text-slate-950">Bản nháp giáo viên vừa tạo</h3><p className="mt-1 text-xs font-semibold text-slate-500">Kiểm tra lại trước khi kích hoạt cho học sinh.</p></div></div><div className="grid gap-4 xl:grid-cols-2">{manualDrafts.map(([id, draft]) => renderDraft(id, draft, "manual", manualQueue!.threadId))}</div></section> : null}

      {manualOpen && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={() => setManualOpen(false)}><aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-600">Manual path builder</p><h3 className="mt-1 text-lg font-black text-slate-950">Tự tạo lộ trình</h3><p className="mt-1 text-xs font-semibold text-slate-500">{selectedSubject}</p></div><button onClick={() => setManualOpen(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={17} /></button></div><label className="mt-6 block text-xs font-black text-slate-700">Tìm học sinh<input value={manualSearch} onChange={(event) => setManualSearch(event.target.value)} placeholder="Tên hoặc email" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400" /></label><div className="mt-3 space-y-2">{studentsProgress.filter((student) => `${student.studentName} ${student.studentEmail}`.toLowerCase().includes(manualSearch.toLowerCase())).map((student) => <button key={student.studentId} onClick={() => setManualStudents((current) => current.includes(student.studentId) ? current.filter((id) => id !== student.studentId) : [...current, student.studentId])} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${manualStudents.includes(student.studentId) ? "border-sky-400 bg-sky-50" : "border-slate-200"}`}><span><span className="block text-xs font-black">{student.studentName}</span><span className="block text-[10px] text-slate-500">{student.studentEmail}</span></span>{manualStudents.includes(student.studentId) && <Check size={15} className="text-sky-600" />}</button>)}</div><div className="mt-6 flex items-center justify-between"><span className="text-xs font-black text-slate-700">Topic cần cải thiện</span><span className="text-[10px] font-bold text-slate-400">{manualTopics.length} đã chọn</span></div><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{topicNodes.map((node) => <button key={node.id} onClick={() => setManualTopics((current) => current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id])} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${manualTopics.includes(node.id) ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}><span className="truncate text-xs font-black">{node.name}</span>{manualTopics.includes(node.id) && <Check size={15} className="text-amber-600" />}</button>)}</div><button onClick={() => void createManual()} className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-black text-white">Tạo bản nháp</button></aside></div>}
    </div>
  );
}
