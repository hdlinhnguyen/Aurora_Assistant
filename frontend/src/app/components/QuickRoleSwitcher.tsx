"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { GraduationCap, Users, Compass, RefreshCw, Sparkles } from "lucide-react";

export default function QuickRoleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();

  const [currentRole, setCurrentRole] = useState<"student" | "teacher" | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [loading, setLoading] = useState(false);

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
    <div
      data-tour="role-switcher"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 p-1.5 shadow-sm backdrop-blur-md text-foreground text-xs"
    >
      {/* Current Role Indicator */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted font-semibold text-muted-foreground">
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

      {/* Switch Button */}
      <button
        onClick={() => handleRoleSwitch(currentRole === "teacher" ? "student" : "teacher")}
        disabled={loading}
        title="Chuyển đổi 1-click giữa tài khoản Học sinh & Giáo viên"
        className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-foreground text-background font-bold hover:opacity-90 transition-all active:scale-[0.96] disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        <span>
          Đổi sang {currentRole === "teacher" ? "Học sinh" : "Giáo viên"}
        </span>
      </button>

      {/* Tour Trigger Button */}
      <button
        onClick={handleStartTour}
        className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--mint)]/15 text-[var(--mint)] hover:bg-[var(--mint)]/25 font-bold transition-all border border-[var(--mint)]/30"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>Tour Hướng Dẫn</span>
      </button>
    </div>
  );
}
