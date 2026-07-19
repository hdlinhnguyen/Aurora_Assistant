"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });
import {
  Home,
  BookOpen,
  LogOut,
  GraduationCap,
  Sparkles,
  Gauge,
  UserCog
} from "lucide-react";
import { toast } from "sonner";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [adminName, setAdminName] = useState("");
  const [loading, setLoading] = useState(true);

  // Lottie Book animation state
  const [bookAnimation, setBookAnimation] = useState<any>(null);

  useEffect(() => {
    fetch("/book.json")
      .then((res) => res.json())
      .then((data) => setBookAnimation(data))
      .catch((err) => console.error("Error loading book animation:", err));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("aurora_token");
    const userStr = localStorage.getItem("aurora_user");
    if (!token || !userStr) {
      router.push("/login");
      return;
    }

    try {
      const user = JSON.parse(userStr);
      if (user.role !== "admin") {
        toast.error("Bạn không có quyền truy cập trang quản trị");
        router.push(user.role === "teacher" ? "/teacher" : "/tutor");
        return;
      }
      setAdminName(user.name || "Quản trị viên");
      setLoading(false);
    } catch {
      localStorage.clear();
      router.push("/login");
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.clear();
    toast.success("Đăng xuất thành công");
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center flex flex-col items-center justify-center">
          {bookAnimation ? (
            <Lottie
              animationData={bookAnimation}
              loop={true}
              autoplay={true}
              className="h-24 w-24 mx-auto"
            />
          ) : (
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--purple)] border-t-transparent mx-auto"></div>
          )}
          <p className="mt-2 text-sm text-muted-foreground">Đang xác thực quyền Admin...</p>
        </div>
      </div>
    );
  }

  const menuItems = [
    { label: "Tổng quan", href: "/admin", icon: Home },
    { label: "Quản lý Giáo viên", href: "/admin/teachers", icon: GraduationCap },
    { label: "Quản lý Lớp học", href: "/admin/classrooms", icon: BookOpen },
    { label: "Người dùng & Chẩn đoán", href: "/admin/users", icon: UserCog },
    { label: "Giám sát Hệ thống", href: "/admin/monitoring", icon: Gauge },
  ];

  return (
    <div className="flex h-screen min-h-screen bg-background text-foreground font-[var(--font-body)]">
      {/* Sidebar */}
      <aside className="h-screen w-64 border-r border-border bg-card flex flex-col justify-between shrink-0">
        <div>
          {/* Logo / Header */}
          <div className="p-6 border-b border-border flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-[var(--purple)]" />
            <span className="font-[var(--font-display)] font-extrabold text-xl bg-gradient-to-r from-[var(--mint)] to-[var(--purple)] bg-clip-text text-transparent">
              Aurora Admin
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all hover:bg-accent/60 ${
                    isActive 
                      ? "bg-gradient-to-r from-[var(--purple)]/10 to-[var(--mint)]/10 border-l-4 border-[var(--purple)] text-[var(--purple)]" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? "text-[var(--purple)]" : ""}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer info & logout */}
        <div className="p-4 border-t border-border">
          <div className="mb-4 px-4">
            <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Tài khoản</p>
            <p className="text-sm font-bold truncate mt-0.5">{adminName}</p>
            <span className="inline-block text-[9px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 font-extrabold px-2 py-0.5 rounded-full mt-1">
              SUPER ADMIN
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-destructive hover:bg-destructive/10 transition-all"
          >
            <LogOut className="h-5 w-5" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="min-h-0 flex-1 overflow-y-auto p-8 relative">
        {/* Decorative ambient glows */}
        <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-[var(--purple)]/5 blur-[120px] pointer-events-none -z-10" />
        <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-[var(--mint)]/5 blur-[120px] pointer-events-none -z-10" />
        {children}
      </main>
    </div>
  );
}
