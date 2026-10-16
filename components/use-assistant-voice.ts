"use client";
import { useEffect, useRef, useState } from "react";
import { usageChanged, usageFetch } from "@/lib/ratelimit/usage-client";
import { requestError } from "@/lib/ratelimit/client";
import {
  MIN_CLIP_MS,
  MAX_CLIP_MS,
  recordingMime,
  spokenText,
} from "@/lib/assistant/voice";
export type VoiceState =
  | "idle"
  | "permission"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";
export function useAssistantVoice({
  onTranscript,
  canSpeak,
}: {
  onTranscript: (text: string) => Promise<string | undefined>;
  canSpeak: boolean;
}) {
  const [state, setState] = useState<VoiceState>("idle"),
    [error, setError] = useState(""),
    [muted, setMuted] = useState(false),
    [ttsLimited, setTtsLimited] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    chunks = useRef<Blob[]>([]);
  const network = useRef<AbortController | null>(null),
    cap = useRef<ReturnType<typeof setTimeout> | null>(null),
    started = useRef(0),
    generation = useRef(0),
    phase = useRef<VoiceState>("idle");
  const objectUrl = useRef<string | null>(null),
    pendingStop = useRef(false),
    dead = useRef(false),
    isMuted = useRef(false),
    callback = useRef(onTranscript);
  useEffect(() => {
    callback.current = onTranscript;
  }, [onTranscript]);
  function change(next: VoiceState) {
    phase.current = next;
    if (!dead.current) setState(next);
  }
  function stopPlayback() {
    network.current?.abort();
    if (audio.current) {
      audio.current.pause();
      audio.current.removeAttribute("src");
      audio.current.load();
    }
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    if (phase.current === "speaking") change("idle");
  }
  function releaseMic() {
    if (cap.current) clearTimeout(cap.current);
    cap.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  function unlockAudio() {
    if (!audio.current) audio.current = new Audio();
    // Unlock the same native audio element inside a user gesture for iOS.
    if (!audio.current.src) {
      const bytes = new ArrayBuffer(1644),
        view = new DataView(bytes);
      const word = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++)
          view.setUint8(offset + i, s.charCodeAt(i));
      };
      word(0, "RIFF");
      view.setUint32(4, 1636, true);
      word(8, "WAVE");
      word(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 8000, true);
      view.setUint32(28, 16000, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      word(36, "data");
      view.setUint32(40, 1600, true);
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      audio.current.src = url;
      void audio.current
        .play()
        .then(() => {
          if (audio.current?.src === url) {
            audio.current.pause();
            audio.current.removeAttribute("src");
          }
        })
        .catch(() => {})
        .finally(() => URL.revokeObjectURL(url));
    }
  }
  async function playReply(reply: string) {
    if (isMuted.current || !canSpeak || dead.current) return;
    stopPlayback();
    setError("");
    const turn = ++generation.current,
      abort = new AbortController();
    network.current = abort;
    change("speaking");
    const player = audio.current ?? (audio.current = new Audio());
    const cleanup = () => {
      if (generation.current === turn) {
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = null;
        change("idle");
      }
    };
    player.onended = cleanup;
    player.onerror = () => {
      if (!abort.signal.aborted) {
        setError(
          "Could not play the reply. Tap Listen to retry; the text is still here.",
        );
        change("error");
      }
    };
    try {
      const text = spokenText(reply);
      if (
        typeof MediaSource !== "undefined" &&
        MediaSource.isTypeSupported("audio/mpeg")
      ) {
        const res = await usageFetch("/api/assistant/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ replyText: text }),
          signal: abort.signal,
        });
        if (
          !res.ok ||
          res.headers.get("content-type")?.includes("application/json")
        ) {
          const data = await res.json();
          if (res.ok && data.ttsLimited) {
            setTtsLimited(true);
            change("idle");
            return;
          }
          throw requestError(res, data);
        }
        setTtsLimited(false);
        if (!res.body) throw new Error("Audio streaming is unavailable.");
        const media = new MediaSource();
        objectUrl.current = URL.createObjectURL(media);
        player.src = objectUrl.current;
        await new Promise<void>((resolve, reject) => {
          media.addEventListener("sourceopen", () => resolve(), { once: true });
          abort.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
        const buffer = media.addSourceBuffer("audio/mpeg"),
          reader = res.body.getReader();
        let playing = false;
        while (!abort.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          await new Promise<void>((resolve, reject) => {
            const end = () => {
                buffer.removeEventListener("error", fail);
                abort.signal.removeEventListener("abort", cancel);
                resolve();
              },
              fail = () => {
                buffer.removeEventListener("updateend", end);
                abort.signal.removeEventListener("abort", cancel);
                reject(new Error("Audio stream could not be decoded."));
              },
              cancel = () => {
                buffer.removeEventListener("updateend", end);
                buffer.removeEventListener("error", fail);
                reject(new DOMException("Aborted", "AbortError"));
              };
            buffer.addEventListener("updateend", end, { once: true });
            buffer.addEventListener("error", fail, { once: true });
            abort.signal.addEventListener("abort", cancel, { once: true });
            try {
              buffer.appendBuffer(value);
            } catch (e) {
              reject(e);
            }
          });
          if (!playing) {
            playing = true;
            void player.play().catch((e) => {
              if (!abort.signal.aborted) {
                setError(
                  e instanceof Error && e.name === "NotAllowedError"
                    ? "Tap Listen to enable spoken playback."
                    : "Could not play this reply. The text is still available.",
                );
                change("error");
              }
            });
          }
        }
        if (!abort.signal.aborted && media.readyState === "open")
          media.endOfStream();
      } else {
        // Native progressive MP3 playback works on iOS without buffering the full
        // POST response. A user-bound encrypted ticket bridges POST to audio GET.
        const res = await usageFetch("/api/assistant/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ replyText: text, transport: "native" }),
          signal: abort.signal,
        });
        const data = await res.json();
        if (!res.ok) throw requestError(res, data);
        if (data.ttsLimited) {
          setTtsLimited(true);
          change("idle");
          return;
        }
        setTtsLimited(false);
        if (abort.signal.aborted) return;
        player.onerror = async () => {
          if (abort.signal.aborted || generation.current !== turn) return;
          try {
            // Native audio elements cannot read JSON errors. Probe the free
            // preparation endpoint again if a quota changed after preparation.
            const check = await usageFetch("/api/assistant/speak", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ replyText: text, transport: "native" }),
              signal: abort.signal,
            });
            const details = await check.json();
            if (check.ok && details.ttsLimited) {
              setTtsLimited(true);
              change("idle");
              return;
            }
            if (!check.ok) throw requestError(check, details);
            throw new Error(
              "Could not play the reply. Tap Listen to retry; the text is still here.",
            );
          } catch (error) {
            if (!abort.signal.aborted && !dead.current) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not play the reply.",
              );
              change("error");
            }
          }
        };
        player.onloadeddata = () => usageChanged("assistant/speak");
        player.src = data.url;
        await player.play();
      }
    } catch (e) {
      if (!abort.signal.aborted && !dead.current) {
        setError(
          e instanceof Error
            ? e.message
            : "Spoken reply unavailable. Text chat still works.",
        );
        change("error");
      }
    }
  }
  async function start() {
    if (["permission", "transcribing", "thinking"].includes(phase.current))
      return;
    stopPlayback();
    unlockAudio();
    setError("");
    change("permission");
    pendingStop.current = false;
    const turn = ++generation.current;
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "This browser cannot record audio. Use text chat or open FirstRep in Safari or Chrome over HTTPS.",
        );
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (dead.current || generation.current !== turn) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = mic;
      const mime = recordingMime((type) => MediaRecorder.isTypeSupported(type));
      const mr = new MediaRecorder(mic, mime ? { mimeType: mime } : undefined);
      recorder.current = mr;
      chunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      mr.onerror = () => {
        generation.current++;
        releaseMic();
        setError(
          "Recording stopped unexpectedly. Try again or type your message.",
        );
        change("error");
      };
      mr.onstop = async () => {
        const duration = Math.min(
            MAX_CLIP_MS,
            performance.now() - started.current,
          ),
          blob = new Blob(chunks.current, {
            type: mr.mimeType || "audio/webm",
          });
        chunks.current = [];
        releaseMic();
        recorder.current = null;
        if (dead.current || generation.current !== turn) return;
        if (duration < MIN_CLIP_MS || !blob.size) {
          setError("Didn't catch that, try again. Hold for at least a moment.");
          change("error");
          return;
        }
        change("transcribing");
        const abort = new AbortController();
        network.current = abort;
        try {
          const form = new FormData();
          form.set(
            "audio",
            blob,
            blob.type.includes("mp4") ? "voice.mp4" : "voice.webm",
          );
          form.set("durationMs", String(Math.round(duration)));
          const res = await usageFetch("/api/assistant/transcribe", {
            method: "POST",
            body: form,
            signal: abort.signal,
          });
          const data = await res.json();
          if (!res.ok) throw requestError(res, data);
          if (!data.text?.trim())
            throw new Error("Didn't catch that, try again.");
          if (dead.current || generation.current !== turn) return;
          change("thinking");
          const reply = await callback.current(data.text.trim());
          if (generation.current !== turn || dead.current) return;
          change("idle");
          if (reply) await playReply(reply);
        } catch (e) {
          if (!abort.signal.aborted && !dead.current) {
            setError(
              e instanceof Error
                ? e.message
                : "Voice request failed. You can still type.",
            );
            change("error");
          }
        }
      };
      mr.start(150);
      started.current = performance.now();
      change("listening");
      cap.current = setTimeout(() => stop(), MAX_CLIP_MS);
      if (pendingStop.current) stop();
    } catch (e) {
      releaseMic();
      if (!dead.current) {
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Microphone access was denied. Enable Microphone in your browser’s site settings, then try again. Text chat still works."
            : e instanceof Error
              ? e.message
              : "Microphone unavailable. You can still type.",
        );
        change("error");
      }
    }
  }
  function stop() {
    if (phase.current === "permission") {
      pendingStop.current = true;
      return;
    }
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  function toggle() {
    if (phase.current === "listening" || phase.current === "permission") stop();
    else void start();
  }
  function mute() {
    isMuted.current = !isMuted.current;
    setMuted(isMuted.current);
    if (isMuted.current) stopPlayback();
  }
  useEffect(() => {
    dead.current = false;
    return () => {
      dead.current = true;
      // Session generation is a counter, not a DOM ref; invalidate pending work.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      network.current?.abort();
      if (cap.current) clearTimeout(cap.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      audio.current?.pause();
      audio.current?.removeAttribute("src");
      audio.current?.load();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  return {
    state,
    canSpeak,
    error,
    muted,
    ttsLimited,
    setTtsLimited,
    start,
    stop,
    toggle,
    mute,
    stopPlayback,
    playReply,
    unlockAudio,
  };
}
