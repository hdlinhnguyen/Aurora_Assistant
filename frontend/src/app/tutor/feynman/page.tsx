"use client";

/**
 * Tập Vở Feynman — học sinh giảng lại bài cho nhân vật (bé Nấm/bé Cừu đóng vai học trò ngây thơ),
 * hệ thống chấm Clarity Score 0–100 để phát hiện "học vẹt". Port từ handoff "Aurora Feynman.dc.html".
 * Điểm chấm bằng LLM (POST /feynman/score); heuristic local là fallback khi offline/AI chưa cấu hình.
 * Mỗi lần nộp gửi POST /events/feynman → nguồn cho "Chỉ số Feynman Clarity" ở dashboard giáo viên.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  BookOpen,
  CircleHelp,
  LoaderCircle,
  MessageCircle,
  Mic,
  PenTool,
  Search,
} from "lucide-react";
import {
  buildRoadmap,
  getLearningPathLive,
  getMastery,
  getSubjects,
  getTree,
  postFeynmanEvent,
  scoreFeynman,
  type MasteryProfile,
} from "../hub/api";
import Character, { type Mood } from "../components/Character";
import { useCharacter } from "../components/character-context";

const BALOO: CSSProperties = { fontFamily: "'Baloo 2', system-ui, sans-serif" };
const POPPINS: CSSProperties = { fontFamily: "'Poppins', system-ui, sans-serif" };

type Tier = "high" | "mid" | "low";

interface SubBar {
  label: string;
  val: number; // 0..100
  color: string;
}

interface TierInfo {
  label: string;
  color: string;
  chip: string;
  chipBd: string;
  chipTx: string;
  msg: string;
  mood: Mood; // sprite không có "thinking"/"sad" → dùng idle/oops
  line: string;
}

const TIERS: Record<Tier, TierInfo> = {
  high: {
    label: "Thấu hiểu bản chất",
    color: "#0FB9A6",
    chip: "#F0FCF8",
    chipBd: "#b8ede0",
    chipTx: "#0d7a6c",
    msg: "Tuyệt vời! Em giảng rõ ràng, có ví dụ và đúng bản chất — đây là dấu hiệu em đã HIỂU THẬT chứ không học vẹt.",
    mood: "happy",
    line: "A! Con hiểu rồi! Em giảng hay quá, cảm ơn nha!",
  },
  mid: {
    label: "Hiểu khá",
    color: "#e0912a",
    chip: "#fff8ec",
    chipBd: "#ffe6bd",
    chipTx: "#b7811f",
    msg: "Em nắm được ý chính rồi, nhưng còn vài chỗ chưa rõ. Bổ sung ví dụ và giải thích kỹ hơn để bé hiểu trọn vẹn nhé.",
    mood: "idle",
    line: "Ừm... con hiểu kha khá rồi, nhưng còn thắc mắc chỗ này...",
  },
  low: {
    label: "Cần hiểu thêm",
    color: "#e05a7a",
    chip: "#fef3f5",
    chipBd: "#f8d3da",
    chipTx: "#c23a54",
    msg: "Lời giảng còn thiếu ý cốt lõi — có thể em đang học vẹt. Hãy quay lại xem lý thuyết rồi thử giảng lại thật đơn giản nhé!",
    mood: "oops",
    line: "Hừm... con vẫn thấy khó hiểu quá... anh/chị giảng kỹ hơn được không ạ?",
  },
};

interface Analysis {
  score: number;
  subBars: SubBar[];
  vagueSpots: string[];
  followUps: string[];
  tier: Tier;
}

/** Fallback bảo thủ, chỉ dùng cấu trúc lời giảng và chủ đề hiện tại. */
function analyze(text: string, topicName: string): Analysis {
  const low = text.toLowerCase();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const topicLabel = topicName.trim() || "chủ đề này";
  const topicWords = topicLabel
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !["các", "trên", "trong", "phép"].includes(word));
  const topicHits = topicWords.filter((word) => low.includes(word)).length;
  const topicCoverage = topicWords.length > 0 ? topicHits / topicWords.length : 0;
  const hasExample = /\b(ví dụ|chẳng hạn|như|gồm)\b/i.test(text) || /\d/.test(text);
  const explainsWhy = /\b(vì|bởi|do đó|nghĩa là|để)\b/i.test(text);

  const clear = Math.min(82, Math.round(25 + Math.min(45, words * 1.5)));
  const example = hasExample ? Math.min(78, Math.round(45 + words * 0.6)) : 15;
  const essence = Math.min(78, Math.round(topicCoverage * 45 + (explainsWhy ? 25 : 0) + (words >= 35 ? 8 : 0)));
  const score = Math.round(clear * 0.25 + example * 0.2 + essence * 0.55);

  const subBars: SubBar[] = [
    { label: "Rõ ràng", val: clear },
    { label: "Có ví dụ", val: example },
    { label: "Đúng bản chất", val: essence },
  ].map((b) => ({ ...b, color: b.val >= 70 ? "#0FB9A6" : b.val >= 45 ? "#e0912a" : "#e05a7a" }));

  const vagueSpots: string[] = [];
  if (topicCoverage < 0.5) vagueSpots.push(`Lời giảng chưa nêu rõ khái niệm cốt lõi của “${topicLabel}”.`);
  if (!explainsWhy) vagueSpots.push(`Em mới mô tả cách làm, chưa giải thích vì sao “${topicLabel}” hoạt động như vậy.`);
  if (!hasExample) vagueSpots.push(`Chưa có ví dụ cụ thể để minh hoạ “${topicLabel}”.`);
  if (words < 18) vagueSpots.push("Lời giảng hơi ngắn — thử giải thích kỹ hơn từng bước nhé.");

  const followUps = [
    `“${topicLabel}” là gì nếu nói bằng lời thật đơn giản ạ?`,
    `Anh/chị cho con một ví dụ khác về “${topicLabel}” được không?`,
    `Vì sao ví dụ đó đúng với “${topicLabel}” ạ?`,
  ];

  const tier: Tier = score >= 75 ? "high" : score >= 45 ? "mid" : "low";
  return { score, subBars, vagueSpots, followUps: followUps.slice(0, 3), tier };
}

const RING_C = 327; // 2π·52

function FeynmanInner() {
  const params = useSearchParams();
  const char = useCharacter();
  const buddyName = char === "sheep" ? "bé Cừu" : "bé Nấm";

  const [topic, setTopic] = useState({
    id: params.get("node") ?? "",
    name: params.get("name") ?? "",
    meta: [params.get("subject"), params.get("group")].filter(Boolean).join(" · "),
  });
  const [words, setWords] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const getGifPath = () => {
    if (scoring) return "/gif/thinking.gif";
    if (!submitted) return "/gif/waving.gif";
    if (result?.tier === "high") return "/gif/celebrate.gif";
    if (result?.tier === "mid") return "/gif/thinking.gif";
    return "/gif/failed.gif";
  };

  // Không có đủ query param (mở trực tiếp) → tự tìm bài đang học như Hub.
  useEffect(() => {
    if (topic.name) return;
    (async () => {
      try {
        const subjects = await getSubjects();
        if (!subjects || subjects.length === 0) return;
        let subj = subjects[0];
        let masteryBest: MasteryProfile = { topics: {} };
        const masteries = await Promise.all(
          subjects.map((s) => getMastery(s).catch(() => ({ topics: {} }) as MasteryProfile)),
        );
        let best = -1;
        subjects.forEach((s, i) => {
          const count = Object.keys(masteries[i].topics ?? {}).length;
          if (count > best) {
            best = count;
            subj = s;
            masteryBest = masteries[i];
          }
        });
        const [tree, pathRes] = await Promise.all([
          getTree(subj),
          getLearningPathLive(subj).catch(() => ({ ordered_steps: [] })),
        ]);
        const rm = buildRoadmap(tree.nodes ?? [], tree.edges ?? [], pathRes.ordered_steps ?? [], masteryBest);
        const cur = (topic.id && rm.find((s) => s.id === topic.id)) || rm.find((s) => s.status === "current") || rm[0];
        const node = (tree.nodes ?? []).find((n) => n.id === cur?.id);
        if (node) {
          setTopic({ id: node.id, name: node.name, meta: [node.subject, node.topicGroup].filter(Boolean).join(" · ") });
        }
      } catch {
        /* giữ mặc định — vẫn giảng được, chỉ không gửi event theo node */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onType() {
    const v = inputRef.current ? inputRef.current.value.trim() : "";
    setWords(v ? v.split(/\s+/).length : 0);
  }

  async function submit() {
    const v = inputRef.current ? inputRef.current.value.trim() : "";
    if (!v || scoring) return;
    setScoring(true);
    let r: Analysis;
    try {
      const llm = await scoreFeynman(topic.id, v);
      const subBars: SubBar[] = ["Rõ ràng", "Có ví dụ", "Đúng bản chất"].map((label) => {
        const val = Math.max(0, Math.min(100, Math.round(llm.subScores?.[label] ?? 0)));
        return { label, val, color: val >= 70 ? "#0FB9A6" : val >= 45 ? "#e0912a" : "#e05a7a" };
      });
      const score = Math.max(0, Math.min(100, Math.round(llm.clarityScore)));
      r = {
        score,
        subBars,
        vagueSpots: (llm.vagueSpots ?? []).slice(0, 3),
        followUps: (llm.followUps ?? []).slice(0, 3),
        tier: score >= 75 ? "high" : score >= 45 ? "mid" : "low",
      };
    } catch {
      // Offline hoặc AI chưa cấu hình → heuristic local, Tập Vở vẫn dùng được
      r = analyze(v, topic.name);
    }
    setScoring(false);
    setResult(r);
    setSubmitted(true);
    if (topic.id) {
      postFeynmanEvent({
        nodeId: topic.id,
        explanation: v,
        clarityScore: r.score,
        subScores: Object.fromEntries(r.subBars.map((b) => [b.label, b.val])),
        vagueSpots: r.vagueSpots,
      }).catch(() => {
        /* offline vẫn học tiếp được */
      });
    }
  }

  function reset() {
    setSubmitted(false);
    inputRef.current?.focus();
  }

  const tier = TIERS[result?.tier ?? "mid"];
  const buddyMood: Mood = submitted ? tier.mood : "cheerful";
  const buddyLine = submitted
    ? tier.line
    : `Con là ${buddyName} nè! Con chưa hiểu bài này lắm... anh/chị giảng lại cho con nghe với, nói thật đơn giản nha!`;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', sans-serif",
        color: "#16161F",
        background:
          "radial-gradient(680px 340px at 12% -8%, rgba(20,217,192,.14), transparent 60%), radial-gradient(620px 380px at 100% 6%, rgba(124,70,232,.12), transparent 60%), #F4FBF9",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 34px 6px" }}>
        <Link
          href="/tutor"
          style={{
            background: "#fff",
            border: "1px solid #eef1f4",
            borderRadius: 12,
            padding: "9px 13px",
            fontSize: 13,
            fontWeight: 700,
            color: "#5b6072",
            cursor: "pointer",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <ArrowLeft size={16} /> Bài học
        </Link>
        <div>
          <div style={{ ...BALOO, fontWeight: 800, fontSize: 24, display: "flex", alignItems: "center", gap: 8 }}>
            <BookOpen size={24} style={{ color: "#7C46E8" }} /> Tập Vở Feynman
          </div>
          <div style={{ fontSize: 13, color: "#6b7180" }}>
            Giảng lại bài cho {buddyName} nghe — hiểu thật thì mới giảng cho người khác hiểu được!
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", gap: 24, padding: "18px 34px 40px", alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* LEFT: buddy + topic */}
        <div style={{ width: 300, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", border: "1px solid #eef1f4", borderRadius: 20, padding: 20, boxShadow: "0 14px 32px -26px rgba(0,0,0,.28)" }}>
            <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, color: "#9aa1b0", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
              Chủ đề em sẽ giảng
            </div>
            <div style={{ background: "linear-gradient(120deg,#EFE9FD,#f6f1ff)", border: "1px solid #ece5fb", borderRadius: 14, padding: "13px 15px" }}>
              <div style={{ ...BALOO, fontWeight: 800, fontSize: 17, color: "#5b2fc0" }}>{topic.name || "Bài đang học"}</div>
              <div style={{ fontSize: 12, color: "#7c8194", marginTop: 2 }}>{topic.meta || "Đang tải chủ đề…"}</div>
            </div>
          </div>

          <div
            style={{
              background: "linear-gradient(160deg,#F3FBF9,#faf7ff)",
              border: "1px solid #e2f3ef",
              borderRadius: 20,
              padding: 18,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 10,
            }}
          >
            <img
              src={getGifPath()}
              alt={buddyName}
              style={{
                width: 118,
                height: 118,
                objectFit: "contain",
                borderRadius: 16,
              }}
            />
            <div
              style={{
                background: "#fff",
                border: "1px solid #eef1f4",
                borderRadius: 16,
                borderBottomLeftRadius: 5,
                padding: "12px 14px",
                fontSize: 13,
                color: "#4b5060",
                lineHeight: 1.55,
              }}
            >
              {buddyLine}
            </div>
            <div style={{ ...POPPINS, fontWeight: 700, fontSize: 12, color: "#0FB9A6" }}>
              {buddyName} · học trò của em
            </div>
          </div>
        </div>

        {/* RIGHT: notebook + result */}
        <div style={{ flex: 1, minWidth: 480, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* notebook */}
          <div style={{ background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: "22px 24px", boxShadow: "0 14px 34px -26px rgba(0,0,0,.28)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ ...POPPINS, fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
                <PenTool size={16} style={{ color: "#7C46E8" }} /> Lời giảng của em
              </div>
              <div style={{ fontSize: 12, color: "#9aa1b0" }}>{words} từ</div>
            </div>
            <div
              style={{
                position: "relative",
                border: "1px solid #eef1f4",
                borderRadius: 16,
                overflow: "hidden",
                background: "repeating-linear-gradient(#fff, #fff 30px, #eef4f2 31px, #fff 32px)",
              }}
            >
              <textarea
                ref={inputRef}
                onInput={onType}
                placeholder={`Hãy giải thích “${topic.name || "bài đang học"}” bằng lời thật đơn giản: khái niệm là gì, cho một ví dụ cụ thể và nói vì sao ví dụ đó đúng.`}
                style={{
                  width: "100%",
                  minHeight: 190,
                  border: "none",
                  outline: "none",
                  resize: "vertical",
                  background: "transparent",
                  padding: "14px 16px",
                  fontFamily: "'Caveat', cursive",
                  fontSize: 20,
                  lineHeight: "32px",
                  color: "#26324a",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <div
                onClick={submit}
                style={{
                  ...POPPINS,
                  flex: 1,
                  background: "linear-gradient(135deg,#8B5CF6,#7C46E8)",
                  color: "#fff",
                  borderRadius: 14,
                  padding: 14,
                  textAlign: "center",
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: scoring ? "wait" : "pointer",
                  opacity: scoring ? 0.7 : 1,
                  boxShadow: "0 12px 22px -8px rgba(124,70,232,.5)",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  {scoring ? <LoaderCircle size={17} className="animate-spin" /> : <Mic size={17} />}
                  {scoring ? `${buddyName} đang lắng nghe...` : `Giảng cho ${buddyName} nghe`}
                </span>
              </div>
              {submitted && (
                <div
                  onClick={reset}
                  style={{
                    background: "#fff",
                    border: "1px solid #eef1f4",
                    color: "#5b6072",
                    borderRadius: 14,
                    padding: "14px 20px",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Giảng lại
                </div>
              )}
            </div>
          </div>

          {/* result */}
          {submitted && result && (
            <div className="fn-in" style={{ background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: 24, boxShadow: "0 14px 34px -26px rgba(0,0,0,.28)" }}>
              <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                {/* clarity ring */}
                <div style={{ position: "relative", width: 132, height: 132, flexShrink: 0 }}>
                  <svg width="132" height="132" viewBox="0 0 132 132">
                    <circle cx="66" cy="66" r="52" fill="none" stroke="#eef1f4" strokeWidth="13" />
                    <circle
                      cx="66"
                      cy="66"
                      r="52"
                      fill="none"
                      stroke={tier.color}
                      strokeWidth="13"
                      strokeLinecap="round"
                      strokeDasharray={RING_C}
                      strokeDashoffset={Math.round(RING_C * (1 - result.score / 100))}
                      transform="rotate(-90 66 66)"
                      style={{ animation: "fn-ring .8s ease" }}
                    />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
                    <div>
                      <div style={{ ...BALOO, fontWeight: 800, fontSize: 32, color: tier.color }}>{result.score}</div>
                      <div style={{ fontSize: 10, color: "#9aa1b0", fontWeight: 700 }}>CLARITY</div>
                    </div>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div
                    style={{
                      ...POPPINS,
                      display: "inline-block",
                      fontWeight: 800,
                      fontSize: 12,
                      padding: "5px 13px",
                      borderRadius: 999,
                      background: tier.chip,
                      border: `1px solid ${tier.chipBd}`,
                      color: tier.chipTx,
                    }}
                  >
                    {tier.label}
                  </div>
                  <div style={{ fontSize: 13.5, color: "#5b6072", lineHeight: 1.6, marginTop: 10 }}>{tier.msg}</div>
                </div>
              </div>

              {/* sub bars */}
              <div style={{ display: "flex", gap: 14, marginTop: 22 }}>
                {result.subBars.map((b) => (
                  <div key={b.label} style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>
                      <span>{b.label}</span>
                      <span style={{ color: b.color }}>{b.val}%</span>
                    </div>
                    <div style={{ height: 8, background: "#eef1f4", borderRadius: 8 }}>
                      <div style={{ height: 8, borderRadius: 8, width: `${b.val}%`, background: b.color }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* vague spots */}
              {result.vagueSpots.length > 0 && (
                <div style={{ marginTop: 22 }}>
                  <div style={{ ...POPPINS, fontWeight: 800, fontSize: 13, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <Search size={15} /> Chỗ {buddyName} chưa hiểu
                  </div>
                  {result.vagueSpots.map((v) => (
                    <div
                      key={v}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        background: "#fff7ed",
                        border: "1px solid #ffe0be",
                        borderRadius: 13,
                        padding: "11px 13px",
                        marginBottom: 8,
                      }}
                    >
                      <CircleHelp size={16} style={{ color: "#e05a7a", flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: "#8a5a1e", lineHeight: 1.5 }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* follow-up */}
              <div style={{ marginTop: 20, background: "#faf7ff", border: "1px solid #ece5fb", borderRadius: 16, padding: 16 }}>
                <div style={{ ...POPPINS, fontWeight: 800, fontSize: 13, color: "#5b2fc0", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <MessageCircle size={15} /> {buddyName} hỏi lại
                </div>
                {result.followUps.map((q) => (
                  <div key={q} style={{ fontSize: 13.5, color: "#4b5060", lineHeight: 1.6, marginBottom: 6 }}>
                    • {q}
                  </div>
                ))}
                <div style={{ fontSize: 12, color: "#9aa1b0", marginTop: 8 }}>
                  Trả lời được hết là em đã <b>hiểu thật</b> rồi đó! Bấm &quot;Giảng lại&quot; để bổ sung nhé.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FeynmanPage() {
  return (
    <Suspense
      fallback={
        <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#F4FBF9" }}>
          <div style={{ ...POPPINS, fontWeight: 700, color: "#5b6072" }}>Đang mở tập vở…</div>
        </div>
      }
    >
      <FeynmanInner />
    </Suspense>
  );
}
