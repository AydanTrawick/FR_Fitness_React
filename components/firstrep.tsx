"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Camera,
  ChevronRight,
  CircleUserRound,
  Dumbbell,
  LayoutDashboard,
  Menu,
  Scale,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { ExerciseLibrary } from "./exercise-library";
import Dashboard from "./dashboard";
import { BmiTracker, FoodTracker, WorkoutTracker } from "./trackers";
import { Guides, Programs } from "./library";
import { AccountDialog, AiTool, Equipment } from "./tools";
import { StoreProvider, useStore } from "./store";
const exercisePages = new Set(["exercises", "favorites", "builder", "saved"]);
const navigation = [
  {
    section: "EXERCISES & WORKOUTS",
    items: [
      { id: "exercises", label: "Exercise Library", Icon: Dumbbell },
      { id: "favorites", label: "Favorite Exercises", Icon: BookOpen },
      { id: "builder", label: "Build Workout", Icon: Activity },
      { id: "saved", label: "Saved Workouts", Icon: BookOpen },
    ],
  },
  {
    section: "OVERVIEW",
    items: [{ id: "home", label: "Dashboard", Icon: LayoutDashboard }, { id: "analysis", label: "Your Analysis", Icon: Activity }],
  },
  {
    section: "YOUR DAILY TOOLS",
    items: [
      { id: "workout", label: "Workout log", Icon: Dumbbell },
      { id: "food", label: "Food log", Icon: Utensils },
      { id: "bmi", label: "BMI calculator", Icon: Scale },
    ],
  },
  {
    section: "PLAN & EXPLORE",
    items: [
      { id: "programs", label: "Workout programs", Icon: Activity },
      { id: "plans", label: "AI plan builder", Icon: Sparkles },
      { id: "equipment", label: "Equipment finder", Icon: Camera },
      { id: "guides", label: "Guides & glossary", Icon: BookOpen },
    ],
  },
];
const pages = new Set([
  ...navigation.flatMap((g) => g.items.map((i) => i.id)),
  "assistant",
]);
function Shell() {
  const router = useRouter();
  const { status, ready, error, notice, setError, refresh, busy } = useStore();
  const [page, setPage] = useState("home");
  const [mobile, setMobile] = useState(false);
  const [account, setAccount] = useState(false);
  useEffect(() => {
    const sync = () => {
      const next = window.location.hash.slice(1);
      setPage(pages.has(next) ? next : "home");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  function go(id: string) {
    if (id === "analysis") { router.push("/analysis"); return; }
    setPage(id);
    window.location.hash = id;
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const label =
    navigation.flatMap((g) => g.items).find((i) => i.id === page)?.label ??
    "Training assistant";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobile && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a href="#home" className="brand" onClick={() => go("home")}>
          <span className="brand-mark">
            <Dumbbell size={24} strokeWidth={2.5} />
          </span>
          <span>
            FirstRep<span className="brand-period">.</span>
            <small>BUILD YOUR EVERYDAY</small>
          </span>
        </a>
        <button
          className="mobile-close btn icon"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X size={20} />
        </button>
        <nav aria-label="Main navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.section}>
              <p>{group.section}</p>
              {group.items.map(({ id, label, Icon }) => (
                <a
                  href={id === "analysis" ? "/analysis" : `#${id}`}
                  className={page === id ? "nav-item active" : "nav-item"}
                  aria-current={page === id ? "page" : undefined}
                  key={id}
                  onClick={() => go(id)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {page === id && <span className="nav-dot" />}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="coach-card">
            <Sparkles size={20} />
            <h4>
              A little guidance.
              <br />A lot of possibility.
            </h4>
            <p>Meet your training assistant.</p>
            <button onClick={() => go("assistant")}>
              Let’s talk <ArrowUpRight size={16} />
            </button>
          </div>
          <button className="profile" onClick={() => setAccount(true)}>
            <span className="avatar">
              {status.user ? (
                status.user.display_name.charAt(0).toUpperCase()
              ) : (
                <CircleUserRound size={22} />
              )}
            </span>
            <span>
              <strong>{status.user?.display_name ?? "Guest explorer"}</strong>
              <small>
                {status.user
                  ? "Manage your account"
                  : "Sign in to save your progress"}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="row">
            <button
              className="btn icon mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span className="muted">Your toolkit</span>
            <ChevronRight size={14} />
            <strong>{label}</strong>
          </div>
          <div className="row">
            <span className="status-chip">
              <span className="dot" />
              {status.user ? "Account connected" : "Guest session"}
            </span>
            <button
              className="top-avatar"
              aria-label="Open account"
              onClick={() => setAccount(true)}
            >
              {status.user ? (
                status.user.display_name.charAt(0).toUpperCase()
              ) : (
                <CircleUserRound size={19} />
              )}
            </button>
          </div>
        </header>
        <main id="main" className="main-content">
          {error && (
            <div className="notice error row between" role="alert">
              <span>{error}</span>
              <button
                className="btn icon"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!ready ? (
            <div className="loading-card">
              <span className="brand-mark">
                <Dumbbell size={30} />
              </span>
              <h2>
                {error ? "Let’s reconnect." : "Getting your toolkit ready…"}
              </h2>
              {error && (
                <button
                  className="btn secondary"
                  onClick={() => void refresh()}
                >
                  Try again
                </button>
              )}
            </div>
          ) : (
            <div
              key={`${status.user?.id ?? "guest"}-${exercisePages.has(page) ? "exercise-hub" : page}`}
              className="page-content"
            >
              {exercisePages.has(page) && (
                <ExerciseLibrary
                  page={page}
                  go={go}
                  onSignIn={() => setAccount(true)}
                />
              )}
              {page === "home" && <Dashboard go={go} />}{" "}
              {page === "bmi" && <BmiTracker />}
              {page === "workout" && <WorkoutTracker />}
              {page === "food" && <FoodTracker />}
              {page === "programs" && <Programs />}
              {page === "guides" && <Guides />}
              {page === "equipment" && <Equipment />}
              {(page === "plans" || page === "assistant") && (
                <AiTool
                  mode={page === "plans" ? "plan" : "assistant"}
                  onSignIn={() => setAccount(true)}
                />
              )}
            </div>
          )}
          <footer className="footer">
            <span>
              FIRSTREP<span className="accent">.</span>{" "}
              <span className="muted">Every rep is a beginning.</span>
            </span>
            <span className="muted">
              Educational tools. Not medical advice.
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="save-status" role="status">
          {busy ? "Saving…" : notice}
        </div>
      )}
      {account && <AccountDialog close={() => setAccount(false)} />}
    </div>
  );
}
export default function FirstRep() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
