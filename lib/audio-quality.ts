/**
 * A song's audio quality as the quality meter shows it: three bars for
 * hi-res, two for CD-quality lossless, one for lossy, beside the figures that
 * earn them. Pure, and built only from what a file's header states, so a song
 * whose header has not been read shows no meter rather than a guess.
 */

import { STREAM_INFO_FORMATS } from "@/lib/stream-info"

export type QualityTier = "hi-res" | "lossless" | "lossy"

export const QUALITY_TIER_NAMES: Record<QualityTier, string> = {
  "hi-res": "Hi-Res",
  lossless: "Lossless",
  lossy: "Lossy",
}

export interface AudioQuality {
  tier: QualityTier
  /**
   * Bit depth and sample rate, "24/96", for lossless audio. Lossy audio has
   * none: its bitrate is an estimate from the first frame, which a VBR file
   * does not keep to, so it is not shown as fact.
   */
  figures?: string
  /** The format as the file names it: "FLAC", "MP3". */
  format: string
}

export interface QualitySource {
  format?: string
  bitDepth?: number
  sampleRate?: number
  /** Average kbps of the audio alone. */
  bitrate?: number
}

/** Formats that are always lossy. M4A is not one: it holds AAC and ALAC alike. */
const LOSSY_FORMATS = new Set(["MP3", "AAC", "OGG", "OPUS"])

/**
 * CD audio is 16 bits at 44.1 kHz, and 16 bits at 48 kHz is the same class.
 * Hi-res is anything lossless beyond it: more bits, or a higher sample rate.
 */
const CD_CLASS_BIT_DEPTH = 16
const CD_CLASS_MAX_SAMPLE_RATE = 48_000

/** A sample rate in kHz without trailing zeros: 44100 → "44.1", 96000 → "96", 22050 → "22.05". */
export function formatKilohertz(sampleRate: number): string {
  return String(Number((sampleRate / 1000).toFixed(3)))
}

export function qualityOf({ format, bitDepth, sampleRate }: QualitySource): AudioQuality | null {
  const name = format?.toUpperCase()
  if (!name) return null

  if (LOSSY_FORMATS.has(name)) return { tier: "lossy", format: name }
  if (STREAM_INFO_FORMATS.has(name) && bitDepth && sampleRate) {
    const hiRes = bitDepth > CD_CLASS_BIT_DEPTH || sampleRate > CD_CLASS_MAX_SAMPLE_RATE
    return { tier: hiRes ? "hi-res" : "lossless", figures: `${bitDepth}/${formatKilohertz(sampleRate)}`, format: name }
  }
  return null
}
