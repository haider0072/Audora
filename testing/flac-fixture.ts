/**
 * Minimal, valid FLAC files for tests: STREAMINFO (16-bit stereo at 44.1 kHz
 * for 180 s unless asked otherwise), Vorbis comments, an optional front cover
 * and padding, then filler standing in for audio.
 */

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function u32le(value: number): number[] {
  return u32be(value).reverse()
}

function blockHeader(type: number, length: number, last = false): number[] {
  return [(last ? 0x80 : 0) | type, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff]
}

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0))
}

function concat(parts: ArrayLike<number>[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export interface FlacFixture {
  tags?: Record<string, string>
  /** Embedded front cover bytes; omitted for a file without art. */
  cover?: ArrayLike<number>
  /** A PADDING block of this many bytes after the others, as encoders leave for later tag edits. */
  paddingBytes?: number
  /** Bytes of stand-in audio after the metadata. */
  audioBytes?: number
  sampleRate?: number
  bitDepth?: number
  channels?: number
  durationSeconds?: number
}

export const FIXTURE_DURATION_SECONDS = 180

export function buildFlac({
  tags = { TITLE: "Kun Faya Kun", ARTIST: "A.R. Rahman", ALBUM: "Rockstar" },
  cover,
  paddingBytes,
  audioBytes = 4096,
  sampleRate = 44_100,
  bitDepth = 16,
  channels = 2,
  durationSeconds = FIXTURE_DURATION_SECONDS,
}: FlacFixture = {}): Uint8Array<ArrayBuffer> {
  const totalSamples = sampleRate * durationSeconds
  const streamInfo = [
    0x10, 0x00, 0x10, 0x00, // min/max block size
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // min/max frame size
    // 20 bits of sample rate, 3 of channels - 1, 5 of bits per sample - 1, 36 of total samples
    (sampleRate >> 12) & 0xff,
    (sampleRate >> 4) & 0xff,
    ((sampleRate & 0x0f) << 4) | ((channels - 1) << 1) | (((bitDepth - 1) >> 4) & 0x01),
    (((bitDepth - 1) & 0x0f) << 4) | (Math.floor(totalSamples / 2 ** 32) & 0x0f),
    ...u32be(totalSamples >>> 0),
    ...new Array(16).fill(0), // MD5
  ]

  const comments = Object.entries(tags).map(([name, value]) => ascii(`${name}=${value}`))
  const vendor = ascii("test")
  const vorbis = [
    ...u32le(vendor.length), ...vendor,
    ...u32le(comments.length),
    ...comments.flatMap((bytes) => [...u32le(bytes.length), ...bytes]),
  ]

  /** Metadata blocks as [type, body], in file order. */
  const metadata: Array<[number, ArrayLike<number>]> = [[0, streamInfo], [4, vorbis]]
  if (cover) {
    const mime = ascii("image/jpeg")
    const pictureHead = [
      ...u32be(3), // front cover
      ...u32be(mime.length), ...mime,
      ...u32be(0), // empty description
      ...u32be(500), ...u32be(500), ...u32be(24), ...u32be(0),
      ...u32be(cover.length),
    ]
    metadata.push([6, concat([pictureHead, cover])])
  }
  if (paddingBytes !== undefined) metadata.push([1, new Uint8Array(paddingBytes)])

  const blocks: ArrayLike<number>[] = [ascii("fLaC")]
  metadata.forEach(([type, body], index) => {
    blocks.push(blockHeader(type, body.length, index === metadata.length - 1), body)
  })
  blocks.push(new Uint8Array(audioBytes).fill(0xaa))
  return concat(blocks)
}
