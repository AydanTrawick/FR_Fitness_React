"use client";
import { BrandLogo } from "@/components/brand-logo";
import { useState, useEffect } from "react";
import { Fingerprint, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useAccount, unwrap } from "./settings-context";
import { authClient, reloadAccountPage } from "@/lib/auth-client";
import { api } from "@/lib/client";
import { usernameSchema, safeReturnTo } from "@/lib/auth/validation";
export function OnboardingForm({ returnTo }: { returnTo: string }) {
  const { data, working, perform } = useAccount();
  const [step, setStep] = useState("passkey");
  const [username, setUsername] = useState("");
  const [goal, setGoal] = useState("consistency");
  const [unit, setUnit] = useState("kg");
  const [accepted, setAccepted] = useState(false);
  const [availability, setAvailability] = useState("");
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!usernameSchema.safeParse(username).success) {
        setAvailability("Use 3–20 letters, numbers, underscores, or periods.");
        return;
      }
      void api<{ available: boolean }>(
        "account/username-available?username=" + encodeURIComponent(username),
      )
        .then((r) => {
          if (!cancelled)
            setAvailability(
              r.available ? "Available" : "That username is taken.",
            );
        })
        .catch(() => {
          if (!cancelled) setAvailability("Unable to check right now.");
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username]);
  if (!data)
    return (
      <p className="account-notice" role="status">
        Getting your account ready…
      </p>
    );
  const prompt = step === "passkey" && !data.passkeyPrompted;
  return (
    <>
      <Link className="account-brand" href="/auth">
        <span>
          <BrandLogo size={36} />
        </span>
        FirstRep<span className="accent">.</span>
      </Link>
      <p className="account-eyebrow">MAKE IT YOURS / {prompt ? "01" : "02"}</p>
      <h1>{prompt ? "A faster way back." : "Your training, your way."}</h1>
      <p className="account-muted">
        {prompt
          ? "Add a passkey and sign in with your face, fingerprint, or a security key."
          : "A few preferences, then you’re ready for your first rep."}
      </p>
      <div className="onboarding-progress">
        <span className="active" />
        <span className={prompt ? "" : "active"} />
      </div>
      {prompt ? (
        <section className="settings-card">
          <Fingerprint size={42} className="accent" />
          <h2 style={{ marginTop: 18 }}>Add a passkey for faster sign-in?</h2>
          <p className="account-muted">
            Your device keeps the private key. We never see your fingerprint or
            face.
          </p>
          <div className="stack" style={{ marginTop: 24 }}>
            <button
              className="account-button passkey"
              disabled={working}
              onClick={() =>
                void perform(async () => {
                  unwrap(
                    await authClient.passkey.addPasskey({
                      name: "My first passkey",
                    }),
                  );
                  await api("account/passkey-prompt", {});
                  setStep("preferences");
                }, "Passkey added.")
              }
            >
              <Fingerprint size={18} /> Add a passkey
            </button>
            <button
              className="text-link"
              disabled={working}
              onClick={() =>
                void perform(async () => {
                  await api("account/passkey-prompt", {});
                  setStep("preferences");
                }, "")
              }
            >
              Maybe later
            </button>
          </div>
        </section>
      ) : (
        <section className="settings-card">
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await api("account/onboarding", {
                  username: usernameSchema.parse(username),
                  goal,
                  weightUnit: unit,
                  distanceUnit: unit === "lb" ? "mi" : "km",
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  acceptedTerms: accepted,
                });
                reloadAccountPage(safeReturnTo(returnTo));
              }, "");
            }}
          >
            <label htmlFor="onboard-username">Pick your username</label>
            <input
              id="onboard-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              minLength={3}
              maxLength={20}
            />
            <p
              className={
                availability === "Available"
                  ? "account-hint accent"
                  : "field-error"
              }
              aria-live="polite"
            >
              {availability}
            </p>
            <label htmlFor="onboard-goal">What brings you here?</label>
            <select
              id="onboard-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            >
              <option value="consistency">Build a consistent habit</option>
              <option value="strength">Get stronger</option>
              <option value="muscle">Build muscle</option>
              <option value="fitness">Improve everyday fitness</option>
            </select>
            <label htmlFor="onboard-units">Your preferred units</label>
            <select
              id="onboard-units"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="kg">Metric · kg and km</option>
              <option value="lb">Imperial · lb and mi</option>
            </select>
            <label className="account-check terms-check">
              <input
                type="checkbox"
                checked={accepted}
                required
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>
                I agree to the <Link href="/legal/terms">Terms</Link> and{" "}
                <Link href="/legal/privacy">Privacy Policy</Link>.
              </span>
            </label>
            <button
              className="account-button primary"
              disabled={working || availability !== "Available" || !accepted}
            >
              Let’s get started <ArrowRight size={17} />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
