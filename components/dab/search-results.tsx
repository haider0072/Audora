"use client"

import { memo } from "react"
import { Music, Disc, User, Clock } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DownloadIndicator } from "./download-indicator"
import type { DabSearchResult, DabTrack, DabAlbum, DabArtist, DownloadState } from "@/lib/dab-types"

interface SearchResultsProps {
  results: DabSearchResult
  downloads: Map<string, DownloadState>
  isInLibrary: (trackId: string) => boolean
  onTrackDownload: (track: DabTrack) => void
  onCancelDownload: (trackId: string) => void
  onAlbumClick: (albumId: string) => void
  onArtistClick: (artistId: string) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

const TrackItem = memo(function TrackItem({
  track,
  downloadState,
  inLibrary,
  onDownload,
  onCancel,
}: {
  track: DabTrack
  downloadState?: DownloadState
  inLibrary: boolean
  onDownload: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-white/5 group">
      {/* Album art */}
      <div className="h-10 w-10 rounded overflow-hidden flex-shrink-0 bg-white/10">
        {track.albumCover ? (
          <img src={track.albumCover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Music className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{track.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {track.artist} {track.albumTitle ? `· ${track.albumTitle}` : ""}
        </p>
      </div>

      {/* Duration */}
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {track.duration ? formatDuration(track.duration) : ""}
      </span>

      {/* Download */}
      <div className="flex-shrink-0">
        <DownloadIndicator
          state={downloadState}
          isInLibrary={inLibrary}
          onDownload={onDownload}
          onCancel={() => onCancel()}
          onRetry={onDownload}
          compact
        />
      </div>
    </div>
  )
})

const AlbumItem = memo(function AlbumItem({
  album,
  onClick,
}: {
  album: DabAlbum
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-white/5 w-full text-left"
    >
      <div className="h-12 w-12 rounded overflow-hidden flex-shrink-0 bg-white/10">
        {album.cover ? (
          <img src={album.cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Disc className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{album.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {album.artist}
          {album.trackCount ? ` · ${album.trackCount} tracks` : ""}
          {album.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ""}
        </p>
      </div>
    </button>
  )
})

const ArtistItem = memo(function ArtistItem({
  artist,
  onClick,
}: {
  artist: DabArtist
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-white/5 w-full text-left"
    >
      <div className="h-12 w-12 rounded-full overflow-hidden flex-shrink-0 bg-white/10">
        {artist.image ? (
          <img src={artist.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{artist.name}</p>
        {artist.albumCount != null && (
          <p className="text-xs text-muted-foreground">
            {artist.albumCount} album{artist.albumCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </button>
  )
})

export const SearchResults = memo(function SearchResults({
  results,
  downloads,
  isInLibrary,
  onTrackDownload,
  onCancelDownload,
  onAlbumClick,
  onArtistClick,
}: SearchResultsProps) {
  const hasTracks = results.tracks.length > 0
  const hasAlbums = results.albums.length > 0
  const hasArtists = results.artists.length > 0
  const isEmpty = !hasTracks && !hasAlbums && !hasArtists

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Music className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">No results found for &ldquo;{results.query}&rdquo;</p>
        <p className="text-xs mt-1">Try different keywords</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pb-4">
        {/* Tracks */}
        {hasTracks && (
          <div>
            <div className="flex items-center gap-2 px-3 py-2">
              <Music className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tracks ({results.tracks.length})
              </h3>
            </div>
            <div>
              {results.tracks.map((track) => (
                <TrackItem
                  key={track.id}
                  track={track}
                  downloadState={downloads.get(track.id)}
                  inLibrary={isInLibrary(track.id)}
                  onDownload={() => onTrackDownload(track)}
                  onCancel={() => onCancelDownload(track.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Albums */}
        {hasAlbums && (
          <div>
            <div className="flex items-center gap-2 px-3 py-2">
              <Disc className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Albums ({results.albums.length})
              </h3>
            </div>
            <div>
              {results.albums.map((album) => (
                <AlbumItem
                  key={album.id}
                  album={album}
                  onClick={() => onAlbumClick(album.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Artists */}
        {hasArtists && (
          <div>
            <div className="flex items-center gap-2 px-3 py-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Artists ({results.artists.length})
              </h3>
            </div>
            <div>
              {results.artists.map((artist) => (
                <ArtistItem
                  key={artist.id}
                  artist={artist}
                  onClick={() => onArtistClick(artist.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  )
})
