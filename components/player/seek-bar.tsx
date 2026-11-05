"use client"

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react"

import { usePlaybackTime } from "@/hooks/use-playback-time"
import { cn, formatTime } from "@/lib/utils"

/** Arrow keys move this far; Page Up and Page Down six times as far. */
const KEY_STEP_SECONDS = 5
const PAGE_STEP_SECONDS = 30

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

interface SeekBarProps {
  duration: number
  onSeek: (seconds: number) => void
  /** While playing, the elapsed part takes the song's colour. */
  isPlaying?: boolean
  disabled?: boolean
  /** Elapsed and remaining time: under the track, or either side of it in a tight row. */
  timesPosition?: "below" | "sides"
  className?: string
}

/**
 * The seek bar. It subscribes to the playback position itself, so the ticks
 * re-render this strip alone rather than the player around it.
 *
 * Dragging shows where you would land and seeks once, on release: seeking a
 * streamed file on every pointer move would fetch a new range each time.
 * Arrow keys move five seconds, Page keys thirty, Home and End to either end.
 */
export function SeekBar({
  duration,
  onSeek,
  isPlaying = false,
  disabled = false,
  timesPosition = "below",
  className,
}: SeekBarProps) {
  const currentTime = usePlaybackTime()
  const [scrubTime, setScrubTime] = useState<number | null>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const scrubbing = useRef(false)

  const inactive = disabled || !(duration > 0)
  const position = inactive ? 0 : clamp(scrubTime ?? currentTime, 0, duration)
  const fraction = inactive ? 0 : position / duration
  const tipTime = scrubTime ?? hoverTime
  const tipFraction = tipTime != null && !inactive ? tipTime / duration : 0

  const timeAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return 0
    return clamp((event.clientX - rect.left) / rect.width, 0, 1) * duration
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (inactive || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    scrubbing.current = true
    setScrubTime(timeAt(event))
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (inactive) return
    if (scrubbing.current) setScrubTime(timeAt(event))
    else if (event.pointerType === "mouse") setHoverTime(timeAt(event))
  }

  const endScrub = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    if (!scrubbing.current) return
    scrubbing.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const time = timeAt(event)
    setScrubTime(null)
    if (commit) onSeek(time)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (inactive) return
    const target = (() => {
      switch (event.key) {
        case "ArrowRight":
        case "ArrowUp":
          return currentTime + KEY_STEP_SECONDS
        case "ArrowLeft":
        case "ArrowDown":
          return currentTime - KEY_STEP_SECONDS
        case "PageUp":
          return currentTime + PAGE_STEP_SECONDS
        case "PageDown":
          return currentTime - PAGE_STEP_SECONDS
        case "Home":
          return 0
        case "End":
          return duration
        default:
          return null
      }
    })()
    if (target === null) return
    event.preventDefault()
    onSeek(clamp(target, 0, duration))
  }

  const elapsed = <span>{formatTime(position)}</span>
  const remaining = <span>-{formatTime(Math.max(0, duration - position))}</span>

  const bar = (
    <div
      role="slider"
      tabIndex={inactive ? -1 : 0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration) || 0}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}
      aria-disabled={inactive || undefined}
      data-playing={isPlaying || undefined}
      data-scrubbing={scrubTime !== null || undefined}
      className="seek-bar flex-1"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => endScrub(event, true)}
      onPointerCancel={(event) => endScrub(event, false)}
      onPointerLeave={() => setHoverTime(null)}
      onKeyDown={handleKeyDown}
    >
      <div className="seek-track">
        <div className="seek-fill" style={{ transform: `scaleX(${fraction})` }} />
      </div>
      {/* The rail spans the bar, so moving it by a share of its own width moves
          the knob along the bar with a transform: each tick skips layout. */}
      <div className="seek-knob-rail" style={{ transform: `translateX(${fraction * 100}%)` }}>
        <div className="seek-knob" />
      </div>
      {/* Kept clear of the ends so the label never hangs off the bar. */}
      <div
        className="seek-tip type-data"
        style={{ left: `clamp(1.5rem, ${tipFraction * 100}%, calc(100% - 1.5rem))` }}
        aria-hidden="true"
      >
        {formatTime(tipTime ?? 0)}
      </div>
    </div>
  )

  const timeStyle = "type-data text-muted-foreground"
  if (timesPosition === "sides") {
    return (
      <div className={cn("flex items-center gap-3", timeStyle, className)}>
        <span className="w-10 text-right">{elapsed}</span>
        {bar}
        <span className="w-10">{remaining}</span>
      </div>
    )
  }
  return (
    <div className={className}>
      {bar}
      <div className={cn("-mt-1 flex justify-between", timeStyle)}>
        {elapsed}
        {remaining}
      </div>
    </div>
  )
}
