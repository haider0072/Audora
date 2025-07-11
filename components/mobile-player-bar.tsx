"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Play, Pause, SkipBack, SkipForward, Settings, Mic, Share2 } from "lucide-react"

interface Song {
  id: string
  title?: string
  artist?: string
  album?: string
  albumArt?: string
}

interface MobilePlayerBarProps {
  currentSong: Song | null
  isPlaying: boolean
  currentTime: number
  duration: number
  onPlayPause: () => void
  onSkipPrevious: () => void
  onSkipNext: () => void
  onSeek: (value: number[]) => void
  onSettingsClick: () => void
  onLyricsClick: () => void
  onNetworkSharingClick?: () => void
  isTransitioning: boolean
}

export function MobilePlayerBar({
  currentSong,
  isPlaying,
  currentTime,
  duration,
  onPlayPause,
  onSkipPrevious,
  onSkipNext,
  onSeek,
  onSettingsClick,
  onLyricsClick,
  onNetworkSharingClick,
  isTransitioning,
}: MobilePlayerBarProps) {
  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00"
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  if (!currentSong) {
    return (
      <div className="flex-shrink-0 bg-background/95 backdrop-blur-sm border-t p-4">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">No song selected</p>
          <p className="text-xs">Add songs to your playlist to start playing</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 bg-background/95 backdrop-blur-sm border-t">
      {/* Progress Bar */}
      <div className="px-4 pt-2">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={1}
          onValueChange={onSeek}
          className="w-full"
          disabled={!currentSong || duration === 0}
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Player Controls */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          {/* Album Art */}
          <div className="relative flex-shrink-0">
            <div
              className={`w-12 h-12 rounded-lg bg-muted overflow-hidden transition-all duration-300 ${
                isTransitioning ? "scale-95 opacity-70" : "scale-100 opacity-100"
              }`}
            >
              {currentSong.albumArt ? (
                <img
                  src={currentSong.albumArt || "/placeholder.svg"}
                  alt={`${currentSong.title} album art`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = "none"
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  <div className="w-6 h-6 rounded bg-primary/20" />
                </div>
              )}
            </div>
            {isTransitioning && <div className="absolute inset-0 bg-background/20 rounded-lg animate-pulse" />}
          </div>

          {/* Song Info */}
          <div className="flex-1 min-w-0">
            <div
              className={`transition-all duration-300 ${
                isTransitioning ? "translate-x-2 opacity-70" : "translate-x-0 opacity-100"
              }`}
            >
              <h3 className="font-medium text-sm truncate">{currentSong.title || "Unknown Title"}</h3>
              <p className="text-xs text-muted-foreground truncate">{currentSong.artist || "Unknown Artist"}</p>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={onSkipPrevious} className="h-8 w-8">
              <SkipBack className="h-4 w-4" />
            </Button>

            <Button onClick={onPlayPause} size="icon" className="h-10 w-10 shadow-lg" disabled={isTransitioning}>
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>

            <Button variant="ghost" size="icon" onClick={onSkipNext} className="h-8 w-8">
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 ml-2">
            <Button variant="ghost" size="icon" onClick={onLyricsClick} className="h-8 w-8">
              <Mic className="h-4 w-4" />
            </Button>

            {onNetworkSharingClick && (
              <Button variant="ghost" size="icon" onClick={onNetworkSharingClick} className="h-8 w-8">
                <Share2 className="h-4 w-4" />
              </Button>
            )}

            <Button variant="ghost" size="icon" onClick={onSettingsClick} className="h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Additional Info */}
        {currentSong.album && (
          <div className="mt-2 text-center">
            <p className="text-xs text-muted-foreground truncate">from {currentSong.album}</p>
          </div>
        )}
      </div>
    </div>
  )
}
