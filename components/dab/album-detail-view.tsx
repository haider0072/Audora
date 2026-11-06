"use client"

import { memo, useId, useRef } from "react"
import { ArrowDownToLine, Check } from "lucide-react"

import { BusyArc } from "@/components/busy-arc"
import { PageFrame } from "@/components/library/page-frame"
import type { LibraryLayout } from "@/components/library/song-row"
import type { DownloadState, TidalAlbum, TidalTrack } from "@/lib/tidal-types"
import { formatCount, formatDetails, formatTotalDuration } from "@/lib/utils"
import {
  OnlineCover,
  OnlineSongRow,
  previewPlayback,
  releaseYear,
  type OnlineActions,
  type OnlinePreview,
  type UnopenedPage,
} from "./online-rows"

interface AlbumDetailViewProps {
  album: TidalAlbum
  layout: LibraryLayout
  /** Where Back goes: the results, or the artist's page. */
  backLabel: string
  downloads: Map<string, DownloadState>
  isInLibrary: (track: TidalTrack) => boolean
  preview: OnlinePreview
  /** The artist whose page is on the way. */
  opening: string | null
  /** The artist whose page didn't open. */
  unopened: UnopenedPage | null
  actions: OnlineActions
  onDownloadAll: (album: TidalAlbum) => void
  onBack: () => void
}

/**
 * An album found online, laid out like an album's page in the library: its
 * songs to preview, and to download one by one or all at once.
 */
export const AlbumDetailView = memo(function AlbumDetailView({
  album,
  layout,
  backLabel,
  downloads,
  isInLibrary,
  preview,
  opening,
  unopened,
  actions,
  onDownloadAll,
  onBack,
}: AlbumDetailViewProps) {
  const titleId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const tracks = album.tracks ?? []
  const missing = tracks.filter((track) => !isInLibrary(track)).length
  const openingArtist = Boolean(album.artistId) && opening === album.artistId
  const artistNote = album.artistId && unopened?.id === album.artistId ? unopened.note : undefined

  return (
    <PageFrame layout={layout} titleId={titleId} headingRef={headingRef} backLabel={backLabel} onBack={onBack}>
      <header className="library-page-head" data-kind="album">
        <OnlineCover src={album.cover} kind="album" className="library-page-cover" />
        <div className="library-page-info">
          <p className="library-page-kind">Album</p>
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="library-page-title">
            {album.title}
          </h2>
          {album.artistId ? (
            <button
              type="button"
              className="library-page-link online-page-link"
              aria-busy={openingArtist || undefined}
              onClick={() => actions.openArtist(album.artistId)}
            >
              {album.artist}
              {openingArtist && <BusyArc />}
              {artistNote && <span className="online-page-note"> · {artistNote}</span>}
            </button>
          ) : (
            <p className="library-page-link">{album.artist}</p>
          )}
          <p className="library-page-meta">
            {formatDetails(
              releaseYear(album.releaseDate),
              album.genre,
              tracks.length > 0 && formatCount(tracks.length, "song"),
              album.totalDuration > 0 && formatTotalDuration(album.totalDuration),
            )}
          </p>
          {missing > 0 ? (
            <button type="button" className="library-page-play online-download-all" onClick={() => onDownloadAll(album)}>
              <ArrowDownToLine aria-hidden="true" />
              {missing === tracks.length ? "Download all" : `Download ${formatCount(missing, "song")}`}
            </button>
          ) : (
            tracks.length > 0 && (
              <p className="online-page-owned">
                <Check aria-hidden="true" />
                In your library
              </p>
            )
          )}
        </div>
      </header>
      <ol className="library-page-tracks">
        {tracks.map((track, index) => (
          <li key={track.id} className="library-page-track">
            <OnlineSongRow
              track={track}
              layout={layout}
              number={track.trackNumber ?? index + 1}
              sub={track.artist !== album.artist ? track.artist : undefined}
              showSource={false}
              playback={previewPlayback(preview, track.id)}
              download={downloads.get(track.id)}
              inLibrary={isInLibrary(track)}
              actions={actions}
            />
          </li>
        ))}
      </ol>
    </PageFrame>
  )
})
