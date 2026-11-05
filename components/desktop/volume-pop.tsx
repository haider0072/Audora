"use client"

import { Volume2, VolumeX } from "lucide-react"

import { TransportButton } from "@/components/player/transport-button"
import { VolumeSlider } from "@/components/player/volume-slider"

interface VolumePopProps {
  volume: number[]
  isMuted: boolean
  onVolumeChange: (value: number[]) => void
  onToggleMute: () => void
}

/**
 * The volume, collapsed to its speaker at the end of the transport: pressing
 * it mutes, and a fader rises over it while the pointer or focus is there,
 * the speaker's next stop for the keyboard. Styled by `.volume-pop`.
 */
export function VolumePop({ volume, isMuted, onVolumeChange, onToggleMute }: VolumePopProps) {
  // A saved volume of nothing is as silent as a mute, and reads as one.
  const silent = isMuted || volume[0] === 0
  return (
    <div className="volume-pop">
      <TransportButton label={silent ? "Unmute" : "Mute"} size="lg" onClick={onToggleMute} className="stage-quiet">
        {silent ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </TransportButton>
      <div className="volume-pop-panel">
        <VolumeSlider
          orientation="vertical"
          className="volume-pop-fader"
          value={volume}
          onValueChange={onVolumeChange}
          muted={isMuted}
        />
      </div>
    </div>
  )
}
