import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requirePageSession } from "@/lib/auth-session";
import { db } from "@/lib/database";
import { sessionCatalog } from "@/lib/session/server";
import { draftSchema } from "@/lib/session/model";
import { SessionRoute } from "@/components/session/session-route";
export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requirePageSession("/session/" + id);
  const [row] =
    await db()`SELECT plan,started_at,finished_at FROM firstrep_live_sessions WHERE id=${id} AND user_id=${user.user.id}`;
  if (!row) notFound();
  if (row.finished_at) redirect("/#workout");
  return (
    <SessionRoute
      id={id}
      plan={draftSchema.parse(row.plan)}
      catalog={await sessionCatalog()}
      unit={user.user.weightUnit === "lb" ? "lb" : "kg"}
    />
  );
}
