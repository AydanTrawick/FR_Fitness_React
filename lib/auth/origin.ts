/** Only deployment configuration establishes trust; request Host/Origin never does. */
type AuthEnvironment = Record<string, string | undefined>;

function normalizeOrigin(value: string, key: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${key} must be an absolute website URL.`);
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.hostname.includes("*") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/*$/.test(url.pathname)
  )
    throw new Error(
      `${key} must contain only the website origin, without a path or credentials.`,
    );
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error(`${key} must use HTTPS outside localhost.`);
  return url.origin;
}

export function authOriginConfig(env: AuthEnvironment = process.env) {
  const onVercel = env.VERCEL === "1";
  const deployment = onVercel ? env.VERCEL_URL : undefined;
  const platformHost = onVercel
    ? env.VERCEL_ENV === "production"
      ? env.VERCEL_PROJECT_PRODUCTION_URL || deployment
      : deployment
    : undefined;
  let baseURL = env.BETTER_AUTH_URL?.trim()
    ? normalizeOrigin(env.BETTER_AUTH_URL, "BETTER_AUTH_URL")
    : undefined;
  // A copied development value must never pin a Vercel deployment to localhost.
  if (
    onVercel &&
    baseURL &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname)
  )
    baseURL = undefined;
  if (!baseURL && platformHost)
    baseURL = normalizeOrigin(
      `https://${platformHost}`,
      "Vercel deployment URL",
    );
  if (!baseURL) {
    if (onVercel || env.NODE_ENV === "production")
      throw new Error(
        "Set BETTER_AUTH_URL to the HTTPS website origin in the deployment environment.",
      );
    baseURL = "http://localhost:3000";
  }
  const trustedOrigins = Array.from(
    new Set([
      baseURL,
      ...(onVercel
        ? [platformHost, deployment, env.VERCEL_BRANCH_URL]
            .filter((v): v is string => !!v)
            .map((v) =>
              normalizeOrigin(`https://${v}`, "Vercel deployment URL"),
            )
        : []),
      ...(env.AUTH_TRUSTED_ORIGINS || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => normalizeOrigin(v, "AUTH_TRUSTED_ORIGINS")),
    ]),
  );
  return { baseURL, trustedOrigins, rpID: new URL(baseURL).hostname };
}

export function getAuthURL() {
  return authOriginConfig().baseURL;
}

/** Apple's form-post callback comes from Apple, rather than the app's origin. */
export function authRequestOrigins(
  request?: Pick<Request, "url" | "method">,
  env: AuthEnvironment = process.env,
) {
  const origins = authOriginConfig(env).trustedOrigins;
  if (
    env.APPLE_CLIENT_ID &&
    env.APPLE_CLIENT_SECRET &&
    request?.method === "POST" &&
    new URL(request.url).pathname === "/api/auth/callback/apple"
  )
    origins.push("https://appleid.apple.com");
  return origins;
}
