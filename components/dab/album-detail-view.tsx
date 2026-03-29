"use client"

import { memo } from "react"
import { ArrowLeft, Disc, Download, Calendar, Clock, Music } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DownloadIndicator } from "./download-indicator"
import type { TidalAlbum, TidalTrack, DownloadState } from "@/lib/tidal-types"

interface AlbumDetailViewProps {
  album: TidalAlbum
  downloads: Map<string, DownloadState>
  isInLibrary: (trackId: string) => boolean
  onTrackDownload: (track: TidalTrack) => void
  onCancelDownload: (trackId: string) => void
  onDownloadAll: (album: TidalAlbum) => void
  onBack: () => void
  onArtistClick?: (artistId: string) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function formatTotalDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

export const AlbumDetailView = memo(function AlbumDetailView({
  album,
  downloads,
  isInLibrary,
  onTrackDownload,
  onCancelDownload,
  onDownloadAll,
  onBack,
  onArtistClick,
}: AlbumDetailViewProps) {
  const allInLibrary = album.tracks?.every((t) => isInLibrary(t.id)) ?? false

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 space-y-3 pb-3">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-8 gap-1.5 -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {/* Album info */}
        <div className="flex gap-4">
          <div className="h-24 w-24 rounded-lg overflow-hidden flex-shrink-0 bg-white/10">
            {album.cover ? (
              <img src={album.cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Disc className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <h2 className="text-base font-semibold leading-tight truncate">{album.title}</h2>
            {onArtistClick && album.artistId ? (
              <button
                onClick={() => onArtistClick(album.artistId)}
                className="text-sm text-primary hover:underline truncate block"
              >
                {album.artist}
              </button>
            ) : (
              <p className="text-sm text-muted-foreground truncate">{album.artist}</p>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {album.releaseDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {album.releaseDate.slice(0, 4)}
                </span>
              )}
              {album.trackCount > 0 && (
                <span className="flex items-center gap-1">
                  <Music className="h-3 w-3" />
                  {album.trackCount} tracks
                </span>
              )}
              {album.totalDuration > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTotalDuration(album.totalDuration)}
                </span>
              )}
            </div>
            {album.genre && (
              <span className="inline-block text-xs bg-white/10 px-2 py-0.5 rounded-full">
                {album.genre}
              </span>
            )}
          </div>
        </div>

        {/* Download All */}
        {!allInLibrary && (
          <Button
            size="sm"
            className="w-full h-9 gap-2"
            onClick={() => onDownloadAll(album)}
          >
            <Download className="h-4 w-4" />
            Download All FLAC
          </Button>
        )}
      </div>

      {/* Track list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-0.5 pb-4">
          {(album.tracks || []).map((track, idx) => (
            <div
              key={track.id}
              className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-white/5"
            >
              {/* Track number */}
              <span className="text-xs text-muted-foreground w-5 text-right flex-shrink-0">
                {idx + 1}
              </span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{track.title}</p>
                {track.artist !== album.artist && (
                  <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                )}
              </div>

              {/* Duration */}
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {track.duration ? formatDuration(track.duration) : ""}
              </span>

              {/* Download */}
              <div className="flex-shrink-0">
                <DownloadIndicator
                  state={downloads.get(track.id)}
                  isInLibrary={isInLibrary(track.id)}
                  onDownload={() => onTrackDownload(track)}
                  onCancel={() => onCancelDownload(track.id)}
                  onRetry={() => onTrackDownload(track)}
                  compact
                />
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
})
