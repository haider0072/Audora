import type { Song } from "@/lib/song"
import { isCloudOnlySong, mergeCloudLibrary } from "@/lib/cloud/merge"
import type { CloudSong } from "@/lib/cloud/types"

function localSong(name: string, size: number): Song {
  return {
    id: `${name}-${size}-1700000000000`,
    file: new File([new Uint8Array(size)], name),
    url: "",
    title: name,
  }
}

function cloudSong(name: string, size: number, overrides: Partial<CloudSong> = {}): CloudSong {
  return {
    id: `cloud:${name}`,
    key: `library/${name}`,
    fileName: name,
    fileSize: size,
    title: name.replace(/\.\w+$/, ""),
    streamUrl: `https://acct.r2.cloudflarestorage.com/audora-music/library/${name}?sig=1`,
    artUrl: `https://acct.r2.cloudflarestorage.com/audora-music/art/${name}?sig=1`,
    ...overrides,
  }
}

describe("mergeCloudLibrary", () => {
  it("adds cloud-only songs without a file", () => {
    const merged = mergeCloudLibrary([], [cloudSong("a.flac", 10)])
    expect(merged).toHaveLength(1)
    expect(merged[0].file).toBeUndefined()
    expect(merged[0].cloud?.key).toBe("library/a.flac")
    expect(merged[0].albumArt).toContain("/art/a.flac")
    expect(isCloudOnlySong(merged[0])).toBe(true)
  })

  it("shows a track present locally and in the cloud once, as the local song", () => {
    const local = localSong("a.flac", 10)
    const merged = mergeCloudLibrary([local], [cloudSong("a.flac", 10)])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(local.id)
    expect(merged[0].file).toBe(local.file)
    expect(merged[0].cloud?.key).toBe("library/a.flac")
    expect(isCloudOnlySong(merged[0])).toBe(false)
  })

  it("gives a local song back the track number its cloud copy has", () => {
    const local = localSong("a.flac", 10)
    const [merged] = mergeCloudLibrary([local], [cloudSong("a.flac", 10, { trackNumber: "7" })])
    expect(merged.trackNumber).toBe("7")

    // Once it has one, it keeps its own and the list stays as it is.
    const again = mergeCloudLibrary([merged], [cloudSong("a.flac", 10, { trackNumber: "8" })])
    expect(again[0]).toBe(merged)
  })

  it("keeps a local song's own track number over its cloud copy's", () => {
    const local = { ...localSong("a.flac", 10), trackNumber: "3" }
    const [merged] = mergeCloudLibrary([local], [cloudSong("a.flac", 10, { trackNumber: "7" })])
    expect(merged.trackNumber).toBe("3")
  })

  it("matches regardless of case and Unicode composition", () => {
    const local = localSong("Café.flac".normalize("NFD"), 10)
    const merged = mergeCloudLibrary([local], [cloudSong("café.FLAC", 10)])
    expect(merged).toHaveLength(1)
  })

  it("keeps different encodes of a song as separate tracks", () => {
    const merged = mergeCloudLibrary([localSong("a.flac", 10)], [cloudSong("a.flac", 11)])
    expect(merged).toHaveLength(2)
  })

  it("collapses the same file uploaded under two keys", () => {
    const merged = mergeCloudLibrary(
      [],
      [cloudSong("a.flac", 10), cloudSong("a.flac", 10, { id: "cloud:dup", key: "library/old/a.flac" })],
    )
    expect(merged).toHaveLength(1)
  })

  it("carries the list-size cover and treats a new one as a change", () => {
    const first = mergeCloudLibrary([], [cloudSong("a.flac", 10, { thumbUrl: "https://r2.test/s1" })])
    expect(first[0].albumArtThumb).toBe("https://r2.test/s1")

    const second = mergeCloudLibrary(first, [cloudSong("a.flac", 10, { thumbUrl: "https://r2.test/s2" })])
    expect(second[0].albumArtThumb).toBe("https://r2.test/s2")
  })

  it("returns the same array when nothing changed", () => {
    const cloud = [cloudSong("a.flac", 10), cloudSong("b.flac", 20)]
    const first = mergeCloudLibrary([localSong("a.flac", 10)], cloud)
    expect(mergeCloudLibrary(first, cloud)).toBe(first)
  })

  it("picks up what the indexer learned about a song since it was listed", () => {
    const first = mergeCloudLibrary([], [cloudSong("a.flac", 10, { artists: ["A", "B"] })])
    const reread = mergeCloudLibrary(first, [
      cloudSong("a.flac", 10, { artists: ["A", "B"], sampleRate: 96_000, bitDepth: 24 }),
    ])
    expect(reread).not.toBe(first)
    expect(reread[0]).toMatchObject({ sampleRate: 96_000, bitDepth: 24 })

    // Equal lists compare by value, and what the player sets is not a change.
    const played = [{ ...reread[0], url: "blob:playing" }]
    expect(mergeCloudLibrary(played, [cloudSong("a.flac", 10, { artists: ["A", "B"], sampleRate: 96_000, bitDepth: 24 })])).toBe(played)
  })

  it("replaces a cloud-only song whose signed URL was refreshed", () => {
    const first = mergeCloudLibrary([], [cloudSong("a.flac", 10)])
    const refreshed = mergeCloudLibrary(first, [
      cloudSong("a.flac", 10, { streamUrl: "https://acct.r2.cloudflarestorage.com/x?sig=2" }),
    ])
    expect(refreshed).not.toBe(first)
    expect(refreshed[0].cloud?.streamUrl).toContain("sig=2")
  })

  it("drops cloud songs and cloud references when the cloud list empties (sign-out)", () => {
    const local = localSong("a.flac", 10)
    const merged = mergeCloudLibrary([local], [cloudSong("a.flac", 10), cloudSong("b.flac", 20)])
    const signedOut = mergeCloudLibrary(merged, [])
    expect(signedOut).toHaveLength(1)
    expect(signedOut[0].id).toBe(local.id)
    expect(signedOut[0].cloud).toBeUndefined()
  })

  it("hides a cloud-only entry once the same file is imported locally", () => {
    const withCloud = mergeCloudLibrary([], [cloudSong("a.flac", 10)])
    const imported = mergeCloudLibrary([...withCloud, localSong("a.flac", 10)], [cloudSong("a.flac", 10)])
    expect(imported).toHaveLength(1)
    expect(imported[0].file).toBeDefined()
  })
})
