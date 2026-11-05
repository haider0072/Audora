"use client"

import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

interface VolumeSliderProps {
  value: number[]
  onValueChange: (value: number[]) => void
  /** Muted: the level keeps its place but dims, since unmuting brings it back. */
  muted?: boolean
  /** Across, as in a bar, or up, as a fader. */
  orientation?: "horizontal" | "vertical"
  className?: string
}

/**
 * The volume: a thin track whose knob shows under the pointer or the
 * keyboard. Styled by `.volume` in app/globals.css.
 */
export function VolumeSlider({ value, onValueChange, muted = false, orientation = "horizontal", className }: VolumeSliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn("volume", className)}
      value={value}
      max={100}
      step={1}
      orientation={orientation}
      onValueChange={onValueChange}
      data-muted={muted || undefined}
    >
      <SliderPrimitive.Track className="volume-track">
        <SliderPrimitive.Range className="volume-range" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="volume-thumb" aria-label="Volume" aria-valuetext={muted ? "Muted" : `${value[0]}%`} />
    </SliderPrimitive.Root>
  )
}
