"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, errorText } from "@/lib/client";
import {
  emptyLogs,
  kinds,
  validateEntry,
  type Entry,
  type Kind,
  type Logs,
} from "@/lib/tracking";
import type { User } from "@/lib/server";
export type Status = {
  user: User | null;
  accounts: boolean;
  ai: boolean;
  foodSearch: boolean;
  equipment: boolean;
  voice: boolean;
  email: boolean;
  feedbackStorage: boolean;
};
const initial: Status = {
  user: null,
  accounts: false,
  ai: false,
  foodSearch: false,
  equipment: false,
  voice: false,
  email: false,
  feedbackStorage: false,
};
type Store = {
  logs: Logs;
  guest: Logs;
  status: Status;
  ready: boolean;
  busy: boolean;
  error: string;
  notice: string;
  setError: (s: string) => void;
  save: (kind: Kind, rows: Entry[]) => Promise<boolean>;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  importGuest: () => Promise<void>;
};
const Context = createContext<Store | null>(null);
const guestKey = "firstrep.guest.v1";
function readGuest(): Logs {
  const value = sessionStorage.getItem(guestKey);
  if (!value) return emptyLogs();
  const parsed = JSON.parse(value);
  return Object.fromEntries(
    kinds.map((kind) => [
      kind,
      (parsed[kind] ?? []).map((row: unknown) => validateEntry(kind, row)),
    ]),
  ) as Logs;
}
export function StoreProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState(emptyLogs);
  const [guest, setGuest] = useState(emptyLogs);
  const [status, setStatus] = useState(initial);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const saving = useRef(false);
  const refresh = useCallback(async () => {
    setReady(false);
    setError("");
    setLogs(emptyLogs());
    try {
      const local = readGuest();
      setGuest(local);
      const info = await api<Status>("status");
      setStatus(info);
      setLogs(info.user ? (await api<{ logs: Logs }>("logs")).logs : local);
      setReady(true);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  // Initial hydration reads external browser storage and the authenticated server session.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  const reload = async () => {
    if (!status.user) return;
    setBusy(true);
    setError("");
    try {
      setLogs((await api<{ logs: Logs }>("logs")).logs);
      setNotice("Your saved logs are up to date.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async (kind: Kind, rows: Entry[]) => {
    if (!ready || saving.current) return false;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const clean = rows.map((row) => validateEntry(kind, row));
      const next = { ...logs, [kind]: clean };
      if (status.user)
        await api(`logs/${kind}`, { rows: clean, previous: logs[kind] }, "PUT");
      else {
        sessionStorage.setItem(guestKey, JSON.stringify(next));
        setGuest(next);
      }
      setLogs(next);
      setNotice(
        status.user
          ? "Saved to your account."
          : "Saved in this browser session.",
      );
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
      saving.current = false;
    }
  };
  const importGuest = async () => {
    for (const kind of kinds) {
      if (!guest[kind].length) continue;
      const ids = new Set(logs[kind].map((row) => row.id));
      let pending = guest[kind].filter((row) => !ids.has(row.id));
      if (kind === "workout") {
        try {
          pending = await Promise.all(pending.map(async (row) => {
            if (row.exercise_id && row.performed_at) return row;
            const result = await api<{ match: { id: string; name: string } | null }>(
              `exercises/match?name=${encodeURIComponent(String(row.exercise))}`,
            );
            if (!result.match)
              throw new Error(`Could not import ${row.exercise}. Choose its catalog exercise in the workout log first.`);
            return {
              ...row,
              exercise_id: result.match.id,
              exercise: result.match.name,
              performed_at: `${row.date}T12:00:00.000Z`,
            };
          }));
        } catch (error) {
          setError(errorText(error));
          return;
        }
      }
      if (
        !(await save(kind, [
          ...logs[kind],
          ...pending,
        ]))
      )
        return;
      const remaining = readGuest();
      remaining[kind] = [];
      sessionStorage.setItem(guestKey, JSON.stringify(remaining));
      setGuest(remaining);
    }
    await reload();
  };
  return (
    <Context.Provider
      value={{
        logs,
        guest,
        status,
        ready,
        busy,
        error,
        notice,
        setError,
        save,
        reload,
        refresh,
        importGuest,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw new Error("Store unavailable");
  return value;
}
