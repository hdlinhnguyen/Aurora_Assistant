"use client";

/**
 * FractionLab — "Phòng bánh phân số" (manipulative kéo–thả).
 * Port từ handoff (Aurora Fraction Lab Plus.dc.html). 3 phép: Cộng / Trừ / Nhân.
 * Bánh tròn N miếng (conic-gradient + wedge clip-path), kéo miếng vào đĩa,
 * mascot Character đổi cảm xúc, phương trình sống, confetti khi đúng.
 */

import { useRef, useState, type CSSProperties, type DragEvent } from "react";
import Character from "./Character";
import { characterMeta, useCharacter } from "./character-context";

type SliceKey = "choc" | "straw";
type Slot = SliceKey | null;
type ModeKey = "add" | "sub" | "mul";

const FILL: Record<SliceKey | "empty", string> = {
  choc: "#7B4A2C",
  straw: "#F0709A",
  empty: "#F5ECDA",
};

const SLICE_GRAD: Record<SliceKey, string> = {
  choc: "linear-gradient(180deg,#9a6440 0 20%,#4e2f1c 20% 42%,#d9a56b 42% 56%,#4e2f1c 56% 80%,#6d4327 80% 100%)",
  straw: "linear-gradient(180deg,#ff9bb8 0 20%,#ffd7e3 20% 42%,#ff6f96 42% 56%,#ffd7e3 56% 80%,#ff9bb8 82% 100%)",
};

interface PaletteItem {
  key: SliceKey;
  emoji: string;
  name: string;
  unit: string;
  need: number;
  who: string;
}
interface ModeCfg {
  denom: number;
  kind: ModeKey;
  subtitle: string;
  prefill: Slot[];
  palette: PaletteItem[];
  storyTip: string;
  workTitle: string;
  workHint: string;
  cakeTip: string;
  prefillCount?: number;
  eatNeed?: number;
}

const MODES: Record<ModeKey, ModeCfg> = {
  add: {
    denom: 6,
    kind: "add",
    subtitle: "An ăn 1/2 bánh 🍫, Bình ăn 1/3 bánh 🍓 — cả hai ăn hết bao nhiêu?",
    prefill: [null, null, null, null, null, null],
    palette: [
      { key: "choc", emoji: "🍫", name: "Miếng sô-cô-la", unit: "1/6", need: 3, who: "An 1/2" },
      { key: "straw", emoji: "🍓", name: "Miếng bánh dâu", unit: "1/6", need: 2, who: "Bình 1/3" },
    ],
    storyTip: "Cắt cả hai bánh thành 6 phần bằng nhau thì mới gộp lại được nhé!",
    workTitle: "Kéo miếng bánh vào đĩa",
    workHint: "Cả hai loại miếng đều bằng nhau (mỗi miếng = 1/6) nên mới cộng được.",
    cakeTip: "Kéo miếng thả vào bánh · bấm một miếng để lấy ra.",
  },
  sub: {
    denom: 6,
    kind: "sub",
    subtitle: "Có 5/6 cái bánh 🍫, ăn mất 1/3 (2 miếng) — còn lại bao nhiêu?",
    prefill: ["choc", "choc", "choc", "choc", "choc", null],
    palette: [],
    storyTip: "Ăn 1/3 nghĩa là ăn 2 phần trong 6 phần. Bấm để ăn nhé!",
    workTitle: "Ăn bớt bánh",
    workHint: "Bấm vào miếng bánh để ăn. Cần ăn đúng 1/3 = 2 miếng.",
    cakeTip: "Bấm vào miếng bánh để ăn (bỏ ra).",
    prefillCount: 5,
    eatNeed: 2,
  },
  mul: {
    denom: 4,
    kind: "mul",
    subtitle: "Mỗi bạn ăn 1/4 bánh dâu 🍓, có 3 bạn — cả nhóm ăn bao nhiêu?",
    prefill: [null, null, null, null],
    palette: [{ key: "straw", emoji: "🍓", name: "Miếng bánh dâu", unit: "1/4", need: 3, who: "3 bạn" }],
    storyTip: "Nhân là cộng lặp lại: lấy 1/4 ba lần chính là 1/4 × 3.",
    workTitle: "Lấy 1/4 ba lần",
    workHint: "Kéo miếng 1/4 vào đĩa, mỗi bạn một miếng — tất cả 3 bạn.",
    cakeTip: "Kéo đủ 3 miếng · bấm một miếng để lấy ra.",
  },
};

// ---- pure helpers ----
interface Counts {
  choc: number;
  straw: number;
  filled: number;
}
function countOf(slots: Slot[]): Counts {
  const c = { choc: 0, straw: 0, filled: 0 };
  slots.forEach((x) => {
    if (x) c[x]++;
  });
  c.filled = c.choc + c.straw;
  return c;
}
function removedOf(slots: Slot[], cfg: ModeCfg): number {
  return (cfg.prefillCount || 0) - countOf(slots).filled;
}
function checkDone(slots: Slot[], cfg: ModeCfg): boolean {
  const c = countOf(slots);
  if (cfg.kind === "add") return c.choc === 3 && c.straw === 2;
  if (cfg.kind === "mul") return c.straw === 3;
  if (cfg.kind === "sub") return removedOf(slots, cfg) === cfg.eatNeed;
  return false;
}
function checkOver(slots: Slot[], cfg: ModeCfg): boolean {
  const c = countOf(slots);
  if (cfg.kind === "add") return c.choc > 3 || c.straw > 2;
  if (cfg.kind === "mul") return c.straw > 3;
  if (cfg.kind === "sub") return removedOf(slots, cfg) > (cfg.eatNeed ?? 0);
  return false;
}
// điểm trên đường tròn cho pie N phần
function pts(N: number) {
  const arr = [];
  for (let k = 0; k < N; k++) {
    const rad = ((k * 360) / N) * (Math.PI / 180);
    arr.push({
      x: +(50 + 50 * Math.sin(rad)).toFixed(2),
      y: +(50 - 50 * Math.cos(rad)).toFixed(2),
      lx: +(50 + 48.5 * Math.sin(rad)).toFixed(2),
      ly: +(50 - 48.5 * Math.cos(rad)).toFixed(2),
    });
  }
  return arr;
}

const CONFETTI_COLORS = ["#14D9C0", "#7C46E8", "#FFC24D", "#ff8fa3", "#5ac8fa"];
interface Confetti {
  left: number;
  color: string;
  dur: string;
  delay: string;
  rot: number;
}
function makeConfetti(): Confetti[] {
  return Array.from({ length: 46 }).map((_, i) => ({
    left: Math.round(Math.random() * 100),
    color: CONFETTI_COLORS[i % 5],
    dur: (2 + Math.random() * 1.3).toFixed(2),
    delay: (Math.random() * 0.7).toFixed(2),
    rot: Math.round(Math.random() * 360),
  }));
}

const POPPINS: CSSProperties = { fontFamily: "'Poppins', system-ui, sans-serif" };
const BALOO: CSSProperties = { fontFamily: "'Baloo 2', system-ui, sans-serif" };

export interface FractionLabProps {
  onBack?: () => void;
}

export default function FractionLab({ onBack }: FractionLabProps) {
  const char = useCharacter();
  const buddyName = characterMeta(char).name.replace("bạn ", "");

  const [mode, setMode] = useState<ModeKey>("add");
  const [slots, setSlots] = useState<Slot[]>(MODES.add.prefill.slice());
  const [pulse, setPulse] = useState(0);
  const [lastPlaced, setLastPlaced] = useState<number | null>(null);
  const [lastColor, setLastColor] = useState<SliceKey | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [done, setDone] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [mood, setMood] = useState<string | null>(null);
  const [emoteKey, setEmoteKey] = useState(0);
  const [confetti, setConfetti] = useState<Confetti[]>([]);
  const dragRef = useRef<SliceKey | null>(null);
  const moodTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cfg = MODES[mode];
  const N = cfg.denom;

  function setMoodTemp(m: string) {
    setMood(m);
    setEmoteKey((k) => k + 1);
    if (moodTimer.current) clearTimeout(moodTimer.current);
    moodTimer.current = setTimeout(() => setMood(null), 1200);
  }

  function applyChange(next: Slot[], placedIdx: number | null, color: SliceKey | null) {
    setSlots(next);
    setPulse((p) => p + 1);
    setLastPlaced(placedIdx);
    if (color) setLastColor(color);
    const isDoneNow = checkDone(next, cfg);
    if (isDoneNow && !done) {
      setDone(true);
      setMood("happy");
      setEmoteKey((k) => k + 1);
      setConfetti(makeConfetti());
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 3000);
    } else {
      if (done) setDone(false);
      setMoodTemp(checkOver(next, cfg) ? "oops" : "happy");
    }
  }

  function dropCake(e: DragEvent) {
    e.preventDefault();
    if (cfg.kind === "sub" || !dragRef.current) return;
    const idx = slots.indexOf(null);
    if (idx === -1) return;
    const color = dragRef.current;
    const next = slots.slice();
    next[idx] = color;
    applyChange(next, idx, color);
  }

  function clearAt(i: number) {
    if (!slots[i]) return;
    const next = slots.slice();
    next[i] = null;
    applyChange(next, null, null);
  }

  function changeMode(m: ModeKey) {
    dragRef.current = null;
    setMode(m);
    setSlots(MODES[m].prefill.slice());
    setPulse((p) => p + 1);
    setLastPlaced(null);
    setDone(false);
    setCelebrate(false);
    setShowHint(false);
    setMood(null);
  }

  function reset() {
    dragRef.current = null;
    setSlots(cfg.prefill.slice());
    setPulse((p) => p + 1);
    setLastPlaced(null);
    setDone(false);
    setCelebrate(false);
    setMood(null);
  }

  // ---- derived ----
  const c = countOf(slots);
  const P = pts(N);
  const step = 360 / N;
  const stops = slots
    .map((col, i) => `${col ? FILL[col] : FILL.empty} ${(i * step).toFixed(2)}deg ${((i + 1) * step).toFixed(2)}deg`)
    .join(", ");
  const conicStyle = `conic-gradient(from 0deg, ${stops})`;

  const removed = removedOf(slots, cfg);
  const anyActivity = cfg.kind === "sub" ? removed > 0 : c.filled > 0;
  const effMood = mood || (done ? "happy" : anyActivity ? "think" : "idle");
  const emoteMap: Record<string, string> = { idle: "🙂", think: "🤔", happy: "😄", oops: "😅" };
  const namMood = mood === "happy" ? "happy" : mood === "oops" ? "oops" : "cheerful";

  let speech: string;
  if (effMood === "oops")
    speech = cfg.kind === "sub" ? "Ăn hơi nhiều rồi! Bỏ bớt lại nhé." : "Nhiều quá rồi! Lấy bớt ra một chút nào.";
  else if (done) speech = "Xuất sắc! Em làm đúng rồi 🎉";
  else if (showHint)
    speech =
      cfg.kind === "add"
        ? "An 1/2 = 3 miếng 🍫, Bình 1/3 = 2 miếng 🍓 nha!"
        : cfg.kind === "sub"
          ? "Ăn đúng 2 miếng (1/3) thôi nhé!"
          : "Kéo đủ 3 miếng 1/4, mỗi bạn một miếng!";
  else if (!anyActivity) speech = cfg.kind === "sub" ? "Bấm vào miếng bánh để ăn nào!" : "Kéo miếng bánh vào đĩa để bắt đầu nhé!";
  else speech = "Đang tốt lắm, cố lên nào!";

  // equation
  let eqText: string, eqCaption: string, winTitle: string, winSub: string;
  if (cfg.kind === "add") {
    eqText = `${c.choc}/6 + ${c.straw}/6 = ${c.filled > 0 ? c.filled + "/6" : "?"}`;
    eqCaption = "🍫 An 1/2 = 3/6 · 🍓 Bình 1/3 = 2/6 · đều theo phần 1/6";
    winTitle = "Chuẩn luôn! 1/2 + 1/3 = 5/6";
    winSub = "3 miếng sô-cô-la + 2 miếng dâu = 5 miếng = 5/6 bánh 👏";
  } else if (cfg.kind === "sub") {
    eqText = `5/6 − ${removed}/6 = ${c.filled}/6`;
    eqCaption = "🍫 Bắt đầu 5/6 · ăn 1/3 = 2 miếng · còn lại tính theo 1/6";
    winTitle = "Giỏi quá! 5/6 − 1/3 = 3/6 = 1/2";
    winSub = "Ăn 2 miếng, còn lại 3 miếng = 1/2 cái bánh 🎉";
  } else {
    eqText = `1/4 × ${c.straw} = ${c.straw > 0 ? c.straw + "/4" : "?"}`;
    eqCaption = "🍓 Lấy 1/4 lặp lại · 3 bạn = 3 lần 1/4";
    winTitle = "Tuyệt! 1/4 × 3 = 3/4";
    winSub = "Ba bạn, mỗi bạn 1/4 → cả nhóm ăn 3/4 cái bánh 🎉";
  }

  const tabBase: CSSProperties = {
    ...POPPINS,
    borderRadius: 13,
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    transition: "all .15s",
  };
  const tabStyle = (active: boolean): CSSProperties =>
    active ? { ...tabBase, background: "#16161F", color: "#fff" } : { ...tabBase, background: "#fff", color: "#5b6072", border: "1px solid #eef1f4" };

  const barCell = (col: string | null, dash?: string): CSSProperties => ({
    flex: 1,
    borderRadius: 9,
    ...(col ? { background: col } : { background: "#f6efe9", border: `2px dashed ${dash}` }),
  });

  // story rows
  interface StoryRow {
    label: string;
    badge: string;
    badgeStyle: CSSProperties;
    cells: CSSProperties[];
  }
  const chocBar = "linear-gradient(135deg,#8a5a3a,#5a3620)";
  const strawBar = "linear-gradient(135deg,#ff8fb0,#e84d7a)";
  const badgeChoc: CSSProperties = { fontSize: 11, fontWeight: 800, color: "#7B4A2C", background: "#f3e9e1", padding: "2px 8px", borderRadius: 999 };
  const badgeStraw: CSSProperties = { fontSize: 11, fontWeight: 800, color: "#D94E79", background: "#fdebf1", padding: "2px 8px", borderRadius: 999 };
  const badgePurple: CSSProperties = { fontSize: 11, fontWeight: 800, color: "#7C46E8", background: "#efe9fd", padding: "2px 8px", borderRadius: 999 };
  let storyRows: StoryRow[];
  if (cfg.kind === "add") {
    storyRows = [
      { label: "🍫 An ăn 1/2 bánh", badge: "= 3/6", badgeStyle: badgeChoc, cells: [barCell(chocBar), barCell(null, "#e0cbba")] },
      { label: "🍓 Bình ăn 1/3 bánh", badge: "= 2/6", badgeStyle: badgeStraw, cells: [barCell(strawBar), barCell(null, "#f7d3e0"), barCell(null, "#f7d3e0")] },
    ];
  } else if (cfg.kind === "sub") {
    storyRows = [
      { label: "🍫 Có 5/6 cái bánh", badge: "5/6", badgeStyle: badgeChoc, cells: [...Array(5)].map(() => barCell(chocBar)).concat([barCell(null, "#e0cbba")]) },
      { label: "😋 Ăn mất 1/3", badge: "− 2/6", badgeStyle: badgeStraw, cells: [barCell(strawBar), barCell(strawBar)] },
    ];
  } else {
    storyRows = [
      { label: "🍓 Mỗi bạn ăn 1/4", badge: "1/4", badgeStyle: badgeStraw, cells: [barCell(strawBar), barCell(null, "#f7d3e0"), barCell(null, "#f7d3e0"), barCell(null, "#f7d3e0")] },
      { label: "👧🧒👦 Có 3 bạn", badge: "× 3", badgeStyle: badgePurple, cells: [barCell(strawBar), barCell(strawBar), barCell(strawBar), barCell(null, "#f7d3e0")] },
    ];
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "26px 32px 44px",
        fontFamily: "'Inter', sans-serif",
        color: "#16161F",
        background:
          "radial-gradient(680px 340px at 12% -6%, rgba(20,217,192,.16), transparent 60%), radial-gradient(620px 380px at 100% 6%, rgba(124,70,232,.13), transparent 60%), #F4FBF9",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div
          onClick={onBack}
          style={{ background: "#fff", border: "1px solid #eef1f4", borderRadius: 12, padding: "9px 13px", fontSize: 13, fontWeight: 700, color: "#5b6072", cursor: "pointer" }}
        >
          ← Bài học
        </div>
        <div>
          <div style={{ ...BALOO, fontWeight: 800, fontSize: 24 }}>🍰 Phòng bánh phân số</div>
          <div style={{ fontSize: 13, color: "#6b7180" }}>{cfg.subtitle}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 9 }}>
          <div onClick={() => setShowHint((h) => !h)} style={{ ...POPPINS, background: "#faf7ff", border: "1px solid #ece5fb", color: "#7C46E8", borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
            💡 Gợi ý
          </div>
          <div onClick={reset} style={{ background: "#fff", border: "1px solid #eef1f4", color: "#5b6072", borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            ↺ Làm lại
          </div>
        </div>
      </div>

      {/* operation tabs */}
      <div style={{ display: "flex", gap: 9, marginBottom: 20 }}>
        <div onClick={() => changeMode("add")} style={tabStyle(mode === "add")}>➕ Cộng</div>
        <div onClick={() => changeMode("sub")} style={tabStyle(mode === "sub")}>➖ Trừ</div>
        <div onClick={() => changeMode("mul")} style={tabStyle(mode === "mul")}>✖️ Nhân</div>
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "stretch", flexWrap: "wrap" }}>
        {/* LEFT: story + mascot */}
        <div style={{ width: 300, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", border: "1px solid #eef1f4", borderRadius: 20, padding: 20, boxShadow: "0 14px 32px -26px rgba(0,0,0,.28)" }}>
            <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#9aa1b0", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 14 }}>Câu chuyện</div>
            {storyRows.map((r, ri) => (
              <div key={ri} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#16161F" }}>{r.label}</span>
                  <span style={r.badgeStyle}>{r.badge}</span>
                </div>
                <div style={{ display: "flex", gap: 3, height: 34 }}>
                  {r.cells.map((cell, ci) => (
                    <div key={ci} style={cell} />
                  ))}
                </div>
              </div>
            ))}
            <div style={{ background: "#FFF7E8", border: "1px solid #ffe9bf", borderRadius: 12, padding: "9px 11px", fontSize: 11.5, color: "#8a6a1e", lineHeight: 1.5, fontWeight: 600 }}>
              💡 {cfg.storyTip}
            </div>
          </div>

          {/* mascot */}
          <div style={{ background: "linear-gradient(160deg,#faf7ff,#f2eefb)", border: "1px solid #ece5fb", borderRadius: 20, padding: 18, display: "flex", gap: 13, alignItems: "center" }}>
            <div style={{ position: "relative", height: 74, width: 74, flexShrink: 0 }}>
              <Character char={char} mood={namMood} size={74} face="left" />
              <div key={emoteKey} style={{ position: "absolute", top: -4, right: -6, fontSize: 20, animation: "ml-emote .35s ease both" }}>
                {emoteMap[effMood]}
              </div>
            </div>
            <div>
              <div style={{ ...POPPINS, fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{buddyName}</div>
              <div style={{ fontSize: 12.5, color: "#4b5060", lineHeight: 1.55 }}>{speech}</div>
            </div>
          </div>
        </div>

        {/* RIGHT: workbench */}
        <div style={{ flex: 1, minWidth: 520, background: "#fff", border: "1px solid #eef1f4", borderRadius: 24, padding: "24px 28px", boxShadow: "0 16px 36px -26px rgba(0,0,0,.28)", display: "flex", flexDirection: "column" }}>
          <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#9aa1b0", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{cfg.workTitle}</div>
          <div style={{ fontSize: 13, color: "#6b7180", marginBottom: 18 }}>{cfg.workHint}</div>

          {/* palette */}
          {cfg.palette.length > 0 && (
            <div style={{ display: "flex", gap: 14, marginBottom: 22 }}>
              {cfg.palette.map((p) => {
                const have = c[p.key];
                const okc = have === p.need;
                const accent = p.key === "choc" ? "#7B4A2C" : "#D94E79";
                return (
                  <div
                    key={p.key}
                    style={{
                      flex: 1,
                      background: p.key === "choc" ? "#f7efe9" : "#fdeef3",
                      border: `1px solid ${p.key === "choc" ? "#ecdcd0" : "#f7d3e0"}`,
                      borderRadius: 16,
                      padding: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 13,
                    }}
                  >
                    <div
                      className="fl-chip"
                      draggable
                      onDragStart={() => {
                        dragRef.current = p.key;
                      }}
                      style={{ position: "relative", height: 56, width: 56, flexShrink: 0, filter: "drop-shadow(0 6px 8px rgba(90,50,20,.3))" }}
                    >
                      <div style={{ position: "absolute", inset: 0, clipPath: "polygon(50% 3%,100% 100%,0 100%)", background: SLICE_GRAD[p.key] }} />
                      <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", fontSize: 13 }}>{p.emoji}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: accent }}>{p.name}</div>
                      <div style={{ fontSize: 10.5, color: "#a99", margin: "1px 0 3px" }}>mỗi miếng = {p.unit}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 1, color: okc ? accent : "#a99" }}>
                        {okc ? `✓ đủ ${p.need} miếng!` : `${p.who} cần ${p.need} miếng · có ${have}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* eat instruction (sub) */}
          {cfg.kind === "sub" && (
            <div style={{ background: "#f7efe9", border: "1px solid #ecdcd0", borderRadius: 16, padding: "14px 16px", marginBottom: 22, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 26 }}>😋</span>
              <div style={{ fontSize: 13, color: "#7B4A2C", fontWeight: 700 }}>Bấm vào miếng bánh để ăn. Cần ăn đúng 1/3 = 2 miếng.</div>
            </div>
          )}

          {/* round cake */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "2px 0 6px" }}>
            <div style={{ position: "relative", width: 236, height: 236, animation: "fl-bob 3.8s ease-in-out infinite" }}>
              <div key={pulse} onDragOver={(e) => e.preventDefault()} onDrop={dropCake} style={{ position: "absolute", inset: 0, animation: "fl-squish .4s ease" }}>
                <div style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)", width: 216, height: 26, background: "radial-gradient(closest-side,rgba(20,30,45,.16),transparent)", borderRadius: "50%" }} />
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: conicStyle, boxShadow: "inset 0 7px 15px rgba(255,255,255,.5),inset 0 -12px 20px rgba(150,110,60,.2),0 16px 32px -12px rgba(0,0,0,.28)" }} />
                {lastPlaced !== null && lastColor && (
                  <div
                    key={`last-${lastPlaced}-${pulse}`}
                    style={{
                      position: "absolute",
                      inset: 0,
                      clipPath: `polygon(50% 50%, ${P[lastPlaced].x}% ${P[lastPlaced].y}%, ${P[(lastPlaced + 1) % N].x}% ${P[(lastPlaced + 1) % N].y}%)`,
                      background: FILL[lastColor],
                      animation: "fl-slice-in .45s cubic-bezier(.16,1,.3,1)",
                      pointerEvents: "none",
                    }}
                  />
                )}
                <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                  <circle cx="50" cy="50" r="48.5" fill="none" stroke="#ffffff" strokeWidth="2.6" opacity="0.9" />
                  {P.map((p, i) => (
                    <line key={i} x1="50" y1="50" x2={p.lx} y2={p.ly} stroke="#ffffff" strokeWidth="1.4" opacity="0.7" />
                  ))}
                  <circle cx="50" cy="50" r="16" fill="#ffffff" opacity="0.95" />
                </svg>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 24 }}>🍓</div>
                {done && (
                  <div style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", fontSize: 24, animation: "fl-float 2s ease-in-out infinite" }}>🎂</div>
                )}
                {slots.map((col, i) => {
                  const a = P[i];
                  const b = P[(i + 1) % N];
                  return (
                    <div
                      key={i}
                      onClick={() => clearAt(i)}
                      style={{
                        position: "absolute",
                        inset: 0,
                        clipPath: `polygon(50% 50%, ${a.x}% ${a.y}%, ${b.x}% ${b.y}%)`,
                        cursor: col ? "pointer" : "default",
                        pointerEvents: col ? "auto" : "none",
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#a2a8b4", marginTop: 16 }}>{cfg.cakeTip}</div>
          </div>

          {/* equation */}
          <div style={{ marginTop: "auto", background: "linear-gradient(135deg,#f7efe9,#fdeef3)", border: "1px solid #eef1f4", borderRadius: 18, padding: "16px 20px" }}>
            <div style={{ ...BALOO, textAlign: "center", fontWeight: 800, fontSize: 26, color: "#16161F" }}>{eqText}</div>
            <div style={{ textAlign: "center", fontSize: 11, color: "#8a90a0", fontWeight: 600, marginTop: 6 }}>{eqCaption}</div>
          </div>

          {done && (
            <div style={{ marginTop: 14, background: "linear-gradient(135deg,#14D9C0,#0FB9A6)", color: "#fff", borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 14px 28px -12px rgba(15,185,166,.6)", animation: "fl-slice-in .4s ease" }}>
              <span style={{ fontSize: 32 }}>🎉</span>
              <div>
                <div style={{ ...BALOO, fontWeight: 800, fontSize: 18 }}>{winTitle}</div>
                <div style={{ fontSize: 12.5, opacity: 0.95 }}>{winSub}</div>
              </div>
              <div style={{ ...POPPINS, marginLeft: "auto", background: "rgba(255,255,255,.2)", borderRadius: 12, padding: "10px 16px", fontWeight: 800, fontSize: 13, whiteSpace: "nowrap" }}>+15 ⭐</div>
            </div>
          )}
        </div>
      </div>

      {celebrate && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 60 }}>
          {confetti.map((cf2, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                top: -20,
                left: `${cf2.left}%`,
                width: 9,
                height: 14,
                borderRadius: 3,
                background: cf2.color,
                transform: `rotate(${cf2.rot}deg)`,
                animation: `fl-fall ${cf2.dur}s linear ${cf2.delay}s forwards`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
