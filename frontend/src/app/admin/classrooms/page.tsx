"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PlusCircle, Trash, Pencil, BookOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Classroom {
  id: string;
  name: string;
  teacherId: string;
  teacherName: string;
  createdAt: string;
}

interface Teacher {
  id: string;
  name: string;
}

export default function AdminClassrooms() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  // Add / Edit Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<"create" | "edit">("create");
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);

  const [className, setClassName] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const classData = await apiFetch("/admin/classrooms");
      setClassrooms(classData || []);
      const teacherData = await apiFetch("/admin/teachers");
      const activeTeachers = teacherData?.filter((t: any) => t.status === "active") || [];
      setTeachers(activeTeachers);
      if (activeTeachers.length > 0) {
        setTeacherId(activeTeachers[0].id);
      }
    } catch (err: any) {
      toast.error("Không thể tải dữ liệu: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setModalType("create");
    setClassName("");
    setTeacherId(teachers[0]?.id || "");
    setShowModal(true);
  };

  const openEditModal = (cls: Classroom) => {
    setModalType("edit");
    setSelectedClassroom(cls);
    setClassName(cls.name);
    setTeacherId(cls.teacherId);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className || !teacherId) {
      toast.error("Vui lòng nhập đầy đủ thông tin");
      return;
    }
    setSubmitting(true);
    try {
      if (modalType === "create") {
        await apiFetch("/admin/classrooms", {
          method: "POST",
          body: JSON.stringify({
            name: className,
            teacherId: teacherId
          })
        });
        toast.success("Tạo lớp học thành công!");
      } else {
        await apiFetch(`/admin/classrooms/${selectedClassroom?.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: className,
            teacherId: teacherId
          })
        });
        toast.success("Cập nhật lớp học thành công!");
      }
      setShowModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Xử lý thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClassroom = async (cls: Classroom) => {
    if (!confirm(`Bạn có chắc muốn xóa lớp học "${cls.name}"? Học sinh thuộc lớp này sẽ tạm thời bị hủy phân lớp.`)) {
      return;
    }
    try {
      await apiFetch(`/admin/classrooms/${cls.id}`, {
        method: "DELETE"
      });
      toast.success(`Đã xóa lớp học ${cls.name}`);
      loadData();
    } catch (err: any) {
      toast.error("Xóa lớp học thất bại: " + err.message);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-[var(--font-display)] font-extrabold tracking-tight">
            Quản lý Lớp học
          </h1>
          <p className="text-muted-foreground mt-2">
            Khởi tạo lớp học mới và chỉ định giáo viên chủ nhiệm tương ứng.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          disabled={teachers.length === 0}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-foreground hover:opacity-90 disabled:opacity-50 text-background font-semibold shadow-md active:scale-95 transition-all text-sm"
        >
          <PlusCircle className="h-5 w-5" />
          Tạo Lớp học
        </button>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-10 bg-muted rounded-xl" />
          <div className="h-64 bg-card border border-border rounded-3xl" />
        </div>
      ) : classrooms.length === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-12 text-center text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          Chưa có lớp học nào được khởi tạo.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider font-bold">
                  <th className="p-4 pl-6 font-bold">Tên Lớp học</th>
                  <th className="p-4 font-bold">Giáo viên phụ trách</th>
                  <th className="p-4 font-bold">Ngày khởi tạo</th>
                  <th className="p-4 pr-6 text-right font-bold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {classrooms.map((cls) => (
                  <tr key={cls.id} className="hover:bg-muted/30 transition-all">
                    <td className="p-4 pl-6 font-semibold flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-[var(--purple)]" />
                      {cls.name}
                    </td>
                    <td className="p-4 text-muted-foreground font-semibold">{cls.teacherName || "Chưa có giáo viên"}</td>
                    <td className="p-4 text-muted-foreground">
                      {new Date(cls.createdAt).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="p-4 pr-6 text-right space-x-2">
                      <button
                        onClick={() => openEditModal(cls)}
                        className="inline-flex items-center justify-center p-2 rounded-xl text-amber-600 hover:bg-amber-500/10 transition-all"
                        title="Chỉnh sửa lớp học"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClassroom(cls)}
                        className="inline-flex items-center justify-center p-2 rounded-xl text-rose-600 hover:bg-rose-500/10 transition-all"
                        title="Xóa lớp học"
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

      {/* Classroom Modal (Create/Edit) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold font-[var(--font-display)] mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[var(--purple)]" />
              {modalType === "create" ? "Tạo lớp học mới" : "Chỉnh sửa lớp học"}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Tên Lớp học</label>
                <input
                  type="text"
                  required
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="Lớp 5A1, Lớp 4B..."
                  className="mt-1 w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-foreground focus:border-[var(--purple)] focus:outline-none focus:ring-1 focus:ring-[var(--purple)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Giáo viên phụ trách</label>
                <select
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-foreground focus:border-[var(--purple)] focus:outline-none focus:ring-1 focus:ring-[var(--purple)]"
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-all active:scale-95"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all active:scale-95"
                >
                  {submitting ? "Đang xử lý..." : "Xác nhận"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
