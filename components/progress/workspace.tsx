"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Check,
  Dumbbell,
  Heart,
  LockKeyhole,
  MessageCircle,
  Plus,
  Scale,
  Send,
  Sparkles,
  Star,
  Trash2,
  Utensils,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, errorText } from "@/lib/client";
import {
  fromKg,
  toKg,
  goalLabels,
  DISCLAIMER,
  type BodyProfile,
  type Card,
  type Checkin,
  type CoachMessage,
  type Plan,
  type ProgressState,
} from "@/lib/progress/schema";
import { isAdult } from "@/lib/progress/safety";
import type { Exercise, Workout } from "@/lib/workouts";
import { BrandLogo } from "../brand-logo";
import "./progress.css";

type Mode = "progress" | "check-in" | "coach" | "playbook";
const labels = {
  progress: "Your progress",
  "check-in": "Your check-in",
  coach: "Progress Coach",
  playbook: "Your Playbook",
};
function weightLabel(kg: number, units = "imperial") {
  return `${fromKg(kg, units).toFixed(1)} ${units === "imperial" ? "lb" : "kg"}`;
}
function displayDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function ProgressWorkspace({
  mode,
  checkinId,
}: {
  mode: Mode;
  checkinId?: string;
}) {
  const [state, setState] = useState<ProgressState | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setState(await api<ProgressState>("progress"));
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void api<ProgressState>("progress")
      .then(setState)
      .catch((e) => setError(errorText(e)));
  }, []);
  return (
    <div className="pc-workspace">
      <header className="pc-header">
        <Link className="pc-brand" href="/">
          <BrandLogo size={30} />
          <strong>
            FirstRep<span className="accent">.</span>
          </strong>
        </Link>
        <Link className="pc-back" href="/">
          ← Dashboard
        </Link>
      </header>
      <nav className="pc-nav" aria-label="Progress navigation">
        {(["progress", "coach", "playbook"] as const).map((m) => (
          <Link
            key={m}
            href={`/${m}`}
            aria-current={mode === m ? "page" : undefined}
          >
            {m === "progress" ? (
              <Scale size={17} />
            ) : m === "coach" ? (
              <MessageCircle size={17} />
            ) : (
              <Dumbbell size={17} />
            )}
            {m === "progress"
              ? "Progress"
              : m === "coach"
                ? "Coach"
                : "Playbook"}
          </Link>
        ))}
      </nav>
      <main className="pc-main">
        <div className="pc-title">
          <p className="pc-eyebrow">
            A LITTLE CONSISTENCY. A LOT OF POSSIBILITY.
          </p>
          <h1>{labels[mode]}</h1>
          <p className="muted">
            {mode === "progress"
              ? "See your change. Find your rhythm. Keep moving forward."
              : mode === "check-in"
                ? "A moment to check in with yourself."
                : mode === "coach"
                  ? "Your goals, your routine, a plan that fits."
                  : "A clear next step, every day."}
          </p>
        </div>
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button className="btn secondary" onClick={() => void reload()}>
              Retry
            </button>
          </div>
        )}
        {!state ? (
          <div className="pc-panel" role="status">
            {error
              ? "Progress is temporarily unavailable."
              : "Loading your saved progress…"}
          </div>
        ) : (
          <>
            {mode === "progress" && <Timeline state={state} reload={reload} />}
            {mode === "check-in" && (
              <Baseline state={state} checkinId={checkinId} reload={reload} />
            )}
            {mode === "coach" && <Coach state={state} reload={reload} />}
            {mode === "playbook" && (
              <PlaybookView state={state} reload={reload} />
            )}
          </>
        )}
        <footer className="pc-footer">{DISCLAIMER}</footer>
      </main>
    </div>
  );
}

function Timeline({
  state,
  reload,
}: {
  state: ProgressState;
  reload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Checkin | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const units = state.profile?.units_pref || "imperial";
  const latest = state.checkins[0];
  const first = state.checkins.at(-1);
  const hasPhotos = state.checkins.some((c) => c.photos.length);
  const chart = [...state.checkins].reverse().map((c) => ({
    id: c.id,
    date: new Date(c.created_at).getTime(),
    weight: Number(fromKg(c.weight_kg, units).toFixed(1)),
  }));
  async function removePhotos() {
    setBusy(true);
    setError("");
    try {
      await api("progress/photos", {}, "DELETE");
      setDeleting(false);
      setSelected(null);
      await reload();
    } catch (e) {
      setError(errorText(e));
      await reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="pc-hero">
        <div>
          <span className="pc-pill">
            <Sparkles size={15} /> YOUR NEXT CHAPTER
          </span>
          <h2>
            {latest ? "Small steps. Real progress." : "Start where you are."}
          </h2>
          <p>
            {latest
              ? "Keep checking in. Your measurements tell a story over time, not in a single day."
              : "Set your baseline, tell your coach what you’re working toward, and build a Playbook around your life."}
          </p>
          <Link className="btn primary" href="/progress/check-in">
            <Plus size={17} />
            {latest ? "Weekly check-in" : "Start Baseline"}
          </Link>
          {latest && (
            <Link className="btn secondary" href="/coach">
              Talk to your coach <ArrowRight size={16} />
            </Link>
          )}
        </div>
        <div className="pc-hero-icon">
          <Scale size={64} strokeWidth={1} />
          <span>EVERY REP IS A BEGINNING.</span>
        </div>
      </section>
      {!latest ? (
        <div className="pc-grid three">
          {[
            {
              title: "01 · Set your baseline",
              text: "Weight, height, and how you’re feeling. Photos are always optional.",
              Icon: Scale,
            },
            {
              title: "02 · Make it yours",
              text: "Tell the coach your goal in your own words. Review your Goal Card.",
              Icon: MessageCircle,
            },
            {
              title: "03 · Find your rhythm",
              text: "Save your training, nutrition, and everyday habits in one Playbook.",
              Icon: Heart,
            },
          ].map(({ title, text, Icon }) => (
            <section className="pc-panel" key={title}>
              <Icon className="accent" size={24} />
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </section>
          ))}
        </div>
      ) : (
        <>
          <div className="pc-grid three">
            <section className="pc-panel">
              <p className="muted">Latest weight</p>
              <strong className="pc-stat">
                {weightLabel(latest.weight_kg, units)}
              </strong>
              <span className="muted">{displayDate(latest.created_at)}</span>
            </section>
            <section className="pc-panel">
              <p className="muted">Since your baseline</p>
              <strong className="pc-stat">
                {first
                  ? `${latest.weight_kg - first.weight_kg >= 0 ? "+" : ""}${fromKg(latest.weight_kg - first.weight_kg, units).toFixed(1)} ${units === "imperial" ? "lb" : "kg"}`
                  : "—"}
              </strong>
              <span className="muted">
                {state.checkins.length} saved check-in
                {state.checkins.length === 1 ? "" : "s"}
              </span>
            </section>
            <section className="pc-panel">
              <p className="muted">Your focus</p>
              <strong className="pc-stat small">
                {state.playbook
                  ? goalLabels[state.playbook.goal.type]
                  : "Let’s set a goal"}
              </strong>
              <Link
                className="pc-text-link"
                href={state.playbook ? "/playbook" : "/coach"}
              >
                {state.playbook
                  ? `Open Playbook · v${state.playbook.version}`
                  : "Meet your coach"}{" "}
                <ArrowRight size={15} />
              </Link>
            </section>
          </div>
          <section className="pc-panel">
            <div className="row between">
              <div>
                <h3>Weight over time</h3>
                <p className="muted">Tap a check-in below for the details.</p>
              </div>
              <span className="pc-pill">
                {units === "imperial" ? "lb" : "kg"}
              </span>
            </div>
            <div
              className="pc-chart"
              role="img"
              aria-label="Weight trend chart with your goal line"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chart}
                  margin={{ left: 0, right: 25, top: 25, bottom: 10 }}
                >
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(v) =>
                      displayDate(new Date(v).toISOString())
                    }
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    width={50}
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                  />
                  <Tooltip
                    labelFormatter={(v) =>
                      displayDate(new Date(Number(v)).toISOString())
                    }
                    contentStyle={{
                      background: "var(--surface)",
                      borderColor: "var(--line)",
                      color: "var(--foreground)",
                    }}
                  />
                  {state.playbook?.goal.target_weight_kg != null && (
                    <ReferenceLine
                      y={fromKg(state.playbook.goal.target_weight_kg, units)}
                      stroke="var(--accent)"
                      strokeDasharray="5 5"
                      label={{
                        value: "Goal",
                        fill: "var(--accent)",
                        position: "insideTopRight",
                      }}
                      ifOverflow="extendDomain"
                    />
                  )}
                  <Line
                    dataKey="weight"
                    name={`Weight (${units === "imperial" ? "lb" : "kg"})`}
                    stroke="var(--accent)"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{
                      r: 7,
                      onClick: (_event, data) => {
                        const id = (
                          data as { payload?: { id: string } } | undefined
                        )?.payload?.id;
                        setSelected(
                          state.checkins.find((c) => c.id === id) || null,
                        );
                      },
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="pc-panel">
            <h3>Check-in history</h3>
            <div className="pc-history">
              {state.checkins.map((c) => (
                <button
                  className="pc-history-row"
                  key={c.id}
                  onClick={() => setSelected(c)}
                  aria-expanded={selected?.id === c.id}
                >
                  <span>
                    <strong>{displayDate(c.created_at)}</strong>
                    <small>
                      {c.photos.length
                        ? `${c.photos.length} private photo${c.photos.length === 1 ? "" : "s"}`
                        : "Weight + wellbeing"}
                    </small>
                  </span>
                  <strong>{weightLabel(c.weight_kg, units)}</strong>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
          </section>
          {selected && (
            <section className="pc-panel" aria-label="Selected check-in">
              <div className="row between">
                <h3>
                  {displayDate(selected.created_at)} ·{" "}
                  {weightLabel(selected.weight_kg, units)}
                </h3>
                <button
                  className="btn secondary"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>
              <p>
                Energy {selected.energy}/5 · Soreness {selected.soreness}/5 ·
                Adherence {selected.adherence}/5
              </p>
              {selected.notes && <p>{selected.notes}</p>}
              <div className="pc-grid three">
                {selected.photos.map((p) => (
                  <PrivatePhoto key={p.id} id={p.id} pose={p.pose} />
                ))}
              </div>
              {selected.photos.length < 3 && (
                <Link
                  className="pc-text-link"
                  href={`/progress/check-in?checkin=${selected.id}`}
                >
                  Add optional photos
                </Link>
              )}
            </section>
          )}
        </>
      )}
      <section className="pc-privacy">
        <LockKeyhole size={18} />
        <p>
          Progress photos are private. View links expire in 10 minutes. You
          choose whether to upload.
        </p>
        <button className="btn secondary" onClick={() => setDeleting(true)}>
          <Trash2 size={15} />
          Delete all my photos
        </button>
      </section>
      {deleting && (
        <section
          className="pc-panel pc-danger"
          role="alertdialog"
          aria-label="Delete all progress photos"
        >
          <h3>Delete all progress photos?</h3>
          <p>
            This permanently removes your photos and their analysis. Your
            weights and Playbook stay saved.
            {!hasPhotos && " This also retries any queued storage deletions."}
          </p>
          <div className="row">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => setDeleting(false)}
            >
              Keep photos
            </button>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => void removePhotos()}
            >
              {busy ? "Deleting…" : "Delete all my photos"}
            </button>
          </div>
        </section>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
function PrivatePhoto({ id, pose }: { id: string; pose: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await api<{ url: string }>(`progress/photos/${id}/url`);
      setUrl(response.url);
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);
  useEffect(() => {
    // Hydrate and refresh an authenticated URL from external storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(() => void load(), 540000);
    return () => clearInterval(timer);
  }, [load]);
  // Use the authenticated original; routing private photos through the shared image optimizer would cache sensitive bytes.
  return (
    <figure className="pc-photo">
      <figcaption>{pose} · Private</figcaption>
      {url && !error ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`${pose} progress photo`}
          onError={() => setError("Photo link unavailable. Refresh to retry.")}
        />
      ) : (
        <p>{error || "Loading private photo…"}</p>
      )}
      {error && (
        <button className="btn secondary" onClick={() => void load()}>
          Refresh photo
        </button>
      )}
    </figure>
  );
}

function Baseline({
  state,
  checkinId,
  reload,
}: {
  state: ProgressState;
  checkinId?: string;
  reload: () => Promise<void>;
}) {
  const existing = state.checkins.find((c) => c.id === checkinId);
  const [id, setId] = useState(existing?.id || "");
  const [profile, setProfile] = useState<BodyProfile>(
    state.profile || {
      height_cm: 0,
      sex: "unspecified",
      birth_year: 0,
      experience: "beginner",
      equipment: ["Full gym"],
      days_per_week: 4,
      diet_restrictions: [],
      units_pref: "imperial",
      hide_bodyfat: true,
    },
  );
  const [weight, setWeight] = useState<number>(0);
  const [energy, setEnergy] = useState(3);
  const [soreness, setSoreness] = useState(3);
  const [adherence, setAdherence] = useState(3);
  const [notes, setNotes] = useState("");
  const [restrictions, setRestrictions] = useState(
    profile.diet_restrictions.join(", "),
  );
  const [equipment, setEquipment] = useState(profile.equipment.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(state.photoConsent);
  const [consentChecked, setConsentChecked] = useState(false);
  const [adultChecked, setAdultChecked] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>(
    existing?.photos.map((p) => p.pose) || [],
  );
  const [uploading, setUploading] = useState("");
  const imperial = profile.units_pref === "imperial";
  const field = <K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>("progress/checkins", {
        id: crypto.randomUUID(),
        profile: {
          ...profile,
          equipment: equipment
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          diet_restrictions: restrictions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        weight_kg: weight,
        energy,
        soreness,
        adherence,
        notes,
      });
      setId(result.id);
      window.history.replaceState(
        null,
        "",
        "/progress/check-in?checkin=" + result.id,
      );
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirmConsent() {
    setBusy(true);
    setError("");
    try {
      await api("progress/consent", { consent: true, adult: true });
      setConsent(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function upload(pose: string, file?: File) {
    if (!file) return;
    setUploading(pose);
    setError("");
    try {
      if (file.size > 4_000_000) throw new Error("Choose a photo under 4 MB.");
      const form = new FormData();
      form.set("checkin_id", id);
      form.set("pose", pose);
      form.set("photo", file);
      const response = await fetch("/api/progress/photos", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setUploaded((list) => [...list, pose]);
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading("");
    }
  }
  return (
    <div className="pc-form-wrap">
      <div className="pc-step">
        <span className={!id ? "active" : ""}>1 · Baseline & wellbeing</span>
        <span className={id ? "active" : ""}>2 · Optional private photos</span>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {!id ? (
        <form className="pc-panel pc-form" onSubmit={submit}>
          <div className="row between">
            <h2>
              {state.profile
                ? "How are you doing?"
                : "Let’s set your baseline."}
            </h2>
            <div className="pc-unit" aria-label="Measurement units">
              <button
                type="button"
                aria-pressed={imperial}
                onClick={() => field("units_pref", "imperial")}
              >
                lb / ft-in
              </button>
              <button
                type="button"
                aria-pressed={!imperial}
                onClick={() => field("units_pref", "metric")}
              >
                kg / cm
              </button>
            </div>
          </div>
          <div className="pc-grid two">
            <label>
              Weight ({imperial ? "lb" : "kg"})
              <input
                type="number"
                required
                min={imperial ? 44.1 : 20}
                max={imperial ? 881.8 : 400}
                step="0.1"
                value={
                  weight
                    ? Number(fromKg(weight, profile.units_pref).toFixed(1))
                    : ""
                }
                onChange={(e) =>
                  setWeight(toKg(Number(e.target.value), profile.units_pref))
                }
                placeholder={imperial ? "e.g. 160" : "e.g. 73"}
              />
            </label>
            {imperial ? (
              <fieldset>
                <legend>Height</legend>
                <div className="pc-grid two">
                  <label>
                    Feet
                    <input
                      type="number"
                      required
                      min="2"
                      max="8"
                      value={
                        profile.height_cm
                          ? Math.floor(
                              Math.round(profile.height_cm / 2.54) / 12,
                            )
                          : ""
                      }
                      onChange={(e) =>
                        field(
                          "height_cm",
                          (Number(e.target.value) * 12 +
                            (Math.round(profile.height_cm / 2.54) % 12)) *
                            2.54,
                        )
                      }
                    />
                  </label>
                  <label>
                    Inches
                    <input
                      type="number"
                      required
                      min="0"
                      max="11"
                      value={
                        profile.height_cm
                          ? Math.round(profile.height_cm / 2.54) % 12
                          : ""
                      }
                      onChange={(e) =>
                        field(
                          "height_cm",
                          (Math.floor(
                            Math.round(profile.height_cm / 2.54) / 12,
                          ) *
                            12 +
                            Number(e.target.value)) *
                            2.54,
                        )
                      }
                    />
                  </label>
                </div>
              </fieldset>
            ) : (
              <label>
                Height (cm)
                <input
                  type="number"
                  required
                  min="80"
                  max="250"
                  step="0.1"
                  value={profile.height_cm || ""}
                  onChange={(e) => field("height_cm", Number(e.target.value))}
                />
              </label>
            )}
            <label>
              Birth year
              <input
                type="number"
                required
                min="1900"
                max={new Date().getFullYear() - 5}
                value={profile.birth_year || ""}
                onChange={(e) => field("birth_year", Number(e.target.value))}
                placeholder="e.g. 1995"
              />
              <small className="muted">
                Photos are available only to adults 18+.
              </small>
            </label>
            <label>
              Sex (for calorie estimates)
              <select
                value={profile.sex}
                onChange={(e) =>
                  field("sex", e.target.value as BodyProfile["sex"])
                }
              >
                <option value="unspecified">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>
            <label>
              Experience level
              <select
                value={profile.experience}
                onChange={(e) =>
                  field(
                    "experience",
                    e.target.value as BodyProfile["experience"],
                  )
                }
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label>
              Training days per week
              <select
                value={profile.days_per_week}
                onChange={(e) => field("days_per_week", Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {d} day{d === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Available equipment
              <input
                required
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                maxLength={500}
                placeholder="Full gym, dumbbells, or bodyweight"
              />
            </label>
            <label>
              Dietary restrictions / allergies
              <input
                value={restrictions}
                onChange={(e) => setRestrictions(e.target.value)}
                maxLength={1500}
                placeholder="e.g. no pork, dairy-free"
              />
              <small className="muted">
                Separate with commas. You can discuss budget with the coach.
              </small>
            </label>
          </div>
          <h3>A quick wellbeing check</h3>
          <div className="pc-grid three">
            {[
              {
                label: "Energy",
                value: energy,
                set: setEnergy,
                hint: "1 = low · 5 = high",
              },
              {
                label: "Soreness",
                value: soreness,
                set: setSoreness,
                hint: "1 = none · 5 = very sore",
              },
              {
                label: "Adherence",
                value: adherence,
                set: setAdherence,
                hint: "1 = little · 5 = consistent",
              },
            ].map((s) => (
              <label key={s.label}>
                {s.label}
                <select
                  value={s.value}
                  onChange={(e) => s.set(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                <small className="muted">{s.hint}</small>
              </label>
            ))}
          </div>
          <label>
            Anything else? (optional)
            <textarea
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How you’re feeling, what’s going well…"
            />
          </label>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving check-in…" : "Save check-in & continue"}
            <ArrowRight size={17} />
          </button>
        </form>
      ) : (
        <section className="pc-panel pc-form">
          <span className="pc-pill">
            <Check size={15} /> WEIGHT CHECK-IN SAVED
          </span>
          <h2>Photos are your choice.</h2>
          <p className="muted">
            A consistent reference for your journey. Body analysis arrives in a
            later update.
          </p>
          {!isAdult(profile) ? (
            <div className="notice">
              Photo uploads are for adults 18+. You can still track weight and
              build a balanced Playbook.
            </div>
          ) : !state.capabilities.photos ? (
            <div className="notice">
              Private photo uploads aren’t connected yet. Continue with your
              saved weight check-in.
            </div>
          ) : !consent ? (
            <div className="pc-consent">
              <LockKeyhole size={25} className="accent" />
              <h3>Your photos, kept private.</h3>
              <p>
                Photos are stored in private storage and available only through
                signed links that expire within 10 minutes. Uploads are checked
                for safety using our AI provider. With photo analysis enabled in
                a future phase, they will also be used to generate your progress
                insights. You can delete all photos anytime from Progress.
              </p>
              <p>
                Wear fitted, opaque clothing: shorts and a shirt or sports bra.
                Nude or explicit uploads are rejected. Avoid including other
                people.
              </p>
              <label className="pc-checkbox">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                />
                I consent to private storage and AI moderation of my progress
                photos.
              </label>
              <label className="pc-checkbox">
                <input
                  type="checkbox"
                  checked={adultChecked}
                  onChange={(e) => setAdultChecked(e.target.checked)}
                />
                I confirm I am 18 or older.
              </label>
              <button
                className="btn secondary"
                disabled={!consentChecked || !adultChecked || busy}
                onClick={() => void confirmConsent()}
              >
                {busy ? "Saving consent…" : "Enable optional photos"}
              </button>
            </div>
          ) : (
            <>
              <p>
                Use the same spot and lighting, fitted clothing, and hold the
                phone at chest height. Upload clear JPEG, PNG, or WebP images
                under 4 MB.
              </p>
              <div className="pc-grid three">
                {["front", "side", "back"].map((pose) => (
                  <div className="pc-upload" key={pose}>
                    <strong>
                      {pose.charAt(0).toUpperCase() + pose.slice(1)}
                    </strong>
                    {uploaded.includes(pose) ? (
                      <span className="pc-pill">
                        <Check size={15} />
                        Saved privately
                      </span>
                    ) : (
                      <label>
                        {uploading === pose
                          ? "Checking and saving…"
                          : "Choose photo"}
                        <input
                          aria-label={`Upload ${pose} photo`}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={!!uploading}
                          onChange={(e) =>
                            void upload(pose, e.target.files?.[0])
                          }
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          <Link
            className={`btn primary ${uploading ? "pc-disabled" : ""}`}
            href="/coach"
            aria-disabled={!!uploading}
            onClick={(e) => {
              if (uploading) e.preventDefault();
            }}
          >
            Continue to coach <ArrowRight size={17} />
          </Link>
          <Link className="pc-text-link" href="/progress">
            Back to progress
          </Link>
        </section>
      )}
    </div>
  );
}

function Coach({
  state,
  reload,
}: {
  state: ProgressState;
  reload: () => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<CoachMessage[]>(state.messages);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  useEffect(() => {
    if (!running.current) setMessages(state.messages);
  }, [state.messages]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, status]);
  useEffect(() => {
    const edit = new URLSearchParams(window.location.search).get("edit");
    // Synchronize the edit deep link from browser navigation.
    if (["training", "nutrition", "habits", "tips"].includes(edit || "")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrompt(`I’d like to edit my ${edit} plan. `);
    }
  }, []);
  async function send(e?: FormEvent, text = prompt) {
    e?.preventDefault();
    if (!text.trim() || running.current) return;
    running.current = true;
    setBusy(true);
    setPrompt("");
    setError("");
    setStatus("Connecting to your coach…");
    const pendingId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: { text },
        created_at: new Date().toISOString(),
      },
      {
        id: pendingId,
        role: "assistant",
        content: { text: "", cards: [] },
        created_at: new Date().toISOString(),
      },
    ]);
    const update = (fn: (message: CoachMessage) => CoachMessage) =>
      setMessages((m) => m.map((x) => (x.id === pendingId ? fn(x) : x)));
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      if (!response.body) throw new Error("The coach stream was unavailable.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      try {
        while (true) {
          const result = await reader.read();
          buffer += decoder
            .decode(result.value, { stream: !result.done })
            .replace(/\r\n/g, "\n");
          let split;
          while ((split = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            const event = block.match(/^event: (.+)$/m)?.[1];
            const raw = block.match(/^data: (.+)$/m)?.[1];
            if (!raw) continue;
            const data = JSON.parse(raw);
            if (event === "text") {
              setStatus("");
              update((m) => ({
                ...m,
                content: { ...m.content, text: m.content.text + data.text },
              }));
            } else if (event === "card")
              update((m) => ({
                ...m,
                content: {
                  ...m.content,
                  cards: [...(m.content.cards || []), data],
                },
              }));
            else if (event === "status") setStatus(data.text);
            else if (event === "done") {
              completed = true;
              update((m) => ({ ...m, id: data.id }));
            } else if (event === "error") throw new Error(data.error);
          }
          if (result.done) break;
        }
      } finally {
        reader.releaseLock();
      }
      if (!completed)
        throw new Error(
          "The connection ended before the reply finished. Your saved progress is safe; retry your message.",
        );
    } catch (e) {
      setError(errorText(e));
      setPrompt(text);
    } finally {
      running.current = false;
      setStatus("");
      await reload();
      setBusy(false);
    }
  }
  if (!state.profile)
    return (
      <Empty
        title="A baseline makes it personal."
        text="Save your weight and training preferences so your coach can build around you."
        href="/progress/check-in"
        action="Start Baseline"
      />
    );
  return (
    <div className="pc-chat-layout">
      <section className="pc-chat">
        <div className="pc-chat-heading">
          <span className="pc-coach-avatar">
            <Sparkles size={21} />
          </span>
          <div>
            <strong>Your Progress Coach</strong>
            <small>Guidance grounded in your check-ins</small>
          </div>
          {state.playbook && (
            <Link className="pc-text-link" href="/playbook">
              Playbook v{state.playbook.version} <ArrowRight size={15} />
            </Link>
          )}
        </div>
        <p className="pc-chat-privacy">
          When you message the coach, your profile, recent check-ins,
          conversation, and Playbook are shared with Anthropic to personalize
          guidance.
        </p>
        {!state.capabilities.coach && (
          <div className="notice">
            The AI coach isn’t connected yet. Your check-ins are saved.
          </div>
        )}
        <div
          className="pc-messages"
          role="log"
          aria-label="Coach conversation"
          aria-live="polite"
        >
          {!messages.length && (
            <div className="pc-chat-welcome">
              <Sparkles size={30} className="accent" />
              <h2>What would you like to work toward?</h2>
              <p className="muted">
                Tell me in your own words. We’ll turn it into a plan you can
                keep coming back to.
              </p>
              <div className="pc-chips">
                {Object.entries(goalLabels).map(([key, label]) => (
                  <button
                    key={key}
                    className="btn secondary"
                    disabled={busy || !state.capabilities.coach}
                    onClick={() =>
                      void send(undefined, `I want to ${label.toLowerCase()}.`)
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <article className={`pc-message ${m.role}`} key={m.id}>
              <small>{m.role === "user" ? "YOU" : "PROGRESS COACH"}</small>
              {m.content.text && <p>{m.content.text}</p>}
              {m.content.cards?.map((card) => (
                <CoachCard
                  key={card.id}
                  card={card}
                  state={state}
                  reload={reload}
                  streaming={busy}
                  onEdit={(text) => {
                    setPrompt(text);
                  }}
                />
              ))}
            </article>
          ))}
          {status && (
            <p className="muted" role="status">
              {status}
            </p>
          )}
          <div ref={bottom} />
        </div>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <form className="pc-composer" onSubmit={(e) => void send(e)}>
          <label className="sr-only" htmlFor="coach-message">
            Message your coach
          </label>
          <textarea
            id="coach-message"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            maxLength={3000}
            placeholder="e.g. I want to gain weight and build a bigger chest…"
            disabled={busy || !state.capabilities.coach}
          />
          <button
            className="btn primary"
            aria-label="Send message"
            disabled={busy || !prompt.trim() || !state.capabilities.coach}
          >
            <Send size={19} />
          </button>
        </form>
      </section>
      <aside className="pc-panel pc-chat-context">
        <span className="pc-eyebrow">BUILT AROUND YOU</span>
        <h3>Your starting point</h3>
        <p>
          {state.checkins[0] &&
            weightLabel(state.checkins[0].weight_kg, state.profile.units_pref)}
        </p>
        <p>{state.profile.days_per_week} days / week</p>
        <p>{state.profile.equipment.join(" · ")}</p>
        <p className="muted">{state.profile.experience}</p>
        <hr />
        <p className="muted">
          Your Goal Card is a proposal. Your Playbook is saved when you confirm
          it. Later changes always need your approval.
        </p>
        <Link className="pc-text-link" href="/progress/check-in">
          Update your check-in <ArrowRight size={15} />
        </Link>
      </aside>
    </div>
  );
}

function CoachCard({
  card,
  state,
  reload,
  onEdit,
  streaming = false,
}: {
  card: Card;
  state: ProgressState;
  reload: () => Promise<void>;
  onEdit?: (text: string) => void;
  streaming?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Plan | null>(null);
  async function confirm(accepted = true) {
    setBusy(true);
    setError("");
    try {
      await api(
        card.kind === "goal"
          ? "progress/goals/confirm"
          : "progress/adjustments",
        { id: card.id, ...(card.kind === "adjustment" ? { accepted } : {}) },
      );
      if (card.kind === "goal") router.push("/playbook");
      else await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function showPreview() {
    setBusy(true);
    setError("");
    try {
      setPreview(
        (await api<{ proposed: Plan }>(`progress/adjustments?id=${card.id}`))
          .proposed,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const pending =
    card.kind === "goal" ? card.status === "draft" : card.status === "pending";
  return (
    <div className="pc-goal-card">
      <span className="pc-eyebrow">
        {card.kind === "goal" ? "YOUR GOAL CARD" : "PROPOSED ADJUSTMENT"}
      </span>
      {card.kind === "goal" ? (
        <>
          <h3>{goalLabels[card.goal.type]}</h3>
          <p>
            {card.goal.focus_areas.length
              ? `Focus: ${card.goal.focus_areas.join(", ")}`
              : "Balanced, sustainable progress"}
          </p>
          <div className="pc-chips">
            <span className="pc-pill">
              {card.goal.target_weight_kg != null
                ? `Target ${weightLabel(card.goal.target_weight_kg, state.profile?.units_pref)}`
                : "Habit & strength focus"}
            </span>
            <span className="pc-pill">{card.goal.timeline_weeks} weeks</span>
            <span className="pc-pill">
              {state.profile?.days_per_week} days / week
            </span>
            <span className="pc-pill">
              {state.profile?.equipment.join(", ")}
            </span>
          </div>
          <p className="muted">
            Diet:{" "}
            {card.goal.diet_restrictions.join(", ") || "No stated restrictions"}{" "}
            · Injuries: {card.goal.injuries || "Not specified"} · Food budget:{" "}
            {card.goal.food_budget || "Not specified"}
          </p>
          {card.goal.safety_notes.map((note) => (
            <p key={note} className="pc-safety">
              {note}
            </p>
          ))}
        </>
      ) : (
        <>
          <h3>{card.reason}</h3>
          <p>{card.summary}</p>
          <button
            className="btn secondary"
            disabled={busy || streaming}
            onClick={() => void showPreview()}
          >
            Preview proposed Playbook
          </button>
          {preview && <PlanContents plan={preview} preview />}
        </>
      )}
      {pending ? (
        <div className="row pc-card-actions">
          <button
            className="btn primary"
            disabled={
              busy || streaming || (card.kind === "adjustment" && !preview)
            }
            onClick={() => void confirm()}
          >
            {busy
              ? card.kind === "goal"
                ? "Building your Playbook…"
                : "Working…"
              : card.kind === "goal"
                ? "Looks good · Create Playbook"
                : "Approve adjustment"}
            <Check size={16} />
          </button>
          {card.kind === "goal" ? (
            <button
              className="btn secondary"
              disabled={busy || streaming}
              onClick={() => onEdit?.("I’d like to edit this Goal Card: ")}
            >
              Edit
            </button>
          ) : (
            <button
              className="btn secondary"
              disabled={busy || streaming}
              onClick={() => void confirm(false)}
            >
              Reject
            </button>
          )}
        </div>
      ) : (
        <p className="pc-pill">
          {card.status === "active"
            ? "Confirmed · Playbook saved"
            : card.status}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PlaybookView({
  state,
  reload,
}: {
  state: ProgressState;
  reload: () => Promise<void>;
}) {
  if (!state.playbook)
    return (
      <Empty
        title="A plan for your everyday."
        text="Tell your coach what you’re working toward, then confirm your Goal Card to save your first Playbook."
        href={state.profile ? "/coach" : "/progress/check-in"}
        action={state.profile ? "Set a goal with your coach" : "Start Baseline"}
      />
    );
  const book = state.playbook;
  return (
    <>
      <section className="pc-playbook-summary">
        <div>
          <span className="pc-eyebrow">
            SAVED PLAYBOOK · VERSION {book.version}
          </span>
          <h2>
            {goalLabels[book.goal.type]}
            {book.goal.focus_areas.length
              ? ` · ${book.goal.focus_areas.join(" & ")}`
              : ""}
          </h2>
          <p className="muted">
            {book.goal.timeline_weeks} weeks · Target date{" "}
            {book.goal.target_date}
            {book.goal.target_weight_kg != null
              ? ` · ${weightLabel(book.goal.target_weight_kg, state.profile?.units_pref)}`
              : ""}
          </p>
        </div>
        <Link className="btn secondary" href="/coach">
          <MessageCircle size={16} />
          Edit with coach
        </Link>
      </section>
      {book.goal.safety_notes.map((note) => (
        <div className="notice" key={note}>
          {note}
        </div>
      ))}
      <PlanContents plan={book.plan} state={state} reload={reload} />
      {state.adjustments.length > 0 && (
        <section className="pc-panel">
          <h3>Changes for your review</h3>
          <p className="muted">
            Your current Playbook stays in place until you approve.
          </p>
          {state.adjustments.map((card) => (
            <CoachCard
              card={card}
              state={state}
              reload={reload}
              key={card.id}
            />
          ))}
        </section>
      )}
    </>
  );
}
function PlanContents({
  plan,
  state,
  reload,
  preview = false,
}: {
  plan: Plan;
  state?: ProgressState;
  reload?: () => Promise<void>;
  preview?: boolean;
}) {
  const [tab, setTab] = useState("training");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [habitChecks, setHabitChecks] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let active = true;
    void Promise.all([
      api<{ exercises: Exercise[] }>("exercises"),
      preview
        ? Promise.resolve({ favorites: [] as string[] })
        : api<{ favorites: string[] }>("library/favorites"),
    ])
      .then(([catalog, favs]) => {
        if (active) {
          setExercises(catalog.exercises);
          setFavorites(favs.favorites);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [preview]);
  async function saveWorkout(index: number) {
    setBusy(`workout-${index}`);
    setError("");
    setNotice("");
    try {
      const { workout } = await api<{ workout: Workout }>(
        "library/workouts",
        plan.training[index],
      );
      setNotice(`“${workout.name}” saved to Saved Workouts.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  async function favorite(id: string) {
    setBusy(id);
    setError("");
    const next = !favorites.includes(id);
    try {
      await api("library/favorites", { exerciseId: id, favorite: next }, "PUT");
      setFavorites((ids) =>
        next ? [...ids, id] : ids.filter((x) => x !== id),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  async function habit(id: string, done: boolean) {
    setHabitChecks((checks) => ({ ...checks, [id]: done }));
    setBusy(id);
    setError("");
    try {
      await api("progress/habits", { id, done });
      await reload?.();
    } catch (e) {
      setHabitChecks((checks) => {
        const next = { ...checks };
        delete next[id];
        return next;
      });
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <div className={preview ? "pc-preview" : ""}>
      <nav
        className="pc-tabs"
        aria-label={
          preview ? "Proposed Playbook sections" : "Playbook sections"
        }
      >
        {[
          { id: "training", label: "Training", Icon: Dumbbell },
          { id: "nutrition", label: "Nutrition", Icon: Utensils },
          { id: "habits", label: "Habits", Icon: Check },
          { id: "tips", label: "Tips", Icon: Sparkles },
        ].map(({ id, label, Icon }) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <Link href="/#saved" className="pc-text-link">
            Open Saved Workouts
          </Link>
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {!preview && (
        <div className="pc-edit-row">
          <p className="muted">
            Saved to your account. Changes are proposed for your approval.
          </p>
          <Link className="pc-text-link" href={`/coach?edit=${tab}`}>
            Request an edit <ArrowRight size={15} />
          </Link>
        </div>
      )}
      {tab === "training" && (
        <div className="pc-grid two">
          {plan.training.map((w, i) => (
            <section className="pc-panel" key={`${w.day}-${i}`}>
              <span className="pc-eyebrow">{w.day}</span>
              <h3>{w.name}</h3>
              <p className="muted">{w.description}</p>
              <div className="pc-exercises">
                {w.exercises.map((e, n) => (
                  <div key={`${e.exerciseId}-${n}`} className="pc-exercise">
                    <span className="pc-exercise-index">{n + 1}</span>
                    <div>
                      <Link
                        className="pc-text-link"
                        href={`/?exercise=${encodeURIComponent(e.exerciseId)}#exercises`}
                      >
                        {exercises.find((x) => x.id === e.exerciseId)?.name ||
                          e.exerciseId.replaceAll("_", " ")}
                      </Link>
                      <small>
                        {e.sets} sets ×{" "}
                        {e.mode === "duration"
                          ? `${e.duration}s`
                          : `${e.reps} reps`}{" "}
                        · {e.rest}s rest
                      </small>
                      {e.notes && <small className="muted">{e.notes}</small>}
                    </div>
                    {!preview && (
                      <button
                        className="btn icon"
                        aria-label={`Favorite ${exercises.find((x) => x.id === e.exerciseId)?.name || e.exerciseId}`}
                        aria-pressed={favorites.includes(e.exerciseId)}
                        disabled={!!busy}
                        onClick={() => void favorite(e.exerciseId)}
                      >
                        <Star
                          size={17}
                          fill={
                            favorites.includes(e.exerciseId)
                              ? "var(--accent)"
                              : "none"
                          }
                        />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!preview && (
                <button
                  className="btn secondary"
                  disabled={!!busy}
                  onClick={() => void saveWorkout(i)}
                >
                  {busy === `workout-${i}` ? "Saving…" : "Save to my workouts"}
                  <Plus size={16} />
                </button>
              )}
            </section>
          ))}
        </div>
      )}
      {tab === "nutrition" && (
        <>
          <section className="pc-panel">
            <h3>Daily targets</h3>
            <p className="muted">
              Estimates to guide your meals, not a rigid limit.
            </p>
            {plan.nutrition.calories != null && (
              <div className="pc-macros">
                {[
                  [plan.nutrition.calories, "kcal"],
                  [plan.nutrition.protein_g, "g protein"],
                  [plan.nutrition.carbs_g, "g carbs"],
                  [plan.nutrition.fat_g, "g fat"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <strong>{value}</strong>
                    <small>{label}</small>
                  </div>
                ))}
              </div>
            )}
            <p>{plan.nutrition.note}</p>
          </section>
          <div className="pc-grid two">
            <section className="pc-panel">
              <h3>A sample day of meals</h3>
              {plan.nutrition.meals.map((meal, i) => (
                <div className="pc-meal" key={i}>
                  <h4>{meal.name}</h4>
                  <ul>
                    {meal.ingredients.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
            <section className="pc-panel">
              <h3>Your grocery list</h3>
              <ul className="pc-groceries">
                {plan.nutrition.groceries.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
      {tab === "habits" && (
        <section className="pc-panel">
          <h3>A few things, done consistently.</h3>
          <p className="muted">
            Daily habits reset using your account timezone.
          </p>
          {plan.habits.map((h, i) => {
            const item = state?.playbook?.items.filter(
              (x) => x.type === "habit",
            )[i];
            return (
              <div className="pc-habit" key={i}>
                {item && !preview && (
                  <input
                    type="checkbox"
                    aria-label={h.title}
                    checked={habitChecks[item.id] ?? item.done}
                    disabled={!!busy}
                    onChange={(e) => void habit(item.id, e.target.checked)}
                  />
                )}
                <div>
                  <span className="pc-eyebrow">
                    {h.action === "drop" ? "LET GO OF" : "BUILD"}
                  </span>
                  <h4>{h.title}</h4>
                  <p className="muted">{h.note}</p>
                </div>
              </div>
            );
          })}
        </section>
      )}
      {tab === "tips" && (
        <div className="pc-grid two">
          {plan.tips.map((tip, i) => (
            <section className="pc-panel" key={i}>
              <Sparkles size={20} className="accent" />
              <h3>{tip.title}</h3>
              <p className="muted">{tip.note}</p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
function Empty({
  title,
  text,
  href,
  action,
}: {
  title: string;
  text: string;
  href: string;
  action: string;
}) {
  return (
    <section className="pc-panel pc-empty">
      <Sparkles size={40} className="accent" />
      <h2>{title}</h2>
      <p className="muted">{text}</p>
      <Link className="btn primary" href={href}>
        {action}
        <ArrowRight size={16} />
      </Link>
    </section>
  );
}
