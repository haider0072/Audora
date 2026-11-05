"use client"

import { Volume2, VolumeX } from "lucide-react"

import { TransportButton } from "@/components/player/transport-button"
import { VolumeSlider } from "@/components/player/volume-slider"

interface HeaderVolumeProps {
  volume: number[]
  isMuted: boolean
  onVolumeChange: (value: number[]) => void
  onToggleMute: () => void
}

/**
 * The volume, in the header with the other tools rather than under the
 * cover: the mute, and a slider that gives way first when the header is
 * narrow. Styled by `.header-volume`.
 */
export function HeaderVolume({ volume, isMuted, onVolumeChange, onToggleMute }: HeaderVolumeProps) {
  // A saved volume of nothing is as silent as a mute, and reads as one.
  const silent = isMuted || volume[0] === 0
  return (
    <div className="header-volume">
      <TransportButton label={silent ? "Unmute" : "Mute"} size="md" onClick={onToggleMute} className="header-icon">
        {silent ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </TransportButton>
      <VolumeSlider className="header-volume-slider" value={volume} onValueChange={onVolumeChange} muted={isMuted} />
    </div>
  )
}
