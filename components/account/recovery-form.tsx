"use client";
import { useState } from "react";
import { authRequest } from "./auth-screen";
import { api } from "@/lib/client";
export function RecoveryForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [action, setAction] = useState("start");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card" id="two-factor-recovery">
      <h2>Lost your authenticator and backup codes?</h2>
      <p className="account-muted">
        Verify your inbox to start a 24-hour waiting period. After the wait, use
        a fresh code to finish recovery. You can also cancel a request from this
        form.
      </p>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const result = await api<{ message: string }>(
              "recovery/" + action,
              { email, otp: code },
            );
            setMessage(result.message);
            setCode("");
          });
        }}
      >
        <label htmlFor="recovery-email">Account email</label>
        <input
          id="recovery-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button
          type="button"
          className="account-button secondary"
          disabled={busy || !email}
          onClick={() =>
            void run(async () => {
              await authRequest("email-otp/send-verification-otp", {
                email,
                type: "sign-in",
              });
              setMessage("If an account exists, we sent a code.");
            })
          }
        >
          Send email verification code
        </button>
        <label htmlFor="recovery-action">What would you like to do?</label>
        <select
          id="recovery-action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="start">Start recovery (24-hour wait)</option>
          <option value="finish">Finish recovery after the wait</option>
          <option value="cancel">Cancel a recovery request</option>
        </select>
        <label htmlFor="recovery-code">Six-digit email code</label>
        <input
          id="recovery-code"
          className="otp-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]{6}"
          required
        />
        <button
          className="account-button primary"
          disabled={busy || code.length !== 6}
        >
          {busy ? "Verifying…" : "Verify and continue"}
        </button>
      </form>
      {message && (
        <p className="account-notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
