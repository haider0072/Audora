import { Badge } from "@/components/ui/badge"
import { AlbumArtDisplay } from "@/components/album-art-display"
import type { Song } from "@/components/enhanced-playlist"

export interface SongInfoDisplayProps {
  currentSong: Song | null
  currentBitrate?: number
  isTransitioning?: boolean
  className?: string
}

/**
 * Component for displaying current song information
 *
 * Shows:
 * - Album art with transition animation
 * - Song title, artist, album
 * - Audio quality badges (Hi-Res, format, bitrate, sample rate)
 */
export function SongInfoDisplay({
  currentSong,
  currentBitrate,
  isTransitioning = false,
  className,
}: SongInfoDisplayProps) {
  const formatBitrate = (bitrate?: number) => {
    if (!bitrate) return "Unknown"
    return bitrate >= 1000 ? `${(bitrate / 1000).toFixed(1)}M` : `${Math.round(bitrate)}k`
  }

  if (!currentSong) {
    return null
  }

  return (
    <div className={`space-y-6 ${className || ""}`}>
      <div className="flex gap-6">
        <AlbumArtDisplay
          songId={currentSong.id}
          albumArt={currentSong.albumArt}
          title={`${currentSong.title} album art`}
          isTransitioning={isTransitioning}
          className="shadow-2xl shadow-black/30 flex-shrink-0 w-64 h-64"
        />
        <div
          className={`flex-1 space-y-3 transition-all duration-500 ease-out ${
            isTransitioning ? "translate-x-4 opacity-70" : "translate-x-0 opacity-100"
          }`}
        >
          <div className="space-y-2">
            <h2 className="text-2xl font-bold line-clamp-2 leading-tight">{currentSong.title}</h2>
            {currentSong.artist && (
              <p className="text-xl text-muted-foreground font-medium">{currentSong.artist}</p>
            )}
            {currentSong.album && (
              <p className="text-lg text-muted-foreground">{currentSong.album}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {currentSong.isHiRes && (
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 shadow-sm"
              >
                Hi-Res Audio
              </Badge>
            )}
            <Badge variant="outline" className="shadow-sm">
              {currentSong.format}
            </Badge>
            {currentBitrate && (
              <Badge variant="outline" className="shadow-sm">
                {formatBitrate(currentBitrate)}bps
              </Badge>
            )}
            {currentSong.sampleRate && (
              <Badge variant="outline" className="shadow-sm">
                {(currentSong.sampleRate / 1000).toFixed(1)}kHz
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
