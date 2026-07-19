"use client";

import { useEffect, useMemo, useState } from "react";
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
 * PROTOTYPE — cây lớp học và danh sách học sinh đã được kết nối với API thực tế.
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

const TREE: { school: string; khoi: KhoiNode[] } = {
  school: "Trường THPT A",
  khoi: [
    {
      id: "k11",
      name: "Khối 11",
      total: 450,
      classes: [
        { id: "11a1", name: "11A1", count: 32 },
        { id: "11a2", name: "11A2", count: 32 },
        { id: "11a3", name: "11A3", count: 32 },
      ],
    },
    {
      id: "k12",
      name: "Khối 12",
      total: 450,
      classes: [
        { id: "12a1", name: "12A1", count: 30 },
        { id: "12a2", name: "12A2", count: 30 },
        { id: "12a3", name: "12A3", count: 30 },
      ],
    },
  ],
};

const ALL_CLASSES: ClassNode[] = TREE.khoi.flatMap((k) => k.classes);

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

const MOCK_USERS: UserRow[] = [
  { id: "u1", name: "Nguyen Hoang Nam", email: "nguyen.hn@aurora.edu.vn", avgScore: 9.5, clarity: 73, topGap: "Logic", topGapSeverity: 28, classId: "11a1", status: "mastery" },
  {
    id: "u2",
    name: "student.invalid.email",
    email: "student.invalid.email",
    avgScore: null,
    clarity: null,
    topGap: null,
    topGapSeverity: null,
    classId: null,
    status: "critical_gap",
    invalid: true,
    validationError: "Check email and data format (Diagnostic Log for details).",
  },
  { id: "u3", name: "Tran Thi Bich", email: "tran.tb@aurora.edu.vn", avgScore: 6.2, clarity: 54, topGap: "Đại số", topGapSeverity: 46, classId: "11a2", status: "at_risk" },
  { id: "u4", name: "Le Van Cuong", email: "le.vc@aurora.edu.vn", avgScore: 7.8, clarity: 66, topGap: "Hình học", topGapSeverity: 34, classId: "11a1", status: "progressing" },
  { id: "u5", name: "Pham Minh Duc", email: "pham.md@aurora.edu.vn", avgScore: 8.9, clarity: 81, topGap: "Xác suất", topGapSeverity: 19, classId: "11a3", status: "mastery" },
  { id: "u6", name: "Hoang Thi Em", email: "hoang.te@aurora.edu.vn", avgScore: 5.4, clarity: 40, topGap: "Logic", topGapSeverity: 62, classId: "11a2", status: "critical_gap" },
];

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ k11: true, k12: false });
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("u1");
  const [openErrorTooltip, setOpenErrorTooltip] = useState<string | null>(null);

  const [dbClassrooms, setDbClassrooms] = useState<Array<{ id: string; name: string }>>([]);
  const [dbUsers, setDbUsers] = useState<UserRow[]>(MOCK_USERS);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    apiFetch("/admin/classrooms")
      .then((data) => {
        setDbClassrooms(data || []);
      })
      .catch((err) => console.error("Failed to fetch classrooms", err));
  }, []);

  useEffect(() => {
    if (!classFilter) {
      setDbUsers(MOCK_USERS);
      return;
    }
    setLoadingUsers(true);
    apiFetch(`/admin/classrooms/${classFilter}/students`)
      .then((students: any[]) => {
        const rows: UserRow[] = (students || []).map((s, idx) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          avgScore: 7.5 + (idx % 3) * 0.5,
          clarity: 60 + (idx % 5) * 8,
          topGap: idx % 2 === 0 ? "Đại số" : "Hình học",
          topGapSeverity: 20 + (idx % 4) * 10,
          classId: classFilter,
          status: idx % 4 === 0 ? "mastery" : idx % 4 === 1 ? "progressing" : idx % 4 === 2 ? "at_risk" : "critical_gap",
        }));
        setDbUsers(rows);
        if (rows.length > 0) {
          setSelectedUserId(rows[0].id);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch students", err);
        setDbUsers([]);
      })
      .finally(() => setLoadingUsers(false));
  }, [classFilter]);

  // Dual-listbox local state for the currently selected user (prototype only — resets on switch, not persisted)
  const selectedUser = useMemo(() => dbUsers.find((u) => u.id === selectedUserId) ?? dbUsers[0] ?? MOCK_USERS[0], [dbUsers, selectedUserId]);
  const [assigned, setAssigned] = useState<string[]>(selectedUser.classId ? [selectedUser.classId] : []);
  const [pickedAvailable, setPickedAvailable] = useState<string[]>([]);
  const [pickedAssigned, setPickedAssigned] = useState<string[]>([]);

  function selectUser(id: string) {
    setSelectedUserId(id);
    const u = dbUsers.find((x) => x.id === id);
    setAssigned(u?.classId ? [u.classId] : []);
    setPickedAvailable([]);
    setPickedAssigned([]);
  }

  const availableClasses = ALL_CLASSES.filter((c) => !assigned.includes(c.id));

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

  const filteredUsers = useMemo(() => {
    return dbUsers.filter((u) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      }
      return true;
    });
  }, [dbUsers, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-[var(--font-display)] font-extrabold tracking-tight">Người dùng & Chẩn đoán</h1>
        <p className="text-muted-foreground mt-2">
          Quản lý tài khoản theo lớp học (DB Realtime) và theo dõi chất lượng chẩn đoán (Mock).
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
          Thêm người dùng (Mock)
        </button>
        <DisabledAction label="Bulk Import & Provisioning (Mock)" icon={UploadCloud} />
        <DisabledAction label="Role Permission Matrix (RBAC) (Mock)" icon={ShieldCheck} />
        <div className="flex items-center gap-1 ml-auto">
          <IconOnlyButton icon={Download} label="Xuất dữ liệu" />
          <IconOnlyButton icon={Lock} label="Khóa hàng loạt" />
          <IconOnlyButton
            icon={Info}
            label="Về trang này"
            onClick={() => toast.info("Dữ liệu lớp học và học sinh được lấy từ DB. Các tác vụ sửa đổi, import, phân quyền hiện là Mock.")}
          />
          <IconOnlyButton icon={LayoutGrid} label="Đổi chế độ xem" />
        </div>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_300px] gap-5 items-start">
        {/* Left: structure tree */}
        <div className="rounded-3xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 px-1">Lớp học Hệ thống</p>
          <div className="flex items-center gap-2 px-1 py-1.5 text-sm font-bold">
            <School className="h-4 w-4 text-[var(--purple)]" />
            Trường THPT (DB)
          </div>
          <div className="mt-1 space-y-0.5 max-h-[400px] overflow-y-auto pr-1">
            {dbClassrooms.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">Đang tải lớp học...</p>
            ) : (
              dbClassrooms.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClassFilter((prev) => (prev === c.id ? null : c.id))}
                  aria-pressed={classFilter === c.id}
                  className="w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors aria-pressed:bg-[var(--purple)]/10 aria-pressed:text-[var(--purple)] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                  <div className="flex items-center gap-1.5">
                    <Folder className="h-3.5 w-3.5 text-[var(--mint)]" />
                    <span>Lớp {c.name}</span>
                  </div>
                </button>
              ))
            )}
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
                  <th className="p-4 pl-6 font-bold">User (Real)</th>
                  <th className="p-4 font-bold">Avg Score (Mock)</th>
                  <th className="p-4 font-bold">Clarity (Mock)</th>
                  <th className="p-4 font-bold">Top Gap (Mock)</th>
                  <th className="p-4 font-bold">Class (Real)</th>
                  <th className="p-4 font-bold">Status (Mock)</th>
                  <th className="p-4 pr-6 text-right font-bold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.map((u) => {
                  const meta = STATUS_META[u.status];
                  const className = dbClassrooms.find((c) => c.id === u.classId)?.name 
                    ? `Lớp ${dbClassrooms.find((c) => c.id === u.classId)?.name}`
                    : (ALL_CLASSES.find((c) => c.id === u.classId)?.name ?? "-");
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
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Lớp: {selectedUser.name}</p>
            <p className="text-sm mt-1">
              <span className="text-muted-foreground">Vai trò: </span>
              <span className="font-bold">Học sinh (Real)</span>
            </p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Lớp đã gán (Mock)</p>
            <div className="rounded-2xl border border-border bg-muted/30 p-2 min-h-[64px] flex flex-wrap gap-1.5 content-start">
              {assigned.length ? (
                assigned.map((id) => (
                  <span key={id} className="px-2.5 py-1 rounded-lg bg-[var(--purple)]/10 text-[var(--purple)] text-xs font-bold">
                    {ALL_CLASSES.find((c) => c.id === id)?.name}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-foreground p-1">Chưa gán lớp nào.</span>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Tùy chọn: Dual-listbox (Mock)</p>
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
                    {ALL_CLASSES.find((c) => c.id === id)?.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              Chọn lớp ở 2 khung rồi bấm mũi tên để chuyển. Thay đổi chỉ lưu tạm ở giao diện (prototype), chưa gọi API lưu thật.
            </p>
          </div>

          <button
            type="button"
            onClick={() => toast.info("Sắp ra mắt — lưu gán lớp cần API thật, xem README.")}
            className="w-full rounded-2xl bg-foreground text-background text-sm font-bold py-2.5 hover:opacity-90 active:scale-95 transition-all"
          >
            Lưu thay đổi
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
