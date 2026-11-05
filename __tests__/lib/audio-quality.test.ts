import { formatKilohertz, qualityOf } from "@/lib/audio-quality"

describe("qualityOf", () => {
  it.each([
    [24, 96_000, "hi-res", "24/96"],
    [24, 44_100, "hi-res", "24/44.1"],
    [24, 192_000, "hi-res", "24/192"],
    [16, 96_000, "hi-res", "16/96"],
    [16, 44_100, "lossless", "16/44.1"],
    [16, 48_000, "lossless", "16/48"],
  ])("%d-bit at %d Hz FLAC is %s, %s", (bitDepth, sampleRate, tier, figures) => {
    expect(qualityOf({ format: "FLAC", bitDepth, sampleRate })).toEqual({ tier, figures, format: "FLAC" })
  })

  it("rates WAV the same way", () => {
    expect(qualityOf({ format: "wav", bitDepth: 24, sampleRate: 48_000 })).toEqual({
      tier: "hi-res",
      figures: "24/48",
      format: "WAV",
    })
  })

  it.each(["MP3", "AAC", "OGG", "OPUS"])("calls %s lossy, with no figures to show", (format) => {
    // A lossy bitrate is an estimate, so it is not given as fact.
    expect(qualityOf({ format, bitrate: 320 })).toEqual({ tier: "lossy", format })
    expect(qualityOf({ format: format.toLowerCase() })).toEqual({ tier: "lossy", format })
  })

  it("rates nothing it cannot know", () => {
    expect(qualityOf({ format: "FLAC" })).toBeNull() // header not read yet
    expect(qualityOf({ format: "FLAC", bitDepth: 24 })).toBeNull()
    expect(qualityOf({ format: "M4A", bitDepth: 16, sampleRate: 44_100 })).toBeNull() // AAC or ALAC
    expect(qualityOf({})).toBeNull()
  })
})

describe("formatKilohertz", () => {
  it.each([
    [44_100, "44.1"],
    [48_000, "48"],
    [88_200, "88.2"],
    [96_000, "96"],
    [176_400, "176.4"],
    [192_000, "192"],
    [22_050, "22.05"],
    [11_025, "11.025"],
  ])("%d Hz reads %s", (rate, text) => {
    expect(formatKilohertz(rate)).toBe(text)
  })
})
