"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  Compass,
  GraduationCap,
  Users,
  Layers
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

export interface TourStep {
  id: string;
  title: string;
  roleBadge: "student" | "teacher" | "all";
  badgeText: string;
  content: string;
  targetSelector?: string;
  targetPage?: string;
  actionText?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Chào mừng đến với Aurora Assistant!",
    roleBadge: "all",
    badgeText: "Chọn Hướng Đi",
    content:
      "Aurora Assistant hỗ trợ học tập khép kín từ hai phía. Vui lòng lựa chọn nội dung bạn muốn trải nghiệm dưới đây để chúng tôi dẫn đường tối ưu nhất cho bạn:",
    actionText: "Bắt đầu Tour"
  },
  {
    id: "lesson-selector",
    title: "1. Chọn Bài Học",
    roleBadge: "student",
    badgeText: "Góc Học Sinh",
    targetPage: "/tutor",
    targetSelector: '[data-tour="lesson-selector"]',
    content:
      "Chọn một bài trong lộ trình bên trái để bắt đầu. Trạng thái từng bài cho biết nội dung đang học, đã hoàn thành hoặc còn khóa."
  },
  {
    id: "lesson-theory",
    title: "2. Học Lý Thuyết",
    roleBadge: "student",
    badgeText: "Góc Học Sinh",
    targetPage: "/tutor",
    targetSelector: '[data-tour="lesson-theory"]',
    content:
      "Đọc ý tưởng chính và ví dụ của bài đang chọn. Khi đã hiểu, em có thể chuyển ngay sang luyện tập hoặc hỏi AI về phần còn vướng."
  },
  {
    id: "lesson-practice",
    title: "3. Luyện Tập Thích Ứng",
    roleBadge: "student",
    badgeText: "Góc Học Sinh",
    targetPage: "/tutor",
    targetSelector: '[data-tour="lesson-practice"]',
    content:
      "Trả lời câu hỏi theo mức độ phù hợp với năng lực hiện tại. Kết quả được dùng để cập nhật tiến độ và điều chỉnh độ khó của các câu tiếp theo."
  },
  {
    id: "lesson-chat",
    title: "4. Hỏi Đáp Với AI",
    roleBadge: "student",
    badgeText: "Góc Học Sinh",
    targetPage: "/tutor",
    targetSelector: '[data-tour="lesson-chat"]',
    content:
      "Khi chưa hiểu, hãy hỏi Nova. AI sẽ đặt câu hỏi gợi mở và chia nhỏ vấn đề để em tự tìm ra đáp án thay vì đưa lời giải sẵn."
  },
  {
    id: "lesson-exams",
    title: "5. Đề Thi & Kiểm Tra",
    roleBadge: "student",
    badgeText: "Góc Học Sinh",
    targetPage: "/tutor",
    targetSelector: '[data-tour="lesson-exams"]',
    content:
      "Xem các bài kiểm tra được giao, nhập mã đề nếu có và theo dõi kết quả sau khi hoàn thành. Đây là bước giúp đánh giá mức độ nắm vững kiến thức."
  },
  {
    id: "teacher-student-mgmt",
    title: "1. Quản Lý Lớp & Học Sinh",
    roleBadge: "teacher",
    badgeText: "Góc Giáo Viên",
    targetPage: "/teacher",
    targetSelector: '[data-tour="teacher-tab-student-mgmt"]',
    content:
      "Tạo lớp, thêm học sinh, nhập danh sách và quản lý tài khoản học tập. Đây là nơi chuẩn bị dữ liệu lớp trước khi bắt đầu giảng dạy."
  },
  {
    id: "teacher-graph-designer",
    title: "2. Thiết Kế Cây Kiến Thức",
    roleBadge: "teacher",
    badgeText: "Góc Giáo Viên",
    targetPage: "/teacher",
    targetSelector: '[data-tour="teacher-tab-graph-designer"]',
    content:
      "Xây dựng các chủ đề, quan hệ tiên quyết và nội dung lý thuyết. Có thể dựng cây từ tài liệu, chỉnh sửa trên canvas hoặc xem dạng bảng."
  },
  {
    id: "teacher-question-bank",
    title: "3. Ngân Hàng Câu Hỏi",
    roleBadge: "teacher",
    badgeText: "Góc Giáo Viên",
    targetPage: "/teacher",
    targetSelector: '[data-tour="teacher-tab-question-bank"]',
    content:
      "Quản lý câu hỏi theo chủ đề và độ khó, nhập nhanh từ Excel, chỉnh sửa barem và gắn nhãn kiến thức cho từng câu."
  },
  {
    id: "teacher-exam-builder",
    title: "4. Tạo Đề Kiểm Tra",
    roleBadge: "teacher",
    badgeText: "Góc Giáo Viên",
    targetPage: "/teacher",
    targetSelector: '[data-tour="teacher-tab-exam-builder"]',
    content:
      "Tạo đề nháp, chọn câu từ ngân hàng hoặc soạn thủ công, cân đối điểm, sắp xếp câu hỏi và chuẩn bị đề để giao cho học sinh."
  },
  {
    id: "teacher-students",
    title: "6. Báo Cáo Tiến Độ Học Tập",
    roleBadge: "teacher",
    badgeText: "Góc Giáo Viên",
    targetPage: "/teacher",
    targetSelector: '[data-tour="teacher-tab-students"]',
    content:
      "Theo dõi kết quả từng học sinh, mức độ chính xác, chủ đề còn yếu và mở hồ sơ chi tiết để xem hành trình học tập."
  },
  {
    id: "teacher-learning-path",
    title: "7. Lập Lộ Trình Cá Nhân",
    roleBadge: "teacher",
    badgeText: "Góc Giáo Viên",
    targetPage: "/teacher",
    targetSelector: '[data-tour="teacher-tab-learning-path"]',
    content:
      "Phân tích lỗ hổng gốc rễ, tạo lộ trình phụ đạo theo học sinh, điều chỉnh thứ tự bước và phê duyệt lộ trình đề xuất."
  },
  {
    id: "teacher-monitoring",
    title: "8. Giám Sát Lớp Học",
    roleBadge: "teacher",
    badgeText: "Góc Giáo Viên",
    targetPage: "/teacher",
    targetSelector: '[data-tour="teacher-tab-monitoring"]',
    content:
      "Quan sát phân bố năng lực, nhóm học sinh cần can thiệp và kích hoạt hành động phụ đạo từ dữ liệu lớp học hiện tại."
  },
  {
    id: "teacher-guardrail",
    title: "9. An Toàn Học Sinh",
    roleBadge: "teacher",
    badgeText: "Góc Giáo Viên",
    targetPage: "/teacher",
    targetSelector: '[data-tour="teacher-tab-guardrail"]',
    content:
      "Theo dõi các cảnh báo an toàn trong hội thoại, phân loại mức độ nghiêm trọng và đánh dấu sự kiện đã được xử lý."
  },
  {
    id: "finish",
    title: "Bạn Đã Sẵn Sàng!",
    roleBadge: "all",
    badgeText: "Hoàn Thành Hướng Dẫn",
    content:
      "Tuyệt vời! Bạn đã nắm rõ cách sử dụng hệ thống. Bạn có thể tự do trải nghiệm hoặc bấm nút 'Tour Hướng Dẫn' trên Header bất cứ lúc nào.",
    actionText: "Khám phá ngay"
  }
];

export default function GuidedTour() {
  const router = useRouter();
  const pathname = usePathname();

  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tourMode, setTourMode] = useState<"student" | "teacher" | "both">("both");
  const [isMobile, setIsMobile] = useState(false);

  // Filter steps based on current selected role mode
  const activeSteps = TOUR_STEPS.filter((step, idx) => {
    // Welcome and finish are always shown
    if (idx === 0 || idx === TOUR_STEPS.length - 1) return true;
    if (tourMode === "student") {
      return step.roleBadge === "student" || step.roleBadge === "all";
    }
    if (tourMode === "teacher") {
      return step.roleBadge === "teacher" || step.roleBadge === "all";
    }
    return true; // "both"
  });

  const currentStep = activeSteps[stepIndex];

  // Handle screen resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Initialize tour check on load
  useEffect(() => {
    const isTourActive = localStorage.getItem("aurora_tour_active") === "true";
    const savedStep = localStorage.getItem("aurora_tour_step");
    const savedMode = localStorage.getItem("aurora_tour_mode") as "student" | "teacher" | "both";
    
    if (savedMode) {
      setTourMode(savedMode);
    }
    if (isTourActive) {
      setIsActive(true);
      if (savedStep) {
        setStepIndex(parseInt(savedStep, 10) || 0);
      }
    }
  }, []);

  // Listen to custom event to trigger tour from anywhere
  useEffect(() => {
    const handleStartTour = (e: Event) => {
      const customEvent = e as CustomEvent<{ step?: number; mode?: "student" | "teacher" | "both" }>;
      setIsActive(true);
      const startIndex = customEvent.detail?.step ?? 0;
      const startMode = customEvent.detail?.mode ?? "both";
      
      setStepIndex(startIndex);
      setTourMode(startMode);
      localStorage.setItem("aurora_tour_active", "true");
      localStorage.setItem("aurora_tour_step", startIndex.toString());
      localStorage.setItem("aurora_tour_mode", startMode);
    };

    window.addEventListener("start-aurora-tour", handleStartTour);
    return () => {
      window.removeEventListener("start-aurora-tour", handleStartTour);
    };
  }, []);

  // Update target rect when step or page changes
  const updateTargetRect = useCallback(() => {
    if (!isActive || !currentStep?.targetSelector) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(currentStep.targetSelector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [isActive, currentStep]);

  useEffect(() => {
    updateTargetRect();
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect);
    const interval = setInterval(updateTargetRect, 300);

    return () => {
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect);
      clearInterval(interval);
    };
  }, [updateTargetRect]);

  useEffect(() => {
    if (!isActive || !currentStep) return;
    const studentTabs: Record<string, "graph" | "theory" | "practice" | "chat" | "exams"> = {
      "lesson-selector": "graph",
      "lesson-theory": "theory",
      "lesson-practice": "practice",
      "lesson-chat": "chat",
      "lesson-exams": "exams",
    };
    const tab = studentTabs[currentStep.id];
    if (tab) {
      window.dispatchEvent(new CustomEvent("aurora-tour-switch-student-tab", { detail: tab }));
    }

    const teacherTabs: Record<string, string> = {
      "teacher-student-mgmt": "student-mgmt",
      "teacher-graph-designer": "graph-designer",
      "teacher-question-bank": "question-bank",
      "teacher-exam-builder": "exam-builder",
      "teacher-students": "students",
      "teacher-learning-path": "learning-path",
      "teacher-monitoring": "monitoring",
      "teacher-guardrail": "guardrail",
    };
    const teacherTab = teacherTabs[currentStep.id];
    if (teacherTab) {
      window.dispatchEvent(new CustomEvent("aurora-tour-switch-tab", { detail: teacherTab }));
    }

    const target = currentStep.targetSelector
      ? document.querySelector(currentStep.targetSelector)
      : null;
    target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [isActive, currentStep]);

  const clearDemoTourSession = () => {
    localStorage.removeItem("aurora_token");
    localStorage.removeItem("aurora_user");
    localStorage.removeItem("aurora_tour_active");
    localStorage.removeItem("aurora_tour_step");
    localStorage.removeItem("aurora_tour_mode");
    localStorage.removeItem("aurora_tour_demo_session");
    localStorage.removeItem("aurora_tour_completed");
  };

  const completeTour = () => {
    setIsActive(false);

    if (localStorage.getItem("aurora_tour_demo_session") === "true") {
      clearDemoTourSession();
      router.replace("/");
      return;
    }

    localStorage.removeItem("aurora_tour_active");
    localStorage.setItem("aurora_tour_completed", "true");
    window.location.reload();
  };

  const requestExitTour = () => {
    if (localStorage.getItem("aurora_tour_demo_session") === "true") {
      const confirmed = window.confirm(
        "Hướng dẫn chưa hoàn tất. Nếu thoát, phiên demo sẽ kết thúc và bạn sẽ được đăng xuất.",
      );
      if (!confirmed) return;

      setIsActive(false);
      clearDemoTourSession();
      router.replace("/");
      return;
    }

    setIsActive(false);
    localStorage.removeItem("aurora_tour_active");
    localStorage.setItem("aurora_tour_completed", "true");
    window.location.reload();
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;
      if (e.key === "Escape") {
        requestExitTour();
      } else if (e.key === "ArrowRight") {
        nextStep();
      } else if (e.key === "ArrowLeft") {
        prevStep();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, stepIndex, activeSteps]);

  const goToStep = async (index: number) => {
    if (index < 0 || index >= activeSteps.length) return;
    const targetStep = activeSteps[index];
    setStepIndex(index);
    localStorage.setItem("aurora_tour_step", index.toString());

    // Auto-switch role if needed before redirecting to avoid Next.js routing checks block
    const userStr = localStorage.getItem("aurora_user");
    let currentRole = "";
    if (userStr) {
      try {
        currentRole = JSON.parse(userStr).role;
      } catch (e) {}
    }

    const needsTeacher = targetStep.roleBadge === "teacher" || targetStep.targetPage === "/teacher";
    const needsStudent = targetStep.roleBadge === "student" || targetStep.targetPage === "/tutor";

    if (needsTeacher && currentRole !== "teacher") {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "synthetic.teacher@aurora.local", password: "demo123" }),
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem("aurora_token", data.token);
          localStorage.setItem("aurora_user", JSON.stringify(data.user));
        }
      } catch (e) {
        console.error("Auto switch to teacher failed:", e);
      }
    } else if (needsStudent && currentRole !== "student") {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "synthetic.student.b@aurora.local", password: "demo123" }),
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem("aurora_token", data.token);
          localStorage.setItem("aurora_user", JSON.stringify(data.user));
        }
      } catch (e) {
        console.error("Auto switch to student failed:", e);
      }
    }

    // Check if step requires a specific page
    if (targetStep.targetPage && pathname !== targetStep.targetPage) {
      router.push(targetStep.targetPage);
    }
  };

  const nextStep = () => {
    if (stepIndex < activeSteps.length - 1) {
      goToStep(stepIndex + 1);
    } else {
      completeTour();
    }
  };

  const prevStep = () => {
    if (stepIndex > 0) {
      goToStep(stepIndex - 1);
    }
  };

  const selectMode = (mode: "student" | "teacher" | "both") => {
    setTourMode(mode);
    localStorage.setItem("aurora_tour_mode", mode);
    setStepIndex(1);
    localStorage.setItem("aurora_tour_step", "1");
    
    const firstRealStep = TOUR_STEPS.find(s => {
      if (mode === "student") return s.roleBadge === "student";
      if (mode === "teacher") return s.roleBadge === "teacher";
      return s.id === "socratic-chat";
    });

    if (firstRealStep && firstRealStep.targetPage && pathname !== firstRealStep.targetPage) {
      router.push(firstRealStep.targetPage);
    }
  };

  if (!isActive || !currentStep) return null;

  const isModalStep = stepIndex === 0 || stepIndex === activeSteps.length - 1 || !currentStep.targetSelector || !targetRect;

  // Floating Position styling
  let cardStyle: React.CSSProperties = {};
  let cardClass = "";

  if (isModalStep || isMobile) {
    // Fixed Center Modal
    cardClass = "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg px-4 z-[10001]";
  } else if (targetRect) {
    // Float to the left or right of target element to avoid covering it
    const cardWidth = 420;
    const cardHeight = 240; // Approximate card height
    const gap = 24;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let top = targetRect.top + targetRect.height / 2 - cardHeight / 2;
    let left = 0;

    // Decide side placement based on target's center X coordinate
    const targetMidX = targetRect.left + targetRect.width / 2;
    if (targetMidX > viewportWidth / 2) {
      // Spotlight is on the right -> place card to the left
      left = targetRect.left - cardWidth - gap;
    } else {
      // Spotlight is on the left -> place card to the right
      left = targetRect.right + gap;
    }

    // Keep within vertical viewport bounds
    if (top < 16) top = 16;
    if (top + cardHeight > viewportHeight - 16) {
      top = viewportHeight - cardHeight - 16;
    }

    // Keep within horizontal viewport bounds
    if (left < 16) {
      left = 16;
    } else if (left + cardWidth > viewportWidth - 16) {
      left = viewportWidth - cardWidth - 16;
    }

    cardStyle = {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: `${cardWidth}px`,
    };
    cardClass = "z-[10001] transition-all duration-300";
  }

  return (
    <div className="relative z-[9999]">
      {/* Dimmed Background Overlay */}
      <div
        className="fixed inset-0 bg-black/25 backdrop-blur-[0.5px] transition-all duration-300 pointer-events-auto"
        onClick={requestExitTour}
      />

      {/* Spotlight highlight box around target element */}
      {targetRect && (
        <div
          data-tour-spotlight
          style={{
            top: `${targetRect.top - 6}px`,
            left: `${targetRect.left - 6}px`,
            width: `${targetRect.width + 12}px`,
            height: `${targetRect.height + 12}px`
          }}
          className="fixed z-[10000] rounded-2xl pointer-events-none transition-all duration-300 ring-4 ring-[var(--mint)] ring-offset-2 ring-offset-background shadow-[0_0_30px_rgba(45,212,191,0.5)] bg-transparent animate-pulse"
        />
      )}

      {/* Floating Tour Dialog Card */}
      <div className={cardClass} style={cardStyle}>
        <div className="rounded-3xl border border-border bg-card/95 p-6 md:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.3)] backdrop-blur-xl space-y-5 text-foreground relative overflow-hidden">
          {/* Decorative top gradient line */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[var(--mint)] via-indigo-500 to-[var(--purple)]" />

          {/* Header row with badge, title and close */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[var(--mint)]/15 text-[var(--mint)] border border-[var(--mint)]/30">
                  <Sparkles className="h-3.5 w-3.5" />
                  {currentStep.badgeText}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  Bước {stepIndex + 1} / {activeSteps.length}
                </span>
              </div>
              <h3 className="text-xl font-[var(--font-display)] font-extrabold tracking-tight text-foreground">
                {currentStep.title}
              </h3>
            </div>
            <button
              onClick={requestExitTour}
              title="Thoát Tour (Esc)"
              className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body Content */}
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
            {currentStep.content}
          </p>

          {/* Welcome step choices */}
          {stepIndex === 0 && (
            <div className="grid grid-cols-1 gap-2 pt-2">
              <button
                onClick={() => selectMode("student")}
                className="w-full flex items-center justify-between p-4 rounded-2xl border border-border bg-muted/30 hover:bg-[var(--mint)]/10 hover:border-[var(--mint)]/40 transition-all text-left font-bold group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-[var(--mint)]/20 text-[var(--mint)]">
                    <GraduationCap size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm text-foreground">1. Tour Học Sinh</h4>
                    <p className="text-xs text-muted-foreground font-normal">Xem Socratic Chat & Luyện Tập Thích Ứng</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={() => selectMode("teacher")}
                className="w-full flex items-center justify-between p-4 rounded-2xl border border-border bg-muted/30 hover:bg-[var(--purple)]/10 hover:border-[var(--purple)]/40 transition-all text-left font-bold group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-[var(--purple)]/20 text-[var(--purple)]">
                    <Users size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm text-foreground">2. Tour Giáo Viên</h4>
                    <p className="text-xs text-muted-foreground font-normal">Xem biểu đồ Lỗ Hổng & Sơ đồ Tư duy lớp</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={() => selectMode("both")}
                className="w-full flex items-center justify-between p-4 rounded-2xl border border-border bg-muted/30 hover:bg-indigo-500/10 hover:border-indigo-500/40 transition-all text-left font-bold group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-500">
                    <Layers size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm text-foreground">3. Xem Toàn Bộ Luồng</h4>
                    <p className="text-xs text-muted-foreground font-normal">Khám phá cả 2 vai trò Student & Teacher</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          )}

          {/* Page Auto-Switch Hint */}
          {currentStep.targetPage && pathname !== currentStep.targetPage && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-300 font-medium animate-pulse">
              <Compass className="h-4 w-4 shrink-0 animate-spin" />
              <span>
                Bước này áp dụng ở trang <strong>{currentStep.badgeText}</strong>. Sẽ tự động chuyển hướng.
              </span>
            </div>
          )}

          {/* Footer controls */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            {/* Progress indicators */}
            <div className="flex items-center gap-1.5">
              {activeSteps.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => goToStep(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === stepIndex
                      ? "w-6 bg-[var(--mint)]"
                      : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  }`}
                />
              ))}
            </div>

            {/* Buttons */}
            {stepIndex !== 0 && (
              <div className="flex items-center gap-2">
                {stepIndex > 0 && (
                  <button
                    onClick={prevStep}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Trước
                  </button>
                )}

                <button
                  onClick={nextStep}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--mint)] to-emerald-500 hover:brightness-105 text-foreground font-bold text-xs shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>
                    {currentStep.actionText ||
                      (stepIndex === activeSteps.length - 1 ? "Hoàn thành" : "Tiếp theo")}
                  </span>
                  {stepIndex < activeSteps.length - 1 && <ChevronRight className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

