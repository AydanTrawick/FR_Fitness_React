"use client";
import { BrandLogo } from "@/components/brand-logo";
import { useState, useEffect, useCallback, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Fingerprint,
  ShieldCheck,
  Mail,
  KeyRound,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient, reloadAccountPage } from "@/lib/auth-client";
import {
  emailSchema,
  passwordSchema,
  signUpSchema,
  safeReturnTo,
} from "@/lib/auth/validation";
import { PasswordInput } from "./password-input";
import { Turnstile } from "./turnstile";

export async function authRequest(path: string, body: unknown) {
  const res = await fetch("/api/auth/" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...((body as { captchaToken?: string })?.captchaToken
        ? {
            "x-captcha-response": String(
              (body as { captchaToken: string }).captchaToken,
            ),
          }
        : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.message || "Unable to continue. Please try again.");
  return data;
}
export function AuthScreen({
  providers,
  nonce,
  siteKey,
  initialStep = "email",
  returnTo = "/",
  resetToken,
}: {
  providers: { google: boolean; apple: boolean };
  nonce: string;
  siteKey?: string;
  initialStep?: string;
  returnTo?: string;
  resetToken?: string;
}) {
  const [step, setStep] = useState(initialStep);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [remember, setRemember] = useState(true);
  const [trust, setTrust] = useState(false);
  const [backup, setBackup] = useState(false);
  const [supported, setSupported] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [codeType, setCodeType] = useState<"sign-in" | "email-verification">(
    "sign-in",
  );
  const signup = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const captureToken = useCallback((value: string) => setCaptcha(value), []);
  const complete = useCallback(async () => {
    const result = await authClient.getSession();
    if (!result.data) return;
    reloadAccountPage(
      result.data.user.deletedAt
        ? "/auth/restore"
        : !result.data.user.onboarded
          ? "/onboarding?returnTo=" + encodeURIComponent(safeReturnTo(returnTo))
          : safeReturnTo(returnTo),
    );
  }, [returnTo]);
  useEffect(() => {
    if (!window.PublicKeyCredential) return;
    Promise.resolve().then(() => setSupported(true));
    void PublicKeyCredential.isConditionalMediationAvailable?.()
      .then(async (available) => {
        if (!available || initialStep !== "email") return;
        const result = await authClient.signIn.passkey({ autoFill: true });
        if (result.data) await complete();
      })
      .catch(() => {});
  }, [complete, initialStep]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function go(next: string) {
    setStep(next);
    setError("");
    setNotice("");
    setCaptcha("");
  }
  async function sendCode(type: "sign-in" | "email-verification") {
    emailSchema.parse(email);
    await authRequest("email-otp/send-verification-otp", { email, type });
    setCodeType(type);
    setStep("code");
    setNotice("If an account exists, we sent a code. Check your inbox.");
  }
  async function social(provider: "google" | "apple") {
    await run(async () => {
      const result = await authClient.signIn.social({
        provider,
        callbackURL:
          "/onboarding?returnTo=" + encodeURIComponent(safeReturnTo(returnTo)),
      });
      if (result.error) throw new Error(result.error.message);
    });
  }
  const emailForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      emailSchema.parse(email);
      setStep("password");
    });
  };
  const titles: Record<string, string> = {
    email: "Continue to FirstRep.",
    password: "Welcome back.",
    register: "Your first rep starts here.",
    code: "Check your inbox.",
    reset: "Let’s get you back in.",
    "new-password": "A fresh start.",
    "two-factor": "One more security check.",
  };
  return (
    <main className="auth-page">
      <aside className="auth-story">
        <Link href="/auth" className="account-brand">
          <span>
            <BrandLogo size={36} />
          </span>
          FirstRep<span className="accent">.</span>
        </Link>
        <div className="auth-story-copy">
          <p className="account-eyebrow">EVERY REP COUNTER STARTS AT ONE</p>
          <h1>
            Your next
            <br />
            chapter.
            <br />
            <em>Starts here.</em>
          </h1>
          <p>
            One place for your training, nutrition,
            <br />
            and the progress that makes it yours.
          </p>
          <div className="auth-story-dial" aria-hidden="true">
            <span>1</span>
            {Array.from({ length: 12 }, (_, i) => (
              <i
                key={i}
                style={{ transform: `rotate(${i * 30}deg) translateY(-94px)` }}
              />
            ))}
          </div>
        </div>
        <p className="auth-story-footer">
          <ShieldCheck size={16} /> Your progress is personal. Keep it that way.
        </p>
      </aside>
      <section className="auth-form-side">
        <Link href="/auth" className="account-brand auth-mobile-brand">
          FirstRep<span className="accent">.</span>
        </Link>
        <div className="auth-form-card">
          <div className="auth-kicker">
            <span className="dot" /> A LITTLE STRONGER, EVERY DAY
          </div>
          {step !== "email" && (
            <button className="account-back" onClick={() => go("email")}>
              <ArrowLeft size={16} /> Back to sign-in
            </button>
          )}
          <h2>{titles[step] || titles.email}</h2>
          <p className="account-muted">
            {step === "email"
              ? "Your training. Your pace. Your account."
              : step === "code"
                ? `Enter the 6-digit code for ${email}.`
                : step === "two-factor"
                  ? "Use your authenticator app or a single-use backup code."
                  : "Make room for your next chapter."}
          </p>
          {step === "email" && (
            <>
              <div className="social-buttons">
                <button
                  className="account-button social"
                  disabled={busy || !providers.apple}
                  onClick={() => void social("apple")}
                >
                  <span aria-hidden="true">●</span> Continue with Apple
                  {!providers.apple && <small>Coming soon</small>}
                </button>
                <button
                  className="account-button social"
                  disabled={busy || !providers.google}
                  onClick={() => void social("google")}
                >
                  <span className="google-symbol" aria-hidden="true">
                    G
                  </span>{" "}
                  Continue with Google
                  {!providers.google && <small>Coming soon</small>}
                </button>
                {supported && (
                  <button
                    className="account-button passkey"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await authClient.signIn.passkey();
                        if (result.error) throw new Error(result.error.message);
                        await complete();
                      })
                    }
                  >
                    <Fingerprint size={19} /> Sign in with a passkey
                  </button>
                )}
              </div>
              <div className="auth-divider">
                <span>or continue with email</span>
              </div>
              <form onSubmit={emailForm} className="account-form">
                <label htmlFor="entry-email">Email address</label>
                <input
                  id="entry-email"
                  type="email"
                  required
                  autoComplete="username webauthn"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button className="account-button primary" disabled={busy}>
                  Continue <ArrowRight size={17} />
                </button>
              </form>
              <p className="auth-legal">
                By continuing, you’ll be asked to accept our{" "}
                <Link href="/legal/terms">Terms</Link> and{" "}
                <Link href="/legal/privacy">Privacy Policy</Link> before using
                your account.
              </p>
            </>
          )}
          {step === "password" && (
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                const password = String(
                  new FormData(e.currentTarget).get("password"),
                );
                void run(async () => {
                  passwordSchema.parse(password);
                  const result = await authClient.signIn.email({
                    email,
                    password,
                    rememberMe: remember,
                  });
                  if (result.error) {
                    if (result.error.code === "EMAIL_NOT_VERIFIED") {
                      await sendCode("email-verification");
                      return;
                    }
                    throw new Error(
                      "Email or password is incorrect. You can also use an email code.",
                    );
                  }
                  await complete();
                });
              }}
            >
              <label htmlFor="signin-email">Email address</label>
              <input
                id="signin-email"
                type="email"
                value={email}
                autoComplete="username webauthn"
                onChange={(e) => setEmail(e.target.value)}
              />
              <label htmlFor="signin-password">Password</label>
              <PasswordInput
                id="signin-password"
                name="password"
                required
                autoComplete="current-password"
                maxLength={128}
              />
              <div className="row between">
                <label className="account-check">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />{" "}
                  Remember me
                </label>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => go("reset")}
                >
                  Forgot password?
                </button>
              </div>
              <button className="account-button primary" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"} <ArrowRight size={17} />
              </button>
              <button
                className="account-button secondary"
                type="button"
                disabled={busy}
                onClick={() => void run(() => sendCode("sign-in"))}
              >
                <Mail size={17} /> Email me a sign-in code
              </button>
              <p className="auth-switch">
                New here?{" "}
                <button
                  type="button"
                  onClick={() => {
                    signup.setValue("email", email);
                    go("register");
                  }}
                >
                  Create an account
                </button>
              </p>
            </form>
          )}
          {step === "register" && (
            <form
              className="account-form"
              onSubmit={signup.handleSubmit(
                (values) =>
                  void run(async () => {
                    if (siteKey && !captcha)
                      throw new Error("Complete the security check first.");
                    await authRequest("sign-up/email", {
                      ...values,
                      ...(captcha ? { captchaToken: captcha } : {}),
                      fetchOptions: undefined,
                    });
                    setEmail(values.email);
                    setCodeType("email-verification");
                    setStep("code");
                    setNotice(
                      "If this email can be used, a verification code is on its way.",
                    );
                  }),
              )}
            >
              <label htmlFor="signup-name">Display name</label>
              <input
                id="signup-name"
                autoComplete="name"
                {...signup.register("name")}
              />
              {signup.formState.errors.name && (
                <p className="field-error">
                  {signup.formState.errors.name.message}
                </p>
              )}
              <label htmlFor="signup-email">Email address</label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                {...signup.register("email")}
              />
              {signup.formState.errors.email && (
                <p className="field-error">
                  {signup.formState.errors.email.message}
                </p>
              )}
              <label htmlFor="signup-password">Password</label>
              <PasswordInput
                id="signup-password"
                strengthMeter
                autoComplete="new-password"
                {...signup.register("password")}
              />
              {signup.formState.errors.password && (
                <p className="field-error">
                  {signup.formState.errors.password.message}
                </p>
              )}
              <label className="account-check terms-check">
                <input type="checkbox" {...signup.register("acceptedTerms")} />{" "}
                <span>
                  I agree to the <Link href="/legal/terms">Terms</Link> and{" "}
                  <Link href="/legal/privacy">Privacy Policy</Link>.
                </span>
              </label>
              {signup.formState.errors.acceptedTerms && (
                <p className="field-error">
                  {signup.formState.errors.acceptedTerms.message}
                </p>
              )}
              <Turnstile
                key="signup"
                nonce={nonce}
                siteKey={siteKey}
                onToken={captureToken}
              />
              <button className="account-button primary" disabled={busy}>
                {busy ? "Creating your account…" : "Create account"}{" "}
                <ArrowRight size={17} />
              </button>
              <p className="account-hint">
                At least 8 characters. No symbol gymnastics required.
              </p>
            </form>
          )}
          {step === "code" && (
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                const otp = String(new FormData(e.currentTarget).get("otp"));
                void run(async () => {
                  const result = await authRequest(
                    codeType === "email-verification"
                      ? "email-otp/verify-email"
                      : "sign-in/email-otp",
                    { email, otp },
                  );
                  if (result.twoFactorRedirect) {
                    setStep("two-factor");
                    return;
                  }
                  await complete();
                });
              }}
            >
              <label htmlFor="email-code">Verification code</label>
              <input
                id="email-code"
                className="otp-input"
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                placeholder="000000"
              />
              <button className="account-button primary" disabled={busy}>
                {busy ? "Checking code…" : "Continue securely"}{" "}
                <ArrowRight size={17} />
              </button>
              <button
                className="text-link"
                type="button"
                disabled={busy}
                onClick={() => void run(() => sendCode(codeType))}
              >
                Send a fresh code
              </button>
              <p className="account-hint">
                Your code expires after 10 minutes.
              </p>
            </form>
          )}
          {step === "reset" && (
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  emailSchema.parse(email);
                  if (siteKey && !captcha)
                    throw new Error("Complete the security check first.");
                  await authRequest("request-password-reset", {
                    email,
                    redirectTo: "/auth?step=new-password",
                    captchaToken: captcha,
                  });
                  setNotice(
                    "If an account exists, we sent a code. Check your inbox for a recovery link.",
                  );
                });
              }}
            >
              <label htmlFor="reset-email">Email address</label>
              <input
                id="reset-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Turnstile
                key="reset"
                nonce={nonce}
                siteKey={siteKey}
                onToken={captureToken}
              />
              <button className="account-button primary" disabled={busy}>
                {busy ? "Requesting recovery…" : "Send recovery link"}
              </button>
              <Link className="text-link" href="/auth/help">
                I can’t sign in
              </Link>
            </form>
          )}
          {step === "new-password" && (
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                const password = String(
                  new FormData(e.currentTarget).get("password"),
                );
                void run(async () => {
                  passwordSchema.parse(password);
                  await authRequest("reset-password", {
                    token: resetToken,
                    newPassword: password,
                  });
                  setStep("email");
                  setNotice(
                    "Your password was changed. Sign in with your new password.",
                  );
                });
              }}
            >
              <label htmlFor="new-password">New password</label>
              <PasswordInput
                id="new-password"
                name="password"
                required
                minLength={8}
                maxLength={128}
                strengthMeter
                autoComplete="new-password"
              />
              <button
                className="account-button primary"
                disabled={busy || !resetToken}
              >
                Save new password
              </button>
              <p className="account-hint">
                If you use two-factor authentication, sign in with an email code
                and your authenticator or backup code before using the recovery
                link.
              </p>
            </form>
          )}
          {step === "two-factor" && (
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                const code = String(new FormData(e.currentTarget).get("code"));
                void run(async () => {
                  const result = backup
                    ? await authClient.twoFactor.verifyBackupCode({
                        code,
                        trustDevice: trust,
                      })
                    : await authClient.twoFactor.verifyTotp({
                        code,
                        trustDevice: trust,
                      });
                  if (result.error) throw new Error(result.error.message);
                  await complete();
                });
              }}
            >
              <label htmlFor="two-factor-code">
                {backup ? "Backup code" : "Authenticator code"}
              </label>
              <input
                id="two-factor-code"
                className="otp-input"
                name="code"
                required
                autoComplete="one-time-code"
                inputMode={backup ? "text" : "numeric"}
                maxLength={backup ? 30 : 6}
              />
              <label className="account-check">
                <input
                  type="checkbox"
                  checked={trust}
                  onChange={(e) => setTrust(e.target.checked)}
                />{" "}
                Trust this device for 30 days
              </label>
              <button className="account-button primary" disabled={busy}>
                {busy ? "Verifying…" : "Verify and sign in"}{" "}
                <ShieldCheck size={17} />
              </button>
              <button
                className="text-link"
                type="button"
                onClick={() => setBackup(!backup)}
              >
                {backup ? "Use an authenticator code" : "Use a backup code"}
              </button>
              <Link className="text-link" href="/auth/help">
                Lost your authenticator and backup codes?
              </Link>
            </form>
          )}
          {notice && (
            <p className="account-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="account-error" role="alert">
              {error}
            </p>
          )}
          <div className="auth-help-footer">
            <KeyRound size={14} />
            <Link href="/auth/help">Need a hand signing in?</Link>
            <span>·</span>
            <Link href="/legal/privacy">Privacy</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
