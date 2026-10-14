import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth-session";
import { programs } from "@/lib/program-data";
import { ProgramWorkout } from "@/components/program-library";
export default async function Page({
  params,
}: {
  params: Promise<{ programId: string; day: string }>;
}) {
  const { programId, day } = await params,
    program = programs.find((p) => p.id === programId),
    selected = Number(day) - 1;
  if (
    !program ||
    !Number.isInteger(selected) ||
    selected < 0 ||
    selected >= program.schedule.length
  )
    notFound();
  await requirePageSession(`/programs/${programId}/workout/${day}`);
  return <ProgramWorkout programId={programId} day={selected} />;
}
