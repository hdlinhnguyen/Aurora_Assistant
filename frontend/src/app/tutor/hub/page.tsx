"use client";

/**
 * Aurora Tutor Hub — màn học sinh học bài (redesign "một chạm").
 * Đã nối API THẬT: subjects/tree/learning-path/mastery/questions/answer/chat-theory/hints/badges.
 * Gamification (sao, streak, huy hiệu) lấy từ GET /student/badges (dẫn xuất từ hoạt động thật).
 */

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  buildRoadmap,
  chatTheory,
  getAdaptiveQuestions,
  getBadges,
  getLearningPath,
  getLearningPathLive,
  getMastery,
  getSubjects,
  getTree,
  mapQuestion,
  requestHint,
  submitAnswer,
  type GameSummary,
  type HubEdge,
  type HubNode,
  type HubQuestion,
  type MasteryProfile,
  type RoadmapStep,
} from "./api";
import Character from "../components/Character";
import { characterMeta, useCharacter } from "../components/character-context";

const BALOO: CSSProperties = { fontFamily: "'Baloo 2', system-ui, sans-serif" };
const POPPINS: CSSProperties = { fontFamily: "'Poppins', system-ui, sans-serif" };
// Nhân vật đồng hành lấy từ CharacterContext (mặc định Nấm); tên/emoji suy từ characterMeta().

interface ChatMsg {
  sender: "ai" | "student";
  text: string;
}

const DIFF_STYLE: Record<string, CSSProperties> = {
  "Nhận biết": { background: "#e7f4fe", color: "#2a7cc0" },
  "Thông hiểu": { background: "#fff3dd", color: "#b7811f" },
  "Vận dụng": { background: "#ffeede", color: "#c26a1f" },
};

const CONFETTI_COLORS = ["#14D9C0", "#7C46E8", "#FFC24D", "#ff8fa3", "#5ac8fa"];
interface ConfettiPiece {
  left: number;
  color: string;
  dur: string;
  delay: string;
  rot: number;
}
function makeConfetti(n = 40): ConfettiPiece[] {
  return Array.from({ length: n }).map((_, i) => ({
    left: Math.round(Math.random() * 100),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    dur: (2 + Math.random() * 1.4).toFixed(2),
    delay: (Math.random() * 0.8).toFixed(2),
    rot: Math.round(Math.random() * 360),
  }));
}

function firstSentence(text: string, max = 120): string {
  const t = (text || "").trim();
  if (!t) return "";
  const end = t.search(/[.!?…]\s/);
  const s = end > 0 ? t.slice(0, end + 1) : t;
  return s.length > max ? s.slice(0, max).trim() + "…" : s;
}

export default function TutorHubPage() {
  // ---- data ----
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [nodes, setNodes] = useState<HubNode[]>([]);
  const [edges, setEdges] = useState<HubEdge[]>([]);
  const [mastery, setMastery] = useState<MasteryProfile>({ topics: {} });
  const [roadmap, setRoadmap] = useState<RoadmapStep[]>([]);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [studentName, setStudentName] = useState("bạn");
  const [currentStepId, setCurrentStepId] = useState("");
  const [questions, setQuestions] = useState<HubQuestion[]>([]);
  const [qLoading, setQLoading] = useState(false);

  // ---- quiz / ui ----
  const [screen, setScreen] = useState<"lesson" | "complete">("lesson");
  const [activeTab, setActiveTab] = useState<"theory" | "practice" | "chat">("theory");
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hintText, setHintText] = useState("");
  const [hintPress, setHintPress] = useState(0);
  const [hintLoading, setHintLoading] = useState(false);
  const [correctSession, setCorrectSession] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const char = useCharacter();
  const companion = characterMeta(char);

  // ---- load ----
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
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    setLoadError(null);
    try {
      const subjects = await getSubjects();
      if (!subjects || subjects.length === 0) {
        setLoadError("Chưa có môn học nào. Hãy nhờ giáo viên tạo môn + cây kiến thức.");
        return;
      }
      // Chọn môn học sinh đang có dữ liệu học (nhiều mastery nhất); fallback môn đầu tiên.
      let subj = subjects[0];
      let masteryRes: MasteryProfile = { topics: {} };
      if (subjects.length > 1) {
        const masteries = await Promise.all(
          subjects.map((s) => getMastery(s).catch(() => ({ topics: {} }) as MasteryProfile)),
        );
        let best = -1;
        subjects.forEach((s, i) => {
          const count = Object.keys(masteries[i].topics ?? {}).length;
          if (count > best) {
            best = count;
            subj = s;
            masteryRes = masteries[i];
          }
        });
      } else {
        masteryRes = await getMastery(subj).catch(() => ({ topics: {} }) as MasteryProfile);
      }
      setSubject(subj);
      const [tree, pathRes, summaryRes] = await Promise.all([
        getTree(subj),
        getLearningPathLive(subj).catch(() => ({ ordered_steps: [] })),
        getBadges().catch(() => null),
      ]);
      const rm = buildRoadmap(tree.nodes ?? [], tree.edges ?? [], pathRes.ordered_steps ?? [], masteryRes);
      setNodes(tree.nodes ?? []);
      setEdges(tree.edges ?? []);
      setMastery(masteryRes);
      setRoadmap(rm);
      setSummary(summaryRes);
      const cur = rm.find((s) => s.status === "current") ?? rm[0];
      const curId = cur?.id ?? "";
      setCurrentStepId(curId);
      resetChat(cur?.name ?? "");
      if (curId) await loadQuestions(curId);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Lỗi tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }

  async function loadQuestions(nodeId: string) {
    setQLoading(true);
    try {
      const raw = await getAdaptiveQuestions(nodeId);
      setQuestions((raw ?? []).map(mapQuestion));
    } catch {
      setQuestions([]);
    } finally {
      setQLoading(false);
      setQIndex(0);
      setSelected(null);
      setAnswered(false);
      setIsCorrect(false);
      setShowHint(false);
      setHintText("");
      setHintPress(0);
      setCorrectSession(0);
    }
  }

  async function refreshProgress() {
    // Tính lại mastery + sao → dựng lại roadmap từ mastery TƯƠI (cá nhân hóa theo năng lực).
    const [m, s] = await Promise.all([
      getMastery(subject).catch(() => null),
      getBadges().catch(() => null),
    ]);
    if (m) setMastery(m);
    if (s) setSummary(s);
    if (m) setRoadmap(buildRoadmap(nodes, edges, [], m));
  }

  function resetChat(lessonName: string) {
    setChat([
      {
        sender: "ai",
        text: `Chào ${studentName}! Có gì chưa rõ ở bài "${lessonName || "này"}" cứ hỏi ${companion.name} nhé — ${companion.name} sẽ gợi mở để em tự nghĩ ra! ${companion.emoji}`,
      },
    ]);
  }

  // ---- derived ----
  const currentNode = nodes.find((n) => n.id === currentStepId);
  const q = questions[qIndex];
  const qTotal = questions.length;
  const doneCount = roadmap.filter((s) => s.status === "done").length;
  const totalSteps = roadmap.length || 1;
  const chapterPct = Math.round((doneCount / totalSteps) * 100);
  const lessonIndex = Math.max(0, roadmap.findIndex((s) => s.id === currentStepId));
  const chapterName = currentNode?.topicGroup || subject || "Kiến thức";
  const masteryPct = Math.round((mastery.topics?.[currentStepId]?.masteryProbability ?? 0) * 100);
  const stars = summary?.stars ?? 0;
  const streak = summary?.currentStreak ?? 0;
  const lessonBlurb =
    firstSentence(currentNode?.theory ?? "") || `Cùng khám phá bài học này với ${companion.name} nhé!`;

  function fire(durationMs: number) {
    setConfetti(makeConfetti());
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), durationMs);
  }

  function selectStep(step: RoadmapStep) {
    if (step.status === "locked" || step.id === currentStepId) return;
    setCurrentStepId(step.id);
    setActiveTab("theory");
    resetChat(step.name);
    loadQuestions(step.id);
  }

  function selectOpt(i: number) {
    if (answered) return;
    setSelected(i);
  }

  async function submit() {
    if (selected === null || answered || submitting || !q) return;
    setSubmitting(true);
    try {
      const res = await submitAnswer(currentStepId, q.id, selected);
      setAnswered(true);
      setIsCorrect(res.isCorrect);
      if (res.isCorrect) {
        setCorrectSession((c) => c + 1);
        fire(2600);
        refreshProgress();
      }
    } catch {
      // vẫn chấm cục bộ nếu mạng lỗi, để không kẹt luồng học
      const ok = selected === q.correct;
      setAnswered(true);
      setIsCorrect(ok);
      if (ok) {
        setCorrectSession((c) => c + 1);
        fire(2600);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (qIndex >= qTotal - 1) {
      setScreen("complete");
      fire(3200);
      refreshProgress();
      return;
    }
    setQIndex((i) => i + 1);
    setSelected(null);
    setAnswered(false);
    setShowHint(false);
    setHintText("");
    setHintPress(0);
    setIsCorrect(false);
  }

  function restart() {
    setScreen("lesson");
    setActiveTab("theory");
    setQIndex(0);
    setSelected(null);
    setAnswered(false);
    setShowHint(false);
    setHintText("");
    setHintPress(0);
    setIsCorrect(false);
    setCorrectSession(0);
  }

  async function doHint() {
    if (hintLoading) return;
    setHintLoading(true);
    try {
      const res = await requestHint(currentStepId, hintPress + 1);
      setHintPress((p) => p + 1);
      setHintText(res.content?.trim() || "Em thử đọc kỹ lại đề và nhớ lại lý thuyết vừa học nhé!");
    } catch {
      setHintText("Gợi ý đang tạm nghỉ. Em thử suy nghĩ theo lý thuyết ở tab 📖 nhé!");
    } finally {
      setShowHint(true);
      setHintLoading(false);
    }
  }

  async function sendMessage(text: string) {
    const val = text.trim();
    if (!val || chatSending || !currentStepId) return;
    const history = chat.map((m) => ({ sender: m.sender, content: m.text }));
    setChat((c) => [...c, { sender: "student", text: val }]);
    setChatSending(true);
    try {
      const res = await chatTheory(currentStepId, val, history);
      setChat((c) => [...c, { sender: "ai", text: res.reply }]);
    } catch {
      setChat((c) => [...c, { sender: "ai", text: "Mình đang bận chút xíu, em thử hỏi lại nhé! 😊" }]);
    } finally {
      setChatSending(false);
    }
  }

  function onSubmitChat(e: FormEvent) {
    e.preventDefault();
    const el = inputRef.current;
    const val = el ? el.value.trim() : "";
    if (!val) return;
    if (el) el.value = "";
    sendMessage(val);
  }

  // ---- styles ----
  const tabBase: CSSProperties = {
    ...POPPINS,
    borderRadius: 14,
    padding: "11px 18px",
    fontSize: 14,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    transition: "all .15s",
  };
  const tabOn: CSSProperties = { ...tabBase, background: "#16161F", color: "#fff" };
  const tabOff: CSSProperties = { ...tabBase, background: "#fff", color: "#5b6072", border: "1px solid #eef1f4" };
  const isLastAnswered = answered && qIndex >= qTotal - 1;

  // ---- loading / error ----
  if (loading) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#F4FBF9" }}>
        <div style={{ textAlign: "center", color: "#5b6072" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🦊</div>
          <div style={{ ...POPPINS, fontWeight: 700 }}>Đang tải không gian học…</div>
        </div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#F4FBF9", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>😅</div>
          <div style={{ ...POPPINS, fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Chưa tải được</div>
          <div style={{ color: "#5b6072", fontSize: 14, marginBottom: 18 }}>{loadError}</div>
          <button
            onClick={loadAll}
            style={{
              ...POPPINS,
              border: "none",
              background: "linear-gradient(135deg,#14D9C0,#0FB9A6)",
              color: "#fff",
              borderRadius: 12,
              padding: "12px 22px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        minHeight: 720,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#F4FBF9",
        fontFamily: "'Inter', sans-serif",
        color: "#16161F",
      }}
    >
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ============ ROADMAP RAIL ============ */}
        <aside
          style={{
            width: 290,
            background: "#fff",
            borderRight: "1px solid #eef1f4",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #f2f4f7" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16 }}>
              <div
                style={{
                  ...POPPINS,
                  height: 38,
                  width: 38,
                  borderRadius: 12,
                  background: "linear-gradient(135deg,#14D9C0,#7C46E8)",
                  display: "grid",
                  placeItems: "center",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 18,
                }}
              >
                A
              </div>
              <div>
                <div style={{ ...POPPINS, fontWeight: 800, fontSize: 16, lineHeight: 1 }}>Aurora</div>
                <div style={{ fontSize: 11, color: "#9aa1b0", marginTop: 2 }}>Học thật, hiểu thật</div>
              </div>
            </div>
            <div
              style={{
                background: "#f4f6f9",
                border: "1px solid #eef1f4",
                borderRadius: 13,
                padding: "10px 13px",
                fontSize: 13.5,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span>📐</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subject}</span>
              </span>
            </div>
          </div>

          <div style={{ padding: "16px 12px", overflowY: "auto", flex: 1 }}>
            <div
              style={{
                ...POPPINS,
                fontSize: 10.5,
                fontWeight: 800,
                color: "#9aa1b0",
                textTransform: "uppercase",
                letterSpacing: ".07em",
                padding: "0 8px 4px",
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chapterName}</span>
              <span style={{ color: "#0FB9A6", flexShrink: 0 }}>
                {doneCount}/{totalSteps}
              </span>
            </div>
            <div style={{ padding: "0 8px 12px" }}>
              <div style={{ height: 6, background: "#eef1f4", borderRadius: 6 }}>
                <div
                  style={{
                    height: 6,
                    background: "linear-gradient(90deg,#14D9C0,#0FB9A6)",
                    borderRadius: 6,
                    width: `${chapterPct}%`,
                  }}
                />
              </div>
            </div>

            {roadmap.map((st, i) => {
              const active = st.id === currentStepId;
              const done = st.status === "done";
              const locked = st.status === "locked" && !active;
              const rowStyle: CSSProperties = {
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "11px 12px",
                borderRadius: 14,
                marginBottom: 5,
                transition: "all .15s",
                ...(active
                  ? {
                      background: "linear-gradient(135deg,#EFE9FD,#f6f1ff)",
                      boxShadow: "inset 0 0 0 2px #7C46E8",
                      cursor: "pointer",
                    }
                  : done
                    ? { background: "#F3FBF9", cursor: "pointer" }
                    : locked
                      ? { cursor: "not-allowed", opacity: 0.85 }
                      : { cursor: "pointer" }),
              };
              const badgeStyle: CSSProperties = {
                height: 26,
                width: 26,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontSize: 12,
                fontWeight: 800,
                flexShrink: 0,
                ...(active
                  ? { background: "#7C46E8", color: "#fff" }
                  : done
                    ? { background: "#14D9C0", color: "#fff" }
                    : { background: "#eef1f4", color: "#b3b9c4" }),
              };
              const nameStyle: CSSProperties = {
                fontSize: 12.5,
                fontWeight: active ? 800 : 600,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: active ? "#5b2fc0" : done ? "#16161F" : "#a2a8b4",
              };
              const tag = active ? "đang học" : locked ? "🔒" : "";
              const tagStyle: CSSProperties = {
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
                flexShrink: 0,
                ...(active ? { background: "#fff", color: "#7C46E8" } : { color: "#c2c8d2" }),
              };
              return (
                <div key={st.id} onClick={() => selectStep(st)} style={rowStyle} title={st.name}>
                  <span style={badgeStyle}>{done ? "✓" : String(i + 1)}</span>
                  <span style={nameStyle}>{st.name}</span>
                  <span style={tagStyle}>{tag}</span>
                </div>
              );
            })}
          </div>

          <div style={{ padding: 14, borderTop: "1px solid #f2f4f7", display: "flex", alignItems: "center", gap: 11 }}>
            <div
              style={{
                ...POPPINS,
                height: 38,
                width: 38,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#ffd76f,#ff9f43)",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
                color: "#7a4b00",
              }}
            >
              {studentName.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {studentName}
              </div>
              <div style={{ fontSize: 11, color: "#9aa1b0" }}>
                🔥 {streak} ngày · ⭐ {stars}
              </div>
            </div>
          </div>
        </aside>

        {/* ============ WORKSPACE ============ */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 34px 40px",
            background:
              "radial-gradient(680px 320px at 100% -6%, rgba(124,70,232,.09), transparent 62%), radial-gradient(560px 300px at -5% 0%, rgba(20,217,192,.10), transparent 60%)",
          }}
        >
          {/* lesson hero */}
          <div
            style={{
              background: "linear-gradient(120deg,#14D9C0,#0FB9A6)",
              borderRadius: 24,
              padding: "24px 28px",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 24px 46px -26px rgba(15,185,166,.75)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", right: -34, top: -40, height: 170, width: 170, borderRadius: "50%", background: "rgba(255,255,255,.13)" }} />
            <div style={{ position: "absolute", right: 80, bottom: -60, height: 120, width: 120, borderRadius: "50%", background: "rgba(255,255,255,.1)" }} />
            <div style={{ position: "relative", zIndex: 1, maxWidth: "62%" }}>
              <div style={{ ...POPPINS, fontSize: 11, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", opacity: 0.92 }}>
                Bài {lessonIndex + 1} · {chapterName}
              </div>
              <div style={{ ...BALOO, fontWeight: 800, fontSize: 28, margin: "5px 0 6px", lineHeight: 1.1 }}>
                {currentNode?.name ?? "Bài học"}
              </div>
              <div style={{ fontSize: 13.5, opacity: 0.93, lineHeight: 1.5 }}>{lessonBlurb}</div>
            </div>
            <div
              style={{
                position: "relative",
                zIndex: 1,
                textAlign: "center",
                background: "rgba(255,255,255,.18)",
                backdropFilter: "blur(5px)",
                borderRadius: 20,
                padding: "16px 22px",
                minWidth: 104,
              }}
            >
              <div style={{ ...POPPINS, fontWeight: 800, fontSize: 26 }}>{masteryPct}%</div>
              <div style={{ fontSize: 10.5, opacity: 0.92, marginBottom: 8 }}>đã hiểu</div>
              <div style={{ height: 6, width: 74, background: "rgba(255,255,255,.32)", borderRadius: 6, margin: "0 auto" }}>
                <div style={{ height: 6, background: "#fff", borderRadius: 6, width: `${masteryPct}%` }} />
              </div>
            </div>
          </div>

          {/* merged tabs */}
          <div style={{ display: "flex", gap: 9, margin: "22px 0 18px", alignItems: "center" }}>
            <div onClick={() => setActiveTab("theory")} style={activeTab === "theory" ? tabOn : tabOff}>
              📖 Học lý thuyết
            </div>
            <div onClick={() => setActiveTab("practice")} style={activeTab === "practice" ? tabOn : tabOff}>
              ✏️ Luyện tập{" "}
              <span
                style={{
                  background: activeTab === "practice" ? "rgba(255,255,255,.22)" : "#EFE9FD",
                  color: activeTab === "practice" ? "#fff" : "#7C46E8",
                  fontSize: 11,
                  padding: "1px 8px",
                  borderRadius: 999,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {qTotal}
              </span>
            </div>
            <div onClick={() => setActiveTab("chat")} style={activeTab === "chat" ? tabOn : tabOff}>
              💬 Hỏi thầy AI
            </div>
          </div>

          {/* ===== THEORY PANEL ===== */}
          {activeTab === "theory" && (
            <div className="ah-panel" style={{ display: "flex", gap: 20, alignItems: "stretch" }}>
              <div style={{ flex: 1.2, background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: 24, boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)" }}>
                <div style={{ ...POPPINS, fontWeight: 700, fontSize: 17, marginBottom: 12 }}>Ý tưởng chính 🍰</div>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.75, color: "#4b5060", textWrap: "pretty", whiteSpace: "pre-wrap" }}>
                  {currentNode?.theory?.trim() || "Nội dung lý thuyết cho bài này đang được cập nhật. Em có thể sang tab Luyện tập hoặc hỏi thầy AI nhé!"}
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <div
                    onClick={() => setActiveTab("practice")}
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
                      cursor: "pointer",
                      boxShadow: "0 12px 22px -8px rgba(124,70,232,.5)",
                    }}
                  >
                    Mình hiểu rồi → Luyện tập
                  </div>
                  <div
                    onClick={() => setActiveTab("chat")}
                    style={{ background: "#fff", border: "1px solid #eef1f4", color: "#5b6072", borderRadius: 14, padding: "14px 18px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                  >
                    💬
                  </div>
                </div>
              </div>

              <div style={{ width: 264, background: "linear-gradient(160deg,#faf7ff,#f2eefb)", border: "1px solid #ece5fb", borderRadius: 22, padding: 20, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
                  <div style={{ height: 44, width: 44, borderRadius: "50%", background: "linear-gradient(135deg,#FFE7A3,#FFC24D)", display: "grid", placeItems: "center", overflow: "hidden" }}>
                    <Character char={char} mood="cheerful" size={40} face="right" />
                  </div>
                  <div>
                    <div style={{ ...POPPINS, fontWeight: 700, fontSize: 14 }}>{companion.name}</div>
                    <div style={{ fontSize: 11, color: "#7C46E8", fontWeight: 600 }}>● đang lắng nghe</div>
                  </div>
                </div>
                <div style={{ background: "#fff", border: "1px solid #f0eafc", borderRadius: 15, borderTopLeftRadius: 5, padding: 13, fontSize: 13, color: "#4b5060", lineHeight: 1.6 }}>
                  Có chỗ nào trong bài "{currentNode?.name ?? "này"}" chưa rõ không? Hỏi mình, mình sẽ gợi ý từng bước nhé! 🤔
                </div>
                <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9, paddingTop: 16 }}>
                  <div
                    onClick={() => {
                      setActiveTab("chat");
                      sendMessage("Em chưa hiểu chỗ này ạ");
                    }}
                    style={{ background: "#fff", border: "1px solid #ece5fb", borderRadius: 12, padding: "10px 13px", fontSize: 12.5, fontWeight: 600, color: "#5b2fc0", cursor: "pointer" }}
                  >
                    Em chưa hiểu chỗ này
                  </div>
                  <div
                    onClick={() => {
                      setActiveTab("chat");
                      sendMessage("Cho em một ví dụ khác");
                    }}
                    style={{ background: "#fff", border: "1px solid #ece5fb", borderRadius: 12, padding: "10px 13px", fontSize: 12.5, fontWeight: 600, color: "#5b2fc0", cursor: "pointer" }}
                  >
                    Cho em một ví dụ khác
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== PRACTICE PANEL ===== */}
          {activeTab === "practice" && (
            <div
              className="ah-panel"
              style={{ background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, padding: "24px 26px", boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)", maxWidth: 820 }}
            >
              {qLoading ? (
                <div style={{ textAlign: "center", color: "#9aa1b0", padding: "40px 0", ...POPPINS, fontWeight: 700 }}>Đang tải câu hỏi…</div>
              ) : !q ? (
                <div style={{ textAlign: "center", color: "#9aa1b0", padding: "40px 0" }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>📭</div>
                  <div style={{ ...POPPINS, fontWeight: 700 }}>Bài này chưa có câu hỏi luyện tập.</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Em thử học lý thuyết hoặc hỏi thầy AI nhé!</div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                    <span style={{ ...POPPINS, fontSize: 11, fontWeight: 800, padding: "5px 13px", borderRadius: 999, textTransform: "uppercase", letterSpacing: ".04em", ...DIFF_STYLE[q.tag] }}>
                      {q.tag}
                    </span>
                    <span style={{ fontSize: 12, color: "#9aa1b0", fontWeight: 700 }}>
                      Câu {qIndex + 1} / {qTotal}
                    </span>
                  </div>

                  <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.5, marginBottom: 18 }}>{q.q}</div>

                  {q.opts.map((text, i) => {
                    const letter = ["A", "B", "C", "D", "E", "F"][i] ?? "?";
                    const isSel = selected === i;
                    let optStyle: CSSProperties = {
                      display: "flex",
                      alignItems: "center",
                      gap: 13,
                      borderRadius: 14,
                      padding: "13px 15px",
                      fontSize: 14,
                      fontWeight: 600,
                      marginBottom: 10,
                      cursor: answered ? "default" : "pointer",
                      transition: "all .15s",
                    };
                    let badgeStyle: CSSProperties = { height: 28, width: 28, borderRadius: 9, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 };
                    let mark = "";
                    if (answered) {
                      if (i === q.correct) {
                        optStyle = { ...optStyle, border: "2px solid #14D9C0", background: "#F0FCF8", color: "#0d7a6c", fontWeight: 800 };
                        badgeStyle = { ...badgeStyle, background: "#14D9C0", color: "#fff" };
                        mark = "✅";
                      } else if (isSel) {
                        optStyle = { ...optStyle, border: "2px solid #f6a6b3", background: "#fef3f5", color: "#c23a54" };
                        badgeStyle = { ...badgeStyle, background: "#f6a6b3", color: "#fff" };
                        mark = "✗";
                      } else {
                        optStyle = { ...optStyle, border: "1px solid #eef1f4", color: "#a2a8b4", opacity: 0.7 };
                        badgeStyle = { ...badgeStyle, background: "#f4f6f9", color: "#b3b9c4" };
                      }
                    } else if (isSel) {
                      optStyle = { ...optStyle, border: "2px solid #7C46E8", background: "#faf7ff", color: "#5b2fc0", fontWeight: 800, boxShadow: "0 0 0 4px #EFE9FD" };
                      badgeStyle = { ...badgeStyle, background: "#7C46E8", color: "#fff" };
                    } else {
                      optStyle = { ...optStyle, border: "1px solid #eef1f4", color: "#4b5060", background: "#fff" };
                      badgeStyle = { ...badgeStyle, background: "#f4f6f9", color: "#9aa1b0" };
                    }
                    return (
                      <div key={i} onClick={() => selectOpt(i)} style={optStyle}>
                        <span style={badgeStyle}>{letter}</span>
                        <span style={{ flex: 1 }}>{text}</span>
                        <span style={{ fontSize: 16 }}>{mark}</span>
                      </div>
                    );
                  })}

                  {showHint && hintText && (
                    <div style={{ marginTop: 14, background: "#F3FBF9", border: "1px solid #cfeee6", borderRadius: 14, padding: "13px 15px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 18 }}>💡</span>
                      <div style={{ fontSize: 13, color: "#0d7a6c", lineHeight: 1.55, fontWeight: 600 }}>{hintText}</div>
                    </div>
                  )}

                  {answered && (
                    <div
                      style={{
                        marginTop: 16,
                        borderRadius: 14,
                        padding: "14px 16px",
                        fontSize: 14,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        ...(isCorrect
                          ? { background: "#F0FCF8", border: "1px solid #b8ede0", color: "#0d7a6c" }
                          : { background: "#fef3f5", border: "1px solid #f8d3da", color: "#c23a54" }),
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{isCorrect ? "🎉" : "🤗"}</span>
                      <span>{isCorrect ? "Tuyệt vời! Em trả lời chính xác rồi." : "Chưa đúng rồi, nhưng không sao! Xem gợi ý và thử lại nhé."}</span>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                    {!answered ? (
                      <div
                        onClick={submit}
                        style={{
                          ...POPPINS,
                          flex: 1,
                          borderRadius: 14,
                          padding: 14,
                          textAlign: "center",
                          fontWeight: 800,
                          fontSize: 15,
                          cursor: selected === null || submitting ? "not-allowed" : "pointer",
                          transition: "all .15s",
                          ...(selected === null || submitting
                            ? { background: "#eef1f4", color: "#b3b9c4" }
                            : { background: "linear-gradient(135deg,#8B5CF6,#7C46E8)", color: "#fff", boxShadow: "0 12px 22px -8px rgba(124,70,232,.5)" }),
                        }}
                      >
                        {submitting ? "Đang chấm…" : "Trả lời"}
                      </div>
                    ) : (
                      <div
                        onClick={next}
                        style={{
                          ...POPPINS,
                          flex: 1,
                          borderRadius: 14,
                          padding: 14,
                          textAlign: "center",
                          fontWeight: 800,
                          fontSize: 15,
                          cursor: "pointer",
                          transition: "all .15s",
                          background: "linear-gradient(135deg,#14D9C0,#0FB9A6)",
                          color: "#fff",
                          boxShadow: "0 12px 22px -8px rgba(15,185,166,.55)",
                        }}
                      >
                        {isLastAnswered ? "🎉 Hoàn thành bài học" : "Câu tiếp theo →"}
                      </div>
                    )}
                    {!answered && (
                      <div
                        onClick={doHint}
                        style={{ ...POPPINS, background: "#faf7ff", border: "1px solid #ece5fb", color: "#7C46E8", borderRadius: 14, padding: "14px 20px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
                      >
                        {hintLoading ? "…" : "💡 Gợi ý"}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ===== CHAT PANEL ===== */}
          {activeTab === "chat" && (
            <div
              className="ah-panel"
              style={{ background: "#fff", border: "1px solid #eef1f4", borderRadius: 22, boxShadow: "0 14px 34px -24px rgba(0,0,0,.25)", maxWidth: 760, display: "flex", flexDirection: "column", height: 560, overflow: "hidden" }}
            >
              <div style={{ padding: "15px 20px", borderBottom: "1px solid #f2f4f7", display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{ height: 38, width: 38, borderRadius: "50%", background: "linear-gradient(135deg,#FFE7A3,#FFC24D)", display: "grid", placeItems: "center", overflow: "hidden" }}>
                  <Character char={char} mood="cheerful" size={34} face="right" />
                </div>
                <div>
                  <div style={{ ...POPPINS, fontWeight: 700, fontSize: 14.5 }}>{companion.name}</div>
                  <div style={{ fontSize: 11, color: "#0FB9A6", fontWeight: 600 }}>● gợi mở, không cho đáp án sẵn</div>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                {chat.map((m, i) =>
                  m.sender === "ai" ? (
                    <div key={i} style={{ display: "flex", maxWidth: "82%" }}>
                      <div style={{ background: "#f7f9fb", border: "1px solid #eef1f4", borderRadius: 16, borderBottomLeftRadius: 5, padding: "12px 15px", fontSize: 13.5, color: "#3a3f4d", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                        {m.text}
                      </div>
                    </div>
                  ) : (
                    <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                      <div style={{ background: "#16161F", color: "#fff", borderRadius: 16, borderBottomRightRadius: 5, padding: "11px 15px", fontSize: 13.5, lineHeight: 1.55, maxWidth: "78%" }}>
                        {m.text}
                      </div>
                    </div>
                  ),
                )}
                {chatSending && (
                  <div style={{ display: "flex", maxWidth: "82%" }}>
                    <div style={{ background: "#f7f9fb", border: "1px solid #eef1f4", borderRadius: 16, borderBottomLeftRadius: 5, padding: "12px 15px", fontSize: 13.5, color: "#9aa1b0" }}>
                      {companion.name} đang soạn… ✍️
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding: "12px 18px 16px", borderTop: "1px solid #f2f4f7" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <div
                    onClick={() => sendMessage("Em chưa hiểu chỗ này ạ")}
                    style={{ background: "#faf7ff", border: "1px solid #ece5fb", borderRadius: 999, padding: "7px 13px", fontSize: 12, fontWeight: 600, color: "#5b2fc0", cursor: "pointer" }}
                  >
                    🤔 Em chưa hiểu
                  </div>
                  <div
                    onClick={() => sendMessage("Cho em một ví dụ khác")}
                    style={{ background: "#F3FBF9", border: "1px solid #e2f3ef", borderRadius: 999, padding: "7px 13px", fontSize: 12, fontWeight: 600, color: "#0FB9A6", cursor: "pointer" }}
                  >
                    💡 Cho em ví dụ
                  </div>
                </div>
                <form onSubmit={onSubmitChat} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f7f9fb", border: "1px solid #eef1f4", borderRadius: 16, padding: "7px 7px 7px 16px" }}>
                  <input
                    ref={inputRef}
                    placeholder={`Nhắn cho ${companion.name}...`}
                    style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 14, fontFamily: "'Inter', sans-serif", color: "#16161F" }}
                  />
                  <button
                    type="submit"
                    disabled={chatSending}
                    style={{ height: 40, width: 44, border: "none", borderRadius: 12, background: "linear-gradient(135deg,#14D9C0,#0FB9A6)", color: "#fff", fontSize: 16, cursor: "pointer", boxShadow: "0 8px 16px -6px rgba(15,185,166,.6)", opacity: chatSending ? 0.6 : 1 }}
                  >
                    ➤
                  </button>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ===== CHAPTER COMPLETE SCREEN ===== */}
      {screen === "complete" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(20,30,45,.55)", backdropFilter: "blur(6px)", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 30, maxWidth: 576, width: "100%", padding: "38px 40px 32px", textAlign: "center", boxShadow: "0 40px 90px -30px rgba(0,0,0,.55)", animation: "ah-pop .45s cubic-bezier(.16,1,.3,1)" }}>
            <div style={{ position: "relative", width: 148, height: 148, margin: "0 auto 8px" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "conic-gradient(#FFD76F,#FF9F43,#FFE9B8,#ffb84d,#FFD76F)", boxShadow: "0 18px 36px -12px rgba(255,159,67,.65)" }} />
              <div style={{ position: "absolute", inset: 13, borderRadius: "50%", background: "linear-gradient(135deg,#FFF0CE,#FFC24D)", display: "grid", placeItems: "center", boxShadow: "inset 0 3px 9px rgba(255,255,255,.7),inset 0 -7px 12px rgba(180,110,20,.25)" }}>
                <span style={{ fontSize: 60, filter: "drop-shadow(0 3px 4px rgba(150,90,10,.3))" }}>🏆</span>
              </div>
              <div style={{ position: "absolute", top: -4, right: 2, fontSize: 26, animation: "ah-float 3s ease-in-out infinite" }}>✨</div>
              <div style={{ position: "absolute", bottom: 2, left: -2, fontSize: 20, animation: "ah-float 3.4s ease-in-out infinite" }}>⭐</div>
            </div>
            <div style={{ ...POPPINS, display: "inline-block", background: "#FFF7E8", border: "1px solid #ffe1a6", color: "#b7811f", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", padding: "5px 14px", borderRadius: 999, marginBottom: 11 }}>
              Hoàn thành bài học 🎉
            </div>
            <div style={{ ...BALOO, fontWeight: 800, fontSize: 27, lineHeight: 1.15, marginBottom: 8 }}>
              Giỏi lắm, {studentName}! 🎉
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, fontSize: 13.5, color: "#5b6072", marginBottom: 22, lineHeight: 1.4 }}>
              <Character char={char} mood="jump" size={44} face="right" />
              <span>
                <b>{companion.name}</b>: "Em vừa chinh phục xong bài {currentNode?.name ?? ""}!"
              </span>
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
              <div style={{ flex: 1, background: "#F3FBF9", border: "1px solid #e2f3ef", borderRadius: 16, padding: 14 }}>
                <div style={{ ...POPPINS, fontWeight: 800, fontSize: 22, color: "#0FB9A6" }}>
                  {correctSession}/{qTotal}
                </div>
                <div style={{ fontSize: 11, color: "#7c8194" }}>câu đúng</div>
              </div>
              <div style={{ flex: 1, background: "#fff8ec", border: "1px solid #ffe6bd", borderRadius: 16, padding: 14 }}>
                <div style={{ ...POPPINS, fontWeight: 800, fontSize: 22, color: "#e0912a" }}>⭐ {stars}</div>
                <div style={{ fontSize: 11, color: "#7c8194" }}>tổng sao</div>
              </div>
              <div style={{ flex: 1, background: "#faf7ff", border: "1px solid #ece5fb", borderRadius: 16, padding: 14 }}>
                <div style={{ ...POPPINS, fontWeight: 800, fontSize: 22, color: "#7C46E8" }}>
                  {qTotal > 0 ? Math.round((correctSession / qTotal) * 100) : 0}%
                </div>
                <div style={{ fontSize: 11, color: "#7c8194" }}>chính xác</div>
              </div>
            </div>
            <div style={{ ...POPPINS, textAlign: "left", fontSize: 11, fontWeight: 800, color: "#9aa1b0", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 13 }}>
              Bộ sưu tập huy hiệu
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 26 }}>
              {(summary?.badges ?? []).slice(0, 4).map((b) => {
                const earned = b.status === "earned";
                return (
                  <div key={b.code} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 80 }}>
                    <div
                      style={{
                        height: 60,
                        width: 60,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        fontSize: earned ? 28 : 26,
                        border: "2px solid #fff",
                        ...(earned
                          ? { background: `linear-gradient(135deg,${b.colorFrom},${b.colorTo})`, boxShadow: "0 10px 18px -8px rgba(255,159,67,.6),inset 0 2px 5px rgba(255,255,255,.6)" }
                          : { background: "#eef1f4", filter: "grayscale(1)", opacity: 0.5 }),
                      }}
                    >
                      {b.glyph}
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, textAlign: "center", lineHeight: 1.2, color: earned ? "#16161F" : "#a2a8b4" }}>{b.name}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 11 }}>
              <div
                onClick={restart}
                style={{ ...POPPINS, flex: 1, background: "linear-gradient(135deg,#14D9C0,#0FB9A6)", color: "#fff", borderRadius: 15, padding: 15, fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 12px 24px -8px rgba(15,185,166,.55)" }}
              >
                Học tiếp →
              </div>
              <div
                onClick={restart}
                style={{ background: "#fff", border: "1px solid #eef1f4", color: "#5b6072", borderRadius: 15, padding: "15px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                Đóng
              </div>
            </div>
          </div>
        </div>
      )}

      {/* celebration confetti */}
      {celebrate && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 60 }}>
          {confetti.map((c, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                top: -20,
                left: `${c.left}%`,
                width: 9,
                height: 14,
                borderRadius: 3,
                background: c.color,
                transform: `rotate(${c.rot}deg)`,
                animation: `ah-fall ${c.dur}s linear ${c.delay}s forwards`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
