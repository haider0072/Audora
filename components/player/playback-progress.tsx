'use client'

import { Slider } from '@/components/ui/slider'
import { createLogger } from '@/lib/logger'

const logger = createLogger('PlaybackProgress')

interface PlaybackProgressProps {
  currentTime: number
  duration: number
  onSeek: (value: number[]) => void
}

export function PlaybackProgress({ currentTime, duration, onSeek }: PlaybackProgressProps) {
  const handleSeek = (value: number[]) => {
    logger.debug('Seeking to position', { time: value[0], duration })
    onSeek(value)
  }

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '0:00'
    
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (duration <= 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <Slider
        value={[currentTime]}
        max={duration}
        step={1}
        onValueChange={handleSeek}
        className="w-full"
        aria-label="Playback progress"
      />
      <div className="flex justify-between text-sm text-muted-foreground">
        <span aria-label="Current time">{formatTime(currentTime)}</span>
        <span aria-label="Total duration">{formatTime(duration)}</span>
      </div>
    </div>
  )
}