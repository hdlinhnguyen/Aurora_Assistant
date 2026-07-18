"use client";

/** Trang thử component Character — xem nhanh mọi mood của Nấm & Cừu. */

import Character, { type CharKind, type Mood } from "../components/Character";

const MOODS: Mood[] = ["cheerful", "idle", "happy", "oops", "walk", "run", "jump", "attack"];

function Row({ char }: { char: CharKind }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 18, marginBottom: 12 }}>
        {char === "nam" ? "🍄 Nấm (character)" : "🐑 Cừu (sheep)"}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
        {MOODS.map((mood) => (
          <div
            key={mood}
            style={{
              width: 150,
              background: "#fff",
              border: "1px solid #eef1f4",
              borderRadius: 18,
              padding: 12,
              textAlign: "center",
              boxShadow: "0 10px 24px -20px rgba(0,0,0,.3)",
            }}
          >
            <div style={{ height: 130, display: "grid", placeItems: "center" }}>
              <Character char={char} mood={mood} size={120} face="right" />
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#5b6072", marginTop: 6 }}>{mood}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CharacterTestPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#F4FBF9", padding: "28px 34px", fontFamily: "'Inter', sans-serif", color: "#16161F" }}>
      <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 28, marginBottom: 6 }}>
        Character sprite — thử nghiệm
      </div>
      <div style={{ color: "#5b6072", fontSize: 14, marginBottom: 24 }}>
        Nhân vật đồng hành dựng từ PNG sprite sheet + CSS steps(). Mỗi ô là một mood.
      </div>
      <Row char="nam" />
      <Row char="sheep" />
    </div>
  );
}
