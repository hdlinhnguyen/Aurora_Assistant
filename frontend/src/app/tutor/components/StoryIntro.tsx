"use client";

/**
 * StoryIntro — màn kể chuyện dẫn vào chủ đề Phân số (5 cảnh).
 * Port từ handoff (Aurora Story Intro.dc.html). Nhân vật (Nấm/Cừu) làm người kể.
 */

import { useState, type CSSProperties } from "react";
import Character from "./Character";
import { characterMeta, useCharacter } from "./character-context";

const POPPINS: CSSProperties = { fontFamily: "'Poppins', system-ui, sans-serif" };
const BALOO: CSSProperties = { fontFamily: "'Baloo 2', system-ui, sans-serif" };

interface Beat {
  title: string;
  emoji: string;
  note: string;
  text: string;
}

const BEATS: Beat[] = [
  {
    title: "Chuyện chiếc bánh 🎂",
    emoji: "👧🎂🧒",
    note: "[ tranh: hai bạn & một cái bánh ]",
    text: "Ngày nọ, hai bạn nhỏ có đúng MỘT cái bánh mà ai cũng muốn ăn. Làm sao chia cho thật công bằng đây? 🤔",
  },
  {
    title: 'Ra đời "một nửa"',
    emoji: "🍰➗🍰",
    note: "[ tranh: cắt bánh làm đôi ]",
    text: "Cắt đôi! Mỗi bạn được MỘT NỬA cái bánh — người ta viết là 1/2. Số dưới (2) cho biết chia mấy phần, số trên (1) là lấy mấy phần. Đó chính là phân số!",
  },
  {
    title: "Phân số ở khắp nơi",
    emoji: "🍕⏰🥛",
    note: "[ tranh: pizza, đồng hồ, ly sữa ]",
    text: "Nửa giờ (1/2 giờ = 30 phút) ⏰, nửa lít sữa 🥛, pizza chia 8 miếng 🍕, giảm giá một nửa 🏷️… Phân số ở quanh em mỗi ngày đấy!",
  },
  {
    title: "Vì sao phải biết tính?",
    emoji: "🍫➕🍓",
    note: "[ tranh: gộp các miếng bánh ]",
    text: "Khi GỘP phần ăn của nhiều bạn ta cần cộng, ăn BỚT đi thì trừ, NHIỀU bạn cùng ăn thì nhân. Vậy nên mình cần biết cộng, trừ, nhân phân số.",
  },
  {
    title: "Vào bếp thôi nào!",
    emoji: "👩‍🍳🍰✨",
    note: "[ tranh: đầu bếp nhí & chiếc bánh ]",
    text: "Giờ mình cùng vào Phòng bánh, tự tay cắt và ghép những miếng bánh để hiểu phân số một cách thật vui nhé! 🍰",
  },
];

const MOODS = ["cheerful", "cheerful", "idle", "idle", "cheerful"] as const;

export default function StoryIntro({ onDone }: { onDone?: () => void }) {
  const char = useCharacter();
  const buddyName = characterMeta(char).name.replace("bạn ", "");
  const [beat, setBeat] = useState(0);

  const b = BEATS[beat];
  const last = beat === BEATS.length - 1;
  const next = () => {
    if (last) onDone?.();
    else setBeat((v) => v + 1);
  };
  const back = () => setBeat((v) => Math.max(0, v - 1));

  return (
    <div
      style={{
        height: "100%",
        minHeight: 680,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Inter', sans-serif",
        color: "#16161F",
        background:
          "radial-gradient(760px 400px at 15% -8%, rgba(20,217,192,.20), transparent 60%), radial-gradient(720px 440px at 100% 10%, rgba(124,70,232,.16), transparent 60%), #F4FBF9",
      }}
    >
      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 30px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ ...POPPINS, height: 36, width: 36, borderRadius: 12, background: "linear-gradient(135deg,#14D9C0,#7C46E8)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800 }}>A</div>
          <span style={{ ...POPPINS, fontWeight: 800, fontSize: 16 }}>Câu chuyện phân số</span>
        </div>
        <div onClick={() => onDone?.()} style={{ background: "#fff", border: "1px solid #eef1f4", borderRadius: 12, padding: "9px 15px", fontSize: 13, fontWeight: 700, color: "#5b6072", cursor: "pointer" }}>
          Bỏ qua giới thiệu ▸
        </div>
      </div>

      {/* stage */}
      <div key={beat} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 44, padding: "10px 60px 20px", flexWrap: "wrap" }}>
        {/* illustration scene */}
        <div style={{ width: 440, height: 360, borderRadius: 30, background: "#fff", border: "1px solid #eef1f4", boxShadow: "0 30px 60px -34px rgba(31,26,60,.4)", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", animation: "si-in .45s ease" }}>
          <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg,#f7fbfa,#f7fbfa 14px,#f1f7f5 14px,#f1f7f5 28px)", opacity: 0.7 }} />
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 96, lineHeight: 1.1, letterSpacing: 6, animation: "si-float 3.4s ease-in-out infinite" }}>{b.emoji}</div>
            <div style={{ marginTop: 14, fontFamily: "monospace", fontSize: 11, color: "#93a39d" }}>{b.note}</div>
          </div>
          <div style={{ ...POPPINS, position: "absolute", top: 16, left: 18, background: "#EFE9FD", color: "#7C46E8", fontSize: 11, fontWeight: 800, padding: "4px 12px", borderRadius: 999 }}>
            Chương Phân số · Cảnh {beat + 1}/{BEATS.length}
          </div>
        </div>

        {/* narration */}
        <div style={{ width: 420, animation: "si-in .45s ease .06s both" }}>
          <div style={{ ...BALOO, fontWeight: 800, fontSize: 30, lineHeight: 1.15, marginBottom: 14 }}>{b.title}</div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 1, background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, borderBottomRightRadius: 6, padding: "16px 18px", boxShadow: "0 16px 34px -26px rgba(0,0,0,.3)", marginBottom: 18 }}>
              <div style={{ ...POPPINS, fontWeight: 700, fontSize: 13, color: "#7C46E8", marginBottom: 4 }}>{buddyName} kể</div>
              <div style={{ fontSize: 15, lineHeight: 1.65, color: "#3a3f4d", textWrap: "pretty" }}>{b.text}</div>
            </div>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <Character char={char} mood={MOODS[beat]} size={150} face="left" />
              <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", width: 86, height: 15, background: "radial-gradient(closest-side,rgba(20,30,45,.18),transparent)", borderRadius: "50%", zIndex: -1 }} />
            </div>
          </div>

          {/* progress dots + controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 26 }}>
            {BEATS.map((_, i) => {
              const on = i === beat;
              return <div key={i} style={{ height: 8, borderRadius: 8, transition: "all .2s", width: on ? 26 : 8, background: on ? "#7C46E8" : "#d7dee6" }} />;
            })}
            <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              {beat > 0 && (
                <div onClick={back} style={{ background: "#fff", border: "1px solid #eef1f4", color: "#5b6072", borderRadius: 14, padding: "12px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  ← Trước
                </div>
              )}
              <div
                onClick={next}
                style={{
                  ...POPPINS,
                  borderRadius: 14,
                  padding: "12px 22px",
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: "pointer",
                  color: "#fff",
                  ...(last
                    ? { background: "linear-gradient(135deg,#14D9C0,#0FB9A6)", boxShadow: "0 12px 22px -8px rgba(15,185,166,.55)" }
                    : { background: "linear-gradient(135deg,#8B5CF6,#7C46E8)", boxShadow: "0 12px 22px -8px rgba(124,70,232,.5)" }),
                }}
              >
                {last ? "Bắt đầu học →" : "Tiếp →"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
