import { Slider } from "@/components/ui/slider"

export interface ProgressBarProps {
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  className?: string
}

/**
 * Progress bar component for audio playback
 *
 * Displays current playback position with time labels
 * and allows seeking to different positions
 */
export function ProgressBar({ currentTime, duration, onSeek, className }: ProgressBarProps) {
  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00"
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const handleSeek = (value: number[]) => {
    onSeek(value[0])
  }

  if (duration <= 0) {
    return null
  }

  return (
    <div className={`space-y-2 ${className || ""}`}>
      <Slider
        value={[currentTime]}
        max={duration}
        step={1}
        onValueChange={handleSeek}
        className="w-full"
      />
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}
