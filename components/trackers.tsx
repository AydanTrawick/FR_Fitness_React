"use client";
import { useState, type FormEvent } from "react";
import {
  Download,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Check,
  X,
} from "lucide-react";
import {
  bmi,
  bmiCategory,
  calories,
  columns,
  csvExport,
  csvImport,
  today,
  toGrams,
  toKg,
  volume,
  type Entry,
  type Kind,
} from "@/lib/tracking";
import { api, download, errorText } from "@/lib/client";
import content from "@/lib/content.json";
import { useStore } from "./store";
import { Card, Empty, Field, PageTitle } from "./ui";
type ExerciseMatch = {
  match: { id: string; name: string } | null;
  confidence: "exact" | "alias" | "fuzzy" | "low" | "none";
  candidates: { id: string; name: string }[];
};
const resolveExercise = (name: string) =>
  api<ExerciseMatch>(`exercises/match?name=${encodeURIComponent(name)}`);
const labels: Record<string, string> = {
  recorded_at: "Recorded at (UTC)",
  height_cm: "Height (cm)",
  weight_kg: "Weight (kg)",
  date: "Date",
  exercise: "Exercise",
  sets: "Sets",
  reps: "Reps",
  rpe: "RPE",
  notes: "Notes",
  food: "Food",
  protein_g: "Protein (g)",
  carbs_g: "Carbs (g)",
  fat_g: "Fat (g)",
};
const textKeys = ["recorded_at", "date", "exercise", "notes", "food"];
const numericLimits: Record<string, [number, number, number]> = {
  height_cm: [100, 250, 0.1],
  weight_kg: [0, 1000, 0.1],
  sets: [1, 100, 1],
  reps: [1, 1000, 1],
  rpe: [1, 10, 0.5],
  protein_g: [0, 10000, 0.1],
  carbs_g: [0, 10000, 0.1],
  fat_g: [0, 10000, 0.1],
};
function NumberInput({
  name,
  value,
  min = 0,
  max = 10000,
  step = "any",
  onChange,
}: {
  name?: string;
  value?: number;
  min?: number;
  max?: number;
  step?: number | string;
  onChange?: (value: number) => void;
}) {
  return (
    <input
      name={name}
      type="number"
      required
      min={min}
      max={max}
      step={step}
      {...(onChange
        ? {
            value,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              onChange(Number(e.target.value)),
          }
        : { defaultValue: value })}
    />
  );
}
function History({ kind }: { kind: Kind }) {
  const { logs, busy, save, setError, status, reload } = useStore();
  const [edit, setEdit] = useState<Entry | null>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const [restore, setRestore] = useState<Entry[] | null>(null);
  const [replace, setReplace] = useState(false);
  const [filter, setFilter] = useState("");
  const rows = [...logs[kind]]
    .reverse()
    .filter((row) =>
      Object.values(row).join(" ").toLowerCase().includes(filter.toLowerCase()),
    );
  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (!edit) return;
    let matched: ExerciseMatch["match"] = null;
    if (
      kind === "workout" &&
      String(fields.exercise).trim() !== edit.exercise
    ) {
      try {
        matched = (await resolveExercise(String(fields.exercise))).match;
        if (!matched)
          throw new Error("Choose a recognized exercise from the catalog.");
      } catch (error) {
        setError(errorText(error));
        return;
      }
    }
    if (
      await save(
        kind,
        logs[kind].map((row) =>
          row.id === edit.id
            ? ({
                ...row,
                ...fields,
                ...(matched
                  ? { exercise_id: matched.id, exercise: matched.name }
                  : {}),
              } as Entry)
            : row,
        ),
      )
    )
      setEdit(null);
  }
  return (
    <Card>
      <div className="section-top">
        <div>
          <h3>{kind === "bmi" ? "Reading history" : "Your entries"}</h3>
          <p className="muted">
            {logs[kind].length} entries ·{" "}
            {status.user ? "Saved to your account" : "Guest browser session"}
          </p>
        </div>
        <div className="row wrap">
          <button
            className="btn secondary small"
            onClick={() =>
              download(
                `${kind === "bmi" ? "bmi" : kind}_log.csv`,
                csvExport(kind, logs[kind]),
                "text/csv",
              )
            }
          >
            <Download size={15} /> Export CSV
          </button>
          {status.user && (
            <button
              className="btn icon"
              aria-label="Reload saved logs"
              disabled={busy}
              onClick={() => void reload()}
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      </div>
      {edit && (
        <form key={edit.id} onSubmit={submitEdit} className="edit-panel">
          <h4>Edit entry</h4>
          <p className="muted">
            Weights are in kilograms. Calculated totals update when you save.
          </p>
          <div className="form-grid">
            {columns[kind].map((key) => (
              <Field label={labels[key]} key={key}>
                {textKeys.includes(key) ? (
                  <input
                    name={key}
                    required={key !== "notes"}
                    type={key === "date" ? "date" : "text"}
                    defaultValue={edit[key] ?? ""}
                  />
                ) : (
                  <NumberInput
                    name={key}
                    value={Number(edit[key])}
                    min={
                      kind === "bmi" && key === "weight_kg"
                        ? 20
                        : numericLimits[key][0]
                    }
                    max={
                      kind === "bmi" && key === "weight_kg"
                        ? 500
                        : numericLimits[key][1]
                    }
                    step={numericLimits[key][2]}
                  />
                )}
              </Field>
            ))}
          </div>
          <div className="row">
            <button className="btn primary" disabled={busy}>
              <Check size={15} /> Save changes
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setEdit(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {rows.length > 0 || filter ? (
        <>
          <input
            className="table-search"
            aria-label="Filter entries"
            placeholder="Search your entries…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {columns[kind].map((key) => (
                    <th key={key}>{labels[key]}</th>
                  ))}
                  <th>
                    {kind === "bmi"
                      ? "BMI"
                      : kind === "workout"
                        ? "Volume (kg)"
                        : "Calories"}
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {columns[kind].map((key) => (
                      <td key={key}>
                        {key === "recorded_at"
                          ? new Date(String(row[key])).toLocaleString()
                          : typeof row[key] === "number"
                            ? Number(row[key]).toLocaleString(undefined, {
                                maximumFractionDigits: 1,
                              })
                            : row[key]}
                      </td>
                    ))}
                    <td className="accent">
                      {(kind === "bmi"
                        ? bmi(row)
                        : kind === "workout"
                          ? volume(row)
                          : calories(row)
                      ).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </td>
                    <td>
                      <div className="row">
                        <button
                          className="btn icon"
                          aria-label={`Edit ${row.exercise ?? row.food ?? "reading"}`}
                          onClick={() => {
                            setEdit(row);
                            setRemove(null);
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn icon danger"
                          aria-label={`Delete ${row.exercise ?? row.food ?? "reading"}`}
                          onClick={() => setRemove(row.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Empty
          title="Your first entry starts the story."
          text="Add a record above or restore a CSV from your original FirstRep app."
        />
      )}
      {remove && (
        <div className="notice warning row between">
          <span>Delete this entry? Your totals will be recalculated.</span>
          <div className="row">
            <button
              className="btn secondary small"
              disabled={busy}
              onClick={async () => {
                if (
                  await save(
                    kind,
                    logs[kind].filter((row) => row.id !== remove),
                  )
                )
                  setRemove(null);
              }}
            >
              Delete entry
            </button>
            <button
              className="btn icon"
              aria-label="Cancel deletion"
              onClick={() => setRemove(null)}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      <details className="restore">
        <summary>
          <Upload size={15} /> Restore from CSV
        </summary>
        <p className="muted">
          Compatible with the original Streamlit tracker exports. All rows are
          validated before saving.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV backup"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setRestore(null);
            if (!file) return;
            try {
              if (file.size > 5000000)
                throw new Error("Choose a CSV under 5 MB.");
              setRestore(csvImport(kind, await file.text()));
              setReplace(false);
            } catch (error) {
              setError(errorText(error));
            }
          }}
        />
        {restore && (
          <div className="stack">
            <p>{restore.length} valid entries ready to restore.</p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              Replace all {logs[kind].length} existing entries in this tracker.
            </label>
            <button
              className="btn secondary"
              disabled={!replace || busy}
              onClick={async () => {
                try {
                  let rows = restore;
                  if (kind === "workout") {
                    const names = [
                      ...new Set(restore.map((row) => String(row.exercise))),
                    ];
                    const matches = await Promise.all(
                      names.map(resolveExercise),
                    );
                    const byName = new Map(
                      names.map((name, i) => [name, matches[i].match]),
                    );
                    const unresolved = names.filter(
                      (name) => !byName.get(name),
                    );
                    if (unresolved.length)
                      throw new Error(
                        `Cannot restore unmatched exercises: ${unresolved.slice(0, 5).join(", ")}. Review their names first.`,
                      );
                    rows = restore.map((row) => ({
                      ...row,
                      exercise_id: byName.get(String(row.exercise))!.id,
                      performed_at: `${row.date}T12:00:00.000Z`,
                    }));
                  }
                  if (await save(kind, rows)) setRestore(null);
                } catch (error) {
                  setError(errorText(error));
                }
              }}
            >
              Restore {restore.length} entries
            </button>
          </div>
        )}
      </details>
    </Card>
  );
}
export function BmiTracker() {
  const { logs, save, busy, status } = useStore();
  const [unit, setUnit] = useState(
    status.user?.weightUnit === "lb" ? "imperial" : "metric",
  );
  const [height, setHeight] = useState(170);
  const [heightFeet, setHeightFeet] = useState("5");
  const [heightInches, setHeightInches] = useState("6.93");
  const [heightError, setHeightError] = useState("");
  function switchUnits(next: string) {
    if (next === unit) return;
    if (next === "imperial") {
      const total = Number((height / 2.54).toFixed(2));
      setHeightFeet(String(Math.floor(total / 12)));
      setHeightInches(String(Number((total % 12).toFixed(2))));
    } else {
      const cm = (Number(heightFeet) * 12 + Number(heightInches)) * 2.54;
      if (
        heightFeet &&
        heightInches &&
        Number.isFinite(cm) &&
        cm >= 100 &&
        cm <= 250
      )
        setHeight(cm);
    }
    setHeightError("");
    setUnit(next);
  }
  const [weight, setWeight] = useState(70);
  const [result, setResult] = useState<Entry | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const enteredHeight =
      unit === "metric"
        ? height
        : (Number(heightFeet) * 12 + Number(heightInches)) * 2.54;
    if (
      !Number.isFinite(enteredHeight) ||
      enteredHeight < 100 ||
      enteredHeight > 250
    ) {
      setHeightError(
        "Enter a height between 3 ft 3.38 in and 8 ft 2.42 in (100–250 cm).",
      );
      return;
    }
    setHeightError("");
    setHeight(enteredHeight);
    const row = {
      id: crypto.randomUUID(),
      recorded_at: new Date().toISOString(),
      height_cm: enteredHeight,
      weight_kg: weight,
    };
    setResult(row);
    await save("bmi", [...logs.bmi, row]);
  }
  const value = result ? bmi(result) : null;
  return (
    <>
      <PageTitle
        eyebrow="MEASURE & UNDERSTAND"
        title="Your starting point."
        description="Track your BMI over time. One useful measurement, part of a bigger picture."
      />
      <div className="two-col">
        <Card>
          <h3>Body measurements</h3>
          <p className="muted">Standard adult BMI · ages 20 and older</p>
          <div className="tabs">
            <button
              className={unit === "metric" ? "active" : ""}
              onClick={() => switchUnits("metric")}
            >
              Metric
            </button>
            <button
              className={unit === "imperial" ? "active" : ""}
              onClick={() => switchUnits("imperial")}
            >
              Imperial
            </button>
          </div>
          <form onSubmit={submit} className="stack">
            <div className="form-grid">
              <Field label={`Weight (${unit === "metric" ? "kg" : "lb"})`}>
                <NumberInput
                  min={unit === "metric" ? 20 : 44.093}
                  max={unit === "metric" ? 500 : 1102.31}
                  value={Number(
                    (unit === "metric" ? weight : weight / 0.45359237).toFixed(
                      2,
                    ),
                  )}
                  onChange={(n) =>
                    setWeight(toKg(n, unit === "metric" ? "kg" : "lb"))
                  }
                />
              </Field>
              {unit === "metric" ? (
                <Field label="Height (cm)">
                  <NumberInput
                    min={100}
                    max={250}
                    value={Number(height.toFixed(2))}
                    onChange={setHeight}
                  />
                </Field>
              ) : (
                <fieldset className="imperial-height">
                  <legend>Height</legend>
                  <div className="imperial-height-fields">
                    <Field label="Feet">
                      <input
                        type="number"
                        name="heightFeet"
                        required
                        min={3}
                        max={8}
                        step={1}
                        value={heightFeet}
                        onChange={(e) => {
                          setHeightFeet(e.target.value);
                          setHeightError("");
                        }}
                      />
                    </Field>
                    <Field label="Inches">
                      <input
                        type="number"
                        name="heightInches"
                        required
                        min={0}
                        max={11.99}
                        step="any"
                        value={heightInches}
                        onChange={(e) => {
                          setHeightInches(e.target.value);
                          setHeightError("");
                        }}
                      />
                    </Field>
                  </div>
                </fieldset>
              )}
            </div>
            {heightError && (
              <p className="error-text" role="alert">
                {heightError}
              </p>
            )}
            <label className="checkbox">
              <input type="checkbox" required />I am 20 or older.
            </label>
            <button className="btn primary" disabled={busy}>
              <Plus size={16} /> Calculate & save reading
            </button>
          </form>
          <p className="footnote">
            BMI does not distinguish muscle from fat and is not a medical
            diagnosis. Adult categories are not intended for children or
            pregnancy.
          </p>
        </Card>
        <Card className="bmi-result">
          <p className="eyebrow">YOUR BODY MASS INDEX</p>
          <div className="bmi-number">{value ? value.toFixed(1) : "—"}</div>
          <span className="pill">
            {value ? bmiCategory(value) : "Ready when you are"}
          </span>
          <div className="bmi-scale">
            {value && (
              <span
                style={{
                  left: `${Math.min(98, Math.max(2, ((value - 10) / 30) * 100))}%`,
                }}
              />
            )}
          </div>
          <div className="scale-labels">
            <span>Under 18.5</span>
            <span>18.5–24.9</span>
            <span>25–29.9</span>
            <span>30+</span>
          </div>
          <p className="muted">
            {result
              ? `Adult reference weight range at this height: ${((18.5 * (Number(result.height_cm) / 100) ** 2) / (unit === "metric" ? 1 : 0.45359237)).toFixed(1)}–${((24.9 * (Number(result.height_cm) / 100) ** 2) / (unit === "metric" ? 1 : 0.45359237)).toFixed(1)} ${unit === "metric" ? "kg" : "lb"}.`
              : "Enter your measurements to see your result."}
          </p>
        </Card>
      </div>
      <History kind="bmi" />
    </>
  );
}
export function WorkoutTracker() {
  const { logs, save, busy, setError, status } = useStore();
  const [unit, setUnit] = useState(status.user?.weightUnit || "kg");
  const [date, setDate] = useState(today);
  const [exercise, setExercise] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [candidates, setCandidates] = useState<ExerciseMatch["candidates"]>([]);
  const selected = logs.workout.filter((row) => row.date === date);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    let matched: ExerciseMatch["match"];
    try {
      const result = await resolveExercise(selectedExerciseId || exercise);
      matched = result.match;
      if (!matched) {
        setCandidates(result.candidates);
        throw new Error(
          result.candidates.length
            ? `Did you mean ${result.candidates[0].name}? Choose a suggestion before logging.`
            : "No matching exercise found. Choose one from the catalog.",
        );
      }
    } catch (error) {
      setError(errorText(error));
      return;
    }
    const row = {
      ...fields,
      id: crypto.randomUUID(),
      date,
      exercise: matched.name,
      exercise_id: matched.id,
      performed_at:
        date === today() ? new Date().toISOString() : `${date}T12:00:00.000Z`,
      weight_kg: toKg(Number(fields.weight), unit),
    } as Entry;
    if (await save("workout", [...logs.workout, row])) {
      setExercise("");
      setSelectedExerciseId("");
      setCandidates([]);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="TRAIN WITH INTENTION"
        title="Every rep counts."
        description="Log your sets, track your effort, and see your strength take shape."
      />
      <div className="two-col">
        <Card>
          <h3>Log an exercise</h3>
          <form onSubmit={submit} className="stack">
            <div className="form-grid">
              <Field label="Training date">
                <input
                  type="date"
                  name="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field label="Weight unit">
                <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="lb">Pounds (lb)</option>
                </select>
              </Field>
            </div>
            <Field label="Exercise">
              <input
                name="exercise"
                list="exercises"
                placeholder="e.g. Bench Press"
                value={exercise}
                onChange={(e) => {
                  setExercise(e.target.value);
                  setSelectedExerciseId("");
                }}
                required
                maxLength={300}
              />
              <datalist id="exercises">
                {[
                  ...new Set(
                    content.programs.flatMap((p) =>
                      p.schedule.flatMap((d) => d.exercises.map((e) => e.name)),
                    ),
                  ),
                ]
                  .sort()
                  .map((name) => (
                    <option key={name} value={name} />
                  ))}
              </datalist>
            </Field>
            {candidates.length > 0 && (
              <Field label="Did you mean…?">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const candidate = candidates.find(
                      (item) => item.id === e.target.value,
                    );
                    if (candidate) {
                      setExercise(candidate.name);
                      setSelectedExerciseId(candidate.id);
                    }
                  }}
                >
                  <option value="" disabled>
                    Choose a catalog exercise
                  </option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} ({candidate.id})
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="form-grid four">
              <Field label="Sets">
                <NumberInput name="sets" value={1} min={1} max={100} step={1} />
              </Field>
              <Field label="Reps / set">
                <NumberInput
                  name="reps"
                  value={8}
                  min={1}
                  max={1000}
                  step={1}
                />
              </Field>
              <Field label={`Weight (${unit})`}>
                <NumberInput
                  name="weight"
                  value={20}
                  max={unit === "kg" ? 1000 : 2204.62}
                />
              </Field>
              <Field label="RPE (1–10)">
                <NumberInput name="rpe" value={7} min={1} max={10} step={0.5} />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <input
                name="notes"
                placeholder="How did it feel?"
                maxLength={2000}
              />
            </Field>
            <button className="btn primary" disabled={busy}>
              <Plus size={16} /> Add to workout log
            </button>
          </form>
        </Card>
        <Card className="summary-card">
          <p className="eyebrow">SESSION SUMMARY</p>
          <h3>{date}</h3>
          <div className="summary-number">
            {selected.reduce((s, r) => s + Number(r.sets), 0)}
            <span>total sets</span>
          </div>
          <div className="summary-line">
            <span>Exercises</span>
            <strong>{new Set(selected.map((r) => r.exercise)).size}</strong>
          </div>
          <div className="summary-line">
            <span>Training volume</span>
            <strong>
              {selected
                .reduce((s, r) => s + volume(r), 0)
                .toLocaleString(undefined, { maximumFractionDigits: 1 })}{" "}
              kg
            </strong>
          </div>
          <div className="tip">
            <h4>A note on effort</h4>
            <p>
              RPE is your perceived effort from 1 to 10. RPE 8 means roughly two
              good reps left in the tank.
            </p>
          </div>
          <p className="muted">
            Volume = sets × reps × weight. Log separate entries when weight or
            reps change between sets.
          </p>
        </Card>
      </div>
      <History kind="workout" />
    </>
  );
}
type FoodResult = {
  id: number;
  name: string;
  brand: string;
  macros: (number | null)[];
};
export function FoodTracker() {
  const { logs, save, busy, setError, status } = useStore();
  const [mode, setMode] = useState("common");
  const [date, setDate] = useState(today);
  const [food, setFood] = useState(Object.keys(content.foods)[0]);
  const [amount, setAmount] = useState(100);
  const [unit, setUnit] = useState("g");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodResult[]>([]);
  const [choice, setChoice] = useState<FoodResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const totals = logs.food
    .filter((row) => row.date === date)
    .reduce(
      (s, r) => ({
        calories: s.calories + calories(r),
        protein: s.protein + Number(r.protein_g),
        carbs: s.carbs + Number(r.carbs_g),
        fat: s.fat + Number(r.fat_g),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
  const per100 =
    mode === "usda"
      ? choice?.macros
      : content.foods[food as keyof typeof content.foods];
  const macros = per100?.map((n) =>
    n === null ? null : (n * toGrams(amount, unit)) / 100,
  );
  async function search(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    setError("");
    setChoice(null);
    try {
      setResults(
        (
          await api<{ foods: FoodResult[] }>(
            `foods?q=${encodeURIComponent(query)}`,
          )
        ).foods,
      );
      setSearched(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSearching(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const row: Entry =
      mode === "manual"
        ? ({ ...fields, id: crypto.randomUUID(), date } as Entry)
        : {
            id: crypto.randomUUID(),
            date,
            food: `${mode === "usda" ? `${choice!.name} [USDA ${choice!.id}]` : food} (${amount} ${unit})`,
            protein_g: macros![0]!,
            carbs_g: macros![1]!,
            fat_g: macros![2]!,
          };
    await save("food", [...logs.food, row]);
  }
  return (
    <>
      <PageTitle
        eyebrow="FUEL YOUR EVERYDAY"
        title="Good fuel. Better days."
        description="Keep a clear view of your meals and macros, without overcomplicating it."
      />
      <div className="two-col">
        <Card>
          <h3>Log your food</h3>
          <div className="tabs">
            {[
              ["common", "Common foods"],
              ["manual", "Manual entry"],
              ["usda", "USDA search"],
            ].map(([id, label]) => (
              <button
                className={mode === id ? "active" : ""}
                key={id}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "usda" && (
            <div className="stack">
              {!status.foodSearch && (
                <p className="notice">
                  USDA search needs a server API key. Common foods and manual
                  entry are ready to use.
                </p>
              )}
              <form className="row" onSubmit={search}>
                <input
                  aria-label="Search USDA foods"
                  minLength={2}
                  required
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search a food or brand…"
                />
                <button
                  className="btn secondary"
                  disabled={searching || !status.foodSearch}
                >
                  {searching ? "Searching…" : "Search"}
                </button>
              </form>
              {searched && !results.length && (
                <p className="muted">No foods found. Try a different search.</p>
              )}
              <div className="food-results">
                {results.map((r) => (
                  <button
                    key={r.id}
                    className={choice?.id === r.id ? "selected" : ""}
                    disabled={r.macros.includes(null)}
                    onClick={() => setChoice(r)}
                  >
                    <strong>{r.name}</strong>
                    <small>
                      {r.brand || "USDA FoodData Central"}
                      {r.macros.includes(null) ? " · Missing macros" : ""}
                    </small>
                  </button>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={submit} className="stack">
            <Field label="Date">
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            {mode === "manual" ? (
              <>
                <Field label="Food / meal">
                  <input
                    name="food"
                    placeholder="e.g. Homemade chicken bowl"
                    required
                    maxLength={300}
                  />
                </Field>
                <p className="muted">
                  Enter macros for the whole portion you ate.
                </p>
                <div className="form-grid three">
                  {[
                    ["protein_g", "Protein (g)"],
                    ["carbs_g", "Carbs (g)"],
                    ["fat_g", "Fat (g)"],
                  ].map(([key, label]) => (
                    <Field key={key} label={label}>
                      <NumberInput name={key} />
                    </Field>
                  ))}
                </div>
              </>
            ) : (
              <>
                {mode === "common" && (
                  <Field label="Food">
                    <select
                      value={food}
                      onChange={(e) => setFood(e.target.value)}
                    >
                      {Object.keys(content.foods).map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="form-grid">
                  <Field label="Amount">
                    <NumberInput
                      min={0.1}
                      max={10000}
                      value={amount}
                      onChange={setAmount}
                    />
                  </Field>
                  <Field label="Unit">
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                    >
                      <option value="g">Grams (g)</option>
                      <option value="oz">Ounces (oz)</option>
                      <option value="lb">Pounds (lb)</option>
                    </select>
                  </Field>
                </div>
                {macros && !macros.includes(null) && (
                  <div className="macro-preview">
                    <strong>
                      {Math.round(
                        macros[0]! * 4 + macros[1]! * 4 + macros[2]! * 9,
                      )}{" "}
                      kcal
                    </strong>
                    <span>
                      {macros
                        .map(
                          (m, i) =>
                            `${m!.toFixed(1)} g ${["protein", "carbs", "fat"][i]}`,
                        )
                        .join(" · ")}
                    </span>
                  </div>
                )}
              </>
            )}
            <button
              className="btn primary"
              disabled={busy || (mode === "usda" && !choice)}
            >
              <Plus size={16} /> Add to food log
            </button>
          </form>
          <p className="footnote">
            Calories use 4 kcal/g protein, 4 kcal/g carbs, and 9 kcal/g fat.
            Common foods are approximate; package labels may differ.
          </p>
        </Card>
        <Card className="summary-card">
          <p className="eyebrow">DAILY NUTRITION</p>
          <h3>{date}</h3>
          <div
            className="nutrition-ring"
            style={{
              background:
                totals.calories > 0
                  ? `conic-gradient(#5b8cff 0 ${((totals.protein * 4) / totals.calories) * 100}%, #a995c0 ${((totals.protein * 4) / totals.calories) * 100}% ${((totals.protein * 4 + totals.carbs * 4) / totals.calories) * 100}%, #d9bd89 ${((totals.protein * 4 + totals.carbs * 4) / totals.calories) * 100}% 100%)`
                  : "#283146",
            }}
          >
            <div>
              <strong>{Math.round(totals.calories).toLocaleString()}</strong>
              <span>calories logged</span>
            </div>
          </div>
          {[
            ["Protein", totals.protein, "protein"],
            ["Carbohydrates", totals.carbs, "carbs"],
            ["Fat", totals.fat, "fat"],
          ].map(([label, value, color]) => (
            <div className="summary-line" key={label}>
              <span>
                <i className={`macro-dot ${color}`} />
                {label}
              </span>
              <strong>{Number(value).toFixed(1)} g</strong>
            </div>
          ))}
          <p className="muted">
            These totals reflect what you log. No daily calorie target is
            assumed.
          </p>
        </Card>
      </div>
      <History kind="food" />
    </>
  );
}
