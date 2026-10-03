"use client";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function ConfirmDialog({
  title,
  description,
  children,
  onClose,
  onConfirm,
  busy = false,
  confirmLabel = "Confirm",
  danger = false,
  disabled = false,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
  confirmLabel?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
        <div className="confirm-actions">
          <button
            className="account-button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className={"account-button " + (danger ? "danger" : "primary")}
            disabled={busy || disabled}
            onClick={onConfirm}
          >
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
