"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { exerciseImageUrl } from "@/lib/exercise-catalog";
import { SESSION } from "@/lib/session/config";
import type { CatalogLift } from "@/lib/workout-session";
export function ExerciseMedia({ lift }: { lift?: CatalogLift }) {
  const root = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (!entry.isIntersecting) video.current?.pause();
    });
    observer.observe(node);
    const stop = () => {
      video.current?.pause();
    };
    window.addEventListener("session-preview", stop);
    return () => {
      observer.disconnect();
      window.removeEventListener("session-preview", stop);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  function start(delay: number) {
    if (
      !lift?.media_url ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    timer.current = setTimeout(() => {
      window.dispatchEvent(new Event("session-preview"));
      void video.current?.play().catch(() => {});
    }, delay);
  }
  function stop() {
    if (timer.current) clearTimeout(timer.current);
    if (video.current) {
      video.current.pause();
      video.current.currentTime = 0;
    }
  }
  const image =
    !failed && lift?.images?.[0]
      ? exerciseImageUrl(lift.images[0])
      : "/exercises/placeholder.svg";
  return (
    <div
      ref={root}
      className="sb-media"
      onMouseEnter={() => start(SESSION.hoverMs)}
      onMouseLeave={stop}
      onTouchStart={() => start(SESSION.touchMs)}
      onTouchEnd={stop}
      onTouchCancel={stop}
    >
      {visible && lift?.media_url && !failed ? (
        <video
          ref={video}
          src={lift.media_url}
          muted
          loop
          playsInline
          preload="none"
          poster={image}
          onError={() => setFailed(true)}
          aria-label={`${lift.name} demonstration`}
        />
      ) : (
        <Image
          src={image}
          width={480}
          height={270}
          unoptimized
          alt={lift ? `${lift.name} demonstration` : "Custom exercise"}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
