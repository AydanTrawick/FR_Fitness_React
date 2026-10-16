"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
// The shadcn-style primitives keep focus trapping, escape handling, and
// accessible title/description relationships in Radix rather than app code.
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export function DialogContent({
  children,
  overlayClassName = "",
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  overlayClassName?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={"confirm-overlay " + overlayClassName}
      />
      <DialogPrimitive.Content
        {...props}
        className={"confirm-dialog " + (props.className || "")}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
