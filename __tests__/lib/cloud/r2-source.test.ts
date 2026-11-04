/**
 * @jest-environment node
 */
import { ByteSourceReadError, MetadataExtractor } from "@/lib/metadata-extractor"
import type { R2Client } from "@/lib/cloud/r2"
import { R2RangeSource } from "@/lib/cloud/r2-source"
import { buildFlac } from "@/testing/flac-fixture"

function fakeClient(bytes: Uint8Array) {
  const readRange = jest.fn(async (_key: string, start: number, end: number) => bytes.slice(start, end + 1))
  return { client: { readRange } as unknown as R2Client, readRange }
}

describe("R2RangeSource", () => {
  it("lets the extractor read tags, duration and cover from the head of a cloud FLAC", async () => {
    const cover = [0xff, 0xd8, 0xff, 0xe0, ...new Array(300_000).fill(0x11)]
    const flac = buildFlac({ cover, audioBytes: 2_000_000 })
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
    await expect(source.slice(0, 10).arrayBuffer()).rejects.toThrow(ByteSourceReadError)
  })

  it("surfaces a failed read instead of letting the extractor fall back to the file name", async () => {
    const readRange = jest.fn(async () => {
      throw new TypeError("fetch failed")
    })
    const source = new R2RangeSource({ readRange } as unknown as R2Client, "library/x.flac", "x.flac", 1000)

    // A placeholder here would be indexed as done and never retried.
    await expect(MetadataExtractor.extractFromSource(source)).rejects.toThrow(ByteSourceReadError)
  })

  it("stops reading a crafted header at the metadata bound instead of pulling in the whole file", async () => {
    // A FLAC whose first block claims to be 16 MB, followed by a chain of
    // further blocks — the reader must give up at the bound, not walk on.
    const size = 64 * 1024 * 1024
    const readRange = jest.fn(async (_key: string, start: number, end: number) => {
      const bytes = new Uint8Array(end - start + 1)
      for (let offset = 0; offset < bytes.length; offset++) {
        const absolute = start + offset
        if (absolute < 4) bytes[offset] = "fLaC".charCodeAt(absolute)
      }
      // Every block header, wherever it falls, says "not last, 16 MB long".
      for (let header = 4; header <= end; header += 4 + 0xffffff) {
        if (header >= start) bytes.set([0x01, 0xff, 0xff, 0xff], header - start)
      }
      return bytes
    })
    const source = new R2RangeSource({ readRange } as unknown as R2Client, "library/x.flac", "x.flac", size)

    jest.spyOn(console, "error").mockImplementation(() => {})
    await MetadataExtractor.extractFromSource(source)
    const furthest = Math.max(...readRange.mock.calls.map(([, , end]) => end))
    expect(furthest).toBeLessThan(33 * 1024 * 1024)
  })

  it("still falls back to the file name when the bytes arrive but do not parse", async () => {
    const { client } = fakeClient(new Uint8Array(64).fill(0x00))
    const source = new R2RangeSource(client, "library/Mystery.flac", "Mystery.flac", 64)

    const { metadata } = await MetadataExtractor.extractFromSource(source)
    expect(metadata.title).toBe("Mystery")
  })
})
