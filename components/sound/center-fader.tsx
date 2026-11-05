"use client"

import type { CSSProperties } from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

interface CenterFaderProps {
  value: number
  /** How far it moves either way from its centre, which is 0. */
  limit: number
  step: number
  onChange: (value: number) => void
  orientation: "vertical" | "horizontal"
  /** The fader's name, for a screen reader. */
  label: string
  /** The value as read out, such as "+1.5 dB". */
  valueText: string
  className?: string
}

/** The fill's place: from the centre, up or right for a boost, down or left for a cut. */
function fillStyle(value: number, limit: number, orientation: CenterFaderProps["orientation"]): CSSProperties {
  const share = `${(Math.min(Math.abs(value), limit) / limit) * 50}%`
  if (orientation === "vertical") return value >= 0 ? { bottom: "50%", height: share } : { top: "50%", height: share }
  return value >= 0 ? { left: "50%", width: share } : { right: "50%", width: share }
}

/**
 * A bipolar fader, as an equalizer's are: a hairline track marked at its
 * centre, 0, with the fill growing from there to the knob. Styled by
 * `.center-fader` in app/globals.css.
 */
export function CenterFader({ value, limit, step, onChange, orientation, label, valueText, className }: CenterFaderProps) {
  return (
    <SliderPrimitive.Root
      className={cn("center-fader", className)}
      orientation={orientation}
      min={-limit}
      max={limit}
      step={step}
      value={[value]}
      onValueChange={([next]) => onChange(next)}
    >
      <SliderPrimitive.Track className="center-fader-track">
        <span className="center-fader-fill" style={fillStyle(value, limit, orientation)} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="center-fader-knob" aria-label={label} aria-valuetext={valueText} />
    </SliderPrimitive.Root>
  )
}
