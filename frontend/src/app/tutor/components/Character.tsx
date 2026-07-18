"use client";

/**
 * Character — nhân vật đồng hành (Nấm 🍄 / Cừu 🐑) dựng từ PNG sprite sheet.
 * Port từ handoff design (Nam.dc.html). Sprite ở /public/characters/{character,sheep}/*.png,
 * mỗi khung 512×512, dải ngang. Animate bằng CSS steps() (keyframes spr-slide/spr-bob ở globals.css).
 *
 * Dùng: <Character char="nam" mood="cheerful" size={140} face="left" />
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";

const FRAME = 512;

export type CharKind = "nam" | "sheep";
export type Mood = "idle" | "cheerful" | "happy" | "oops" | "walk" | "run" | "jump" | "attack";

interface SpriteDef {
  sheet: string;
  f: number; // số khung
  dur: number; // thời lượng 1 vòng (giây)
  bob: boolean; // có nhún nhẹ khi đứng yên
}

const SPRITES: Record<CharKind, Record<string, SpriteDef>> = {
  nam: {
    idle: { sheet: "Idle", f: 2, dur: 1.4, bob: true },
    happy: { sheet: "Happy", f: 2, dur: 0.5, bob: true },
    oops: { sheet: "RecieveDamage", f: 4, dur: 0.55, bob: true },
    walk: { sheet: "Walk", f: 4, dur: 0.6, bob: false },
    run: { sheet: "Run", f: 4, dur: 0.45, bob: false },
    jump: { sheet: "Jump", f: 11, dur: 1.0, bob: false },
    attack: { sheet: "Attack", f: 6, dur: 0.7, bob: false },
  },
  sheep: {
    idle: { sheet: "Idle", f: 4, dur: 1.1, bob: true },
    happy: { sheet: "Happy", f: 10, dur: 0.9, bob: true },
    oops: { sheet: "RecieveDamage", f: 4, dur: 0.55, bob: true },
    walk: { sheet: "Walk", f: 8, dur: 0.8, bob: false },
    run: { sheet: "Run", f: 6, dur: 0.5, bob: false },
    jump: { sheet: "Jump", f: 6, dur: 0.9, bob: false },
    attack: { sheet: "Happy", f: 10, dur: 0.9, bob: false },
  },
};

export interface CharacterProps {
  char?: CharKind;
  mood?: Mood;
  size?: number;
  face?: "left" | "right";
  className?: string;
  style?: CSSProperties;
}

export default function Character({
  char = "nam",
  mood = "cheerful",
  size = 140,
  face = "left",
  className,
  style,
}: CharacterProps) {
  // cheerful: đa phần idle, thỉnh thoảng cười 1 nhịp rồi về idle (hẹn giờ ngẫu nhiên).
  const [phase, setPhase] = useState<"idle" | "happy">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mood !== "cheerful") return;
    setPhase("idle");
    let cancelled = false;
    const loop = () => {
      const idleMs = 3800 + Math.random() * 3200;
      timer.current = setTimeout(() => {
        if (cancelled) return;
        setPhase("happy");
        const happyMs = 1100 + Math.random() * 700;
        timer.current = setTimeout(() => {
          if (cancelled) return;
          setPhase("idle");
          loop();
        }, happyMs);
      }, idleMs);
    };
    loop();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [mood]);

  const folder = char === "nam" ? "character" : "sheep";
  const table = SPRITES[char] ?? SPRITES.nam;
  const scale = size / FRAME;

  const buildLayer = (key: string, active: boolean, i: number) => {
    const mm = table[key] ?? table.idle;
    const imgStyle: CSSProperties = {
      width: FRAME * mm.f,
      // Tailwind preflight đặt img{max-width:100%} → phải bỏ, nếu không dải sprite bị ép co lại
      maxWidth: "none",
      height: FRAME,
      display: "block",
      // dịch cả dải sang trái đúng bằng bề rộng để steps() lật từng khung
      ["--spr-end" as string]: `-${FRAME * mm.f}px`,
      animation: `spr-slide ${mm.dur}s steps(${mm.f}) infinite`,
    } as CSSProperties;
    const layerStyle: CSSProperties = {
      position: "absolute",
      inset: 0,
      opacity: active ? 1 : 0,
      transition: "opacity .22s ease",
    };
    // cắt khung ở độ phân giải gốc 512 rồi mới scale (tránh rỉ mép)
    const winStyle: CSSProperties = {
      width: FRAME,
      height: FRAME,
      overflow: "hidden",
      transform: `scale(${scale})`,
      transformOrigin: "top left",
    };
    return (
      <div key={i} style={layerStyle}>
        <div style={winStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/characters/${folder}/${mm.sheet}.png`} style={imgStyle} alt="" />
        </div>
      </div>
    );
  };

  let layers: React.ReactNode[];
  let bob: boolean;
  if (mood === "cheerful") {
    layers = [buildLayer("idle", phase === "idle", 0), buildLayer("happy", phase === "happy", 1)];
    bob = true;
  } else {
    const mm = table[mood] ?? table.idle;
    layers = [buildLayer(mood, true, 0)];
    bob = mm.bob;
  }

  const outerStyle: CSSProperties = {
    display: "inline-block",
    width: size,
    height: size,
    overflow: "hidden",
    // sprite vẽ nhìn phải → "left" là lật gương
    transform: `scaleX(${face === "left" ? -1 : 1})`,
    ...style,
  };
  const bobStyle: CSSProperties = {
    width: size,
    height: size,
    overflow: "hidden",
    animation: bob ? "spr-bob 2.8s ease-in-out infinite" : undefined,
  };

  return (
    <div className={className} style={outerStyle}>
      <div style={bobStyle}>
        <div style={{ position: "relative", width: "100%", height: "100%" }}>{layers}</div>
      </div>
    </div>
  );
}
