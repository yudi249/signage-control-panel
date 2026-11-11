import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, title, children }: DialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn("relative z-50 w-full max-w-md rounded-lg border bg-card p-6 shadow-lg")}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} aria-label="Tutup">
            ✕
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
