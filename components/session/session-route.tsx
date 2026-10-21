"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import FirstRep from "../firstrep";
import { api, errorText } from "@/lib/client";
import { planToLive } from "@/lib/session/live";
import type { SessionDraft } from "@/lib/session/model";
import type { CatalogLift, LiveWorkout } from "@/lib/workout-session";
import type { CardUnit } from "@/lib/share-cards";
export function SessionRoute({
  id,
  plan,
  catalog,
  unit,
}: {
  id: string;
  plan: SessionDraft;
  catalog: CatalogLift[];
  unit: CardUnit;
}) {
  const [live, setLive] = useState<LiveWorkout | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ startedAt: string }>("sessions/" + id, { action: "start" }, "PATCH")
      .then((data) => {
        if (active)
          setLive(planToLive(plan, id, unit, catalog, data.startedAt));
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [id, plan, catalog, unit, retry]);
  if (live) return <FirstRep initialLive={live} />;
  return (
    <main className="sb-route-loading">
      <h1>{error ? "Could not open your session" : "Opening your session…"}</h1>
      {error && (
        <>
          <p role="alert">{error}</p>
          <button
            onClick={() => {
              setError("");
              setRetry((v) => v + 1);
            }}
          >
            Try again
          </button>
        </>
      )}
      <Link href="/#workout">Back to workout log</Link>
    </main>
  );
}
