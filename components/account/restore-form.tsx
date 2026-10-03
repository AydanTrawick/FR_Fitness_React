"use client";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/lib/client";
import { authClient, reloadAccountPage } from "@/lib/auth-client";
export function RestoreForm({ deletedAt }: { deletedAt: string }) {
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function restore() {
    setBusy(true);
    try {
      await api("account/restore", {});
      reloadAccountPage("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to restore right now.");
      setBusy(false);
    }
  }
  return (
    <section className="settings-card">
      <h2>Your account is scheduled for deletion.</h2>
      <p className="account-muted">
        Your data is hidden. You can restore your account until{" "}
        {new Date(
          new Date(deletedAt).getTime() + 30 * 86400000,
        ).toLocaleDateString()}
        . After that, all records are permanently deleted.
      </p>
      <div className="stack" style={{ marginTop: 24 }}>
        <button
          className="account-button primary"
          disabled={busy || !hydrated}
          onClick={() => void restore()}
        >
          Restore my account
        </button>
        <button
          className="account-button secondary"
          disabled={busy || !hydrated}
          onClick={() =>
            void authClient.signOut().then(() => reloadAccountPage("/auth"))
          }
        >
          Keep account scheduled for deletion
        </button>
      </div>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
