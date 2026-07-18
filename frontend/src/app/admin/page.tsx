"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { GraduationCap, BookOpen, Layers, Users, ShieldAlert, CheckCircle } from "lucide-react";
import TelemetryDashboard from "./components/TelemetryDashboard";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    teachers: 0,
    classrooms: 0,
    students: 0,
    subjects: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const teachers = await apiFetch("/admin/teachers");
        const classrooms = await apiFetch("/admin/classrooms");
        const subjects = await apiFetch("/subjects");
        
        // Sum students across all classrooms to count total students
        let studentCount = 0;
        for (const cls of classrooms) {
          try {
            const students = await apiFetch(`/admin/classrooms/${cls.id}/students`);
            studentCount += students.length;
          } catch (e) {
            console.error("Failed to load students for class", cls.id, e);
          }
        }

        setStats({
          teachers: teachers.length,
          classrooms: classrooms.length,
          subjects: subjects.length,
          students: studentCount
        });
      } catch (err: any) {
        console.error("Failed to load admin stats:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const statCards = [
    { label: "Giáo viên", value: stats.teachers, icon: GraduationCap, color: "text-[var(--purple)] bg-[var(--purple)]/10" },
    { label: "Lớp học", value: stats.classrooms, icon: BookOpen, color: "text-[var(--mint)] bg-[var(--mint)]/10" },
    { label: "Học sinh", value: stats.students, icon: Users, color: "text-blue-500 bg-blue-500/10" },
    { label: "Môn học", value: stats.subjects, icon: Layers, color: "text-orange-500 bg-orange-500/10" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-[var(--font-display)] font-extrabold tracking-tight">
          Tổng quan Hệ thống
        </h1>
        <p className="text-muted-foreground mt-2">
          Quản lý toàn diện cơ sở dữ liệu, giáo viên và phân bổ các lớp học thích ứng.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-card border border-border rounded-3xl" />
          ))}
        </div>
      ) : (
        /* Stats Grid */
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {statCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div 
                key={i} 
                className="bg-card border border-border rounded-3xl p-6 shadow-[var(--shadow-card)] hover:scale-[1.02] transition-all relative overflow-hidden group"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">{card.label}</p>
                    <h3 className="text-3xl font-extrabold mt-2 tracking-tight">{card.value}</h3>
                  </div>
                  <div className={`p-3 rounded-2xl ${card.color} group-hover:rotate-6 transition-all`}>
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* System Status Panel */}
      <div className="bg-card border border-border rounded-3xl p-8 shadow-[var(--shadow-card)] relative">
        <h2 className="text-2xl font-bold font-[var(--font-display)] mb-4">Trạng thái Hệ thống</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
            <CheckCircle className="h-8 w-8 text-emerald-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase">API Server</p>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Hoạt động bình thường</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
            <CheckCircle className="h-8 w-8 text-emerald-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase">Cơ sở dữ liệu</p>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Đã kết nối PostgreSQL</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20">
            <ShieldAlert className="h-8 w-8 text-blue-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase">Bảo mật & Phân quyền</p>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400">RBAC Active (JWT)</p>
            </div>
          </div>
        </div>

        {/* Quick info panel */}
        <div className="mt-8 p-6 rounded-2xl bg-muted border border-border text-sm text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground">💡 Lưu ý cho Quản trị viên:</p>
          <p>• Để thay đổi cấu hình API Key của AI gia sư hoặc LLM, vui lòng cập nhật tệp cấu hình biến môi trường (`.env`) của server.</p>
          <p>• Việc kích hoạt tài khoản Giáo viên mới sẽ cho phép họ đăng nhập và truy cập vào công cụ biên soạn giáo án, quản lý học sinh và xem cảnh báo hành vi (Guardrails).</p>
        </div>
      </div>

      <section className="space-y-5 pt-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--purple)]">Quan sát & cải tiến</p>
          <h2 className="mt-2 text-3xl font-extrabold font-[var(--font-display)] tracking-tight">Metrics & EDA</h2>
          <p className="mt-2 text-sm text-muted-foreground">Giá trị trung bình theo thời gian và các bước khám phá dữ liệu sẵn ngay trên trang quản trị.</p>
        </div>
        <TelemetryDashboard />
      </section>
    </div>
  );
}
