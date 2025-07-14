"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Play, Pause, SkipBack, SkipForward, Settings, Mic, Share2, Music, Volume2, VolumeX, Youtube } from "lucide-react"

interface Song {
  id: string
  title?: string
  artist?: string
  album?: string
  duration?: number
  format?: string
  isHiRes?: boolean
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
  onNetworkSharingClick: () => void
  onVideoClick: () => void
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
  onNetworkSharingClick,
  onVideoClick,
  isTransitioning = false,
}: MobilePlayerBarProps) {
  const [showVolumeControl, setShowVolumeControl] = useState(false)
  const [volume, setVolume] = useState([80])
  const [isMuted, setIsMuted] = useState(false)

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00"
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const formatBitrate = (bitrate?: number) => {
    if (!bitrate) return ""
    return bitrate >= 1000 ? `${(bitrate / 1000).toFixed(1)}M` : `${Math.round(bitrate)}k`
  }

  // Auto-hide volume control after 3 seconds of inactivity
  useEffect(() => {
    if (showVolumeControl) {
      const timer = setTimeout(() => {
        setShowVolumeControl(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [showVolumeControl, volume])

  const handleVolumeToggle = () => {
    setShowVolumeControl(!showVolumeControl)
  }

  const handleVolumeChange = (value: number[]) => {
    setVolume(value)
    // In a real implementation, this would control the actual audio volume
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
    // In a real implementation, this would mute/unmute the audio
  }

  if (!currentSong) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border p-4 safe-area-pb">
        <div className="flex items-center justify-center text-muted-foreground">
          <Music className="w-5 h-5 mr-2" />
          <span className="text-sm">No song selected</span>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border safe-area-pb">
      {/* Progress Bar */}
      <div className="px-4 pt-2">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={1}
          onValueChange={onSeek}
          className="w-full h-1"
          disabled={!duration || isTransitioning}
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Main Player Controls */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Album Art */}
          <div className="relative flex-shrink-0">
            <div
              className={`w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden transition-all duration-300 ${
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
                <Music className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Song Info */}
          <div className="flex-1 min-w-0">
            <div
              className={`transition-all duration-300 ${
                isTransitioning ? "translate-x-2 opacity-70" : "translate-x-0 opacity-100"
              }`}
            >
              <h3 className="font-semibold text-sm truncate leading-tight">{currentSong.title || "Unknown Title"}</h3>
              <p className="text-xs text-muted-foreground truncate">{currentSong.artist || "Unknown Artist"}</p>
              <div className="flex items-center gap-2 mt-1">
                {currentSong.isHiRes && (
                  <Badge
                    variant="secondary"
                    className="text-xs px-1.5 py-0.5 h-auto bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                  >
                    Hi-Res
                  </Badge>
                )}
                {currentSong.format && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0.5 h-auto">
                    {currentSong.format.toUpperCase()}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onSkipPrevious} disabled={isTransitioning}>
              <SkipBack className="w-4 h-4" />
            </Button>

            <Button
              variant="default"
              size="icon"
              className="w-10 h-10 rounded-full shadow-lg"
              onClick={onPlayPause}
              disabled={isTransitioning}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </Button>

            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onSkipNext} disabled={isTransitioning}>
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Secondary Controls */}
        <div className="flex items-center justify-between mt-3">
          {/* Left Controls */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleVolumeToggle}>
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>

            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onLyricsClick}>
              <Mic className="w-4 h-4" />
            </Button>

            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onVideoClick}>
              <Youtube className="w-4 h-4" />
            </Button>
          </div>

          {/* Center - Network Sharing */}
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onNetworkSharingClick}>
            <Share2 className="w-4 h-4" />
          </Button>

          {/* Right Controls */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onSettingsClick}>
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Volume Control Slider */}
        {showVolumeControl && (
          <div className="mt-3 px-2">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="w-6 h-6" onClick={toggleMute}>
                  {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </Button>
                <Slider
                  value={isMuted ? [0] : volume}
                  max={100}
                  step={1}
                  onValueChange={handleVolumeChange}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-8 text-right">{isMuted ? 0 : volume[0]}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
