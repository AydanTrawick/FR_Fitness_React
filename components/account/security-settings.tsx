"use client";
import Image from "next/image";
import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useAccount, unwrap } from "./settings-context";
import { PasswordInput } from "./password-input";
import { ConfirmDialog } from "./confirm-dialog";
import { api, download } from "@/lib/client";
type Passkey = {
  id: string;
  name?: string | null;
  createdAt?: string | Date | null;
  deviceType: string;
};
export function SecuritySettings() {
  const { data, working, perform, load } = useAccount();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [qr, setQr] = useState("");
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [hasPassword, setHasPassword] = useState(false);
  const [confirm, setConfirm] = useState<"disable" | Passkey | null>(null);
  async function reload() {
    const [accounts, keyResult] = await Promise.all([
      authClient.listAccounts(),
      authClient.passkey.listUserPasskeys(),
    ]);
    const accountData = unwrap(accounts);
    setHasPassword(!!accountData?.some((a) => a.providerId === "credential"));
    setKeys(unwrap(keyResult) || []);
  }
  useEffect(() => {
    void Promise.all([
      authClient.listAccounts(),
      authClient.passkey.listUserPasskeys(),
    ])
      .then(([accounts, keyResult]) => {
        setHasPassword(
          !!unwrap(accounts)?.some((a) => a.providerId === "credential"),
        );
        setKeys(unwrap(keyResult) || []);
      })
      .catch(() => {});
  }, []);
  async function enable() {
    await perform(async () => {
      const result = unwrap(
        await authClient.twoFactor.enable({
          password: hasPassword ? password : undefined,
        }),
      );
      if (result && "totpURI" in result && result.totpURI) {
        setQr(
          await QRCode.toDataURL(result.totpURI, { width: 220, margin: 2 }),
        );
        setBackupCodes(result.backupCodes || []);
      }
    }, "Scan the QR code, then verify your authenticator.");
  }
  const enabled = !!data!.user.twoFactorEnabled;
  return (
    <>
      <section className="settings-card">
        <div className="row between">
          <h2>
            <ShieldCheck size={18} /> Two-factor authentication
          </h2>
          <span className="security-badge">
            {enabled ? "Enabled" : "Not enabled"}
          </span>
        </div>
        <p className="account-muted">
          An authenticator adds another layer of protection. Your 10 backup
          codes work once each.
        </p>
        <div className="account-form">
          {hasPassword && (
            <>
              <label htmlFor="security-password">
                Confirm your current password
              </label>
              <PasswordInput
                id="security-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </>
          )}
          {qr && !enabled ? (
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  unwrap(await authClient.twoFactor.verifyTotp({ code }));
                  setQr("");
                  setPassword("");
                  await load();
                }, "Two-factor authentication is on. Save your backup codes.");
              }}
            >
              <Image
                unoptimized
                width={220}
                height={220}
                className="totp-qr"
                src={qr}
                alt="Scan this QR code in your authenticator app"
              />
              <label htmlFor="enroll-code">Authenticator code</label>
              <input
                id="enroll-code"
                className="otp-input"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              <button
                className="account-button primary"
                disabled={working || code.length !== 6}
              >
                Verify authenticator
              </button>
            </form>
          ) : (
            <div className="row wrap">
              {enabled ? (
                <>
                  <button
                    className="btn secondary"
                    disabled={working || (hasPassword && !password)}
                    onClick={() => setConfirm("disable")}
                  >
                    Turn off two-factor
                  </button>
                  <button
                    className="btn secondary"
                    disabled={working || (hasPassword && !password)}
                    onClick={() =>
                      void perform(async () => {
                        const result = unwrap(
                          await authClient.twoFactor.generateBackupCodes({
                            password: hasPassword ? password : undefined,
                          }),
                        );
                        setBackupCodes(result?.backupCodes || []);
                      }, "Fresh backup codes generated. Previous codes no longer work.")
                    }
                  >
                    Regenerate backup codes
                  </button>
                </>
              ) : (
                <button
                  className="account-button primary fit"
                  disabled={working || (hasPassword && !password)}
                  onClick={() => void enable()}
                >
                  Set up authenticator
                </button>
              )}
            </div>
          )}
        </div>
        {backupCodes.length > 0 && (
          <>
            <p className="account-notice">
              Keep these somewhere private. They will not be shown again after
              you leave this page.
            </p>
            <div className="backup-codes">
              {backupCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <button
              className="text-link"
              style={{ marginTop: 14 }}
              onClick={() =>
                download("firstrep-backup-codes.txt", backupCodes.join("\n"))
              }
            >
              Download backup codes
            </button>
          </>
        )}
        {data!.recovery && !data!.recovery.cancelled_at && (
          <div className="account-notice">
            <p>
              A two-factor recovery request is pending until{" "}
              {new Date(data!.recovery.eligible_at).toLocaleString()}.
            </p>
            <button
              className="text-link"
              onClick={() =>
                void perform(
                  () => api("account/recovery-cancel", {}),
                  "Recovery request cancelled.",
                )
              }
            >
              Cancel this recovery request
            </button>
          </div>
        )}
      </section>
      <section className="settings-card">
        <h2>
          <Fingerprint size={18} /> Passkeys
        </h2>
        <p className="account-muted">
          Use Face ID, Touch ID, Windows Hello, or a security key. Passkey
          sign-in already satisfies the second factor.
        </p>
        {keys.map((key) => (
          <PasskeyRow
            key={key.id}
            item={key}
            disabled={working}
            onRename={async (name) => {
              await perform(async () => {
                unwrap(
                  await authClient.passkey.updatePasskey({ id: key.id, name }),
                );
                await reload();
              }, "Passkey renamed.");
            }}
            onRemove={() => setConfirm(key)}
          />
        ))}
        <button
          className="account-button passkey"
          style={{ marginTop: 20 }}
          disabled={working}
          onClick={() =>
            void perform(async () => {
              unwrap(
                await authClient.passkey.addPasskey({ name: "My passkey" }),
              );
              await reload();
            }, "Passkey added.")
          }
        >
          <Fingerprint size={18} /> Add a passkey
        </button>
      </section>
      {confirm && (
        <ConfirmDialog
          title={
            confirm === "disable"
              ? "Turn off two-factor authentication?"
              : "Remove this passkey?"
          }
          description={
            confirm === "disable"
              ? "Your authenticator and existing backup codes will stop protecting this account."
              : "This device will no longer be able to sign in with this passkey. Keep another sign-in method available."
          }
          danger
          busy={working}
          onClose={() => setConfirm(null)}
          onConfirm={() =>
            void perform(
              async () => {
                if (confirm === "disable") {
                  unwrap(
                    await authClient.twoFactor.disable({
                      password: hasPassword ? password : undefined,
                    }),
                  );
                  setBackupCodes([]);
                  setPassword("");
                } else
                  unwrap(
                    await authClient.passkey.deletePasskey({ id: confirm.id }),
                  );
                setConfirm(null);
                await reload();
              },
              confirm === "disable"
                ? "Two-factor authentication turned off."
                : "Passkey removed.",
            )
          }
        />
      )}
    </>
  );
}
function PasskeyRow({
  item,
  disabled,
  onRename,
  onRemove,
}: {
  item: Passkey;
  disabled: boolean;
  onRename: (name: string) => Promise<void>;
  onRemove: () => void;
}) {
  const [name, setName] = useState(item.name || "Passkey");
  return (
    <div className="method-row">
      <div className="account-form" style={{ margin: 0, flex: 1 }}>
        <label htmlFor={"passkey-" + item.id}>Passkey name</label>
        <input
          id={"passkey-" + item.id}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <small>
          {item.createdAt
            ? new Date(item.createdAt).toLocaleDateString()
            : "Registered device"}{" "}
          ·{" "}
          {item.deviceType === "multiDevice"
            ? "Synced passkey"
            : "Device passkey"}
        </small>
      </div>
      <div className="row">
        <button
          className="btn secondary"
          disabled={disabled || name === item.name || !name.trim()}
          onClick={() => void onRename(name)}
        >
          Save
        </button>
        <button className="btn danger" disabled={disabled} onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}
