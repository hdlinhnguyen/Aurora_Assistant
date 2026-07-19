"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { GraduationCap, Users, RefreshCw, Sparkles, MoreVertical } from "lucide-react";

export default function QuickRoleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();

  const [currentRole, setCurrentRole] = useState<"student" | "teacher" | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (isOpen && !(e.target as Element).closest(".quick-role-switcher-dropdown")) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    const userStr = localStorage.getItem("aurora_user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setCurrentRole(user.role);
        setUserName(user.name || (user.role === "teacher" ? "Giáo viên Demo" : "Học sinh Demo"));
      } catch (e) {
        // invalid JSON
      }
    }
  }, [pathname]);

  const handleRoleSwitch = async (targetRole: "student" | "teacher") => {
    if (loading) return;
    setLoading(true);

    const targetEmail = targetRole === "teacher" ? "teacher@aurora.edu.vn" : "student@aurora.edu.vn";

    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: targetEmail, password: "demo123" }),
        requireAuth: false,
      });

      localStorage.setItem("aurora_token", data.token);
      localStorage.setItem("aurora_user", JSON.stringify(data.user));

      setCurrentRole(data.user.role);
      setUserName(data.user.name);

      toast.success(`Đã chuyển sang vai trò ${targetRole === "teacher" ? "Giáo viên" : "Học sinh"}!`);

      if (targetRole === "teacher") {
        router.push("/teacher");
      } else {
        router.push("/tutor");
      }
    } catch (err: any) {
      toast.error(err.message || "Không thể chuyển đổi tài khoản demo.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartTour = () => {
    window.dispatchEvent(new CustomEvent("start-aurora-tour", { detail: { step: 0 } }));
  };

  return (
    <div data-tour="role-switcher" className="relative inline-block text-left quick-role-switcher-dropdown z-50">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Menu Tùy Chọn Demo"
        className="h-9 w-9 rounded-full border border-border bg-card/85 text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm backdrop-blur-md flex items-center justify-center transition-all cursor-pointer"
      >
        <MoreVertical size={16} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-border bg-card p-2 shadow-xl backdrop-blur-md animate-[scaleUp_0.15s_ease-out] flex flex-col gap-1 z-50">
          {/* Current Role Indicator */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/65 text-muted-foreground font-semibold text-xs select-none">
            {currentRole === "teacher" ? (
              <>
                <Users className="h-3.5 w-3.5 text-[var(--purple)]" />
                <span>Góc Giáo viên</span>
              </>
            ) : (
              <>
                <GraduationCap className="h-3.5 w-3.5 text-[var(--mint)]" />
                <span>Góc Học sinh</span>
              </>
            )}
          </div>

          <div className="border-b border-border my-1" />

          {/* Switch Button */}
          <button
            onClick={() => {
              handleRoleSwitch(currentRole === "teacher" ? "student" : "teacher");
              setIsOpen(false);
            }}
            disabled={loading}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-muted text-foreground font-bold text-xs active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`} />
            <span>
              Đổi sang {currentRole === "teacher" ? "Học sinh" : "Giáo viên"}
            </span>
          </button>

          {/* Tour Trigger Button */}
          <button
            onClick={() => {
              handleStartTour();
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-[var(--mint)]/10 text-[var(--mint)] font-bold text-xs active:scale-[0.98] transition-all cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Tour Hướng Dẫn</span>
          </button>
        </div>
      )}
    </div>
  );
}
