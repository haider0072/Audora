/**
 * Minimal, valid FLAC files for tests: STREAMINFO (44.1 kHz, 180 s), Vorbis
 * comments, an optional front cover, then filler standing in for audio.
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
  /** Bytes of stand-in audio after the metadata. */
  audioBytes?: number
}

export const FIXTURE_DURATION_SECONDS = 180

export function buildFlac({
  tags = { TITLE: "Kun Faya Kun", ARTIST: "A.R. Rahman", ALBUM: "Rockstar" },
  cover,
  audioBytes = 4096,
}: FlacFixture = {}): Uint8Array<ArrayBuffer> {
  const sampleRate = 44_100
  const totalSamples = sampleRate * FIXTURE_DURATION_SECONDS
  const streamInfo = [
    0x10, 0x00, 0x10, 0x00, // min/max block size
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // min/max frame size
    (sampleRate >> 12) & 0xff,
    (sampleRate >> 4) & 0xff,
    ((sampleRate & 0x0f) << 4) | (1 << 1), // 2 channels, bps high bit 0
    (15 << 4) | 0, // 16-bit, total samples high nibble 0
    ...u32be(totalSamples),
    ...new Array(16).fill(0), // MD5
  ]

  const comments = Object.entries(tags).map(([name, value]) => ascii(`${name}=${value}`))
  const vendor = ascii("test")
  const vorbis = [
    ...u32le(vendor.length), ...vendor,
    ...u32le(comments.length),
    ...comments.flatMap((bytes) => [...u32le(bytes.length), ...bytes]),
  ]

  const blocks: ArrayLike<number>[] = [ascii("fLaC"), blockHeader(0, streamInfo.length), streamInfo]
  if (cover) {
    const mime = ascii("image/jpeg")
    const pictureHead = [
      ...u32be(3), // front cover
      ...u32be(mime.length), ...mime,
      ...u32be(0), // empty description
      ...u32be(500), ...u32be(500), ...u32be(24), ...u32be(0),
      ...u32be(cover.length),
    ]
    blocks.push(blockHeader(4, vorbis.length), vorbis)
    blocks.push(blockHeader(6, pictureHead.length + cover.length, true), pictureHead, cover)
  } else {
    blocks.push(blockHeader(4, vorbis.length, true), vorbis)
  }
  blocks.push(new Uint8Array(audioBytes).fill(0xaa))
  return concat(blocks)
}
