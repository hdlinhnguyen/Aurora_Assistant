import { createFileRoute } from "@tanstack/react-router";
import {
  Home, BookOpen, Bell, Settings,
  Calendar, Mic, Sparkles, TrendingUp, Target,
  Award, Flame, ChevronRight, Brain,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen w-full px-6 py-10 md:px-12 md:py-16">
      {/* Header */}
      <header className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[var(--mint)] to-[var(--purple)] shadow-[var(--shadow-card)]">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">MindSync</h1>
            <p className="text-xs text-muted-foreground">Intelligent Study Companion</p>
          </div>
        </div>
        <nav className="hidden gap-8 text-sm font-medium text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#screens" className="hover:text-foreground">Screens</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
        </nav>
        <button className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-[var(--shadow-card)] transition hover:opacity-90">
          Get the app
        </button>
      </header>

      {/* Hero */}
      <section className="mx-auto mt-16 grid max-w-7xl gap-12 md:mt-24 md:grid-cols-2 md:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-[var(--purple)]" />
            AI-powered study assistant
          </span>
          <h2 className="mt-6 text-5xl font-extrabold leading-[1.05] text-foreground md:text-6xl">
            Study Smarter,
            <br />
            <span className="bg-gradient-to-r from-[var(--mint)] to-[var(--purple)] bg-clip-text text-transparent">
              Not Harder.
            </span>
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            AI-generated notes, smart revision planning, and productivity tracking
            to help you achieve more — in one beautifully crafted mobile experience.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button className="rounded-full bg-[var(--mint)] px-7 py-3.5 text-sm font-semibold text-foreground shadow-[var(--shadow-card)] transition hover:brightness-95">
              Start free trial
            </button>
            <button className="rounded-full border border-border bg-white/70 px-7 py-3.5 text-sm font-semibold text-foreground backdrop-blur transition hover:bg-white">
              Watch demo
            </button>
          </div>
          <div className="mt-10 flex items-center gap-8">
            <Stat value="50K+" label="Active learners" />
            <Stat value="4.9★" label="App store rating" />
            <Stat value="72%" label="Avg. goal completion" />
          </div>
        </div>

        {/* Hero phone */}
        <div className="relative flex justify-center">
          <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-[var(--mint)]/30 to-[var(--purple)]/30 blur-3xl" />
          <PhoneFrame className="rotate-[-6deg]">
            <SplashScreen />
          </PhoneFrame>
        </div>
      </section>

      {/* Screens showcase */}
      <section id="screens" className="mx-auto mt-32 max-w-7xl">
        <div className="mb-14 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--purple)]">Product tour</p>
            <h3 className="mt-3 text-4xl font-bold text-foreground md:text-5xl">
              Everything you need to learn better.
            </h3>
          </div>
          <a href="#" className="hidden items-center gap-1 text-sm font-semibold text-foreground md:inline-flex">
            See all screens <ChevronRight className="h-4 w-4" />
          </a>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <ScreenCard label="Home Dashboard" caption="Focus timer, tasks & weekly productivity">
            <DashboardScreen />
          </ScreenCard>
          <ScreenCard label="AI Chat Assistant" caption="Ask, summarize, get study plans">
            <ChatScreen />
          </ScreenCard>
          <ScreenCard label="Profile & Achievements" caption="Track goals and unlock rewards">
            <ProfileScreen />
          </ScreenCard>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto mt-32 max-w-7xl">
        <div className="grid gap-6 md:grid-cols-3">
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="AI-generated notes"
            desc="Turn any lecture or article into structured, key-point summaries in seconds."
            gradient="var(--gradient-mint)"
          />
          <FeatureCard
            icon={<Target className="h-5 w-5" />}
            title="Smart study plans"
            desc="Adaptive schedules based on your performance, exam dates and focus habits."
            gradient="var(--gradient-purple)"
          />
          <FeatureCard
            icon={<TrendingUp className="h-5 w-5" />}
            title="Productivity insights"
            desc="Track streaks, subject performance and weekly progress with rich analytics."
            gradient="var(--gradient-hero)"
          />
        </div>
      </section>

      <footer className="mx-auto mt-32 max-w-7xl border-t border-border pt-8 pb-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} MindSync — Learn smarter, everyday.
      </footer>
    </main>
  );
}

/* ---------------- helpers ---------------- */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function FeatureCard({
  icon, title, desc, gradient,
}: { icon: React.ReactNode; title: string; desc: string; gradient: string }) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-card)] transition hover:-translate-y-1">
      <div
        className="mb-6 grid h-12 w-12 place-items-center rounded-2xl text-white"
        style={{ background: gradient }}
      >
        {icon}
      </div>
      <h4 className="text-xl font-bold text-foreground">{title}</h4>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function ScreenCard({
  label, caption, children,
}: { label: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-[var(--mint)]/20 to-[var(--purple)]/25 blur-2xl" />
        <PhoneFrame>{children}</PhoneFrame>
      </div>
      <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm text-foreground/70">{caption}</p>
    </div>
  );
}

function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative h-[560px] w-[275px] rounded-[3rem] border-[10px] border-[var(--ink)] bg-[var(--ink)] shadow-[var(--shadow-phone)] ${className}`}
    >
      <div className="absolute left-1/2 top-2 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-[var(--ink)]" />
      <div className="relative h-full w-full overflow-hidden rounded-[2.2rem] bg-white">
        <div className="flex items-center justify-between px-6 pt-3 text-[10px] font-semibold text-foreground">
          <span>9:41</span>
          <span>•••</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/* --- Screen: Splash --- */
function SplashScreen() {
  return (
    <div className="relative flex h-[calc(100%-1.5rem)] flex-col items-center justify-between bg-gradient-to-b from-[oklch(0.94_0.11_172)] via-white to-[oklch(0.88_0.12_295)] px-6 py-16">
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 -m-6 rounded-full bg-[var(--mint)]/40 blur-2xl" />
          <div className="relative grid h-20 w-20 place-items-center rounded-3xl bg-white shadow-[var(--shadow-card)]">
            <Brain className="h-10 w-10 text-[var(--mint)]" />
          </div>
        </div>
        <h3 className="mt-6 text-2xl font-extrabold text-foreground">MindSync</h3>
      </div>
      <p className="text-xs font-medium text-muted-foreground">Intelligent Study Companion</p>
    </div>
  );
}

/* --- Screen: Dashboard --- */
function DashboardScreen() {
  return (
    <div className="flex h-[calc(100%-1.5rem)] flex-col bg-[oklch(0.98_0.01_180)] px-4 pt-2">
      <div className="mt-2 flex items-start justify-between">
        <div>
          <p className="text-[10px] text-muted-foreground">Welcome back,</p>
          <h4 className="text-lg font-bold text-foreground">Alex</h4>
          <p className="mt-0.5 text-[9px] text-muted-foreground">Daily study progress</p>
        </div>
        <div className="relative grid h-14 w-14 place-items-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0">
            <circle cx="18" cy="18" r="15" fill="none" stroke="oklch(0.94 0.02 240)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15" fill="none"
              stroke="url(#g1)" strokeWidth="3" strokeLinecap="round"
              strokeDasharray="72 100" transform="rotate(-90 18 18)"
            />
            <defs>
              <linearGradient id="g1" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="oklch(0.82 0.17 172)" />
                <stop offset="1" stopColor="oklch(0.58 0.22 295)" />
              </linearGradient>
            </defs>
          </svg>
          <span className="text-[10px] font-bold text-foreground">72%</span>
        </div>
      </div>

      {/* Focus timer */}
      <div className="mt-3 grid grid-cols-5 gap-2">
        <div className="col-span-2 rounded-2xl bg-[var(--ink)] p-3 text-white">
          <p className="text-[8px] font-medium uppercase tracking-wider text-white/60">Focus timer</p>
          <p className="mt-1 text-xl font-extrabold">45:00</p>
          <button className="mt-2 w-full rounded-full bg-[var(--mint)] py-1 text-[9px] font-semibold text-foreground">
            Start
          </button>
        </div>
        <div className="col-span-3 rounded-2xl border border-border bg-white p-3">
          <p className="text-[8px] font-medium uppercase tracking-wider text-muted-foreground">Upcoming task</p>
          <p className="mt-1 text-xs font-semibold text-foreground leading-tight">Review History Notes</p>
          <span className="mt-2 inline-block rounded-full bg-[var(--purple)]/15 px-2 py-0.5 text-[8px] font-semibold text-[var(--purple)]">
            Priority
          </span>
        </div>
      </div>

      {/* AI reco */}
      <div className="mt-2 rounded-2xl bg-gradient-to-br from-[var(--purple)]/15 to-[var(--mint)]/20 p-3">
        <p className="text-[8px] font-semibold uppercase tracking-wider text-[var(--purple)]">AI Recommendation</p>
        <p className="mt-1 text-[10px] font-medium leading-snug text-foreground">
          Based on your performance, review <span className="font-bold">Biology Chapter 3</span> tonight.
        </p>
      </div>

      {/* Chart */}
      <div className="mt-2 flex-1 rounded-2xl border border-border bg-white p-3">
        <p className="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">Weekly productivity</p>
        <svg viewBox="0 0 200 70" className="mt-1 w-full">
          <defs>
            <linearGradient id="ag" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="oklch(0.58 0.22 295)" stopOpacity="0.35" />
              <stop offset="1" stopColor="oklch(0.82 0.17 172)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,55 L30,40 L60,45 L90,25 L120,30 L150,15 L180,20 L200,10 L200,70 L0,70 Z" fill="url(#ag)" />
          <path d="M0,55 L30,40 L60,45 L90,25 L120,30 L150,15 L180,20 L200,10"
            fill="none" stroke="oklch(0.58 0.22 295)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Nav */}
      <BottomNav active="home" />
    </div>
  );
}

/* --- Screen: Chat --- */
function ChatScreen() {
  return (
    <div className="flex h-[calc(100%-1.5rem)] flex-col bg-white px-4 pt-2">
      <div className="flex items-center justify-between py-2">
        <ChevronRight className="h-4 w-4 rotate-180 text-foreground" />
        <p className="text-xs font-bold text-foreground">Chat</p>
        <span className="text-xs text-foreground">•••</span>
      </div>

      <div className="mt-3 flex-1 space-y-3 overflow-hidden">
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-[oklch(0.96_0.02_180)] p-3">
          <p className="text-[10px] leading-snug text-foreground">
            How can I help you with your studies today, Alex?
          </p>
        </div>
        <div className="ml-auto max-w-[60%] rounded-2xl rounded-tr-sm bg-[var(--mint)] p-3">
          <p className="text-[10px] font-medium text-foreground">Fluent</p>
        </div>
      </div>

      <div>
        <p className="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">Prompt suggestions</p>
        <div className="mt-2 space-y-2">
          {["Generate a quiz for Biology", "Summarize this article", "Create a study plan"].map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-full border border-border px-3 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--purple)]" />
              <p className="text-[10px] text-foreground">{s}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 mb-2 flex items-center gap-2">
        <div className="flex-1 rounded-full border border-border px-3 py-2 text-[10px] text-muted-foreground">
          Message MindSync…
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[var(--mint)] to-[var(--purple)]">
          <Mic className="h-4 w-4 text-white" />
        </div>
      </div>
    </div>
  );
}

/* --- Screen: Profile --- */
function ProfileScreen() {
  return (
    <div className="flex h-[calc(100%-1.5rem)] flex-col bg-[oklch(0.98_0.01_180)] px-4 pt-2">
      <div className="flex flex-col items-center pt-3">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[var(--mint)] to-[var(--purple)] p-[2px]">
          <div className="grid h-full w-full place-items-center rounded-full bg-white text-lg font-bold text-foreground">
            AJ
          </div>
        </div>
        <h4 className="mt-2 text-sm font-bold text-foreground">Alex Johnson</h4>
        <p className="text-[9px] text-muted-foreground">University Student</p>
      </div>

      <div className="mt-4">
        <p className="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">Goals</p>
        <div className="mt-2 space-y-2">
          {[
            { label: "Finish Biology chapter", pct: 80 },
            { label: "Daily 45m focus", pct: 55 },
          ].map((g) => (
            <div key={g.label} className="rounded-xl border border-border bg-white p-2">
              <div className="flex items-center justify-between text-[9px] font-medium text-foreground">
                <span>{g.label}</span>
                <span className="text-muted-foreground">{g.pct}%</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--mint)] to-[var(--purple)]"
                  style={{ width: `${g.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">Achievements</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { icon: <Flame className="h-3 w-3" />, name: "Focus Master", sub: "5 streaks" },
            { icon: <Award className="h-3 w-3" />, name: "Note Wizard", sub: "6 notes" },
            { icon: <Sparkles className="h-3 w-3" />, name: "Exemplar", sub: "12 quizzes" },
            { icon: <TrendingUp className="h-3 w-3" />, name: "Rising", sub: "8 days" },
          ].map((a) => (
            <div key={a.name} className="flex items-center gap-2 rounded-xl border border-border bg-white p-2">
              <div className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--mint)]/25 text-[var(--purple)]">
                {a.icon}
              </div>
              <div>
                <p className="text-[9px] font-semibold text-foreground leading-none">{a.name}</p>
                <p className="mt-0.5 text-[8px] text-muted-foreground">{a.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <BottomNav active="profile" />
    </div>
  );
}

function BottomNav({ active }: { active: "home" | "profile" }) {
  const items = [
    { id: "home", icon: Home },
    { id: "notes", icon: BookOpen },
    { id: "cal", icon: Calendar },
    { id: "bell", icon: Bell },
    { id: "profile", icon: Settings },
  ];
  return (
    <div className="mt-2 mb-2 flex items-center justify-around rounded-full border border-border bg-white px-3 py-2 shadow-sm">
      {items.map(({ id, icon: Icon }) => (
        <div
          key={id}
          className={`grid h-7 w-7 place-items-center rounded-full ${
            active === id ? "bg-foreground text-background" : "text-muted-foreground"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
      ))}
    </div>
  );
}
