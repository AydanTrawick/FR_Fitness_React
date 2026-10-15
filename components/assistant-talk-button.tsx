"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2, VolumeX, LoaderCircle } from "lucide-react";
import type { useAssistantVoice } from "./use-assistant-voice";
export function AssistantTalkButton({
  voice,
  disabled,
}: {
  voice: ReturnType<typeof useAssistantVoice>;
  disabled: boolean;
}) {
  const [touch, setTouch] = useState(false),
    pressedAt = useRef(0),
    pointer = useRef(false),
    keyboardHeld = useRef(false),
    ignoreClick = useRef(false);
  const blocked =
    disabled || ["transcribing", "thinking"].includes(voice.state);
  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    // Hydrate the browser's pointer capabilities, which are unavailable on SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTouch(media.matches);
    const sync = () => setTouch(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const latest = useRef({ voice, blocked });
  useEffect(() => {
    latest.current = { voice, blocked };
  }, [voice, blocked]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const value = latest.current;
      if (
        e.code !== "Space" ||
        e.repeat ||
        value.blocked ||
        (e.target instanceof Element &&
          e.target.closest(
            'input,textarea,select,button,a,[contenteditable="true"]',
          ))
      )
        return;
      e.preventDefault();
      keyboardHeld.current = true;
      void value.voice.start();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && keyboardHeld.current) {
        e.preventDefault();
        keyboardHeld.current = false;
        latest.current.voice.stop();
      }
    };
    const blur = () => {
      if (keyboardHeld.current) {
        keyboardHeld.current = false;
        latest.current.voice.stop();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const label =
    voice.state === "permission"
      ? "Allow microphone…"
      : voice.state === "listening"
        ? touch
          ? "Listening — tap to send"
          : "Listening — release to send"
        : voice.state === "transcribing"
          ? "Transcribing…"
          : voice.state === "thinking"
            ? "Thinking…"
            : voice.state === "speaking"
              ? "Speaking — tap to interrupt"
              : voice.state === "error"
                ? "Try again"
                : touch
                  ? "Tap to talk"
                  : "Hold to talk";
  return (
    <div className="assistant-voice-controls">
      <button
        type="button"
        className={`btn ${voice.state === "listening" ? "primary" : "secondary"} assistant-talk ${voice.state === "error" ? "voice-error" : ""}`}
        disabled={blocked}
        aria-label={label}
        aria-pressed={voice.state === "listening"}
        aria-describedby="assistant-voice-status"
        onPointerDown={(event) => {
          if (blocked) return;
          event.preventDefault();
          ignoreClick.current = true;
          pointer.current = true;
          pressedAt.current = performance.now();
          event.currentTarget.setPointerCapture(event.pointerId);
          if (event.pointerType === "touch") {
            setTouch(true);
            voice.toggle();
          } else {
            keyboardHeld.current = true;
            void voice.start();
          }
        }}
        onPointerUp={(event) => {
          if (!pointer.current) return;
          pointer.current = false;
          if (
            event.pointerType !== "touch" ||
            performance.now() - pressedAt.current >= 400
          )
            voice.stop();
        }}
        onPointerCancel={() => {
          pointer.current = false;
          ignoreClick.current = false;
          voice.stop();
        }}
        onKeyDown={(event) => {
          if (event.code === "Space" && !event.repeat) {
            event.preventDefault();
            ignoreClick.current = true;
            keyboardHeld.current = true;
            void voice.start();
          }
        }}
        onKeyUp={(event) => {
          if (event.code === "Space") {
            event.preventDefault();
            ignoreClick.current = false;
            voice.stop();
          }
        }}
        onClick={(event) => {
          if (ignoreClick.current) {
            ignoreClick.current = false;
            return;
          }
          if (event.detail === 0 && !blocked) voice.toggle();
        }}
      >
        {voice.state === "transcribing" ||
        voice.state === "thinking" ||
        voice.state === "permission" ? (
          <LoaderCircle size={17} />
        ) : voice.state === "listening" ? (
          <Square size={17} />
        ) : (
          <Mic size={17} />
        )}
        {label}
      </button>
      <button
        type="button"
        className="btn icon"
        style={{ minWidth: 44, minHeight: 44 }}
        aria-label={
          voice.muted ? "Unmute spoken replies" : "Mute spoken replies"
        }
        aria-pressed={voice.muted}
        disabled={!voice.canSpeak}
        onClick={voice.mute}
      >
        {voice.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
    </div>
  );
}
