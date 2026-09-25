export type MatchCandidate = { id: string; name: string };

const aliases: Record<string, string> = {
  bench: "barbell bench press",
  "bench press": "barbell bench press",
  squat: "barbell squat",
  squats: "barbell squat",
  deadlift: "barbell deadlift",
  ohp: "barbell shoulder press",
};
const preferredIds: Record<string, string> = {
  bench: "Barbell_Bench_Press_-_Medium_Grip",
  "bench press": "Barbell_Bench_Press_-_Medium_Grip",
  "barbell bench press": "Barbell_Bench_Press_-_Medium_Grip",
};

const normalize = (value: string) =>
  value.toLowerCase().replace(/[_-]/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return row[b.length];
}

export function matchExercise(input: string, catalog: MatchCandidate[]) {
  const query = normalize(input);
  if (!query) return { match: null, confidence: "none" as const, candidates: [] };
  const preferred = preferredIds[query]
    ? catalog.find((item) => item.id === preferredIds[query])
    : null;
  if (preferred)
    return { match: preferred, confidence: "alias" as const, candidates: [preferred] };
  const exact = catalog.filter((item) => normalize(item.name) === query || normalize(item.id) === query);
  if (exact.length === 1)
    return { match: exact[0], confidence: "exact" as const, candidates: exact };
  const alias = aliases[query];
  if (alias) {
    const named = catalog.filter((item) => normalize(item.name) === alias);
    if (named.length === 1)
      return { match: named[0], confidence: "alias" as const, candidates: named };
  }
  const ranked = catalog
    .map((item) => {
      const name = normalize(item.name);
      const score = 1 - distance(query, name) / Math.max(query.length, name.length, 1);
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5);
  const winner = ranked[0];
  const confident = winner && winner.score >= 0.82 && winner.score - (ranked[1]?.score ?? 0) >= 0.12;
  return {
    match: confident ? { id: winner.id, name: winner.name } : null,
    confidence: confident ? ("fuzzy" as const) : ("low" as const),
    candidates: ranked.map(({ id, name }) => ({ id, name })),
  };
}
