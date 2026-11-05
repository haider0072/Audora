/** The equalizer's values as the Sound sheet sets them: decibels, frequencies, and the headroom they take. */

const MINUS = "−"

/** A gain in dB to one decimal, signed the way audio gear marks it: +1.5, −1.5, 0.0. */
export function formatDb(db: number): string {
  const rounded = Math.round(db * 10) / 10
  if (rounded > 0) return `+${rounded.toFixed(1)}`
  if (rounded < 0) return `${MINUS}${Math.abs(rounded).toFixed(1)}`
  return "0.0"
}

/** A gain typed in, with a typed or a typographic minus; null for anything that isn't a number. */
export function parseDb(raw: string): number | null {
  const text = raw.trim().replace(/[−–]/g, "-").replace(/\s*dB$/i, "")
  if (text === "") return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

/** A band's frequency as a fader's label: 32, 500, 1k, 16k. */
export function formatFrequency(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz)
}

/**
 * What the engine does to keep the equalizer from clipping, in a line: it
 * turns the signal down before the equalizer by the largest boost, and by
 * the lift normalization gives a quiet song (hooks/use-audio-engine.ts,
 * `updateGainStructure`). The preamp is applied on top of that, so a
 * positive one is the one thing that can still clip.
 */
export function describeHeadroom(gains: readonly number[], preampDb: number, normalization: boolean): string {
  const boost = Math.max(0, ...gains)
  const parts = [boost > 0 ? `Headroom ${formatDb(-boost)} dB for the largest boost` : "No boost, so no headroom taken"]
  if (normalization) parts.push("more for a song normalization lifts")
  parts.push(preampDb > 0 ? `the preamp's ${formatDb(preampDb)} dB can clip` : "no clipping, no limiter")
  return parts.join(" · ")
}
