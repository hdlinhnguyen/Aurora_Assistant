"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { API_BASE_URL } from "@/lib/api";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import Image from "next/image";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

// Claude-inspired design tokens (warm cream + terracotta palette)
const CL = {
  bg: "oklch(0.968 0.012 75)",
  fg: "oklch(0.175 0.015 60)",
  accent: "oklch(0.62 0.13 38)",
  accentHover: "oklch(0.56 0.14 38)",
  accentTint: "oklch(0.945 0.034 42)",
  accentTintBorder: "oklch(0.87 0.06 42)",
  mutedBg: "oklch(0.935 0.014 75)",
  mutedFg: "oklch(0.5 0.015 60)",
  border: "oklch(0.875 0.014 75)",
  card: "oklch(1 0 0)",
  cardBorder: "oklch(0.88 0.014 75)",
};

export default function LandingPage() {
  const router = useRouter();

  const [animationData, setAnimationData] = useState<any>(null);
  useEffect(() => {
    fetch("/education.json")
      .then((r) => r.json())
      .then(setAnimationData)
      .catch((e) => console.error("Error loading animation:", e));
  }, []);

  const [tourLoading, setTourLoading] = useState(false);
  const [mockStep, setMockStep] = useState(0);

  const mockMessages = [
    { sender: "ai",      content: "Chào Bi! Thầy có câu đố nhé: 1/2 cái bánh cộng với 1/3 cái bánh thì bằng bao nhiêu cái bánh nhỉ?" },
    { sender: "student", content: "Dạ bằng 2/5 đúng không ạ?" },
    { sender: "ai",      content: "Ồ! Bi thử nghĩ xem, nếu ta cắt 1 cái bánh làm 2 phần, và 1 cái bánh làm 3 phần. Khi cộng lại ta có cộng trực tiếp các mẫu số được không? Hay ta cần đưa chúng về 'cùng kích cỡ' nhỉ?" },
    { sender: "student", content: "À! Phải quy đồng mẫu số chung là 6 ạ!" },
    { sender: "ai",      content: "Chính xác luôn! Giỏi quá. Vậy 1/2 quy đồng thành bao nhiêu phần 6, và 1/3 quy đồng thành bao nhiêu phần 6 nào?" },
    { sender: "student", content: "Dạ 1/2 là 3/6, còn 1/3 là 2/6 ạ." },
    { sender: "ai",      content: "Chuẩn luôn! Vậy giờ Bi cộng 3/6 và 2/6 lại thì kết quả là bao nhiêu phần 6 nào?" },
    { sender: "student", content: "Dạ là 5/6 cái bánh ạ!" },
    { sender: "ai",      content: "Rất xuất sắc! Bi đã tự mình giải quyết xong bài toán rồi đó. Bài học rút ra: luôn phải đưa về cùng mẫu số trước khi cộng nhé!" },
  ];

  return (
    <div
      className="min-h-screen overflow-x-hidden relative font-[var(--font-body)]"
      style={{ background: CL.bg, color: CL.fg }}
    >
      {/* Subtle warm gradient wash */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `radial-gradient(900px 600px at 0% 0%, oklch(0.93 0.05 42 / 0.35), transparent 55%),
                       radial-gradient(700px 500px at 100% 80%, oklch(0.92 0.03 70 / 0.4), transparent 55%)`,
        }}
      />

      {/* Navigation Header */}
      <nav className="relative z-10 max-w-6xl mx-auto px-6 py-5 flex justify-between items-center border-b border-border bg-card/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--mint)] to-[var(--purple)] shadow-[var(--shadow-card)] hover:-translate-y-1 hover:shadow-lg hover:shadow-[var(--purple)]/30 transition-all duration-300 cursor-pointer">
            <Image
              src="/icon.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-lg object-contain"
              aria-hidden="true"
            />
          </div>
          <span
            className="text-lg font-[var(--font-display)] font-extrabold tracking-tight"
            style={{ color: CL.fg }}
          >
            Aurora Assistant
          </span>
        </div>

        <div className="flex items-center gap-5">
          <button
            onClick={() => router.push("/login?role=teacher")}
            className="text-sm font-medium transition-colors focus-visible:outline-none rounded"
            style={{ color: CL.mutedFg }}
            onMouseEnter={(e) => (e.currentTarget.style.color = CL.fg)}
            onMouseLeave={(e) => (e.currentTarget.style.color = CL.mutedFg)}
          >
            Dành cho Giáo viên
          </button>
          <button
            onClick={() => router.push("/login")}
            className="text-sm font-semibold px-4 py-2 rounded-lg transition-all focus-visible:outline-none"
            style={{ background: CL.accent, color: "#fff" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = CL.accentHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = CL.accent)}
          >
            Đăng Nhập
          </button>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <header className="relative z-10 max-w-6xl mx-auto px-6 pt-20 pb-24 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        {/* Left */}
        <div className="space-y-7">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide"
            style={{
              background: CL.accentTint,
              color: CL.accent,
              border: `1px solid ${CL.accentTintBorder}`,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: CL.accent }}
            />
            Học thật · Hiểu thật · Tư duy thật
          </div>

          {/* Heading */}
          <h1
            className="text-4xl sm:text-5xl lg:text-[3.25rem] font-[var(--font-display)] font-extrabold leading-[1.08] tracking-tight"
            style={{ color: CL.fg }}
          >
            Gia sư phản biện,
            <br />
            <span style={{ color: CL.accent }}>tự học tư duy</span>
          </h1>

          {/* Sub */}
          <p className="text-base leading-relaxed max-w-md" style={{ color: CL.mutedFg }}>
            Hệ thống AI không cho sẵn lời giải. Thay vào đó, AI đóng vai người bạn thông thái —
            đặt câu hỏi gợi mở từng bước để học sinh tự tư duy và khám phá đáp án.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => router.push("/login?role=student")}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all focus-visible:outline-none"
              style={{ background: CL.accent, color: "#fff" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = CL.accentHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = CL.accent)}
            >
              Bắt đầu Học ngay
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
            <button
              disabled={tourLoading}
              onClick={async () => {
                setTourLoading(true);
                try {
                  const res = await fetch(`${API_BASE_URL}/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: "student@aurora.edu.vn", password: "demo123" }),
                  });
                  if (!res.ok) throw new Error("Demo login failed");
                  const data = await res.json();
                  localStorage.setItem("aurora_token", data.token);
                  localStorage.setItem("aurora_user", JSON.stringify(data.user));
                  localStorage.setItem("aurora_tour_active", "true");
                  localStorage.setItem("aurora_tour_step", "0");
                  router.push("/tutor");
                } catch {
                  toast.error("Không khởi động được tour demo, vui lòng thử lại.");
                  setTourLoading(false);
                }
              }}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none"
              style={{
                border: `1.5px solid ${CL.border}`,
                background: CL.card,
                color: CL.fg,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = CL.mutedBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = CL.card)}
            >
              {tourLoading ? (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: `${CL.accent} transparent ${CL.accent} ${CL.accent}` }}
                />
              ) : (
                <>Tour Hướng Dẫn (2 phút)</>
              )}
            </button>
          </div>

          {/* Trust indicators */}
          <div className="flex items-center gap-6 pt-2">
            {[
              { num: "10K+", label: "học sinh" },
              { num: "95%", label: "hài lòng" },
              { num: "GDPT 2018", label: "chương trình" },
            ].map(({ num, label }) => (
              <div key={label}>
                <div className="text-base font-bold" style={{ color: CL.fg }}>{num}</div>
                <div className="text-xs" style={{ color: CL.mutedFg }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Lottie */}
        <div className="flex justify-center items-center">
          <div
            className="relative w-full max-w-[440px] aspect-square rounded-3xl flex items-center justify-center p-6"
            style={{
              background: CL.accentTint,
              border: `1px solid ${CL.accentTintBorder}`,
            }}
          >
            {animationData ? (
              <Lottie animationData={animationData} loop autoplay className="w-full h-full" />
            ) : (
              <div className="flex items-center justify-center">
                <div
                  className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
                  style={{ borderColor: `${CL.accent} transparent ${CL.accent} ${CL.accent}` }}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Socratic Demo ─────────────────────────────────────────── */}
      <section
        className="relative z-10 max-w-6xl mx-auto px-6 py-20"
        style={{ borderTop: `1px solid ${CL.border}` }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 items-center">
          {/* Left: explanation */}
          <div className="lg:col-span-5 space-y-6">
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase"
              style={{ background: CL.accentTint, color: CL.accent, border: `1px solid ${CL.accentTintBorder}` }}
            >
              Phương Pháp Khác Biệt
            </div>
            <h2
              className="text-3xl lg:text-4xl font-[var(--font-display)] font-extrabold leading-tight"
              style={{ color: CL.fg }}
            >
              Trải nghiệm lớp học
              <br />
              gợi mở Socratic
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: CL.mutedFg }}>
              Phương pháp Socratic không cung cấp lời giải trực tiếp. AI đóng vai người dẫn dắt —
              đặt câu hỏi gợi mở theo từng bước để học sinh tự tìm ra bản chất vấn đề.
            </p>

            <div className="space-y-5 pt-1">
              {[
                {
                  n: "01",
                  title: "Không làm hộ",
                  desc: "Không cung cấp lời giải ăn sẵn, tránh thói quen lười suy nghĩ.",
                },
                {
                  n: "02",
                  title: "Đặt câu hỏi gợi mở",
                  desc: "Phân tích lỗi sai trong câu trả lời để đưa ra gợi ý phù hợp.",
                },
                {
                  n: "03",
                  title: "Thấu hiểu sâu sắc",
                  desc: "Giúp học sinh hiểu bản chất toán học / khoa học, không học vẹt công thức.",
                },
              ].map(({ n, title, desc }) => (
                <div key={n} className="flex gap-4 items-start">
                  <div
                    className="shrink-0 text-xs font-bold tabular-nums mt-0.5"
                    style={{ color: CL.accent }}
                  >
                    {n}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold" style={{ color: CL.fg }}>{title}</h4>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: CL.mutedFg }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Chat Widget */}
          <div className="lg:col-span-7">
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: CL.card,
                border: `1px solid ${CL.cardBorder}`,
                boxShadow: `0 8px 32px -8px oklch(0.175 0.015 60 / 0.12)`,
              }}
            >
              {/* Chat header */}
              <div
                className="flex items-center justify-between px-5 py-3.5"
                style={{ borderBottom: `1px solid ${CL.border}`, background: CL.mutedBg }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="h-7 w-7 rounded-lg grid place-items-center"
                    style={{ background: CL.accent }}
                  >
                    <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold" style={{ color: CL.fg }}>Gia sư Socratic</div>
                    <div className="text-[10px]" style={{ color: CL.mutedFg }}>Mô phỏng · Aurora AI</div>
                  </div>
                  <div
                    className="h-1.5 w-1.5 rounded-full animate-pulse ml-1"
                    style={{ background: "#22c55e" }}
                  />
                </div>
                <button
                  onClick={() => setMockStep(0)}
                  className="text-[11px] font-medium transition-colors"
                  style={{ color: CL.accent }}
                >
                  Đặt lại
                </button>
              </div>

              {/* Messages */}
              <div className="p-5 space-y-3 min-h-[300px] overflow-y-auto">
                {mockMessages.slice(0, mockStep + 1).map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.sender === "student" ? "justify-end" : "justify-start"}`}>
                    {msg.sender === "ai" && (
                      <div
                        className="h-6 w-6 rounded-lg grid place-items-center mr-2 shrink-0 self-end mb-0.5"
                        style={{ background: CL.accentTint, border: `1px solid ${CL.accentTintBorder}` }}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: CL.accent }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                    )}
                    <div
                      className="max-w-[78%] text-xs leading-relaxed px-3.5 py-2.5 rounded-2xl"
                      style={
                        msg.sender === "student"
                          ? { background: CL.accent, color: "#fff", borderBottomRightRadius: "4px" }
                          : { background: CL.mutedBg, color: CL.fg, border: `1px solid ${CL.border}`, borderBottomLeftRadius: "4px" }
                      }
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>

              {/* Advance button */}
              {mockStep < mockMessages.length - 1 && (
                <div
                  className="px-5 pb-4 pt-1 flex justify-center"
                  style={{ borderTop: `1px solid ${CL.border}` }}
                >
                  <button
                    onClick={() => setMockStep((p) => p + 1)}
                    className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg transition-all"
                    style={{ background: CL.accentTint, color: CL.accent, border: `1px solid ${CL.accentTintBorder}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = CL.accentTintBorder)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = CL.accentTint)}
                  >
                    {mockStep % 2 === 0 ? "Xem Học sinh trả lời" : "Xem AI đặt câu hỏi tiếp"}
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Audience Cards ────────────────────────────────────────── */}
      <section
        className="relative z-10 max-w-6xl mx-auto px-6 py-20"
        style={{ borderTop: `1px solid ${CL.border}` }}
      >
        <div className="text-center mb-14 space-y-2">
          <h2
            className="text-3xl font-[var(--font-display)] font-extrabold"
            style={{ color: CL.fg }}
          >
            Giải pháp cho Học sinh & Thầy cô
          </h2>
          <p className="text-sm" style={{ color: CL.mutedFg }}>
            Thiết kế thích ứng giúp tự học thú vị và giảng dạy nhẹ nhàng hơn
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Students */}
          <div
            className="group rounded-2xl p-8 space-y-5 transition-all hover:-translate-y-0.5"
            style={{
              background: CL.card,
              border: `1px solid ${CL.cardBorder}`,
              boxShadow: `0 4px 20px -6px oklch(0.175 0.015 60 / 0.08)`,
            }}
          >
            <div
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: CL.accentTint, border: `1px solid ${CL.accentTintBorder}` }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: CL.accent }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-xl font-bold" style={{ color: CL.fg }}>Dành cho Học sinh</h3>
            <ul className="space-y-3">
              {[
                "Tương tác nhẹ nhàng, vui nhộn như trò chuyện cùng bạn bè.",
                "Nội dung bám sát Chương trình Giáo dục Phổ thông 2018.",
                "Chế độ làm bài Offline giúp học tập mọi lúc, mọi nơi.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: CL.mutedFg }}>
                  <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: CL.accent }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <button
              onClick={() => router.push("/login?role=student")}
              className="text-sm font-semibold transition-opacity hover:opacity-70 flex items-center gap-1"
              style={{ color: CL.accent }}
            >
              Bắt đầu Học thử ngay
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          </div>

          {/* Teachers */}
          <div
            className="group rounded-2xl p-8 space-y-5 transition-all hover:-translate-y-0.5"
            style={{
              background: CL.fg,
              border: `1px solid oklch(0.25 0.015 60)`,
              boxShadow: `0 4px 20px -6px oklch(0.175 0.015 60 / 0.25)`,
            }}
          >
            <div
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: "oklch(0.28 0.015 60)" }}
            >
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white">Dành cho Giáo viên & Thầy cô</h3>
            <ul className="space-y-3">
              {[
                "Tự động thống kê các lỗ hổng kiến thức phổ biến trong lớp.",
                "Nhận cảnh báo thông minh về học sinh đang bị tụt lại để hỗ trợ kịp thời.",
                "Tiết kiệm hàng giờ chấm bài và soạn câu hỏi thủ công.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: "oklch(0.7 0.015 60)" }}>
                  <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: CL.accent }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <button
              onClick={() => router.push("/login?role=teacher")}
              className="text-sm font-semibold transition-opacity hover:opacity-70 flex items-center gap-1"
              style={{ color: CL.accent }}
            >
              Truy cập Dashboard Giáo viên
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer
        className="relative z-10 py-10 text-center text-xs"
        style={{ borderTop: `1px solid ${CL.border}`, color: CL.mutedFg }}
      >
        <div className="max-w-6xl mx-auto px-6 space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div
              className="grid h-5 w-5 place-items-center rounded"
              style={{ background: CL.accent }}
            >
              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-semibold text-sm" style={{ color: CL.fg }}>Aurora Socratic Assistant</span>
          </div>
          <p>Học thật, hiểu thật. Phát triển bám sát GDPT 2018.</p>
          <p>&copy; 2026 Aurora Assistant. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
