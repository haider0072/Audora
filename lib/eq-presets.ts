/**
 * Equalizer presets for the 10-band EQ
 * (32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz).
 *
 * `gains` are per-band dB values in band order; `preamp` is the manual
 * pre-EQ gain in dB (auto-headroom is applied on top by the audio engine,
 * so boost-heavy presets don't clip).
 */

export interface EqPreset {
  id: string
  name: string
  /** Per-band gain in dB, same order as DEFAULT_EQUALIZER_BANDS (10 entries). */
  gains: number[]
  /** Manual preamp in dB. */
  preamp: number
  /** Built-in presets can't be deleted or overwritten. */
  builtIn?: boolean
}

export const EQ_BAND_COUNT = 10

export const BUILT_IN_PRESETS: EqPreset[] = [
  { id: "flat", name: "Flat", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0, builtIn: true },
  { id: "my-eq", name: "My EQ", gains: [1.5, 2, 3, 0, -1.5, -1.5, 0, 1.5, 5.8, 5.8], preamp: 0, builtIn: true },
  { id: "bass-boost", name: "Bass Boost", gains: [5.5, 4.5, 3.5, 2.5, 1.5, 0, 0, 0, 0, 0], preamp: 0, builtIn: true },
  { id: "bass-reducer", name: "Bass Reducer", gains: [-5.5, -4.5, -3.5, -2.5, -1.5, 0, 0, 0, 0, 0], preamp: 0, builtIn: true },
  { id: "treble-boost", name: "Treble Boost", gains: [0, 0, 0, 0, 0, 1.5, 2.5, 3.5, 4.5, 5.5], preamp: 0, builtIn: true },
  { id: "vocal", name: "Vocal", gains: [-2, -3, -3, 1.5, 4, 4, 3, 1.5, 0, -1.5], preamp: 0, builtIn: true },
  { id: "rock", name: "Rock", gains: [5, 4, 3, 1.5, -0.5, -1, 0.5, 2.5, 3.5, 4.5], preamp: 0, builtIn: true },
  { id: "pop", name: "Pop", gains: [-1.5, -1, 0, 2, 4, 4, 2, 0, -1, -1.5], preamp: 0, builtIn: true },
  { id: "jazz", name: "Jazz", gains: [4, 3, 1.5, 2, -1.5, -1.5, 0, 1.5, 3, 4], preamp: 0, builtIn: true },
  { id: "classical", name: "Classical", gains: [4.5, 3.5, 3, 2.5, -1.5, -1.5, 0, 2.5, 3.5, 4], preamp: 0, builtIn: true },
  { id: "electronic", name: "Electronic", gains: [4.5, 4, 1.5, 0, -2, 2, 1, 1.5, 4, 5], preamp: 0, builtIn: true },
  { id: "acoustic", name: "Acoustic", gains: [5, 5, 4, 1, 2, 2, 3.5, 4, 3.5, 2], preamp: 0, builtIn: true },
]

/** Built-ins first, then the user's custom presets. */
export function getAllPresets(customPresets: EqPreset[]): EqPreset[] {
  return [...BUILT_IN_PRESETS, ...customPresets]
}

/** Sanitize a stored custom preset (defensive against hand-edited storage). */
export function isValidPreset(preset: unknown): preset is EqPreset {
  if (typeof preset !== "object" || preset === null) return false
  const p = preset as Partial<EqPreset>
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.preamp === "number" &&
    Array.isArray(p.gains) &&
    p.gains.length === EQ_BAND_COUNT &&
    p.gains.every((g) => typeof g === "number" && Number.isFinite(g))
  )
}
