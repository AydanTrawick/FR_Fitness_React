"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Anton, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import styles from "./SplashScreen.module.css";
import { usePathname } from "next/navigation";

const display = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});
const sub = Barlow_Condensed({
  weight: "600",
  subsets: ["latin"],
  variable: "--font-sub",
});
const mono = JetBrains_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-mono",
});

const HOLD_MS = 2000;
const EXIT_MS = 450;
const STORAGE_KEY = "firstrep-splash-seen";
const COMPLETE_EVENT = "firstrep:splash-complete";

function subscribe(callback: () => void) {
  window.addEventListener(COMPLETE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(COMPLETE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
function hasSeenSplash() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
function serverSnapshot() {
  return false;
}

type Props = { children: ReactNode; oncePerSession?: boolean };

/** A browser tab session starts fresh when the tab is closed and reopened. */
export default function SplashScreen({
  children,
  oncePerSession = true,
}: Props) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"intro" | "exit" | "done">("intro");
  const seen = useSyncExternalStore(subscribe, hasSeenSplash, serverSnapshot);
  const active =
    !pathname.startsWith("/auth/") &&
    !pathname.startsWith("/legal") &&
    phase !== "done" &&
    !(oncePerSession && seen);

  useEffect(() => {
    if (!active) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const hold = reduceMotion ? 700 : HOLD_MS;
    const exit = reduceMotion ? 300 : EXIT_MS;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const exitTimer = window.setTimeout(() => setPhase("exit"), hold);
    const doneTimer = window.setTimeout(() => {
      setPhase("done");
      if (oncePerSession) {
        try {
          sessionStorage.setItem(STORAGE_KEY, "1");
        } catch {
          /* Storage may be blocked. */
        }
        window.dispatchEvent(new Event(COMPLETE_EVENT));
      }
    }, hold + exit);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [active, oncePerSession]);

  return (
    <>
      <div
        className={styles.content}
        inert={active}
        aria-hidden={active || undefined}
      >
        {children}
      </div>
      {active && (
        <div
          className={[
            styles.overlay,
            phase === "exit" ? styles.exit : "",
            display.variable,
            sub.variable,
            mono.variable,
          ].join(" ")}
          role="status"
          aria-label="Loading FirstRep Fitness"
        >
          <div className={styles.ambient} aria-hidden="true" />
          <span className={styles.edition} aria-hidden="true">
            FIRSTREP / YOUR DAILY TOOLKIT
          </span>
          <div className={styles.center}>
            <div className={styles.lockup} aria-hidden="true">
              <div className={styles.dial}>
                <svg viewBox="0 0 200 200" className={styles.ring}>
                  <circle
                    className={styles.innerRing}
                    cx="100"
                    cy="100"
                    r="58"
                  />
                  {Array.from({ length: 12 }, (_, i) => (
                    <rect
                      key={i}
                      className={styles.tick}
                      x="95"
                      y="10"
                      width="10"
                      height="26"
                      rx="5"
                      transform={`rotate(${i * 30} 100 100)`}
                      style={{ animationDelay: `${350 + i * 100}ms` }}
                    />
                  ))}
                  <g className={styles.indicator}>
                    <rect x="95" y="10" width="10" height="26" rx="5" />
                  </g>
                </svg>
                <span className={styles.one}>1</span>
              </div>
              <div className={styles.wordmark}>
                <span className={styles.brand}>FIRSTREP</span>
                <span className={styles.sub}>FITNESS</span>
              </div>
            </div>
            <div className={styles.progress} aria-hidden="true">
              <span />
            </div>
          </div>
          <p className={styles.tagline}>Every rep counter starts at one.</p>
          <span className={styles.session} aria-hidden="true">
            <i /> A FRESH START
          </span>
        </div>
      )}
    </>
  );
}
