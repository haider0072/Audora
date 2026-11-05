/**
 * Minimal WAV files for tests: the RIFF header, an optional chunk ahead of
 * `fmt ` (as some tools write), the `fmt ` chunk, then a `data` chunk of
 * silence.
 */

function u16le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff]
}

function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]
}

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0))
}

/** The fixed tail of the KSDATAFORMAT_SUBTYPE GUIDs, after the format code. */
const SUBTYPE_GUID_TAIL = [0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71]

export interface WavFixture {
  sampleRate?: number
  /** Bits per sample in the container. */
  bitDepth?: number
  channels?: number
  /** Format code in `fmt `: 1 PCM, 3 floating point, 2 ADPCM, … */
  formatCode?: number
  /** Write WAVE_FORMAT_EXTENSIBLE, naming this many valid bits in the container. */
  extensibleValidBits?: number
  /** Size of a `JUNK` chunk ahead of `fmt `; none when absent. */
  leadingChunkBytes?: number
  dataBytes?: number
}

export function buildWav({
  sampleRate = 44_100,
  bitDepth = 16,
  channels = 2,
  formatCode = 1,
  extensibleValidBits,
  leadingChunkBytes,
  dataBytes = 1024,
}: WavFixture = {}): Uint8Array<ArrayBuffer> {
  const blockAlign = (channels * bitDepth) / 8
  const extensible = extensibleValidBits !== undefined
  const fmt = [
    ...u16le(extensible ? 0xfffe : formatCode),
    ...u16le(channels),
    ...u32le(sampleRate),
    ...u32le(sampleRate * blockAlign),
    ...u16le(blockAlign),
    ...u16le(bitDepth),
    ...(extensible
      ? [...u16le(22), ...u16le(extensibleValidBits), ...u32le(0x3), ...u16le(formatCode), ...SUBTYPE_GUID_TAIL]
      : []),
  ]

  const headers: number[] = []
  if (leadingChunkBytes !== undefined) {
    headers.push(...ascii("JUNK"), ...u32le(leadingChunkBytes), ...new Array(leadingChunkBytes).fill(0))
    if (leadingChunkBytes % 2 === 1) headers.push(0) // chunks are padded to an even length
  }
  headers.push(...ascii("fmt "), ...u32le(fmt.length), ...fmt)
  headers.push(...ascii("data"), ...u32le(dataBytes))

  // The data is silence, left as the zeros a new array holds.
  const riff = [...ascii("RIFF"), ...u32le(4 + headers.length + dataBytes), ...ascii("WAVE"), ...headers]
  const file = new Uint8Array(riff.length + dataBytes)
  file.set(riff)
  return file
}
