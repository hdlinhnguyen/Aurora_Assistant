"use client";

/**
 * ChapterCutscene — "Về đích" (cutscene).
 * Port từ handoff (Aurora Chapter Cutscene.dc.html): nhân vật Walk dọc đường cong
 * (offset-path), cột mốc ✓ bật lên, cắm cờ, rồi huy chương "Vua Phân Số" ráp lại + confetti.
 * Skip → nhảy thẳng thẻ kết quả; Replay → chạy lại.
 */

import { useMemo, useState, type CSSProperties } from "react";
import Character from "./Character";
import { characterMeta, useCharacter } from "./character-context";

const POPPINS: CSSProperties = { fontFamily: "'Poppins', system-ui, sans-serif" };
const BALOO: CSSProperties = { fontFamily: "'Baloo 2', system-ui, sans-serif" };
const PATH = "M 30 210 C 150 110, 250 280, 355 175 C 445 85, 520 250, 600 95";
const EASE = "cubic-bezier(.16,1,.3,1)";
const CONFETTI_COLORS = ["#14D9C0", "#7C46E8", "#FFC24D", "#ff8fa3", "#5ac8fa", "#fff"];

const STAR_POS = [
  { top: "12%", left: "14%", size: 16, dur: "2.4s", delay: "0s" },
  { top: "20%", left: "78%", size: 12, dur: "3s", delay: ".4s" },
  { top: "60%", left: "8%", size: 11, dur: "2.6s", delay: ".8s" },
  { top: "72%", left: "88%", size: 15, dur: "2.8s", delay: ".2s" },
  { top: "30%", left: "46%", size: 10, dur: "3.2s", delay: "1s" },
];

const MILESTONES = [
  { top: 158, left: 118, delay: 1.2 },
  { top: 156, left: 336, delay: 2 },
  { top: 150, left: 498, delay: 2.7 },
];

export default function ChapterCutscene({ onDone }: { onDone?: () => void }) {
  const char = useCharacter();
  const buddyName = characterMeta(char).name.replace("bạn ", "");
  const [playId, setPlayId] = useState(1);
  const [skipped, setSkipped] = useState(false);

  const replay = () => {
    setPlayId((p) => p + 1);
    setSkipped(false);
  };
  const skip = () => {
    setPlayId((p) => p + 1);
    setSkipped(true);
  };

  const base = skipped ? 0 : 3.4;
  const cbase = base + 0.35;

  const confetti = useMemo(
    () =>
      Array.from({ length: 54 }).map((_, i) => ({
        left: Math.round(Math.random() * 100),
        color: CONFETTI_COLORS[i % 6],
        dur: (2.2 + Math.random() * 1.5).toFixed(2),
        delay: (cbase + Math.random() * 0.7).toFixed(2),
        rot: Math.round(Math.random() * 360),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playId, skipped],
  );

  const milestoneBadge: CSSProperties = {
    position: "absolute",
    height: 40,
    width: 40,
    borderRadius: "50%",
    background: "linear-gradient(135deg,#19E0C6,#0FB9A6)",
    display: "grid",
    placeItems: "center",
    color: "#fff",
    fontWeight: 800,
    border: "3px solid #fff",
    boxShadow: "0 8px 16px -6px rgba(15,185,166,.7)",
  };

  return (
    <div
      style={{
        height: "100%",
        minHeight: 680,
        overflow: "hidden",
        position: "relative",
        fontFamily: "'Inter', sans-serif",
        background:
          "radial-gradient(1000px 620px at 50% -10%, #3a2a7a, transparent 60%), radial-gradient(900px 600px at 100% 110%, #0f5b57, transparent 55%), linear-gradient(160deg,#171a45,#0e1230)",
      }}
    >
      {/* twinkle stars */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {STAR_POS.map((st, i) => (
          <span key={i} style={{ position: "absolute", top: st.top, left: st.left, fontSize: st.size, color: "#fff", animation: `cs-twinkle ${st.dur} ease-in-out ${st.delay} infinite` }}>
            ✦
          </span>
        ))}
      </div>

      {/* controls */}
      <div style={{ position: "absolute", top: 20, right: 24, zIndex: 20, display: "flex", gap: 10 }}>
        <div onClick={replay} style={{ background: "rgba(255,255,255,.14)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", borderRadius: 12, padding: "9px 15px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          ▶ Xem lại
        </div>
        <div onClick={skip} style={{ background: "rgba(255,255,255,.14)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", borderRadius: 12, padding: "9px 15px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Bỏ qua ▸
        </div>
      </div>

      <div key={playId} style={{ position: "absolute", inset: 0 }}>
        {/* ===== SCENE 1: TRAVEL ===== */}
        {!skipped && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "cs-fadeout .5s ease 3.2s forwards" }}>
            <div style={{ textAlign: "center", marginBottom: 26, animation: "cs-in .6s ease .15s both" }}>
              <div style={{ ...POPPINS, fontSize: 12, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "#a9b0ff" }}>Chương Phân số</div>
              <div style={{ ...BALOO, fontWeight: 800, fontSize: 32, color: "#fff", marginTop: 4 }}>Về đích thôi nào! 🎒</div>
            </div>
            <div style={{ position: "relative", width: 630, height: 300 }}>
              <svg width="630" height="300" viewBox="0 0 630 300" style={{ position: "absolute", inset: 0 }}>
                <path d={PATH} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="16" strokeLinecap="round" />
                <path d={PATH} fill="none" stroke="#14D9C0" strokeWidth="16" strokeLinecap="round" strokeDasharray="920" strokeDashoffset="920" style={{ animation: "cs-draw 2.6s ease-in-out .5s forwards" }} />
              </svg>
              {MILESTONES.map((m, i) => (
                <div key={i} style={{ ...milestoneBadge, top: m.top, left: m.left, animation: `cs-pop .4s ease ${m.delay}s both` }}>
                  ✓
                </div>
              ))}
              <div style={{ position: "absolute", top: 56, left: 588, fontSize: 34, transformOrigin: "bottom left", animation: "cs-pop .45s ease 3s both" }}>
                <span style={{ display: "inline-block", animation: "cs-flag 1s ease-in-out 3.4s infinite" }}>🚩</span>
              </div>
              {/* mascot travelling */}
              <div
                style={
                  {
                    position: "absolute",
                    left: 0,
                    top: 0,
                    offsetPath: `path('${PATH}')`,
                    offsetRotate: "0deg",
                    offsetDistance: "0%",
                    animation: "cs-travel 2.6s ease-in-out .5s both",
                  } as CSSProperties
                }
              >
                <div style={{ transform: "translate(-50%,-50%)", filter: "drop-shadow(0 6px 10px rgba(0,0,0,.4))" }}>
                  <Character char={char} mood="walk" size={76} face="right" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== SCENE 2: MEDAL + STATS ===== */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 30, maxWidth: 560, width: "100%", padding: "34px 38px 30px", textAlign: "center", boxShadow: "0 50px 100px -30px rgba(0,0,0,.6)", animation: `cs-rise .6s ${EASE} ${base}s both` }}>
            {/* medal */}
            <div style={{ position: "relative", width: 150, height: 150, margin: "0 auto 8px" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "conic-gradient(#FFD76F,#FF9F43,#FFE9B8,#ffb84d,#FFD76F)", boxShadow: "0 18px 36px -12px rgba(255,159,67,.65)", animation: `cs-ring .7s ${EASE} ${base + 0.15}s both` }} />
              <div style={{ position: "absolute", inset: 13, borderRadius: "50%", background: "linear-gradient(135deg,#FFF0CE,#FFC24D)", display: "grid", placeItems: "center", boxShadow: "inset 0 3px 9px rgba(255,255,255,.7),inset 0 -7px 12px rgba(180,110,20,.25)", overflow: "hidden" }}>
                <span style={{ fontSize: 60, filter: "drop-shadow(0 3px 4px rgba(150,90,10,.3))", animation: `cs-glyph .5s ${EASE} ${base + 0.5}s both` }}>👑</span>
                <div style={{ position: "absolute", top: "-30%", left: 0, width: "40%", height: "160%", background: "linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent)", animation: `cs-shine 1.1s ease ${base + 0.75}s both` }} />
              </div>
              <div style={{ position: "absolute", top: -4, right: 2, fontSize: 24, animation: "cs-float 3s ease-in-out infinite" }}>✨</div>
            </div>

            <div style={{ animation: `cs-in .5s ease ${base + 0.55}s both` }}>
              <div style={{ ...POPPINS, display: "inline-block", background: "#FFF7E8", border: "1px solid #ffe1a6", color: "#b7811f", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", padding: "5px 14px", borderRadius: 999, marginBottom: 11 }}>
                Huy hiệu mới · Vua Phân Số
              </div>
              <div style={{ ...BALOO, fontWeight: 800, fontSize: 27, lineHeight: 1.15, marginBottom: 8, color: "#16161F" }}>Chinh phục Chương Phân số! 🎉</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, fontSize: 13.5, color: "#5b6072", marginBottom: 20 }}>
                <div style={{ width: 52, height: 52, flexShrink: 0 }}>
                  <Character char={char} mood="jump" size={52} face="right" />
                </div>
                <span>
                  <b>{buddyName}</b>: "Em giỏi lắm, cán đích rồi!"
                </span>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
                <div style={{ flex: 1, background: "#F3FBF9", border: "1px solid #e2f3ef", borderRadius: 16, padding: 14 }}>
                  <div style={{ ...POPPINS, fontWeight: 800, fontSize: 22, color: "#0FB9A6" }}>6/6</div>
                  <div style={{ fontSize: 11, color: "#7c8194" }}>bài học</div>
                </div>
                <div style={{ flex: 1, background: "#fff8ec", border: "1px solid #ffe6bd", borderRadius: 16, padding: 14 }}>
                  <div style={{ ...POPPINS, fontWeight: 800, fontSize: 22, color: "#e0912a" }}>+50</div>
                  <div style={{ fontSize: 11, color: "#7c8194" }}>sao thưởng</div>
                </div>
                <div style={{ flex: 1, background: "#faf7ff", border: "1px solid #ece5fb", borderRadius: 16, padding: 14 }}>
                  <div style={{ ...POPPINS, fontWeight: 800, fontSize: 22, color: "#7C46E8" }}>92%</div>
                  <div style={{ fontSize: 11, color: "#7c8194" }}>chính xác</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 11 }}>
                <div onClick={() => onDone?.()} style={{ ...POPPINS, flex: 1, background: "linear-gradient(135deg,#14D9C0,#0FB9A6)", color: "#fff", borderRadius: 15, padding: 15, fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 12px 24px -8px rgba(15,185,166,.55)" }}>
                  Tiếp tục chương mới →
                </div>
                <div onClick={() => onDone?.()} style={{ background: "#fff", border: "1px solid #eef1f4", color: "#5b6072", borderRadius: 15, padding: "15px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  Xem tủ huy hiệu
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* confetti */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 15 }}>
          {confetti.map((cf, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                top: -24,
                left: `${cf.left}%`,
                width: 9,
                height: 15,
                borderRadius: 3,
                background: cf.color,
                opacity: 0,
                transform: `rotate(${cf.rot}deg)`,
                animation: `cs-fall ${cf.dur}s linear ${cf.delay}s forwards`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
