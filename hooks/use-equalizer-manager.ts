import { useState, useCallback } from "react"
import type { EqualizerBand } from "@/components/refined-equalizer"

export interface UseEqualizerManagerOptions {
  initialBands?: EqualizerBand[]
  filterNodes: BiquadFilterNode[]
}

export interface UseEqualizerManagerReturn {
  equalizerBands: EqualizerBand[]
  showEqualizer: boolean
  setShowEqualizer: (show: boolean) => void
  updateBand: (index: number, gain: number) => void
  resetEqualizer: () => void
  setEqualizerBands: (bands: EqualizerBand[]) => void
}

const DEFAULT_BANDS: EqualizerBand[] = [
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
 * - Equalizer band configuration
 * - Filter node gain updates
 * - Equalizer UI visibility
 * - Reset functionality
 */
export function useEqualizerManager(options: UseEqualizerManagerOptions): UseEqualizerManagerReturn {
  const { initialBands = DEFAULT_BANDS, filterNodes } = options

  const [equalizerBands, setEqualizerBands] = useState<EqualizerBand[]>(initialBands)
  const [showEqualizer, setShowEqualizer] = useState(false)

  /**
   * Update a specific equalizer band and apply to filter node
   */
  const updateBand = useCallback(
    (index: number, gain: number) => {
      const newBands = [...equalizerBands]
      newBands[index].gain = gain
      setEqualizerBands(newBands)

      // Update the corresponding filter node
      if (filterNodes[index]) {
        filterNodes[index].gain.value = gain
      }
    },
    [equalizerBands, filterNodes]
  )

  /**
   * Reset all equalizer bands to 0 gain
   */
  const resetEqualizer = useCallback(() => {
    const resetBands = equalizerBands.map((band) => ({ ...band, gain: 0 }))
    setEqualizerBands(resetBands)

    // Reset all filter nodes
    filterNodes.forEach((filter) => {
      filter.gain.value = 0
    })
  }, [equalizerBands, filterNodes])

  return {
    equalizerBands,
    showEqualizer,
    setShowEqualizer,
    updateBand,
    resetEqualizer,
    setEqualizerBands,
  }
}
