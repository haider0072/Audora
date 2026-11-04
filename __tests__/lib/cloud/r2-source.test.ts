import { TextDecoder as NodeTextDecoder } from "node:util"

import { MetadataExtractor } from "@/lib/metadata-extractor"
import type { R2Client } from "@/lib/cloud/r2"
import { R2RangeSource, mimeTypeForName } from "@/lib/cloud/r2-source"

// The indexer runs on the server, where TextDecoder is global; jsdom lacks it.
Object.assign(globalThis, { TextDecoder: globalThis.TextDecoder ?? NodeTextDecoder })

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

/** A minimal FLAC: STREAMINFO (44.1 kHz, 180 s), Vorbis comments, a cover, then "audio". */
function buildFlac(cover: number[], audioBytes: number): Uint8Array {
  const sampleRate = 44_100
  const totalSamples = sampleRate * 180
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

  const comments = ["TITLE=Kun Faya Kun", "ARTIST=A.R. Rahman", "ALBUM=Rockstar"]
  const vendor = ascii("test")
  const vorbis = [
    ...u32le(vendor.length), ...vendor,
    ...u32le(comments.length),
    ...comments.flatMap((comment) => {
      const bytes = ascii(comment)
      return [...u32le(bytes.length), ...bytes]
    }),
  ]

  const mime = ascii("image/jpeg")
  const picture = [
    ...u32be(3), // front cover
    ...u32be(mime.length), ...mime,
    ...u32be(0), // empty description
    ...u32be(500), ...u32be(500), ...u32be(24), ...u32be(0),
    ...u32be(cover.length), ...cover,
  ]

  return new Uint8Array([
    ...ascii("fLaC"),
    ...blockHeader(0, streamInfo.length), ...streamInfo,
    ...blockHeader(4, vorbis.length), ...vorbis,
    ...blockHeader(6, picture.length, true), ...picture,
    ...new Array(audioBytes).fill(0xaa),
  ])
}

function fakeClient(bytes: Uint8Array) {
  const readRange = jest.fn(async (_key: string, start: number, end: number) => bytes.slice(start, end + 1))
  return { client: { readRange } as unknown as R2Client, readRange }
}

describe("R2RangeSource", () => {
  it("lets the extractor read tags, duration and cover from the head of a cloud FLAC", async () => {
    const cover = [0xff, 0xd8, 0xff, 0xe0, ...new Array(300_000).fill(0x11)]
    const flac = buildFlac(cover, 2_000_000)
    const { client, readRange } = fakeClient(flac)

    const source = new R2RangeSource(client, "library/Kun Faya Kun.flac", "Kun Faya Kun.flac", flac.length)
    const { metadata, albumArt } = await MetadataExtractor.extractFromSource(source)

    expect(metadata.title).toBe("Kun Faya Kun")
    expect(metadata.artist).toBe("A.R. Rahman")
    expect(metadata.album).toBe("Rockstar")
    expect(metadata.duration).toBeCloseTo(180, 5)
    expect(metadata.format).toBe("FLAC")
    expect(metadata.albumArt).toBeUndefined()
    expect(albumArt?.data.length).toBe(cover.length)
    expect(albumArt?.data[0]).toBe(0xff)

    // A 300 KB cover takes the head past one read-ahead chunk, but never
    // anywhere near the 2 MB of audio behind it.
    expect(readRange.mock.calls.length).toBeLessThanOrEqual(3)
    const furthest = Math.max(...readRange.mock.calls.map(([, , end]) => end))
    expect(furthest).toBeLessThan(flac.length - 1_000_000)
  })

  it("clamps reads to the object and answers past-the-end slices with nothing", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const { client } = fakeClient(bytes)
    const source = new R2RangeSource(client, "library/x.mp3", "x.mp3", bytes.length)

    expect([...new Uint8Array(await source.slice(1, 3).arrayBuffer())]).toEqual([2, 3])
    expect([...new Uint8Array(await source.slice(3, 99).arrayBuffer())]).toEqual([4, 5])
    expect(new Uint8Array(await source.slice(10, 20).arrayBuffer()).length).toBe(0)
  })

  it("fails instead of spinning when the object is shorter than listed", async () => {
    const { client } = fakeClient(new Uint8Array([1, 2]))
    const source = new R2RangeSource(client, "library/x.mp3", "x.mp3", 10)
    await expect(source.slice(0, 10).arrayBuffer()).rejects.toThrow("Unexpected end")
  })
})

describe("mimeTypeForName", () => {
  it("maps audio extensions and falls back for the rest", () => {
    expect(mimeTypeForName("a.FLAC")).toBe("audio/flac")
    expect(mimeTypeForName("a.mp3")).toBe("audio/mpeg")
    expect(mimeTypeForName("a.xyz")).toBe("application/octet-stream")
  })
})
