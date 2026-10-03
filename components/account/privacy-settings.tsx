"use client";
import { reloadAccountPage } from "@/lib/auth-client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useAccount } from "./settings-context";
import { ConfirmDialog } from "./confirm-dialog";
import { defaultPreferences, preferencesSchema } from "@/lib/auth/validation";
import type { z } from "zod";
export function Toggle({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="settings-toggle-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={value}
        disabled={disabled}
        className="switch"
        onClick={() => onChange(!value)}
      >
        <span />
      </button>
    </div>
  );
}
export function PreferencesSettings({
  section,
}: {
  section: "privacy" | "notifications";
}) {
  const { data, working, perform } = useAccount();
  const [preferences, setPreferences] = useState<
    z.infer<typeof preferencesSchema>
  >({ ...defaultPreferences, ...data!.preferences });
  const [confirm, setConfirm] = useState<"delete" | "export" | null>(null);
  const [username, setUsername] = useState("");
  const dirty =
    JSON.stringify(preferences) !== JSON.stringify(data!.preferences);
  function toggle(key: keyof typeof preferences, value: boolean) {
    setPreferences((p) => ({ ...p, [key]: value }));
  }
  return (
    <>
      <section className="settings-card">
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              await api("account/preferences", preferences);
              window.dispatchEvent(new Event("firstrep:consent-updated"));
            }, "Preferences saved.");
          }}
        >
          {section === "privacy" ? (
            <>
              <h2>Your data, your choice</h2>
              <label htmlFor="profile-visibility">Profile visibility</label>
              <select
                id="profile-visibility"
                value={preferences.visibility}
                onChange={(e) =>
                  setPreferences((p) => ({
                    ...p,
                    visibility: e.target.value as typeof p.visibility,
                  }))
                }
              >
                <option value="private">Private</option>
                <option value="followers">Followers only</option>
                <option value="public">Public</option>
              </select>
              <p className="account-hint">
                Your health and training records are always private. Visibility
                applies to your profile.
              </p>
              <Toggle
                label="Use my history for AI features"
                description="Allow your saved workouts and meals to be sent to Anthropic for plan building. Voice features send your audio or reply text to ElevenLabs. Requests always show when saved history is included."
                value={preferences.aiDataOptIn}
                onChange={(v) => toggle("aiDataOptIn", v)}
              />
              <Toggle
                label="Product analytics"
                description="Optional usage analytics. We never include workouts, body measurements, passwords, or sign-in codes."
                value={preferences.analyticsOptIn}
                onChange={(v) => toggle("analyticsOptIn", v)}
              />
              <div className="settings-toggle-row">
                <div>
                  <strong>Essential cookies</strong>
                  <p>
                    Required for sign-in, security, and your session
                    preferences.
                  </p>
                </div>
                <span className="security-badge">Always on</span>
              </div>
              <Link className="text-link" href="/legal/privacy">
                Read our Privacy Policy →
              </Link>
            </>
          ) : (
            <>
              <h2>Email notifications</h2>
              <Toggle
                label="Workout reminders"
                description="Reminders to make time for your next rep."
                value={preferences.workoutEmail}
                onChange={(v) => toggle("workoutEmail", v)}
              />
              <Toggle
                label="Plan updates"
                description="Changes and updates to your training plans."
                value={preferences.planEmail}
                onChange={(v) => toggle("planEmail", v)}
              />
              <Toggle
                label="Product news"
                description="FirstRep features and occasional announcements."
                value={preferences.newsEmail}
                onChange={(v) => toggle("newsEmail", v)}
              />
              <h2 style={{ marginTop: 24 }}>Push notifications</h2>
              <p className="account-hint">
                Push delivery is not available yet. You can set your preferences
                now.
              </p>
              <Toggle
                label="Workout push reminders"
                description="Your workout reminder preference."
                value={preferences.workoutPush}
                onChange={(v) => toggle("workoutPush", v)}
              />
              <Toggle
                label="Plan push updates"
                description="Your plan update preference."
                value={preferences.planPush}
                onChange={(v) => toggle("planPush", v)}
              />
              <Toggle
                label="Product push news"
                description="Your product news preference."
                value={preferences.newsPush}
                onChange={(v) => toggle("newsPush", v)}
              />
              <div className="account-notice">
                Security emails are always on: sign-ins, password and email
                changes, passkeys, and two-factor changes.
              </div>
            </>
          )}
          <div className="settings-footer">
            <button
              className="account-button primary"
              disabled={working || !dirty}
            >
              {working ? "Saving…" : "Save preferences"}
            </button>
          </div>
        </form>
      </section>
      {section === "privacy" && (
        <>
          <section className="settings-card">
            <h2>Download your data</h2>
            <p className="account-muted">
              Get a ZIP with your profile, workouts, saved plans and all stored
              logs in JSON and CSV. We’ll email a sign-in-protected link valid
              for 24 hours.
            </p>
            <button
              className="account-button secondary fit"
              style={{ marginTop: 18 }}
              disabled={working}
              onClick={() => setConfirm("export")}
            >
              Request data export
            </button>
            {data!.exports.map((item) => (
              <div className="method-row" key={item.id}>
                <div>
                  <strong>
                    {item.status === "ready"
                      ? "Export ready"
                      : item.status === "failed"
                        ? "Export needs a retry"
                        : "Preparing your export"}
                  </strong>
                  <small>{new Date(item.created_at).toLocaleString()}</small>
                </div>
                {item.status === "ready" &&
                  item.expires_at &&
                  new Date(item.expires_at) > new Date() && (
                    <a
                      className="text-link"
                      href={"/api/account/export/" + item.id}
                    >
                      Download ZIP
                    </a>
                  )}
              </div>
            ))}
          </section>
          <section className="settings-card">
            <h2>Delete your account</h2>
            <p className="account-muted">
              Your account is hidden and signed out everywhere immediately.
              After 30 days, your profile, files, and all fitness records are
              permanently deleted. Sign in during those 30 days to restore it.
            </p>
            <button
              className="account-button danger fit"
              style={{ marginTop: 18 }}
              disabled={working}
              onClick={() => setConfirm("delete")}
            >
              Delete my account
            </button>
          </section>
        </>
      )}
      {confirm && (
        <ConfirmDialog
          title={
            confirm === "delete"
              ? "Delete your FirstRep account?"
              : "Request a copy of your data?"
          }
          description={
            confirm === "delete"
              ? "Your account will be hidden now. All your records will be permanently deleted after 30 days unless you restore it."
              : "We’ll prepare your stored data and email a download link. The link expires after 24 hours."
          }
          danger={confirm === "delete"}
          disabled={confirm === "delete" && username !== data!.user.username}
          busy={working}
          confirmLabel={
            confirm === "delete" ? "Delete my account" : "Request export"
          }
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === "delete" && username !== data!.user.username)
              return;
            void perform(
              async () => {
                await api(
                  "account/" + confirm,
                  confirm === "delete" ? { username } : {},
                );
                setConfirm(null);
                if (confirm === "delete") reloadAccountPage("/auth?deleted=1");
              },
              confirm === "delete"
                ? ""
                : "Your export is queued. Check your inbox shortly.",
            );
          }}
        >
          {confirm === "delete" && (
            <div className="account-form">
              <label htmlFor="delete-username">
                Type {data!.user.username} to confirm
              </label>
              <input
                id="delete-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
