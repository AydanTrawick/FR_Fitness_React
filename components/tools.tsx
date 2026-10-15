"use client";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
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
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import Image from "next/image";
import Link from "next/link";
import { api, apiBlob, download, errorText } from "@/lib/client";
import { useStore } from "./store";
import { Card, Field, PageTitle } from "./ui";
import { importWorkout } from "@/lib/import-workout";
import exerciseCatalog from "@/lib/exercises.json";
import type { Exercise } from "@/lib/workouts";
import content from "@/lib/content.json";
import { today } from "@/lib/tracking";
import type { PendingAction } from "@/lib/assistant/schema";
import { useAssistantVoice } from "./use-assistant-voice";
import { AssistantTalkButton } from "./assistant-talk-button";
import { AssistantConfirmCard } from "./assistant-confirm-card";
type Message = { role: "user" | "assistant"; content: string };
export function AiTool({
  mode,
  onSignIn,
}: {
  mode: "plan" | "assistant";
  onSignIn: () => void;
}) {
  const { status, reload } = useStore();
  const [includeTrainingHistory, setIncludeTrainingHistory] = useState(false);
  const [historyAllowed, setHistoryAllowed] = useState(false);
  useEffect(() => {
    let active = true;
    const sync = () =>
      fetch("/api/account")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (active)
            setHistoryAllowed(data?.preferences?.aiDataOptIn === true);
        })
        .catch(() => {});
    void sync();
    window.addEventListener("firstrep:consent-updated", sync);
    return () => {
      active = false;
      window.removeEventListener("firstrep:consent-updated", sync);
    };
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [emailed, setEmailed] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [choices, setChoices] = useState<{ id: string; name: string }[]>([]);
  const [conversationId, setConversationId] = useState(() =>
    crypto.randomUUID(),
  );
  const requestTurn = useRef<{
    prompt: string;
    id: string;
    source: "text" | "voice";
    activeActionId?: string;
    confirmationPayload?: unknown;
    shown?: boolean;
  } | null>(null);
  const sendingTurn = useRef(false);
  const voice = useAssistantVoice({
    canSpeak: status.voiceOutput ?? status.voice,
    onTranscript: (text) => sendMessage(text, "voice"),
  });
  const editAction = useCallback(
    (id: string, payload: PendingAction["payload"]) =>
      setActions((current) =>
        current.some((a) => a.id === id && a.payload !== payload)
          ? current.map((a) => (a.id === id ? { ...a, payload } : a))
          : current,
      ),
    [],
  );
  const resolveAction = useCallback(
    (id: string, status: string) =>
      setActions((current) =>
        current.map((a) => (a.id === id ? { ...a, status } : a)),
      ),
    [],
  );
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  async function speak(text: string, index: number) {
    if (mode === "assistant") {
      voice.unlockAudio();
      await voice.playReply(text);
      return;
    }
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
  async function sendMessage(
    text: string,
    source: "text" | "voice" = "text",
  ): Promise<string | undefined> {
    if (sendingTurn.current) return;
    sendingTurn.current = true;
    setBusy(true);
    setError("");
    if (source === "text") voice.stopPlayback();
    try {
      if (
        !requestTurn.current ||
        requestTurn.current.prompt !== text ||
        requestTurn.current.source !== source
      ) {
        const active = actions.filter((a) => a.status === "pending").at(-1);
        requestTurn.current = {
          prompt: text,
          id: crypto.randomUUID(),
          source,
          activeActionId: active?.id,
          confirmationPayload: active?.payload,
        };
      }
      if (!requestTurn.current.shown) {
        setMessages((current) => [...current, { role: "user", content: text }]);
        requestTurn.current.shown = true;
      }
      let reply: string;
      if (mode === "assistant") {
        const result = await api<{
          replyText: string;
          pendingActions: PendingAction[];
          exerciseChoices?: { id: string; name: string }[];
          actionResult?: { id: string; status: string };
        }>("assistant/chat", {
          prompt: text,
          mode: source,
          conversationId,
          requestId: requestTurn.current.id,
          history: messages.slice(-12),
          includeTrainingHistory: historyAllowed && includeTrainingHistory,
          ...(source === "voice"
            ? {
                activeActionId: requestTurn.current.activeActionId,
                confirmationPayload: requestTurn.current.confirmationPayload,
              }
            : {}),
        });
        reply = result.replyText;
        setActions(result.pendingActions);
        setChoices(result.exerciseChoices ?? []);
        if (result.actionResult?.status === "confirmed") void reload();
      } else {
        const result = await api<{ text: string }>("ai", {
          mode,
          prompt: text,
          history: messages.slice(-12),
          includeTrainingHistory: historyAllowed && includeTrainingHistory,
          localDate: today(),
        });
        reply = result.text;
      }
      setMessages((current) => [
        ...current,
        { role: "assistant", content: reply },
      ]);
      requestTurn.current = null;
      setPrompt("");
      return reply;
    } catch (e) {
      setError(errorText(e));
      if (source === "voice") throw e;
    } finally {
      sendingTurn.current = false;
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await sendMessage(prompt);
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
                  voice.stopPlayback();
                  setMessages([]);
                  setError("");
                  actions.forEach((action) => {
                    void api(`assistant/actions/${action.id}/cancel`, {
                      conversationId,
                    }).catch(() => {});
                  });
                  setActions([]);
                  setChoices([]);
                  setConversationId(crypto.randomUUID());
                  requestTurn.current = null;
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
                    {message.role === "assistant" &&
                      status.voice &&
                      (mode === "plan" || voice.canSpeak) && (
                        <button
                          className="btn icon"
                          aria-label="Listen to this reply"
                          disabled={
                            mode === "assistant" ? voice.muted : speaking === i
                          }
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
            {mode === "assistant" &&
              actions.filter((action) => action.status === "pending").length >
                1 && (
                <p className="notice">
                  More than one draft is open. Saying yes confirms only the most
                  recent card. Use a card’s Confirm button to save another.
                </p>
              )}
            {mode === "assistant" &&
              actions.map((action) => (
                <AssistantConfirmCard
                  key={`${action.id}:${action.status}`}
                  action={action}
                  conversationId={conversationId}
                  onSaved={reload}
                  onEdited={editAction}
                  onResolved={resolveAction}
                />
              ))}
            {mode === "assistant" && choices.length > 0 && (
              <div className="row wrap" aria-label="Exercise choices">
                {choices.map((choice) => (
                  <button
                    type="button"
                    className="btn secondary"
                    key={choice.id}
                    onClick={() =>
                      setPrompt(
                        `Use ${choice.name} (${choice.id}) for that workout request.`,
                      )
                    }
                  >
                    {choice.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    setPrompt(
                      "Use the custom exercise name I originally stated for that workout request.",
                    )
                  }
                >
                  Use custom name
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <div className="account-hint" style={{ padding: "12px 18px" }}>
              {historyAllowed ? (
                <label className="row">
                  <input
                    type="checkbox"
                    checked={includeTrainingHistory}
                    onChange={(e) =>
                      setIncludeTrainingHistory(e.target.checked)
                    }
                  />{" "}
                  Include my recent workouts and meals in this request
                </label>
              ) : (
                <span>
                  Saved training history is excluded. Enable it in{" "}
                  <Link href="/settings/privacy">Privacy settings</Link> to
                  choose when to include it.
                </span>
              )}
            </div>
            {mode === "assistant" && (
              <div
                id="assistant-voice-status"
                role="status"
                aria-live="polite"
                className="muted"
                style={{ padding: "8px 0" }}
              >
                {voice.state === "idle"
                  ? status.voiceInput || status.voice
                    ? "Hold Space away from the text box to talk, or use the microphone button."
                    : "Voice is not configured yet. Text chat is available."
                  : voice.state === "listening"
                    ? "Listening. Your microphone stops when you send."
                    : voice.state === "permission"
                      ? "Allow microphone access in your browser."
                      : voice.state === "speaking"
                        ? "Speaking. Start talking to interrupt."
                        : voice.state === "transcribing"
                          ? "Transcribing your recording…"
                          : voice.state === "thinking"
                            ? "FirstRep is thinking…"
                            : "Voice needs attention. You can still type below."}
              </div>
            )}
            {mode === "assistant" && voice.error && (
              <p role="alert" className="notice error">
                {voice.error}
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
              {mode === "assistant" && (status.voiceInput || status.voice) && (
                <AssistantTalkButton voice={voice} disabled={busy} />
              )}
              {mode === "plan" && status.voice && (
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
              <button
                className="btn primary"
                disabled={
                  busy ||
                  (mode === "assistant" &&
                    [
                      "permission",
                      "listening",
                      "transcribing",
                      "thinking",
                    ].includes(voice.state))
                }
              >
                <Send size={16} />
                {busy ? "Working…" : "Send"}
              </button>
            </form>
            <p className="footnote">
              Submitted text is sent to Anthropic. AI replies are drafts; review
              food exclusions and exercise suitability. Workout and food entries
              are saved only after you review and confirm them. Conversations
              last while this screen is open.{" "}
              {mode === "assistant" &&
                "Voice audio is sent to ElevenLabs for transcription and speech. FirstRep processes audio in memory and does not save recordings. Educational tools. Not medical advice."}
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
