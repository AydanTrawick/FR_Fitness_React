"use client";
import { useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Range } from "@/lib/analysis/types";
export default function RangeSelector({
  range,
  unit,
}: {
  range: Range;
  unit: "kg" | "lb";
}) {
  const router = useRouter(),
    params = useSearchParams();
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!params.get("tz")) {
      const next = new URLSearchParams(params);
      next.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);
      const stored = localStorage.getItem("firstrep-weight-unit");
      if (stored === "lb" || stored === "kg") next.set("unit", stored);
      router.replace(`/analysis?${next}`, { scroll: false });
    }
  }, [params, router]);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    start(() => router.replace(`/analysis?${next}`, { scroll: false }));
  };
  return (
    <div className="analysis-controls" aria-busy={pending}>
      <div
        className="analysis-segments"
        role="group"
        aria-label="Analysis date range"
      >
        {(["7d", "30d", "90d", "all"] as Range[]).map((r) => (
          <button
            key={r}
            aria-pressed={range === r}
            onClick={() => update("range", r)}
          >
            {r === "all" ? "All" : r}
          </button>
        ))}
      </div>
      <label className="analysis-unit">
        Units{" "}
        <select
          value={unit}
          onChange={(e) => {
            localStorage.setItem("firstrep-weight-unit", e.target.value);
            update("unit", e.target.value);
          }}
        >
          <option value="kg">kg</option>
          <option value="lb">lb</option>
        </select>
      </label>
      <span role="status" className="analysis-muted">
        {pending ? "Updating…" : ""}
      </span>
    </div>
  );
}
