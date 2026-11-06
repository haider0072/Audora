"use client"

import { memo, useId, type ReactNode } from "react"

import type { LibraryLayout } from "@/components/library/song-row"
import { StatusMessage } from "@/components/status-message"
import type { SearchType } from "@/hooks/use-tidal-search"
import type { DownloadState, TidalSearchResult, TidalTrack } from "@/lib/tidal-types"
import { formatCount, formatDetails } from "@/lib/utils"
import {
  OnlineAlbumRow,
  OnlineArtistRow,
  OnlineSongRow,
  previewPlayback,
  releaseYear,
  type OnlineActions,
  type OnlinePreview,
  type UnopenedPage,
} from "./online-rows"

export type ResultKind = Exclude<SearchType, "all">

/** The kinds of result, in the order they are shown. */
const RESULT_KINDS: readonly ResultKind[] = ["track", "album", "artist"]

/** What each choice of what to show is called. */
export const TYPE_LABELS: Record<SearchType, string> = {
  all: "All",
  track: "Songs",
  album: "Albums",
  artist: "Artists",
}

function resultsOf(results: TidalSearchResult, kind: ResultKind): readonly unknown[] {
  if (kind === "track") return results.tracks
  return kind === "album" ? results.albums : results.artists
}

/**
 * How many of each kind a search found, for the kinds it looked for: a
 * search for songs alone says nothing of albums.
 */
export function resultCounts(results: TidalSearchResult): Partial<Record<ResultKind, number>> {
  const counts: Partial<Record<ResultKind, number>> = {}
  for (const kind of RESULT_KINDS) {
    if (results.searchType === "all" || results.searchType === kind) counts[kind] = resultsOf(results, kind).length
  }
  return counts
}

interface SearchResultsProps {
  results: TidalSearchResult
  /** What to show of them. */
  type: SearchType
  layout: LibraryLayout
  showSource: boolean
  downloads: Map<string, DownloadState>
  isInLibrary: (track: TidalTrack) => boolean
  preview: OnlinePreview
  /** The album or artist whose page is on the way. */
  opening: string | null
  /** The album or artist whose page didn't open. */
  unopened: UnopenedPage | null
  actions: OnlineActions
  onShowAll: () => void
}

/** One kind of result under its name. Showing only that kind, the choice above names it already. */
function ResultSection({ title, count, headed, children }: { title: string; count: number; headed: boolean; children: ReactNode }) {
  const headingId = useId()
  return (
    <section className="online-section" aria-labelledby={headingId}>
      <h3 id={headingId} className={headed ? "online-section-title" : "sr-only"}>
        {title} <span className="type-data">{count}</span>
      </h3>
      <ol className="online-list">{children}</ol>
    </section>
  )
}

/** What a search found online: songs to preview or download, albums and artists to open. */
export const SearchResults = memo(function SearchResults({
  results,
  type,
  layout,
  showSource,
  downloads,
  isInLibrary,
  preview,
  opening,
  unopened,
  actions,
  onShowAll,
}: SearchResultsProps) {
  const noteFor = (id: string) => (unopened?.id === id ? unopened.note : undefined)
  const shows = (kind: ResultKind) => type === "all" || type === kind
  const tracks = shows("track") ? results.tracks : []
  const albums = shows("album") ? results.albums : []
  const artists = shows("artist") ? results.artists : []

  if (tracks.length + albums.length + artists.length === 0) {
    const found = results.tracks.length + results.albums.length + results.artists.length
    return found === 0 ? (
      <StatusMessage title={`Nothing online for “${results.query}”`} detail="Try other words." />
    ) : (
      <StatusMessage
        title={`No ${TYPE_LABELS[type].toLowerCase()} for “${results.query}”`}
        action={{ label: "Show everything found", onClick: onShowAll }}
      />
    )
  }

  const headed = type === "all"
  return (
    <>
      {tracks.length > 0 && (
        <ResultSection title={TYPE_LABELS.track} count={tracks.length} headed={headed}>
          {tracks.map((track) => (
            <li key={track.id} className="online-item">
              <OnlineSongRow
                track={track}
                layout={layout}
                sub={formatDetails(track.artist, track.albumTitle)}
                showSource={showSource}
                playback={previewPlayback(preview, track.id)}
                download={downloads.get(track.id)}
                inLibrary={isInLibrary(track)}
                actions={actions}
              />
            </li>
          ))}
        </ResultSection>
      )}
      {albums.length > 0 && (
        <ResultSection title={TYPE_LABELS.album} count={albums.length} headed={headed}>
          {albums.map((album) => (
            <li key={album.id} className="online-item">
              <OnlineAlbumRow
                album={album}
                layout={layout}
                sub={formatDetails(
                  album.artist,
                  releaseYear(album.releaseDate),
                  album.trackCount > 0 && formatCount(album.trackCount, "song"),
                )}
                showSource={showSource}
                opening={opening === album.id}
                note={noteFor(album.id)}
                onOpen={actions.openAlbum}
              />
            </li>
          ))}
        </ResultSection>
      )}
      {artists.length > 0 && (
        <ResultSection title={TYPE_LABELS.artist} count={artists.length} headed={headed}>
          {artists.map((artist) => (
            <li key={artist.id} className="online-item">
              <OnlineArtistRow
                artist={artist}
                layout={layout}
                sub={artist.albumCount != null ? formatCount(artist.albumCount, "album") : undefined}
                opening={opening === artist.id}
                note={noteFor(artist.id)}
                onOpen={actions.openArtist}
              />
            </li>
          ))}
        </ResultSection>
      )}
    </>
  )
})
