"use client"

import { useState } from "react"

import { QUALITY_TIER_NAMES, qualityOf, type QualitySource } from "@/lib/audio-quality"
import { cn } from "@/lib/utils"

interface QualityLabelProps {
  song: (QualitySource & { id: string }) | null
  /** Bars and format only, for a tight row. The figures stay readable to assistive technology. */
  compact?: boolean
  /** Add the average bitrate of the audio after the format, for lossless audio, where it is measured rather than estimated. */
  withBitrate?: boolean
  /** Render nothing, rather than the format alone, when the quality is unknown: for a place that already names the format. */
  hideWhenUnknown?: boolean
  className?: string
}

/**
 * The quality meter and its spec text, as the song's own header states them:
 * three bars for hi-res, two for CD-quality lossless, one for lossy. A song of
 * unknown quality shows its format alone. Styled by `.quality` in
 * app/globals.css; a hi-res song starting fills its meter once.
 */
export function QualityLabel({
  song,
  compact = false,
  withBitrate = false,
  hideWhenUnknown = false,
  className,
}: QualityLabelProps) {
  // Moving from one song to another is a song starting; the first song shown is not.
  const [shownId, setShownId] = useState(song?.id)
  const [hasChanged, setHasChanged] = useState(false)
  if (song?.id !== shownId) {
    setShownId(song?.id)
    if (shownId !== undefined) setHasChanged(true)
  }

  if (!song) return null
  const quality = qualityOf(song)
  if (!quality) {
    if (hideWhenUnknown || !song.format) return null
    return <span className={cn("quality quality-format", className)}>{song.format.toUpperCase()}</span>
  }

  const bitrate = withBitrate && quality.tier !== "lossy" && song.bitrate ? song.bitrate : undefined
  return (
    <span
      className={cn("quality", className)}
      data-tier={quality.tier}
      data-rise={(hasChanged && quality.tier === "hi-res") || undefined}
    >
      {/* Keyed by song, so each new hi-res song fills a fresh meter. */}
      <span key={song.id} className="quality-bars" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="sr-only">
        {QUALITY_TIER_NAMES[quality.tier]}, {compact && quality.figures ? `${quality.figures} ` : ""}
      </span>
      {!compact && quality.figures && <span>{quality.figures}</span>}
      <span className="quality-format">{quality.format}</span>
      {bitrate && <span className="quality-detail">{Math.round(bitrate).toLocaleString("en-US")} kbps</span>}
    </span>
  )
}
