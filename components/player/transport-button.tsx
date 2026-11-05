import type { ButtonHTMLAttributes } from "react"

import { cn } from "@/lib/utils"

const SIZES = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
} as const

interface TransportButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "aria-label"> {
  label: string
  size?: keyof typeof SIZES
  /** For toggles such as shuffle: lit in the song's colour while on. */
  pressed?: boolean
}

/** Previous, next and the transport toggles. Styled by `.transport-button` in app/globals.css. */
export function TransportButton({ label, size = "md", pressed, className, children, ...props }: TransportButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      className={cn("transport-button", SIZES[size], className)}
      {...props}
    >
      {children}
    </button>
  )
}

/** Glyph sizes that sit in each button size. */
const ICON_SIZES = {
  sm: "h-[18px] w-[18px]",
  md: "h-[22px] w-[22px]",
} as const

interface SkipIconProps {
  direction: "back" | "forward"
  size?: keyof typeof ICON_SIZES
  className?: string
}

/** Skip glyph: a filled triangle against a bar. `back` mirrors it. */
export function SkipIcon({ direction, size = "md", className }: SkipIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(ICON_SIZES[size], className)}>
      <g transform={direction === "back" ? "translate(24 0) scale(-1 1)" : undefined} fill="currentColor">
        <path d="M5 5.6v12.8a1 1 0 0 0 1.53.85l9.9-6.4a1 1 0 0 0 0-1.7l-9.9-6.4A1 1 0 0 0 5 5.6Z" />
        <rect x="17.6" y="5" width="2.6" height="14" rx="1.3" />
      </g>
    </svg>
  )
}
