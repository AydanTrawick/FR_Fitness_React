"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { auth } from "@/lib/auth";
import { preferencesSchema } from "@/lib/auth/validation";
import { api } from "@/lib/client";
import Link from "next/link";
import type { z } from "zod";
export type AccountData = {
  user: typeof auth.$Infer.Session.user;
  preferences: z.infer<typeof preferencesSchema>;
  passkeyPrompted: boolean;
  providers: { google: boolean; apple: boolean };
  pushAvailable: boolean;
  activity: {
    id: string;
    event: string;
    ip: string;
    user_agent: string;
    created_at: string;
  }[];
  exports: {
    id: string;
    status: string;
    expires_at: string | null;
    created_at: string;
  }[];
  recovery: { eligible_at: string; cancelled_at: string | null } | null;
};
type State = {
  data: AccountData | null;
  working: boolean;
  error: string;
  load: () => Promise<void>;
  perform: (task: () => Promise<unknown>, message: string) => Promise<boolean>;
  toast: (text: string) => void;
};
const Context = createContext<State | null>(null);
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AccountData | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await api<AccountData>("account"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load your account.");
    }
  }, []);
  useEffect(() => {
    void api<AccountData>("account")
      .then(setData)
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Unable to load your account.",
        ),
      );
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  async function perform(task: () => Promise<unknown>, success: string) {
    setWorking(true);
    setError("");
    try {
      await task();
      if (success) setMessage(success);
      await load();
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save. Please try again.",
      );
      return false;
    } finally {
      setWorking(false);
    }
  }
  return (
    <Context.Provider
      value={{ data, working, error, load, perform, toast: setMessage }}
    >
      {children}
      {error && (
        <div className="account-error" role="alert">
          {error}
          {/Confirm|fresh|signing in again/i.test(error) && (
            <p>
              <Link
                className="text-link"
                href={
                  "/auth?returnTo=" +
                  encodeURIComponent(
                    typeof window === "undefined"
                      ? "/settings/security"
                      : window.location.pathname,
                  )
                }
              >
                Confirm it’s you →
              </Link>
            </p>
          )}
        </div>
      )}
      {message && (
        <div className="account-toast" role="status">
          {message}
        </div>
      )}
    </Context.Provider>
  );
}
export function useAccount() {
  const value = useContext(Context);
  if (!value) throw new Error("Account context is unavailable.");
  return value;
}
export function unwrap<T>(result: {
  data: T | null;
  error: { message?: string } | null;
}) {
  if (result.error)
    throw new Error(result.error.message || "Unable to complete this request.");
  return result.data;
}
