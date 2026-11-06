import { downloadExtension, downloadFileName, downloadTags } from "@/lib/download-file"
import type { TidalTrack } from "@/lib/tidal-types"

const TRACK: TidalTrack = {
  id: "amnesia",
  title: "AMNESIA",
  artist: "WOODZ",
  artistId: "woodz",
  albumTitle: "AMNESIA",
  albumId: "amnesia-album",
  albumCover: "https://static.qobuz.com/images/covers/amnesia.jpg",
  releaseDate: "2025-03-10",
  genre: "K-Pop",
  duration: 199,
  audioQuality: "HI_RES_LOSSLESS",
  trackNumber: 1,
  discNumber: 1,
  isrc: "KRA382500001",
}

describe("downloadExtension", () => {
  it("names FLAC as FLAC, and anything else as AAC in an MP4 file", () => {
    expect(downloadExtension("audio/flac")).toBe("flac")
    expect(downloadExtension("audio/x-flac")).toBe("flac")
    expect(downloadExtension("audio/mp4")).toBe("m4a")
  })
})

describe("downloadFileName", () => {
  it("names a download after its artist and title, as the cloud library takes it", () => {
    expect(downloadFileName("WOODZ", "AMNESIA", "flac")).toBe("WOODZ - AMNESIA.flac")
    expect(downloadFileName("AC/DC", "Back In Black", "m4a")).toBe("AC-DC - Back In Black.m4a")
  })
})

describe("downloadTags", () => {
  it("tags a download with the catalog's details, the year alone as its date", () => {
    expect(downloadTags(TRACK)).toEqual({
      title: "AMNESIA",
      artist: "WOODZ",
      album: "AMNESIA",
      albumArtist: "WOODZ",
      date: "2025",
      genre: "K-Pop",
      trackNumber: "1",
      discNumber: "1",
      copyright: undefined,
      isrc: "KRA382500001",
    })
  })

  it("leaves out what the catalog doesn't say", () => {
    const tags = downloadTags({ ...TRACK, releaseDate: "", genre: "", trackNumber: undefined, isrc: undefined })
    expect(tags).toMatchObject({ date: undefined, genre: undefined, trackNumber: undefined, isrc: undefined })
  })
})
