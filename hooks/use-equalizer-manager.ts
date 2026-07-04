import { useState, useCallback } from "react"
import { rampToValue } from "@/lib/audio-params"
import type { EqualizerBand } from "@/components/refined-equalizer"

export interface UseEqualizerManagerOptions {
  equalizerBands: EqualizerBand[]
  setEqualizerBands: React.Dispatch<React.SetStateAction<EqualizerBand[]>>
  filterNodes: BiquadFilterNode[]
}

export interface UseEqualizerManagerReturn {
  showEqualizer: boolean
  setShowEqualizer: (show: boolean) => void
  updateBand: (index: number, gain: number) => void
  applyBands: (gains: number[]) => void
  resetEqualizer: () => void
}

/**
 * Q for the peaking bands. The 10 bands are spaced one octave apart
 * (32…16k), and Q = √2 ≈ 1.41 gives each peaking filter a one-octave
 * bandwidth — the standard for graphic octave EQs, so adjacent bands meet
 * without gaps or excessive overlap. The shelf endpoints (32 Hz / 16 kHz)
 * ignore Q by spec.
 */
export const PEAKING_Q = 1.41

export const DEFAULT_EQUALIZER_BANDS: EqualizerBand[] = [
  { frequency: 32, gain: 0, label: "32Hz" },
  { frequency: 64, gain: 0, label: "64Hz" },
  { frequency: 125, gain: 0, label: "125Hz" },
  { frequency: 250, gain: 0, label: "250Hz" },
  { frequency: 500, gain: 0, label: "500Hz" },
  { frequency: 1000, gain: 0, label: "1kHz" },
  { frequency: 2000, gain: 0, label: "2kHz" },
  { frequency: 4000, gain: 0, label: "4kHz" },
  { frequency: 8000, gain: 0, label: "8kHz" },
  { frequency: 16000, gain: 0, label: "16kHz" },
]

/**
 * Custom hook for managing equalizer state and filter updates
 *
 * Handles:
 * - Filter node gain updates (ramped — direct value writes cause zipper noise)
 * - Applying a full set of band gains at once (presets)
 * - Equalizer UI visibility
 * - Reset functionality
 */
export function useEqualizerManager(options: UseEqualizerManagerOptions): UseEqualizerManagerReturn {
  const { equalizerBands, setEqualizerBands, filterNodes } = options

  const [showEqualizer, setShowEqualizer] = useState(false)

  /**
   * Update a specific equalizer band and apply to filter node
   */
  const updateBand = useCallback(
    (index: number, gain: number) => {
      setEqualizerBands((prev) => {
        const newBands = [...prev]
        newBands[index] = { ...newBands[index], gain }
        return newBands
      })

      // Update the corresponding Web Audio API filter node (not React state).
      const filter = filterNodes[index]
      if (filter) {
        rampToValue(filter.gain, filter.context, gain)
      }
    },
    [setEqualizerBands, filterNodes]
  )

  /**
   * Apply a full set of band gains at once (used by presets)
   */
  const applyBands = useCallback(
    (gains: number[]) => {
      setEqualizerBands((prev) =>
        prev.map((band, index) => (gains[index] != null ? { ...band, gain: gains[index] } : band))
      )

      filterNodes.forEach((filter, index) => {
        if (gains[index] != null) {
          rampToValue(filter.gain, filter.context, gains[index])
        }
      })
    },
    [setEqualizerBands, filterNodes]
  )

  /**
   * Reset all equalizer bands to 0 gain
   */
  const resetEqualizer = useCallback(() => {
    setEqualizerBands((prev) => prev.map((band) => ({ ...band, gain: 0 })))

    filterNodes.forEach((filter) => {
      rampToValue(filter.gain, filter.context, 0)
    })
  }, [setEqualizerBands, filterNodes])

  return {
    showEqualizer,
    setShowEqualizer,
    updateBand,
    applyBands,
    resetEqualizer,
  }
}
