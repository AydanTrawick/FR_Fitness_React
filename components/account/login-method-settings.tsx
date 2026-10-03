"use client";
import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { useAccount, unwrap } from "./settings-context";
import { PasswordInput } from "./password-input";
import { ConfirmDialog } from "./confirm-dialog";
import { api } from "@/lib/client";
import { emailSchema, passwordSchema } from "@/lib/auth/validation";
export function EmailSettings() {
  const { data, working, perform } = useAccount();
  const [email, setEmail] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [step, setStep] = useState<"email" | "current" | "new">("email");
  return (
    <section className="settings-card">
      <h2>Your email address</h2>
      <p className="account-muted">
        You currently sign in with {data!.user.email}. We’ll verify both
        addresses and notify your previous inbox.
      </p>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          void perform(
            async () => {
              if (step === "email") {
                emailSchema.parse(email);
                unwrap(
                  await authClient.emailOtp.sendVerificationOtp({
                    email: data!.user.email,
                    type: "email-verification",
                  }),
                );
                setStep("current");
              } else if (step === "current") {
                unwrap(
                  await authClient.emailOtp.requestEmailChange({
                    newEmail: email,
                    otp: currentCode,
                  }),
                );
                setStep("new");
              } else {
                unwrap(
                  await authClient.emailOtp.changeEmail({
                    newEmail: email,
                    otp: newCode,
                  }),
                );
                setEmail("");
                setStep("email");
              }
            },
            step === "email"
              ? "Check your current inbox for a code."
              : step === "current"
                ? "Check your new inbox for a code."
                : "Email updated. Your previous inbox has been notified.",
          );
        }}
      >
        <label htmlFor="change-email">New email address</label>
        <input
          id="change-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          disabled={step !== "email"}
        />
        {step !== "email" && (
          <>
            <label htmlFor="change-email-code">
              Code from{" "}
              {step === "current" ? "your current inbox" : "your new inbox"}
            </label>
            <input
              id="change-email-code"
              className="otp-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={step === "current" ? currentCode : newCode}
              onChange={(e) =>
                step === "current"
                  ? setCurrentCode(e.target.value)
                  : setNewCode(e.target.value)
              }
              required
            />
          </>
        )}
        <div className="settings-footer">
          <button
            className="account-button primary"
            disabled={
              working || !email || email.toLowerCase() === data!.user.email
            }
          >
            {working
              ? "Please wait…"
              : step === "email"
                ? "Verify current email"
                : step === "current"
                  ? "Verify new email"
                  : "Save email"}
          </button>
        </div>
      </form>
    </section>
  );
}
export function PasswordSettings() {
  const { working, perform } = useAccount();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [revoke, setRevoke] = useState(true);
  useEffect(() => {
    void authClient
      .listAccounts()
      .then((result) =>
        setHasPassword(
          !!unwrap(result)?.some((a) => a.providerId === "credential"),
        ),
      )
      .catch(() => {});
  }, []);
  return (
    <section className="settings-card">
      <h2>{hasPassword ? "Change your password" : "Add a password"}</h2>
      <p className="account-muted">
        {hasPassword
          ? "Use a strong, unique password for your account."
          : "Create a fallback for your social account or passkey. Your password is checked against known breaches."}
      </p>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          void perform(async () => {
            passwordSchema.parse(password);
            if (hasPassword)
              unwrap(
                await authClient.changePassword({
                  currentPassword: current,
                  newPassword: password,
                  revokeOtherSessions: revoke,
                }),
              );
            else await api("account/add-password", { password });
            setCurrent("");
            setPassword("");
            setHasPassword(true);
          }, "Password saved.");
        }}
      >
        {hasPassword && (
          <>
            <label htmlFor="current-password">Current password</label>
            <PasswordInput
              id="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </>
        )}
        <label htmlFor="settings-new-password">New password</label>
        <PasswordInput
          id="settings-new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          strengthMeter
        />
        <label className="account-check">
          <input
            type="checkbox"
            checked={revoke}
            onChange={(e) => setRevoke(e.target.checked)}
          />{" "}
          Sign out other devices
        </label>
        <p className="account-hint">
          Other sessions are always signed out when you reset a forgotten
          password.
        </p>
        <div className="settings-footer">
          <button
            className="account-button primary"
            disabled={
              working ||
              hasPassword === null ||
              !password ||
              (!!hasPassword && !current)
            }
          >
            {working ? "Saving…" : "Save password"}
          </button>
        </div>
      </form>
    </section>
  );
}
export function ConnectedAccountsSettings() {
  const { data, working, perform } = useAccount();
  const [accounts, setAccounts] = useState<
    { id: string; providerId: string }[]
  >([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  async function reload() {
    setAccounts(unwrap(await authClient.listAccounts()) || []);
  }
  useEffect(() => {
    void authClient
      .listAccounts()
      .then((r) => setAccounts(unwrap(r) || []))
      .catch(() => {});
  }, []);
  return (
    <>
      <section className="settings-card">
        <h2>Your connected accounts</h2>
        <p className="account-muted">
          Keep more than one way to sign in. You can’t remove your last sign-in
          method.
        </p>
        {(["apple", "google"] as const).map((provider) => {
          const connected = accounts.some((a) => a.providerId === provider);
          return (
            <div className="method-row" key={provider}>
              <div>
                <strong>{provider === "apple" ? "Apple" : "Google"}</strong>
                <small>
                  {connected
                    ? "Connected"
                    : data!.providers[provider]
                      ? "Not connected"
                      : "Available after provider setup"}
                </small>
              </div>
              <button
                className="btn secondary"
                disabled={working || (!connected && !data!.providers[provider])}
                onClick={() =>
                  connected
                    ? setConfirm(provider)
                    : void perform(async () => {
                        unwrap(
                          await authClient.linkSocial({
                            provider,
                            callbackURL: "/settings/connected-accounts",
                          }),
                        );
                      }, "")
                }
              >
                {connected ? "Disconnect" : "Connect"}
              </button>
            </div>
          );
        })}
      </section>
      {confirm && (
        <ConfirmDialog
          title={
            "Disconnect " + (confirm === "apple" ? "Apple" : "Google") + "?"
          }
          description="You won’t be able to sign in with this provider until you reconnect it. Your training data will stay in your FirstRep account."
          busy={working}
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() =>
            void perform(async () => {
              unwrap(
                await authClient.unlinkAccount({
                  accountId:
                    accounts.find((a) => a.providerId === confirm)?.id || "",
                }),
              );
              setConfirm(null);
              await reload();
            }, "Account disconnected.")
          }
        />
      )}
    </>
  );
}
