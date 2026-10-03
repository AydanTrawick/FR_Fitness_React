import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  emailOTP,
  twoFactor,
  username,
  haveIBeenPwned,
  captcha,
} from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import {
  createAuthMiddleware,
  APIError,
  getSessionFromCtx,
} from "better-auth/api";
import { db } from "./database";
import * as schema from "./auth-schema";
import { background, emailUndo } from "./auth/security-events";
import { accountMail } from "./auth/mail";
import { sharedRateStorage } from "./auth/rate-storage";
import {
  blockedUsernames,
  usernameSchema,
  profileSchema,
  TERMS_VERSION,
} from "./auth/validation";

const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3000";
const factor = twoFactor({
  issuer: "FirstRep Fitness",
  allowPasswordless: true,
  trustDeviceMaxAge: 30 * 86400,
  backupCodeOptions: { amount: 10, storeBackupCodes: "encrypted" },
});
// Reuse Better Auth's challenge machinery for passwordless email sign-in, too.
const factorMatcher = factor.hooks.after[0].matcher;
factor.hooks.after[0].matcher = (ctx) =>
  factorMatcher(ctx) ||
  ctx.path === "/sign-in/email-otp" ||
  !!ctx.path?.startsWith("/callback");
const sensitivePaths = [
  "/change-password",
  "/set-password",
  "/change-email",
  "/email-otp/request-email-change",
  "/email-otp/change-email",
  "/two-factor/get-totp-uri",
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/generate-backup-codes",
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/delete-passkey",
  "/passkey/update-passkey",
  "/link-social",
  "/unlink-account",
];

const securityEvents = {
  id: "firstrep-security-events",
  hooks: {
    after: [
      {
        matcher: () => true,
        handler: createAuthMiddleware(async (ctx) => {
          if (
            ctx.path.startsWith("/callback") &&
            ctx.context.returned &&
            typeof ctx.context.returned === "object" &&
            "twoFactorRedirect" in ctx.context.returned
          )
            throw ctx.redirect(baseURL + "/auth?step=two-factor");
          const session = ctx.context.newSession || ctx.context.session;
          if (!session || ctx.context.returned instanceof APIError) return;
          if (
            [
              "/sign-up/email",
              "/sign-in/email",
              "/sign-in/email-otp",
              "/two-factor/verify-totp",
              "/two-factor/verify-backup-code",
              "/passkey/verify-authentication",
              "/callback/:id",
            ].includes(ctx.path) &&
            ctx.context.newSession
          ) {
            const known =
              await db()`SELECT id FROM firstrep_audit_log WHERE user_id=${session.user.id} AND event='sign-in' AND user_agent=${session.session.userAgent || ""} LIMIT 1`;
            await db()`INSERT INTO firstrep_audit_log(user_id,event,ip,user_agent) VALUES (${session.user.id},'sign-in',${session.session.ipAddress || ""},${session.session.userAgent || ""})`;
            if (!known.length && !session.user.deletedAt)
              background(
                accountMail(
                  session.user.email,
                  "A new device signed in to FirstRep",
                  "If this was you, you’re all set. Otherwise, review and revoke your active sessions.",
                  { url: baseURL + "/settings/sessions" },
                ),
              );
          }
          if (
            sensitivePaths.includes(ctx.path) &&
            !(ctx.context.returned instanceof APIError)
          ) {
            await db()`INSERT INTO firstrep_audit_log(user_id,event,ip,user_agent) VALUES (${session.user.id},${ctx.path.slice(1)},${session.session.ipAddress || ""},${session.session.userAgent || ""})`;
            if (
              !session.user.deletedAt &&
              [
                "/change-password",
                "/two-factor/get-totp-uri",
                "/two-factor/enable",
                "/two-factor/disable",
                "/passkey/verify-registration",
              ].includes(ctx.path)
            )
              background(
                accountMail(
                  session.user.email,
                  "Your FirstRep security settings changed",
                  "A password, authenticator, or passkey change was made. If this wasn’t you, review your account immediately.",
                  { url: baseURL + "/settings/security" },
                ),
              );
            if (
              ctx.path === "/email-otp/change-email" &&
              ctx.body?.newEmail &&
              ctx.headers
            )
              background(
                emailUndo(
                  session.user.id,
                  ctx.context.session?.user.email || session.user.email,
                  ctx.body.newEmail.toLowerCase(),
                ),
              );
          }
        }),
      },
    ],
  },
};

export const auth = betterAuth({
  appName: "FirstRep Fitness",
  baseURL,
  logger: { disabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(drizzle(db(), { schema }), { provider: "pg" }),
  trustedOrigins: [
    baseURL,
    ...(process.env.AUTH_TRUSTED_ORIGINS?.split(",")
      .map((v) => v.trim())
      .filter(Boolean) || []),
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 1800,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      accountMail(
        user.email,
        "Reset your FirstRep password",
        "This single-use link expires in 30 minutes.",
        { url },
      ),
    onPasswordReset: async ({ user }) =>
      accountMail(
        user.email,
        "Your FirstRep password was changed",
        "All other sessions have been signed out. If this wasn’t you, open sign-in help immediately.",
        { url: baseURL + "/auth/help" },
      ),
  },
  emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: true },
  session: {
    expiresIn: 30 * 86400,
    updateAge: 86400,
    freshAge: 600,
    cookieCache: { enabled: false },
    additionalFields: {
      shortSession: { type: "boolean", defaultValue: false, input: false },
    },
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      allowDifferentEmails: false,
      allowUnlinkingAll: true,
    },
  },
  user: {
    additionalFields: {
      bio: { type: "string", defaultValue: "", required: false },
      weightUnit: { type: "string", defaultValue: "kg" },
      distanceUnit: { type: "string", defaultValue: "km" },
      timezone: { type: "string", defaultValue: "America/New_York" },
      goal: { type: "string", defaultValue: "consistency" },
      onboarded: { type: "boolean", defaultValue: false, input: false },
      deletedAt: { type: "date", required: false, input: false },
      usernameChangedAt: { type: "date", required: false, input: false },
      termsVersionAccepted: { type: "string", required: false, input: false },
      termsAcceptedAt: { type: "date", required: false, input: false },
    },
    deleteUser: { enabled: false },
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? {
          apple: {
            clientId: process.env.APPLE_CLIENT_ID,
            clientSecret: process.env.APPLE_CLIENT_SECRET,
            appBundleIdentifier: process.env.APPLE_BUNDLE_ID,
          },
        }
      : {}),
  },
  advanced: {
    backgroundTasks: { handler: background },
    cookiePrefix: "firstrep",
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },
  verification: { storeIdentifier: "hashed" },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customStorage: sharedRateStorage,
    customRules: {
      "/sign-in/*": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 3600, max: 3 },
      "/email-otp/send-verification-otp": { window: 3600, max: 3 },
      "/email-otp/request-password-reset": { window: 3600, max: 3 },
      "/two-factor/*": { window: 60, max: 5 },
    },
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 20,
      usernameValidator: async (v) =>
        usernameSchema.safeParse(v).success &&
        !blockedUsernames.has(v.toLowerCase()) &&
        !(
          await db()`SELECT username FROM firstrep_reserved_username WHERE username=${v.toLowerCase()} AND release_at>NOW()`
        ).length,
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: "hashed",
      disableSignUp: true,
      overrideDefaultEmailVerification: true,
      changeEmail: { enabled: true, verifyCurrentEmail: true },
      async sendVerificationOTP({ email, otp }) {
        await accountMail(
          email,
          "Your FirstRep verification code",
          "Use this code within 10 minutes. It can only be used once.",
          { code: otp },
        );
      },
    }),
    factor,
    passkey({
      rpName: "FirstRep Fitness",
      rpID: new URL(baseURL).hostname,
      origin: baseURL,
    }),
    haveIBeenPwned(),
    ...(process.env.TURNSTILE_SECRET_KEY
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: process.env.TURNSTILE_SECRET_KEY,
            allowedHostnames: [new URL(baseURL).hostname],
            endpoints: [
              "/sign-up/email",
              "/request-password-reset",
              "/email-otp/request-password-reset",
            ],
          }),
        ]
      : []),
    securityEvents,
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email" && ctx.body?.acceptedTerms !== true)
        throw new APIError("BAD_REQUEST", {
          message: "Accept the Terms and Privacy Policy to continue.",
        });
      if (sensitivePaths.includes(ctx.path) || ctx.path === "/update-user") {
        // Signed cookies are validated by Better Auth; use its session endpoint rather than trusting their content.
        const verified = await getSessionFromCtx(ctx);
        if (verified?.user.deletedAt)
          throw new APIError("FORBIDDEN", {
            message: "Restore your account before making changes.",
          });
        if (!verified)
          throw new APIError("UNAUTHORIZED", {
            message: "Sign in to continue.",
          });
        if (
          sensitivePaths.includes(ctx.path) &&
          Date.now() - new Date(verified.session.createdAt).getTime() > 600000
        )
          throw new APIError("FORBIDDEN", {
            code: "STEP_UP_REQUIRED",
            message:
              "Confirm it’s you by signing in again before changing security settings.",
          });
      }
      if (ctx.path === "/update-user") {
        const valid = profileSchema.partial().safeParse(ctx.body);
        if (!valid.success)
          throw new APIError("BAD_REQUEST", {
            message: valid.error.issues[0].message,
          });
      }
      if (
        ctx.path === "/unlink-account" ||
        ctx.path === "/passkey/delete-passkey"
      ) {
        const session = await getSessionFromCtx(ctx);
        if (!session)
          throw new APIError("UNAUTHORIZED", {
            message: "Sign in to continue.",
          });
        const accounts =
          await db()`SELECT provider_id FROM account WHERE user_id=${session.user.id}`;
        const keys =
          await db()`SELECT id FROM passkey WHERE user_id=${session.user.id}`;
        if (accounts.length + keys.length <= 1)
          throw new APIError("BAD_REQUEST", {
            message:
              "Add another sign-in method before removing your last one.",
          });
      }
      if (
        ctx.path === "/update-user" &&
        (ctx.body?.username !== undefined ||
          ctx.body?.displayUsername !== undefined)
      )
        throw new APIError("BAD_REQUEST", {
          message: "Change your username from Username settings.",
        });
      if (
        ctx.path === "/reset-password" ||
        ctx.path === "/email-otp/reset-password"
      ) {
        // Recovery for 2FA accounts must complete the library's second-factor sign-in first.
        const token = ctx.body?.token;
        const verification = token
          ? await ctx.context.internalAdapter.findVerificationValue(
              "reset-password:" + token,
            )
          : null;
        const user = verification
          ? await ctx.context.internalAdapter.findUserById(verification.value)
          : ctx.body?.email
            ? (
                await ctx.context.internalAdapter.findUserByEmail(
                  ctx.body.email,
                )
              )?.user
            : null;
        if (user && "twoFactorEnabled" in user && user.twoFactorEnabled) {
          const session = await getSessionFromCtx(ctx);
          if (
            !session ||
            session.user.id !== user.id ||
            Date.now() - new Date(session.session.createdAt).getTime() > 600000
          )
            throw new APIError("FORBIDDEN", {
              message:
                "Sign in with an authenticator or backup code before resetting your password.",
            });
        }
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => ({
          data: {
            ...user,
            ...(ctx?.path === "/sign-up/email" &&
            ctx.body?.acceptedTerms === true
              ? {
                  termsVersionAccepted: TERMS_VERSION,
                  termsAcceptedAt: new Date(),
                }
              : {}),
          },
        }),
        after: async (user) => {
          await db()`INSERT INTO firstrep_users(id,email,display_name,password_hash,password_salt,role) VALUES (${user.id},${user.email},${user.name},'', '','customer') ON CONFLICT(id) DO NOTHING`;
          await db()`INSERT INTO firstrep_user_settings(user_id) VALUES (${user.id}) ON CONFLICT DO NOTHING`;
        },
      },
      update: {
        after: async (user) => {
          await db()`UPDATE firstrep_users SET email=${user.email},display_name=${user.name} WHERE id=${user.id}`;
        },
      },
    },
    session: {
      create: {
        before: async (session, ctx) =>
          ctx?.body?.rememberMe === false ||
          new Date(session.expiresAt).getTime() -
            new Date(session.createdAt).getTime() <=
            86401000
            ? {
                data: {
                  ...session,
                  shortSession: true,
                  expiresAt: new Date(Date.now() + 86400000),
                },
              }
            : { data: session },
      },
      update: {
        before: async (session) => {
          if (!session.id) return;
          const rows =
            await db()`SELECT short_session,created_at FROM "session" WHERE id=${session.id}`;
          return rows[0]?.short_session
            ? {
                data: {
                  ...session,
                  expiresAt: new Date(
                    new Date(rows[0].created_at).getTime() + 86400000,
                  ),
                },
              }
            : undefined;
        },
      },
    },
  },
});
