type MailEnvironment = Record<string, string | undefined>;

export function accountMailConfig(env: MailEnvironment = process.env) {
  if (env.RESEND_API_KEY) {
    if (!env.AUTH_EMAIL_FROM)
      throw new Error(
        "Configure AUTH_EMAIL_FROM with a verified Resend sender.",
      );
    return {
      provider: "resend" as const,
      from: env.AUTH_EMAIL_FROM,
      apiKey: env.RESEND_API_KEY,
    };
  }
  if (env.NODE_ENV !== "production" && env.EMAIL_ADDRESS && env.EMAIL_PASSWORD)
    return {
      provider: "gmail" as const,
      from: env.EMAIL_ADDRESS,
      user: env.EMAIL_ADDRESS,
      password: env.EMAIL_PASSWORD,
    };
  throw new Error(
    "Configure RESEND_API_KEY and AUTH_EMAIL_FROM with a verified Resend sender to deliver account emails. Development may use Gmail with EMAIL_ADDRESS and an app password.",
  );
}
