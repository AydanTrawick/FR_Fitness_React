"use client";
import { useState, useEffect } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useAccount, unwrap } from "./settings-context";
import { ConfirmDialog } from "./confirm-dialog";
type Device = {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string;
};
export function SessionSettings() {
  const { working, perform } = useAccount();
  const [sessions, setSessions] = useState<Device[]>([]);
  const [current, setCurrent] = useState("");
  const [confirm, setConfirm] = useState<Device | "others" | null>(null);
  async function reload() {
    const [list, me] = await Promise.all([
      authClient.listSessions(),
      authClient.getSession(),
    ]);
    setSessions(unwrap(list) || []);
    setCurrent(unwrap(me)?.session.id || "");
  }
  useEffect(() => {
    void Promise.all([authClient.listSessions(), authClient.getSession()])
      .then(([list, me]) => {
        setSessions(unwrap(list) || []);
        setCurrent(unwrap(me)?.session.id || "");
      })
      .catch(() => {});
  }, []);
  return (
    <>
      <section className="settings-card">
        <div className="row between wrap">
          <h2>Where you’re signed in</h2>
          <button
            className="btn secondary"
            disabled={
              working || sessions.filter((s) => s.id !== current).length === 0
            }
            onClick={() => setConfirm("others")}
          >
            Sign out all other devices
          </button>
        </div>
        <p className="account-muted">
          Revoking a session signs out that device on its next request.
        </p>
        {sessions.map((device) => {
          const mobile = /Android|iPhone|iPad/i.test(device.userAgent || "");
          const browser = /Edg\//.test(device.userAgent || "")
            ? "Edge"
            : /Firefox/.test(device.userAgent || "")
              ? "Firefox"
              : /Chrome/.test(device.userAgent || "")
                ? "Chrome"
                : /Safari/.test(device.userAgent || "")
                  ? "Safari"
                  : "Browser";
          return (
            <div className="device-row" key={device.id}>
              <div className="row">
                {mobile ? (
                  <Smartphone className="device-icon" />
                ) : (
                  <Monitor className="device-icon" />
                )}
                <div>
                  <strong>
                    {mobile ? "Mobile device" : "Computer"} · {browser}
                  </strong>
                  <small>
                    Last active {new Date(device.updatedAt).toLocaleString()}
                  </small>
                  <small>
                    IP {device.ipAddress || "not available"} · Approximate
                    location unavailable
                  </small>
                </div>
              </div>
              {device.id === current ? (
                <span className="security-badge">This device</span>
              ) : (
                <button
                  className="btn danger"
                  disabled={working}
                  onClick={() => setConfirm(device)}
                >
                  Sign out
                </button>
              )}
            </div>
          );
        })}
        {!sessions.length && (
          <p className="account-hint">Loading active devices…</p>
        )}
      </section>
      {confirm && (
        <ConfirmDialog
          title={
            confirm === "others"
              ? "Sign out your other devices?"
              : "Sign out this device?"
          }
          description="The selected sessions will lose access to your account on their next request. This device will stay signed in."
          danger
          busy={working}
          onClose={() => setConfirm(null)}
          onConfirm={() =>
            void perform(async () => {
              if (confirm === "others")
                unwrap(await authClient.revokeOtherSessions());
              else
                unwrap(
                  await authClient.revokeSession({ token: confirm.token }),
                );
              setConfirm(null);
              await reload();
            }, "Selected devices signed out.")
          }
        />
      )}
    </>
  );
}
export function ActivitySettings() {
  const { data } = useAccount();
  return (
    <section className="settings-card">
      <h2>Recent account activity</h2>
      <p className="account-muted">
        Your sign-ins and security changes. Only you can see this log.
      </p>
      {data!.activity.map((event) => (
        <div className="activity-row" key={event.id}>
          <div>
            <strong>
              {event.event.replaceAll("-", " ").replaceAll("/", " · ")}
            </strong>
            <small>
              {/Android|iPhone|iPad/i.test(event.user_agent)
                ? "Mobile device"
                : "Browser"}{" "}
              · IP {event.ip || "unavailable"}
            </small>
          </div>
          <small>{new Date(event.created_at).toLocaleString()}</small>
        </div>
      ))}
      {!data!.activity.length && (
        <p className="account-notice">
          Your next sign-in or account change will appear here.
        </p>
      )}
    </section>
  );
}
