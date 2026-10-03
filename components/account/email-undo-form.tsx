"use client";
import { useState } from "react";
export function EmailUndoForm({
  token,
  change,
}: {
  token: string;
  change: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section className="settings-card">
      <h2>Undo an email change</h2>
      <p className="account-muted">
        This single-use link restores your previous email and signs out all
        devices. It expires after 24 hours.
      </p>
      <button
        className="account-button danger"
        style={{ marginTop: 24 }}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void fetch("/api/account-email-undo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, change }),
          })
            .then(async (r) => {
              const data = await r.json();
              setMessage(
                r.ok
                  ? "Your previous email is restored. Sign in again to review your account."
                  : data.error,
              );
            })
            .finally(() => setBusy(false));
        }}
      >
        Restore my previous email
      </button>
      {message && (
        <p className="account-notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
