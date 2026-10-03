"use client";
import { useState, useEffect } from "react";
import { usernameSchema } from "@/lib/auth/validation";
import { useAccount } from "./settings-context";
import { api } from "@/lib/client";
export function UsernameSettings() {
  const { data, working, perform } = useAccount();
  const [name, setName] = useState(data!.user.username || "");
  const [state, setState] = useState("");
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const result = usernameSchema.safeParse(name);
      if (!result.success) {
        setState(result.error.issues[0].message);
        return;
      }
      void api<{ available: boolean }>(
        "account/username-available?username=" + encodeURIComponent(name),
      )
        .then((r) => {
          if (!cancelled)
            setState(r.available ? "Available" : "That username is taken.");
        })
        .catch(() => {
          if (!cancelled) setState("Unable to check availability.");
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name]);
  return (
    <section className="settings-card">
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          void perform(
            () =>
              api("account/username", { username: usernameSchema.parse(name) }),
            "Username updated.",
          );
        }}
      >
        <label htmlFor="account-username">Username</label>
        <input
          id="account-username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={3}
          maxLength={20}
          autoComplete="username"
          spellCheck={false}
          required
          aria-describedby="username-status"
        />
        <p
          id="username-status"
          className={
            state === "Available" ? "account-hint accent" : "field-error"
          }
          aria-live="polite"
        >
          {state}
        </p>
        <p className="account-hint">
          3–20 characters: letters, numbers, underscores, and periods. Usernames
          are case-insensitive. You can change yours once every 30 days; your
          previous handle stays reserved for 14 days.
        </p>
        {data!.user.usernameChangedAt && (
          <p className="account-hint">
            Last changed{" "}
            {new Date(data!.user.usernameChangedAt).toLocaleDateString()}.
          </p>
        )}
        <div className="settings-footer">
          <button
            className="account-button primary"
            disabled={
              working ||
              name.toLowerCase() === data!.user.username ||
              state !== "Available"
            }
          >
            {working ? "Saving…" : "Save username"}
          </button>
        </div>
      </form>
    </section>
  );
}
