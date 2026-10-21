"use client";
/* Draft hydration and storage errors synchronize external browser storage. */
/* eslint-disable react-hooks/set-state-in-effect */
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  draftReducer,
  storedDraftSchema,
  emptyDraft,
  type SessionDraft,
  type Action,
} from "@/lib/session/model";
import { SESSION } from "@/lib/session/config";
const KEY = "session-draft:v1";
const Context = createContext<{
  draft: SessionDraft;
  dispatch: Dispatch<Action>;
  stale: SessionDraft | null;
  resolveStale: (resume: boolean) => void;
  storageError: string;
} | null>(null);
export function SessionDraftProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [draft, dispatch] = useReducer(draftReducer, undefined, emptyDraft),
    [ready, setReady] = useState(false),
    [stale, setStale] = useState<SessionDraft | null>(null),
    [storageError, setStorageError] = useState("");
  useEffect(() => {
    function read(raw: string | null) {
      if (!raw) return;
      try {
        const envelope = JSON.parse(raw);
        if (envelope.userId !== userId) return;
        const saved = storedDraftSchema.parse(envelope.draft);
        if (
          Date.now() - saved.updatedAt > SESSION.draftMaxAge &&
          saved.exercises.length
        )
          setStale(saved);
        else dispatch({ type: "LOAD_PLAN", plan: saved });
      } catch {
        setStorageError(
          "Your stored draft could not be restored. You can build a new session.",
        );
      }
    }
    try {
      read(localStorage.getItem(KEY));
    } catch {
      setStorageError("Draft backup is unavailable in this browser.");
    }
    setReady(true);
    const sync = (e: StorageEvent) => {
      if (e.key === KEY) read(e.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [userId]);
  useEffect(() => {
    if (!ready || stale) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ userId, draft }));
    } catch {
      setStorageError(
        "Draft backup is unavailable. Keep this window open until you start.",
      );
    }
  }, [draft, ready, stale, userId]);
  function send(action: Action) {
    // Starting closes the provider immediately, so persist RESET before it unmounts.
    if (action.type === "RESET") {
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({ userId, draft: emptyDraft() }),
        );
      } catch {
        setStorageError("Draft backup is unavailable in this browser.");
      }
    }
    dispatch(action);
  }
  return (
    <Context.Provider
      value={{
        draft,
        dispatch: send,
        stale,
        resolveStale: (resume) => {
          if (resume && stale)
            dispatch({
              type: "LOAD_PLAN",
              plan: { ...stale, updatedAt: Date.now() },
            });
          else send({ type: "RESET" });
          setStale(null);
        },
        storageError,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSessionDraft() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("SessionDraftProvider is required");
  return ctx;
}
