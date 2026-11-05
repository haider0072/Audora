"use client"

import { memo, type ReactNode } from "react"
import { ChevronRight, Disc3, Music, Play, User } from "lucide-react"

import { RowMark, rowPlayback, type LibraryLayout, type RowPlayback } from "@/components/library/song-row"
import type { DownloadState, TidalAlbum, TidalArtist, TidalTrack } from "@/lib/tidal-types"
import { cn, formatTime } from "@/lib/utils"
import { DownloadIndicator } from "./download-indicator"

/** Which song is being previewed, and how it is doing. */
export interface OnlinePreview {
  trackId: string | null
  playing: boolean
  loading: boolean
}

/**
 * What the rows can do. Every row is handed the same functions, which never
 * change, so a download moving on redraws its own row and no other.
 */
export interface OnlineActions {
  preview: (track: TidalTrack) => void
  download: (track: TidalTrack) => void
  cancel: (trackId: string) => void
  openAlbum: (albumId: string) => void
  openArtist: (artistId: string) => void
}

/** An album or an artist that didn't open, and what its row says of it instead of its chevron. */
export interface UnopenedPage {
  id: string
  note: string
}

const SOURCE_NAMES = { qobuz: "Qobuz", amazon: "Amazon" } as const

/** A song's preview state, set on the previewed song's row only. */
export function previewPlayback(preview: OnlinePreview, trackId: string): RowPlayback | undefined {
  if (preview.trackId !== trackId) return undefined
  return rowPlayback(preview.loading && !preview.playing, preview.playing)
}

/** The year from a release date such as "2019-03-08". */
export function releaseYear(date: string | undefined): string | undefined {
  return date ? date.slice(0, 4) : undefined
}

const COVER_ICONS = { song: Music, album: Disc3, artist: User } as const

interface OnlineCoverProps {
  src: string | undefined
  kind: keyof typeof COVER_ICONS
  className?: string
  children?: ReactNode
}

/** A cover from the online search or, without one, the shape of what it is. An artist's is round. */
export function OnlineCover({ src, kind, className, children }: OnlineCoverProps) {
  const Icon = COVER_ICONS[kind]
  return (
    <span className={cn("online-cover", className)} data-kind={kind}>
      {src ? (
        // The stores' own image servers send each cover near the size shown;
        // next/image would route every one through the optimiser as well.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" />
      ) : (
        <Icon aria-hidden="true" />
      )}
      {children}
    </span>
  )
}

function SourceName({ source }: { source: TidalTrack["source"] }) {
  if (!source) return null
  return <span className="online-row-source">{SOURCE_NAMES[source]}</span>
}

interface OnlineSongRowProps {
  track: TidalTrack
  layout: LibraryLayout
  /** On an album's page, where every song shares the cover: its number instead. */
  number?: number
  /** Under the title: the artist and the album, or on an album's page a guest artist. */
  sub?: string
  /** Where it comes from, when the search looks in more than one place. */
  showSource: boolean
  playback?: RowPlayback
  download?: DownloadState
  inLibrary: boolean
  actions: OnlineActions
}

/**
 * A song found online. Pressing it plays a preview, which never reaches the
 * library; the control at its end downloads it. Laid out like a library row
 * (`.library-row`); `.online-row` puts the preview's mark on the cover.
 */
export const OnlineSongRow = memo(function OnlineSongRow({
  track,
  layout,
  number,
  sub,
  showSource,
  playback,
  download,
  inLibrary,
  actions,
}: OnlineSongRowProps) {
  const numbered = number !== undefined
  return (
    <div className="library-row online-row" data-layout={layout} data-art={numbered ? "off" : undefined} data-playback={playback}>
      <button
        type="button"
        className="library-row-main"
        aria-pressed={playback === "playing" || playback === "loading"}
        onClick={() => actions.preview(track)}
      >
        {numbered ? (
          <RowMark>{number}</RowMark>
        ) : (
          <OnlineCover src={track.albumCover} kind="song">
            <RowMark className="online-cover-mark">
              <Play />
            </RowMark>
          </OnlineCover>
        )}
        <span className="library-row-text">
          <span className="sr-only">Preview </span>
          <span className="library-row-title">{track.title}</span>
          {sub && <span className="library-row-sub">{sub}</span>}
        </span>
        <span className="online-row-trail">
          {showSource && <SourceName source={track.source} />}
          {track.duration > 0 && <span className="library-row-duration">{formatTime(track.duration)}</span>}
        </span>
      </button>
      <DownloadIndicator
        title={track.title}
        state={download}
        isInLibrary={inLibrary}
        onDownload={() => actions.download(track)}
        onCancel={() => actions.cancel(track.id)}
      />
    </div>
  )
})

interface OpenRowProps {
  layout: LibraryLayout
  /** Under the name: what it holds. */
  sub?: string
  /** Its page is on the way: an arc turns where the chevron was. */
  opening: boolean
  /** Its page didn't open: said where the chevron was. Pressing the row asks again. */
  note?: string
}

/**
 * A row that opens a page: a cover, a name, and a chevron; an arc while the
 * page loads; a word where the chevron was if it didn't.
 */
function OpenRow({
  layout,
  sub,
  opening,
  note,
  cover,
  title,
  trail,
  onOpen,
}: OpenRowProps & { cover: ReactNode; title: string; trail?: ReactNode; onOpen: () => void }) {
  return (
    <div className="library-row online-row" data-layout={layout}>
      <button type="button" className="library-row-main" aria-busy={opening || undefined} onClick={onOpen}>
        {cover}
        <span className="library-row-text">
          <span className="library-row-title">{title}</span>
          {sub && <span className="library-row-sub">{sub}</span>}
        </span>
        <span className="online-row-trail">
          {trail}
          {opening ? (
            <svg className="busy-arc online-row-busy" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="7" />
            </svg>
          ) : note ? (
            <span className="online-row-note">{note}</span>
          ) : (
            <ChevronRight className="online-row-chevron" aria-hidden="true" />
          )}
        </span>
      </button>
    </div>
  )
}

/** An album found online, or on an artist's page: it opens the album's own page. */
export const OnlineAlbumRow = memo(function OnlineAlbumRow({
  album,
  showSource,
  onOpen,
  ...row
}: OpenRowProps & { album: TidalAlbum; showSource: boolean; onOpen: (albumId: string) => void }) {
  return (
    <OpenRow
      {...row}
      cover={<OnlineCover src={album.cover} kind="album" />}
      title={album.title}
      trail={showSource && <SourceName source={album.source} />}
      onOpen={() => onOpen(album.id)}
    />
  )
})

/** An artist found online: it opens their albums. */
export const OnlineArtistRow = memo(function OnlineArtistRow({
  artist,
  onOpen,
  ...row
}: OpenRowProps & { artist: TidalArtist; onOpen: (artistId: string) => void }) {
  return (
    <OpenRow {...row} cover={<OnlineCover src={artist.image} kind="artist" />} title={artist.name} onOpen={() => onOpen(artist.id)} />
  )
})
