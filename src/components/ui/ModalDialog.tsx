"use client";

import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/**
 * Accessible native <dialog> modal adhering to Modern Web Guidance:
 * - Opened via showModal() for native top-layer, inert background, and Esc handling.
 * - Uses declarative closedby="any" with pointerdown/pointerup coordinate fallback for Safari.
 * - Does not add redundant role="dialog" or aria-modal.
 */
export function ModalDialog({ open, onClose, title, children }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = "";
      onClose();
    };

    dialog.addEventListener("close", handleClose);

    // Fallback for browsers without native dialog.closedBy support
    let cleanupFallback: (() => void) | undefined;
    if (typeof HTMLDialogElement !== "undefined" && !("closedBy" in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };

      const onPointerDown = (e: PointerEvent) => {
        if (e.target === dialog) {
          pressedOutside = isOutside(e);
        } else {
          pressedOutside = false;
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && e.target === dialog && isOutside(e)) {
          dialog.close();
        }
        pressedOutside = false;
      };

      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
      cleanupFallback = () => {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener("close", handleClose);
      cleanupFallback?.();
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      className="m-auto w-full max-w-lg rounded-2xl border border-[#3e236b] bg-[#160b28] p-6 text-[#fff8ed] shadow-2xl"
    >
      <div className="mb-4 flex items-center justify-between border-b border-[#3e236b] pb-3">
        <h2 id={titleId} className="text-lg font-bold text-[#fff8ed]">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close modal"
          className="rounded-lg border border-[#3e236b] bg-[#21113b] p-1.5 text-[#c4b5fd] hover:border-[#ff7b29] hover:text-[#fff8ed]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
