"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
// The shadcn-style primitives keep focus trapping, escape handling, and
// accessible title/description relationships in Radix rather than app code.
export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export function DialogContent({
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="confirm-overlay" />
      <DialogPrimitive.Content
        {...props}
        className={"confirm-dialog " + (props.className || "")}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
