"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { API_BASE_URL } from "@/lib/api";
import dynamic from "next/dynamic";
import Image from "next/image";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export default function LandingPage() {
  const router = useRouter();
  
  // Lottie animation state
  const [animationData, setAnimationData] = useState<any>(null);

  useEffect(() => {
    fetch("/education.json")
      .then((res) => res.json())
      .then((data) => setAnimationData(data))
      .catch((err) => console.error("Error loading animation:", err));
  }, []);

  // Interactive mock chat state to showcase Socratic learning
  const [mockStep, setMockStep] = useState(0);
  const mockMessages = [
    { sender: "ai", content: "Chào Bi! Thầy có câu đố nhé: 1/2 cái bánh cộng với 1/3 cái bánh thì bằng bao nhiêu cái bánh nhỉ?" },
    { sender: "student", content: "Dạ bằng 2/5 đúng không ạ?" },
    { sender: "ai", content: "Ồ! Bi thử nghĩ xem, nếu ta cắt 1 cái bánh làm 2 phần, và 1 cái bánh làm 3 phần. Khi cộng lại ta có cộng trực tiếp các mẫu số (2 + 3 = 5) được không? Hay ta cần đưa chúng về 'cùng kích cỡ' (mẫu số chung) nhỉ?" },
    { sender: "student", content: "À! Phải quy đồng mẫu số chung là 6 ạ!" },
    { sender: "ai", content: "Chính xác luôn! Giỏi quá. Vậy 1/2 quy đồng thành bao nhiêu phần 6, và 1/3 quy đồng thành bao nhiêu phần 6 nào?" },
    { sender: "student", content: "Dạ 1/2 là 3/6, còn 1/3 là 2/6 ạ." },
    { sender: "ai", content: "Chuẩn luôn! Vậy giờ Bi cộng 3/6 và 2/6 lại thì kết quả là bao nhiêu phần 6 nào?" },
    { sender: "student", content: "Dạ là 5/6 cái bánh ạ!" },
    { sender: "ai", content: "Rất xuất sắc! Bi đã tự mình giải quyết xong bài toán bằng cách chia bánh thành các phần bằng nhau (quy đồng) rồi đó. Bài học rút ra là luôn phải đưa về cùng mẫu số trước khi cộng nhé!" }
  ];

  return (
    <div className="min-h-screen bg-background font-[var(--font-body)] text-foreground overflow-x-hidden relative">
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-[var(--mint)]/30 blur-[120px] pointer-events-none" />
      <div className="absolute top-[30%] right-[-10%] h-[500px] w-[500px] rounded-full bg-[var(--purple)]/20 blur-[120px] pointer-events-none" />

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
          <span className="text-xl font-[var(--font-display)] font-extrabold bg-gradient-to-r from-[var(--mint)] to-[var(--purple)] bg-clip-text text-transparent tracking-tight">
            AURORA ASSISTANT
          </span>
        </div>
        <div className="flex items-center gap-6">
          <button
            onClick={() => router.push("/login?role=teacher")}
            className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Hướng dẫn sử dụng
          </button>
          <button
            onClick={() => router.push("/login")}
            className="bg-foreground hover:opacity-90 text-background px-5 py-2.5 rounded-full text-sm font-semibold shadow-[var(--shadow-card)] transition-all"
          >
            Đăng Nhập
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Column: Heading */}
        <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[var(--mint)]/15 to-[var(--purple)]/15 text-xs font-bold text-foreground border border-[var(--mint)]/30 tracking-wide uppercase shadow-sm">
            <svg className="h-3.5 w-3.5 text-[var(--purple)] animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Học thật - Hiểu thật với Trí Tuệ Nhân Tạo</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-[var(--font-display)] font-extrabold leading-[1.05] tracking-tight text-foreground">
            Gia sư phản biện <br />
            <span className="bg-gradient-to-r from-[var(--mint)] to-[var(--purple)] bg-clip-text text-transparent">
              tự học tư duy
            </span>
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed max-w-lg mx-auto lg:mx-0">
            Hệ thống AI không cho sẵn lời giải. Thay vào đó, AI đóng vai trò người bạn thông thái đặt câu hỏi gợi mở, giúp các em học sinh tự tư duy để tìm ra đáp án cuối cùng.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <button
              onClick={() => router.push("/login?role=student")}
              className="inline-flex items-center justify-center gap-2 bg-[var(--mint)] hover:brightness-95 text-foreground px-8 py-4 rounded-full font-bold shadow-[var(--shadow-card)] transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Bắt đầu Học ngay</span>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`${API_BASE_URL}/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: "student@aurora.edu.vn", password: "demo123" }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    localStorage.setItem("aurora_token", data.token);
                    localStorage.setItem("aurora_user", JSON.stringify(data.user));
                  }
                } catch (e) {}
                localStorage.setItem("aurora_tour_active", "true");
                localStorage.setItem("aurora_tour_step", "0");
                router.push("/tutor");
              }}
              className="bg-gradient-to-r from-[var(--purple)] to-indigo-600 hover:brightness-110 text-white px-8 py-4 rounded-full font-bold shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <span>🚀 Tour Hướng Dẫn (2 phút)</span>
            </button>
          </div>
        </div>

        {/* Right Column: Lottie Animation */}
        <div className="lg:col-span-6 flex justify-center items-center">
          <div className="relative w-full max-w-[500px]">
            <div className="absolute -inset-4 rounded-[3rem] bg-gradient-to-br from-[var(--mint)]/20 to-[var(--purple)]/25 blur-2xl pointer-events-none" />
            <div className="relative w-full flex justify-center items-center min-h-[350px]">
              {animationData ? (
                <Lottie
                  animationData={animationData}
                  loop={true}
                  autoplay={true}
                  className="w-full h-auto max-w-[450px]"
                />
              ) : (
                <div className="w-[300px] h-[300px] flex items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-[var(--mint)]" />
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Interactive Socratic Demo Section */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-20 border-t border-border bg-card/30 rounded-3xl my-12 backdrop-blur-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
          {/* Left Column: Explanation */}
          <div className="lg:col-span-5 flex flex-col justify-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--purple)]/15 text-xs font-bold text-[var(--purple)] border border-[var(--purple)]/25 uppercase w-fit shadow-md shadow-[var(--purple)]/30 hover:-translate-y-1 hover:shadow-lg hover:shadow-[var(--purple)]/50 transition-all duration-300 cursor-default">
              Phương Pháp Khác Biệt
            </div>
            <h2 className="text-3xl md:text-4xl font-[var(--font-display)] font-extrabold text-foreground leading-tight">
              Trải nghiệm lớp học <br className="hidden md:block" /> gợi mở Socratic
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Phương pháp Socratic không cung cấp lời giải trực tiếp. Thay vào đó, AI đóng vai trò là một người dẫn dắt thông thái, đặt ra các câu hỏi gợi mở theo từng bước để giúp học sinh tự tìm ra bản chất của vấn đề và ghi nhớ sâu sắc hơn.
            </p>
            
            <div className="space-y-4 pt-2">
              <div className="flex gap-3">
                <div className="flex-shrink-0 grid h-8 w-8 place-items-center rounded-lg bg-[var(--mint)]/20 text-[var(--mint)] font-bold text-sm">
                  1
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">Không làm hộ</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Không cung cấp lời giải ăn sẵn, tránh thói quen lười suy nghĩ của học sinh.</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="flex-shrink-0 grid h-8 w-8 place-items-center rounded-lg bg-[var(--purple)]/20 text-[var(--purple)] font-bold text-sm">
                  2
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">Đặt câu hỏi gợi mở</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Phân tích lỗi sai trong câu trả lời của học sinh để đưa ra gợi ý phù hợp.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 grid h-8 w-8 place-items-center rounded-lg bg-indigo-500/20 text-indigo-500 font-bold text-sm">
                  3
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">Thấu hiểu sâu sắc</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Giúp học sinh hiểu rõ bản chất toán học/khoa học chứ không chỉ là học vẹt công thức.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Chat Widget */}
          <div className="lg:col-span-7 flex justify-center items-stretch py-4 lg:py-0">
            <div className="relative w-full max-w-lg flex flex-col">
              <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-[var(--purple)]/20 to-[var(--mint)]/25 blur-2xl pointer-events-none" />
              <div className="relative w-full h-full flex flex-col rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-[var(--mint)] animate-pulse" />
                    <span className="text-xs font-bold text-muted-foreground">Gia sư Socratic (Mô phỏng)</span>
                  </div>
                  <button
                    onClick={() => setMockStep(0)}
                    className="text-[10px] text-[var(--purple)] hover:underline font-semibold"
                  >
                    Đặt lại
                  </button>
                </div>

                {/* Simulated Chat Messages */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin min-h-[300px]">
                  {mockMessages.slice(0, mockStep + 1).map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.sender === "student" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                          msg.sender === "student"
                            ? "bg-foreground text-background rounded-br-none"
                            : "bg-muted text-foreground border border-border rounded-bl-none"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Demo Actions */}
                {mockStep < mockMessages.length - 1 && (
                  <div className="pt-2 text-center">
                    <button
                      onClick={() => setMockStep((prev) => prev + 1)}
                      className="inline-flex items-center gap-2 bg-muted hover:bg-border border border-border px-4 py-2 rounded-full text-xs font-bold text-foreground animate-bounce"
                    >
                      <span>{mockStep % 2 === 0 ? "Xem Học sinh trả lời" : "Xem AI đặt câu hỏi tiếp"}</span>
                      <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Target Audiences Sections */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-20 border-t border-border">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-[var(--font-display)] font-extrabold text-foreground">Giải pháp cho Cả Học sinh & Thầy cô</h2>
          <p className="text-muted-foreground text-sm mt-2">Được thiết kế thích ứng giúp việc tự học trở nên thú vị và việc giảng dạy nhẹ nhàng hơn</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Path 1: Primary Students */}
          <div className="group relative overflow-hidden rounded-3xl border border-border bg-card p-8 space-y-6 shadow-[var(--shadow-card)] transition hover:-translate-y-1 hover:shadow-lg">
            <div className="inline-block p-3 rounded-2xl bg-[var(--mint)]/15 text-[var(--mint)]">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-foreground">Dành cho Học sinh</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <svg className="h-4 w-4 text-[var(--mint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                Tương tác nhẹ nhàng, vui nhộn như trò chuyện cùng bạn bè.
              </li>
              <li className="flex items-center gap-2">
                <svg className="h-4 w-4 text-[var(--mint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                Nội dung bám sát Chương trình Giáo dục Phổ thông 2018.
              </li>
              <li className="flex items-center gap-2">
                <svg className="h-4 w-4 text-[var(--mint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                Chế độ làm bài Offline giúp học tập mọi lúc, mọi nơi ngay cả khi mạng yếu.
              </li>
            </ul>
            <button
              onClick={() => router.push("/login?role=student")}
              className="inline-block text-sm font-bold text-[var(--mint)] hover:underline"
            >
              Bắt đầu Học thử ngay &rarr;
            </button>
          </div>

          {/* Path 2: Teachers */}
          <div className="group relative overflow-hidden rounded-3xl border border-border bg-card p-8 space-y-6 shadow-[var(--shadow-card)] transition hover:-translate-y-1 hover:shadow-lg">
            <div className="inline-block p-3 rounded-2xl bg-[var(--purple)]/15 text-[var(--purple)]">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2zm12-5a2 2 0 11-4 0 2 2 0 014 0zM9 20h12" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-foreground">Dành cho Giáo viên & Thầy cô</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <svg className="h-4 w-4 text-[var(--purple)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                Tự động thống kê các lỗ hổng kiến thức phổ biến trong lớp.
              </li>
              <li className="flex items-center gap-2">
                <svg className="h-4 w-4 text-[var(--purple)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                Nhận cảnh báo thông minh những học sinh đang bị tụt lại để hỗ trợ kịp thời.
              </li>
              <li className="flex items-center gap-2">
                <svg className="h-4 w-4 text-[var(--purple)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                Tiết kiệm hàng giờ chấm bài và soạn câu hỏi phản lý thuyết thủ công.
              </li>
            </ul>
            <button
              onClick={() => router.push("/login?role=teacher")}
              className="inline-block text-sm font-bold text-[var(--purple)] hover:underline"
            >
              Truy cập Dashboard Giáo viên &rarr;
            </button>
          </div>
        </div>
      </section>

      {/* Footer Call to Action */}
      <footer className="relative z-10 border-t border-border bg-muted py-12 text-center text-xs text-muted-foreground">
        <div className="max-w-6xl mx-auto px-6 space-y-4">
          <p className="font-semibold text-foreground">Aurora Socratic Assistant - Học thật, hiểu thật.</p>
          <p>&copy; 2026 Bản quyền thuộc về dự án Aurora Assistant. Phát triển bám sát GDPT 2018.</p>
        </div>
      </footer>
    </div>
  );
}
