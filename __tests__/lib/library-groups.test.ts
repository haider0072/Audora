import {
  albumKey,
  albumOf,
  artistKey,
  artistOf,
  letterOf,
  matchesQuery,
  trackNumberOf,
  yearOf,
} from "@/lib/library-groups"
import type { Song } from "@/lib/song"

function song(fields: Partial<Song> = {}): Song {
  return { id: "x", url: "blob:x", title: "x", ...fields } as Song
}

describe("artistOf", () => {
  it("is the first credited artist, then the artist tag, then Unknown Artist", () => {
    expect(artistOf(song({ artists: ["Daft Punk", "Pharrell"], artist: "Daft Punk, Pharrell" }))).toBe("Daft Punk")
    expect(artistOf(song({ artist: "  Air  " }))).toBe("Air")
    expect(artistOf(song())).toBe("Unknown Artist")
  })
})

describe("albumOf", () => {
  it("is the album tag without surrounding space, or Unknown Album", () => {
    expect(albumOf(song({ album: " Moon Safari " }))).toBe("Moon Safari")
    expect(albumOf(song())).toBe("Unknown Album")
  })
})

describe("artistKey and albumKey", () => {
  it("are the same however the names are cased", () => {
    expect(artistKey("AIR")).toBe(artistKey("Air"))
    expect(albumKey("AIR", "MOON SAFARI")).toBe(albumKey("Air", "Moon Safari"))
  })

  it("keep two artists' albums of the same name apart", () => {
    expect(albumKey("Air", "Greatest Hits")).not.toBe(albumKey("Blur", "Greatest Hits"))
  })
})

describe("trackNumberOf", () => {
  it("reads the leading number of a track tag, or nothing", () => {
    expect(trackNumberOf(song({ trackNumber: "3/12" }))).toBe(3)
    expect(trackNumberOf(song({ trackNumber: "07" }))).toBe(7)
    expect(trackNumberOf(song({ trackNumber: "A1" }))).toBeUndefined()
    expect(trackNumberOf(song())).toBeUndefined()
  })
})

describe("yearOf", () => {
  it("reads the first four-digit run of a year tag, or nothing", () => {
    expect(yearOf(song({ year: "2021-05-03" }))).toBe(2021)
    expect(yearOf(song({ year: "1998" }))).toBe(1998)
    expect(yearOf(song({ year: "unknown" }))).toBeUndefined()
    expect(yearOf(song())).toBeUndefined()
  })
})

describe("letterOf", () => {
  it("files an artist under their first letter, and anything else under #", () => {
    expect(letterOf("beabadoobee")).toBe("B")
    expect(letterOf("2NE1")).toBe("#")
    expect(letterOf("Ólafur Arnalds")).toBe("#")
  })
})

describe("matchesQuery", () => {
  it("looks through title, artist, album and genre, ignoring case and surrounding space", () => {
    const pop = song({ title: "Knowing Me", artist: "ABBA", album: "Arrival", genre: "Pop" })
    expect(matchesQuery(pop, "  arriv ")).toBe(true)
    expect(matchesQuery(pop, "POP")).toBe(true)
    expect(matchesQuery(pop, "abba")).toBe(true)
    expect(matchesQuery(pop, "beatopia")).toBe(false)
    expect(matchesQuery(pop, "   ")).toBe(true)
  })
})
