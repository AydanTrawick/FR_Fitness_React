import { z } from "zod";
export const TERMS_VERSION = "2026-10-02";
export const blockedUsernames = new Set([
  "admin",
  "administrator",
  "firstrep",
  "support",
  "security",
  "help",
  "api",
  "settings",
  "root",
  "null",
  "undefined",
  "moderator",
]);
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Use at least 3 characters.")
  .max(20, "Use at most 20 characters.")
  .regex(/^[a-zA-Z0-9_.]+$/, "Use letters, numbers, underscores, or periods.")
  .refine(
    (v) => !blockedUsernames.has(v.toLowerCase()),
    "Choose a different username.",
  );
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(250);
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128, "Use at most 128 characters.");
export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100),
  email: emailSchema,
  password: passwordSchema,
  acceptedTerms: z.literal(true, {
    error: "Accept the Terms and Privacy Policy to continue.",
  }),
});
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  bio: z.string().max(500),
  weightUnit: z.enum(["kg", "lb"]),
  distanceUnit: z.enum(["km", "mi"]),
  timezone: z
    .string()
    .max(100)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid time zone."),
  goal: z.enum(["strength", "muscle", "fitness", "consistency"]),
  image: z.string().max(500000).nullable().optional(),
});
export const preferencesSchema = z.object({
  visibility: z.enum(["private", "followers", "public"]),
  aiDataOptIn: z.boolean(),
  analyticsOptIn: z.boolean(),
  workoutEmail: z.boolean(),
  planEmail: z.boolean(),
  newsEmail: z.boolean(),
  workoutPush: z.boolean(),
  planPush: z.boolean(),
  newsPush: z.boolean(),
});
export const defaultPreferences = {
  visibility: "private" as const,
  aiDataOptIn: false,
  analyticsOptIn: false,
  workoutEmail: false,
  planEmail: false,
  newsEmail: false,
  workoutPush: false,
  planPush: false,
  newsPush: false,
};
export function safeReturnTo(value: string | null | undefined) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://firstrep.local");
    return url.origin === "https://firstrep.local" &&
      !url.pathname.startsWith("/api/") &&
      !url.pathname.startsWith("/auth")
      ? `${url.pathname}${url.search}${url.hash}`
      : "/";
  } catch {
    return "/";
  }
}
