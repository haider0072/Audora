"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
} from "react"

import { AlphabetSidebar } from "@/components/alphabet-sidebar"
import type { Song } from "@/lib/song"
import { ScrollArea } from "@/components/ui/scroll-area"
import { rowAt, rowOffsets, useRowWindow } from "@/hooks/use-row-window"
import { useScrollActivity } from "@/hooks/use-scroll-activity"
import {
  buildLibraryRows,
  type LibraryRow,
  type LibraryRowKind,
  type LibraryRows,
  type LibraryViewMode,
} from "@/lib/library-rows"
import { AlbumHeader, ArtistHeader } from "./library-headers"
import type { SongActions } from "./song-menu"
import { SongRow, type LibraryLayout, type RowPlayback } from "./song-row"

/** Each kind of row's height in pixels. Where every row sits follows from these. */
const ROW_HEIGHTS: Record<LibraryLayout, Record<LibraryRowKind, number>> = {
  desktop: { artist: 52, album: 32, song: 56 },
  phone: { artist: 48, album: 30, song: 56 },
}

/** Rows kept rendered past each edge of the viewport, so a quick scroll does not outrun them. */
const OVERSCAN = 8

/** A jump further than this many screens lands at once instead of gliding past everything between. */
const GLIDE_SCREENS = 3

/** The `@keyframes` that marks where a jump landed (app/globals.css). */
const FLASH_ANIMATION = "library-flash"

/** A request to show a song's artist or album in the list. */
export interface LibraryJump {
  to: "artist" | "album"
  song: Song
}

/** What the song menu does besides moving around the list: the playlist manager's own actions. */
export interface LibraryActions {
  playNext: (song: Song) => void
  addToQueue: (song: Song) => void
  removeSong: (songId: string) => void
}

interface LibraryListProps {
  /** The library, in playback order. */
  songs: readonly Song[]
  viewMode: LibraryViewMode
  /** Search text: only songs that match it are shown. */
  query?: string
  layout: LibraryLayout
  currentSongId?: string
  /** How the current song is doing, for its row. */
  playback?: RowPlayback
  /** Songs are still arriving, so an empty library is not known to be empty yet. */
  loading?: boolean
  onSelect: (song: Song) => void
  actions: LibraryActions
  /** A jump asked for from outside the list. `onJumpDone` hands it back once made. */
  jump?: LibraryJump | null
  onJumpDone?: () => void
}

/** What the list last showed, so a change of view can keep the reader's place. */
interface Shown {
  library: LibraryRows
  offsets: number[]
  viewMode: LibraryViewMode
  query: string
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** The row a jump to a song's artist or album lands on: the header, or in the list view the first song. */
function landingRow(library: LibraryRows, to: LibraryJump["to"], song: Song): number | undefined {
  const row = library.songRows.get(song.id)
  if (row === undefined) return undefined
  return to === "artist" ? library.artistRuns[library.runOfRow[row]].start : library.albumStart[row]
}

/** The first song at or after `row`. */
function songFrom(library: LibraryRows, row: number): Song | undefined {
  for (let i = row; i < library.rows.length; i++) {
    const candidate = library.rows[i]
    if (candidate.kind === "song") return candidate.song
  }
  return undefined
}

/**
 * The library as one list, grouped by artist and album or flat, drawn a
 * screenful at a time: every row has a fixed place, so only the rows in view
 * (and a few either side) exist at all. In the grouped view each artist's
 * header stays on top while their songs pass under it, until the next
 * artist pushes it off. An A–Z scrubber shows while the list scrolls.
 */
export function LibraryList({
  songs,
  viewMode,
  query = "",
  layout,
  currentSongId,
  playback,
  loading = false,
  onSelect,
  actions,
  jump = null,
  onJumpDone,
}: LibraryListProps) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const [flashKey, setFlashKey] = useState<string | null>(null)

  const heights = ROW_HEIGHTS[layout]
  const library = useMemo(() => buildLibraryRows(songs, viewMode, query), [songs, viewMode, query])
  const offsets = useMemo(() => rowOffsets(library.rows.map((row) => heights[row.kind])), [library, heights])
  const view = useRowWindow(viewport, offsets, OVERSCAN)
  const scrolling = useScrollActivity(viewport)
  const letters = useMemo(() => new Set(library.letterRows.keys()), [library])

  /** Scroll so that the row a jump `to` an artist or album lands on is in view. */
  const scrollToLanding = useCallback(
    (to: LibraryJump["to"], target: number) => {
      if (!viewport) return
      // In the grouped view an album lands under its artist's header, which holds the top.
      const covered = to === "album" && viewMode === "grouped" ? heights.artist : 0
      const top = offsets[target] - covered
      const glide =
        !prefersReducedMotion() && Math.abs(top - viewport.scrollTop) <= viewport.clientHeight * GLIDE_SCREENS
      viewport.scrollTo({ top, behavior: glide ? "smooth" : "instant" })
    },
    [offsets, viewport, viewMode, heights],
  )

  /** Show a song's artist or album, from its menu, and mark where it landed. */
  const reveal = useCallback(
    (to: LibraryJump["to"], song: Song) => {
      const target = landingRow(library, to, song)
      if (target === undefined) return
      scrollToLanding(to, target)
      setFlashKey(library.rows[target].key)
    },
    [library, scrollToLanding],
  )

  // Rows are memoised, so what they are handed must keep its identity: these
  // forward to whatever the props are now.
  const latest = useRef({ onSelect, actions, reveal })
  useEffect(() => {
    latest.current = { onSelect, actions, reveal }
  }, [onSelect, actions, reveal])

  const select = useCallback((song: Song) => latest.current.onSelect(song), [])
  const rowActions = useMemo<SongActions>(
    () => ({
      playNext: (song) => latest.current.actions.playNext(song),
      addToQueue: (song) => latest.current.actions.addToQueue(song),
      remove: (song) => latest.current.actions.removeSong(song.id),
      goToArtist: (song) => latest.current.reveal("artist", song),
      goToAlbum: (song) => latest.current.reveal("album", song),
    }),
    [],
  )

  // A new search starts from the top. A new view keeps the song that was at
  // the top in place, so switching between them does not lose your spot.
  const shown = useRef<Shown | null>(null)
  useLayoutEffect(() => {
    const before = shown.current
    shown.current = { library, offsets, viewMode, query }
    if (!viewport || !before) return
    if (before.query !== query) {
      viewport.scrollTo({ top: 0, behavior: "instant" })
      return
    }
    if (before.viewMode === viewMode) return
    const underHeader = (mode: LibraryViewMode) => (mode === "grouped" ? heights.artist : 0)
    const song = songFrom(before.library, rowAt(before.offsets, viewport.scrollTop + underHeader(before.viewMode)))
    const row = song && library.songRows.get(song.id)
    if (row !== undefined) viewport.scrollTo({ top: offsets[row] - underHeader(viewMode), behavior: "instant" })
  }, [library, offsets, viewport, viewMode, query, heights])

  // A jump from outside: its mark is set as it arrives, the scroll waits for
  // the viewport (the list may have only just appeared), and then the request
  // goes back.
  const [jumpSeen, setJumpSeen] = useState<LibraryJump | null>(null)
  if (jump !== jumpSeen) {
    setJumpSeen(jump)
    const target = jump ? landingRow(library, jump.to, jump.song) : undefined
    if (target !== undefined) setFlashKey(library.rows[target].key)
  }
  useEffect(() => {
    if (!jump || !viewport) return
    const target = landingRow(library, jump.to, jump.song)
    if (target !== undefined) scrollToLanding(jump.to, target)
    onJumpDone?.()
  }, [jump, viewport, library, scrollToLanding, onJumpDone])

  const jumpToLetter = useCallback(
    (letter: string) => {
      const row = library.letterRows.get(letter)
      if (row !== undefined && viewport) viewport.scrollTo({ top: offsets[row], behavior: "instant" })
    },
    [library, offsets, viewport],
  )

  const endFlash = useCallback((event: AnimationEvent) => {
    if (event.animationName === FLASH_ANIMATION) setFlashKey(null)
  }, [])

  const { rows } = library

  const rowContent = (row: LibraryRow): ReactNode => {
    switch (row.kind) {
      case "artist":
        return <ArtistHeader artist={row.artist} count={row.songCount} />
      case "album":
        return <AlbumHeader album={row.album} count={row.songCount} />
      case "song":
        return (
          <SongRow
            song={row.song}
            number={row.number}
            detailed={row.detailed}
            playback={row.song.id === currentSongId ? playback : undefined}
            layout={layout}
            onSelect={select}
            actions={rowActions}
          />
        )
    }
  }

  /** Row `index`, placed from `base`: the top of the block it sits in. */
  const slot = (index: number, base: number) => {
    const row = rows[index]
    return (
      <div
        key={row.key}
        className="library-slot"
        style={{ top: offsets[index] - base, height: offsets[index + 1] - offsets[index] }}
        data-flash={flashKey === row.key || undefined}
        onAnimationEnd={endFlash}
      >
        {rowContent(row)}
      </div>
    )
  }

  const placed: ReactNode[] = []
  if (view.end > view.start) {
    if (viewMode === "grouped") {
      // One block per artist in view, as tall as all their rows: the header
      // sticks inside it, so the block's end is what pushes it off.
      for (let run = library.runOfRow[view.start]; run <= library.runOfRow[view.end - 1]; run++) {
        const { start, end } = library.artistRuns[run]
        const header = rows[start]
        const base = offsets[start]
        const blockRows: ReactNode[] = []
        for (let i = Math.max(start + 1, view.start); i < Math.min(end, view.end); i++) blockRows.push(slot(i, base))
        placed.push(
          <div key={header.key} className="library-group" style={{ top: base, height: offsets[end] - base }}>
            <div
              className="library-sticky"
              style={{ height: offsets[start + 1] - base }}
              data-flash={flashKey === header.key || undefined}
              onAnimationEnd={endFlash}
            >
              {rowContent(header)}
            </div>
            {blockRows}
          </div>,
        )
      }
    } else {
      for (let i = view.start; i < view.end; i++) placed.push(slot(i, 0))
    }
  }

  let body: ReactNode
  if (rows.length > 0) {
    body = (
      <div className="library-canvas" style={{ height: offsets[rows.length] }}>
        {placed}
      </div>
    )
  } else if (songs.length > 0) {
    body = (
      <div className="library-empty">
        <p className="library-empty-title">Nothing matches “{query.trim()}”</p>
        <p className="library-empty-hint">Search looks through titles, artists, albums and genres.</p>
      </div>
    )
  } else if (!loading) {
    body = (
      <div className="library-empty">
        <p className="library-empty-title">Your library is empty</p>
        <p className="library-empty-hint">Add songs or a whole folder to start listening.</p>
      </div>
    )
  }

  return (
    <div className="library" data-layout={layout}>
      <ScrollArea className="library-scroll" viewportRef={setViewport}>
        {body}
      </ScrollArea>
      {letters.size > 1 && (
        <AlphabetSidebar
          availableLetters={letters}
          activeLetter={library.rowLetters[view.first] ?? ""}
          onLetterClick={jumpToLetter}
          visible={scrolling}
        />
      )}
    </div>
  )
}
