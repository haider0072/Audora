"use client"

import { memo } from "react"
import { ArrowLeft, Disc, Download, Calendar, Clock, Music, Play, Pause, Loader2 } from "lucide-react"
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
  previewTrackId?: string | null
  previewIsPlaying?: boolean
  previewIsLoading?: boolean
  onTogglePreview?: (track: TidalTrack) => void
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
  previewTrackId = null,
  previewIsPlaying = false,
  previewIsLoading = false,
  onTogglePreview,
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
          {(album.tracks || []).map((track, idx) => {
            const isActive = previewTrackId === track.id
            const showPause = isActive && previewIsPlaying
            const showLoader = isActive && previewIsLoading && !previewIsPlaying
            return (
              <div
                key={track.id}
                className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-white/5 group"
              >
                {/* Track number / play button (number hides on hover or when active) */}
                <div className="relative w-5 h-5 flex-shrink-0">
                  <span
                    className={`absolute inset-0 flex items-center justify-end text-xs text-muted-foreground transition-opacity ${
                      isActive ? "opacity-0" : "group-hover:opacity-0"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  {onTogglePreview && (
                    <button
                      type="button"
                      onClick={() => onTogglePreview(track)}
                      aria-label={showPause ? "Pause preview" : "Play preview"}
                      className={`absolute inset-0 flex items-center justify-center text-white/90 hover:text-white transition-opacity ${
                        isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {showLoader ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : showPause ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5 ml-0.5" />
                      )}
                    </button>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${isActive ? "text-primary" : ""}`}>{track.title}</p>
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
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
})
