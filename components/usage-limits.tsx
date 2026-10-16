"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, FileText, Info, Mic, RefreshCw, X } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { USAGE_CHANGED } from "@/lib/ratelimit/usage-client";
import {
  recoveryCountdown,
  type UsageMeter,
  type UsageName,
  type UsageSnapshot,
} from "@/lib/ratelimit/usage";
import styles from "./usage-limits.module.css";

const labels: Record<UsageName, string> = {
  planHour: "Plan requests · hourly",
  planDay: "Plan requests · daily",
  planIp: "Shared network · hourly",
  voiceMinute: "Assistant requests · per minute",
  voiceDay: "Assistant requests · daily",
  ttsCharacters: "Spoken replies · daily characters",
};
const number = (n: number) => n.toLocaleString("en-US");
function Meter({ meter, now }: { meter: UsageMeter; now: number }) {
  const unknown = meter.remaining === null;
  const low = !unknown && meter.remaining! / meter.limit <= 0.2;
  const reset = meter.availableAt ?? meter.fullAt;
  return (
    <div className={`${styles.meter} ${low ? styles.low : ""}`}>
      <div className={styles.meterLabel}>
        <span id={`usage-label-${meter.id}`}>{labels[meter.id]}</span>
        <span className={styles.amount}>
          {unknown ? (
            "Unavailable"
          ) : (
            <>
              <strong>{number(meter.remaining!)}</strong>
              <span> / {number(meter.limit)} left</span>
            </>
          )}
        </span>
      </div>
      {!unknown ? (
        <div
          className={styles.track}
          role="progressbar"
          aria-labelledby={`usage-label-${meter.id}`}
          aria-valuemin={0}
          aria-valuemax={meter.limit}
          aria-valuenow={meter.remaining!}
          aria-valuetext={`${number(meter.remaining!)} of ${number(meter.limit)} remaining`}
        >
          <div
            className={styles.fill}
            style={{ width: `${(meter.remaining! / meter.limit) * 100}%` }}
          />
        </div>
      ) : (
        <div className={`${styles.track} ${styles.unknownTrack}`} />
      )}
      <div className={styles.meterDetails}>
        <span>
          {unknown
            ? "We couldn’t read your usage."
            : `${number(meter.used!)} used`}
        </span>
        {!unknown &&
          (reset ? (
            <span className={styles.reset}>
              <Clock3 size={12} aria-hidden="true" />
              {meter.availableAt ? "More available in " : "Usage fully resets in "}
              {recoveryCountdown(reset, now)}
            </span>
          ) : (
            <span>No usage recorded</span>
          ))}
      </div>
      {!unknown && meter.fullAt && (
        <p className={styles.resetDate}>
          Full by{" "}
          <time dateTime={new Date(meter.fullAt).toISOString()}>
            {new Date(meter.fullAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </time>
          , if unused.
        </p>
      )}
    </div>
  );
}
export function UsageLimits({ signedIn = true }: { signedIn?: boolean }) {
  return signedIn ? <UsageLimitsDialog /> : null;
}
function UsageLimitsDialog() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(0);
  const sample = useRef<{ checkedAt: number; receivedAt: number } | null>(null);
  const refresh = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true,
      pending = false,
      queued = false;
    let controller: AbortController | undefined;
    const load = async () => {
      if (document.hidden) return;
      if (pending) {
        queued = true;
        return;
      }
      pending = true;
      controller = new AbortController();
      setLoading(true);
      try {
        const response = await fetch("/api/usage", {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(8000),
          ]),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Sign in again to view your usage."
              : data.error || "Usage could not be loaded.",
          );
        if (live) {
          sample.current = {
            checkedAt: data.checkedAt,
            receivedAt: performance.now(),
          };
          setSnapshot(data);
          setNow(data.checkedAt);
          setError("");
        }
      } catch (error) {
        if (live && !controller.signal.aborted) {
          // A failed refresh invalidates the old counters instead of presenting
          // stale counters as current usage.
          setSnapshot(null);
          setError(
            error instanceof Error
              ? error.message
              : "Usage could not be loaded.",
          );
        }
      } finally {
        pending = false;
        if (live) setLoading(false);
        if (live && queued) {
          queued = false;
          void load();
        }
      }
    };
    refresh.current = () => {
      void load();
    };
    const onChange = () => {
      void load();
    };
    const visibility = () => {
      if (!document.hidden) void load();
    };
    void load();
    const poll = setInterval(() => {
      if (!document.hidden) void load();
    }, 15_000);
    window.addEventListener(USAGE_CHANGED, onChange);
    window.addEventListener("focus", onChange);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      live = false;
      controller?.abort();
      refresh.current = null;
      sample.current = null;
      clearInterval(poll);
      window.removeEventListener(USAGE_CHANGED, onChange);
      window.removeEventListener("focus", onChange);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [open]);
  useEffect(() => {
    if (!open || !snapshot) return;
    // Server time plus monotonic elapsed time avoids a mis-set device clock
    // creating misleading countdowns. Re-read Redis when a recovery is due.
    const tick = () => {
      const sampled = sample.current;
      if (!sampled) return;
      const time = sampled.checkedAt + performance.now() - sampled.receivedAt;
      setNow(time);
      if (
        snapshot.meters.some((m) =>
          [m.availableAt, m.fullAt].some((at) => at !== null && at <= time),
        )
      )
        refresh.current?.();
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [open, snapshot]);
  const changeOpen = useCallback((value: boolean) => {
    if (!value) {
      setSnapshot(null);
      setError("");
    }
    setOpen(value);
  }, []);
  const group = (ids: UsageName[]) =>
    ids
      .map((id) => snapshot?.meters.find((m) => m.id === id))
      .filter((m): m is UsageMeter => !!m);
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <button type="button" className={styles.trigger}>
          <Info size={17} aria-hidden="true" />
          Usage limits
        </button>
      </DialogTrigger>
      <DialogContent
        className={styles.dialog}
        overlayClassName={styles.overlay}
      >
        <DialogClose asChild>
          <button
            type="button"
            className={styles.close}
            aria-label="Close usage limits"
          >
            <X size={21} />
          </button>
        </DialogClose>
        <p className={styles.eyebrow}>YOUR USAGE</p>
        <DialogTitle className={styles.title}>Equal Usage Limits</DialogTitle>
        <DialogDescription className={styles.description}>
          FirstRep Fitness is currently free for all users. Below are your hourly
          and daily usage limits.
        </DialogDescription>
        <div
          className={styles.status}
          role="status"
          aria-live={
            error || !snapshot || !snapshot.available ? "polite" : "off"
          }
        >
          {loading && !snapshot
            ? "Checking your usage…"
            : error ||
              (snapshot?.available === false
                ? "Your usage can’t be confirmed right now. Please try again shortly."
                : snapshot
                  ? `Updated ${Math.max(0, Math.floor((now - snapshot.checkedAt) / 1000))}s ago`
                  : "")}
        </div>
        {snapshot && (
          <>
            <section
              className={styles.group}
              aria-labelledby="usage-voice-heading"
            >
              <h3 id="usage-voice-heading">
                <span className={styles.icon}>
                  <Mic size={23} />
                </span>
                Training assistant
              </h3>
              {group(["voiceMinute", "voiceDay", "ttsCharacters"]).map(
                (meter) => (
                  <Meter key={meter.id} meter={meter} now={now} />
                ),
              )}
              <p className={styles.note}>
                Transcription, an AI reply, and audio playback each use one
                request. Text and voice share these usage limits. Spoken replies use
                characters, not audio minutes.
              </p>
            </section>
            <section
              className={styles.group}
              aria-labelledby="usage-plans-heading"
            >
              <h3 id="usage-plans-heading">
                <span className={styles.icon}>
                  <FileText size={23} />
                </span>
                AI Plan Builder
              </h3>
              {group(["planHour", "planDay", "planIp"]).map((meter) => (
                <Meter key={meter.id} meter={meter} now={now} />
              ))}
              <p className={styles.note}>
                Includes meal and workout plans, Progress Coach turns, and
                Playbook generation. Network usage is shared with others
                on your connection.
              </p>
            </section>
          </>
        )}
        <div className={styles.explainer}>
          <Clock3 size={20} aria-hidden="true" />
          <p>
            Usage resets gradually. Reset times assume no new usage.
            When audio runs out, your coach can still answer in text within your
            request limits.
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.refresh}
            disabled={loading}
            onClick={() => refresh.current?.()}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <DialogClose asChild>
            <button type="button" className={styles.done}>
              Got it
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
