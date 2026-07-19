"use client";

import React from "react";

export type MascotState =
  | "waving"
  | "thinking"
  | "idle"
  | "waiting"
  | "encourage"
  | "celebrate"
  | "failed"
  | "review"
  | "jumping"
  | "running";

interface MascotCompanionProps {
  state: MascotState;
  name?: string;
  speechBubble?: string;
  badgeText?: string;
  compact?: boolean;
  borderless?: boolean;
}

const GIF_MAP: Record<MascotState, string> = {
  waving: "/gif/waving.gif",
  thinking: "/gif/thinking.gif",
  waiting: "/gif/waiting.gif",
  idle: "/gif/idle.gif",
  encourage: "/gif/encourage.gif",
  celebrate: "/gif/celebrate.gif",
  failed: "/gif/failed.gif",
  review: "/gif/review.gif",
  jumping: "/gif/jumping.gif",
  running: "/gif/running.gif",
};

const DEFAULT_MESSAGES: Record<MascotState, string> = {
  waving: "Chào em! Thầy/Cô Nova luôn sẵn sàng đồng hành cùng em nè! 👋",
  thinking: "Đang suy nghĩ và phân tích câu hỏi của em nha... 🤔💭",
  waiting: "Em cứ thắc mắc điều gì, cứ nhắn ngay cho Nova nhé! ✍️",
  idle: "Nova đang lắng nghe đây, em có câu hỏi gì không? 😊",
  encourage: "Cố lên em! Sai không sao cả, quan trọng là mình hiểu bản chất nè! 💪✨",
  celebrate: "Tuyệt vời quá! Em đã nắm đúng tư duy bài này rồi! 🎉⭐",
  failed: "Hình như có chút trục trặc nhỏ rồi, em thử gửi lại câu hỏi nha! 😅",
  review: "Hãy cùng rà soát lại lý thuyết và từng bước biến đổi nhé! 📖🔍",
  jumping: "Xuất sắc luôn! Em làm rất tốt! 🚀🌟",
  running: "Tốc độ học tập của em ấn tượng quá! 🏃‍♂️💨",
};

const DEFAULT_BADGES: Record<MascotState, { label: string; color: string; bg: string }> = {
  waving: { label: "● Đang chào bạn", color: "#0FB9A6", bg: "#E6F8F5" },
  thinking: { label: "● Đang suy nghĩ...", color: "#7C46E8", bg: "#F3EAFD" },
  waiting: { label: "● Đang lắng nghe", color: "#0FB9A6", bg: "#E6F8F5" },
  idle: { label: "● Sẵn sàng", color: "#3B82F6", bg: "#EFF6FF" },
  encourage: { label: "● Đang khích lệ", color: "#F59E0B", bg: "#FEF3C7" },
  celebrate: { label: "● Khởi sắc 🎉", color: "#10B981", bg: "#D1FAE5" },
  failed: { label: "● Cần kiểm tra", color: "#EF4444", bg: "#FEE2E2" },
  review: { label: "● Ôn tập kiến thức", color: "#8B5CF6", bg: "#F3E8FF" },
  jumping: { label: "● Hào hứng 🚀", color: "#EC4899", bg: "#FCE7F3" },
  running: { label: "● Đang tăng tốc", color: "#06B6D4", bg: "#CFFAFE" },
};

export default function MascotCompanion({
  state,
  name = "Nova",
  speechBubble,
  badgeText,
  compact = false,
  borderless = false,
}: MascotCompanionProps) {
  const gifSrc = GIF_MAP[state] || GIF_MAP.idle;
  const bubbleContent = speechBubble || DEFAULT_MESSAGES[state] || DEFAULT_MESSAGES.idle;
  const badgeInfo = DEFAULT_BADGES[state] || DEFAULT_BADGES.idle;

  return (
    <div
      className={borderless ? "" : "mascot-companion-container"}
      style={borderless ? {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: compact ? "6px 8px" : "12px 14px",
        background: "transparent",
        border: "none",
        position: "relative",
        width: "100%",
        flexShrink: 0,
      } : {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: compact ? "14px 16px" : "20px 22px",
        background: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
        border: "1px solid #e2e8f0",
        borderRadius: 24,
        boxShadow: "0 12px 30px -10px rgba(124, 70, 232, 0.12), 0 4px 12px rgba(0,0,0,0.03)",
        position: "relative",
        width: compact ? 220 : 250,
        flexShrink: 0,
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Dynamic Status Badge Header */}
      {!borderless && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            borderRadius: 999,
            background: badgeInfo.bg,
            color: badgeInfo.color,
            fontSize: 11.5,
            fontWeight: 700,
            marginBottom: 12,
            boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
          }}
        >
          <span>{badgeText || badgeInfo.label}</span>
        </div>
      )}

      {/* Speech Bubble */}
      <div
        style={{
          position: "relative",
          background: "linear-gradient(135deg, #7C46E8 0%, #6366F1 100%)",
          color: "#ffffff",
          borderRadius: 16,
          borderBottomLeftRadius: 4,
          padding: "10px 14px",
          fontSize: compact ? 12 : 12.5,
          fontWeight: 600,
          lineHeight: 1.5,
          textAlign: "center",
          marginBottom: 12,
          boxShadow: "0 8px 18px -4px rgba(124, 70, 232, 0.35)",
          width: "100%",
          wordBreak: "break-word",
        }}
      >
        {bubbleContent}
        {/* Tail pointing down towards mascot */}
        <div
          style={{
            position: "absolute",
            bottom: -6,
            left: "50%",
            transform: "translateX(-50%) rotate(45deg)",
            width: 12,
            height: 12,
            background: "#6366F1",
            borderRadius: 2,
          }}
        />
      </div>

      {/* Mascot GIF Container with Glowing Aura */}
      <div
        style={{
          position: "relative",
          width: compact ? 110 : 135,
          height: compact ? 110 : 135,
          display: "grid",
          placeItems: "center",
          marginTop: 4,
        }}
      >
        {/* Subtle Background Radial Glow */}
        <div
          style={{
            position: "absolute",
            inset: -8,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(124,70,232,0.15) 0%, rgba(20,217,192,0.05) 60%, transparent 80%)",
            filter: "blur(8px)",
            pointerEvents: "none",
          }}
        />

        {/* Mascot GIF Image */}
        <img
          src={gifSrc}
          alt={`Mascot ${name} - ${state}`}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            position: "relative",
            zIndex: 2,
            filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.1))",
            transition: "transform 0.3s ease",
          }}
          onError={(e) => {
            // Fallback to static png if gif loading fails
            (e.target as HTMLImageElement).src = "/nova.png";
          }}
        />
      </div>

      {/* Mascot Label Footer */}
      <div
        style={{
          marginTop: 10,
          fontSize: 13,
          fontWeight: 800,
          color: "#1e293b",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>Gia sư AI {name}</span>
        <span
          style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#10B981",
          }}
        />
      </div>
    </div>
  );
}
