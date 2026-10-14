"use client";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { exerciseEncouragement } from "@/lib/workout-session";

export function ManualWeightInput({
  label,
  value,
  max,
  prefix = false,
  disabled = false,
  onChange,
  onInvalidChange,
}: {
  label: string;
  value: number;
  max: number;
  prefix?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
  onInvalidChange: (invalid: boolean) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const valid = (text: string) =>
    text.trim() !== "" &&
    Number.isFinite(Number(text)) &&
    Number(text) >= 0 &&
    Number(text) <= max;
  const invalid = draft !== null && !valid(draft);
  return (
    <div className="workout-weight-field">
      {prefix && <span aria-hidden="true">+</span>}
      <input
        className="workout-weight-input"
        type="number"
        inputMode="decimal"
        step="any"
        min={0}
        max={max}
        required
        aria-label={label}
        aria-invalid={invalid}
        title="Type your weight, or use the plus and minus buttons"
        disabled={disabled}
        value={draft ?? String(Math.min(max, Math.round(value * 1e6) / 1e6))}
        onFocus={(e) => setDraft(e.currentTarget.value)}
        onChange={(e) => {
          const text = e.currentTarget.value;
          setDraft(text);
          onInvalidChange(!valid(text));
          if (valid(text)) onChange(Number(text));
        }}
        onBlur={() => {
          setDraft(null);
          onInvalidChange(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.currentTarget.reportValidity()) e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
export type Encouragement = { message: string; id: number } | null;
export function useExerciseEncouragement() {
  const [notice, setNotice] = useState<Encouragement>(null),
    sequence = useRef(0);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2800);
    return () => clearTimeout(timer);
  }, [notice]);
  return {
    notice,
    celebrate: (completed: number, total: number) =>
      setNotice({
        message: exerciseEncouragement(completed, total),
        id: ++sequence.current,
      }),
  };
}
export function WorkoutEncouragement({ notice }: { notice: Encouragement }) {
  return notice ? (
    <div
      className="workout-encouragement"
      key={notice.id}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <Check size={22} />
      <span>{notice.message}</span>
    </div>
  ) : null;
}
