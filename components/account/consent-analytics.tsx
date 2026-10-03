"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
export function ConsentAnalytics() {
  const pathname = usePathname();
  useEffect(() => {
    let cancelled = false;
    async function sync() {
      if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
      const response = await fetch("/api/account/analytics-consent");
      if (!response.ok) return;
      const { optIn } = await response.json();
      if (cancelled) return;
      const { default: posthog } = await import("posthog-js");
      if (optIn) {
        if (!posthog.__loaded)
          posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
            api_host:
              process.env.NEXT_PUBLIC_POSTHOG_HOST ||
              "https://us.i.posthog.com",
            autocapture: false,
            capture_pageview: false,
            capture_pageleave: false,
            disable_session_recording: true,
            person_profiles: "never",
            persistence: "memory",
            disable_surveys: true,
          });
        posthog.opt_in_capturing();
        if (!pathname.startsWith("/auth"))
          posthog.capture("$pageview", {
            $current_url: window.location.origin + pathname,
          });
      } else if (posthog.__loaded) {
        posthog.opt_out_capturing();
        posthog.reset();
      }
    }
    void sync().catch(() => {});
    window.addEventListener("firstrep:consent-updated", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("firstrep:consent-updated", sync);
    };
  }, [pathname]);
  return null;
}
