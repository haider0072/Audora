import { audioContentType, isAudioFileName } from "@/lib/cloud/audio-files"

describe("audio file names", () => {
  it("recognises the supported formats in any case", () => {
    expect(isAudioFileName("01 Song.FLAC")).toBe(true)
    expect(isAudioFileName("song.opus")).toBe(true)
    expect(isAudioFileName("cover.jpg")).toBe(false)
    expect(isAudioFileName("flac")).toBe(false)
  })

  it("maps each format to the type it is served as, with a fallback", () => {
    expect(audioContentType("a.FLAC")).toBe("audio/flac")
    expect(audioContentType("a.mp3")).toBe("audio/mpeg")
    expect(audioContentType("a.m4a")).toBe("audio/mp4")
    expect(audioContentType("a.xyz")).toBe("application/octet-stream")
  })
})
