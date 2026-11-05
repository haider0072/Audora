import type { ButtonHTMLAttributes } from "react"

import { cn } from "@/lib/utils"

const SIZES = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  lg: "h-[68px] w-[68px]",
} as const

interface PlayButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> {
  isPlaying: boolean
  /** A song is loading: an arc in the song's colour turns around the button until it plays. */
  isLoading?: boolean
  size?: keyof typeof SIZES
}

/**
 * Play and pause as one shape that morphs into the other. The styling lives in
 * app/globals.css (`.play-button`), next to the motion tokens it is timed by.
 */
export function PlayButton({ isPlaying, isLoading = false, size = "md", className, ...props }: PlayButtonProps) {
  return (
    <button
      type="button"
      aria-label={isPlaying ? "Pause" : "Play"}
      aria-busy={isLoading || undefined}
      data-playing={isPlaying || undefined}
      data-loading={isLoading || undefined}
      className={cn("play-button", SIZES[size], className)}
      {...props}
    >
      <svg className="play-button-arc" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="22" />
      </svg>
      <span className="play-glyph" aria-hidden="true">
        <span />
        <span />
      </span>
    </button>
  )
}
