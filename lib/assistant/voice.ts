import { formatAssistantReply } from "./reply-format.ts";
export const MIN_CLIP_MS = 400;
export const MAX_CLIP_MS = 30000;
export function voiceCommand(text: string): "confirm" | "cancel" | null {
  const phrase = text
    .toLowerCase()
    .trim()
    .replace(/[.!?,]+$/g, "")
    .replace(/\s+/g, " ");
  if (
    [
      "yes",
      "yes please",
      "confirm",
      "save it",
      "save that",
      "confirm it",
    ].includes(phrase)
  )
    return "confirm";
  if (
    [
      "no",
      "cancel",
      "cancel it",
      "never mind",
      "nevermind",
      "discard it",
    ].includes(phrase)
  )
    return "cancel";
  return null;
}
export function recordingMime(supports: (type: string) => boolean) {
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(supports);
}
export function spokenText(text: string) {
  const reply = formatAssistantReply(text);
  if (reply.length <= 1200) return reply;
  const clipped = reply.slice(0, 1200);
  // Avoid cutting a spelled-out word in half at the speech limit.
  const boundary = clipped.lastIndexOf(" ");
  return (boundary > 0 ? clipped.slice(0, boundary) : clipped).trim();
}
