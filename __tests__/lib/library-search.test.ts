import { GLANCE_PAGES, GLANCE_SONGS, libraryMatches } from "@/lib/library-search"
import type { Song } from "@/lib/song"

function song(id: string, fields: Partial<Song> = {}): Song {
  return { id, url: `blob:${id}`, title: id, ...fields } as Song
}

const LIBRARY: Song[] = [
  song("a", { title: "Butterfly", artist: "BTS", album: "Young Forever", year: "2016" }),
  song("b", { title: "Love Is Not Over", artist: "BTS", album: "Young Forever", year: "2016" }),
  song("c", { title: "Magic Shop", artist: "BTS", album: "Love Yourself: Answer", year: "2018" }),
  song("d", { title: "Trivia: Just Dance", artist: "BTS", album: "Love Yourself: Answer", year: "2018" }),
  song("e", { title: "Pied Piper", artist: "BTS", album: "Love Yourself: Her", year: "2017" }),
  song("f", { title: "Lovesick", artist: "Lovelyz", album: "Lovelinus" }),
]

describe("libraryMatches", () => {
  it("finds nothing for nothing typed", () => {
    expect(libraryMatches(LIBRARY, "   ")).toEqual({ total: 0, songs: [], albums: [], artists: [] })
  })

  it("counts every song that matches, and puts the songs whose title holds the words first", () => {
    const matches = libraryMatches(LIBRARY, "love")
    expect(matches.total).toBe(5)
    // Titles first, each part in library order: then the songs matched by their album or artist.
    expect(matches.songs.map((s) => s.id)).toEqual(["b", "f", "c", "d", "e"])
  })

  it("names the albums and artists whose own names hold the words, the fullest first", () => {
    const matches = libraryMatches(LIBRARY, "LOVE")
    expect(matches.albums.map((m) => [m.page, m.count, m.cover.id, m.year])).toEqual([
      [{ kind: "album", artist: "BTS", album: "Love Yourself: Answer" }, 2, "c", 2018],
      [{ kind: "album", artist: "BTS", album: "Love Yourself: Her" }, 1, "e", 2017],
      [{ kind: "album", artist: "Lovelyz", album: "Lovelinus" }, 1, "f", undefined],
    ])
    expect(matches.artists.map((m) => [m.page, m.count])).toEqual([[{ kind: "artist", artist: "Lovelyz" }, 1]])
  })

  it("leaves out an album the song has no name for", () => {
    const matches = libraryMatches([song("x", { title: "Unknown Album", artist: "Air" })], "unknown")
    expect(matches.total).toBe(1)
    expect(matches.albums).toEqual([])
  })

  it("shows a few of each at a glance, and counts the rest", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      song(`s${i}`, { title: `Song ${i}`, artist: `Artist ${i}`, album: `Album ${i}` }),
    )
    const matches = libraryMatches(many, "")
    expect(matches.total).toBe(0)
    const all = libraryMatches(many, "s")
    expect(all.total).toBe(12)
    expect(all.songs).toHaveLength(GLANCE_SONGS)
    expect(all.artists).toHaveLength(GLANCE_PAGES)
    expect(libraryMatches(many, "album").albums).toHaveLength(GLANCE_PAGES)
  })
})
