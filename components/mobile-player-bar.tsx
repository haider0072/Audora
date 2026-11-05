"use client"

import { useEffect, useState } from "react"
import { Settings, Mic, Music, Volume2, VolumeX, Youtube, Sparkles, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { AlbumArtDisplay } from "@/components/album-art-display"
import { PlayButton } from "@/components/player/play-button"
import { RollingText, type RollDirection } from "@/components/player/rolling-text"
import { SeekBar } from "@/components/player/seek-bar"
import { SkipIcon, TransportButton } from "@/components/player/transport-button"

/** The volume slider tucks itself away after this long without a touch. */
const VOLUME_IDLE_MS = 3000

interface Song {
  id: string
  title?: string
  artist?: string
  format?: string
  albumArt?: string
  albumArtThumb?: string
}

interface MobilePlayerBarProps {
  currentSong: Song | null
  isPlaying: boolean
  /** A picked song is loading. */
  isLoading: boolean
  /** Which way the last song change reads: 1 forward, -1 back. */
  direction: RollDirection
  duration: number
  volume: number[]
  isMuted: boolean
  onVolumeChange: (value: number[]) => void
  onToggleMute: () => void
  onPlayPause: () => void
  onSkipPrevious: () => void
  onSkipNext: () => void
  onSeek: (seconds: number) => void
  onSettingsClick: () => void
  onLyricsClick: () => void
  onVideoClick: () => void
  onInsightsClick?: () => void
  onArtistClick?: () => void
}

export function MobilePlayerBar({
  currentSong,
  isPlaying,
  isLoading,
  direction,
  duration,
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  onPlayPause,
  onSkipPrevious,
  onSkipNext,
  onSeek,
  onSettingsClick,
  onLyricsClick,
  onVideoClick,
  onInsightsClick,
  onArtistClick,
}: MobilePlayerBarProps) {
  const [showVolumeControl, setShowVolumeControl] = useState(false)

  useEffect(() => {
    if (!showVolumeControl) return
    const timer = setTimeout(() => setShowVolumeControl(false), VOLUME_IDLE_MS)
    return () => clearTimeout(timer)
  }, [showVolumeControl, volume])

  if (!currentSong) {
    return (
      <div className="shrink-0 bg-background/95 backdrop-blur-md border-t border-border p-4 safe-area-pb">
        <div className="flex items-center justify-center text-muted-foreground">
          <Music className="w-5 h-5 mr-2" aria-hidden="true" />
          <span className="text-sm">No song selected</span>
        </div>
      </div>
    )
  }

  return (
    <div className="shrink-0 bg-background/95 backdrop-blur-md border-t border-border safe-area-pb">
      {/* While a pick loads, the bar already belongs to it: empty, at its length. */}
      <SeekBar
        className="px-4 pt-1"
        duration={duration}
        onSeek={onSeek}
        isPlaying={isPlaying}
        disabled={isLoading}
      />

      <div className="px-4 pb-3 pt-1">
        <div className="flex items-center gap-3">
          {/* Goes through AlbumArtDisplay rather than a raw <img>: art is
              stored as a reference, and resolving one to a URL is the cache's
              job. A raw src would render the reference verbatim. */}
          <AlbumArtDisplay
            songId={currentSong.id}
            albumArt={currentSong.albumArt}
            thumbnail={currentSong.albumArtThumb}
            title={`${currentSong.title} album art`}
            size="small"
            rounded="rounded-lg"
            isTransitioning={isLoading}
            className="flex-shrink-0"
          />

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">
              <RollingText text={currentSong.title || "Unknown title"} direction={direction} />
            </p>
            <p className="text-xs text-muted-foreground">
              <RollingText text={currentSong.artist || "Unknown artist"} direction={direction} />
            </p>
          </div>

          {currentSong.format && (
            <span className="type-data uppercase text-muted-foreground">
              {currentSong.format}
            </span>
          )}

          <div className="flex items-center gap-1">
            <TransportButton label="Previous track" size="sm" onClick={onSkipPrevious}>
              <SkipIcon direction="back" size="sm" />
            </TransportButton>
            <PlayButton size="sm" isPlaying={isPlaying} isLoading={isLoading} onClick={onPlayPause} />
            <TransportButton label="Next track" size="sm" onClick={onSkipNext}>
              <SkipIcon direction="forward" size="sm" />
            </TransportButton>
          </div>
        </div>

        {/* Secondary controls */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={() => setShowVolumeControl((shown) => !shown)}
              aria-label="Volume"
              aria-expanded={showVolumeControl}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>

            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onLyricsClick} aria-label="Show lyrics">
              <Mic className="w-4 h-4" />
            </Button>

            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onVideoClick} aria-label="Show video">
              <Youtube className="w-4 h-4" />
            </Button>

            {onInsightsClick && (
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onInsightsClick} aria-label="Song insights">
                <Sparkles className="w-4 h-4" />
              </Button>
            )}

            {onArtistClick && (
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onArtistClick} aria-label="Artist info">
                <User className="w-4 h-4" />
              </Button>
            )}
          </div>

          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onSettingsClick} aria-label="Equalizer settings">
            <Settings className="w-4 h-4" />
          </Button>
        </div>

        {showVolumeControl && (
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onToggleMute} aria-label={isMuted ? "Unmute" : "Mute"}>
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </Button>
            <Slider
              value={isMuted ? [0] : volume}
              max={100}
              step={1}
              onValueChange={onVolumeChange}
              className="flex-1"
              aria-label="Volume level"
            />
            <span className="w-9 text-right type-data text-muted-foreground">
              {isMuted ? 0 : volume[0]}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
