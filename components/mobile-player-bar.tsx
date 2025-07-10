"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Play, Pause, SkipBack, SkipForward, Settings, Music, Mic } from "lucide-react"
import { AlbumArtDisplay } from "./album-art-display"

interface Song {
  id: string
  title?: string
  artist?: string
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
  isTransitioning?: boolean
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
  isTransitioning = false,
}: MobilePlayerBarProps) {
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  if (!currentSong) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t">
        <div className="p-4 text-center text-muted-foreground">
          <Music className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No song selected</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t">
      {/* Progress Bar */}
      {duration > 0 && (
        <div className="px-4 pt-2">
          <Slider value={[currentTime]} max={duration} step={1} onValueChange={onSeek} className="w-full h-1" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}

      {/* Player Controls */}
      <div className="flex items-center gap-3 p-4">
        {/* Album Art and Song Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <AlbumArtDisplay
            songId={currentSong.id}
            albumArt={currentSong.albumArt}
            title={`${currentSong.title} album art`}
            size="small"
            isTransitioning={isTransitioning}
            className="transition-transform duration-300 ease-out"
          />

          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm truncate">{currentSong.title || "Unknown Title"}</h4>
            <p className="text-xs text-muted-foreground truncate">{currentSong.artist || "Unknown Artist"}</p>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onSkipPrevious} className="h-8 w-8">
            <SkipBack className="w-4 h-4" />
          </Button>

          <Button onClick={onPlayPause} size="icon" className="h-10 w-10">
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>

          <Button variant="ghost" size="icon" onClick={onSkipNext} className="h-8 w-8">
            <SkipForward className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="icon" onClick={onLyricsClick} className="h-8 w-8">
            <Mic className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="icon" onClick={onSettingsClick} className="h-8 w-8">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
