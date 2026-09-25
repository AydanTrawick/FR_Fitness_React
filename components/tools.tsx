"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Camera,
  Download,
  Mail,
  Mic,
  Send,
  Sparkles,
  Square,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import Image from "next/image";
import { api, apiBlob, download, errorText } from "@/lib/client";
import { useStore } from "./store";
import { Card, Field, PageTitle } from "./ui";
import { importWorkout } from "@/lib/import-workout";
import exerciseCatalog from "@/lib/exercises.json";
import type { Exercise } from "@/lib/workouts";
import content from "@/lib/content.json";
import { toKg, today, type Entry } from "@/lib/tracking";
type Message = { role: "user" | "assistant"; content: string };
type WorkoutDraft = {
  exercise: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  unit: "lb" | "kg" | null;
  date: string | null;
  rpe: number | null;
  exerciseMatch?: {
    match: { id: string; name: string } | null;
    confidence: string;
    candidates: { id: string; name: string }[];
  };
};
export function AiTool({
  mode,
  onSignIn,
}: {
  mode: "plan" | "assistant";
  onSignIn: () => void;
}) {
  const { status, logs, save, ready } = useStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [emailed, setEmailed] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [workoutDraft, setWorkoutDraft] = useState<WorkoutDraft | null>(null);
  const [savingWorkout, setSavingWorkout] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  async function speak(text: string, index: number) {
    setError("");
    setSpeaking(index);
    try {
      const blob = await apiBlob("speech", { text });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = audio.onerror = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSpeaking(null);
    }
  }
  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setTranscribing(true);
        try {
          const form = new FormData();
          form.set(
            "audio",
            new Blob(chunks.current, { type: mr.mimeType || "audio/webm" }),
            "voice.webm",
          );
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: form,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          if (data.text)
            setPrompt((p) => (p ? `${p} ${data.text}` : data.text));
        } catch (e) {
          setError(errorText(e));
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      recorder.current = mr;
      setRecording(true);
    } catch {
      setError("Microphone access was denied or is unavailable.");
    }
  }
  async function emailPlan(text: string) {
    setError("");
    setEmailing(true);
    setEmailed(false);
    try {
      await api("email", {
        subject: "Your FirstRep plan draft",
        text: `${text}\n\nAI-generated draft. Review exercise suitability, food exclusions and nutrition estimates before use.`,
      });
      setEmailed(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setEmailing(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const text = prompt;
    try {
      const result = await api<{ text: string; workoutDraft?: WorkoutDraft }>("ai", {
        mode,
        prompt: text,
        history: messages.slice(-12),
        localDate: today(),
      });
      setMessages([
        ...messages,
        { role: "user", content: text },
        { role: "assistant", content: result.text },
      ]);
      setPrompt("");
      setWorkoutDraft(result.workoutDraft ?? null);
      setSelectedExercise(result.workoutDraft?.exerciseMatch?.match?.name ?? result.workoutDraft?.exercise ?? "");
      setSelectedExerciseId(result.workoutDraft?.exerciseMatch?.match?.id ?? "");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirmWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workoutDraft || !ready || savingWorkout) return;
    setSavingWorkout(true);
    setError("");
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    let matched: { id: string; name: string };
    try {
      const resolution = await api<{ match: { id: string; name: string } | null; candidates: { id: string; name: string }[] }>(
        `exercises/match?name=${encodeURIComponent(selectedExerciseId || selectedExercise)}`,
      );
      if (!resolution.match)
        throw new Error("Choose a recognized catalog exercise before logging.");
      matched = resolution.match;
    } catch (error) {
      setError(errorText(error));
      setSavingWorkout(false);
      return;
    }
    const row: Entry = {
      id: crypto.randomUUID(),
      date: String(fields.date),
      exercise: matched.name,
      exercise_id: matched.id,
      performed_at: String(fields.date) === today() ? new Date().toISOString() : `${fields.date}T12:00:00.000Z`,
      sets: Number(fields.sets),
      reps: Number(fields.reps),
      weight_kg: toKg(Number(fields.weight), String(fields.unit)),
      rpe: Number(fields.rpe),
      notes: "",
    };
    try {
      if (await save("workout", [...logs.workout, row])) {
        setWorkoutDraft(null);
        setMessages((current) => [
          ...current,
          { role: "assistant", content: `Logged ${row.sets} sets of ${row.exercise} for ${row.reps} reps at ${fields.weight} ${fields.unit} on ${row.date}.` },
        ]);
      } else {
        setError("The workout could not be saved. Check the tracker notice and try again.");
      }
    } finally {
      setSavingWorkout(false);
    }
  }
  const latest = [...messages].reverse().find((m) => m.role === "assistant");
  return (
    <>
      <PageTitle
        eyebrow={
          mode === "plan"
            ? "A PLAN THAT FITS YOUR LIFE"
            : "YOUR TRAINING COMPANION"
        }
        title={
          mode === "plan"
            ? "Let’s build your next chapter."
            : "Training assistant."
        }
        description={
          mode === "plan"
            ? "Describe your goals, schedule, and preferences to build a meal or workout draft."
            : "Ask questions about training, nutrition, and how to use your toolkit."
        }
      />
      <Card className="ai-panel">
        <div className="row between">
          <span className="pill">
            <Sparkles size={14} /> FIRSTREP AI
          </span>
          <div className="row">
            {latest && mode === "plan" && (
              <button
                className="btn secondary small"
                onClick={() => {
                  const key = `firstrep.workout-draft.v1.${status.user?.id ?? "guest"}`;
                  if (
                    sessionStorage.getItem(key) &&
                    !window.confirm(
                      "Replace your current workout draft with this AI plan?",
                    )
                  )
                    return;
                  try {
                    sessionStorage.setItem(
                      key,
                      JSON.stringify({
                        draft: importWorkout(
                          latest.content,
                          exerciseCatalog as Exercise[],
                        ),
                      }),
                    );
                    window.location.hash = "builder";
                  } catch {
                    setError(
                      "Could not open the workout draft. Browser session storage is unavailable.",
                    );
                  }
                }}
              >
                Review & save workout
              </button>
            )}
            {latest && mode === "plan" && (
              <button
                className="btn secondary small"
                onClick={() =>
                  download(
                    "firstrep-plan-draft.md",
                    latest.content +
                      "\n\nAI-generated draft. Review exercise suitability, food exclusions and nutrition estimates before use.",
                  )
                }
              >
                <Download size={14} /> Export draft
              </button>
            )}
            {latest && mode === "plan" && status.email && (
              <button
                className="btn secondary small"
                disabled={emailing}
                onClick={() => emailPlan(latest.content)}
              >
                <Mail size={14} />
                {emailing
                  ? "Sending…"
                  : emailed
                    ? "Sent to your email"
                    : "Email me this plan"}
              </button>
            )}
            {messages.length > 0 && (
              <button
                className="btn secondary small"
                disabled={busy}
                onClick={() => {
                  setMessages([]);
                  setError("");
                  setWorkoutDraft(null);
                }}
              >
                Start over
              </button>
            )}
          </div>
        </div>
        {!status.user ? (
          <div className="empty">
            <Sparkles size={34} />
            <h3>Your goals deserve a little direction.</h3>
            <p className="muted">Sign in to use FirstRep’s AI tools.</p>
            <button className="btn primary" onClick={onSignIn}>
              Sign in / create account
            </button>
          </div>
        ) : !status.ai ? (
          <div className="empty">
            <Sparkles size={34} />
            <h3>AI connection needed</h3>
            <p className="muted">
              Your trackers and program library are ready. AI tools will be
              available when the server’s Anthropic connection is configured.
            </p>
          </div>
        ) : (
          <>
            <div className="messages">
              {!messages.length && (
                <div className="ai-welcome">
                  <div className="icon-box">
                    <Sparkles size={24} />
                  </div>
                  <h3>
                    {mode === "plan"
                      ? "What are we working toward?"
                      : "What’s on your mind?"}
                  </h3>
                  <p className="muted">
                    {mode === "plan"
                      ? "Include your goal, experience, days available, equipment, dietary exclusions, and any limitations."
                      : "Ask a training question or get help choosing a routine."}
                  </p>
                  <div className="prompt-options">
                    {(mode === "plan"
                      ? [
                          "Build a 3-day beginner workout with dumbbells. Ask me what else you need.",
                          "Help me plan meals for the week. Ask about my preferences and food exclusions.",
                        ]
                      : [
                          "What does RPE mean when logging a workout?",
                          "How can I choose between full body and an upper/lower split?",
                        ]
                    ).map((text) => (
                      <button key={text} onClick={() => setPrompt(text)}>
                        {text} ↗
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((message, i) => (
                <div className={`message ${message.role}`} key={i}>
                  <div className="row between">
                    <span className="eyebrow">
                      {message.role === "user" ? "YOU" : "FIRSTREP"}
                    </span>
                    {message.role === "assistant" && status.voice && (
                      <button
                        className="btn icon"
                        aria-label="Listen to this reply"
                        disabled={speaking === i}
                        onClick={() => speak(message.content, i)}
                      >
                        <Volume2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="markdown">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {busy && <p className="muted">FirstRep is thinking…</p>}
              <div ref={bottom} />
            </div>
            {mode === "assistant" && workoutDraft && (
              <form key={JSON.stringify(workoutDraft)} className="stack" onSubmit={confirmWorkout} aria-label="Review workout log">
                <h3>Review workout log</h3>
                <p className="muted">Nothing is saved until you confirm. Fill in any missing details.</p>
                <div className="form-grid">
                  <Field label="Training date">
                    <input name="date" type="date" defaultValue={workoutDraft.date ?? today()} required />
                  </Field>
                  <Field label="Exercise">
                    <input name="exercise" value={selectedExercise} onChange={(event) => { setSelectedExercise(event.target.value); setSelectedExerciseId(""); }} maxLength={300} required />
                  </Field>
                  {!workoutDraft.exerciseMatch?.match && !!workoutDraft.exerciseMatch?.candidates.length && (
                    <Field label="Did you mean…?">
                      <select defaultValue="" onChange={(event) => {
                        const candidate = workoutDraft.exerciseMatch?.candidates.find((item) => item.id === event.target.value);
                        if (candidate) { setSelectedExercise(candidate.name); setSelectedExerciseId(candidate.id); }
                      }}>
                        <option value="" disabled>Choose an exercise</option>
                        {workoutDraft.exerciseMatch.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.id})</option>)}
                      </select>
                    </Field>
                  )}
                  <Field label="Sets">
                    <input name="sets" type="number" min="1" max="100" step="1" defaultValue={workoutDraft.sets ?? ""} required />
                  </Field>
                  <Field label="Reps per set">
                    <input name="reps" type="number" min="1" max="1000" step="1" defaultValue={workoutDraft.reps ?? ""} required />
                  </Field>
                  <Field label="Weight">
                    <input name="weight" type="number" min="0" max="2205" step="any" defaultValue={workoutDraft.weight ?? ""} required />
                  </Field>
                  <Field label="Weight unit">
                    <select name="unit" defaultValue={workoutDraft.unit ?? ""} required>
                      <option value="" disabled>Choose unit</option>
                      <option value="lb">lb</option>
                      <option value="kg">kg</option>
                    </select>
                  </Field>
                  <Field label="RPE (effort, 1–10)">
                    <input name="rpe" type="number" min="1" max="10" step="0.5" defaultValue={workoutDraft.rpe ?? 7} required />
                  </Field>
                </div>
                {workoutDraft.rpe === null && <p className="muted">RPE defaults to 7 because the workout tracker requires it. Adjust it before confirming if needed.</p>}
                <div className="row">
                  <button className="btn primary" disabled={savingWorkout || !ready}>{savingWorkout ? "Saving…" : "Confirm and log workout"}</button>
                  <button type="button" className="btn secondary" disabled={savingWorkout} onClick={() => setWorkoutDraft(null)}>Cancel</button>
                </div>
              </form>
            )}
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <form onSubmit={submit} className="chat-composer">
              <textarea
                aria-label="Your request"
                placeholder={
                  mode === "plan"
                    ? "Tell me about your goals…"
                    : "Ask your training question…"
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                minLength={2}
                maxLength={10000}
                required
                rows={3}
              />
              {status.voice && (
                <button
                  type="button"
                  className={`btn ${recording ? "primary" : "secondary"}`}
                  disabled={transcribing}
                  onClick={toggleRecording}
                  aria-label={
                    recording ? "Stop recording" : "Record a voice message"
                  }
                >
                  {recording ? <Square size={16} /> : <Mic size={16} />}
                  {transcribing
                    ? "Transcribing…"
                    : recording
                      ? "Stop"
                      : "Speak"}
                </button>
              )}
              <button className="btn primary" disabled={busy || savingWorkout}>
                <Send size={16} />
                {busy ? "Working…" : "Send"}
              </button>
            </form>
            <p className="footnote">
              Submitted text is sent to Anthropic. AI replies are drafts; review
              food exclusions and exercise suitability. Workout entries are saved
              only after you review and confirm them. Conversations last while this screen is open.
              {status.voice &&
                " Voice recordings and replies are sent to ElevenLabs."}
            </p>
          </>
        )}
      </Card>
    </>
  );
}
type Prediction = {
  equipment: string;
  confidence: number;
  top_k?: { equipment: string; confidence: number }[];
};
export function Equipment() {
  const { status } = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verdict, setVerdict] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function classify(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    setPrediction(null);
    setVerdict("");
    setSaved(false);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/equipment", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPrediction(data);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="GET TO KNOW YOUR GYM"
        title="Meet your equipment."
        description="Upload a gym equipment photo and let your original FirstRep model identify it."
      />
      <div className="two-col">
        <Card>
          <h3>What are we looking at?</h3>
          {!status.equipment && (
            <p className="notice">
              Equipment recognition needs the original model service to be
              connected. You can still explore the equipment library below.
            </p>
          )}
          <form onSubmit={classify} className="stack">
            <label className="upload-area">
              {preview ? (
                <Image
                  unoptimized
                  src={preview}
                  width={600}
                  height={400}
                  alt="Selected equipment for classification"
                />
              ) : (
                <>
                  <Camera size={38} />
                  <strong>Choose an equipment photo</strong>
                  <span className="muted">JPG, PNG, or WebP · up to 10 MB</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  setPrediction(null);
                  setVerdict("");
                  setError("");
                  if (selected && selected.size > 10000000) {
                    setError("Choose an image under 10 MB.");
                    return;
                  }
                  setFile(selected ?? null);
                  setPreview(selected ? URL.createObjectURL(selected) : "");
                }}
                required
              />
            </label>
            <button
              className="btn primary"
              disabled={!file || busy || !status.equipment}
            >
              <Upload size={16} />
              {busy ? "Identifying…" : "Identify equipment"}
            </button>
          </form>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </Card>
        <Card>
          <p className="eyebrow">MODEL PREDICTION</p>
          {prediction ? (
            <>
              <h2>{prediction.equipment}</h2>
              <p className="accent">
                {Math.round(prediction.confidence * 100)}% confidence
              </p>
              {prediction.top_k?.map((p) => (
                <div className="summary-line" key={p.equipment}>
                  <span>{p.equipment}</span>
                  <strong>{Math.round(p.confidence * 100)}%</strong>
                </div>
              ))}
              <h4>Is this correct?</h4>
              <div className="row wrap">
                {["Correct", "Incorrect", "Not sure"].map((v) => (
                  <button
                    className={`btn ${verdict === v ? "primary" : "secondary"} small`}
                    key={v}
                    onClick={() => {
                      setVerdict(v);
                      setLabel(v === "Correct" ? prediction.equipment : "");
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {verdict === "Incorrect" && (
                <Field label="Correct equipment label">
                  <input
                    list="equipment-labels"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Choose or type a label"
                  />
                  <datalist id="equipment-labels">
                    {content.equipment.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </Field>
              )}
              {verdict && (
                <>
                  <div className="row wrap">
                    <button
                      className="btn secondary"
                      disabled={verdict === "Incorrect" && !label.trim()}
                      onClick={() =>
                        download(
                          "firstrep-equipment-feedback.json",
                          JSON.stringify(
                            {
                              recorded_at: new Date().toISOString(),
                              filename: file?.name,
                              prediction,
                              verdict,
                              final_label: label || null,
                            },
                            null,
                            2,
                          ),
                          "application/json",
                        )
                      }
                    >
                      <Download size={15} /> Download feedback
                    </button>
                    {status.feedbackStorage && (
                      <button
                        className="btn primary"
                        disabled={
                          saving || (verdict === "Incorrect" && !label.trim())
                        }
                        onClick={async () => {
                          setSaving(true);
                          setError("");
                          try {
                            await api("feedback", {
                              recorded_at: new Date().toISOString(),
                              filename: file?.name ?? null,
                              prediction,
                              verdict,
                              final_label: label || null,
                            });
                            setSaved(true);
                          } catch (e) {
                            setError(errorText(e));
                          } finally {
                            setSaving(false);
                          }
                        }}
                      >
                        <Upload size={15} />
                        {saving
                          ? "Saving…"
                          : saved
                            ? "Saved to training set"
                            : "Save to training set"}
                      </button>
                    )}
                  </div>
                  <p className="footnote">
                    {status.feedbackStorage
                      ? "Saved feedback is uploaded to the FirstRep training dataset. Download keeps a local copy only."
                      : "Feedback is exported locally. It is not uploaded to the training dataset."}
                  </p>
                </>
              )}
            </>
          ) : (
            <div className="empty">
              <Camera size={32} />
              <h3>A little less guesswork.</h3>
              <p className="muted">
                Your prediction and confidence scores will appear here.
              </p>
            </div>
          )}
        </Card>
      </div>
      <Card>
        <h3>The equipment library</h3>
        <p className="muted">
          The original model recognizes these {content.equipment.length}{" "}
          equipment classes.
        </p>
        <div className="equipment-grid">
          {content.equipment.map((name, i) => (
            <span key={name}>
              <small>{String(i + 1).padStart(2, "0")}</small>
              {name}
            </span>
          ))}
        </div>
      </Card>
    </>
  );
}
export function AccountDialog({ close }: { close: () => void }) {
  const { status, refresh, guest, importGuest, busy } = useStore();
  const [register, setRegister] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      await api("auth", {
        ...Object.fromEntries(new FormData(event.currentTarget)),
        action: register ? "register" : "login",
      });
      await refresh();
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setWorking(false);
    }
  }
  return (
    <dialog ref={dialog} className="account-dialog" onCancel={close}>
      <div className="row between">
        <h3>
          {status.user
            ? "Your account"
            : register
              ? "Make it yours."
              : "Welcome to FirstRep."}
        </h3>
        <button
          className="btn icon"
          aria-label="Close account dialog"
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      {status.user ? (
        <div className="stack">
          <p>{status.user.display_name}</p>
          <p className="muted">{status.user.email}</p>
          {Object.values(guest).some((rows) => rows.length > 0) && (
            <>
              <p className="notice">
                You have guest entries available from this browser session.
              </p>
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => void importGuest()}
              >
                Add guest entries to my account
              </button>
            </>
          )}
          <button
            className="btn secondary"
            disabled={working}
            onClick={async () => {
              setWorking(true);
              try {
                await api("auth", { action: "logout" });
                await refresh();
                close();
              } catch (e) {
                setError(errorText(e));
              } finally {
                setWorking(false);
              }
            }}
          >
            Sign out
          </button>
        </div>
      ) : (
        <>
          {!status.accounts && (
            <p className="notice">
              Accounts are not connected yet. Guest trackers are available now;
              connect Neon to enable sign-in and saved account logs.
            </p>
          )}
          <form onSubmit={submit} className="stack">
            {register && (
              <Field label="Your name">
                <input
                  name="display_name"
                  autoComplete="name"
                  required
                  maxLength={100}
                />
              </Field>
            )}
            <Field label="Email">
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                maxLength={250}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                name="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={8}
                maxLength={256}
              />
            </Field>
            <button
              className="btn primary"
              disabled={working || !status.accounts}
            >
              {working
                ? "Please wait…"
                : register
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>
          <button className="text-link" onClick={() => setRegister(!register)}>
            {register
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
        </>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
