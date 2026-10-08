"use client";
import type { ButtonHTMLAttributes, PointerEvent } from "react";
import { cn } from "@/lib/cn";

export function GradientButton({className, onPointerMove, ...props}: ButtonHTMLAttributes<HTMLButtonElement>) {
  function pointer(event: PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${(event.clientX - rect.left) / rect.width * 100}%`);
    event.currentTarget.style.setProperty("--my", `${(event.clientY - rect.top) / rect.height * 100}%`);
    onPointerMove?.(event);
  }
  return <button {...props} onPointerMove={pointer} className={cn("gradient-button", className)} />;
}
