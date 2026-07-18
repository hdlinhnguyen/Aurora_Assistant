"use client";

/**
 * Aurora Badge Cabinet — Tủ huy hiệu của học sinh.
 * Tiêu thụ GET /student/badges (gamification backend). Medal dựng thuần CSS (clip-path).
 */

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { getBadges, type BadgeView, type GameSummary } from "../hub/api";

const BALOO: CSSProperties = { fontFamily: "'Baloo 2', system-ui, sans-serif" };
const POPPINS: CSSProperties = { fontFamily: "'Poppins', system-ui, sans-serif" };

function clipFor(shape: string): string | undefined {
  switch (shape) {
    case "hexagon":
      return "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)";
    case "star":
      return "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)";
    case "shield":
      return "polygon(50% 0,100% 12%,100% 55%,50% 100%,0 55%,0 12%)";
    case "octagon":
      return "polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)";
    default:
      return undefined; // circle
  }
}

function Medal({
  shape,
  colorFrom,
  colorTo,
  glyph,
  size,
  earned,
}: {
  shape: string;
  colorFrom: string;
  colorTo: string;
  glyph: string;
  size: number;
  earned: boolean;
}) {
  const clip = clipFor(shape);
  const radius = clip ? undefined : "50%";
  const inset = Math.round(size * 0.093);
  const glyphSize = Math.round(size * 0.42);
  const outerBg = earned
    ? `linear-gradient(135deg,${colorFrom},${colorTo})`
    : "linear-gradient(135deg,#dfe6ea,#c3ccd4)";
  const innerBg = earned
    ? `linear-gradient(135deg,rgba(255,255,255,.55),${colorTo})`
    : "linear-gradient(135deg,#eef2f5,#dbe2e8)";
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        animation: earned ? "ah-float 3.6s ease-in-out infinite" : undefined,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: outerBg,
          clipPath: clip,
          borderRadius: radius,
          boxShadow: earned ? `0 14px 26px -12px ${colorTo}` : "0 8px 16px -12px rgba(0,0,0,.25)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset,
          background: innerBg,
          clipPath: clip,
          borderRadius: radius,
          display: "grid",
          placeItems: "center",
          boxShadow: earned ? "inset 0 2px 7px rgba(255,255,255,.65)" : "none",
        }}
      >
        <span
          style={{
            fontSize: glyphSize,
            filter: earned ? "drop-shadow(0 2px 3px rgba(0,0,0,.22))" : "grayscale(1)",
            opacity: earned ? 1 : 0.5,
          }}
        >
          {glyph}
        </span>
      </div>
      {earned && <span style={{ position: "absolute", top: -2, right: 0, fontSize: Math.round(size * 0.2) }}>✨</span>}
    </div>
  );
}

type Filter = "all" | "earned" | "progress";

const NAV = [
  { icon: "🏠", label: "Học hôm nay", href: "/tutor/hub", active: false },
  { icon: "🗺️", label: "Lộ trình", href: "/tutor", active: false },
  { icon: "🏆", label: "Tủ huy hiệu", href: "/tutor/badges", active: true },
  { icon: "📊", label: "Tiến bộ của em", href: "/tutor", active: false },
];

export default function BadgeCabinetPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [studentName, setStudentName] = useState("bạn");
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<BadgeView | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("aurora_user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.name) setStudentName(u.name);
      }
    } catch {
      /* ignore */
    }
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const s = await getBadges();
      setSummary(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được tủ huy hiệu.");
    } finally {
      setLoading(false);
    }
  }

  const badges = summary?.badges ?? [];
  const counts = {
    all: badges.length,
    earned: badges.filter((b) => b.status === "earned").length,
    progress: badges.filter((b) => b.status === "progress").length,
  };
  const shown =
    filter === "all" ? badges : badges.filter((b) => b.status === filter);

  const xpPct = summary && summary.xpForLevel > 0 ? Math.round((summary.xpIntoLevel / summary.xpForLevel) * 100) : 0;

  return (
    <div style={{ height: "100vh", minHeight: 720, display: "flex", overflow: "hidden", background: "#F4FBF9", fontFamily: "'Inter', sans-serif", color: "#16161F" }}>
      {/* ===== NAV RAIL ===== */}
      <aside style={{ width: 250, background: "#fff", borderRight: "1px solid #eef1f4", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid #f2f4f7", display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ ...POPPINS, height: 38, width: 38, borderRadius: 12, background: "linear-gradient(135deg,#14D9C0,#7C46E8)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 18 }}>A</div>
          <div>
            <div style={{ ...POPPINS, fontWeight: 800, fontSize: 16, lineHeight: 1 }}>Aurora</div>
            <div style={{ fontSize: 11, color: "#9aa1b0", marginTop: 2 }}>Học thật, hiểu thật</div>
          </div>
        </div>
        <div style={{ padding: "14px 12px", flex: 1 }}>
          {NAV.map((n) => (
            <Link
              key={n.label}
              href={n.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "11px 13px",
                borderRadius: 13,
                marginBottom: 5,
                textDecoration: "none",
                fontSize: 13.5,
                fontWeight: n.active ? 800 : 600,
                color: n.active ? "#5b2fc0" : "#5b6072",
                background: n.active ? "linear-gradient(135deg,#EFE9FD,#f6f1ff)" : "transparent",
                boxShadow: n.active ? "inset 0 0 0 2px #7C46E8" : "none",
              }}
            >
              <span style={{ fontSize: 16 }}>{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </div>
        <div style={{ padding: 14, borderTop: "1px solid #f2f4f7", display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ ...POPPINS, height: 38, width: 38, borderRadius: "50%", background: "linear-gradient(135deg,#ffd76f,#ff9f43)", display: "grid", placeItems: "center", fontWeight: 800, color: "#7a4b00" }}>
            {studentName.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{studentName}</div>
            <div style={{ fontSize: 11, color: "#9aa1b0" }}>Cấp {summary?.level ?? 1} · ⭐ {summary?.stars ?? 0}</div>
          </div>
        </div>
      </aside>

      {/* ===== MAIN ===== */}
      <main style={{ flex: 1, overflowY: "auto", padding: "24px 34px 44px" }}>
        {loading ? (
          <div style={{ display: "grid", placeItems: "center", height: "70vh", color: "#5b6072" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 34, marginBottom: 10 }}>🏆</div>
              <div style={{ ...POPPINS, fontWeight: 700 }}>Đang mở tủ huy hiệu…</div>
            </div>
          </div>
        ) : error ? (
          <div style={{ display: "grid", placeItems: "center", height: "70vh" }}>
            <div style={{ textAlign: "center", maxWidth: 420 }}>
              <div style={{ fontSize: 34, marginBottom: 10 }}>😅</div>
              <div style={{ ...POPPINS, fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Chưa tải được</div>
              <div style={{ color: "#5b6072", fontSize: 14, marginBottom: 18 }}>{error}</div>
              <button onClick={load} style={{ ...POPPINS, border: "none", background: "linear-gradient(135deg,#14D9C0,#0FB9A6)", color: "#fff", borderRadius: 12, padding: "12px 22px", fontWeight: 800, cursor: "pointer" }}>
                Thử lại
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* HERO */}
            <div
              style={{
                background: "linear-gradient(120deg,#7C46E8,#8B5CF6 55%,#14D9C0)",
                borderRadius: 24,
                padding: "26px 30px",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 20,
                boxShadow: "0 24px 46px -26px rgba(124,70,232,.7)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ position: "absolute", right: -30, top: -46, height: 180, width: 180, borderRadius: "50%", background: "rgba(255,255,255,.12)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 18, position: "relative", zIndex: 1, minWidth: 0 }}>
                <div style={{ height: 76, width: 76, borderRadius: 20, background: "rgba(255,255,255,.2)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", fontSize: 40, flexShrink: 0 }}>🏆</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.9, ...POPPINS }}>Tủ huy hiệu của {studentName}</div>
                  <div style={{ ...BALOO, fontWeight: 800, fontSize: 26, lineHeight: 1.1, margin: "3px 0 8px" }}>
                    Đã sưu tầm {counts.earned}/{counts.all} huy hiệu
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.2)", borderRadius: 999, padding: "4px 13px", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                    ⭐ Cấp {summary?.level ?? 1} · Nhà thám hiểm
                  </div>
                  <div style={{ height: 7, width: 240, maxWidth: "100%", background: "rgba(255,255,255,.28)", borderRadius: 7 }}>
                    <div style={{ height: 7, width: `${xpPct}%`, background: "#fff", borderRadius: 7 }} />
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.92, marginTop: 5 }}>
                    {summary?.xpIntoLevel ?? 0}/{summary?.xpForLevel ?? 1000} XP
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, position: "relative", zIndex: 1, flexShrink: 0 }}>
                <div style={{ textAlign: "center", background: "rgba(255,255,255,.18)", borderRadius: 16, padding: "14px 18px", minWidth: 84 }}>
                  <div style={{ ...POPPINS, fontWeight: 800, fontSize: 22 }}>🔥 {summary?.currentStreak ?? 0}</div>
                  <div style={{ fontSize: 10.5, opacity: 0.92 }}>ngày liên tục</div>
                </div>
                <div style={{ textAlign: "center", background: "rgba(255,255,255,.18)", borderRadius: 16, padding: "14px 18px", minWidth: 84 }}>
                  <div style={{ ...POPPINS, fontWeight: 800, fontSize: 22 }}>⭐ {summary?.stars ?? 0}</div>
                  <div style={{ fontSize: 10.5, opacity: 0.92 }}>tổng sao</div>
                </div>
              </div>
            </div>

            {/* FILTER TABS */}
            <div style={{ display: "flex", gap: 9, margin: "22px 0 18px" }}>
              {([
                { key: "all" as Filter, label: "Tất cả", n: counts.all },
                { key: "earned" as Filter, label: "✓ Đã mở khóa", n: counts.earned },
                { key: "progress" as Filter, label: "⏳ Đang tiến hành", n: counts.progress },
              ]).map((f) => {
                const on = filter === f.key;
                return (
                  <div
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    style={{
                      ...POPPINS,
                      borderRadius: 13,
                      padding: "9px 16px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      background: on ? "#16161F" : "#fff",
                      color: on ? "#fff" : "#5b6072",
                      border: on ? "none" : "1px solid #eef1f4",
                    }}
                  >
                    {f.label}
                    <span style={{ background: on ? "rgba(255,255,255,.22)" : "#EFE9FD", color: on ? "#fff" : "#7C46E8", fontSize: 11, padding: "1px 8px", borderRadius: 999, fontFamily: "'Inter', sans-serif" }}>
                      {f.n}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* GRID */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(212px, 1fr))", gap: 20 }}>
              {shown.map((b) => {
                const earned = b.status === "earned";
                return (
                  <div
                    key={b.code}
                    onClick={() => setDetail(b)}
                    style={{
                      background: "#fff",
                      border: "1px solid #eef1f4",
                      borderRadius: 22,
                      padding: "22px 18px 18px",
                      textAlign: "center",
                      cursor: "pointer",
                      boxShadow: "0 14px 34px -26px rgba(0,0,0,.28)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}
                  >
                    <Medal shape={b.shape} colorFrom={b.colorFrom} colorTo={b.colorTo} glyph={b.glyph} size={108} earned={earned} />
                    <div style={{ ...BALOO, fontWeight: 800, fontSize: 16, marginTop: 14, color: earned ? "#16161F" : "#8a909e" }}>{b.name}</div>
                    <div style={{ fontSize: 12, color: "#7c8194", lineHeight: 1.5, marginTop: 5, minHeight: 34 }}>{b.description}</div>
                    <div style={{ marginTop: 12, width: "100%" }}>
                      {earned ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#F0FCF8", border: "1px solid #b8ede0", color: "#0d7a6c", fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 999 }}>
                          ✓ Đã mở khóa
                        </div>
                      ) : b.status === "progress" ? (
                        <div>
                          <div style={{ height: 6, background: "#eef1f4", borderRadius: 6 }}>
                            <div style={{ height: 6, width: `${b.pct}%`, background: "linear-gradient(90deg,#8B5CF6,#7C46E8)", borderRadius: 6 }} />
                          </div>
                          <div style={{ fontSize: 11, color: "#7C46E8", fontWeight: 700, marginTop: 5 }}>
                            {b.progress}/{b.threshold} · {b.pct}%
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "#a2a8b4", fontWeight: 600 }}>🔒 Chưa mở khóa</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {shown.length === 0 && (
              <div style={{ textAlign: "center", color: "#9aa1b0", padding: "50px 0", ...POPPINS, fontWeight: 700 }}>Chưa có huy hiệu nào ở mục này.</div>
            )}
          </>
        )}
      </main>

      {/* ===== DETAIL MODAL ===== */}
      {detail && (
        <div
          onClick={() => setDetail(null)}
          style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(20,30,45,.55)", backdropFilter: "blur(6px)", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 28, maxWidth: 420, width: "100%", padding: "34px 34px 26px", textAlign: "center", boxShadow: "0 40px 90px -30px rgba(0,0,0,.55)", animation: "ah-pop .4s cubic-bezier(.16,1,.3,1)" }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <Medal shape={detail.shape} colorFrom={detail.colorFrom} colorTo={detail.colorTo} glyph={detail.glyph} size={132} earned={detail.status === "earned"} />
            </div>
            <div style={{ ...POPPINS, display: "inline-block", background: "#faf7ff", border: "1px solid #ece5fb", color: "#7C46E8", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", padding: "4px 13px", borderRadius: 999, marginBottom: 10 }}>
              {detail.category}
            </div>
            <div style={{ ...BALOO, fontWeight: 800, fontSize: 24, marginBottom: 7 }}>{detail.name}</div>
            <div style={{ fontSize: 14, color: "#5b6072", lineHeight: 1.6, marginBottom: 18 }}>{detail.description}</div>
            <div
              style={{
                borderRadius: 16,
                padding: "14px 16px",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 20,
                ...(detail.status === "earned"
                  ? { background: "#F0FCF8", border: "1px solid #b8ede0", color: "#0d7a6c" }
                  : detail.status === "progress"
                    ? { background: "#faf7ff", border: "1px solid #ece5fb", color: "#5b2fc0" }
                    : { background: "#f4f6f9", border: "1px solid #eef1f4", color: "#8a909e" }),
              }}
            >
              <div style={{ marginBottom: 4 }}>🎯 {detail.criteria}</div>
              {detail.status === "earned" ? (
                <div>✓ Đã đạt{detail.awardedAt ? ` · ${new Date(detail.awardedAt).toLocaleDateString("vi-VN")}` : ""}</div>
              ) : detail.status === "progress" ? (
                <div>⏳ Tiến độ: {detail.progress}/{detail.threshold} ({detail.pct}%)</div>
              ) : (
                <div>🔒 Chưa mở khóa</div>
              )}
            </div>
            <button
              onClick={() => setDetail(null)}
              style={{ ...POPPINS, width: "100%", border: "none", background: "#16161F", color: "#fff", borderRadius: 14, padding: 13, fontWeight: 800, fontSize: 14, cursor: "pointer" }}
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
