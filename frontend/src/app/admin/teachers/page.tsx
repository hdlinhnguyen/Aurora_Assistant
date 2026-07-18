"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PlusCircle, Trash, Check, X, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Teacher {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
}

export default function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadTeachers = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/teachers");
      setTeachers(data || []);
    } catch (err: any) {
      toast.error("Không thể tải danh sách giáo viên: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeachers();
  }, []);

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || !newPassword) {
      toast.error("Vui lòng điền đầy đủ thông tin");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/admin/teachers", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newPassword
        })
      });
      toast.success("Tạo tài khoản giáo viên thành công!");
      setShowAddModal(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      loadTeachers();
    } catch (err: any) {
      toast.error(err.message || "Tạo giáo viên thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (teacher: Teacher, newStatus: string) => {
    try {
      await apiFetch(`/admin/teachers/${teacher.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: newStatus
        })
      });
      toast.success(`Đã cập nhật trạng thái của giáo viên ${teacher.name}`);
      loadTeachers();
    } catch (err: any) {
      toast.error("Cập nhật trạng thái thất bại: " + err.message);
    }
  };

  const handleDeleteTeacher = async (teacher: Teacher) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa giáo viên "${teacher.name}"? Hành động này không thể hoàn tác.`)) {
      return;
    }
    try {
      await apiFetch(`/admin/teachers/${teacher.id}`, {
        method: "DELETE"
      });
      toast.success(`Đã xóa giáo viên ${teacher.name}`);
      loadTeachers();
    } catch (err: any) {
      toast.error("Xóa giáo viên thất bại: " + err.message);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-[var(--font-display)] font-extrabold tracking-tight">
            Quản lý Giáo viên
          </h1>
          <p className="text-muted-foreground mt-2">
            Phê duyệt, khóa hoặc cấp mới quyền giáo viên chủ nhiệm môn học.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-foreground hover:opacity-90 text-background font-semibold shadow-md active:scale-95 transition-all text-sm"
        >
          <PlusCircle className="h-5 w-5" />
          Thêm Giáo viên
        </button>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-10 bg-muted rounded-xl" />
          <div className="h-64 bg-card border border-border rounded-3xl" />
        </div>
      ) : teachers.length === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-12 text-center text-muted-foreground">
          <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          Chưa có tài khoản giáo viên nào được đăng ký.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider font-bold">
                  <th className="p-4 pl-6 font-bold">Họ và tên</th>
                  <th className="p-4 font-bold">Email</th>
                  <th className="p-4 font-bold">Trạng thái</th>
                  <th className="p-4 font-bold">Ngày tham gia</th>
                  <th className="p-4 pr-6 text-right font-bold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {teachers.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-muted/30 transition-all">
                    <td className="p-4 pl-6 font-semibold">{teacher.name}</td>
                    <td className="p-4 text-muted-foreground">{teacher.email}</td>
                    <td className="p-4">
                      {teacher.status === "active" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                          <Check className="h-3 w-3" /> Hoạt động
                        </span>
                      ) : teacher.status === "pending" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 animate-pulse">
                          Chờ duyệt
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
                          <X className="h-3 w-3" /> Đã khóa
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {new Date(teacher.createdAt).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="p-4 pr-6 text-right space-x-2">
                      {teacher.status === "pending" && (
                        <button
                          onClick={() => handleUpdateStatus(teacher, "active")}
                          className="inline-flex items-center justify-center p-2 rounded-xl text-emerald-600 hover:bg-emerald-500/10 transition-all"
                          title="Phê duyệt"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      {teacher.status === "active" ? (
                        <button
                          onClick={() => handleUpdateStatus(teacher, "inactive")}
                          className="inline-flex items-center justify-center p-2 rounded-xl text-amber-600 hover:bg-amber-500/10 transition-all"
                          title="Khóa tài khoản"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : (
                        teacher.status === "inactive" && (
                          <button
                            onClick={() => handleUpdateStatus(teacher, "active")}
                            className="inline-flex items-center justify-center p-2 rounded-xl text-emerald-600 hover:bg-emerald-500/10 transition-all"
                            title="Kích hoạt lại"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )
                      )}
                      <button
                        onClick={() => handleDeleteTeacher(teacher)}
                        className="inline-flex items-center justify-center p-2 rounded-xl text-rose-600 hover:bg-rose-500/10 transition-all"
                        title="Xóa giáo viên"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Teacher Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold font-[var(--font-display)] mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[var(--purple)]" />
              Thêm Giáo viên mới
            </h3>
            
            <form onSubmit={handleCreateTeacher} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Họ và tên</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Thầy Nguyễn Văn A"
                  className="mt-1 w-full rounded-xl border border-input bg-card px-4 py-2 text-sm text-foreground focus:border-[var(--purple)] focus:outline-none focus:ring-1 focus:ring-[var(--purple)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Email đăng nhập</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="giaovien@aurora.edu.vn"
                  className="mt-1 w-full rounded-xl border border-input bg-card px-4 py-2 text-sm text-foreground focus:border-[var(--purple)] focus:outline-none focus:ring-1 focus:ring-[var(--purple)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Mật khẩu ban đầu</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-xl border border-input bg-card px-4 py-2 text-sm text-foreground focus:border-[var(--purple)] focus:outline-none focus:ring-1 focus:ring-[var(--purple)]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-all active:scale-95"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all active:scale-95"
                >
                  {submitting ? "Đang tạo..." : "Xác nhận"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
