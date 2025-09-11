'use client'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
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
} from 'lucide-react'
import { createLogger } from '@/lib/logger'

const logger = createLogger('PlayerControls')

interface PlayerControlsProps {
  isPlaying: boolean
  currentSong: any
  songs: any[]
  volume: number[]
  isMuted: boolean
  onPlayPause: () => void
  onSkipPrevious: () => void
  onSkipNext: () => void
  onVolumeChange: (value: number[]) => void
  onMute: () => void
  onOpenEqualizer: () => void
  onOpenLyrics: () => void
  onOpenYouTube: () => void
}

export function PlayerControls({
  isPlaying,
  currentSong,
  songs,
  volume,
  isMuted,
  onPlayPause,
  onSkipPrevious,
  onSkipNext,
  onVolumeChange,
  onMute,
  onOpenEqualizer,
  onOpenLyrics,
  onOpenYouTube,
}: PlayerControlsProps) {
  const handlePlayPause = () => {
    logger.debug('Play/pause button clicked', { isPlaying, currentSong: currentSong?.title })
    onPlayPause()
  }

  const handleSkipPrevious = () => {
    logger.debug('Skip previous button clicked')
    onSkipPrevious()
  }

  const handleSkipNext = () => {
    logger.debug('Skip next button clicked')
    onSkipNext()
  }

  const handleVolumeChange = (value: number[]) => {
    logger.debug('Volume changed', { volume: value[0] })
    onVolumeChange(value)
  }

  const handleMute = () => {
    logger.debug('Mute button clicked', { isMuted })
    onMute()
  }

  return (
    <div className="flex items-center justify-center gap-4">
      <Button 
        variant="outline" 
        size="icon" 
        onClick={handleSkipPrevious} 
        disabled={songs.length === 0}
        aria-label="Skip to previous track"
      >
        <SkipBack className="w-4 h-4" />
      </Button>
      
      <Button
        onClick={handlePlayPause}
        size="icon"
        className="w-14 h-14 shadow-lg"
        disabled={!currentSong}
        aria-label={isPlaying ? `Pause ${currentSong?.title}` : `Play ${currentSong?.title}`}
      >
        {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7" />}
      </Button>
      
      <Button 
        variant="outline" 
        size="icon" 
        onClick={handleSkipNext} 
        disabled={songs.length === 0}
        aria-label="Skip to next track"
      >
        <SkipForward className="w-4 h-4" />
      </Button>
      
      <Separator orientation="vertical" className="h-8" />
      
      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleMute}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </Button>
        <Slider 
          value={volume} 
          max={100} 
          step={1} 
          onValueChange={handleVolumeChange} 
          className="w-24"
          aria-label="Volume control"
        />
      </div>
      
      <Separator orientation="vertical" className="h-8" />
      
      <Button
        variant="outline"
        size="icon"
        onClick={onOpenEqualizer}
        aria-label="Open equalizer"
      >
        <Settings className="w-4 h-4" />
      </Button>
      
      <Button
        variant="outline"
        size="icon"
        onClick={onOpenLyrics}
        disabled={!currentSong}
        aria-label="Show lyrics"
      >
        <Mic className="w-4 h-4" />
      </Button>
      
      <Button
        variant="outline"
        size="icon"
        onClick={onOpenYouTube}
        disabled={!currentSong}
        aria-label="Watch music video"
      >
        <Youtube className="w-4 h-4" />
      </Button>
    </div>
  )
}