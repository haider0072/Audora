"use client"

import { useState, type CSSProperties, type ReactNode } from "react"

import { cn } from "@/lib/utils"

export type RollDirection = 1 | -1

interface Line {
  text: string
  key: number
}

interface Lines {
  current: Line
  leaving: Line | null
  direction: RollDirection
}

interface RollingTextProps {
  text: string
  /**
   * Rendered for the current line in place of `text`, for a line with links
   * in it. The outgoing copy is always the plain text, so nothing that is
   * leaving can be clicked or focused.
   */
  children?: ReactNode
  /** 1 when the change came from skipping forward, -1 from skipping back. */
  direction?: RollDirection
  className?: string
}

/**
 * A line of text that changes with the song: the old line rolls out and the
 * new one rolls in, in the direction you skipped. The motion is CSS (`.roll`
 * in app/globals.css), which turns it into a plain fade for reduced motion.
 */
export function RollingText({ text, children, direction = 1, className }: RollingTextProps) {
  const [lines, setLines] = useState<Lines>(() => ({ current: { text, key: 0 }, leaving: null, direction }))

  // Adjusting state from the previous render, not an effect: the outgoing line
  // has to be in the same commit as the incoming one or it would flash away.
  if (lines.current.text !== text) {
    setLines((prev) => ({ current: { text, key: prev.current.key + 1 }, leaving: prev.current, direction }))
  }

  const { current, leaving } = lines
  return (
    <span className={cn("roll", className)} style={{ "--roll-dir": lines.direction } as CSSProperties}>
      {leaving && (
        <span
          key={leaving.key}
          className="roll-out"
          aria-hidden="true"
          onAnimationEnd={() =>
            setLines((prev) => (prev.leaving?.key === leaving.key ? { ...prev, leaving: null } : prev))
          }
        >
          {leaving.text}
        </span>
      )}
      <span key={current.key} className={current.key > 0 ? "roll-in" : undefined}>
        {children ?? current.text}
      </span>
    </span>
  )
}
