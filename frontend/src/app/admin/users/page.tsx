"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  Search,
  UserPlus,
  UploadCloud,
  ShieldCheck,
  Download,
  Lock,
  Info,
  LayoutGrid,
  ChevronRight,
  ChevronDown,
  School,
  Folder,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";

/**
 * PROTOTYPE — dữ liệu trên trang này là mock tĩnh, chưa nối API thật.
 * Xem frontend/src/app/admin/users/README.md để biết phạm vi và việc cần làm tiếp.
 */

type Status = "mastery" | "progressing" | "at_risk" | "critical_gap";

const STATUS_META: Record<Status, { label: string; className: string }> = {
  mastery: { label: "Đã thành thạo", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400" },
  progressing: { label: "Đang tiến bộ", className: "bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400" },
  at_risk: { label: "Cần chú ý", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400" },
  critical_gap: { label: "Lỗ hổng nghiêm trọng", className: "bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400" },
};

type ClassNode = { id: string; name: string; count: number };
type KhoiNode = { id: string; name: string; total: number; classes: ClassNode[] };
type ClassTree = { school: string; khoi: KhoiNode[] };

type UserRow = {
  id: string;
  name: string;
  email: string;
  avgScore: number | null;
  clarity: number | null;
  topGap: string | null;
  topGapSeverity: number | null;
  classId: string | null;
  status: Status;
  invalid?: boolean;
  validationError?: string;
};

function MiniBar({ pct, tone = "purple" }: { pct: number; tone?: "purple" | "mint" | "rose" }) {
  const gradient =
    tone === "rose"
      ? "from-rose-400 to-rose-600"
      : tone === "mint"
        ? "from-[var(--mint)] to-emerald-500"
        : "from-[var(--purple)] to-indigo-500";
  return (
    <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full bg-gradient-to-r ${gradient}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function ErrCell() {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs font-bold text-rose-600">**[err]**</span>
      <div className="h-1.5 w-20 rounded-full border border-dashed border-rose-300" />
    </div>
  );
}

function DisabledAction({ label, icon: Icon }: { label: string; icon: typeof Search }) {
  return (
    <button
      type="button"
      disabled
      title="Sắp ra mắt — chưa nối API thật"
      className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-muted-foreground cursor-not-allowed opacity-60"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [openErrorTooltip, setOpenErrorTooltip] = useState<string | null>(null);

  const [tree, setTree] = useState<ClassTree>({ school: "", khoi: [] });
  const [users, setUsers] = useState<UserRow[]>([]);
  const [saving, setSaving] = useState(false);

  const allClasses = useMemo(() => tree.khoi.flatMap((k) => k.classes), [tree]);

  const loadUsers = useCallback(async () => {
    const res = await apiFetch("/admin/users/diagnostics");
    setUsers(res?.users ?? []);
  }, []);

  useEffect(() => {
    apiFetch("/admin/class-tree")
      .then((t) => {
        setTree(t ?? { school: "", khoi: [] });
        // Mở khối đầu tiên mặc định
        if (t?.khoi?.[0]) setExpanded({ [t.khoi[0].id]: true });
      })
      .catch(() => {});
    loadUsers().catch(() => setUsers([]));
  }, [loadUsers]);

  // Dual-listbox: mô hình 1 học sinh - 1 lớp, nhưng UI cho chọn nhiều rồi lưu lớp đầu.
  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? users[0],
    [selectedUserId, users],
  );
  const [assigned, setAssigned] = useState<string[]>([]);
  const [pickedAvailable, setPickedAvailable] = useState<string[]>([]);
  const [pickedAssigned, setPickedAssigned] = useState<string[]>([]);

  // Đồng bộ lớp đã gán khi đổi học sinh chọn.
  useEffect(() => {
    setAssigned(selectedUser?.classId ? [selectedUser.classId] : []);
    setPickedAvailable([]);
    setPickedAssigned([]);
  }, [selectedUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectUser(id: string) {
    setSelectedUserId(id);
  }

  const availableClasses = allClasses.filter((c) => !assigned.includes(c.id));

  function moveToAssigned() {
    if (!pickedAvailable.length) return;
    setAssigned((prev) => [...prev, ...pickedAvailable]);
    setPickedAvailable([]);
  }
  function moveToAvailable() {
    if (!pickedAssigned.length) return;
    setAssigned((prev) => prev.filter((id) => !pickedAssigned.includes(id)));
    setPickedAssigned([]);
  }

  async function saveAssignment() {
    if (!selectedUser) return;
    setSaving(true);
    try {
      // Model 1:1 → lưu lớp đầu tiên trong danh sách đã gán (null nếu bỏ hết).
      const classroomId = assigned[0] ?? null;
      await apiFetch(`/admin/students/${selectedUser.id}/classroom`, {
        method: "PUT",
        body: JSON.stringify({ classroomId }),
      });
      if (assigned.length > 1) {
        toast.warning("Mô hình hiện tại là 1 học sinh - 1 lớp; đã lưu lớp đầu tiên trong danh sách.");
      } else {
        toast.success("Đã lưu lớp cho học sinh.");
      }
      await Promise.all([loadUsers(), apiFetch("/admin/class-tree").then((t) => setTree(t ?? tree))]);
    } catch (e: any) {
      toast.error(e?.message || "Không thể lưu gán lớp.");
    } finally {
      setSaving(false);
    }
  }

  const filteredUsers = users.filter((u) => {
    if (classFilter && u.classId !== classFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Data source banner: đã nối API thật cho danh sách, cây lớp và gán lớp */}
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-3 text-sm">
        <FlaskConical className="h-5 w-5 shrink-0 text-emerald-600" />
        <p>
          <span className="font-bold text-emerald-700 dark:text-emerald-400">Dữ liệu thật:</span>{" "}
          <span className="text-muted-foreground">
            Danh sách học sinh, chỉ số chẩn đoán (BKT/Feynman), cây trường/khối/lớp và gán lớp đã nối API. Các nút Bulk Import / RBAC vẫn là tính năng sắp ra mắt.
          </span>
        </p>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-4xl font-[var(--font-display)] font-extrabold tracking-tight">Người dùng & Chẩn đoán</h1>
        <p className="text-muted-foreground mt-2">
          Quản lý tài khoản theo cấu trúc trường/khối/lớp và theo dõi chất lượng dữ liệu chẩn đoán.
        </p>
      </div>

      {/* Top control bar */}
      <div className="rounded-3xl border border-border bg-card p-4 shadow-[var(--shadow-card)] flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm thông minh theo tên hoặc email..."
            className="w-full rounded-2xl border border-input bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--purple)] focus:border-[var(--purple)]"
          />
        </div>
        <button
          type="button"
          onClick={() => toast.info("Sắp ra mắt — thêm người dùng đơn lẻ ngoài luồng đăng ký thông thường.")}
          className="flex items-center gap-2 rounded-2xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:opacity-90 active:scale-95 transition-all"
        >
          <UserPlus className="h-4 w-4" />
          Thêm người dùng
        </button>
        <DisabledAction label="Bulk Import & Provisioning" icon={UploadCloud} />
        <DisabledAction label="Role Permission Matrix (RBAC)" icon={ShieldCheck} />
        <div className="flex items-center gap-1 ml-auto">
          <IconOnlyButton icon={Download} label="Xuất dữ liệu" />
          <IconOnlyButton icon={Lock} label="Khóa hàng loạt" />
          <IconOnlyButton
            icon={Info}
            label="Về trang này"
            onClick={() => toast.info("Trang prototype quản lý người dùng & chẩn đoán — xem README để biết chi tiết.")}
          />
          <IconOnlyButton icon={LayoutGrid} label="Đổi chế độ xem" />
        </div>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_300px] gap-5 items-start">
        {/* Left: structure tree */}
        <div className="rounded-3xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 px-1">Cơ cấu tổ chức</p>
          <div className="flex items-center gap-2 px-1 py-1.5 text-sm font-bold">
            <School className="h-4 w-4 text-[var(--purple)]" />
            {tree.school || "Toàn trường"}
          </div>
          <div className="mt-1 space-y-0.5">
            {tree.khoi.map((k) => (
              <div key={k.id}>
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [k.id]: !prev[k.id] }))}
                  className="w-full flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-semibold hover:bg-muted/60 transition-colors"
                >
                  {expanded[k.id] ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <Folder className="h-3.5 w-3.5 text-[var(--mint)]" />
                  <span className="flex-1 text-left">{k.name}</span>
                </button>
                {!expanded[k.id] ? null : (
                  <div className="ml-6 border-l border-border pl-2 space-y-0.5 mt-0.5 mb-1">
                    <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">{k.total} students</p>
                    {k.classes.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setClassFilter((prev) => (prev === c.id ? null : c.id))}
                        aria-pressed={classFilter === c.id}
                        className="w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors aria-pressed:bg-[var(--purple)]/10 aria-pressed:text-[var(--purple)] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      >
                        <span>{c.name}</span>
                        <span className="text-[10px] font-medium opacity-70">{c.count} students</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {classFilter && (
            <button type="button" onClick={() => setClassFilter(null)} className="mt-2 w-full text-center text-[11px] font-semibold text-[var(--purple)] hover:underline">
              Xoá bộ lọc lớp ✕
            </button>
          )}
        </div>

        {/* Middle: table */}
        <div className="rounded-3xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <p className="text-sm font-bold">Users & Diagnostics</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider font-bold">
                  <th className="p-4 pl-6 font-bold">User</th>
                  <th className="p-4 font-bold">Avg Score</th>
                  <th className="p-4 font-bold">Clarity</th>
                  <th className="p-4 font-bold">Top Gap</th>
                  <th className="p-4 font-bold">Class</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 pr-6 text-right font-bold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.map((u) => {
                  const meta = STATUS_META[u.status];
                  const className = allClasses.find((c) => c.id === u.classId)?.name ?? "-";
                  return (
                    <tr key={u.id} className={`transition-colors ${u.invalid ? "bg-rose-500/5 hover:bg-rose-500/10" : "hover:bg-muted/30"}`}>
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-2.5">
                          <div className="relative">
                            <div className={`h-8 w-8 rounded-full grid place-items-center text-[11px] font-bold ${u.invalid ? "bg-rose-200 text-rose-700" : "bg-[var(--mint)]/20 text-[var(--mint)]"}`}>
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            {u.invalid && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 border-2 border-card" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate max-w-[160px]">{u.name}</p>
                            {u.invalid && (
                              <div className="relative inline-block">
                                <button
                                  type="button"
                                  onMouseEnter={() => setOpenErrorTooltip(u.id)}
                                  onMouseLeave={() => setOpenErrorTooltip(null)}
                                  onClick={() => setOpenErrorTooltip((prev) => (prev === u.id ? null : u.id))}
                                  className="text-[11px] font-semibold text-rose-600 hover:underline"
                                >
                                  Xem lỗi
                                </button>
                                {openErrorTooltip === u.id && (
                                  <div className="absolute z-20 top-full left-0 mt-2 w-64 rounded-2xl border border-rose-200 bg-card p-3 shadow-xl text-xs">
                                    <div className="flex gap-2">
                                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                                      <p>
                                        <span className="font-bold text-rose-600">Validation Errors:</span>{" "}
                                        <span className="text-muted-foreground">{u.validationError}</span>
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">{u.invalid ? <ErrCell /> : <div className="flex items-center gap-2"><span className="font-bold">{u.avgScore?.toFixed(2)}</span><MiniBar pct={((u.avgScore ?? 0) / 10) * 100} tone="mint" /></div>}</td>
                      <td className="p-4">{u.invalid ? <ErrCell /> : <div className="flex items-center gap-2"><span className="font-bold">{u.clarity}</span><MiniBar pct={u.clarity ?? 0} /></div>}</td>
                      <td className="p-4">{u.invalid ? <ErrCell /> : <div className="flex items-center gap-2"><span className="font-semibold">{u.topGap}</span><MiniBar pct={u.topGapSeverity ?? 0} tone="rose" /></div>}</td>
                      <td className="p-4 text-muted-foreground">{className}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${meta.className}`}>{meta.label}</span>
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <button
                          type="button"
                          onClick={() => selectUser(u.id)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                            u.invalid
                              ? "bg-rose-600 text-white hover:opacity-90"
                              : "border border-border hover:bg-muted/60"
                          }`}
                        >
                          {u.invalid ? "Chẩn đoán" : "Xem chi tiết"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-muted-foreground text-sm">
                      Không tìm thấy người dùng khớp bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: detail panel */}
        <div className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)] space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Học sinh: {selectedUser?.name ?? "— chọn ở bảng —"}</p>
            <p className="text-sm mt-1">
              <span className="text-muted-foreground">Vai trò: </span>
              <span className="font-bold">Học sinh</span>
            </p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Lớp đã gán</p>
            <div className="rounded-2xl border border-border bg-muted/30 p-2 min-h-[64px] flex flex-wrap gap-1.5 content-start">
              {assigned.length ? (
                assigned.map((id) => (
                  <span key={id} className="px-2.5 py-1 rounded-lg bg-[var(--purple)]/10 text-[var(--purple)] text-xs font-bold">
                    {allClasses.find((c) => c.id === id)?.name}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-foreground p-1">Chưa gán lớp nào.</span>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Tùy chọn: Dual-listbox</p>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <select
                multiple
                value={pickedAvailable}
                onChange={(e) => setPickedAvailable(Array.from(e.target.selectedOptions, (o) => o.value))}
                className="h-28 rounded-xl border border-border bg-background text-xs p-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--purple)]"
              >
                {availableClasses.map((c) => (
                  <option key={c.id} value={c.id} className="px-1.5 py-1 rounded">
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={moveToAssigned}
                  disabled={!pickedAvailable.length}
                  title="Gán lớp đã chọn"
                  className="rounded-lg border border-border p-1.5 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={moveToAvailable}
                  disabled={!pickedAssigned.length}
                  title="Bỏ gán lớp đã chọn"
                  className="rounded-lg border border-border p-1.5 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              </div>
              <select
                multiple
                value={pickedAssigned}
                onChange={(e) => setPickedAssigned(Array.from(e.target.selectedOptions, (o) => o.value))}
                className="h-28 rounded-xl border border-border bg-background text-xs p-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--purple)]"
              >
                {assigned.map((id) => (
                  <option key={id} value={id} className="px-1.5 py-1 rounded">
                    {allClasses.find((c) => c.id === id)?.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              Chọn lớp ở 2 khung rồi bấm mũi tên để chuyển. Mô hình hiện tại là 1 học sinh - 1 lớp: khi lưu sẽ dùng lớp đầu tiên trong danh sách đã gán.
            </p>
          </div>

          <button
            type="button"
            onClick={saveAssignment}
            disabled={saving || !selectedUser}
            className="w-full rounded-2xl bg-foreground text-background text-sm font-bold py-2.5 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconOnlyButton({ icon: Icon, label, onClick }: { icon: typeof Search; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick ?? (() => toast.info(`${label} — sắp ra mắt, chưa nối API thật.`))}
      className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
