import {
  albumPage,
  artistPage,
  openPage,
  pageHasSongs,
  pageKey,
  pageSections,
  pageTitle,
  type LibraryPage,
} from "@/lib/library-pages"
import type { Song } from "@/lib/song"

function song(id: string, fields: Partial<Song> = {}): Song {
  return { id, url: `blob:${id}`, title: id, duration: 100, ...fields } as Song
}

/** In playback order: artist, album year, track. */
const LIBRARY: Song[] = [
  song("m1", { artist: "Air", album: "Moon Safari", year: "1998", trackNumber: "1", duration: 427 }),
  song("m2", { artist: "Air", album: "Moon Safari", year: "1998-01-16", trackNumber: "2", duration: 301 }),
  song("t1", { artist: "AIR", album: "Talkie Walkie", trackNumber: "3" }),
  song("t2", { artists: ["Air", "Beck"], artist: "Air, Beck", album: "talkie walkie", year: "2004" }),
  song("b1", { artist: "Beach House", album: "Bloom", year: "2012" }),
]

const AIR: LibraryPage = { kind: "artist", artist: "Air" }
const TALKIE: LibraryPage = { kind: "album", artist: "Air", album: "Talkie Walkie" }
const BLOOM: LibraryPage = { kind: "album", artist: "Beach House", album: "Bloom" }

describe("a song's pages", () => {
  it("are its first credited artist's, and its album under that artist", () => {
    expect(artistPage(LIBRARY[3])).toEqual({ kind: "artist", artist: "Air" })
    expect(albumPage(LIBRARY[3])).toEqual({ kind: "album", artist: "Air", album: "talkie walkie" })
  })

  it("are one page however the names are cased", () => {
    expect(pageKey(albumPage(LIBRARY[2]))).toBe(pageKey(albumPage(LIBRARY[3])))
    expect(pageKey(artistPage(LIBRARY[2]))).toBe(pageKey(AIR))
    expect(pageKey(AIR)).not.toBe(pageKey({ kind: "album", artist: "Air", album: "Air" }))
  })

  it("are titled with the artist or the album", () => {
    expect(pageTitle(AIR)).toBe("Air")
    expect(pageTitle(TALKIE)).toBe("Talkie Walkie")
  })
})

describe("pageSections", () => {
  it("gives an artist's albums in playback order, each with its songs, numbers, year and length", () => {
    const sections = pageSections(LIBRARY, AIR)
    expect(sections.map((section) => [section.album, section.year, section.songs.map((s) => s.id)])).toEqual([
      ["Moon Safari", 1998, ["m1", "m2"]],
      ["Talkie Walkie", 2004, ["t1", "t2"]],
    ])
    expect(sections[0].duration).toBe(728)
    // A song without a track number takes its place in the album.
    expect(sections[1].numbers).toEqual([3, 2])
  })

  it("gives one album on its own page", () => {
    const sections = pageSections(LIBRARY, TALKIE)
    expect(sections).toHaveLength(1)
    expect(sections[0].songs.map((s) => s.id)).toEqual(["t1", "t2"])
  })

  it("gives nothing for a page whose songs are gone", () => {
    expect(pageSections(LIBRARY, { kind: "artist", artist: "Portishead" })).toEqual([])
  })
})

describe("pageHasSongs", () => {
  it("says whether any song is still on a page", () => {
    expect(pageHasSongs(LIBRARY, BLOOM)).toBe(true)
    expect(pageHasSongs(LIBRARY.slice(0, 4), BLOOM)).toBe(false)
  })
})

describe("openPage", () => {
  it("puts a new page on top", () => {
    expect(openPage([AIR], TALKIE)).toEqual([AIR, TALKIE])
  })

  it("goes back to a page already open instead of opening it twice", () => {
    expect(openPage([TALKIE, AIR, BLOOM], { kind: "artist", artist: "AIR" })).toEqual([TALKIE, AIR])
  })

  it("leaves the stack alone when the page is already on top", () => {
    const stack = [AIR, TALKIE]
    expect(openPage(stack, TALKIE)).toBe(stack)
  })
})
