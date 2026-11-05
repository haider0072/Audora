"use client"

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { AlphabetSidebar } from "@/components/alphabet-sidebar"
import type { Song } from "@/lib/song"
import { ScrollArea } from "@/components/ui/scroll-area"
import { rowAt, rowOffsets, useRowWindow } from "@/hooks/use-row-window"
import { useScrollActivity } from "@/hooks/use-scroll-activity"
import type { LibraryPage } from "@/lib/library-pages"
import {
  buildLibraryRows,
  type LibraryRow,
  type LibraryRowKind,
  type LibraryRows,
  type LibraryViewMode,
} from "@/lib/library-rows"
import { EmptyLibrary, NoMatches, type EmptyAction } from "./library-empty"
import { AlbumHeader, ArtistHeader } from "./library-headers"
import { SongRow, type LibraryLayout, type RowPlayback } from "./song-row"
import { useRowActions, type LibraryActions } from "./use-row-actions"

/** Each kind of row's height in pixels. Where every row sits follows from these. */
const ROW_HEIGHTS: Record<LibraryLayout, Record<LibraryRowKind, number>> = {
  desktop: { artist: 52, album: 32, song: 56 },
  phone: { artist: 48, album: 30, song: 56 },
}

/** Rows kept rendered past each edge of the viewport, so a quick scroll does not outrun them. */
const OVERSCAN = 8

/** Both of a song's pages are a menu item away in the list. */
const GO_TO_EITHER = { artist: true, album: true }

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
  /** Open an artist's or an album's page: from its header, or from a song's menu. */
  onOpen: (page: LibraryPage) => void
  /** Offered by an empty library. */
  emptyAction?: EmptyAction
}

/** What the list last showed, so a change of view can keep the reader's place. */
interface Shown {
  library: LibraryRows
  offsets: number[]
  viewMode: LibraryViewMode
  query: string
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
  onOpen,
  emptyAction,
}: LibraryListProps) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)

  const heights = ROW_HEIGHTS[layout]
  const library = useMemo(() => buildLibraryRows(songs, viewMode, query), [songs, viewMode, query])
  const offsets = useMemo(() => rowOffsets(library.rows.map((row) => heights[row.kind])), [library, heights])
  const view = useRowWindow(viewport, offsets, OVERSCAN)
  const scrolling = useScrollActivity(viewport)
  const letters = useMemo(() => new Set(library.letterRows.keys()), [library])
  const { select, rowActions } = useRowActions({ onSelect, actions, onOpen, goTo: GO_TO_EITHER })

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

  const jumpToLetter = useCallback(
    (letter: string) => {
      const row = library.letterRows.get(letter)
      if (row !== undefined && viewport) viewport.scrollTo({ top: offsets[row], behavior: "instant" })
    },
    [library, offsets, viewport],
  )

  const { rows } = library

  const rowContent = (row: LibraryRow): ReactNode => {
    switch (row.kind) {
      case "artist":
        return <ArtistHeader artist={row.artist} count={row.songCount} onOpen={onOpen} />
      case "album":
        return <AlbumHeader artist={row.artist} album={row.album} count={row.songCount} onOpen={onOpen} />
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
            <div className="library-sticky" style={{ height: offsets[start + 1] - base }}>
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
    body = <NoMatches query={query} />
  } else if (!loading) {
    body = <EmptyLibrary layout={layout} action={emptyAction} />
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
