export const USAGE_CHANGED = "firstrep:usage-changed";
const paidPaths = new Set([
  "ai",
  "coach",
  "progress/goals/confirm",
  "assistant/chat",
  "assistant/transcribe",
  "assistant/speak",
  "speech",
  "transcribe",
]);
export function usageChanged(path: string) {
  const normalized = path
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/^\/?api\//, "")
    .split("?")[0];
  if (typeof window !== "undefined" && paidPaths.has(normalized))
    window.dispatchEvent(new Event(USAGE_CHANGED));
}
export const usageFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } finally {
    usageChanged(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
  }
};
