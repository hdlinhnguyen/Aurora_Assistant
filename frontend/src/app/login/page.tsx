"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Pre-fill role from query param if available
  const initialRole = searchParams.get("role") || "student";

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState(initialRole);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Redirect if already logged in
    const token = localStorage.getItem("aurora_token");
    const userStr = localStorage.getItem("aurora_user");
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === "teacher") {
          router.push("/teacher");
        } else {
          router.push("/tutor");
        }
      } catch (e) {
        localStorage.clear();
      }
    }
  }, [router]);

  const handleDemoLogin = async (demoEmail: string, demoRole: string) => {
    setError("");
    setSuccess("");
    setLoading(true);
    setEmail(demoEmail);
    setPassword("demo123");
    setRole(demoRole);
    setIsLogin(true);

    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: demoEmail, password: "demo123" }),
        requireAuth: false,
      });
      localStorage.setItem("aurora_token", data.token);
      localStorage.setItem("aurora_user", JSON.stringify(data.user));
      
      if (data.user.role === "teacher") {
        router.push("/teacher");
      } else {
        router.push("/tutor");
      }
    } catch (err: any) {
      setError(err.message || "Đăng nhập tài khoản demo thất bại.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (isLogin) {
        const data = await apiFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
          requireAuth: false,
        });
        localStorage.setItem("aurora_token", data.token);
        localStorage.setItem("aurora_user", JSON.stringify(data.user));
        
        if (data.user.role === "teacher") {
          router.push("/teacher");
        } else {
          router.push("/tutor");
        }
      } else {
        await apiFetch("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, name, role }),
          requireAuth: false,
        });
        setSuccess("Đăng ký tài khoản thành công! Vui lòng đăng nhập.");
        setIsLogin(true);
        setPassword("");
      }
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-[var(--font-display)] font-extrabold tracking-tight bg-gradient-to-r from-[var(--mint)] to-[var(--purple)] bg-clip-text text-transparent">
          Aurora Socratic Tutor
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isLogin ? "Học thật, hiểu thật với trí tuệ nhân tạo phản biện" : "Tạo tài khoản học tập thích ứng mới"}
        </p>
      </div>

      {/* Demo quick accounts */}
      {isLogin && (
        <div className="mb-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleDemoLogin("student@aurora.edu.vn", "student")}
            className="flex flex-col items-center justify-center p-3 rounded-2xl border border-border bg-muted hover:bg-accent transition-all text-center text-foreground shadow-sm"
          >
            {/* Custom Student SVG Icon */}
            <svg className="h-5 w-5 text-[var(--mint)] mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-xs font-bold">Học sinh Demo</span>
            <span className="text-[9px] text-muted-foreground mt-0.5">student@aurora.edu.vn</span>
          </button>
          <button
            type="button"
            onClick={() => handleDemoLogin("teacher@aurora.edu.vn", "teacher")}
            className="flex flex-col items-center justify-center p-3 rounded-2xl border border-border bg-muted hover:bg-accent transition-all text-center text-foreground shadow-sm"
          >
            {/* Custom Teacher SVG Icon */}
            <svg className="h-5 w-5 text-[var(--purple)] mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2zm12-5a2 2 0 11-4 0 2 2 0 014 0zM9 20h12" />
            </svg>
            <span className="text-xs font-bold">Giáo viên Demo</span>
            <span className="text-[9px] text-muted-foreground mt-0.5">teacher@aurora.edu.vn</span>
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-foreground">
        {!isLogin && (
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Họ và tên</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Nguyễn Văn A"
              className="mt-1 w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:border-[var(--mint)] focus:outline-none focus:ring-1 focus:ring-[var(--mint)]"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="hocsinh@gmail.com"
            className="mt-1 w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:border-[var(--mint)] focus:outline-none focus:ring-1 focus:ring-[var(--mint)]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Mật khẩu</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="mt-1 w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:border-[var(--mint)] focus:outline-none focus:ring-1 focus:ring-[var(--mint)]"
          />
        </div>

        {!isLogin && (
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Vai trò</label>
            <div className="mt-2 flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-foreground">
                <input
                  type="radio"
                  name="role"
                  value="student"
                  checked={role === "student"}
                  onChange={() => setRole("student")}
                  className="accent-[var(--mint)]"
                />
                <span className="text-sm">Học sinh</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-foreground">
                <input
                  type="radio"
                  name="role"
                  value="teacher"
                  checked={role === "teacher"}
                  onChange={() => setRole("teacher")}
                  className="accent-[var(--mint)]"
                />
                <span className="text-sm">Giáo viên</span>
              </label>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-foreground hover:opacity-90 text-background py-3 text-sm font-semibold shadow-[var(--shadow-card)] transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? "Đang xử lý..." : isLogin ? "Đăng Nhập" : "Đăng Ký"}
        </button>
      </form>

      <div className="mt-6 text-center text-xs text-muted-foreground">
        {isLogin ? (
          <p>
            Chưa có tài khoản?{" "}
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className="font-medium text-[var(--mint)] hover:underline"
            >
              Đăng ký ngay
            </button>
          </p>
        ) : (
          <p>
            Đã có tài khoản?{" "}
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className="font-medium text-[var(--mint)] hover:underline"
              disabled={loading}
            >
              Đăng nhập
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 font-[var(--font-body)]">
      {/* Subtle background glows */}
      <div className="absolute top-1/4 left-1/4 h-80 w-80 rounded-full bg-[var(--mint)]/20 blur-[100px]" />
      <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-[var(--purple)]/20 blur-[100px]" />

      <Suspense fallback={<div className="text-muted-foreground text-sm">Đang tải...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
