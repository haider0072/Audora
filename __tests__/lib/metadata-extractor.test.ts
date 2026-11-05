/**
 * @jest-environment node
 */
import { MetadataExtractor } from "@/lib/metadata-extractor"
import { byteSource } from "@/testing/byte-source"
import { buildFlac } from "@/testing/flac-fixture"
import { buildMp3 } from "@/testing/mp3-fixture"
import { buildWav } from "@/testing/wav-fixture"

async function metadataOf(bytes: Uint8Array, name: string) {
  return (await MetadataExtractor.extractFromSource(byteSource(bytes, name))).metadata
}

describe("MetadataExtractor stream details", () => {
  it("reads a FLAC file's stream info, and its bitrate without the cover", async () => {
    const flac = buildFlac({
      bitDepth: 24,
      sampleRate: 96_000,
      cover: new Uint8Array(200_000),
      paddingBytes: 4096,
      audioBytes: 300_000,
      durationSeconds: 1,
    })

    expect(await metadataOf(flac, "Hi.flac")).toMatchObject({
      format: "FLAC",
      bitDepth: 24,
      sampleRate: 96_000,
      duration: 1,
      bitrate: 2400,
    })
  })

  it("gives a WAV file's bitrate from its data chunk", async () => {
    const wav = buildWav({ bitDepth: 24, sampleRate: 48_000, dataBytes: 288_000 }) // one second
    expect(await metadataOf(wav, "Take.wav")).toMatchObject({ bitDepth: 24, sampleRate: 48_000, duration: 1, bitrate: 2304 })
  })

  it("times a CBR MP3 by its audio alone, so its bitrate is the frame's", async () => {
    const mp3 = buildMp3({ tagBytes: 100_000, bitrate: 128, audioBytes: 160_000 })
    const metadata = await metadataOf(mp3, "Song.mp3")

    expect(metadata.duration).toBeCloseTo(10) // 160,000 bytes at 16,000 a second
    expect(metadata.bitrate).toBe(128)
    expect(metadata.bitDepth).toBeUndefined()
  })

  it("times a VBR MP3 by the frames its Xing frame counts", async () => {
    const mp3 = buildMp3({ bitrate: 32, xingFrames: 3828, audioBytes: 2_400_000 })
    const metadata = await metadataOf(mp3, "Song.mp3")

    const seconds = (3828 * 1152) / 44_100 // about 100
    expect(metadata.duration).toBeCloseTo(seconds)
    expect(metadata.bitrate).toBe(Math.round((2_400_000 * 8) / (seconds * 1000)))
  })
})
