import {
  averageKbps,
  readFlacHeader,
  readMpegFrame,
  readStreamDetails,
  readStreamInfo,
  readWavHeader,
  STREAM_INFO_HEAD_BYTES,
  walkFlacMetadata,
} from "@/lib/stream-info"
import { byteSource } from "@/testing/byte-source"
import { buildFlac } from "@/testing/flac-fixture"
import { buildMp3 } from "@/testing/mp3-fixture"
import { buildWav } from "@/testing/wav-fixture"

const head = (bytes: Uint8Array) => bytes.slice(0, STREAM_INFO_HEAD_BYTES)

describe("readFlacHeader", () => {
  it.each([
    [16, 44_100, 2],
    [16, 48_000, 2],
    [24, 44_100, 2],
    [24, 96_000, 2],
    [24, 192_000, 2],
    [8, 22_050, 1],
  ])("reads %d-bit audio at %d Hz, %d channel(s)", (bitDepth, sampleRate, channels) => {
    expect(readFlacHeader(buildFlac({ bitDepth, sampleRate, channels }))).toEqual({
      bitDepth,
      sampleRate,
      channels,
      totalSamples: sampleRate * 180,
    })
  })

  it("reads from a view into a larger buffer", () => {
    const padded = new Uint8Array(100 + 4096)
    padded.set(buildFlac({ bitDepth: 24, sampleRate: 96_000 }).slice(0, 4096), 100)
    expect(readFlacHeader(padded.subarray(100))).toMatchObject({ bitDepth: 24, sampleRate: 96_000 })
  })

  it("needs STREAMINFO as the first block", () => {
    const flac = buildFlac()
    flac[4] = (flac[4] & 0x80) | 4 // claim the first block is a Vorbis comment
    expect(readFlacHeader(flac)).toBeNull()
  })

  it("rejects what is not FLAC, or too short to hold STREAMINFO", () => {
    expect(readFlacHeader(buildWav())).toBeNull()
    expect(readFlacHeader(buildFlac().slice(0, 41))).toBeNull()
  })
})

describe("readWavHeader", () => {
  it("reads the fmt and data chunks", () => {
    expect(readWavHeader(buildWav({ sampleRate: 48_000, bitDepth: 24, dataBytes: 2048 }))).toEqual({
      formatCode: 1,
      channels: 2,
      sampleRate: 48_000,
      byteRate: 48_000 * 6,
      bitDepth: 24,
      dataBytes: 2048,
    })
  })

  it("finds fmt behind another chunk, odd-sized and padded", () => {
    expect(readWavHeader(buildWav({ leadingChunkBytes: 301 }))).toMatchObject({ sampleRate: 44_100, bitDepth: 16 })
  })

  it("looks through WAVE_FORMAT_EXTENSIBLE to the format and valid bits", () => {
    expect(readWavHeader(buildWav({ bitDepth: 32, extensibleValidBits: 24, sampleRate: 96_000 }))).toMatchObject({
      formatCode: 1,
      bitDepth: 24,
      sampleRate: 96_000,
    })
  })

  it("leaves the data size out when its chunk lies past the bytes read", () => {
    const wav = buildWav({ leadingChunkBytes: 5000 })
    expect(readWavHeader(head(wav))).toBeNull() // fmt itself is out of reach
    expect(readWavHeader(buildWav().slice(0, 40))).toMatchObject({ sampleRate: 44_100 })
    expect(readWavHeader(buildWav().slice(0, 40))?.dataBytes).toBeUndefined()
  })
})

describe("readStreamInfo", () => {
  it("reads FLAC and plain or floating-point WAV", () => {
    expect(readStreamInfo(head(buildFlac({ bitDepth: 24, sampleRate: 96_000 })))).toEqual({
      bitDepth: 24,
      sampleRate: 96_000,
      channels: 2,
    })
    expect(readStreamInfo(buildWav({ bitDepth: 16 }))).toEqual({ bitDepth: 16, sampleRate: 44_100, channels: 2 })
    expect(readStreamInfo(buildWav({ formatCode: 3, bitDepth: 32 }))).toMatchObject({ bitDepth: 32 })
    expect(readStreamInfo(buildWav({ formatCode: 3, bitDepth: 32, extensibleValidBits: 32 }))).toMatchObject({
      bitDepth: 32,
    })
  })

  it("gives nothing for compressed audio in a WAV, or for anything else", () => {
    expect(readStreamInfo(buildWav({ formatCode: 2, bitDepth: 4 }))).toBeNull() // ADPCM
    const mp3 = Uint8Array.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000", (char) => char.charCodeAt(0))
    expect(readStreamInfo(mp3)).toBeNull()
    expect(readStreamInfo(new Uint8Array(0))).toBeNull()
  })

  it("reads an ArrayBuffer as well as bytes", () => {
    const bytes = buildFlac({ bitDepth: 24, sampleRate: 44_100 })
    expect(readStreamInfo(bytes.buffer)).toMatchObject({ bitDepth: 24, sampleRate: 44_100 })
  })
})

describe("readMpegFrame", () => {
  it.each([32, 128, 320])("reads a %d kbps MPEG-1 Layer III frame", (bitrate) => {
    expect(readMpegFrame(buildMp3({ bitrate }))).toEqual({
      bitrate,
      sampleRate: 44_100,
      samplesPerFrame: 1152,
      frameCount: undefined,
    })
  })

  it("counts the stream's frames from a Xing frame", () => {
    expect(readMpegFrame(buildMp3({ xingFrames: 9000 }))).toMatchObject({ frameCount: 9000 })
  })

  it("rejects what is not a valid frame header", () => {
    expect(readMpegFrame(buildFlac())).toBeNull()
    expect(readMpegFrame(new Uint8Array([0xff, 0xfb, 0xf0, 0x00]))).toBeNull() // bitrate index 15
    expect(readMpegFrame(new Uint8Array([0xff, 0xfb, 0x9c, 0x00]))).toBeNull() // sample-rate index 3
    expect(readMpegFrame(new Uint8Array([0xff, 0xfb]))).toBeNull()
  })
})

describe("walkFlacMetadata", () => {
  it("steps over a cover, reading block headers alone", async () => {
    const flac = buildFlac({ cover: new Uint8Array(100_000), paddingBytes: 8192, audioBytes: 5000 })
    const source = byteSource(flac)

    expect(await walkFlacMetadata(source, flac.length)).toEqual({ end: flac.length - 5000, complete: true })
    expect(source.reads.every(([start, end]) => end - start === 4)).toBe(true)
  })

  it("is incomplete when the file ends inside the chain or the chain runs past the limit", async () => {
    const flac = buildFlac({ cover: new Uint8Array(100_000), paddingBytes: 1024 })
    const cut = flac.slice(0, 50_000)

    expect(await walkFlacMetadata(byteSource(cut), cut.length)).toMatchObject({ complete: false })
    // The padding's header lies past the limit, behind the cover.
    expect(await walkFlacMetadata(byteSource(flac), flac.length, 1000)).toMatchObject({ complete: false })
  })

  it("stops at bytes that cannot be a block header, rather than reading on", async () => {
    const damaged = buildFlac({ cover: new Uint8Array(100_000) })
    damaged.fill(0, 42) // zeros from the first block on: a second STREAMINFO, again and again
    const source = byteSource(damaged)

    expect(await walkFlacMetadata(source, damaged.length)).toEqual({ end: 42, complete: false })
    expect(source.reads).toHaveLength(2)

    const noStreamInfo = buildFlac()
    noStreamInfo[4] = (noStreamInfo[4] & 0x80) | 4 // a Vorbis comment where STREAMINFO belongs
    expect(await walkFlacMetadata(byteSource(noStreamInfo), noStreamInfo.length)).toEqual({ end: 4, complete: false })
  })
})

describe("averageKbps", () => {
  it("is the audio's bits over its duration", () => {
    expect(averageKbps(31_752_000, 180)).toBe(1411) // CD audio: 44,100 × 2 × 2 bytes a second
  })

  it.each([
    [undefined, 180],
    [1000, undefined],
    [0, 180],
    [1000, 0],
    [1000, Number.NaN],
  ])("is unknown for %p bytes over %p s", (bytes, seconds) => {
    expect(averageKbps(bytes, seconds)).toBeUndefined()
  })
})

describe("readStreamDetails", () => {
  it("gives a FLAC file's bitrate without its tags and cover", async () => {
    const flac = buildFlac({
      bitDepth: 24,
      sampleRate: 96_000,
      cover: new Uint8Array(200_000),
      paddingBytes: 4096,
      audioBytes: 300_000,
    })
    expect(await readStreamDetails(byteSource(flac), flac.length, 1)).toEqual({
      bitDepth: 24,
      sampleRate: 96_000,
      channels: 2,
      bitrate: 2400,
    })
  })

  it("gives a WAV file's bitrate from its data chunk", async () => {
    const wav = buildWav({ dataBytes: 176_400 }) // one second of 16-bit stereo at 44.1 kHz
    expect(await readStreamDetails(byteSource(wav), wav.length, 1)).toMatchObject({ bitDepth: 16, bitrate: 1411 })
  })

  it("has no bitrate without a duration, and nothing for a file that is not lossless", async () => {
    const flac = buildFlac()
    expect(await readStreamDetails(byteSource(flac), flac.length)).toMatchObject({ bitDepth: 16, bitrate: undefined })

    const mp3 = buildMp3()
    expect(await readStreamDetails(byteSource(mp3), mp3.length, 1)).toBeNull()
  })
})
