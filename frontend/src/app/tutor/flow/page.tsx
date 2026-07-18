"use client";

/**
 * Learning Flow — shell điều hướng 5 bước của hành trình Phân số.
 * Port shell từ handoff (Aurora Learning Flow.dc.html): stepper + đổi nhân vật + Back/Next.
 * Cắm các màn đã dựng (Hub, Fraction Lab, Badge Cabinet); Story Intro & Cutscene là stub
 * (điền sau). Nhân vật chọn ở đây truyền xuống mọi màn qua CharacterContext.
 */

import { useState, type CSSProperties } from "react";
import { type CharKind } from "../components/Character";
import { CharacterContext, characterMeta } from "../components/character-context";
import ChapterCutscene from "../components/ChapterCutscene";
import FractionLab from "../components/FractionLab";
import StoryIntro from "../components/StoryIntro";
import TutorHubPage from "../hub/page";
import BadgeCabinetPage from "../badges/page";

const POPPINS: CSSProperties = { fontFamily: "'Poppins', system-ui, sans-serif" };

const STEPS = [
  { icon: "📖", label: "Câu chuyện" },
  { icon: "🎓", label: "Bài học" },
  { icon: "🍰", label: "Phòng bánh" },
  { icon: "🏁", label: "Về đích" },
  { icon: "🏆", label: "Huy hiệu" },
];

export default function LearningFlowPage() {
  const [step, setStep] = useState(0);
  const [companion, setCompanion] = useState<CharKind>("nam");
  const n = STEPS.length;
  const last = step === n - 1;

  const goto = (i: number) => setStep(Math.max(0, Math.min(n - 1, i)));
  const goNext = () => setStep((s) => (s >= n - 1 ? 0 : s + 1));
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  const companionLabel = companion === "sheep" ? "🐑 Cừu" : "🍄 Nấm";
  const buddyName = characterMeta(companion).name;

  return (
    <CharacterContext.Provider value={companion}>
      <div style={{ height: "100vh", minHeight: 700, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Inter', sans-serif", color: "#16161F", background: "#F4FBF9" }}>
        {/* stepper bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "12px 24px", background: "#fff", borderBottom: "1px solid #eef1f4", flexShrink: 0, zIndex: 5, boxShadow: "0 6px 18px -16px rgba(0,0,0,.3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
            <div style={{ ...POPPINS, height: 32, width: 32, borderRadius: 10, background: "linear-gradient(135deg,#14D9C0,#7C46E8)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 15 }}>A</div>
            <span style={{ ...POPPINS, fontWeight: 800, fontSize: 14 }}>Hành trình Phân số</span>
          </div>

          <div
            onClick={() => setCompanion((c) => (c === "sheep" ? "nam" : "sheep"))}
            title={`Đổi nhân vật đồng hành (đang: ${buddyName})`}
            style={{ ...POPPINS, flexShrink: 0, background: "#faf7ff", border: "1px solid #ece5fb", borderRadius: 11, padding: "7px 13px", fontSize: 13, fontWeight: 800, color: "#7C46E8", cursor: "pointer" }}
          >
            {companionLabel}
          </div>

          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, overflowX: "auto" }}>
            {STEPS.map((st, i) => {
              const active = i === step;
              const done = i < step;
              const chipStyle: CSSProperties = {
                ...POPPINS,
                display: "flex",
                alignItems: "center",
                gap: 7,
                whiteSpace: "nowrap",
                borderRadius: 11,
                padding: "8px 13px",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                transition: "all .15s",
                flexShrink: 0,
                ...(active
                  ? { background: "linear-gradient(135deg,#EFE9FD,#f6f1ff)", color: "#5b2fc0", boxShadow: "inset 0 0 0 2px #7C46E8" }
                  : done
                    ? { background: "#F3FBF9", color: "#0FB9A6" }
                    : { background: "#f7f9fb", color: "#a2a8b4" }),
              };
              return (
                <div key={st.label} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                  <div onClick={() => goto(i)} style={chipStyle}>
                    <span style={{ fontSize: 14 }}>{done ? "✓" : st.icon}</span>
                    <span>{st.label}</span>
                  </div>
                  {i < n - 1 && (
                    <div style={{ height: 2, width: 16, borderRadius: 2, flexShrink: 0, background: i < step ? "#14D9C0" : "#e6eaef", margin: "0 2px" }} />
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 9, flexShrink: 0 }}>
            {step > 0 && (
              <div onClick={goPrev} style={{ background: "#fff", border: "1px solid #eef1f4", color: "#5b6072", borderRadius: 11, padding: "9px 15px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                ← Quay lại
              </div>
            )}
            <div
              onClick={goNext}
              style={{
                ...POPPINS,
                borderRadius: 11,
                padding: "9px 17px",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                color: "#fff",
                ...(last
                  ? { background: "linear-gradient(135deg,#14D9C0,#0FB9A6)" }
                  : { background: "linear-gradient(135deg,#8B5CF6,#7C46E8)", boxShadow: "0 10px 20px -8px rgba(124,70,232,.5)" }),
              }}
            >
              {last ? "↺ Bắt đầu lại" : "Tiếp →"}
            </div>
          </div>
        </div>

        {/* current step */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}>
          {step === 0 && <StoryIntro onDone={goNext} />}
          {step === 1 && <TutorHubPage />}
          {step === 2 && <FractionLab onBack={() => goto(1)} />}
          {step === 3 && <ChapterCutscene onDone={goNext} />}
          {step === 4 && <BadgeCabinetPage />}
        </div>
      </div>
    </CharacterContext.Provider>
  );
}
