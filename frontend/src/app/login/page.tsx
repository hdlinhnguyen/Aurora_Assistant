"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

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
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Redirect if already logged in
    const token = localStorage.getItem("aurora_token");
    const userStr = localStorage.getItem("aurora_user");
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === "admin") {
          router.push("/admin");
        } else if (user.role === "teacher") {
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
      
      if (data.user.role === "admin") {
        router.push("/admin");
      } else if (data.user.role === "teacher") {
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
        
        if (data.user.role === "admin") {
          router.push("/admin");
        } else if (data.user.role === "teacher") {
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
    <div className="relative w-full max-w-md">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mint)] rounded"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Về trang chủ
      </Link>
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-[var(--font-display)] font-extrabold tracking-tight bg-gradient-to-r from-[var(--mint)] to-[var(--purple)] bg-clip-text text-transparent">
          Aurora Assistant
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isLogin ? "Học thật, hiểu thật với trí tuệ nhân tạo phản biện" : "Tạo tài khoản học tập thích ứng mới"}
        </p>
      </div>

      {/* Demo quick accounts — de-emphasized so the real login form stays primary */}
      {isLogin && (
        <div className="mb-5">
          <p className="mb-2 text-center text-[11px] font-medium text-muted-foreground">Xem thử nhanh với vai trò</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDemoLogin("synthetic.student.b@aurora.local", "student")}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border/70 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted transition-all text-xs font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mint)]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Học sinh
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDemoLogin("synthetic.teacher@aurora.local", "teacher")}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border/70 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted transition-all text-xs font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--purple)]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2zm12-5a2 2 0 11-4 0 2 2 0 014 0zM9 20h12" />
              </svg>
              Giáo viên
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDemoLogin("admin@aurora.edu.vn", "admin")}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border/70 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted transition-all text-xs font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Admin
            </button>
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-medium text-muted-foreground">hoặc đăng nhập bằng email</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>
      )}

      {error && (
        <div role="alert" aria-live="polite" className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div role="status" aria-live="polite" className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
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
              autoFocus
              autoComplete="name"
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
            autoFocus={isLogin}
            autoComplete="email"
            placeholder="hocsinh@gmail.com"
            className="mt-1 w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:border-[var(--mint)] focus:outline-none focus:ring-1 focus:ring-[var(--mint)]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Mật khẩu</label>
            {isLogin && (
              <button
                type="button"
                onClick={() => toast.info("Tính năng đặt lại mật khẩu đang được phát triển.")}
                className="text-[11px] font-medium text-[var(--purple)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--purple)] rounded"
              >
                Quên mật khẩu?
              </button>
            )}
          </div>
          <div className="relative mt-1">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="••••••••"
              className="w-full rounded-xl border border-input bg-card px-4 py-2.5 pr-11 text-sm text-foreground placeholder-muted-foreground focus:border-[var(--mint)] focus:outline-none focus:ring-1 focus:ring-[var(--mint)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mint)] rounded"
            >
              {showPassword ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>
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
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-foreground hover:opacity-90 text-background py-3 text-sm font-semibold shadow-[var(--shadow-card)] transition-all active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mint)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {loading && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
          )}
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
              disabled={loading}
              className="font-medium text-[var(--mint)] hover:underline disabled:opacity-50"
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
              className="font-medium text-[var(--mint)] hover:underline disabled:opacity-50"
              disabled={loading}
            >
              Đăng nhập
            </button>
          </p>
        )}
      </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 font-[var(--font-body)] overflow-hidden">
      {/* Subtle background glows */}
      <div className="absolute top-1/4 left-1/4 h-80 w-80 rounded-full bg-[var(--mint)]/20 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-[var(--purple)]/20 blur-[100px] pointer-events-none" />

      <Suspense fallback={<div className="text-muted-foreground text-sm">Đang tải...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
