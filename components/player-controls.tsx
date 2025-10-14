import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Settings,
  Mic,
  Youtube,
} from "lucide-react"

export interface PlayerControlsProps {
  // State
  isPlaying: boolean
  currentSong: any
  volume: number[]
  isMuted: boolean
  songsLength: number

  // Actions
  onPlayPause: () => void
  onNext: () => void
  onPrevious: () => void
  onVolumeChange: (value: number[]) => void
  onMute: () => void
  onOpenEqualizer: () => void
  onOpenLyrics: () => void
  onOpenYoutube: () => void

  // Optional styling
  className?: string
}

/**
 * Player controls component
 *
 * Provides:
 * - Play/pause button
 * - Skip forward/back buttons
 * - Volume control slider
 * - Mute button
 * - Equalizer, lyrics, and YouTube buttons
 * - Keyboard shortcuts info
 */
export function PlayerControls({
  isPlaying,
  currentSong,
  volume,
  isMuted,
  songsLength,
  onPlayPause,
  onNext,
  onPrevious,
  onVolumeChange,
  onMute,
  onOpenEqualizer,
  onOpenLyrics,
  onOpenYoutube,
  className,
}: PlayerControlsProps) {
  return (
    <div className={`space-y-6 ${className || ""}`}>
      {/* Main playback controls */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" onClick={onPrevious} disabled={songsLength === 0}>
          <SkipBack className="w-4 h-4" />
        </Button>

        <Button
          onClick={onPlayPause}
          size="icon"
          className="w-14 h-14 shadow-lg"
          disabled={!currentSong}
        >
          {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7" />}
        </Button>

        <Button variant="outline" size="icon" onClick={onNext} disabled={songsLength === 0}>
          <SkipForward className="w-4 h-4" />
        </Button>

        <Separator orientation="vertical" className="h-8" />

        {/* Volume controls */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onMute}>
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <Slider value={volume} max={100} step={1} onValueChange={onVolumeChange} className="w-24" />
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Additional controls */}
        <Button variant="outline" size="icon" onClick={onOpenEqualizer}>
          <Settings className="w-4 h-4" />
        </Button>

        <Button variant="outline" size="icon" onClick={onOpenLyrics} disabled={!currentSong}>
          <Mic className="w-4 h-4" />
        </Button>

        <Button variant="outline" size="icon" onClick={onOpenYoutube} disabled={!currentSong}>
          <Youtube className="w-4 h-4" />
        </Button>
      </div>

      {/* Keyboard shortcuts info */}
      <div className="text-xs text-muted-foreground text-center space-y-1">
        <p>Media keys: Play/Pause • Next/Previous • Volume Up/Down • Mute</p>
        <p>Shortcuts: Space (play/pause) • F7-F12 (media controls) • Ctrl/Cmd + arrows</p>
      </div>
    </div>
  )
}
