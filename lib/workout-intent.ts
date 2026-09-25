export function isWorkoutLogRequest(prompt: string) {
  return (
    (/\b(log|record|add|track|save)\b/i.test(prompt) &&
      /\b(set|sets|reps?|workout|exercise|press|squat|deadlift|curl|row)\b/i.test(prompt)) ||
    /\b\d+\s+sets?\s+of\b/i.test(prompt)
  );
}
