import { matchExercise, type MatchCandidate } from "../exercise-match.ts";
export function matchAssistantExercise(
  name: string,
  catalog: MatchCandidate[],
) {
  if (name.toLowerCase().trim() === "bench") {
    const names = [
      "Barbell_Bench_Press_-_Medium_Grip",
      "Incline_Barbell_Bench_Press",
      "Dumbbell_Bench_Press",
    ];
    const candidates = names
      .map((id) => catalog.find((e) => e.id === id))
      .filter((e): e is MatchCandidate => !!e);
    if (candidates.length < 3)
      candidates.push(
        ...catalog
          .filter(
            (e) =>
              /bench.*press/i.test(e.name) &&
              !candidates.some((c) => c.id === e.id),
          )
          .slice(0, 3 - candidates.length),
      );
    return {
      match: null,
      confidence: "low",
      candidates: candidates.slice(0, 3),
    };
  }
  return matchExercise(name, catalog);
}
