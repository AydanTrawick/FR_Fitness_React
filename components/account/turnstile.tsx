"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}
export function Turnstile({
  siteKey,
  nonce,
  onToken,
}: {
  siteKey?: string;
  nonce: string;
  onToken: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready || !siteKey || !ref.current || !window.turnstile) return;
    const api = window.turnstile;
    const id = api.render(ref.current, {
      sitekey: siteKey,
      theme: "dark",
      size: "flexible",
      callback: onToken,
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
    });
    return () => api.remove(id);
  }, [ready, siteKey, onToken]);
  if (!siteKey) return null;
  return (
    <>
      <Script
        nonce={nonce}
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => setReady(true)}
      />
      <div ref={ref} className="turnstile" />
    </>
  );
}
