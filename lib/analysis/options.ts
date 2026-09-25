import { parseRange } from "./metrics";
export function analysisOptions(
  params: Record<string, string | string[] | undefined>,
) {
  let timezone = typeof params.tz === "string" ? params.tz : "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    timezone = "UTC";
  }
  return {
    range: parseRange(params.range),
    timezone,
    unit: params.unit === "lb" ? ("lb" as const) : ("kg" as const),
  };
}
