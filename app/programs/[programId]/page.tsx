import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth-session";
import { programs } from "@/lib/program-data";
import { ProgramDetail } from "@/components/program-library";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { programId } = await params,
    { day } = await searchParams;
  const program = programs.find((p) => p.id === programId);
  if (!program) notFound();
  const selected = Number(day || 1) - 1;
  const initialDay =
    Number.isInteger(selected) &&
    selected >= 0 &&
    selected < program.schedule.length
      ? selected
      : 0;
  await requirePageSession(`/programs/${programId}?day=${initialDay + 1}`);
  return (
    <ProgramDetail
      key={`${programId}:${initialDay}`}
      programId={programId}
      initialDay={initialDay}
    />
  );
}
