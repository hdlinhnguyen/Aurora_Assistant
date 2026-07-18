"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PlusCircle, Trash, Key, Sparkles, Upload, Users, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Classroom {
  id: string;
  name: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export default function StudentMgmtTab() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Bulk Import
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkList, setBulkList] = useState<any[]>([]);

  // Quick Demo Add States
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [demoSubjects, setDemoSubjects] = useState<string[]>([]);
  const [selectedDemoSubject, setSelectedDemoSubject] = useState("");
  const [demoNodes, setDemoNodes] = useState<any[]>([]);
  const [selectedDemoNode, setSelectedDemoNode] = useState("");
  
  const [demoName, setDemoName] = useState("");
  const [demoEmail, setDemoEmail] = useState("");
  const [demoPassword, setDemoPassword] = useState("123456");
  const [demoPerformance, setDemoPerformance] = useState("good"); // good, poor, average, random, custom
  const [demoTotal, setDemoTotal] = useState(10);
  const [demoCorrect, setDemoCorrect] = useState(6);

  useEffect(() => {
    async function fetchSubjects() {
      try {
        const data = await apiFetch("/subjects");
        setDemoSubjects(data || []);
        if (data && data.length > 0) {
          setSelectedDemoSubject(data[0]);
        }
      } catch (err) {
        console.error("Failed to fetch subjects for demo", err);
      }
    }
    fetchSubjects();
  }, []);

  useEffect(() => {
    async function fetchNodes() {
      if (!selectedDemoSubject) {
        setDemoNodes([]);
        return;
      }
      try {
        const data = await apiFetch(`/subjects/${encodeURIComponent(selectedDemoSubject)}/tree`);
        setDemoNodes(data?.nodes || []);
        if (data?.nodes && data.nodes.length > 0) {
          setSelectedDemoNode(data.nodes[0].id);
        } else {
          setSelectedDemoNode("");
        }
      } catch (err) {
        console.error("Failed to fetch tree nodes", err);
        setDemoNodes([]);
      }
    }
    fetchNodes();
  }, [selectedDemoSubject]);

  const loadClassrooms = async () => {
    try {
      const data = await apiFetch("/teacher/classrooms");
      setClassrooms(data || []);
      if (data && data.length > 0) {
        setSelectedClassId(data[0].id);
      }
    } catch (err: any) {
      toast.error("Không thể tải danh sách lớp học: " + err.message);
    }
  };

  const loadStudents = async (classId: string) => {
    if (!classId) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/teacher/classrooms/${classId}/students`);
      setStudents(data || []);
    } catch (err: any) {
      toast.error("Không thể tải danh sách học sinh: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassrooms();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      loadStudents(selectedClassId);
    } else {
      setStudents([]);
    }
  }, [selectedClassId]);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || !newPassword || !selectedClassId) {
      toast.error("Vui lòng nhập đầy đủ thông tin");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/teacher/students", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newPassword,
          classroomId: selectedClassId
        })
      });
      toast.success("Thêm học sinh thành công!");
      setShowAddModal(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      loadStudents(selectedClassId);
    } catch (err: any) {
      toast.error(err.message || "Không thể tạo tài khoản học sinh");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateDemoStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!demoName || !demoEmail || !demoPassword || !selectedClassId || !selectedDemoSubject) {
      toast.error("Vui lòng điền đầy đủ thông tin");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/teacher/students", {
        method: "POST",
        body: JSON.stringify({
          name: demoName,
          email: demoEmail,
          password: demoPassword,
          classroomId: selectedClassId,
          isDemoQuickAdd: true,
          performanceType: demoPerformance,
          subject: selectedDemoSubject,
          totalAnswers: demoPerformance === "custom" ? Number(demoTotal) : 0,
          correctAnswers: demoPerformance === "custom" ? Number(demoCorrect) : 0,
          currentNodeId: demoPerformance === "custom" ? selectedDemoNode : ""
        })
      });
      toast.success("Thêm nhanh học sinh Demo thành công!");
      setShowDemoModal(false);
      setDemoName("");
      setDemoEmail("");
      loadStudents(selectedClassId);
    } catch (err: any) {
      toast.error(err.message || "Không thể tạo tài khoản học sinh Demo");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet) as any[];

        // Expecting columns: "Họ và tên", "Email", "Mật khẩu"
        const parsed = rows.map((r: any) => ({
          name: r["Họ và tên"] || r["Name"] || r["name"],
          email: r["Email"] || r["email"],
          password: String(r["Mật khẩu"] || r["Password"] || r["password"] || "123456")
        })).filter((item: any) => item.name && item.email);

        if (parsed.length === 0) {
          toast.error("File Excel không đúng định dạng hoặc không có dữ liệu hợp lệ (Cần cột Họ và tên, Email, Mật khẩu)");
          return;
        }

        setBulkList(parsed);
      } catch (err: any) {
        toast.error("Lỗi đọc file Excel: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const submitBulk = async () => {
    if (bulkList.length === 0 || !selectedClassId) return;
    setSubmitting(true);
    try {
      const res = await apiFetch("/teacher/students/bulk", {
        method: "POST",
        body: JSON.stringify({
          classroomId: selectedClassId,
          students: bulkList
        })
      });
      toast.success(`Đã thêm thành công ${res.successCount} học sinh!`);
      setShowBulkModal(false);
      setBulkList([]);
      loadStudents(selectedClassId);
    } catch (err: any) {
      toast.error("Lỗi khi import học sinh: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (student: Student) => {
    if (!confirm(`Đặt lại mật khẩu cho học sinh "${student.name}" về "123456"?`)) {
      return;
    }
    try {
      await apiFetch(`/teacher/students/${student.id}/reset-password`, {
        method: "PUT"
      });
      toast.success(`Đã reset mật khẩu của học sinh ${student.name} về "123456"`);
    } catch (err: any) {
      toast.error("Reset mật khẩu thất bại: " + err.message);
    }
  };

  const handleDeleteStudent = async (student: Student) => {
    if (!confirm(`Xóa vĩnh viễn tài khoản và lịch sử học tập của học sinh "${student.name}"? Hành động này không thể phục hồi.`)) {
      return;
    }
    try {
      await apiFetch(`/teacher/students/${student.id}`, {
        method: "DELETE"
      });
      toast.success(`Đã xóa học sinh ${student.name}`);
      loadStudents(selectedClassId);
    } catch (err: any) {
      toast.error("Xóa học sinh thất bại: " + err.message);
    }
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col overflow-hidden">
      {/* Top action bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card border border-border p-4 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Chọn Lớp học:</label>
          {classrooms.length === 0 ? (
            <span className="text-sm font-semibold text-rose-500">Chưa được gán lớp học nào</span>
          ) : (
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="rounded-xl border border-input bg-card px-3 py-1.5 text-sm text-foreground focus:border-[var(--purple)] focus:outline-none focus:ring-1 focus:ring-[var(--purple)] font-semibold"
            >
              {classrooms.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBulkModal(true)}
            disabled={!selectedClassId}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-muted border border-border hover:bg-accent text-foreground font-semibold text-xs active:scale-95 transition-all cursor-pointer"
          >
            <Upload size={14} /> Import Excel
          </button>
          <button
            onClick={() => {
              const randId = Math.floor(1000 + Math.random() * 9000);
              setDemoName(`Học sinh Demo ${randId}`);
              setDemoEmail(`student.demo${randId}@aurora.edu.vn`);
              setDemoPassword("123456");
              setShowDemoModal(true);
            }}
            disabled={!selectedClassId}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[var(--purple)]/10 to-[var(--mint)]/10 border border-[var(--purple)]/30 hover:brightness-95 text-[var(--purple)] font-semibold text-xs active:scale-95 transition-all cursor-pointer"
          >
            <Sparkles size={14} /> Thêm Học sinh Demo (Quick)
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={!selectedClassId}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-foreground hover:opacity-90 text-background font-semibold text-xs active:scale-95 transition-all cursor-pointer"
          >
            <PlusCircle size={14} /> Thêm Học sinh
          </button>
        </div>
      </div>

      {/* Main Students List */}
      {loading ? (
        <div className="space-y-4 animate-pulse flex-1">
          <div className="h-64 bg-card border border-border rounded-3xl" />
        </div>
      ) : students.length === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-12 text-center text-muted-foreground flex-1 flex flex-col justify-center items-center">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="font-semibold text-sm">Chưa có học sinh nào trong lớp học này</p>
          <p className="text-xs text-muted-foreground mt-1">Sử dụng nút Thêm hoặc Import Excel để nạp học sinh</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm flex-1 flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider font-bold">
                  <th className="p-4 pl-6 font-bold">Họ và tên</th>
                  <th className="p-4 font-bold">Email tài khoản</th>
                  <th className="p-4 font-bold">Ngày đăng ký</th>
                  <th className="p-4 pr-6 text-right font-bold">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-muted/10 transition-all">
                    <td className="p-4 pl-6 font-semibold flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-[var(--mint)]" />
                      {student.name}
                    </td>
                    <td className="p-4 text-muted-foreground font-mono text-xs">{student.email}</td>
                    <td className="p-4 text-muted-foreground">
                      {new Date(student.createdAt).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="p-4 pr-6 text-right space-x-2">
                      <button
                        onClick={() => handleResetPassword(student)}
                        className="inline-flex items-center justify-center p-2 rounded-xl text-amber-600 hover:bg-amber-500/10 transition-all cursor-pointer"
                        title="Đặt lại mật khẩu (123456)"
                      >
                        <Key className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteStudent(student)}
                        className="inline-flex items-center justify-center p-2 rounded-xl text-rose-600 hover:bg-rose-500/10 transition-all cursor-pointer"
                        title="Xóa học sinh"
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

      {/* Manual Add Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-card border border-border rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold font-[var(--font-display)] mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[var(--mint)]" />
              Thêm Học sinh thủ công
            </h3>

            <form onSubmit={handleCreateStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Họ và tên</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Học sinh Nguyễn Văn A"
                  className="mt-1 w-full rounded-xl border border-input bg-card px-4 py-2 text-sm text-foreground focus:border-[var(--mint)] focus:outline-none focus:ring-1 focus:ring-[var(--mint)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Email đăng nhập</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="hocsinh@gmail.com"
                  className="mt-1 w-full rounded-xl border border-input bg-card px-4 py-2 text-sm text-foreground focus:border-[var(--mint)] focus:outline-none focus:ring-1 focus:ring-[var(--mint)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Mật khẩu</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-xl border border-input bg-card px-4 py-2 text-sm text-foreground focus:border-[var(--mint)] focus:outline-none focus:ring-1 focus:ring-[var(--mint)]"
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
                  {submitting ? "Đang xử lý..." : "Xác nhận"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Excel Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-card border border-border rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold font-[var(--font-display)] mb-2 flex items-center gap-2">
              <Upload className="h-5 w-5 text-[var(--purple)]" />
              Nhập học sinh hàng loạt từ Excel
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Chọn tệp Excel chứa danh sách học sinh. File cần có các cột: <strong className="text-foreground">Họ và tên</strong>, <strong className="text-foreground">Email</strong>, và <strong className="text-foreground">Mật khẩu</strong> (nếu bỏ trống mật khẩu sẽ mặc định là 123456).
            </p>

            <div className="space-y-4">
              <div className="border-2 border-dashed border-border rounded-2xl p-6 text-center hover:bg-accent/40 transition-all cursor-pointer relative">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleExcelImport}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <span className="text-xs font-bold text-foreground">Click để tải lên file Excel (.xlsx)</span>
              </div>

              {bulkList.length > 0 && (
                <div className="border border-border rounded-xl p-4 bg-muted max-h-48 overflow-y-auto">
                  <p className="text-xs font-black uppercase text-muted-foreground mb-2">Đã nhận diện {bulkList.length} dòng:</p>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr>
                        <th>Họ tên</th>
                        <th>Email</th>
                        <th>Mật khẩu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkList.slice(0, 10).map((b, idx) => (
                        <tr key={idx} className="border-t border-border/40">
                          <td className="py-1 font-semibold">{b.name}</td>
                          <td>{b.email}</td>
                          <td>{b.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bulkList.length > 10 && <p className="text-[10px] text-muted-foreground text-center mt-2">...và {bulkList.length - 10} học sinh khác</p>}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                <button
                  type="button"
                  onClick={submitBulk}
                  disabled={bulkList.length === 0 || submitting}
                  className="px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all active:scale-95"
                >
                  {submitting ? "Đang xử lý..." : `Xác nhận nhập (${bulkList.length} học sinh)`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkModal(false);
                    setBulkList([]);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-all active:scale-95"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Demo Add Modal */}
      {showDemoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold font-[var(--font-display)] mb-2 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[var(--purple)] animate-pulse" />
              Thêm nhanh học sinh Demo
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Khởi tạo tài khoản học sinh kèm theo các thông số năng lực ảo để hiển thị trực quan trên Dashboard.
            </p>

            <form onSubmit={handleCreateDemoStudent} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Họ và tên</label>
                  <input
                    type="text"
                    required
                    value={demoName}
                    onChange={(e) => setDemoName(e.target.value)}
                    placeholder="Học sinh Demo"
                    className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-[var(--purple)] focus:outline-none focus:ring-1 focus:ring-[var(--purple)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mật khẩu</label>
                  <input
                    type="text"
                    required
                    value={demoPassword}
                    onChange={(e) => setDemoPassword(e.target.value)}
                    placeholder="123456"
                    className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-[var(--purple)] focus:outline-none focus:ring-1 focus:ring-[var(--purple)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email đăng nhập</label>
                <input
                  type="email"
                  required
                  value={demoEmail}
                  onChange={(e) => setDemoEmail(e.target.value)}
                  placeholder="student.demo@aurora.edu.vn"
                  className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-[var(--purple)] focus:outline-none focus:ring-1 focus:ring-[var(--purple)] font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Môn học Demo</label>
                  <select
                    value={selectedDemoSubject}
                    onChange={(e) => setSelectedDemoSubject(e.target.value)}
                    required
                    className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-[var(--purple)] focus:outline-none"
                  >
                    {demoSubjects.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Học lực mô phỏng</label>
                  <select
                    value={demoPerformance}
                    onChange={(e) => setDemoPerformance(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-[var(--purple)] focus:outline-none"
                  >
                    <option value="good">Học tốt (Đúng 13/15)</option>
                    <option value="average">Trung bình (Đúng 6/10)</option>
                    <option value="poor">Học yếu/Outlier (Đúng 3/12)</option>
                    <option value="random">Ngẫu nhiên</option>
                    <option value="custom">Tự cấu hình chi tiết...</option>
                  </select>
                </div>
              </div>

              {demoPerformance === "custom" && (
                <div className="p-4 rounded-2xl bg-muted border border-border space-y-3 animate-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cột mốc kiến thức hiện tại</label>
                    <select
                      value={selectedDemoNode}
                      onChange={(e) => setSelectedDemoNode(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-1.5 text-xs text-foreground focus:border-[var(--purple)] focus:outline-none"
                    >
                      <option value="">-- Mặc định (Gốc cây) --</option>
                      {demoNodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Số câu đã làm</label>
                      <input
                        type="number"
                        min="0"
                        value={demoTotal}
                        onChange={(e) => setDemoTotal(Number(e.target.value))}
                        className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-1.5 text-xs text-foreground focus:border-[var(--purple)] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Số câu đúng</label>
                      <input
                        type="number"
                        min="0"
                        max={demoTotal}
                        value={demoCorrect}
                        onChange={(e) => setDemoCorrect(Number(e.target.value))}
                        className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-1.5 text-xs text-foreground focus:border-[var(--purple)] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {demoNodes.length === 0 && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-[11px] font-semibold leading-relaxed">
                  ⚠️ Môn học này chưa có cây kiến thức. Vui lòng nạp cây kiến thức trước khi thêm học sinh Demo có kết quả mô phỏng.
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                <button
                  type="button"
                  onClick={() => setShowDemoModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-all active:scale-95"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting || demoNodes.length === 0}
                  className="px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all active:scale-95"
                >
                  {submitting ? "Đang xử lý..." : "Xác nhận tạo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
