"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImageDown,
  Trophy,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Field } from "./ui";
import { errorText } from "@/lib/client";
import { today, type Entry } from "@/lib/tracking";
import {
  validPR,
  workoutCardData,
  type CardUnit,
  type PRCardData,
} from "@/lib/share-cards";
import {
  canvasPNG,
  downloadCardBlob,
  loadCardFonts,
  renderPRCard,
  renderWorkoutCard,
} from "@/lib/share-card-renderer";

export function WorkoutCardButton({
  rows,
  initialDate,
  initialUnit,
}: {
  rows: Entry[];
  initialDate: string;
  initialUnit: CardUnit;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="btn secondary small"
        disabled={!rows.length}
        onClick={() => setOpen(true)}
      >
        <ImageDown size={15} /> Workout card
      </button>
      {open && (
        <ShareCardEditor
          kind="workout"
          rows={rows}
          initialDate={initialDate}
          initialUnit={initialUnit}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
export function NewPRButton({
  initialDate,
  initialUnit,
}: {
  initialDate: string;
  initialUnit: CardUnit;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn secondary small"
        onClick={() => setOpen(true)}
      >
        <Trophy size={15} /> New PR
      </button>
      {open && (
        <ShareCardEditor
          kind="pr"
          rows={[]}
          initialDate={initialDate}
          initialUnit={initialUnit}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ShareCardEditor({
  kind,
  rows,
  initialDate,
  initialUnit,
  onClose,
}: {
  kind: "workout" | "pr";
  rows: Entry[];
  initialDate: string;
  initialUnit: CardUnit;
  onClose: () => void;
}) {
  const dates = useMemo(
    () => [...new Set(rows.map((row) => String(row.date)))].sort().reverse(),
    [rows],
  );
  const [date, setDate] = useState(
    kind === "pr" || dates.includes(initialDate)
      ? initialDate
      : dates[0] || today(),
  );
  const [title, setTitle] = useState("Workout log");
  const [unit, setUnit] = useState<CardUnit>(initialUnit);
  const [exercise, setExercise] = useState("Bench press");
  const [reps, setReps] = useState("1");
  const [weight, setWeight] = useState("");
  const [previous, setPrevious] = useState("");
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const workout = useMemo(() => workoutCardData(rows, date), [rows, date]);
  const pr: PRCardData = useMemo(
    () => ({
      date,
      exercise: exercise.trim(),
      reps: Number(reps),
      weight: Number(weight),
      unit,
      ...(previous.trim() ? { previous: Number(previous) } : {}),
    }),
    [date, exercise, reps, weight, unit, previous],
  );
  const valid =
    kind === "pr"
      ? validPR(pr)
      : workout.exercises.length > 0 && title.trim().length > 0;
  // A demo is visible before PR fields are filled; it cannot be downloaded.
  const previewPR = useMemo(
    () =>
      validPR(pr)
        ? pr
        : {
            ...pr,
            exercise: pr.exercise || "Your exercise",
            reps: Number(reps) > 0 ? Number(reps) : 1,
            weight: Number(weight) > 0 ? Number(weight) : 205,
            previous: undefined,
          },
    [pr, reps, weight],
  );
  useEffect(() => {
    let cancelled = false;
    void loadCardFonts()
      .then(() => {
        if (cancelled || !canvas.current) return;
        if (kind === "pr") renderPRCard(canvas.current, previewPR);
        else {
          const total = renderWorkoutCard(
            canvas.current,
            workout,
            title.trim() || "Workout log",
            unit,
            page,
          );
          setPages(total);
        }
        setReady(true);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setReady(false);
          setError("The card preview could not load. " + errorText(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind, previewPR, workout, title, unit, page]);

  async function exportCard() {
    if (!valid || busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      await loadCardFonts();
      const output = document.createElement("canvas");
      if (kind === "pr") {
        renderPRCard(output, pr);
        const slug =
          pr.exercise
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 60) || "exercise";
        downloadCardBlob(
          await canvasPNG(output),
          "firstrep-pr-" + slug + "-" + date + ".png",
        );
      } else {
        const total = renderWorkoutCard(output, workout, title.trim(), unit);
        if (total === 1)
          downloadCardBlob(
            await canvasPNG(output),
            "firstrep-workout-" + date + ".png",
          );
        else {
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();
          for (let i = 0; i < total; i++) {
            renderWorkoutCard(output, workout, title.trim(), unit, i);
            zip.file(
              "firstrep-workout-" + date + "-" + (i + 1) + ".png",
              await (await canvasPNG(output)).arrayBuffer(),
            );
          }
          downloadCardBlob(
            await zip.generateAsync({ type: "blob" }),
            "firstrep-workout-" + date + ".zip",
          );
        }
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent
        className="share-card-dialog"
        overlayClassName="share-card-overlay"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <div className="section-top">
          <div>
            <DialogTitle>
              {kind === "pr" ? "New personal record" : "Your workout card"}
            </DialogTitle>
            <DialogDescription>
              {kind === "pr"
                ? "Make a card for your latest lift. Creating a card does not add a workout entry."
                : "Turn your logged session into a card you can post anywhere."}
            </DialogDescription>
          </div>
          <button
            type="button"
            className="btn icon"
            aria-label="Close card editor"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="share-card-editor">
          <form
            className="stack share-card-controls"
            onSubmit={(event) => {
              event.preventDefault();
              void exportCard();
            }}
          >
            <Field label="Card date">
              {kind === "workout" ? (
                <select
                  value={date}
                  disabled={busy}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setPage(0);
                  }}
                >
                  {dates.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="date"
                  required
                  value={date}
                  disabled={busy}
                  onChange={(event) => setDate(event.target.value)}
                />
              )}
            </Field>
            {kind === "workout" ? (
              <Field label="Workout title">
                <input
                  required
                  maxLength={60}
                  value={title}
                  disabled={busy}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setPage(0);
                  }}
                  placeholder="e.g. Push day"
                />
              </Field>
            ) : (
              <>
                <div
                  className="row wrap pr-presets"
                  aria-label="PR exercise shortcuts"
                >
                  {["Bench press", "Squat", "Deadlift"].map((name) => (
                    <button
                      type="button"
                      className={
                        "btn small " +
                        (exercise === name ? "primary" : "secondary")
                      }
                      key={name}
                      disabled={busy}
                      onClick={() => setExercise(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <Field label="PR exercise">
                  <input
                    required
                    maxLength={100}
                    value={exercise}
                    disabled={busy}
                    onChange={(event) => setExercise(event.target.value)}
                    placeholder="e.g. Bench press"
                  />
                </Field>
                <div className="form-grid">
                  <Field label="PR reps">
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      step={1}
                      required
                      disabled={busy}
                      value={reps}
                      onChange={(event) => setReps(event.target.value)}
                    />
                  </Field>
                  <Field label="PR weight">
                    <input
                      type="number"
                      min={0.1}
                      max={unit === "lb" ? 2204.62 : 1000}
                      step="any"
                      required
                      disabled={busy}
                      value={weight}
                      onChange={(event) => setWeight(event.target.value)}
                      placeholder="405"
                    />
                  </Field>
                </div>
              </>
            )}
            <Field label="Card weight unit">
              <select
                value={unit}
                disabled={busy}
                onChange={(event) => setUnit(event.target.value as CardUnit)}
              >
                <option value="kg">Kilograms (kg)</option>
                <option value="lb">Pounds (lb)</option>
              </select>
            </Field>
            {kind === "pr" && (
              <Field label="Previous PR at the same reps (optional)">
                <input
                  type="number"
                  min={0}
                  max={Number(weight) || 1000}
                  step="any"
                  value={previous}
                  disabled={busy}
                  onChange={(event) => setPrevious(event.target.value)}
                  placeholder="e.g. 395"
                />
              </Field>
            )}
            {kind === "pr" &&
              previous.trim() &&
              Number(previous) >= Number(weight) && (
                <p className="error-text" role="alert">
                  The previous record must be lower than the new weight.
                </p>
              )}
            {kind === "workout" && !workout.exercises.length && (
              <p role="status">No exercises were logged on this date.</p>
            )}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary" disabled={!valid || !ready || busy}>
              <Download size={17} />{" "}
              {busy
                ? "Preparing your download…"
                : kind === "workout" && pages > 1
                  ? "Download " + pages + " PNG cards"
                  : "Download PNG card"}
            </button>
            <p className="muted share-card-note">
              1080 × 2160 PNG · Generated on your device.{" "}
              {kind === "workout"
                ? "Every recorded set is included. Longer workouts download as a ZIP of numbered cards."
                : "Use a weight and rep count you completed. No saved history is changed."}
            </p>
          </form>
          <div className="share-card-preview">
            <canvas
              ref={canvas}
              role="img"
              aria-label={
                kind === "pr"
                  ? "Personal record card preview"
                  : "Workout card preview"
              }
            />
            {!ready && !error && <p role="status">Preparing card preview…</p>}
            {kind === "pr" && !valid && (
              <p className="muted">
                Example preview · Enter your lift to download.
              </p>
            )}
            {kind === "workout" && pages > 1 && (
              <div className="row share-card-pages">
                <button
                  type="button"
                  className="btn icon"
                  aria-label="Previous card"
                  disabled={!page || busy}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  Card {page + 1} of {pages}
                </span>
                <button
                  type="button"
                  className="btn icon"
                  aria-label="Next card"
                  disabled={page >= pages - 1 || busy}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
