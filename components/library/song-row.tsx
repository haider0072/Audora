"use client"

import { memo, useState, type ReactNode } from "react"
import { MoreHorizontal } from "lucide-react"

import { AlbumArtDisplay } from "@/components/album-art-display"
import type { Song } from "@/lib/song"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLongPress } from "@/hooks/use-long-press"
import { artistOf } from "@/lib/library-groups"
import { hoverSong, leaveSong, warmSong } from "@/lib/song-warmup"
import { cn, formatTime } from "@/lib/utils"
import { SongMenuItems, type SongActions } from "./song-menu"

/** Where the current song is: still loading, playing, or paused. Other rows have none. */
export type RowPlayback = "loading" | "playing" | "paused"

/** The current song's row state, from the player's. */
export function rowPlayback(loading: boolean, playing: boolean): RowPlayback {
  if (loading) return "loading"
  return playing ? "playing" : "paused"
}

export type LibraryLayout = "desktop" | "phone"

/** A song row's height in pixels, in a list or the queue: the desktop's cover is larger. */
export const SONG_ROW_HEIGHT: Record<LibraryLayout, number> = { desktop: 64, phone: 56 }

const PLAYBACK_LABELS: Record<RowPlayback, string> = {
  loading: "Loading",
  playing: "Now playing",
  paused: "Paused",
}

interface SongRowProps {
  song: Song
  /** The track number, or the position in the list. */
  number: number
  /** Artist and album under the title. */
  detailed: boolean
  /** The song's cover beside the title. Off where every row shares one, as on an album's page. */
  art?: boolean
  /** Set on the current song's row only. */
  playback?: RowPlayback
  layout: LibraryLayout
  onSelect: (song: Song) => void
  actions: SongActions
}

function creditLine(song: Song): string {
  const artist = song.artists?.join(", ") || artistOf(song)
  return song.album ? `${artist} · ${song.album}` : artist
}

/**
 * What leads a row: its number, or a glyph in its place, which gives way to
 * a turning arc while the row's song loads and three bars while it plays.
 */
export function RowMark({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("library-row-index", className)} aria-hidden="true">
      <span className="library-row-number">{children}</span>
      <svg className="library-row-arc" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="8" />
      </svg>
      <span className="library-row-bars">
        <i />
        <i />
        <i />
      </span>
    </span>
  )
}

/**
 * One song in the library. The number before the title becomes a turning
 * arc while the song loads and three bars while it plays; the current row
 * takes the song's colour. Its menu opens from ⋯, from a long press, and on
 * the desktop from a right-click too. Styled by `.library-row` in
 * app/globals.css.
 */
export const SongRow = memo(function SongRow({
  song,
  number,
  detailed,
  art = true,
  playback,
  layout,
  onSelect,
  actions,
}: SongRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const longPress = useLongPress(() => setMenuOpen(true))

  const row = (
    <div
      className="library-row"
      data-layout={layout}
      data-art={art ? undefined : "off"}
      data-playback={playback}
      {...longPress}
    >
      <button
        type="button"
        className="library-row-main"
        aria-current={playback ? "true" : undefined}
        onClick={() => onSelect(song)}
        // Start a cloud song loading on intent, so the click finds it ready.
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") hoverSong(song)
        }}
        onPointerLeave={leaveSong}
        onPointerDown={() => warmSong(song)}
      >
        <RowMark>{number}</RowMark>
        {art && (
          <AlbumArtDisplay
            songId={song.id}
            albumArt={song.albumArt}
            thumbnail={song.albumArtThumb}
            title={`${song.title} album art`}
            size="row"
            rounded={layout === "desktop" ? "rounded-lg" : "rounded-md"}
            className="library-row-art"
          />
        )}
        <span className="library-row-text">
          <span className="library-row-title">{song.title}</span>
          {detailed && <span className="library-row-sub">{creditLine(song)}</span>}
        </span>
        {playback && <span className="sr-only">{PLAYBACK_LABELS[playback]}</span>}
        {song.duration ? <span className="library-row-duration">{formatTime(song.duration)}</span> : null}
      </button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="library-row-more" aria-label={`More for ${song.title}`}>
            <MoreHorizontal aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <SongMenuItems song={song} actions={actions} Item={DropdownMenuItem} Separator={DropdownMenuSeparator} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  if (layout === "phone") return row
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <SongMenuItems song={song} actions={actions} Item={ContextMenuItem} Separator={ContextMenuSeparator} />
      </ContextMenuContent>
    </ContextMenu>
  )
})
