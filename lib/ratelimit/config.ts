// Shared by every instance and route. Durations use Upstash's Duration syntax.
export const RATE_LIMITS = {
  loginIp: { limit: 20, window: "15 m", prefix: "rl:login:ip" },
  loginEmail: { limit: 5, window: "15 m", prefix: "rl:login:email" },
  signupIp: { limit: 3, window: "1 h", prefix: "rl:signup:ip" },
  resetEmail: { limit: 3, window: "1 h", prefix: "rl:reset:email" },
  resetIp: { limit: 10, window: "1 h", prefix: "rl:reset:ip" },
  verifyMinute: { limit: 1, window: "1 m", prefix: "rl:verify:minute" },
  verifyDay: { limit: 5, window: "1 d", prefix: "rl:verify:day" },
  planHour: { limit: 10, window: "1 h", prefix: "rl:plan:hour" },
  planDay: { limit: 30, window: "1 d", prefix: "rl:plan:day" },
  planIp: { limit: 30, window: "1 h", prefix: "rl:plan:ip" },
  voiceMinute: { limit: 20, window: "1 m", prefix: "rl:voice:minute" },
  voiceDay: { limit: 200, window: "1 d", prefix: "rl:voice:day" },
  ttsCharacters: { limit: 20_000, window: "1 d", prefix: "rl:tts:characters" },
} as const;
export const RATE_INFRA = {
  timeoutMs: 1000,
  generationLockSeconds: 60,
  generationRenewMs: 20_000,
  lockPrefix: "rl:plan:running:",
} as const;
export type LimitName = keyof typeof RATE_LIMITS;
export type RateScope =
  "login" | "signup" | "reset" | "verify" | "plan_builder" | "voice";
