import { cn } from "@/lib/utils"

/** Lit, dark, or showing a fault. */
export type LedState = "on" | "off" | "error"

/**
 * An LED: how something stands, at a glance. It always sits beside words that
 * say the same, since a dot alone tells nothing to someone who can't see it.
 * Styled by `.status-led` in app/globals.css.
 */
export function StatusLed({ state, className }: { state: LedState; className?: string }) {
  return <span className={cn("status-led", className)} data-state={state} aria-hidden="true" />
}
