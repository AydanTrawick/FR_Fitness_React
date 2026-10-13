"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRef, type ReactNode } from "react";
export function WorkoutFullscreen({
  children,
  label,
  className = "",
  onClose,
  busy = false,
}: {
  children: ReactNode;
  label: string;
  className?: string;
  onClose: () => void;
  busy?: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={content}
          className={"ws-full-screen " + className}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            content.current?.focus({ preventScroll: true });
            content.current?.scrollTo({ top: 0 });
          }}
          aria-describedby={undefined}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogPrimitive.Title className="ws-visually-hidden">
            {label}
          </DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
