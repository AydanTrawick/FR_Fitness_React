"use client";
import { useState, useRef, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { api, errorText } from "@/lib/client";
import type {
  PendingAction,
  WorkoutPayload,
  FoodPayload,
} from "@/lib/assistant/schema";
import { Field } from "./ui";
export function AssistantConfirmCard({
  action,
  conversationId,
  onSaved,
  onEdited,
  onResolved,
}: {
  action: PendingAction;
  conversationId: string;
  onSaved: () => Promise<void>;
  onEdited?: (id: string, payload: PendingAction["payload"]) => void;
  onResolved?: (id: string, status: string) => void;
}) {
  const [editing, setEditing] = useState(false),
    [status, setStatus] = useState(action.status),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sending = useRef(false);
  const workout = action.kind === "workout_set";
  const w = action.payload as WorkoutPayload,
    f = action.payload as FoodPayload;
  const [payload, setPayload] = useState(action.payload);
  useEffect(() => {
    onEdited?.(action.id, payload);
  }, [action.id, payload, onEdited]);
  const weight = payload as WorkoutPayload,
    food = payload as FoodPayload;
  const field = (key: string, value: unknown) =>
    setPayload((p) => ({ ...p, [key]: value }));
  const setField = (index: number, key: string, value: unknown) =>
    field(
      "sets",
      weight.sets.map((set, i) =>
        i === index ? { ...set, [key]: value } : set,
      ),
    );
  async function send(operation: "confirm" | "cancel") {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ status: string }>(
        `assistant/actions/${action.id}/${operation}`,
        { conversationId, ...(operation === "confirm" ? { payload } : {}) },
      );
      setStatus(result.status);
      onResolved?.(action.id, result.status);
      if (result.status === "confirmed") await onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  if (status === "confirmed")
    return (
      <section className="notice" role="status">
        Saved to {workout ? "workout" : "food"} log.{" "}
        <Link href={workout ? "/#workout" : "/#food"}>View log</Link>
      </section>
    );
  if (status !== "pending")
    return (
      <section className="notice" role="status">
        Draft {status}. Nothing added.
      </section>
    );
  const summary = workout
    ? `${w.exercise_name} · ${w.sets.length} ${w.sets.length === 1 ? "set" : "sets"} · ${w.date}`
    : `${f.food_name} · ${f.log_date}`;
  return (
    <form
      className="card stack"
      aria-label={workout ? "Review workout log" : "Review food log"}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void send("confirm");
      }}
    >
      <h3>{summary}</h3>
      <p className="muted">
        Nothing is saved until you confirm. This draft expires after 30 minutes.
      </p>
      {f.values_source === "assistant_estimate" && !workout && (
        <span className="pill">Estimated</span>
      )}
      {!editing ? (
        <div className="stack">
          {workout ? (
            weight.sets.map((set, i) => (
              <p key={i}>
                Set {i + 1}: {set.reps} reps ·{" "}
                {set.unit === "bodyweight"
                  ? "Bodyweight"
                  : `${set.weight} ${set.unit}`}
                {set.rpe != null ? ` · RPE ${set.rpe}` : ""}
              </p>
            ))
          ) : (
            <div className="row wrap">
              {(["protein_g", "carbs_g", "fat_g", "calories"] as const).map(
                (key) => (
                  <span key={key} className="chip">
                    {key.replace("_g", "")}:{" "}
                    {food[key] == null
                      ? "Not provided"
                      : `${food[key]}${key === "calories" ? " kcal" : " g"}`}
                  </span>
                ),
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="stack">
          {workout ? (
            <>
              <Field label="Exercise">
                <input
                  value={weight.exercise_name}
                  maxLength={300}
                  required
                  onChange={(e) => {
                    field("exercise_name", e.target.value);
                    field("exercise_id", null);
                    field("custom", true);
                  }}
                />
              </Field>
              {weight.custom && (
                <p className="muted">
                  This will be saved as a custom exercise name.
                </p>
              )}
              <Field label="Performed at">
                <input
                  type="datetime-local"
                  required
                  value={weight.performed_at?.slice(0, 16)}
                  onChange={(e) => {
                    if (e.target.value)
                      field("performed_at", `${e.target.value}:00Z`);
                  }}
                />
                <small className="muted">
                  UTC time; the saved date uses your profile timezone.
                </small>
              </Field>
              {weight.sets.map((set, i) => (
                <fieldset key={i} className="form-grid">
                  <legend>Set {i + 1}</legend>
                  <Field label={`Reps, set ${i + 1}`}>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      required
                      value={set.reps}
                      onChange={(e) =>
                        setField(i, "reps", Number(e.target.value))
                      }
                    />
                  </Field>
                  <Field label={`Weight, set ${i + 1}`}>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      required={set.unit !== "bodyweight"}
                      value={set.weight ?? ""}
                      onChange={(e) =>
                        setField(
                          i,
                          "weight",
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                    />
                  </Field>
                  <Field label={`Unit, set ${i + 1}`}>
                    <select
                      value={set.unit}
                      onChange={(e) => setField(i, "unit", e.target.value)}
                    >
                      <option value="lb">lb</option>
                      <option value="kg">kg</option>
                      <option value="bodyweight">Bodyweight</option>
                    </select>
                  </Field>
                  <Field label={`RPE, set ${i + 1} (optional)`}>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      step={0.5}
                      value={set.rpe ?? ""}
                      onChange={(e) =>
                        setField(
                          i,
                          "rpe",
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                    />
                  </Field>
                </fieldset>
              ))}
              <Field label="Notes">
                <input
                  maxLength={2000}
                  value={weight.notes}
                  onChange={(e) => field("notes", e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Food">
                <input
                  required
                  maxLength={300}
                  value={food.food_name}
                  onChange={(e) => field("food_name", e.target.value)}
                />
              </Field>
              <Field label="Food date">
                <input
                  type="date"
                  required
                  value={food.log_date}
                  onChange={(e) => field("log_date", e.target.value)}
                />
              </Field>
              <Field label="Meal">
                <select
                  value={food.meal}
                  onChange={(e) => field("meal", e.target.value)}
                >
                  {["unspecified", "breakfast", "lunch", "dinner", "snack"].map(
                    (m) => (
                      <option key={m}>{m}</option>
                    ),
                  )}
                </select>
              </Field>
              <div className="form-grid">
                {(["protein_g", "carbs_g", "fat_g", "calories"] as const).map(
                  (key) => (
                    <Field
                      key={key}
                      label={
                        key === "calories"
                          ? "Calories (optional)"
                          : `${key.replace("_g", "")} in g (optional)`
                      }
                    >
                      <input
                        type="number"
                        min={0}
                        max={key === "calories" ? 10000 : 500}
                        step="any"
                        placeholder="Not provided"
                        value={food[key] ?? ""}
                        onChange={(e) =>
                          field(
                            key,
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                      />
                    </Field>
                  ),
                )}
              </div>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <div className="row wrap">
        <button className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Confirm and save"}
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={() => setEditing(!editing)}
        >
          {editing ? "Review" : "Edit"}
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={() => void send("cancel")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
