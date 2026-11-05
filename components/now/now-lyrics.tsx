"use client"

import { memo, useEffect, useRef } from "react"

import { StatusMessage } from "@/components/status-message"
import { useLyrics } from "@/hooks/use-lyrics"
import { usePlaybackTime } from "@/hooks/use-playback-time"
import type { LyricLine, LyricsData } from "@/lib/lyrics-service"
import { prefersReducedMotion } from "@/lib/motion"
import type { Song } from "@/lib/song"

/** After the reader scrolls the lyrics themselves, they stay put this long before following the song again. */
const READER_SCROLL_HOLD_MS = 4000
/** Where the line being sung sits: this share of the panel's height down from its top. */
const CURRENT_LINE_PLACE = 0.35

type LineState = "past" | "current" | "next"

/** How far a line is from the one being sung: the next three by step, then far; past lines only once far. */
export type LineDistance = "1" | "2" | "3" | "far"

/**
 * How far line `index` is from line `current`, for the depth the desktop's
 * lyrics have: the coming lines soften step by step, the long-gone ones too.
 */
export function lineDistance(index: number, current: number): LineDistance | undefined {
  if (index === current) return undefined
  if (index < current) return current - index > 2 ? "far" : undefined
  const ahead = index - current
  if (ahead > 3) return "far"
  return ahead === 1 ? "1" : ahead === 2 ? "2" : "3"
}

/** While a picked song loads, the clock is still the last song's, so a tapped line has nothing to seek. */
function seekNowhere() {}

/** The line being sung at `time`: the last to have started by then, or -1 before the first. */
export function lineAt(lines: readonly LyricLine[], time: number): number {
  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (lines[mid].time <= time) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

interface LineProps {
  line: LyricLine
  state: LineState
  distance: LineDistance | undefined
  onSeek: (seconds: number) => void
}

/**
 * A synced line, which seeks there when tapped. Out of the tab order: there
 * can be sixty of them, and the seek bar does the same job from the keyboard.
 */
const SyncedLine = memo(function SyncedLine({ line, state, distance, onSeek }: LineProps) {
  return (
    <li className="lyrics-item">
      <button
        type="button"
        tabIndex={-1}
        className="lyrics-line"
        data-state={state}
        data-distance={distance}
        aria-current={state === "current" ? "true" : undefined}
        onClick={() => onSeek(line.time)}
      >
        <span>{line.text}</span>
        {line.translation && <span className="lyrics-translation">{line.translation}</span>}
      </button>
    </li>
  )
})

interface SyncedLyricsProps {
  lines: readonly LyricLine[]
  /** The song on screen is the one playing, so the clock is its clock. */
  following: boolean
  onSeek: (seconds: number) => void
}

function SyncedLyrics({ lines, following, onSeek }: SyncedLyricsProps) {
  const time = usePlaybackTime()
  const current = following ? lineAt(lines, time) : -1
  const scrollerRef = useRef<HTMLDivElement>(null)
  const heldUntil = useRef(0)

  // Each new line glides into its place, unless the reader is scrolling around themselves.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || current < 0 || performance.now() < heldUntil.current) return
    const line = scroller.querySelectorAll<HTMLElement>(".lyrics-item")[current]
    if (!line) return
    const offset = line.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    scroller.scrollTo({
      top: scroller.scrollTop + offset - scroller.clientHeight * CURRENT_LINE_PLACE,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    })
  }, [current])

  const hold = () => {
    heldUntil.current = performance.now() + READER_SCROLL_HOLD_MS
  }

  return (
    <div ref={scrollerRef} className="lyrics" onWheel={hold} onTouchMove={hold}>
      <ol className="lyrics-lines">
        {lines.map((line, index) => (
          <SyncedLine
            key={index}
            line={line}
            state={index < current ? "past" : index === current ? "current" : "next"}
            distance={lineDistance(index, current)}
            onSeek={following ? onSeek : seekNowhere}
          />
        ))}
      </ol>
    </div>
  )
}

/** Lyrics without timings: read, not followed. */
function PlainLyrics({ lyrics }: { lyrics: LyricsData }) {
  const lines: readonly LyricLine[] =
    lyrics.plainLines ?? (lyrics.plain ?? "").split("\n").map((text) => ({ time: 0, text: text.trim() }))
  return (
    <div className="lyrics" data-plain="">
      <ol className="lyrics-lines">
        {lines.map((line, index) => (
          <li key={index} className="lyrics-item">
            <p className="lyrics-line" data-state="plain">
              {/* A blank line is a break between verses, and keeps its height. */}
              <span>{line.text || " "}</span>
              {line.translation && <span className="lyrics-translation">{line.translation}</span>}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}

interface NowLyricsProps {
  song: Song | null
  /** `song` is the one heard, rather than a pick still loading. */
  following: boolean
  onSeek: (seconds: number) => void
}

/**
 * The song's lyrics. Synced lyrics follow the song: the line being sung comes
 * into focus while the rest step back, and tapping a line seeks there.
 */
export function NowLyrics({ song, following, onSeek }: NowLyricsProps) {
  const { lyrics, retry } = useLyrics(song)

  if (!song) return <StatusMessage title="Nothing playing" detail="Lyrics show here while a song plays." />

  switch (lyrics.status) {
    case "idle":
      return <StatusMessage title="No lyrics to look for" detail="Finding lyrics takes the song's artist, title and length." />
    case "loading":
      return <StatusMessage title="Looking for lyrics…" />
    case "error":
      return (
        <StatusMessage title="Couldn't reach the lyrics service" detail={lyrics.error} action={{ label: "Try again", onClick: retry }} />
      )
    case "ready": {
      const found = lyrics.value
      if (!found) return <StatusMessage title="No lyrics for this song" detail="None of the lyrics LRCLIB has match its length." />
      if (found.synced?.length) {
        return <SyncedLyrics key={song.id} lines={found.synced} following={following} onSeek={onSeek} />
      }
      return <PlainLyrics key={song.id} lyrics={found} />
    }
  }
}
