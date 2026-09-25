import { z } from "zod";

export const kinds = ["bmi", "workout", "food"] as const;
export type Kind = (typeof kinds)[number];
const num = (min: number, max: number) =>
  z.coerce.number().finite().min(min).max(max);
const date = z.string().date();
const name = z.string().trim().min(1).max(300);
export const schemas = {
  bmi: z.object({
    recorded_at: z
      .string()
      .min(10)
      .refine((v) => Number.isFinite(Date.parse(v)), "Invalid timestamp"),
    height_cm: num(100, 250),
    weight_kg: num(20, 500),
  }),
  workout: z.object({
    date,
    exercise: name,
    exercise_id: z.string().min(1).max(100).nullable().optional(),
    performed_at: z.string().datetime({ offset: true }).nullable().optional(),
    sets: num(1, 100).int(),
    reps: num(1, 1000).int(),
    weight_kg: num(0, 1000),
    rpe: num(1, 10).multipleOf(0.5),
    notes: z.string().max(2000),
  }),
  food: z.object({
    date,
    food: name,
    protein_g: num(0, 10000),
    carbs_g: num(0, 10000),
    fat_g: num(0, 10000),
  }),
};
export type Entry = { id: string; [key: string]: string | number | null | undefined };
export type Logs = Record<Kind, Entry[]>;
export const emptyLogs = (): Logs => ({ bmi: [], workout: [], food: [] });
export const columns: Record<Kind, string[]> = {
  bmi: ["recorded_at", "height_cm", "weight_kg"],
  workout: ["date", "exercise", "sets", "reps", "weight_kg", "rpe", "notes"],
  food: ["date", "food", "protein_g", "carbs_g", "fat_g"],
};
export const tables = {
  bmi: "firstrep_bmi_readings",
  workout: "firstrep_workout_entries",
  food: "firstrep_food_entries",
};
export function validateEntry(kind: Kind, value: unknown): Entry {
  const record = value as Entry;
  const id = z.string().uuid().parse(record.id);
  const parsed = schemas[kind].parse(record);
  return { id, ...parsed };
}
export const bmi = (row: Entry) =>
  Number(row.weight_kg) / (Number(row.height_cm) / 100) ** 2;
export const calories = (row: Entry) =>
  Number(row.protein_g) * 4 + Number(row.carbs_g) * 4 + Number(row.fat_g) * 9;
export const volume = (row: Entry) =>
  Number(row.sets) * Number(row.reps) * Number(row.weight_kg);
export function bmiCategory(value: number) {
  return value < 18.5
    ? "Underweight"
    : value < 25
      ? "Normal weight"
      : value < 30
        ? "Overweight"
        : "Obesity";
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function toKg(weight: number, unit: string) {
  return weight * (unit === "lb" ? 0.45359237 : 1);
}
export function toGrams(amount: number, unit: string) {
  return (
    amount * (unit === "oz" ? 28.349523125 : unit === "lb" ? 453.59237 : 1)
  );
}
export function csvExport(kind: Kind, rows: Entry[]) {
  const escape = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return [
    columns[kind].join(","),
    ...rows.map((row) =>
      columns[kind].map((key) => escape(row[key])).join(","),
    ),
  ].join("\r\n");
}
export function csvImport(kind: Kind, source: string): Entry[] {
  if (source.length > 5_000_000)
    throw new Error("CSV files must be smaller than 5 MB.");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  const text = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("Unclosed quote in CSV.");
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  const header = rows.shift() ?? [];
  if (
    header.length !== columns[kind].length ||
    new Set(header).size !== header.length ||
    columns[kind].some((key) => !header.includes(key))
  )
    throw new Error(
      "CSV columns do not match this tracker. Use a FirstRep CSV export.",
    );
  if (rows.length > 10000)
    throw new Error("Import up to 10,000 entries at a time.");
  return rows.map((r, index) => {
    if (r.length !== header.length)
      throw new Error(`Row ${index + 2} has the wrong number of columns.`);
    const record = Object.fromEntries(header.map((key, i) => [key, r[i]]));
    for (const key of header)
      if (
        !["recorded_at", "date", "exercise", "food", "notes"].includes(key) &&
        !record[key].trim()
      )
        throw new Error(`Row ${index + 2}: ${key} is empty.`);
    return validateEntry(kind, { ...record, id: crypto.randomUUID() });
  });
}
