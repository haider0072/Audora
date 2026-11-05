import { buildLibraryRows } from "@/lib/library-rows"
import type { Song } from "@/lib/song"

function song(id: string, fields: Partial<Song> = {}): Song {
  return { id, url: `blob:${id}`, title: id, ...fields } as Song
}

/** Already in playback order: artist, album, track. */
const LIBRARY: Song[] = [
  song("a1", { artist: "ABBA", album: "Arrival", trackNumber: "1", genre: "Pop" }),
  song("a2", { artist: "ABBA", album: "Arrival", trackNumber: "2" }),
  song("a3", { artist: "ABBA", album: "Voulez-Vous" }),
  song("b1", { artist: "beabadoobee", album: "Beatopia", trackNumber: "4" }),
  song("n1", { artist: "2NE1", album: "Crush" }),
]

describe("buildLibraryRows, grouped", () => {
  const library = buildLibraryRows(LIBRARY, "grouped")

  it("puts an artist header before each artist and an album header before each album", () => {
    expect(
      library.rows.map((row) => (row.kind === "song" ? row.song.id : `${row.kind}:${row.kind === "artist" ? row.artist : row.album}`)),
    ).toEqual([
      "artist:ABBA",
      "album:Arrival",
      "a1",
      "a2",
      "album:Voulez-Vous",
      "a3",
      "artist:beabadoobee",
      "album:Beatopia",
      "b1",
      "artist:2NE1",
      "album:Crush",
      "n1",
    ])
  })

  it("names each album's artist, so its header can open the album's page", () => {
    const albums = library.rows.flatMap((row) => (row.kind === "album" ? [[row.artist, row.album]] : []))
    expect(albums).toEqual([
      ["ABBA", "Arrival"],
      ["ABBA", "Voulez-Vous"],
      ["beabadoobee", "Beatopia"],
      ["2NE1", "Crush"],
    ])
  })

  it("counts each header's songs", () => {
    const headers = library.rows.filter((row) => row.kind !== "song")
    expect(headers.map((row) => row.songCount)).toEqual([3, 2, 1, 1, 1, 1, 1])
  })

  it("numbers songs by track, or by place in the album without one", () => {
    const numbers = library.rows.flatMap((row) => (row.kind === "song" ? [[row.song.id, row.number, row.detailed]] : []))
    expect(numbers).toEqual([
      ["a1", 1, false],
      ["a2", 2, false],
      ["a3", 1, false],
      ["b1", 4, false],
      ["n1", 1, false],
    ])
  })

  it("keeps each artist's rows as one run, from the header", () => {
    expect(library.artistRuns).toEqual([
      { start: 0, end: 6 },
      { start: 6, end: 9 },
      { start: 9, end: 12 },
    ])
    expect(library.runOfRow).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2])
  })

  it("finds each song, and each letter's first row", () => {
    expect(library.songRows.get("a3")).toBe(5)
    expect(library.songRows.get("n1")).toBe(11)
    expect([...library.letterRows]).toEqual([
      ["A", 0],
      ["B", 6],
      ["#", 9],
    ])
    expect(library.rowLetters[7]).toBe("B")
  })

  it("keeps row keys unique", () => {
    const keys = library.rows.map((row) => row.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("treats differently cased names as the same artist and album", () => {
    const rows = buildLibraryRows(
      [song("x", { artist: "Air", album: "Moon Safari" }), song("y", { artist: "AIR", album: "moon safari" })],
      "grouped",
    ).rows
    expect(rows.map((row) => row.kind)).toEqual(["artist", "album", "song", "song"])
  })
})

describe("buildLibraryRows, list", () => {
  const library = buildLibraryRows(LIBRARY, "list")

  it("is every song, numbered in order, with its artist and album shown", () => {
    expect(library.rows.map((row) => row.kind === "song" && [row.song.id, row.number, row.detailed])).toEqual([
      ["a1", 1, true],
      ["a2", 2, true],
      ["a3", 3, true],
      ["b1", 4, true],
      ["n1", 5, true],
    ])
  })

  it("starts each artist's run at their first song", () => {
    expect(library.artistRuns).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 4 },
      { start: 4, end: 5 },
    ])
  })
})

describe("buildLibraryRows, searching", () => {
  it("keeps only matching songs, with headers and counts for what is left", () => {
    const library = buildLibraryRows(LIBRARY, "grouped", "arrival")
    expect(library.rows.map((row) => row.kind)).toEqual(["artist", "album", "song", "song"])
    expect(library.rows[0].kind === "artist" && library.rows[0].songCount).toBe(2)
    expect(library.letterRows.size).toBe(1)
  })

  it("is empty when nothing matches", () => {
    const library = buildLibraryRows(LIBRARY, "list", "no such song")
    expect(library.rows).toEqual([])
    expect(library.artistRuns).toEqual([])
  })
})
